import { getStore, textResult, runTool } from './_shared.js';

export const name = 'get_research_context';

export const description =
  '获取本地研究活动上下文摘要：最近保存的文献、项目笔记动态、期刊同步状态、收藏文献数。供 Agent 在对话中主动引用用户的研究积累。只读操作。';

export const promptGuidelines = [
  '当用户提及自己之前的研究活动（“我上周保存的文献”“我的项目进展”）时，调用本工具获取上下文。',
  '本工具汇总本地研究库动态，帮助你在回复中引用用户实际保存的文献与笔记，而不是猜测。',
  '注意：此接口是插件自维护的研究记忆摘要；宿主长期记忆接入后数据仍同源。',
].join('\n');

export const sessionPermission = { readOnly: true };

export const parameters = {
  type: 'object',
  properties: {
    projectId: { type: 'string', description: '可选：只看指定项目的研究上下文' },
  },
};

export function execute(params, ctx) {
  return runTool('读取研究上下文', () => {
    const store = getStore(ctx);
    const projectId = params?.projectId ? String(params.projectId).trim() : null;

    const projects = projectId
      ? store.listProjects().filter(project => project.id === projectId)
      : store.listProjects();
    const papers = store.listPapers();
    const favoriteCount = papers.filter(paper => paper.favorite).length;
    const sources = store.listJournalSources();
    const syncedSources = sources.filter(source => source.lastSyncedAt && !source.lastError);
    const failedSources = sources.filter(source => source.lastError);

    // 最近保存的文献（按 updated_at 取前 5）
    const recentPapers = [...papers]
      .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
      .slice(0, 5)
      .map(paper => ({
        title: paper.title,
        venue: paper.venue,
        year: paper.year,
        doi: paper.doi,
        favorite: paper.favorite,
      }));

    const lines = [
      `研究项目：${projects.length} 个（共 ${papers.length} 篇文献、${favoriteCount} 篇收藏）`,
      `期刊同步：${syncedSources.length}/${sources.length} 个源正常${failedSources.length ? `，${failedSources.length} 个异常` : ''}`,
    ];
    if (recentPapers.length) {
      lines.push('最近保存的文献：');
      for (const paper of recentPapers) {
        lines.push(`- ${paper.title}（${paper.venue || '期刊未知'}，${paper.year || '年份未知'}${paper.favorite ? '，已收藏' : ''}）`);
      }
    } else {
      lines.push('文献库中还没有保存的文献。');
    }

    return textResult(lines.join('\n'), {
      projectCount: projects.length,
      paperCount: papers.length,
      favoriteCount,
      journalSynced: syncedSources.length,
      journalTotal: sources.length,
      journalFailed: failedSources.length,
      recentPapers,
    });
  });
}
