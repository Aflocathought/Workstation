import type { CSVRecord, AxisType } from "./types";
import { ROW_INDEX_KEY, ChartComputationResult, DEFAULT_MAX_POINTS,MAX_POINTS,MIN_POINTS } from "./Datascope";

export interface ChartSeries {
  name: string;
  mode?: "line" | "scatter";
  points: Array<[number | string, number | null]>;
}
export interface ColumnMeta {
  name: string;
  isNumeric: boolean;
  isTemporal: boolean;
  sampleCount: number;
}

interface ParsedCSV {
  headers: string[];
  rows: CSVRecord[];
  skippedRows: number;
}

interface AxisConversionResult {
  valid: boolean;
  value: number | string;
  numeric: number | null;
}

const MIN_REASONABLE_TIMESTAMP_MS = Date.UTC(1970, 0, 1);
const MAX_REASONABLE_TIMESTAMP_MS = Date.UTC(2500, 0, 1);
const TEMPORAL_COLUMN_NAME_PATTERN =
  /(^|[_\-\s])(time|date|timestamp|datetime|created|updated|occurred|event|ts)([_\-\s]|$)/i;

function toText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  // list/struct 等复杂类型：用于显示/检测时走 JSON 字符串
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value ? 1 : 0;
  const text = typeof value === "string" ? value.trim() : toText(value).trim();
  if (!text) return null;
  if (isMissingNumericToken(text)) return null;
  const numeric = Number(text);
  return Number.isFinite(numeric) ? numeric : null;
}

function isMissingNumericToken(token: string): boolean {
  const t = token.trim().toLowerCase();
  return (
    t === "nan" ||
    t === "na" ||
    t === "n/a" ||
    t === "null" ||
    t === "none" ||
    t === "undefined" ||
    t === "inf" ||
    t === "+inf" ||
    t === "-inf" ||
    t === "infinity" ||
    t === "+infinity" ||
    t === "-infinity"
  );
}

function isReasonableTimestampMs(value: number): boolean {
  return (
    Number.isFinite(value) &&
    value >= MIN_REASONABLE_TIMESTAMP_MS &&
    value <= MAX_REASONABLE_TIMESTAMP_MS
  );
}

function normalizeIntegerTimestampToMs(text: string): number | null {
  const raw = text.trim();
  if (!/^[+-]?\d+$/.test(raw)) return null;

  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) return null;

  const abs = Math.abs(numeric);
  const candidates: number[] = [];

  // 19+ 位一般是纳秒时间戳
  if (abs >= 1e17) candidates.push(numeric / 1_000_000);
  // 16-18 位一般是微秒时间戳
  if (abs >= 1e14) candidates.push(numeric / 1_000);
  // 11-13 位通常可视为毫秒时间戳
  if (abs >= 1e11) candidates.push(numeric);
  // 10 位通常是秒时间戳
  if (abs >= 1e8) candidates.push(numeric * 1_000);

  for (const candidate of candidates) {
    if (isReasonableTimestampMs(candidate)) {
      return candidate;
    }
  }

  return null;
}

function parseTimestampToMs(value: unknown): number | null {
  const raw = toText(value).trim();
  if (!raw) return null;

  const integerMs = normalizeIntegerTimestampToMs(raw);
  if (integerMs !== null) return integerMs;

  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) return null;
  return isReasonableTimestampMs(parsed) ? parsed : null;
}

function hasTemporalNameHint(columnName: string): boolean {
  return TEMPORAL_COLUMN_NAME_PATTERN.test(columnName);
}

/**
 * 基于文本内容检测分隔符（max 2000 字符样本）
 * @param text 
 * @returns 
 */
export function detectDelimiter(text: string): string {
  const sample = text.slice(0, 2000);
  const firstLine = sample.split(/\n/)[0] ?? sample;
  const candidates: Array<[string, number]> = [",", "\t", ";", "|"].map(
    (mark) => [mark, firstLine.split(mark).length - 1]
  );
  const best = candidates.reduce(
    (acc, cur) => (cur[1] > acc[1] ? cur : acc),
    [",", -1]
  );
  return best[0] || ",";
}

/**
 * 粘贴文本解析为 CSV 记录
 * @param text 
 * @param delimiter 
 * @returns 
 */
