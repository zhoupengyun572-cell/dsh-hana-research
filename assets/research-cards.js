/**
 * HanaResearch 对话内嵌卡片（阶段「融入 Agent 工作逻辑」）。
 *
 * 宿主渲染：Agent 工具返回 details.card → PluginCardBlock iframe（≤400×600）。
 * 本脚本负责：
 * - 按 data-card 渲染对应卡片（检索结果 / 期刊更新 / 项目概览）；
 * - 卡片自行调 API 拉取最新数据（数据新鲜，交互不消耗模型 token）；
 * - 通过宿主消息协议上报内容高度（resize-request），让卡片高度自适应；
 * - 行内操作直接调 API（收藏 / 保存 / 导入），并提供「在工作区打开」深链。
 */

const cardRoot = document.querySelector('#card-root');
const cardKind = document.body.dataset.card || '';

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

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

const icons = {
  mark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/></svg>',
  bookmark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M6 3h12v18l-6-4-6 4V3Z"/></svg>',
  pdf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5M9 13h6M9 17h4"/></svg>',
};

/** 向宿主上报卡片内容高度（resize-request 协议，≤400×600 由宿主钳制）。 */
function reportHeight() {
  const height = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
  window.parent?.postMessage({ type: 'resize-request', payload: { height } }, '*');
}

function cardHead(title, meta = '') {
  return `<div class="card-head"><span class="card-mark">${icons.mark}</span><strong>${escapeHtml(title)}</strong><span>${escapeHtml(meta)}</span></div>`;
}

function cardFoot(links, note = '') {
  const linkHtml = (Array.isArray(links) ? links : []).map(
    item => `<a href="${escapeAttr(item.href)}" target="_blank" rel="noopener">${escapeHtml(item.label)}</a>`,
  ).join('');
  return `<div class="card-foot">${linkHtml}<span>${escapeHtml(note)}</span></div>`;
}

function renderCard(html) {
  cardRoot.innerHTML = html;
  window.requestAnimationFrame(reportHeight);
}

function renderError(message) {
  renderCard(`<div class="card-error">${escapeHtml(message)}</div>`);
}

function renderLoading(message = '正在加载…') {
  cardRoot.innerHTML = `<div class="card-loading">${escapeHtml(message)}</div>`;
  window.requestAnimationFrame(reportHeight);
}

function workspaceUrl(route) {
  const params = new URLSearchParams(window.location.search);
  const surface = params.get('pluginSurfaceSession');
  const agent = params.get('agentId');
  const qs = new URLSearchParams();
  if (surface) qs.set('pluginSurfaceSession', surface);
  if (agent) qs.set('agentId', agent);
  const query = qs.toString();
  return `/api/plugins/hana-research${route}${query ? `?${query}` : ''}`;
}

/* ── 检索结果卡片 ─────────────────────────────── */

