// src-tauri/src/pdf_library/mod.rs

pub mod commands;
pub mod database;
pub mod file_ops;
pub mod metadata;
pub mod watcher;

// 重导出命令状态
pub use commands::PdfLibraryState;

use serde::{Deserialize, Serialize};

/// PDF 元数据
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PDFMetadata {
    pub title: Option<String>,
    pub author: Option<String>,
    pub subject: Option<String>,
    pub keywords: Option<String>,
    pub creator: Option<String>,
    pub producer: Option<String>,
    pub creation_date: Option<String>,
    pub modification_date: Option<String>,
    pub page_count: i32,
}

/// 文件身份信息 (Windows File ID)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileIdentity {
    pub volume_id: u64,
    pub file_index: u64,
    pub file_size: u64,
}

/// 书籍记录
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Book {
    pub id: i32,
    pub title: String,
    pub filename: String,
    pub filepath: String,
    pub directory_id: i32,
    pub is_managed: bool,
    pub is_missing: bool,
    
    // 文件身份
    pub volume_id: u64,
    pub file_index: u64,
    pub file_size: u64,
    
    // 元数据
    pub author: Option<String>,
    pub page_count: i32,
    
    // 封面 (Base64)
    pub cover_image: Option<String>,
    
    // 时间戳
    pub import_date: String,
    pub modified_date: String,
    
    // 标签 (在查询时加载)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<Tag>>,
}

/// 标签
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Tag {
    pub id: i32,
    pub name: String,
    pub color: Option<String>,
    pub parent_id: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub book_count: Option<i32>,
}

/// 目录/来源
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Directory {
    pub id: i32,
    pub path: String,
    #[serde(rename = "type")]
    pub dir_type: String, // "workspace" or "external"
    pub name: String,
    pub is_monitoring: bool,
}

/// 重命名结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameResult {
    pub success: bool,
    pub new_path: String,
    pub error: Option<String>,
}

/// 文件查找结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileLocateResult {
    pub found: bool,
    pub path: Option<String>,
    pub needs_update: bool,
}

/// 重新关联结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelinkResult {
    pub updated: bool,
    pub confidence: String,
    pub needs_confirmation: bool,
    pub suggest_move: bool,
    pub new_path: Option<String>,
}
