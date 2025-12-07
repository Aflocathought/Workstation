# Components 组件结构说明

本文档说明了 `src/components` 文件夹的组织结构。

## 📁 文件夹结构

```
src/components/
├── Layout/                         # 布局相关组件
│   ├── TitleBar/                  # 自定义窗口标题栏
│   │   ├── TitleBar.tsx           # 标题栏组件
│   │   ├── TitleBar.module.css    # 标题栏样式
│   │   └── index.ts               # 导出文件
│   ├── Navigation/                # 导航栏
│   │   ├── Navigation.tsx         # 导航组件
│   │   ├── Navigation.module.css  # 导航样式
│   │   └── index.ts               # 导出文件
│   └── NotificationContainer/     # 通知容器
│       ├── NotificationContainer.tsx        # 通知组件
│       ├── NotificationContainer.module.css # 通知样式
│       └── index.ts               # 导出文件
│
├── Category/                       # 应用分类管理
│   ├── CategoryManager.tsx        # 分类管理容器组件
│   ├── CategoryManagerModel.ts    # 分类管理模型（单例）
│   ├── CategoryManagerRenderer.tsx # 分类管理渲染器
│   ├── CategoryStore.ts           # 分类配置存储
│   ├── CategoryUtils.ts           # 分类工具函数
│   └── index.ts                   # 导出文件
│
└── Utils/                          # 通用工具函数
    ├── debounce.ts                # 防抖函数
    ├── FormatUtils.ts             # 格式化工具
    └── index.ts                   # 导出文件
```

## 🎯 组件分类说明

### Layout（布局组件）
存放影响整体应用布局的组件：
- **TitleBar**: 自定义窗口标题栏，包含窗口控制按钮（最小化、最大化、关闭）
- **Navigation**: VSCode 风格的标签导航栏
- **NotificationContainer**: 全局通知容器，用于显示 toast 消息

### Category（分类管理）
应用分类管理系统的所有相关文件：
- **CategoryManager**: 主容器组件，处理数据加载
- **CategoryManagerModel**: 分类管理的核心逻辑和状态管理（单例模式）
- **CategoryManagerRenderer**: UI 渲染组件
- **CategoryStore**: 响应式配置存储
- **CategoryUtils**: 分类相关的工具函数和类型定义

### Utils（工具函数）
可复用的通用工具函数：
- **debounce**: 防抖函数实现
- **FormatUtils**: 时间、日期、持续时间等格式化工具

## 📝 导入示例

### 从其他模块导入组件

```typescript
// 导入布局组件
import TitleBar from "@/components/Layout/TitleBar";
import Navigation from "@/components/Layout/Navigation";
import NotificationContainer from "@/components/Layout/NotificationContainer";

// 导入分类管理
import CategoryManager from "@/components/Category/CategoryManager";
import { CategoryManager as CategoryManagerClass } from "@/components/Category";
import type { CategoryConfig } from "@/components/Category";

// 导入工具函数
import { debounce } from "@/components/Utils";
import { formatDateTime, formatDuration } from "@/components/Utils";
```

### 使用索引文件简化导入

每个子文件夹都包含 `index.ts` 文件，可以简化导入路径：

```typescript
// 完整路径
import TitleBar from "@/components/Layout/TitleBar/TitleBar";

// 简化路径（推荐）
import TitleBar from "@/components/Layout/TitleBar";
```

## 🔧 维护指南

### 添加新组件
1. **布局组件**: 放入 `Layout/` 文件夹，创建独立子文件夹
2. **业务组件**: 根据功能创建新的文件夹（如 `Timeline/`、`Spectrum/`）
3. **工具函数**: 放入 `Utils/` 文件夹

### 命名规范
- **组件文件**: 使用 PascalCase（如 `TitleBar.tsx`）
- **样式文件**: 使用模块化 CSS（如 `TitleBar.module.css`）
- **工具函数**: 使用 camelCase（如 `debounce.ts`）
- **类型文件**: 使用 PascalCase 或描述性名称（如 `CategoryUtils.ts`）

### 索引文件模板

```typescript
// index.ts 示例
export { default } from "./ComponentName";
export * from "./ComponentName"; // 导出命名导出
```

## 📚 相关文档

- [应用架构文档](../../docs/Architecture.md)
- [开发路线图](../../docs/DevRoadmap.md)
- [VSCode 风格 UI 指南](../../docs/VSCodeStyleUI.md)

## 🗂️ 历史变更

- **2025-10-06**: 重组 components 文件夹结构
  - 创建 Layout、Category、Utils 子文件夹
  - 为每个组件创建独立子文件夹
  - 添加索引文件简化导入
  - 更新所有导入路径
