// src-tauri/src/shortcut.rs
// 快捷键监听和窗口信息获取模块

use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

#[cfg(target_os = "windows")]
use std::mem::size_of;

#[cfg(target_os = "windows")]
use windows::{
    core::*,
    Win32::Foundation::*,
    Win32::Graphics::Gdi::{GetMonitorInfoW, MonitorFromWindow, MONITORINFOEXW, MONITORINFO, MONITOR_DEFAULTTONEAREST},
    Win32::UI::WindowsAndMessaging::*,
    Win32::System::Threading::*,
    Win32::UI::Input::KeyboardAndMouse::*,
};

/// 修饰键状态
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModifierState {
    pub ctrl: bool,
    pub alt: bool,
    pub shift: bool,
    pub win: bool,
}

/// 前台窗口信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ForegroundWindowInfo {
    pub title: String,
    pub class_name: String,
    pub process_name: String,
    pub process_id: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub monitor: Option<MonitorInfo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub window_rect: Option<WindowRect>,
}

/// 监视器信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorInfo {
    pub name: String,
    pub left: i32,
    pub top: i32,
    pub width: i32,
    pub height: i32,
    pub work_left: i32,
    pub work_top: i32,
    pub work_width: i32,
    pub work_height: i32,
}

/// 窗口矩形信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowRect {
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
}

/// 快捷键事件
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShortcutEvent {
    pub key: String,
    pub modifiers: ModifierState,
    pub timestamp: i64,
}

/// 快捷键服务
pub struct ShortcutService {
    #[allow(dead_code)]
    is_listening: Arc<Mutex<bool>>,
    #[allow(dead_code)]
    current_modifiers: Arc<Mutex<ModifierState>>,
}

impl ShortcutService {
    pub fn new() -> Self {
        Self {
            is_listening: Arc::new(Mutex::new(false)),
            current_modifiers: Arc::new(Mutex::new(ModifierState {
                ctrl: false,
                alt: false,
                shift: false,
                win: false,
            })),
        }
    }

    /// 获取当前修饰键状态
    pub fn get_modifier_state(&self) -> windows::core::Result<ModifierState> {
        #[cfg(target_os = "windows")]
        {
            unsafe {
                let ctrl = GetAsyncKeyState(VK_CONTROL.0 as i32) as u16 & 0x8000 != 0;
                let alt = GetAsyncKeyState(VK_MENU.0 as i32) as u16 & 0x8000 != 0;
                let shift = GetAsyncKeyState(VK_SHIFT.0 as i32) as u16 & 0x8000 != 0;
                let win = GetAsyncKeyState(VK_LWIN.0 as i32) as u16 & 0x8000 != 0
                    || GetAsyncKeyState(VK_RWIN.0 as i32) as u16 & 0x8000 != 0;

                Ok(ModifierState {
                    ctrl,
                    alt,
                    shift,
                    win,
                })
            }
        }

        #[cfg(not(target_os = "windows"))]
        {
            // 其他平台暂不支持
            Ok(ModifierState {
                ctrl: false,
                alt: false,
                shift: false,
                win: false,
            })
        }
    }

    /// 获取前台窗口信息
    pub fn get_foreground_window_info(&self) -> windows::core::Result<ForegroundWindowInfo> {
        #[cfg(target_os = "windows")]
        {
            unsafe {
                let hwnd = GetForegroundWindow();
                if hwnd.0.is_null() {
                    return Err(Error::from_hresult(HRESULT(-1)));
                }

                // 获取窗口标题
                let mut title_buf = [0u16; 256];
                let title_len = GetWindowTextW(hwnd, &mut title_buf);
                let title = if title_len > 0 {
                    String::from_utf16_lossy(&title_buf[..title_len as usize])
                } else {
                    String::new()
                };

                // 获取窗口类名
                let mut class_buf = [0u16; 256];
                let class_len = GetClassNameW(hwnd, &mut class_buf);
                let class_name = if class_len > 0 {
                    String::from_utf16_lossy(&class_buf[..class_len as usize])
                } else {
                    String::new()
                };

                // 获取进程ID
                let mut process_id: u32 = 0;
                GetWindowThreadProcessId(hwnd, Some(&mut process_id));

                // 获取进程名称
                let process_name = if process_id > 0 {
                    match get_process_name(process_id) {
                        Ok(name) => name,
                        Err(_) => String::new(),
                    }
                } else {
                    String::new()
                };

                let monitor = {
                    let hmonitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
                    if !hmonitor.is_invalid() {
                        let mut monitor_info = MONITORINFOEXW::default();
                        monitor_info.monitorInfo.cbSize = size_of::<MONITORINFOEXW>() as u32;

                        if GetMonitorInfoW(
                            hmonitor,
                            &mut monitor_info as *mut MONITORINFOEXW as *mut MONITORINFO,
                        )
                        .as_bool()
                        {
                            let name = String::from_utf16_lossy(&monitor_info.szDevice)
                                .trim_end_matches('\0')
                                .to_string();
                            let monitor_rect = monitor_info.monitorInfo.rcMonitor;
                            let work_rect = monitor_info.monitorInfo.rcWork;

                            Some(MonitorInfo {
                                name,
                                left: monitor_rect.left,
                                top: monitor_rect.top,
                                width: monitor_rect.right - monitor_rect.left,
                                height: monitor_rect.bottom - monitor_rect.top,
                                work_left: work_rect.left,
                                work_top: work_rect.top,
                                work_width: work_rect.right - work_rect.left,
                                work_height: work_rect.bottom - work_rect.top,
                            })
                        } else {
                            None
                        }
                    } else {
                        None
                    }
                };

                let window_rect = {
                    let mut rect = RECT::default();
                    if GetWindowRect(hwnd, &mut rect).is_ok() {
                        Some(WindowRect {
                            left: rect.left,
                            top: rect.top,
                            right: rect.right,
                            bottom: rect.bottom,
                        })
                    } else {
                        None
                    }
                };

                Ok(ForegroundWindowInfo {
                    title,
                    class_name,
                    process_name,
                    process_id,
                    monitor,
                    window_rect,
                })
            }
        }

        #[cfg(not(target_os = "windows"))]
        {
            // 其他平台暂不支持
            Err(Error::from_hresult(HRESULT(-1)))
        }
    }

