// src-tauri/src/pdf_library/metadata.rs

use std::path::Path;
use std::io::Cursor;
use super::PDFMetadata;
use pdfium_render::prelude::{
    PdfDocumentMetadataTagType, PdfPageRenderRotation, PdfRenderConfig, Pdfium,
};
use image::ImageFormat;

/// 尝试初始化 Pdfium
fn init_pdfium() -> Result<Pdfium, String> {
    // 尝试从当前目录加载，或者系统路径加载
    let bindings = Pdfium::bind_to_library(Pdfium::pdfium_platform_library_name_at_path("./"))
        .or_else(|_| Pdfium::bind_to_system_library())
        .map_err(|e| format!("无法加载 PDFium 库: {}. 请确保 pdfium.dll/libpdfium.so 在可执行文件目录下。", e))?;
        
    Ok(Pdfium::new(bindings))
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
                title: path.file_stem()
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
    let to_string = |tag: PdfDocumentMetadataTagType| {
        metadata
            .get(tag)
            .map(|t| t.value().to_string())
    };

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
    let page = document
        .pages()
        .get(0)
        .map_err(|e| e.to_string())?;
    
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
    use base64::{Engine as _, engine::general_purpose};
    Ok(general_purpose::STANDARD.encode(buffer.into_inner()))
}
