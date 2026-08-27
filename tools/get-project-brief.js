import { getStore, textResult, runTool } from './_shared.js';

export const name = 'get_project_brief';

export const description =
  '生成一个研究项目的结构化工作简报：汇总项目元信息、文献/PDF/阅读状态、逐句证据笔记、汇总笔记、文献关系与当前缺口。适合 Agent 在继续综述、比较证据、规划下一步前先建立真实项目上下文。只读操作。';

export const promptGuidelines = [
  '当用户说“继续这个项目”“根据我的笔记”“帮我看看下一步”但没有给出完整上下文时，优先调用本工具。',
  '简报中的“建议下一步”是基于资料完整度的启发式提示，不是用户已经作出的研究决定。',
  '引用项目证据时保留文献标题、页码和标签；没有 PDF 或笔记时不要声称已经阅读全文。',
].join('\n');

export const sessionPermission = { readOnly: true };

export const parameters = {
  type: 'object',
  properties: {
    projectId: { type: 'string', description: '项目 ID（可先调用 list_research_projects 获取）' },
    evidenceLimit: { type: 'number', description: '最多返回多少条近期证据笔记，默认 12，范围 3–30' },
  },
  required: ['projectId'],
};

const READ_LABELS = { unread: '未读', reading: '在读', read: '已读' };
const ROLE_LABELS = { core: '核心文献', background: '背景', method: '方法参考', compare: '结果对比' };

function clip(value, limit = 180) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

