import assert from 'node:assert/strict';
import test from 'node:test';
import {
  READER_THEME_STORAGE_KEY,
  bookmarkPageNumber,
  countBookmarks,
  readReaderTheme,
  writeReaderTheme,
} from '../src/workspace-utils.js';

test('reader theme preference validates and survives storage failures', () => {
  const values = new Map([[READER_THEME_STORAGE_KEY, 'dark']]);
  const storage = {
    getItem: (key) => values.get(key),
    setItem: (key, value) => values.set(key, value),
  };
  assert.equal(readReaderTheme(storage), 'dark');
  assert.equal(writeReaderTheme('light', storage), true);
  assert.equal(readReaderTheme(storage), 'light');
  values.set(READER_THEME_STORAGE_KEY, 'sepia');
  assert.equal(readReaderTheme(storage), 'auto');
  assert.equal(writeReaderTheme('sepia', storage), false);
  assert.equal(readReaderTheme({ getItem() { throw new Error('blocked'); } }), 'auto');
});

test('bookmark helpers resolve destinations and nested counts', () => {
  assert.equal(bookmarkPageNumber({ type: 'destination', destination: { pageIndex: 3 } }), 4);
  assert.equal(bookmarkPageNumber({ type: 'action', action: { type: 'uri', uri: 'https://example.com' } }), null);
  assert.equal(countBookmarks([{ title: 'A', children: [{ title: 'A.1' }] }, { title: 'B' }]), 3);
});
