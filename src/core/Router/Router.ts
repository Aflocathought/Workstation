// src/core/Router.ts
import { createSignal } from "solid-js";

// 默认路由配置
export const defaultRoutes: Route[] = [
  // 注意：主要功能路由采用动态注册方式
  // - timetrack 路由在 Timeline/registerRoute.ts 中注册
  // - tools 路由在 Tools/registerRoute.ts 中注册
  // - spectrum 已移至 tools 子路由
  
  // 保留通用功能路由
  {
    id: "settings",
    name: "设置",
    path: "/settings",
    icon: "⚙️",
    description: "应用设置和配置",
  },
];

export interface Route {
  id: string;
  name: string;
  path: string;
  component?: () => any; // 懒加载组件
  icon?: string;
  description?: string;
  hidden?: boolean;
}

// 路由管理器
class RouterManager {
  private routes;
  private setRoutes;
  private currentRoute;
  private setCurrentRoute;
  private history;
  private setHistory;

  constructor() {
    [this.routes, this.setRoutes] = createSignal<Route[]>(defaultRoutes);
    [this.currentRoute, this.setCurrentRoute] =
      createSignal<string>("timetrack");
    [this.history, this.setHistory] = createSignal<string[]>(["timetrack"]);
    // 初始化路由
    this.initializeRouter();
  }

  // 获取当前路由
  get current() {
    return this.currentRoute();
  }

  // 获取所有路由
  get allRoutes() {
    return this.routes();
  }

  // 获取可见路由
  get visibleRoutes() {
    return this.routes().filter((r) => !r.hidden);
  }

  // 获取当前路由信息
  getCurrentRoute(): Route | undefined {
    return this.routes().find((r) => r.id === this.currentRoute());
  }

  // 导航到指定路由
  navigate(routeId: string, addToHistory = true) {
    const route = this.routes().find((r) => r.id === routeId);
    if (!route) {
      console.warn(`路由不存在: ${routeId}`);
      return false;
    }

    this.setCurrentRoute(routeId);

    if (addToHistory) {
      this.setHistory((prev) => [...prev, routeId]);
    }

    // 触发路由变化事件
    this.onRouteChange?.(routeId, route);

    return true;
  }

  // 返回上一个路由
  goBack(): boolean {
    const hist = this.history();
    if (hist.length > 1) {
      const newHistory = hist.slice(0, -1);
      const previousRoute = newHistory[newHistory.length - 1];

      this.setHistory(newHistory);
      this.setCurrentRoute(previousRoute);

      const route = this.getCurrentRoute();
      this.onRouteChange?.(previousRoute, route);

      return true;
    }
    return false;
  }

  // 检查是否可以返回
  canGoBack(): boolean {
    return this.history().length > 1;
  }

  // 添加新路由
  addRoute(route: Route) {
    if (this.routes().find((r) => r.id === route.id)) {
      console.warn(`路由已存在: ${route.id}`);
      return false;
    }

    this.setRoutes([...this.routes(), route]);
    return true;
  }

  // 移除路由
  removeRoute(routeId: string) {
    const currentRoutes = this.routes();
    const index = currentRoutes.findIndex((r) => r.id === routeId);
    if (index > -1) {
      const newRoutes = [...currentRoutes];
      newRoutes.splice(index, 1);
      this.setRoutes(newRoutes);

      // 如果移除的是当前路由，导航到第一个可见路由
      if (this.currentRoute() === routeId) {
        const firstRoute = this.visibleRoutes[0];
        if (firstRoute) {
          this.navigate(firstRoute.id);
        }
      }

      return true;
    }
    return false;
  }

  // 更新路由
  updateRoute(routeId: string, updates: Partial<Route>) {
    const currentRoutes = this.routes();
    const routeIndex = currentRoutes.findIndex((r) => r.id === routeId);
    if (routeIndex > -1) {
      const newRoutes = [...currentRoutes];
      newRoutes[routeIndex] = { ...newRoutes[routeIndex], ...updates };
      this.setRoutes(newRoutes);
      return true;
    }
    return false;
  }

  // 清空历史记录
  clearHistory() {
    this.setHistory([this.currentRoute()]);
  }

  // 获取导航历史
  getHistory(): string[] {
    return [...this.history()];
  }

  // 路由变化回调
  onRouteChange?: (routeId: string, route?: Route) => void;

  // 设置路由变化监听器
  setRouteChangeListener(callback: (routeId: string, route?: Route) => void) {
    this.onRouteChange = callback;
  }

  // 初始化路由器
  private initializeRouter() {
    // 这里可以添加初始化逻辑
    // 比如从 localStorage 恢复路由状态
    try {
      const savedRoute = localStorage.getItem("currentRoute");
      if (savedRoute && this.routes().find((r) => r.id === savedRoute)) {
        this.setCurrentRoute(savedRoute);
      }
    } catch (error) {
      console.warn("无法恢复路由状态:", error);
    }
  }

  // 保存当前路由到本地存储
  saveRouteState() {
    try {
      localStorage.setItem("currentRoute", this.currentRoute());
    } catch (error) {
      console.warn("无法保存路由状态:", error);
    }
  }

  // 获取面包屑导航
  getBreadcrumb(): Route[] {
    return this.history()
      .map((id) => this.routes().find((r) => r.id === id))
      .filter((route): route is Route => route !== undefined);
  }
}

// 导出单例
export const router = new RouterManager();

// 导出 hook 供组件使用
export const useRouter = () => ({
  currentRoute: () => router.current,
  navigate: router.navigate.bind(router),
  goBack: router.goBack.bind(router),
  canGoBack: router.canGoBack.bind(router),
  getCurrentRoute: router.getCurrentRoute.bind(router),
  visibleRoutes: () => router.visibleRoutes,
  getBreadcrumb: router.getBreadcrumb.bind(router),
});

// 路由守卫类型
export interface RouteGuard {
  canActivate: (routeId: string) => boolean | Promise<boolean>;
  canDeactivate?: (routeId: string) => boolean | Promise<boolean>;
}

// 简单的路由守卫管理
class RouteGuardManager {
  private guards: RouteGuard[] = [];

  addGuard(guard: RouteGuard) {
    this.guards.push(guard);
  }

  removeGuard(guard: RouteGuard) {
    const index = this.guards.indexOf(guard);
    if (index > -1) {
      this.guards.splice(index, 1);
    }
  }

  async canActivate(routeId: string): Promise<boolean> {
    for (const guard of this.guards) {
      const result = await guard.canActivate(routeId);
      if (!result) {
        return false;
      }
    }
    return true;
  }

  async canDeactivate(routeId: string): Promise<boolean> {
    for (const guard of this.guards) {
      if (guard.canDeactivate) {
        const result = await guard.canDeactivate(routeId);
        if (!result) {
          return false;
        }
      }
    }
    return true;
  }
}

export const routeGuards = new RouteGuardManager();
