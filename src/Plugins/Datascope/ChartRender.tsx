import { Component, createEffect, onCleanup, onMount } from "solid-js";
import * as echarts from "echarts";
import styles from "./Datascope.module.css";

type AxisType = "value" | "time" | "category";
export type ChartMode = "line" | "scatter";

interface ChartSeries {
  name: string;
  points: Array<[number | string, number | null]>;
}

interface ChartRenderProps {
  axisType: AxisType;
  series: ChartSeries[];
  chartMode: ChartMode;
  downsampled: boolean;
  isSmooth: boolean;
  xRange?: [number, number] | null;
  enableXRange?: boolean;
  isIndexAxis?: boolean;
}

const ChartRender: Component<ChartRenderProps> = (props) => {
  let chartRef: HTMLDivElement | undefined;
  type EChartsInstance = ReturnType<typeof echarts.init>;
  let chartInstance: EChartsInstance | undefined;
  let resizeObserver: ResizeObserver | undefined;

  const resolveThemeColor = (
    varNames: string[],
    fallback: string
  ): string => {
    const readFrom = (target: Element): string | null => {
      const style = getComputedStyle(target);
      for (const name of varNames) {
        const value = style.getPropertyValue(name).trim();
        if (value) return value;
      }
      return null;
    };

    if (typeof window === "undefined") return fallback;

    if (chartRef) {
      const local = readFrom(chartRef);
      if (local) return local;
    }

    const root = readFrom(document.documentElement);
    return root || fallback;
  };

  const getOption = () => {
    // ✅ 必须在这里计算，才能在每次重绘时获取最新的 props
    // 同时加上 enableXRange 的判断
    const isScatterMode = props.chartMode === "scatter";
    const rangeL =
      props.enableXRange && props.xRange ? props.xRange[0] : undefined;
    const rangeR =
      props.enableXRange && props.xRange ? props.xRange[1] : undefined;
    const legendTextColor = resolveThemeColor(
      ["--text-tertiary", "--descriptionForeground", "--vscode-descriptionForeground"],
      "#8a8a8a"
    );

    return {
      backgroundColor: "transparent",
      animation: false,
      textStyle: {
        color: "var(--vscode-foreground)",
      },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "cross" },
        valueFormatter: (value: unknown) => formatValue(value),
        confine: true,
      },
      legend: {
        top: 0,
        textStyle: {
          color: legendTextColor,
        },
      },
      grid: {
        left: 48,
        right: 24,
        top: 48,
        bottom: props.axisType === "category" ? 72 : props.axisType === "time" ? 76 : 56,
      },
      // DataZoom
      dataZoom: [
        {
          type: "inside",
          throttle: 80,
          filterMode: "weakFilter",
          // 这里的 startValue/endValue 会强制控制缩放位置
          startValue: rangeL,
          endValue: rangeR,
        },
        {
          type: "slider",
          height: 22,
          bottom: 8,
          filterMode: "weakFilter",
          labelFormatter: () => "",
          // Slider 也要加上，确保 UI 同步
          startValue: rangeL,
          endValue: rangeR,
        },
      ],
      xAxis: {
        type: props.axisType,
        boundaryGap: props.axisType === "category",

        axisLabel: {
          color: "var(--vscode-descriptionForeground)",
          formatter: (value: unknown) =>
            formatXAxisLabel(value, props.axisType, props.isIndexAxis),
          hideOverlap: true,
          interval: "auto",
          rotate: props.axisType === "time" ? 28 : 0,
        },
        axisLine: {
          lineStyle: { color: "var(--vscode-editorWidget-border)" },
        },
        splitLine: {
          show: props.axisType !== "category",
          lineStyle: {
            color: "var(--vscode-editorWidget-border)",
            opacity: 0.25,
          },
        },
      },
      yAxis: {
        type: "value",
        axisLabel: {
          color: "var(--vscode-descriptionForeground)",
          formatter: (value: number) => formatNumber(value),
        },
        splitLine: {
          lineStyle: {
            color: "var(--vscode-editorWidget-border)",
            opacity: 0.25,
          },
        },
      },
      series: props.series.map((series) => {
        // ECharts 内置 LTTB 采样不能正确处理 null 间隙，会跳过 null 点
        // 导致相隔很远的非 null 数据点被直接连线
        const hasNulls = series.points.some((p) => p[1] === null);

        if (isScatterMode) {
          const useLargeScatter = series.points.length >= 2000;
          return {
            name: series.name,
            type: "scatter",
            symbolSize: 6,
            large: useLargeScatter,
            largeThreshold: 2000,
            progressive: 0,
            data: series.points,
            emphasis: { focus: "series" },
          };
        }

        return {
          name: series.name,
          type: "line",
          showSymbol: false,
          smooth: props.isSmooth,
          data: series.points,
          connectNulls: false,
          sampling:
            props.downsampled || hasNulls ? undefined : "lttb",
          emphasis: { focus: "series" },
        };
      }),
    };
  };

  const updateChart = () => {
    if (!chartInstance) return;
    if (!props.series.length) {
      chartInstance.clear();
      return;
    }
    chartInstance.setOption(getOption(), {
      notMerge: false,
      lazyUpdate: true,
      replaceMerge: ["series", "xAxis", "yAxis"],
    });
  };

  onMount(() => {
    if (!chartRef) return;
    chartInstance = echarts.init(chartRef, undefined, { renderer: "canvas" });
    resizeObserver = new ResizeObserver(() => chartInstance?.resize());
    resizeObserver.observe(chartRef);
    updateChart();
  });

  createEffect(() => {
    // 监听所有依赖
    void props.axisType;
    void props.series;
    void props.chartMode;
    void props.downsampled;
    void props.isSmooth;
    void props.xRange;
    void props.enableXRange;
    updateChart();
  });

  onCleanup(() => {
    resizeObserver?.disconnect();
    if (chartInstance) {
      chartInstance.dispose();
      chartInstance = undefined;
    }
  });

  return <div class={styles.chartContainer} ref={chartRef} />;
};

