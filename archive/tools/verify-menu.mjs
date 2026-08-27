// 管理菜单布局验证工具 v2（零依赖：Node ≥ 21 原生 WebSocket + headless Edge CDP）。
// 单次导航，逐场景切换视口/主题/滚动，避免反复导航导致的无头稳定性问题。
// 用法：node tools/verify-menu.mjs [baseUrl]
// 输出：tools/shots/<场景>.png 截图 + tools/shots/report.json 测量报告。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = path.join(HERE, 'shots');
const EDGE = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const DEBUG_PORT = 9333;
const BASE = process.argv[2] || process.env.DSH_WEB_URL || 'http://127.0.0.1:1678';
const URL = BASE + '/ui/hana-research/literature';

fs.mkdirSync(SHOT_DIR, { recursive: true });

let seq = 0;
class Cdp {
  constructor(ws) { this.ws = ws; }
  call(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++seq;
      const timer = setTimeout(() => {
        this.ws.removeEventListener('message', onMsg);
        reject(new Error(`${method}: CDP timeout (25s)`));
      }, 25000);
      const onMsg = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.id !== id) return;
        clearTimeout(timer);
        this.ws.removeEventListener('message', onMsg);
        if (msg.error) reject(new Error(`${method}: ${msg.error.message}`));
        else resolve(msg.result);
      };
      this.ws.addEventListener('message', onMsg);
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitJson(url, timeoutMs = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const r = await fetch(url);
      if (r.ok) return await r.json();
    } catch { /* retry */ }
    await sleep(250);
  }
  throw new Error('waitJson timeout: ' + url);
}

// ── 页面内测量表达式（返回纯 JSON） ─────────────────────────

const MEASURE_OVERFLOW = `(function () {
  var doc = document.documentElement;
  var body = document.body;
  var iw = window.innerWidth;
  var vw = doc.clientWidth;
  var se = document.scrollingElement;
  var sw = se ? se.scrollWidth : doc.scrollWidth;
  var offenders = [];
  var all = document.querySelectorAll('*');
  for (var i = 0; i < all.length; i++) {
    var el = all[i];
    var r = el.getBoundingClientRect();
    if (r.width === 0) continue;
    var cls = typeof el.className === 'string' ? el.className.slice(0, 70) : '';
    if (r.right > iw + 0.5) {
      offenders.push({ tag: el.tagName.toLowerCase(), id: el.id || '', cls: cls, right: Math.round(r.right) });
    }
  }
  offenders.sort(function (a, b) { return b.right - a.right; });
  return {
    innerWidth: iw, clientWidth: vw, scrollWidth: sw,
    hasHScroll: sw > vw + 1,
    offenders: offenders.slice(0, 10),
  };
})()`;

const MEASURE_MENU = `(function () {
  var btn = document.querySelector('#manage-menu');
  var menu = document.querySelector('#manage-menu-pop');
  var out = { found: !!(btn && menu) };
  if (!btn || !menu) return out;
  var b = btn.getBoundingClientRect();
  var m = menu.getBoundingClientRect();
  var items = Array.prototype.map.call(menu.querySelectorAll('button'), function (x) {
    var r = x.getBoundingClientRect();
    var svg = x.querySelector('svg');
    var icon = null;
    if (svg) {
      var ir = svg.getBoundingClientRect();
      icon = { w: Math.round(ir.width), h: Math.round(ir.height) };
    }
    return {
      text: (x.textContent || '').trim().replace(/\\s+/g, ' '),
      inViewport: r.right <= window.innerWidth + 0.5 && r.left >= -0.5 && r.bottom <= window.innerHeight + 0.5 && r.top >= -0.5,
      withinMenu: r.right <= m.right + 0.5 && r.left >= m.left - 0.5 && r.bottom <= m.bottom + 0.5,
      icon: icon,
    };
  });
  out.btn = { left: Math.round(b.left), right: Math.round(b.right), top: Math.round(b.top), bottom: Math.round(b.bottom), w: Math.round(b.width) };
  out.menu = { left: Math.round(m.left), right: Math.round(m.right), top: Math.round(m.top), bottom: Math.round(m.bottom), w: Math.round(m.width), h: Math.round(m.height) };
  out.vw = window.innerWidth; out.vh = window.innerHeight;
  out.rightGap = Math.round(window.innerWidth - m.right);
  out.leftGap = Math.round(m.left);
  out.bottomGap = Math.round(window.innerHeight - m.bottom);
  out.underButton = m.top >= b.bottom - 1 && m.top <= b.bottom + 20;
  out.rightAligned = Math.abs(m.right - b.right) <= 3;
  out.withinViewport = m.left >= -0.5 && m.right <= window.innerWidth + 0.5 && m.top >= -0.5 && m.bottom <= window.innerHeight + 0.5;
  out.items = items;
  out.allTextVisible = items.length > 0 && items.every(function (i) { return i.inViewport && i.withinMenu; });
  out.allIconsSized = items.length > 0 && items.every(function (i) { return i.icon && i.icon.w >= 12 && i.icon.w <= 20 && i.icon.h >= 12 && i.icon.h <= 20; });
  out.hidden = menu.hidden;
  out.parentIsBody = menu.parentElement === document.body;
  return out;
})()`;

