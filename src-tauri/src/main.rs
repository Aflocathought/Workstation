// main.rs
#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

// chrono 仅在模块内部使用，这里无需导入
use rusqlite::Connection;
use std::sync::{
    atomic::{AtomicBool, AtomicUsize, Ordering},
    Arc, Mutex,
};
use std::thread;
use tauri::Manager;

use once_cell::sync::OnceCell;
use tauri_plugin_autostart::Builder as AutostartBuilder;
#[cfg(target_os = "windows")]
// use window_vibrancy::apply_mica;

// Python 服务
use python::PythonService;
pub use python::{PythonInfo, PythonResult, ScriptInfo};

// WASAPI 相关已迁入 spectrum 模块

#[path = "core/app_paths.rs"]
mod app_paths;
#[path = "core/db.rs"]
mod db;
mod pdf_library;
#[path = "services/python.rs"]
mod python;
#[path = "features/spectrum.rs"]
mod spectrum;
#[path = "features/tracker.rs"]
mod tracker;
#[path = "handlers/csv_handler.rs"]
mod csv_handler;
#[path = "handlers/parquet_handler.rs"]
mod parquet_handler;

// 全局 Python 服务实例
static PYTHON_SERVICE: OnceCell<Mutex<PythonService>> = OnceCell::new();

// 我们将把数据库连接句柄放在一个全局、线程安全的状态中
// Mutex 确保了在任何时候只有一个线程可以访问数据库连接，防止数据损坏
pub use db::DbState;

// PDF Library 状态
use pdf_library::PdfLibraryState;

// 全局追踪器停止标志
pub struct TrackerStop {
    stop: Arc<AtomicBool>,
}

// 全局频谱采集停止标志
pub use spectrum::{SpectrumConfig, SpectrumRuntime, SpectrumStop};

use db::{ActivityLog, TimelineActivity};
use csv_handler::{
    CsvCacheManager,
    csv_load_file,
    csv_get_pagination,
    csv_load_page,
    csv_generate_thumbnail,
    csv_change_delimiter,
    csv_clear_cache,
};

