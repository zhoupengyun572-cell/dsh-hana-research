// 主题桥（外链版）：从父窗口链（DSH 主文档，同源）读取宿主主题变量写入本页 :root。
// 与 pages.js 的 THEME_BRIDGE_SCRIPT 等价，但作为独立脚本以兼容官方 viewer 的 CSP。
// v3：
//  - 沿 parent 链向上查找最近一个暴露 --dsw-alias-* tokens 的文档（支持多层 iframe 嵌套）；
//  - 找不到宿主 tokens 时回退读取最近祖先的本地主题变量（--accent/--bg/--text 等）；
//  - 监听宿主文档主题类名/内联样式变化，宿主切换主题时实时同步。

(function () {
  'use strict';

  var map = {
    "--bg": "--dsw-alias-bg-base",
    "--bg-card": "--dsw-alias-bg-layer-1",
    "--text": "--dsw-alias-label-primary",
    "--text-muted": "--dsw-alias-label-secondary",
    "--border": "--dsw-alias-border-l1",
    "--overlay-medium": "--dsw-alias-border-l2",
    "--accent": "--dsw-alias-brand-primary",
    "--green": "--dsw-alias-state-success-primary",
    "--coral": "--dsw-alias-state-warn-primary",
    "--danger": "--dsw-alias-state-error-primary",
  };

  // 本地变量回退（祖先文档已做过主题注入时的键名）
  var localMap = {
    "--bg": "--bg",
    "--bg-card": "--bg-card",
    "--text": "--text",
    "--text-muted": "--text-muted",
    "--border": "--border",
    "--overlay-medium": "--overlay-medium",
    "--accent": "--accent",
    "--green": "--green",
    "--coral": "--coral",
    "--danger": "--danger",
  };

  function toRgb(cssColor) {
    var match = /rgba?\(([^)]+)\)/.exec(cssColor);
    if (!match) return null;
    return match[1].split(',').map(function (s) { return s.trim(); }).slice(0, 3).join(', ');
  }

  /** 沿同源 parent 链找最近一个有主题来源的文档；返回 { doc, mode }（mode: token|local）。 */
  function findThemeSource() {
    var win = window;
    var visited = 0;
    while (win && win.parent && win.parent !== win && visited < 10) {
      win = win.parent;
      visited += 1;
      try {
        if (win.document === document) continue;
        var doc = win.document;
        // DSH 主题 tokens 定义在 body 上（也可在 html），两者都查
        var styles = win.getComputedStyle(doc.body || doc.documentElement);
        var hasToken = styles.getPropertyValue('--dsw-alias-brand-primary').trim() ||
          styles.getPropertyValue('--dsw-alias-bg-base').trim();
        if (hasToken) return { doc: doc, mode: 'token' };
      } catch (e) {
        // 跨源：停止向上（无法读取）
        break;
      }
    }
    // 无宿主 tokens：回退找最近一个设置了本地主题变量的祖先
    win = window;
    visited = 0;
    while (win && win.parent && win.parent !== win && visited < 10) {
      win = win.parent;
      visited += 1;
      try {
        if (win.document === document) continue;
        var doc = win.document;
        var styles = win.getComputedStyle(doc.body || doc.documentElement);
        if (styles.getPropertyValue('--accent').trim() || styles.getPropertyValue('--bg').trim()) {
          return { doc: doc, mode: 'local' };
        }
      } catch (e) {
        break;
      }
    }
    return null;
  }

  function applyTheme() {
    try {
      var source = findThemeSource();
      if (!source) return;
      var doc = source.doc;
      var styles = doc.defaultView.getComputedStyle(doc.body || doc.documentElement);
      var root = document.documentElement;
      var useMap = source.mode === 'token' ? map : localMap;
      for (var key in useMap) {
        var value = styles.getPropertyValue(useMap[key]).trim();
        if (!value) continue;
        root.style.setProperty(key, value);
        if (key === '--green' || key === '--coral' || key === '--danger') {
          var rgb = toRgb(value);
          if (rgb) root.style.setProperty(key + '-rgb', rgb);
        }
      }
    } catch (e) { /* 独立打开或跨源时使用 CSS fallback */ }
  }

  applyTheme();
  // 自身文档就绪后重试一次（父文档 body 可能晚于本脚本解析）
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { applyTheme(); }, { once: true });
  } else {
    window.setTimeout(applyTheme, 0);
  }

  // 监听宿主主题切换：DSH 切换主题会改 documentElement 的 class/属性或内联变量。
  try {
    var source = findThemeSource();
    if (source && source.doc !== document) {
      var observer = new MutationObserver(function () { applyTheme(); });
      observer.observe(source.doc.documentElement, {
        attributes: true, attributeFilter: ['class', 'style', 'data-theme'],
        subtree: false, childList: false,
      });
      // 某些实现把主题变量挂在 body 上：兜底监听
      var fallback = new MutationObserver(function () { applyTheme(); });
      if (source.doc.body) {
        fallback.observe(source.doc.body, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
      }
    }
  } catch (e) { /* 忽略监听失败 */ }
})();