    /// 检查指定的按键是否被按下
    pub fn is_key_pressed(&self, key_code: i32) -> windows::core::Result<bool> {
        #[cfg(target_os = "windows")]
        {
            unsafe {
                let state = GetAsyncKeyState(key_code) as u16;
                Ok(state & 0x8000 != 0)
            }
        }

        #[cfg(not(target_os = "windows"))]
        {
            Ok(false)
        }
    }
}

/// 获取进程名称（Windows）
#[cfg(target_os = "windows")]
fn get_process_name(process_id: u32) -> windows::core::Result<String> {
    use windows::Win32::System::ProcessStatus::*;
    
    unsafe {
        let process_handle = OpenProcess(
            PROCESS_QUERY_INFORMATION | PROCESS_VM_READ,
            false,
            process_id,
        )?;

        let mut module_name = [0u16; 260];
        let mut cb_needed: u32 = 0;

        // 获取进程的第一个模块（主模块）
        let mut h_mod: HMODULE = HMODULE::default();
        if EnumProcessModules(
            process_handle,
            &mut h_mod,
            std::mem::size_of::<HMODULE>() as u32,
            &mut cb_needed,
        )
        .is_ok()
        {
            if GetModuleBaseNameW(process_handle, Some(h_mod), &mut module_name) > 0 {
                let name = String::from_utf16_lossy(&module_name)
                    .trim_end_matches('\0')
                    .to_string();
                let _ = CloseHandle(process_handle);
                return Ok(name);
            }
        }
        let _ = CloseHandle(process_handle);

        Err(Error::from_hresult(HRESULT(-1)))
    }
}

/// 虚拟键码映射（常用键）
#[allow(dead_code)]
pub fn get_key_name(vk_code: i32) -> String {
    match vk_code {
        0x41..=0x5A => {
            // A-Z
            let ch = ((vk_code - 0x41 + 'A' as i32) as u8) as char;
            ch.to_string()
        },
        0x30..=0x39 => {
            // 0-9
            let ch = ((vk_code - 0x30 + '0' as i32) as u8) as char;
            ch.to_string()
        },
        0x70..=0x87 => format!("F{}", vk_code - 0x6F), // F1-F24
        0x0D => "Enter".to_string(),
        0x20 => "Space".to_string(),
        0x1B => "Escape".to_string(),
        0x09 => "Tab".to_string(),
        0x08 => "Backspace".to_string(),
        0x2E => "Delete".to_string(),
        0x2D => "Insert".to_string(),
        0x24 => "Home".to_string(),
        0x23 => "End".to_string(),
        0x21 => "PageUp".to_string(),
        0x22 => "PageDown".to_string(),
        0x25 => "ArrowLeft".to_string(),
        0x26 => "ArrowUp".to_string(),
        0x27 => "ArrowRight".to_string(),
        0x28 => "ArrowDown".to_string(),
        _ => format!("Key{:X}", vk_code),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_key_name() {
        assert_eq!(get_key_name(0x41), "A");
        assert_eq!(get_key_name(0x70), "F1");
        assert_eq!(get_key_name(0x0D), "Enter");
    }
}
