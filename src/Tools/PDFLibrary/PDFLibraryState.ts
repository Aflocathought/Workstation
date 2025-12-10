// src/Tools/PDFLibrary/PDFLibraryState.ts
/**
 * PDF图书馆状态持久化
 * 保存和恢复用户的浏览状态
 */

const STATE_STORAGE_KEY = 'pdf-library-state';

export interface PDFLibraryState {
  // 当前选择的过滤条件
  selectedDirectoryId: number | null;
  selectedCategoryId: number | null;
  selectedTagIds: number[];
  excludedTagIds: number[];
  
  // 当前选中的书籍
  selectedBookId: number | null;
  
  // 视图设置
  viewType: 'grid' | 'list' | 'timeline';
  searchText: string;
  
  // 最后更新时间
  lastUpdated: number;
}

const DEFAULT_STATE: PDFLibraryState = {
  selectedDirectoryId: null,
  selectedCategoryId: null,
  selectedTagIds: [],
  excludedTagIds: [],
  selectedBookId: null,
  viewType: 'grid',
  searchText: '',
  lastUpdated: Date.now(),
};

/**
 * 保存状态到 localStorage
 */
export function saveState(state: Partial<PDFLibraryState>): void {
  try {
    const currentState = loadState();
    const newState: PDFLibraryState = {
      ...currentState,
      ...state,
      lastUpdated: Date.now(),
    };
    localStorage.setItem(STATE_STORAGE_KEY, JSON.stringify(newState));
  } catch (error) {
    console.error('[PDFLibraryState] 保存状态失败:', error);
  }
}

/**
 * 从 localStorage 加载状态
 */
export function loadState(): PDFLibraryState {
  try {
    const stored = localStorage.getItem(STATE_STORAGE_KEY);
    if (!stored) {
      return DEFAULT_STATE;
    }
    
    const parsed = JSON.parse(stored);
    
    // 验证状态的有效性
    return {
      selectedDirectoryId: typeof parsed.selectedDirectoryId === 'number' ? parsed.selectedDirectoryId : null,
      selectedCategoryId: typeof parsed.selectedCategoryId === 'number' ? parsed.selectedCategoryId : null,
      selectedTagIds: Array.isArray(parsed.selectedTagIds) ? parsed.selectedTagIds : [],
      excludedTagIds: Array.isArray(parsed.excludedTagIds) ? parsed.excludedTagIds : [],
      selectedBookId: typeof parsed.selectedBookId === 'number' ? parsed.selectedBookId : null,
      viewType: parsed.viewType === 'list' ? 'list' : 'grid',
      searchText: typeof parsed.searchText === 'string' ? parsed.searchText : '',
      lastUpdated: parsed.lastUpdated || Date.now(),
    };
  } catch (error) {
    console.error('[PDFLibraryState] 加载状态失败:', error);
    return DEFAULT_STATE;
  }
}

/**
 * 清除保存的状态
 */
export function clearState(): void {
  try {
    localStorage.removeItem(STATE_STORAGE_KEY);
  } catch (error) {
    console.error('[PDFLibraryState] 清除状态失败:', error);
  }
}
