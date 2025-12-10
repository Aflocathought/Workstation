// src-tauri/src/pdf_library/commands.rs

use tauri::State;
use std::sync::Mutex;
use std::path::{Path, PathBuf};

use super::database;
use super::file_ops;
use super::metadata;
use super::watcher::InboxWatcher;
use super::{Book, Tag, Directory, Category, PDFMetadata, FileIdentity, RenameResult, RelinkResult};
use chrono::Utc;

/// PDF Library 状态
pub struct PdfLibraryState {
    pub db_path: PathBuf,
    pub inbox_watcher: Mutex<Option<InboxWatcher>>,
}

impl PdfLibraryState {
    pub fn new(db_path: PathBuf) -> Self {
        Self { 
            db_path,
            inbox_watcher: Mutex::new(None),
        }
    }
    
    fn get_connection(&self) -> Result<rusqlite::Connection, String> {
        database::init_db(&self.db_path).map_err(|e| e.to_string())
    }
}

// ==================== 数据库命令 ====================

#[tauri::command]
pub fn pdflibrary_init_db(
    app_handle: tauri::AppHandle,
    state: State<Mutex<PdfLibraryState>>
) -> Result<(), String> {
    println!("[PDFLibrary] pdflibrary_init_db 被调用");
    let mut state_guard = state.lock().unwrap();
    println!("[PDFLibrary] 数据库路径: {:?}", state_guard.db_path);
    
    // 使用 ensure_schema 仅初始化表结构
    match database::ensure_schema(&state_guard.db_path) {
        Ok(_) => {
            println!("[PDFLibrary] 数据库初始化成功");
            
            // 尝试启动 Watcher
            if let Ok(conn) = database::init_db(&state_guard.db_path) {
                if let Ok(dirs) = database::get_all_directories(&conn) {
                    if let Some(ws) = dirs.into_iter().find(|d| d.dir_type == "workspace") {
                        let workspace_path = PathBuf::from(&ws.path);
                        let inbox_path = workspace_path.join("Inbox");
                        
                        if workspace_path.exists() && inbox_path.exists() {
                            println!("[PDFLibrary] 正在启动 Inbox 监控: {:?}", inbox_path);
                            match InboxWatcher::start(app_handle, inbox_path, workspace_path) {
                                Ok(watcher) => {
                                    if let Ok(watcher_opt) = state_guard.inbox_watcher.get_mut() {
                                        *watcher_opt = Some(watcher);
                                    }
                                },
                                Err(e) => eprintln!("[PDFLibrary] 启动监控失败: {}", e),
                            }
                        }
                    }
                }
            }
            
            Ok(())
        },
        Err(e) => {
            let err_msg = format!("数据库初始化失败: {}", e);
            eprintln!("[PDFLibrary] {}", err_msg);
            Err(err_msg)
        }
    }
}

#[tauri::command]
pub fn pdflibrary_backup_db(state: State<Mutex<PdfLibraryState>>) -> Result<String, String> {
    let state = state.lock().unwrap();
    let backup_dir = state.db_path.parent()
        .ok_or("无法获取备份目录")?
        .join("backups");
    
    database::backup_db(&state.db_path, &backup_dir)
}

// ==================== 书籍命令 ====================

#[tauri::command]
pub fn pdflibrary_get_books(
    state: State<Mutex<PdfLibraryState>>,
    _filter: Option<serde_json::Value>,
    _sort_field: Option<String>,
    _sort_order: Option<String>,
) -> Result<Vec<Book>, String> {
    let state = state.lock().unwrap();
    let conn = state.get_connection()?;
    
    let mut books = database::get_all_books(&conn).map_err(|e| e.to_string())?;
    
    // 为每本书加载标签
    for book in &mut books {
        match database::get_book_tags(&conn, book.id) {
            Ok(tags) => book.tags = Some(tags),
            Err(e) => eprintln!("[PDFLibrary] 加载书籍标签失败 (id={}): {}", book.id, e),
        }
    }
    
    Ok(books)
}

