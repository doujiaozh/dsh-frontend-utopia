import { isObject } from './is.js';

export interface DateFormatOptions {
  /** BCP 47 语言标签，默认跟随运行环境 */
  locale?: string;
  /** IANA 时区，如 'Asia/Shanghai'、'UTC' */
  timeZone?: string;
}

/**
 * 安全的日期归一化：拒绝 NaN 日期。
 */
export function toDate(value: Date | number | string): Date {
  const d = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new RangeError(`utopia: 非法日期值 ${String(value)}`);
  }
  return d;
}

// ---------------------------------------------------------------- Intl 引擎 --

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(locale: string | undefined, timeZone: string | undefined, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = [locale ?? '', timeZone ?? '', JSON.stringify(options)].join('|');
  let f = formatterCache.get(key);
  if (!f) {
    const opts: Intl.DateTimeFormatOptions = { ...options };
    if (timeZone) opts.timeZone = timeZone;
    f = new Intl.DateTimeFormat(locale, opts);
    formatterCache.set(key, f);
  }
  return f;
}

function partValue(date: Date, locale: string | undefined, timeZone: string | undefined, options: Intl.DateTimeFormatOptions, type: string): string {
  const parts = getFormatter(locale, timeZone, options).formatToParts(date);
  for (const p of parts) {
    if (p.type === type) return p.value;
  }
  return '';
}

function pad(value: string | number, len = 2): string {
  return String(value).padStart(len, '0');
}

type TokenResolver = Record<string, () => string>;

function buildResolver(date: Date, options: DateFormatOptions): TokenResolver {
  const { locale, timeZone } = options;
  return {
    YYYY: () => pad(partValue(date, locale, timeZone, { year: 'numeric' }, 'year'), 4),
    YY: () => pad(partValue(date, locale, timeZone, { year: 'numeric' }, 'year'), 4).slice(2, 4),
    MMMM: () => partValue(date, locale, timeZone, { month: 'long' }, 'month'),
    MMM: () => partValue(date, locale, timeZone, { month: 'short' }, 'month'),
    MM: () => partValue(date, locale, timeZone, { month: '2-digit' }, 'month'),
    M: () => partValue(date, locale, timeZone, { month: 'numeric' }, 'month'),
    DD: () => partValue(date, locale, timeZone, { day: '2-digit' }, 'day'),
    D: () => partValue(date, locale, timeZone, { day: 'numeric' }, 'day'),
    dddd: () => partValue(date, locale, timeZone, { weekday: 'long' }, 'weekday'),
    ddd: () => partValue(date, locale, timeZone, { weekday: 'short' }, 'weekday'),
    HH: () => partValue(date, locale, timeZone, { hour: '2-digit', hour12: false }, 'hour'),
    H: () => partValue(date, locale, timeZone, { hour: 'numeric', hour12: false }, 'hour'),
    hh: () => pad(partValue(date, locale, timeZone, { hour: '2-digit', hour12: true }, 'hour')),
    h: () => partValue(date, locale, timeZone, { hour: 'numeric', hour12: true }, 'hour'),
    mm: () => pad(partValue(date, locale, timeZone, { minute: '2-digit' }, 'minute')),
    m: () => partValue(date, locale, timeZone, { minute: 'numeric' }, 'minute'),
    ss: () => pad(partValue(date, locale, timeZone, { second: '2-digit' }, 'second')),
    s: () => partValue(date, locale, timeZone, { second: 'numeric' }, 'second'),
    SSS: () => pad(date.getMilliseconds(), 3),
    A: () => partValue(date, locale, timeZone, { hour: '2-digit', hour12: true }, 'dayPeriod').toUpperCase(),
    a: () => partValue(date, locale, timeZone, { hour: '2-digit', hour12: true }, 'dayPeriod').toLowerCase()
  };
}

const TOKEN_LIST = ['YYYY', 'YY', 'MMMM', 'MMM', 'MM', 'M', 'DD', 'D', 'dddd', 'ddd', 'HH', 'H', 'hh', 'h', 'mm', 'm', 'ss', 's', 'SSS', 'A', 'a'];
const TOKEN_RE = new RegExp(TOKEN_LIST.join('|'), 'g');

/**
 * Intl 原生日期格式化：完全基于 Intl.DateTimeFormat，无时区计算错误风险。
 *
 * @example
 * formatDate(new Date(), 'YYYY-MM-DD HH:mm:ss')
 * formatDate(now, 'YYYY 年 M 月 D 日 dddd', { locale: 'zh-CN', timeZone: 'Asia/Shanghai' })
 */
export function formatDate(value: Date | number | string, pattern = 'YYYY-MM-DD HH:mm:ss', options: DateFormatOptions = {}): string {
  const date = toDate(value);
  const resolver = buildResolver(date, options);
  return pattern.replace(TOKEN_RE, (token) => {
    const fn = resolver[token];
    return fn ? fn() : token;
  });
}

// -------------------------------------------------------------- 相对时间 --

const RELATIVE_UNITS: Array<[number, Intl.RelativeTimeFormatUnit]> = [
  [31536000000, 'year'],
  [2592000000, 'month'],
  [86400000, 'day'],
  [3600000, 'hour'],
  [60000, 'minute'],
  [1000, 'second']
];

/**
 * 基于 Intl.RelativeTimeFormat 的“x 分钟前 / in 5 minutes”，自动跟随 locale。
 */
export function fromNow(value: Date | number | string, locale?: string): string {
  const date = toDate(value);
  const diff = date.getTime() - Date.now();
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  for (const [ms, unit] of RELATIVE_UNITS) {
    if (abs >= ms) return rtf.format(Math.round(diff / ms), unit);
  }
  return rtf.format(0, 'second');
}

/** 判断值是否为合法日期（可被 toDate 接受） */
export function isValidDate(value: unknown): value is Date | number | string {
  if (isObject(value) && !(value instanceof Date)) return false;
  try {
    toDate(value as Date | number | string);
    return true;
  } catch {
    return false;
  }
}
