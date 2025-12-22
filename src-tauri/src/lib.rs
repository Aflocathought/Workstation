// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

// 声明全局路径模块
#[path = "core/app_paths.rs"]
pub mod app_paths;

// 引入 Python 服务模块
#[path = "services/python.rs"]
mod python;
use python::{PythonService, PythonResult, ScriptInfo, PythonInfo};

// 引入快捷键服务模块
#[path = "services/shortcut.rs"]
mod shortcut;
use shortcut::{ShortcutService, ModifierState, ForegroundWindowInfo};

// 引入 CSV 处理模块
#[path = "handlers/csv_handler.rs"]
mod csv_handler;
use csv_handler::{
    CsvCacheManager,
    csv_load_file,
    csv_get_pagination,
    csv_load_page,
    csv_generate_thumbnail,
    csv_change_delimiter,
    csv_clear_cache,
};

// 引入 Parquet 处理模块
#[path = "handlers/parquet_handler.rs"]
mod parquet_handler;
use parquet_handler::{
    ParquetCacheManager,
    parquet_open_file,
    parquet_load_page,
    parquet_generate_thumbnail,
    parquet_clear_cache,
    convert_csv_to_parquet,
};

use once_cell::sync::OnceCell;
use std::sync::Mutex;

// 全局 Python 服务实例
static PYTHON_SERVICE: OnceCell<Mutex<PythonService>> = OnceCell::new();

// 全局快捷键服务实例
static SHORTCUT_SERVICE: OnceCell<Mutex<ShortcutService>> = OnceCell::new();

/// 获取 Python 服务实例
fn get_python_service(_app_handle: &tauri::AppHandle) -> Result<std::sync::MutexGuard<'static, PythonService>, String> {
    PYTHON_SERVICE
        .get_or_init(|| {
            Mutex::new(PythonService::new())
        })
        .lock()
        .map_err(|e| format!("Failed to lock Python service: {}", e))
}

/// 获取快捷键服务实例
fn get_shortcut_service() -> Result<std::sync::MutexGuard<'static, ShortcutService>, String> {
    SHORTCUT_SERVICE
        .get_or_init(|| {
            Mutex::new(ShortcutService::new())
        })
        .lock()
        .map_err(|e| format!("Failed to lock Shortcut service: {}", e))
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
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
async fn read_python_script(
    app_handle: tauri::AppHandle,
    name: String,
) -> Result<String, String> {
    let service = get_python_service(&app_handle)?;
    service.read_script(name)
}

/// 删除 Python 脚本
#[tauri::command]
async fn delete_python_script(
    app_handle: tauri::AppHandle,
    name: String,
) -> Result<(), String> {
    let service = get_python_service(&app_handle)?;
    service.delete_script(name)
}

/// 获取 Python 环境信息
#[tauri::command]
async fn get_python_info(app_handle: tauri::AppHandle) -> Result<PythonInfo, String> {
    let service = get_python_service(&app_handle)?;
    service.get_python_info()
}

/// 获取当前修饰键状态
#[tauri::command]
async fn get_modifier_state() -> Result<ModifierState, String> {
    let service = get_shortcut_service()?;
    service.get_modifier_state()
        .map_err(|e| format!("获取修饰键状态失败: {}", e))
}

/// 获取前台窗口信息
#[tauri::command]
async fn get_foreground_window() -> Result<ForegroundWindowInfo, String> {
    let service = get_shortcut_service()?;
    service.get_foreground_window_info()
        .map_err(|e| format!("获取前台窗口信息失败: {}", e))
}

/// 检查指定按键是否被按下
#[tauri::command]
async fn is_key_pressed(key_code: i32) -> Result<bool, String> {
    let service = get_shortcut_service()?;
    service.is_key_pressed(key_code)
        .map_err(|e| format!("检查按键状态失败: {}", e))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(CsvCacheManager::default())
        .manage(ParquetCacheManager::default())
        .invoke_handler(tauri::generate_handler![
            greet,
            execute_python_script,
            list_python_scripts,
            save_python_script,
            read_python_script,
            delete_python_script,
            get_python_info,
            get_modifier_state,
            get_foreground_window,
            is_key_pressed,
            csv_load_file,
            csv_get_pagination,
            csv_load_page,
            csv_generate_thumbnail,
            csv_change_delimiter,
            csv_clear_cache,
            parquet_open_file,
            parquet_load_page,
            parquet_generate_thumbnail,
            parquet_clear_cache,
            convert_csv_to_parquet,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