export function parseCSV(text: string, delimiter: string): ParsedCSV {
  if (!text.trim()) {
    throw new Error("文件内容为空");
  }

  let normalized = text;
  if (normalized.charCodeAt(0) === 0xfeff) {
    normalized = normalized.slice(1);
  }
  normalized = normalized.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i];

    if (char === '"') {
      const nextChar = normalized[i + 1];
      if (inQuotes && nextChar === '"') {
        field += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }

    if (char === "\n" && !inQuotes) {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  row.push(field);
  rows.push(row);

  const nonEmptyRows = rows.filter((cells) =>
    cells.some((cell) => cell.trim().length > 0)
  );

  if (!nonEmptyRows.length) {
    throw new Error("未检测到有效数据");
  }

  const headersRaw = nonEmptyRows[0].map((cell) => cell.trim());
  const headers = dedupeHeaders(headersRaw);

  const dataRows = nonEmptyRows.slice(1);
  const records: CSVRecord[] = dataRows.map((cells) => {
    const record: CSVRecord = {};
    for (let i = 0; i < headers.length; i += 1) {
      record[headers[i]] = cells[i] ?? "";
    }
    return record;
  });

  return {
    headers,
    rows: records,
    skippedRows: rows.length - nonEmptyRows.length,
  };
}

/**
 * 去重列名，避免重复
 * @param headers 
 * @returns 
 */
function dedupeHeaders(headers: string[]): string[] {
  const counts = new Map<string, number>();
  return headers.map((header, index) => {
    const base = header || `列_${index + 1}`;
    const count = counts.get(base) ?? 0;
    counts.set(base, count + 1);
    return count === 0 ? base : `${base}_${count}`;
  });
}

/**
 * 构建列元信息
 * @param dataRows 
 * @param headerList 
 * @returns 
 */
export function buildColumnMeta(
  dataRows: CSVRecord[],
  headerList: string[]
): ColumnMeta[] {
  const sampleSize = Math.min(500, dataRows.length);
  return headerList.map((name) => {
    let numericCount = 0;
    let temporalCount = 0;
    let nonEmpty = 0;
    const temporalNameHint = hasTemporalNameHint(name);

    for (let sampleIndex = 0; sampleIndex < sampleSize; sampleIndex += 1) {
      const i =
        sampleSize <= 1
          ? 0
          : Math.floor((sampleIndex * (dataRows.length - 1)) / (sampleSize - 1));
      const value = dataRows[i]?.[name];
      if (value == null) continue;
      const trimmed = toText(value).trim();
      if (!trimmed) continue;
      if (isMissingNumericToken(trimmed)) continue;
      nonEmpty += 1;

      const numeric = Number(trimmed);
      if (Number.isFinite(numeric)) {
        numericCount += 1;
      }

      if (parseTimestampToMs(trimmed) !== null) {
        temporalCount += 1;
      }
    }

    const numericRatio = nonEmpty === 0 ? 0 : numericCount / nonEmpty;
    const temporalRatio = nonEmpty === 0 ? 0 : temporalCount / nonEmpty;

    const isTemporalByText = numericRatio < 0.7 && temporalRatio >= 0.6;
    const isTemporalByNumericTimestamp =
      temporalNameHint && numericRatio >= 0.7 && temporalRatio >= 0.7;
    const isTemporalByStrongSignal =
      !temporalNameHint && numericRatio >= 0.9 && temporalRatio >= 0.95;

    return {
      name,
      isNumeric: numericRatio >= 0.7,
      isTemporal:
        isTemporalByText ||
        isTemporalByNumericTimestamp ||
        isTemporalByStrongSignal,
      sampleCount: nonEmpty,
    };
  });
}

/**
 * 转换轴值，根据轴类型处理不同的数据格式
 * @param value 
 * @param axisType 
 * @param index 
 * @returns 
 */
function convertAxisValue(
  value: unknown,
  axisType: AxisType,
  index: number
): AxisConversionResult {
  const raw = toText(value).trim();

  if (axisType === "category") {
    const label = raw || `Row ${index + 1}`;
    return { valid: true, value: label, numeric: index };
  }

  if (axisType === "value") {
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) {
      return { valid: false, value: 0, numeric: null };
    }
    return { valid: true, value: numeric, numeric };
  }

  const timestampMs = parseTimestampToMs(raw);
  if (timestampMs === null) {
    return { valid: false, value: 0, numeric: null };
  }
  return { valid: true, value: timestampMs, numeric: timestampMs };
}

