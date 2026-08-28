import { getStore, textResult, runTool, agentInfo } from './_shared.js';

export const name = 'delete_project_note';

export const description =
  '删除项目中的一条研究笔记；若该笔记关联高亮批注则一并删除，并自动重建项目级 Markdown。属于状态变更操作，需要用户确认。';

export const promptGuidelines = [
  '删除前先用 read_project_notes 确认 noteId 与内容，并向用户说明将要删除的笔记。',
  '删除不可恢复：关联的原文高亮会一起删除。',
].join('\n');

export const sessionPermission = {
  kind: 'review',
  describeSideEffect: (input = {}) => ({
    kind: 'workspace_write',
    summary: `删除项目 ${input.projectId || '未知'} 中的笔记 ${input.noteId || '未知'}（关联高亮一并删除，不可恢复），并重建项目级 Markdown。`,
    ruleId: 'hana-research-delete-project-note',
  }),
};

export const parameters = {
  type: 'object',
  properties: {
    projectId: { type: 'string', description: '项目 ID' },
    noteId: { type: 'string', description: '要删除的笔记 ID' },
  },
  required: ['projectId', 'noteId'],
};

export function execute(input, ctx) {
  const projectId = String(input?.projectId || '').trim();
  const noteId = String(input?.noteId || '').trim();
  if (!projectId) return textResult('错误（PROJECT_ID_REQUIRED）：请提供项目 ID。', { error: 'PROJECT_ID_REQUIRED' });
  if (!noteId) return textResult('错误（NOTE_ID_REQUIRED）：请提供笔记 ID。', { error: 'NOTE_ID_REQUIRED' });

  return runTool('删除项目笔记', () => {
    const store = getStore(ctx);
    const deleted = store.deleteNote(projectId, noteId);
    store.auditAgentToolCall(name, { projectId, noteId }, agentInfo(ctx));
    return textResult(
      `已删除笔记（ID ${deleted.id}）${deleted.annotationId ? '及其关联高亮' : ''}，项目 Markdown 已更新。`,
      { deleted },
    );
  });
}
