// src/Tools/Calendar/CalendarTool.tsx
import { Component, createSignal, onMount, Show, createEffect, createMemo } from 'solid-js';
import { createStore } from 'solid-js/store';
import { googleCalendarService, type CalendarEvent } from '../../services/GoogleCalendarService';
import styles from './CalendarTool.module.css';
import toast from 'solid-toast';
import AddEventForm, { type EventFormData, type AddEventFormProps } from './components/AddEventForm';
import EventList from './components/EventList';

/**
 * Google 官方登录按钮组件
 */
const GoogleSignInButton: Component<{ onClick: () => void; disabled: boolean }> = (props) => {
  return (
    <button
      class={styles.googleSignInButton}
      onClick={props.onClick}
      disabled={props.disabled}
    >
      <svg
        class={styles.googleIcon}
        version="1.1"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 48 48"
      >
        <path
          fill="#EA4335"
          d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
        ></path>
        <path
          fill="#4285F4"
          d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
        ></path>
        <path
          fill="#FBBC05"
          d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
        ></path>
        <path
          fill="#34A853"
          d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
        ></path>
        <path fill="none" d="M0 0h48v48H0z"></path>
      </svg>
      <span class={styles.buttonText}>Sign in with Google</span>
    </button>
  );
};

/**
 * Google Calendar 日历工具
 * 使用 Google Calendar API 直接从前端管理日历事件
 */
