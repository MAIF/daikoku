import { expect, test } from '@playwright/test';
import { updateSelectedRowCache } from '../../src/components/inputs/tableSelection';

const first = { id: 'first', name: 'First' };
const second = { id: 'second', name: 'Second' };
const third = { id: 'third', name: 'Third' };
const getRowId = (row: typeof first) => row.id;

test('keeps selected rows across three pages and a filtered empty page', () => {
  let cache = updateSelectedRowCache(new Map(), [first], { first: true }, getRowId);
  cache = updateSelectedRowCache(cache, [second], { first: true, second: true }, getRowId);
  cache = updateSelectedRowCache(
    cache,
    [third],
    { first: true, second: true, third: true },
    getRowId
  );
  cache = updateSelectedRowCache(cache, [], { first: true, second: true, third: true }, getRowId);

  expect([...cache.values()]).toEqual([first, second, third]);
});

test('removes deselected off-page rows without clearing the others', () => {
  const previous = new Map([
    [first.id, first],
    [second.id, second],
  ]);
  const cache = updateSelectedRowCache(previous, [third], { first: false, second: true }, getRowId);

  expect([...cache.values()]).toEqual([second]);
  expect(previous.size).toBe(2);
});

test('refreshes selected row data when its page is loaded again', () => {
  const updated = { ...first, name: 'Updated' };
  const previous = new Map([
    [first.id, first],
    [second.id, second],
  ]);
  const cache = updateSelectedRowCache(
    previous,
    [updated],
    { first: true, second: true },
    getRowId
  );

  expect([...cache.values()]).toEqual([updated, second]);
});

test('clears cached rows when the selection is reset', () => {
  const cache = updateSelectedRowCache(new Map([[first.id, first]]), [second], {}, getRowId);

  expect(cache.size).toBe(0);
});

test('reuses the cache when loading or sorting does not change selected data', () => {
  const previous = new Map([
    [first.id, first],
    [second.id, second],
  ]);
  const selection = { first: true, second: true };

  expect(updateSelectedRowCache(previous, [], selection, getRowId)).toBe(previous);
  expect(updateSelectedRowCache(previous, [second, first], selection, getRowId)).toBe(previous);
});
