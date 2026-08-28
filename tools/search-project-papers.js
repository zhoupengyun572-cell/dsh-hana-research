import { getStore, textResult, runTool } from './_shared.js';

export const name = 'search_project_papers';

export const description =
  '按项目列出其中收录的文献；可用关键字过滤标题、作者、期刊、DOI 或年份。只读操作。';

export const sessionPermission = { readOnly: true };

export const parameters = {
  type: 'object',
  properties: {
    projectId: { type: 'string', description: '项目 ID，例如 project-adolescent-emotion' },
    query: {
      type: 'string',
      description: '可选关键字，匹配标题、作者、期刊、DOI 或年份；不传则返回项目全部文献',
    },
  },
  required: ['projectId'],
};

function paperMatches(paper, query) {
  const needle = String(query || '').trim().toLowerCase();
  if (!needle) return true;
  const haystack = [
    paper.title,
    paper.authors,
    paper.venue,
    paper.doi,
    paper.sourceName,
    String(paper.year),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(needle);
}

export function execute(input, ctx) {
  return runTool('搜索项目文献', () => {
    const store = getStore(ctx);
    const projectId = String(input?.projectId || '').trim();
    if (!projectId) return textResult('错误（PROJECT_ID_REQUIRED）：请提供项目 ID。', { error: 'PROJECT_ID_REQUIRED' });

    const project = store.getProject(projectId);
    if (!project) return textResult(`错误（PROJECT_NOT_FOUND）：项目 ${projectId} 不存在。`, { error: 'PROJECT_NOT_FOUND' });

    const papers = store
      .listProjectPapers(projectId)
      .filter((paper) => paperMatches(paper, input?.query))
      .map((paper) => ({
        id: paper.id,
        title: paper.title,
        authors: paper.authors,
        venue: paper.venue,
        year: paper.year,
        doi: paper.doi,
        topic: paper.topic,
        sourceName: paper.sourceName,
        favorite: paper.favorite,
        attachmentId: paper.attachmentId,
        pdfUrl: paper.pdfUrl,
      }));

    if (!papers.length) {
      return textResult(`项目「${project.title}」中没有匹配的文献。`, {
        project: { id: project.id, title: project.title },
        papers: [],
      });
    }

    const lines = papers.map(
      (paper) =>
        `- ${paper.title}（${paper.year || '年份未知'}，${paper.venue || '期刊未知'}）${paper.attachmentId ? ' [已有本地 PDF]' : ' [无本地 PDF]'}：${paper.id}`,
    );
    return textResult(
      `项目「${project.title}」共 ${papers.length} 篇匹配文献：\n${lines.join('\n')}`,
      { project: { id: project.id, title: project.title }, papers },
    );
  });
}
