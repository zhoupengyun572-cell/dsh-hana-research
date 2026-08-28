import { getStore, textResult, runTool } from './_shared.js';

export const name = 'list_research_projects';

export const description =
  '列出本地研究项目库中的全部研究项目及其文献、PDF、笔记数量。只读操作，不修改任何数据。';

export const sessionPermission = { readOnly: true };

export const parameters = {
  type: 'object',
  properties: {},
};

export function execute(_params, ctx) {
  return runTool('列出研究项目', () => {
    const store = getStore(ctx);
    const projects = store.listProjects().map((project) => ({
      id: project.id,
      title: project.title,
      description: project.description,
      color: project.color,
      paperCount: project.paperCount,
      pdfCount: project.pdfCount,
      noteCount: project.noteCount,
      updatedAt: project.updatedAt,
    }));

    if (!projects.length) {
      return textResult('研究项目库目前为空。', { projects: [] });
    }

    const lines = projects.map(
      (project) =>
        `- ${project.title}（${project.id}）：${project.paperCount} 篇文献 / ${project.pdfCount} 个 PDF / ${project.noteCount} 条笔记`,
    );

    // 对话内嵌卡片：项目概览（卡片自行拉取最新数据，点击项目可跳转项目库）。
    const card = {
      pluginId: 'hana-research',
      type: 'iframe',
      route: '/cards/project-overview',
      title: '研究项目库',
      description: `共 ${projects.length} 个项目，可在卡片或项目库中查看文献、PDF 与笔记。`,
      aspectRatio: '3:4',
    };

    return textResult(`共 ${projects.length} 个项目：\n${lines.join('\n')}`, { projects, card });
  });
}
