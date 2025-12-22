// main.rs
#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

// chrono 仅在模块内部使用，这里无需导入
use rusqlite::Connection;
use serde::Deserialize;
use std::mem::size_of;
use std::sync::{
    atomic::{AtomicBool, AtomicUsize, Ordering},
    Arc, Mutex,
};
use std::thread;
use tauri::{Manager, PhysicalPosition, PhysicalSize, Position};

use once_cell::sync::OnceCell;
use tauri_plugin_autostart::Builder as AutostartBuilder;
#[cfg(target_os = "windows")]
// use window_vibrancy::apply_mica;

// Python 服务
use python::PythonService;
pub use python::{PythonInfo, PythonResult, ScriptInfo};

// 快捷键服务
use shortcut::{ForegroundWindowInfo, ModifierState, ShortcutService};

// WASAPI 相关已迁入 spectrum 模块

#[path = "core/app_paths.rs"]
mod app_paths;
#[path = "core/db.rs"]
mod db;
mod pdf_library;
#[path = "services/python.rs"]
mod python;
#[path = "services/shortcut.rs"]
mod shortcut;
#[path = "features/spectrum.rs"]
mod spectrum;
#[path = "features/tracker.rs"]
mod tracker;
#[path = "handlers/csv_handler.rs"]
mod csv_handler;
#[path = "handlers/parquet_handler.rs"]
mod parquet_handler;

// 全局快捷键服务实例
static SHORTCUT_SERVICE: OnceCell<Mutex<ShortcutService>> = OnceCell::new();

// 全局 Python 服务实例
static PYTHON_SERVICE: OnceCell<Mutex<PythonService>> = OnceCell::new();

// 我们将把数据库连接句柄放在一个全局、线程安全的状态中
// Mutex 确保了在任何时候只有一个线程可以访问数据库连接，防止数据损坏
pub use db::DbState;

// PDF Library 状态
use pdf_library::PdfLibraryState;

// ============ 快捷键提示窗口 ============