/**
 * 解析数值，如果无法解析则返回 null
 * @param value 
 * @returns 
 */
function parseNumeric(value?: unknown): number | null {
  return toNumber(value);
}

/**
 * 计算均匀采样的索引
 * @param length 
 * @param threshold 
 * @returns 
 */
export function evenlySampleIndices(length: number, threshold: number): number[] {
  if (threshold >= length) {
    return Array.from({ length }, (_, idx) => idx);
  }

  if (threshold <= 1) {
    return [0];
  }

  const step = (length - 1) / (threshold - 1);
  const indices: number[] = [];

  for (let i = 0; i < threshold; i += 1) {
    const idx = Math.round(i * step);
    indices.push(Math.min(idx, length - 1));
  }

  indices[0] = 0;
  indices[indices.length - 1] = length - 1;

  const ordered = Array.from(new Set(indices)).sort((a, b) => a - b);
  if (ordered[0] !== 0) ordered.unshift(0);
  if (ordered[ordered.length - 1] !== length - 1) ordered.push(length - 1);
  return ordered;
}

/**
 * LTTB 下采样算法，返回采样后的索引列表
 * @param data 
 * @param threshold 
 * @returns 
 */
export function largestTriangleThreeBucketsIndices(
  data: Array<{ x: number; y: number }>,
  threshold: number
): number[] {
  const length = data.length;
  if (threshold >= length || threshold <= 2) {
    return Array.from({ length }, (_, idx) => idx);
  }

  const sampled: number[] = [0];
  const every = (length - 2) / (threshold - 2);
  let a = 0;

  for (let i = 0; i < threshold - 2; i += 1) {
    const avgRangeStart = Math.floor((i + 1) * every) + 1;
    let avgRangeEnd = Math.floor((i + 2) * every) + 1;
    if (avgRangeEnd > length) avgRangeEnd = length;

    let avgX = 0;
    let avgY = 0;
    const avgRangeLength = avgRangeEnd - avgRangeStart;

    if (avgRangeLength > 0) {
      for (let j = avgRangeStart; j < avgRangeEnd; j += 1) {
        avgX += data[j].x;
        avgY += data[j].y;
      }
      avgX /= avgRangeLength;
      avgY /= avgRangeLength;
    } else {
      const point = data[Math.min(avgRangeStart, length - 1)];
      avgX = point.x;
      avgY = point.y;
    }

    let rangeStart = Math.floor(i * every) + 1;
    let rangeEnd = Math.floor((i + 1) * every) + 1;
    rangeStart = Math.max(rangeStart, 1);
    rangeEnd = Math.min(rangeEnd, length - 1);
    if (rangeStart >= rangeEnd) {
      rangeStart = Math.max(rangeEnd - 1, 1);
    }

    let maxArea = -1;
    let maxAreaIndex = rangeStart;

    for (let j = rangeStart; j < rangeEnd; j += 1) {
      const area = Math.abs(
        (data[a].x - avgX) * (data[j].y - data[a].y) -
          (data[a].x - data[j].x) * (avgY - data[a].y)
      );

      if (area > maxArea) {
        maxArea = area;
        maxAreaIndex = j;
      }
    }

    sampled.push(maxAreaIndex);
    a = maxAreaIndex;
  }

  sampled.push(length - 1);

  return Array.from(new Set(sampled)).sort((left, right) => left - right);
}

interface ProcessedChartRow {
  axisValue: number | string;
  axisNumeric: number | null;
  values: Record<string, number | null>;
}

function resolveAxisNumber(item: ProcessedChartRow, index: number): number {
  if (typeof item.axisNumeric === "number" && Number.isFinite(item.axisNumeric)) {
    return item.axisNumeric;
  }
  return index;
}

