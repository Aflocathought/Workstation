/**
 * AI Workflow 持久化存储服务
 *
 * 功能：
 * - 工作流 CRUD（localStorage）
 * - 自动保存（节点移动 / 参数修改时记录）
 * - 脏状态追踪
 * - 模板管理
 * - 截图 / 缩略图
 * - 时间线快照管理
 */

// ─── Types ───────────────────────────────────────────────

export interface SavedWorkflow {
  id: string;
  name: string;
  description: string;
  /** solid-flow toObject() 的完整快照 */
  flowData: FlowSnapshot;
  createdAt: number;
  updatedAt: number;
  /** base64 截图（可选） */
  thumbnail?: string;
  /** 标记为模板 */
  isTemplate: boolean;
  tags: string[];
}

export interface FlowSnapshot {
  nodes: unknown[];
  edges: unknown[];
  viewport?: { x: number; y: number; zoom: number };
}

interface StoreIndex {
  workflows: string[];  // id 列表
  lastOpenedId: string | null;
}

// ─── Constants ───────────────────────────────────────────

const STORE_PREFIX = "ai-workflow:";
const INDEX_KEY = `${STORE_PREFIX}index`;
const WORKFLOW_KEY = (id: string) => `${STORE_PREFIX}wf:${id}`;
const AUTOSAVE_KEY = `${STORE_PREFIX}autosave`;

// ─── Helpers ─────────────────────────────────────────────

