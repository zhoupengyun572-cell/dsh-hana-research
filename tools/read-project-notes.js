import { getStore, textResult, runTool } from './_shared.js';

export const name = 'read_project_notes';

export const description =
  '读取某项目的全部研究笔记，可按页码或标签过滤，返回来源文献与页码标注。只读操作。';

export const sessionPermission = { readOnly: true };

export const parameters = {
  type: 'object',
  properties: {
    projectId: { type: 'string', description: '项目 ID' },
    pageNumber: { type: 'number', description: '可选：只返回指定页的笔记' },
    tag: { type: 'string', description: '可选：只返回带指定标签的笔记（如 关键证据）' },
    limit: { type: 'number', description: '可选：最多返回条数，默认 50，最大 200' },
  },
  required: ['projectId'],
};

export function execute(input, ctx) {
  return runTool('读取项目笔记', () => {
    const store = getStore(ctx);
    const projectId = String(input?.projectId || '').trim();
    if (!projectId) return textResult('错误（PROJECT_ID_REQUIRED）：请提供项目 ID。', { error: 'PROJECT_ID_REQUIRED' });

    const project = store.getProject(projectId);
    if (!project) return textResult(`错误（PROJECT_NOT_FOUND）：项目 ${projectId} 不存在。`, { error: 'PROJECT_NOT_FOUND' });

    const pageNumber = input?.pageNumber == null ? null : Number(input.pageNumber);
    const tag = String(input?.tag || '').trim().replace(/^#/, '');
    const limit = Math.min(Math.max(Number(input?.limit ?? 50) || 50, 1), 200);

    let notes = store.listNotes(projectId);
    if (Number.isInteger(pageNumber) && pageNumber > 0) {
      notes = notes.filter((note) => note.pageNumber === pageNumber);
    }
    if (tag) {
      notes = notes.filter((note) => (note.tags || []).some((item) => item.toLowerCase() === tag.toLowerCase()));
    }
    const sliced = notes.slice(0, limit);

    if (!sliced.length) {
      return textResult(`项目「${project.title}」没有匹配的笔记。`, {
        project: { id: project.id, title: project.title },
        notes: [],
        total: notes.length,
      });
    }

    const lines = sliced.map((note) => {
      const source = note.paperTitle ? `《${note.paperTitle}》` : '项目通用笔记';
      const page = note.pageNumber ? ` · 第 ${note.pageNumber} 页` : '';
      const tags = note.tags?.length ? ` #${note.tags.join(' #')}` : '';
      const content = String(note.content || note.quote || '').replace(/\s+/g, ' ').slice(0, 160);
      return `- [${note.id}] ${source}${page}${tags}：${content}`;
    });

    return textResult(
      `项目「${project.title}」共 ${notes.length} 条匹配笔记，返回前 ${sliced.length} 条：\n${lines.join('\n')}`,
      {
        project: { id: project.id, title: project.title },
        notes: sliced,
        total: notes.length,
        truncated: notes.length > sliced.length,
      },
    );
  });
}
