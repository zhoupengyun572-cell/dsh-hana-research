// 阅读工作区入口：解析上下文参数（paper 信息经后端 reader 上下文接口获取），挂载 PdfWorkspace。
import React from 'react';
import { createRoot } from 'react-dom/client';
import PdfWorkspace from './app.jsx';
import { readHostTokens, paletteFromTokens, applyPaletteCssVars } from './theme.js';
import { readReaderTheme } from './workspace-utils.js';
import './workbench.css';

const API_BASE = '/api/hana-research';

async function fetchContext(projectId, attachmentId) {
  const response = await fetch(`${API_BASE}/projects/${encodeURIComponent(projectId)}/reader/${encodeURIComponent(attachmentId)}`);
  if (!response.ok) throw new Error('阅读上下文加载失败（' + response.status + '）');
  return response.json();
}

async function boot() {
  const rootEl = document.getElementById('hana-workbench-root');
  if (!rootEl) return;
  const params = new URLSearchParams(window.location.search);
  const projectId = params.get('projectId') || '';
  const attachmentId = params.get('attachmentId') || '';

  // 返回导航上下文：来源 / 项目 / 文献 / 附件（返回时优先按来源还原，不依赖浏览器历史）
  try {
    sessionStorage.setItem('hana-reader-nav', JSON.stringify({
      from: params.get('from') || 'project-detail',
      projectId,
      paperId: params.get('paperId') || '',
      attachmentId,
    }));
  } catch { /* sessionStorage 不可用时退回缺省导航 */ }

  // 先应用主题变量（尊重持久化的强制模式，避免深色用户首帧闪白）
  applyPaletteCssVars(paletteFromTokens(readHostTokens(), readReaderTheme()));

  const root = createRoot(rootEl);
  const renderError = (message) => {
    root.render(
      <div className="wb-boot-state">
        <p className="wb-boot-error">阅读器无法打开：{message}</p>
        <a href="/ui/hana-research/projects" className="wb-boot-back">← 返回项目库</a>
      </div>,
    );
  };

  if (!projectId || !attachmentId) {
    renderError('缺少项目或附件参数');
    return;
  }

  try {
    const context = await fetchContext(projectId, attachmentId);
    const paper = context.paper || {};
    const project = context.project || {};
    document.title = (paper.title || '文献阅读') + ' · ' + (project.title || 'HanaResearch');
    root.render(
      <PdfWorkspace
        projectId={projectId}
        attachmentId={attachmentId}
        paperId={paper.id || ''}
        paperTitle={paper.title || '文献阅读'}
        projectTitle={project.title || ''}
      />,
    );
  } catch (error) {
    renderError(String(error.message || error));
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
