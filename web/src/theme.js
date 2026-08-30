// 工作区主题：读取 DSH 宿主 tokens（挂在 GUI body 上，同源 iframe 可读），
// 生成 EmbedPDF viewer 主题与工作区 CSS 变量。支持 浅色/深色/跟随宿主 三模式。

/** 从父文档链读取宿主 DSW token（向上查找，兼容多层 iframe）。 */
export function readHostTokens() {
  let win = window;
  let visited = 0;
  while (win && win.parent && win.parent !== win && visited < 10) {
    win = win.parent;
    visited += 1;
    try {
      if (win.document === document) continue;
      const doc = win.document;
      const styles = win.getComputedStyle(doc.body || doc.documentElement);
      const brand = styles.getPropertyValue('--dsw-alias-brand-primary').trim();
      const bgBase = styles.getPropertyValue('--dsw-alias-bg-base').trim();
      if (brand || bgBase) {
        return {
          brand, bgBase,
          bgLayer1: styles.getPropertyValue('--dsw-alias-bg-layer-1').trim(),
          labelPrimary: styles.getPropertyValue('--dsw-alias-label-primary').trim(),
          labelSecondary: styles.getPropertyValue('--dsw-alias-label-secondary').trim(),
          borderL1: styles.getPropertyValue('--dsw-alias-border-l1').trim(),
          borderL2: styles.getPropertyValue('--dsw-alias-border-l2').trim(),
          success: styles.getPropertyValue('--dsw-alias-state-success-primary').trim(),
          warn: styles.getPropertyValue('--dsw-alias-state-warn-primary').trim(),
          error: styles.getPropertyValue('--dsw-alias-state-error-primary').trim(),
          source: doc,
        };
      }
    } catch (e) {
      break; // 跨源：停止
    }
  }
  return null;
}

