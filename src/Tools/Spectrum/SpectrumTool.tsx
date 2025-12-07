// src/Tools/SpectrumTool.tsx
import { Component } from 'solid-js';
import Spectrum from './Spectrum';
import styles from './SpectrumTool.module.css';

/**
 * Tools 的频谱分析子页面
 * 包装 Spectrum 组件
 */
const SpectrumTool: Component = () => {
  return (
    <div class={styles.spectrumTool}>
      <div class={styles.header}>
        <h1 class={styles.title}>音频频谱分析</h1>
        <p class={styles.description}>
          实时音频频谱可视化工具
        </p>
      </div>
      
      <div class={styles.content}>
        <Spectrum fullscreen={false} />
      </div>
    </div>
  );
};

export default SpectrumTool;
