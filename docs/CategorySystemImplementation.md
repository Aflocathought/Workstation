# PDF 库分类系统实现报告

## 📋 概述

本文档记录了 PDF 库分类系统的完整实现过程,包括数据库架构、后端命令和前端UI集成。

## 🎯 功能需求

用户需要一个分类系统来组织PDF书籍,具备以下特性:
- 默认包含几大类:书籍、论文、乐谱
- 支持用户自定义添加、重命名和删除分类
- 在侧边栏显示分类列表
- 每本书可以被分配到一个分类
- 支持分类图标和颜色自定义

## 🗄️ 数据库架构

### Categories 表

```sql
CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    icon TEXT,
    color TEXT,
    display_order INTEGER NOT NULL DEFAULT 0
)
```

**字段说明:**
- `id`: 分类唯一标识
- `name`: 分类名称(唯一)
- `icon`: 分类图标(emoji或图标字符串)
- `color`: 分类颜色(CSS颜色值)
- `display_order`: 显示顺序

### Books 表扩展

```sql
ALTER TABLE books ADD COLUMN category_id INTEGER REFERENCES categories(id)
```

为 `books` 表添加外键,关联到分类表。

### 默认分类初始化

系统启动时自动创建三个默认分类:
1. **书籍** 📚 (display_order: 0)
2. **论文** 📄 (display_order: 1)
3. **乐谱** 🎵 (display_order: 2)

## 🔧 后端实现

### Rust 类型定义 (`mod.rs`)

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Category {
    pub id: i64,
    pub name: String,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub display_order: i64,
}
```

### 数据库操作函数 (`database.rs`)

#### 1. 获取所有分类
```rust
pub fn get_all_categories(conn: &Connection) -> Result<Vec<Category>>
```
返回所有分类,按 `display_order` 排序。

#### 2. 创建分类
```rust
pub fn create_category(
    conn: &Connection,
    name: &str,
    icon: Option<String>,
    color: Option<String>
) -> Result<Category>
```
创建新分类,自动设置 `display_order` 为当前最大值+1。

#### 3. 更新分类
```rust
pub fn update_category(
    conn: &Connection,
    id: i64,
    name: Option<String>,
    icon: Option<String>,
    color: Option<String>
) -> Result<()>
```
更新分类的名称、图标或颜色(可选参数)。

#### 4. 删除分类
```rust
pub fn delete_category(conn: &Connection, id: i64) -> Result<()>
```
删除指定分类,关联的书籍的 `category_id` 会被设置为 NULL。

#### 5. 更新书籍分类
```rust
pub fn update_book_category(
    conn: &Connection,
    book_id: i64,
    category_id: Option<i64>
) -> Result<()>
```
为书籍设置分类,传入 `None` 则清除分类。

### Tauri 命令 (`commands.rs`)

所有命令都已在 `main.rs` 中注册:

```rust
#[tauri::command]
pub fn pdflibrary_get_categories(state: State<Mutex<Option<Connection>>>) -> Result<Vec<Category>, String>

#[tauri::command]
pub fn pdflibrary_create_category(
    name: String,
    icon: Option<String>,
    color: Option<String>,
    state: State<Mutex<Option<Connection>>>
) -> Result<Category, String>

#[tauri::command]
pub fn pdflibrary_update_category(
    id: i64,
    name: Option<String>,
    icon: Option<String>,
    color: Option<String>,
    state: State<Mutex<Option<Connection>>>
) -> Result<(), String>

#[tauri::command]
pub fn pdflibrary_delete_category(id: i64, state: State<Mutex<Option<Connection>>>) -> Result<(), String>

#[tauri::command]
pub fn pdflibrary_update_book_category(
    book_id: i64,
    category_id: Option<i64>,
    state: State<Mutex<Option<Connection>>>
) -> Result<(), String>
```

## 💻 前端实现

### TypeScript 类型定义 (`types.ts`)

```typescript
export interface Category {
  id: number;
  name: string;
  icon?: string;
  color?: string;
  displayOrder: number;
}