const THEMES = {
  light: {},
  dark: {
    '--bg': '#1e1d1a', '--bg-card': '#27251f', '--text': '#e9e5dc', '--text-muted': '#a8a194',
    '--border': '#3b372e', '--overlay-medium': '#4c463a', '--accent': '#d3916a', '--accent-hover': '#e3a681',
    '--accent-light': 'rgba(211,145,106,.16)', '--green': '#86ad94', '--coral': '#cf9e63', '--danger': '#d97c6d',
    '--green-rgb': '134, 173, 148', '--coral-rgb': '207, 158, 99', '--danger-rgb': '217, 124, 109',
    '--shadow': 'rgba(0,0,0,.5)',
  },
};
const THEME_VAR_NAMES = Object.keys(THEMES.dark);

function themeScript(theme) {
  if (theme === 'light') {
    return `(function(){ var r = document.documentElement; ` + THEME_VAR_NAMES.map((k) => `r.style.removeProperty('${k}');`).join('') + ` return true; })()`;
  }
  const css = Object.entries(THEMES.dark).map(([k, v]) => `'${k}':'${v}'`).join(',');
  return `(function(){ var r = document.documentElement; var m = {${css}}; for (var k in m) r.style.setProperty(k, m[k]); return true; })()`;
}

async function main() {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'hana-menu-verify-'));
  const proc = spawn(EDGE, [
    '--headless=new',
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${userData}`,
    '--no-proxy-server',
    '--no-first-run', '--no-default-browser-check',
    '--force-color-profile=srgb',
    '--window-size=1440,900',
    'about:blank',
  ], { stdio: 'ignore' });

  try {
    await waitJson(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
    const targets = await waitJson(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
    const page = targets.find((t) => t.type === 'page' && !t.url.startsWith('devtools'));
    if (!page) throw new Error('no page target');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    const cdp = new Cdp(ws);
    await cdp.call('Page.enable');
    await cdp.call('Runtime.enable');

    const evalInPage = async (expression) => {
      const r = await cdp.call('Runtime.evaluate', { expression, returnByValue: true });
      if (r.exceptionDetails) throw new Error('eval failed: ' + JSON.stringify(r.exceptionDetails));
      return r.result.value;
    };
    const waitFor = async (expression, timeoutMs = 20000) => {
      const t0 = Date.now();
      while (Date.now() - t0 < timeoutMs) {
        try { if (await evalInPage(expression)) return; } catch { /* context not ready */ }
        await sleep(120);
      }
      throw new Error('waitFor timeout: ' + expression);
    };
    const shot = async (name) => {
      await sleep(130);
      const r = await cdp.call('Page.captureScreenshot', { format: 'png' });
      const file = path.join(SHOT_DIR, name + '.png');
      fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
      return file;
    };

    // 单次导航，之后全部在页内切换视口/主题/滚动
    await cdp.call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1.0, mobile: false });
    await cdp.call('Page.navigate', { url: URL });
    await waitFor(`document.querySelector('#manage-menu') !== null && document.querySelector('#research-root .research-shell') !== null`);

    const scenarios = [
      ['1280x720-s100', 1280, 720, 1.0, 'light', 0],
      ['1440x900-s100', 1440, 900, 1.0, 'light', 0],
      ['1920x1080-s100', 1920, 1080, 1.0, 'light', 0],
      ['1536x864-s125', 1536, 864, 1.25, 'light', 0],
      ['1280x720-s150', 1280, 720, 1.5, 'light', 0],
      ['1440x900-s125', 1440, 900, 1.25, 'light', 0],
      ['1024x768-s100', 1024, 768, 1.0, 'light', 0],
      ['900x700-s100-narrow', 900, 700, 1.0, 'light', 0],
      ['1440x900-dark', 1440, 900, 1.0, 'dark', 0],
      ['1280x720-dark', 1280, 720, 1.0, 'dark', 0],
      ['1440x900-scrolled-mid', 1440, 900, 1.0, 'light', 0.4],
      ['1440x900-scrolled-low', 1440, 900, 1.0, 'light', 0.8],
    ];

    const report = { base: BASE, at: new Date().toISOString(), scenarios: [] };

    for (const [name, width, height, dsf, theme, scrollRatio] of scenarios) {
      await cdp.call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dsf, mobile: false });
      await sleep(180);
      await evalInPage(themeScript(theme));
      await evalInPage(`window.scrollTo(0, 0); true`);
      await sleep(100);
      if (scrollRatio > 0) {
        await evalInPage(`window.scrollTo(0, Math.round((document.scrollingElement.scrollHeight - window.innerHeight) * ${scrollRatio})); true`);
        await sleep(150);
      }
      const overflow = await evalInPage(MEASURE_OVERFLOW);
      await evalInPage(`document.querySelector('#manage-menu').click(); true`);
      await sleep(150);
      const opened = await evalInPage(MEASURE_MENU);
      const shotName = await shot(name + '-open');
      await evalInPage(`(function(){ var m = document.querySelector('#manage-menu-pop'); m.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return true; })()`);
      await sleep(80);
      const closed = await evalInPage(MEASURE_MENU);
      const row = {
        scenario: name, width, height, dsf, theme, scrollRatio,
        overflow: { hasHScroll: overflow.hasHScroll, clientWidth: overflow.clientWidth, scrollWidth: overflow.scrollWidth, offenders: overflow.offenders },
        menu: { opened, closedHidden: closed.hidden, shot: path.basename(shotName) },
      };
      report.scenarios.push(row);
      console.log(
        `[${name}] hscroll=${overflow.hasHScroll ? 'YES(' + overflow.scrollWidth + '>' + overflow.clientWidth + ')' : 'no'} ` +
        `menu: within=${opened.withinViewport} under=${opened.underButton} rightAligned=${opened.rightAligned} ` +
        `rightGap=${opened.rightGap} leftGap=${opened.leftGap} bottomGap=${opened.bottomGap} ` +
        `textVisible=${opened.allTextVisible} icons=${opened.allIconsSized ? 'OK(14px)' : JSON.stringify(opened.items ? opened.items.map(i => i.icon) : null)} items=${opened.items ? opened.items.length : 0} ` +
        (overflow.offenders.length ? 'OFFENDERS: ' + overflow.offenders.map((o) => `${o.tag}${o.id ? '#' + o.id : ''}${o.cls ? '.' + o.cls.split(' ')[0] : ''}(${o.right}px)`).join(' ') : '')
      );
    }

    // ── 交互测试（1440×900 浅色，同页） ──
    await cdp.call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1.0, mobile: false });
    await sleep(200);
    await evalInPage(themeScript('light'));
    await evalInPage(`window.scrollTo(0, 0); true`);
    await sleep(120);

    const interact = {};
    // 1) 打开后首项聚焦
    await evalInPage(`document.querySelector('#manage-menu').click(); true`);
    await sleep(120);
    interact.firstFocused = await evalInPage(`document.activeElement === document.querySelector('#manage-menu-pop button')`);
    // 2) ArrowDown ×2 → 第三项聚焦
    await evalInPage(`(function(){ var m = document.querySelector('#manage-menu-pop'); m.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); m.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); return true; })()`);
    await sleep(80);
    interact.arrowFocusThird = await evalInPage(`document.activeElement.textContent.indexOf('数据导出') >= 0`);
    // 3) Esc → 关闭 + 焦点回按钮
    await evalInPage(`(function(){ var m = document.querySelector('#manage-menu-pop'); m.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return true; })()`);
    await sleep(80);
    interact.escClosed = await evalInPage(`document.querySelector('#manage-menu-pop').hidden`);
    interact.escFocusBack = await evalInPage(`document.activeElement === document.querySelector('#manage-menu')`);
    // 4) 再开 → 点击外部关闭
    await evalInPage(`document.querySelector('#manage-menu').click(); true`);
    await sleep(120);
    await cdp.call('Input.dispatchMouseEvent', { type: 'mousePressed', x: 30, y: 30, button: 'left', clickCount: 1 });
    await cdp.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 30, y: 30, button: 'left', clickCount: 1 });
    await sleep(100);
    interact.outsideClickClosed = await evalInPage(`document.querySelector('#manage-menu-pop').hidden`);
    // 5) 再开 → 选菜单项关闭（点击「数据导出」）
    await evalInPage(`document.querySelector('#manage-menu').click(); true`);
    await sleep(120);
    await evalInPage(`(function(){ var m = document.querySelector('#manage-menu-pop'); var b = Array.prototype.find.call(m.querySelectorAll('button'), function(x){ return x.textContent.indexOf('数据导出') >= 0; }); b.click(); return true; })()`);
    await sleep(100);
    interact.itemClickClosed = await evalInPage(`document.querySelector('#manage-menu-pop').hidden`);
    // 6) resize：1440 打开 → 缩到 1024（验证原生 resize 事件触发重算）
    await evalInPage(`document.querySelector('#manage-menu').click(); true`);
    await sleep(120);
    const beforeResize = await evalInPage(MEASURE_MENU);
    await cdp.call('Emulation.setDeviceMetricsOverride', { width: 1024, height: 768, deviceScaleFactor: 1.0, mobile: false });
    await sleep(300);
    const afterResizeRaw = await evalInPage(MEASURE_MENU);
    interact.resize = {
      innerWidthAfterOverride: afterResizeRaw.vw,
      before: { within: beforeResize.withinViewport, rightGap: beforeResize.rightGap },
      afterRaw: { within: afterResizeRaw.withinViewport, rightGap: afterResizeRaw.rightGap, rightAligned: afterResizeRaw.rightAligned },
      stillOpen: !afterResizeRaw.hidden,
      repositionedByNativeResize: !afterResizeRaw.hidden && afterResizeRaw.withinViewport,
    };
    // 手动派发 resize：验证监听器本身有效（区分无头怪癖与真实缺陷）
    await evalInPage(`window.dispatchEvent(new Event('resize')); true`);
    await sleep(120);
    const afterResizeDispatch = await evalInPage(MEASURE_MENU);
    interact.resize.afterDispatch = { within: afterResizeDispatch.withinViewport, rightGap: afterResizeDispatch.rightGap, rightAligned: afterResizeDispatch.rightAligned };
    interact.resize.repositionedByDispatch = !afterResizeDispatch.hidden && afterResizeDispatch.withinViewport;
    await evalInPage(`(function(){ var m = document.querySelector('#manage-menu-pop'); m.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return true; })()`);
    await sleep(80);
    // 7) 滚动后位置更新
    await evalInPage(`document.querySelector('#manage-menu').click(); true`);
    await sleep(120);
    await evalInPage(`window.scrollTo(0, 600); true`);
    await sleep(250);
    const afterScroll = await evalInPage(MEASURE_MENU);
    interact.scroll = { stillOpen: !afterScroll.hidden, within: afterScroll.withinViewport, under: afterScroll.underButton };
    await evalInPage(`(function(){ var m = document.querySelector('#manage-menu-pop'); m.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return true; })()`);

    report.interaction = interact;
    console.log('[interaction]', JSON.stringify(interact, null, 1));

    fs.writeFileSync(path.join(SHOT_DIR, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
    console.log('[report]', path.join(SHOT_DIR, 'report.json'));
    ws.close();
  } finally {
    try { proc.kill(); } catch { /* already dead */ }
    await sleep(600);
    for (let i = 0; i < 5; i++) {
      try { fs.rmSync(userData, { recursive: true, force: true }); break; }
      catch { await sleep(400); }
    }
  }
}

main().catch((error) => { console.error('[verify-menu] FAILED:', error); process.exit(1); });
