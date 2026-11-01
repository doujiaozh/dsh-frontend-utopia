/**
 * @utopia/utils —— 全能工具集（零依赖）
 *
 * 用 ES6+ 手写替代 Lodash 的常用能力，用原生 Intl 替代 Moment/Day.js 的格式化能力。
 */
export { debounce, type DebouncedFunction } from './debounce.js';
export { throttle, type ThrottledFunction } from './throttle.js';
export { deepClone } from './deepClone.js';
export { unique, uniqBy } from './unique.js';
export { toDate, formatDate, fromNow, type DateFormatOptions } from './date.js';
export { isObject, isFunction, isPlainObject, isPrimitive, isArrayLike, typeOf } from './is.js';
export { sleep, noop, identity, range } from './misc.js';
