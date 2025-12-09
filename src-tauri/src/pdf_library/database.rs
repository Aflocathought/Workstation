// src-tauri/src/pdf_library/database.rs

use rusqlite::{Connection, Result, params};
use std::path::Path;
use chrono::Utc;

use super::{Book, Tag, Directory};

/// 初始化数据库并返回连接
pub fn init_db(db_path: &Path) -> Result<Connection> {
    let conn = Connection::open(db_path)?;
    
    // 开启 WAL 模式（使用 execute_batch 避免返回值问题）
    conn.execute_batch(
        "PRAGMA journal_mode=WAL;
         PRAGMA synchronous=NORMAL;
         PRAGMA foreign_keys=ON;"
    )?;
    
    // 创建表
    create_tables(&conn)?;
    
    Ok(conn)
}

/// 仅初始化数据库结构（不返回连接）
pub fn ensure_schema(db_path: &Path) -> Result<()> {
    let conn = Connection::open(db_path)?;
    conn.execute_batch(
        "PRAGMA journal_mode=WAL;
         PRAGMA synchronous=NORMAL;
         PRAGMA foreign_keys=ON;"
    )?;
    create_tables(&conn)?;
    Ok(())
}

/// 创建所有表
fn create_tables(conn: &Connection) -> Result<()> {
    // 目录表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS directories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            path TEXT NOT NULL UNIQUE,
            type TEXT NOT NULL CHECK(type IN ('workspace', 'external')),
            name TEXT NOT NULL,
            is_monitoring INTEGER NOT NULL DEFAULT 1
        )",
        [],
    )?;
    
    // 书籍表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS books (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            filename TEXT NOT NULL,
            filepath TEXT NOT NULL UNIQUE,
            directory_id INTEGER NOT NULL,
            is_managed INTEGER NOT NULL DEFAULT 1,
            
            volume_id INTEGER NOT NULL,
            file_index INTEGER NOT NULL,
            file_size INTEGER NOT NULL,
            
            author TEXT,
            page_count INTEGER NOT NULL DEFAULT 0,
            cover_image TEXT,

            import_date TEXT NOT NULL,
            modified_date TEXT NOT NULL,

            is_missing INTEGER NOT NULL DEFAULT 0,

            FOREIGN KEY(directory_id) REFERENCES directories(id) ON DELETE CASCADE
        )",
        [],
    )?;

    // 迁移：为旧表补充 is_missing 列（如果不存在）。忽略已存在时报错。
    let _ = conn.execute(
        "ALTER TABLE books ADD COLUMN is_missing INTEGER NOT NULL DEFAULT 0",
        [],
    );
    
    // 索引
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_books_directory ON books(directory_id)",
        [],
    )?;
    
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_books_file_identity ON books(volume_id, file_index)",
        [],
    )?;
    
    // 标签表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            color TEXT,
            parent_id INTEGER,
            FOREIGN KEY(parent_id) REFERENCES tags(id) ON DELETE CASCADE
        )",
        [],
    )?;
    
    // 书籍-标签关联表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS book_tags (
            book_id INTEGER NOT NULL,
            tag_id INTEGER NOT NULL,
            PRIMARY KEY (book_id, tag_id),
            FOREIGN KEY(book_id) REFERENCES books(id) ON DELETE CASCADE,
            FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE
        )",
        [],
    )?;
    
    Ok(())
}

/// 备份数据库
pub fn backup_db(source: &Path, backup_dir: &Path) -> Result<String, String> {
    use std::fs;
    
    // 创建备份目录
    fs::create_dir_all(backup_dir).map_err(|e| e.to_string())?;
    
    // 生成备份文件名
    let timestamp = Utc::now().format("%Y%m%d_%H%M%S");
    let backup_name = format!("library_backup_{}.db", timestamp);
    let backup_path = backup_dir.join(&backup_name);
    
    // 复制文件
    fs::copy(source, &backup_path).map_err(|e| e.to_string())?;
    
    Ok(backup_path.to_string_lossy().to_string())
}

/// 插入书籍
pub fn insert_book(
    conn: &Connection,
    title: &str,
    filename: &str,
    filepath: &str,
    directory_id: i32,
    is_managed: bool,
    volume_id: u64,
    file_index: u64,
    file_size: u64,
    author: Option<&str>,
    page_count: i32,
    cover_image: Option<&str>,
) -> Result<i32> {
    let now = Utc::now().to_rfc3339();
    
    conn.execute(
        "INSERT INTO books (
            title, filename, filepath, directory_id, is_managed,
            volume_id, file_index, file_size,
            author, page_count, cover_image,
            import_date, modified_date
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
        params![
            title,
            filename,
            filepath,
            directory_id,
            is_managed as i32,
            volume_id as i64,
            file_index as i64,
            file_size as i64,
            author,
            page_count,
            cover_image,
            now,
            now,
        ],
    )?;
    
    Ok(conn.last_insert_rowid() as i32)
}

