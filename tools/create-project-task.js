import { getStore, textResult, runTool, agentInfo } from './_shared.js';

export const name = 'create_project_task';
export const description = '在指定研究项目中创建一条可追踪研究任务，可设置优先级、截止日期并关联项目内文献。写入操作，需要用户确认。';
export const promptGuidelines = '仅在用户明确要求记录、安排或创建下一步任务时调用；不要把 Agent 自己的建议自动写入任务。';
export const sessionPermission = { kind: 'review' };
export const describeSideEffect = input => ({ kind: 'workspace_write', summary: `在项目 ${input?.projectId || ''} 创建研究任务「${String(input?.title || '').slice(0, 60)}」`, ruleId: 'hana-research-create-project-task' });
export const parameters = {
  type: 'object',
  properties: {
    projectId: { type: 'string', description: '项目 ID' },
    title: { type: 'string', description: '任务标题' },
    details: { type: 'string', description: '可选：任务说明或完成标准' },
    priority: { type: 'string', enum: ['P0', 'P1', 'P2'], description: '可选优先级' },
    dueDate: { type: 'string', description: '可选截止日期，YYYY-MM-DD' },
    paperId: { type: 'string', description: '可选：关联的项目内文献 ID' },
  },
  required: ['projectId', 'title'],
};

export function execute(input, ctx) {
  return runTool('创建研究任务', () => {
    const store = getStore(ctx);
    const projectId = String(input?.projectId || '').trim();
    const title = String(input?.title || '').trim();
    if (!title) return textResult('错误（TASK_TITLE_REQUIRED）：任务标题不能为空。', { error: 'TASK_TITLE_REQUIRED' });
    const project = store.getProject(projectId);
    if (!project) return textResult(`错误（PROJECT_NOT_FOUND）：项目 ${projectId} 不存在。`, { error: 'PROJECT_NOT_FOUND' });
    const paperId = String(input?.paperId || '').trim() || null;
    if (paperId && !store.listProjectPapers(projectId).some(paper => paper.id === paperId)) {
      return textResult('错误（PAPER_NOT_IN_PROJECT）：关联文献不在该项目中。', { error: 'PAPER_NOT_IN_PROJECT' });
    }
    const priority = ['P0', 'P1', 'P2'].includes(input?.priority) ? input.priority : '';
    const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(String(input?.dueDate || '')) ? String(input.dueDate) : '';
    const details = String(input?.details || '').trim();
    const tags = ['研究任务', '状态:待办', ...(priority ? [`优先级:${priority}`] : []), ...(dueDate ? [`截止:${dueDate}`] : [])];
    const task = store.createNote({ projectId, paperId, content: details ? `${title}\n${details}` : title, tags });
    store.auditAgentToolCall(name, { projectId, taskId: task.id, title, priority, dueDate, paperId }, agentInfo(ctx));
    return textResult(`已创建研究任务「${title}」${priority ? `（${priority}）` : ''}${dueDate ? `，截止 ${dueDate}` : ''}。taskId: ${task.id}`, { task });
  });
}

