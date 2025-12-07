import { Component, Show, type Accessor, onMount, onCleanup } from 'solid-js';
import { type SetStoreFunction } from 'solid-js/store';
import styles from './AddEventForm.module.css';

export interface EventFormData {
  title: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  description: string;
  location: string;
  allDay: boolean;
}

export interface AddEventFormProps {
  show: Accessor<boolean>;
  loading: Accessor<boolean>;
  form: () => EventFormData;
  setForm: SetStoreFunction<EventFormData>;
  onSubmit: () => Promise<void>;
  onCancel: () => void;
}

const AddEventForm: Component<AddEventFormProps> = (props) => {
  const form = props.form;
  const setForm = props.setForm;

  // 点击遮罩层关闭模态框
  const handleOverlayClick = (e: MouseEvent) => {
    if (e.target === e.currentTarget) {
      props.onCancel();
    }
  };

  // ESC 键关闭模态框
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && props.show() && !props.loading()) {
      props.onCancel();
    }
  };

  onMount(() => {
    document.addEventListener('keydown', handleKeyDown);
  });

  onCleanup(() => {
    document.removeEventListener('keydown', handleKeyDown);
  });

  return (
    <Show when={props.show()}>
      <div class={styles.modalOverlay} onClick={handleOverlayClick}>
        <div class={styles.modalContainer}>
          <div class={styles.modalContent}>
            <h3 class={styles.formTitle}>创建新事件</h3>
            <div class={styles.formRow}>
              <div class={styles.formGroup}>
                <label class={styles.label}>标题 *</label>
                <input
                  type="text"
                  class={styles.input}
                  placeholder="例如：团队会议"
                  value={form().title}
                  onInput={(e) => setForm('title', e.currentTarget.value)}
                />
              </div>
              <div class={styles.formGroup}>
                <label class={styles.label}>地点</label>
                <input
                  type="text"
                  class={styles.input}
                  placeholder="例如：会议室 A"
                  value={form().location}
                  onInput={(e) => setForm('location', e.currentTarget.value)}
                />
              </div>
            </div>

            <div class={styles.formRow}>
              <div class={styles.formGroup}>
                <label class={styles.label}>开始日期 *</label>
                <input
                  type="date"
                  class={styles.input}
                  value={form().startDate}
                  onInput={(e) => {
                    setForm('startDate', e.currentTarget.value);
                    // 如果结束日期为空或早于新的开始日期，则同步
                    if (!form().endDate || new Date(form().endDate) < new Date(e.currentTarget.value)) {
                      setForm('endDate', e.currentTarget.value);
                    }
                  }}
                />
              </div>

              <Show when={!form().allDay}>
                <div class={styles.formGroup}>
                  <label class={styles.label}>开始时间</label>
                  <input
                    type="time"
                    class={styles.input}
                    value={form().startTime}
                    onInput={(e) => setForm('startTime', e.currentTarget.value)}
                  />
                </div>
              </Show>
            </div>

            <div class={styles.formRow}>
              <div class={styles.formGroup}>
                <label class={styles.label}>结束日期</label>
                <input
                  type="date"
                  class={styles.input}
                  value={form().endDate}
                  onInput={(e) => setForm('endDate', e.currentTarget.value)}
                />
              </div>

              <Show when={!form().allDay}>
                <div class={styles.formGroup}>
                  <label class={styles.label}>结束时间</label>
                  <input
                    type="time"
                    class={styles.input}
                    value={form().endTime}
                    onInput={(e) => setForm('endTime', e.currentTarget.value)}
                  />
                </div>
              </Show>
            </div>

            <div class={styles.formGroup}>
              <label class={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={form().allDay}
                  onChange={(e) => setForm('allDay', e.currentTarget.checked)}
                />
                全天事件
              </label>
            </div>

            <div class={styles.formGroup}>
              <label class={styles.label}>描述</label>
              <textarea
                class={styles.textarea}
                rows="4"
                placeholder="添加事件详情、议程或备注"
                value={form().description}
                onInput={(e) => setForm('description', e.currentTarget.value)}
              ></textarea>
            </div>

            <div class={styles.formActions}>
              <button
                class={styles.cancelButton}
                onClick={props.onCancel}
                disabled={props.loading()}
              >
                取消
              </button>
              <button
                class={styles.submitButton}
                onClick={props.onSubmit}
                disabled={props.loading()}
              >
                {props.loading() ? '创建中...' : '创建事件'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Show>
  );
};

export default AddEventForm;