const CalendarTool: Component = () => {
  const [events, setEvents] = createSignal<CalendarEvent[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [isAuthorized, setIsAuthorized] = createSignal(false);
  const [showAddForm, setShowAddForm] = createSignal(false);
  const [error, setError] = createSignal<string>('');

  // 表单状态
  const [formState, setFormState] = createStore<EventFormData>({
    title: '',
    startDate: '',
    startTime: '',
    endDate: '',
    endTime: '',
    description: '',
    location: '',
    allDay: false,
  });

  // 新增：API 配置检查
  const [isConfigValid, setIsConfigValid] = createSignal(true);

  // 将事件按日期分组
  const groupedEvents = createMemo(() => {
    const groups: { [key: string]: CalendarEvent[] } = {};
    events().forEach(event => {
      const startDate = event.start?.date || event.start?.dateTime;
      if (startDate) {
        const dateKey = new Date(startDate).toLocaleDateString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        });
        if (!groups[dateKey]) {
          groups[dateKey] = [];
        }
        groups[dateKey].push(event);
      }
    });
    return Object.entries(groups).sort(([dateA], [dateB]) => new Date(dateA).getTime() - new Date(dateB).getTime());
  });

  // 分离今天和未来的事件
  const todayEvents = createMemo(() => {
    const today = new Date().toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return groupedEvents().filter(([date]) => date === today);
  });

  const futureEvents = createMemo(() => {
    const today = new Date().toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return groupedEvents().filter(([date]) => date !== today);
  });

  // 初始化 Google API
  onMount(async () => {
    try {
      // 检查 API Key 和 Client ID 是否配置
      if (!googleCalendarService.isConfigured()) {
        setError('API Key 或 Client ID 未配置。请检查 .env 文件。');
        setIsConfigValid(false);
        return;
      }

      await googleCalendarService.initGoogleAPI();
      await googleCalendarService.initGoogleIdentity();
      
      // 检查是否已授权
      setIsAuthorized(googleCalendarService.isAuthorized());
      
      if (isAuthorized()) {
        await loadEvents();
      }
    } catch (error) {
      console.error('初始化失败:', error);
      setError('初始化 Google API 失败。请检查网络连接或 API 配置。');
    }
  });

  // 当授权状态变化时加载事件
  createEffect(() => {
    if (isAuthorized()) {
      loadEvents();
    }
  });

  // 授权登录
  const handleAuthorize = async () => {
    setLoading(true);
    setError('');
    try {
      await googleCalendarService.authorize();
      setIsAuthorized(true);
      await loadEvents();
    } catch (error) {
      console.error('授权失败:', error);
      setError('授权失败。请重试。');
      toast.error('授权失败，请检查控制台获取更多信息。');
    } finally {
      setLoading(false);
    }
  };

  // 撤销授权
  const handleSignOut = async () => {
    try {
      await googleCalendarService.revokeAuthorization();
      setIsAuthorized(false);
      setEvents([]);
      toast.success('已成功登出 Google 账号。');
    } catch (error) {
      console.error('登出失败:', error);
      toast.error('登出失败。');
    }
  };

  // 加载事件
  const loadEvents = async () => {
    setLoading(true);
    setError('');
    try {
      const now = new Date();
      const future = new Date();
      future.setMonth(future.getMonth() + 3); // 加载未来3个月的事件

      const response = await googleCalendarService.listEvents(
        'primary',
        now.toISOString(),
        future.toISOString()
      );

      if (response.items) {
        setEvents(response.items);
        toast.success(`成功加载 ${response.items.length} 个事件。`);
      } else if (response.error) {
        setError('加载事件失败: ' + JSON.stringify(response.error));
        toast.error('加载事件失败。');
      }
    } catch (error: any) {
      console.error('加载事件失败:', error);
      setError('加载事件失败: ' + (error.message || error));
      toast.error('加载事件失败。');
    } finally {
      setLoading(false);
    }
  };

  // 打开新建事件表单并设置默认值
  const openAddForm = () => {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const nextHour = new Date(now.getTime() + 60 * 60 * 1000);
    const nextHourTime = nextHour.toTimeString().slice(0, 5);

    setFormState({
      title: '',
      startDate: today,
      startTime: nextHourTime,
      endDate: today,
      endTime: '',
      description: '',
      location: '',
      allDay: false,
    });
    setShowAddForm(true);
  };

  // 创建事件
  const handleCreateEvent = async () => {
    if (!formState.title || !formState.startDate) {
      setError('请填写标题和开始日期');
      toast.error('请填写标题和开始日期');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const event: CalendarEvent = {
        summary: formState.title,
        description: formState.description || undefined,
        location: formState.location || undefined,
        start: {},
        end: {},
      };

      // 处理全天事件
      if (formState.allDay) {
        event.start.date = formState.startDate;
        event.end.date = formState.endDate || formState.startDate;
      } else {
        // 处理时间事件
        const startDateTime = formState.startTime
          ? `${formState.startDate}T${formState.startTime}:00`
          : `${formState.startDate}T09:00:00`;
        
        let endDateTime: string;
        if (formState.endDate && formState.endTime) {
          endDateTime = `${formState.endDate}T${formState.endTime}:00`;
        } else if (formState.endTime) {
          endDateTime = `${formState.startDate}T${formState.endTime}:00`;
        } else {
          // 默认1小时
          const startTime = new Date(startDateTime);
          startTime.setHours(startTime.getHours() + 1);
          endDateTime = startTime.toISOString().slice(0, 19);
        }

        event.start.dateTime = startDateTime;
        event.start.timeZone = 'Asia/Shanghai';
        event.end.dateTime = endDateTime;
        event.end.timeZone = 'Asia/Shanghai';
      }

      await googleCalendarService.createEvent(event);

      // 重置表单
      setFormState({
        title: '',
        startDate: '',
        startTime: '',
        endDate: '',
        endTime: '',
        description: '',
        location: '',
        allDay: false,
      });
      setShowAddForm(false);

      // 重新加载事件
      await loadEvents();
      toast.success('事件创建成功！');
    } catch (error: any) {
      console.error('创建事件失败:', error);
      setError('创建事件失败: ' + (error.message || error));
      toast.error('创建事件失败');
    } finally {
      setLoading(false);
    }
  };

  // 删除事件
  const handleDeleteEvent = async (eventId: string) => {
    if (!eventId) return;

    if (!confirm('确定要删除这个事件吗？')) {
      return;
    }

    setLoading(true);
    try {
      await googleCalendarService.deleteEvent(eventId);
      await loadEvents();
      toast.success('事件已删除');
    } catch (error: any) {
      console.error('删除事件失败:', error);
      setError('删除事件失败: ' + (error.message || error));
      toast.error('删除事件失败');
    } finally {
      setLoading(false);
    }
  };

  // 格式化日期时间显示
  const formatDateTime = (event: CalendarEvent): string => {
    const start = event.start.dateTime || event.start.date;
    const end = event.end.dateTime || event.end.date;
    
    if (!start) return '时间未知';

    const startDate = new Date(start);
    const endDate = end ? new Date(end) : null;

    // 全天事件
    if (event.start.date) {
      // 检查结束日期是否与开始日期是同一天
      if (endDate) {
        const endClone = new Date(endDate);
        endClone.setDate(endClone.getDate() - 1); // Google 全天事件的结束日期是排他的
        if (endClone.toDateString() !== startDate.toDateString()) {
          return `${formatDate(startDate)} - ${formatDate(endClone)}`;
        }
      }
      return formatDate(startDate);
    }

    // 时间事件
    if (endDate) {
      // 检查是否跨天
      if (startDate.toDateString() !== endDate.toDateString()) {
        // 跨天事件,显示完整的开始和结束日期时间
        return `${formatDate(startDate)} ${formatTime(startDate)} - ${formatDate(endDate)} ${formatTime(endDate)}`;
      }
      // 同一天的事件,只显示一次日期
      return `${formatDate(startDate)} ${formatTime(startDate)} - ${formatTime(endDate)}`;
    }
    return `${formatDate(startDate)} ${formatTime(startDate)}`;
  };

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  };

  const getRelativeDateLabel = (dateString: string): string => {
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);
    const eventDate = new Date(dateString);

    if (eventDate.toDateString() === today.toDateString()) {
      return '今天';
    }
    if (eventDate.toDateString() === tomorrow.toDateString()) {
      return '明天';
    }
    return dateString;
  };

  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formProps: AddEventFormProps = {
    show: showAddForm,
    loading: loading,
    form: () => formState,
    setForm: setFormState,
    onSubmit: handleCreateEvent,
    onCancel: () => setShowAddForm(false),
  };

  return (
    <div class={styles.container}>
      {/* 标题栏 */}
      <div class={styles.header}>
        <div>
          <h2 class={styles.title}>📅 Google Calendar</h2>
          <p class={styles.description}>
            连接你的 Google 日历，管理你的日程安排
          </p>
        </div>

        {/* 授权按钮 */}
        <div class={styles.headerActions}>
          <Show
            when={isAuthorized()}
            fallback={
              <GoogleSignInButton
                onClick={handleAuthorize}
                disabled={loading() || !isConfigValid()}
              />
            }
          >
            <button
              class={styles.signOutButton}
              onClick={handleSignOut}
              disabled={loading()}
            >
              登出 Google 账号
            </button>
          </Show>
        </div>
      </div>

      {/* 错误提示 */}
      <Show when={error()}>
        <div class={styles.errorBox}>
          <strong>❌ 错误：</strong> {error()}
        </div>
      </Show>

      {/* 未授权提示 */}
      <Show when={!isAuthorized() && isConfigValid()}>
        <div class={styles.welcomeBox}>
          <h3>👋 欢迎使用 Google Calendar</h3>
          <p>请点击右上角的 "Sign in with Google" 按钮来授权访问你的日历。</p>
          <p class={styles.hint}>
            💡 提示：需要先在 Google Cloud Console 配置 API 密钥和客户端 ID。
            <br />
            查看配置指南：<code>docs/GoogleCalendarSetup.md</code>
          </p>
        </div>
      </Show>

      {/* 配置无效提示 */}
      <Show when={!isConfigValid()}>
        <div class={styles.welcomeBox}>
          <h3>⚙️ 配置缺失</h3>
          <p>Google Calendar 功能需要配置 API Key 和 Client ID。</p>
          <p class={styles.hint}>
            请在项目根目录创建 <code>.env</code> 文件，并添加以下内容：
            <pre>
              VITE_GOOGLE_CLIENT_ID=your-client-id...
              <br />
              VITE_GOOGLE_API_KEY=your-api-key...
            </pre>
            详细步骤请参考：<code>docs/GoogleCalendarSetup.md</code>
          </p>
        </div>
      </Show>

      {/* 已授权内容 */}
      <Show when={isAuthorized()}>
        {/* 操作栏 */}
        <div class={styles.toolbar}>
          <button
            class={styles.addButton}
            onClick={() => (showAddForm() ? setShowAddForm(false) : openAddForm())}
            disabled={loading()}
          >
            {showAddForm() ? '✖️ 取消' : '➕ 新建事件'}
          </button>

          <button
            class={styles.refreshButton}
            onClick={loadEvents}
            disabled={loading()}
          >
            {loading() ? '⏳ 加载中...' : '🔄 刷新'}
          </button>
        </div>

        {/* 新建事件表单 */}
        <AddEventForm {...formProps} />

        {/* 事件列表 - 两列布局 */}
        <EventList
          todayEvents={todayEvents}
          futureEvents={futureEvents}
          loading={loading}
          onDelete={handleDeleteEvent}
          formatDateTime={formatDateTime}
          getRelativeDateLabel={getRelativeDateLabel}
        />
      </Show>
    </div>
  );
};

export default CalendarTool;
