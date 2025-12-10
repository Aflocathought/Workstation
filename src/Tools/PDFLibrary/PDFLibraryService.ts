// src/Tools/PDFLibrary/PDFLibraryService.ts
import { invoke } from '@tauri-apps/api/core';
import type {
  Book,
  Tag,
  Directory,
  Category,
  PDFMetadata,
  FileIdentity,
  RenameResult,
  FileLocateResult,
  FilterOptions,
  SortField,
  SortOrder,
} from './types';

import type { RelinkResult } from './types';
/**
 * PDF 图书馆服务
 * 负责与 Rust 后端通信
 */
class PDFLibraryService {
  // ==================== 数据库初始化 ====================
  
  /**
   * 初始化数据库
   */
  async initDatabase(): Promise<void> {
    console.log('[PDFLibraryService] 调用 pdflibrary_init_db...');
    try {
      const result = await invoke('pdflibrary_init_db');
      console.log('[PDFLibraryService] pdflibrary_init_db 返回:', result);
    } catch (error) {
      console.error('[PDFLibraryService] pdflibrary_init_db 失败:', error);
      throw error;
    }
  }

  /**
   * 备份数据库
   */
  async backupDatabase(): Promise<string> {
    return invoke('pdflibrary_backup_db');
  }

  // ==================== 书籍管理 ====================

  /**
   * 获取所有书籍
   */
  async getAllBooks(
    filter?: FilterOptions,
    sortField?: SortField,
    sortOrder?: SortOrder
  ): Promise<Book[]> {
    return invoke('pdflibrary_get_books', { filter, sortField, sortOrder });
  }

  /**
   * 根据 ID 获取书籍
   */
  async getBookById(id: number): Promise<Book | null> {
    return invoke('pdflibrary_get_book', { id });
  }

  /**
   * 添加书籍 (从文件路径)
   */
  async addBook(
    filepath: string,
    directoryId: number,
    isManaged: boolean
  ): Promise<Book> {
    return invoke('pdflibrary_add_book', { filepath, directoryId, isManaged });
  }

  /**
   * 更新书籍标题 (仅数据库)
   */
  async updateBookTitle(id: number, title: string): Promise<void> {
    return invoke('pdflibrary_update_title', { id, title });
  }

  /**
   * 重命名书籍 (标题 + 文件名)
   * 仅对 isManaged=true 的主库文件有效
   */
  async renameBook(id: number, newTitle: string, syncFilename: boolean): Promise<RenameResult> {
    return invoke('pdflibrary_rename_book', { id, newTitle, syncFilename });
  }

  /**
   * 删除书籍
   */
  async deleteBook(id: number, deleteFile: boolean): Promise<void> {
    return invoke('pdflibrary_delete_book', { id, deleteFile });
  }

  /**
   * 查找文件 (通过 File ID)
   * 用于文件路径失效时重新定位
   */
  async locateFile(volumeId: number, fileIndex: number): Promise<FileLocateResult> {
    return invoke('pdflibrary_locate_file', { volumeId, fileIndex });
  }

  // ==================== 标签管理 ====================

  /**
   * 获取所有标签
   */
  async getAllTags(): Promise<Tag[]> {
    return invoke('pdflibrary_get_tags');
  }

  /**
   * 创建标签
   */
  async createTag(name: string, color?: string, parentId?: number, aliases?: string): Promise<Tag> {
    return invoke('pdflibrary_create_tag', { name, color, parentId, aliases });
  }

  /**
   * 更新标签
   */
  async updateTag(
    tagId: number, 
    name?: string, 
    color?: string, 
    parentId?: number | null,
    aliases?: string | null
  ): Promise<void> {
    return invoke('pdflibrary_update_tag', { tagId, name, color, parentId, aliases });
  }

  /**
   * 删除标签
   */
  async deleteTag(tagId: number): Promise<void> {
    return invoke('pdflibrary_delete_tag', { tagId });
  }

  /**
   * 给书籍添加标签
   */
  async addTagToBook(bookId: number, tagId: number): Promise<void> {
    return invoke('pdflibrary_add_book_tag', { bookId, tagId });
  }

  /**
   * 从书籍移除标签
   */
  async removeTagFromBook(bookId: number, tagId: number): Promise<void> {
    return invoke('pdflibrary_remove_book_tag', { bookId, tagId });
  }

  /**
   * 获取书籍的所有标签
   */
  async getBookTags(bookId: number): Promise<Tag[]> {
    return invoke('pdflibrary_get_book_tags', { bookId });
  }

  // ==================== 目录管理 ====================

  /**
   * 获取所有目录
   */
  async getAllDirectories(): Promise<Directory[]> {
    return invoke('pdflibrary_get_directories');
  }

