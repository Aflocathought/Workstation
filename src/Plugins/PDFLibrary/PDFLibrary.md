# PDFLibrary

## 文件范式
将PDFL所用到的函数全部提取到PDFL.ts中。
渲染层放在PDFLRender.tsx里。
如果渲染层中的组件可以复用/抽象/已经在别的地方有这样的组件，建议复用和抽象成component，不然会很难维护。
rust源码可以先放到src-tauri\src

## 主要功能与特点
### 1. 核心引擎：PDF 处理

**“后端解析，前端渲染”**

* **解析 (Rust)**: 使用 **`pdfium-render`** (Google PDFium 绑定)。
  * 负责：提取封面图、提取文本（用于搜索）、获取元数据、统计页数。
  * 理由：工业标准，中文支持好，提取图片最稳。
* **阅读 (Frontend)**: 使用 **`PDF.js`**。
  * 负责：在界面中展示内容、缩放、翻页。
  * 理由：浏览器原生支持最好，交互体验最流畅。
* **版权**: PDF 是 ISO 开放标准，无专利风险（避开 XFA 动态表单即可）。

---

### 2. 文件架构：物理 vs 逻辑

**“物理上按时间流水，逻辑上多维标签”**

* **物理存储 (硬盘)**: **基于时间的归档 (Timeline-based)**。
  * 结构：`Workspace / 2025 / 12 / filename.pdf`。
  * 原则：文件一旦入库（Import），就定居在当月的文件夹，不再随修改移动。
* **逻辑展示 (软件)**: **标签系统 (Tag-based)**。
  * 文件可以通过 Tag 同时出现在“电车”和“BMS”分类下，解决分类互斥难题。
* **多源策略 (Workspace vs Sources)**:
  * **主库 (Workspace)**: 软件独占，拥有完全控制权（可重命名、可移动）。
  * **外挂库 (External Sources)**: 引用外部文件夹（如 Zotero 库），**只读索引，禁止修改物理文件**，仅在数据库层面做标记。

---

### 3. 数据追踪：文件身份识别

**“不丢书的混合指纹策略”**

* **主索引**: 文件路径 (Path)。
* **辅助索引**: **Windows File ID** (`nFileIndex` + `VolumeSerialNumber`)。
  * 作用：即使用户在资源管理器里改名或同盘移动，软件也能自动找回文件并更新路径。
* **打开方式**: 使用 Tauri `shell` 插件调用系统默认程序打开，或内置 PDF.js 阅读（未来会考虑预览，但暂时不添加阅读功能）。

---

### 4. 数据库安全：防爆体系

* **数据库**: **SQLite** (`rusqlite`)。
* **第一层防线**: **事务 (Transactions)**。
  * 逻辑：`数据库更新` + `文件重命名` 必须在一个事务里。如果文件被占用导致重命名失败，数据库自动回滚，保证一致性。
* **第二层防线**: **WAL 模式**。
  * 开启 `PRAGMA journal_mode=WAL`，防止断电损坏，提升并发性能。
* **第三层防线**: **灾备 (Backup)**。
  * 每次启动自动备份 `.db` 文件。
  * 重要操作后导出 JSON 纯文本镜像（逃生舱）。

---

### 5. 交互设计 (UX)：少即是多

**“检查器模式 + 原生集成”**

* **布局**: Master-Detail（左侧列表，右侧常驻属性面板）。
* **重命名**:
  * 在属性面板“就地编辑”标题。
  * 提供选项：“同步修改文件名”（若文件被占用则优雅降级，只改数据库标题）。
* **系统集成**:
  * **定位文件**: Rust 调用 `explorer /select, <path>`。
  * **发送给别人**: 实现“复制文件”功能（写入剪贴板），用户直接 Ctrl+V 到微信/QQ。

---

### 开发路线建议 (Roadmap)

1. **MVP 阶段**: 跑通 `pdfium` 提取封面 + `rusqlite` 存数据 + `Inbox` 自动归档监控。
2. **V1.0 阶段**: 完善 Tag 系统，实现“属性面板”修改元数据，加上 `Windows File ID` 追踪。
3. **V1.5 阶段**: 加上“外挂库”支持，处理只读逻辑。
4. **V2.0 阶段**: 引入全文检索（基于提取的文本）。

# 以下是完整的设计思路

### 核心方案：Windows File ID (nFileIndex) + 路径兜底

不要只依赖路径，也不要只依赖 Hash。Windows 的 NTFS 文件系统其实给每个文件都发了一个“身份证号”。

#### 1. 什么是 Windows File ID？

在 NTFS 文件系统中，每个文件都有一个唯一的 64 位标识符（File Reference Number），在 Windows API 中称为 `nFileIndex`。

* **特性**：
  * **重命名**：ID **不变**。
  * **同盘移动**（比如从 `C:\Download` 移到 `C:\Books`）：ID **不变**。
  * **文件内容修改**（比如用 Adobe Reader 高亮保存）：通常 ID **不变**（取决于编辑器是直接覆盖写入，还是“写新删旧”，大多数编辑器选择覆盖，ID 保持不变）。
* **局限**：
  * **跨盘移动**（从 C 盘移到 D 盘）：ID **会变**（因为本质是复制+删除）。

