import { test, expect } from '../../../scripts/utest.js';
import { unique, uniqBy } from '../src/unique.js';

test('unique: 原始值去重', () => {
  expect(unique([1, 1, 2, 3, 3, 'a', 'a'])).toEqual([1, 2, 3, 'a']);
  expect(unique([])).toEqual([]);
});

test('uniqBy: 按业务键去重', () => {
  const users = [
    { id: 1, name: 'a' },
    { id: 2, name: 'b' },
    { id: 1, name: 'c' }
  ];
  expect(uniqBy(users, u => u.id)).toEqual([{ id: 1, name: 'a' }, { id: 2, name: 'b' }]);
});
