# 工具状态保存 API

## 概述

新的工具系统支持自动状态保存和恢复。当用户切换工具或关闭工具时,系统会自动保存工具的状态,下次打开时自动恢复。

## 如何让你的工具支持状态保存

### 1. 在工具配置中启用状态保存

```typescript
// YourTool/index.ts
export const yourToolConfig: ToolConfig = {
  id: 'tools-yourtool',
  name: '你的工具',
  icon: '🎨',
  description: '工具描述',
  category: ToolCategory.DEVELOPMENT,
  component: () => import('./YourTool'),
  saveState: true,  // ⬅️ 启用状态保存
};
```

### 2. 在工具组件中实现状态接口

你的工具组件需要实现两个方法:

- `getState()`: 返回需要保存的状态
- `setState(state)`: 恢复保存的状态

#### 示例 1: 使用 ref 导出方法

```tsx
// YourTool.tsx
import { Component, createSignal } from 'solid-js';

const YourTool: Component = (props) => {
  const [code, setCode] = createSignal('');
  const [output, setOutput] = createSignal('');

  // 暴露给父组件的接口
  if (props.ref) {
    props.ref({
      // 获取状态
      getState: () => ({
        code: code(),
        output: output(),
      }),
      
      // 恢复状态
      setState: (state: any) => {
        if (state.code) setCode(state.code);
        if (state.output) setOutput(state.output);
      },
    });
  }

  return (
    <div>
      <textarea 
        value={code()} 
        onInput={(e) => setCode(e.currentTarget.value)}
      />
      <pre>{output()}</pre>
    </div>
  );
};

export default YourTool;
```

#### 示例 2: 使用 forwardRef (更优雅)

```tsx
// YourTool.tsx
import { Component, createSignal, mergeProps } from 'solid-js';

interface YourToolProps {
  ref?: (instance: any) => void;
}

const YourTool: Component<YourToolProps> = (props) => {
  const [code, setCode] = createSignal('');
  const [output, setOutput] = createSignal('');

  // 创建实例接口
  const instance = {
    getState: () => ({
      code: code(),
      output: output(),
      timestamp: Date.now(),
    }),
    
    setState: (state: any) => {
      if (state?.code) setCode(state.code);
      if (state?.output) setOutput(state.output);
      console.log('✅ 状态已恢复', state);
    },
  };

  // 通过 ref 暴露实例
  if (props.ref) {
    props.ref(instance);
  }

  return (
    <div>
      <h3>代码编辑器</h3>
      <textarea 
        value={code()} 
        onInput={(e) => setCode(e.currentTarget.value)}
        placeholder="输入代码..."
      />
      <button onClick={() => setOutput('执行结果...')}>运行</button>
      <pre>{output()}</pre>
    </div>
  );
};

export default YourTool;
```

## 状态保存时机

系统会在以下情况自动保存状态:

1. **切换到其他工具时** - 保存当前工具状态
2. **关闭工具时** - 保存并清空容器
3. **页面卸载时** - 保存所有状态

## 状态存储位置

- 使用 `localStorage` 存储
- 存储键: `tools-state`
- 格式: JSON 对象,键为工具 ID

## 完整示例: Python 工具

```tsx
// Python/PythonTool.tsx
import { Component, createSignal } from 'solid-js';

interface PythonToolProps {
  ref?: (instance: any) => void;
}

const PythonTool: Component<PythonToolProps> = (props) => {
  const [code, setCode] = createSignal('print("Hello, World!")');
  const [output, setOutput] = createSignal('');
  const [isRunning, setIsRunning] = createSignal(false);

  // 运行 Python 代码
  const runCode = async () => {
    setIsRunning(true);
    try {
      // 调用后端 API 执行代码
      const result = await executePythonCode(code());
      setOutput(result);
    } catch (error) {
      setOutput(`错误: ${error}`);
    } finally {
      setIsRunning(false);
    }
  };

  // 暴露状态接口
  const instance = {
    getState: () => ({
      code: code(),
      output: output(),
      savedAt: new Date().toISOString(),
    }),
    
    setState: (state: any) => {
      if (state?.code !== undefined) {
        setCode(state.code);
      }
      if (state?.output !== undefined) {
        setOutput(state.output);
      }
      console.log(`🐍 Python 工具状态已恢复 (保存于: ${state?.savedAt || '未知'})`);
    },
  };

  if (props.ref) {
    props.ref(instance);
  }

  return (
    <div class="python-tool">
      <div class="editor">
        <textarea
          value={code()}
          onInput={(e) => setCode(e.currentTarget.value)}
          placeholder="输入 Python 代码..."
          rows={15}
        />
      </div>
      
      <div class="actions">
        <button onClick={runCode} disabled={isRunning()}>
          {isRunning() ? '运行中...' : '▶ 运行'}
        </button>
      </div>

      <div class="output">
        <h4>输出:</h4>
        <pre>{output() || '(无输出)'}</pre>
      </div>
    </div>
  );
};

export default PythonTool;
```

## 最佳实践

### ✅ 应该保存的状态

- 用户输入的内容 (代码、文本等)
- 配置选项
- UI 状态 (折叠/展开等)
- 临时计算结果

### ❌ 不应该保存的状态

- 敏感信息 (密码、token 等)
- 大型文件内容 (超过 1MB)
- 实时数据 (需要每次重新获取)
- 临时 UI 状态 (loading、error 等)

### 状态大小限制

- 建议每个工具的状态 < 100KB
- localStorage 总容量约 5-10MB
- 超出限制时会清除最旧的状态

## 手动清除状态

如果需要手动清除某个工具的状态:

```typescript
import { toolStateManager } from './ToolStateManager';

// 清除特定工具状态
toolStateManager.clearState('tools-python');

// 清除所有工具状态
toolStateManager.clearAllStates();
```

## 调试

启用状态保存后,在浏览器控制台可以看到:

```
✅ 已保存工具状态: Python 工具
🔄 恢复工具状态: Python 工具 { code: "...", output: "..." }
```

可以在浏览器开发者工具中查看 localStorage:

```
Application → Local Storage → tools-state
```