function formatValue(value: unknown, isIndexAxis: boolean = false): string {
  if (value == null) return "";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "";
    // 如果这是 ROW_INDEX_KEY 轴，则直接显示整数（防止 tooltip/xAxis 出现小数）
    if (isIndexAxis) {
      return Math.round(value).toString();
    }
    if (Math.abs(value) >= 1000) {
      return value.toLocaleString();
    }
    // 使用科学计数法的阈值：仅当绝对值非常小 (< 0.001) 时使用科学计数法
    if (Math.abs(value) !== 0 && Math.abs(value) < 0.001) {
      return value.toExponential(2);
    }
    return value.toString();
  }
  return String(value);
}

function formatXAxisLabel(
  value: unknown,
  axisType: AxisType,
  isIndexAxis: boolean = false
): string {
  if (axisType === "time") {
    return formatTimestamp(value);
  }
  return formatValue(value, isIndexAxis);
}

function formatTimestamp(value: unknown): string {
  const timestampMs = parseDisplayTimestampToMs(value);
  if (timestampMs === null) return "";

  const dt = new Date(timestampMs);
  if (Number.isNaN(dt.getTime())) return "";

  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  const hh = String(dt.getHours()).padStart(2, "0");
  const mi = String(dt.getMinutes()).padStart(2, "0");
  const ss = String(dt.getSeconds()).padStart(2, "0");

  // 双行显示：减少横向占用，避免长时间戳挤在一起
  return `${yyyy}-${mm}-${dd}\n${hh}:${mi}:${ss}`;
}

function parseDisplayTimestampToMs(value: unknown): number | null {
  const text = typeof value === "string" ? value.trim() : String(value ?? "").trim();
  if (!text) return null;

  if (/^[+-]?\d+$/.test(text)) {
    const numeric = Number(text);
    if (!Number.isFinite(numeric)) return null;
    const abs = Math.abs(numeric);

    const candidates: number[] = [];
    if (abs >= 1e17) candidates.push(numeric / 1_000_000); // ns
    if (abs >= 1e14) candidates.push(numeric / 1_000); // us
    if (abs >= 1e11) candidates.push(numeric); // ms
    if (abs >= 1e8) candidates.push(numeric * 1_000); // s

    for (const candidate of candidates) {
      if (
        Number.isFinite(candidate) &&
        candidate >= Date.UTC(1970, 0, 1) &&
        candidate <= Date.UTC(2500, 0, 1)
      ) {
        return candidate;
      }
    }
    return null;
  }

  const parsed = Date.parse(text);
  if (Number.isNaN(parsed)) return null;
  return parsed;
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "";
  if (Math.abs(value) >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  }
  if (Math.abs(value) >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  // 仅在数值非常接近于 0 时使用科学计数法以避免过多小数位
  if (Math.abs(value) !== 0 && Math.abs(value) < 0.001) {
    return value.toExponential(2);
  }
  return value.toString();
}

export default ChartRender;