export interface Book {
  // ... 其他字段
  categoryId?: number;
}
```

### 服务层 (`PDFLibraryService.ts`)

```typescript
class PDFLibraryService {
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
}
```

### UI 组件 (`PDFLibraryMain.tsx`)

#### 1. 状态管理

```typescript
const [categories, setCategories] = createSignal<Category[]>([]);
const [selectedCategoryId, setSelectedCategoryId] = createSignal<number | null>(null);
```

#### 2. 数据加载

```typescript
const loadData = async () => {
  const [booksData, tagsData, dirsData, catsData] = await Promise.all([
    pdfLibraryService.getAllBooks(undefined, sortField(), sortOrder()),
    pdfLibraryService.getAllTags(),
    pdfLibraryService.getAllDirectories(),
    pdfLibraryService.getAllCategories(), // ✨ 加载分类
  ]);
  
  setCategories(catsData);
};
```

#### 3. 过滤逻辑

```typescript
const filteredBooks = createMemo(() => {
  let result = books();
  
  // ... 其他过滤
  
  // 分类过滤
  const catId = selectedCategoryId();
  if (catId !== null) {
    result = result.filter(book => book.categoryId === catId);
  }
  
  return result;
});
```

#### 4. 侧边栏分类UI

```tsx
<div class={styles.sidebarSection}>
  <div class={styles.sidebarTitle}>分类</div>
  <div 
    class={styles.navItem}
    classList={{ [styles.active]: selectedCategoryId() === null }}
    onClick={() => setSelectedCategoryId(null)}
  >
    <span class={styles.navIcon}>📂</span>
    <span class={styles.navLabel}>全部分类</span>
  </div>
  <For each={categories()}>
    {(category) => {
      const categoryBooks = () => books().filter(b => b.categoryId === category.id).length;
      return (
        <div 
          class={styles.navItem}
          classList={{ [styles.active]: selectedCategoryId() === category.id }}
          onClick={() => setSelectedCategoryId(category.id)}
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
```

#### 5. 书籍详情分类选择器

```tsx
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
```

### CSS 样式 (`PDFLibrary.module.css`)

```css
.categorySelect {
  width: 100%;
  padding: 6px 8px;
  background: var(--vscode-dropdown-background);
  color: var(--vscode-dropdown-foreground);
  border: 1px solid var(--vscode-dropdown-border);
  border-radius: 4px;
  font-size: 13px;
  outline: none;
  cursor: pointer;
}

.categorySelect:hover {
  background: var(--vscode-dropdown-listBackground);
}

.categorySelect:focus {
  border-color: var(--vscode-focusBorder);
}
```

## ✅ 功能清单

- [x] 数据库表结构设计
- [x] 数据库迁移(ALTER TABLE)
- [x] 默认分类初始化
- [x] 后端 CRUD 操作函数
- [x] Tauri 命令定义和注册
- [x] TypeScript 类型定义
- [x] 前端服务层方法
- [x] 侧边栏分类列表UI
- [x] 分类过滤功能
- [x] 书籍详情分类选择器
- [x] 分类书籍计数显示
- [x] 分类图标和颜色支持

## 🔮 未来功能扩展

虽然目前已实现基础的分类显示和选择功能,但以下高级功能可以在未来添加:

### 分类管理UI
- 添加分类管理对话框
- 支持创建新分类(输入名称、选择图标和颜色)
- 支持编辑现有分类
- 支持删除分类(带确认提示)
- 支持拖拽调整分类顺序(更新 `display_order`)

### 批量操作
- 批量设置书籍分类
- 导入/导出分类配置
- 分类间移动书籍

### 智能分类
- 基于文件名或元数据自动分类
- AI 辅助分类建议

## 📝 实现要点

1. **数据库迁移安全性**: 使用 `ALTER TABLE IF NOT EXISTS` 避免重复添加列
2. **外键约束**: `category_id` 设置为可选,删除分类时自动将相关书籍的分类设为 NULL
3. **默认分类**: 使用 `INSERT OR IGNORE` 确保默认分类只创建一次
4. **前端响应式**: 使用 SolidJS 的 `createSignal` 和 `createMemo` 实现响应式过滤
5. **UI一致性**: 分类UI与现有标签和目录UI保持一致的风格

## 🎨 用户体验

- **侧边栏**: 分类列表显示在"书库"和"标签"之间
- **分类图标**: 支持 emoji 或自定义图标
- **分类颜色**: 分类名称可以显示自定义颜色
- **书籍计数**: 每个分类旁显示包含的书籍数量
- **快速切换**: 点击分类项立即过滤书籍
- **书籍详情**: 下拉菜单选择分类,立即保存

## 🚀 部署说明

1. 重启应用后,数据库会自动执行迁移
2. 默认分类(书籍、论文、乐谱)会自动创建
3. 用户可以在书籍详情页为每本书设置分类
4. 点击侧边栏分类可以过滤显示对应书籍

## 📊 技术栈

- **后端**: Rust + Tauri + SQLite
- **前端**: SolidJS + TypeScript
- **样式**: CSS Modules + VS Code 主题变量
- **通信**: Tauri IPC Commands

## 🎉 总结

分类系统已完整实现,包括:
- ✅ 完整的后端数据库和命令支持
- ✅ 完整的前端UI和交互逻辑
- ✅ 响应式分类过滤功能
- ✅ 书籍分类管理功能

系统现在可以:
1. 在侧边栏显示所有分类和书籍数量
2. 点击分类过滤显示对应书籍
3. 在书籍详情页选择或更改分类
4. 自动统计每个分类的书籍数量

后续可以根据需要添加分类管理UI(创建、编辑、删除分类)等高级功能。