/** 解析任意 CSS 颜色字符串为 [r,g,b,a]（0-255 / 0-1）。 */
export function parseColor(css) {
  const raw = String(css || '').trim();
  if (!raw) return null;
  let match = /^#([0-9a-f]{6})$/i.exec(raw);
  if (match) {
    const n = parseInt(match[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  match = /^#([0-9a-f]{3})$/i.exec(raw);
  if (match) {
    const hex = match[1].split('').map(c => c + c).join('');
    const n = parseInt(hex, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  match = /^rgba?\(([^)]+)\)$/i.exec(raw);
  if (match) {
    const parts = match[1].split(',').map(s => parseFloat(s.trim()));
    return [parts[0], parts[1], parts[2], parts.length > 3 ? parts[3] : 1];
  }
  return null;
}

function channelMix(a, b, ratio) {
  return Math.round(a + (b - a) * ratio);
}

/** 两个颜色按 ratio 混合（ratio=0 → 全 a，1 → 全 b），输出 #rrggbb。 */
export function mixColor(colorA, colorB, ratio, fallback = '#666666') {
  const a = parseColor(colorA);
  const b = parseColor(colorB);
  if (!a || !b) return fallback;
  const r = channelMix(a[0], b[0], ratio);
  const g = channelMix(a[1], b[1], ratio);
  const bl = channelMix(a[2], b[2], ratio);
  return '#' + [r, g, bl].map(n => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0')).join('');
}

/** 相对亮度（0-1），用于判断明暗主题。 */
export function luminance(css, fallback = 1) {
  const c = parseColor(css);
  if (!c) return fallback;
  return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
}

const DEFAULTS = {
  light: {
    bgBase: '#f5f4f1', bgLayer1: '#ffffff', labelPrimary: '#26241f',
    labelSecondary: '#6f6a60', borderL1: '#e0ddd6', borderL2: '#d0ccc2',
    brand: '#9c4f33', success: '#52705d', warn: '#8a6d3b', error: '#9a3f35',
  },
  dark: {
    bgBase: '#0C121B', bgLayer1: '#141c28', labelPrimary: '#EAF2FC',
    labelSecondary: '#93a4b8', borderL1: '#26313f', borderL2: '#3a4757',
    brand: '#5e93c9', success: '#5fae7d', warn: '#d5a253', error: '#d06a60',
  },
};

/**
 * 宿主 tokens（可缺失）→ 规范化调色板。
 * mode：'auto' 跟随宿主明暗；'light'/'dark' 强制。强制模式与宿主明暗相左时
 * 整体改用内置调色板，保证"强制深色"不会出现深色文字配浅色底的面板。
 */
export function paletteFromTokens(tokens, mode = 'auto') {
  const hostDark = tokens?.bgBase ? luminance(tokens.bgBase) < 0.35 : false;
  const forced = mode === 'light' || mode === 'dark' ? mode : null;
  const dark = forced ? forced === 'dark' : hostDark;
  const source = forced && (forced === 'dark') !== hostDark ? null : tokens;
  const d = dark ? DEFAULTS.dark : DEFAULTS.light;
  const pick = (value, fallback) => (value && parseColor(value) ? value : fallback);
  return {
    dark,
    bgBase: pick(source?.bgBase, d.bgBase),
    bgLayer1: pick(source?.bgLayer1, d.bgLayer1),
    labelPrimary: pick(source?.labelPrimary, d.labelPrimary),
    labelSecondary: pick(source?.labelSecondary, d.labelSecondary),
    borderL1: pick(source?.borderL1, d.borderL1),
    borderL2: pick(source?.borderL2, d.borderL2),
    brand: pick(source?.brand, d.brand),
    success: pick(source?.success, d.success),
    warn: pick(source?.warn, d.warn),
    error: pick(source?.error, d.error),
  };
}

/**
 * 构建 EmbedPDF 的 theme 配置：
 *  - preference: 'light' | 'dark'（跟随宿主亮度或用户强制）
 *  - light/dark 覆盖全部使用宿主 token 映射（token 本身已随宿主主题变化）
 */
export function buildViewerTheme(palette, mode = 'auto') {
  const preference = mode === 'auto' ? (palette.dark ? 'dark' : 'light') : mode;
  const overlay = {
    background: {
      app: palette.bgBase,
      surface: palette.bgLayer1,
      surfaceAlt: mixColor(palette.bgLayer1, palette.bgBase, 0.5, palette.bgBase),
      elevated: palette.bgLayer1,
      overlay: 'rgba(0, 0, 0, 0.42)',
      input: palette.bgBase,
    },
    foreground: {
      primary: palette.labelPrimary,
      secondary: palette.labelSecondary,
      muted: mixColor(palette.labelSecondary, palette.bgBase, 0.35, palette.labelSecondary),
      disabled: mixColor(palette.labelSecondary, palette.bgBase, 0.55, palette.labelSecondary),
      onAccent: '#ffffff',
    },
    border: {
      default: palette.borderL1,
      subtle: palette.borderL2,
      strong: mixColor(palette.borderL1, palette.labelPrimary, 0.4, palette.borderL1),
    },
    accent: {
      primary: palette.brand,
      primaryHover: mixColor(palette.brand, palette.labelPrimary, 0.18, palette.brand),
      primaryActive: mixColor(palette.brand, palette.labelPrimary, 0.32, palette.brand),
      primaryLight: mixColor(palette.brand, palette.bgBase, 0.82, palette.bgBase),
      primaryForeground: '#ffffff',
    },
    interactive: {
      hover: mixColor(palette.labelPrimary, palette.bgBase, 0.92, palette.bgBase),
      active: mixColor(palette.labelPrimary, palette.bgBase, 0.85, palette.bgBase),
      selected: mixColor(palette.brand, palette.bgBase, 0.82, palette.bgBase),
      focus: palette.brand,
      focusRing: mixColor(palette.brand, palette.bgBase, 0.7, palette.bgBase),
    },
    state: {
      error: palette.error,
      errorLight: mixColor(palette.error, palette.bgBase, 0.85, palette.bgBase),
      warning: palette.warn,
      warningLight: mixColor(palette.warn, palette.bgBase, 0.85, palette.bgBase),
      success: palette.success,
      successLight: mixColor(palette.success, palette.bgBase, 0.85, palette.bgBase),
      info: palette.brand,
      infoLight: mixColor(palette.brand, palette.bgBase, 0.85, palette.bgBase),
    },
  };
  return {
    preference,
    light: overlay,
    dark: overlay,
  };
}

/** 把调色板写入工作区 CSS 变量（:root），供 Tiptap/面板样式使用。 */
export function applyPaletteCssVars(palette) {
  const root = document.documentElement;
  const set = (name, value) => root.style.setProperty(name, value);
  set('--wb-bg', palette.bgBase);
  set('--wb-bg-layer', palette.bgLayer1);
  set('--wb-text', palette.labelPrimary);
  set('--wb-text-muted', palette.labelSecondary);
  set('--wb-border', palette.borderL1);
  set('--wb-border-strong', palette.borderL2);
  set('--wb-accent', palette.brand);
  set('--wb-accent-soft', mixColor(palette.brand, palette.bgBase, 0.88, palette.bgBase));
  set('--wb-success', palette.success);
  set('--wb-warn', palette.warn);
  set('--wb-danger', palette.error);
  set('--wb-hover', mixColor(palette.labelPrimary, palette.bgBase, 0.93, palette.bgBase));
  set('--wb-active', mixColor(palette.labelPrimary, palette.bgBase, 0.87, palette.bgBase));
  set('--wb-selected', mixColor(palette.brand, palette.bgBase, 0.85, palette.bgBase));
}

/** 监听宿主主题切换：tokens 变化时回调。返回取消函数。 */
export function watchHostTheme(onChange) {
  const tokens = readHostTokens();
  if (!tokens?.source) return () => {};
  const apply = () => onChange(readHostTokens());
  const observer = new MutationObserver(apply);
  observer.observe(tokens.source.documentElement, {
    attributes: true, attributeFilter: ['class', 'style', 'data-theme'], subtree: false,
  });
  if (tokens.source.body) {
    observer.observe(tokens.source.body, {
      attributes: true, attributeFilter: ['class', 'style', 'data-theme'],
    });
  }
  return () => observer.disconnect();
}
