// src/services/RemoteWorkerService.ts
/**
 * Remote Worker Service — 与远程 GPU Worker 通信
 *
 * 职责:
 * 1. 管理 Worker 列表（添加/删除/测试连接）
 * 2. 通过 HTTP 提交任务、查询状态
 * 3. 通过 WebSocket 接收实时进度
 * 4. 通过 SSH (Tauri Command) 部署 Worker
 *
 * 通信协议:
 * - HTTP POST /tasks      → 提交任务
 * - HTTP GET  /tasks      → 列出任务
 * - HTTP GET  /info       → Worker 状态
 * - WebSocket /ws         → 实时进度流
 */

import { createStore, produce, SetStoreFunction } from "solid-js/store";

// Tauri invoke (保持类型安全)
let invoke: (cmd: string, args?: Record<string, any>) => Promise<any>;
try {
  const tauri = (window as any).__TAURI__;
  invoke = tauri?.core?.invoke ?? (async () => { throw new Error("Tauri invoke not available"); });
} catch {
  invoke = async () => { throw new Error("Tauri invoke not available"); };
}

// ─── 类型定义 ────────────────────────────────────────────

export interface WorkerConfig {
  id: string;
  name: string;
  host: string;          // IP 或主机名 (Tailscale/ZeroTier)
  port: number;          // Worker HTTP 端口 (默认 8765)
  sshUser?: string;      // SSH 用户名
  sshKeyPath?: string;   // SSH 密钥路径
  tags?: string[];       // 标签 (e.g. ["gpu", "A100"])
}

export interface WorkerStatus {
  id: string;
  online: boolean;
  hostname: string;
  workerId: string;
  status: "idle" | "busy" | "offline";
  currentTask: string | null;
  queueSize: number;
  gpuInfo: string;
  pythonVersion: string;
  uptimeSeconds: number;
  lastChecked: number;
}

export type TaskStatus = "queued" | "running" | "success" | "error" | "cancelled";

export interface RemoteTask {
  id: string;
  name: string;
  workerId: string;
  workerName: string;
  status: TaskStatus;
  submittedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  progress: number;
  currentNode: string | null;
  message: string;
  nodeStatuses: Record<string, string>;
  metrics: Record<string, any>;
  logs: string[];
}

export interface TaskSubmission {
  name: string;
  graph_version: string;
  nodes: any[];
  edges: any[];
  metadata?: Record<string, any>;
  compiled_script?: string;
}

// ─── WebSocket 管理 ──────────────────────────────────────

class WorkerConnection {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 3000;
  private maxReconnectDelay = 30000;

  constructor(
    private config: WorkerConfig,
    private onMessage: (data: any) => void,
    private onStatusChange: (online: boolean) => void,
  ) {}

  connect() {
    const url = `ws://${this.config.host}:${this.config.port}/ws`;
    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log(`[WS] Connected to ${this.config.name}`);
        this.onStatusChange(true);
        this.reconnectDelay = 3000; // 重置重连延迟
        this.startPing();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.onMessage(data);
        } catch (e) {
          console.warn(`[WS] Invalid message from ${this.config.name}:`, event.data);
        }
      };

      this.ws.onclose = () => {
        console.log(`[WS] Disconnected from ${this.config.name}`);
        this.onStatusChange(false);
        this.scheduleReconnect();
      };

      this.ws.onerror = (error) => {
        console.error(`[WS] Error on ${this.config.name}:`, error);
      };
    } catch (e) {
      console.error(`[WS] Failed to connect to ${this.config.name}:`, e);
      this.onStatusChange(false);
      this.scheduleReconnect();
    }
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      console.log(`[WS] Reconnecting to ${this.config.name}...`);
      this.connect();
      // 指数退避
      this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, this.maxReconnectDelay);
    }, this.reconnectDelay);
  }

  private pingTimer: ReturnType<typeof setInterval> | null = null;

  private startPing() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: "ping" }));
      }
    }, 15000);
  }
}

// ─── 主服务类 ────────────────────────────────────────────

class RemoteWorkerService {
  // Reactive state — properly initialized
  private workersStore: WorkerConfig[];
  private setWorkers: SetStoreFunction<WorkerConfig[]>;
  private statusesStore: Record<string, WorkerStatus>;
  private setStatuses: SetStoreFunction<Record<string, WorkerStatus>>;
  private tasksStore: Record<string, RemoteTask>;
  private setTasks: SetStoreFunction<Record<string, RemoteTask>>;

  private connections = new Map<string, WorkerConnection>();

  private readonly STORAGE_KEY = "remote-workers";

  constructor() {
    const [workers, setWorkers] = createStore<WorkerConfig[]>([]);
    this.workersStore = workers;
    this.setWorkers = setWorkers;

    const [statuses, setStatuses] = createStore<Record<string, WorkerStatus>>({});
    this.statusesStore = statuses;
    this.setStatuses = setStatuses;

    const [tasks, setTasks] = createStore<Record<string, RemoteTask>>({});
    this.tasksStore = tasks;
    this.setTasks = setTasks;

    this.loadWorkers();
  }

