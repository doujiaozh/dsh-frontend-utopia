export type ClassValue = string | Record<string, boolean> | Array<ClassValue | null | undefined | false> | null | undefined | false;

export type Child = Node | string | null | undefined | false;

export interface HAttrs {
  [key: string]: unknown;
  /** class 支持 字符串 / 对象 / 嵌套数组 */
  class?: ClassValue;
  /** style 对象按 CSS 属性名设置 */
  style?: Record<string, string>;
  /** dataset 映射为 data-* 属性 */
  dataset?: Record<string, string>;
  /** 直接写 innerHTML（谨慎使用，仅用于可信内容） */
  html?: string;
  /** 纯文本子节点 */
  text?: string;
  /** ref 回调：元素创建后立即收到 */
  ref?: (el: HTMLElement) => void;
}

function applyClass(el: HTMLElement, value: ClassValue): void {
  if (!value) return;
  if (typeof value === 'string') {
    for (const part of value.trim().split(/\s+/)) if (part) el.classList.add(part);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => applyClass(el, item));
    return;
  }
  for (const [name, on] of Object.entries(value as Record<string, boolean>)) {
    if (on) el.classList.add(name);
  }
}

const PROP_ATTRS = new Set(['value', 'checked', 'disabled', 'selected', 'readOnly', 'required', 'name', 'placeholder', 'type', 'alt', 'title', 'href', 'download', 'target', 'cols', 'rows', 'min', 'max', 'step', 'for', 'role', 'tabindex', 'width', 'height']);

/**
 * h —— 类型安全的 hyperscript 工具：替代手写 createElement 一长串。
 *
 * ```ts
 * h('section', { class: ['card', { featured: true }], dataset: { id: 7 } },
 *   h('h2', null, '标题'),
 *   h('button', { onClick: save }, '保存'))
 * ```
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: HAttrs | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag) as HTMLElementTagNameMap[K];
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === undefined || value === null || value === false) continue;
      if (key === 'class') { applyClass(el, value as ClassValue); continue; }
      if (key === 'style') {
        const styleMap = (el as HTMLElement).style as unknown as { setProperty(k: string, v: string): void };
        for (const [k, v] of Object.entries(value as Record<string, string>)) styleMap.setProperty(k, v);
        continue;
      }
      if (key === 'dataset') {
        const dataset = (el as HTMLElement).dataset;
        for (const [k, v] of Object.entries(value as Record<string, string>)) dataset[k] = v;
        continue;
      }
      if (key === 'html') { (el as HTMLElement).innerHTML = String(value); continue; }
      if (key === 'text') { (el as HTMLElement).textContent = String(value); continue; }
      if (key === 'ref') {
        (value as (el: HTMLElement) => void)(el as HTMLElement);
        continue;
      }
      if (key.startsWith('on') && typeof value === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
        continue;
      }
      const node = el as unknown as Record<string, unknown>;
      if (PROP_ATTRS.has(key)) {
        node[key === 'for' ? 'htmlFor' : key] = value;
      }
      el.setAttribute(key, String(value));
    }
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child as Node | string);
  }
  return el;
}