/// 创建快捷键提示悬浮窗口
fn create_shortcut_hint_window(
    manager: &tauri::AppHandle,
) -> Result<(), Box<dyn std::error::Error>> {
    let mut builder = tauri::WebviewWindowBuilder::new(
        manager,
        "shortcut_hint",
        tauri::WebviewUrl::App("shortcut-hint.html".into()),
    );

    builder = builder
        .title("")
        .resizable(false)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .focused(false)
        .visible(true)
        .drag_and_drop(false)
        .initialization_script(
            r#"
                document.addEventListener('DOMContentLoaded', () => {
                    document.documentElement.style.background = 'transparent';
                    document.documentElement.style.pointerEvents = 'none';
                    document.documentElement.style.margin = '0';
                    document.documentElement.style.padding = '0';
                    document.documentElement.style.height = '100%';

                    document.body.style.background = 'transparent';
                    document.body.style.pointerEvents = 'none';
                    document.body.style.margin = '0';
                    document.body.style.padding = '0';
                    document.body.style.height = '100%';
                });
            "#,
        );
    // 创建全屏窗口会出现app启动过于缓慢的问题，现在限制窗口宽度但不限制窗口高度
    let win = builder.build()?;

    const TARGET_WIDTH: i32 = 640;
    const MIN_WIDTH: i32 = 320;
    const TARGET_HEIGHT: i32 = 380;
    const MIN_HEIGHT: i32 = 220;
    const MAX_HEIGHT: i32 = 1000;
    const MARGIN: i32 = 24;

    if let Ok(Some(monitor)) = manager.primary_monitor() {
        let monitor_size = monitor.size();
        let monitor_position = monitor.position();
        let scale_factor = monitor.scale_factor();

        let margin = scale_value(MARGIN, scale_factor);
        let min_width = scale_value(MIN_WIDTH, scale_factor);
        let target_width = scale_value(TARGET_WIDTH, scale_factor);
        let min_height = scale_value(MIN_HEIGHT, scale_factor);
        let target_height = scale_value(TARGET_HEIGHT, scale_factor);
        let max_height = scale_value(MAX_HEIGHT, scale_factor);

        let available_width = (monitor_size.width as i32 - margin * 2).max(min_width);
        let available_height = (monitor_size.height as i32 - margin * 2).max(min_height);

        let window_width = available_width.min(target_width).max(min_width) as u32;
        let window_height_i32 = available_height
            .min(target_height)
            .max(min_height)
            .min(max_height);
        let window_height = window_height_i32 as u32;
        let _ = win.set_size(PhysicalSize::new(window_width, window_height));

        let target_x =
            monitor_position.x + monitor_size.width as i32 - window_width as i32 - margin;
        let target_y =
            monitor_position.y + monitor_size.height as i32 - window_height as i32 - margin;
        let final_x = target_x.max(monitor_position.x + margin);
        let final_y = target_y.max(monitor_position.y + margin);
        let _ = win.set_position(Position::Physical(PhysicalPosition::new(final_x, final_y)));
    } else {
        let _ = win.set_size(PhysicalSize::new(TARGET_WIDTH as u32, TARGET_HEIGHT as u32));
    }

    let _ = win.set_ignore_cursor_events(true);

    configure_shortcut_hint_window_styles(&win, true);
    Ok(())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MonitorBounds {
    left: i32,
    top: i32,
    width: i32,
    height: i32,
    work_left: i32,
    work_top: i32,
    work_width: i32,
    work_height: i32,
}

fn scale_value(base: i32, scale: f64) -> i32 {
    if scale <= 0.0 {
        return base;
    }
    let scaled = (base as f64 * scale).round() as i32;
    scaled.max(1)
}

fn resolve_scale_factor(app: &tauri::AppHandle, bounds: &MonitorBounds) -> f64 {
    if let Ok(monitors) = app.available_monitors() {
        for monitor in monitors {
            let position = monitor.position();
            let size = monitor.size();
            if position.x == bounds.left
                && position.y == bounds.top
                && size.width as i32 == bounds.width
                && size.height as i32 == bounds.height
            {
                return monitor.scale_factor();
            }
        }
    }
    1.0
}

#[tauri::command]
async fn move_shortcut_hint_window(
    app: tauri::AppHandle,
    bounds: MonitorBounds,
) -> Result<(), String> {
    const TARGET_WIDTH: i32 = 640;
    const MIN_WIDTH: i32 = 320;
    const TARGET_HEIGHT: i32 = 380;
    const MIN_HEIGHT: i32 = 620;
    const MAX_HEIGHT: i32 = 1200;
    const MARGIN: i32 = 24;

    let scale_factor = resolve_scale_factor(&app, &bounds);
    let margin = scale_value(MARGIN, scale_factor);
    let min_width = scale_value(MIN_WIDTH, scale_factor);
    let target_width = scale_value(TARGET_WIDTH, scale_factor);
    let min_height = scale_value(MIN_HEIGHT, scale_factor);
    let target_height = scale_value(TARGET_HEIGHT, scale_factor);
    let max_height = scale_value(MAX_HEIGHT, scale_factor);

    let area_left = if bounds.work_width > 0 {
        bounds.work_left
    } else {
        bounds.left
    };
    let area_top = if bounds.work_height > 0 {
        bounds.work_top
    } else {
        bounds.top
    };
    let area_width = if bounds.work_width > 0 {
        bounds.work_width
    } else {
        bounds.width
    };
    let area_height = if bounds.work_height > 0 {
        bounds.work_height
    } else {
        bounds.height
    };

    let area_right = area_left + area_width;
    let area_bottom = area_top + area_height;

    let available_width = (area_width - margin * 2).max(min_width);
    let available_height = (area_height - margin * 2).max(min_height);

    if available_width <= 0 || available_height <= 0 {
        return Err("monitor bounds too small".to_string());
    }

    let window_width = available_width.min(target_width).max(min_width) as u32;
    let window_height_i32 = available_height
        .min(target_height)
        .max(min_height)
        .min(max_height);
    let window_height = window_height_i32 as u32;

    if let Some(win) = app.get_webview_window("shortcut_hint") {
        win.set_size(PhysicalSize::new(window_width, window_height))
            .map_err(|e| e.to_string())?;

        let actual_size = win
            .outer_size()
            .unwrap_or(PhysicalSize::new(window_width, window_height));

        let actual_width = actual_size.width as i32;
        let actual_height = actual_size.height as i32;

        let target_x = area_right - actual_width - margin;
        let target_y = area_bottom - actual_height - margin;

        let min_x = area_left + margin;
        let max_x = area_right - margin - actual_width;
        let min_y = area_top + margin;
        let max_y = area_bottom - margin - actual_height;

        let final_x = if min_x > max_x {
            min_x
        } else {
            target_x.clamp(min_x, max_x)
        };
        let final_y = if min_y > max_y {
            min_y
        } else {
            target_y.clamp(min_y, max_y)
        };

        win.set_position(Position::Physical(PhysicalPosition::new(final_x, final_y)))
            .map_err(|e| e.to_string())?;

        Ok(())
    } else {
        Err("shortcut hint window not available".to_string())
    }
}

#[cfg(target_os = "windows")]
fn configure_shortcut_hint_window_styles(
    win: &tauri::WebviewWindow,
    enforce_no_activate_show: bool,
) {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::Graphics::Dwm::{
        DwmEnableBlurBehindWindow, DwmSetWindowAttribute, DWMNCRP_ENABLED, DWMWA_BORDER_COLOR,
        DWMWA_NCRENDERING_POLICY, DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_DONOTROUND,
        DWM_BB_BLURREGION, DWM_BB_ENABLE, DWM_BLURBEHIND,
    };
    use windows::Win32::Graphics::Gdi::{CreateRectRgn, DeleteObject};
    use windows::Win32::UI::WindowsAndMessaging::{
        GetWindowLongPtrW, SetWindowLongPtrW, SetWindowPos, ShowWindow, GWL_EXSTYLE, GWL_STYLE,
        SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER, SW_SHOWNOACTIVATE,
        WS_BORDER, WS_CAPTION, WS_EX_LAYERED, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW,
        WS_EX_TRANSPARENT, WS_MAXIMIZEBOX, WS_MINIMIZEBOX, WS_SYSMENU, WS_THICKFRAME,
    };

    if let Ok(hwnd) = win.hwnd() {
        unsafe {
            let hwnd = HWND(hwnd.0);

            let mut ex_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as i32;
            ex_style |=
                (WS_EX_TRANSPARENT | WS_EX_LAYERED | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE).0 as i32;
            SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex_style as _);

            let mut base_style = GetWindowLongPtrW(hwnd, GWL_STYLE) as i32;
            base_style &= !((WS_CAPTION
                | WS_THICKFRAME
                | WS_BORDER
                | WS_SYSMENU
                | WS_MAXIMIZEBOX
                | WS_MINIMIZEBOX)
                .0 as i32);
            SetWindowLongPtrW(hwnd, GWL_STYLE, base_style as _);

            let nc_policy = DWMNCRP_ENABLED;
            let _ = DwmSetWindowAttribute(
                hwnd,
                DWMWA_NCRENDERING_POLICY,
                &nc_policy as *const _ as _,
                size_of::<i32>() as u32,
            );

            let corner_pref = DWMWCP_DONOTROUND;
            let _ = DwmSetWindowAttribute(
                hwnd,
                DWMWA_WINDOW_CORNER_PREFERENCE,
                &corner_pref as *const _ as _,
                size_of::<i32>() as u32,
            );

            let border_color: u32 = 0;
            let _ = DwmSetWindowAttribute(
                hwnd,
                DWMWA_BORDER_COLOR,
                &border_color as *const _ as _,
                size_of::<u32>() as u32,
            );

            let _ = SetWindowPos(
                hwnd,
                None,
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED,
            );

            let region = CreateRectRgn(0, 0, -1, -1);
            if !region.is_invalid() {
                let blur = DWM_BLURBEHIND {
                    dwFlags: DWM_BB_ENABLE | DWM_BB_BLURREGION,
                    fEnable: true.into(),
                    hRgnBlur: region,
                    fTransitionOnMaximized: false.into(),
                };

                let _ = DwmEnableBlurBehindWindow(hwnd, &blur);
                let _ = DeleteObject(region.into());
            }

            if enforce_no_activate_show {
                let _ = ShowWindow(hwnd, SW_SHOWNOACTIVATE);
            }
        }
    }

    let _ = win.set_shadow(false);
}

