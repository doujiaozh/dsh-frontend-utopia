import { test, expect } from '../../../scripts/utest.js';
import { formatDate, fromNow, toDate } from '../src/date.js';

test('formatDate: 基础模式 YYYY-MM-DD HH:mm:ss', () => {
  const fixed = new Date('2026-03-09T12:05:09.123Z');
  expect(formatDate(fixed, 'YYYY-MM-DD HH:mm:ss', { timeZone: 'UTC' })).toBe('2026-03-09 12:05:09');
  expect(formatDate(fixed, 'YYYY/MM/DD', { timeZone: 'UTC' })).toBe('2026/03/09');
  expect(formatDate(fixed, 'YY-M-D', { timeZone: 'UTC' })).toBe('26-3-9');
});

test('formatDate: 毫秒与 12 小时制', () => {
  const fixed = new Date('2026-03-09T12:05:09.123Z');
  expect(formatDate(fixed, 'HH:mm:ss.SSS', { timeZone: 'UTC' })).toBe('12:05:09.123');
  const am = new Date('2026-03-09T01:05:09.000Z');
  const period = formatDate(am, 'hh:mm A', { locale: 'en-US', timeZone: 'UTC' });
  expect(period).toBe('01:05 AM');
});

test('formatDate: 中文星期与月份名', () => {
  const fixed = new Date('2026-03-09T12:00:00.000Z');
  const zh = formatDate(fixed, 'M 月 D 日dddd', { locale: 'zh-CN', timeZone: 'UTC' });
  expect(zh).toBe('3 月 9 日星期一');
});

test('formatDate: 时区切换确实生效', () => {
  const fixed = new Date('2026-03-09T12:00:00.000Z');
  const sh = formatDate(fixed, 'YYYY-MM-DD HH:mm', { timeZone: 'Asia/Shanghai' });
  const ny = formatDate(fixed, 'YYYY-MM-DD HH:mm', { timeZone: 'America/New_York' });
  expect(sh).toBe('2026-03-09 20:00');
  // 2026-03-08 起美国进入夏令时，纽约为 UTC-4
  expect(ny).toBe('2026-03-09 08:00');
});

test('fromNow: 过去 / 未来 / 刚刚', () => {
  const past = new Date(Date.now() - 2 * 60 * 1000);
  const future = new Date(Date.now() + 5 * 60 * 1000);
  expect(fromNow(past, 'en-US')).toContain('2 minutes');
  expect(fromNow(future, 'en-US')).toContain('in 5 minutes');
  expect(fromNow(Date.now(), 'en-US')).toBe('now');
});

test('toDate: 非法日期抛 RangeError', () => {
  expect(() => toDate('not-a-date')).toThrow(/非法日期/);
});