/// 获取所有书籍
pub fn get_all_books(conn: &Connection) -> Result<Vec<Book>> {
    let mut stmt = conn.prepare(
        "SELECT id, title, filename, filepath, directory_id, is_managed,
            volume_id, file_index, file_size,
            author, page_count, cover_image,
            import_date, modified_date, is_missing
         FROM books
         ORDER BY import_date DESC"
    )?;
    
    let books = stmt.query_map([], |row| {
        Ok(Book {
            id: row.get(0)?,
            title: row.get(1)?,
            filename: row.get(2)?,
            filepath: row.get(3)?,
            directory_id: row.get(4)?,
            is_managed: row.get::<_, i32>(5)? != 0,
            volume_id: row.get::<_, i64>(6)? as u64,
            file_index: row.get::<_, i64>(7)? as u64,
            file_size: row.get::<_, i64>(8)? as u64,
            author: row.get(9)?,
            page_count: row.get(10)?,
            cover_image: row.get(11)?,
            import_date: row.get(12)?,
            modified_date: row.get(13)?,
            tags: None,
            is_missing: row.get::<_, i32>(14)? != 0,
        })
    })?
    .collect::<Result<Vec<_>>>()?;
    
    Ok(books)
}

/// 更新书籍标题
pub fn update_book_title(conn: &Connection, id: i32, title: &str) -> Result<()> {
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE books SET title = ?1, modified_date = ?2 WHERE id = ?3",
        params![title, now, id],
    )?;
    Ok(())
}

/// 更新书籍路径
pub fn update_book_path(conn: &Connection, id: i32, filepath: &str) -> Result<()> {
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE books SET filepath = ?1, modified_date = ?2, is_missing = 0 WHERE id = ?3",
        params![filepath, now, id],
    )?;
    Ok(())
}

/// 更新书籍路径与文件身份信息
pub fn update_book_path_and_identity(
    conn: &Connection,
    id: i32,
    filepath: &str,
    volume_id: u64,
    file_index: u64,
    file_size: u64,
) -> Result<()> {
    let now = Utc::now().to_rfc3339();
    let filename = Path::new(filepath)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("");

    conn.execute(
        "UPDATE books SET filepath = ?1, filename = ?2, volume_id = ?3, file_index = ?4, file_size = ?5, modified_date = ?6, is_missing = 0 WHERE id = ?7",
        params![
            filepath,
            filename,
            volume_id as i64,
            file_index as i64,
            file_size as i64,
            now,
            id,
        ],
    )?;
    Ok(())
}

/// 标记书籍是否缺失
pub fn update_book_missing(conn: &Connection, id: i32, is_missing: bool) -> Result<()> {
    conn.execute(
        "UPDATE books SET is_missing = ?1 WHERE id = ?2",
        params![is_missing as i32, id],
    )?;
    Ok(())
}

/// 按 ID 获取书籍
pub fn get_book_by_id(conn: &Connection, id: i32) -> Result<Option<Book>> {
    let mut stmt = conn.prepare(
        "SELECT id, title, filename, filepath, directory_id, is_managed,
                volume_id, file_index, file_size,
                author, page_count, cover_image,
                import_date, modified_date, is_missing
         FROM books WHERE id = ?1"
    )?;

    let mut rows = stmt.query(params![id])?;
    if let Some(row) = rows.next()? {
        Ok(Some(Book {
            id: row.get(0)?,
            title: row.get(1)?,
            filename: row.get(2)?,
            filepath: row.get(3)?,
            directory_id: row.get(4)?,
            is_managed: row.get::<_, i32>(5)? != 0,
            volume_id: row.get::<_, i64>(6)? as u64,
            file_index: row.get::<_, i64>(7)? as u64,
            file_size: row.get::<_, i64>(8)? as u64,
            author: row.get(9)?,
            page_count: row.get(10)?,
            cover_image: row.get(11)?,
            import_date: row.get(12)?,
            modified_date: row.get(13)?,
            tags: None,
            is_missing: row.get::<_, i32>(14)? != 0,
        }))
    } else {
        Ok(None)
    }
}

