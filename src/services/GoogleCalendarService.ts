// src/services/GoogleCalendarService.ts
/// <reference types="gapi" />
/// <reference types="gapi.auth2" />

/**
 * Google Calendar 前端集成服务
 * 使用 Google Calendar API v3 直接从浏览器调用
 */

// Google API 配置
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest';
const SCOPES = 'https://www.googleapis.com/auth/calendar';

// 从环境变量或配置文件读取（生产环境中应该从安全的配置源读取）
const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY || '';
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

export interface CalendarEvent {
  id?: string;
  summary: string;
  description?: string;
  location?: string;
  start: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  attendees?: Array<{ email: string }>;
  reminders?: {
    useDefault: boolean;
    overrides?: Array<{ method: string; minutes: number }>;
  };
}

export interface CalendarListResponse {
  items?: CalendarEvent[];
  error?: any;
}

class GoogleCalendarService {
  private gapiInited = false;
  private gisInited = false;
  private tokenClient: google.accounts.oauth2.TokenClient | null = null;
  private readonly TOKEN_STORAGE_KEY = 'google_calendar_token';

  /**
   * 检查 API Key 和 Client ID 是否已配置
   */
  isConfigured(): boolean {
    return !!API_KEY && !!CLIENT_ID;
  }

  /**
   * 保存令牌到 localStorage
   */
  private saveToken(token: any): void {
    try {
      localStorage.setItem(this.TOKEN_STORAGE_KEY, JSON.stringify(token));
      console.log('✅ 令牌已保存到本地存储');
    } catch (error) {
      console.error('❌ 保存令牌失败:', error);
    }
  }

  /**
   * 从 localStorage 读取令牌
   */
  private loadToken(): any | null {
    try {
      const tokenStr = localStorage.getItem(this.TOKEN_STORAGE_KEY);
      if (tokenStr) {
        const token = JSON.parse(tokenStr);
        // 检查令牌是否过期
        if (token.expiry_date && Date.now() < token.expiry_date) {
          console.log('✅ 从本地存储恢复令牌');
          return token;
        } else {
          console.log('⚠️ 本地令牌已过期');
          this.clearToken();
          return null;
        }
      }
    } catch (error) {
      console.error('❌ 读取令牌失败:', error);
    }
    return null;
  }

  /**
   * 清除本地存储的令牌
   */
  private clearToken(): void {
    try {
      localStorage.removeItem(this.TOKEN_STORAGE_KEY);
      console.log('✅ 本地令牌已清除');
    } catch (error) {
      console.error('❌ 清除令牌失败:', error);
    }
  }

