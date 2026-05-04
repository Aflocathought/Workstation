// src/Tools/Python/index.ts
import type { ToolConfig } from '../types';
import { ToolCategory } from '../types';
import Code from '@suid/icons-material/Code';

/**
 * Python 工具配置
 */
export const pythonToolConfig: ToolConfig = {
  id: 'tools-python',
  name: 'Python 工具',
  icon: Code,
  description: 'Python 脚本执行工具',
  category: ToolCategory.DEVELOPMENT,
  component: () => import('./PythonTool'),
  saveState: true, // Python 工具需要保存代码状态
};

