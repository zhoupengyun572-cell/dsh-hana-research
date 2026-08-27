import { getStore, textResult, runTool } from './_shared.js';

export const name = 'list_tags';

export const description =
  '列出本地笔记标签及其使用次数；可限定项目。只读操作，不修改任何数据。';

export const sessionPermission = { readOnly: true };

export const parameters = {
  type: 'object',
  properties: {
    projectId: { type: 'string', description: '可选：只统计该项目的标签；不传则统计全部项目' },
  },
};

export function execute(input, ctx) {
  return runTool('列出笔记标签', () => {
    const store = getStore(ctx);
    const projectId = input?.projectId ? String(input.projectId).trim() : null;
    const tags = store.listTags(projectId || null);

    if (!tags.length) {
      return textResult(projectId ? '该项目还没有带标签的笔记。' : '本地库中还没有带标签的笔记。', { tags: [] });
    }
    const scope = projectId ? `项目 ${projectId}` : '全部项目';
    const lines = tags.map((item) => `- ${item.tag}（${item.count} 次）`);
    return textResult(`${scope}共 ${tags.length} 个标签：\n${lines.join('\n')}`, { tags });
  });
}
