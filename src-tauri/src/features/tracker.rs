use crate::db::DbState;
use chrono::Utc;
use std::path::Path;
use std::sync::{Arc, Mutex, atomic::{AtomicBool, Ordering}};
use std::time::Duration;
use once_cell::sync::Lazy;
use windows::{ Win32::Foundation::*, Win32::System::ProcessStatus::*, Win32::System::Threading::*, Win32::UI::WindowsAndMessaging::* };
use tauri::Manager;

#[derive(Debug, PartialEq, Eq, Clone)]
pub struct CurrentActivity { pub app_name: String, pub window_title: String }

#[derive(serde::Serialize, Clone)]
pub struct ActiveWindowInfo { pub app_name: String, pub window_title: String }

static LAST_KNOWN_ACTIVITY: Lazy<Mutex<Option<CurrentActivity>>> = Lazy::new(|| Mutex::new(None));

pub fn run_tracker_loop(app_handle: tauri::AppHandle, stop: Arc<AtomicBool>) {
    let mut last_activity: Option<CurrentActivity> = None;
    let mut last_start_time = Utc::now();
    loop {
        if stop.load(Ordering::Relaxed) { break; }
        std::thread::sleep(Duration::from_secs(2));
        let current_activity = match get_active_window_info_internal() { Ok(info) => Some(info), Err(_) => None };
        if last_activity != current_activity {
            let now = Utc::now();
            if let Some(prev) = last_activity {
                let duration = now.signed_duration_since(last_start_time).num_seconds();
                if duration > 1 {
                    let db_state: tauri::State<DbState> = app_handle.state();
                    let conn = db_state.db.lock().unwrap();
                    let _ = conn.execute(
                        "INSERT INTO activity_log (app_name, window_title, start_time, duration_seconds) VALUES (?1, ?2, ?3, ?4)",
                        (&prev.app_name, &prev.window_title, last_start_time.to_rfc3339(), duration),
                    );
                }
            }
            last_activity = current_activity;
            last_start_time = now;
        }
    }
}

fn get_active_window_info_internal() -> Result<CurrentActivity, String> {
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.is_invalid() { return Err("无法获取前台窗口".into()); }
        let mut title_buffer = [0u16; 512];
        let len = GetWindowTextW(hwnd, &mut title_buffer);
        let window_title = String::from_utf16_lossy(&title_buffer[..len as usize]);
        let mut process_id: u32 = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut process_id));
        if process_id == 0 { return Err("无法获取进程ID".into()); }
        let process_handle = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, false, process_id)
            .map_err(|e| format!("无法打开进程: {:?}", e))?;
        let mut exe_path_buffer = [0u16; 1024];
        let exe_len = K32GetModuleFileNameExW(Some(process_handle), None, &mut exe_path_buffer);
        let _ = CloseHandle(process_handle);
        if exe_len == 0 { return Err("无法获取模块文件名".into()); }
        let exe_path_full = String::from_utf16_lossy(&exe_path_buffer[..exe_len as usize]);
        let app_name = Path::new(&exe_path_full).file_name().and_then(|s| s.to_str()).unwrap_or("unknown").to_string();
        Ok(CurrentActivity { app_name, window_title })
    }
}

pub fn get_active_window_info() -> Result<ActiveWindowInfo, String> {
    match get_active_window_info_internal() {
        Ok(info) => {
            if let Ok(mut last) = LAST_KNOWN_ACTIVITY.lock() {
                *last = Some(info.clone());
            }
            Ok(ActiveWindowInfo { app_name: info.app_name, window_title: info.window_title })
        }
        Err(err) => {
            eprintln!("get_active_window_info failed: {}", err);
            if let Ok(last) = LAST_KNOWN_ACTIVITY.lock() {
                if let Some(cached) = last.clone() {
                    return Ok(ActiveWindowInfo {
                        app_name: cached.app_name,
                        window_title: cached.window_title,
                    });
                }
            }
            Ok(ActiveWindowInfo {
                app_name: "unknown".into(),
                window_title: String::new(),
            })
        }
    }
}