  // ─── Public Getters ──────────────────────────────

  get workers() { return this.workersStore; }
  get statuses() { return this.statusesStore; }
  get tasks() { return this.tasksStore; }

  getWorkerStatus(id: string): WorkerStatus | undefined {
    return this.statusesStore[id];
  }

  // ─── Worker Management ───────────────────────────

  addWorker(config: Omit<WorkerConfig, "id">) {
    const id = `worker-${Date.now().toString(36)}`;
    const worker: WorkerConfig = { ...config, id };

    this.setWorkers(produce((workers) => {
      workers.push(worker);
    }));
    this.saveWorkers();
    this.connectWorker(worker);

    return id;
  }

  removeWorker(id: string) {
    this.disconnectWorker(id);
    this.setWorkers(produce((workers) => {
      const idx = workers.findIndex(w => w.id === id);
      if (idx >= 0) workers.splice(idx, 1);
    }));
    this.saveWorkers();
  }

  updateWorker(id: string, updates: Partial<WorkerConfig>) {
    this.setWorkers(produce((workers) => {
      const w = workers.find(w => w.id === id);
      if (w) Object.assign(w, updates);
    }));
    this.saveWorkers();

    // 重连
    this.disconnectWorker(id);
    const worker = this.workersStore.find(w => w.id === id);
    if (worker) this.connectWorker(worker);
  }

  // ─── Connection ──────────────────────────────────

  connectAll() {
    for (const worker of this.workersStore) {
      this.connectWorker(worker);
    }
  }

  disconnectAll() {
    for (const [_id, conn] of this.connections) {
      conn.disconnect();
    }
    this.connections.clear();
  }

  private connectWorker(config: WorkerConfig) {
    // 先断开已有连接
    this.disconnectWorker(config.id);

    const conn = new WorkerConnection(
      config,
      // onMessage
      (data) => this.handleWorkerMessage(config.id, data),
      // onStatusChange
      (online) => {
        this.setStatuses(produce((s) => {
          if (!s[config.id]) {
            s[config.id] = {
              id: config.id,
              online,
              hostname: "",
              workerId: "",
              status: online ? "idle" : "offline",
              currentTask: null,
              queueSize: 0,
              gpuInfo: "",
              pythonVersion: "",
              uptimeSeconds: 0,
              lastChecked: Date.now(),
            };
          } else {
            s[config.id].online = online;
            s[config.id].status = online ? s[config.id].status : "offline";
            s[config.id].lastChecked = Date.now();
          }
        }));

        // 连接成功后获取详细信息
        if (online) {
          void this.fetchWorkerInfo(config);
        }
      },
    );

    conn.connect();
    this.connections.set(config.id, conn);
  }

  private disconnectWorker(id: string) {
    const conn = this.connections.get(id);
    if (conn) {
      conn.disconnect();
      this.connections.delete(id);
    }
  }

  // ─── HTTP API ────────────────────────────────────

