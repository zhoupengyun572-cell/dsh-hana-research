import { getStore, textResult, runTool, agentInfo } from './_shared.js';

export const name = 'edit_project_note';

export const description =
  '更新项目中的一条研究笔记（内容、原文引用、标签、页码可分别修改；未提供的字段保持不变）。若笔记关联高亮，其原文与标签会同步更新，并自动重建项目级 Markdown。属于状态变更操作，需要用户确认。';

export const promptGuidelines = [
  '编辑前先用 read_project_notes 确认 noteId 与当前内容。',
  '至少提供一个可编辑字段（content / quote / tags / pageNumber），否则工具会报错。',
  '修改标签会同步更新关联高亮与 project-notes.md。',
].join('\n');

export const sessionPermission = {
  kind: 'review',
  describeSideEffect: (input = {}) => ({
    kind: 'workspace_write',
    summary: `更新项目 ${input.projectId || '未知'} 中的笔记 ${input.noteId || '未知'}（内容/引用/标签/页码），并重建项目级 Markdown。`,
    ruleId: 'hana-research-edit-project-note',
  }),
};

export const parameters = {
  type: 'object',
  properties: {
    projectId: { type: 'string', description: '项目 ID' },
    noteId: { type: 'string', description: '要编辑的笔记 ID' },
    content: { type: 'string', description: '可选：新的笔记正文' },
    quote: { type: 'string', description: '可选：新的原文引用' },
    tags: { type: 'array', items: { type: 'string' }, description: '可选：新的标签列表，最多 8 个' },
    pageNumber: { type: 'number', description: '可选：新的页码' },
  },
  required: ['projectId', 'noteId'],
};

export function execute(input, ctx) {
  const projectId = String(input?.projectId || '').trim();
  const noteId = String(input?.noteId || '').trim();
  if (!projectId) return textResult('错误（PROJECT_ID_REQUIRED）：请提供项目 ID。', { error: 'PROJECT_ID_REQUIRED' });
  if (!noteId) return textResult('错误（NOTE_ID_REQUIRED）：请提供笔记 ID。', { error: 'NOTE_ID_REQUIRED' });

  const hasChange = input?.content !== undefined
    || input?.quote !== undefined
    || input?.tags !== undefined
    || input?.pageNumber !== undefined;
  if (!hasChange) {
    return textResult('错误（EDIT_NOTE_NO_CHANGE）：请至少提供一个要修改的字段（content / quote / tags / pageNumber）。', {
      error: 'EDIT_NOTE_NO_CHANGE',
    });
  }

  return runTool('编辑项目笔记', () => {
    const store = getStore(ctx);
    const note = store.updateNote({
      projectId,
      noteId,
      content: input.content === undefined ? undefined : String(input.content),
      quote: input.quote === undefined ? undefined : String(input.quote),
      tags: Array.isArray(input.tags) ? input.tags.map(String) : undefined,
      pageNumber: input.pageNumber === undefined ? undefined : Number(input.pageNumber),
    });
    store.auditAgentToolCall(name, {
      projectId,
      noteId,
      pageNumber: note.pageNumber || null,
      tags: note.tags,
    }, agentInfo(ctx));
    return textResult(
      `已更新项目「${store.getProject(projectId).title}」中的笔记（ID ${note.id}）。`,
      { note: { id: note.id, content: note.content, quote: note.quote, tags: note.tags, pageNumber: note.pageNumber } },
    );
  });
}
