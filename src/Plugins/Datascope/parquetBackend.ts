import { invoke } from "@tauri-apps/api/core";

export interface ParquetColumn {
  name: string;
  dtype: string;
}

export interface ParquetOpenResult {
  path: string;
  total_rows: number;
  columns: ParquetColumn[];
}

export interface PageInfo {
  page_index: number;
  start_row: number;
  end_row: number;
  row_count: number;
}

export interface ParsedPage {
  headers: string[];
  rows: Record<string, unknown>[];
  skipped_rows: number;
}

export interface ThumbnailPoint {
  x: number;
  y: number;
}

export interface ThumbnailData {
  page_index: number;
  points: ThumbnailPoint[];
}

export interface CsvToParquetOptions {
  delimiter?: string;
  has_header?: boolean;
  infer_schema_length?: number;
  compression?: "zstd" | "snappy" | "uncompressed";
}

export class ParquetBackendService {
  static async openFile(path: string): Promise<ParquetOpenResult> {
    return await invoke<ParquetOpenResult>("parquet_open_file", { path });
  }

  static async loadPage(
    pageIndex: number,
    pageInfo: PageInfo,
    columns?: string[]
  ): Promise<ParsedPage> {
    return await invoke<ParsedPage>("parquet_load_page", {
      pageIndex,
      pageInfo,
      columns,
    });
  }

  static async generateThumbnail(
    pageIndex: number,
    pageInfo: PageInfo
  ): Promise<ThumbnailData> {
    return await invoke<ThumbnailData>("parquet_generate_thumbnail", {
      pageIndex,
      pageInfo,
    });
  }

  static async clearCache(): Promise<void> {
    await invoke("parquet_clear_cache");
  }

  static async convertCsvToParquet(
    csvPath: string,
    parquetPath: string,
    options?: CsvToParquetOptions
  ): Promise<void> {
    await invoke("convert_csv_to_parquet", {
      csvPath,
      parquetPath,
      options,
    });
  }
}
