// src/Tools/PDFLibrary/TagManager.tsx
import { Component, createSignal, onMount, For, Show } from 'solid-js';
import { pdfLibraryService } from './PDFLibraryService';
import type { Category, Tag } from './types';
import { confirmAction } from '../../core/ui/confirm';
import styles from './TagManager.module.css';

interface TagManagerProps {
  onBack?: () => void;
}

type ManagerSection = 'categories' | 'tags';

interface ImportedCategory {
  name: string;
  icon?: string;
  color?: string;
  displayOrder?: number;
}

interface CategoryImportPayload {
  version?: number;
  categories: ImportedCategory[];
}

const DEFAULT_ACCENT_COLOR = '#4CAF50';
const DEFAULT_CATEGORY_ICON = '📁';

/**
 * 分类 & 标签管理器页面
 * 用于统一管理 PDFLibrary 的分类和标签体系
 */
const TagManager: Component<TagManagerProps> = (props) => {
  const [activeSection, setActiveSection] = createSignal<ManagerSection>('categories');
  const [tags, setTags] = createSignal<Tag[]>([]);
  const [categories, setCategories] = createSignal<Category[]>([]);
  const [isLoading, setIsLoading] = createSignal(true);

  // 标签状态
  const [editingTag, setEditingTag] = createSignal<Tag | null>(null);
  const [newTagName, setNewTagName] = createSignal('');
  const [showAddTagDialog, setShowAddTagDialog] = createSignal(false);

  // 标签表单字段
  const [editName, setEditName] = createSignal('');
  const [editColor, setEditColor] = createSignal('');
  const [editParentId, setEditParentId] = createSignal<number | null>(null);
  const [editAliases, setEditAliases] = createSignal('');

  // 分类状态
  const [editingCategory, setEditingCategory] = createSignal<Category | null>(null);
  const [newCategoryName, setNewCategoryName] = createSignal('');
  const [newCategoryIcon, setNewCategoryIcon] = createSignal(DEFAULT_CATEGORY_ICON);
  const [newCategoryColor, setNewCategoryColor] = createSignal(DEFAULT_ACCENT_COLOR);
  const [showAddCategoryDialog, setShowAddCategoryDialog] = createSignal(false);
  const [editCategoryName, setEditCategoryName] = createSignal('');
  const [editCategoryIcon, setEditCategoryIcon] = createSignal('');
  const [editCategoryColor, setEditCategoryColor] = createSignal(DEFAULT_ACCENT_COLOR);

  let categoryImportInput: HTMLInputElement | undefined;

  onMount(async () => {
    await loadManagerData();
  });

  const loadManagerData = async () => {
    try {
      setIsLoading(true);
      const [allTags, allCategories] = await Promise.all([
        pdfLibraryService.getAllTags(),
        pdfLibraryService.getAllCategories(),
      ]);
      setTags(allTags);
      setCategories(allCategories);
    } catch (error) {
      console.error('加载分类/标签失败:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const reloadTags = async () => {
    const allTags = await pdfLibraryService.getAllTags();
    setTags(allTags);
  };

  const reloadCategories = async () => {
    const allCategories = await pdfLibraryService.getAllCategories();
    setCategories(allCategories);
  };

  const normalizeCategoryName = (name: string) => name.trim().toLocaleLowerCase();

  const parseImportedCategories = (parsed: unknown): ImportedCategory[] => {
    const payload = parsed as CategoryImportPayload | ImportedCategory[];

    if (!Array.isArray(payload) && typeof payload === 'object' && payload && 'version' in payload) {
      const version = (payload as CategoryImportPayload).version;
      if (version !== undefined && version !== 1) {
        throw new Error(`不支持的分类文件版本: ${version}`);
      }
    }

    const rawCategories: unknown[] | null = Array.isArray(payload)
      ? (payload as unknown[])
      : Array.isArray((payload as CategoryImportPayload)?.categories)
        ? ((payload as CategoryImportPayload).categories as unknown[])
        : null;

    if (!rawCategories) {
      throw new Error('文件格式不正确，缺少 categories 数组');
    }

    return rawCategories
      .map((item, index) => {
        if (!item || typeof item !== 'object') {
          throw new Error(`第 ${index + 1} 条分类记录格式不正确`);
        }

        const entry = item as Record<string, unknown>;
        const name = typeof entry.name === 'string' ? entry.name.trim() : '';
        if (!name) {
          throw new Error(`第 ${index + 1} 条分类记录缺少名称`);
        }

        return {
          name,
          icon: typeof entry.icon === 'string' ? entry.icon : undefined,
          color: typeof entry.color === 'string' ? entry.color : undefined,
          displayOrder: typeof entry.displayOrder === 'number' ? entry.displayOrder : undefined,
        } satisfies ImportedCategory;
      })
      .sort((left, right) => (left.displayOrder ?? Number.MAX_SAFE_INTEGER) - (right.displayOrder ?? Number.MAX_SAFE_INTEGER));
  };

  const handleEditTag = (tag: Tag) => {
    setEditingTag(tag);
    setEditName(tag.name);
    setEditColor(tag.color || DEFAULT_ACCENT_COLOR);
    setEditParentId(tag.parentId || null);
    setEditAliases(tag.aliases || '');
  };

  const handleSaveTag = async () => {
    const tag = editingTag();
    if (!tag) return;

    const nextName = editName().trim();
    if (!nextName) {
      alert('标签名称不能为空');
      return;
    }

    const currentParentId = tag.parentId ?? null;
    const nextAliases = editAliases().trim();

    try {
      await pdfLibraryService.updateTag(
        tag.id,
        nextName !== tag.name ? nextName : undefined,
        editColor() !== (tag.color || DEFAULT_ACCENT_COLOR) ? editColor() : undefined,
        editParentId() !== currentParentId ? editParentId() : undefined,
        nextAliases !== (tag.aliases || '') ? (nextAliases || null) : undefined
      );
      await reloadTags();
      setEditingTag(null);
    } catch (error) {
      console.error('更新标签失败:', error);
      alert('更新标签失败: ' + error);
    }
  };

  const handleDeleteTag = async (tag: Tag) => {
    const ok = await confirmAction(`确定要删除标签 "${tag.name}" 吗？这将同时移除所有书籍的此标签。`, {
      title: '删除标签',
      kind: 'warning',
      okLabel: '删除',
      cancelLabel: '取消',
    });
    if (!ok) {
      return;
    }

    try {
      await pdfLibraryService.deleteTag(tag.id);
      await reloadTags();
    } catch (error) {
      console.error('删除标签失败:', error);
      alert('删除标签失败: ' + error);
    }
  };

  const handleAddTag = async () => {
    const name = newTagName().trim();
    if (!name) return;

    try {
      await pdfLibraryService.createTag(name, DEFAULT_ACCENT_COLOR);
      setNewTagName('');
      setShowAddTagDialog(false);
      await reloadTags();
    } catch (error) {
      console.error('创建标签失败:', error);
      alert('创建标签失败: ' + error);
    }
  };

  const handleEditCategory = (category: Category) => {
    setEditingCategory(category);
    setEditCategoryName(category.name);
    setEditCategoryIcon(category.icon || '');
    setEditCategoryColor(category.color || DEFAULT_ACCENT_COLOR);
  };

  const handleSaveCategory = async () => {
    const category = editingCategory();
    if (!category) return;

    const nextName = editCategoryName().trim();
    if (!nextName) {
      alert('分类名称不能为空');
      return;
    }

    try {
      await pdfLibraryService.updateCategory(
        category.id,
        nextName !== category.name ? nextName : undefined,
        editCategoryIcon() !== (category.icon || '') ? editCategoryIcon().trim() : undefined,
        editCategoryColor() !== (category.color || DEFAULT_ACCENT_COLOR) ? editCategoryColor() : undefined,
      );
      await reloadCategories();
      setEditingCategory(null);
    } catch (error) {
      console.error('更新分类失败:', error);
      alert('更新分类失败: ' + error);
    }
  };

  const handleDeleteCategory = async (category: Category) => {
    const ok = await confirmAction(`确定要删除分类 "${category.name}" 吗？已关联书籍会自动变为未分类。`, {
      title: '删除分类',
      kind: 'warning',
      okLabel: '删除',
      cancelLabel: '取消',
    });
    if (!ok) {
      return;
    }

    try {
      await pdfLibraryService.deleteCategory(category.id);
      await reloadCategories();
    } catch (error) {
      console.error('删除分类失败:', error);
      alert('删除分类失败: ' + error);
    }
  };

  const handleAddCategory = async () => {
    const name = newCategoryName().trim();
    if (!name) {
      alert('分类名称不能为空');
      return;
    }

    try {
      await pdfLibraryService.createCategory(
        name,
        newCategoryIcon().trim() || undefined,
        newCategoryColor(),
      );
      setNewCategoryName('');
      setNewCategoryIcon(DEFAULT_CATEGORY_ICON);
      setNewCategoryColor(DEFAULT_ACCENT_COLOR);
      setShowAddCategoryDialog(false);
      await reloadCategories();
    } catch (error) {
      console.error('创建分类失败:', error);
      alert('创建分类失败: ' + error);
    }
  };

  const exportCategories = () => {
    const payload: CategoryImportPayload & { exportedAt: string } = {
      version: 1,
      exportedAt: new Date().toISOString(),
      categories: categories().map(category => ({
        name: category.name,
        icon: category.icon,
        color: category.color,
        displayOrder: category.displayOrder,
      })),
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateSuffix = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `pdf-library-categories-${dateSuffix}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const triggerCategoryImport = () => {
    categoryImportInput?.click();
  };

  const handleImportCategories = async (event: Event) => {
    const input = event.currentTarget as HTMLInputElement | null;
    if (!input?.files || input.files.length === 0) {
      return;
    }

    try {
      const file = input.files[0];
      const text = await file.text();
      const parsed = JSON.parse(text);
      const importedCategories = parseImportedCategories(parsed);
      const existingByName = new Map(categories().map(category => [normalizeCategoryName(category.name), category]));
      const processedNames = new Set<string>();

      let createdCount = 0;
      let updatedCount = 0;
      let skippedCount = 0;

      for (const importedCategory of importedCategories) {
        const normalizedName = normalizeCategoryName(importedCategory.name);
        if (processedNames.has(normalizedName)) {
          skippedCount += 1;
          continue;
        }

        processedNames.add(normalizedName);
        const existing = existingByName.get(normalizedName);

        if (!existing) {
          await pdfLibraryService.createCategory(
            importedCategory.name,
            importedCategory.icon?.trim() || undefined,
            importedCategory.color || DEFAULT_ACCENT_COLOR,
          );
          createdCount += 1;
          continue;
        }

        const nextName = importedCategory.name;
        const nextIcon = importedCategory.icon;
        const nextColor = importedCategory.color;
        const hasNameChange = nextName !== existing.name;
        const hasIconChange = nextIcon !== undefined && nextIcon !== (existing.icon || '');
        const hasColorChange = nextColor !== undefined && nextColor !== existing.color;

        if (!hasNameChange && !hasIconChange && !hasColorChange) {
          skippedCount += 1;
          continue;
        }

        await pdfLibraryService.updateCategory(
          existing.id,
          hasNameChange ? nextName : undefined,
          hasIconChange ? nextIcon : undefined,
          hasColorChange ? nextColor : undefined,
        );
        updatedCount += 1;
      }

      await reloadCategories();
      alert(`分类导入完成：新增 ${createdCount}，更新 ${updatedCount}，跳过 ${skippedCount}`);
    } catch (error) {
      console.error('导入分类失败:', error);
      alert('导入分类失败: ' + ((error as Error).message || error));
    } finally {
      input.value = '';
    }
  };

  const getParentTag = (parentId?: number) => {
    if (!parentId) return null;
    return tags().find(t => t.id === parentId);
  };

  const openCreateDialog = () => {
    if (activeSection() === 'categories') {
      setShowAddCategoryDialog(true);
      return;
    }
    setShowAddTagDialog(true);
  };

  return (
    <div class={styles.container}>
      <div class={styles.header}>
        <div class={styles.headerLeft}>
          <Show when={props.onBack}>
            <button 
              class={styles.backButton}
              onClick={props.onBack}
            >
              ← 返回图书馆
            </button>
          </Show>
          <div class={styles.headerText}>
            <h1 class={styles.title}>分类 & 标签管理器</h1>
            <div class={styles.subtitle}>统一维护分类、标签及分类模板导入导出</div>
          </div>
        </div>

        <div class={styles.headerActions}>
          <Show when={activeSection() === 'categories'}>
            <button class={styles.secondaryButton} onClick={exportCategories}>
              导出分类
            </button>
            <button class={styles.secondaryButton} onClick={triggerCategoryImport}>
              导入分类
            </button>
            <input
              class={styles.hiddenInput}
              type="file"
              accept="application/json"
              onChange={handleImportCategories}
              ref={(element) => {
                categoryImportInput = element;
              }}
            />
          </Show>
          <button 
            class={styles.addButton}
            onClick={openCreateDialog}
          >
            {activeSection() === 'categories' ? '+ 添加分类' : '+ 添加标签'}
          </button>
        </div>
      </div>

      <div class={styles.tabBar}>
        <button
          class={styles.tabButton}
          classList={{ [styles.activeTab]: activeSection() === 'categories' }}
          onClick={() => setActiveSection('categories')}
        >
          <span>📂 分类管理</span>
          <span class={styles.tabCount}>{categories().length}</span>
        </button>
        <button
          class={styles.tabButton}
          classList={{ [styles.activeTab]: activeSection() === 'tags' }}
          onClick={() => setActiveSection('tags')}
        >
          <span>🏷️ 标签管理</span>
          <span class={styles.tabCount}>{tags().length}</span>
        </button>
      </div>

      <Show when={isLoading()}>
        <div class={styles.loading}>加载中...</div>
      </Show>

      <Show when={!isLoading()}>
        <div class={styles.content}>
          <Show when={activeSection() === 'categories'} fallback={
            <Show
              when={tags().length > 0}
              fallback={<div class={styles.emptyState}>还没有标签，先添加一个标签开始使用。</div>}
            >
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
                            onClick={() => handleEditTag(tag)}
                          >
                            ✏️ 编辑
                          </button>
                          <button 
                            class={styles.deleteButton}
                            onClick={() => handleDeleteTag(tag)}
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
          }>
            <Show
              when={categories().length > 0}
              fallback={<div class={styles.emptyState}>还没有分类，可以新建分类或从 JSON 导入。</div>}
            >
              <div class={styles.tagList}>
                <For each={categories()}>
                  {(category) => (
                    <div class={styles.tagCard}>
                      <div class={styles.tagHeader}>
                        <div class={styles.tagBadge} style={{ background: category.color || DEFAULT_ACCENT_COLOR }}>
                          <span class={styles.badgeIcon}>{category.icon || DEFAULT_CATEGORY_ICON}</span>
                          <span class={styles.tagName}>{category.name}</span>
                        </div>
                        <div class={styles.tagActions}>
                          <button
                            class={styles.editButton}
                            onClick={() => handleEditCategory(category)}
                          >
                            ✏️ 编辑
                          </button>
                          <button
                            class={styles.deleteButton}
                            onClick={() => handleDeleteCategory(category)}
                          >
                            🗑️ 删除
                          </button>
                        </div>
                      </div>

                      <div class={styles.tagInfo}>
                        <div class={styles.infoItem}>
                          <span class={styles.infoLabel}>图标:</span>
                          <span>{category.icon || '未设置'}</span>
                        </div>
                        <div class={styles.infoItem}>
                          <span class={styles.infoLabel}>颜色:</span>
                          <span class={styles.colorValue}>
                            <span
                              class={styles.colorPreview}
                              style={{ background: category.color || DEFAULT_ACCENT_COLOR }}
                            ></span>
                            {category.color || DEFAULT_ACCENT_COLOR}
                          </span>
                        </div>
                        <div class={styles.infoItem}>
                          <span class={styles.infoLabel}>顺序:</span>
                          <span>{category.displayOrder}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </Show>
        </div>
      </Show>

      {/* 编辑标签对话框 */}
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
                onClick={handleSaveTag}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      </Show>

      {/* 添加标签对话框 */}
      <Show when={showAddTagDialog()}>
        <div class={styles.modal} onClick={() => setShowAddTagDialog(false)}>
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
                onClick={() => setShowAddTagDialog(false)}
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

      {/* 编辑分类对话框 */}
      <Show when={editingCategory()}>
        <div class={styles.modal} onClick={() => setEditingCategory(null)}>
          <div class={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2 class={styles.modalTitle}>编辑分类</h2>

            <div class={styles.formGroup}>
              <label class={styles.label}>分类名称</label>
              <input
                class={styles.input}
                type="text"
                value={editCategoryName()}
                onInput={(e) => setEditCategoryName(e.currentTarget.value)}
              />
            </div>

            <div class={styles.formGroup}>
              <label class={styles.label}>图标</label>
              <input
                class={styles.input}
                type="text"
                placeholder="例如: 📚"
                value={editCategoryIcon()}
                onInput={(e) => setEditCategoryIcon(e.currentTarget.value)}
              />
            </div>

            <div class={styles.formGroup}>
              <label class={styles.label}>颜色</label>
              <input
                class={styles.colorInput}
                type="color"
                value={editCategoryColor()}
                onInput={(e) => setEditCategoryColor(e.currentTarget.value)}
              />
            </div>

            <div class={styles.modalActions}>
              <button
                class={styles.cancelButton}
                onClick={() => setEditingCategory(null)}
              >
                取消
              </button>
              <button
                class={styles.saveButton}
                onClick={handleSaveCategory}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      </Show>

      {/* 添加分类对话框 */}
      <Show when={showAddCategoryDialog()}>
        <div class={styles.modal} onClick={() => setShowAddCategoryDialog(false)}>
          <div class={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2 class={styles.modalTitle}>添加新分类</h2>

            <div class={styles.formGroup}>
              <label class={styles.label}>分类名称</label>
              <input
                class={styles.input}
                type="text"
                placeholder="输入分类名称"
                value={newCategoryName()}
                onInput={(e) => setNewCategoryName(e.currentTarget.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAddCategory()}
              />
            </div>

            <div class={styles.formGroup}>
              <label class={styles.label}>图标</label>
              <input
                class={styles.input}
                type="text"
                placeholder="例如: 📚"
                value={newCategoryIcon()}
                onInput={(e) => setNewCategoryIcon(e.currentTarget.value)}
              />
            </div>

            <div class={styles.formGroup}>
              <label class={styles.label}>颜色</label>
              <input
                class={styles.colorInput}
                type="color"
                value={newCategoryColor()}
                onInput={(e) => setNewCategoryColor(e.currentTarget.value)}
              />
            </div>

            <div class={styles.modalActions}>
              <button
                class={styles.cancelButton}
                onClick={() => setShowAddCategoryDialog(false)}
              >
                取消
              </button>
              <button
                class={styles.saveButton}
                onClick={handleAddCategory}
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