#[tauri::command]
pub fn pdflibrary_get_book(
    state: State<Mutex<PdfLibraryState>>,
    id: i32,
) -> Result<Option<Book>, String> {
    let state = state.lock().unwrap();
    let conn = state.get_connection()?;
    
    let books = database::get_all_books(&conn).map_err(|e| e.to_string())?;
    Ok(books.into_iter().find(|b| b.id == id))
}

#[tauri::command]
pub fn pdflibrary_add_book(
    state: State<Mutex<PdfLibraryState>>,
    filepath: String,
    directory_id: i32,
    is_managed: bool,
) -> Result<Book, String> {
    let state = state.lock().unwrap();
    let conn = state.get_connection()?;
    
    let path = Path::new(&filepath);
    
    // 获取文件身份
    let identity = file_ops::get_file_identity(path)?;
    
    // 提取元数据
    let metadata = metadata::extract_metadata(path)?;
    
    // 提取封面（失败不影响添加书籍）
    let cover_image = match metadata::extract_cover(path) {
        Ok(cover) => {
            println!("[PDFLibrary] 成功提取封面: {}", filepath);
            Some(cover)
        },
        Err(e) => {
            println!("[PDFLibrary] 提取封面失败 ({}): {}", filepath, e);
            None
        }
    };
    
    // 获取文件名
    let filename = path
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or("无效的文件名")?;
    
    // 使用文件名作为标题 (去掉扩展名)
    let title = path
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or("无效的文件名")?;
    
    // 插入数据库
    let book_id = database::insert_book(
        &conn,
        title,
        filename,
        &filepath,
        directory_id,
        is_managed,
        identity.volume_id,
        identity.file_index,
        identity.file_size,
        metadata.author.as_deref(),
        metadata.page_count,
        cover_image.as_deref(),
    ).map_err(|e| e.to_string())?;
    
    // 返回新创建的书籍
    let books = database::get_all_books(&conn).map_err(|e| e.to_string())?;
    books.into_iter()
        .find(|b| b.id == book_id)
        .ok_or_else(|| "创建书籍失败".to_string())
}

