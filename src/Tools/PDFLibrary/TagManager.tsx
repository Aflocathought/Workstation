// src/Tools/PDFLibrary/TagManager.tsx
import { Component, createSignal, onMount, For, Show } from 'solid-js';
import { pdfLibraryService } from './PDFLibraryService';
import type { Tag } from './types';
import styles from './TagManager.module.css';

interface TagManagerProps {
  onBack?: () => void;
}

/**
 * 标签管理器页面
 * 用于管理所有标签、设置父标签、别名等
 */
const TagManager: Component<TagManagerProps> = (props) => {
  const [tags, setTags] = createSignal<Tag[]>([]);
  const [isLoading, setIsLoading] = createSignal(true);
  const [editingTag, setEditingTag] = createSignal<Tag | null>(null);
  const [newTagName, setNewTagName] = createSignal('');
  const [showAddDialog, setShowAddDialog] = createSignal(false);

  // 表单字段
  const [editName, setEditName] = createSignal('');
  const [editColor, setEditColor] = createSignal('');
  const [editParentId, setEditParentId] = createSignal<number | null>(null);
  const [editAliases, setEditAliases] = createSignal('');

  onMount(async () => {
    await loadTags();
  });

  const loadTags = async () => {
    try {
      setIsLoading(true);
      const allTags = await pdfLibraryService.getAllTags();
      setTags(allTags);
    } catch (error) {
      console.error('加载标签失败:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (tag: Tag) => {
    setEditingTag(tag);
    setEditName(tag.name);
    setEditColor(tag.color || '#4CAF50');
    setEditParentId(tag.parentId || null);
    setEditAliases(tag.aliases || '');
  };

  const handleSave = async () => {
    const tag = editingTag();
    if (!tag) return;

    try {
      await pdfLibraryService.updateTag(
        tag.id,
        editName() !== tag.name ? editName() : undefined,
        editColor() !== tag.color ? editColor() : undefined,
        editParentId() !== tag.parentId ? editParentId() : undefined,
        editAliases() !== tag.aliases ? editAliases() : undefined
      );
      await loadTags();
      setEditingTag(null);
    } catch (error) {
      console.error('更新标签失败:', error);
      alert('更新标签失败: ' + error);
    }
  };

  const handleDelete = async (tag: Tag) => {
    if (!confirm(`确定要删除标签 "${tag.name}" 吗？这将同时移除所有书籍的此标签。`)) {
      return;
    }

    try {
      await pdfLibraryService.deleteTag(tag.id);
      await loadTags();
    } catch (error) {
      console.error('删除标签失败:', error);
      alert('删除标签失败: ' + error);
    }
  };

  const handleAddTag = async () => {
    const name = newTagName().trim();
    if (!name) return;

    try {
      await pdfLibraryService.createTag(name, '#4CAF50');
      setNewTagName('');
      setShowAddDialog(false);
      await loadTags();
    } catch (error) {
      console.error('创建标签失败:', error);
      alert('创建标签失败: ' + error);
    }
  };

  const getParentTag = (parentId?: number) => {
    if (!parentId) return null;
    return tags().find(t => t.id === parentId);
  };

  return (
    <div class={styles.container}>
      <div class={styles.header}>
        <Show when={props.onBack}>
          <button 
            class={styles.backButton}
            onClick={props.onBack}
          >
            ← 返回图书馆
          </button>
        </Show>
        <h1 class={styles.title}>标签管理器</h1>
        <button 
          class={styles.addButton}
          onClick={() => setShowAddDialog(true)}
        >
          + 添加标签
        </button>
      </div>

      <Show when={isLoading()}>
        <div class={styles.loading}>加载中...</div>
      </Show>

      <Show when={!isLoading()}>
        <div class={styles.tagList}>
          <For each={tags()}>
            {(tag) => (
              <div class={styles.tagCard}>
                <div class={styles.tagHeader}>
                  <div class={styles.tagBadge} style={{ background: tag.color || '#ccc' }}>
                    <span class={styles.tagName}>{tag.name}</span>
                  </div>
                  <div class={styles.tagActions}>
                    <button 
                      class={styles.editButton}
                      onClick={() => handleEdit(tag)}
                    >
                      ✏️ 编辑
                    </button>
                    <button 
                      class={styles.deleteButton}
                      onClick={() => handleDelete(tag)}
                    >
                      🗑️ 删除
                    </button>
                  </div>
                </div>
                
                <div class={styles.tagInfo}>
                  <Show when={tag.parentId}>
                    <div class={styles.infoItem}>
                      <span class={styles.infoLabel}>父标签:</span>
                      <span class={styles.parentTag}>
                        {getParentTag(tag.parentId)?.name || '未知'}
                      </span>
                    </div>
                  </Show>
                  
                  <Show when={tag.aliases}>
                    <div class={styles.infoItem}>
                      <span class={styles.infoLabel}>别名:</span>
                      <span class={styles.aliases}>{tag.aliases}</span>
                    </div>
                  </Show>
                  
                  <div class={styles.infoItem}>
                    <span class={styles.infoLabel}>书籍数量:</span>
                    <span class={styles.bookCount}>{tag.bookCount || 0}</span>
                  </div>
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>

      {/* 编辑对话框 */}
      <Show when={editingTag()}>
        <div class={styles.modal} onClick={() => setEditingTag(null)}>
          <div class={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2 class={styles.modalTitle}>编辑标签</h2>
            
            <div class={styles.formGroup}>
              <label class={styles.label}>标签名称</label>
              <input
                class={styles.input}
                type="text"
                value={editName()}
                onInput={(e) => setEditName(e.currentTarget.value)}
              />
            </div>

            <div class={styles.formGroup}>
              <label class={styles.label}>颜色</label>
              <input
                class={styles.colorInput}
                type="color"
                value={editColor()}
                onInput={(e) => setEditColor(e.currentTarget.value)}
              />
            </div>

            <div class={styles.formGroup}>
              <label class={styles.label}>父标签</label>
              <select
                class={styles.select}
                value={editParentId() || ''}
                onChange={(e) => {
                  const val = e.currentTarget.value;
                  setEditParentId(val ? parseInt(val) : null);
                }}
              >
                <option value="">无父标签</option>
                <For each={tags().filter(t => t.id !== editingTag()?.id)}>
                  {(tag) => (
                    <option value={tag.id}>{tag.name}</option>
                  )}
                </For>
              </select>
            </div>

            <div class={styles.formGroup}>
              <label class={styles.label}>别名（逗号分隔）</label>
              <input
                class={styles.input}
                type="text"
                placeholder="例如: Score,乐谱,music score"
                value={editAliases()}
                onInput={(e) => setEditAliases(e.currentTarget.value)}
              />
            </div>

            <div class={styles.modalActions}>
              <button 
                class={styles.cancelButton}
                onClick={() => setEditingTag(null)}
              >
                取消
              </button>
              <button 
                class={styles.saveButton}
                onClick={handleSave}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      </Show>

      {/* 添加标签对话框 */}
      <Show when={showAddDialog()}>
        <div class={styles.modal} onClick={() => setShowAddDialog(false)}>
          <div class={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2 class={styles.modalTitle}>添加新标签</h2>
            
            <div class={styles.formGroup}>
              <label class={styles.label}>标签名称</label>
              <input
                class={styles.input}
                type="text"
                placeholder="输入标签名称"
                value={newTagName()}
                onInput={(e) => setNewTagName(e.currentTarget.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAddTag()}
              />
            </div>

            <div class={styles.modalActions}>
              <button 
                class={styles.cancelButton}
                onClick={() => setShowAddDialog(false)}
              >
                取消
              </button>
              <button 
                class={styles.saveButton}
                onClick={handleAddTag}
              >
                添加
              </button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
};

export default TagManager;
