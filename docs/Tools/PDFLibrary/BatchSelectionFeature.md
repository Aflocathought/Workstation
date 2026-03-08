# PDF 库批量选择和批量操作功能实现报告

## 📋 概述

为 PDF 库添加了完整的批量选择和批量操作功能,用户可以通过复选框选择多本书籍,然后执行批量分类、批量添加标签、批量删除等操作。

## 🎯 功能特性

### 1. 批量选择模式

- **模式切换**: 工具栏左侧有"批量选择"按钮,点击进入/退出选择模式
- **复选框显示**: 选择模式下,每本书籍卡片左上角显示复选框
- **点击选择**: 点击书籍卡片或复选框进行选中/取消选中
- **全选/清空**: 选择模式下有快捷按钮快速全选或清空选择
- **选择计数**: 实时显示已选择的书籍数量

### 2. 批量操作功能

#### 批量移动分类 📁
- 点击"移动分类"按钮打开分类下拉菜单
- 选择目标分类,所有选中的书籍移动到该分类
- 支持移除分类(设置为未分类)

#### 批量添加标签 🏷️
- 点击"添加标签"按钮打开标签输入框
- 两种方式添加标签:
  1. **输入创建**: 在输入框输入新标签名,按回车创建并添加
  2. **选择已有**: 从下拉列表选择已有标签添加
- 标签会添加到所有选中的书籍

#### 批量删除 🗑️
- 点击红色"删除"按钮
- 弹出确认对话框(显示将删除的数量)
- 确认后删除所有选中书籍的记录(不删除文件)

### 3. 用户体验优化

- **视觉反馈**: 
  - 选中的书籍有明显的边框高亮(蓝色加粗)
  - 选择模式下禁用拖拽功能,避免操作冲突
  - 批量操作按钮仅在有选择时显示
- **操作分组**: 批量操作按钮在工具栏清晰分组
- **下拉菜单**: 分类和标签选择使用下拉菜单,节省空间
- **快捷全选**: 一键全选当前过滤结果的所有书籍

## 💻 技术实现

### 状态管理

```typescript
// 批量选择模式开关
const [selectionMode, setSelectionMode] = createSignal(false);

// 已选中的书籍 ID 列表
const [selectedBookIds, setSelectedBookIds] = createSignal<number[]>([]);

// 下拉菜单显示控制
const [showBatchTagInput, setShowBatchTagInput] = createSignal(false);
const [showBatchCategorySelect, setShowBatchCategorySelect] = createSignal(false);

// 批量标签输入
const [batchTagInput, setBatchTagInput] = createSignal('');
```

### 工具栏批量操作按钮

```tsx
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
>
  {selectionMode() ? '☑ 选择中' : '☐ 批量选择'}
</button>

{/* 批量操作区域 - 仅在选择模式且有选中项时显示 */}
<Show when={selectionMode() && selectedBookIds().length > 0}>
  <div class={styles.batchActions}>
    <span class={styles.selectionCount}>已选 {selectedBookIds().length} 本</span>
    
    {/* 全选/清空按钮 */}
    <button onClick={() => setSelectedBookIds([...filteredBooks().map(b => b.id)])}>
      全选
    </button>
    <button onClick={() => setSelectedBookIds([])}>
      清空
    </button>
    
    {/* 批量移动分类 */}
    {/* 批量添加标签 */}
    {/* 批量删除 */}
  </div>
</Show>
```

### 书籍卡片复选框

```tsx
<div
  class={styles.bookCard}
  classList={{ 
    [styles.batchSelected]: selectedBookIds().includes(book.id)
  }}
  draggable={!selectionMode()}  // 选择模式下禁用拖拽
  onClick={() => {
    if (selectionMode()) {
      // 切换选中状态
      setSelectedBookIds(prev => 
        prev.includes(book.id)
          ? prev.filter(id => id !== book.id)
          : [...prev, book.id]
      );
    } else {
      handleSelectBook(book);
    }
  }}
>
  {/* 复选框 */}
  <Show when={selectionMode()}>
    <div class={styles.selectionCheckbox}>
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
  
  {/* 书籍封面和信息 */}
</div>
```

