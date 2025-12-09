// src-tauri/src/pdf_library/metadata.rs

use super::PDFMetadata;
use image::ImageFormat;
use pdfium_render::prelude::{
    PdfDocumentMetadataTagType, PdfPageRenderRotation, PdfRenderConfig, Pdfium,
};
use std::io::Cursor;
use std::path::{Path, PathBuf};

/// 尝试初始化 Pdfium
fn init_pdfium() -> Result<Pdfium, String> {
    // 常见的查找路径（在 tauri dev / release 中都会尝试这些位置） 不要添加src-tauri前缀，运行时路径不同
    let mut search_paths: Vec<String> = vec!["./bin/pdfium-win-x64/bin".to_string()];

    // 加入当前工作目录及其常见子目录的绝对路径，避免运行目录不同导致找不到
    if let Ok(cwd) = std::env::current_dir() {
        if let Some(s) = cwd.to_str() {
            search_paths.push(s.to_string());
        }
        for rel in ["bin/pdfium-win-x64/bin"] {
            let candidate = cwd.join(rel);
            if let Some(s) = candidate.to_str() {
                search_paths.push(s.to_string());
            }
        }
    }

    // 支持通过环境变量覆盖
    if let Ok(path) = std::env::var("PDFIUM_PATH") {
        search_paths.insert(0, path);
    }
    if let Ok(path) = std::env::var("PDFIUM_LIB_PATH") {
        search_paths.insert(0, path);
    }

    // 也尝试可执行文件所在目录
    if let Some(exe_dir) = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(PathBuf::from))
        .and_then(|p| p.to_str().map(|s| s.to_string()))
    {
        search_paths.insert(0, exe_dir.clone());

        // exe 旁的子目录（打包或 dev 时可能在这里）
        for rel in [
            "pdfium-win-x64/bin",
            "bin",
            "pdfium", // 兜底
        ] {
            let candidate = PathBuf::from(&exe_dir).join(rel);
            if let Some(s) = candidate.to_str() {
                search_paths.push(s.to_string());
            }
        }
    }

    // 去重
    search_paths.sort();
    search_paths.dedup();

    let mut errors: Vec<String> = Vec::new();

    for path in &search_paths {
        match Pdfium::bind_to_library(Pdfium::pdfium_platform_library_name_at_path(path)) {
            Ok(bindings) => return Ok(Pdfium::new(bindings)),
            Err(e) => errors.push(format!("{} -> {}", path, e)),
        }
    }

    // 最后尝试系统路径
    Pdfium::bind_to_system_library()
        .map(Pdfium::new)
        .map_err(|e| {
            errors.push(format!("system -> {}", e));
            format!(
                "无法加载 PDFium 库。已尝试路径: {}. 请将 pdfium.dll/libpdfium.so 放到上述目录之一，或设置 PDFIUM_PATH。",
                errors.join(" | ")
            )
        })
}

/// 提取 PDF 元数据
pub fn extract_metadata(path: &Path) -> Result<PDFMetadata, String> {
    // 尝试使用 PDFium 提取详细信息
    match extract_metadata_with_pdfium(path) {
        Ok(metadata) => Ok(metadata),
        Err(e) => {
            println!("[PDFLibrary] PDFium 提取失败 ({}), 使用基础元数据", e);
            // 降级：仅使用文件系统信息
            Ok(PDFMetadata {
                title: path
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .map(|s| s.to_string()),
                author: None,
                subject: None,
                keywords: None,
                creator: None,
                producer: None,
                creation_date: None,
                modification_date: None,
                page_count: 0, // 0 表示未知
            })
        }
    }
}

fn extract_metadata_with_pdfium(path: &Path) -> Result<PDFMetadata, String> {
    let pdfium = init_pdfium()?;
    let document = pdfium
        .load_pdf_from_file(path, None)
        .map_err(|e| e.to_string())?;

    let metadata = document.metadata();

    // pdfium-render returns metadata tags; map them to owned strings we expose to the UI.
    let to_string =
        |tag: PdfDocumentMetadataTagType| metadata.get(tag).map(|t| t.value().to_string());

    Ok(PDFMetadata {
        title: to_string(PdfDocumentMetadataTagType::Title),
        author: to_string(PdfDocumentMetadataTagType::Author),
        subject: to_string(PdfDocumentMetadataTagType::Subject),
        keywords: to_string(PdfDocumentMetadataTagType::Keywords),
        creator: to_string(PdfDocumentMetadataTagType::Creator),
        producer: to_string(PdfDocumentMetadataTagType::Producer),
        creation_date: to_string(PdfDocumentMetadataTagType::CreationDate),
        modification_date: to_string(PdfDocumentMetadataTagType::ModificationDate),
        page_count: document.pages().len() as i32,
    })
}

/// 提取封面图 (返回 Base64 编码的 JPEG)
pub fn extract_cover(path: &Path) -> Result<String, String> {
    let pdfium = init_pdfium()?;
    let document = pdfium
        .load_pdf_from_file(path, None)
        .map_err(|e| e.to_string())?;

    // 获取第一页
    let page = document.pages().get(0).map_err(|e| e.to_string())?;

    // 渲染为图像 (宽度 400px，高度自适应)
    // 使用 render_with_config
    let bitmap = page
        .render_with_config(
            &PdfRenderConfig::new()
                .set_target_width(400)
                .set_maximum_height(600)
                .rotate_if_landscape(PdfPageRenderRotation::None, true),
        )
        .map_err(|e| e.to_string())?
        .as_image();

    // 转换为 JPEG
    let mut buffer = Cursor::new(Vec::new());
    bitmap
        .write_to(&mut buffer, ImageFormat::Jpeg)
        .map_err(|e| e.to_string())?;

    // Base64 编码
    use base64::{engine::general_purpose, Engine as _};
    Ok(general_purpose::STANDARD.encode(buffer.into_inner()))
}
