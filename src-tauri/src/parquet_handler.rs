use crate::csv_handler::{PageInfo, ThumbnailData, ThumbnailPoint};
use base64::Engine as _;
use parquet2::read::read_metadata;
use polars::lazy::dsl::col;
use polars::prelude::{
    LazyCsvReader, LazyFileListReader, LazyFrame, PolarsError, ScanArgsParquet, SchemaNamesAndDtypes,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::fs::File;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};

const THUMBNAIL_SAMPLE_SIZE: usize = 1000;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParquetColumn {
    pub name: String,
    pub dtype: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParquetOpenResult {
    pub path: String,
    pub total_rows: u64,
    pub columns: Vec<ParquetColumn>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedPage {
    pub headers: Vec<String>,
    pub rows: Vec<HashMap<String, Value>>,
    pub skipped_rows: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct DatascopeProgress {
    pub current: u64,
    pub total: u64,
    pub message: String,
}

// Parquet 缓存管理器：只缓存元数据、页/缩略图结果，不缓存整文件内容
pub struct ParquetCacheManager {
    current_file: Arc<Mutex<Option<PathBuf>>>,
    total_rows: Arc<Mutex<Option<u64>>>,
    columns: Arc<Mutex<Vec<ParquetColumn>>>,
    page_cache: Arc<Mutex<HashMap<String, ParsedPage>>>,
    thumbnail_cache: Arc<Mutex<HashMap<usize, ThumbnailData>>>,
}

impl Default for ParquetCacheManager {
    fn default() -> Self {
        Self {
            current_file: Arc::new(Mutex::new(None)),
            total_rows: Arc::new(Mutex::new(None)),
            columns: Arc::new(Mutex::new(Vec::new())),
            page_cache: Arc::new(Mutex::new(HashMap::new())),
            thumbnail_cache: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

impl ParquetCacheManager {
    pub fn clear(&self) {
        if let Ok(mut f) = self.current_file.lock() {
            *f = None;
        }
        if let Ok(mut t) = self.total_rows.lock() {
            *t = None;
        }
        if let Ok(mut c) = self.columns.lock() {
            c.clear();
        }
        if let Ok(mut pc) = self.page_cache.lock() {
            pc.clear();
        }
        if let Ok(mut tc) = self.thumbnail_cache.lock() {
            tc.clear();
        }
    }

    fn set_dataset(&self, path: PathBuf, total_rows: u64, columns: Vec<ParquetColumn>) {
        if let Ok(mut f) = self.current_file.lock() {
            *f = Some(path);
        }
        if let Ok(mut t) = self.total_rows.lock() {
            *t = Some(total_rows);
        }
        if let Ok(mut c) = self.columns.lock() {
            *c = columns;
        }
        if let Ok(mut pc) = self.page_cache.lock() {
            pc.clear();
        }
        if let Ok(mut tc) = self.thumbnail_cache.lock() {
            tc.clear();
        }
    }

    fn get_path(&self) -> Option<PathBuf> {
        self.current_file.lock().ok()?.clone()
    }

    fn cache_page(&self, key: String, page: ParsedPage) {
        if let Ok(mut pc) = self.page_cache.lock() {
            pc.insert(key, page);
        }
    }

    fn get_cached_page(&self, key: &str) -> Option<ParsedPage> {
        self.page_cache.lock().ok()?.get(key).cloned()
    }

    fn cache_thumbnail(&self, page_index: usize, thumb: ThumbnailData) {
        if let Ok(mut tc) = self.thumbnail_cache.lock() {
            tc.insert(page_index, thumb);
        }
    }

    fn get_cached_thumbnail(&self, page_index: usize) -> Option<ThumbnailData> {
        self.thumbnail_cache.lock().ok()?.get(&page_index).cloned()
    }
}

fn page_cache_key(page_index: usize, page_info: &PageInfo, columns: &[String]) -> String {
    // NOTE: columns 空表示“全列”，否则作为列裁剪的一部分。
    // 为避免顺序影响，排序后拼接。
    let mut cols = columns.to_vec();
    cols.sort();
    let cols_key = if cols.is_empty() {
        "*".to_string()
    } else {
        cols.join("|")
    };

    format!(
        "p={page_index};s={};n={};c={cols_key}",
        page_info.start_row, page_info.row_count
    )
}

fn map_polars_err(err: PolarsError) -> String {
    format!("{err}")
}

fn parquet_total_rows(path: &str) -> Result<u64, String> {
    let mut file = File::open(path).map_err(|e| format!("Failed to open parquet: {e}"))?;
    let metadata = read_metadata(&mut file).map_err(|e| format!("Failed to read parquet metadata: {e}"))?;
    let total: u64 = metadata
        .row_groups
        .iter()
        .map(|rg| rg.num_rows() as u64)
        .sum();
    Ok(total)
}

fn parquet_schema_columns(path: &str) -> Result<Vec<ParquetColumn>, String> {
    // collect_schema 只读 footer 元数据，不会把整文件加载进内存
    let mut lf = LazyFrame::scan_parquet(path, ScanArgsParquet::default()).map_err(map_polars_err)?;
    let schema = lf.collect_schema().map_err(map_polars_err)?;
    let cols = schema
        .iter_names_and_dtypes()
        .map(|(name, dtype)| ParquetColumn {
            name: name.to_string(),
            dtype: dtype.to_string(),
        })
        .collect::<Vec<_>>();
    Ok(cols)
}

fn any_to_json(v: &polars::prelude::AnyValue) -> Value {
    use polars::prelude::{AnyValue, TimeUnit};

    const MAX_SAFE_I64: i64 = 9_007_199_254_740_991; // 2^53 - 1
    const MAX_SAFE_U64: u64 = 9_007_199_254_740_991;

    fn i64_json(x: i64) -> Value {
        if x.abs() <= MAX_SAFE_I64 {
            Value::from(x)
        } else {
            Value::String(x.to_string())
        }
    }

    fn u64_json(x: u64) -> Value {
        if x <= MAX_SAFE_U64 {
            Value::from(x)
        } else {
            Value::String(x.to_string())
        }
    }

    match v {
        AnyValue::Null => Value::Null,
        AnyValue::Boolean(b) => Value::Bool(*b),
        AnyValue::String(s) => Value::String((*s).to_string()),
        AnyValue::StringOwned(s) => Value::String(s.to_string()),

        AnyValue::Int8(x) => Value::from(*x as i64),
        AnyValue::Int16(x) => Value::from(*x as i64),
        AnyValue::Int32(x) => Value::from(*x as i64),
        AnyValue::Int64(x) => i64_json(*x),
        AnyValue::Int128(x) => Value::String(x.to_string()),

        AnyValue::UInt8(x) => Value::from(*x as u64),
        AnyValue::UInt16(x) => Value::from(*x as u64),
        AnyValue::UInt32(x) => Value::from(*x as u64),
        AnyValue::UInt64(x) => u64_json(*x),

        AnyValue::Float32(x) => serde_json::Number::from_f64(*x as f64)
            .map(Value::Number)
            .unwrap_or(Value::Null),
        AnyValue::Float64(x) => serde_json::Number::from_f64(*x)
            .map(Value::Number)
            .unwrap_or(Value::Null),

        AnyValue::Date(days) => Value::String(days.to_string()),

        AnyValue::Time(ns) => Value::String(ns.to_string()),

        AnyValue::Datetime(ts, tu, _) => {
            let (secs, nanos) = match tu {
                TimeUnit::Nanoseconds => (*ts / 1_000_000_000, (*ts % 1_000_000_000) as u32),
                TimeUnit::Microseconds => (*ts / 1_000_000, ((*ts % 1_000_000) * 1000) as u32),
                TimeUnit::Milliseconds => (*ts / 1_000, ((*ts % 1_000) * 1_000_000) as u32),
            };
            if let Some(dt) = chrono::DateTime::<chrono::Utc>::from_timestamp(secs, nanos) {
                Value::String(dt.to_rfc3339_opts(chrono::SecondsFormat::Nanos, true))
            } else {
                Value::String(ts.to_string())
            }
        }

        AnyValue::DatetimeOwned(ts, tu, _) => {
            let (secs, nanos) = match tu {
                TimeUnit::Nanoseconds => (*ts / 1_000_000_000, (*ts % 1_000_000_000) as u32),
                TimeUnit::Microseconds => (*ts / 1_000_000, ((*ts % 1_000_000) * 1000) as u32),
                TimeUnit::Milliseconds => (*ts / 1_000, ((*ts % 1_000) * 1_000_000) as u32),
            };
            if let Some(dt) = chrono::DateTime::<chrono::Utc>::from_timestamp(secs, nanos) {
                Value::String(dt.to_rfc3339_opts(chrono::SecondsFormat::Nanos, true))
            } else {
                Value::String(ts.to_string())
            }
        }

        AnyValue::Duration(v, tu) => Value::String(format!("{v}({tu:?})")),

        AnyValue::List(series) => {
            let mut out = Vec::with_capacity(series.len());
            for av in series.iter() {
                out.push(any_to_json(&av));
            }
            Value::Array(out)
        }

        AnyValue::Struct(_, _, _) => {
            // 通过 into_static 将 borrowed Struct materialize 成 StructOwned(avs, fields)
            let owned = v.clone().into_static();
            if let AnyValue::StructOwned(payload) = owned {
                let (avs, fields) = payload.as_ref();
                let mut map = serde_json::Map::with_capacity(fields.len());
                for (av, field) in avs.iter().zip(fields.iter()) {
                    map.insert(field.name.to_string(), any_to_json(av));
                }
                Value::Object(map)
            } else {
                Value::String(v.to_string())
            }
        }

        AnyValue::StructOwned(payload) => {
            let (avs, fields) = payload.as_ref();
            let mut map = serde_json::Map::with_capacity(fields.len());
            for (av, field) in avs.iter().zip(fields.iter()) {
                map.insert(field.name.to_string(), any_to_json(av));
            }
            Value::Object(map)
        }

        AnyValue::Binary(bytes) => Value::String(base64::engine::general_purpose::STANDARD.encode(bytes)),
        AnyValue::BinaryOwned(bytes) => Value::String(base64::engine::general_purpose::STANDARD.encode(bytes)),

        // Categorical/Enum/Object 等：前端显示为字符串（不影响数值列/图表）
        other => Value::String(other.to_string()),
    }
}

fn df_to_rows(df: &polars::prelude::DataFrame) -> Vec<HashMap<String, Value>> {
    let height = df.height();
    let cols = df.get_columns();

    let mut out = Vec::with_capacity(height);
    for row_idx in 0..height {
        let mut row = HashMap::with_capacity(cols.len());
        for s in cols {
            let name = s.name();
            let av = s.get(row_idx).unwrap_or(polars::prelude::AnyValue::Null);
            row.insert(name.to_string(), any_to_json(&av));
        }
        out.push(row);
    }
    out
}

#[tauri::command]
pub async fn parquet_open_file(
    path: String,
    cache: State<'_, ParquetCacheManager>,
) -> Result<ParquetOpenResult, String> {
    let path_clone = path.clone();

    let total_rows = tokio::task::spawn_blocking(move || parquet_total_rows(&path_clone))
        .await
        .map_err(|e| format!("Task join error: {e}"))??;

    let path_clone = path.clone();
    let columns = tokio::task::spawn_blocking(move || parquet_schema_columns(&path_clone))
        .await
        .map_err(|e| format!("Task join error: {e}"))??;

    cache.set_dataset(PathBuf::from(&path), total_rows, columns.clone());

    Ok(ParquetOpenResult {
        path,
        total_rows,
        columns,
    })
}

#[tauri::command]
pub async fn parquet_load_page(
    page_index: usize,
    page_info: PageInfo,
    columns: Option<Vec<String>>,
    app_handle: AppHandle,
    cache: State<'_, ParquetCacheManager>,
) -> Result<ParsedPage, String> {
    let cols = columns.unwrap_or_default();
    let key = page_cache_key(page_index, &page_info, &cols);
    if let Some(cached) = cache.get_cached_page(&key) {
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

    let path = cache
        .get_path()
        .ok_or_else(|| "No parquet file loaded".to_string())?;

    let path_str = path.to_string_lossy().to_string();

    let _ = app_handle.emit(
        "datascope:progress",
        DatascopeProgress {
            current: 0,
            total: page_info.row_count as u64,
            message: format!("读取 Parquet 第 {} 页...", page_index + 1),
        },
    );

    let app_handle2 = app_handle.clone();

    let parsed = tokio::task::spawn_blocking(move || -> Result<ParsedPage, String> {
        let mut lf = LazyFrame::scan_parquet(&path_str, ScanArgsParquet::default())
            .map_err(map_polars_err)?;

        if !cols.is_empty() {
            let exprs = cols.iter().map(|c| col(c)).collect::<Vec<_>>();
            lf = lf.select(exprs);
        }

        // Parquet: 通过 row group + predicate pushdown/column pruning 只读需要的块
        let len: polars::prelude::IdxSize = page_info
            .row_count
            .try_into()
            .map_err(|_| "Page row_count is too large".to_string())?;

        let df = lf
            .slice(page_info.start_row as i64, len)
            .collect()
            .map_err(map_polars_err)?;

        let total = df.height() as u64;
        let _ = app_handle2.emit(
            "datascope:progress",
            DatascopeProgress {
                current: 0,
                total,
                message: "序列化数据...".to_string(),
            },
        );

        let headers = df
            .get_columns()
            .iter()
            .map(|s| s.name().to_string())
            .collect::<Vec<_>>();

        let height = df.height();
        let cols_ref = df.get_columns();
        let mut out = Vec::with_capacity(height);
        for row_idx in 0..height {
            let mut row = HashMap::with_capacity(cols_ref.len());
            for s in cols_ref {
                let name = s.name();
                let av = s.get(row_idx).unwrap_or(polars::prelude::AnyValue::Null);
                row.insert(name.to_string(), any_to_json(&av));
            }
            out.push(row);

            if row_idx % 2000 == 0 {
                let _ = app_handle2.emit(
                    "datascope:progress",
                    DatascopeProgress {
                        current: ((row_idx as u64) + 1).min(total),
                        total,
                        message: "序列化数据...".to_string(),
                    },
                );
            }
        }

        let _ = app_handle2.emit(
            "datascope:progress",
            DatascopeProgress {
                current: total,
                total,
                message: "加载完成".to_string(),
            },
        );

        Ok(ParsedPage {
            headers,
            rows: out,
            skipped_rows: 0,
        })
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))??;

    cache.cache_page(key, parsed.clone());
    Ok(parsed)
}

fn find_first_numeric_column(page: &ParsedPage) -> Option<String> {
    let sample_size = page.rows.len().min(100);
    for name in &page.headers {
        let mut non_empty = 0;
        let mut numeric = 0;
        for i in 0..sample_size {
            let v = page.rows[i].get(name);
            match v {
                Some(Value::Number(n)) => {
                    non_empty += 1;
                    if n.as_f64().is_some() {
                        numeric += 1;
                    }
                }
                Some(Value::String(s)) => {
                    let t = s.trim();
                    if !t.is_empty() {
                        non_empty += 1;
                        if t.parse::<f64>().is_ok() {
                            numeric += 1;
                        }
                    }
                }
                Some(Value::Null) | None => {}
                _ => {
                    // arrays/objects 不视为数值列
                    non_empty += 1;
                }
            }
        }
        if non_empty > 0 && (numeric as f64 / non_empty as f64) >= 0.7 {
            return Some(name.clone());
        }
    }
    None
}

#[tauri::command]
pub async fn parquet_generate_thumbnail(
    page_index: usize,
    page_info: PageInfo,
    cache: State<'_, ParquetCacheManager>,
) -> Result<ThumbnailData, String> {
    if let Some(cached) = cache.get_cached_thumbnail(page_index) {
        return Ok(cached);
    }

    let path = cache
        .get_path()
        .ok_or_else(|| "No parquet file loaded".to_string())?;
    let path_str = path.to_string_lossy().to_string();

    // 只取这一页的少量行用于检测数值列并采样
    let page = tokio::task::spawn_blocking(move || -> Result<ParsedPage, String> {
        let lf = LazyFrame::scan_parquet(&path_str, ScanArgsParquet::default())
            .map_err(map_polars_err)?;

        let len: polars::prelude::IdxSize = page_info
            .row_count
            .try_into()
            .map_err(|_| "Page row_count is too large".to_string())?;

        let df = lf
            .slice(page_info.start_row as i64, len)
            .collect()
            .map_err(map_polars_err)?;

        let headers = df
            .get_columns()
            .iter()
            .map(|s| s.name().to_string())
            .collect::<Vec<_>>();

        Ok(ParsedPage {
            headers,
            rows: df_to_rows(&df),
            skipped_rows: 0,
        })
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))??;

    let numeric_col = find_first_numeric_column(&page);
    if numeric_col.is_none() {
        let empty = ThumbnailData {
            page_index,
            points: vec![],
        };
        cache.cache_thumbnail(page_index, empty.clone());
        return Ok(empty);
    }
    let col_name = numeric_col.unwrap();

    let step = (page.rows.len() / THUMBNAIL_SAMPLE_SIZE).max(1);
    let mut points = Vec::new();
    for (i, row) in page.rows.iter().enumerate().step_by(step) {
        if let Some(v) = row.get(&col_name) {
            let y = match v {
                Value::Number(n) => n.as_f64(),
                Value::String(s) => s.trim().parse::<f64>().ok(),
                _ => None,
            };
            if let Some(y) = y {
                points.push(ThumbnailPoint {
                    x: (page_info.start_row + i) as f64,
                    y,
                });
            }
        }
    }

    let thumb = ThumbnailData { page_index, points };
    cache.cache_thumbnail(page_index, thumb.clone());
    Ok(thumb)
}

#[tauri::command]
pub async fn parquet_clear_cache(cache: State<'_, ParquetCacheManager>) -> Result<(), String> {
    cache.clear();
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CsvToParquetOptions {
    pub delimiter: Option<String>,
    pub has_header: Option<bool>,
    pub infer_schema_length: Option<usize>,
    pub compression: Option<String>, // "zstd" | "snappy" | "uncompressed"
}

#[tauri::command]
pub async fn convert_csv_to_parquet(
    csv_path: String,
    parquet_path: String,
    options: Option<CsvToParquetOptions>,
) -> Result<(), String> {
    let opts = options.unwrap_or(CsvToParquetOptions {
        delimiter: None,
        has_header: None,
        infer_schema_length: None,
        compression: None,
    });

    let delim = opts
        .delimiter
        .as_deref()
        .and_then(|s| s.as_bytes().first().copied())
        .unwrap_or(b',');

    let has_header = opts.has_header.unwrap_or(true);

    let infer_len = opts.infer_schema_length;
    let compression = opts.compression.unwrap_or_else(|| "zstd".to_string());

    tokio::task::spawn_blocking(move || -> Result<(), String> {
        // Golden rule: 不把整个 CSV 读进内存；LazyCsvReader 构建惰性计划
        let mut reader = LazyCsvReader::new(csv_path)
            .with_separator(delim)
            .with_has_header(has_header);

        if let Some(n) = infer_len {
            reader = reader.with_infer_schema_length(Some(n));
        }

        let lf = reader.finish().map_err(map_polars_err)?;

        // sink_parquet: 让 Polars 以流式/分块方式写出 Parquet（避免 collect 全量）
        // 注意：具体是否全流式取决于 polars streaming 计划与算子。
        let mut write_opts = polars::prelude::ParquetWriteOptions::default();
        write_opts.compression = match compression.as_str() {
            "snappy" => polars::prelude::ParquetCompression::Snappy,
            "uncompressed" => polars::prelude::ParquetCompression::Uncompressed,
            _ => {
                let level = polars::prelude::ZstdLevel::try_new(3).map_err(map_polars_err)?;
                polars::prelude::ParquetCompression::Zstd(Some(level))
            }
        };

        lf.sink_parquet(&parquet_path, write_opts, None)
            .map_err(map_polars_err)?;

        Ok(())
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))??;

    Ok(())
}