function sampleValidSegment(
  segment: Array<{ row: ProcessedChartRow; x: number; y: number }>,
  threshold: number,
  axisType: AxisType
): Array<[number | string, number | null]> {
  if (segment.length <= threshold) {
    return segment.map((item) => [item.row.axisValue, item.y]);
  }

  const indices =
    axisType === "category"
      ? evenlySampleIndices(segment.length, threshold)
      : largestTriangleThreeBucketsIndices(
          segment.map((item) => ({ x: item.x, y: item.y })),
          threshold
        );

  return indices.map((index) => [segment[index].row.axisValue, segment[index].y]);
}

function buildLineSeriesPoints(
  processed: ProcessedChartRow[],
  column: string,
  shouldDownsample: boolean,
  threshold: number,
  axisType: AxisType
): Array<[number | string, number | null]> {
  if (!shouldDownsample) {
    return processed.map((item) => [item.axisValue, item.values[column]]);
  }

  const validSegments: Array<
    Array<{ row: ProcessedChartRow; x: number; y: number }>
  > = [];
  const orderedRuns: Array<
    | { type: "valid"; segmentIndex: number }
    | { type: "null"; point: [number | string, number | null] }
  > = [];
  let currentSegment: Array<{ row: ProcessedChartRow; x: number; y: number }> = [];
  let inNullRun = false;

  const flushSegment = () => {
    if (!currentSegment.length) return;
    const segmentIndex = validSegments.length;
    validSegments.push(currentSegment);
    orderedRuns.push({ type: "valid", segmentIndex });
    currentSegment = [];
  };

  processed.forEach((item, index) => {
    const value = item.values[column];
    if (typeof value === "number" && Number.isFinite(value)) {
      inNullRun = false;
      currentSegment.push({
        row: item,
        x: resolveAxisNumber(item, index),
        y: value,
      });
      return;
    }

    flushSegment();
    if (!inNullRun) {
      orderedRuns.push({ type: "null", point: [item.axisValue, null] });
      inNullRun = true;
    }
  });

  flushSegment();

  const totalValid = validSegments.reduce(
    (sum, segment) => sum + segment.length,
    0
  );
  if (totalValid === 0) {
    return orderedRuns
      .filter((run): run is { type: "null"; point: [number | string, number | null] } => run.type === "null")
      .map((run) => run.point);
  }

  const nullRunCount = orderedRuns.filter((run) => run.type === "null").length;
  const validBudget = Math.max(
    validSegments.length,
    threshold - nullRunCount
  );
  const sampledSegments = validSegments.map((segment) => {
    const proportional = Math.round((validBudget * segment.length) / totalValid);
    const segmentThreshold = Math.min(
      segment.length,
      Math.max(segment.length > 1 ? 2 : 1, proportional)
    );
    return sampleValidSegment(segment, segmentThreshold, axisType);
  });

  return orderedRuns.flatMap((run) =>
    run.type === "null" ? [run.point] : sampledSegments[run.segmentIndex]
  );
}

function buildScatterBucketSeries(
  processed: ProcessedChartRow[],
  column: string,
  threshold: number,
  axisType: AxisType
): Array<[number | string, number | null]> {
  if (processed.length <= threshold) {
    return processed
      .map((item) => [item.axisValue, item.values[column]] as [
        number | string,
        number | null,
      ])
      .filter((point) => point[1] !== null);
  }

  if (axisType === "category") {
    return evenlySampleIndices(processed.length, threshold)
      .map((index) => [
        processed[index].axisValue,
        processed[index].values[column],
      ] as [number | string, number | null])
      .filter((point) => point[1] !== null);
  }

  const bucketCount = Math.min(threshold, processed.length);
  const axisNumbers = new Array<number>(processed.length);
  let minX = Infinity;
  let maxX = -Infinity;

  for (let index = 0; index < processed.length; index += 1) {
    const x = resolveAxisNumber(processed[index], index);
    axisNumbers[index] = x;

    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
  }

  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || minX === maxX) {
    return evenlySampleIndices(processed.length, threshold)
      .map((index) => [
        processed[index].axisValue,
        processed[index].values[column],
      ] as [number | string, number | null])
      .filter((point) => point[1] !== null);
  }

  const bucketWidth = (maxX - minX) / bucketCount;

  if (!Number.isFinite(bucketWidth) || bucketWidth <= 0) {
    return evenlySampleIndices(processed.length, threshold)
      .map((index) => [
        processed[index].axisValue,
        processed[index].values[column],
      ] as [number | string, number | null])
      .filter((point) => point[1] !== null);
  }

  const buckets = new Map<
    number,
    { sumX: number; sumY: number; count: number }
  >();

  processed.forEach((item, index) => {
    const y = item.values[column];
    if (y === null) return;

    const x = axisNumbers[index];
    const bucketIndex =
      x === maxX
        ? bucketCount - 1
        : Math.min(
            bucketCount - 1,
            Math.max(0, Math.floor((x - minX) / bucketWidth))
          );

    const current = buckets.get(bucketIndex) ?? {
      sumX: 0,
      sumY: 0,
      count: 0,
    };

    current.sumX += x;
    current.sumY += y;
    current.count += 1;
    buckets.set(bucketIndex, current);
  });

  if (!buckets.size) {
    return [];
  }

  return Array.from(buckets.entries())
    .sort((left, right) => left[0] - right[0])
    .map(([, bucket]) => [bucket.sumX / bucket.count, bucket.sumY / bucket.count]);
}

