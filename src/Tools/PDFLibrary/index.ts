// src/Tools/PDFLibrary/index.ts
import { ToolCategory, type ToolConfig } from '../types';

/**
 * PDF Library 工具配置
 * 符合自动注册规范的配置导出
 */
const pdfLibraryToolConfig: ToolConfig = {
  id: 'tools-pdf-library',
  name: 'PDF 图书馆',
  icon: '📚',
  description: 'PDF 文件管理和阅读工具，支持标签、元数据管理',
  category: ToolCategory.PRODUCTIVITY,
  component: () => import('./PDFLibraryMain'),
  saveState: true, // 保存当前选中的书籍等状态
};

export default pdfLibraryToolConfig;
