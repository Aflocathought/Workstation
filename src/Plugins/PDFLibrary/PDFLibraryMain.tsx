// src/Tools/PDFLibrary/PDFL.tsx
import { Component, createSignal, onMount, onCleanup, For, Show, createMemo } from 'solid-js';
import { open } from '@tauri-apps/plugin-dialog';
import { listen } from '@tauri-apps/api/event';
import { pdfLibraryService } from './PDFLibraryService';
import type { Book, Tag, Directory, Category, ViewType, SortField, SortOrder } from './types';
import { confirmAction } from '../../core/ui/confirm';
import TagManager from './TagManager';
import { loadState, saveState } from './PDFLibraryState';
import styles from './PDFLibrary.module.css';

/**
 * PDF Library 主组件
 * 采用 Master-Detail 布局: 左侧导航 + 中间列表 + 右侧检查器
 */
const PDFLibrary: Component = () => {
  // ==================== 状态管理 ====================
  
  const [books, setBooks] = createSignal<Book[]>([]);
  const [tags, setTags] = createSignal<Tag[]>([]);
  const [directories, setDirectories] = createSignal<Directory[]>([]);
  const [categories, setCategories] = createSignal<Category[]>([]);
  
  const [selectedBook, setSelectedBook] = createSignal<Book | null>(null);
  const [viewType, setViewType] = createSignal<ViewType>('grid');
  
  // 过滤和排序
  const [searchText, setSearchText] = createSignal('');
  const [selectedTagIds, setSelectedTagIds] = createSignal<number[]>([]);
  const [excludedTagIds, setExcludedTagIds] = createSignal<number[]>([]); // 排除的标签
  const [selectedDirectoryId, setSelectedDirectoryId] = createSignal<number | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = createSignal<number | null>(null);
  const [sortField] = createSignal<SortField>('importDate');
  const [sortOrder] = createSignal<SortOrder>('desc');
  
  // UI 状态
  const [isLoading, setIsLoading] = createSignal(true);
  const [isRefreshingMetadata, setIsRefreshingMetadata] = createSignal(false);
  const [isRescanning, setIsRescanning] = createSignal(false);
  const [editingTitle, setEditingTitle] = createSignal(false);
  const [newTitle, setNewTitle] = createSignal('');
  const [tagInputValue, setTagInputValue] = createSignal('');
  const [tagSuggestions, setTagSuggestions] = createSignal<Tag[]>([]);
  const [draggedBook, setDraggedBook] = createSignal<Book | null>(null);
  const [dropTargetCategoryId, setDropTargetCategoryId] = createSignal<number | null>(null);
  const [dragOver, setDragOver] = createSignal(false);
  
  let unlistenFileDrop: (() => void) | undefined;
  let dragCounter = 0;
  
  // 批量选择
  const [selectionMode, setSelectionMode] = createSignal(false);
  const [selectedBookIds, setSelectedBookIds] = createSignal<number[]>([]);
  
  // 视图切换
  const [showTagManager, setShowTagManager] = createSignal(false);
  const [showBatchTagInput, setShowBatchTagInput] = createSignal(false);
  const [batchTagInput, setBatchTagInput] = createSignal('');
  const [showBatchCategorySelect, setShowBatchCategorySelect] = createSignal(false);

  // ==================== 状态持久化辅助函数 ====================
  
  // 包装状态设置函数，自动保存到 localStorage
  const setAndSaveDirectoryId = (id: number | null) => {
    setSelectedDirectoryId(id);
    saveState({ selectedDirectoryId: id });
  };
  
  const setAndSaveCategoryId = (id: number | null) => {
    setSelectedCategoryId(id);
    saveState({ selectedCategoryId: id });
  };
  
  const setAndSaveTagIds = (ids: number[]) => {
    setSelectedTagIds(ids);
    saveState({ selectedTagIds: ids });
  };
  
  const setAndSaveExcludedTagIds = (ids: number[]) => {
    setExcludedTagIds(ids);
    saveState({ excludedTagIds: ids });
  };
  
  const setAndSaveViewType = (type: ViewType) => {
    setViewType(type);
    saveState({ viewType: type });
  };
  
  // 搜索文本使用防抖保存
  let searchTextTimeout: number | undefined;
  const setAndSaveSearchText = (text: string) => {
    setSearchText(text);
    if (searchTextTimeout) {
      clearTimeout(searchTextTimeout);
    }
    searchTextTimeout = setTimeout(() => {
      saveState({ searchText: text });
    }, 500) as unknown as number; // 500ms 防抖
  };

  // ==================== 计算属性 ====================
  
  const filteredBooks = createMemo(() => {
    let result = books();
    
    // 搜索文本
    const search = searchText().toLowerCase();
    if (search) {
      result = result.filter(book =>
        book.title.toLowerCase().includes(search) ||
        book.filename.toLowerCase().includes(search) ||
        book.author?.toLowerCase().includes(search)
      );
    }
    
    // 标签过滤
    const tagIds = selectedTagIds();
    const excludedIds = excludedTagIds();
    
    if (tagIds.length > 0) {
      result = result.filter(book =>
        book.tags?.some(tag => tagIds.includes(tag.id))
      );
    }
    
    // 排除标签
    if (excludedIds.length > 0) {
      result = result.filter(book =>
        !book.tags?.some(tag => excludedIds.includes(tag.id))
      );
    }
    
    // 目录过滤
    const dirId = selectedDirectoryId();
    if (dirId !== null) {
      result = result.filter(book => book.directoryId === dirId);
    }
    
    // 分类过滤
    const catId = selectedCategoryId();
    if (catId !== null) {
      if (catId === -1) {
        // 未分类：过滤出没有 categoryId 的书籍
        result = result.filter(book => !book.categoryId);
      } else {
        // 特定分类：过滤出匹配的书籍
        result = result.filter(book => book.categoryId === catId);
      }
    }
    
    return result;
  });

  // ==================== 生命周期 ====================
  
  // ==================== 拖拽处理 ====================

  const handleFileDrop = async (filepath: string) => {
    // 1. 检查文件类型
    if (!filepath.toLowerCase().endsWith('.pdf')) {
      const msg = '错误：只能拖入 PDF 文件';
      console.error(msg);
      alert(msg);
      return;
    }

    // 2. 找到 Inbox 目录
    // 尝试找到名为 "Inbox" 的目录，如果找不到则使用 Workspace 主目录
    let targetDir = directories().find(d => d.name === 'Inbox');
    let targetName = 'Inbox';
    
    if (!targetDir) {
      console.log('[PDFLibrary] 未找到 Inbox 目录记录，尝试使用 Workspace');
      targetDir = directories().find(d => d.type === 'workspace');
      targetName = 'Workspace';
    }
    
    if (!targetDir) {
      const msg = '错误：找不到 Inbox 或 Workspace 文件夹，请确保已设置 Workspace';
      console.error(msg);
      alert(msg);
      return;
    }

    try {
      setIsLoading(true);
      console.log(`[PDFLibrary] 正在添加文件到 ${targetName}: ${filepath}`);
      // 添加书籍
      // 注意：目前前端无法直接移动文件到 Inbox 文件夹（受限于权限和插件）
      // 这里将文件注册到目标目录的索引中
      await pdfLibraryService.addBook(filepath, targetDir.id, false);
      
      await loadData();
      // 自动选中目标目录
      setAndSaveDirectoryId(targetDir.id);
      alert(`文件已成功添加到 ${targetName}`);
    } catch (error) {
      console.error('添加文件失败:', error);
      alert('添加文件失败: ' + error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGlobalDragEnter = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter++;
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    setDragOver(true);
  };

  const handleGlobalDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      setDragOver(false);
    }
  };

  const handleGlobalDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    dragCounter = 0;
    // 注意：实际的文件处理由 tauri://drag-drop 事件处理
  };

  onMount(async () => {
    console.log('[PDFLibrary] onMount 被调用, isLoading =', isLoading());
    
    // 加载保存的状态
    const savedState = loadState();
    console.log('[PDFLibrary] 加载保存的状态:', savedState);
    
    // 恢复状态
    setSelectedDirectoryId(savedState.selectedDirectoryId);
    setSelectedCategoryId(savedState.selectedCategoryId);
    setSelectedTagIds(savedState.selectedTagIds);
    setExcludedTagIds(savedState.excludedTagIds);
    setViewType(savedState.viewType);
    setSearchText(savedState.searchText);
    
    // 监听后端更新事件
    const unlisten = await listen('pdf-library-update', () => {
      console.log('[PDFLibrary] 收到更新事件，正在刷新数据...');
      loadData();
    });

    // 监听 Tauri v2 的拖拽事件 tauri://drag-drop
    try {
      unlistenFileDrop = await listen<any>("tauri://drag-drop", async (event) => {
        const payload: any = event.payload;
        const kind = (payload && (payload.type || payload.event || payload.kind)) as string | undefined;

        // 只在真正放下(dropped)时处理
        if (kind && !["drop", "dropped", "Drop", "Dropped"].includes(kind)) {
          return;
        }

        let paths: string[] | undefined;
        if (Array.isArray(payload?.paths)) {
          paths = payload.paths as string[];
        } else if (Array.isArray(payload)) {
          paths = payload as string[];
        } else if (typeof payload === "string") {
          paths = [payload];
        }

        const firstPath = paths && paths[0];
        if (firstPath && typeof firstPath === "string") {
          console.log("📂 [tauri://drag-drop] 路径:", firstPath);
          await handleFileDrop(firstPath);
        }
      });
    } catch (err) {
      console.error("监听 tauri://drag-drop 失败", err);
    }
    
    onCleanup(() => {
      unlisten();
      if (unlistenFileDrop) {
        unlistenFileDrop();
        unlistenFileDrop = undefined;
      }
    });

    try {
      console.log('[PDFLibrary] 开始初始化数据库...');
      const initResult = await pdfLibraryService.initDatabase();
      console.log('[PDFLibrary] 数据库初始化成功:', initResult);
      
      console.log('[PDFLibrary] 开始加载数据...');
      await loadData();
      console.log('[PDFLibrary] 数据加载完成');
      
      // 恢复选中的书籍
      if (savedState.selectedBookId) {
        const book = books().find(b => b.id === savedState.selectedBookId);
        if (book) {
          await handleSelectBook(book);
        }
      }
    } catch (error) {
      console.error('[PDFLibrary] 初始化失败:', error);
      console.error('[PDFLibrary] 错误详情:', JSON.stringify(error, null, 2));
    } finally {
      console.log('[PDFLibrary] 设置 isLoading = false');
      setIsLoading(false);
      console.log('[PDFLibrary] isLoading 当前值:', isLoading());
    }
  });

  // ==================== 数据加载 ====================
  
  const loadData = async () => {
    try {
      console.log('[PDFLibrary] 开始加载数据...');
      const [booksData, tagsData, dirsData, catsData] = await Promise.all([
        pdfLibraryService.getAllBooks(undefined, sortField(), sortOrder()),
        pdfLibraryService.getAllTags(),
        pdfLibraryService.getAllDirectories(),
        pdfLibraryService.getAllCategories(),
      ]);
      
      console.log('[PDFLibrary] 加载完成 - 书籍数:', booksData.length, '标签数:', tagsData.length, '分类数:', catsData.length);
      console.log('[PDFLibrary] 书籍标签详情:', booksData.map(b => ({ id: b.id, title: b.title, tags: b.tags?.map(t => t.name) })));
      
      setBooks(booksData);
      setTags(tagsData);
      setDirectories(dirsData);
      setCategories(catsData);
    } catch (error) {
      console.error('[PDFLibrary] 加载数据失败:', error);
    }
  };

  // ==================== 书籍操作 ====================
  
  const handleSelectBook = async (book: Book) => {
    setSelectedBook(book);
    setEditingTitle(false);
    setNewTitle(book.title);
    
    // 保存选中的书籍ID
    saveState({ selectedBookId: book.id });
    
    // 加载书籍的标签
    try {
      const bookTags = await pdfLibraryService.getBookTags(book.id);
      setBooks(prev => prev.map(b => 
        b.id === book.id ? { ...b, tags: bookTags } : b
      ));
    } catch (error) {
      console.error('加载标签失败:', error);
    }
  };

  const handleSaveTitle = async () => {
    const book = selectedBook();
    if (!book) return;
    
    try {
      const titleValue = newTitle().trim();
      if (!titleValue) return;
      
      // 如果是主库文件,可以选择同步文件名
      if (book.isManaged) {
        const result = await pdfLibraryService.renameBook(book.id, titleValue, true);
        if (!result.success) {
          alert(`重命名失败: ${result.error}\n仅更新了数据库标题`);
          await pdfLibraryService.updateBookTitle(book.id, titleValue);
        }
      } else {
        // 外部文件只能改标题
        await pdfLibraryService.updateBookTitle(book.id, titleValue);
      }
      
      // 更新本地状态
      setBooks(prev => prev.map(b =>
        b.id === book.id ? { ...b, title: titleValue } : b
      ));
      setSelectedBook(prev => prev ? { ...prev, title: titleValue } : null);
      setEditingTitle(false);
    } catch (error) {
      console.error('保存标题失败:', error);
      alert('保存失败');
    }
  };

  const handleOpenFile = async () => {
    const book = selectedBook();
    if (!book) return;
    if (book.isMissing) {
      alert('文件缺失，无法打开');
      return;
    }
    
    try {
      await pdfLibraryService.openFile(book.filepath);
    } catch (error) {
      console.error('打开文件失败:', error);
      alert('无法打开文件');
    }
  };

  const handleRemoveMissing = async () => {
    // 双重确认，避免误删
    const first = await confirmAction('将移除所有“文件不存在”的记录，文件本身不会被删除。继续吗？', {
      title: '清理缺失记录',
      kind: 'warning',
      okLabel: '继续',
      cancelLabel: '取消',
    });
    if (!first) return;
    const second = await confirmAction('再次确认：立即清理缺失文件记录？', {
      title: '二次确认',
      kind: 'warning',
      okLabel: '立即清理',
      cancelLabel: '取消',
    });
    if (!second) return;

    try {
      const result = await pdfLibraryService.removeMissingFiles();
      await loadData();
      alert(`已移除 ${result.removed} 条缺失文件记录`);
    } catch (error) {
      console.error('清理缺失文件失败:', error);
      alert('清理失败');
    }
  };

  const handleOpenBook = async (book: Book) => {
    if (book.isMissing) {
      alert('文件缺失，无法打开');
      return;
    }
    try {
      await pdfLibraryService.openFile(book.filepath);
    } catch (error) {
      console.error('打开文件失败:', error);
      alert('无法打开文件');
    }
  };

  const handleShowInFolder = async () => {
    const book = selectedBook();
    if (!book) return;
    
    try {
      await pdfLibraryService.showInFolder(book.filepath);
    } catch (error) {
      console.error('定位文件失败:', error);
      alert('无法定位文件');
    }
  };

  const handleCopyFile = async () => {
    const book = selectedBook();
    if (!book) return;
    
    try {
      await pdfLibraryService.copyFileToClipboard(book.filepath);
    } catch (error) {
      console.error('复制文件失败:', error);
      alert('复制失败');
    }
  };

  const handleUpdateCover = async () => {
    const book = selectedBook();
    if (!book) return;
    
    if (book.isMissing) {
      alert('文件缺失，无法更新封面');
      return;
    }
    
    try {
      const coverImage = await pdfLibraryService.updateBookCover(book.id);
      // 更新当前选中的书籍
      setSelectedBook({ ...book, coverImage });
      // 更新列表中的书籍
      const updatedBooks = books().map(b => 
        b.id === book.id ? { ...b, coverImage } : b
      );
      setBooks(updatedBooks);
      alert('封面更新成功');
    } catch (error) {
      console.error('更新封面失败:', error);
      alert('更新封面失败: ' + error);
    }
  };

  // ==================== 标签操作 ====================
  
  const handleAddTag = async (e: KeyboardEvent) => {
    if (e.key !== 'Enter') return;
    
    const book = selectedBook();
    const tagName = tagInputValue().trim();
    if (!book || !tagName) return;
    
    console.log('[PDFLibrary] 开始添加标签:', tagName, '到书籍:', book.id);
    
    try {
      // 查找或创建标签（支持别名匹配）
      let tag = tags().find(t => {
        if (t.name === tagName) return true;
        if (t.aliases) {
          const aliases = t.aliases.split(',').map(a => a.trim());
          return aliases.includes(tagName);
        }
        return false;
      });
      
      if (!tag) {
        console.log('[PDFLibrary] 创建新标签:', tagName);
        tag = await pdfLibraryService.createTag(tagName);
        console.log('[PDFLibrary] 标签创建成功:', tag);
        setTags(prev => [...prev, tag!]);
      } else {
        console.log('[PDFLibrary] 找到已存在的标签:', tag);
      }
      
      // 获取所有需要添加的标签（包括父标签）
      const tagsToAdd: Tag[] = [tag];
      let currentTag = tag;
      while (currentTag.parentId) {
        const parentTag = tags().find(t => t.id === currentTag.parentId);
        if (parentTag && !tagsToAdd.find(t => t.id === parentTag.id)) {
          tagsToAdd.push(parentTag);
          currentTag = parentTag;
        } else {
          break;
        }
      }
      
      console.log('[PDFLibrary] 需要添加的标签（含父标签）:', tagsToAdd.map(t => t.name));
      
      // 关联所有标签到书籍
      for (const tagToAdd of tagsToAdd) {
        if (!book.tags?.find(t => t.id === tagToAdd.id)) {
          console.log('[PDFLibrary] 调用后端添加标签关联:', book.id, tagToAdd.id);
          await pdfLibraryService.addTagToBook(book.id, tagToAdd.id);
          console.log('[PDFLibrary] 标签关联成功');
        } else {
          console.log('[PDFLibrary] 标签已存在，跳过:', tagToAdd.name);
        }
      }
      
      // 更新本地状态
      const existingTags = book.tags || [];
      const newTags = tagsToAdd.filter(t => !existingTags.find(et => et.id === t.id));
      const updatedTags = [...existingTags, ...newTags];
      
      console.log('[PDFLibrary] 更新本地状态，新标签列表:', updatedTags.map(t => t.name));
      
      setBooks(prev => prev.map(b =>
        b.id === book.id ? { ...b, tags: updatedTags } : b
      ));
      setSelectedBook({ ...book, tags: updatedTags });
      
      setTagInputValue('');
      console.log('[PDFLibrary] 标签添加完成');
    } catch (error) {
      console.error('[PDFLibrary] 添加标签失败:', error);
      alert('添加标签失败: ' + error);
    }
  };

  const handleRemoveTag = async (tagId: number) => {
    const book = selectedBook();
    if (!book) return;
    
    try {
      await pdfLibraryService.removeTagFromBook(book.id, tagId);
      
      const updatedTags = book.tags?.filter(t => t.id !== tagId) || [];
      setBooks(prev => prev.map(b =>
        b.id === book.id ? { ...b, tags: updatedTags } : b
      ));
      setSelectedBook({ ...book, tags: updatedTags });
    } catch (error) {
      console.error('移除标签失败:', error);
    }
  };

  const handleChangeWorkspace = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: '选择 Workspace 文件夹',
      });
      
      if (selected && typeof selected === 'string') {
        await pdfLibraryService.setWorkspacePath(selected);
        // 重新加载目录
        const dirs = await pdfLibraryService.getAllDirectories();
        setDirectories(dirs);
      }
    } catch (error) {
      console.error('设置 Workspace 失败:', error);
    }
  };

  const handleOpenWorkspaceFolder = async () => {
    try {
      await pdfLibraryService.openWorkspaceFolder();
    } catch (error) {
      console.error('打开 Workspace 文件夹失败:', error);
      alert('打开 Workspace 文件夹失败: ' + error);
    }
  };

  const handleTagInput = (e: InputEvent) => {
    const value = (e.currentTarget as HTMLInputElement).value;
    setTagInputValue(value);
    
    if (!value.trim()) {
      setTagSuggestions([]);
      return;
    }
    
    const search = value.toLowerCase().replace(/^#/, '');
    const matches = tags().filter(t => 
      t.name.toLowerCase().includes(search) &&
      !selectedBook()?.tags?.some(bt => bt.id === t.id)
    );
    setTagSuggestions(matches);
  };

  const handleSelectSuggestion = async (tag: Tag) => {
    const book = selectedBook();
    if (!book) return;
    
    try {
      await pdfLibraryService.addTagToBook(book.id, tag.id);
      
      const updatedTags = [...(book.tags || []), tag];
      setBooks(prev => prev.map(b =>
        b.id === book.id ? { ...b, tags: updatedTags } : b
      ));
      setSelectedBook({ ...book, tags: updatedTags });
      
      setTagInputValue('');
      setTagSuggestions([]);
    } catch (error) {
      console.error('添加标签失败:', error);
    }
  };

  const handleRefreshAllMetadata = async () => {
    try {
      setIsRefreshingMetadata(true);
      const selectedId = selectedBook()?.id;
      const stats = await pdfLibraryService.refreshAllMetadata();
      await loadData();
      if (selectedId) {
        const refreshed = books().find(b => b.id === selectedId) || null;
        setSelectedBook(refreshed);
      }
      alert(`重新提取完成：成功 ${stats.refreshed}，缺失 ${stats.missing}，失败 ${stats.failed}`);
    } catch (error) {
      console.error('重新提取元数据失败:', error);
      alert('重新提取失败，请查看控制台日志');
    } finally {
      setIsRefreshingMetadata(false);
    }
  };

  const handleRescanAll = async () => {
    if (isRescanning()) return;
    const ok = await confirmAction('将重新检查 Inbox 及所有记录文件的存在状态，继续吗？', {
      title: '重新检查文件',
      kind: 'warning',
      okLabel: '继续',
      cancelLabel: '取消',
    });
    if (!ok) return;
    setIsRescanning(true);
    try {
      const stats = await pdfLibraryService.rescanFiles();
      await loadData();
      alert(`检查完成：正常 ${stats.ok}，缺失 ${stats.missing}`);
    } catch (error) {
      console.error('重新检查文件失败:', error);
      alert('检查失败，请查看控制台日志');
    } finally {
      setIsRescanning(false);
    }
  };

  const handleRelink = async () => {
    const book = selectedBook();
    if (!book) return;

    const picked = await open({
      multiple: false,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
      title: '选择要重新关联的 PDF 文件',
    });

    if (!picked || typeof picked !== 'string') return;

    const attempt = async (force: boolean) => {
      const result = await pdfLibraryService.relinkBook(book.id, picked, force);
      if (result.updated) {
        await loadData();
        const refreshed = books().find(b => b.id === book.id) || null;
        setSelectedBook(refreshed);

        if (result.suggestMove) {
          const move = await confirmAction('文件已重新关联，但不在 Workspace。是否将文件移动到 Workspace?', {
            title: '移动到 Workspace',
            kind: 'info',
            okLabel: '移动',
            cancelLabel: '不移动',
          });
          if (move) {
            await pdfLibraryService.moveBookToWorkspace(book.id);
            await loadData();
          }
        }

        alert('重新关联成功');
        return true;
      }

      if (result.needsConfirmation) {
        const forceConfirm = await confirmAction('未找到唯一标识，仅匹配名称/大小。是否强制关联？', {
          title: '强制关联',
          kind: 'warning',
          okLabel: '强制关联',
          cancelLabel: '取消',
        });
        if (forceConfirm) {
          return attempt(true);
        }
      } else {
        alert('未能关联，请选择正确的文件');
      }
      return false;
    };

    try {
      await attempt(false);
    } catch (error) {
      console.error('重新关联失败:', error);
      alert('重新关联失败');
    }
  };

  // ==================== 渲染 ====================
  
  return (
    <Show
      when={!isLoading()}
      fallback={<div class={styles.emptyState}>加载中...</div>}
    >
    {/* 如果显示标签管理器，则渲染标签管理器 */}
    <Show when={showTagManager()} fallback={
    <div 
      class={styles.container}
      onDragEnter={handleGlobalDragEnter}
      onDragLeave={handleGlobalDragLeave}
      onDragOver={(e) => { e.preventDefault(); }}
      onDrop={handleGlobalDrop}
    >
      {/* 拖拽覆盖层 */}
      <Show when={dragOver()}>
        <div class={styles.dragOverlay}>
          <div class={styles.overlayContent}>
            <div class={styles.overlayMode}>
              <div class={styles.modeIcon}>📥</div>
              <div class={styles.modeTitle}>添加到 Inbox</div>
              <div class={styles.modeDesc}>释放以添加 PDF 文件</div>
            </div>
          </div>
        </div>
      </Show>

      {/* 左侧导航栏 */}
      <div class={styles.sidebar}>
        <div class={styles.sidebarSection}>
          <div class={styles.sidebarTitle}>书库</div>
          <div 
            class={styles.navItem}
            classList={{ [styles.active]: selectedDirectoryId() === null }}
            onClick={() => setAndSaveDirectoryId(null)}
          >
            <span class={styles.navIcon}>📚</span>
            <span class={styles.navLabel}>全部书籍</span>
            <span class={styles.navCount}>{books().length}</span>
          </div>
          
          <For each={directories()}>
            {(dir) => (
              <div 
                class={styles.navItem}
                classList={{ [styles.active]: selectedDirectoryId() === dir.id }}
                onClick={() => setAndSaveDirectoryId(dir.id)}
              >
                <span class={styles.navIcon}>
                  {dir.type === 'workspace' ? '📁' : '🔗'}
                </span>
                <span class={styles.navLabel}>{dir.name}</span>
              </div>
            )}
          </For>
        </div>
        
        <div class={styles.sidebarSection}>
          <div class={styles.sidebarTitle}>分类</div>
          <div 
            class={styles.navItem}
            classList={{ [styles.active]: selectedCategoryId() === null }}
            onClick={() => setAndSaveCategoryId(null)}
          >
            <span class={styles.navIcon}>📂</span>
            <span class={styles.navLabel}>全部分类</span>
          </div>
          <div 
            class={styles.navItem}
            classList={{ [styles.active]: selectedCategoryId() === -1 }}
            onClick={() => setAndSaveCategoryId(-1)}
          >
            <span class={styles.navIcon}>📭</span>
            <span class={styles.navLabel}>未分类</span>
            <span class={styles.navCount}>
              {books().filter(b => !b.categoryId).length}
            </span>
          </div>
          <For each={categories()}>
            {(category) => {
              const categoryBooks = () => books().filter(b => b.categoryId === category.id).length;
              const isDropTarget = () => dropTargetCategoryId() === category.id;
              
              return (
                <div 
                  class={styles.navItem}
                  classList={{ 
                    [styles.active]: selectedCategoryId() === category.id,
                    [styles.dropTarget]: isDropTarget()
                  }}
                  onClick={() => setAndSaveCategoryId(category.id)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (e.dataTransfer) {
                      e.dataTransfer.dropEffect = 'move';
                    }
                    setDropTargetCategoryId(category.id);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    setDropTargetCategoryId(null);
                  }}
                  onDrop={async (e) => {
                    e.preventDefault();
                    setDropTargetCategoryId(null);
                    const book = draggedBook();
                    if (book && book.categoryId !== category.id) {
                      try {
                        await pdfLibraryService.updateBookCategory(book.id, category.id);
                        setBooks(prev => prev.map(b => 
                          b.id === book.id ? { ...b, categoryId: category.id } : b
                        ));
                        if (selectedBook()?.id === book.id) {
                          setSelectedBook({ ...book, categoryId: category.id });
                        }
                      } catch (error) {
                        console.error('更新分类失败:', error);
                      }
                    }
                    setDraggedBook(null);
                  }}
                >
                  <span class={styles.navIcon}>{category.icon || '📑'}</span>
                  <span 
                    class={styles.navLabel}
                    style={category.color ? { color: category.color } : {}}
                  >
                    {category.name}
                  </span>
                  <span class={styles.navCount}>{categoryBooks()}</span>
                </div>
              );
            }}
          </For>
        </div>
        
        <div class={styles.sidebarSection}>
          <div class={styles.sidebarTitle}>标签</div>
          <For each={tags()}>
            {(tag) => {
              const isSelected = () => selectedTagIds().includes(tag.id);
              const isExcluded = () => excludedTagIds().includes(tag.id);
              
              // 获取所有需要添加的标签ID（包括父标签）
              const getTagIdsWithParents = (tagId: number): number[] => {
                const result = [tagId];
                const currentTag = tags().find(t => t.id === tagId);
                if (currentTag?.parentId) {
                  result.push(...getTagIdsWithParents(currentTag.parentId));
                }
                return result;
              };
              
              return (
                <div 
                  class={styles.navItem}
                  classList={{ 
                    [styles.active]: isSelected(),
                    [styles.excluded]: isExcluded()
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    const tagIdsToAdd = getTagIdsWithParents(tag.id);
                    const currentSelected = selectedTagIds();
                    const currentExcluded = excludedTagIds();
                    
                    // 移除排除状态
                    const newExcluded = currentExcluded.filter(id => !tagIdsToAdd.includes(id));
                    setAndSaveExcludedTagIds(newExcluded);
                    
                    // 切换选中状态
                    if (isSelected()) {
                      setAndSaveTagIds(currentSelected.filter(id => !tagIdsToAdd.includes(id)));
                    } else {
                      setAndSaveTagIds([...currentSelected, ...tagIdsToAdd.filter(id => !currentSelected.includes(id))]);
                    }
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    const currentExcluded = excludedTagIds();
                    const currentSelected = selectedTagIds();
                    
                    // 移除选中状态
                    setAndSaveTagIds(currentSelected.filter(id => id !== tag.id));
                    
                    // 切换排除状态
                    if (isExcluded()) {
                      setAndSaveExcludedTagIds(currentExcluded.filter(id => id !== tag.id));
                    } else {
                      setAndSaveExcludedTagIds([...currentExcluded, tag.id]);
                    }
                  }}
                >
                  <span class={styles.navIcon}>🏷️</span>
                  <span class={styles.navLabel}>
                    {tag.name}
                    <Show when={tag.aliases}>
                      <span class={styles.tagAliases}> ({tag.aliases})</span>
                    </Show>
                  </span>
                  <Show when={tag.bookCount}>
                    <span class={styles.navCount}>{tag.bookCount}</span>
                  </Show>
                </div>
              );
            }}
          </For>
        </div>

        <div class={styles.sidebarSection}>
          <div class={styles.sidebarTitle}>设置</div>
          <div 
            class={styles.navItem} 
            classList={{ [styles.active]: showTagManager() }}
            onClick={() => setShowTagManager(!showTagManager())}
          >
            <span class={styles.navIcon}>🏷️</span>
            <span class={styles.navLabel}>标签管理器</span>
          </div>
          <div class={styles.navItem} onClick={handleChangeWorkspace}>
            <span class={styles.navIcon}>⚙️</span>
            <span class={styles.navLabel}>设置 Workspace</span>
          </div>
          <div class={styles.navItem} onClick={handleOpenWorkspaceFolder}>
            <span class={styles.navIcon}>📂</span>
            <span class={styles.navLabel}>打开 Workspace</span>
          </div>
          <div class={styles.navItem} onClick={handleRemoveMissing}>
            <span class={styles.navIcon}>🧹</span>
            <span class={styles.navLabel}>清理缺失文件</span>
          </div>
          <div class={styles.navItem} onClick={handleRescanAll}>
            <span class={styles.navIcon}>🔄</span>
            <span class={styles.navLabel}>
              {isRescanning() ? '检查中...' : '刷新并标记缺失'}
            </span>
          </div>
        </div>
      </div>

      {/* 主内容区 */}
      <div class={styles.main}>
        {/* 工具栏 */}
        <div class={styles.toolbar}>
          {/* 批量选择模式切换 */}
          <button
            class={styles.toolbarButton}
            classList={{ [styles.active]: selectionMode() }}
            onClick={() => {
              setSelectionMode(!selectionMode());
              if (!selectionMode()) {
                setSelectedBookIds([]);
              }
            }}
            title="批量选择模式"
          >
            {selectionMode() ? '✓ 选择中' : '☐ 批量选择'}
          </button>
          
          {/* 批量操作按钮 - 仅在选择模式下显示 */}
          <Show when={selectionMode() && selectedBookIds().length > 0}>
            <div class={styles.batchActions}>
              <span class={styles.selectionCount}>已选 {selectedBookIds().length} 本</span>
              
              <button
                class={styles.toolbarButton}
                onClick={() => setSelectedBookIds([...filteredBooks().map(b => b.id)])}
                title="全选"
              >
                全选
              </button>
              
              <button
                class={styles.toolbarButton}
                onClick={() => setSelectedBookIds([])}
                title="取消选择"
              >
                清空
              </button>
              
              <div class={styles.batchActionGroup}>
                <button
                  class={styles.toolbarButton}
                  onClick={() => setShowBatchCategorySelect(!showBatchCategorySelect())}
                  title="批量移动到分类"
                >
                  📁 移动分类
                </button>
                <Show when={showBatchCategorySelect()}>
                  <div class={styles.dropdownMenu}>
                    <For each={categories()}>
                      {(category) => (
                        <div
                          class={styles.dropdownItem}
                          onClick={async () => {
                            for (const bookId of selectedBookIds()) {
                              await pdfLibraryService.updateBookCategory(bookId, category.id);
                            }
                            setBooks(prev => prev.map(b => 
                              selectedBookIds().includes(b.id) ? { ...b, categoryId: category.id } : b
                            ));
                            setShowBatchCategorySelect(false);
                          }}
                        >
                          {category.icon || '📑'} {category.name}
                        </div>
                      )}
                    </For>
                    <div
                      class={styles.dropdownItem}
                      onClick={async () => {
                        for (const bookId of selectedBookIds()) {
                          await pdfLibraryService.updateBookCategory(bookId, undefined);
                        }
                        setBooks(prev => prev.map(b => 
                          selectedBookIds().includes(b.id) ? { ...b, categoryId: undefined } : b
                        ));
                        setShowBatchCategorySelect(false);
                      }}
                    >
                      🚫 移除分类
                    </div>
                  </div>
                </Show>
              </div>
              
              <div class={styles.batchActionGroup}>
                <button
                  class={styles.toolbarButton}
                  onClick={() => setShowBatchTagInput(!showBatchTagInput())}
                  title="批量添加标签"
                >
                  🏷️ 添加标签
                </button>
                <Show when={showBatchTagInput()}>
                  <div class={styles.dropdownMenu}>
                    <input
                      class={styles.batchTagInputField}
                      type="text"
                      placeholder="输入标签名..."
                      value={batchTagInput()}
                      onInput={(e) => setBatchTagInput(e.currentTarget.value)}
                      onKeyPress={async (e) => {
                        if (e.key === 'Enter' && batchTagInput().trim()) {
                          const tagName = batchTagInput().trim();
                          let tag = tags().find(t => t.name === tagName);
                          if (!tag) {
                            tag = await pdfLibraryService.createTag(tagName);
                            setTags([...tags(), tag]);
                          }
                          for (const bookId of selectedBookIds()) {
                            await pdfLibraryService.addTagToBook(bookId, tag.id);
                          }
                          await loadData();
                          setBatchTagInput('');
                          setShowBatchTagInput(false);
                        }
                      }}
                    />
                    <div class={styles.tagSuggestionsList}>
                      <For each={tags()}>
                        {(tag) => (
                          <div
                            class={styles.dropdownItem}
                            onClick={async () => {
                              for (const bookId of selectedBookIds()) {
                                await pdfLibraryService.addTagToBook(bookId, tag.id);
                              }
                              await loadData();
                              setShowBatchTagInput(false);
                            }}
                          >
                            🏷️ {tag.name}
                          </div>
                        )}
                      </For>
                    </div>
                  </div>
                </Show>
              </div>
              
              <button
                class={`${styles.toolbarButton} ${styles.dangerButton}`}
                onClick={async () => {
                  const ok = await confirmAction(`确定要删除选中的 ${selectedBookIds().length} 本书籍吗?（仅删除记录，不删除文件）`, {
                    title: '批量删除书籍记录',
                    kind: 'warning',
                    okLabel: '删除',
                    cancelLabel: '取消',
                  });
                  if (!ok) return;
                  for (const bookId of selectedBookIds()) {
                    await pdfLibraryService.deleteBook(bookId, false);
                  }
                  await loadData();
                  setSelectedBookIds([]);
                }}
                title="批量删除"
              >
                🗑️ 删除
              </button>
            </div>
          </Show>
          
          {/* 原有工具栏按钮 */}
          <Show when={!selectionMode()}>
            <input
              class={styles.searchBox}
              type="text"
              placeholder="搜索书籍..."
              value={searchText()}
              onInput={(e) => setAndSaveSearchText(e.currentTarget.value)}
            />

            <button
              class={styles.toolbarButton}
              onClick={handleRefreshAllMetadata}
              disabled={isRefreshingMetadata() || isLoading()}
              title="重新提取所有 PDF 元数据"
            >
              {isRefreshingMetadata() ? '重新提取中...' : '重新提取信息'}
            </button>
          </Show>
          
          <div class={styles.viewToggle}>
            <button
              class={styles.viewButton}
              classList={{ [styles.active]: viewType() === 'grid' }}
              onClick={() => setAndSaveViewType('grid')}
              title="网格视图"
            >
              ⊞
            </button>
            <button
              class={styles.viewButton}
              classList={{ [styles.active]: viewType() === 'list' }}
              onClick={() => setAndSaveViewType('list')}
              title="列表视图"
            >
              ☰
            </button>
          </div>
        </div>

        {/* 书籍列表 */}
        <div class={styles.content}>
          <div class={styles.bookList}>
            <Show
              when={filteredBooks().length > 0}
              fallback={
                <div class={styles.emptyState}>
                  <div class={styles.emptyIcon}>📚</div>
                  <div class={styles.emptyTitle}>还没有书籍</div>
                  <div class={styles.emptyText}>
                    将 PDF 文件拖入 Inbox 文件夹开始使用
                  </div>
                </div>
              }
            >
              <Show when={viewType() === 'grid'}>
                <div class={styles.gridView}>
                  <For each={filteredBooks()}>
                    {(book) => (
                      <div
                        class={styles.bookCard}
                        classList={{ 
                          [styles.selected]: selectedBook()?.id === book.id, 
                          [styles.missing]: book.isMissing,
                          [styles.dragging]: draggedBook()?.id === book.id,
                          [styles.batchSelected]: selectedBookIds().includes(book.id)
                        }}
                        draggable={!selectionMode()}
                        onDragStart={(e) => {
                          if (!selectionMode()) {
                            setDraggedBook(book);
                            if (e.dataTransfer) {
                              e.dataTransfer.effectAllowed = 'move';
                              e.dataTransfer.setData('text/plain', book.id.toString());
                            }
                          }
                        }}
                        onDragEnd={() => {
                          setDraggedBook(null);
                          setDropTargetCategoryId(null);
                        }}
                        onClick={() => {
                          if (selectionMode()) {
                            setSelectedBookIds(prev => 
                              prev.includes(book.id)
                                ? prev.filter(id => id !== book.id)
                                : [...prev, book.id]
                            );
                          } else {
                            handleSelectBook(book);
                          }
                        }}
                        onDblClick={() => !selectionMode() && handleOpenBook(book)}
                      >
                        {/* 批量选择复选框 */}
                        <Show when={selectionMode()}>
                          <div 
                            class={styles.selectionCheckbox}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              checked={selectedBookIds().includes(book.id)}
                              onChange={(e) => {
                                e.stopPropagation();
                                setSelectedBookIds(prev => 
                                  prev.includes(book.id)
                                    ? prev.filter(id => id !== book.id)
                                    : [...prev, book.id]
                                );
                              }}
                            />
                          </div>
                        </Show>
                        
                        <div class={styles.bookCover}>
                          <Show when={book.isMissing}>
                            <span class={styles.missingBadge}>缺失</span>
                          </Show>
                          <Show
                            when={book.coverImage}
                            fallback={<span>📄</span>}
                          >
                            <img src={`data:image/jpeg;base64,${book.coverImage}`} alt={book.title} />
                          </Show>
                          <Show when={!book.isManaged}>
                            <span class={styles.externalBadge}>🔗</span>
                          </Show>
                        </div>
                        <div class={styles.bookTitle}>{book.title}</div>
                        <div class={styles.bookMeta}>
                          {book.author || '未知作者'} · {book.pageCount} 页
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              </Show>

              <Show when={viewType() === 'list'}>
                <div class={styles.listView}>
                  <For each={filteredBooks()}>
                    {(book) => (
                      <div
                        class={styles.bookRow}
                        classList={{ [styles.selected]: selectedBook()?.id === book.id, [styles.missing]: book.isMissing }}
                        onClick={() => handleSelectBook(book)}
                        onDblClick={() => handleOpenBook(book)}
                      >
                        <div class={styles.rowCover}>
                          <Show when={book.isMissing}>
                            <span class={styles.missingBadge}>缺失</span>
                          </Show>
                          <Show
                            when={book.coverImage}
                            fallback={<span>📄</span>}
                          >
                            <img src={`data:image/jpeg;base64,${book.coverImage}`} alt={book.title} />
                          </Show>
                        </div>
                        <div class={styles.rowInfo}>
                          <div class={styles.rowTitle}>
                            {book.title}
                            <Show when={!book.isManaged}>
                              <span style={{ "margin-left": "8px" }}>🔗</span>
                            </Show>
                          </div>
                          <div class={styles.rowMeta}>
                            <span>{book.author || '未知作者'}</span>
                            <span>{book.pageCount} 页</span>
                            <span>{new Date(book.importDate).toLocaleDateString()}</span>
                          </div>
                        </div>
                        <div class={styles.rowTags}>
                          <For each={book.tags}>
                            {(tag) => (
                              <span class={styles.tag} style={{ background: tag.color }}>
                                {tag.name}
                              </span>
                            )}
                          </For>
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </Show>
          </div>

          {/* 右侧检查器 */}
          <div class={styles.inspector}>
            <Show
              when={selectedBook()}
              fallback={
                <div class={styles.inspectorEmpty}>
                  选择一本书查看详情
                </div>
              }
            >
              {(book) => (
                <>
                  {/* 封面 */}
                  <div class={styles.inspectorCover}>
                    <Show
                      when={book().coverImage}
                      fallback={<span>📄</span>}
                    >
                      <img src={`data:image/jpeg;base64,${book().coverImage}`} alt={book().title} />
                    </Show>
                    <button 
                      class={styles.updateCoverButton}
                      onClick={handleUpdateCover}
                      title="更新封面"
                    >
                      🔄 更新封面
                    </button>
                  </div>

                  {/* 标题 */}
                  <div class={styles.inspectorField}>
                    <div class={styles.fieldLabel}>标题</div>
                    <Show
                      when={editingTitle()}
                      fallback={
                        <div 
                          class={styles.fieldValue}
                          onClick={() => setEditingTitle(true)}
                          style={{ cursor: 'pointer' }}
                        >
                          {book().title}
                        </div>
                      }
                    >
                      <input
                        class={styles.fieldInput}
                        type="text"
                        value={newTitle()}
                        onInput={(e) => setNewTitle(e.currentTarget.value)}
                        onBlur={handleSaveTitle}
                        onKeyPress={(e) => e.key === 'Enter' && handleSaveTitle()}
                        autofocus
                      />
                    </Show>
                  </div>

                  {/* 元数据 */}
                  <div class={styles.inspectorField}>
                    <div class={styles.fieldLabel}>作者</div>
                    <div class={styles.fieldValue}>{book().author || '未知'}</div>
                  </div>

                  <div class={styles.inspectorField}>
                    <div class={styles.fieldLabel}>页数</div>
                    <div class={styles.fieldValue}>{book().pageCount}</div>
                  </div>

                  <div class={styles.inspectorField}>
                    <div class={styles.fieldLabel}>文件大小</div>
                    <div class={styles.fieldValue}>
                      {(book().fileSize / 1024 / 1024).toFixed(2)} MB
                    </div>
                  </div>

                  <div class={styles.inspectorField}>
                    <div class={styles.fieldLabel}>导入日期</div>
                    <div class={styles.fieldValue}>
                      {new Date(book().importDate).toLocaleString()}
                    </div>
                  </div>

                  {/* 分类 */}
                  <div class={styles.inspectorField}>
                    <div class={styles.fieldLabel}>分类</div>
                    <select 
                      class={styles.categorySelect}
                      value={book().categoryId || ''}
                      onChange={async (e) => {
                        const value = e.currentTarget.value;
                        const categoryId = value ? parseInt(value) : undefined;
                        try {
                          await pdfLibraryService.updateBookCategory(book().id, categoryId);
                          // 更新本地状态
                          setBooks(prev => prev.map(b => 
                            b.id === book().id ? { ...b, categoryId } : b
                          ));
                          setSelectedBook({ ...book(), categoryId });
                        } catch (error) {
                          console.error('更新分类失败:', error);
                        }
                      }}
                    >
                      <option value="">未分类</option>
                      <For each={categories()}>
                        {(category) => (
                          <option value={category.id}>
                            {category.icon || '📑'} {category.name}
                          </option>
                        )}
                      </For>
                    </select>
                  </div>

                  {/* 标签 */}
                  <div class={styles.inspectorField}>
                    <div class={styles.fieldLabel}>标签</div>
                    <div class={styles.tagList}>
                      <For each={book().tags}>
                        {(tag) => (
                          <span class={styles.tag} style={{ background: tag.color }}>
                            {tag.name}
                            <span 
                              class={styles.tagRemove}
                              onClick={() => handleRemoveTag(tag.id)}
                            >
                              ×
                            </span>
                          </span>
                        )}
                      </For>
                      <div class={styles.tagInputWrapper}>
                        <input
                          class={styles.tagInput}
                          type="text"
                          placeholder="添加标签..."
                          value={tagInputValue()}
                          onInput={handleTagInput}
                          onKeyPress={handleAddTag}
                          onBlur={() => setTimeout(() => setTagSuggestions([]), 200)}
                        />
                        <Show when={tagSuggestions().length > 0}>
                          <div class={styles.tagSuggestions}>
                            <For each={tagSuggestions()}>
                              {(tag) => (
                                <div 
                                  class={styles.tagSuggestionItem}
                                  onClick={() => handleSelectSuggestion(tag)}
                                >
                                  <span class={styles.tagColorDot} style={{ background: tag.color || '#ccc' }}></span>
                                  {tag.name}
                                </div>
                              )}
                            </For>
                          </div>
                        </Show>
                      </div>
                    </div>
                  </div>

                  <Show when={book().isMissing}>
                    <div class={styles.inspectorField}>
                      <div class={styles.fieldLabel}>状态</div>
                      <div class={styles.fieldValue} style={{ color: 'var(--vscode-statusBarItem-errorForeground)' }}>
                        文件缺失，无法打开。
                      </div>
                      <div class={styles.actionButtons}>
                        <button class={`${styles.actionButton} ${styles.primary}`} onClick={handleRelink}>
                          🔗 重新关联文件
                        </button>
                      </div>
                    </div>
                  </Show>

                  {/* 操作按钮 */}
                  <div class={styles.actionButtons}>
                    <button 
                      class={`${styles.actionButton} ${styles.primary}`}
                      onClick={handleOpenFile}
                    >
                      📖 打开文件
                    </button>
                    <button 
                      class={styles.actionButton}
                      onClick={handleShowInFolder}
                    >
                      📁 在文件夹中显示
                    </button>
                    <button 
                      class={styles.actionButton}
                      onClick={handleCopyFile}
                    >
                      📋 复制文件
                    </button>
                    <Show when={!book().isManaged}>
                      <div style={{ 
                        "font-size": "11px", 
                        "opacity": "0.6", 
                        "padding": "8px",
                        "text-align": "center" 
                      }}>
                        此文件位于外部库,无法重命名
                      </div>
                    </Show>
                  </div>
                </>
              )}
            </Show>
          </div>
        </div>
      </div>
    </div>
    }>
      <TagManager onBack={() => setShowTagManager(false)} />
    </Show>
    </Show>
  );
};

export default PDFLibrary;
