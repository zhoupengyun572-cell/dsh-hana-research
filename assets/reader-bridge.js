// HanaResearch PDF 阅读器桥接：官方 pdf.js PDFViewer 组件驱动。
// - 加载本地 PDF（插件 API）→ PDFViewer 渲染（文本选择/滚动/缩放/搜索均为官方实现）
// - 批注：数据库中的高亮/框选以覆盖层渲染（百分比定位随缩放自适应）
// - 摘录：原生选区 → 预览高亮 → 弹窗保存（标签/颜色/笔记）
// - 阅读进度、在读状态自动写回
// 注意：pdf_viewer.mjs 在模块顶层解构 globalThis.pdfjsLib，必须先加载库并设置全局。
const pdfjsLib = await import('/ui/hana-research/assets/vendor/pdfjs-viewer/pdf.min.mjs');
globalThis.pdfjsLib = pdfjsLib;
const { PDFViewer, EventBus, PDFLinkService, PDFFindController } = await import('/ui/hana-research/assets/vendor/pdfjs-viewer/pdf_viewer.mjs');

const ASSETS = '/ui/hana-research/assets/vendor/pdfjs-viewer';
const params = new URLSearchParams(location.search);
const projectId = params.get('projectId');
const attachmentId = params.get('attachmentId');

function api(path, options = {}) {
  return fetch(`/api/hana-research${path}`, {
    ...options,
    headers: options.body ? { 'Content-Type': 'application/json', ...(options.headers || {}) } : options.headers,
  }).then(async response => {
    if (!response.ok) {
      let message = `请求失败（${response.status}）`;
      try {
        const body = await response.json();
        if (body?.message) message = body.message;
      } catch { /* ignore */ }
      throw new Error(message);
    }
    return response.json().catch(() => ({}));
  });
}

const state = {
  pdf: null,
  pdfViewer: null,
  eventBus: null,
  annotations: [],
  paper: null,
  project: null,
  selectionGesture: null,
  pendingSelection: null,
  popoverPos: null,
};

// ── 启动 ─────────────────────────────────────────────

async function init() {
  if (!projectId || !attachmentId) {
    document.querySelector('#reader-title').innerHTML = '<strong>缺少参数</strong>';
    return;
  }
  try {
    const [data, buffer] = await Promise.all([
      api(`/projects/${encodeURIComponent(projectId)}/reader/${encodeURIComponent(attachmentId)}`),
      fetch(`/api/hana-research/attachments/${encodeURIComponent(attachmentId)}/file`).then(response => {
        if (!response.ok) throw new Error(`无法读取 PDF（${response.status}）`);
        return response.arrayBuffer();
      }),
    ]);
    state.project = data.project;
    state.paper = data.paper;
    state.annotations = data.annotations || [];
    document.querySelector('#reader-project').textContent = data.project.title;
    document.querySelector('#reader-paper').textContent = data.paper.title;
    document.title = `${data.paper.title} · ${data.project.title}`;
    if (data.attachment?.lastPage) document.querySelector('#reader-page').value = data.attachment.lastPage;

    pdfjsLib.GlobalWorkerOptions.workerSrc = `${ASSETS}/pdf.worker.min.mjs`;
    const container = document.querySelector('#viewerContainer');
    const eventBus = new EventBus();
    const linkService = new PDFLinkService({ eventBus });
    const findController = new PDFFindController({ linkService, eventBus });
    const pdfViewer = new PDFViewer({
      container,
      eventBus,
      linkService,
      findController,
      textLayerMode: 1,
    });
    linkService.setViewer(pdfViewer);
    state.pdfViewer = pdfViewer;
    state.eventBus = eventBus;
    state.findController = findController;

    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      isEvalSupported: false,
      cMapUrl: `${ASSETS}/cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${ASSETS}/standard_fonts/`,
      wasmUrl: `${ASSETS}/wasm/`,
    });
    const pdf = await loadingTask.promise;
    state.pdf = pdf;
    pdfViewer.setDocument(pdf);
    linkService.setDocument(pdf, null);

    bindEvents(pdf);
    bindToolbar(pdf);
    bindTextSelection();
    bindSearch();

    // 续读：须等 pagesinit（页视图就绪）后再设置页码，否则 v6 内部会抛错
    const resume = Math.min(Math.max(1, Number(data.attachment?.lastPage) || 1), pdf.numPages);
    state.eventBus.on('pagesinit', () => {
      document.querySelector('#reader-page-count').textContent = pdf.numPages;
      pdfViewer.currentPageNumber = resume;
      document.querySelector('#reader-page').value = resume;
      document.querySelector('#reader-status-page').textContent = `第 ${resume} / ${pdf.numPages} 页`;
    });
    // 在读标记
    api(`/papers/${encodeURIComponent(data.paper.id)}/status`, {
      method: 'PATCH', body: JSON.stringify({ readStatus: 'reading' }),
    }).catch(() => {});
  } catch (error) {
    console.error('reader-bridge init failed', error);
    document.querySelector('#reader-title').innerHTML = `<strong>加载失败：${String(error?.stack || error?.message || error).slice(0, 400)}</strong>`;
  }
}

