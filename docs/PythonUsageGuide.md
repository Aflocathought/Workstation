# 🐍 Python 集成使用指南

## 📖 快速开始

### 1. 前提条件

确保你的系统已安装 Python 3.7 或更高版本：

```bash
# Windows
python --version

# macOS/Linux
python3 --version
```

如果未安装，请访问 [python.org](https://www.python.org/downloads/) 下载安装。

---

## 🎯 基本使用

### 在前端调用 Python 脚本

```typescript
import { pythonService } from '../services/PythonService';

// 1. 执行简单脚本
async function runHelloWorld() {
  const result = await pythonService.executeScript('hello.py', ['World']);
  
  if (result.success) {
    console.log('输出:', result.stdout);
  } else {
    console.error('错误:', result.stderr);
  }
}

// 2. 执行数据处理脚本
async function processData() {
  const inputData = JSON.stringify({
    items: ['apple', 'banana', 'orange', 123, 3.14]
  });
  
  const result = await pythonService.executeScript(
    'data_processor.py',
    [inputData]
  );
  
  if (result.success) {
    const data = JSON.parse(result.stdout);
    console.log('处理结果:', data);
  }
}

// 3. 使用便捷的 JSON 方法
async function processDataSimple() {
  const result = await pythonService.executeScriptWithJSON<{
    status: string;
    processed: any[];
  }>('data_processor.py', [
    JSON.stringify({ items: ['test', 'data'] })
  ]);
  
  console.log('状态:', result.status);
  console.log('处理后的数据:', result.processed);
}
```

---

## 📝 编写 Python 脚本

### 脚本位置

脚本应放在以下目录：

- **示例脚本**: `python_scripts/examples/` (只读)
- **用户脚本**: `python_scripts/user/` (可编辑)

### 脚本模板

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
你的脚本描述
"""

import sys
import json

def main():
    """主函数"""
    try:
        # 1. 获取输入参数
        if len(sys.argv) > 1:
            input_str = sys.argv[1]
            input_data = json.loads(input_str)
        else:
            input_data = {}
        
        # 2. 处理数据
        result = process(input_data)
        
        # 3. 输出 JSON 结果
        print(json.dumps(result, ensure_ascii=False))
        
    except Exception as e:
        # 4. 错误处理
        error_result = {
            'status': 'error',
            'error': str(e)
        }
        print(json.dumps(error_result, ensure_ascii=False))
        sys.exit(1)

def process(data):
    """处理逻辑"""
    # 你的处理代码
    return {
        'status': 'success',
        'result': data
    }

if __name__ == "__main__":
    main()
```

---

## 🔧 API 参考

### PythonService 类

#### executeScript(scriptName, args)

执行 Python 脚本。

**参数:**
- `scriptName` (string): 脚本文件名，例如 `"hello.py"`
- `args` (string[]): 参数数组，可选

**返回:** `Promise<PythonResult>`

```typescript
const result = await pythonService.executeScript('script.py', ['arg1', 'arg2']);
```

#### executeScriptWithJSON<T>(scriptName, args)

执行脚本并自动解析 JSON 输出。

**参数:**
- `scriptName` (string): 脚本文件名
- `args` (string[]): 参数数组，可选

**返回:** `Promise<T>` - 解析后的 JSON 对象

```typescript
interface MyResult {
  status: string;
  data: any[];
}

const result = await pythonService.executeScriptWithJSON<MyResult>(
  'processor.py',
  [JSON.stringify({ input: 'test' })]
);
```

#### listScripts()

列出所有可用脚本。

**返回:** `Promise<ScriptInfo[]>`

```typescript
const scripts = await pythonService.listScripts();
scripts.forEach(script => {
  console.log(`${script.name} (${script.size} bytes)`);
});
```

#### saveScript(name, content)

保存新脚本。

**参数:**
- `name` (string): 脚本名称，必须以 `.py` 结尾
- `content` (string): 脚本内容

**返回:** `Promise<void>`

```typescript
await pythonService.saveScript('my_script.py', `
import sys
print(f"Hello, {sys.argv[1]}")
`);
```

#### readScript(name)

读取脚本内容。

**返回:** `Promise<string>`

```typescript
const content = await pythonService.readScript('hello.py');
console.log(content);
```

#### deleteScript(name)

删除用户脚本（只能删除 user/ 目录下的脚本）。

**返回:** `Promise<void>`

```typescript
await pythonService.deleteScript('my_script.py');
```

#### getPythonInfo()

获取 Python 环境信息。

**返回:** `Promise<PythonInfo>`

```typescript
const info = await pythonService.getPythonInfo();
console.log(`Python ${info.version} - ${info.executable}`);
```

---

## 💡 实用示例

### 示例 1: 数据转换

```python
# csv_to_json.py
import sys
import json
import csv
from io import StringIO

def csv_to_json(csv_data):
    reader = csv.DictReader(StringIO(csv_data))
    return list(reader)

if __name__ == "__main__":
    csv_input = sys.argv[1]
    result = csv_to_json(csv_input)
    print(json.dumps(result, ensure_ascii=False))
```

```typescript
// 前端调用
const csvData = "name,age\nJohn,30\nJane,25";
const result = await pythonService.executeScriptWithJSON('csv_to_json.py', [csvData]);
console.log(result); // [{ name: 'John', age: '30' }, ...]
```

### 示例 2: 图像处理

```python
# image_info.py
import sys
import json
from PIL import Image

def get_image_info(filepath):
    img = Image.open(filepath)
    return {
        'width': img.width,
        'height': img.height,
        'format': img.format,
        'mode': img.mode
    }

if __name__ == "__main__":
    filepath = sys.argv[1]
    info = get_image_info(filepath)
    print(json.dumps(info))
```

```typescript
// 前端调用
const info = await pythonService.executeScriptWithJSON('image_info.py', [
  'C:/path/to/image.jpg'
]);
console.log(`图片尺寸: ${info.width}x${info.height}`);
```

### 示例 3: 文本分析

```python
# text_analyzer.py
import sys
import json
from collections import Counter

def analyze_text(text):
    words = text.lower().split()
    word_freq = Counter(words)
    
    return {
        'total_words': len(words),
        'unique_words': len(word_freq),
        'most_common': word_freq.most_common(10)
    }

if __name__ == "__main__":
    text = sys.argv[1]
    result = analyze_text(text)
    print(json.dumps(result, ensure_ascii=False))
```

---

## 🔒 安全注意事项

### 1. 路径安全

脚本只能访问指定目录下的文件：

```python
# ✅ 安全 - 相对路径
with open('data.txt', 'r') as f:
    content = f.read()

# ❌ 危险 - 绝对路径可能访问敏感文件
with open('/etc/passwd', 'r') as f:  # 不推荐
    pass
```

### 2. 参数验证

始终验证用户输入：

```python
def process_user_input(data):
    # 验证数据类型
    if not isinstance(data, dict):
        raise ValueError("Input must be a dictionary")
    
    # 验证必需字段
    if 'required_field' not in data:
        raise ValueError("Missing required field")
    
    # 清理和转义
    safe_data = {k: str(v)[:100] for k, v in data.items()}
    return safe_data
```

### 3. 超时控制

长时间运行的脚本可能需要超时控制：

```typescript
// 前端添加超时
const timeoutPromise = new Promise((_, reject) =>
  setTimeout(() => reject(new Error('Timeout')), 30000)
);

const result = await Promise.race([
  pythonService.executeScript('long_task.py'),
  timeoutPromise
]);
```

---

## 🐛 调试技巧

### 1. 使用 print() 调试

```python
import sys

print("Debug: Processing started", file=sys.stderr)
# 你的代码
print("Debug: Processing completed", file=sys.stderr)
```

### 2. 查看错误信息

```typescript
const result = await pythonService.executeScript('script.py');

if (!result.success) {
  console.error('标准错误输出:', result.stderr);
  console.error('退出码:', result.exit_code);
}
```

### 3. 测试脚本

直接在命令行测试：

```bash
# Windows
python python_scripts/examples/hello.py "Test"

# macOS/Linux
python3 python_scripts/examples/hello.py "Test"
```

---

## 📦 依赖管理

如果脚本需要第三方库：

### 1. 创建 requirements.txt

```text
# python_scripts/requirements.txt
pandas==2.0.0
numpy==1.24.0
pillow==10.0.0
```

### 2. 安装依赖

```bash
pip install -r python_scripts/requirements.txt
```

### 3. 在脚本中检查依赖

```python
def check_dependencies():
    try:
        import pandas
        import numpy
        return True
    except ImportError as e:
        print(f"Missing dependency: {e}", file=sys.stderr)
        return False
```

---

## ❓ 常见问题

### Q: Python 找不到怎么办？

A: 确保 Python 在系统 PATH 中，或在应用设置中指定 Python 路径。

### Q: 脚本执行失败怎么办？

A: 检查 `result.stderr` 查看错误信息，并确保脚本语法正确。

### Q: 如何传递复杂数据？

A: 使用 JSON 格式：

```typescript
const complexData = {
  users: [...],
  settings: {...}
};

await pythonService.executeScript('script.py', [
  JSON.stringify(complexData)
]);
```

### Q: 可以执行异步任务吗？

A: 可以，脚本会在后台执行，不会阻塞 UI。

---

## 🚀 下一步

- 查看 `python_scripts/examples/` 中的示例脚本
- 在 UI 中测试快速示例
- 编写你自己的数据处理脚本
- 集成到你的工作流中

**祝你使用愉快！** 🎉
