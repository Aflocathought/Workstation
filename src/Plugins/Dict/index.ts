import MenuBook from '@suid/icons-material/MenuBook';
import { ToolCategory, type ToolConfig } from '../types';

export const dictToolConfig: ToolConfig = {
  id: 'tools-dict',
  name: '本地词典',
  icon: MenuBook,
  description: '本地词典检索与 AI 辅助学习工具',
  category: ToolCategory.PRODUCTIVITY,
  component: () => import('./DictTool'),
  saveState: false,
};

export default dictToolConfig;