import { textResult, runTool, readAllowedPdfHosts } from './_shared.js';
import { searchLiterature } from '../lib/literature-search.js';

export const name = 'search_literature';

export const description =
  '在 OpenAlex、Crossref、arXiv 与 PubMed 开放学术数据库中检索文献（标题、作者、期刊、年份、摘要、DOI）。只读操作，不写入本地库；要保存或导入检索结果可通过对话卡片操作，也可请用户到文献中心界面操作。';

export const promptGuidelines = [
  '仅在用户要求检索真实学术文献时调用，不要用本地 seed 列表冒充真实检索。',
  '检索词应提炼为英文主题词或作者姓名以提高命中率；中文词也可以直接搜索。',
  '调用后对话流会自动渲染检索结果卡片，可在卡片内直接收藏、保存并导入项目。',
  '返回结果包含来源、DOI、开放获取状态（是否有可下载 PDF）；有 PDF 的文献还需在下载白名单内才能导入项目。',
  '本工具只读，不会把检索结果写入本地文献库。',
].join('\n');

export const sessionPermission = { readOnly: true };

export const parameters = {
  type: 'object',
  properties: {
    query: { type: 'string', description: '检索关键词（标题、作者、主题均可）' },
    sources: {
      type: 'array',
      items: { type: 'string', enum: ['openalex', 'crossref', 'arxiv', 'pubmed'] },
      description: '可选：检索源，默认四源并发（openalex、crossref、arxiv、pubmed）',
    },
    perSource: { type: 'number', description: '可选：每个来源返回条数，默认 8，最大 25' },
  },
  required: ['query'],
};

export async function execute(input, ctx) {
  return runTool('检索文献', async () => {
    const query = String(input?.query || '').trim();
    const result = await searchLiterature({
      query,
      sources: Array.isArray(input?.sources) ? input.sources.map(String) : undefined,
      perSource: input?.perSource,
      allowedPdfHosts: readAllowedPdfHosts(),
    });

    if (!result.total) {
      const failureNote = result.failed?.length
        ? `（检索源异常：${result.failed.map((item) => `${item.source} ${item.message}`).join('；')}）`
        : '';
      return textResult(`没有找到与「${result.query}」匹配的文献${failureNote}。`, {
        query: result.query,
        results: [],
        failed: result.failed,
      });
    }

    const lines = result.results.slice(0, 10).map((paper, index) => {
      const pdf = paper.pdfUrl ? ' [有可下载 PDF]' : ' [仅元数据]';
      const doi = paper.doi ? ` · DOI ${paper.doi}` : '';
      return `${index + 1}. ${paper.title}（${paper.year || '年份未知'}，${paper.venue || '期刊未知'}，来源 ${paper.sourceName}）${pdf}${doi}`;
    });
    const failureNote = result.failed?.length
      ? `\n注意：${result.failed.map((item) => `${item.source} 检索失败`).join('、')}。`
      : '';

    // 对话内嵌卡片：宿主渲染 iframe 卡片（≤400×600），卡片自行调 API 拉取
    // 最新数据，行内可收藏/保存/导入，无需跳转工作区。
    const card = {
      pluginId: 'hana-research',
      type: 'iframe',
      route: `/cards/search-results?q=${encodeURIComponent(query)}`,
      title: '全网学术检索结果',
      description: `检索「${query}」找到 ${result.total} 条文献（去重后），可在文献中心查看与导入。`,
      aspectRatio: '3:4',
    };

    return textResult(
      `找到 ${result.total} 条匹配文献（去重后）：\n${lines.join('\n')}${failureNote}`,
      {
        query: result.query,
        total: result.total,
        results: result.results.slice(0, 20).map((paper) => ({
          source: paper.source,
          sourceId: paper.sourceId,
          doi: paper.doi,
          title: paper.title,
          authors: paper.authors,
          venue: paper.venue,
          year: paper.year,
          hasPdfUrl: Boolean(paper.pdfUrl),
        })),
        failed: result.failed,
        card,
      },
    );
  });
}
