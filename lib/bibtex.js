// BibTeX / RIS 导出（P1 增强）：从统一文献模型生成引用条目。
// 纯函数，无依赖；供 API 与前端批量导出使用。

function escapeLatex(value) {
  return String(value ?? '')
    .replace(/([\\{}&%$#_^~])/g, '\\$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 生成稳定的 BibTeX key：作者姓氏(或前 2 个词) + 年份 + 首词。 */
export function bibtexKey(paper, index) {
  const year = Number(paper?.year) || '';
  const authorPart = String(paper?.authors || '')
    .split(/[;,]/)[0]
    .trim()
    .replace(/[^A-Za-z\u4e00-\u9fa5]+/g, '')
    .slice(0, 24);
  const titlePart = String(paper?.title || 'paper')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '')
    .slice(0, 16);
  const base = [authorPart || 'paper', year, titlePart || String(index + 1)].filter(Boolean).join('');
  return base || `paper${index + 1}`;
}

/** 单篇文献 → BibTeX 条目文本；key 可显式覆盖（批量导出时用于去重）。 */
export function paperToBibtex(paper, index = 0, key = bibtexKey(paper, index)) {
  const fields = [
    ['title', paper?.title],
    ['author', paper?.authors],
    ['journal', paper?.venue],
    ['year', paper?.year],
    ['doi', paper?.doi],
    ['url', paper?.sourceUrl],
  ].filter(([, value]) => value !== undefined && value !== null && String(value) !== '');
  const body = fields.map(([name, value]) => `  ${name} = {${escapeLatex(value)}},`).join('\n');
  return `@article{${key},\n${body}\n}\n`;
}

/** 多篇文献 → BibTeX 文本（重复 key 自动加数字后缀）。 */
export function papersToBibtex(papers) {
  const seen = new Set();
  return (Array.isArray(papers) ? papers : [])
    .map((paper, index) => {
      let key = bibtexKey(paper, index);
      let suffix = 2;
      while (seen.has(key)) key = `${bibtexKey(paper, index)}${suffix++}`;
      seen.add(key);
      return paperToBibtex(paper, index, key);
    })
    .join('\n');
}

function risType(paper) {
  const venue = String(paper?.venue || '').toLowerCase();
  if (venue.includes('arxiv')) return 'JOUR';
  return 'JOUR';
}

function escapeRis(value) {
  return String(value ?? '').replace(/\r?\n/g, ' ');
}

/** 单篇文献 → RIS 条目文本（Journal Article）。 */
export function paperToRis(paper) {
  const lines = [
    'TY  - JOUR',
    paper?.title ? `TI  - ${escapeRis(paper.title)}` : '',
    paper?.authors ? `AU  - ${escapeRis(paper.authors)}` : '',
    paper?.venue ? `JO  - ${escapeRis(paper.venue)}` : '',
    paper?.year ? `PY  - ${paper.year}` : '',
    paper?.doi ? `DO  - ${paper.doi}` : '',
    paper?.sourceUrl ? `UR  - ${paper.sourceUrl}` : '',
    paper?.abstract ? `AB  - ${escapeRis(paper.abstract)}` : '',
    'ER  -',
  ].filter(Boolean);
  return `${lines.join('\n')}\n`;
}

/** 多篇文献 → RIS 文本。 */
export function papersToRis(papers) {
  return (Array.isArray(papers) ? papers : []).map(paperToRis).join('\n');
}

/** 按格式名导出：'bibtex' | 'ris'。 */
export function exportCitations(papers, format) {
  const normalized = String(format || 'bibtex').toLowerCase();
  if (normalized === 'ris') return papersToRis(papers);
  return papersToBibtex(papers);
}

/** 导出文件建议名（含日期）。 */
export function exportFileName(format, prefix = 'papers') {
  const date = new Date().toISOString().slice(0, 10);
  const ext = String(format || 'bibtex').toLowerCase() === 'ris' ? 'ris' : 'bib';
  return `${prefix}-${date}.${ext}`;
}