### 批量移动分类

```typescript
<button onClick={() => setShowBatchCategorySelect(!showBatchCategorySelect())}>
  📁 移动分类
</button>
<Show when={showBatchCategorySelect()}>
  <div class={styles.dropdownMenu}>
    <For each={categories()}>
      {(category) => (
        <div
          class={styles.dropdownItem}
          onClick={async () => {
            // 批量更新分类
            for (const bookId of selectedBookIds()) {
              await pdfLibraryService.updateBookCategory(bookId, category.id);
            }
            // 更新本地状态
            setBooks(prev => prev.map(b => 
              selectedBookIds().includes(b.id) 
                ? { ...b, categoryId: category.id } 
                : b
            ));
            setShowBatchCategorySelect(false);
          }}
        >
          {category.icon || '📑'} {category.name}
        </div>
      )}
    </For>
    <div onClick={/* 移除分类 */}>
      🚫 移除分类
    </div>
  </div>
</Show>
```

### 批量添加标签

```typescript
<button onClick={() => setShowBatchTagInput(!showBatchTagInput())}>
  🏷️ 添加标签
</button>
<Show when={showBatchTagInput()}>
  <div class={styles.dropdownMenu}>
    {/* 输入框 - 输入新标签 */}
    <input
      class={styles.batchTagInputField}
      type="text"
      placeholder="输入标签名..."
      value={batchTagInput()}
      onInput={(e) => setBatchTagInput(e.currentTarget.value)}
      onKeyPress={async (e) => {
        if (e.key === 'Enter' && batchTagInput().trim()) {
          const tagName = batchTagInput().trim();
          // 查找或创建标签
          let tag = tags().find(t => t.name === tagName);
          if (!tag) {
            tag = await pdfLibraryService.createTag(tagName);
            setTags([...tags(), tag]);
          }
          // 批量添加到所有选中书籍
          for (const bookId of selectedBookIds()) {
            await pdfLibraryService.addTagToBook(bookId, tag.id);
          }
          await loadData();
          setBatchTagInput('');
          setShowBatchTagInput(false);
        }
      }}
    />
    {/* 标签列表 - 选择已有标签 */}
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
```

### 批量删除

```typescript
<button
  class={`${styles.toolbarButton} ${styles.dangerButton}`}
  onClick={async () => {
    if (confirm(`确定要删除选中的 ${selectedBookIds().length} 本书籍吗?(仅删除记录,不删除文件)`)) {
      for (const bookId of selectedBookIds()) {
        await pdfLibraryService.deleteBook(bookId, false);
      }
      await loadData();
      setSelectedBookIds([]);
    }
  }}
>
  🗑️ 删除
</button>
```

### CSS 样式

#### 批量操作区域
```css
.batchActions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  padding-left: 12px;
  border-left: 1px solid var(--vscode-panel-border);
}

.selectionCount {
  font-size: 13px;
  font-weight: 500;
  padding: 0 8px;
}
```

#### 下拉菜单
```css
.dropdownMenu {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 4px;
  background: var(--vscode-dropdown-background);
  border: 1px solid var(--vscode-dropdown-border);
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  z-index: 1000;
  min-width: 180px;
  max-height: 300px;
  overflow-y: auto;
}

.dropdownItem {
  padding: 8px 12px;
  cursor: pointer;
  transition: background 0.15s;
}

.dropdownItem:hover {
  background: var(--vscode-list-hoverBackground);
}
```

#### 批量选中的书籍卡片
```css
.bookCard.batchSelected {
  border-color: var(--vscode-focusBorder);
  border-width: 2px;
  background: var(--vscode-list-activeSelectionBackground);
  opacity: 0.95;
}
```

#### 复选框
```css
.selectionCheckbox {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 10;
  background: var(--vscode-editor-background);
  border-radius: 3px;
  padding: 2px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.selectionCheckbox input[type="checkbox"] {
  width: 18px;
  height: 18px;
  cursor: pointer;
  margin: 0;
}
```