// 这个结构体用于前端请求时返回当前活动窗口信息
pub use tracker::ActiveWindowInfo;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(AutostartBuilder::new().build())
        .setup(|app| {
            // 初始化所有应用目录（包括 Python 目录和示例脚本）
            app_paths::init_directories().expect("Failed to initialize app directories");

            // 应用数据目录与数据库路径
            let app_data_dir = app_paths::app_data_dir();
            if !app_data_dir.exists() {
                std::fs::create_dir_all(&app_data_dir).expect("failed to create app data dir");
            }
            let db_path = app_paths::db_path();

            // 打开数据库连接，如果文件不存在，rusqlite 会自动创建它
            let conn = Connection::open(&db_path)
                .unwrap_or_else(|_| panic!("failed to open database at {:?}", db_path));

            // 初始化 Schema
            db::init_db(&conn).expect("failed to init db");

            // 将数据库连接句柄放入 Tauri 的托管状态中
            app.manage(DbState {
                db: Mutex::new(conn),
            });

            // 初始化 PDF Library 数据库路径
            let pdf_db_path = app_data_dir.join("pdf_library.db");
            let pdf_state = Mutex::new(PdfLibraryState::new(pdf_db_path));
            app.manage(pdf_state);

            // 管理追踪器停止标志
            let tracker_stop = Arc::new(AtomicBool::new(false));
            app.manage(TrackerStop {
                stop: tracker_stop.clone(),
            });
            // 管理频谱采集停止标志（按需启动）
            let spectrum_stop = Arc::new(AtomicBool::new(false));
            app.manage(SpectrumStop {
                stop: spectrum_stop.clone(),
            });
            // 频谱配置（默认 2048 点 FFT、96 列）
            app.manage(SpectrumConfig {
                fft_size: AtomicUsize::new(2048),
                columns: AtomicUsize::new(96),
            });
            // 运行时状态
            app.manage(SpectrumRuntime {
                running: Arc::new(AtomicBool::new(false)),
            });

            // 管理 CSV 缓存状态（供 CSV Viewer 后端使用）
            app.manage(CsvCacheManager::default());

            // 管理 Parquet 缓存状态（供 Datascope Parquet 后端使用）
            app.manage(parquet_handler::ParquetCacheManager::default());

            // 在一个新的线程中启动我们的后台追踪器
            let app_handle = app.handle().clone();
            thread::spawn(move || {
                tracker::run_tracker_loop(app_handle, tracker_stop);
            });

            // 频谱线程不再在启动时开启，改为按需 start/stop

            // 监听主窗口关闭/销毁，通知后台线程退出
            if let Some(main_win) = app.get_webview_window("main") {
                // 启动时不抢焦点：去掉置顶并直接最小化
                let _ = main_win.set_always_on_top(false);
                let _ = main_win.minimize();

                // #[cfg(target_os = "windows")]
                // {
                //     apply_mica(&main_win, Some(true)).expect(
                //         "Unsupported platform! 'apply_mica' is only supported on Windows 11",
                //     );
                // }
                let stop_state: tauri::State<TrackerStop> = app.state();
                let stop_flag = stop_state.stop.clone();
                let spectrum_state: tauri::State<SpectrumStop> = app.state();
                let spectrum_flag = spectrum_state.stop.clone();
                let _ = main_win.on_window_event(move |event| match event {
                    tauri::WindowEvent::CloseRequested { .. } | tauri::WindowEvent::Destroyed => {
                        stop_flag.store(true, Ordering::Relaxed);
                        spectrum_flag.store(true, Ordering::Relaxed);
                    }
                    _ => {}
                });
            }

            Ok(())
        })
        // 保留原来的前端命令，并添加新的数据库查询命令
        .invoke_handler(tauri::generate_handler![
            get_active_window_info,
            get_latest_activities,
            get_activities_for_day,
            get_database_size,
            open_spectrum_window,
            open_spectrum_floating_window,
            open_test_window,
            start_spectrum,
            stop_spectrum,
            set_spectrum_fft_size,
            set_spectrum_columns,
            // Python 命令
            execute_python_script,
            list_python_scripts,
            save_python_script,
            read_python_script,
            delete_python_script,
            get_python_info,
            // CSV Viewer 后端命令
            csv_load_file,
            csv_get_pagination,
            csv_load_page,
            csv_generate_thumbnail,
            csv_change_delimiter,
            csv_clear_cache,
            // Parquet Viewer 后端命令
            parquet_handler::parquet_open_file,
            parquet_handler::parquet_load_page,
            parquet_handler::parquet_generate_thumbnail,
            parquet_handler::parquet_clear_cache,
            parquet_handler::convert_csv_to_parquet,
            // PDF Library 命令
            pdf_library::commands::pdflibrary_init_db,
            pdf_library::commands::pdflibrary_backup_db,
            pdf_library::commands::pdflibrary_get_books,
            pdf_library::commands::pdflibrary_get_book,
            pdf_library::commands::pdflibrary_add_book,
            pdf_library::commands::pdflibrary_update_title,
            pdf_library::commands::pdflibrary_rename_book,
            pdf_library::commands::pdflibrary_delete_book,
            pdf_library::commands::pdflibrary_get_tags,
            pdf_library::commands::pdflibrary_create_tag,
            pdf_library::commands::pdflibrary_get_book_tags,
            pdf_library::commands::pdflibrary_add_book_tag,
            pdf_library::commands::pdflibrary_remove_book_tag,
            pdf_library::commands::pdflibrary_update_tag,
            pdf_library::commands::pdflibrary_delete_tag,
            pdf_library::commands::pdflibrary_get_directories,
            pdf_library::commands::pdflibrary_add_directory,
            pdf_library::commands::pdflibrary_get_categories,
            pdf_library::commands::pdflibrary_create_category,
            pdf_library::commands::pdflibrary_update_category,
            pdf_library::commands::pdflibrary_delete_category,
            pdf_library::commands::pdflibrary_update_book_category,
            pdf_library::commands::pdflibrary_extract_metadata,
            pdf_library::commands::pdflibrary_extract_cover,
            pdf_library::commands::pdflibrary_update_book_cover,
            pdf_library::commands::pdflibrary_get_file_identity,
            pdf_library::commands::pdflibrary_show_in_folder,
            pdf_library::commands::pdflibrary_open_file,
            pdf_library::commands::pdflibrary_open_workspace_folder,
            pdf_library::commands::pdflibrary_copy_file_to_clipboard,
            pdf_library::commands::pdflibrary_remove_missing_files,
            pdf_library::commands::pdflibrary_rescan_files,
            pdf_library::commands::pdflibrary_relink_book,
            pdf_library::commands::pdflibrary_move_book_to_workspace,
            pdf_library::commands::pdflibrary_set_workspace_path,
            pdf_library::commands::pdflibrary_refresh_all_metadata,
        ])
        .run(tauri::generate_context!())
        .expect("运行Tauri应用程序时出错");
}