#### 2. Rust 如何获取它？

Rust 标准库直接支持读取这个底层信息，不需要引入奇怪的第三方库。

```rust
use std::fs;
use std::os::windows::fs::MetadataExt;

fn get_file_identity(path: &str) -> Option<(u64, u64)> {
    if let Ok(metadata) = fs::metadata(path) {
        // volume_serial_number: 所在磁盘的序列号（区分C盘还是D盘）
        // file_index: 文件在这个盘上的唯一身份证号
        return Some((
            metadata.volume_serial_number().unwrap_or(0) as u64,
            metadata.file_index().unwrap_or(0),
        ));
    }
    None
}
```

---

### 推荐的数据库设计与查找逻辑

你需要维护一个 SQLite 数据库（Tauri 标配 `rusqlite` 或 `sqlx`），表结构设计如下：

#### 数据库表：`books`

| 字段 | 类型 | 说明 |
| :--- | :--- | :--- |
| `id` | UUID | 你软件内部的主键，Tag 关联到这个 ID |
| `file_path` | String | **最后一次已知**的绝对路径（兜底用） |
| `volume_id` | Integer | 磁盘序列号 |
| `file_index` | Integer | Windows 文件唯一 ID |
| `file_size` | Integer | 文件大小（辅助验证） |
| `filename` | String | 文件名（辅助验证） |

#### 查找文件的算法（鲁棒性最强）

当用户在你的软件里点击“打开”时，按以下顺序寻找文件：

1. **第一步：检查 `file_path`**
    * 直接看路径是否存在。如果存在，并且计算出的 `volume_id` 和 `file_index` 与数据库一致，直接打开。（这是最快的情况）。
    * *情况处理*：如果路径存在，但 ID 变了？说明原来的位置被一个同名新文件取代了。你应该提示用户。
    * *情况处理*：如果路径不存在？进入第二步。

2. **第二步：全盘/特定目录扫描 ID（找回文件）**
    * 如果用户把文件从 `Downloads` 移到了 `Documents`，路径失效了。
    * 但是 `volume_id` 和 `file_index` 没变。
    * 你可以写一个后台线程（或在该文件夹下）快速扫描，找到那个 `file_index` 对应的文件。
    * **找到后**：自动更新数据库里的 `file_path`，下次就快了。

3. **第三步：如果 ID 也变了（跨盘移动或“写新删旧”）**
    * 这就没办法了，只能标记为“丢失”，或者提供一个“手动重新关联”的按钮，让用户选一下文件，你更新 ID 和路径。

---

### 3. 如何实现“调用 Windows 默认打开”

这是 Tauri 最简单的部分，使用官方插件 `tauri-plugin-shell`。

**前端 (JS/TS):**

```typescript
import { open } from '@tauri-apps/plugin-shell';

// 直接调用系统的默认程序打开文件
await open('C:\\Users\\You\\Books\\MyBook.pdf');
```

**Rust 配置 (`tauri.conf.json`):**
你需要允许 shell 插件打开文件：

```json
"plugins": {
  "shell": {
    "open": true
  }
}
```
1. **物理层面**：希望文件在硬盘里是整齐的，不是一堆乱码或散落在根目录。
2. **逻辑层面**：**分类（Folder）是互斥的**（一个文件只能在一个文件夹），但**知识（Topic）是多维的**（一个论文既属于BMS也属于电车）。

如果强行用“物理文件夹”来做“知识分类”，用户一定会遇到你说的“BMS vs 电车”的选择困难症。

针对 Rust + Tauri 的开发，我建议采用 **“物理归档 + 逻辑索引”** 分离的策略。

---

### 建议方案：基于时间的流水线归档 (Timeline-based Archiving)

不要让用户在**物理层面**去纠结“这是什么类别的书”。物理层面的整理标准应该是**唯一且客观**的。

**最推荐的物理结构：按“导入时间”归档**

#### 1. 物理层设计（硬盘里的样子）

当用户把文件丢进 Workspace 时，你的软件自动把它移动到当月/当年的文件夹里。

```text
MyLibrary/ (Workspace 根目录)
├── Inbox/          <-- 1. 用户把乱七八糟的文件全丢这里
├── 2024/
│   ├── 12/
│   │   ├── [论文]_BMS电车研究.pdf
│   │   └── [小说]_三体.pdf
│   └── 11/
├── 2025/
│   ├── 01/
└── .metadata.db    <-- 数据库文件
```

**为什么这样做？**

* **客观性**：时间是绝对的，不需要用户思考“把它放哪”。
* **整齐**：文件被分散到不同月份的文件夹，不会出现一个文件夹几千个文件的情况。
* **可找回性**：即使用户不用你的软件，直接去文件管理器找，“我记得是上个月下的”这个线索足够他在 Windows 资源管理器里手动找到了。

#### 2. 逻辑层设计（软件里的样子）

在你的软件界面里，完全脱离物理路径的束缚。

* **侧边栏（文件夹模式）**：展示物理结构（2024 > 12），给喜欢按时间看的人。
* **标签/虚拟文件夹（核心功能）**：
  * 你创建一个“虚拟文件夹”系统。
  * 用户给文件打 Tag：`#论文`，`#BMS`，`#电车`。
  * **关键点**：这篇论文可以**同时**出现在“论文”分类下，和“电车”分类下。

