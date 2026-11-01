import { h } from './html.js';
import { cls } from './elements.js';

// ---------------------------------------------------------------- Button --

export type ButtonVariant = 'primary' | 'ghost' | 'danger' | 'subtle';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonOptions {
  text?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  disabled?: boolean;
  loading?: boolean;
  type?: 'button' | 'submit' | 'reset';
  onClick?: (event: Event) => void;
}

export function button(options: ButtonOptions = {}): HTMLButtonElement {
  const {
    text,
    variant = 'primary',
    size = 'md',
    block = false,
    disabled = false,
    loading = false,
    type = 'button',
    onClick
  } = options;
  return h('button', {
    class: [cls('btn'), `${cls('btn')}-${variant}`, `${cls('btn')}-${size}`, { [`${cls('btn')}-block`]: block }],
    type,
    disabled: disabled || loading,
    ariaBusy: loading ? 'true' : undefined,
    onClick
  }, loading ? h('span', { class: `${cls('btn')}-spinner` }) : null, text);
}

// ---------------------------------------------------------------- Input --

export interface InputOptions {
  label?: string;
  placeholder?: string;
  value?: string;
  type?: string;
  disabled?: boolean;
  required?: boolean;
  hint?: string;
  error?: string;
  onInput?: (value: string, event: Event) => void;
  onChange?: (value: string, event: Event) => void;
}

/** 把 label/hint/error 与控件包成一个 field（BEM 风格的 u-field） */
export function field(label: string | null, control: HTMLElement, opts: { hint?: string; error?: string; required?: boolean } = {}): HTMLDivElement {
  return h('div', { class: cls('field') },
    label === null ? null : h('label', { class: cls('label'), text: label }),
    h('div', { class: `${cls('field')}-control` }, control),
    opts.error ? h('div', { class: `${cls('field')}-error`, text: opts.error })
      : opts.hint ? h('div', { class: `${cls('field')}-hint`, text: opts.hint })
      : null
  );
}

export function input(options: InputOptions = {}): HTMLInputElement {
  const { label, hint, error, onInput, onChange, ...rest } = options;
  const el = h('input', {
    class: [cls('input'), { [`${cls('input')}-error`]: !!error }],
    ...rest,
    onInput: onInput ? (event: Event) => onInput(String((event.target as HTMLInputElement).value), event) : undefined,
    onChange: onChange ? (event: Event) => onChange(String((event.target as HTMLInputElement).value), event) : undefined
  });
  if (label !== undefined || hint !== undefined || error !== undefined) {
    // 返回字段包裹会破坏“直接拿 input 值”的用法，因此需要时请用 field() 组合；
    // 这里仅保证裸 input 可独立工作。
  }
  return el;
}

export interface TextareaOptions extends InputOptions {
  rows?: number;
}

export function textarea(options: TextareaOptions = {}): HTMLTextAreaElement {
  const { label, hint, error, onInput, onChange, rows, ...rest } = options;
  void label; void hint; void error;
  return h('textarea', {
    class: [cls('input'), { [`${cls('input')}-error`]: !!error }],
    rows,
    ...rest,
    onInput: onInput ? (event: Event) => onInput(String((event.target as HTMLTextAreaElement).value), event) : undefined,
    onChange: onChange ? (event: Event) => onChange(String((event.target as HTMLTextAreaElement).value), event) : undefined
  });
}

// ---------------------------------------------------------------- Switch --

export interface SwitchOptions {
  checked?: boolean;
  disabled?: boolean;
  label?: string;
  onChange?: (checked: boolean, event: Event) => void;
}

export function switchToggle(options: SwitchOptions = {}): HTMLButtonElement {
  const { checked = false, disabled = false, label, onChange } = options;
  return h('button', {
    class: cls('switch'),
    role: 'switch',
    ariaChecked: checked ? 'true' : 'false',
    disabled,
    onClick: onChange ? (event: Event) => {
      const btn = event.target as HTMLButtonElement;
      const next = !(btn.getAttribute('aria-checked') === 'true');
      btn.setAttribute('aria-checked', next ? 'true' : 'false');
      onChange(next, event);
    } : undefined
  }, label);
}

// ---------------------------------------------------------------- Checkbox --

export interface CheckboxOptions {
  checked?: boolean;
  disabled?: boolean;
  label?: string;
  onChange?: (checked: boolean, event: Event) => void;
}

