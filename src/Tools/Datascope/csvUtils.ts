import type { CSVRecord, AxisType } from "./types";
import { ROW_INDEX_KEY, ChartComputationResult, DEFAULT_MAX_POINTS,MAX_POINTS,MIN_POINTS } from "./Datascope";

export interface ChartSeries {
  name: string;
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
  const numeric = Number(text);
  return Number.isFinite(numeric) ? numeric : null;
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

    for (let i = 0; i < sampleSize; i += 1) {
      const value = dataRows[i]?.[name];
      if (value == null) continue;
      const trimmed = toText(value).trim();
      if (!trimmed) continue;
      nonEmpty += 1;

      const numeric = Number(trimmed);
      if (Number.isFinite(numeric)) {
        numericCount += 1;
        continue;
      }

      if (!Number.isNaN(Date.parse(trimmed))) {
        temporalCount += 1;
      }
    }

    const numericRatio = nonEmpty === 0 ? 0 : numericCount / nonEmpty;
    const temporalRatio = nonEmpty === 0 ? 0 : temporalCount / nonEmpty;

    return {
      name,
      isNumeric: numericRatio >= 0.7,
      isTemporal: numericRatio < 0.7 && temporalRatio >= 0.6,
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

  const timestamp = Date.parse(raw);
  if (Number.isNaN(timestamp)) {
    return { valid: false, value: 0, numeric: null };
  }
  return { valid: true, value: timestamp, numeric: timestamp };
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
function evenlySampleIndices(length: number, threshold: number): number[] {
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
function largestTriangleThreeBucketsIndices(
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
  autoDownsample: boolean;
  maxPoints: number;
}): ChartComputationResult {
  const { rows, xColumn, yColumns, axisType, autoDownsample, maxPoints } =
    params;
  const baseColumn = yColumns[0];
  const processed: Array<{
    axisValue: number | string;
    axisNumeric: number | null;
    values: Record<string, number | null>;
  }> = [];

  let droppedRows = 0;

  rows.forEach((row, index) => {
    const baseValue = parseNumeric(row[baseColumn]);
    if (baseValue === null) {
      droppedRows += 1;
      return;
    }

    let axis: AxisConversionResult;
    if (xColumn === ROW_INDEX_KEY) {
      // 如果选择了自动序列，直接使用 index + 1
      const seqVal = index + 1;
      axis = { valid: true, value: seqVal, numeric: seqVal };
    } else {
      // 否则使用原来的逻辑从 CSV 列中读取
      axis = convertAxisValue(row[xColumn], axisType, index);
    }

    if (!axis.valid) {
      droppedRows += 1;
      return;
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

  let indices = processed.map((_, idx) => idx);
  let downsampled = false;
  const threshold = Math.min(maxPoints, processed.length);

  if (autoDownsample && processed.length > threshold && threshold > 2) {
    if (axisType === "category") {
      indices = evenlySampleIndices(processed.length, threshold);
    } else {
      const baseSeries = processed.map((item) => ({
        x: item.axisNumeric ?? 0,
        y: item.values[baseColumn] ?? 0,
      }));
      indices = largestTriangleThreeBucketsIndices(baseSeries, threshold);
    }
    downsampled = indices.length < processed.length;
  }

  const series: ChartSeries[] = yColumns.map((col) => ({
    name: col,
    points: indices.map((idx) => [
      processed[idx].axisValue,
      processed[idx].values[col],
    ]),
  }));

  return {
    series,
    axisType,
    rawCount: processed.length,
    sampledCount: indices.length,
    downsampled,
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
  if (info.isNumeric) return "value";
  if (info.isTemporal) return "time";
  return "category";
}