---

### 技术实现路线 (Rust + Tauri)

#### Step 1: 监控文件变动 (The Watcher)

你需要监控 `Inbox` 文件夹。使用 Rust 生态中最强的 `notify` 库。

```toml
[dependencies]
notify = "6.1"
```

**后端逻辑 (Rust):**

1. 启动一个后台线程，用 `notify` 监听 `Workspace/Inbox` 目录的 `Create` 事件。
2. 一旦检测到新文件（防抖动处理，等待文件写入完成）：
    * 读取文件元数据。
    * 生成目标路径：`Workspace/{Year}/{Month}/{Filename}`。
    * **移动文件** (`std::fs::rename`)。
    * **写入数据库**：记录它的新路径、原始文件名、导入时间。
3. 前端收到事件，刷新列表。

#### Step 2: 解决“BMS vs 电车”的分类难题

不要做传统的树状文件夹，要做 **“智能视图” (Smart Views)**。

在你的数据库设计中（多对多关系）：

```sql
-- 书籍表
CREATE TABLE books (id INTEGER PRIMARY KEY, title TEXT, path TEXT, ...);

-- 标签表 (充当你的"虚拟文件夹")
CREATE TABLE tags (id INTEGER PRIMARY KEY, name TEXT, parent_id INTEGER); 
-- parent_id 允许你做标签嵌套，比如 科技 -> 电车

-- 关联表
CREATE TABLE book_tags (book_id INTEGER, tag_id INTEGER);
```

**用户体验：**

1. 用户把论文丢进 Inbox。
2. 软件自动吸入到 `2024/12/`。
3. 弹窗或在侧边栏提示用户：“发现新文件，请分类”。
4. 用户勾选 `BMS` 和 `电车`。
5. **结果**：用户点击左侧“电车”分类能看到它，点击“BMS”也能看到它。物理文件安安静静躺在 `2024/12` 里。

---

### 总结建议

对于个人开发者做图书应用，**“时间流归档” (Time-based Storage)** 是性价比最高的方案。

1. **用户操作**：只管把文件往 `Inbox` 文件夹里拖。
2. **软件后台**：Rust `notify` 自动抓取 -> 移动到 `2025/01` -> 入库。
3. **用户整理**：在软件界面里打 Tag（虚拟分类）。
4. **防崩溃**：哪怕你的数据库炸了，用户打开 Windows 资源管理器，也能看到按年月排好的文件，找起来心里不慌。

这种**“物理只有一份，逻辑可以多份”**的设计，完美解决了“这篇论文到底属于哪”的哲学问题。

这是一个非常好的问题。如果设计不好，“覆盖存储”确实会破坏文件系统的稳定性。

对于“时间流归档”，我的核心建议是：**物理路径应锚定于“首次入库时间（Import Date）”，而不应随“修改时间（Modified Date）”漂移。**

这里有三个维度的“时间”，我们需要明确把它们分开：

1. **文件创建时间 (OS Created)**：通常不准（比如你今天下载了一个 2010 年生成的 PDF）。
2. **文件修改时间 (OS Modified)**：每次你高亮保存都会变。
3. **入库时间 (Date Added)**：**这是你的软件第一次见到它的时间。**

---

### 推荐策略：入库即定居 (Import and Stay)

你应该把行为定义为：**“文件一旦从 Inbox 移动到了归档目录（如 `2024/05/`），它就在物理层面上‘定居’了。”**

#### 场景 1：全新的文件拖入

* **行为**：检测到 Inbox 有新文件。
* **判定**：这是新知识。
* **操作**：
    1. 获取当前系统时间（例如 2025-12）。
    2. 移动文件到 `Workspace/2025/12/file.pdf`。
    3. **数据库记录**：`import_date = 2025-12-07`, `path = ...`。

#### 场景 2：用户打开文件并进行了修改（覆盖存储）

* **场景**：用户打开了 `Workspace/2025/12/file.pdf`，做了一些高亮笔记，然后按了 Ctrl+S。
* **行为**：Rust 的 `notify` 库检测到了 `Write` 或 `Modify` 事件。
* **判定**：这是**旧知识的更新**，而不是新知识。
* **操作**：
    1. **绝对不要移动文件**。千万不要把它移到 `2025/12`（如果现在是12月）或者其他月份。如果文件满世界乱跑，用户会疯的。
    2. **只更新数据库**：更新该条目的 `last_modified` 字段，更新文件大小，重新计算 Hash（如果需要）。
    3. **界面反馈**：可以在列表里把这本书“顶”到最前面（按 `last_modified` 排序），但在硬盘里它纹丝不动。

#### 场景 3：用户重新下载了同一本书（覆盖导入）

* **场景**：用户在 `2024/01` 导入过这本书。今天他又下载了一个新版本（或者同名文件），拖进了 Inbox。
* **行为**：Inbox 检测到新文件，准备移动。
* **判定**：计算 Hash 或检查文件名，发现库里已经有了。
* **操作（两个选择）**：
  * *选择 A（版本迭代，推荐）*：检测到是同名/相似文件，弹窗询问。如果用户选“替换”，则把 Inbox 里的新文件移动到 **旧的位置** (`2024/01/`) 覆盖旧文件。
    * *理由*：保持物理位置的稳定性。
  * *选择 B（作为新书）*：作为一本全新的书处理，移动到 `2025/12`。
    * *理由*：把它当成一本完全不同的书。