// ── 事件 ─────────────────────────────────────────────

function bindEvents(pdf) {
  state.eventBus.on('pagechanging', event => {
    const { pageNumber } = event;
    document.querySelector('#reader-page').value = pageNumber;
    document.querySelector('#reader-status-page').textContent = `第 ${pageNumber} / ${pdf.numPages} 页`;
    api(`/attachments/${encodeURIComponent(attachmentId)}/progress`, {
      method: 'PUT', body: JSON.stringify({ pageNumber }),
    }).catch(() => {});
  });
  state.eventBus.on('scalechanging', event => {
    const zoom = `${Math.round(event.scale * 100)}%`;
    document.querySelector('#reader-zoom').textContent = zoom;
    document.querySelector('#reader-status-zoom').textContent = zoom;
  });
  state.eventBus.on('pagerendered', event => {
    renderPageAnnotations(event.pageNumber, event.source.div);
  });
}

function bindToolbar(pdf) {
  document.querySelector('#reader-back').addEventListener('click', () => {
    if (history.length > 1) history.back();
    else location.href = '/ui/hana-research/projects';
  });
  document.querySelector('#reader-prev').addEventListener('click', () => { state.pdfViewer.currentPageNumber -= 1; });
  document.querySelector('#reader-next').addEventListener('click', () => { state.pdfViewer.currentPageNumber += 1; });
  document.querySelector('#reader-page').addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    const page = Number(event.target.value);
    if (Number.isInteger(page) && page >= 1 && page <= pdf.numPages) state.pdfViewer.currentPageNumber = page;
  });
  document.querySelector('#reader-zoom-out').addEventListener('click', () => {
    state.pdfViewer.currentScale = Math.max(.4, state.pdfViewer.currentScale - .15);
  });
  document.querySelector('#reader-zoom-in').addEventListener('click', () => {
    state.pdfViewer.currentScale = Math.min(4, state.pdfViewer.currentScale + .15);
  });
  document.querySelector('#reader-fit').addEventListener('click', () => {
    state.pdfViewer.currentScaleValue = 'page-width';
  });
  document.querySelector('#reader-highlight').addEventListener('click', event => {
    event.currentTarget.classList.toggle('active');
  });
  document.querySelector('#reader-notes').addEventListener('click', toggleNotesPanel);
}

function bindSearch() {
  const input = document.querySelector('#reader-search');
  const count = document.querySelector('#reader-search-count');
  let query = '';
  const run = (direction) => {
    if (!query) return;
    state.pdfViewer.findController.executeCommand('find', {
      query,
      phraseSearch: true,
      caseSensitive: false,
      highlightAll: true,
      findPrevious: direction === 'prev',
    });
  };
  input.addEventListener('input', () => {
    query = input.value.trim();
    if (!query) { count.textContent = ''; state.pdfViewer.findController.executeCommand('find', { query: '' }); return; }
    run('next');
  });
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') run(event.shiftKey ? 'prev' : 'next');
  });
  document.querySelector('#reader-search-prev').addEventListener('click', () => run('prev'));
  document.querySelector('#reader-search-next').addEventListener('click', () => run('next'));
  document.querySelector('#reader-search-close').addEventListener('click', () => {
    input.value = '';
    query = '';
    count.textContent = '';
    state.pdfViewer.findController.executeCommand('find', { query: '' });
  });
  state.eventBus.on('updatefindmatchescount', event => {
    if (event.matches) count.textContent = `${event.matches.current} / ${event.matches.total}`;
  });
}

