import { invoke } from "@tauri-apps/api/core";

export interface PageInfo {
  page_index: number;
  start_row: number;
  end_row: number;
  row_count: number;
}

export interface PaginationState {
  total_rows: number;
  total_pages: number;
  current_page: number;
  pages: PageInfo[];
}

export interface CsvRecord {
  [key: string]: unknown;
}

export interface ParsedPage {
  headers: string[];
  rows: CsvRecord[];
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

export class CsvBackendService {
  /**
   * 加载 CSV 文件
   * @returns [文件路径, 总行数, 分隔符]
   */
  static async loadFile(path: string): Promise<[string, number, string]> {
    const result = await invoke<[string, number, string]>("csv_load_file", {
      path,
    });
    return result;
  }

  /**
   * 获取分页信息
   */
  static async getPagination(totalRows: number): Promise<PaginationState> {
    return await invoke<PaginationState>("csv_get_pagination", {
      totalRows,
    });
  }

  /**
   * 加载指定页数据
   */
  static async loadPage(
    pageIndex: number,
    pageInfo: PageInfo
  ): Promise<ParsedPage> {
    return await invoke<ParsedPage>("csv_load_page", {
      pageIndex,
      pageInfo,
    });
  }

  /**
   * 生成缩略图
   */
  static async generateThumbnail(
    pageIndex: number,
    pageInfo: PageInfo
  ): Promise<ThumbnailData> {
    return await invoke<ThumbnailData>("csv_generate_thumbnail", {
      pageIndex,
      pageInfo,
    });
  }

  /**
   * 更改分隔符
   * @returns 新的总行数
   */
  static async changeDelimiter(newDelimiter: string): Promise<number> {
    return await invoke<number>("csv_change_delimiter", {
      newDelimiter,
    });
  }

  /**
   * 清空缓存
   */
  static async clearCache(): Promise<void> {
    await invoke("csv_clear_cache");
  }
}