---

### 技术实现细节 (Rust)

为了实现这个逻辑，你需要把文件监听分成两个区域，处理逻辑完全不同：

#### 1. 监听 Inbox 区域 (`Create` 事件)

这是“入海口”。

```rust
// 伪代码逻辑
watcher.watch("Workspace/Inbox", RecursiveMode::NonRecursive)?;

match event.kind {
    EventKind::Create(_) => {
        // 1. 等待文件写入完成（防抖）
        // 2. 生成目标路径：Workspace/{当前年}/{当前月}/文件名
        // 3. std::fs::rename(旧路径, 新路径) -> 移动文件
        // 4. INSERT INTO database
    },
    _ => {}
}
```

#### 2. 监听 Archive 区域 (`Modify` 事件)

这是“仓库区”（`Workspace/2024`, `Workspace/2025`...）。

```rust
watcher.watch("Workspace", RecursiveMode::Recursive)?;

match event.kind {
    EventKind::Modify(_) => {
        // 1. 忽略文件夹的变动，只看文件
        // 2. 这里的变动意味着用户修改了内容
        // 3. 通过 path 在数据库找到对应的 ID
        // 4. UPDATE books SET last_modified = now(), size = ... WHERE path = ...
        // 5. 千万不要执行 fs::rename (移动操作)
    },
    // 如果用户在资源管理器里手动改名或移动了怎么办？
    EventKind::Rename(old_path, new_path) => {
        // 同步更新数据库里的 path 字段，保持链接不断
    }
    _ => {}
}
```

### 总结

* **入库时间 (Import Time)** = **物理地址的锚点**。一旦分配了房间，除非拆迁（用户手动整理），否则不换房。
* **修改时间 (Modified Time)** = **排序和状态的依据**。用于在 UI 上展示“最近阅读/最近修改”，但不影响物理存储。

这样做的好处是：**逻辑清晰，文件系统稳定，且符合直觉。** 用户在文件管理器里找书时，记忆路径是“我大概是去年年底存的”，而不是“我上周刚修改过，所以它应该在本月文件夹里”。

这两个功能在 Rust + Tauri 中都可以实现。

其中，“**在文件管理器中定位**”非常简单，属于标准操作；而“**拖拽文件发送/复制**”（Drag and Drop out）则稍微复杂一些，因为它涉及到 Web 视图与操作系统底层的交互。

下面是具体的实现方案。

---

### 功能一：在文件管理器中定位 (Locate in File Explorer)

在 Windows 上，标准的做法是调用 `explorer.exe` 并带上 `/select` 参数。

#### 1. 配置权限 (`src-tauri/capabilities/default.json` 或 `tauri.conf.json`)

你需要允许 Tauri 调用外部命令（shell）。

```json
{
  "permissions": [
    "shell:allow-open",
    {
      "identifier": "shell:allow-execute",
      "allow": [
        {
          "name": "explorer",
          "args": true,
          "sidecar": false
        }
      ]
    }
  ]
}
```

#### 2. Rust 后端实现 (推荐)

建议在 Rust 端写一个 Command，因为这样可以更好地处理路径格式（Windows 路径分隔符问题）。

```rust
use std::process::Command;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[tauri::command]
fn show_in_folder(path: String) {
    #[cfg(target_os = "windows")]
    {
        // Windows 特有的创建标记，避免弹出黑框
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        
        Command::new("explorer")
            .args(["/select,", &path]) // 注意：select后面有个逗号
            .creation_flags(CREATE_NO_WINDOW) 
            .spawn()
            .unwrap();
    }
    
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .args(["-R", &path])
            .spawn()
            .unwrap();
    }
    
    // Linux (视具体桌面环境而定，通常是 xdg-open 或 dbus调用)
}
```

#### 3. 前端调用

```javascript
import { invoke } from "@tauri-apps/api/core";

// 当用户点击“定位”按钮
await invoke("show_in_folder", { path: "C:\\Books\\2024\\12\\paper.pdf" });
```

---

### 功能二：拖拽文件给别人 (Drag Out)

你想让用户按住软件里的书的图标，拖动到微信、QQ 或 Windows 文件夹里，就相当于把那个文件发出去了。

这里有一个**简单方案**（利用 Chromium 特性）和一个**完美方案**（利用 Rust 底层）。

#### 方案 A：Web 方案（简单，但不一定兼容所有软件）

Tauri 使用的是 WebView2 (Chromium 内核)。Chromium 支持一种特殊的 DataTransfer 格式，叫 `DownloadURL`。如果目标软件（如 Chrome、新版 Edge、部分 Electron 应用）支持这个协议，就能成功；但对 Windows 资源管理器的支持有时不稳定。

**前端实现 (Vue/React/JS):**