#### 危险操作按钮
```css
.toolbarButton.dangerButton {
  background: var(--vscode-statusBarItem-errorBackground);
  color: var(--vscode-statusBarItem-errorForeground);
}
```

## 🎨 用户体验流程

### 批量移动分类流程
1. 点击"批量选择"按钮进入选择模式
2. 点击或勾选多本书籍
3. 点击"移动分类"按钮
4. 从下拉菜单选择目标分类
5. 所有选中书籍立即移动到该分类
6. UI 自动更新,分类计数刷新

### 批量添加标签流程
1. 进入选择模式并选中书籍
2. 点击"添加标签"按钮
3. 两种方式:
   - **输入新标签**: 在输入框输入标签名,按回车
   - **选择已有**: 从列表点击已有标签
4. 标签添加到所有选中书籍
5. 书籍列表刷新,显示新标签

### 批量删除流程
1. 选中要删除的书籍
2. 点击红色"删除"按钮
3. 确认对话框提示删除数量
4. 确认后删除记录(保留文件)
5. 书籍列表刷新,选择清空

## ✅ 功能验证清单

- [x] 批量选择模式切换
- [x] 书籍卡片复选框显示
- [x] 点击选择/取消选择
- [x] 全选当前过滤结果
- [x] 清空所有选择
- [x] 选择计数实时显示
- [x] 批量移动到分类
- [x] 批量移除分类
- [x] 批量添加新标签
- [x] 批量添加已有标签
- [x] 批量删除(仅记录)
- [x] 选择模式下禁用拖拽
- [x] 视觉反馈(边框高亮)
- [x] 下拉菜单交互
- [x] 确认对话框
- [x] TypeScript 编译通过
- [x] Rust 编译通过

## 🔄 与现有功能的集成

### 与拖拽功能协同
- 选择模式下自动禁用拖拽功能 (`draggable={!selectionMode()}`)
- 避免拖拽和选择操作冲突
- 退出选择模式后恢复拖拽

### 与过滤功能协同
- 全选按钮仅选择当前过滤结果 (`filteredBooks()`)
- 支持先过滤再批量操作的工作流
- 选择后更改过滤条件,选择状态保持

### 与详情面板协同
- 选择模式下点击书籍不打开详情面板
- 双击事件在选择模式下禁用
- 退出选择模式后恢复正常交互

## 🎯 优势特性

1. **高效整理**: 一次选择,批量处理,大幅提升整理效率
2. **直观交互**: 复选框清晰可见,选中状态明显
3. **安全操作**: 删除前有确认对话框,避免误操作
4. **灵活组合**: 支持过滤+批量操作组合使用
5. **无冲突设计**: 选择模式下禁用可能冲突的功能

## 🔮 未来增强建议

- [ ] 支持 Shift 点击连续选择
- [ ] 支持 Ctrl+A 快捷键全选
- [ ] 批量编辑元数据(作者、标题等)
- [ ] 批量导出选中书籍
- [ ] 撤销批量操作
- [ ] 批量移动到目录
- [ ] 保存选择集合(临时书单)
- [ ] 批量操作进度提示

## 📝 使用说明

### 基本操作
1. 点击工具栏左侧的"批量选择"按钮
2. 点击书籍卡片或左上角复选框进行选择
3. 使用批量操作按钮执行操作
4. 完成后点击"批量选择"退出模式

### 快捷技巧
- **快速全选**: 点击"全选"按钮选择当前所有书籍
- **过滤后操作**: 先设置过滤条件,再全选并批量操作
- **分批处理**: 可以多次进行批量操作,不必一次性处理所有

### 注意事项
- 批量删除仅删除数据库记录,不删除物理文件
- 批量操作按顺序执行,数量较多时需要等待
- 选择模式下无法拖拽书籍

## 🎉 总结

批量选择和批量操作功能已完整实现,提供了:
- ✅ 直观的复选框选择界面
- ✅ 完善的批量操作功能(分类、标签、删除)
- ✅ 流畅的用户体验和视觉反馈
- ✅ 与现有功能的良好集成

用户现在可以高效地整理大量书籍,批量操作大幅提升了工作效率!
