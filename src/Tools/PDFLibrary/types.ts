// src/Tools/PDFLibrary/types.ts

/**
 * PDF 文件元数据
 */
export interface PDFMetadata {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  creator?: string;
  producer?: string;
  creationDate?: string;
  modificationDate?: string;
  pageCount: number;
}

/**
 * 文件身份识别信息 (Windows File ID)
 */
export interface FileIdentity {
  volumeId: number;      // 磁盘序列号
  fileIndex: number;     // 文件唯一 ID
  fileSize: number;      // 文件大小
}

/**
 * 书籍记录
 */
export interface Book {
  id: number;
  title: string;           // 逻辑标题 (用户可修改)
  filename: string;        // 文件名
  filepath: string;        // 完整路径
  directoryId: number;     // 所属目录 ID
  isManaged: boolean;      // 是否为主库文件 (可重命名)
  isMissing: boolean;      // 文件是否缺失
  
  // 文件身份
  volumeId: number;
  fileIndex: number;
  fileSize: number;
  
  // 元数据
  author?: string;
  pageCount: number;
  
  // 封面
  coverImage?: string;     // Base64 编码的封面图
  
  // 时间戳
  importDate: string;      // 入库时间 (ISO 8601)
  modifiedDate: string;    // 最后修改时间
  
  // 标签 (多对多关系,在查询时动态加载)
  tags?: Tag[];
}

/**
 * 标签
 */
export interface Tag {
  id: number;
  name: string;
  color?: string;          // 颜色 (Hex)
  parentId?: number;       // 父标签 ID (支持嵌套)
  bookCount?: number;      // 关联的书籍数量
}

/**
 * 目录/来源
 */
export interface Directory {
  id: number;
  path: string;
  type: 'workspace' | 'external';  // 主库 or 外部库
  name: string;            // 显示名称
  isMonitoring: boolean;   // 是否正在监控
}

/**
 * 书籍-标签关联
 */
export interface BookTag {
  bookId: number;
  tagId: number;
}

/**
 * 视图类型
 */
export type ViewType = 'grid' | 'list' | 'timeline';

/**
 * 排序字段
 */
export type SortField = 'title' | 'importDate' | 'modifiedDate' | 'author' | 'pageCount';

/**
 * 排序方向
 */
export type SortOrder = 'asc' | 'desc';

/**
 * 过滤条件
 */
export interface FilterOptions {
  searchText?: string;
  tags?: number[];         // 标签 ID 数组
  directoryId?: number;    // 目录 ID
  isManaged?: boolean;     // 仅主库/仅外部库
  dateRange?: {
    start: string;
    end: string;
  };
}

/**
 * 重命名结果
 */
export interface RenameResult {
  success: boolean;
  newPath: string;
  error?: string;
}

/**
 * 文件查找结果
 */
export interface FileLocateResult {
  found: boolean;
  path?: string;
  needsUpdate: boolean;    // 是否需要更新数据库路径
}

export interface RelinkResult {
  updated: boolean;
  confidence: string;        // id | name_size | mismatch | force_replace
  needsConfirmation: boolean;
  suggestMove: boolean;
  newPath?: string;
}