async function renderSearchResultsCard() {
  const params = new URLSearchParams(window.location.search);
  const query = (params.get('q') || '').trim();
  if (!query) {
    renderError('缺少检索关键词（q 参数）。');
    return;
  }
  renderLoading(`正在检索「${query}」…`);
  try {
    const data = await api(`/search/web?q=${encodeURIComponent(query)}&perSource=8`);
    const results = data.results || [];
    const projects = (await api('/projects')).projects || [];
    const targetProjectId = localStorage.getItem('hana-research-target-project') || projects[0]?.id || '';
    const targetProject = projects.find(project => project.id === targetProjectId) || projects[0] || null;

    const head = cardHead('全网学术检索', `${data.total || 0} 条结果`);
    const visible = results.slice(0, 12);
    const moreNote = results.length > visible.length
      ? `（卡片内展示前 ${visible.length} 条，其余请在文献中心查看）`
      : '';
    const body = visible.length
      ? `<div class="card-results">${visible.map((record, index) => {
          const pdf = record.pdfUrl ? '<span class="oa-badge">OPEN PDF</span>' : '<span class="source-pending">仅元数据</span>';
          const authors = record.authors ? escapeHtml(record.authors.slice(0, 60)) : '作者未记录';
          const doi = record.doi ? ` · DOI ${escapeHtml(record.doi)}` : '';
          const canImport = Boolean(record.pdfUrl && targetProject);
          return `<div class="card-result" data-result>
            <div class="card-result-main">
              <div class="card-result-meta"><span>${escapeHtml(record.sourceName)}</span><span>·</span><span>${escapeHtml(record.year || '')}</span>${pdf}</div>
              <h4 title="${escapeAttr(record.title)}">${escapeHtml(record.title)}</h4>
              <div class="card-result-sub">${authors}${doi}</div>
            </div>
            <div class="card-result-actions">
              ${canImport ? `<button class="pdf-import-button" data-save="${index}" data-action="import" title="保存并导入到 ${escapeAttr(targetProject?.title || '')}">${icons.pdf}<span>导入</span></button>` : ''}
              <button class="save-button" data-save="${index}" data-action="favorite" aria-label="收藏检索结果">${icons.bookmark}</button>
            </div>
          </div>`;
        }).join('')}</div>`
      : '<div class="card-empty">没有找到匹配的文献。<br>试试用英文主题词或作者姓名检索。</div>';

    const foot = cardFoot([
      { href: workspaceUrl('/literature'), label: '在文献中心打开 →' },
    ], targetProject ? `导入目标：${targetProject.title}${moreNote}` : `请先在工作区创建项目${moreNote}`);

    renderCard(`${head}${body}${foot}`);

    // 行内操作：保存/导入（直接调 API，不跳转）
    cardRoot.querySelectorAll('[data-save]').forEach(button => {
      button.addEventListener('click', async () => {
        const index = Number(button.dataset.save);
        const record = results[index];
        const action = button.dataset.action;
        if (!record || button.disabled) return;
        button.disabled = true;
        try {
          if (action === 'favorite') {
            const saved = await api('/search/save', {
              method: 'POST',
              body: JSON.stringify({ record: { ...record, topic: record.topic || '未分类' } }),
            });
            const paper = saved.paper;
            if (!paper.favorite) {
              await api(`/papers/${encodeURIComponent(paper.id)}/favorite`, {
                method: 'PATCH',
                body: JSON.stringify({ favorite: true }),
              });
            }
            button.classList.add('saved');
            button.setAttribute('aria-label', '已收藏');
            button.disabled = false;
          } else if (action === 'import' && targetProject) {
            const saved = await api('/search/save', {
              method: 'POST',
              body: JSON.stringify({ record: { ...record, topic: record.topic || '未分类' } }),
            });
            await api(`/projects/${encodeURIComponent(targetProject.id)}/import-pdf`, {
              method: 'POST',
              body: JSON.stringify({ paperId: saved.paper.id }),
            });
            const row = button.closest('.card-result');
            if (row) {
              const tag = document.createElement('span');
              tag.className = 'card-saved-tag';
              tag.textContent = '已导入';
              button.replaceWith(tag);
            }
          }
        } catch (error) {
          button.disabled = false;
          renderError(`操作失败：${error.message}`);
        }
      });
    });
  } catch (error) {
    renderError(error.message);
  }
}

/* ── 期刊更新卡片 ─────────────────────────────── */

async function renderJournalUpdatesCard() {
  renderLoading('正在读取期刊同步状态…');
  try {
    const data = await api('/journals');
    const sources = data.sources || [];
    const synced = sources.filter(source => source.lastSyncedAt && !source.lastError);
    const failed = sources.filter(source => source.lastError);
    const running = data.running;

    const head = cardHead('期刊更新', running ? '同步中…' : `${synced.length}/${sources.length} 个源正常`);

    const groupRows = (venue) => {
      // 最近同步日志只给了聚合数；这里按「最近同步新增数 > 0 或最近同步时间」展示
      return null;
    };

    // 从日志取最近一次全量同步摘要
    const logs = data.logs || [];
    const recentByVenue = new Map();
    for (const log of logs) {
      if (!recentByVenue.has(log.venue)) recentByVenue.set(log.venue, log);
    }
    const recent = [...recentByVenue.values()].slice(0, 8);

    const body = recent.length
      ? `<div class="card-journal-group">${recent.map(log => {
          const badge = log.error
            ? '<span class="journal-badge failed">异常</span>'
            : (log.inserted > 0 ? `<span class="journal-badge ok">＋${log.inserted}</span>` : '<span class="journal-badge idle">无新增</span>');
          return `<div class="card-journal-row">
            <div class="card-result-sub"><strong>${escapeHtml(log.venue)}</strong><span>${escapeHtml(log.error || `抓取 ${log.fetched} 篇`) }</span></div>
            ${badge}
          </div>`;
        }).join('')}</div>`
      : '<div class="card-empty">还没有同步记录。<br>点击下方按钮从期刊官网拉取最新文献。</div>';

    const syncButton = running
      ? '<button class="card-button primary" disabled>同步进行中…</button>'
      : '<button class="card-button primary" id="card-sync">立即同步全部期刊</button>';
    const foot = cardFoot([
      { href: workspaceUrl('/literature'), label: '在文献中心查看期刊栏 →' },
    ], failed.length ? `${failed.length} 个源异常` : '');

    renderCard(`${head}${body}<div class="card-foot">${syncButton}<span>每 24 小时自动同步</span></div>${foot}`);

    cardRoot.querySelector('#card-sync')?.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      button.textContent = '正在同步…';
      try {
        await api('/journals/sync', { method: 'POST' });
        button.textContent = '已触发同步';
        window.setTimeout(() => renderJournalUpdatesCard(), 1500);
      } catch (error) {
        button.disabled = false;
        button.textContent = '同步失败，重试';
        renderError(error.message);
      }
    });
  } catch (error) {
    renderError(error.message);
  }
}

/* ── 项目概览卡片 ─────────────────────────────── */

