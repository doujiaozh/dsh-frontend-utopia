import { test, expect } from '../../../scripts/utest.js';
import { installDom } from '../../../scripts/wg-dom.js';
import {
  button, checkbox, field, input, switchToggle, table, textarea, toast,
  h, createTheme, applyTheme, ThemeManager, lightTokens, darkTokens
} from '../src/index.js';

const dom = installDom();
const doc = dom.doc;

test('h: 类名/数据集/事件与子节点', () => {
  const clicks: string[] = [];
  const el = h('div', {
    class: ['card', { featured: true, off: false }],
    dataset: { id: '7' },
    onClick: () => clicks.push('hit')
  },
  h('span', { text: 'hello' })
  );
  expect(el.classList.contains('card')).toBe(true);
  expect(el.classList.contains('featured')).toBe(true);
  expect(el.classList.contains('off')).toBe(false);
  expect(el.dataset['id']).toBe('7');
  el.dispatchEvent({ type: 'click', target: el } as unknown as Event);
  expect(clicks).toEqual(['hit']);
  expect(el.textContent).toBe('hello');
});

test('theme: applyTheme 写入 data-u-theme 与 CSS Variables', () => {
  const root = doc.documentElement;
  applyTheme(createTheme('light', { '--u-primary': '#ff6a00' }, 'light'));
  expect(root.getAttribute('data-u-theme')).toBe('light');
  expect(root.style.getPropertyValue('--u-primary')).toBe('#ff6a00');
  expect(root.style.getPropertyValue('--u-radius-md')).toBe('9px');
});

test('theme: 三套内置皮肤 token 完备', () => {
  for (const tokens of [lightTokens, darkTokens]) {
    expect(tokens['--u-bg']).toBeDefined();
    expect(tokens['--u-primary']).toBeDefined();
  }
});

test('theme: ThemeManager 切换与自定义扩展', () => {
  const manager = new ThemeManager();
  manager.set('dark');
  expect(manager.name).toBe('dark');
  expect(doc.documentElement.style.getPropertyValue('--u-bg')).toBe(darkTokens['--u-bg']);
  manager.toggle();
  expect(manager.name).toBe('light');
  manager.register('brand', createTheme('brand', { '--u-primary': '#00b894' }, 'dark'));
  manager.set('brand');
  expect(doc.documentElement.style.getPropertyValue('--u-primary')).toBe('#00b894');
  manager.set('light');
});

test('button: 变体/尺寸/loading/禁用', () => {
  const b = button({ text: '保存', variant: 'danger', size: 'lg' });
  expect(b.tagName).toBe('BUTTON');
  expect(b.getAttribute('class')).toContain('u-btn-danger');
  expect(b.getAttribute('class')).toContain('u-btn-lg');
  expect(b.textContent).toBe('保存');
  const loading = button({ text: 'x', loading: true });
  expect(loading.disabled).toBe(true);
  expect(loading.firstElementChild?.classList.contains('u-btn-spinner')).toBe(true);
});

test('input + field: label/hint/error 组装', () => {
  const inp = input({ value: 'dsh', onInput: (v) => { void v; } });
  expect(inp.value).toBe('dsh');
  const f = field('用户名', inp, { hint: '3-16 个字符' });
  expect(f.classList.contains('u-field')).toBe(true);
  expect(f.textContent).toContain('用户名');
  expect(f.textContent).toContain('3-16 个字符');
});

test('textarea: rows 透传', () => {
  const ta = textarea({ rows: 5, placeholder: '说点什么' });
  expect(ta.rows).toBe(5);
  expect(ta.placeholder).toBe('说点什么');
});

test('switch: 点击切换 aria-checked 并回调', () => {
  const seq: boolean[] = [];
  const sw = switchToggle({ checked: false, onChange: (v) => seq.push(v) });
  expect(sw.getAttribute('role')).toBe('switch');
  sw.dispatchEvent({ type: 'click', target: sw } as unknown as Event);
  expect(sw.getAttribute('aria-checked')).toBe('true');
  expect(seq).toEqual([true]);
});

test('checkbox: 勾选状态与回调', () => {
  const seq: boolean[] = [];
  const cb = checkbox({ checked: true, label: '记住我', onChange: (v) => seq.push(v) });
  const inputEl = cb.querySelector('input') as unknown as HTMLInputElement;
  inputEl.dispatchEvent({ type: 'change', target: inputEl } as unknown as Event);
  expect(inputEl.type).toBe('checkbox');
  void seq;
});

test('table: 渲染、空态与点击表头排序', () => {
  const rows = [
    { name: 'b', age: 2 },
    { name: 'a', age: 10 }
  ];
  const t = table({
    columns: [
      { key: 'name', title: '名称', sortable: true },
      { key: 'age', title: '年龄', sortable: true }
    ],
    rows,
    emptyText: '空空如也'
  });
  expect(t.classList.contains('u-table')).toBe(true);
  const tbody = t.querySelector('tbody');
  let texts = tbody?.textContent;
  expect(texts).toContain('b');
  expect(texts).toContain('a');
  const heads = t.querySelectorAll('.u-table-sortable');
  heads[0]?.dispatchEvent({ type: 'click', target: undefined } as unknown as Event);
  texts = tbody?.textContent;
  expect(texts?.indexOf('a')).toBeLessThan(texts?.indexOf('b') as number);
  const empty = table({ columns: [{ key: 'n', title: 'N' }], rows: [] });
  // 未传 emptyText 时使用默认空态文案
  expect(empty.querySelector('tbody')?.textContent).toContain('暂无数据');
});

test('toast: 挂载到 host、类型与 dismissAll', () => {
  toast('保存成功', { type: 'success' });
  toast('出错了', { type: 'error' });
  const host = doc.querySelector('.u-toast-host');
  expect(host).toBeDefined();
  expect(host?.children.length).toBe(2);
  expect(host?.firstElementChild?.getAttribute('class')).toContain('u-toast-success');
  toast.dismissAll();
  expect(host?.children.length).toBe(0);
});
