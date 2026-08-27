// DSH 移植：研究页面壳与静态资产服务。
// 原版（OpenHanako）由宿主挂载 iframe 页面与插件资产；DSH 下由插件自身的
// webServer prefix 路由（/ui/hana-research）直接服务，同源 iframe 嵌入。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HANA_RELEASE_VERSION } from "./version.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ASSET_DIR = path.join(HERE, "..", "assets");
/** 资源版本号：每次改版递增，强制浏览器/Electron iframe 绕过缓存加载新资源。 */
const ASSET_VERSION = HANA_RELEASE_VERSION;

const MIME = {
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".bcmap": "application/octet-stream",
  ".pfb": "application/octet-stream",
  ".wasm": "application/wasm",
  ".otf": "font/otf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

/** 宿主主题 → iframe 文档 CSS 变量映射（DSH token 名来自 Theme.listTokens）。 */
const THEME_MAP = {
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

/** 回退映射：祖先文档已注入过本地主题变量时按同名读取（多层 iframe 嵌套场景）。 */
const THEME_MAP_LOCAL = {
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

/** 页面加载早期从父窗口链（DSH 主文档，同源）读取主题变量写入本页 :root。
 *  v3：沿 parent 链找最近暴露 --dsw-alias-* 的文档（多层 iframe），找不到回退本地
 *  主题变量；监听宿主主题类名/内联样式变化，宿主切换主题时实时同步。 */
const THEME_BRIDGE_SCRIPT = `(function(){
  'use strict';
  var map = ${JSON.stringify(THEME_MAP)};
  var localMap = ${JSON.stringify(THEME_MAP_LOCAL)};
  function toRgb(cssColor) {
    var match = /rgba?\\(([^)]+)\\)/.exec(cssColor);
    if (!match) return null;
    return match[1].split(',').map(function(s){ return s.trim(); }).slice(0, 3).join(', ');
  }
  function findThemeSource() {
    var win = window, visited = 0;
    while (win && win.parent && win.parent !== win && visited < 10) {
      win = win.parent; visited += 1;
      try {
        if (win.document === document) continue;
        var doc = win.document;
        // DSH 主题 tokens 定义在 body 上（也可在 html），两者都查
        var styles = win.getComputedStyle(doc.body || doc.documentElement);
        if (styles.getPropertyValue('--dsw-alias-brand-primary').trim() ||
            styles.getPropertyValue('--dsw-alias-bg-base').trim()) return { doc: doc, mode: 'token' };
      } catch (e) { break; }
    }
    win = window; visited = 0;
    while (win && win.parent && win.parent !== win && visited < 10) {
      win = win.parent; visited += 1;
      try {
        if (win.document === document) continue;
        var doc = win.document;
        var styles = win.getComputedStyle(doc.body || doc.documentElement);
        if (styles.getPropertyValue('--accent').trim() || styles.getPropertyValue('--bg').trim()) return { doc: doc, mode: 'local' };
      } catch (e) { break; }
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
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { applyTheme(); }, { once: true });
  } else {
    window.setTimeout(applyTheme, 0);
  }
  try {
    var source = findThemeSource();
    if (source && source.doc !== document) {
      var observer = new MutationObserver(function () { applyTheme(); });
      observer.observe(source.doc.documentElement, {
        attributes: true, attributeFilter: ['class', 'style', 'data-theme'],
        subtree: false, childList: false
      });
      var fallback = new MutationObserver(function () { applyTheme(); });
      if (source.doc.body) {
        fallback.observe(source.doc.body, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
      }
    }
  } catch (e) { /* 忽略监听失败 */ }
})();`;

/** 首屏骨架（JS 加载前立即显示，避免纯空白）：标题条 + 搜索框 + 卡片占位。 */
const RESEARCH_SKELETON = `<div class="hr-skeleton" role="status" aria-label="正在加载文献工作区">
  <header class="hr-skel-bar">
    <span class="hr-skel-brand"></span><span class="hr-skel-pill"></span>
  </header>
  <div class="hr-skel-content">
    <div class="hr-skel-title"></div>
    <div class="hr-skel-search"></div>
    <div class="hr-skel-cards">
      <span class="hr-skel-card"></span><span class="hr-skel-card"></span><span class="hr-skel-card"></span>
      <span class="hr-skel-card"></span><span class="hr-skel-card"></span><span class="hr-skel-card"></span>
    </div>
  </div>
  <p class="hr-skel-status">正在加载文献工作区…</p>
</div>`;

function renderShell(workspace, companion) {
  const css = companion ? "research-companion.css" : "research.css";
  const js = companion ? "research-companion.js" : "research.js";
  const rootId = companion ? "research-companion-root" : "research-root";
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <script>${THEME_BRIDGE_SCRIPT}</script>
  <link rel="stylesheet" href="/ui/hana-research/assets/${css}?${ASSET_VERSION}">
</head>
<body data-hana-theme="inherit" data-workspace="${workspace}" data-release-version="${HANA_RELEASE_VERSION}">
  <main id="${rootId}">${companion ? '' : RESEARCH_SKELETON}</main>
  <script type="module" src="/ui/hana-research/assets/${js}?${ASSET_VERSION}"></script>
</body>
</html>`;
}

function renderCardShell(card) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <script>${THEME_BRIDGE_SCRIPT}</script>
  <link rel="stylesheet" href="/ui/hana-research/assets/research.css?${ASSET_VERSION}">
  <style>
    html, body { background: transparent !important; height: 100%; margin: 0; overflow: auto; }
    #card-root { min-height: 100%; }
  </style>
</head>
<body data-hana-theme="inherit" data-card="${card}">
  <main id="card-root"></main>
  <script type="module" src="/ui/hana-research/assets/research-cards.js?${ASSET_VERSION}"></script>
</body>
</html>`;
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

/** PDF 阅读器回退壳：官方 viewer 应用文件缺失时使用（组件层方案）。 */
function renderReaderShell() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <script>${THEME_BRIDGE_SCRIPT}</script>
  <link rel="stylesheet" href="/ui/hana-research/assets/vendor/pdfjs-viewer/pdf_viewer.css?${ASSET_VERSION}">
  <link rel="stylesheet" href="/ui/hana-research/assets/reader.css?${ASSET_VERSION}">
</head>
<body data-hana-theme="inherit">
  <div id="reader-app">
    <header id="reader-toolbar">
      <button id="reader-back" title="返回项目">← 返回</button>
      <div id="reader-title"><span id="reader-project"></span><strong id="reader-paper"></strong></div>
      <div class="reader-tool-group">
        <button id="reader-prev" title="上一页">←</button>
        <label id="reader-page-field"><input id="reader-page" inputmode="numeric" value="1"><span>/ <span id="reader-page-count">1</span></span></label>
        <button id="reader-next" title="下一页">→</button>
      </div>
      <div class="reader-tool-group">
        <button id="reader-zoom-out" title="缩小">−</button>
        <span id="reader-zoom">100%</span>
        <button id="reader-zoom-in" title="放大">＋</button>
        <button id="reader-fit" title="适应宽度">适应宽度</button>
      </div>
      <div class="reader-tool-group">
        <input id="reader-search" placeholder="查找…" title="全文搜索">
        <span id="reader-search-count"></span>
        <button id="reader-search-prev" title="上一处">↑</button>
        <button id="reader-search-next" title="下一处">↓</button>
        <button id="reader-search-close" title="关闭搜索">×</button>
      </div>
      <div class="reader-tool-group">
        <button id="reader-highlight" title="高亮模式：选中文字后弹出摘录保存" class="active">高亮</button>
        <button id="reader-notes" title="查看本 PDF 的摘录笔记">笔记</button>
      </div>
    </header>
    <div id="viewerContainer"><div id="viewer" class="pdfViewer"></div></div>
    <footer id="reader-statusbar"><span id="reader-status-page"></span><span id="reader-status-zoom"></span></footer>
  </div>
  <script type="module" src="/ui/hana-research/assets/reader-bridge.js?${ASSET_VERSION}"></script>
</body>
</html>`;
}

/** v12 阅读工作区壳（EmbedPDF + Tiptap 三栏）：最小 CSP（自托管 WASM/Worker/Blob/内联样式）。
 *  script-src 含 'unsafe-eval'：Emscripten（PDFium）JS glue 依赖 eval/new Function；
 *  主题桥用外链 theme-bridge.js（避免内联脚本违规）。 */
function renderWorkbenchShell() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'self'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self' data:; connect-src 'self' blob: data:; media-src blob:; base-uri 'none'; form-action 'none'">
  <script src="/ui/hana-research/assets/theme-bridge.js?${ASSET_VERSION}"></script>
  <link rel="stylesheet" href="/ui/hana-research/assets/reader-workbench.css?${ASSET_VERSION}">
  <title>文献阅读 · HanaResearch</title>
</head>
<body>
  <main id="hana-workbench-root"><div class="wb-skeleton" role="status" aria-label="正在加载文献工作区">
    <header class="wb-skel-topbar"><span class="wb-skel-line wb-skel-back"></span><span class="wb-skel-line wb-skel-title"></span></header>
    <div class="wb-skel-body">
      <aside class="wb-skel-left"><span class="wb-skel-line"></span><span class="wb-skel-line"></span><span class="wb-skel-line"></span><span class="wb-skel-line"></span></aside>
      <div class="wb-skel-center"></div>
      <aside class="wb-skel-right"><span class="wb-skel-line"></span><span class="wb-skel-line"></span><span class="wb-skel-line"></span></aside>
    </div>
    <p class="wb-skel-status">正在加载文献工作区…</p>
  </div></main>
  <script type="module" src="/ui/hana-research/assets/reader-workbench.js?${ASSET_VERSION}"></script>
</body>
</html>`;
}

/** 注册 /ui/hana-research/* 页面与资产路由。 */
export function registerPages(ctx) {
  return ctx.webServer.register({
    kind: "prefix",
    path: "/ui/hana-research",
    handler: async (req, res) => {
      const url = new URL(req.url ?? "/", "http://dsh.local");
      const pathname = url.pathname;
      if (pathname === "/ui/hana-research/literature") {
        return send(res, 200, renderShell("literature", false), {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
        });
      }
      if (pathname === "/ui/hana-research/projects") {
        return send(res, 200, renderShell("projects", false), {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
        });
      }
      if (pathname === "/ui/hana-research/project-notes") {
        return send(res, 200, renderShell("project-notes", true), {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
        });
      }
      // v12 阅读工作区（EmbedPDF + Tiptap 三栏，默认入口）
      if (pathname === "/ui/hana-research/reader") {
        return send(res, 200, renderWorkbenchShell(), {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
        });
      }
      // 旧版阅读器（官方 pdf.js viewer，不可见回退，确认新模块稳定后清理）
      if (pathname === "/ui/hana-research/reader-legacy") {
        const appPath = path.join(ASSET_DIR, "vendor", "pdfjs-app", "web", "reader-app.html");
        if (fs.existsSync(appPath)) {
          // 注入资源版本号（每次改版递增，强制 iframe 绕过缓存）
          const body = fs.readFileSync(appPath, "utf8").replaceAll("__ASSET_VERSION__", ASSET_VERSION);
          return send(res, 200, body, {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
          });
        }
        return send(res, 200, renderReaderShell(), {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
        });
      }
      // 对话内嵌卡片页面（tool.call.toolview iframe 壳）
      const cardMatch = /^\/ui\/hana-research\/cards\/(search-results|journal-updates|project-overview|project-brief)$/.exec(pathname);
      if (cardMatch) {
        return send(res, 200, renderCardShell(cardMatch[1]), {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
        });
      }
      const assetMatch = /^\/ui\/hana-research\/assets\/(.+)$/.exec(pathname);
      if (assetMatch) {
        const name = assetMatch[1];
        const filePath = path.join(ASSET_DIR, name);
        const resolved = path.resolve(filePath);
        if (resolved.startsWith(path.resolve(ASSET_DIR)) && fs.existsSync(resolved)) {
          const body = fs.readFileSync(resolved);
          const ext = path.extname(resolved).toLowerCase();
          return send(res, 200, body, {
            "content-type": MIME[ext] || "application/octet-stream",
            "cache-control": "no-cache",
            "x-content-type-options": "nosniff",
          });
        }
      }
      return send(res, 404, "not found", { "content-type": "text/plain; charset=utf-8" });
    },
  });
}
