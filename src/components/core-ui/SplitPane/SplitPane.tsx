import { createSignal, JSX, onCleanup } from 'solid-js';
import styles from './SplitPane.module.css';

export interface SplitPaneProps {
  leftPane: JSX.Element;
  rightPane: JSX.Element;
  defaultRightWidth?: number;
}

export const SplitPane = (props: SplitPaneProps) => {
  const defaultWidth = props.defaultRightWidth ?? 300;
  const snapThreshold = 150;

  const [rightWidth, setRightWidth] = createSignal(defaultWidth);
  const [isDragging, setIsDragging] = createSignal(false);
  const [isCollapsed, setIsCollapsed] = createSignal(false);

  let containerRef: HTMLDivElement | undefined;

  const handlePointerDown = (e: PointerEvent) => {
    if (isCollapsed()) {
      // If collapsed, clicking the resizer restores it
      setIsCollapsed(false);
      setRightWidth(defaultWidth);
      return;
    }

    e.preventDefault();
    setIsDragging(true);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (!isDragging() || !containerRef) return;
      
      const containerRect = containerRef.getBoundingClientRect();
      const newRightWidth = containerRect.right - moveEvent.clientX;

      if (newRightWidth < snapThreshold) {
        setIsCollapsed(true);
        setRightWidth(0);
        setIsDragging(false);
        cleanup();
      } else {
        // Prevent right pane from taking more than 90% of container
        const maxWidth = containerRect.width * 0.9;
        setRightWidth(Math.min(newRightWidth, maxWidth));
      }
    };

    const handlePointerUp = () => {
      setIsDragging(false);
      cleanup();
    };

    const cleanup = () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
    };

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);

    onCleanup(cleanup);
  };

  return (
    <div class={styles.container} ref={containerRef}>
      <div class={styles.leftPane}>
        {props.leftPane}
      </div>
      <div
        class={`${styles.resizer} ${isCollapsed() ? styles.collapsed : ''} ${isDragging() ? styles.dragging : ''}`}
        onPointerDown={handlePointerDown}
      />
      <div
        class={styles.rightPane}
        style={{ width: isCollapsed() ? '0px' : `${rightWidth()}px`, display: isCollapsed() ? 'none' : 'block' }}
      >
        {props.rightPane}
      </div>
    </div>
  );
};