  private async fetchJson(config: WorkerConfig, path: string, options?: RequestInit) {
    const url = `http://${config.host}:${config.port}${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    return response.json();
  }

  async fetchWorkerInfo(config: WorkerConfig) {
    try {
      const info = await this.fetchJson(config, "/info");
      this.setStatuses(produce((s) => {
        s[config.id] = {
          id: config.id,
          online: true,
          hostname: info.hostname ?? "",
          workerId: info.worker_id ?? "",
          status: info.status ?? "idle",
          currentTask: info.current_task ?? null,
          queueSize: info.queue_size ?? 0,
          gpuInfo: info.gpu_info ?? "",
          pythonVersion: info.python_version ?? "",
          uptimeSeconds: info.uptime_seconds ?? 0,
          lastChecked: Date.now(),
        };
      }));
    } catch (e) {
      console.error(`Failed to fetch info from ${config.name}:`, e);
    }
  }

  /** 提交任务到指定 Worker */
  async submitTask(workerId: string, submission: TaskSubmission): Promise<RemoteTask | null> {
    const config = this.workersStore.find(w => w.id === workerId);
    if (!config) {
      throw new Error(`Worker ${workerId} 不存在`);
    }

    try {
      const result = await this.fetchJson(config, "/tasks", {
        method: "POST",
        body: JSON.stringify(submission),
      });

      const task: RemoteTask = {
        id: result.id,
        name: result.name,
        workerId: config.id,
        workerName: config.name,
        status: result.status,
        submittedAt: result.submitted_at,
        startedAt: result.started_at,
        finishedAt: result.finished_at,
        progress: result.progress,
        currentNode: result.current_node,
        message: result.message,
        nodeStatuses: result.node_statuses ?? {},
        metrics: result.metrics ?? {},
        logs: result.logs ?? [],
      };

      this.setTasks(produce((tasks) => {
        tasks[task.id] = task;
      }));

      return task;
    } catch (e) {
      console.error(`Failed to submit task to ${config.name}:`, e);
      throw e;
    }
  }

  /** 取消任务 */
  async cancelTask(workerId: string, taskId: string) {
    const config = this.workersStore.find(w => w.id === workerId);
    if (!config) return;

    await this.fetchJson(config, `/tasks/${taskId}`, { method: "DELETE" });
  }

  /** 获取编译后的脚本 (调试用) */
  async getTaskScript(workerId: string, taskId: string): Promise<string | null> {
    const config = this.workersStore.find(w => w.id === workerId);
    if (!config) return null;

    const result = await this.fetchJson(config, `/tasks/${taskId}/script`);
    return result.script;
  }

  // ─── WebSocket Message Handler ───────────────────

  private handleWorkerMessage(workerId: string, data: any) {
    switch (data.type) {
      case "task_update": {
        const t = data.task;
        if (t?.id) {
          this.setTasks(produce((tasks) => {
            if (!tasks[t.id]) {
              tasks[t.id] = {
                id: t.id,
                name: t.name,
                workerId,
                workerName: this.workersStore.find(w => w.id === workerId)?.name ?? workerId,
                status: t.status,
                submittedAt: t.submitted_at,
                startedAt: t.started_at,
                finishedAt: t.finished_at,
                progress: t.progress,
                currentNode: t.current_node,
                message: t.message,
                nodeStatuses: t.node_statuses ?? {},
                metrics: t.metrics ?? {},
                logs: t.logs ?? [],
              };
            } else {
              Object.assign(tasks[t.id], {
                status: t.status,
                startedAt: t.started_at,
                finishedAt: t.finished_at,
                progress: t.progress,
                currentNode: t.current_node,
                message: t.message,
                nodeStatuses: t.node_statuses ?? {},
                metrics: t.metrics ?? {},
                logs: t.logs ?? [],
              });
            }
          }));
        }
        break;
      }
      case "snapshot": {
        if (Array.isArray(data.tasks)) {
          for (const t of data.tasks) {
            this.handleWorkerMessage(workerId, { type: "task_update", task: t });
          }
        }
        break;
      }
      case "pong":
        break;
      default:
        console.log(`[WS] Unknown message from ${workerId}:`, data);
    }
  }

  // ─── SSH 操作 (via Tauri) ─────────────────────────

  /** 测试 SSH 连接 */
  async testSshConnection(workerId: string): Promise<{ reachable: boolean; hostname: string; pythonVersion: string; gpuInfo: string; message: string }> {
    const config = this.workersStore.find(w => w.id === workerId);
    if (!config) throw new Error(`Worker ${workerId} 不存在`);

    return invoke("ssh_test_connection", {
      host: config.host,
      user: config.sshUser ?? "root",
      keyPath: config.sshKeyPath ?? null,
    });
  }

  /** 在远程机器上执行命令 */
  async execRemote(workerId: string, command: string): Promise<{ success: boolean; stdout: string; stderr: string }> {
    const config = this.workersStore.find(w => w.id === workerId);
    if (!config) throw new Error(`Worker ${workerId} 不存在`);

    return invoke("ssh_exec_remote", {
      host: config.host,
      user: config.sshUser ?? "root",
      keyPath: config.sshKeyPath ?? null,
      command,
    });
  }

  /** 部署 Worker 到远程机器 */
  async deployWorker(workerId: string, workerDir: string, remoteDir: string = "~/ai-worker"): Promise<{ success: boolean; message: string; steps: string[] }> {
    const config = this.workersStore.find(w => w.id === workerId);
    if (!config) throw new Error(`Worker ${workerId} 不存在`);

    return invoke("ssh_deploy_worker", {
      host: config.host,
      user: config.sshUser ?? "root",
      keyPath: config.sshKeyPath ?? null,
      workerDir,
      remoteDir,
    });
  }

  /** 停止远程 Worker */
  async stopWorker(workerId: string): Promise<{ success: boolean; stdout: string }> {
    const config = this.workersStore.find(w => w.id === workerId);
    if (!config) throw new Error(`Worker ${workerId} 不存在`);

    return invoke("ssh_stop_worker", {
      host: config.host,
      user: config.sshUser ?? "root",
      keyPath: config.sshKeyPath ?? null,
    });
  }

  // ─── Persistence ─────────────────────────────────

  private loadWorkers() {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const workers: WorkerConfig[] = JSON.parse(stored);
        this.setWorkers(workers);
      }
    } catch (e) {
      console.error("Failed to load workers:", e);
    }
  }

  private saveWorkers() {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.workersStore));
    } catch (e) {
      console.error("Failed to save workers:", e);
    }
  }
}

// 单例
export const remoteWorkerService = new RemoteWorkerService();
