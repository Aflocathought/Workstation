// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

// 声明全局路径模块
#[path = "core/app_paths.rs"]
pub mod app_paths;

// 引入 Python 服务模块
#[path = "services/python.rs"]
mod python;
use python::{PythonService, PythonResult, ScriptInfo, PythonInfo};

// 引入 SSH 服务模块
#[path = "services/ssh.rs"]
mod ssh;
use ssh::{SshService, SshResult, SshTestResult, WorkerDeployResult};

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

// 全局 SSH 服务实例
static SSH_SERVICE: OnceCell<Mutex<SshService>> = OnceCell::new();

/// 获取 Python 服务实例
fn get_python_service(_app_handle: &tauri::AppHandle) -> Result<std::sync::MutexGuard<'static, PythonService>, String> {
    PYTHON_SERVICE
        .get_or_init(|| {
            Mutex::new(PythonService::new())
        })
        .lock()
        .map_err(|e| format!("Failed to lock Python service: {}", e))
}

/// 获取 SSH 服务实例
fn get_ssh_service() -> Result<std::sync::MutexGuard<'static, SshService>, String> {
    SSH_SERVICE
        .get_or_init(|| {
            Mutex::new(SshService::new())
        })
        .lock()
        .map_err(|e| format!("Failed to lock SSH service: {}", e))
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

// ==================== SSH 命令 ====================

/// 测试 SSH 连接 — 返回主机名、Python 版本、GPU 信息
#[tauri::command]
async fn ssh_test_connection(
    host: String,
    user: String,
    key_path: Option<String>,
) -> Result<SshTestResult, String> {
    let service = get_ssh_service()?;
    service.test_connection(&host, &user, key_path.as_deref())
}

/// 执行远程 SSH 命令
#[tauri::command]
async fn ssh_exec_remote(
    host: String,
    user: String,
    key_path: Option<String>,
    command: String,
) -> Result<SshResult, String> {
    let service = get_ssh_service()?;
    service.exec_remote(&host, &user, key_path.as_deref(), &command)
}

/// 上传文件到远程机器 (SCP)
#[tauri::command]
async fn ssh_upload_file(
    host: String,
    user: String,
    key_path: Option<String>,
    local_path: String,
    remote_path: String,
) -> Result<SshResult, String> {
    let service = get_ssh_service()?;
    service.upload_file(&host, &user, key_path.as_deref(), &local_path, &remote_path)
}

/// 部署 Worker 到远程机器 (上传 + 安装依赖 + 启动)
#[tauri::command]
async fn ssh_deploy_worker(
    host: String,
    user: String,
    key_path: Option<String>,
    worker_dir: String,
    remote_dir: String,
) -> Result<WorkerDeployResult, String> {
    let service = get_ssh_service()?;
    service.deploy_worker(&host, &user, key_path.as_deref(), &worker_dir, &remote_dir)
}

/// 停止远程 Worker
#[tauri::command]
async fn ssh_stop_worker(
    host: String,
    user: String,
    key_path: Option<String>,
) -> Result<SshResult, String> {
    let service = get_ssh_service()?;
    service.stop_worker(&host, &user, key_path.as_deref())
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
            ssh_test_connection,
            ssh_exec_remote,
            ssh_upload_file,
            ssh_deploy_worker,
            ssh_stop_worker,
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