// ── 已有批注覆盖层 ───────────────────────────────────

function annotationLayerFor(pageEl) {
  let layer = pageEl.querySelector(':scope > .hana-annotation-layer');
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'hana-annotation-layer';
    pageEl.append(layer);
  }
  return layer;
}

function renderPageAnnotations(pageNumber, pageEl) {
  if (!pageEl) return;
  const layer = annotationLayerFor(pageEl);
  layer.querySelectorAll('.hana-anno').forEach(node => node.remove());
  const pageAnnotations = state.annotations.filter(annotation => annotation.pageNumber === pageNumber);
  for (const annotation of pageAnnotations) {
    const payload = annotation.payload || {};
    const rects = Array.isArray(payload.rects) ? payload.rects : [];
    for (const rect of rects) {
      const marker = document.createElement('div');
      marker.className = `hana-anno kind-${annotation.kind || 'highlight'}`;
      marker.style.setProperty('--anno-color', payload.color || '#8bb8e8');
      Object.assign(marker.style, {
        left: `${rect.x * 100}%`, top: `${rect.y * 100}%`,
        width: `${rect.width * 100}%`, height: `${rect.height * 100}%`,
      });
      marker.title = annotation.kind === 'area' ? '框选批注' : (payload.quote || '高亮');
      marker.addEventListener('click', event => {
        event.stopPropagation();
        showAnnotationPopover(annotation, rect, event.clientX, event.clientY);
      });
      layer.append(marker);
    }
  }
}

function showAnnotationPopover(annotation, rect, clientX, clientY) {
  closePopovers();
  const payload = annotation.payload || {};
  const popover = document.createElement('aside');
  popover.className = 'anno-popover';
  popover.style.setProperty('--anno-color', payload.color || '#8bb8e8');
  popover.innerHTML = `<button type="button" class="anno-close" title="关闭">×</button>
    <blockquote>${escapeHtml(payload.quote || '')}</blockquote>
    ${payload.content ? `<p>${escapeHtml(payload.content)}</p>` : ''}
    ${payload.tags?.length ? `<div class="anno-tags">${payload.tags.map(tag => `<span># ${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
    <footer><button type="button" class="anno-jump">第 ${annotation.pageNumber} 页</button><button type="button" class="anno-delete">删除批注</button></footer>`;
  document.body.append(popover);
  const width = 300;
  const left = Math.max(8, Math.min(window.innerWidth - width - 8, clientX - width / 2));
  const top = Math.max(8, Math.min(window.innerHeight - 220, clientY - 20));
  Object.assign(popover.style, { left: `${left}px`, top: `${top}px` });
  popover.querySelector('.anno-close').addEventListener('click', () => popover.remove());
  popover.querySelector('.anno-jump').addEventListener('click', () => {
    state.pdfViewer.currentPageNumber = annotation.pageNumber;
    popover.remove();
  });
  popover.querySelector('.anno-delete').addEventListener('click', async () => {
    try {
      await api(`/projects/${encodeURIComponent(projectId)}/annotations/${encodeURIComponent(annotation.id)}`, { method: 'DELETE' });
      state.annotations = state.annotations.filter(item => item.id !== annotation.id);
      popover.remove();
      const pageEl = document.querySelector(`.pdfViewer .page[data-page-number="${annotation.pageNumber}"]`);
      if (pageEl) renderPageAnnotations(annotation.pageNumber, pageEl);
    } catch (error) {
      alert(error.message);
    }
  });
}

// ── 文本摘录（原生选区驱动，官方 textLayer） ─────────

// ── 文本摘录（零干预原生选区，官方 viewer 同机制） ────
// 拖动过程完全交给浏览器原生选区（平滑、字符级、跨行连续，与网页一致），
// 不做任何自定义预览渲染；仅在松手时读取选区生成摘录。
// 自动滚动也由浏览器原生行为承担（选区拖到视口边缘自动滚动）。

function bindTextSelection() {
  const container = document.querySelector('#viewerContainer');
  container.addEventListener('pointerdown', event => {
    closePopovers();
    if (event.button !== 0 || !state.pdf) return;
    const textLayer = event.target.closest('.textLayer');
    if (!textLayer) return;
    const pageEl = textLayer.closest('.page');
    if (!pageEl) return;
    // 不干预选区：浏览器从 pointerdown 位置接管选择
    state.selectionGesture = {
      textLayer,
      pageEl,
      pageNumber: Number(pageEl.dataset.pageNumber),
      startX: event.clientX,
      startY: event.clientY,
    };
  });
  container.addEventListener('pointerup', event => {
    const gesture = state.selectionGesture;
    if (!gesture) return;
    state.selectionGesture = null;
    const distance = Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY);
    const selection = window.getSelection();
    if (distance < 4) {
      selection?.removeAllRanges();
      return;
    }
    const pending = buildSelectionFromNative(gesture);
    selection?.removeAllRanges();
    if (!pending?.quote || !pending.rects.length) return;
    showSelectionPopover(pending);
  });
  // 双击选词：浏览器双击原生选中的是字/词，这里取所在 span 生成摘录弹窗
  container.addEventListener('dblclick', event => {
    const span = event.target.closest?.('.textLayer span');
    if (!span) return;
    const pageEl = span.closest('.page');
    if (!pageEl) return;
    const textNode = span.firstChild;
    if (!textNode || textNode.nodeType !== Node.TEXT_NODE || !textNode.length) return;
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, textNode.length);
    const clientRects = [...range.getClientRects()].filter(rect => rect.width > 1 && rect.height > 1);
    if (!clientRects.length) return;
    const pageRect = pageEl.getBoundingClientRect();
    const rects = normalizeSelectionRects(clientRects, pageRect);
    const quote = String(span.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 5000);
    if (!quote || !rects.length) return;
    closePopovers();
    window.getSelection()?.removeAllRanges();
    showSelectionPopover({
      rects,
      quote,
      pageNumber: Number(pageEl.dataset.pageNumber),
      anchorRect: clientRects[clientRects.length - 1],
    });
  });
}

