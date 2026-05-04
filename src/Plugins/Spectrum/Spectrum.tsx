import { createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { listen } from "@tauri-apps/api/event";
import { useAppFramework } from "../../core/AppFramework";
import "./spectrum.css";
import { debounce } from "../../components/Utils/debounce";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

// 使用随机字符展示频谱柱，字符数量随窗口大小自适应
export default function Spectrum(props: { fullscreen?: boolean }) {
  const framework = useAppFramework();
  // —— 常量 ——
  const CHAR_WIDTH = 7; // px (配合 12px 字号)
  const LINE_HEIGHT = 14; // px (配合 14px 行高)
  const PADDING_COLS = 2; // 左右边距
  const PADDING_ROWS = 2; // 上下边距
  const DEMO_COLS = 96; // 演示模式列数
  const EPS = 1e-8; // 避免 log(0)
  const WINDOW_FLOAT_KEY = "mainWindowFloatMode";
  const SYMBOLS = ["_", "·", "o", ":", "-", "*", "^"] as const; // 低->高

  const [bins, setBins] = createSignal<number[]>([]); // 0..1 幅值
  const [cols, setCols] = createSignal(64);
  const [rows, setRows] = createSignal(20);
  const [status, setStatus] = createSignal("等待音频数据...");
  const [sensitivity, setSensitivity] = createSignal(1.0); // 响应强度
  const [fftSize, setFftSize] = createSignal(2048);
  const [columns, setColumns] = createSignal(96);
  const [useDemo, setUseDemo] = createSignal(true); // 无数据时启用本地演示
  const [showMenu, setShowMenu] = createSignal(false);
  const [menuPos, setMenuPos] = createSignal<{ x: number; y: number }>({
    x: 8,
    y: 32,
  });
  // dB 范围设置（固定每行对应相同 dB 步进）
  const [maxDb, setMaxDb] = createSignal(10); // 顶部对应的 dB
  const [minDb, setMinDb] = createSignal(-70); // 底部对应的 dB
  // 频谱以线性幅值(0..1)直接映射行高（将改为 dB→行高）
  // 列数强制自动：根据容器宽度，用户不可调整

  let container!: HTMLDivElement;
  const [floatUI, setFloatUI] = createSignal(false);
  let unlisten: (() => void) | undefined;
  let disposers: Array<() => void> = [];
  let demoTimer: number | undefined;
  const [showDragBar, setShowDragBar] = createSignal(false);
  let dragBarTimer: number | undefined;

  function measure() {
    if (!container) return;
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    // 估算单字符宽高（针对等宽字体）
    const newCols = Math.max(8, Math.floor(w / CHAR_WIDTH) - PADDING_COLS);
    const newRows = Math.max(8, Math.floor(h / LINE_HEIGHT) - PADDING_ROWS);
    // 仅自动列数
    setCols(newCols);
    setRows(newRows);
  }

  // 在下一帧（可连跳多帧）重新测量，确保样式/窗口装饰变化应用后再获取正确尺寸
  function remeasureSoon(frames: number = 1) {
    let i = 0;
    const step = () => {
      measure();
      i++;
      if (i < frames) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  onMount(async () => {
    // 确保频谱采集已启动（若已在运行会被忽略）
    try {
      // --- 设置持久化 ---
      const STORAGE_KEY = "spectrumSettings";
      type Saved = {
        maxDb: number;
        minDb: number;
        sensitivity: number;
        mode: "peaks" | "bars";
        smooth: number;
        decay: number;
        fftSize: number;
        columns: number;
      };
      function applySaved(s: Partial<Saved>) {
        if (s.maxDb !== undefined) setMaxDb(s.maxDb);
        if (s.minDb !== undefined) setMinDb(s.minDb);
        if (s.sensitivity !== undefined) setSensitivity(s.sensitivity);
        if (s.mode !== undefined) setMode(s.mode);
        if (s.smooth !== undefined) setSmooth(s.smooth);
        if (s.decay !== undefined) setDecay(s.decay);
        if (s.fftSize !== undefined) setFftSize(s.fftSize);
        if (s.columns !== undefined) setColumns(s.columns);
      }
      const saveDebounced = debounce(() => {
        try {
          const data: Saved = {
            maxDb: maxDb(),
            minDb: minDb(),
            sensitivity: sensitivity(),
            mode: mode(),
            smooth: smooth(),
            decay: decay(),
            fftSize: fftSize(),
            columns: columns(),
          };
          localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch {}
      }, 250);

      createEffect(() => {
        // 任何相关参数变化时触发保存（节流）
        void maxDb();
        void minDb();
        void sensitivity();
        void mode();
        void smooth();
        void decay();
        void fftSize();
        void columns();
        saveDebounced();
      });

      // 先加载持久化设置
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<Saved>;
          applySaved(parsed);
        }
      } catch {}
      await framework.repository.startSpectrum();
      // 同步当前参数
      await framework.repository.setSpectrumFFTSize(fftSize());
      await framework.repository.setSpectrumColumns(columns());
    } catch {}
    // 根据保存的浮窗模式恢复仅主窗口 UI 状态
    try {
      const win = getCurrentWebviewWindow();
      if (win.label === "main") {
        const isFloatSaved = localStorage.getItem(WINDOW_FLOAT_KEY) === "1";
        if (isFloatSaved) {
          setGlobalOverflowHidden(true);
          setFloatUI(true);
          // 恢复浮窗后立即重新测量，保证字符填满窗口
          remeasureSoon(2);
        }
      }
    } catch {}
    measure();
    window.addEventListener("resize", measure);
    // 监听后端推送的频谱数据（0..1 数组）
    unlisten = await listen<number[]>("spectrum:data", (event) => {
      const data = event.payload || [];
      setBins(data);
      if (data.length > 0) {
        setUseDemo(false);
        setStatus("接收中");
      }
    });
    if (unlisten) disposers.push(unlisten);

    // 监听状态信息（后端会在初始化/无数据超时等情况下推送）
    const offStatus = await listen<string>("spectrum:status", (ev) => {
      const msg = (ev.payload ?? "").toString();
      if (msg) setStatus(msg);
    });
    if (offStatus) disposers.push(offStatus);

    // 启动本地演示：如果 800ms 内未收到数据，先用演示波形填充，直到有真实数据到达
    let t = 0;
    const step = () => {
      if (!useDemo()) return; // 收到真实数据后停止演示
      const n = DEMO_COLS;
      const arr = Array.from({ length: n }, (_, i) => {
        const x = i / n;
        const v =
          Math.abs(Math.sin((t * 2 + x * 8) * Math.PI)) * (1 - x) * 0.9 +
          Math.abs(Math.sin((t * 0.35 + x * 24) * Math.PI)) * 0.35;
        return Math.max(0, Math.min(1, v));
      });
      setBins(arr);
      t += 0.016;
      demoTimer = window.setTimeout(step, 16) as unknown as number;
    };
    // 延迟一会儿再开始演示，优先等后端事件
    demoTimer = window.setTimeout(() => {
      if (useDemo()) {
        setStatus("演示模式");
        step();
      }
    }, 800) as unknown as number;
  });

  onCleanup(() => {
    window.removeEventListener("resize", measure);
    for (const d of disposers)
      try {
        d();
      } catch {}
    // 事件监听由 Tauri SDK 自身管理随页面卸载清理。
    if (demoTimer) clearTimeout(demoTimer);
    if (dragBarTimer) clearTimeout(dragBarTimer);
  });

  // 线性幅值显示：不做 dB 压缩，字符高度直接对应幅值（0..1）

  // 将任意长度 bins 映射为 targetCols 长度
  // - 当 src 较大（原始 FFT 规模）时：x 轴按对数取样
  // - 当 src 已是较小列数（如后端已对频率做了重采样至 ~96 列）：使用线性区间最大，避免“双重对数”
  // 末端采用严格线性幅值（0..1），字符高度直接对应幅值
  function mapToCols(src: number[], targetCols: number): number[] {
    if (src.length === 0) return new Array(targetCols).fill(0);
    const out = new Array(targetCols).fill(0);
    // 如果源数据很可能是“原始FFT半谱”（非常长），采用对数频率采样；
    // 否则（例如后端已经重采样到 32..256 列），使用线性区间最大，避免“双重对数”导致低频过重。
    const likelyDownsampled = src.length >= 32 && src.length <= 256;
    if (!likelyDownsampled && src.length > targetCols * 2) {
      // 使用对数频率采样
      const minIdx = 1;
      const maxIdx = src.length; // inclusive 表述
      const lnMin = Math.log(minIdx);
      const lnMax = Math.log(maxIdx);
      const span = Math.max(1e-6, lnMax - lnMin);
      for (let i = 0; i < targetCols; i++) {
        const p0 = i / targetCols;
        const p1 = (i + 1) / targetCols;
        const idx0 = Math.max(1, Math.floor(Math.exp(lnMin + p0 * span)));
        const idx1 = Math.max(
          idx0 + 1,
          Math.floor(Math.exp(lnMin + p1 * span))
        );
        let mx = 0;
        const end = Math.min(idx1, maxIdx);
        for (let j = idx0; j < end; j++) {
          mx = Math.max(mx, src[j - 1] ?? 0);
        }
        out[i] = Math.max(0, mx);
      }
    } else {
      // 线性区间最大
      for (let i = 0; i < targetCols; i++) {
        const start = Math.floor((i / targetCols) * src.length);
        const end = Math.floor(((i + 1) / targetCols) * src.length);
        let mx = 0;
        for (let j = start; j < Math.max(end, start + 1); j++) {
          mx = Math.max(mx, src[Math.min(j, src.length - 1)]);
        }
        out[i] = Math.max(0, mx);
      }
    }
    return out;
  }

  // 生成字符画，每列高度按 rows * value，字符随机
  const [html, setHtml] = createSignal<string>("");
  const [mode, setMode] = createSignal<"peaks" | "bars">("peaks");
  const [smooth, setSmooth] = createSignal(0.35); // EMA 平滑系数(0..1)
  const [decay, setDecay] = createSignal(0.8); // 峰值衰减速率（每秒相对比例）
  let ema: number[] = [];
  let peak: number[] = [];
  let rafId: number | undefined;

  function colorForHeight(h: number, rows: number) {
    const ratio = rows <= 1 ? 0 : h / Math.max(1, rows - 1);
    const hue = 100 * (1 - ratio); // 绿->红
    return `hsl(${hue}, 100%, 50%)`;
  }

  createEffect(() => {
    // 启动/重启动画循环，以当前 bins 为输入，按所选模式绘制
    if (rafId) cancelAnimationFrame(rafId);
    const c = cols();
    const r = rows();
    ema = new Array(c).fill(0);
    peak = new Array(c).fill(0);
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      const dt = Math.max(0.001, (now - last) / 1000);
      last = now;

      const m = mapToCols(bins(), c);
      const a = Math.min(1, Math.max(0.01, smooth()));
      const dec = Math.max(0.01, decay());
      const sens = Math.max(0.1, sensitivity());

      // EMA 平滑 + 峰值保持
      for (let i = 0; i < c; i++) {
        const v = Math.max(0, m[i] * sens);
        ema[i] = ema[i] * (1 - a) + v * a;
        const fall = 1 - (1 - dec) ** dt; // 将每秒衰减比例映射到 dt
        peak[i] = Math.max(ema[i], peak[i] * (1 - fall));
      }

      // asciiScope 风格：每列只渲染一字符（峰值位置），其余空格；使用彩色 span
      const lines: string[] = new Array(r);
      for (let row = 0; row < r; row++) lines[row] = "";

      const symbols = SYMBOLS;

      for (let x = 0; x < c; x++) {
        // 将线性幅值转换为 dB，使用固定 dB/行 的方式映射高度
        const v = Math.max(ema[x], EPS);
        const db = 20 * Math.log10(v);
        const hi = Math.max(maxDb(), minDb() + 1e-3);
        const lo = Math.min(minDb(), hi - 1e-3);
        const rowsSpan = Math.max(1, r - 1);
        const dbPerRow = (hi - lo) / rowsSpan; // 每行对应的 dB
        const hFloat = (db - lo) / dbPerRow; // lo→0, hi→rowsSpan
        // 限制在可见范围
        const hClamped = Math.max(0, Math.min(rowsSpan, hFloat));
        // 下方坐标系需要用 r-1-h
        const hUsed = hClamped;
        const hInt = Math.floor(hFloat);
        const frac = hUsed - Math.floor(hUsed);
        const y = Math.max(0, Math.min(r - 1, r - 1 - Math.floor(hUsed)));
        const color = colorForHeight(hInt, r);
        const idx = Math.min(
          symbols.length - 1,
          Math.floor(frac * symbols.length)
        );
        const ch = symbols[idx];

        for (let row = 0; row < r; row++) {
          if (row === y) {
            lines[row] += `<span style="color:${color}">${ch}</span>`;
          } else {
            lines[row] += " ";
          }
        }
      }

      setHtml(lines.join("\n"));
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  });

  // 列数固定为自动，无需监听或持久化

  const effectiveFullscreen = () => (props.fullscreen ?? true) || floatUI();

  // —— 小工具 ——
  function setGlobalOverflowHidden(on: boolean) {
    document.documentElement.style.overflow = on ? "hidden" : "";
    document.body.style.overflow = on ? "hidden" : "";
  }

  return (
    <div
      ref={container}
      style={{
        position: effectiveFullscreen() ? "fixed" : "relative",
        inset: effectiveFullscreen() ? "0" : undefined,
        height: effectiveFullscreen() ? undefined : "100%",
        width: "100%",
        background: effectiveFullscreen() ? "#050607" : "transparent",
        color: "#19f5aa",
        overflow: "hidden",
        "font-family": "Consolas, 'Cascadia Mono', Menlo, monospace",
        "font-size": "12px",
        "line-height": "14px",
        "user-select": "none",
        "white-space": "pre",
        display: "flex",
        "flex-direction": "column",
        "border-radius": effectiveFullscreen() ? undefined : "8px",
        border: effectiveFullscreen() ? undefined : "1px solid #1a262f",
        "z-index": effectiveFullscreen() ? 9999 : undefined,
      }}
      aria-label="Frequency Spectrum"
      onContextMenu={(e) => {
        e.preventDefault();
        setMenuPos({ x: e.clientX, y: e.clientY });
        setShowMenu(true);
      }}
      onClick={() => showMenu() && setShowMenu(false)}
    >
      <div
        style={{
          padding: "4px",
          flex: 1,
          overflow: "hidden",
          background: "#070a0d",
          "border-top": "1px solid #0b1116",
        }}
      >
        {!effectiveFullscreen() && (
          <div style={{ padding: "0 4px", opacity: 0.6, "font-size": "11px" }}>
            {status()}
          </div>
        )}
        <div
          style={{
            margin: 0,
            padding: 0,
            background: "transparent",
            "white-space": "pre",
          }}
          innerHTML={html()}
          onDblClick={async () => {
            try {
              const win = getCurrentWebviewWindow();
              const label = win.label;
              // 仅对主窗口生效
              if (label !== "main") return;
              const key = WINDOW_FLOAT_KEY;
              const isFloat = localStorage.getItem(WINDOW_FLOAT_KEY) === "1";
              if (!isFloat) {
                await win.setDecorations(false);
                await win.setAlwaysOnTop(true);
                await win.setResizable(true);
                // 可选：若窗口很大，适当缩小
                // try { const s = await win.outerSize(); if (s.width > 1200) await win.setSize({ width: 900, height: Math.max(520, s.height - 100) }); } catch {}
                localStorage.setItem(key, "1");
                setGlobalOverflowHidden(true);
                setFloatUI(true);
                // 切换为浮窗后立刻重新测量，填满窗口
                remeasureSoon(2);
              } else {
                await win.setAlwaysOnTop(false);
                await win.setDecorations(true);
                localStorage.setItem(key, "0");
                setGlobalOverflowHidden(false);
                setFloatUI(false);
                // 退出浮窗后重新测量，回到容器布局
                remeasureSoon(2);
              }
            } catch (e) {
              console.error(e);
            }
          }}
          onClick={() => {
            // 浮窗模式下，点击频谱时短暂显示拖拽栏
            if (!floatUI()) return;
            setShowDragBar(true);
            if (dragBarTimer) clearTimeout(dragBarTimer);
            dragBarTimer = window.setTimeout(
              () => setShowDragBar(false),
              2000
            ) as unknown as number;
          }}
        ></div>
      </div>
      {floatUI() && showDragBar() && (
        <div
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            top: 0,
            height: "24px",
            background: "rgba(20,26,31,0.85)",
            color: "#9fb9ad",
            display: "flex",
            "align-items": "center",
            "justify-content": "center",
            "user-select": "none",
            cursor: "grab",
            "-webkit-app-region": "drag",
            "z-index": 100,
            border: "1px solid #1a262f",
            "border-left": "none",
            "border-right": "none",
          }}
          onMouseDown={async (e) => {
            e.preventDefault();
            try {
              const win = getCurrentWebviewWindow();
              await win.startDragging();
            } catch {}
          }}
        >
          <div style={{ opacity: 0.8, "letter-spacing": "4px" }}>···</div>
        </div>
      )}
      {showMenu() && (
        <div
          style={{
            position: "fixed",
            left: `${menuPos().x}px`,
            top: `${menuPos().y}px`,
            background: "#101418",
            color: "#cfeee2",
            border: "1px solid #1a262f",
            "box-shadow": "0 6px 24px rgba(0,0,0,0.35)",
            "border-radius": "6px",
            padding: "8px",
            "font-size": "12px",
            "z-index": 10,
            "min-width": "340px",
          }}
          class="spectrum-menu"
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ "margin-bottom": "6px", opacity: 0.8 }}>快速设置</div>
          <div
            style={{
              display: "flex",
              "align-items": "center",
              gap: "8px",
              "margin-bottom": "6px",
            }}
          >
            dB 范围
            <label>Max</label>
            <input
              type="number"
              step="1"
              value={maxDb()}
              onInput={(e) => {
                const v = parseFloat((e.target as HTMLInputElement).value);
                if (Number.isFinite(v)) setMaxDb(v);
              }}
              style={{ width: "64px" }}
            />
            <label>Min</label>
            <input
              type="number"
              step="1"
              value={minDb()}
              onInput={(e) => {
                const v = parseFloat((e.target as HTMLInputElement).value);
                if (Number.isFinite(v)) setMinDb(v);
              }}
              style={{ width: "64px" }}
            />
          </div>
          {/* 列数为自动计算，移除手动调节项 */}
          {/* 高级：分辨率与列数 */}
          <div
            style={{
              display: "flex",
              "align-items": "center",
              gap: "8px",
              "margin-bottom": "6px",
            }}
          >
            FFT
            <select
              value={fftSize()}
              onChange={async (e) => {
                const v = parseInt(e.currentTarget.value);
                setFftSize(v);
                try {
                  await framework.repository.setSpectrumFFTSize(v);
                } catch {}
              }}
            >
              <option value={1024}>1024</option>
              <option value={2048}>2048</option>
              <option value={4096}>4096</option>
              <option value={8192}>8192</option>
            </select>
            列
            <select
              value={columns()}
              onChange={async (e) => {
                const v = parseInt(e.currentTarget.value);
                setColumns(v);
                try {
                  await framework.repository.setSpectrumColumns(v);
                } catch {}
              }}
            >
              <option value={96}>96</option>
              <option value={128}>128</option>
              <option value={160}>160</option>
              <option value={192}>192</option>
              <option value={224}>224</option>
              <option value={256}>256</option>
            </select>
          </div>
          <div
            style={{
              display: "flex",
              "align-items": "center",
              gap: "8px",
              "margin-bottom": "6px",
            }}
          >
            模式
            <select
              value={mode()}
              onChange={(e) =>
                setMode(e.currentTarget.value as "peaks" | "bars")
              }
            >
              <option value="peaks">峰值弧线</option>
              <option value="bars">柱状</option>
            </select>
          </div>
          <div
            style={{
              display: "flex",
              "align-items": "center",
              gap: "8px",
              "margin-bottom": "6px",
            }}
          >
            灵敏度
            <input
              type="range"
              min="0.5"
              max="4.0"
              step="0.05"
              value={sensitivity()}
              onInput={(e) =>
                setSensitivity(parseFloat((e.target as HTMLInputElement).value))
              }
            />
          </div>
          <div
            style={{
              display: "flex",
              "align-items": "center",
              gap: "8px",
              "margin-bottom": "6px",
            }}
          >
            平滑
            <input
              type="range"
              min="0.05"
              max="0.9"
              step="0.05"
              value={smooth()}
              onInput={(e) =>
                setSmooth(parseFloat((e.target as HTMLInputElement).value))
              }
            />
          </div>
          <div
            style={{
              display: "flex",
              "align-items": "center",
              gap: "8px",
              "margin-bottom": "10px",
            }}
          >
            衰减
            <input
              type="range"
              min="0.2"
              max="0.99"
              step="0.01"
              value={decay()}
              onInput={(e) =>
                setDecay(parseFloat((e.target as HTMLInputElement).value))
              }
            />
          </div>
          <div
            style={{
              display: "flex",
              gap: "8px",
              "justify-content": "flex-end",
            }}
          >
            <button
              class="secondary"
              onClick={() => {
                setSensitivity(1.0);
                setSmooth(0.35);
                setDecay(0.8);
                setFftSize(2048);
                setColumns(96);
                try {
                  framework.repository.setSpectrumFFTSize(2048);
                } catch {}
                try {
                  framework.repository.setSpectrumColumns(96);
                } catch {}
              }}
            >
              重置
            </button>
            <button onClick={() => setShowMenu(false)}>关闭</button>
          </div>
        </div>
      )}
    </div>
  );
}
