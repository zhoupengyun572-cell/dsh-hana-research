/**
 * HanaResearch 引用核验（schema v22）。
 *
 * 定位：**审计，不是改写**——对引用给出 verified / mismatch / not_found / manual_needed
 * 四态与逐字段冲突明细，绝不静默替换或修正引用内容。
 *
 * 方法（对标 opendraft 双源确认 / nature-academic-search 字段级账本）：
 * - DOI 归一化后向 Crossref 与 OpenAlex 各查一次，双源确认 DOI 真实存在；
 * - 字段比对（题名相似度 / 年份 / 期刊），冲突逐条列出；
 * - 双源一致 → verified；字段冲突 → mismatch；双源都不存在 → not_found（疑似幻觉）；
 *   仅单源确认或网络不可达 → manual_needed（附来源到达情况）。
 * - 在线核验失败永不抛断调用方（汇总笔记保存/AI 草稿生成不受影响），失败本身进 manual_needed。
 */

import { fetchJson } from './literature-search.js';

const VERIFY_TIMEOUT_MS = 20_000;

export class CitationVerifyError extends Error {
  constructor(code, message, status = 400, details = {}) {
    super(message);
    this.name = 'CitationVerifyError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/** DOI 归一化：去 URL/doi: 前缀、小写。返回 null 表示无有效 DOI。 */
export function normalizeDoi(doi) {
  let value = String(doi || '').trim().toLowerCase();
  value = value.replace(/^https?:\/\/(dx\.)?doi\.org\//, '').replace(/^doi:\s*/, '').replace(/[),.;]+$/, '');
  return /^10\.\d{4,9}\//.test(value) ? value : null;
}

function normalizeTitle(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/([\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff])/gu, '$1 ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 题名相似度：归一化后按字符 bigram 集合的 Dice 系数（对中英文都稳健）。 */
export function titleSimilarity(a, b) {
  const left = normalizeTitle(a);
  const right = normalizeTitle(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  const bigrams = text => {
    const set = new Set();
    for (let i = 0; i < text.length - 1; i += 1) set.add(text.slice(i, i + 2));
    return set;
  };
  const leftSet = bigrams(left);
  const rightSet = bigrams(right);
  if (!leftSet.size || !rightSet.size) return 0;
  let overlap = 0;
  for (const gram of leftSet) if (rightSet.has(gram)) overlap += 1;
  return (2 * overlap) / (leftSet.size + rightSet.size);
}

const CJK_IN_TEXT = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
const isCjkText = text => CJK_IN_TEXT.test(String(text || ''));

/** 字段比对：题名（相似度阈值 0.82）、年份、期刊。跨语言题名/期刊不硬判（中文刊常只收录英文题名），由上层转人工。 */
export function compareCitationFields(local, remote) {
  const conflicts = [];
  const localTitle = String(local?.title || '').trim();
  const remoteTitle = String(remote?.title || '').trim();
  const sameLanguage = isCjkText(localTitle) === isCjkText(remoteTitle);
  if (sameLanguage && localTitle && remoteTitle && titleSimilarity(localTitle, remoteTitle) < 0.82) {
    conflicts.push({ field: 'title', local: localTitle, remote: remoteTitle, note: '题名与在线记录明显不一致' });
  }
  const localYear = Number(local?.year) || null;
  const remoteYear = Number(remote?.year) || null;
  if (localYear && remoteYear && localYear !== remoteYear) {
    conflicts.push({ field: 'year', local: localYear, remote: remoteYear, note: '年份不一致' });
  }
  const localVenue = String(local?.venue || '').trim();
  const remoteVenue = String(remote?.venue || '').trim();
  if (sameLanguage && localVenue && remoteVenue && normalizeTitle(localVenue) !== normalizeTitle(remoteVenue) && titleSimilarity(localVenue, remoteVenue) < 0.6) {
    conflicts.push({ field: 'venue', local: localVenue, remote: remoteVenue, note: '期刊/来源不一致' });
  }
  return conflicts;
}

/** 查询单一来源；miss（404/无结果）返回 null，网络错误抛出由调用方归类。 */
async function fetchSource(fetchWork, name, url) {
  try {
    const body = await fetchWork(url, name, { timeoutMs: VERIFY_TIMEOUT_MS });
    return { found: true, body };
  } catch (error) {
    // fetchJson 的 HTTP 404 形态：LiteratureSearchError(status=502, details.status=404)
    if (error?.status === 404 || error?.details?.status === 404) {
      return { found: false, body: null };
    }
    throw error;
  }
}

function crossrefFields(body) {
  const message = body?.message || {};
  return {
    title: Array.isArray(message.title) ? String(message.title[0] || '') : String(message.title || ''),
    year: Number(String(message.issued?.['date-parts']?.[0]?.[0] || '')) || null,
    venue: String(message['container-title']?.[0] || message['container-title'] || ''),
  };
}

function openalexFields(body) {
  return {
    title: String(body?.title || body?.display_name || ''),
    year: Number(body?.publication_year) || null,
    venue: String(body?.primary_location?.source?.display_name || ''),
  };
}

/**
 * 核验单篇本地文献的 DOI 引用。
 * @param {object} paper 本地论文（title/year/venue/doi）
 * @param {{ fetchWork?: Function }} [opts] fetchWork 可注入（测试桩），签名同 literature-search 的 fetchJson
 * @returns {Promise<{status:'verified'|'mismatch'|'not_found'|'manual_needed', conflicts:object[], sources:object[], reason?:string}>}
 */
export async function verifyPaperCitation(paper, { fetchWork = fetchJson } = {}) {
  const doi = normalizeDoi(paper?.doi);
  if (!doi) {
    return { status: 'manual_needed', conflicts: [], sources: [], reason: 'no_doi', note: '该文献没有 DOI，无法自动核验，请人工核对原文。' };
  }
  let crossref;
  let openalex;
  try {
    crossref = await fetchSource(fetchWork, 'Crossref', `https://api.crossref.org/works/${encodeURIComponent(doi)}`);
    openalex = await fetchSource(fetchWork, 'OpenAlex', `https://api.openalex.org/works/doi:${encodeURIComponent(doi)}`);
  } catch (error) {
    return { status: 'manual_needed', conflicts: [], sources: [], reason: 'network', note: `在线核验暂不可用（${String(error?.message || error).slice(0, 120)}），请稍后重试或人工核对。` };
  }
  const sources = [
    { name: 'Crossref', doiFound: crossref.found, fields: crossref.found ? crossrefFields(crossref.body) : null },
    { name: 'OpenAlex', doiFound: openalex.found, fields: openalex.found ? openalexFields(openalex.body) : null },
  ];
  if (!crossref.found && !openalex.found) {
    return { status: 'not_found', conflicts: [], sources, reason: 'doi_unknown', note: '两个学术数据库都查不到这个 DOI，疑似 AI 幻觉或录入错误。' };
  }
  if (crossref.found !== openalex.found) {
    return { status: 'manual_needed', conflicts: [], sources, reason: 'single_source', note: `仅 ${crossref.found ? 'Crossref' : 'OpenAlex'} 确认了该 DOI，另一源未收录，请人工确认。` };
  }
  const local = { title: paper?.title, year: paper?.year, venue: paper?.venue };
  const remote = crossref.found ? crossrefFields(crossref.body) : openalexFields(openalex.body);
  const conflicts = compareCitationFields(local, remote);
  // 中文文献的在线记录常只收录英文题名：语系不同时无法自动判定是否同一文献，转人工
  const localTitle = String(local.title || '').trim();
  const remoteTitle = String(remote.title || '').trim();
  if (!conflicts.length && localTitle && remoteTitle && isCjkText(localTitle) !== isCjkText(remoteTitle)) {
    return { status: 'manual_needed', conflicts: [], sources, reason: 'language_mismatch', note: `DOI 双源确认存在；本地题名与在线记录语言不同（本地「${localTitle.slice(0, 40)}」/ 在线「${remoteTitle.slice(0, 60)}」），请人工确认是否同一文献。` };
  }
  return { status: conflicts.length ? 'mismatch' : 'verified', conflicts, sources };
}

/** 从 AI 草稿 Markdown 中提取 DOI 引用。 */
export function extractDoiCitations(text) {
  const found = new Set();
  const pattern = /10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+/g;
  for (const match of String(text || '').matchAll(pattern)) {
    const doi = normalizeDoi(match[0]);
    if (doi) found.add(doi);
  }
  return [...found];
}

/** 从 AI 草稿 Markdown 中提取书名号题名引用（中文习惯写法）。 */
export function extractTitleCitations(text) {
  const found = new Set();
  for (const match of String(text || '').matchAll(/《([^《》]{4,180})》/g)) {
    found.add(match[1].trim());
  }
  return [...found];
}

/**
 * 核验 AI 综述草稿中的引用（无状态，不落库）：
 * - DOI：双源在线确认（与本地库无关，专门抓幻觉 DOI）；
 * - 《题名》：先匹配本地项目文献库（AI 声称读过的文献是否真实在库）；
 * @returns {Promise<{citations:object[], counts:{verified,mismatch,not_found,manual_needed,unknown}}>}
 */
export async function verifySummaryCitations({ text, papers = [], fetchWork = fetchJson } = {}) {
  const byDoi = new Map();
  const byTitle = new Map();
  for (const paper of papers) {
    const doi = normalizeDoi(paper?.doi);
    if (doi) byDoi.set(doi, paper);
    const title = String(paper?.title || '').trim();
    if (title) byTitle.set(title, paper);
  }
  const citations = [];
  const counts = { verified: 0, mismatch: 0, not_found: 0, manual_needed: 0 };
  for (const doi of extractDoiCitations(text)) {
    const local = byDoi.get(doi) || null;
    const report = await verifyPaperCitation(local ? { ...local, doi } : { title: '', doi }, { fetchWork });
    citations.push({ kind: 'doi', raw: doi, matchedPaperId: local?.id || null, ...report });
    counts[report.status] += 1;
  }
  for (const title of extractTitleCitations(text)) {
    const local = byTitle.get(title)
      || papers.find(paper => titleSimilarity(paper?.title, title) >= 0.9)
      || null;
    if (!local) {
      citations.push({ kind: 'title', raw: title, matchedPaperId: null, status: 'manual_needed', conflicts: [], sources: [], note: '草稿引用的题名不在项目文献库中：可能是库外真实文献，也可能是编造，请人工确认。' });
      counts.manual_needed += 1;
      continue;
    }
    const report = await verifyPaperCitation(local, { fetchWork });
    citations.push({ kind: 'title', raw: title, matchedPaperId: local.id, ...report });
    counts[report.status] += 1;
  }
  return { citations, counts };
}