  /**
   * 添加目录
   */
  async addDirectory(path: string, type: 'workspace' | 'external', name: string): Promise<Directory> {
    return invoke('pdflibrary_add_directory', { path, type, name });
  }

  /**
   * 设置 Workspace 路径
   */
  async setWorkspacePath(path: string): Promise<Directory> {
    return invoke('pdflibrary_set_workspace_path', { path });
  }

  /**
   * 打开 Workspace 文件夹
   */
  async openWorkspaceFolder(): Promise<void> {
    return invoke('pdflibrary_open_workspace_folder');
  }

  /**
   * 删除目录
   */
  async deleteDirectory(id: number): Promise<void> {
    return invoke('pdflibrary_delete_directory', { id });
  }

  /**
   * 扫描目录 (重新索引)
   */
  async scanDirectory(id: number): Promise<number> {
    return invoke('pdflibrary_scan_directory', { id });
  }

  // ==================== 分类管理 ====================

  /**
   * 获取所有分类
   */
  async getAllCategories(): Promise<Category[]> {
    return invoke('pdflibrary_get_categories');
  }

  /**
   * 创建分类
   */
  async createCategory(name: string, icon?: string, color?: string): Promise<Category> {
    return invoke('pdflibrary_create_category', { name, icon, color });
  }

  /**
   * 更新分类
   */
  async updateCategory(id: number, name?: string, icon?: string, color?: string): Promise<void> {
    return invoke('pdflibrary_update_category', { id, name, icon, color });
  }

  /**
   * 删除分类
   */
  async deleteCategory(id: number): Promise<void> {
    return invoke('pdflibrary_delete_category', { id });
  }

  /**
   * 更新书籍的分类
   */
  async updateBookCategory(bookId: number, categoryId?: number): Promise<void> {
    return invoke('pdflibrary_update_book_category', { bookId, categoryId });
  }

  // ==================== PDF 处理 ====================

  /**
   * 提取 PDF 元数据
   */
  async extractMetadata(filepath: string): Promise<PDFMetadata> {
    return invoke('pdflibrary_extract_metadata', { filepath });
  }

  /**
   * 提取封面图 (Base64)
   */
  async extractCover(filepath: string): Promise<string> {
    return invoke('pdflibrary_extract_cover', { filepath });
  }

  /**
   * 更新书籍封面（提取并保存到数据库）
   */
  async updateBookCover(bookId: number): Promise<string> {
    return invoke('pdflibrary_update_book_cover', { bookId });
  }

  /**
   * 获取文件身份信息 (Windows File ID)
   */
  async getFileIdentity(filepath: string): Promise<FileIdentity> {
    return invoke('pdflibrary_get_file_identity', { filepath });
  }

  // ==================== 文件操作 ====================

  /**
   * 在文件管理器中定位
   */
  async showInFolder(filepath: string): Promise<void> {
    return invoke('pdflibrary_show_in_folder', { filepath });
  }

  /**
   * 复制文件到剪贴板 (用于拖拽发送)
   */
  async copyFileToClipboard(filepath: string): Promise<void> {
    return invoke('pdflibrary_copy_file_to_clipboard', { filepath });
  }

  /**
   * 重新提取所有 PDF 的元数据
   */
  async refreshAllMetadata(): Promise<{ refreshed: number; missing: number; failed: number; finishedAt: string; }> {
    return invoke('pdflibrary_refresh_all_metadata');
  }

  /**
   * 移除所有找不到文件的记录
   */
  async removeMissingFiles(): Promise<{ removed: number; }> {
    return invoke('pdflibrary_remove_missing_files');
  }

  /**
   * 用默认程序打开文件
   */
  async openFile(filepath: string): Promise<void> {
    return invoke('pdflibrary_open_file', { filepath });
  }

  /**
   * 重新检查所有文件，标记缺失
   */
  async rescanFiles(): Promise<{ ok: number; missing: number; }> {
    return invoke('pdflibrary_rescan_files');
  }

  /**
   * 重新关联缺失文件
   */
  async relinkBook(bookId: number, newPath: string, force = false): Promise<RelinkResult> {
    return invoke('pdflibrary_relink_book', { bookId, newPath, force });
  }

  /**
   * 将文件移动到 Workspace
   */
  async moveBookToWorkspace(bookId: number): Promise<string> {
    return invoke('pdflibrary_move_book_to_workspace', { bookId });
  }

  // ==================== Inbox 监控 ====================

  /**
   * 启动 Inbox 监控
   */
  async startInboxWatcher(inboxPath: string, workspacePath: string): Promise<void> {
    return invoke('pdflibrary_start_inbox_watcher', { inboxPath, workspacePath });
  }

  /**
   * 停止 Inbox 监控
   */
  async stopInboxWatcher(): Promise<void> {
    return invoke('pdflibrary_stop_inbox_watcher');
  }
}

export const pdfLibraryService = new PDFLibraryService();
