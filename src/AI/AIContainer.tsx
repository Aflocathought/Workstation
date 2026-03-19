/**
 * AI Workflow 容器
 *
 * 负责在「门户」和「画布编辑器」之间切换，
 * 管理工作流文件的打开 / 保存 / 自动保存 / 关闭守卫。
 */

import "@dschz/solid-flow/styles";
import "./workflow/workflow.css";

import {
  createSignal,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { SolidFlowProvider } from "@dschz/solid-flow";

import AIPortal from "./AIPortal";
import AIPage from "./AIPage";
import {
  getWorkflow,
  createWorkflow,
  updateWorkflow,
  writeAutosave,
  readAutosave,
  clearAutosave,
  setLastOpenedId,
  getLastOpenedId,
  pushTimelineSnapshot,
  type FlowSnapshot,
} from "./workflow/workflow-store";
import { captureWorkflowThumbnail } from "./workflow/screenshot";
import { confirmAction } from "../core/ui/confirm";

// ─── View 状态 ───────────────────────────────────────────

export type AIView = "portal" | "canvas";

// ─── Component ───────────────────────────────────────────

const AIContainer = () => {
  const [view, setView] = createSignal<AIView>("portal");
  const [currentId, setCurrentId] = createSignal<string | null>(null);
  const [currentName, setCurrentName] = createSignal<string>("未命名工作流");
  const [hasDraftSession, setHasDraftSession] = createSignal(false);
  const [isDirty, setIsDirty] = createSignal(false);
  const [showSaveDialog, setShowSaveDialog] = createSignal(false);
  const [saveDialogName, setSaveDialogName] = createSignal("");
  /** 临时回调：保存对话框确认后要执行的后续动作 */
  const [pendingAction, setPendingAction] = createSignal<(() => void) | null>(null);

  /** 当前画布快照（由 AIPage 上报） */
  let latestSnapshot: FlowSnapshot | null = null;
  /** 最近一次截图 base64（由 AIPage 上报） */
  let latestThumbnail: string | null = null;

  const handleThumbnailCaptured = (dataUrl: string) => {
    latestThumbnail = dataUrl;
  };

  // ── 初始化：检查自动保存恢复 ─────────────────────

  onMount(async () => {
    const autosave = readAutosave();
    if (autosave) {
      const shouldRestore = await confirmAction("检测到未保存的工作流，是否恢复？", {
        title: "恢复未保存工作流",
        kind: "warning",
        okLabel: "恢复",
        cancelLabel: "忽略",
      });
      if (shouldRestore) {
        if (autosave.workflowId) {
          setCurrentId(autosave.workflowId);
          const wf = getWorkflow(autosave.workflowId);
          if (wf) setCurrentName(wf.name);
          setHasDraftSession(false);
        } else {
          setCurrentId(null);
          setCurrentName("未命名工作流");
          setHasDraftSession(true);
        }
        latestSnapshot = autosave.flowData;
        setView("canvas");
        setIsDirty(true);
        clearAutosave();
        return;
      }
      clearAutosave();
    }

    // 无自动恢复 → 打开门户
    const lastId = getLastOpenedId();
    if (lastId && getWorkflow(lastId)) {
      setCurrentId(lastId);
      const wf = getWorkflow(lastId);
      if (wf) setCurrentName(wf.name);
      setHasDraftSession(false);
    }
  });

  // ── 页面关闭前守卫 ───────────────────────────────

  const beforeUnloadHandler = (e: BeforeUnloadEvent) => {
    if (isDirty()) {
      e.preventDefault();
      // 写入自动保存以防万一
      if (latestSnapshot) {
        writeAutosave(currentId(), latestSnapshot);
      }
    }
  };

  onMount(() => window.addEventListener("beforeunload", beforeUnloadHandler));
  onCleanup(() => window.removeEventListener("beforeunload", beforeUnloadHandler));

  // ── 自动保存定时器（每 30 秒） ───────────────────

  const autosaveInterval = setInterval(() => {
    if (isDirty() && latestSnapshot) {
      writeAutosave(currentId(), latestSnapshot);
    }
  }, 30_000);
  onCleanup(() => clearInterval(autosaveInterval));

  // ── 快照上报 (AIPage 每次变化都调用) ─────────────

  const handleFlowChange = (snapshot: FlowSnapshot) => {
    latestSnapshot = snapshot;
    if (!currentId()) {
      setHasDraftSession(true);
    }
    if (!isDirty()) setIsDirty(true);
  };

  // ── 保存 ─────────────────────────────────────────

  const doSave = (name?: string) => {
    const baseSnapshot = latestSnapshot ?? (() => {
      const id = currentId();
      if (!id) return null;
      return getWorkflow(id)?.flowData ?? null;
    })();
    if (!baseSnapshot) return;

    const id = currentId();
    if (id) {
      try {
        updateWorkflow(id, {
          flowData: baseSnapshot,
          ...(name ? { name } : {}),
          ...(latestThumbnail ? { thumbnail: latestThumbnail } : {}),
        });
        // 保存时推入时间线快照
        pushTimelineSnapshot(id, baseSnapshot, `保存`, latestThumbnail ?? undefined);
      } catch (error) {
        alert(error instanceof Error ? error.message : "保存失败");
        return;
      }
    } else {
      const finalName = name ?? currentName() ?? "未命名工作流";
      let wf;
      try {
        wf = createWorkflow(finalName, baseSnapshot, {
          thumbnail: latestThumbnail ?? undefined,
        });
      } catch (error) {
        alert(error instanceof Error ? error.message : "保存失败");
        return;
      }
      setCurrentId(wf.id);
      setCurrentName(wf.name);
      setLastOpenedId(wf.id);
      setHasDraftSession(false);
      // 新建后也推入时间线
      pushTimelineSnapshot(wf.id, baseSnapshot, `首次保存`, latestThumbnail ?? undefined);
    }

    setIsDirty(false);
    clearAutosave();
  };

  /** Ctrl+S 快捷键 */
  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      if (currentId()) {
        doSave();
      } else {
        promptSaveAs();
      }
    }
  };

  onMount(() => window.addEventListener("keydown", handleKeyDown));
  onCleanup(() => window.removeEventListener("keydown", handleKeyDown));

  // ── 另存为 / 首次保存 ────────────────────────────

  const promptSaveAs = (thenAction?: () => void) => {
    setSaveDialogName(currentName());
    setPendingAction(() => thenAction ?? null);
    setShowSaveDialog(true);
  };

  const confirmSaveDialog = () => {
    const name = saveDialogName().trim() || "未命名工作流";
    doSave(name);
    setShowSaveDialog(false);

    const action = pendingAction();
    setPendingAction(null);
    if (action) action();
  };

  const cancelSaveDialog = () => {
    setShowSaveDialog(false);
    setPendingAction(null);
  };

  // ── 导航守卫 ─────────────────────────────────────

  const guardedNavigate = async (action: () => void) => {
    if (!isDirty()) {
      action();
      return;
    }
    const choice = await confirmAction("当前工作流有未保存的修改，是否先保存再离开？", {
      title: "未保存更改",
      kind: "warning",
      okLabel: "保存并离开",
      cancelLabel: "放弃修改",
    });
    if (choice) {
      if (currentId()) {
        doSave();
        action();
      } else {
        promptSaveAs(action);
      }
    } else {
      setIsDirty(false);
      clearAutosave();
      action();
    }
  };

  // ── Portal 回调 ──────────────────────────────────

  const handleOpenWorkflow = async (id: string) => {
    await guardedNavigate(() => {
      const wf = getWorkflow(id);
      if (!wf) return;
      setCurrentId(id);
      setCurrentName(wf.name);
      setLastOpenedId(id);
      latestSnapshot = wf.flowData;
      setHasDraftSession(false);
      setIsDirty(false);
      setView("canvas");
    });
  };

  const handleNewWorkflow = async () => {
    await guardedNavigate(() => {
      setCurrentId(null);
      setCurrentName("未命名工作流");
      latestSnapshot = null;
      setHasDraftSession(true);
      setIsDirty(false);
      setView("canvas");
    });
  };

  const handleBackToCanvas = () => {
    setView("canvas");
  };

  const handleBackToPortal = async () => {
    // 离开画布前截图
    const thumb = await captureWorkflowThumbnail();
    if (thumb) {
      latestThumbnail = thumb;
      // 如果有已保存的工作流，立即更新缩略图
      const id = currentId();
      if (id) {
        try { updateWorkflow(id, { thumbnail: thumb }); } catch { /* ignore */ }
      }
    }
    // 离开画布前自动保存一次快照到 autosave
    if (isDirty() && latestSnapshot) {
      writeAutosave(currentId(), latestSnapshot);
    }
    setView("portal");
  };

  // ── 画布内保存按钮 ──────────────────────────────

  const handleSaveFromCanvas = () => {
    if (currentId()) {
      doSave();
    } else {
      promptSaveAs();
    }
  };

  const handleSaveAs = () => {
    setSaveDialogName(currentName());
    setPendingAction(null);
    // 另存为：总是创建新的
    const doSaveAs = () => {
      const name = saveDialogName().trim() || "未命名工作流";
      if (!latestSnapshot) return;
      let wf;
      try {
        wf = createWorkflow(name, latestSnapshot);
      } catch (error) {
        alert(error instanceof Error ? error.message : "另存为失败");
        return;
      }
      setCurrentId(wf.id);
      setCurrentName(wf.name);
      setLastOpenedId(wf.id);
      setHasDraftSession(false);
      setIsDirty(false);
      clearAutosave();
      setShowSaveDialog(false);
    };
    setPendingAction(() => doSaveAs);
    setShowSaveDialog(true);
  };

  // ── 获取初始 flowData（给 AIPage 加载用） ────────

  const getInitialFlowData = (): FlowSnapshot | null => {
    if (latestSnapshot) return latestSnapshot;
    const id = currentId();
    if (id) {
      const wf = getWorkflow(id);
      return wf?.flowData ?? null;
    }
    return null;
  };

  // ── Render ───────────────────────────────────────

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", "flex-direction": "column" }}>
      {/* 保存对话框 */}
      <Show when={showSaveDialog()}>
        <div class="wf-save-dialog-overlay" onClick={cancelSaveDialog}>
          <div class="wf-save-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>保存工作流</h3>
            <p>请输入工作流名称：</p>
            <input
              class="wf-save-dialog__input"
              type="text"
              value={saveDialogName()}
              onInput={(e) => setSaveDialogName(e.currentTarget.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { const action = pendingAction(); action ? action() : confirmSaveDialog(); } }}
              autofocus
            />
            <div class="wf-save-dialog__buttons">
              <button class="wf-btn" onClick={cancelSaveDialog}>取消</button>
              <button class="wf-btn wf-btn--primary" onClick={() => { const action = pendingAction(); action ? action() : confirmSaveDialog(); }}>
                保存
              </button>
            </div>
          </div>
        </div>
      </Show>

      {/* 门户视图 */}
      <Show when={view() === "portal"}>
        <AIPortal
          currentWorkflowId={currentId()}
          currentWorkflowName={currentName()}
          currentIsUnsaved={currentId() === null && hasDraftSession()}
          onOpenWorkflow={handleOpenWorkflow}
          onNewWorkflow={handleNewWorkflow}
          onBackToCanvas={handleBackToCanvas}
        />
      </Show>

      {/* 画布编辑器视图 */}
      <Show when={view() === "canvas"}>
        <SolidFlowProvider>
          <AIPage
            initialFlowData={getInitialFlowData()}
            workflowName={currentName()}
            workflowId={currentId()}
            isDirty={isDirty()}
            onFlowChange={handleFlowChange}
            onSave={handleSaveFromCanvas}
            onSaveAs={handleSaveAs}
            onBackToPortal={handleBackToPortal}
            onThumbnailCaptured={handleThumbnailCaptured}
          />
        </SolidFlowProvider>
      </Show>
    </div>
  );
};

export default AIContainer;
