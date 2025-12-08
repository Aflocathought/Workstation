# PDF Library 快速集成指南

## 第一步: 添加 Rust 依赖

编辑 `src-tauri/Cargo.toml`,在 `[dependencies]` 部分添加:

```toml
chrono = { version = "0.4", features = ["serde"] }
```

## 第二步: 集成到主程序

编辑 `src-tauri/src/main.rs`:

### 1. 添加模块声明 (在文件开头的模块声明区域)

```rust
mod pdf_library;
```

### 2. 导入状态类型 (在 use 语句区域)

```rust
use pdf_library::PdfLibraryState;
```

### 3. 初始化状态 (在 main 函数中,Builder 之前)

```rust
// 初始化 PDF Library 数据库路径
let pdf_db_path = app_handle
    .path()
    .app_data_dir()
    .expect("无法获取应用数据目录")
    .join("pdf_library.db");

let pdf_state = Mutex::new(PdfLibraryState::new(pdf_db_path));
```

### 4. 注册状态和命令 (在 tauri::Builder 链式调用中)

在 `.manage(...)` 部分添加:
```rust
.manage(pdf_state)
```

在 `.invoke_handler(tauri::generate_handler![...])` 数组中添加:
```rust
pdf_library::commands::pdflibrary_init_db,
pdf_library::commands::pdflibrary_backup_db,
pdf_library::commands::pdflibrary_get_books,
pdf_library::commands::pdflibrary_get_book,
pdf_library::commands::pdflibrary_add_book,
pdf_library::commands::pdflibrary_update_title,
pdf_library::commands::pdflibrary_rename_book,
pdf_library::commands::pdflibrary_delete_book,
pdf_library::commands::pdflibrary_get_tags,
pdf_library::commands::pdflibrary_create_tag,
pdf_library::commands::pdflibrary_get_book_tags,
pdf_library::commands::pdflibrary_add_book_tag,
pdf_library::commands::pdflibrary_remove_book_tag,
pdf_library::commands::pdflibrary_get_directories,
pdf_library::commands::pdflibrary_add_directory,
pdf_library::commands::pdflibrary_extract_metadata,
pdf_library::commands::pdflibrary_extract_cover,
pdf_library::commands::pdflibrary_get_file_identity,
pdf_library::commands::pdflibrary_show_in_folder,
pdf_library::commands::pdflibrary_open_file,
pdf_library::commands::pdflibrary_copy_file_to_clipboard,
```

## 第三步: 测试运行

1. 运行 `npm run tauri dev` (或你的启动命令)
2. 打开应用后导航到 **工具 -> PDF 图书馆**
3. 应该看到空状态界面

## 第四步: 创建测试数据

打开浏览器开发者工具控制台,运行:

```javascript
import { invoke } from '@tauri-apps/api/core';

// 1. 创建一个测试目录
await invoke('pdflibrary_add_directory', {
  path: 'C:\\TestLibrary',
  dirType: 'workspace',
  name: '测试图书馆'
});

// 2. 添加一本测试书籍 (需要一个真实的 PDF 文件路径)
await invoke('pdflibrary_add_book', {
  filepath: 'C:\\path\\to\\your\\test.pdf',
  directoryId: 1,
  isManaged: true
});
```

## 常见问题

### 编译错误: "cannot find module pdf_library"
确保 `src-tauri/src/pdf_library/` 文件夹存在且包含:
- mod.rs
- commands.rs
- database.rs
- file_ops.rs
- metadata.rs
- watcher.rs

### 运行时错误: "failed to initialize database"
检查应用数据目录权限,确保应用可以在该目录创建文件。

### 前端错误: "command not found"
确保所有命令都已在 main.rs 的 `generate_handler!` 中注册。

## 下一步优化

完成基础集成后,可以依次实现:

1. **PDF 元数据提取** - 添加 pdfium-render 依赖
2. **Inbox 监控** - 添加 notify 依赖
3. **封面缩略图** - 完善 extract_cover 实现
4. **用户设置界面** - 允许用户配置 Workspace 路径

参考 `README.md` 了解完整的待办事项列表。