// 获取数据库文件大小（字节）
#[tauri::command]
fn get_database_size() -> Result<u64, String> {
    let path = app_paths::db_path();
    match std::fs::metadata(&path) {
        Ok(meta) => Ok(meta.len()),
        Err(e) => Err(format!("无法读取数据库大小: {}", e)),
    }
}

// 命令委派到各模块
#[tauri::command]
fn get_active_window_info() -> Result<ActiveWindowInfo, String> {
    tracker::get_active_window_info()
}

// 最近活动与某日活动
#[tauri::command]
fn get_latest_activities(state: tauri::State<DbState>) -> Result<Vec<ActivityLog>, String> {
    db::get_latest_activities(state)
}
#[tauri::command]
fn get_activities_for_day(
    state: tauri::State<DbState>,
    date: String,
) -> Result<Vec<TimelineActivity>, String> {
    db::get_activities_for_day(state, date)
}

// 原 get_latest_activities/get_activities_for_day 的实现已移至 db 模块

// 打开频谱窗口，并模拟推送频谱数据（后续可替换为系统音频采集 + FFT）
#[tauri::command]
async fn open_spectrum_window(app: tauri::AppHandle) -> Result<(), String> {
    // 如果窗口已存在则聚焦
    if let Some(win) = app.get_webview_window("spectrum") {
        win.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    let mut builder = tauri::WebviewWindowBuilder::new(
        &app,
        "spectrum",
        tauri::WebviewUrl::App("index.html?spectrum=1".into()),
    );
    builder = builder
        .title("Spectrum")
        .inner_size(800.0, 420.0)
        .resizable(true)
        .transparent(false)
        .visible(true)
        .initialization_script(
            r#"
          // 强制背景与日志，辅助排查白屏
          document.documentElement.style.background = '#000';
          document.body && (document.body.style.background = '#000');
          console.log('[spectrum] window booting');
        "#,
        );

    let win = builder.build().map_err(|e| e.to_string())?;
    // 避免 dev 下二次窗口空白：轻微延时后再设置置顶
    let _ = win.set_always_on_top(false);
    // 开发模式下自动打开 DevTools
    #[cfg(debug_assertions)]
    {
        let _ = win.open_devtools();
    }

    // 打开窗口即启动频谱（若未运行），并在窗口销毁时停止
    let app_handle = app.clone();
    let _ = spectrum::start_spectrum(app_handle.clone());

    Ok(())
}

// 频谱相关命令已移至 spectrum 模块

// 打开一个置顶的小浮窗，仅显示频谱，支持调整大小
#[tauri::command]
async fn open_spectrum_floating_window(app: tauri::AppHandle) -> Result<(), String> {
    // 如已存在则聚焦
    if let Some(win) = app.get_webview_window("spectrum_float") {
        win.set_focus().map_err(|e| e.to_string())?;
        // 确保保持置顶
        let _ = win.set_always_on_top(true);
        return Ok(());
    }

    let mut builder = tauri::WebviewWindowBuilder::new(
        &app,
        "spectrum_float",
        tauri::WebviewUrl::App("index.html?spectrum=1".into()),
    );
    builder = builder
        .title("Spectrum Float")
        .inner_size(520.0, 300.0)
        .resizable(true)
        .always_on_top(true)
        .visible(true)
        .transparent(false)
        .initialization_script(
            r#"
          document.documentElement.style.background = '#000';
          document.body && (document.body.style.background = '#000');
          console.log('[spectrum-float] window booting');
        "#,
        );

    let win = builder.build().map_err(|e| e.to_string())?;

    #[cfg(debug_assertions)]
    {
        let _ = win.open_devtools();
    }

    let app_handle = app.clone();
    let _ = spectrum::start_spectrum(app_handle.clone());

    Ok(())
}

/// 打开一个用于交互测试的窗口
#[tauri::command]
async fn open_test_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("test_window") {
        win.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    println!("[main] opening test window");
    let mut builder = tauri::WebviewWindowBuilder::new(
        &app,
        "test_window",
        tauri::WebviewUrl::App("test-window.html".into()),
    );
    builder = builder
        .title("Async Test Window")
        .inner_size(520.0, 420.0)
        .resizable(true)
        .visible(true)
        .initialization_script(
            r#"
          console.log('[test-window] ready for interaction');
        "#,
        );

    let win = builder.build().map_err(|e| e.to_string())?;
    win.set_focus().ok();

    Ok(())
}

// 频谱命令桥接（为 tauri 宏导出符号）
#[tauri::command]
fn set_spectrum_fft_size(app: tauri::AppHandle, size: usize) -> Result<(), String> {
    spectrum::set_spectrum_fft_size(app, size)
}
#[tauri::command]
fn set_spectrum_columns(app: tauri::AppHandle, cols: usize) -> Result<(), String> {
    spectrum::set_spectrum_columns(app, cols)
}
#[tauri::command]
fn start_spectrum(app: tauri::AppHandle) -> Result<(), String> {
    spectrum::start_spectrum(app)
}
#[tauri::command]
fn stop_spectrum(app: tauri::AppHandle) -> Result<(), String> {
    spectrum::stop_spectrum(app)
}

// ============ Python 命令 ============

/// 获取 Python 服务实例
fn get_python_service(
    _app_handle: &tauri::AppHandle,
) -> Result<std::sync::MutexGuard<'static, PythonService>, String> {
    PYTHON_SERVICE
        .get_or_init(|| Mutex::new(PythonService::new()))
        .lock()
        .map_err(|e| format!("Failed to lock Python service: {}", e))
}

