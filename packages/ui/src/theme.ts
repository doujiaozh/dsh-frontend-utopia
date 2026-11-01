/**
 * 主题系统：token -> CSS Variables -> data-u-theme 属性。
 * 三套内置皮肤：light / dark / glass（液态玻璃）。可任意扩展、混合、作用域隔离。
 */
export type ThemeName = 'light' | 'dark' | 'glass';

/** 已含 --u- 前缀的设计变量 */
export type TokenMap = Record<string, string>;

export interface Theme {
  name: string;
  tokens: TokenMap;
}

export type ThemeScope = HTMLElement | string;

const sharedTokens: TokenMap = {
  '--u-radius-sm': '5px',
  '--u-radius-md': '9px',
  '--u-radius-lg': '14px',
  '--u-radius-full': '999px',
  '--u-space-1': '4px',
  '--u-space-2': '8px',
  '--u-space-3': '12px',
  '--u-space-4': '16px',
  '--u-space-5': '24px',
  '--u-space-6': '32px',
  '--u-font': '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif',
  '--u-mono': 'ui-monospace, "SF Mono", Menlo, Consolas, "Courier New", monospace',
  '--u-transition': '160ms ease'
};

export const lightTokens: TokenMap = {
  ...sharedTokens,
  '--u-bg': '#f4f6f9',
  '--u-surface': '#ffffff',
  '--u-surface-strong': '#eceef3',
  '--u-surface-hover': '#e2e6ee',
  '--u-text': '#171a21',
  '--u-text-muted': '#667085',
  '--u-border': '#dcdfe7',
  '--u-border-strong': '#c4c9d5',
  '--u-primary': '#4f7cff',
  '--u-primary-fg': '#ffffff',
  '--u-primary-soft': 'rgba(79, 124, 255, 0.12)',
  '--u-accent': '#8b5cf6',
  '--u-danger': '#e5484d',
  '--u-success': '#2f9e44',
  '--u-warning': '#e8890c',
  '--u-info': '#1c7ed6',
  '--u-focus': 'rgba(79, 124, 255, 0.38)',
  '--u-shadow-sm': '0 1px 2px rgba(15, 23, 42, 0.08)',
  '--u-shadow-md': '0 4px 14px rgba(15, 23, 42, 0.10)',
  '--u-shadow-lg': '0 14px 40px rgba(15, 23, 42, 0.16)',
  '--u-glass-bg': 'rgba(255, 255, 255, 0.12)',
  '--u-glass-blur': '10px'
};

export const darkTokens: TokenMap = {
  ...sharedTokens,
  '--u-bg': '#0e1116',
  '--u-surface': '#161a22',
  '--u-surface-strong': '#1f2430',
  '--u-surface-hover': '#252b39',
  '--u-text': '#e7eaf1',
  '--u-text-muted': '#97a1b3',
  '--u-border': '#2a3140',
  '--u-border-strong': '#3a4353',
  '--u-primary': '#5b8cff',
  '--u-primary-fg': '#0b1020',
  '--u-primary-soft': 'rgba(91, 140, 255, 0.18)',
  '--u-accent': '#a78bfa',
  '--u-danger': '#ff6b6f',
  '--u-success': '#51cf66',
  '--u-warning': '#ffb84d',
  '--u-info': '#4dabf7',
  '--u-focus': 'rgba(91, 140, 255, 0.45)',
  '--u-shadow-sm': '0 1px 2px rgba(0, 0, 0, 0.5)',
  '--u-shadow-md': '0 4px 16px rgba(0, 0, 0, 0.45)',
  '--u-shadow-lg': '0 16px 44px rgba(0, 0, 0, 0.55)',
  '--u-glass-bg': 'rgba(255, 255, 255, 0.06)',
  '--u-glass-blur': '14px'
};

export const glassTokens: TokenMap = {
  ...sharedTokens,
  '--u-bg': 'transparent',
  '--u-surface': 'rgba(255, 255, 255, 0.10)',
  '--u-surface-strong': 'rgba(255, 255, 255, 0.16)',
  '--u-surface-hover': 'rgba(255, 255, 255, 0.20)',
  '--u-text': '#f4f7ff',
  '--u-text-muted': 'rgba(244, 247, 255, 0.72)',
  '--u-border': 'rgba(255, 255, 255, 0.22)',
  '--u-border-strong': 'rgba(255, 255, 255, 0.38)',
  '--u-primary': '#7aa5ff',
  '--u-primary-fg': '#101728',
  '--u-primary-soft': 'rgba(122, 165, 255, 0.24)',
  '--u-accent': '#b79bff',
  '--u-danger': '#ff7a7e',
  '--u-success': '#5ee08a',
  '--u-warning': '#ffc76b',
  '--u-info': '#6fc3ff',
  '--u-focus': 'rgba(122, 165, 255, 0.5)',
  '--u-shadow-sm': '0 2px 6px rgba(2, 6, 23, 0.28)',
  '--u-shadow-md': '0 8px 24px rgba(2, 6, 23, 0.32)',
  '--u-shadow-lg': '0 20px 60px rgba(2, 6, 23, 0.45)',
  '--u-glass-bg': 'rgba(255, 255, 255, 0.10)',
  '--u-glass-blur': '18px'
};

