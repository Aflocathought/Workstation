use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};
use tauri::State;

const ROWS_PER_PAGE: usize = 200_000;
const THUMBNAIL_SAMPLE_SIZE: usize = 1000;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PageInfo {
    pub page_index: usize,
    pub start_row: usize,
    pub end_row: usize,
    pub row_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaginationState {
    pub total_rows: usize,
    pub total_pages: usize,
    pub current_page: usize,
    pub pages: Vec<PageInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CsvRecord {
    #[serde(flatten)]
    pub fields: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedPage {
    pub headers: Vec<String>,
    pub rows: Vec<CsvRecord>,
    pub skipped_rows: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThumbnailPoint {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThumbnailData {
    pub page_index: usize,
    pub points: Vec<ThumbnailPoint>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoadProgress {
    pub current: usize,
    pub total: usize,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct DatascopeProgress {
    pub current: u64,
    pub total: u64,
    pub message: String,
}

// CSV 缓存管理器
pub struct CsvCacheManager {
    // 缓存文件内容
    file_cache: Arc<Mutex<Option<String>>>,
    // 缓存页数据
    page_cache: Arc<Mutex<HashMap<usize, ParsedPage>>>,
    // 缓存缩略图
    thumbnail_cache: Arc<Mutex<HashMap<usize, ThumbnailData>>>,
    // 当前文件路径
    current_file: Arc<Mutex<Option<PathBuf>>>,
    // 分隔符
    delimiter: Arc<Mutex<char>>,
}

impl Default for CsvCacheManager {
    fn default() -> Self {
        Self {
            file_cache: Arc::new(Mutex::new(None)),
            page_cache: Arc::new(Mutex::new(HashMap::new())),
            thumbnail_cache: Arc::new(Mutex::new(HashMap::new())),
            current_file: Arc::new(Mutex::new(None)),
            delimiter: Arc::new(Mutex::new(',')),
        }
    }
}

impl CsvCacheManager {
    pub fn clear(&self) {
        if let Ok(mut cache) = self.file_cache.lock() {
            *cache = None;
        }
        if let Ok(mut cache) = self.page_cache.lock() {
            cache.clear();
        }
        if let Ok(mut cache) = self.thumbnail_cache.lock() {
            cache.clear();
        }
        if let Ok(mut file) = self.current_file.lock() {
            *file = None;
        }
    }

    pub fn set_file_content(&self, content: String, path: PathBuf, delimiter: char) {
        if let Ok(mut cache) = self.file_cache.lock() {
            *cache = Some(content);
        }
        if let Ok(mut file) = self.current_file.lock() {
            *file = Some(path);
        }
        if let Ok(mut delim) = self.delimiter.lock() {
            *delim = delimiter;
        }
        // 清空页面缓存
        if let Ok(mut cache) = self.page_cache.lock() {
            cache.clear();
        }
        if let Ok(mut cache) = self.thumbnail_cache.lock() {
            cache.clear();
        }
    }

    pub fn get_file_content(&self) -> Option<String> {
        self.file_cache.lock().ok()?.clone()
    }

    pub fn get_delimiter(&self) -> char {
        self.delimiter.lock().map(|d| *d).unwrap_or(',')
    }

    pub fn cache_page(&self, page_index: usize, data: ParsedPage) {
        if let Ok(mut cache) = self.page_cache.lock() {
            cache.insert(page_index, data);
        }
    }

    pub fn get_cached_page(&self, page_index: usize) -> Option<ParsedPage> {
        self.page_cache.lock().ok()?.get(&page_index).cloned()
    }

    pub fn cache_thumbnail(&self, page_index: usize, data: ThumbnailData) {
        if let Ok(mut cache) = self.thumbnail_cache.lock() {
            cache.insert(page_index, data);
        }
    }

    pub fn get_cached_thumbnail(&self, page_index: usize) -> Option<ThumbnailData> {
        self.thumbnail_cache.lock().ok()?.get(&page_index).cloned()
    }
}

/// 检测分隔符
fn detect_delimiter(content: &str) -> char {
    let sample = &content[..content.len().min(2000)];
    let first_line = sample.lines().next().unwrap_or(sample);
    
    let candidates = [(',', first_line.matches(',').count()),
                      ('\t', first_line.matches('\t').count()),
                      (';', first_line.matches(';').count()),
                      ('|', first_line.matches('|').count())];
    
    candidates.iter()
        .max_by_key(|(_, count)| count)
        .map(|(delim, _)| *delim)
        .unwrap_or(',')
}

/// 快速统计行数
fn quick_count_rows(content: &str) -> usize {
    let mut row_count: usize = 0;
    let mut in_quotes = false;

    for ch in content.chars() {
        if ch == '"' {
            in_quotes = !in_quotes;
        } else if ch == '\n' && !in_quotes {
            row_count += 1;
        }
    }

    // 如果最后没有换行符，最后一行也要算
    if !content.is_empty() && !content.ends_with('\n') {
        row_count += 1;
    }

    // 减去 header 行
    row_count.saturating_sub(1)
}

/// 解析 CSV 的指定页
fn parse_csv_page(
    content: &str,
    delimiter: char,
    start_row: usize,
    end_row: usize,
) -> Result<ParsedPage, String> {
    let mut reader = csv::ReaderBuilder::new()
        .delimiter(delimiter as u8)
        .from_reader(content.as_bytes());

    let headers = reader
        .headers()
        .map_err(|e| format!("Failed to read headers: {}", e))?
        .iter()
        .map(|s| s.to_string())
        .collect::<Vec<_>>();

    let mut rows = Vec::new();
    let mut skipped_rows = 0;
    let mut current_row = 0;

    for result in reader.records() {
        match result {
            Ok(record) => {
                if current_row >= start_row && current_row < end_row {
                    let mut fields = HashMap::new();
                    for (i, field) in record.iter().enumerate() {
                        if let Some(header) = headers.get(i) {
                            fields.insert(header.clone(), field.to_string());
                        }
                    }
                    rows.push(CsvRecord { fields });
                } else if current_row >= end_row {
                    break;
                }
                current_row += 1;
            }
            Err(_) => {
                skipped_rows += 1;
            }
        }
    }

    Ok(ParsedPage {
        headers,
        rows,
        skipped_rows,
    })
}

fn parse_csv_page_with_progress(
    content: &str,
    delimiter: char,
    start_row: usize,
    end_row: usize,
    progress: &dyn Fn(u64, u64),
) -> Result<ParsedPage, String> {
    let mut reader = csv::ReaderBuilder::new()
        .delimiter(delimiter as u8)
        .from_reader(content.as_bytes());

    let headers = reader
        .headers()
        .map_err(|e| format!("Failed to read headers: {}", e))?
        .iter()
        .map(|s| s.to_string())
        .collect::<Vec<_>>();

    let total = end_row.saturating_sub(start_row) as u64;
    progress(0, total);

    let mut rows = Vec::new();
    let mut skipped_rows = 0;
    let mut current_row = 0;
    let mut added: u64 = 0;

    for result in reader.records() {
        match result {
            Ok(record) => {
                if current_row >= start_row && current_row < end_row {
                    let mut fields = HashMap::new();
                    for (i, field) in record.iter().enumerate() {
                        if let Some(header) = headers.get(i) {
                            fields.insert(header.clone(), field.to_string());
                        }
                    }
                    rows.push(CsvRecord { fields });
                    added += 1;
                    if added % 2000 == 0 {
                        progress(added, total);
                    }
                } else if current_row >= end_row {
                    break;
                }
                current_row += 1;
            }
            Err(_) => {
                skipped_rows += 1;
            }
        }
    }

    progress(added, total);

    Ok(ParsedPage {
        headers,
        rows,
        skipped_rows,
    })
}

/// 生成缩略图采样数据
fn generate_thumbnail(
    content: &str,
    delimiter: char,
    page_info: &PageInfo,
) -> Result<ThumbnailData, String> {
    let parsed = parse_csv_page(
        content,
        delimiter,
        page_info.start_row,
        page_info.end_row,
    )?;

    if parsed.rows.is_empty() {
        return Ok(ThumbnailData {
            page_index: page_info.page_index,
            points: vec![],
        });
    }

    // 找到第一个数值列
    let numeric_col = find_first_numeric_column(&parsed.headers, &parsed.rows);
    
    if numeric_col.is_none() {
        return Ok(ThumbnailData {
            page_index: page_info.page_index,
            points: vec![],
        });
    }

    let col_name = numeric_col.unwrap();
    let step = (parsed.rows.len() / THUMBNAIL_SAMPLE_SIZE).max(1);

    let mut points = Vec::new();
    for (i, row) in parsed.rows.iter().enumerate().step_by(step) {
        if let Some(value_str) = row.fields.get(&col_name) {
            if let Ok(value) = value_str.trim().parse::<f64>() {
                points.push(ThumbnailPoint {
                    x: (page_info.start_row + i) as f64,
                    y: value,
                });
            }
        }
    }

    Ok(ThumbnailData {
        page_index: page_info.page_index,
        points,
    })
}

/// 找到第一个数值列
fn find_first_numeric_column(headers: &[String], rows: &[CsvRecord]) -> Option<String> {
    let sample_size = rows.len().min(100);

    for header in headers {
        let mut numeric_count = 0;
        let mut non_empty = 0;

        for row in rows.iter().take(sample_size) {
            if let Some(value) = row.fields.get(header) {
                let trimmed = value.trim();
                if !trimmed.is_empty() {
                    non_empty += 1;
                    if trimmed.parse::<f64>().is_ok() {
                        numeric_count += 1;
                    }
                }
            }
        }

        if non_empty > 0 && (numeric_count as f64 / non_empty as f64) >= 0.7 {
            return Some(header.clone());
        }
    }

    None
}

/// 计算分页信息
fn calculate_pagination(total_rows: usize) -> PaginationState {
    let total_pages = (total_rows + ROWS_PER_PAGE - 1) / ROWS_PER_PAGE;
    let mut pages = Vec::new();

    for i in 0..total_pages {
        let start_row = i * ROWS_PER_PAGE;
        let end_row = (start_row + ROWS_PER_PAGE).min(total_rows);
        pages.push(PageInfo {
            page_index: i,
            start_row,
            end_row,
            row_count: end_row - start_row,
        });
    }

    PaginationState {
        total_rows,
        total_pages,
        current_page: 0,
        pages,
    }
}

// Tauri 命令

#[tauri::command]
pub async fn csv_load_file(
    path: String,
    cache: State<'_, CsvCacheManager>,
) -> Result<(String, usize, char), String> {
    println!("🚀 [Backend] csv_load_file 开始, 文件: {}", path);
    
    let path_clone = path.clone();
    
    // 在独立线程中读取文件
    println!("📁 [Backend] 读取文件中...");
    let content = tokio::task::spawn_blocking(move || {
        match std::fs::read_to_string(&path_clone) {
            Ok(content) => {
                println!("✅ [Backend] 文件读取成功, 大小: {} bytes", content.len());
                Ok(content)
            }
            Err(e) => {
                println!("❌ [Backend] 文件读取失败: {}", e);
                Err(format!("Failed to read file: {}", e))
            }
        }
    })
    .await
    .map_err(|e| {
        println!("❌ [Backend] Task join error: {}", e);
        format!("Task join error: {}", e)
    })??;

    println!("🔍 [Backend] 检测分隔符...");
    let delimiter = detect_delimiter(&content);
    println!("✅ [Backend] 分隔符: '{}'", delimiter);
    
    println!("📊 [Backend] 统计行数...");
    let total_rows = quick_count_rows(&content);
    println!("✅ [Backend] 总行数: {}", total_rows);

    println!("💾 [Backend] 缓存文件内容...");
    cache.set_file_content(content.clone(), PathBuf::from(&path), delimiter);
    println!("✅ [Backend] csv_load_file 完成");

    Ok((path, total_rows, delimiter))
}

#[tauri::command]
pub async fn csv_get_pagination(
    total_rows: usize,
) -> Result<PaginationState, String> {
    Ok(calculate_pagination(total_rows))
}

#[tauri::command]
pub async fn csv_load_page(
    page_index: usize,
    page_info: PageInfo,
    app_handle: AppHandle,
    cache: State<'_, CsvCacheManager>,
) -> Result<ParsedPage, String> {
    println!("📄 [Backend] csv_load_page 开始, 页码: {}, 行范围: {}-{}", 
             page_index, page_info.start_row, page_info.end_row);
    
    // 检查缓存
    if let Some(cached) = cache.get_cached_page(page_index) {
        println!("✅ [Backend] 使用缓存的页面数据");
        let _ = app_handle.emit(
            "datascope:progress",
            DatascopeProgress {
                current: cached.rows.len() as u64,
                total: cached.rows.len() as u64,
                message: "已从缓存加载".to_string(),
            },
        );
        return Ok(cached);
    }

    println!("📦 [Backend] 从缓存获取文件内容...");
    let content = cache.get_file_content()
        .ok_or_else(|| {
            println!("❌ [Backend] 错误: 没有加载的文件");
            "No file loaded".to_string()
        })?;
    let delimiter = cache.get_delimiter();
    
    println!("📊 [Backend] 文件大小: {} bytes, 分隔符: '{}'", content.len(), delimiter);

    // 在独立线程中解析
    println!("🔄 [Backend] 开始解析页面...");
    let total = page_info.row_count as u64;
    let _ = app_handle.emit(
        "datascope:progress",
        DatascopeProgress {
            current: 0,
            total,
            message: format!("解析 CSV 第 {} 页...", page_index + 1),
        },
    );

    let app_handle2 = app_handle.clone();
    let parsed = tokio::task::spawn_blocking(move || {
        let progress = |current: u64, total: u64| {
            let _ = app_handle2.emit(
                "datascope:progress",
                DatascopeProgress {
                    current,
                    total,
                    message: "解析中...".to_string(),
                },
            );
        };
        match parse_csv_page_with_progress(
            &content,
            delimiter,
            page_info.start_row,
            page_info.end_row,
            &progress,
        ) {
            Ok(result) => {
                println!("✅ [Backend] 解析完成: {} 列, {} 行", 
                         result.headers.len(), result.rows.len());
                let _ = app_handle2.emit(
                    "datascope:progress",
                    DatascopeProgress {
                        current: result.rows.len() as u64,
                        total,
                        message: "加载完成".to_string(),
                    },
                );
                Ok(result)
            }
            Err(e) => {
                println!("❌ [Backend] 解析失败: {}", e);
                Err(e)
            }
        }
    })
    .await
    .map_err(|e| {
        println!("❌ [Backend] Task join error: {}", e);
        format!("Task join error: {}", e)
    })??;

    // 缓存结果
    println!("💾 [Backend] 缓存页面数据...");
    cache.cache_page(page_index, parsed.clone());
    println!("✅ [Backend] csv_load_page 完成");

    Ok(parsed)
}

#[tauri::command]
pub async fn csv_generate_thumbnail(
    page_index: usize,
    page_info: PageInfo,
    cache: State<'_, CsvCacheManager>,
) -> Result<ThumbnailData, String> {
    // 检查缓存
    if let Some(cached) = cache.get_cached_thumbnail(page_index) {
        return Ok(cached);
    }

    let content = cache.get_file_content()
        .ok_or_else(|| "No file loaded".to_string())?;
    let delimiter = cache.get_delimiter();

    // 在独立线程中生成缩略图
    let thumbnail = tokio::task::spawn_blocking(move || {
        generate_thumbnail(&content, delimiter, &page_info)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))??;

    // 缓存结果
    cache.cache_thumbnail(page_index, thumbnail.clone());

    Ok(thumbnail)
}

#[tauri::command]
pub async fn csv_change_delimiter(
    new_delimiter: char,
    cache: State<'_, CsvCacheManager>,
) -> Result<usize, String> {
    let content = cache.get_file_content()
        .ok_or_else(|| "No file loaded".to_string())?;

    // 更新分隔符
    if let Ok(mut delim) = cache.delimiter.lock() {
        *delim = new_delimiter;
    }

    // 清空缓存
    if let Ok(mut page_cache) = cache.page_cache.lock() {
        page_cache.clear();
    }
    if let Ok(mut thumb_cache) = cache.thumbnail_cache.lock() {
        thumb_cache.clear();
    }

    // 重新统计行数
    let total_rows = tokio::task::spawn_blocking(move || {
        quick_count_rows(&content)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?;

    Ok(total_rows)
}

#[tauri::command]
pub async fn csv_clear_cache(cache: State<'_, CsvCacheManager>) -> Result<(), String> {
    cache.clear();
    Ok(())
}
