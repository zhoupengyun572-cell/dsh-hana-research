import { getStore, textResult, runTool } from './_shared.js';

export const name = 'list_project_tasks';
export const description = '列出研究项目中的待办与已完成研究任务。任务复用可追溯项目笔记存储，并保留关联文献与更新时间。只读操作。';
export const promptGuidelines = '当用户问“下一步做什么”“还有哪些任务”“继续项目”时，可在项目简报之后调用本工具。';
export const sessionPermission = { readOnly: true };
export const parameters = {
  type: 'object',
  properties: {
    projectId: { type: 'string', description: '项目 ID' },
    status: { type: 'string', enum: ['all', 'todo', 'done'], description: '状态筛选，默认 all' },
  },
  required: ['projectId'],
};

function toTask(note) {
  const done = (note.tags || []).includes('状态:完成');
  const priority = (note.tags || []).find(tag => tag.startsWith('优先级:'))?.slice(4) || '';
  const dueDate = (note.tags || []).find(tag => tag.startsWith('截止:'))?.slice(3) || '';
  return { id: note.id, title: note.content.split('\n')[0], content: note.content, done, priority, dueDate, paperId: note.paperId, paperTitle: note.paperTitle, updatedAt: note.updatedAt };
}

export function execute(input, ctx) {
  return runTool('列出研究任务', () => {
    const store = getStore(ctx);
    const projectId = String(input?.projectId || '').trim();
    const project = store.getProject(projectId);
    if (!project) return textResult(`错误（PROJECT_NOT_FOUND）：项目 ${projectId} 不存在。`, { error: 'PROJECT_NOT_FOUND' });
    const status = ['todo', 'done'].includes(input?.status) ? input.status : 'all';
    let tasks = store.listNotes(projectId).filter(note => (note.tags || []).includes('研究任务')).map(toTask);
    if (status === 'todo') tasks = tasks.filter(task => !task.done);
    if (status === 'done') tasks = tasks.filter(task => task.done);
    tasks.sort((a, b) => Number(a.done) - Number(b.done) || String(b.updatedAt).localeCompare(String(a.updatedAt)));
    if (!tasks.length) return textResult(`项目「${project.title}」没有匹配的研究任务。`, { project: { id: project.id, title: project.title }, tasks: [] });
    const lines = tasks.map(task => `- [${task.done ? 'x' : ' '}] ${task.title}${task.priority ? `（${task.priority}）` : ''}${task.dueDate ? `，截止 ${task.dueDate}` : ''}${task.paperTitle ? ` · ${task.paperTitle}` : ''}［taskId: ${task.id}］`);
    return textResult(`项目「${project.title}」研究任务：\n${lines.join('\n')}`, { project: { id: project.id, title: project.title }, tasks });
  });
}