#[cfg(not(target_os = "windows"))]
fn configure_shortcut_hint_window_styles(
    _win: &tauri::WebviewWindow,
    _enforce_no_activate_show: bool,
) {
}

fn get_shortcut_service() -> Result<std::sync::MutexGuard<'static, ShortcutService>, String> {
    SHORTCUT_SERVICE
        .get_or_init(|| Mutex::new(ShortcutService::new()))
        .lock()
        .map_err(|e| format!("Failed to lock Shortcut service: {}", e))
}

#[tauri::command]
async fn get_modifier_state() -> Result<ModifierState, String> {
    let service = get_shortcut_service()?;
    service
        .get_modifier_state()
        .map_err(|e| format!("获取修饰键状态失败: {}", e))
}

#[tauri::command]
async fn get_foreground_window() -> Result<ForegroundWindowInfo, String> {
    let service = get_shortcut_service()?;
    service
        .get_foreground_window_info()
        .map_err(|e| format!("获取前台窗口信息失败: {}", e))
}

#[tauri::command]
async fn is_key_pressed(key_code: i32) -> Result<bool, String> {
    let service = get_shortcut_service()?;
    service
        .is_key_pressed(key_code)
        .map_err(|e| format!("检查按键状态失败: {}", e))
}

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

            // 创建快捷键提示悬浮窗口
            create_shortcut_hint_window(&app.handle())?;

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
            // 快捷键提示命令
            get_modifier_state,
            get_foreground_window,
            is_key_pressed,
            move_shortcut_hint_window,
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