/** 从浏览器原生选区构建单页摘录（跨页/越界时截断到起点页）。 */
function buildSelectionFromNative(gesture) {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (!gesture.textLayer.contains(range.startContainer)) return null;
  let endNode = range.endContainer;
  let endOffset = range.endOffset;
  if (!gesture.textLayer.contains(range.endContainer)) {
    const last = lastTextNodeIn(gesture.textLayer);
    if (!last) return null;
    endNode = last;
    endOffset = last.length;
  }
  const clipped = document.createRange();
  clipped.setStart(range.startContainer, range.startOffset);
  clipped.setEnd(endNode, endOffset);
  const clientRects = [...clipped.getClientRects()].filter(rect => rect.width > 1 && rect.height > 1);
  if (!clientRects.length) return null;
  const pageRect = gesture.pageEl.getBoundingClientRect();
  const rects = normalizeSelectionRects(clientRects, pageRect);
  const quote = String(clipped.toString()).replace(/\s+\n/g, '\n').replace(/[ \t]+/g, ' ').trim().slice(0, 5000);
  if (!quote || !rects.length) return null;
  return {
    rects,
    quote,
    pageNumber: gesture.pageNumber,
    anchorRect: clientRects[clientRects.length - 1] || { left: gesture.startX, top: gesture.startY, width: 0, height: 0 },
  };
}

function lastTextNodeIn(container) {
  const spans = container.querySelectorAll('span');
  for (let index = spans.length - 1; index >= 0; index -= 1) {
    const child = spans[index].firstChild;
    if (child && child.nodeType === Node.TEXT_NODE && child.length > 0) return child;
  }
  return null;
}

