// src-tauri/src/pdf_library/watcher.rs

use notify::{Config, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::{Path, PathBuf};
use std::sync::mpsc::channel;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use chrono::Datelike;

use super::database;
use super::metadata;
use super::file_ops;
use super::PdfLibraryState;

pub struct InboxWatcher {
    // watcher 需要被持有以保持活跃
    _watcher: RecommendedWatcher,
}

impl InboxWatcher {
    pub fn start(
        app_handle: AppHandle,
        inbox_path: PathBuf,
        workspace_path: PathBuf,
    ) -> Result<Self, String> {
        let (tx, rx) = channel();
        
        // 初始化 watcher
        let mut watcher = RecommendedWatcher::new(tx, Config::default())
            .map_err(|e| format!("无法创建文件监控器: {}", e))?;
            
        // 开始监控 Inbox 目录
        watcher.watch(&inbox_path, RecursiveMode::NonRecursive)
            .map_err(|e| format!("无法监控 Inbox 目录: {}", e))?;
            
        println!("[PDFLibrary] Inbox 监控已启动: {:?}", inbox_path);
        
        // 启动处理线程
        let app_handle_clone = app_handle.clone();
        let workspace_path_clone = workspace_path.clone();
        
        thread::spawn(move || {
            for res in rx {
                match res {
                    Ok(event) => {
                        // 只处理文件创建事件
                        if let EventKind::Create(_) = event.kind {
                            for path in event.paths {
                                // 检查是否为 PDF 文件
                                if path.is_file() && path.extension().map_or(false, |ext| ext.eq_ignore_ascii_case("pdf")) {
                                    println!("[PDFLibrary] 检测到新 PDF: {:?}", path);
                                    
                                    // 处理新文件
                                    if let Err(e) = handle_new_file(&app_handle_clone, &path, &workspace_path_clone) {
                                        eprintln!("[PDFLibrary] 处理新文件失败: {}", e);
                                    }
                                }
                            }
                        }
                    },
                    Err(e) => eprintln!("[PDFLibrary] 监控错误: {:?}", e),
                }
            }
        });

        // 处理 Inbox 中已存在的 PDF 文件
        let app_handle_existing = app_handle.clone();
        let inbox_path_existing = inbox_path.clone();
        let workspace_path_existing = workspace_path.clone();

        thread::spawn(move || {
            println!("[PDFLibrary] 开始扫描 Inbox 现有文件...");
            if let Ok(entries) = std::fs::read_dir(&inbox_path_existing) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_file() && path.extension().map_or(false, |ext| ext.eq_ignore_ascii_case("pdf")) {
                        println!("[PDFLibrary] 发现现有文件: {:?}", path);
                        if let Err(e) = handle_new_file(&app_handle_existing, &path, &workspace_path_existing) {
                            eprintln!("[PDFLibrary] 处理现有文件失败: {}", e);
                        }
                    }
                }
            }
            println!("[PDFLibrary] Inbox 现有文件扫描完成");
        });
        
        Ok(Self { _watcher: watcher })
    }
}

fn handle_new_file(app_handle: &AppHandle, file_path: &Path, workspace_path: &Path) -> Result<(), String> {
    // 1. 防抖：等待文件写入完成
    // 简单休眠 1 秒，确保文件句柄已释放
    thread::sleep(Duration::from_secs(1));
    
    // 2. 计算目标路径: Workspace/YYYY/MM/filename
    let now = chrono::Local::now();
    let year = now.year().to_string();
    let month = format!("{:02}", now.month());
    
    let target_dir = workspace_path.join(&year).join(&month);
    if !target_dir.exists() {
        std::fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;
    }
    
    let filename = file_path.file_name().ok_or("无效的文件名")?;
    let target_path = target_dir.join(filename);
    
    // 3. 移动文件
    // 如果目标文件已存在，添加时间戳后缀避免覆盖
    let final_target_path = if target_path.exists() {
        let stem = file_path.file_stem().unwrap().to_string_lossy();
        let ext = file_path.extension().unwrap().to_string_lossy();
        let new_name = format!("{}_{}.{}", stem, now.timestamp(), ext);
        target_dir.join(new_name)
    } else {
        target_path
    };
    
    println!("[PDFLibrary] 正在移动文件: {:?} -> {:?}", file_path, final_target_path);
    
    // 重试机制：如果文件被占用，尝试多次
    let mut moved = false;
    for i in 0..5 {
        if std::fs::rename(file_path, &final_target_path).is_ok() {
            moved = true;
            break;
        }
        println!("[PDFLibrary] 文件移动失败 (尝试 {}/5)，等待重试...", i + 1);
        thread::sleep(Duration::from_secs(1));
    }
    
    if !moved {
        // 如果移动失败，尝试复制然后删除
        if std::fs::copy(file_path, &final_target_path).is_ok() {
            let _ = std::fs::remove_file(file_path);
        } else {
            return Err(format!("无法移动文件 {:?} 到 {:?}", file_path, final_target_path));
        }
    }
    
    // 4. 提取元数据并入库
    // 获取数据库连接
    let state = app_handle.state::<std::sync::Mutex<PdfLibraryState>>();
    let state_guard = state.lock().unwrap();
    let conn = database::init_db(&state_guard.db_path).map_err(|e| e.to_string())?;
    
    // 获取 Workspace 目录 ID
    let dirs = database::get_all_directories(&conn).map_err(|e| e.to_string())?;
    let workspace_dir = dirs.into_iter().find(|d| d.dir_type == "workspace")
        .ok_or("数据库中未找到 Workspace 目录")?;
        
    // 提取信息
    let metadata = metadata::extract_metadata(&final_target_path)?;
    let identity = file_ops::get_file_identity(&final_target_path)?;
    
    let title = final_target_path.file_stem().unwrap().to_string_lossy().to_string();
    let filename_str = final_target_path.file_name().unwrap().to_string_lossy().to_string();
    let filepath_str = final_target_path.to_string_lossy().to_string();
    
    // 插入数据库
    database::insert_book(
        &conn,
        &title,
        &filename_str,
        &filepath_str,
        workspace_dir.id,
        true, // is_managed
        identity.volume_id,
        identity.file_index,
        identity.file_size,
        metadata.author.as_deref(),
        metadata.page_count,
        None
    ).map_err(|e| e.to_string())?;
    
    println!("[PDFLibrary] 新文件入库成功: {}", title);
    
    // 5. 通知前端刷新
    app_handle.emit("pdf-library-update", ()).map_err(|e| e.to_string())?;
    
    Ok(())
}
