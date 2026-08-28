const root = document.querySelector('#research-companion-root');
const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('hana-research-reader-v1') : null;

const state = {
  context: null,
  data: null,
  loading: false,
  pageOnly: true,
  composerTags: ['随手笔记'],
};

function apiUrl(path) {
  // DSH 移植：业务 API 挂 /api/hana-research；surface session 参数无对应语义，不再透传。
  return `/api/hana-research${path}`;
}

async function api(path, options = {}) {
  const response = await fetch(apiUrl(path), {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json') ? await response.json() : null;
  if (!response.ok) throw new Error(body?.message || `请求失败（${response.status}）`);
  return body;
}

function renderIdle() {
  root.innerHTML = `<section class="companion-shell idle"><header><span>Research notes</span><h1>项目阅读笔记</h1><p>项目中的全部文献笔记会汇总为一个 Markdown 文件。</p></header><div class="idle-mark"><i></i><strong>打开一份项目 PDF</strong><p>页码、文本摘录、标签与笔记会自动进入当前项目。</p></div><footer>本地保存 · 项目级汇总</footer></section>`;
}

function renderLoading() {
  root.innerHTML = `<section class="companion-shell loading"><div class="spinner"></div><p>正在同步项目笔记…</p></section>`;
}

async function loadContext(context, force = false) {
  const attachmentChanged = state.context?.attachmentId !== context?.attachmentId;
  state.context = { ...state.context, ...context };
  if (!state.context?.projectId || !state.context?.attachmentId || state.loading) return;
  if (state.data && !attachmentChanged && !force) {
    renderCompanion();
    return;
  }
  state.loading = true;
  if (!state.data) renderLoading();
  try {
    state.data = await api(`/projects/${encodeURIComponent(state.context.projectId)}/reader/${encodeURIComponent(state.context.attachmentId)}`);
    renderCompanion();
  } catch (error) {
    renderError(error);
  } finally {
    state.loading = false;
  }
}

function renderCompanion(message = '') {
  const { context, data } = state;
  if (!context || !data) return renderIdle();
  const visibleNotes = state.pageOnly
    ? data.notes.filter(note => note.attachmentId === context.attachmentId && note.pageNumber === context.pageNumber)
    : data.notes;
  const linkedAnnotationIds = new Set(data.notes.map(note => note.annotationId).filter(Boolean));
  const visibleAnnotations = (state.pageOnly ? data.annotations.filter(item => item.pageNumber === context.pageNumber) : data.annotations)
    .filter(item => item.kind === 'area' || !linkedAnnotationIds.has(item.id));
  root.innerHTML = `<section class="companion-shell">
    <header class="notes-header"><span>${escapeHtml(data.project.title)}</span><div class="title-row"><h1>项目阅读笔记</h1><a href="${apiUrl(`/projects/${encodeURIComponent(context.projectId)}/notes/file`)}" download>导出 .md</a></div><p title="${escapeAttr(data.paper.title)}">正在阅读 · ${escapeHtml(data.paper.title)}</p><div class="page-context"><b>第 ${context.pageNumber} / ${context.pageCount || '—'} 页</b><i>连续阅读同步</i></div></header>
    <div class="companion-notice ${message ? 'visible' : ''}">${escapeHtml(message)}</div>
    <form class="quick-note" id="companion-note-form"><label>记录第 ${context.pageNumber} 页</label><textarea id="companion-note-content" maxlength="10000" placeholder="写下观点、疑问，或它与研究问题的联系…"></textarea><div class="quick-tags">${['随手笔记', '理论观点', '研究方法', '待讨论'].map(tag => `<button type="button" class="${state.composerTags.includes(tag) ? 'active' : ''}" data-composer-tag="${tag}"># ${tag}</button>`).join('')}</div><div class="quick-note-actions"><span>Ctrl + Enter 保存</span><button type="submit">保存笔记</button></div></form>
    <nav class="record-filter"><button class="${state.pageOnly ? 'active' : ''}" data-record-filter="page">本页记录</button><button class="${state.pageOnly ? '' : 'active'}" data-record-filter="all">项目全部</button></nav>
    <div class="record-scroll">
      <section class="record-section"><div class="record-heading"><strong>独立勾画</strong><span>${visibleAnnotations.length}</span></div>${visibleAnnotations.length ? visibleAnnotations.map(annotationCard).join('') : '<p class="empty-record">本页还没有独立勾画记录。</p>'}</section>
      <section class="record-section"><div class="record-heading"><strong>${state.pageOnly ? '本页笔记' : '项目笔记文件'}</strong><span>${visibleNotes.length}</span></div>${visibleNotes.length ? renderNotes(visibleNotes) : '<p class="empty-record">在上方写下本页第一条笔记。</p>'}</section>
    </div>
    <footer>项目级 Markdown 自动汇总 · ${data.notes.length} 条笔记 · ${data.annotations.length} 条批注</footer>
  </section>`;
  bindCompanion();
}

function annotationCard(item) {
  return `<article class="record-card annotation-card"><button class="page-badge" data-go-page="${item.pageNumber}">P.${item.pageNumber}</button><div><span>${item.kind === 'area' ? '框选勾画' : '文本高亮'}</span><p>${escapeHtml(item.payload.quote || '已标记页面区域')}</p><small class="source-line">来源 · ${escapeHtml(state.data.paper.title)}</small></div><button class="delete-record" data-delete-annotation="${escapeAttr(item.id)}" aria-label="删除批注">×</button></article>`;
}

function noteCard(item) {
  const canJump = item.attachmentId === state.context.attachmentId && item.pageNumber;
  const tags = item.tags?.length ? `<div class="note-tags">${item.tags.map(tag => `<i># ${escapeHtml(tag)}</i>`).join('')}</div>` : '';
  const quote = item.quote ? `<blockquote>${escapeHtml(item.quote)}</blockquote>` : '';
  const content = item.content ? `<p>${escapeHtml(item.content)}</p>` : '';
  const source = item.paperTitle || '项目通用笔记';
  return `<article class="record-card note-card"><button class="page-badge" ${canJump ? `data-go-page="${item.pageNumber}"` : 'disabled'}>P.${item.pageNumber || '—'}</button><div>${tags}${quote}${content}<small class="source-line">来源 · ${escapeHtml(source)}${item.pageNumber ? ` · P.${item.pageNumber}` : ''}</small><time>${formatTime(item.createdAt)}</time></div><button class="delete-record" data-delete-note="${escapeAttr(item.id)}" aria-label="删除笔记">×</button></article>`;
}

function renderNotes(notes) {
  if (state.pageOnly) return notes.map(noteCard).join('');
  const groups = new Map();
  for (const note of notes) {
    const source = note.paperTitle || '项目通用笔记';
    if (!groups.has(source)) groups.set(source, []);
    groups.get(source).push(note);
  }
  return [...groups.entries()].map(([source, sourceNotes]) => `<section class="source-group"><header><small>来源文献</small><h3 title="${escapeAttr(source)}">${escapeHtml(source)}</h3><span>${sourceNotes.length} 条</span></header>${sourceNotes.map(noteCard).join('')}</section>`).join('');
}

function bindCompanion() {
  const form = document.querySelector('#companion-note-form');
  const textarea = document.querySelector('#companion-note-content');
  form.addEventListener('submit', saveNote);
  textarea.addEventListener('keydown', event => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      form.requestSubmit();
    }
  });
  document.querySelectorAll('[data-composer-tag]').forEach(button => button.addEventListener('click', () => {
    const tag = button.dataset.composerTag;
    state.composerTags = state.composerTags.includes(tag) ? state.composerTags.filter(item => item !== tag) : [...state.composerTags, tag].slice(0, 8);
    button.classList.toggle('active', state.composerTags.includes(tag));
  }));
  document.querySelectorAll('[data-record-filter]').forEach(button => button.addEventListener('click', () => {
    state.pageOnly = button.dataset.recordFilter === 'page';
    renderCompanion();
  }));
  document.querySelectorAll('[data-go-page]').forEach(button => button.addEventListener('click', () => channel?.postMessage({ type: 'go-page', pageNumber: Number(button.dataset.goPage) })));
  document.querySelectorAll('[data-delete-note]').forEach(button => button.addEventListener('click', () => deleteNote(button.dataset.deleteNote)));
  document.querySelectorAll('[data-delete-annotation]').forEach(button => button.addEventListener('click', () => deleteAnnotation(button.dataset.deleteAnnotation)));
}

async function saveNote(event) {
  event.preventDefault();
  const content = document.querySelector('#companion-note-content').value.trim();
  if (!content) return;
  try {
    const result = await api(`/projects/${encodeURIComponent(state.context.projectId)}/attachments/${encodeURIComponent(state.context.attachmentId)}/notes`, {
      method: 'POST', body: JSON.stringify({ pageNumber: state.context.pageNumber, content, tags: state.composerTags }),
    });
    state.data.notes.unshift(result.note);
    renderCompanion('笔记已保存，并同步到项目汇总文件。');
    channel?.postMessage({ type: 'notes-updated', projectId: state.context.projectId });
  } catch (error) { renderError(error); }
}

async function deleteNote(noteId) {
  try {
    const result = await api(`/projects/${encodeURIComponent(state.context.projectId)}/notes/${encodeURIComponent(noteId)}`, { method: 'DELETE' });
    state.data.notes = state.data.notes.filter(note => note.id !== noteId);
    renderCompanion('笔记已删除，项目汇总文件已更新。');
    channel?.postMessage({ type: 'note-deleted', annotationId: result.deleted.annotationId });
  } catch (error) { renderError(error); }
}

async function deleteAnnotation(annotationId) {
  try {
    await api(`/projects/${encodeURIComponent(state.context.projectId)}/annotations/${encodeURIComponent(annotationId)}`, { method: 'DELETE' });
    state.data.annotations = state.data.annotations.filter(item => item.id !== annotationId);
    renderCompanion('批注已删除。');
    channel?.postMessage({ type: 'annotation-deleted', annotationId });
  } catch (error) { renderError(error); }
}

function renderError(error) {
  root.innerHTML = `<section class="companion-shell error"><span>Research notes</span><h1>暂时无法同步笔记</h1><p>${escapeHtml(error?.message || '未知错误')}</p><button id="retry-context">重新加载</button></section>`;
  document.querySelector('#retry-context')?.addEventListener('click', () => loadContext(state.context));
}

function formatTime(value) {
  try { return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)); }
  catch { return ''; }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function escapeAttr(value) { return escapeHtml(value).replace(/`/g, '&#96;'); }

channel?.addEventListener('message', event => {
  if (event.data?.type === 'reader-context') loadContext(event.data);
  if (event.data?.type === 'annotations-updated') loadContext(event.data, true);
  if (event.data?.type === 'notes-updated') loadContext(state.context, true);
  if (event.data?.type === 'reader-closed') {
    state.context = null;
    state.data = null;
    renderIdle();
  }
});

renderIdle();
channel?.postMessage({ type: 'request-context' });
window.setTimeout(() => channel?.postMessage({ type: 'request-context' }), 900);
try {
  const savedContext = JSON.parse(localStorage.getItem('hana-research-reader-context') || 'null');
  if (savedContext) loadContext(savedContext);
} catch {}
window.setInterval(() => {
  try {
    const savedContext = JSON.parse(localStorage.getItem('hana-research-reader-context') || 'null');
    if (!savedContext) return;
    if (savedContext.attachmentId !== state.context?.attachmentId || savedContext.pageNumber !== state.context?.pageNumber) loadContext(savedContext);
  } catch {}
}, 750);
