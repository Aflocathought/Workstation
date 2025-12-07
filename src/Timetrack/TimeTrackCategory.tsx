// src/Timeline/TimeTrackCategory.tsx
import { Component } from 'solid-js';
import CategoryManager from './Category/CategoryManager';
import styles from './TimeTrackCategory.module.css';

/**
 * TimeTrack 的分类管理子页面
 * 包装 CategoryManager 组件
 */
const TimeTrackCategory: Component = () => {
  return (
    <div class={styles.categoryPage}>
      <div class={styles.header}>
        <h1 class={styles.title}>应用分类管理</h1>
        <p class={styles.description}>
          管理应用分类、配置颜色和项目分配
        </p>
      </div>
      
      <div class={styles.content}>
        <CategoryManager />
      </div>
    </div>
  );
};

export default TimeTrackCategory;
