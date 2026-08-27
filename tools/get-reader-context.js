import { getStore, textResult, runTool } from './_shared.js';

export const name = 'get_reader_context';

export const description =
  '获取某项目中一个 PDF 附件的阅读上下文：来源文献信息（标题、作者、期刊、年份、DOI）与附件信息（文件名、大小、SHA-256）。只读操作。';

export const sessionPermission = { readOnly: true };

export const parameters = {
  type: 'object',
  properties: {
    projectId: { type: 'string', description: '项目 ID' },
    attachmentId: { type: 'string', description: 'PDF 附件 ID（可通过 search_project_papers 的 attachmentId 字段获得）' },
  },
  required: ['projectId', 'attachmentId'],
};

export function execute(input, ctx) {
  return runTool('获取阅读上下文', () => {
    const store = getStore(ctx);
    const projectId = String(input?.projectId || '').trim();
    const attachmentId = String(input?.attachmentId || '').trim();
    if (!projectId) return textResult('错误（PROJECT_ID_REQUIRED）：请提供项目 ID。', { error: 'PROJECT_ID_REQUIRED' });
    if (!attachmentId) return textResult('错误（ATTACHMENT_ID_REQUIRED）：请提供附件 ID。', { error: 'ATTACHMENT_ID_REQUIRED' });

    const context = store.getAttachmentContext(projectId, attachmentId);
    return textResult(
      `文献：${context.paper.title}（${context.paper.year || '年份未知'}，${context.paper.venue || '期刊未知'}）\n` +
        `作者：${context.paper.authors || '未记录'}${context.paper.doi ? `\nDOI：${context.paper.doi}` : ''}\n` +
        `附件：${context.attachment.fileName}（${formatBytes(context.attachment.byteSize)}，SHA-256 ${context.attachment.sha256.slice(0, 12)}…）`,
      {
        project: context.project,
        paper: context.paper,
        attachment: context.attachment,
      },
    );
  });
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
