type DebugFunction = ((...args: unknown[]) => void) & {
  namespace: string;
  enabled: boolean;
  extend: (suffix: string, delimiter?: string) => DebugFunction;
  destroy: () => boolean;
};

type DebugFactory = ((namespace: string) => DebugFunction) & {
  coerce: (value: unknown) => unknown;
  disable: () => string;
  enable: (_namespaces: string) => void;
  enabled: (_namespace: string) => boolean;
  humanize: (value: number) => string;
  formatters: Record<string, (value: unknown) => string>;
  log: typeof console.debug;
};

function formatDuration(value: number) {
  if (value < 1000) {
    return `${value}ms`;
  }

  const seconds = value / 1000;

  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }

  return `${(seconds / 60).toFixed(1)}m`;
}

const createDebug = ((namespace: string) => {
  const debug = ((..._args: unknown[]) => {
    // 桌面应用里这里仅用于满足 markdown 解析链对 debug 的依赖，默认静默即可。
  }) as DebugFunction;

  debug.namespace = namespace;
  debug.enabled = false;
  debug.extend = (suffix: string, delimiter = ":") =>
    createDebug(`${namespace}${delimiter}${suffix}`);
  debug.destroy = () => true;

  return debug;
}) as DebugFactory;

createDebug.coerce = (value) => value;
createDebug.disable = () => "";
createDebug.enable = (_namespaces) => {};
createDebug.enabled = (_namespace) => false;
createDebug.humanize = formatDuration;
createDebug.formatters = {};
createDebug.log = console.debug.bind(console);

export const coerce = createDebug.coerce;
export const disable = createDebug.disable;
export const enable = createDebug.enable;
export const enabled = createDebug.enabled;
export const humanize = createDebug.humanize;
export const formatters = createDebug.formatters;
export const log = createDebug.log;
export default createDebug;