export function execute(input, ctx) {
  return runTool('生成项目研究简报', () => {
    const store = getStore(ctx);
    const projectId = String(input?.projectId || '').trim();
    if (!projectId) return textResult('错误（PROJECT_ID_REQUIRED）：请提供项目 ID。', { error: 'PROJECT_ID_REQUIRED' });
    const project = store.getProject(projectId);
    if (!project) return textResult(`错误（PROJECT_NOT_FOUND）：项目 ${projectId} 不存在。`, { error: 'PROJECT_NOT_FOUND' });

    const evidenceLimit = Math.min(Math.max(Number(input?.evidenceLimit ?? 12) || 12, 3), 30);
    const papers = store.listProjectPapers(projectId);
    const legacyNotes = store.listNotes(projectId);
    const relations = store.listPaperRelations(projectId);
    const evidence = [];
    let sentenceNoteCount = 0;
    let summaryDocumentCount = 0;

    for (const paper of papers) {
      const sentenceNotes = store.listSentenceNotes({ paperId: paper.id });
      const summary = store.getPaperNoteDocument(paper.id);
      sentenceNoteCount += sentenceNotes.length;
      if (summary?.markdown?.trim()) summaryDocumentCount += 1;
      for (const note of sentenceNotes) {
        evidence.push({
          kind: 'sentence',
          paperId: paper.id,
          paperTitle: paper.title,
          pageNumber: note.pageNumber,
          quote: clip(note.quotedText, 220),
          comment: clip(note.comment, 220),
          tags: note.tags || [],
          status: note.status || 'inbox',
          importance: note.importance || 2,
          updatedAt: note.updatedAt || note.createdAt,
        });
      }
      if (summary?.markdown?.trim()) {
        evidence.push({
          kind: 'summary',
          paperId: paper.id,
          paperTitle: paper.title,
          pageNumber: null,
          quote: '',
          comment: clip(summary.markdown, 300),
          tags: summary.tags || [],
          status: 'summary',
          importance: 3,
          updatedAt: summary.updatedAt,
        });
      }
    }
    for (const note of legacyNotes) {
      evidence.push({
        kind: 'project-note',
        paperId: note.paperId,
        paperTitle: note.paperTitle || '项目通用笔记',
        pageNumber: note.pageNumber,
        quote: clip(note.quote, 220),
        comment: clip(note.content, 220),
        tags: note.tags || [],
        status: 'note',
        importance: 2,
        updatedAt: note.updatedAt || note.createdAt,
      });
    }
    evidence.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
    const recentEvidence = evidence.slice(0, evidenceLimit);

    const counts = {
      papers: papers.length,
      pdfs: papers.filter((paper) => paper.attachmentId).length,
      unread: papers.filter((paper) => paper.readStatus === 'unread').length,
      reading: papers.filter((paper) => paper.readStatus === 'reading').length,
      read: papers.filter((paper) => paper.readStatus === 'read').length,
      prioritized: papers.filter((paper) => paper.priority).length,
      roleTagged: papers.filter((paper) => paper.role).length,
      methodologyTagged: papers.filter((paper) => paper.methodology?.length).length,
      sentenceNotes: sentenceNoteCount,
      projectNotes: legacyNotes.length,
      summaries: summaryDocumentCount,
      relations: relations.length,
    };

    const gaps = [];
    const nextActions = [];
    if (!papers.length) {
      gaps.push('项目尚未收录文献');
      nextActions.push('围绕项目问题检索并筛选首批核心文献');
    } else {
      const missingPdf = counts.papers - counts.pdfs;
      if (missingPdf) gaps.push(`${missingPdf} 篇文献尚无本地 PDF`);
      if (counts.unread) gaps.push(`${counts.unread} 篇文献仍标记为未读`);
      if (counts.roleTagged < counts.papers) gaps.push(`${counts.papers - counts.roleTagged} 篇文献尚未标注项目角色`);
      if (counts.methodologyTagged < counts.papers) gaps.push(`${counts.papers - counts.methodologyTagged} 篇文献尚未标注方法学信息`);
      if (!evidence.length) gaps.push('项目尚无可供综合的证据笔记');
      if (!relations.length && counts.papers > 1) gaps.push('文献之间尚未建立支持/反驳/引用关系');

      if (counts.unread) nextActions.push('优先精读高优先级未读文献并提取逐句证据');
      if (!evidence.length) nextActions.push('从核心文献开始记录“原文摘录 + 我的理解 + 分类标签”');
      if (counts.roleTagged < counts.papers) nextActions.push('标注文献在项目中的角色，区分核心、背景、方法与结果对比');
      if (counts.methodologyTagged < counts.papers) nextActions.push('补充研究设计、样本与测量工具等方法学标签');
      if (evidence.length && !relations.length && counts.papers > 1) nextActions.push('比较现有证据并建立文献间支持/反驳关系');
      if (evidence.length >= 3 && summaryDocumentCount < counts.pdfs) nextActions.push('把逐句证据整理进各文献的汇总笔记');
    }

    const lines = [
      `项目：${project.title}（${project.id}）`,
      project.description ? `目标：${clip(project.description, 260)}` : null,
      `状态：${project.status || 'active'}${project.projectType ? ` · ${project.projectType}` : ''}`,
      `资料：${counts.papers} 篇文献 / ${counts.pdfs} 份 PDF；阅读 ${counts.read} 已读、${counts.reading} 在读、${counts.unread} 未读`,
      `证据：${counts.sentenceNotes} 条逐句笔记 / ${counts.projectNotes} 条项目笔记 / ${counts.summaries} 份汇总笔记 / ${counts.relations} 条文献关系`,
    ].filter(Boolean);

    if (papers.length) {
      lines.push('文献概览：');
      for (const paper of papers.slice(0, 20)) {
        const meta = [paper.year, paper.venue, READ_LABELS[paper.readStatus] || paper.readStatus, ROLE_LABELS[paper.role] || paper.role, paper.priority?.toUpperCase()]
          .filter(Boolean).join(' · ');
        lines.push(`- ${paper.title}${meta ? `（${meta}）` : ''}${paper.attachmentId ? '' : '［无 PDF］'}`);
      }
      if (papers.length > 20) lines.push(`- …另有 ${papers.length - 20} 篇文献未在文本摘要中展开`);
    }
    if (recentEvidence.length) {
      lines.push(`近期证据（${recentEvidence.length} 条）：`);
      for (const item of recentEvidence) {
        const location = item.pageNumber ? `，第 ${item.pageNumber} 页` : '';
        const tags = item.tags?.length ? ` #${item.tags.join(' #')}` : '';
        const body = item.comment || item.quote || '（空）';
        lines.push(`- ${item.paperTitle}${location}：${body}${tags}`);
      }
    }
    if (gaps.length) lines.push(`当前缺口：${gaps.join('；')}`);
    if (nextActions.length) lines.push(`建议下一步：\n${nextActions.slice(0, 5).map((item, index) => `${index + 1}. ${item}`).join('\n')}`);

    return textResult(lines.join('\n'), {
      project,
      counts,
      papers: papers.slice(0, 50).map((paper) => ({
        id: paper.id,
        title: paper.title,
        year: paper.year,
        venue: paper.venue,
        doi: paper.doi,
        attachmentId: paper.attachmentId,
        readStatus: paper.readStatus,
        priority: paper.priority,
        role: paper.role,
        methodology: paper.methodology,
      })),
      recentEvidence,
      relations,
      gaps,
      nextActions: nextActions.slice(0, 5),
    });
  });
}