#[tauri::command]
pub fn pdflibrary_update_title(
    state: State<Mutex<PdfLibraryState>>,
    id: i32,
    title: String,
) -> Result<(), String> {
    let state = state.lock().unwrap();
    let conn = state.get_connection()?;
    
    database::update_book_title(&conn, id, &title).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pdflibrary_rename_book(
    state: State<Mutex<PdfLibraryState>>,
    id: i32,
    new_title: String,
    sync_filename: bool,
) -> Result<RenameResult, String> {
    let state_guard = state.lock().unwrap();
    let conn = state_guard.get_connection()?;
    
    // 获取书籍信息
    let books = database::get_all_books(&conn).map_err(|e| e.to_string())?;
    let book = books.into_iter()
        .find(|b| b.id == id)
        .ok_or("书籍不存在")?;
    
    // 如果不需要同步文件名,只更新数据库
    if !sync_filename || !book.is_managed {
        database::update_book_title(&conn, id, &new_title).map_err(|e| e.to_string())?;
        return Ok(RenameResult {
            success: true,
            new_path: book.filepath.clone(),
            error: None,
        });
    }
    
    // 尝试重命名文件
    let old_path = Path::new(&book.filepath);
    let result = file_ops::safe_rename_file(old_path, &new_title);
    
    if result.success {
        // 更新数据库中的标题和路径
        database::update_book_title(&conn, id, &new_title).map_err(|e| e.to_string())?;
        database::update_book_path(&conn, id, &result.new_path).map_err(|e| e.to_string())?;
    }
    
    Ok(result)
}

#[tauri::command]
pub fn pdflibrary_delete_book(
    state: State<Mutex<PdfLibraryState>>,
    id: i32,
    delete_file: bool,
) -> Result<(), String> {
    let state_guard = state.lock().unwrap();
    let conn = state_guard.get_connection()?;
    
    if delete_file {
        // 获取文件路径
        let books = database::get_all_books(&conn).map_err(|e| e.to_string())?;
        if let Some(book) = books.into_iter().find(|b| b.id == id) {
            let path = Path::new(&book.filepath);
            if path.exists() {
                std::fs::remove_file(path).map_err(|e| e.to_string())?;
            }
        }
    }
    
    database::delete_book(&conn, id).map_err(|e| e.to_string())
}

// ==================== 标签命令 ====================

#[tauri::command]
pub fn pdflibrary_get_tags(state: State<Mutex<PdfLibraryState>>) -> Result<Vec<Tag>, String> {
    let state = state.lock().unwrap();
    let conn = state.get_connection()?;
    
    database::get_all_tags(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pdflibrary_create_tag(
    state: State<Mutex<PdfLibraryState>>,
    name: String,
    color: Option<String>,
    parent_id: Option<i32>,
    aliases: Option<String>,
) -> Result<Tag, String> {
    let state_guard = state.lock().unwrap();
    let conn = state_guard.get_connection()?;
    
    let tag_id = database::create_tag(&conn, &name, color.as_deref(), parent_id, aliases.as_deref())
        .map_err(|e| e.to_string())?;
    
    Ok(Tag {
        id: tag_id,
        name,
        color,
        parent_id,
        aliases,
        book_count: Some(0),
    })
}

#[tauri::command]
pub fn pdflibrary_get_book_tags(
    state: State<Mutex<PdfLibraryState>>,
    book_id: i32,
) -> Result<Vec<Tag>, String> {
    let state = state.lock().unwrap();
    let conn = state.get_connection()?;
    
    database::get_book_tags(&conn, book_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pdflibrary_add_book_tag(
    state: State<Mutex<PdfLibraryState>>,
    book_id: i32,
    tag_id: i32,
) -> Result<(), String> {
    let state = state.lock().unwrap();
    let conn = state.get_connection()?;
    
    database::add_book_tag(&conn, book_id, tag_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pdflibrary_remove_book_tag(
    state: State<Mutex<PdfLibraryState>>,
    book_id: i32,
    tag_id: i32,
) -> Result<(), String> {
    let state = state.lock().unwrap();
    let conn = state.get_connection()?;
    
    database::remove_book_tag(&conn, book_id, tag_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pdflibrary_update_tag(
    state: State<Mutex<PdfLibraryState>>,
    tag_id: i32,
    name: Option<String>,
    color: Option<String>,
    parent_id: Option<Option<i32>>,
    aliases: Option<Option<String>>,
) -> Result<(), String> {
    let state = state.lock().unwrap();
    let conn = state.get_connection()?;
    
    database::update_tag(
        &conn, 
        tag_id, 
        name.as_deref(), 
        color.as_deref(), 
        parent_id,
        aliases.as_ref().map(|a| a.as_deref())
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pdflibrary_delete_tag(
    state: State<Mutex<PdfLibraryState>>,
    tag_id: i32,
) -> Result<(), String> {
    let state = state.lock().unwrap();
    let conn = state.get_connection()?;
    
    database::delete_tag(&conn, tag_id).map_err(|e| e.to_string())
}

// ==================== 分类管理 ====================

#[tauri::command]
pub fn pdflibrary_get_categories(
    state: State<Mutex<PdfLibraryState>>,
) -> Result<Vec<Category>, String> {
    let state = state.lock().unwrap();
    let conn = state.get_connection()?;
    
    database::get_all_categories(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pdflibrary_create_category(
    state: State<Mutex<PdfLibraryState>>,
    name: String,
    icon: Option<String>,
    color: Option<String>,
) -> Result<Category, String> {
    let state = state.lock().unwrap();
    let conn = state.get_connection()?;
    
    let id = database::create_category(&conn, &name, icon.as_deref(), color.as_deref())
        .map_err(|e| e.to_string())?;
    
    Ok(Category {
        id,
        name,
        icon,
        color,
        display_order: 0, // 将被数据库设置
    })
}

#[tauri::command]
pub fn pdflibrary_update_category(
    state: State<Mutex<PdfLibraryState>>,
    id: i32,
    name: Option<String>,
    icon: Option<String>,
    color: Option<String>,
) -> Result<(), String> {
    let state = state.lock().unwrap();
    let conn = state.get_connection()?;
    
    database::update_category(&conn, id, name.as_deref(), icon.as_deref(), color.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pdflibrary_delete_category(
    state: State<Mutex<PdfLibraryState>>,
    id: i32,
) -> Result<(), String> {
    let state = state.lock().unwrap();
    let conn = state.get_connection()?;
    
    database::delete_category(&conn, id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pdflibrary_update_book_category(
    state: State<Mutex<PdfLibraryState>>,
    book_id: i32,
    category_id: Option<i32>,
) -> Result<(), String> {
    let state = state.lock().unwrap();
    let conn = state.get_connection()?;
    
    database::update_book_category(&conn, book_id, category_id).map_err(|e| e.to_string())
}

// ==================== 文件操作 ====================

#[tauri::command]
pub fn pdflibrary_get_directories(state: State<Mutex<PdfLibraryState>>) -> Result<Vec<Directory>, String> {
    let state = state.lock().unwrap();
    let conn = state.get_connection()?;
    
    database::get_all_directories(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pdflibrary_add_directory(
    state: State<Mutex<PdfLibraryState>>,
    path: String,
    dir_type: String,
    name: String,
) -> Result<Directory, String> {
    let state_guard = state.lock().unwrap();
    let conn = state_guard.get_connection()?;
    
    let dir_id = database::add_directory(&conn, &path, &dir_type, &name)
        .map_err(|e| e.to_string())?;
    
    Ok(Directory {
        id: dir_id,
        path,
        dir_type,
        name,
        is_monitoring: true,
    })
}

// ==================== PDF 处理命令 ====================

#[tauri::command]
pub fn pdflibrary_extract_metadata(filepath: String) -> Result<PDFMetadata, String> {
    let path = Path::new(&filepath);
    metadata::extract_metadata(path)
}

#[tauri::command]
pub fn pdflibrary_extract_cover(filepath: String) -> Result<String, String> {
    let path = Path::new(&filepath);
    metadata::extract_cover(path)
}

/// 更新书籍封面（提取并保存到数据库）
#[tauri::command]
pub fn pdflibrary_update_book_cover(
    state: State<Mutex<PdfLibraryState>>,
    book_id: i32,
) -> Result<String, String> {
    let state_guard = state.lock().unwrap();
    let conn = state_guard.get_connection()?;
    
    // 获取书籍信息
    let books = database::get_all_books(&conn).map_err(|e| e.to_string())?;
    let book = books.into_iter()
        .find(|b| b.id == book_id)
        .ok_or("书籍不存在")?;
    
    let path = Path::new(&book.filepath);
    if !path.exists() {
        return Err("文件不存在".to_string());
    }
    
    // 提取封面
    let cover_image = metadata::extract_cover(path)?;
    
    // 保存到数据库
    database::update_book_cover(&conn, book_id, Some(&cover_image))
        .map_err(|e| e.to_string())?;
    
    Ok(cover_image)
}

#[tauri::command]
pub fn pdflibrary_get_file_identity(filepath: String) -> Result<FileIdentity, String> {
    let path = Path::new(&filepath);
    file_ops::get_file_identity(path)
}

// ==================== 文件操作命令 ====================

#[tauri::command]
pub fn pdflibrary_show_in_folder(filepath: String) -> Result<(), String> {
    let path = Path::new(&filepath);
    file_ops::show_in_folder(path)
}

#[tauri::command]
pub fn pdflibrary_open_file(filepath: String) -> Result<(), String> {
    let path = Path::new(&filepath);
    file_ops::open_file(path)
}

#[tauri::command]
pub fn pdflibrary_copy_file_to_clipboard(filepath: String) -> Result<(), String> {
    let path = Path::new(&filepath);
    file_ops::copy_file_to_clipboard(path)
}

// ==================== 批量刷新元数据 ====================

#[tauri::command]
pub fn pdflibrary_refresh_all_metadata(
    state: State<Mutex<PdfLibraryState>>,
) -> Result<serde_json::Value, String> {
    let state_guard = state.lock().unwrap();
    let conn = state_guard.get_connection()?;

    let books = database::get_all_books(&conn).map_err(|e| e.to_string())?;
    let mut refreshed = 0usize;
    let mut missing = 0usize;
    let mut failed = 0usize;

    for book in books {
        let path = Path::new(&book.filepath);
        if !path.exists() {
            missing += 1;
            continue;
        }

        match metadata::extract_metadata(path) {
            Ok(meta) => {
                // 尝试提取封面（失败不影响元数据更新）
                let cover_image = match metadata::extract_cover(path) {
                    Ok(cover) => Some(cover),
                    Err(e) => {
                        eprintln!("[PDFLibrary] 提取封面失败 (id={}): {}", book.id, e);
                        None
                    }
                };
                
                if let Err(e) = database::update_book_metadata_and_cover(
                    &conn,
                    book.id,
                    meta.author.as_deref(),
                    meta.page_count,
                    cover_image.as_deref(),
                ) {
                    eprintln!("[PDFLibrary] 更新元数据失败 (id={}): {}", book.id, e);
                    failed += 1;
                } else {
                    refreshed += 1;
                }
            }
            Err(e) => {
                eprintln!("[PDFLibrary] 提取元数据失败 (id={}): {}", book.id, e);
                failed += 1;
            }
        }
    }

    let now = Utc::now().to_rfc3339();
    Ok(serde_json::json!({
        "refreshed": refreshed,
        "missing": missing,
        "failed": failed,
        "finishedAt": now,
    }))
}

fn get_workspace_directory(conn: &rusqlite::Connection) -> Option<Directory> {
    database::get_all_directories(conn)
        .ok()
        .and_then(|dirs| dirs.into_iter().find(|d| d.dir_type == "workspace"))
}

/// 打开 Workspace 文件夹
#[tauri::command]
pub fn pdflibrary_open_workspace_folder(
    state: State<Mutex<PdfLibraryState>>,
) -> Result<(), String> {
    let state_guard = state.lock().unwrap();
    let conn = state_guard.get_connection()?;
    
    // 从数据库获取 workspace 路径
    let ws = get_workspace_directory(&conn)
        .ok_or("未配置 Workspace 目录")?;
    
    let workspace_path = std::path::Path::new(&ws.path);
    file_ops::show_folder(workspace_path)
}

/// 重新检查所有文件是否存在，并标记缺失
#[tauri::command]
pub fn pdflibrary_rescan_files(
    state: State<Mutex<PdfLibraryState>>,
) -> Result<serde_json::Value, String> {
    let state_guard = state.lock().unwrap();
    let conn = state_guard.get_connection()?;

    let books = database::get_all_books(&conn).map_err(|e| e.to_string())?;
    let mut missing = 0usize;
    let mut ok = 0usize;

    for book in books {
        let path = Path::new(&book.filepath);
        let exists = path.exists();
        database::update_book_missing(&conn, book.id, !exists).map_err(|e| e.to_string())?;
        if exists {
            ok += 1;
        } else {
            missing += 1;
        }
    }

    Ok(serde_json::json!({
        "ok": ok,
        "missing": missing,
    }))
}

/// 尝试重新关联缺失文件
#[tauri::command]
pub fn pdflibrary_relink_book(
    state: State<Mutex<PdfLibraryState>>,
    book_id: i32,
    new_path: String,
    force: Option<bool>,
) -> Result<RelinkResult, String> {
    let force = force.unwrap_or(false);
    let state_guard = state.lock().unwrap();
    let conn = state_guard.get_connection()?;

    let book = database::get_book_by_id(&conn, book_id)
        .map_err(|e| e.to_string())?
        .ok_or("书籍不存在")?;

    let candidate = Path::new(&new_path);
    if !candidate.exists() {
        return Err("选定的文件不存在".to_string());
    }

    let identity = file_ops::get_file_identity(candidate)?;
    let filename_matches = candidate
        .file_name()
        .and_then(|s| s.to_str())
        .map(|s| s.eq_ignore_ascii_case(&book.filename))
        .unwrap_or(false);
    let size_matches = identity.file_size == book.file_size;
    let id_matches = identity.volume_id == book.volume_id && identity.file_index == book.file_index;

    let mut confidence = "mismatch".to_string();
    let mut needs_confirmation = false;
    let mut updated = false;
    let mut suggest_move = false;

    if id_matches && size_matches {
        confidence = "id".to_string();
        updated = true;
    } else if filename_matches && size_matches {
        confidence = "name_size".to_string();
        if force {
            updated = true;
        } else {
            needs_confirmation = true;
        }
    } else {
        confidence = "mismatch".to_string();
        if force {
            updated = true;
        } else {
            needs_confirmation = true;
        }
    }

    if updated {
        database::update_book_path_and_identity(
            &conn,
            book_id,
            &new_path,
            identity.volume_id,
            identity.file_index,
            identity.file_size,
        ).map_err(|e| e.to_string())?;

        // 如果新路径不在 workspace 中，且书籍是托管文件，提示可移动回库
        if let Some(ws) = get_workspace_directory(&conn) {
            let in_workspace = Path::new(&new_path).starts_with(Path::new(&ws.path));
            if !in_workspace && book.is_managed {
                suggest_move = true;
            } else if in_workspace {
                let _ = database::update_book_directory(&conn, book_id, ws.id);
            }
        }

        return Ok(RelinkResult {
            updated: true,
            confidence,
            needs_confirmation: false,
            suggest_move,
            new_path: Some(new_path),
        });
    }

    Ok(RelinkResult {
        updated: false,
        confidence,
        needs_confirmation,
        suggest_move,
        new_path: None,
    })
}

/// 将文件移动/复制到 Workspace 并更新路径
#[tauri::command]
pub fn pdflibrary_move_book_to_workspace(
    state: State<Mutex<PdfLibraryState>>,
    book_id: i32,
) -> Result<String, String> {
    use std::fs;

    let state_guard = state.lock().unwrap();
    let conn = state_guard.get_connection()?;
    let book = database::get_book_by_id(&conn, book_id)
        .map_err(|e| e.to_string())?
        .ok_or("书籍不存在")?;

    let ws = get_workspace_directory(&conn).ok_or("未配置 Workspace 目录")?;
    let filename = Path::new(&book.filepath)
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or("无法获取文件名")?;

    let mut target = PathBuf::from(&ws.path).join(filename);
    // 冲突时追加序号
    if target.exists() {
        let stem = Path::new(filename)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or(filename);
        let ext = Path::new(filename)
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("pdf");
        let mut counter = 1;
        while target.exists() {
            let new_name = format!("{}_{}.{}", stem, counter, ext);
            target = PathBuf::from(&ws.path).join(new_name);
            counter += 1;
        }
    }

    fs::create_dir_all(target.parent().ok_or("无效的 Workspace 路径")?)
        .map_err(|e| e.to_string())?;

    // 尝试重命名，失败则复制
    if let Err(rename_err) = fs::rename(&book.filepath, &target) {
        fs::copy(&book.filepath, &target)
            .map_err(|e| format!("复制失败: {}", e))?;
        fs::remove_file(&book.filepath)
            .map_err(|e| format!("删除源文件失败: {}", e))?;
        println!("[PDFLibrary] rename 失败，已使用复制: {}", rename_err);
    }

    let identity = file_ops::get_file_identity(&target)?;

    database::update_book_directory(&conn, book_id, ws.id).map_err(|e| e.to_string())?;
    database::update_book_path_and_identity(
        &conn,
        book_id,
        target.to_string_lossy().as_ref(),
        identity.volume_id,
        identity.file_index,
        identity.file_size,
    ).map_err(|e| e.to_string())?;

    Ok(target.to_string_lossy().to_string())
}

/// 移除数据库中所有已丢失的文件记录（文件不存在）
#[tauri::command]
pub fn pdflibrary_remove_missing_files(
    state: State<Mutex<PdfLibraryState>>,
) -> Result<serde_json::Value, String> {
    let state_guard = state.lock().unwrap();
    let conn = state_guard.get_connection()?;

    let books = database::get_all_books(&conn).map_err(|e| e.to_string())?;
    let mut removed = 0usize;

    for book in books {
        let path = Path::new(&book.filepath);
        if !path.exists() {
            // 仅移除记录，不尝试删除文件
            if let Err(e) = database::delete_book(&conn, book.id) {
                eprintln!("[PDFLibrary] 删除缺失记录失败 (id={}): {}", book.id, e);
            } else {
                removed += 1;
            }
        }
    }

    Ok(serde_json::json!({
        "removed": removed,
    }))
}

// ==================== Inbox 监控命令 ====================

#[tauri::command]
pub fn pdflibrary_start_inbox_watcher(
    app_handle: tauri::AppHandle,
    state: State<Mutex<PdfLibraryState>>,
    inbox_path: String,
    workspace_path: String,
) -> Result<(), String> {
    let mut state_guard = state.lock().unwrap();
    
    // 停止旧的 watcher
    if let Ok(watcher_opt) = state_guard.inbox_watcher.get_mut() {
        *watcher_opt = None;
    }
    
    let inbox = PathBuf::from(&inbox_path);
    let workspace = PathBuf::from(&workspace_path);
    
    let watcher = InboxWatcher::start(app_handle, inbox, workspace)?;
    
    if let Ok(watcher_opt) = state_guard.inbox_watcher.get_mut() {
        *watcher_opt = Some(watcher);
    }
    
    Ok(())
}

#[tauri::command]
pub fn pdflibrary_stop_inbox_watcher(
    state: State<Mutex<PdfLibraryState>>,
) -> Result<(), String> {
    let mut state_guard = state.lock().unwrap();
    if let Ok(watcher_opt) = state_guard.inbox_watcher.get_mut() {
        *watcher_opt = None;
    }
    Ok(())
}

#[tauri::command]
pub fn pdflibrary_set_workspace_path(
    app_handle: tauri::AppHandle,
    state: State<Mutex<PdfLibraryState>>,
    path: String,
) -> Result<Directory, String> {
    // 1. 初始化物理文件夹结构
    let workspace_path = Path::new(&path);
    if !workspace_path.exists() {
        return Err("所选路径不存在".to_string());
    }

    // 创建 Inbox 目录
    let inbox_path = workspace_path.join("Inbox");
    if !inbox_path.exists() {
        std::fs::create_dir_all(&inbox_path)
            .map_err(|e| format!("无法创建 Inbox 目录: {}", e))?;
    }

    // 2. 更新数据库
    let mut state_guard = state.lock().unwrap();
    let conn = state_guard.get_connection()?;
    
    let dirs = database::get_all_directories(&conn).map_err(|e| e.to_string())?;
    let workspace = dirs.into_iter().find(|d| d.dir_type == "workspace");
    
    let dir_id = if let Some(ws) = workspace {
        database::update_directory_path(&conn, ws.id, &path).map_err(|e| e.to_string())?;
        ws.id
    } else {
        database::add_directory(&conn, &path, "workspace", "My Library")
            .map_err(|e| e.to_string())?
    };
    
    // 3. 启动/重启 Watcher
    // 停止旧的 watcher
    if let Ok(watcher_opt) = state_guard.inbox_watcher.get_mut() {
        *watcher_opt = None;
    }
    
    let watcher = InboxWatcher::start(
        app_handle, 
        inbox_path.clone(), 
        workspace_path.to_path_buf()
    )?;
    
    if let Ok(watcher_opt) = state_guard.inbox_watcher.get_mut() {
        *watcher_opt = Some(watcher);
    }
    
    Ok(Directory {
        id: dir_id,
        path,
        dir_type: "workspace".to_string(),
        name: "My Library".to_string(),
        is_monitoring: true,
    })
}