async function renderProjectOverviewCard() {
  renderLoading('正在读取项目库…');
  try {
    const data = await api('/projects');
    const projects = data.projects || [];

    const head = cardHead('研究项目库', `${projects.length} 个项目`);
    const body = projects.length
      ? `<div class="card-projects">${projects.map(project => `
          <div class="card-project" data-project="${escapeAttr(project.id)}">
            <div class="card-project-main">
              <strong>${escapeHtml(project.title)}</strong>
              <span>${escapeHtml(project.description || '')}</span>
            </div>
            <div class="card-project-stats">
              <span><b>${project.paperCount}</b> 篇</span>
              <span><b>${project.pdfCount}</b> PDF</span>
              <span><b>${project.noteCount}</b> 笔记</span>
            </div>
          </div>`).join('')}</div>`
      : '<div class="card-empty">研究项目库目前为空。<br>到项目库工作区新建一个研究项目。</div>';

    const foot = cardFoot([
      { href: workspaceUrl('/projects'), label: '在项目库打开 →' },
    ], '本地 SQLite · 可追溯');

    renderCard(`${head}${body}${foot}`);

    cardRoot.querySelectorAll('[data-project]').forEach(card => {
      card.addEventListener('click', () => {
        window.location.href = workspaceUrl('/projects');
      });
    });
  } catch (error) {
    renderError(error.message);
  }
}

/* ── 项目研究简报卡片 ─────────────────────────── */

async function renderProjectBriefCard() {
  const params = new URLSearchParams(window.location.search);
  const projectId = (params.get('projectId') || '').trim();
  if (!projectId) {
    renderError('缺少项目 ID。');
    return;
  }
  renderLoading('正在整理项目研究简报…');
  try {
    const [data, notesData, relationsData] = await Promise.all([
      api(`/projects/${encodeURIComponent(projectId)}/papers`),
      api(`/projects/${encodeURIComponent(projectId)}/notes`).catch(() => ({ notes: [] })),
      api(`/projects/${encodeURIComponent(projectId)}/relations`).catch(() => ({ relations: [] })),
    ]);
    const project = data.project;
    const papers = data.papers || [];
    const notes = notesData.notes || [];
    const relations = relationsData.relations || [];
    const pdfs = papers.filter(paper => paper.attachmentId).length;
    const read = papers.filter(paper => paper.readStatus === 'read').length;
    const reading = papers.filter(paper => paper.readStatus === 'reading').length;
    const roleTagged = papers.filter(paper => paper.role).length;
    const gaps = [];
    if (!papers.length) gaps.push('尚未收录文献');
    if (papers.length > pdfs) gaps.push(`${papers.length - pdfs} 篇无本地 PDF`);
    if (papers.length > roleTagged) gaps.push(`${papers.length - roleTagged} 篇未标注角色`);
    if (!notes.length) gaps.push('尚无项目笔记');
    if (papers.length > 1 && !relations.length) gaps.push('尚未建立论证关系');

    const head = cardHead(project?.title || '项目研究简报', `${papers.length} 篇文献`);
    const metrics = `<div class="card-project-stats">
      <span><b>${pdfs}</b> PDF</span><span><b>${read}</b> 已读</span><span><b>${reading}</b> 在读</span><span><b>${notes.length}</b> 笔记</span>
    </div>`;
    const paperRows = papers.slice(0, 5).map(paper => `<div class="card-project">
      <div class="card-project-main"><strong>${escapeHtml(paper.title)}</strong><span>${escapeHtml([paper.year, paper.venue, paper.role || '未标注角色'].filter(Boolean).join(' · '))}</span></div>
    </div>`).join('');
    const body = `${metrics}${gaps.length ? `<div class="card-empty" style="padding:10px 12px;text-align:left">当前缺口：${escapeHtml(gaps.join('；'))}</div>` : ''}${paperRows ? `<div class="card-projects">${paperRows}</div>` : ''}`;
    const foot = cardFoot([{ href: workspaceUrl('/projects'), label: '打开项目工作区 →' }], `${relations.length} 条论证关系 · 本地证据`);
    renderCard(`${head}${body}${foot}`);
  } catch (error) {
    renderError(error.message);
  }
}

/* ── 入口 ──────────────────────────────────────── */

async function main() {
  try {
    if (cardKind === 'search-results') await renderSearchResultsCard();
    else if (cardKind === 'journal-updates') await renderJournalUpdatesCard();
    else if (cardKind === 'project-overview') await renderProjectOverviewCard();
    else if (cardKind === 'project-brief') await renderProjectBriefCard();
    else renderError(`未知卡片类型：${cardKind}`);
  } catch (error) {
    renderError(error.message);
  }
}

// 内容变化后自适应高度（宿主钳制在 400×600 内）
if (typeof ResizeObserver !== 'undefined') {
  new ResizeObserver(() => reportHeight()).observe(document.body);
}
window.addEventListener('message', (event) => {
  if (event.data === 'hana.card-ping') reportHeight();
});

main();
