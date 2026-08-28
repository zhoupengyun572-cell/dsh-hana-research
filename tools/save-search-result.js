import { getStore, textResult, runTool, agentInfo } from './_shared.js';

export const name = 'save_search_result';

export const description =
  '把一条检索结果（统一文献记录）保存进本地文献库：有 DOI 时按 DOI 去重复用已有文献（保留收藏状态），无 DOI 时用 source-sourceId 生成稳定 id。保存后返回的 paper.id 可交给 add_paper_to_project 导入项目。属于状态变更操作，需要用户确认。';

export const promptGuidelines = [
  '仅在用户要求保留某条检索结果时调用，不要自动保存用户未要求的记录。',
  'record 必须包含 title；优先携带 source、sourceId、doi 以便稳定去重。',
  '保存只写入文献元数据，不会下载 PDF；需要 PDF 时再调用 add_paper_to_project（受下载白名单限制，非白名单来源会返回错误）。',
  '保存后返回的 paper.id 是后续 add_paper_to_project / 收藏等操作使用的本地文献 ID。',
].join('\n');

export const sessionPermission = {
  kind: 'review',
  describeSideEffect: (input = {}) => ({
    kind: 'workspace_write',
    summary: `把检索结果「${String(input?.record?.title || '未知文献').slice(0, 60)}」保存到本地文献库（DOI 去重，保留收藏状态）。`,
    ruleId: 'hana-research-save-search-result',
  }),
};

export const parameters = {
  type: 'object',
  properties: {
    record: {
      type: 'object',
      description: '统一文献记录，字段与 search_literature 返回的结果一致',
      properties: {
        source: { type: 'string', description: '来源标识，如 openalex / crossref' },
        sourceId: { type: 'string', description: '来源内稳定 ID（如 OpenAlex W 号、DOI）' },
        doi: { type: 'string', description: '可选 DOI，用于去重' },
        title: { type: 'string', description: '文献标题，必填' },
        authors: { type: 'string', description: '作者列表（逗号分隔）' },
        venue: { type: 'string', description: '期刊/会议名称' },
        year: { type: 'number', description: '发表年份' },
        abstract: { type: 'string', description: '摘要' },
        pdfUrl: { type: 'string', description: '可选开放 PDF 地址（仅白名单来源可导入）' },
        sourceUrl: { type: 'string', description: '来源页面地址' },
        sourceName: { type: 'string', description: '来源显示名，如 OpenAlex' },
      },
      required: ['title'],
    },
  },
  required: ['record'],
};

export function execute(input, ctx) {
  const record = input?.record && typeof input.record === 'object' && !Array.isArray(input.record)
    ? input.record
    : null;
  if (!record || !String(record.title || '').trim()) {
    return textResult('错误（SEARCH_RECORD_INVALID）：record 必须是包含 title 的对象。', { error: 'SEARCH_RECORD_INVALID' });
  }
  return runTool('保存检索结果', () => {
    const store = getStore(ctx);
    const paper = store.upsertSearchResult(record);
    store.auditAgentToolCall(name, {
      paperId: paper.id,
      source: String(record.source || '').trim() || null,
      doi: paper.doi,
    }, agentInfo(ctx));
    return textResult(
      `已保存文献《${paper.title}》到本地文献库（ID：${paper.id}）${paper.doi ? `，DOI ${paper.doi}` : ''}。\n` +
        '如需导入项目，请调用 add_paper_to_project 并传入此 paperId。',
      {
        paper: {
          id: paper.id,
          title: paper.title,
          doi: paper.doi,
          sourceName: paper.sourceName,
          attachmentId: paper.attachmentId,
        },
      },
    );
  });
}