```javascript
function handleDragStart(event, filePath, fileName) {
    event.dataTransfer.effectAllowed = "copy";
    
    // 格式: MIME类型:文件名:文件URI
    // 例如: application/pdf:report.pdf:file:///C:/Books/report.pdf
    const fileUrl = `file:///${filePath.replace(/\\/g, "/")}`; // 转换 Windows 反斜杠
    const downloadUrl = `application/octet-stream:${fileName}:${fileUrl}`;
    
    event.dataTransfer.setData("DownloadURL", downloadUrl);
    
    // 同时也设置 text/uri-list，兼容性更好
    event.dataTransfer.setData("text/uri-list", fileUrl);
    event.dataTransfer.setData("text/plain", fileUrl);
}

// HTML: <div draggable="true" ondragstart="handleDragStart(event, ...)">...</div>
```

#### 方案 B：Rust 模拟剪贴板复制（最稳妥的替代方案）

由于“原生拖拽”在 WebView 中实现非常困难（需要拦截操作系统的 COM 消息），很多文件管理类软件（如 Eagle）通常会提供一个**“复制文件”**的功能作为补充。

用户习惯：选中文件 -> Ctrl+C -> 去微信窗口 -> Ctrl+V。

**Rust 实现“复制文件对象到剪贴板”：**
使用 `clipboard-win` crate（专门处理 Windows 剪贴板的文件列表）。

**Cargo.toml:**

```toml
[dependencies]
clipboard-win = "5.0"
```

**Rust Command:**

```rust
use clipboard_win::{formats, Clipboard, Setter};

#[tauri::command]
fn copy_file_to_clipboard(path: String) -> Result<(), String> {
    let _clip = Clipboard::new_attempts(10).map_err(|e| e.to_string())?;
    
    // 将文件路径转为 Windows 也就是 CF_HDROP 格式
    // 这样剪贴板里存的就是“文件本身”，而不是一段文本路径
    let paths = vec![path];
    formats::FileList.write_clipboard(&paths).map_err(|e| e.to_string())?;
    
    Ok(())
}
```

#### 方案 C：真正的原生拖拽 (Hard Mode)

如果你必须实现“按住拖动到资源管理器”，在 Tauri V2 现阶段没有现成的、开箱即用的插件能完美做到这一点。

这是因为当你在 WebView 上拖动时，浏览器接管了拖拽事件。要想把文件“递给”操作系统，你需要：

1. 前端捕获 `dragstart`，通知 Rust。
2. Rust 调用 Windows API (`DoDragDrop`) 启动一个系统级的拖拽循环。
3. 这通常会导致鼠标“卡死”在 Rust 线程里直到拖拽结束，处理起来非常麻烦。

**建议：**
先使用 **方案 A (前端 DownloadURL)** + **方案 B (右键菜单-复制文件)** 的组合。这能覆盖 95% 的日常使用场景（微信发文件、QQ发文件、复制到U盘）。

### 总结

1. **定位文件**：使用 Rust `Command` 调用 `explorer /select, <path>`。
2. **发送/移动文件**：
    * **首选**：实现“复制文件”功能（Rust 后端写入 `CF_HDROP` 格式剪贴板），让用户 Ctrl+V 粘贴。
    * **次选**：前端 `dragstart` 事件设置 `DownloadURL` 数据，尝试欺骗浏览器发起文件传输。

这是一个非常棒的产品设计方向。**“少即是多（Less is More）”** 和 **“所见即所得（WYSIWYG）”** 是现代生产力工具（如 Notion, Obsidian, Linear）的核心设计理念。

要想让“重命名”和“打标签”变得极其顺滑，我建议放弃传统的“右键 -> 属性 -> 弹窗”模式，改用 **“检查器面板（Inspector Panel）”** + **“就地编辑（Inline Editing）”** 的设计。

以下是具体的 UI/UX 建议和技术实现方案：

---

### 1. 核心布局：Master-Detail（列表 + 侧边检查器）

不要让用户在文件列表里手忙脚乱。采用类似 Apple Finder (分栏模式) 或 Zotero 的布局。

* **左侧/中间 (Main View)**：文件列表（或网格）。只展示核心信息（封面、标题、几个主要Tag）。
* **右侧 (Inspector)**：**常驻**的属性面板。当你选中某本书时，这里立即显示它的所有详情。

**为什么这样设计更简单？**

* 用户不需要“打开”任何对话框。
* 所有的修改（改名、加Tag、写备注）都在右侧面板直接进行，输入框就在那里等着你。

---

### 2. 交互设计：如何让操作“零摩擦”？

#### A. 重命名：双向绑定的“就地编辑”

**痛点**：通常改名需要 右键 -> 重命名 -> 选中文件名 -> 输入 -> 回车。
**优化方案**：

1. **在右侧面板**：直接把“标题”做成一个大大的输入框。用户看着封面，点一下标题就能改。
2. **自动化**：当用户修改“标题（Title）”时，你可以做一个开关设置：**“同步修改文件名”**。
    * 如果开启：用户改了书名，你后台默默把文件系统里的文件名 (`2024/12/old.pdf` -> `2024/12/new.pdf`) 也改了。
    * **好处**：用户感觉他在管理知识，而不是在管理文件，但底层文件依然是整齐的。

#### B. 打标签：Notion 风格的胶囊输入

**痛点**：下拉菜单选 Tag 太慢。
**优化方案**：

1. **输入即创建**：一个输入框。用户输入 "BMS"，按回车。
    * 如果有这个 Tag，直接挂上。
    * 如果没有，自动创建并挂上。
2. **颜色区分**：给 Tag 分配随机的莫兰迪色系（Pastel colors），视觉上很舒服。
3. **快捷键**：选中一本书，按 `T` 键，直接聚焦到 Tag 输入框。

#### C. 拖拽归类 (Drag to Tag)

左侧边栏列出常用的 Tags（例如：#待读、#论文、#喜爱）。

* **操作**：用户按住中间列表里的书，**拖动**到左侧的 "#电车" 标签上。
* **效果**：自动给这本书打上 "电车" 的 Tag。
* 这比去菜单里选要快得多，而且符合直觉。

---

### 3. 技术实现 (Rust + Tauri)

这里有一个最大的技术难点：**如何在文件被占用的情况下重命名？** 以及 **如何保证数据库和文件系统的一致性？**

#### 后端 Rust 实现：安全的重命名逻辑

你需要写一个原子操作般的 Command。

```rust
use std::path::Path;
use std::fs;

