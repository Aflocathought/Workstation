// src-tauri/src/pdf_library/file_ops.rs

use std::path::Path;
use std::fs;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use super::{FileIdentity, RenameResult};

/// 获取文件身份信息 (Windows File ID)
#[cfg(target_os = "windows")]
pub fn get_file_identity(path: &Path) -> Result<FileIdentity, String> {
    let metadata = fs::metadata(path).map_err(|e| e.to_string())?;
    
    // 注意: volume_serial_number 和 file_index 是 unstable 特性
    // 暂时使用文件大小和修改时间作为简化标识
    use std::time::SystemTime;
    let modified = metadata.modified()
        .unwrap_or(SystemTime::UNIX_EPOCH)
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    
    Ok(FileIdentity {
        volume_id: 0, // 需要 nightly 特性
        file_index: modified, // 使用修改时间作为简化标识
        file_size: metadata.len(),
    })
}

#[cfg(not(target_os = "windows"))]
pub fn get_file_identity(path: &Path) -> Result<FileIdentity, String> {
    let metadata = fs::metadata(path).map_err(|e| e.to_string())?;
    
    // 非 Windows 系统使用文件大小作为简化标识
    Ok(FileIdentity {
        volume_id: 0,
        file_index: 0,
        file_size: metadata.len(),
    })
}

/// 安全重命名文件
/// 返回新路径和是否成功
pub fn safe_rename_file(
    old_path: &Path,
    new_title: &str,
) -> RenameResult {
    // 获取父目录和扩展名
    let parent = match old_path.parent() {
        Some(p) => p,
        None => {
            return RenameResult {
                success: false,
                new_path: old_path.to_string_lossy().to_string(),
                error: Some("无法获取父目录".to_string()),
            };
        }
    };
    
    let extension = old_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("pdf");
    
    // 清理文件名 (移除非法字符)
    let safe_filename = sanitize_filename(new_title);
    let new_filename = format!("{}.{}", safe_filename, extension);
    let new_path = parent.join(&new_filename);
    
    // 检查是否相同
    if old_path == new_path {
        return RenameResult {
            success: true,
            new_path: old_path.to_string_lossy().to_string(),
            error: None,
        };
    }
    
    // 尝试重命名
    match fs::rename(old_path, &new_path) {
        Ok(_) => RenameResult {
            success: true,
            new_path: new_path.to_string_lossy().to_string(),
            error: None,
        },
        Err(e) => RenameResult {
            success: false,
            new_path: old_path.to_string_lossy().to_string(),
            error: Some(format!("重命名失败: {}", e)),
        },
    }
}

/// 清理文件名中的非法字符
fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            _ => c,
        })
        .collect()
}

/// 在文件管理器中显示文件
#[cfg(target_os = "windows")]
pub fn show_in_folder(path: &Path) -> Result<(), String> {
    use std::process::Command;
    
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    
    Command::new("explorer")
        .args(["/select,", &path.to_string_lossy()])
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| e.to_string())?;
    
    Ok(())
}

#[cfg(target_os = "macos")]
pub fn show_in_folder(path: &Path) -> Result<(), String> {
    use std::process::Command;
    
    Command::new("open")
        .args(["-R", &path.to_string_lossy()])
        .spawn()
        .map_err(|e| e.to_string())?;
    
    Ok(())
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
pub fn show_in_folder(path: &Path) -> Result<(), String> {
    // Linux: 尝试使用 xdg-open 打开父目录
    use std::process::Command;
    
    if let Some(parent) = path.parent() {
        Command::new("xdg-open")
            .arg(parent)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    
    Ok(())
}

/// 用系统默认程序打开文件
pub fn open_file(path: &Path) -> Result<(), String> {
    use std::process::Command;
    
    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "", &path.to_string_lossy()])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    
    Ok(())
}

/// 复制文件到剪贴板 (Windows only)
#[cfg(target_os = "windows")]
pub fn copy_file_to_clipboard(_path: &Path) -> Result<(), String> {
    // 这里需要使用 clipboard-win crate
    // 暂时返回未实现错误,需要在 Cargo.toml 中添加依赖
    Err("需要添加 clipboard-win 依赖".to_string())
}

#[cfg(not(target_os = "windows"))]
pub fn copy_file_to_clipboard(_path: &Path) -> Result<(), String> {
    Err("此功能仅支持 Windows".to_string())
}
