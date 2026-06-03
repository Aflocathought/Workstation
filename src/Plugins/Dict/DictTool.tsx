import { createSignal, onCleanup, onMount } from 'solid-js';
import { ChatBridgeProvider } from './ChatBridgeContext';
import ChatSidebar from './ChatSidebar';
import DictionarySidebar from './DictionarySidebar';
import DictionaryView from './DictionaryView';
import './dict.css';

const LEFT_DRAWER_WIDTH_STORAGE_KEY = 'dict:left-drawer-width';
const RIGHT_DRAWER_WIDTH_STORAGE_KEY = 'dict:right-drawer-width';
const DEFAULT_LEFT_DRAWER_WIDTH = 280;
const DEFAULT_RIGHT_DRAWER_WIDTH = 380;
const MIN_LEFT_DRAWER_WIDTH = 220;
const MAX_LEFT_DRAWER_WIDTH = 440;
const MIN_RIGHT_DRAWER_WIDTH = 300;
const MAX_RIGHT_DRAWER_WIDTH = 600;
const DESKTOP_BREAKPOINT = 1280;
const DESKTOP_LAYOUT_PADDING = 48;
const DESKTOP_RESIZE_HANDLES_WIDTH = 24;
const MIN_DICTIONARY_VIEW_WIDTH = 420;

type DrawerSide = 'left' | 'right';

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function readStoredDrawerWidth(key: string, fallbackValue: number) {
  if (typeof window === 'undefined') {
    return fallbackValue;
  }

  const storedValue = Number(window.localStorage.getItem(key));

  return Number.isFinite(storedValue) && storedValue > 0
    ? storedValue
    : fallbackValue;
}

function persistDrawerWidth(key: string, width: number) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(key, String(Math.round(width)));
}

function DictTool() {
  const [leftDrawerWidth, setLeftDrawerWidth] = createSignal(
    readStoredDrawerWidth(
      LEFT_DRAWER_WIDTH_STORAGE_KEY,
      DEFAULT_LEFT_DRAWER_WIDTH,
    ),
  );
  const [rightDrawerWidth, setRightDrawerWidth] = createSignal(
    readStoredDrawerWidth(
      RIGHT_DRAWER_WIDTH_STORAGE_KEY,
      DEFAULT_RIGHT_DRAWER_WIDTH,
    ),
  );

  const clampDrawerWidth = (
    side: DrawerSide,
    width: number,
    oppositeDrawerWidth: number,
  ) => {
    const minWidth =
      side === 'left' ? MIN_LEFT_DRAWER_WIDTH : MIN_RIGHT_DRAWER_WIDTH;
    const maxWidth =
      side === 'left' ? MAX_LEFT_DRAWER_WIDTH : MAX_RIGHT_DRAWER_WIDTH;

    if (typeof window === 'undefined' || window.innerWidth < DESKTOP_BREAKPOINT) {
      return clamp(width, minWidth, maxWidth);
    }

    const availableWidth =
      window.innerWidth -
      DESKTOP_LAYOUT_PADDING -
      DESKTOP_RESIZE_HANDLES_WIDTH -
      MIN_DICTIONARY_VIEW_WIDTH -
      oppositeDrawerWidth;
    const responsiveMaxWidth = Math.max(
      minWidth,
      Math.min(maxWidth, availableWidth),
    );

    return clamp(width, minWidth, responsiveMaxWidth);
  };

  const startDrawerResize = (side: DrawerSide, event: PointerEvent) => {
    event.preventDefault();

    const startClientX = event.clientX;
    const startLeftDrawerWidth = leftDrawerWidth();
    const startRightDrawerWidth = rightDrawerWidth();
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (side === 'left') {
        const nextWidth = clampDrawerWidth(
          'left',
          startLeftDrawerWidth + moveEvent.clientX - startClientX,
          startRightDrawerWidth,
        );
        setLeftDrawerWidth(nextWidth);
        return;
      }

      const nextWidth = clampDrawerWidth(
        'right',
        startRightDrawerWidth + startClientX - moveEvent.clientX,
        startLeftDrawerWidth,
      );
      setRightDrawerWidth(nextWidth);
    };

    const handlePointerUp = () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      persistDrawerWidth(LEFT_DRAWER_WIDTH_STORAGE_KEY, leftDrawerWidth());
      persistDrawerWidth(RIGHT_DRAWER_WIDTH_STORAGE_KEY, rightDrawerWidth());
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  };

  onMount(() => {
    const handleWindowResize = () => {
      setLeftDrawerWidth((currentWidth) =>
        clampDrawerWidth('left', currentWidth, rightDrawerWidth()),
      );
      setRightDrawerWidth((currentWidth) =>
        clampDrawerWidth('right', currentWidth, leftDrawerWidth()),
      );
    };

    handleWindowResize();
    window.addEventListener('resize', handleWindowResize);

    onCleanup(() => {
      window.removeEventListener('resize', handleWindowResize);
    });
  });

  return (
    <ChatBridgeProvider>
      <div class="dict-plugin-root relative h-full overflow-hidden text-slate-800">
        <div class="dict-layout flex h-full min-h-0 flex-col gap-1 p-4 xl:flex-row xl:p-5">
          <aside
            class="dict-sidebar-pane min-h-65 w-full xl:min-h-0 xl:shrink-0"
            style={{ width: `${leftDrawerWidth()}px` }}
          >
            <DictionarySidebar />
          </aside>

          <button
            type="button"
            class="dict-resize-handle hidden xl:flex"
            aria-label="调整词典栏宽度"
            title="调整词典栏宽度"
            onPointerDown={(event) => startDrawerResize('left', event)}
          />

          <section class="dict-main-pane min-h-0 min-w-0 flex-1">
            <DictionaryView />
          </section>

          <button
            type="button"
            class="dict-resize-handle hidden xl:flex"
            aria-label="调整 AI 侧栏宽度"
            title="调整 AI 侧栏宽度"
            onPointerDown={(event) => startDrawerResize('right', event)}
          />

          <aside
            class="dict-sidebar-pane min-h-100 w-full xl:min-h-0 xl:shrink-0"
            style={{ width: `${rightDrawerWidth()}px` }}
          >
            <ChatSidebar />
          </aside>
        </div>
      </div>
    </ChatBridgeProvider>
  );
}

export default DictTool;