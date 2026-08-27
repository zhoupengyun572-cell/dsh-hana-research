/**
 * 期刊官网直连下载规则。
 *
 * 部分期刊官网提供无需登录的 PDF 下载接口（实测：心理学报与心理科学进展
 * 的 downloadArticleFile.do 接口直接返回全文 PDF）。对这类期刊，从同步记录
 * 携带的文章页 URL（sourceUrl）可推导出 PDF 下载地址，实现「官网一键下载」。
 * 新期刊接入时在 OFFICIAL_DOWNLOAD_RULES 增加规则，并确保 host 在
 * manifest network.allowedHosts 内。
 */

export const OFFICIAL_DOWNLOAD_RULES = [
  {
    host: 'journal.psych.ac.cn',
    // 心理学报（xlxb）/ 心理科学进展（xlkxjz）：文章页 → PDF 下载接口
    articlePattern: /\/(xlxb|xlkxjz)\/CN\/lexeme\/showArticleByLexeme\.do\?articleID=(\d+)/i,
    buildPdfUrl: (match) => (
      `https://journal.psych.ac.cn/${match[1]}/CN/article/downloadArticleFile.do?attachType=PDF&id=${match[2]}`
    ),
  },
];

/** 从文献记录解析官网直连 PDF 地址；无匹配规则返回 null。 */
export function resolveOfficialDownloadUrl(paper) {
  const sourceUrl = String(paper?.sourceUrl || '');
  if (!sourceUrl) return null;
  for (const rule of OFFICIAL_DOWNLOAD_RULES) {
    const match = sourceUrl.match(rule.articlePattern);
    if (match && typeof rule.buildPdfUrl === 'function') {
      return rule.buildPdfUrl(match);
    }
  }
  return null;
}
