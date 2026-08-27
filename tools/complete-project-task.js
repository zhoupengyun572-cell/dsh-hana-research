import { getStore, textResult, runTool, agentInfo } from './_shared.js';

export const name = 'complete_project_task';
export const description = '把一条研究任务标记为完成或重新打开；任务内容与关联文献保持不变。写入操作，需要用户确认。';
export const promptGuidelines = '仅在用户明确表示任务已完成或要求重新打开时调用；先用 list_project_tasks 获取准确 taskId。';
export const sessionPermission = { kind: 'review' };
export const describeSideEffect = input => ({ kind: 'workspace_write', summary: `${input?.completed === false ? '重新打开' : '完成'}研究任务 ${input?.taskId || ''}`, ruleId: 'hana-research-complete-project-task' });
export const parameters = {
  type: 'object',
  properties: {
    projectId: { type: 'string', description: '项目 ID' },
    taskId: { type: 'string', description: '任务 ID' },
    completed: { type: 'boolean', description: 'true 标记完成；false 重新打开，默认 true' },
  },
  required: ['projectId', 'taskId'],
};

export function execute(input, ctx) {
  return runTool('更新研究任务', () => {
    const store = getStore(ctx);
    const projectId = String(input?.projectId || '').trim();
    const taskId = String(input?.taskId || '').trim();
    const task = store.listNotes(projectId).find(note => note.id === taskId);
    if (!task || !(task.tags || []).includes('研究任务')) return textResult('错误（TASK_NOT_FOUND）：没有找到该研究任务。', { error: 'TASK_NOT_FOUND' });
    const completed = input?.completed !== false;
    const tags = (task.tags || []).filter(tag => tag !== '状态:待办' && tag !== '状态:完成');
    tags.push(completed ? '状态:完成' : '状态:待办');
    const updated = store.updateNote({ projectId, noteId: taskId, content: task.content, quote: task.quote, tags, pageNumber: task.pageNumber });
    store.auditAgentToolCall(name, { projectId, taskId, completed }, agentInfo(ctx));
    return textResult(`研究任务「${task.content.split('\n')[0]}」已${completed ? '完成' : '重新打开'}。`, { task: updated, completed });
  });
}

