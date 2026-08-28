export const READER_THEME_STORAGE_KEY = 'hana-reader-theme-mode';

const THEME_MODES = new Set(['auto', 'light', 'dark']);

export function readReaderTheme(storage = globalThis?.localStorage) {
  try {
    const value = storage?.getItem?.(READER_THEME_STORAGE_KEY);
    return THEME_MODES.has(value) ? value : 'auto';
  } catch {
    return 'auto';
  }
}

export function writeReaderTheme(mode, storage = globalThis?.localStorage) {
  if (!THEME_MODES.has(mode)) return false;
  try {
    storage?.setItem?.(READER_THEME_STORAGE_KEY, mode);
    return true;
  } catch {
    return false;
  }
}

export function bookmarkPageNumber(target) {
  if (!target) return null;
  const destination = target.type === 'destination'
    ? target.destination
    : target.type === 'action' && (target.action?.type === 'goTo' || target.action?.type === 1)
      ? target.action.destination
      : null;
  return Number.isInteger(destination?.pageIndex) ? destination.pageIndex + 1 : null;
}

export function countBookmarks(items) {
  return (Array.isArray(items) ? items : []).reduce(
    (total, item) => total + 1 + countBookmarks(item?.children),
    0,
  );
}