#[derive(serde::Serialize)]
struct RenameResult {
    success: bool,
    new_path: String,
    error: Option<String>,
}

#[tauri::command]
fn rename_book(id: i32, old_path: String, new_title: String) -> RenameResult {
    let old_p = Path::new(&old_path);
    
    // 1. 计算新路径
    // 保持父目录不变 (2024/12/)，只改文件名
    // 注意：需要保留原始扩展名 (.pdf)
    let parent = old_p.parent().unwrap();
    let ext = old_p.extension().and_then(|e| e.to_str()).unwrap_or("pdf");
    
    // 简单的文件名净化（防止用户输入 / \ : * ? " < > | 等非法字符）
    let safe_filename = sanitize_filename::sanitize(&new_title);
    let new_filename = format!("{}.{}", safe_filename, ext);
    let new_p = parent.join(new_filename);

    let new_path_str = new_p.to_string_lossy().to_string();

    // 2. 如果新旧路径一样（用户只改了标题大小写，Windows下可能一样），根据需求处理
    if old_path == new_path_str {
        // 只更新数据库的 Title 字段，不改文件
        update_db_title(id, &new_title); 
        return RenameResult { success: true, new_path: old_path, error: None };
    }

    // 3. 尝试重命名文件
    // 这一步最容易报错（文件正被 PDF 阅读器打开）
    if let Err(e) = fs::rename(&old_path, &new_p) {
        return RenameResult {
            success: false,
            new_path: old_path,
            error: Some(format!("无法重命名文件，可能文件已被打开。错误: {}", e)),
        };
    }

    // 4. 文件重命名成功后，必须立即更新数据库
    // 事务处理：更新 Title 和 FilePath
    if let Err(e) = update_db_transaction(id, &new_title, &new_path_str) {
        // 严重错误：数据库挂了，但文件已经改名了。
        // 此时应该尝试把文件名改回去，或者记录日志。
        return RenameResult { 
            success: false, 
            new_path: new_path_str, // 告诉前端文件路径已经变了
            error: Some("数据库更新失败".into()) 
        };
    }

    RenameResult { success: true, new_path: new_path_str, error: None }
}
```

*注：你需要引入 `sanitize-filename` crate 来防止用户输入非法文件名导致崩溃。*

#### 前端实现：乐观 UI (Optimistic UI)

为了让界面感觉“极快”，前端不要等待 Rust 返回结果再变。

1. **用户输入**：用户把“Paper A”改成“Paper B”。
2. **立即变**：前端界面立刻显示“Paper B”。
3. **后台跑**：调用 `rename_book`。
4. **回滚（如果失败）**：如果 Rust 返回 `success: false`，弹出可以自动消失的 Toast 提示：“重命名失败（文件被占用）”，并把标题自动变回“Paper A”。

### 4. 终极简化建议：不要让用户管“文件名”

如果你想做到极致的简单，甚至可以**隐藏文件名**。

* **逻辑**：用户只修改“标题（Title）”。
* **物理**：文件系统里，文件名可以用 UUID 或者 hash 命名（如 `2024/12/a1b2-c3d4.pdf`）。
* **导出时**：只有当用户把文件拖出软件，或者点击“导出”时，你再把那个 UUID 文件复制一份，重命名为“标题.pdf”给用户。

**优点**：

* **永不冲突**：用户随便怎么改标题，哪怕改出 10 本同名的书，文件系统里也不会报错。
* **极速**：改标题纯粹是改数据库，毫秒级响应，不需要操作 IO。

**缺点**：

* **脱离软件不可读**：用户自己去 `2024/12` 文件夹看，看到的全是 `a1b2.pdf`，不知道是啥书。

**决策**：
鉴于你之前提到希望用户在文件管理器里也能“整齐有序”，我建议**不要**用 UUID 方案，还是采用 **方案 A（自动同步文件名）**，但在出错时优雅降级（只改数据库标题，提示文件名未修改）。

这完全是可以理解的焦虑。做本地应用（Local-First App）最大的恐惧就是**数据损坏**。如果数据库炸了，用户的 Tag、笔记全没了，那是灾难级的事故。

但好消息是：**SQLite 本身是世界上最坚固的数据库之一**（它被用在飞机、导弹和每一台手机里）。通常“炸”的不是数据库文件本身，而是**我们的代码逻辑没处理好“半途而废”的情况**。

为了让你晚上能睡个安稳觉，我给你一套**“防爆 + 容灾”**的三层防御体系。

---

### 第一层防御：原子操作 (Transactions) —— “要死一起死”

最常见的问题是：**文件改名了，但数据库没更新**；或者**数据库更新了，但文件改名失败了**。这就叫“数据不一致”。

**解决方案**：使用 SQLite 的 **Transaction（事务）**。
事务能保证一系列操作：**要么全部成功，要么全部撤销（Rollback）**，就像什么都没发生过一样。

**Rust 代码示例 (`rusqlite`)：**

```rust
use rusqlite::{Connection, Result};
use std::fs;