/**
 * 构建图表数据，包括下采样处理
 * @param params 
 * @returns 
 */
export function buildChartData(params: {
  rows: CSVRecord[];
  xColumn: string;
  yColumns: string[];
  axisType: AxisType;
  chartMode?: "line" | "scatter";
  seriesModes?: Record<string, "line" | "scatter">;
  enableDownsampling?: boolean;
  maxPoints?: number;
}): ChartComputationResult {
  const {
    rows,
    xColumn,
    yColumns,
    axisType,
    chartMode = "line",
    seriesModes = {},
    enableDownsampling = false,
    maxPoints = DEFAULT_MAX_POINTS,
  } = params;
  const processed: ProcessedChartRow[] = [];

  let droppedRows = 0;

  rows.forEach((row, index) => {
    let axis: AxisConversionResult;
    if (xColumn === ROW_INDEX_KEY) {
      const seqVal = index + 1;
      axis = { valid: true, value: seqVal, numeric: seqVal };
    } else {
      axis = convertAxisValue(row[xColumn], axisType, index);
    }

    if (!axis.valid) {
      droppedRows += 1;
      return;
    }

    const valueMap: Record<string, number | null> = {};
    yColumns.forEach((col) => {
      valueMap[col] = parseNumeric(row[col]);
    });

    processed.push({
      axisValue: axis.value,
      axisNumeric: axis.numeric,
      values: valueMap,
    });
  });

  if (!processed.length) {
    return {
      series: [],
      axisType,
      rawCount: 0,
      sampledCount: 0,
      downsampled: false,
      droppedRows,
    };
  }

  const threshold = clampPoints(maxPoints);
  const shouldDownsample = enableDownsampling && processed.length > threshold;

  const series: ChartSeries[] = yColumns.map((col) => {
    const mode = seriesModes[col] ?? chartMode;
    const points =
      mode === "scatter"
        ? buildScatterBucketSeries(processed, col, threshold, axisType)
        : buildLineSeriesPoints(
            processed,
            col,
            shouldDownsample,
            threshold,
            axisType
          );

    return {
      name: col,
      mode,
      points,
    };
  });
  const sampledCount = series.reduce(
    (max, current) => Math.max(max, current.points.length),
    0
  );

  return {
    series,
    axisType,
    rawCount: processed.length,
    sampledCount,
    downsampled: shouldDownsample,
    droppedRows,
  };
}

export function clampPoints(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_MAX_POINTS;
  return Math.min(MAX_POINTS, Math.max(MIN_POINTS, Math.floor(value)));
}

export function axisTypeLabel(axisType: AxisType): string {
  switch (axisType) {
    case "value":
      return "数值";
    case "time":
      return "时间";
    default:
      return "分类";
  }
}

export function determineAxisType(
  meta: ColumnMeta[],
  columnName: string | undefined
): AxisType {
  if (!columnName) return "category";
  const info = meta.find((item) => item.name === columnName);
  if (!info) return "category";
  if (info.isTemporal) return "time";
  if (info.isNumeric) return "value";
  return "category";
}
