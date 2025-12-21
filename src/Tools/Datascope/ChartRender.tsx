import { Component, createEffect, onCleanup, onMount } from "solid-js";
import * as echarts from "echarts";
import styles from "./Datascope.module.css";

type AxisType = "value" | "time" | "category";

interface ChartSeries {
  name: string;
  points: Array<[number | string, number | null]>;
}

interface ChartRenderProps {
  axisType: AxisType;
  series: ChartSeries[];
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

  const getOption = () => {
    // ✅ 必须在这里计算，才能在每次重绘时获取最新的 props
    // 同时加上 enableXRange 的判断
    const rangeL =
      props.enableXRange && props.xRange ? props.xRange[0] : undefined;
    const rangeR =
      props.enableXRange && props.xRange ? props.xRange[1] : undefined;

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
          color: "var(--vscode-descriptionForeground)",
        },
      },
      grid: {
        left: 48,
        right: 24,
        top: 48,
        bottom: props.axisType === "category" ? 72 : 56,
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
          formatter: (value: unknown) => formatValue(value, props.isIndexAxis),
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
      series: props.series.map((series) => ({
        name: series.name,
        type: "line",
        showSymbol: false,
        smooth: props.isSmooth,
        data: series.points,
        connectNulls: false,
        sampling: props.downsampled ? undefined : "lttb",
        emphasis: { focus: "series" },
      })),
    };
  };

  const updateChart = () => {
    if (!chartInstance) return;
    if (!props.series.length) {
      chartInstance.clear();
      return;
    }
    // setOption 第二个参数为 true (notMerge)，这对重置 dataZoom 状态很重要
    chartInstance.setOption(getOption(), true);
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