fn rename_book_safely(conn: &mut Connection, old_path: &str, new_path: &str, book_id: i32) -> Result<(), String> {
    // 1. 开启事务 (Transaction)
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // 2. 先尝试在数据库里更新 (这一步只是在内存/日志里跑，还没真正定格)
    // 使用 ? 参数化查询，防止 SQL 注入或特殊字符导致的语法错误
    let update_result = tx.execute(
        "UPDATE books SET path = ?1, title = ?2 WHERE id = ?3",
        (new_path, "新标题", book_id),
    );

    if let Err(e) = update_result {
        // 如果 SQL 语句本身就有问题，直接报错，文件动都不要动
        return Err(format!("数据库预更新失败: {}", e));
    }

    // 3. 执行最危险的一步：物理文件操作
    // 只有当数据库说“我准备好了”，我们才去动文件
    if let Err(io_err) = fs::rename(old_path, new_path) {
        // ！！！关键点！！！
        // 文件改名失败了（比如文件被占用了），必须把数据库的操作撤销！
        // tx 会自动 Drop 并 Rollback，但显式调用 rollback 更清晰
        let _ = tx.rollback(); 
        return Err(format!("文件重命名失败，数据库已回滚。原因: {}", io_err));
    }

    // 4. 一切顺利，提交事务！这时候数据才真正写入 .db 文件
    tx.commit().map_err(|e| e.to_string())?;

    Ok(())
}
```

**有了这一层，你的数据库永远不会因为逻辑错误而变脏。**

---

### 第二层防御：开启 WAL 模式 (Write-Ahead Logging)

默认的 SQLite 模式在写入时如果突然断电，有极小概率损坏数据库。
**开启 WAL 模式**后，SQLite 会先把修改写到一个 `.wal` 文件里，然后再整合。这使得它极度抗造，而且**读写可以并发**（界面不会卡）。

**在 Tauri 初始化数据库时设置：**

```rust
fn init_db() -> Connection {
    let conn = Connection::open("library.db").unwrap();
    
    // 开启 WAL 模式
    conn.execute("PRAGMA journal_mode=WAL;", []).unwrap();
    
    // 设置同步模式为 NORMAL (在保证安全的前提下提升巨量性能)
    conn.execute("PRAGMA synchronous=NORMAL;", []).unwrap();
    
    // 开启外键约束（防止你删了书，Tag 表里还留着僵尸数据）
    conn.execute("PRAGMA foreign_keys=ON;", []).unwrap();
    
    conn
}
```

---

### 第三层防御：自动备份与“逃生舱” (Backup & Escape Hatch)

即使代码写得再完美，硬件故障或用户手贱（删了 .db 文件）是防不住的。你需要给用户留后路。

#### 1. 启动时自动备份 (Auto-Backup)

每次应用启动（或者每天第一次启动），把 `.db` 文件复制一份到 `Backups/` 文件夹。保留最近 5 份即可。

* `library.db`
* `Backups/library_2025-12-07.db`
* `Backups/library_2025-12-06.db`

如果主数据库坏了，Tauri 检测到打开失败，自动弹窗：“检测到数据库损坏，是否从昨日备份恢复？”

#### 2. JSON 镜像（逃生舱）

数据库是二进制文件，用户看不懂。为了让用户安心，你可以在**每次重要修改后**，顺手导出一个 JSON 文件到 Workspace 根目录。

`Workspace/.metadata.json`

```json
{
  "last_updated": "2025-12-07",
  "books": [
    {
      "id": 1,
      "path": "2024/12/paper.pdf",
      "tags": ["BMS", "EV"]
    }
  ]
}
```

**这有两个巨大的好处：**

1. **用户看着放心**：他知道就算你的软件倒闭了，或者打不开了，他的 Tag 数据还在这个 JSON 文本里，可以用记事本打开看。
2. **灾难恢复**：如果 SQLite 文件彻底炸了，备份也没了。你的软件可以写一个功能：“从 metadata.json 重建数据库”。

---

### 总结建议

要让数据库“不炸”，不要靠祈祷，要靠**流程**：

1. **代码层面**：永远把 `fs::rename` 包裹在数据库 `Transaction` 的中间。
2. **配置层面**：开启 `PRAGMA journal_mode=WAL`。
3. **架构层面**：
    * 启动时：`cp library.db library.bak`
    * 关闭时/保存时：`Export to metadata.json`

做到这三点，你的软件在稳定性上就已经超过 90% 的个人开发者作品了。Rust 强大的类型系统（Result/Option）也会强迫你去处理每一个可能的错误，这本身就是一种保护。

这是一个涉及**软件伦理**和**工程复杂度**的关键决策。

我的建议是：**采用“主从架构”（Hybrid Model）—— 一个核心 Workspace（主库） + 多个外部 Source（挂载库）。**

对于外部文件夹（Source），**只做索引（Database Only），绝对不要去修改它的物理位置或文件名，更不要复制。**

以下是详细的权衡和实施方案：

---


#### ✅ 方案 C：原地索引 (Index in Place) —— 推荐

* **逻辑**：数据库里记录路径 `D:\OtherApp\Book.pdf`。
* **行为**：你的软件拥有对这个文件的“读权限”和“元数据写权限”（数据库里的 Tag），但**放弃**对它的“物理写权限”（不重命名、不移动）。
* **结论**：这是最尊重用户现有数据资产的做法，类似于 **Lightroom** 或 **VS Code** 的工作方式。

---

### 2. 设计方案：One Home, Many Guests

#### 核心概念

1. **Workspace (主库/托管库)**：
    * **定义**：这是你软件的“地盘”。
    * **来源**：用户直接拖拽进软件窗口的文件。
    * **权限**：**完全控制**。你可以重命名、按时间归档、移动文件。
    * **物理位置**：`MyLibrary/2025/12/...`

2. **External Sources (外部库/挂载库)**：
    * **定义**：用户指定的其他文件夹（如 Calibre 库、Zotero 库、下载文件夹）。
    * **来源**：用户在设置里点击“添加监控文件夹”。
    * **权限**：**只读物理结构，读写数据库**。
        * ❌ **禁止**：在你的软件里给它重命名、移动它（因为这会破坏其他软件的索引）。
        * ✅ **允许**：打 Tag、写备注、全文搜索、打开阅读。

---

### 3. UI/UX 应该长什么样？

为了不让用户混淆，必须在界面上区分这两类文件。

* **左侧导航栏**：
  * 📂 **我的书库 (Workspace)**
    * 📄 全部文件
    * 🏷️ 标签视图
  * 🔗 **外部来源 (Sources)**
    * 📁 Zotero Library
    * 📁 E-books 文件夹

* **文件列表图标**：
  * 主库文件：正常图标。
  * 外部文件：图标右下角加一个小小的**链接符号 (🔗) 或 箭头**。

* **操作限制（关键点）**：
  * 当用户选中一个**主库文件** -> 右侧面板允许修改标题、允许重命名文件名。
  * 当用户选中一个**外部文件** -> 右侧面板允许修改标题（数据库层面的），但**禁用/灰显**“重命名文件名”的输入框，并提示：“此文件位于外部库，仅提供引用”。

---

### 4. 技术实现逻辑 (Rust)

数据库表需要加一个字段来区分。

#### 数据库设计

```sql
CREATE TABLE directories (
    id INTEGER PRIMARY KEY,
    path TEXT NOT NULL,
    type TEXT NOT NULL -- 'workspace' 或 'external'
);

