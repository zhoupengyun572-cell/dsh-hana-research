import { getStore, textResult, runTool, agentInfo } from './_shared.js';

export const name = 'create_project_note';

export const description =
  '在指定项目中创建一条研究笔记；可关联某个 PDF 附件与页码，可带原文引用（quote）和最多 8 个标签。写入后自动更新项目级 Markdown 汇总文件。属于状态变更操作，需要用户确认。';

export const promptGuidelines = [
  '创建笔记属于写操作，会写入本地研究库并自动更新项目的 project-notes.md，调用前应向用户确认内容。',
  '引用原文时把原文放进 quote 并尽可能提供 pageNumber，以便保留来源与页码。',
  '标签使用简洁关键词（如 关键证据、理论观点、研究方法、数据结果），最多 8 个。',
  'attachmentId 与 pageNumber 可选；不关联附件时创建的是项目级通用笔记。',
].join('\n');

export const sessionPermission = {
  kind: 'review',
  describeSideEffect: (input = {}) => ({
    kind: 'workspace_write',
    summary: `在项目 ${input.projectId || '未知'} 中创建研究笔记${input.attachmentId ? `（关联附件 ${input.attachmentId}${input.pageNumber ? ` 第 ${input.pageNumber} 页` : ''}）` : ''}，并更新项目级 Markdown 汇总。`,
    ruleId: 'hana-research-create-project-note',
  }),
};

export const parameters = {
  type: 'object',
  properties: {
    projectId: { type: 'string', description: '项目 ID' },
    content: { type: 'string', description: '笔记正文（研究者自己的理解、评注或结论），必填' },
    attachmentId: { type: 'string', description: '可选：关联的 PDF 附件 ID' },
    pageNumber: { type: 'number', description: '可选：来源页码' },
    quote: { type: 'string', description: '可选：原文摘录' },
    tags: {
      type: 'array',
      items: { type: 'string' },
      description: '可选：标签列表，最多 8 个',
    },
  },
  required: ['projectId', 'content'],
};

export function execute(input, ctx) {
  const store = getStore(ctx);
  const projectId = String(input?.projectId || '').trim();
  const content = String(input?.content || '').trim();

  if (!projectId) return textResult('错误（PROJECT_ID_REQUIRED）：请提供项目 ID。', { error: 'PROJECT_ID_REQUIRED' });
  if (!content) return textResult('错误（NOTE_CONTENT_REQUIRED）：笔记内容不能为空。', { error: 'NOTE_CONTENT_REQUIRED' });

  return runTool('创建项目笔记', () => {
    const note = store.createNote({
      projectId,
      attachmentId: input?.attachmentId ? String(input.attachmentId) : null,
      pageNumber: input?.pageNumber == null ? null : Number(input.pageNumber),
      content,
      quote: input?.quote ? String(input.quote) : '',
      tags: Array.isArray(input?.tags) ? input.tags.map(String) : [],
    });
    store.auditAgentToolCall(
      name,
      {
        projectId,
        attachmentId: note.attachmentId || null,
        pageNumber: note.pageNumber || null,
        tags: note.tags,
      },
      agentInfo(ctx),
    );
    const project = store.getProject(projectId);
    const tags = note.tags?.length ? ` #${note.tags.join(' #')}` : '';
    const source = note.paperTitle ? `《${note.paperTitle}》` : '项目通用笔记';
    const page = note.pageNumber ? `第 ${note.pageNumber} 页` : '未关联页码';
    return textResult(
      `已在项目「${project.title}」创建笔记。\n来源：${source} · ${page}${tags}\n笔记 ID：${note.id}`,
      {
        project: { id: projectId, title: project.title },
        note,
      },
    );
  });
}
