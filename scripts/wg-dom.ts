/**
 * wg-dom —— 极简 DOM 测试替身（仅覆盖 @utopia/ui 所需的 API 子集）。
 * 让组件与主题逻辑在纯 Node 环境（Win7 / CI）里也能被自动化测试。
 * 不是完整 DOM 实现：不支持事件冒泡、样式计算、渲染。
 */

const BOOL_PROPS = new Set(['disabled', 'checked', 'selected', 'required', 'readOnly', 'hidden', 'multiple', 'open']);

function kebab(key: string): string {
  return key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

export class WgEvent {
  type: string;
  target: WgElement | null = null;
  constructor(type: string) {
    this.type = type;
  }
}

export class WgText {
  nodeType = 3;
  textContent: string;
  constructor(text: string) {
    this.textContent = text;
  }
}

type WgNode = WgElement | WgText;

export class WgStyle {
  private map = new Map<string, string>();
  setProperty(key: string, value: string): void { this.map.set(key, value); }
  getPropertyValue(key: string): string { return this.map.get(key) ?? ''; }
  removeProperty(key: string): string { const v = this.map.get(key) ?? ''; this.map.delete(key); return v; }
  entries(): Array<[string, string]> { return Array.from(this.map.entries()); }
}

export class WgClassList {
  private set = new Set<string>();
  private onChange: ((value: string) => void) | undefined;
  constructor(onChange?: (value: string) => void) { this.onChange = onChange; }
  private sync(): void { if (this.onChange) this.onChange(this.toString()); }
  /** 整体替换（供 className 赋值使用） */
  replace(value: string): void {
    this.set.clear();
    for (const part of String(value).split(/\s+/)) if (part) this.set.add(part);
    this.sync();
  }
  add(...names: string[]): void { for (const n of names) if (n) this.set.add(n); this.sync(); }
  remove(...names: string[]): void { for (const n of names) this.set.delete(n); this.sync(); }
  toggle(name: string, force?: boolean): boolean {
    if (force === undefined) force = !this.set.has(name);
    if (force) this.set.add(name); else this.set.delete(name);
    this.sync();
    return force;
  }
  contains(name: string): boolean { return this.set.has(name); }
  toString(): string { return Array.from(this.set).join(' '); }
  get size(): number { return this.set.size; }
}

export class WgElement {
  nodeType = 1;
  tagName: string;
  [key: string]: unknown;

  attributes = new Map<string, string>();
  children: WgNode[] = [];
  parentNode: WgElement | null = null;
  style = new WgStyle();
  classList = new WgClassList((value) => this.attributes.set('class', value));
  private listeners = new Map<string, Set<(event: WgEvent) => void>>();

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  private syncDown(key: string, value: string): void {
    this.attributes.set(key, value);
    const propKey = key === 'readonly' ? 'readOnly' : kebabToCamel(key);
    if (BOOL_PROPS.has(propKey) || propKey === 'value' || propKey === 'type' || propKey === 'name' || propKey === 'placeholder') {
      (this as Record<string, unknown>)[propKey] = BOOL_PROPS.has(propKey) ? (value !== 'false') : value;
    }
  }

  setAttribute(key: string, value: unknown): void {
    this.syncDown(key.toLowerCase(), String(value));
  }

  getAttribute(key: string): string | null {
    return this.attributes.get(key.toLowerCase()) ?? null;
  }

  hasAttribute(key: string): boolean {
    return this.attributes.has(key.toLowerCase());
  }

  get className(): string { return this.classList.toString(); }
  set className(value: string) { this.classList.replace(value); }

  removeAttribute(key: string): void {
    key = key.toLowerCase();
    this.attributes.delete(key);
    const propKey = kebabToCamel(key);
    if ((this as Record<string, unknown>)[propKey] !== undefined && !isReservedProp(propKey)) {
      delete (this as Record<string, unknown>)[propKey];
    }
  }

  get dataset(): Record<string, string> {
    const attrs = this.attributes;
    return new Proxy({} as Record<string, string>, {
      get(_t, key: string) { return attrs.get('data-' + kebab(key)) ?? undefined; },
      set(_t, key: string, value: string) { attrs.set('data-' + kebab(key), String(value)); return true; },
      has(_t, key: string) { return attrs.has('data-' + kebab(key)); }
    });
  }

  append(...nodes: Array<WgNode | string | null | undefined | false>): void {
    for (const node of nodes) {
      if (node === null || node === undefined || node === false) continue;
      const child: WgNode = typeof node === 'string' ? new WgText(node) : node;
      if (child instanceof WgElement) child.parentNode = this;
      this.children.push(child);
    }
  }

  appendChild<T extends WgNode>(child: T): T {
    this.append(child);
    return child;
  }

  replaceChildren(...nodes: Array<WgNode | string | null | undefined>): void {
    this.children = [];
    this.append(...nodes);
  }

  remove(): void {
    if (this.parentNode) {
      const list = this.parentNode.children;
      const index = list.indexOf(this);
      if (index >= 0) list.splice(index, 1);
      this.parentNode = null;
    }
  }

  addEventListener(type: string, cb: (event: WgEvent) => void): void {
    let set = this.listeners.get(type);
    if (!set) { set = new Set(); this.listeners.set(type, set); }
    set.add(cb);
  }

  removeEventListener(type: string, cb: (event: WgEvent) => void): void {
    this.listeners.get(type)?.delete(cb);
  }

  dispatchEvent(event: WgEvent): boolean {
    event.target = this;
    this.listeners.get(event.type)?.forEach((cb) => cb(event));
    return true;
  }

  get textContent(): string {
    if (this.children.length === 0) {
      return (this as Record<string, unknown>).__text as string ?? '';
    }
    return this.children.map((c) => c.textContent ?? '').join('');
  }

  set textContent(value: string) {
    this.children = [];
    if (value) this.append(new WgText(value));
    (this as Record<string, unknown>).__text = value;
  }

  private matches(selector: string): boolean {
    if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
    return this.tagName.toLowerCase() === selector.toLowerCase();
  }

  querySelector(selector: string): WgElement | null {
    return walkFind(this, (el) => el.matches(selector));
  }

  querySelectorAll(selector: string): WgElement[] {
    const out: WgElement[] = [];
    walkCollect(this, (el) => { if (el.matches(selector)) out.push(el); });
    return out;
  }

  get firstElementChild(): WgElement | null {
    for (const c of this.children) if (c instanceof WgElement) return c;
    return null;
  }

  cloneNode(deep?: boolean): WgElement {
    const copy = new WgElement(this.tagName);
    for (const [k, v] of this.attributes.entries()) copy.setAttribute(k, v);
    copy.classList.add(...this.classList.toString().split(' ').filter(Boolean));
    if (deep) for (const c of this.children) copy.append(c instanceof WgElement ? c.cloneNode(true) : new WgText(c.textContent));
    return copy;
  }
}

function kebabToCamel(key: string): string {
  return key.replace(/-([a-z])/g, (_, m: string) => m.toUpperCase());
}

const RESERVED = new Set([
  'nodeType', 'tagName', 'attributes', 'children', 'parentNode', 'style', 'classList', 'dataset'
]);
function isReservedProp(key: string): boolean {
  return RESERVED.has(key);
}

function walkFind(root: WgElement, test: (el: WgElement) => boolean): WgElement | null {
  for (const child of root.children) {
    if (child instanceof WgElement) {
      if (test(child)) return child;
      const found = walkFind(child, test);
      if (found) return found;
    }
  }
  return null;
}

function walkCollect(root: WgElement, visit: (el: WgElement) => void): void {
  for (const child of root.children) {
    if (child instanceof WgElement) {
      visit(child);
      walkCollect(child, visit);
    }
  }
}

export class WgDocument {
  body = new WgElement('body');
  head = new WgElement('head');
  documentElement = new WgElement('html');

  constructor() {
    this.documentElement.append(this.head, this.body);
  }

  createElement(tag: string): WgElement { return new WgElement(tag); }
  createTextNode(text: string): WgText { return new WgText(text); }

  querySelector(selector: string): WgElement | null {
    return this.documentElement.querySelector(selector);
  }

  querySelectorAll(selector: string): WgElement[] {
    return this.documentElement.querySelectorAll(selector);
  }
}

/** 在测试里安装全局 document（全局对象单例，供被测代码读取） */
export interface DomHandle {
  doc: WgDocument;
  restore(): void;
}

export function installDom(): DomHandle {
  const doc = new WgDocument();
  const g = globalThis as Record<string, unknown>;
  const previous = g.document;
  g.document = doc;
  g.addEventListener = (): void => { /* 测试无需监听全局事件 */ };
  g.removeEventListener = (): void => { /* noop */ };
  if (!g.matchMedia) {
    g.matchMedia = (query: string): MediaQueryList => ({
      media: query,
      matches: false,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false
    } as unknown as MediaQueryList);
  }
  return { doc, restore: () => { g.document = previous; } };
}