function normalizeSelectionRects(clientRects, pageRect) {
  const rects = clientRects.map(rect => ({
    x: Math.max(0, rect.left - pageRect.left) / pageRect.width,
    y: Math.max(0, rect.top - pageRect.top) / pageRect.height,
    width: Math.min(rect.right, pageRect.right) - Math.max(rect.left, pageRect.left),
    height: Math.min(rect.bottom, pageRect.bottom) - Math.max(rect.top, pageRect.top),
  })).map(rect => ({ ...rect, width: rect.width / pageRect.width, height: rect.height / pageRect.height }))
    .filter(rect => rect.width > .001 && rect.height > .001 && rect.x < 1 && rect.y < 1)
    .sort((a, b) => a.y - b.y || a.x - b.x);
  const merged = [];
  for (const rect of rects) {
    const previous = merged[merged.length - 1];
    const sameLine = previous && Math.abs(previous.y - rect.y) < Math.max(previous.height, rect.height) * .55;
    const close = previous && rect.x <= previous.x + previous.width + .018;
    if (sameLine && close) {
      const right = Math.max(previous.x + previous.width, rect.x + rect.width);
      previous.y = Math.min(previous.y, rect.y);
      previous.height = Math.max(previous.height, rect.height);
      previous.width = right - previous.x;
    } else merged.push({ ...rect });
  }
  return merged;
}

// ── 摘录保存弹窗 ────────────────────────────────────

function showSelectionPopover(selection) {
  closePopovers();
  const popover = document.createElement('aside');
  popover.className = 'selection-popover';
  popover.innerHTML = `<header><span class="drag-handle" title="拖动调整位置">⠿</span><span class="title">ADD TO PROJECT NOTES</span><button type="button" data-close title="关闭">×</button></header>
    <blockquote>${escapeHtml(selection.quote)}</blockquote>
    <label class="selection-label">选择标签</label>
    <div class="selection-tags">${['关键证据', '理论观点', '研究方法', '数据结果', '待讨论'].map(tag => `<button type="button" class="${selection.tags?.includes(tag) ? 'active' : ''}" data-tag="${tag}"># ${tag}</button>`).join('')}</div>
    <label class="custom-tag"><span>#</span><input id="sel-custom-tag" maxlength="30" placeholder="自定义标签，回车添加"></label>
    <label class="selection-label">高亮颜色</label>
    <div class="selection-colors">${['#8bb8e8', '#f0c94f', '#e88b8b', '#8be0b8', '#c98be8', '#e8a08b'].map(color => `<button type="button" class="selection-color ${selection.color === color || (!selection.color && color === '#8bb8e8') ? 'active' : ''}" data-color="${color}" style="background:${color}"></button>`).join('')}</div>
    <textarea id="sel-content" maxlength="10000" placeholder="可补充你的理解、疑问或与项目的联系…"></textarea>
    <footer><small>第 ${selection.pageNumber} 页 · 将汇总到项目笔记</small><button type="button" id="sel-save">保存摘录</button></footer>`;
  document.body.append(popover);
  const width = 288;
  const left = Math.max(12, Math.min(window.innerWidth - width - 12, selection.anchorRect.left + selection.anchorRect.width / 2 - width / 2));
  const top = Math.max(12, Math.min(window.innerHeight - 300, selection.anchorRect.bottom + 12));
  Object.assign(popover.style, { left: `${left}px`, top: `${top}px` });
  popover.selection = selection;

  popover.querySelector('[data-close]').addEventListener('click', () => popover.remove());
  popover.querySelectorAll('[data-tag]').forEach(button => {
    button.addEventListener('click', () => {
      const tags = selection.tags || ['关键证据'];
      const tag = button.dataset.tag;
      if (tags.includes(tag)) selection.tags = tags.filter(item => item !== tag);
      else if (tags.length < 8) selection.tags = [...tags, tag];
      button.classList.toggle('active', selection.tags.includes(tag));
    });
  });
  const customInput = popover.querySelector('#sel-custom-tag');
  customInput.addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const tag = customInput.value.trim().replace(/^#/, '').slice(0, 30);
    const tags = selection.tags || ['关键证据'];
    if (tag && !tags.includes(tag) && tags.length < 8) {
      selection.tags = [...tags, tag];
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'active';
      chip.dataset.tag = tag;
      chip.textContent = `# ${tag}`;
      chip.addEventListener('click', () => {
        selection.tags = selection.tags.filter(item => item !== tag);
        chip.remove();
      });
      popover.querySelector('.selection-tags').append(chip);
      customInput.value = '';
    }
  });
  popover.querySelectorAll('[data-color]').forEach(button => {
    button.addEventListener('click', () => {
      selection.color = button.dataset.color;
      popover.querySelectorAll('[data-color]').forEach(item => item.classList.toggle('active', item === button));
    });
  });
  popover.querySelector('#sel-save').addEventListener('click', async () => {
    const button = popover.querySelector('#sel-save');
    button.disabled = true;
    button.textContent = '保存中…';
    try {
      const result = await api(`/projects/${encodeURIComponent(projectId)}/attachments/${encodeURIComponent(attachmentId)}/selection-note`, {
        method: 'POST',
        body: JSON.stringify({
          pageNumber: selection.pageNumber,
          quote: selection.quote,
          content: popover.querySelector('#sel-content').value.trim(),
          tags: selection.tags || ['关键证据'],
          rects: selection.rects,
          color: selection.color || '#8bb8e8',
        }),
      });
      state.annotations.push(result.annotation);
      const pageEl = document.querySelector(`.pdfViewer .page[data-page-number="${selection.pageNumber}"]`);
      if (pageEl) renderPageAnnotations(selection.pageNumber, pageEl);
      popover.remove();
      toast('摘录已保存');
    } catch (error) {
      button.disabled = false;
      button.textContent = '保存摘录';
      toast(error.message, true);
    }
  });
}

