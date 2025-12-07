// TODO: 可能会需要把逻辑层和渲染成分离一下
import {
  batch,
  Component,
  createEffect,
  createMemo,
  createSignal,
  For,
  Show,
} from "solid-js";
import ChartRender from "./ChartRender";
import styles from "./CSVViewer.module.css";
import {
  detectDelimiter,
  parseCSV,
  determineAxisType,
  buildColumnMeta,
  buildChartData,
  ChartSeries,
  clampPoints,
  axisTypeLabel,
} from "./csvUtils";
import type { CSVRecord, AxisType } from "./types";

export interface ChartComputationResult {
  series: ChartSeries[];
  axisType: AxisType;
  rawCount: number;
  sampledCount: number;
  downsampled: boolean;
  droppedRows: number;
  xRange?: [number, number] | null;
}

export const DEFAULT_MAX_POINTS = 4000;
export const MIN_POINTS = 200;
export const MAX_POINTS = 20000;
export const ROW_INDEX_KEY = "__auto_sequence__";

const CSVV: Component = () => {
  const [headers, setHeaders] = createSignal<string[]>([]);
  const [rows, setRows] = createSignal<CSVRecord[]>([]);
  const [xColumn, setXColumn] = createSignal<string>("");
  const [valueColumns, setValueColumns] = createSignal<string[]>([]);
  const [fileName, setFileName] = createSignal<string>("");
  const [status, setStatus] = createSignal<string>("");
  const [errorMessage, setErrorMessage] = createSignal<string>("");
  const [isLoading, setIsLoading] = createSignal<boolean>(false);
  const [maxPoints, setMaxPoints] = createSignal<number>(DEFAULT_MAX_POINTS);
  const [autoDownsample, setAutoDownsample] = createSignal<boolean>(false);
  const [delimiter, setDelimiter] = createSignal<string>(",");
  const [rawContent, setRawContent] = createSignal<string>("");
  const [skippedRows, setSkippedRows] = createSignal<number>(0);
  const [dragOver, setDragOver] = createSignal<boolean>(false);
  const csvExists = createMemo(() => rows().length > 0);
  const [isSmooth, setIsSmooth] = createSignal<boolean>(false); // 默认 false
  const [enableXRange, setEnableXRange] = createSignal<boolean>(true);
  const [xRange, setXRange] = createSignal<[number, number] | null>([0, 50000]); //默认50000，否则会很卡

  let fileInputRef: HTMLInputElement | undefined;
  let dragCounter = 0;

  const handleGlobalDragEnter = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter++;
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    setDragOver(true);
  };

  const handleGlobalDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter--;
    if (dragCounter === 0) {
      setDragOver(false);
    }
  };

  const handleGlobalDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    dragCounter = 0;
    handleDrop(e);
  };

  const columnMeta = createMemo(() => buildColumnMeta(rows(), headers()));

  const numericColumns = createMemo(() =>
    columnMeta()
      .filter((meta) => meta.isNumeric)
      .map((meta) => meta.name)
  );

  const axisType = createMemo<AxisType>(() => {
    if (xColumn() === ROW_INDEX_KEY) return "value"; // 强制为数值轴
    return determineAxisType(columnMeta(), xColumn());
  });

  createEffect(() => {
    if (valueColumns().length > 0) return;
    const numeric = numericColumns();
    if (numeric.length) {
      setValueColumns([numeric[0]]);
    }
  });

  createEffect(() => {
    const availableHeaders = headers();
    const currentX = xColumn();

    if (!availableHeaders.length) {
      setXColumn("");
    } else if (
      currentX !== ROW_INDEX_KEY &&
      !availableHeaders.includes(currentX)
    ) {
      // 修改判断条件：如果是 ROW_INDEX_KEY 则不重置，否则才重置为第一列
      setXColumn(availableHeaders[0]);
    }
  });

  const chartData = createMemo<ChartComputationResult | null>(() => {
    const dataRows = rows();
    const xCol = xColumn();
    const selected = valueColumns();
    if (!dataRows.length || !xCol || selected.length === 0) {
      return null;
    }

    return buildChartData({
      rows: dataRows,
      xColumn: xCol,
      yColumns: selected,
      axisType: axisType(),
      autoDownsample: autoDownsample(),
      maxPoints: clampPoints(maxPoints()),
    });
  });

  const handleFileSelection = (file: File) => {
    setIsLoading(true);
    setErrorMessage("");
    setStatus("读取文件中...");

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const content =
          typeof reader.result === "string"
            ? reader.result
            : new TextDecoder().decode(reader.result as ArrayBuffer);
        const detected = detectDelimiter(content);
        const parsed = parseCSV(content, detected);

        batch(() => {
          setRawContent(content);
          setDelimiter(detected);
          setFileName(file.name);
          setSkippedRows(parsed.skippedRows);
          setValueColumns([]);
          setMaxPoints(DEFAULT_MAX_POINTS);
          // 保持用户设置, 不在文件加载后强制打开自动下采样
          setHeaders(parsed.headers);
          setRows(parsed.rows);
          setXColumn(ROW_INDEX_KEY); // 默认使用行号作为 X 轴
          setStatus(
            `已解析 ${parsed.rows.length.toLocaleString()} 行, ${
              parsed.headers.length
            } 列`
          );
          setErrorMessage("");
        });
      } catch (err) {
        setRows([]);
        setHeaders([]);
        setFileName("");
        setErrorMessage((err as Error).message || "解析 CSV 失败");
        setStatus("");
      } finally {
        setIsLoading(false);
      }
    };

    reader.onerror = () => {
      setRows([]);
      setHeaders([]);
      setFileName("");
      setErrorMessage("读取文件失败");
      setStatus("");
      setIsLoading(false);
    };

    reader.readAsText(file);
  };

  const handleInputChange = (event: Event) => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      handleFileSelection(file);
    }
    input.value = "";
  };

  const handleDrop = (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setDragOver(false);

    const transfer = event.dataTransfer;
    if (!transfer) {
      setErrorMessage("未能读取拖拽数据");
      return;
    }

    if (transfer.dropEffect !== "copy") {
      transfer.dropEffect = "copy";
    }

    const primaryFile =
      transfer.files?.[0] ??
      Array.from(transfer.items || [])
        .filter((item) => item.kind === "file")
        .map((item) => item.getAsFile())
        .find((candidate): candidate is File => Boolean(candidate));

    if (primaryFile) {
      handleFileSelection(primaryFile);
      return;
    }

    setErrorMessage("拖拽内容不是有效的文件");
  };

  const handleDelimiterChange = (event: Event) => {
    const next = (event.currentTarget as HTMLSelectElement).value;
    if (!next || next === delimiter()) return;
    setDelimiter(next);

    const content = rawContent();
    if (!content) return;

    try {
      const parsed = parseCSV(content, next);
      batch(() => {
        setSkippedRows(parsed.skippedRows);
        setValueColumns([]);
        setHeaders(parsed.headers);
        setRows(parsed.rows);
        setXColumn(ROW_INDEX_KEY); // 切换分隔符后重置 X 轴为行号
        setStatus(
          `使用新的分隔符解析: ${parsed.rows.length.toLocaleString()} 行, ${
            parsed.headers.length
          } 列`
        );
        setErrorMessage("");
      });
    } catch (err) {
      setErrorMessage(
        `使用分隔符 "${next}" 解析失败: ${(err as Error).message}`
      );
    }
  };

  const handleValueColumnToggle = (name: string) => {
    setValueColumns((prev) => {
      if (prev.includes(name)) {
        const updated = prev.filter((col) => col !== name);
        return updated.length ? updated : prev;
      }
      return [...prev, name];
    });
  };

  const handleRangeInput = (val: string) => {
    const input = val.trim();

    // 空值恢复默认
    if (input === "") {
      setXRange([0, 50000]);
      return;
    }

    const parts = input.split(/[,，]/); // 支持中英文逗号
    if (parts.length !== 2) return; // 格式不对不更新

    const min = parseFloat(parts[0]);
    const max = parseFloat(parts[1]);

    if (!isNaN(min) && !isNaN(max) && min < max) {
      setXRange([min, max]);
    }
  };

  const renderStats = () => {
    const data = chartData();
    if (!data) return null;
    if (data.rawCount === 0) {
      return (
        <div class={styles.message}>加载成功, 请选择至少一个数值列以绘图。</div>
      );
    }
    return (
      <div class={styles.stats}>
        <span>
          <strong>原始点:</strong> {data.rawCount.toLocaleString()}
        </span>
        <span>
          <strong>采样后:</strong> {data.sampledCount.toLocaleString()}
        </span>
        <span>
          <strong>下采样:</strong> {data.downsampled ? "已启用" : "未启用"}
        </span>
        <span>
          <strong>X 轴类型:</strong> {axisTypeLabel(data.axisType)}
        </span>
        {data.droppedRows > 0 && (
          <span>
            <strong>忽略行:</strong> {data.droppedRows.toLocaleString()}
          </span>
        )}
      </div>
    );
  };

  const renderChart = () => {
    const data = chartData();
    if (!data) {
      return <div class={styles.message}>等待数据绘制...</div>;
    }

    if (data.rawCount === 0) {
      return null;
    }

    const hasPoints = data.series.some((series) => series.points.length > 0);
    if (!hasPoints) {
      return <div class={styles.message}>等待数据绘制...</div>;
    }

    return (
      <div class={styles.chartWrapper}>
        <ChartRender
          axisType={data.axisType}
          series={data.series}
          downsampled={data.downsampled}
          isSmooth={isSmooth()}
          xRange={xRange()}
          enableXRange={enableXRange()}
          isIndexAxis={xColumn() === ROW_INDEX_KEY}
        />
      </div>
    );
  };

  return (
    <div
      class={styles.container}
      onDragEnter={handleGlobalDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={handleGlobalDragLeave}
      onDrop={handleGlobalDrop}
    >
      <Show
        when={csvExists()}
        fallback={
          <div class={styles.uploadArea}>
            <UploadSection
              isLoading={isLoading}
              setRef={(el) => (fileInputRef = el)}
              handleInputChange={handleInputChange}
              errorMessage={errorMessage}
              isDragOver={dragOver()}
              onClickUpload={() => fileInputRef?.click()}
            />
            <Show when={fileName()}>
              <div class={styles.fileInfo}>
                当前文件: <strong>{fileName()}</strong>
                {rows().length > 0 &&
                  ` · ${rows().length.toLocaleString()} 行 · ${
                    headers().length
                  } 列 · 分隔符 "${delimiter()}"`}
                {skippedRows() > 0 && ` · 忽略空行 ${skippedRows()}`}
              </div>
            </Show>
          </div>
        }
      >
        <div class={styles.dashboardContent}>
          <section class={styles.controls}>
            <div class={styles.section}>
              <h3 class={styles.sectionTitle}>列选择</h3>

              <label class={styles.inlineControls}>
                <div class={styles.xHeader}>
                  <span>X 轴</span>
                  <span>(类型: {axisTypeLabel(axisType())})</span>
                </div>
                <select
                  value={xColumn()}
                  onChange={(event) =>
                    setXColumn((event.currentTarget as HTMLSelectElement).value)
                  }
                >
                  <option value={ROW_INDEX_KEY}>1...N</option>
                  <For each={headers()}>
                    {(header) => <option value={header}>{header}</option>}
                  </For>
                </select>
              </label>

              <div>
                <div>数值列</div>
                <Show
                  when={numericColumns().length > 0}
                  fallback={<div>未检测到数值列</div>}
                >
                  <div class={styles.checkboxGrid}>
                    <For each={numericColumns()}>
                      {(col) => (
                        <label class={styles.checkboxItem}>
                          <input
                            type="checkbox"
                            checked={valueColumns().includes(col)}
                            onChange={() => handleValueColumnToggle(col)}
                          />
                          {col}
                        </label>
                      )}
                    </For>
                  </div>
                </Show>
              </div>

              <div>
                <div class={styles.rangeHeader}>
                  <input
                    type="checkbox"
                    checked={enableXRange()}
                    onChange={() => setEnableXRange(!enableXRange())}
                  />
                  <div>预选择X轴的范围</div>
                </div>
                <div class={styles.rangeModify}>
                  <div class={styles.rangeInputFont}>[</div>
                  <input
                    class={styles.rangeInput}
                    disabled={!enableXRange()}
                    type="text"
                    value={xRange()?.join(",") || ""}
                    placeholder="请输入 number,number 的格式（不填默认为0,50000）"
                    onChange={(e) => handleRangeInput(e.currentTarget.value)}
                  />
                  <div class={styles.rangeInputFont}>]</div>
                  <button
                    class={styles.button}
                    onClick={() => setXRange([0, 50000])}
                  >
                    重置
                  </button>
                </div>
              </div>
            </div>

            <div class={styles.section}>
              <h3 class={styles.sectionTitle}>解析设置</h3>

              <label class={styles.inlineControls}>
                <span>分隔符</span>
                <select value={delimiter()} onChange={handleDelimiterChange}>
                  <option value=",">逗号 (,)</option>
                  <option value=";">分号 (;)</option>
                  <option value="\t">制表符 (Tab)</option>
                  <option value="|">竖线 (|)</option>
                </select>
              </label>

              <label class={styles.checkboxItem}>
                <input
                  type="checkbox"
                  checked={autoDownsample()}
                  onChange={(event) =>
                    setAutoDownsample(event.currentTarget.checked)
                  }
                />
                自动下采样
              </label>

              <div class={styles.sliderInput}>
                <span>采样点上限</span>
                <input
                  type="range"
                  min={MIN_POINTS}
                  max={MAX_POINTS}
                  step={MIN_POINTS}
                  value={maxPoints()}
                  disabled={!autoDownsample()}
                  onInput={(event) =>
                    setMaxPoints(
                      clampPoints(
                        Number((event.currentTarget as HTMLInputElement).value)
                      )
                    )
                  }
                />
                <input
                  type="number"
                  min={MIN_POINTS}
                  max={MAX_POINTS}
                  value={maxPoints()}
                  disabled={!autoDownsample()}
                  onInput={(event) =>
                    setMaxPoints(
                      clampPoints(
                        Number((event.currentTarget as HTMLInputElement).value)
                      )
                    )
                  }
                />
              </div>
            </div>
          </section>

          <Show when={status()}>
            <div class={styles.message}>{status()}</div>
          </Show>

          <Show when={errorMessage()}>
            <div class={styles.error}>{errorMessage()}</div>
          </Show>

          {renderStats()}
          {renderChart()}

          <Show when={dragOver()}>
            <div class={styles.dragOverlay}>
              <div class={styles.overlayContent}>
                <UploadSection
                  isLoading={isLoading}
                  setRef={(el) => (fileInputRef = el)}
                  handleInputChange={handleInputChange}
                  errorMessage={null}
                  isOverlay={true}
                  onClickUpload={() => fileInputRef?.click()}
                />
              </div>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
};

const UploadSection: Component<{
  isLoading: () => boolean;
  setRef: (el: HTMLInputElement) => void;
  handleInputChange: (event: Event) => void;
  errorMessage: (() => string) | null;
  isOverlay?: boolean;
  isDragOver?: boolean;
  onClickUpload: () => void;
}> = (props) => (
  <section
    class={`${styles.dropZone} ${props.isOverlay ? styles.overlayMode : ""} ${
      props.isDragOver ? styles.dragOver : ""
    }`}
    onClick={props.onClickUpload}
  >
    <div class={styles.dropZoneContent}>
      <div class={styles.icon}>📂</div>
      <strong>{props.isLoading() ? "读取中..." : "释放鼠标以更新文件"}</strong>
      {!props.isOverlay && <span>或点击选择新文件</span>}

      <input
        ref={props.setRef}
        type="file"
        accept=".csv,text/csv"
        style={{ display: "none" }}
        onChange={props.handleInputChange}
      />
    </div>
    {props.errorMessage && (
      <div class={styles.error}>{props.errorMessage()}</div>
    )}
  </section>
);

export default CSVV;
