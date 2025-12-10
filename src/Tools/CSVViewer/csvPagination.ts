import type { CSVRecord } from "./types";

export const ROWS_PER_PAGE = 200000; // 每页 20w 行

export interface PageInfo {
  pageIndex: number;
  startRow: number;
  endRow: number;
  rowCount: number;
}

export interface PaginationState {
  totalRows: number;
  totalPages: number;
  currentPage: number;
  pages: PageInfo[];
}

/**
 * 计算分页信息
 */
export function calculatePagination(totalRows: number): PaginationState {
  const totalPages = Math.ceil(totalRows / ROWS_PER_PAGE);
  const pages: PageInfo[] = [];

  for (let i = 0; i < totalPages; i++) {
    const startRow = i * ROWS_PER_PAGE;
    const endRow = Math.min(startRow + ROWS_PER_PAGE, totalRows);
    pages.push({
      pageIndex: i,
      startRow,
      endRow,
      rowCount: endRow - startRow,
    });
  }

  return {
    totalRows,
    totalPages,
    currentPage: 0,
    pages,
  };
}

/**
 * 流式解析 CSV，只返回指定范围的行
 */
export interface StreamParseOptions {
  content: string;
  delimiter: string;
  startRow: number; // 从第几行开始（不包括header）
  endRow: number; // 到第几行结束（不包括）
  onProgress?: (current: number, total: number) => void;
}

export interface StreamParseResult {
  headers: string[];
  rows: CSVRecord[];
  skippedRows: number;
}

export type { StreamParseResult as ParseResult };

/**
 * 流式解析 CSV 文件的指定页
 */
export function parseCSVPage(options: StreamParseOptions): StreamParseResult {
  const { content, delimiter, startRow, endRow, onProgress } = options;

  if (!content.trim()) {
    throw new Error("文件内容为空");
  }

  let normalized = content;
  if (normalized.charCodeAt(0) === 0xfeff) {
    normalized = normalized.slice(1);
  }
  normalized = normalized.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let currentRowIndex = -1; // -1 表示 header 行
  let skippedCount = 0;

  // 第一遍：解析所有行，但只保留需要的范围
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

      // 检查是否是空行
      const isEmpty = row.every((cell) => cell.trim().length === 0);
      
      if (!isEmpty) {
        if (currentRowIndex === -1) {
          // 这是 header 行
          rows.push(row);
        } else if (currentRowIndex >= startRow && currentRowIndex < endRow) {
          // 这是我们需要的数据行
          rows.push(row);
          
          // 报告进度
          if (onProgress && currentRowIndex % 1000 === 0) {
            onProgress(currentRowIndex - startRow, endRow - startRow);
          }
        } else if (currentRowIndex >= endRow) {
          // 已经超出需要的范围，可以提前退出
          break;
        }
        currentRowIndex++;
      } else {
        skippedCount++;
      }

      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  // 处理最后一行
  if (row.length > 0 || field) {
    row.push(field);
    const isEmpty = row.every((cell) => cell.trim().length === 0);
    
    if (!isEmpty) {
      if (currentRowIndex === -1) {
        rows.push(row);
      } else if (currentRowIndex >= startRow && currentRowIndex < endRow) {
        rows.push(row);
      }
      currentRowIndex++;
    } else {
      skippedCount++;
    }
  }

  if (!rows.length) {
    throw new Error("未检测到有效数据");
  }

  const headersRaw = rows[0].map((cell) => cell.trim());
  const headers = dedupeHeaders(headersRaw);

  const dataRows = rows.slice(1);
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
    skippedRows: skippedCount,
  };
}

/**
 * 快速统计 CSV 总行数（不完整解析）
 */
export function quickCountRows(content: string): number {
  let normalized = content;
  if (normalized.charCodeAt(0) === 0xfeff) {
    normalized = normalized.slice(1);
  }
  normalized = normalized.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  let rowCount = 0;
  let inQuotes = false;

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];

    if (char === '"') {
      const nextChar = normalized[i + 1];
      if (inQuotes && nextChar === '"') {
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "\n" && !inQuotes) {
      rowCount++;
    }
  }

  // 如果最后没有换行符，最后一行也要算
  if (normalized.length > 0 && normalized[normalized.length - 1] !== "\n") {
    rowCount++;
  }

  // 减去 header 行
  return Math.max(0, rowCount - 1);
}

/**
 * 降采样数据用于缩略图（每页采样约1000个点）
 */
export function sampleForThumbnail(
  content: string,
  delimiter: string,
  pageInfo: PageInfo,
  targetPoints: number = 1000
): Array<[number, number]> {
  const { startRow, endRow, rowCount } = pageInfo;

  // 计算采样步长
  const step = Math.max(1, Math.floor(rowCount / targetPoints));

  const result = parseCSVPage({
    content,
    delimiter,
    startRow,
    endRow,
  });

  if (result.rows.length === 0) {
    return [];
  }

  // 找到第一个数值列
  const firstNumericCol = findFirstNumericColumn(result.headers, result.rows);
  if (!firstNumericCol) {
    return [];
  }

  const points: Array<[number, number]> = [];
  for (let i = 0; i < result.rows.length; i += step) {
    const row = result.rows[i];
    const value = parseNumeric(row[firstNumericCol]);
    if (value !== null) {
      points.push([startRow + i, value]);
    }
  }

  return points;
}

/**
 * 找到第一个数值列
 */
function findFirstNumericColumn(
  headers: string[],
  rows: CSVRecord[]
): string | null {
  const sampleSize = Math.min(100, rows.length);

  for (const header of headers) {
    let numericCount = 0;
    let nonEmpty = 0;

    for (let i = 0; i < sampleSize; i++) {
      const value = rows[i]?.[header];
      if (value == null) continue;
      const trimmed = value.trim();
      if (!trimmed) continue;
      nonEmpty++;

      const numeric = Number(trimmed);
      if (Number.isFinite(numeric)) {
        numericCount++;
      }
    }

    if (nonEmpty > 0 && numericCount / nonEmpty >= 0.7) {
      return header;
    }
  }

  return null;
}

/**
 * 解析数值
 */
function parseNumeric(value?: string): number | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? numeric : null;
}

/**
 * 去重列名
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