  /**
   * 初始化 Google API
   */
  async initGoogleAPI(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (typeof gapi === 'undefined') {
        // 动态加载 gapi 脚本
        const script = document.createElement('script');
        script.src = 'https://apis.google.com/js/api.js';
        script.onload = () => {
          gapi.load('client', async () => {
            try {
              await gapi.client.init({
                apiKey: API_KEY,
                discoveryDocs: [DISCOVERY_DOC],
              });
              this.gapiInited = true;
              console.log('✅ Google API 初始化成功');
              
              // 尝试恢复已保存的令牌
              const savedToken = this.loadToken();
              if (savedToken) {
                gapi.client.setToken(savedToken);
                console.log('✅ 已恢复保存的访问令牌');
              }
              
              resolve();
            } catch (error) {
              console.error('❌ Google API 初始化失败:', error);
              reject(error);
            }
          });
        };
        script.onerror = reject;
        document.body.appendChild(script);
      } else {
        // gapi 已加载
        gapi.load('client', async () => {
          try {
            await gapi.client.init({
              apiKey: API_KEY,
              discoveryDocs: [DISCOVERY_DOC],
            });
            this.gapiInited = true;
            console.log('✅ Google API 初始化成功');
            
            // 尝试恢复已保存的令牌
            const savedToken = this.loadToken();
            if (savedToken) {
              gapi.client.setToken(savedToken);
              console.log('✅ 已恢复保存的访问令牌');
            }
            
            resolve();
          } catch (error) {
            console.error('❌ Google API 初始化失败:', error);
            reject(error);
          }
        });
      }
    });
  }

  /**
   * 初始化 Google Identity Services (GIS)
   */
  async initGoogleIdentity(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (typeof google === 'undefined' || !google.accounts) {
        // 动态加载 GIS 脚本
        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.onload = () => {
          this.tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPES,
            callback: '', // 稍后设置
          });
          this.gisInited = true;
          console.log('✅ Google Identity Services 初始化成功');
          resolve();
        };
        script.onerror = reject;
        document.body.appendChild(script);
      } else {
        this.tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: SCOPES,
          callback: '', // 稍后设置
        });
        this.gisInited = true;
        console.log('✅ Google Identity Services 初始化成功');
        resolve();
      }
    });
  }

  /**
   * 确保 API 已初始化
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.gapiInited) {
      await this.initGoogleAPI();
    }
    if (!this.gisInited) {
      await this.initGoogleIdentity();
    }
  }

  /**
   * 请求授权
   */
  async authorize(): Promise<void> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      if (!this.tokenClient) {
        reject(new Error('Token client 未初始化'));
        return;
      }

      try {
        // 检查是否已有有效 token
        const token = gapi.client.getToken();
        if (token !== null) {
          console.log('✅ 已有有效的访问令牌');
          resolve();
          return;
        }

        // 请求新的 token
        this.tokenClient.callback = async (response: any) => {
          if (response.error !== undefined) {
            reject(response);
          } else {
            console.log('✅ 授权成功');
            
            // 保存令牌到 localStorage（添加过期时间）
            const tokenWithExpiry = {
              access_token: response.access_token,
              token_type: response.token_type || 'Bearer',
              expires_in: response.expires_in,
              scope: response.scope,
              // 计算过期时间戳（当前时间 + expires_in 秒）
              expiry_date: Date.now() + (response.expires_in * 1000),
            };
            this.saveToken(tokenWithExpiry);
            
            resolve();
          }
        };

        // 提示用户选择账号
        this.tokenClient.requestAccessToken({ prompt: 'consent' });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 撤销授权
   */
  async revokeAuthorization(): Promise<void> {
    const token = gapi.client.getToken();
    if (token !== null) {
      google.accounts.oauth2.revoke(token.access_token, () => {
        gapi.client.setToken(null);
        this.clearToken(); // 清除本地存储的令牌
        console.log('✅ 授权已撤销');
      });
    } else {
      // 即使没有活动令牌，也清除本地存储
      this.clearToken();
    }
  }

  /**
   * 检查是否已授权
   */
  isAuthorized(): boolean {
    const token = gapi.client.getToken();
    return token !== null;
  }

  /**
   * 列出日历事件
   */
  async listEvents(
    calendarId: string = 'primary',
    timeMin?: string,
    timeMax?: string,
    maxResults: number = 250
  ): Promise<CalendarListResponse> {
    await this.ensureInitialized();

    try {
      const request: any = {
        calendarId,
        timeMin: timeMin || new Date().toISOString(),
        showDeleted: false,
        singleEvents: true,
        maxResults,
        orderBy: 'startTime',
      };

      if (timeMax) {
        request.timeMax = timeMax;
      }

      const response = await gapi.client.request({
        path: `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`,
        method: 'GET',
        params: request,
      });

      return {
        items: response.result.items || [],
      };
    } catch (error) {
      console.error('列出事件失败:', error);
      return { items: [], error };
    }
  }

  /**
   * 创建日历事件
   */
  async createEvent(
    event: CalendarEvent,
    calendarId: string = 'primary'
  ): Promise<CalendarEvent> {
    await this.ensureInitialized();

    try {
      const response = await gapi.client.request({
        path: `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`,
        method: 'POST',
        body: event,
      });

      console.log('✅ 事件创建成功:', response.result);
      return response.result;
    } catch (error) {
      console.error('❌ 创建事件失败:', error);
      throw error;
    }
  }

  /**
   * 更新日历事件
   */
  async updateEvent(
    eventId: string,
    event: CalendarEvent,
    calendarId: string = 'primary'
  ): Promise<CalendarEvent> {
    await this.ensureInitialized();

    try {
      const response = await gapi.client.request({
        path: `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${eventId}`,
        method: 'PUT',
        body: event,
      });

      console.log('✅ 事件更新成功:', response.result);
      return response.result;
    } catch (error) {
      console.error('❌ 更新事件失败:', error);
      throw error;
    }
  }

  /**
   * 删除日历事件
   */
  async deleteEvent(
    eventId: string,
    calendarId: string = 'primary'
  ): Promise<void> {
    await this.ensureInitialized();

    try {
      await gapi.client.request({
        path: `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${eventId}`,
        method: 'DELETE',
      });

      console.log('✅ 事件删除成功');
    } catch (error) {
      console.error('❌ 删除事件失败:', error);
      throw error;
    }
  }

  /**
   * 获取单个事件详情
   */
  async getEvent(
    eventId: string,
    calendarId: string = 'primary'
  ): Promise<CalendarEvent> {
    await this.ensureInitialized();

    try {
      const response = await gapi.client.request({
        path: `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${eventId}`,
        method: 'GET',
      });

      return response.result;
    } catch (error) {
      console.error('❌ 获取事件详情失败:', error);
      throw error;
    }
  }

  /**
   * 列出用户的所有日历
   */
  async listCalendars(): Promise<any[]> {
    await this.ensureInitialized();

    try {
      const response = await gapi.client.request({
        path: 'https://www.googleapis.com/calendar/v3/users/me/calendarList',
        method: 'GET',
      });

      return response.result.items || [];
    } catch (error) {
      console.error('❌ 获取日历列表失败:', error);
      throw error;
    }
  }
}

// 导出单例
export const googleCalendarService = new GoogleCalendarService();
