// src/Tools/Spectrum/index.ts
import type { ToolConfig } from '../types';
import { ToolCategory } from '../types';

/**
 * 频谱分析工具配置
 */
export const spectrumToolConfig: ToolConfig = {
  id: 'tools-spectrum',
  name: '频谱分析',
  icon: '🎵',
  description: '音频频谱可视化工具',
  category: ToolCategory.MEDIA,
  component: () => import('./SpectrumTool'),
  saveState: false,
};