/// 更新书籍的元数据字段（作者、页数）
pub fn update_book_metadata(
    conn: &Connection,
    id: i32,
    author: Option<&str>,
    page_count: i32,
) -> Result<()> {
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE books SET author = ?1, page_count = ?2, modified_date = ?3 WHERE id = ?4",
        params![author, page_count, now, id],
    )?;
    Ok(())
}

/// 更新书籍目录归属
pub fn update_book_directory(conn: &Connection, id: i32, directory_id: i32) -> Result<()> {
    conn.execute(
        "UPDATE books SET directory_id = ?1 WHERE id = ?2",
        params![directory_id, id],
    )?;
    Ok(())
}

/// 删除书籍
pub fn delete_book(conn: &Connection, id: i32) -> Result<()> {
    conn.execute("DELETE FROM books WHERE id = ?1", params![id])?;
    Ok(())
}

/// 获取所有标签
pub fn get_all_tags(conn: &Connection) -> Result<Vec<Tag>> {
    let mut stmt = conn.prepare(
        "SELECT t.id, t.name, t.color, t.parent_id,
                (SELECT COUNT(*) FROM book_tags WHERE tag_id = t.id) as book_count
         FROM tags t
         ORDER BY t.name"
    )?;
    
    let tags = stmt.query_map([], |row| {
        Ok(Tag {
            id: row.get(0)?,
            name: row.get(1)?,
            color: row.get(2)?,
            parent_id: row.get(3)?,
            book_count: Some(row.get(4)?),
        })
    })?
    .collect::<Result<Vec<_>>>()?;
    
    Ok(tags)
}

/// 创建标签
pub fn create_tag(
    conn: &Connection,
    name: &str,
    color: Option<&str>,
    parent_id: Option<i32>,
) -> Result<i32> {
    conn.execute(
        "INSERT INTO tags (name, color, parent_id) VALUES (?1, ?2, ?3)",
        params![name, color, parent_id],
    )?;
    Ok(conn.last_insert_rowid() as i32)
}

/// 获取书籍的标签
pub fn get_book_tags(conn: &Connection, book_id: i32) -> Result<Vec<Tag>> {
    let mut stmt = conn.prepare(
        "SELECT t.id, t.name, t.color, t.parent_id
         FROM tags t
         INNER JOIN book_tags bt ON t.id = bt.tag_id
         WHERE bt.book_id = ?1
         ORDER BY t.name"
    )?;
    
    let tags = stmt.query_map(params![book_id], |row| {
        Ok(Tag {
            id: row.get(0)?,
            name: row.get(1)?,
            color: row.get(2)?,
            parent_id: row.get(3)?,
            book_count: None,
        })
    })?
    .collect::<Result<Vec<_>>>()?;
    
    Ok(tags)
}

/// 添加书籍标签
pub fn add_book_tag(conn: &Connection, book_id: i32, tag_id: i32) -> Result<()> {
    conn.execute(
        "INSERT OR IGNORE INTO book_tags (book_id, tag_id) VALUES (?1, ?2)",
        params![book_id, tag_id],
    )?;
    Ok(())
}

/// 移除书籍标签
pub fn remove_book_tag(conn: &Connection, book_id: i32, tag_id: i32) -> Result<()> {
    conn.execute(
        "DELETE FROM book_tags WHERE book_id = ?1 AND tag_id = ?2",
        params![book_id, tag_id],
    )?;
    Ok(())
}

/// 获取所有目录
pub fn get_all_directories(conn: &Connection) -> Result<Vec<Directory>> {
    let mut stmt = conn.prepare(
        "SELECT id, path, type, name, is_monitoring FROM directories"
    )?;
    
    let dirs = stmt.query_map([], |row| {
        Ok(Directory {
            id: row.get(0)?,
            path: row.get(1)?,
            dir_type: row.get(2)?,
            name: row.get(3)?,
            is_monitoring: row.get::<_, i32>(4)? != 0,
        })
    })?
    .collect::<Result<Vec<_>>>()?;
    
    Ok(dirs)
}

/// 添加目录
pub fn add_directory(
    conn: &Connection,
    path: &str,
    dir_type: &str,
    name: &str,
) -> Result<i32> {
    conn.execute(
        "INSERT INTO directories (path, type, name, is_monitoring) VALUES (?1, ?2, ?3, 1)",
        params![path, dir_type, name],
    )?;
    Ok(conn.last_insert_rowid() as i32)
}

/// 更新目录路径
pub fn update_directory_path(conn: &Connection, id: i32, new_path: &str) -> Result<()> {
    conn.execute(
        "UPDATE directories SET path = ?1 WHERE id = ?2",
        params![new_path, id],
    )?;
    Ok(())
}
