import { getStore, textResult, runTool, agentInfo, readAllowedPdfHosts } from './_shared.js';
import { downloadAndStorePdf } from '../lib/pdf-import.js';

export const name = 'add_paper_to_project';

export const description =
  '把一篇已收录的文献加入指定项目：自动解析其开放获取 PDF（文献自带地址，或按 DOI 经 Unpaywall 查找开放获取版本），校验后存入本地文献库；内容相同的 PDF 会被跨项目复用。属于状态变更操作，需要用户确认。';

export const promptGuidelines = [
  '仅在用户明确要求把某篇文献加入项目时调用。',
  '调用前先用 search_project_papers 或文献列表确认 projectId 与 paperId 存在。',
  '该操作会下载并保存 PDF 到本地研究库并写入审计日志，调用前应向用户说明目标项目与文献。',
  '若文献没有开放获取 PDF 版本（订阅制），工具会返回明确错误，此时不要重试，应向用户说明可先收藏元数据或通过机构订阅获取。',
].join('\n');

export const sessionPermission = {
  kind: 'review',
  describeSideEffect: (input = {}) => ({
    kind: 'workspace_write',
    summary: `将文献 ${input.paperId || '未知'} 导入项目 ${input.projectId || '未知'}，并下载其开放获取 PDF 存入本地研究库。`,
    ruleId: 'hana-research-add-paper-to-project',
  }),
};

export const parameters = {
  type: 'object',
  properties: {
    projectId: { type: 'string', description: '目标项目 ID' },
    paperId: { type: 'string', description: '要导入的文献 ID（可在文献中心或 search_project_papers 中查到）' },
  },
  required: ['projectId', 'paperId'],
};

export async function execute(input, ctx) {
  const store = getStore(ctx);
  const projectId = String(input?.projectId || '').trim();
  const paperId = String(input?.paperId || '').trim();

  if (!projectId) return textResult('错误（PROJECT_ID_REQUIRED）：请提供项目 ID。', { error: 'PROJECT_ID_REQUIRED' });
  if (!paperId) return textResult('错误（PAPER_ID_REQUIRED）：请提供文献 ID。', { error: 'PAPER_ID_REQUIRED' });

  const paper = store.getPaper(paperId);
  if (!paper) return textResult(`错误（PAPER_NOT_FOUND）：文献 ${paperId} 不存在。`, { error: 'PAPER_NOT_FOUND' });

  return runTool('导入文献', async () => {
    const result = await downloadAndStorePdf({
      store,
      projectId,
      paper,
      allowedHosts: readAllowedPdfHosts(),
    });
    store.auditAgentToolCall(name, { projectId, paperId }, agentInfo(ctx));
    const reusedText = result.reused ? '（本地已有相同内容，复用现有 PDF）' : '';
    return textResult(
      `已将《${result.paper.title}》加入项目「${result.project.title}」${reusedText}。\n` +
        `附件：${result.attachment.fileName}`,
      {
        project: { id: result.project.id, title: result.project.title },
        paper: { id: result.paper.id, title: result.paper.title, doi: result.paper.doi },
        attachment: {
          id: result.attachment.id,
          fileName: result.attachment.fileName,
          byteSize: result.attachment.byteSize,
          sha256: result.attachment.sha256,
        },
        reused: result.reused === true,
      },
    );
  });
}
