/**
 * AI Workflow 门户页面
 *
 * 三列布局：当前工作流 | 已保存的工作流 | 模板
 */

import { createSignal, For, Show, onMount, createMemo } from "solid-js";
import {
  listWorkflows,
  createWorkflow,
  deleteWorkflow,
  duplicateWorkflow,
  createFromTemplate,
  type SavedWorkflow,
  type FlowSnapshot,
} from "./workflow/workflow-store";
import { confirmAction } from "../core/ui/confirm";

import styles from "./AIPortal.module.css";

// ─── Props ───────────────────────────────────────────────

interface AIPortalProps {
  currentWorkflowId: string | null;
  currentWorkflowName: string;
  currentIsUnsaved: boolean;
  onOpenWorkflow: (id: string) => void;
  onNewWorkflow: () => void;
  onBackToCanvas: () => void;
}

// ─── Component ───────────────────────────────────────────

const AIPortal = (props: AIPortalProps) => {
  const [allWorkflows, setAllWorkflows] = createSignal<SavedWorkflow[]>([]);
  const [search, setSearch] = createSignal("");

  const refresh = () => setAllWorkflows(listWorkflows());
  onMount(refresh);

  const currentWorkflow = createMemo(() => {
    const id = props.currentWorkflowId;
    if (!id) return null;
    return allWorkflows().find((w) => w.id === id) ?? null;
  });

  const savedWorkflows = createMemo(() => {
    const q = search().toLowerCase();
    return allWorkflows()
      .filter((w) => !w.isTemplate)
      .filter(
        (w) =>
          !q ||
          w.name.toLowerCase().includes(q) ||
          w.description.toLowerCase().includes(q) ||
          w.tags.some((t) => t.toLowerCase().includes(q)),
      )
      .sort((a, b) => b.updatedAt - a.updatedAt);
  });

  const templates = createMemo(() => {
    const q = search().toLowerCase();
    return allWorkflows()
      .filter((w) => w.isTemplate)
      .filter(
        (w) =>
          !q ||
          w.name.toLowerCase().includes(q) ||
          w.description.toLowerCase().includes(q) ||
          w.tags.some((t) => t.toLowerCase().includes(q)),
      )
      .sort((a, b) => b.updatedAt - a.updatedAt);
  });

  const handleDelete = async (id: string, name: string) => {
    const ok = await confirmAction(`确定删除「${name}」？此操作不可恢复。`, {
      title: "删除工作流",
      kind: "warning",
      okLabel: "删除",
      cancelLabel: "取消",
    });
    if (!ok) return;
    deleteWorkflow(id);
    refresh();
  };

  const handleDuplicate = (id: string) => {
    try {
      duplicateWorkflow(id);
    } catch (error) {
      alert(error instanceof Error ? error.message : "复制失败");
    }
    refresh();
  };

  const handleCreateFromTemplate = (templateId: string, templateName: string) => {
    const name = prompt("新工作流名称:", `基于 ${templateName}`);
    if (!name) return;
    let wf;
    try {
      wf = createFromTemplate(templateId, name);
    } catch (error) {
      alert(error instanceof Error ? error.message : "创建失败");
      return;
    }
    if (wf) props.onOpenWorkflow(wf.id);
  };

  const handleSaveAsTemplate = (id: string) => {
    const wf = allWorkflows().find((w) => w.id === id);
    if (!wf) return;
    try {
      createWorkflow(`${wf.name} (模板)`, structuredClone(wf.flowData) as FlowSnapshot, {
        description: wf.description,
        isTemplate: true,
        tags: [...wf.tags, "模板"],
      });
    } catch (error) {
      alert(error instanceof Error ? error.message : "保存模板失败");
      return;
    }
    refresh();
  };

  const fmtDate = (ts: number) => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  const fmtRelative = (ts: number) => {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "刚刚";
    if (mins < 60) return `${mins} 分钟前`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} 小时前`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} 天前`;
    return fmtDate(ts);
  };

  // ── 复用的卡片渲染 ──────────────────────────────

  const WorkflowCard = (cardProps: { wf: SavedWorkflow; mode: "current" | "saved" | "template" }) => {
    const { wf, mode } = cardProps;
    const isActive = wf.id === props.currentWorkflowId;

    return (
      <div class={`${styles.card} ${isActive ? styles.cardActive : ""}`}>
        <div class={styles.cardThumb}>
          <Show when={wf.thumbnail} fallback={
            <div class={styles.cardThumbPlaceholder}>
              <span>{wf.isTemplate ? "📋" : "🔀"}</span>
              <small>{(wf.flowData.nodes ?? []).length} 个节点</small>
            </div>
          }>
            <img src={wf.thumbnail} alt={wf.name} />
          </Show>
          <Show when={isActive}>
            <span class={styles.cardBadge}>当前编辑</span>
          </Show>
        </div>

        <div class={styles.cardBody}>
          <h3 class={styles.cardName}>{wf.name}</h3>
          <Show when={wf.description}>
            <p class={styles.cardDesc}>{wf.description}</p>
          </Show>
          <div class={styles.cardMeta}>
            <span title={fmtDate(wf.updatedAt)}>🕐 {fmtRelative(wf.updatedAt)}</span>
            <span>{(wf.flowData.nodes ?? []).length} 节点 · {(wf.flowData.edges ?? []).length} 连线</span>
          </div>
          <Show when={wf.tags.length > 0}>
            <div class={styles.cardTags}>
              <For each={wf.tags}>{(t) => <span class={styles.tag}>{t}</span>}</For>
            </div>
          </Show>
        </div>

        <div class={styles.cardActions}>
          <Show when={mode === "current"}>
            <button class={`${styles.btn} ${styles.btnSm} ${styles.btnAccent}`} onClick={props.onBackToCanvas}>
              继续编辑
            </button>
          </Show>
          <Show when={mode === "saved"}>
            <button
              class={`${styles.btn} ${styles.btnSm} ${styles.btnAccent}`}
              onClick={() => props.onOpenWorkflow(wf.id)}
            >
              {isActive ? "继续编辑" : "打开"}
            </button>
            <button class={`${styles.btn} ${styles.btnSm}`} onClick={() => handleSaveAsTemplate(wf.id)} title="保存为模板">
              📋
            </button>
          </Show>
          <Show when={mode === "template"}>
            <button
              class={`${styles.btn} ${styles.btnSm} ${styles.btnPrimary}`}
              onClick={() => handleCreateFromTemplate(wf.id, wf.name)}
            >
              使用模板
            </button>
          </Show>
          <button class={`${styles.btn} ${styles.btnSm}`} onClick={() => handleDuplicate(wf.id)} title="复制">
            📄
          </button>
          <button class={`${styles.btn} ${styles.btnSm} ${styles.btnDanger}`} onClick={() => void handleDelete(wf.id, wf.name)} title="删除">
            🗑
          </button>
        </div>
      </div>
    );
  };

  // ── Render ───────────────────────────────────────

  return (
    <div class={styles.page}>
      {/* ── 顶栏 ── */}
      <header class={styles.header}>
        <div class={styles.headerLeft}>
          <span class={styles.headerIcon}>🤖</span>
          <h1 class={styles.headerTitle}>AI Workflow 门户</h1>
        </div>
        <div class={styles.headerActions}>
          <input
            class={styles.search}
            type="text"
            placeholder="搜索工作流 / 模板..."
            value={search()}
            onInput={(e) => setSearch(e.currentTarget.value)}
          />
          <button class={`${styles.btn} ${styles.btnPrimary}`} onClick={props.onNewWorkflow}>
            ＋ 新建工作流
          </button>
        </div>
      </header>

      {/* ── 三列内容 ── */}
      <div class={styles.columns}>
        {/* ── 第 1 列：当前工作流 ── */}
        <section class={styles.column}>
          <h2 class={styles.columnTitle}>
            <span class={styles.columnIcon}>🎯</span> 当前工作流
          </h2>
          <div class={styles.columnBody}>
            <Show
              when={currentWorkflow() || props.currentIsUnsaved}
              fallback={
                <div class={styles.empty}>
                  <span class={styles.emptyIcon}>🖊️</span>
                  <p>暂无正在编辑的工作流</p>
                  <button class={`${styles.btn} ${styles.btnPrimary}`} onClick={props.onNewWorkflow}>
                    新建工作流
                  </button>
                </div>
              }
            >
              <Show
                when={currentWorkflow()}
                fallback={
                  <div class={`${styles.card} ${styles.cardActive}`}>
                    <div class={styles.cardThumb}>
                      <div class={styles.cardThumbPlaceholder}>
                        <span>📝</span>
                        <small>未保存草稿</small>
                      </div>
                      <span class={styles.cardBadge}>当前编辑</span>
                    </div>
                    <div class={styles.cardBody}>
                      <h3 class={styles.cardName}>{props.currentWorkflowName || "未命名工作流"}</h3>
                      <p class={styles.cardDesc}>尚未保存到工作流列表</p>
                      <div class={styles.cardMeta}>
                        <span>🕐 草稿会话</span>
                        <span>未保存</span>
                      </div>
                    </div>
                    <div class={styles.cardActions}>
                      <button class={`${styles.btn} ${styles.btnSm} ${styles.btnAccent}`} onClick={props.onBackToCanvas}>
                        继续编辑
                      </button>
                    </div>
                  </div>
                }
              >
                {(wf) => <WorkflowCard wf={wf()} mode="current" />}
              </Show>
            </Show>
          </div>
        </section>

        {/* ── 第 2 列：已保存工作流 ── */}
        <section class={styles.column}>
          <h2 class={styles.columnTitle}>
            <span class={styles.columnIcon}>📂</span> 已保存工作流
            <span class={styles.columnCount}>{savedWorkflows().length}</span>
          </h2>
          <div class={styles.columnBody}>
            <Show
              when={savedWorkflows().length > 0}
              fallback={
                <div class={styles.empty}>
                  <span class={styles.emptyIcon}>📂</span>
                  <p>{search() ? "未找到匹配的工作流" : "暂无保存的工作流"}</p>
                </div>
              }
            >
              <For each={savedWorkflows()}>
                {(wf) => <WorkflowCard wf={wf} mode="saved" />}
              </For>
            </Show>
          </div>
        </section>

        {/* ── 第 3 列：模板 ── */}
        <section class={styles.column}>
          <h2 class={styles.columnTitle}>
            <span class={styles.columnIcon}>📋</span> 模板
            <span class={styles.columnCount}>{templates().length}</span>
          </h2>
          <div class={styles.columnBody}>
            <Show
              when={templates().length > 0}
              fallback={
                <div class={styles.empty}>
                  <span class={styles.emptyIcon}>📋</span>
                  <p>暂无模板</p>
                  <small>可将已保存的工作流转为模板</small>
                </div>
              }
            >
              <For each={templates()}>
                {(wf) => <WorkflowCard wf={wf} mode="template" />}
              </For>
            </Show>
          </div>
        </section>
      </div>
    </div>
  );
};

export default AIPortal;
