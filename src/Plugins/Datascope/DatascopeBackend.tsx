// Datascope - 使用 Tauri 后端处理
import {
  batch,
  Component,
  createEffect,
  createMemo,
  createSignal,
  For,
  Show,
  onMount,
  onCleanup,
} from "solid-js";
import { open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import ChartRender, { type ChartMode } from "./ChartRender";
import styles from "./Datascope.module.css";
import { useAppFramework } from "../../core/AppFramework";
import {
  determineAxisType,
  buildColumnMeta,
  buildChartData,
  ChartSeries,
  axisTypeLabel,
} from "./csvUtils";
import {
  CsvBackendService,
  type PaginationState as BackendPaginationState,
} from "./csvBackend";
import { ParquetBackendService } from "./parquetBackend";
import ThumbnailGrid, { type ThumbnailData } from "./ThumbnailGrid";
import type { CSVRecord, AxisType } from "./types";
import { showProgressNotification, type ProgressNotificationHandle } from "../../services/NotificationService";

export interface ChartComputationResult {
  series: ChartSeries[];
  axisType: AxisType;
  rawCount: number;
  sampledCount: number;
  downsampled: boolean;
  droppedRows: number;
  xRange?: [number, number] | null;
}

export const ROW_INDEX_KEY = "__auto_sequence__";
const ROWS_PER_PAGE = 200000;

type RecentFileEntry = {
  path: string;
  name: string;
  lastOpenedAt: number;
};

const RECENT_FILES_KEY = "datascope.recentFiles.v1";
const MAX_RECENT_FILES = 10;

type DataFormat = "csv" | "parquet";

const Datascope: Component = () => {
  const framework = useAppFramework();
  const [headers, setHeaders] = createSignal<string[]>([]);
  const [rows, setRows] = createSignal<CSVRecord[]>([]);
  const [xColumn, setXColumn] = createSignal<string>("");
  const [valueColumns, setValueColumns] = createSignal<string[]>([]);
  const [fileName, setFileName] = createSignal<string>("");
  const [totalRowCount, setTotalRowCount] = createSignal<number>(0);
  const [status, setStatus] = createSignal<string>("");
  const [errorMessage, setErrorMessage] = createSignal<string>("");
  const [isLoading, setIsLoading] = createSignal<boolean>(false);
  const [delimiter, setDelimiter] = createSignal<string>(",");
  const [skippedRows, setSkippedRows] = createSignal<number>(0);
  const csvExists = createMemo(() => rows().length > 0);
  const [isSmooth] = createSignal<boolean>(false);
  const [chartMode, setChartMode] = createSignal<ChartMode>("line");
  const autoDownsample = () => framework.store.settings.datascopeAutoDownsample;
  const maxPoints = () => framework.store.settings.datascopeMaxPoints;

  const [isSettingsOpen, setIsSettingsOpen] = createSignal<boolean>(true);

  // 分页相关状态
  const [pagination, setPagination] = createSignal<BackendPaginationState | null>(null);
  const [thumbnails, setThumbnails] = createSignal<ThumbnailData[]>([]);
  const [isPageLoading, setIsPageLoading] = createSignal(false);
  let pageLoadNotification: ProgressNotificationHandle | null = null;
  const [currentFilePath, setCurrentFilePath] = createSignal<string>("");
  const [dragOver, setDragOver] = createSignal<boolean>(false);
  const [dataFormat, setDataFormat] = createSignal<DataFormat>("csv");
  const isParquet = createMemo(() => dataFormat() === "parquet");
  const [parquetSchema, setParquetSchema] = createSignal<
    Array<{ name: string; dtype: string }>
  >([]);
  const [parquetInferredNumericColumns, setParquetInferredNumericColumns] =
    createSignal<string[]>([]);

  type PageInfoLike = BackendPaginationState["pages"][number];
  const [lastLoadedPageInfo, setLastLoadedPageInfo] = createSignal<PageInfoLike | null>(null);

  const selectedParquetColumns = () => {
    const cols = new Set<string>();
    const x = xColumn();
    if (x && x !== ROW_INDEX_KEY) cols.add(x);
    valueColumns().forEach((c) => cols.add(c));
    return cols.size ? Array.from(cols) : undefined;
  };

  let dragCounter = 0;
  let unlistenFileDrop: (() => void) | undefined;
  let unlistenDatascopeProgress: (() => void) | undefined;

  const [recentFiles, setRecentFiles] = createSignal<RecentFileEntry[]>([]);

  const getBasename = (path: string) => path.split(/[/\\]/).pop() || path;

  const loadRecentFiles = (): RecentFileEntry[] => {
    try {
      const raw = localStorage.getItem(RECENT_FILES_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((x): x is RecentFileEntry =>
          Boolean(x) &&
          typeof (x as any).path === "string" &&
          typeof (x as any).name === "string" &&
          typeof (x as any).lastOpenedAt === "number"
        )
        .slice(0, MAX_RECENT_FILES);
    } catch {
      return [];
    }
  };

  const persistRecentFiles = (list: RecentFileEntry[]) => {
    try {
      localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(list));
    } catch {
      // ignore
    }
  };

  const addRecentFile = (path: string) => {
    const now = Date.now();
    const entry: RecentFileEntry = {
      path,
      name: getBasename(path),
      lastOpenedAt: now,
    };

    setRecentFiles((prev) => {
      const next = [entry, ...prev.filter((x) => x.path !== path)].slice(
        0,
        MAX_RECENT_FILES
      );
      persistRecentFiles(next);
      return next;
    });
  };

  const handleRevealInExplorer = async (filepath: string) => {
    try {
      await invoke("pdflibrary_show_in_folder", { filepath });
    } catch (err) {
      setErrorMessage(`跳转失败: ${(err as Error).message}`);
    }
  };

  const closeCurrentFile = () => {
    setIsLoading(false);
    setIsPageLoading(false);
    pageLoadNotification?.close();

    batch(() => {
      setRows([]);
      setHeaders([]);
      setFileName("");
      setCurrentFilePath("");
      setTotalRowCount(0);
      setStatus("");
      setErrorMessage("");
      setPagination(null);
      setThumbnails([]);
      setLastLoadedPageInfo(null);
      setValueColumns([]);
      setXColumn("");
      setSkippedRows(0);
      setDelimiter(",");
      setDataFormat("csv");
      setParquetSchema([]);
      setParquetInferredNumericColumns([]);
    });

    void Promise.allSettled([
      CsvBackendService.clearCache(),
      ParquetBackendService.clearCache(),
    ]);
  };

  // 监听 Tauri v2 的拖拽事件 tauri://drag-drop，直接获取本地路径
  onMount(async () => {
    setRecentFiles(loadRecentFiles());
    try {
      unlistenFileDrop = await listen<any>("tauri://drag-drop", async (event) => {
        console.log("[tauri://drag-drop] raw payload:", event.payload);
        const payload: any = event.payload;

        // DragDropEvent 通常形如 { type: 'drop' | 'hovered' | 'cancelled', paths: string[] }
        const kind = (payload && (payload.type || payload.event || payload.kind)) as
          | string
          | undefined;

        // 只在真正放下(dropped)时处理，悬停/取消忽略
        if (kind && !["drop", "dropped", "Drop", "Dropped"].includes(kind)) {
          return;
        }

        let paths: string[] | undefined;
        if (Array.isArray(payload?.paths)) {
          paths = payload.paths as string[];
        } else if (Array.isArray(payload)) {
          paths = payload as string[];
        } else if (typeof payload === "string") {
          paths = [payload];
        }

        const firstPath = paths && paths[0];
        if (firstPath && typeof firstPath === "string") {
          console.log("📂 [tauri://drag-drop] 路径:", firstPath);
          await handleFileSelection(firstPath);
        }
      });

      unlistenDatascopeProgress = await listen<any>("datascope:progress", (event) => {
        const payload: any = event.payload;
        if (!payload) return;
        const current = Number(payload.current);
        const total = Number(payload.total);
        const message = typeof payload.message === "string" ? payload.message : "";

        if (Number.isFinite(current) && Number.isFinite(total) && total >= 0 && current >= 0) {
          pageLoadNotification?.updateProgress(current, total, message);
        }
      });
    } catch (err) {
      console.error("监听 tauri://drag-drop 失败", err);
    }
  });

  onCleanup(() => {
    if (unlistenFileDrop) {
      unlistenFileDrop();
      unlistenFileDrop = undefined;
    }
    if (unlistenDatascopeProgress) {
      unlistenDatascopeProgress();
      unlistenDatascopeProgress = undefined;
    }
  });

  // 拖拽事件处理
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

  const handleDrop = async (event: DragEvent) => {
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
      // Tauri / WebView 环境下，尝试从 File 对象读取本地路径
      console.log("📂 拖拽文件:", primaryFile.name, "大小:", primaryFile.size);

      const anyFile = primaryFile as any;
      const filePath: string | undefined = anyFile?.path;

      if (filePath && typeof filePath === "string") {
        // 直接复用现有的文件加载流程
        await handleFileSelection(filePath);
        return;
      }
      // 在 Tauri 环境下，真实路径会通过 tauri://file-drop 事件提供
      // 这里不再报错，交给全局事件处理
      return;
    }

    setErrorMessage("拖拽内容不是有效的文件");
  };

  const columnMeta = createMemo(() => buildColumnMeta(rows(), headers()));

  const parquetNumericColumns = createMemo(() => {
    const cols = parquetSchema();
    return cols
      .filter((c) =>
        /^(Int|UInt|Float|Decimal)/i.test(c.dtype) ||
        /\b(Int|UInt|Float|Decimal)\b/i.test(c.dtype)
      )
      .map((c) => c.name);
  });

  const numericColumns = createMemo(() => {
    if (isParquet()) {
      const schemaNumeric = parquetNumericColumns();
      if (schemaNumeric.length) return schemaNumeric;
      // fallback: schema 无法判断时，使用一次性采样推断结果（稳定，不随换页丢失）
      return parquetInferredNumericColumns();
    }
    return columnMeta()
      .filter((meta) => meta.isNumeric)
      .map((meta) => meta.name);
  });

  const axisType = createMemo<AxisType>(() => {
    if (xColumn() === ROW_INDEX_KEY) return "value";

    if (isParquet()) {
      const colName = xColumn();
      const dtype = parquetSchema().find((c) => c.name === colName)?.dtype ?? "";
      if (/Datetime|Date|Time/i.test(dtype)) return "time";
      if (/Int|UInt|Float|Decimal/i.test(dtype)) return "value";
      return "category";
    }

    return determineAxisType(columnMeta(), xColumn());
  });

  createEffect(() => {
    if (valueColumns().length > 0) return;
    const numeric = numericColumns();
    if (numeric.length) {
      setValueColumns([numeric[0]]);
    }
  });

  // Parquet 使用列裁剪：当用户切换 X / 数值列时，需要重新加载当前页把新列取回来。
  const [lastSelectionKey, setLastSelectionKey] = createSignal<string>("");
  createEffect(() => {
    if (!isParquet()) return;
    if (!currentFilePath()) return;
    if (isLoading() || isPageLoading()) return;

    const x = xColumn() || ROW_INDEX_KEY;
    const ys = valueColumns().slice().sort();
    const key = `${x}::${ys.join("|")}`;
    if (key === lastSelectionKey()) return;
    setLastSelectionKey(key);

    // 没有任何数据页信息时不触发
    const pg = pagination();
    if (pg) {
      loadPage(pg.current_page);
      return;
    }
    const info = lastLoadedPageInfo();
    if (!info) return;

    // 小文件模式：用最近一次加载的页信息刷新当前页
    const total = info.row_count ?? rows().length;
    setIsPageLoading(true);
    pageLoadNotification?.close();
    pageLoadNotification = showProgressNotification({
      title: "正在更新列",
      message: "处理中...",
      current: 0,
      total,
    });
    void ParquetBackendService.loadPage(0, info as any, selectedParquetColumns())
      .then((parsed) => {
        batch(() => {
          setRows(parsed.rows);
          setSkippedRows(parsed.skipped_rows);
          pageLoadNotification?.updateProgress(total, total, "完成");
        });
      })
      .catch((err) => {
        console.warn("Parquet 重新加载列失败:", err);
        pageLoadNotification?.fail("更新列失败", (err as Error).message);
      })
      .finally(() => {
        setIsPageLoading(false);
        pageLoadNotification?.done("完成");
        pageLoadNotification = null;
      });
  });

  // 进度条改为后端真实进度上报（datascope:progress 事件）

  createEffect(() => {
    const availableHeaders = headers();
    const currentX = xColumn();

    if (!availableHeaders.length) {
      setXColumn("");
    } else if (
      currentX !== ROW_INDEX_KEY &&
      !availableHeaders.includes(currentX)
    ) {
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
      chartMode: chartMode(),
      enableDownsampling: autoDownsample(),
      maxPoints: maxPoints(),
    });
  });

  // 使用对话框选择文件
  const handleSelectFile = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: "Data Files",
            extensions: ["csv", "parquet", "pq"],
          },
        ],
      });

      if (selected && typeof selected === "string") {
        await handleFileSelection(selected);
      }
    } catch (err) {
      setErrorMessage(`选择文件失败: ${(err as Error).message}`);
    }
  };

  const handleFileSelection = async (filePath: string) => {
    console.log("🚀 开始加载文件:", filePath);
    setIsLoading(true);
    setErrorMessage("");
    setStatus("正在加载文件...");
    setCurrentFilePath(filePath);
    setTotalRowCount(0);

    // 简单按扩展名判定格式
    const ext = (filePath.split(".").pop() || "").toLowerCase();
    const nextFormat: DataFormat = ext === "parquet" || ext === "pq" ? "parquet" : "csv";
    setDataFormat(nextFormat);

    try {
      // 清理两边缓存，避免切换格式时残留
      await Promise.allSettled([
        CsvBackendService.clearCache(),
        ParquetBackendService.clearCache(),
      ]);

      let totalRows = 0;
      let displayPath = filePath;

      if (nextFormat === "parquet") {
        console.log("📡 调用后端 parquet_open_file...");
        const opened = await ParquetBackendService.openFile(filePath);
        totalRows = opened.total_rows;
        displayPath = opened.path;
        setParquetSchema(opened.columns);
        setHeaders(opened.columns.map((c) => c.name));
        // 避免沿用上一个文件的列选择导致 Parquet column pruning 选择不存在的列而加载失败
        setXColumn(ROW_INDEX_KEY);
        setValueColumns([]);

        // 先用 schema 推断数值列；若 schema 无法判断（比如数值存成 Utf8/String），做一次小样本推断。
        const schemaNumeric = opened.columns
          .filter((c) =>
            /^(Int|UInt|Float|Decimal)/i.test(c.dtype) ||
            /\b(Int|UInt|Float|Decimal)\b/i.test(c.dtype)
          )
          .map((c) => c.name);

        if (schemaNumeric.length) {
          setParquetInferredNumericColumns(schemaNumeric);
          setValueColumns([schemaNumeric[0]]);
        } else {
          setStatus("分析列类型... (采样)");
          try {
            const sampleCount = 200;
            const samplePageInfo = {
              page_index: 0,
              start_row: 0,
              end_row: sampleCount,
              row_count: sampleCount,
            };
            const sample = await ParquetBackendService.loadPage(0, samplePageInfo, undefined);
            const inferred = buildColumnMeta(sample.rows as any, sample.headers)
              .filter((m) => m.isNumeric)
              .map((m) => m.name);
            setParquetInferredNumericColumns(inferred);
            if (inferred.length) {
              setValueColumns([inferred[0]]);
            }
          } catch (e) {
            console.warn("Parquet 数值列采样推断失败:", e);
            setParquetInferredNumericColumns([]);
          }
        }
        // Parquet 没有分隔符概念，这里保留 UI 兼容
        setDelimiter(",");
        setSkippedRows(0);
      } else {
        console.log("📡 调用后端 csv_load_file...");
        const [path, rowsCount, delim] = await CsvBackendService.loadFile(filePath);
        totalRows = rowsCount;
        displayPath = path;
        setDelimiter(delim);
        setParquetSchema([]);
        setParquetInferredNumericColumns([]);
      }

      console.log("✅ 后端返回:", { path: displayPath, totalRows, format: nextFormat });

      setCurrentFilePath(displayPath);
      setFileName(displayPath.split(/[/\\]/).pop() || displayPath);
      setTotalRowCount(totalRows);

      // 判断是否需要分页
      if (totalRows > ROWS_PER_PAGE) {
        console.log(`📄 大文件模式: ${totalRows} 行, 需要分页`);
        await handleLargeFile(totalRows);
      } else {
        console.log(`📄 小文件模式: ${totalRows} 行, 直接加载`);
        await handleSmallFile(totalRows);
      }

      addRecentFile(displayPath);
      
      console.log("✅ 文件加载完成");
    } catch (err) {
      console.error("❌ 加载失败:", err);
      console.error("错误详情:", {
        message: (err as Error).message,
        stack: (err as Error).stack,
      });
      
      setRows([]);
      setHeaders([]);
      setFileName("");
      setTotalRowCount(0);
      setPagination(null);
      setThumbnails([]);
      setParquetInferredNumericColumns([]);
      setErrorMessage(`加载失败: ${(err as Error).message}`);
      setStatus("");
    } finally {
      setIsLoading(false);
    }
  };

  // 处理小文件
  const handleSmallFile = async (totalRows: number) => {
    console.log("📦 处理小文件, 总行数:", totalRows);
    setIsPageLoading(true);
    pageLoadNotification?.close();
    pageLoadNotification = showProgressNotification({
      title: "加载数据",
      message: "加载中...",
      current: 0,
      total: 0,
    });

    try {
      console.log("📡 获取分页信息...");
      const paginationState = await CsvBackendService.getPagination(totalRows);
      console.log("✅ 分页信息:", paginationState);
      
      const pageInfo = paginationState.pages[0];
      setLastLoadedPageInfo(pageInfo);
      console.log("📡 加载第一页数据...", pageInfo);

      pageLoadNotification?.updateProgress(0, pageInfo.row_count, "加载中...");

      const parsed = isParquet()
        ? await ParquetBackendService.loadPage(
            0,
            pageInfo,
            selectedParquetColumns()
          )
        : await CsvBackendService.loadPage(0, pageInfo);
      console.log("✅ 数据解析完成:", {
        headers: parsed.headers.length,
        rows: parsed.rows.length,
        skipped: parsed.skipped_rows,
      });

      const keepSchemaHeaders = isParquet() && parquetSchema().length > 0;

      batch(() => {
        if (!keepSchemaHeaders) {
          setHeaders(parsed.headers);
        }
        setRows(parsed.rows);
        setSkippedRows(parsed.skipped_rows);
        pageLoadNotification?.updateProgress(pageInfo.row_count, pageInfo.row_count, "完成");
        if (!isParquet()) {
          setValueColumns([]);
          setXColumn(ROW_INDEX_KEY);
        } else if (!xColumn()) {
          setXColumn(ROW_INDEX_KEY);
        }
        setPagination(null);
        setThumbnails([]);
        setStatus(
          `已加载 ${parsed.rows.length.toLocaleString()} 行, ${
            parsed.headers.length
          } 列`
        );
        setErrorMessage("");
      });
      
      console.log("✅ 小文件处理完成");
    } catch (err) {
      console.error("❌ 小文件处理失败:", err);
      pageLoadNotification?.fail("加载失败", (err as Error).message);
      throw new Error(`加载数据失败: ${(err as Error).message}`);
    } finally {
      setIsPageLoading(false);
      pageLoadNotification?.done("加载完成");
      pageLoadNotification = null;
    }
  };

  // 处理大文件
  const handleLargeFile = async (totalRows: number) => {
    console.log("📚 处理大文件, 总行数:", totalRows);
    
    console.log("📡 获取分页信息...");
    const paginationState = await CsvBackendService.getPagination(totalRows);
    console.log("✅ 分页信息:", paginationState);
    setPagination(paginationState);

    // 初始化缩略图数据
    const initialThumbnails: ThumbnailData[] = paginationState.pages.map((page) => ({
      pageIndex: page.page_index,
      points: [],
      isLoaded: false,
    }));
    setThumbnails(initialThumbnails);
    console.log(`📊 初始化 ${initialThumbnails.length} 个缩略图占位符`);

    // 加载第一页数据
    console.log("📡 加载第一页...");
    await loadPage(0);

    // 后台生成所有缩略图
    console.log("🎨 启动后台缩略图生成...");
    setTimeout(() => {
      generateAllThumbnails(paginationState);
    }, 100);
  };

  // 加载指定页
  const loadPage = async (pageIndex: number) => {
    const pg = pagination();
    if (!pg || pageIndex < 0 || pageIndex >= pg.total_pages) return;

    const pageInfo = pg.pages[pageIndex];
    setLastLoadedPageInfo(pageInfo);

    setIsPageLoading(true);
    pageLoadNotification?.close();
    pageLoadNotification = showProgressNotification({
      title: `加载第 ${pageIndex + 1} 页`,
      message: "正在加载...",
      current: 0,
      total: pageInfo.row_count,
    });

    try {
      const parsed = isParquet()
        ? await ParquetBackendService.loadPage(
            pageIndex,
            pageInfo,
            selectedParquetColumns()
          )
        : await CsvBackendService.loadPage(pageIndex, pageInfo);

      const keepSchemaHeaders = isParquet() && parquetSchema().length > 0;

      batch(() => {
        if (!keepSchemaHeaders) {
          setHeaders(parsed.headers);
        }
        setRows(parsed.rows);
        setSkippedRows(parsed.skipped_rows);
        if (!isParquet()) {
          setValueColumns([]);
          setXColumn(ROW_INDEX_KEY);
        } else if (!xColumn()) {
          setXColumn(ROW_INDEX_KEY);
        }
        setPagination({ ...pg, current_page: pageIndex });
        setStatus(
          `第 ${pageIndex + 1}/${pg.total_pages} 页 · ${pageInfo.start_row.toLocaleString()} - ${pageInfo.end_row.toLocaleString()} 行`
        );
        pageLoadNotification?.updateProgress(pageInfo.row_count, pageInfo.row_count, "完成");
      });

      // 预加载下一页
      if (pageIndex + 1 < pg.total_pages) {
        const nextPageInfo = pg.pages[pageIndex + 1];
        if (isParquet()) {
          ParquetBackendService.loadPage(pageIndex + 1, nextPageInfo, selectedParquetColumns()).catch(console.warn);
        } else {
          CsvBackendService.loadPage(pageIndex + 1, nextPageInfo).catch(console.warn);
        }
      }
    } catch (err) {
      setErrorMessage(`加载第 ${pageIndex + 1} 页失败: ${(err as Error).message}`);
      pageLoadNotification?.fail(`加载第 ${pageIndex + 1} 页失败`, (err as Error).message);
    } finally {
      setIsPageLoading(false);
      pageLoadNotification?.done("加载完成");
      pageLoadNotification = null;
    }
  };

  // 生成所有缩略图
  const generateAllThumbnails = async (pg: BackendPaginationState) => {
    for (let i = 0; i < pg.pages.length; i++) {
      try {
        const thumbData = isParquet()
          ? await ParquetBackendService.generateThumbnail(i, pg.pages[i])
          : await CsvBackendService.generateThumbnail(i, pg.pages[i]);

        setThumbnails((prev) =>
          prev.map((thumb) =>
            thumb.pageIndex === i
              ? {
                  ...thumb,
                  points: thumbData.points.map((p) => [p.x, p.y] as [number, number]),
                  isLoaded: true,
                }
              : thumb
          )
        );

        // 避免阻塞 UI
        if (i % 5 === 0) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      } catch (err) {
        console.warn(`生成第 ${i + 1} 页缩略图失败:`, err);
      }
    }
  };

  // 处理页面切换
  const handlePageClick = (pageIndex: number) => {
    loadPage(pageIndex);
  };

  const handleDelimiterChange = async (event: Event) => {
    if (isParquet()) {
      // Parquet 不支持分隔符；保留 UI 但禁用行为
      setErrorMessage("Parquet 文件不支持修改分隔符");
      return;
    }
    const next = (event.currentTarget as HTMLSelectElement).value;
    if (!next || next === delimiter()) return;

    if (!currentFilePath()) {
      setErrorMessage("没有加载的文件");
      return;
    }

    try {
      setIsLoading(true);
      setStatus("重新解析文件...");
      setDelimiter(next);

      // 调用后端更改分隔符
      const totalRows = await CsvBackendService.changeDelimiter(next);

      if (totalRows > ROWS_PER_PAGE) {
        await handleLargeFile(totalRows);
      } else {
        await handleSmallFile(totalRows);
      }
    } catch (err) {
      setErrorMessage(`使用分隔符 "${next}" 解析失败: ${(err as Error).message}`);
    } finally {
      setIsLoading(false);
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

  const handleChartModeChange = (event: Event) => {
    setChartMode(
      (event.currentTarget as HTMLSelectElement).value as ChartMode
    );
  };

  const renderStats = () => {
    const data = chartData();
    if (!data) return null;
    if (data.rawCount === 0) {
      return (
        <div class={styles.message}>加载成功, 请选择至少一个数值列以绘图。</div>
      );
    }
    // return (
    //   <div class={styles.stats}>
    //     <span>
    //       <strong>原始点:</strong> {data.rawCount.toLocaleString()}
    //     </span>
    //     <span>
    //       <strong>采样后:</strong> {data.sampledCount.toLocaleString()}
    //     </span>
    //     <span>
    //       <strong>下采样:</strong> {data.downsampled ? "已启用" : "未启用"}
    //     </span>
    //     <span>
    //       <strong>X 轴类型:</strong> {axisTypeLabel(data.axisType)}
    //     </span>
    //     {data.droppedRows > 0 && (
    //       <span>
    //         <strong>忽略行:</strong> {data.droppedRows.toLocaleString()}
    //       </span>
    //     )}
    //   </div>
    // );
    return undefined;
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
          chartMode={chartMode()}
          downsampled={data.downsampled}
          isSmooth={isSmooth()}
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
            <section 
              class={`${styles.dropZone} ${dragOver() ? styles.dragOver : ""}`}
              onClick={handleSelectFile}
            >
              <div class={styles.dropZoneContent}>
                <div class={styles.icon}>📂</div>
                <strong>
                  {isLoading() 
                    ? "读取中..." 
                    : dragOver() 
                    ? "释放鼠标以选择文件（或点击）" 
                    : "点击选择 CSV/Parquet 文件或拖拽文件到此处"}
                </strong>
              </div>
              {errorMessage() && (
                <div class={styles.error}>{errorMessage()}</div>
              )}
            </section>
            <Show when={fileName()}>
              <div class={styles.fileInfo}>
                当前文件: <strong>{fileName()}</strong>
                {rows().length > 0 &&
                  ` · ${rows().length.toLocaleString()} 行 · ${
                    headers().length
                  } 列${isParquet() ? "" : ` · 分隔符 \"${delimiter()}\"`}`}
                {skippedRows() > 0 && ` · 忽略空行 ${skippedRows()}`}
              </div>
            </Show>

            <Show when={recentFiles().length > 0}>
              <div class={styles.recentFiles}>
                <div class={styles.recentHeader}>
                  <h4 class={styles.recentTitle}>最近打开</h4>
                </div>
                <div class={styles.recentList}>
                  <For each={recentFiles()}>
                    {(item) => (
                      <div class={styles.recentItem}>
                        <button
                          class={styles.recentOpenButton}
                          onClick={() => handleFileSelection(item.path)}
                          title={item.path}
                        >
                          <span class={styles.recentName}>{item.name}</span>
                          <span class={styles.recentPath}>{item.path}</span>
                        </button>
                        <button
                          class={styles.recentJumpButton}
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleRevealInExplorer(item.path);
                          }}
                          title="在资源管理器中定位"
                        >
                          跳转
                        </button>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            </Show>
          </div>
        }
      >
        <div class={styles.dashboardContent}>
          <div class={styles.mainSplit}>
            <Show when={!isSettingsOpen()}>
              <button
                class={styles.settingsFloatingToggle}
                onClick={() => setIsSettingsOpen(true)}
                title="展开设置"
              >
                设置
              </button>
            </Show>

            <section class={styles.chartPanel}>
              <Show when={status()}>
                <div class={styles.message}>{status()}</div>
              </Show>

              <Show when={errorMessage()}>
                <div class={styles.error}>{errorMessage()}</div>
              </Show>

              {renderStats()}
              {renderChart()}
            </section>

            <aside
              class={styles.settingsPanel}
              classList={{ [styles.settingsPanelClosed]: !isSettingsOpen() }}
            >
              <div class={styles.section}>
                <div class={styles.panelHeader}>
                  <h3 class={styles.sectionTitle}>设置</h3>
                  <button
                    class={styles.panelHeaderButton}
                    onClick={() => setIsSettingsOpen(false)}
                    title="收起设置"
                  >
                    ✕
                  </button>
                </div>

                <div class={styles.fileMeta}>
                  <div class={styles.fileMetaRow}>
                    <span>文件名</span>
                    <strong>{fileName() || "—"}</strong>
                  </div>
                  <Show when={currentFilePath()}>
                    <div class={styles.fileMetaPath} title={currentFilePath()}>
                      {currentFilePath()}
                    </div>
                  </Show>
                  <div class={styles.fileMetaRow}>
                    <span>格式</span>
                    <strong>{isParquet() ? "Parquet" : "CSV"}</strong>
                  </div>
                  <Show when={totalRowCount() > 0}>
                    <div class={styles.fileMetaRow}>
                      <span>总行数</span>
                      <strong>{totalRowCount().toLocaleString()}</strong>
                    </div>
                  </Show>
                  <div class={styles.fileMetaRow}>
                    <span>列数</span>
                    <strong>{headers().length}</strong>
                  </div>

                  <Show when={currentFilePath()}>
                    <div class={styles.fileMetaRow}>
                      <span>文件</span>
                      <button
                        class={styles.fileMetaActionButton}
                        onClick={closeCurrentFile}
                        title="关闭当前文件并返回主界面"
                      >
                        关闭
                      </button>
                    </div>
                  </Show>
                </div>

                <label class={styles.inlineControls}>
                  <div class={styles.xHeader}>
                    <span>X 轴</span>
                    <span>(类型: {axisTypeLabel(axisType())})</span>
                  </div>
                  <select
                    value={xColumn()}
                    onChange={(event) =>
                      setXColumn(
                        (event.currentTarget as HTMLSelectElement).value
                      )
                    }
                  >
                    <option value={ROW_INDEX_KEY}>1...N</option>
                    <For each={headers()}>
                      {(header) => <option value={header}>{header}</option>}
                    </For>
                  </select>
                </label>

                <label class={styles.inlineControls}>
                  <span>图表类型</span>
                  <select value={chartMode()} onChange={handleChartModeChange}>
                    <option value="line">连线图</option>
                    <option value="scatter">散点图</option>
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

                <label class={styles.inlineControls}>
                  <span>分隔符</span>
                  <select
                    value={delimiter()}
                    onChange={handleDelimiterChange}
                    disabled={isParquet()}
                  >
                    <option value=",">逗号 (,)</option>
                    <option value=";">分号 (;)</option>
                    <option value="\t">制表符 (Tab)</option>
                    <option value="|">竖线 (|)</option>
                  </select>
                </label>
              </div>
            </aside>
          </div>

          {/* 分页缩略图 */}
          <Show when={pagination()}>
            <ThumbnailGrid
              thumbnails={thumbnails()}
              currentPage={pagination()?.current_page || 0}
              totalPages={pagination()?.total_pages || 0}
              onPageClick={handlePageClick}
              pageInfo={pagination()?.pages.map(p => ({
                pageIndex: p.page_index,
                startRow: p.start_row,
                endRow: p.end_row,
                rowCount: p.row_count,
              })) || []}
            />
          </Show>

          {/* 加载/进度使用 Notification 统一展示 */}
        </div>
      </Show>
    </div>
  );
};

export default Datascope;
