/**
 * tag('button') === document.createElement('button') 的工厂化版本，
 * 搭配 h() 使用，适合组件内部高频创建元素。
 */
export function tag<K extends keyof HTMLElementTagNameMap>(name: K): HTMLElementTagNameMap[K] {
  return document.createElement(name) as HTMLElementTagNameMap[K];
}

export const div = (): HTMLDivElement => tag('div');
export const span = (): HTMLSpanElement => tag('span');

/** 通用类名前缀入口，供组件使用（换肤时只动 token，不动类名） */
export const PREFIX = 'u';
export const cls = (name: string): string => `${PREFIX}-${name}`;