export function presetTheme(name: ThemeName): TokenMap {
  switch (name) {
    case 'light': return { ...lightTokens };
    case 'dark': return { ...darkTokens };
    case 'glass': return { ...glassTokens };
  }
}

/**
 * 合成主题：基于内置皮肤扩展（或基于另一个 Theme）。
 * ```ts
 * const brand = createTheme('brand', { '--u-primary': '#ff6a00' }, 'dark');
 * applyTheme(brand);
 * ```
 */
export function createTheme(name: string, tokens: TokenMap = {}, extend: ThemeName | Theme = 'light'): Theme {
  const base = typeof extend === 'string' ? presetTheme(extend) : { ...extend.tokens };
  return { name, tokens: { ...base, ...tokens } };
}

function resolveElement(scope: ThemeScope | 'root'): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  if (scope === 'root') return document.documentElement;
  if (typeof scope === 'string') return document.querySelector(scope);
  return scope;
}

/**
 * 应用主题：写入 data-u-theme 标记 + 把 tokens 逐条铺成 CSS Variables。
 * scope 可传选择器或元素，实现“局部换肤”。
 */
export function applyTheme(theme: Theme, scope: ThemeScope | 'root' = 'root'): void {
  const el = resolveElement(scope);
  if (!el) return;
  el.setAttribute('data-u-theme', theme.name);
  for (const [key, value] of Object.entries(theme.tokens)) {
    el.style.setProperty(key, value);
  }
}

export function getAppliedTheme(scope: ThemeScope | 'root' = 'root'): string | null {
  const el = resolveElement(scope);
  return el?.getAttribute('data-u-theme') ?? null;
}

export interface ThemeManagerOptions {
  /** 注册自定义主题 */
  themes?: Record<string, Theme>;
  /** 默认主题名 */
  default?: string;
  /** localStorage 键名，传入即持久化 */
  persist?: string | boolean;
  /** 跟随系统 prefers-color-scheme */
  watchSystem?: boolean;
}

/**
 * 主题管家：切换 / toggle / 持久化 / 跟随系统，一行接入换肤按钮。
 */
export class ThemeManager {
  private themes = new Map<string, Theme>();
  private current: string;
  private storageKey: string | null = null;
  private unwatchSystem: (() => void) | null = null;

  constructor(options: ThemeManagerOptions = {}) {
    this.register('light', createTheme('light', {}, 'light'));
    this.register('dark', createTheme('dark', {}, 'dark'));
    this.register('glass', createTheme('glass', {}, 'glass'));
    for (const [name, theme] of Object.entries(options.themes ?? {})) {
      this.register(name, theme);
    }
    this.current = options.default ?? 'light';

    if (options.persist) {
      this.storageKey = options.persist === true ? 'utopia-theme' : options.persist;
      this.restore();
      void this.storageKey;
    }
    if (options.watchSystem) this.watchSystem();
  }

  register(name: string, theme: Theme): void {
    this.themes.set(name, theme);
  }

  set(name: string | Theme): void {
    if (typeof name !== 'string') {
      this.register(name.name, name);
      name = name.name;
    }
    if (!this.themes.has(name)) throw new Error(`[utopia/ui] 未知主题: ${name}`);
    this.current = name;
    applyTheme(this.themes.get(name) as Theme);
    if (this.storageKey) {
      try { localStorage.setItem(this.storageKey, name); } catch { /* 无存储环境 */ }
    }
  }

  /** 在两个主题间切换，默认 light <-> dark */
  toggle(a = 'light', b = 'dark'): void {
    this.set(this.current === a ? b : a);
  }

  get theme(): Theme {
    return this.themes.get(this.current) as Theme;
  }

  get name(): string {
    return this.current;
  }

  /** 跟随系统深浅色，返回停止监听函数 */
  watchSystem(): () => void {
    if (typeof matchMedia !== 'function') return () => {};
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const apply = (): void => { this.set(mq.matches ? 'dark' : 'light'); };
    apply();
    const useEventListener = typeof mq.addEventListener === 'function';
    if (useEventListener) {
      mq.addEventListener('change', apply);
      this.unwatchSystem = () => mq.removeEventListener('change', apply);
    } else {
      const legacy = mq as unknown as { addListener(cb: () => void): void; removeListener(cb: () => void): void };
      legacy.addListener(apply);
      this.unwatchSystem = () => legacy.removeListener(apply);
    }
    return () => { this.unwatchSystem?.(); this.unwatchSystem = null; };
  }

  private restore(): void {
    if (!this.storageKey) return;
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved && this.themes.has(saved)) this.current = saved;
    } catch { /* 无存储环境 */ }
  }
}