/// 执行 Python 脚本
#[tauri::command]
async fn execute_python_script(
    app_handle: tauri::AppHandle,
    script_name: String,
    args: Vec<String>,
) -> Result<PythonResult, String> {
    let service = get_python_service(&app_handle)?;
    service.execute_script(script_name, args)
}

/// 列出所有 Python 脚本
#[tauri::command]
async fn list_python_scripts(app_handle: tauri::AppHandle) -> Result<Vec<ScriptInfo>, String> {
    let service = get_python_service(&app_handle)?;
    service.list_scripts()
}

/// 保存 Python 脚本
#[tauri::command]
async fn save_python_script(
    app_handle: tauri::AppHandle,
    name: String,
    content: String,
) -> Result<(), String> {
    let service = get_python_service(&app_handle)?;
    service.save_script(name, content)
}

/// 读取 Python 脚本内容
#[tauri::command]
async fn read_python_script(app_handle: tauri::AppHandle, name: String) -> Result<String, String> {
    let service = get_python_service(&app_handle)?;
    service.read_script(name)
}

/// 删除 Python 脚本
#[tauri::command]
async fn delete_python_script(app_handle: tauri::AppHandle, name: String) -> Result<(), String> {
    let service = get_python_service(&app_handle)?;
    service.delete_script(name)
}

/// 获取 Python 环境信息
#[tauri::command]
async fn get_python_info(app_handle: tauri::AppHandle) -> Result<PythonInfo, String> {
    let service = get_python_service(&app_handle)?;
    service.get_python_info()
}