// ── 笔记面板 ────────────────────────────────────────

async function toggleNotesPanel() {
  const existing = document.querySelector('#reader-notes-panel');
  if (existing) { existing.remove(); return; }
  const panel = document.createElement('aside');
  panel.id = 'reader-notes-panel';
  panel.innerHTML = '<h3>本 PDF 的摘录笔记</h3><div id="notes-list"><p class="reader-notes-empty">正在读取…</p></div>';
  document.body.append(panel);
  try {
    const data = await api(`/projects/${encodeURIComponent(projectId)}/notes`);
    const notes = (data.notes || []).filter(note => note.attachmentId === attachmentId);
    const list = panel.querySelector('#notes-list');
    if (!notes.length) {
      list.innerHTML = '<p class="reader-notes-empty">还没有摘录笔记。选中正文文字即可添加。</p>';
      return;
    }
    list.innerHTML = notes.map(note => `<article class="reader-note-item">
      ${note.quote ? `<blockquote>${escapeHtml(note.quote)}</blockquote>` : ''}
      ${note.content ? `<p>${escapeHtml(note.content)}</p>` : ''}
      <div class="note-meta"><span>第 ${note.pageNumber || '?'} 页${note.tags?.length ? ` · ${note.tags.map(escapeHtml).join(' #')}` : ''}</span><button type="button" data-jump="${note.pageNumber || 1}">跳转</button></div>
    </article>`).join('');
    list.querySelectorAll('[data-jump]').forEach(button => {
      button.addEventListener('click', () => {
        state.pdfViewer.currentPageNumber = Number(button.dataset.jump);
        panel.remove();
      });
    });
  } catch (error) {
    panel.querySelector('#notes-list').innerHTML = `<p class="reader-notes-empty">读取失败：${escapeHtml(error.message)}</p>`;
  }
}

// ── 工具 ─────────────────────────────────────────────

function closePopovers() {
  document.querySelectorAll('.selection-popover, .anno-popover, #reader-notes-panel').forEach(node => node.remove());
}

function toast(message, isError = false) {
  const el = document.createElement('div');
  el.textContent = message;
  Object.assign(el.style, {
    position: 'fixed', left: '50%', bottom: '42px', zIndex: 60, transform: 'translateX(-50%)',
    padding: '9px 16px', borderRadius: '999px', color: '#fff', fontSize: '11.5px',
    background: isError ? '#a24a3f' : '#52705d', boxShadow: '0 10px 30px rgba(0,0,0,.18)',
  });
  document.body.append(el);
  window.setTimeout(() => el.remove(), 2400);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closePopovers();
});

init();
