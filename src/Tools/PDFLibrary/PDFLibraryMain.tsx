// src/Tools/PDFLibrary/PDFL.tsx
import { Component, createSignal, onMount, onCleanup, For, Show, createMemo } from 'solid-js';
import { open } from '@tauri-apps/plugin-dialog';
import { listen } from '@tauri-apps/api/event';
import { pdfLibraryService } from './PDFLibraryService';
import type { Book, Tag, Directory, ViewType, SortField, SortOrder } from './types';
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
  
  const [selectedBook, setSelectedBook] = createSignal<Book | null>(null);
  const [viewType, setViewType] = createSignal<ViewType>('grid');
  
  // 过滤和排序
  const [searchText, setSearchText] = createSignal('');
  const [selectedTagIds, setSelectedTagIds] = createSignal<number[]>([]);
  const [selectedDirectoryId, setSelectedDirectoryId] = createSignal<number | null>(null);
  const [sortField] = createSignal<SortField>('importDate');
  const [sortOrder] = createSignal<SortOrder>('desc');
  
  // UI 状态
  const [isLoading, setIsLoading] = createSignal(true);
  const [editingTitle, setEditingTitle] = createSignal(false);
  const [newTitle, setNewTitle] = createSignal('');
  const [tagInputValue, setTagInputValue] = createSignal('');
  const [tagSuggestions, setTagSuggestions] = createSignal<Tag[]>([]);

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
    if (tagIds.length > 0) {
      result = result.filter(book =>
        book.tags?.some(tag => tagIds.includes(tag.id))
      );
    }
    
    // 目录过滤
    const dirId = selectedDirectoryId();
    if (dirId !== null) {
      result = result.filter(book => book.directoryId === dirId);
    }
    
    return result;
  });

  // ==================== 生命周期 ====================
  
  onMount(async () => {
    console.log('[PDFLibrary] onMount 被调用, isLoading =', isLoading());
    
    // 监听后端更新事件
    const unlisten = await listen('pdf-library-update', () => {
      console.log('[PDFLibrary] 收到更新事件，正在刷新数据...');
      loadData();
    });
    
    onCleanup(() => {
      unlisten();
    });

    try {
      console.log('[PDFLibrary] 开始初始化数据库...');
      const initResult = await pdfLibraryService.initDatabase();
      console.log('[PDFLibrary] 数据库初始化成功:', initResult);
      
      console.log('[PDFLibrary] 开始加载数据...');
      await loadData();
      console.log('[PDFLibrary] 数据加载完成');
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
      const [booksData, tagsData, dirsData] = await Promise.all([
        pdfLibraryService.getAllBooks(undefined, sortField(), sortOrder()),
        pdfLibraryService.getAllTags(),
        pdfLibraryService.getAllDirectories(),
      ]);
      
      setBooks(booksData);
      setTags(tagsData);
      setDirectories(dirsData);
    } catch (error) {
      console.error('加载数据失败:', error);
    }
  };

  // ==================== 书籍操作 ====================
  
  const handleSelectBook = async (book: Book) => {
    setSelectedBook(book);
    setEditingTitle(false);
    setNewTitle(book.title);
    
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

  // ==================== 标签操作 ====================
  
  const handleAddTag = async (e: KeyboardEvent) => {
    if (e.key !== 'Enter') return;
    
    const book = selectedBook();
    const tagName = tagInputValue().trim();
    if (!book || !tagName) return;
    
    try {
      // 查找或创建标签
      let tag = tags().find(t => t.name === tagName);
      if (!tag) {
        tag = await pdfLibraryService.createTag(tagName);
        setTags(prev => [...prev, tag!]);
      }
      
      // 关联到书籍
      await pdfLibraryService.addTagToBook(book.id, tag.id);
      
      // 更新本地状态
      const updatedTags = [...(book.tags || []), tag];
      setBooks(prev => prev.map(b =>
        b.id === book.id ? { ...b, tags: updatedTags } : b
      ));
      setSelectedBook({ ...book, tags: updatedTags });
      
      setTagInputValue('');
    } catch (error) {
      console.error('添加标签失败:', error);
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

  // ==================== 渲染 ====================
  
  return (
    <Show
      when={!isLoading()}
      fallback={<div class={styles.emptyState}>加载中...</div>}
    >
    <div class={styles.container}>
      {/* 左侧导航栏 */}
      <div class={styles.sidebar}>
        <div class={styles.sidebarSection}>
          <div class={styles.sidebarTitle}>书库</div>
          <div 
            class={styles.navItem}
            classList={{ [styles.active]: selectedDirectoryId() === null }}
            onClick={() => setSelectedDirectoryId(null)}
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
                onClick={() => setSelectedDirectoryId(dir.id)}
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
          <div class={styles.sidebarTitle}>标签</div>
          <For each={tags()}>
            {(tag) => (
              <div 
                class={styles.navItem}
                classList={{ [styles.active]: selectedTagIds().includes(tag.id) }}
                onClick={() => {
                  const ids = selectedTagIds();
                  setSelectedTagIds(
                    ids.includes(tag.id)
                      ? ids.filter(id => id !== tag.id)
                      : [...ids, tag.id]
                  );
                }}
              >
                <span class={styles.navIcon}>🏷️</span>
                <span class={styles.navLabel}>{tag.name}</span>
                <Show when={tag.bookCount}>
                  <span class={styles.navCount}>{tag.bookCount}</span>
                </Show>
              </div>
            )}
          </For>
        </div>

        <div class={styles.sidebarSection}>
          <div class={styles.sidebarTitle}>设置</div>
          <div class={styles.navItem} onClick={handleChangeWorkspace}>
            <span class={styles.navIcon}>⚙️</span>
            <span class={styles.navLabel}>设置 Workspace</span>
          </div>
        </div>
      </div>

      {/* 主内容区 */}
      <div class={styles.main}>
        {/* 工具栏 */}
        <div class={styles.toolbar}>
          <input
            class={styles.searchBox}
            type="text"
            placeholder="搜索书籍..."
            value={searchText()}
            onInput={(e) => setSearchText(e.currentTarget.value)}
          />
          
          <div class={styles.viewToggle}>
            <button
              class={styles.viewButton}
              classList={{ [styles.active]: viewType() === 'grid' }}
              onClick={() => setViewType('grid')}
              title="网格视图"
            >
              ⊞
            </button>
            <button
              class={styles.viewButton}
              classList={{ [styles.active]: viewType() === 'list' }}
              onClick={() => setViewType('list')}
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
                        classList={{ [styles.selected]: selectedBook()?.id === book.id }}
                        onClick={() => handleSelectBook(book)}
                      >
                        <div class={styles.bookCover}>
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
                        classList={{ [styles.selected]: selectedBook()?.id === book.id }}
                        onClick={() => handleSelectBook(book)}
                      >
                        <div class={styles.rowCover}>
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
    </Show>
  );
};

export default PDFLibrary;
