import { Component, For, Show, createMemo } from "solid-js";
import styles from "./ThumbnailGrid.module.css";
import type { PageInfo } from "./csvPagination";

export interface ThumbnailData {
  pageIndex: number;
  points: Array<[number, number]>;
  isLoaded: boolean;
}

interface ThumbnailGridProps {
  thumbnails: ThumbnailData[];
  currentPage: number;
  totalPages: number;
  onPageClick: (pageIndex: number) => void;
  pageInfo: PageInfo[];
}

const ThumbnailGrid: Component<ThumbnailGridProps> = (props) => {
  return (
    <div class={styles.container}>
      <div class={styles.title}>数据分页预览 ({props.totalPages} 页)</div>
      <div
        class={styles.grid}
        onWheel={(e) => {
          if (e.deltaY !== 0) {
            e.preventDefault();
            e.currentTarget.scrollLeft += e.deltaY;
          }
        }}
      >
        <For each={props.thumbnails}>
          {(thumbnail) => {
            const isCurrent = () => thumbnail.pageIndex === props.currentPage;
            const pageInfo = () =>
              props.pageInfo[thumbnail.pageIndex];

            return (
              <div
                class={`${styles.thumbnail} ${isCurrent() ? styles.active : ""}`}
                onClick={() => props.onPageClick(thumbnail.pageIndex)}
                title={`第 ${thumbnail.pageIndex + 1} 页 (${pageInfo()?.startRow.toLocaleString()} - ${pageInfo()?.endRow.toLocaleString()} 行)`}
              >
                <div class={styles.pageNumber}>
                  {thumbnail.pageIndex + 1}
                </div>
                <Show
                  when={thumbnail.isLoaded && thumbnail.points.length > 0}
                  fallback={
                    <div class={styles.placeholder}>
                      {thumbnail.isLoaded ? "无数据" : "未加载"}
                    </div>
                  }
                >
                  <MiniChart points={thumbnail.points} />
                </Show>
                <div class={styles.rowRange}>
                  {formatRowCount(pageInfo()?.rowCount || 0)}
                </div>
              </div>
            );
          }}
        </For>
      </div>
    </div>
  );
};

/**
 * 迷你图表组件
 */
const MiniChart: Component<{ points: Array<[number, number]> }> = (props) => {
  const pathData = createMemo(() => {
    const points = props.points;
    if (points.length === 0) return "";

    // 计算数据范围
    let minY = Infinity;
    let maxY = -Infinity;
    let minX = Infinity;
    let maxX = -Infinity;

    for (const [x, y] of points) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }

    // 添加一些边距
    const rangeY = maxY - minY || 1;
    const rangeX = maxX - minX || 1;
    const padding = 0.1;

    minY -= rangeY * padding;
    maxY += rangeY * padding;

    // SVG 尺寸
    const width = 80;
    const height = 60;

    // 映射到 SVG 坐标
    const mapX = (x: number) => ((x - minX) / rangeX) * width;
    const mapY = (y: number) => height - ((y - minY) / (maxY - minY)) * height;

    // 生成路径
    const pathParts = points.map(([x, y], i) => {
      const px = mapX(x);
      const py = mapY(y);
      return i === 0 ? `M ${px} ${py}` : `L ${px} ${py}`;
    });

    return pathParts.join(" ");
  });

  return (
    <svg
      class={styles.miniChart}
      viewBox="0 0 80 60"
      preserveAspectRatio="none"
    >
      <path d={pathData()} fill="none" stroke="currentColor" stroke-width="1" />
    </svg>
  );
};

/**
 * 格式化行数显示
 */
function formatRowCount(count: number): string {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return count.toString();
}

export default ThumbnailGrid;