export function checkbox(options: CheckboxOptions = {}): HTMLLabelElement {
  const { checked = false, disabled = false, label = '', onChange } = options;
  return h('label', { class: [cls('checkbox'), { [`${cls('checkbox')}-disabled`]: disabled }] },
    h('input', {
      type: 'checkbox',
      checked,
      disabled,
      onChange: onChange ? (event: Event) => onChange((event.target as HTMLInputElement).checked, event) : undefined
    }),
    h('span', { class: `${cls('checkbox')}-box` }),
    label ? h('span', { class: `${cls('checkbox')}-label`, text: label }) : null
  );
}

// ---------------------------------------------------------------- Table --

export interface TableColumn<R> {
  key: string;
  title: string;
  align?: 'left' | 'center' | 'right';
  sortable?: boolean;
  render?: (row: R) => Node | string;
  format?: (value: unknown, row: R) => string;
}

export interface TableOptions<R> {
  columns: TableColumn<R>[];
  rows: R[];
  striped?: boolean;
  emptyText?: string;
  onRowClick?: (row: R, event: Event) => void;
}

function compareValues(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const sa = a === undefined || a === null ? '' : String(a);
  const sb = b === undefined || b === null ? '' : String(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

export function table<R extends Record<string, unknown>>(options: TableOptions<R>): HTMLTableElement {
  const { columns, rows, striped = true, emptyText = '暂无数据', onRowClick } = options;
  let sortKey: string | null = null;
  let sortDir = 1;

  const body = h('tbody', null);

  const renderRows = (): void => {
    const data = sortKey
      ? [...rows].sort((a, b) => compareValues(a[sortKey as string], b[sortKey as string]) * sortDir)
      : rows;
    body.replaceChildren();
    if (data.length === 0) {
      body.append(h('tr', null, h('td', { class: `${cls('table')}-empty`, colspan: String(columns.length) }, emptyText)));
      return;
    }
    data.forEach((row, index) => {
      body.append(h('tr', {
        class: [{ [`${cls('table')}-row-striped`]: striped && index % 2 === 1 }],
        onClick: onRowClick ? (event: Event) => onRowClick(row, event) : undefined
      },
      ...columns.map((col) => h('td', {
        class: `${cls('table')}-cell`,
        style: col.align ? { 'text-align': col.align } : undefined
      },
      col.render ? col.render(row) : col.format ? col.format(row[col.key], row) : String(row[col.key] ?? '')
      ))));
    });
  };

  const tableEl = h('table', { class: cls('table') },
    h('thead', null,
      h('tr', null,
        ...columns.map((col) => h('th', {
          class: [`${cls('table')}-head`, { [`${cls('table')}-sortable`]: !!col.sortable }],
          style: col.align ? { 'text-align': col.align } : undefined,
          onClick: col.sortable ? () => {
            if (sortKey === col.key) sortDir = -sortDir;
            else { sortKey = col.key; sortDir = 1; }
            renderRows();
          } : undefined
        }, col.title, col.sortable ? h('span', { class: `${cls('table')}-sort-hint` }) : null)
        )
      )
    ),
    body
  );

  renderRows();
  return tableEl;
}

// ---------------------------------------------------------------- Toast --

export type ToastType = 'info' | 'success' | 'error' | 'warning';

export interface ToastOptions {
  type?: ToastType;
  duration?: number;
}

const TOAST_MAX = 5;

function ensureToastHost(): HTMLElement {
  let host = typeof document !== 'undefined' ? document.querySelector(`.${cls('toast-host')}`) : null;
  if (!host) {
    host = h('div', { class: cls('toast-host'), ariaLive: 'polite' });
    document.body.append(host);
  }
  return host as HTMLElement;
}

export function toast(message: string, options: ToastOptions = {}): HTMLElement {
  const { type = 'info', duration = 3200 } = options;
  const host = ensureToastHost();
  while (host.children.length >= TOAST_MAX) {
    host.firstElementChild?.remove();
  }
  const item = h('div', { class: [cls('toast'), `${cls('toast')}-${type}`], role: 'status', text: message });
  host.append(item);
  // 进入动画：下一帧 class 控制（无 CSS 环境也无碍）
  setTimeout(() => item.classList.add(`${cls('toast')}-in`), 0);
  if (duration > 0) {
    setTimeout(() => {
      item.classList.remove(`${cls('toast')}-in`);
      setTimeout(() => item.remove(), 180);
    }, duration);
  }
  return item;
}

toast.dismissAll = (): void => {
  if (typeof document === 'undefined') return;
  const host = document.querySelector(`.${cls('toast-host')}`);
  if (host) host.replaceChildren();
};
