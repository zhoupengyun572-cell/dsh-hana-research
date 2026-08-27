// HanaResearch × 官方 pdf.js viewer 桥接（完整应用版）
// 关键时序：viewer.mjs 顶层在 readyState=interactive 时立即 webViewerLoad()（同步 run），
// 因此本脚本必须是普通 <script> 且位于 viewer.mjs 之前，通过同步代码：
//   1) 写入 localStorage preferences（annotationEditorMode / 浮动高亮按钮）
//   2) 注册 webviewerloaded 同步钩子（官方扩展点，run(config) 之前触发）→ 注入 file 参数
//   3) 钩子内动态 import viewer.mjs（模块缓存，不重复执行）→ initializedPromise → init
// - 批注同步：MutationObserver 观察官方高亮 editor 的增删 → 保存/删除数据库
// - 已有批注：覆盖层渲染在官方页面上（百分比定位随缩放自适应）
// - 阅读进度 / 在读状态自动写回

(function () {
  'use strict';

  var PROJECT_ID = new URLSearchParams(location.search).get('projectId');
  var ATTACHMENT_ID = new URLSearchParams(location.search).get('attachmentId');
  var VIEWER_URL = '/ui/hana-research/assets/vendor/pdfjs-app/web/viewer.mjs';

  var state = {
    annotations: [],
    notes: [],
    paper: null,
    project: null,
    dbIdByEditorDiv: new WeakMap(),
    savingEditors: new WeakSet(),
  };

  function api(path, options) {
    return fetch('/api/hana-research' + path, Object.assign({
      headers: options && options.body ? { 'Content-Type': 'application/json' } : undefined,
    }, options || {})).then(function (response) {
      if (!response.ok) {
        return response.json().then(function (body) {
          throw new Error((body && body.message) || ('请求失败（' + response.status + '）'));
        }).catch(function (error) {
          if (error instanceof Error) throw error;
          throw new Error('请求失败（' + response.status + '）');
        });
      }
      return response.json().catch(function () { return {}; });
    });
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }

  function toast(message, isError) {
    var el = document.createElement('div');
    el.textContent = message;
    Object.assign(el.style, {
      position: 'fixed', left: '50%', bottom: '48px', zIndex: 9999, transform: 'translateX(-50%)',
      padding: '9px 16px', borderRadius: '999px', color: '#fff', fontSize: '11.5px',
      background: isError ? '#a24a3f' : '#52705d', boxShadow: '0 10px 30px rgba(0,0,0,.18)',
    });
    document.body.appendChild(el);
    window.setTimeout(function () { el.remove(); }, 2400);
  }

  // ── 1) preferences：官方从 localStorage 的 pdfjs.preferences 合并（initialize 时读取） ──
  try {
    var prefs = {};
    var rawPrefs = localStorage.getItem('pdfjs.preferences');
    if (rawPrefs) {
      try { prefs = JSON.parse(rawPrefs) || {}; } catch (e) { prefs = {}; }
    }
    prefs.annotationEditorMode = 3; // HIGHLIGHT
    prefs.enableHighlightFloatingButton = true;
    localStorage.setItem('pdfjs.preferences', JSON.stringify(prefs));
  } catch (e) { /* localStorage 不可用时忽略 */ }

  // ── 2) webviewerloaded：同步于 run(config) 之前，注入 file 参数并接管应用 ──
  // 注意：官方 viewer 优先把该事件派发到 parent.document（为 iframe 嵌入设计），
  // 只有 parent 不可用（顶层打开）时才派发到自身 → 必须双端监听。
  function onViewerLoaded() {
    try {
      var url = new URL(location.href);
      url.searchParams.set('file', '/api/hana-research/attachments/' + encodeURIComponent(ATTACHMENT_ID) + '/file');
      history.replaceState(null, '', url.toString());
    } catch (e) { /* ignore */ }
    // 动态 import（模块缓存，viewer.mjs 顶层已执行过，不会重复 run）
    import(VIEWER_URL).then(function (mod) {
      var app = mod.PDFViewerApplication;
      app.initializedPromise.then(function () { init(app); }).catch(function (error) {
        console.error('reader-app init failed', error);
      });
    }).catch(function (error) {
      console.error('reader-app viewer import failed', error);
    });
  }
  document.addEventListener('webviewerloaded', onViewerLoaded, { once: true });
  try {
    if (window.parent && window.parent.document && window.parent.document !== document) {
      window.parent.document.addEventListener('webviewerloaded', onViewerLoaded, { once: true });
    }
  } catch (e) { /* 跨源时忽略，仅监听自身 */ }

  // ── 3) 应用接管 ────────────────────────────────────

  function init(app) {
    if (!PROJECT_ID || !ATTACHMENT_ID) return;
    var waitDocument = app.pdfDocument
      ? Promise.resolve()
      : new Promise(function (resolve) { app.eventBus.on('documentloaded', resolve, { once: true }); });
    waitDocument.then(function () {
      return api('/projects/' + encodeURIComponent(PROJECT_ID) + '/reader/' + encodeURIComponent(ATTACHMENT_ID));
    }).then(function (data) {
      state.project = data.project;
      state.paper = data.paper;
      state.annotations = data.annotations || [];
      state.notes = data.notes || [];
      document.title = data.paper.title + ' · ' + data.project.title;
      injectHeader(app, data);
      injectNotesPanel(app, data);
      var pdfViewer = app.pdfViewer;

      app.eventBus.on('pagechanging', function (event) {
        api('/attachments/' + encodeURIComponent(ATTACHMENT_ID) + '/progress', {
          method: 'PUT', body: JSON.stringify({ pageNumber: event.pageNumber }),
        }).catch(function () {});
      });
      app.eventBus.on('pagerendered', function (event) {
        renderPageAnnotations(event.pageNumber, event.source.div);
      });
      api('/papers/' + encodeURIComponent(data.paper.id) + '/status', {
        method: 'PATCH', body: JSON.stringify({ readStatus: 'reading' }),
      }).catch(function () {});

      observeEditorLayers();

      var resume = Math.min(Math.max(1, Number(data.attachment && data.attachment.lastPage) || 1), app.pdfDocument.numPages);
      app.eventBus.on('pagesinit', function () {
        pdfViewer.currentPageNumber = resume;
      });
    }).catch(function (error) {
      console.error('reader-app init failed', error);
      toast('加载失败：' + String(error.message || error).slice(0, 120), true);
    });
  }

  function injectHeader(app, data) {
    var left = document.querySelector('#toolbarViewerLeft');
    if (!left) return;
    var back = document.createElement('button');
    back.id = 'hana-reader-back';
    back.className = 'toolbarButton';
    back.type = 'button';
    back.title = '返回项目';
    back.textContent = '← 返回';
    back.addEventListener('click', function () {
      if (history.length > 1) history.back();
      else location.href = '/ui/hana-research/projects';
    });
    left.insertBefore(back, left.firstChild);
    var filename = document.querySelector('#filename') || document.querySelector('#fileNameField');
    if (filename) filename.textContent = data.paper.title + '（' + data.project.title + '）';
    var title = document.querySelector('#documentTitle');
    if (title) title.textContent = data.paper.title;
  }

  // ── 笔记面板（阅读器右侧，可收起/展开） ──────────────

  function injectNotesPanel(app, data) {
    var right = document.querySelector('#toolbarViewerRight');
    var toggle = document.createElement('button');
    toggle.id = 'hana-notes-toggle';
    toggle.className = 'toolbarButton';
    toggle.type = 'button';
    toggle.title = '笔记';
    toggle.setAttribute('aria-expanded', 'true');
    toggle.innerHTML = '<span class="hana-notes-toggle-label">笔记</span><span id="hana-notes-badge" class="hana-notes-badge">' + state.notes.length + '</span>';
    if (right) right.insertBefore(toggle, right.firstChild);

    var panel = document.createElement('aside');
    panel.id = 'hana-notes-panel';
    panel.setAttribute('aria-label', '阅读笔记');
    var handle = document.createElement('div');
    handle.className = 'hana-notes-handle';
    handle.textContent = '笔记';
    handle.title = '展开笔记面板';
    panel.appendChild(handle);
    var content = document.createElement('div');
    content.className = 'hana-notes-content';
    content.innerHTML =
      '<header class="hana-notes-head">' +
        '<strong>笔记</strong><span id="hana-notes-count">' + state.notes.length + ' 条</span>' +
        '<div class="hana-notes-head-actions">' +
          '<button type="button" id="hana-notes-summarize" title="用 AI 汇总本项目全部笔记，生成综述草稿">AI 汇总</button>' +
          '<button type="button" id="hana-notes-collapse" title="收起面板" aria-label="收起面板">›</button>' +
        '</div>' +
      '</header>' +
      '<div id="hana-notes-list" class="hana-notes-list"></div>' +
      '<div id="hana-notes-summary" class="hana-notes-summary" hidden></div>';
    panel.appendChild(content);
    document.body.appendChild(panel);

    var open = true;
    function setOpen(next) {
      open = next;
      panel.classList.toggle('hana-notes-collapsed', !open);
      toggle.setAttribute('aria-expanded', String(open));
      if (open) renderNotesList();
    }
    toggle.addEventListener('click', function () { setOpen(!open); });
    handle.addEventListener('click', function () { setOpen(true); });
    panel.querySelector('#hana-notes-collapse').addEventListener('click', function () { setOpen(false); });

    var summarizing = false;
    panel.querySelector('#hana-notes-summarize').addEventListener('click', function () {
      if (summarizing) return;
      summarizing = true;
      var button = panel.querySelector('#hana-notes-summarize');
      button.disabled = true;
      button.textContent = '汇总中…';
      var summaryBox = panel.querySelector('#hana-notes-summary');
      summaryBox.hidden = false;
      summaryBox.innerHTML = '<p class="hana-notes-summary-loading">正在调用模型汇总项目笔记…</p>';
      api('/projects/' + encodeURIComponent(PROJECT_ID) + '/summary', { method: 'POST' })
        .then(function (result) {
          summaryBox.innerHTML = '<div class="hana-notes-summary-title">综述草稿</div><div class="hana-notes-summary-body">' + renderMarkdown(result.text || '') + '</div>';
        })
        .catch(function (error) {
          summaryBox.innerHTML = '<p class="hana-notes-summary-error">汇总失败：' + escapeHtml(String(error.message || error).slice(0, 160)) + '</p>';
        })
        .finally(function () {
          summarizing = false;
          button.disabled = false;
          button.textContent = 'AI 汇总';
        });
    });

    // 翻页只刷新计数徽标，不重绘列表（避免打断正在编辑的笔记）
    app.eventBus.on('pagechanging', function () {
      var badge = document.querySelector('#hana-notes-badge');
      if (badge) badge.textContent = state.notes.length;
    });
    renderNotesList();
  }

  /** 极简 Markdown → 安全 HTML（标题/列表/引用/加粗/段落）。 */
  function renderMarkdown(md) {
    var lines = String(md || '').split(/\r?\n/);
    var html = '';
    var inList = false;
    function closeList() {
      if (inList) { html += '</ul>'; inList = false; }
    }
    lines.forEach(function (line) {
      var trimmed = line.trim();
      var heading = /^(#{1,4})\s+(.*)$/.exec(trimmed);
      if (heading) {
        closeList();
        var level = heading[1].length;
        html += '<h' + level + '>' + inlineMd(heading[2]) + '</h' + level + '>';
        return;
      }
      var bullet = /^[-*]\s+(.*)$/.exec(trimmed);
      if (bullet) {
        if (!inList) { html += '<ul>'; inList = true; }
        html += '<li>' + inlineMd(bullet[1]) + '</li>';
        return;
      }
      var quote = /^>\s?(.*)$/.exec(trimmed);
      if (quote) {
        closeList();
        html += '<blockquote>' + inlineMd(quote[1]) + '</blockquote>';
        return;
      }
      if (!trimmed) { closeList(); return; }
      closeList();
      html += '<p>' + inlineMd(trimmed) + '</p>';
    });
    closeList();
    return html;
  }

  function inlineMd(text) {
    return escapeHtml(text)
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
  }

  function noteBadgeClass(note) {
    var value = '';
    if (note.tags && note.tags.length) {
      var tag = String(note.tags[0]);
      if (tag.indexOf('关键') >= 0) value = 'key';
      else if (tag.indexOf('方法') >= 0) value = 'method';
      else if (tag.indexOf('疑问') >= 0) value = 'question';
    }
    return value;
  }

  function renderNotesList() {
    var list = document.querySelector('#hana-notes-list');
    if (!list) return;
    var badge = document.querySelector('#hana-notes-badge');
    if (badge) badge.textContent = state.notes.length;
    var count = document.querySelector('#hana-notes-count');
    if (count) count.textContent = state.notes.length + ' 条';
    var notes = state.notes.slice().sort(function (a, b) {
      return (a.pageNumber || 0) - (b.pageNumber || 0);
    });
    if (!notes.length) {
      list.innerHTML = '<p class="hana-notes-empty">还没有笔记。选中正文后拖动高亮，即可把摘录保存为笔记。</p>';
      return;
    }
    list.innerHTML = notes.map(function (note) {
      return '<article class="hana-note" data-note-id="' + escapeHtml(note.id) + '">' +
        '<header class="hana-note-head">' +
          '<span class="hana-note-page">第 ' + (note.pageNumber || '—') + ' 页</span>' +
          '<span class="hana-note-badge ' + noteBadgeClass(note) + '"></span>' +
          '<div class="hana-note-actions">' +
            '<button type="button" class="note-jump" title="跳转到该页">跳页</button>' +
            '<button type="button" class="note-edit" title="编辑笔记">编辑</button>' +
            '<button type="button" class="note-delete" title="删除笔记">删除</button>' +
          '</div>' +
        '</header>' +
        (note.quote ? '<blockquote class="hana-note-quote">' + escapeHtml(note.quote) + '</blockquote>' : '') +
        (note.content ? '<p class="hana-note-content">' + escapeHtml(note.content) + '</p>' : '<p class="hana-note-content hana-note-content-empty">（无正文）</p>') +
        (note.tags && note.tags.length
          ? '<div class="hana-note-tags">' + note.tags.map(function (tag) { return '<span># ' + escapeHtml(tag) + '</span>'; }).join('') + '</div>'
          : '') +
      '</article>';
    }).join('');

    list.querySelectorAll('.note-jump').forEach(function (button, index) {
      button.addEventListener('click', function () {
        var note = notes[index];
        PDFViewerApplication.pdfViewer.currentPageNumber = note.pageNumber || 1;
      });
    });
    list.querySelectorAll('.note-edit').forEach(function (button, index) {
      button.addEventListener('click', function () {
        startEditNote(list, notes[index], button);
      });
    });
    list.querySelectorAll('.note-delete').forEach(function (button, index) {
      button.addEventListener('click', function () {
        deleteNote(notes[index]);
      });
    });
  }

  function startEditNote(list, note, editButton) {
    var article = list.querySelector('[data-note-id="' + CSS.escape(note.id) + '"]');
    if (!article) return;
    article.classList.add('hana-note-editing');
    var quote = note.quote || '';
    var content = note.content || '';
    var tags = (note.tags || []).join(', ');
    article.innerHTML =
      '<div class="hana-note-edit-form">' +
        '<label>摘录引用<textarea class="edit-quote" rows="3" placeholder="原文引用">' + escapeHtml(quote) + '</textarea></label>' +
        '<label>笔记正文<textarea class="edit-content" rows="4" placeholder="你的理解、评注或结论">' + escapeHtml(content) + '</textarea></label>' +
        '<label>标签（逗号分隔，最多 8 个）<input class="edit-tags" value="' + escapeAttr(tags) + '" placeholder="关键证据, 方法"></label>' +
        '<div class="hana-note-edit-actions">' +
          '<button type="button" class="note-save">保存</button>' +
          '<button type="button" class="note-cancel">取消</button>' +
        '</div>' +
      '</div>';
    var save = article.querySelector('.note-save');
    var cancel = article.querySelector('.note-cancel');
    save.addEventListener('click', function () {
      save.disabled = true;
      api('/projects/' + encodeURIComponent(PROJECT_ID) + '/notes/' + encodeURIComponent(note.id), {
        method: 'PATCH',
        body: JSON.stringify({
          content: article.querySelector('.edit-content').value,
          quote: article.querySelector('.edit-quote').value,
          tags: article.querySelector('.edit-tags').value,
        }),
      }).then(function (result) {
        var updated = result.note;
        state.notes = state.notes.map(function (item) {
          return item.id === updated.id ? updated : item;
        });
        // 若关联高亮，同步覆盖层标题
        state.annotations = state.annotations.map(function (item) {
          if (item.id === updated.annotationId) {
            var payload = Object.assign({}, item.payload || {});
            payload.quote = updated.quote;
            payload.tags = updated.tags;
            return Object.assign({}, item, { payload: payload });
          }
          return item;
        });
        if (updated.annotationId && updated.pageNumber) {
          var pageEl = document.querySelector('.page[data-page-number="' + updated.pageNumber + '"]');
          if (pageEl) renderPageAnnotations(updated.pageNumber, pageEl);
        }
        renderNotesList();
        toast('笔记已更新');
      }).catch(function (error) {
        save.disabled = false;
        toast('保存失败：' + error.message, true);
      });
    });
    cancel.addEventListener('click', function () { renderNotesList(); });
  }

  function deleteNote(note) {
    var article = document.querySelector('[data-note-id="' + CSS.escape(note.id) + '"]');
    if (article) article.classList.add('hana-note-deleting');
    api('/projects/' + encodeURIComponent(PROJECT_ID) + '/notes/' + encodeURIComponent(note.id), { method: 'DELETE' })
      .then(function () {
        state.notes = state.notes.filter(function (item) { return item.id !== note.id; });
        if (note.annotationId) {
          state.annotations = state.annotations.filter(function (item) { return item.id !== note.annotationId; });
        }
        renderNotesList();
        toast('笔记已删除');
      })
      .catch(function (error) {
        if (article) article.classList.remove('hana-note-deleting');
        toast('删除失败：' + error.message, true);
      });
  }

  function escapeAttr(value) {
    return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  // ── 已有批注覆盖层 ─────────────────────────────────

  function annotationLayerFor(pageEl) {
    var layer = pageEl.querySelector(':scope > .hana-annotation-layer');
    if (!layer) {
      layer = document.createElement('div');
      layer.className = 'hana-annotation-layer';
      pageEl.appendChild(layer);
    }
    return layer;
  }

  function renderPageAnnotations(pageNumber, pageEl) {
    if (!pageEl) return;
    var layer = annotationLayerFor(pageEl);
    layer.querySelectorAll('.hana-anno').forEach(function (node) { node.remove(); });
    state.annotations.filter(function (item) { return item.pageNumber === pageNumber; }).forEach(function (annotation) {
      var payload = annotation.payload || {};
      var rects = Array.isArray(payload.rects) ? payload.rects : [];
      rects.forEach(function (rect) {
        var marker = document.createElement('div');
        marker.className = 'hana-anno kind-' + (annotation.kind || 'highlight');
        marker.style.setProperty('--anno-color', payload.color || '#8bb8e8');
        Object.assign(marker.style, {
          left: rect.x * 100 + '%', top: rect.y * 100 + '%',
          width: rect.width * 100 + '%', height: rect.height * 100 + '%',
        });
        marker.title = payload.quote || '批注';
        marker.addEventListener('click', function (event) {
          event.stopPropagation();
          showAnnotationPopover(annotation, event.clientX, event.clientY);
        });
        layer.appendChild(marker);
      });
    });
  }

  function showAnnotationPopover(annotation, clientX, clientY) {
    closePopovers();
    var payload = annotation.payload || {};
    var popover = document.createElement('aside');
    popover.className = 'hana-anno-popover';
    popover.style.setProperty('--anno-color', payload.color || '#8bb8e8');
    popover.innerHTML =
      '<button type="button" class="anno-close" title="关闭">×</button>' +
      '<blockquote>' + escapeHtml(payload.quote || '') + '</blockquote>' +
      (payload.content ? '<p>' + escapeHtml(payload.content) + '</p>' : '') +
      (payload.tags && payload.tags.length
        ? '<div class="anno-tags">' + payload.tags.map(function (tag) { return '<span># ' + escapeHtml(tag) + '</span>'; }).join('') + '</div>'
        : '') +
      '<footer><button type="button" class="anno-jump">第 ' + annotation.pageNumber + ' 页</button><button type="button" class="anno-delete">删除批注</button></footer>';
    document.body.appendChild(popover);
    var width = 300;
    var left = Math.max(8, Math.min(window.innerWidth - width - 8, clientX - width / 2));
    var top = Math.max(8, Math.min(window.innerHeight - 220, clientY - 20));
    Object.assign(popover.style, { left: left + 'px', top: top + 'px' });
    popover.querySelector('.anno-close').addEventListener('click', function () { popover.remove(); });
    popover.querySelector('.anno-jump').addEventListener('click', function () {
      PDFViewerApplication.pdfViewer.currentPageNumber = annotation.pageNumber;
      popover.remove();
    });
    popover.querySelector('.anno-delete').addEventListener('click', function () {
      var linkedNote = state.notes.find(function (item) { return item.annotationId === annotation.id; });
      var request = linkedNote
        ? api('/projects/' + encodeURIComponent(PROJECT_ID) + '/notes/' + encodeURIComponent(linkedNote.id), { method: 'DELETE' })
        : api('/projects/' + encodeURIComponent(PROJECT_ID) + '/annotations/' + encodeURIComponent(annotation.id), { method: 'DELETE' });
      request.then(function () {
          state.annotations = state.annotations.filter(function (item) { return item.id !== annotation.id; });
          state.notes = state.notes.filter(function (item) { return item.annotationId !== annotation.id; });
          popover.remove();
          var pageEl = document.querySelector('.page[data-page-number="' + annotation.pageNumber + '"]');
          if (pageEl) renderPageAnnotations(annotation.pageNumber, pageEl);
          updateNotesBadge();
          toast('批注已删除');
        })
        .catch(function (error) { toast(error.message, true); });
    });
  }

  function closePopovers() {
    document.querySelectorAll('.hana-anno-popover').forEach(function (node) { node.remove(); });
  }

  // ── 官方高亮 editor 增删同步 ───────────────────────

  function observeEditorLayers() {
    var observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        mutation.addedNodes.forEach(function (node) {
          if (!(node instanceof HTMLElement)) return;
          if (node.classList && node.classList.contains('highlightEditor')) handleEditorAdded(node);
          else if (node.querySelectorAll) node.querySelectorAll('.highlightEditor').forEach(handleEditorAdded);
        });
        mutation.removedNodes.forEach(function (node) {
          if (!(node instanceof HTMLElement)) return;
          var collect = node.classList && node.classList.contains('highlightEditor') ? [node] : (node.querySelectorAll ? Array.prototype.slice.call(node.querySelectorAll('.highlightEditor')) : []);
          collect.forEach(handleEditorRemoved);
        });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function handleEditorAdded(div) {
    if (state.savingEditors.has(div) || state.dbIdByEditorDiv.has(div)) return;
    var pageEl = div.closest('.page');
    if (!pageEl) return;
    var pageNumber = Number(pageEl.dataset.pageNumber);
    var pageRect = pageEl.getBoundingClientRect();
    var box = div.getBoundingClientRect();
    if (!pageRect.width || !pageRect.height) return;
    var rect = {
      x: Math.max(0, Math.min(1, (box.left - pageRect.left) / pageRect.width)),
      y: Math.max(0, Math.min(1, (box.top - pageRect.top) / pageRect.height)),
      width: Math.max(0, Math.min(1, box.width / pageRect.width)),
      height: Math.max(0, Math.min(1, box.height / pageRect.height)),
    };
    if (rect.width < .001 || rect.height < .001) return;
    var quote = quoteFromPageRect(pageEl, rect, pageRect);
    var color = rgbToHex(getComputedStyle(div).backgroundColor) || '#FFFF98';
    state.savingEditors.add(div);
    api('/projects/' + encodeURIComponent(PROJECT_ID) + '/attachments/' + encodeURIComponent(ATTACHMENT_ID) + '/selection-note', {
      method: 'POST',
      body: JSON.stringify({
        pageNumber: pageNumber,
        quote: quote,
        content: '',
        tags: ['关键证据'],
        rects: [rect],
        color: color,
      }),
    }).then(function (result) {
      state.dbIdByEditorDiv.set(div, result.annotation.id);
      state.annotations.push(result.annotation);
      if (result.note) state.notes.push(result.note);
      state.savingEditors.delete(div);
      updateNotesBadge();
      toast('已保存高亮摘录');
    }).catch(function (error) {
      state.savingEditors.delete(div);
      toast('保存失败：' + error.message, true);
    });
  }

  function handleEditorRemoved(div) {
    var dbId = state.dbIdByEditorDiv.get(div);
    if (!dbId) return;
    state.dbIdByEditorDiv.delete(div);
    var linkedNote = state.notes.find(function (note) { return note.annotationId === dbId; });
    var request = linkedNote
      ? api('/projects/' + encodeURIComponent(PROJECT_ID) + '/notes/' + encodeURIComponent(linkedNote.id), { method: 'DELETE' })
      : api('/projects/' + encodeURIComponent(PROJECT_ID) + '/annotations/' + encodeURIComponent(dbId), { method: 'DELETE' });
    request.then(function () {
      state.annotations = state.annotations.filter(function (item) { return item.id !== dbId; });
      state.notes = state.notes.filter(function (note) { return note.annotationId !== dbId; });
      updateNotesBadge();
      toast('已删除高亮摘录');
    }).catch(function () {});
  }

  function updateNotesBadge() {
    var badge = document.querySelector('#hana-notes-badge');
    if (badge) badge.textContent = state.notes.length;
    var count = document.querySelector('#hana-notes-count');
    if (count) count.textContent = state.notes.length + ' 条';
  }

  /** 从页面矩形反查 textLayer 文本（中文逐字 span 按 DOM 顺序拼接）。 */
  function quoteFromPageRect(pageEl, rect, pageRect) {
    var textLayer = pageEl.querySelector('.textLayer');
    if (!textLayer) return '';
    var pieces = [];
    textLayer.querySelectorAll('span').forEach(function (span) {
      var text = span.textContent || '';
      if (!text.trim()) return;
      var r = span.getBoundingClientRect();
      var sx = Math.max(0, r.left - pageRect.left) / pageRect.width;
      var sy = Math.max(0, r.top - pageRect.top) / pageRect.height;
      var sw = r.width / pageRect.width;
      var sh = r.height / pageRect.height;
      var hit = sx < rect.x + rect.width && sx + sw > rect.x && sy < rect.y + rect.height && sy + sh > rect.y;
      if (hit) pieces.push(text);
    });
    return pieces.join('').replace(/\s+/g, ' ').trim().slice(0, 5000);
  }

  function rgbToHex(rgb) {
    var match = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(rgb || '');
    if (!match) return null;
    return '#' + match.slice(1).map(function (n) { return Number(n).toString(16).padStart(2, '0'); }).join('');
  }
})();
