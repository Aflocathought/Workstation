import { Component, For, Show } from "solid-js";
import {
  Box,
  Button,
  ButtonGroup,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  IconButton,
  FormControl,
  Typography,
} from "@suid/material";
import Settings from "@suid/icons-material/Settings";
import { CategoryManager } from "./CategoryManagerModel";
const CategoryManagerView: Component = () => {
  const m = CategoryManager.getInstance();

  return (
    <Box
      sx={{
        p: 2,
        border: "1px solid #eee",
        borderRadius: 1,
        bgcolor: "#fafafa",
      }}
    >
      <Typography variant="h5" align="center" sx={{ mb: 1 }}>
        应用分类管理
      </Typography>
      {/* 顶部操作 */}
      <Box sx={{ display: "flex", gap: 1, alignItems: "center", mb: 1 }}>
        {/* <Button size="小" variant="outlined" onClick={m.actions.resetDefault}>重置默认</Button> */}
        <Button size="small" variant="contained" onClick={m.actions.exportJson}>
          导出
        </Button>
        <Button
          size="small"
          variant="outlined"
          onClick={() => m.actions.triggerImport()}
        >
          导入
        </Button>
        <input
          type="file"
          accept="application/json"
          style={{ display: "none" }}
          onChange={m.actions.importJson}
          ref={(el) => m.actions.setFileInputRef(el as HTMLInputElement)}
        />
      </Box>

      <h3 style={{ margin: "12px 0 6px" }}>应用别称与项目分配</h3>

      {/* 分类筛选与新建按钮 */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          mb: 1,
          justifyContent: "space-between",
        }}
      >
        <ButtonGroup size="small">
          <For each={m.tabs()}>
            {(t) => (
              <Button
                variant={m.activeTab() === t ? "contained" : "outlined"}
                onClick={() => m.actions.setActiveTabSafe(t)}
              >
                <Show when={t !== "全部" && t !== m.UNASSIGNED}>
                  <Box
                    component="span"
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      bgcolor: m.categoryColor(t),
                      display: "inline-block",
                      mr: 1,
                    }}
                  />
                </Show>
                <Show when={t === m.UNASSIGNED}>
                  <Box
                    component="span"
                    sx={{
                      position: "relative",
                      display: "inline-flex",
                      alignItems: "center",
                      mr: 1,
                    }}
                    onClick={(e: MouseEvent) => e.stopPropagation()}
                  >
                    <Box
                      component="span"
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        bgcolor: m.cfg().specialColors?.unassigned ?? "#9E9E9E",
                        display: "inline-block",
                      }}
                    />
                    {/* hidden color input for unassigned */}
                    <input
                      type="color"
                      value={m.cfg().specialColors?.unassigned ?? "#9E9E9E"}
                      style={{
                        position: "absolute",
                        inset: 0,
                        opacity: 0,
                        cursor: "pointer",
                      }}
                      onChange={(e) =>
                        m.actions.setUnassignedColor(
                          (e.currentTarget as HTMLInputElement).value
                        )
                      }
                    />
                  </Box>
                </Show>
                {t}
                <Show when={m.activeTab() === t && m.isConcreteCategory(t)}>
                  <IconButton
                    size="small"
                    sx={{ ml: 1 }}
                    onClick={(e: MouseEvent) => {
                      e.stopPropagation();
                      m.actions.openEditCategory(t);
                    }}
                  >
                    <Settings fontSize="small" />
                  </IconButton>
                </Show>
              </Button>
            )}
          </For>
        </ButtonGroup>
        {/* 左侧未记录颜色点 + 新建按钮 */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Box
            component="span"
            sx={{
              position: "relative",
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            <Box
              component="span"
              title="未记录颜色"
              sx={{
                width: 12,
                height: 12,
                borderRadius: "50%",
                bgcolor: m.cfg().specialColors?.unrecorded ?? "#9E9E9E",
                display: "inline-block",
                cursor: "pointer",
              }}
            />
            <input
              type="color"
              value={m.cfg().specialColors?.unrecorded ?? "#9E9E9E"}
              style={{
                position: "absolute",
                inset: 0,
                opacity: 0,
                cursor: "pointer",
              }}
              onChange={(e) =>
                m.actions.setUnrecordedColor(
                  (e.currentTarget as HTMLInputElement).value
                )
              }
            />
          </Box>
          <Button
            size="small"
            variant="contained"
            color="success"
            onClick={() => m.actions.openNewCategory()}
          >
            ＋
          </Button>
        </Box>
      </Box>

      <Show
        when={m.filteredApps().length > 0}
        fallback={
          <Box sx={{ color: "#888" }}>
            暂无可编辑的应用，将在产生活动后显示。
          </Box>
        }
      >
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "1.2fr 1.2fr 1fr",
            gap: 1.5,
            alignItems: "center",
          }}
        >
          <strong>原名</strong>
          <strong>别称</strong>
          <strong>项目</strong>
          <For each={m.filteredApps()}>
            {(app: string) => (
              <>
                <span title={app}>{app}</span>
                <TextField
                  fullWidth
                  size="small"
                  placeholder="显示用别称"
                  value={m.aliasEdits()[app] || ""}
                  onChange={(e: Event) =>
                    m.actions.onAliasInput(
                      app,
                      (e.currentTarget as HTMLInputElement).value
                    )
                  }
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      height: 36,
                      "& input": { p: "8.5px 14px" },
                    },
                  }}
                />
                <FormControl
                  fullWidth
                  size="small"
                  sx={{
                    "& .MuiOutlinedInput-root": { height: 36 },
                    "& .MuiSelect-select": {
                      display: "flex",
                      alignItems: "center",
                      py: 0,
                    },
                  }}
                >
                  <Select
                    value={m.categoryEdits()[app] || ""}
                    onChange={(e: any) => {
                      const newValue = e.target?.value ?? "";
                      m.actions.onCategoryChange(app, newValue);
                    }}
                  >
                    <MenuItem value="">未分配</MenuItem>
                    <For each={m.cfg().categories}>
                      {(c) => <MenuItem value={c.name}>{c.name}</MenuItem>}
                    </For>
                  </Select>
                </FormControl>
              </>
            )}
          </For>
        </Box>
      </Show>
      {/* 分类设置弹窗（新建/编辑复用） - 始终挂载，保证随状态立刻显示 */}
      <Dialog
        open={!!m.editingCategory()}
        onClose={() => m.actions.onCancelDialog()}
      >
        <DialogTitle>
          {m.editingCategory() === "__new__" ? "新建分类" : "编辑分类"}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: "flex", gap: 1.5, alignItems: "center", mt: 1 }}>
            <TextField
              fullWidth
              size="small"
              value={m.editName()}
              placeholder="分类名称"
              onChange={(e: Event) =>
                m.actions.onEditNameChange(
                  (e.currentTarget as HTMLInputElement).value
                )
              }
              sx={{
                "& .MuiOutlinedInput-root": {
                  height: 36,
                  "& input": { p: "8.5px 14px" },
                },
              }}
            />
            <input
              type="color"
              value={m.editColor()}
              onChange={(e: Event) =>
                m.actions.onEditColorChange(
                  (e.currentTarget as HTMLInputElement).value
                )
              }
              style={{
                width: "40px",
                height: "36px",
                border: "1px solid #ddd",
                background: "transparent",
                padding: 0,
                "border-radius": "4px",
              }}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => m.actions.onCancelDialog()}>取消</Button>
          <Show when={m.editingCategory() && m.editingCategory() !== "__new__"}>
            <Button
              color="error"
              onClick={() => m.actions.onDeleteCategory(m.editingCategory()!)}
            >
              删除
            </Button>
          </Show>
          <Button
            variant="contained"
            onClick={() =>
              m.actions.onSaveCategory(m.editingCategory() || "__new__")
            }
          >
            保存
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default CategoryManagerView;