CREATE TABLE books (
    id INTEGER PRIMARY KEY,
    directory_id INTEGER, -- 关联到上面的表
    filename TEXT,        -- 文件名
    title TEXT,           -- 逻辑标题
    is_managed BOOLEAN,   -- TRUE=主库(可改名), FALSE=外部(只读)
    FOREIGN KEY(directory_id) REFERENCES directories(id)
);
```

#### 监控逻辑 (Watcher)

你需要根据文件夹类型启动不同的 Watcher 策略：

1. **对于 Workspace**：
    * 监听 `Create` -> 自动归档（移动到 `2025/12`）。
    * 监听 `Rename` -> 更新数据库路径。

2. **对于 External Source**：
    * 监听 `Create` -> **原地索引**（直接 Insert 数据库，**不移动文件**）。
    * 监听 `Rename` -> 同步数据库（如果用户在资源管理器里改了名，你得跟上）。
    * 监听 `Delete` -> 标记为“丢失”或从库中删除。

---

### 5. 假如用户非要把外部文件变成内部的？

提供一个 **“导入到书库 (Import to Library)”** 的功能。

* **场景**：用户在“外部来源”里看到一本好书，想完全交给你的软件管理。
* **操作**：右键 -> 导入到主库。
* **后台行为**：
    1. `fs::copy` 从外部路径到 `Workspace/2025/12/`。
    2. 数据库更新记录：将 `is_managed` 设为 `true`，更新路径。
    3. （可选）询问用户是否删除源文件（建议默认**不删除**，防止误删用户重要数据）。

### 总结

* **Workspace 只有一个**：这是你的大本营，保持整洁有序（时间流归档）。
* **Source 可以有多个**：这是“挂载”进来的，只做**数据库层面的映射**。
* **核心原则**：**Never touch user's external files.** （不要碰用户外部的文件）。如果用户要把其他软件（如 Zotero）的库加进来，你一旦改了文件名，Zotero 就炸了。所以，对于 External Source，**只读、只引、不改名**。


物理位置： C:\Users\<你的用户名>\AppData\Roaming\com.tauri-app.Workstation\pdf_library.db