function generateId(): string {
  return `wf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function readJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJSON(key: string, data: unknown) {
  localStorage.setItem(key, JSON.stringify(data));
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function assertUniqueWorkflowName(name: string, excludeId?: string) {
  const normalized = normalizeName(name);
  if (!normalized) {
    throw new Error("工作流名称不能为空");
  }

  const duplicated = listWorkflows().find(
    (w) => normalizeName(w.name) === normalized && w.id !== excludeId,
  );

  if (duplicated) {
    throw new Error(`工作流名称已存在: ${name}`);
  }
}

// ─── Index Management ────────────────────────────────────

function getIndex(): StoreIndex {
  return readJSON<StoreIndex>(INDEX_KEY) ?? { workflows: [], lastOpenedId: null };
}

function saveIndex(index: StoreIndex) {
  writeJSON(INDEX_KEY, index);
}

// ─── Public API ──────────────────────────────────────────

/** 获取所有已保存的工作流元信息 */
export function listWorkflows(): SavedWorkflow[] {
  const index = getIndex();
  const result: SavedWorkflow[] = [];
  for (const id of index.workflows) {
    const wf = readJSON<SavedWorkflow>(WORKFLOW_KEY(id));
    if (wf) result.push(wf);
  }
  return result;
}

/** 获取单个工作流 */
export function getWorkflow(id: string): SavedWorkflow | null {
  return readJSON<SavedWorkflow>(WORKFLOW_KEY(id));
}

/** 保存新工作流 */
export function createWorkflow(
  name: string,
  flowData: FlowSnapshot,
  opts?: { description?: string; isTemplate?: boolean; tags?: string[]; thumbnail?: string },
): SavedWorkflow {
  assertUniqueWorkflowName(name);

  const id = generateId();
  const now = Date.now();
  const wf: SavedWorkflow = {
    id,
    name: name.trim(),
    description: opts?.description ?? "",
    flowData,
    createdAt: now,
    updatedAt: now,
    isTemplate: opts?.isTemplate ?? false,
    tags: opts?.tags ?? [],
    thumbnail: opts?.thumbnail,
  };
  writeJSON(WORKFLOW_KEY(id), wf);

  const index = getIndex();
  index.workflows.push(id);
  saveIndex(index);

  return wf;
}

/** 更新已有工作流（覆盖 flowData + 更新时间） */
export function updateWorkflow(
  id: string,
  updates: Partial<Pick<SavedWorkflow, "name" | "description" | "flowData" | "thumbnail" | "isTemplate" | "tags">>,
): SavedWorkflow | null {
  const wf = getWorkflow(id);
  if (!wf) return null;

  if (updates.name !== undefined) {
    assertUniqueWorkflowName(updates.name, id);
  }

  const updated: SavedWorkflow = {
    ...wf,
    ...updates,
    updatedAt: Date.now(),
  };
  writeJSON(WORKFLOW_KEY(id), updated);
  return updated;
}

/** 删除工作流 */
export function deleteWorkflow(id: string): boolean {
  const index = getIndex();
  const pos = index.workflows.indexOf(id);
  if (pos === -1) return false;

  index.workflows.splice(pos, 1);
  if (index.lastOpenedId === id) index.lastOpenedId = null;
  saveIndex(index);
  localStorage.removeItem(WORKFLOW_KEY(id));
  // 同时清理时间线数据
  clearTimeline(id);
  return true;
}

/** 复制工作流（用于 "另存为" 或 "从模板创建"） */
export function duplicateWorkflow(id: string, newName?: string): SavedWorkflow | null {
  const wf = getWorkflow(id);
  if (!wf) return null;

  const preferredName = newName ?? `${wf.name} (副本)`;
  return createWorkflow(preferredName, structuredClone(wf.flowData), {
    description: wf.description,
    isTemplate: false,
    tags: [...wf.tags],
  });
}

// ─── Last Opened ─────────────────────────────────────────

export function getLastOpenedId(): string | null {
  return getIndex().lastOpenedId;
}

export function setLastOpenedId(id: string | null) {
  const index = getIndex();
  index.lastOpenedId = id;
  saveIndex(index);
}

// ─── Autosave (临时快照，防止意外关闭丢失) ─────────────

export interface AutosaveData {
  workflowId: string | null;   // null = 未保存过的新工作流
  flowData: FlowSnapshot;
  savedAt: number;
}

export function writeAutosave(workflowId: string | null, flowData: FlowSnapshot) {
  const data: AutosaveData = { workflowId, flowData, savedAt: Date.now() };
  writeJSON(AUTOSAVE_KEY, data);
}

export function readAutosave(): AutosaveData | null {
  return readJSON<AutosaveData>(AUTOSAVE_KEY);
}

export function clearAutosave() {
  localStorage.removeItem(AUTOSAVE_KEY);
}

// ─── Templates ───────────────────────────────────────────

export function listTemplates(): SavedWorkflow[] {
  return listWorkflows().filter((w) => w.isTemplate);
}

export function createFromTemplate(templateId: string, name: string): SavedWorkflow | null {
  const tpl = getWorkflow(templateId);
  if (!tpl) return null;

  return createWorkflow(name.trim(), structuredClone(tpl.flowData), {
    description: `基于模板「${tpl.name}」创建`,
    tags: [...tpl.tags],
  });
}

// ─── Timeline Snapshots（每个工作流的保存时间线） ─────────

export interface TimelineSnapshot {
  id: string;
  workflowId: string;
  label: string;
  timestamp: number;
  flowData: FlowSnapshot;
  thumbnail?: string;
  nodeCount: number;
  edgeCount: number;
}

const TIMELINE_KEY = (wfId: string) => `${STORE_PREFIX}timeline:${wfId}`;
const MAX_TIMELINE_ENTRIES = 30;

/** 获取某个工作流的时间线快照列表（按时间倒序） */
export function getTimeline(workflowId: string): TimelineSnapshot[] {
  return readJSON<TimelineSnapshot[]>(TIMELINE_KEY(workflowId)) ?? [];
}

/** 追加一条时间线快照 */
export function pushTimelineSnapshot(
  workflowId: string,
  flowData: FlowSnapshot,
  label: string,
  thumbnail?: string,
): TimelineSnapshot {
  const entries = getTimeline(workflowId);
  const snap: TimelineSnapshot = {
    id: `snap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    workflowId,
    label,
    timestamp: Date.now(),
    flowData: structuredClone(flowData),
    thumbnail,
    nodeCount: (flowData.nodes ?? []).length,
    edgeCount: (flowData.edges ?? []).length,
  };
  entries.unshift(snap);
  if (entries.length > MAX_TIMELINE_ENTRIES) entries.length = MAX_TIMELINE_ENTRIES;
  writeJSON(TIMELINE_KEY(workflowId), entries);
  return snap;
}

/** 删除工作流相关的时间线 */
export function clearTimeline(workflowId: string) {
  localStorage.removeItem(TIMELINE_KEY(workflowId));
}
