/**
 * HanaResearch 真实文献检索服务（DSH 移植版）。
 *
 * 接入 OpenAlex、Crossref、arXiv 与 PubMed 四个开放检索源，输出统一文献模型：
 * { source, sourceId, doi, title, authors, venue, year, abstract, pdfUrl, sourceUrl, sourceName, topic }
 *
 * 设计约束（与 OpenHanako 版等价，网络层从宿主 ctx.network 改为 DSH 宿主进程的全局 fetch）：
 * - 只经 HTTPS 出站，携带超时、响应体积上限与 5 分钟 GET 缓存（见 httpFetch）；
 * - 单源失败不影响其他源（失败降级），并把失败来源返回给调用方；
 * - 跨源结果按 DOI、再按规范化标题去重；
 * - 「能检索到」与「能合法下载 PDF」分开建模：pdfUrl 仅当目标主机在下载白名单内时保留，
 *   否则置空（UI 显示“仅元数据”，导入按钮不出现）。
 */

const SEARCH_TIMEOUT_MS = 12_000;
const DEFAULT_PER_SOURCE = 10;
const MAX_QUERY_LENGTH = 200;
const SOURCE_MIN_INTERVAL_MS = 250;
const CACHE_TTL_MS = 5 * 60 * 1000;
/** OpenAlex 礼貌池邮箱参数（其限流策略要求携带 mailto）。 */
export const OPENALEX_MAILTO = 'research@dsh.local';

export class LiteratureSearchError extends Error {
  constructor(code, message, status = 400, details = {}) {
    super(message);
    this.name = 'LiteratureSearchError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const lastCallAtBySource = new Map();

function throttleSource(source) {
  const now = Date.now();
  const last = lastCallAtBySource.get(source) || 0;
  const wait = Math.max(0, last + SOURCE_MIN_INTERVAL_MS - now);
  lastCallAtBySource.set(source, now + wait);
  return new Promise((resolve) => setTimeout(resolve, wait));
}

/** 规范化查询：去空白、限长。 */
export function normalizeSearchQuery(query) {
  const normalized = String(query || '').trim().replace(/\s+/g, ' ');
  if (!normalized) throw new LiteratureSearchError('SEARCH_QUERY_REQUIRED', '检索关键词不能为空', 400);
  if (normalized.length > MAX_QUERY_LENGTH) {
    throw new LiteratureSearchError('SEARCH_QUERY_TOO_LONG', `检索关键词不能超过 ${MAX_QUERY_LENGTH} 个字符`, 400);
  }
  return normalized;
}

/** 统一文献模型化。 */
function normalizeRecord(source, sourceId, raw) {
  const title = String(raw.title || '').trim().slice(0, 500);
  if (!title) return null;
  const doi = String(raw.doi || '').trim().toLowerCase() || null;
  const year = raw.year === null || raw.year === undefined || raw.year === ''
    ? null
    : (Number.isInteger(Number(raw.year)) ? Number(raw.year) : null);
  return {
    source,
    sourceId: String(sourceId || '').trim().slice(0, 160),
    doi,
    title,
    authors: String(raw.authors || '').trim().slice(0, 500),
    venue: String(raw.venue || '').trim().slice(0, 200),
    year,
    abstract: String(raw.abstract || '').trim().slice(0, 5000),
    pdfUrl: String(raw.pdfUrl || '').trim() || null,
    sourceUrl: String(raw.sourceUrl || '').trim() || null,
    sourceName: String(raw.sourceName || source).trim().slice(0, 120),
    topic: '',
    volume: raw.volume ? String(raw.volume).trim().slice(0, 40) : null,
    issue: raw.issue ? String(raw.issue).trim().slice(0, 40) : null,
    publicationDate: String(raw.publicationDate || '').trim().slice(0, 10) || null,
    citedByCount: Number.isInteger(Number(raw.citedByCount)) ? Number(raw.citedByCount) : null,
  };
}

function httpsOnly(value) {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function stripToBareDoi(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (url.hostname === 'doi.org') return decodeURIComponent(url.pathname.replace(/^\//, ''));
  } catch {
    /* 不是 URL 时按原样处理 */
  }
  return String(value || '').trim();
}

function reconstructAbstract(invertedIndex) {
  if (!invertedIndex || typeof invertedIndex !== 'object' || Array.isArray(invertedIndex)) return '';
  const positions = [];
  for (const [word, indexes] of Object.entries(invertedIndex)) {
    if (!Array.isArray(indexes)) continue;
    for (const index of indexes) {
      if (Number.isInteger(Number(index))) positions.push([Number(index), word]);
    }
  }
  positions.sort((a, b) => a[0] - b[0]);
  return positions.map(([, word]) => word).join(' ').slice(0, 5000);
}

function stripXml(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x?[0-9a-fA-F]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * OpenAlex 适配器：GET https://api.openalex.org/works?search=…&per-page=…
 */
async function searchOpenAlex(query, perPage) {
  const url = new URL('https://api.openalex.org/works');
  url.searchParams.set('search', query);
  url.searchParams.set('per-page', String(perPage));
  url.searchParams.set('mailto', OPENALEX_MAILTO);
  const body = await fetchJson(url.href, 'OpenAlex', { timeoutMs: SEARCH_TIMEOUT_MS, cacheTtlMs: CACHE_TTL_MS });
  return mapOpenAlexWorks(body);
}

/** 把 OpenAlex works 响应映射为统一文献记录（期刊同步与检索共用）。 */
export function mapOpenAlexWorks(body) {
  const items = Array.isArray(body?.results) ? body.results : [];
  const records = [];
  for (const item of items) {
    const doi = stripToBareDoi(item.doi) || null;
    const venue = item?.primary_location?.source?.display_name
      || item?.host_venue?.display_name
      || '';
    const pdfUrl = httpsOnly(item?.best_oa_location?.pdf_url || item?.open_access?.oa_url);
    const record = normalizeRecord('openalex', String(item?.id || '').split('/').pop(), {
      doi,
      title: item?.display_name,
      authors: (item?.authorships || [])
        .map((authorship) => authorship?.author?.display_name)
        .filter(Boolean)
        .slice(0, 8)
        .join(', '),
      venue,
      year: item?.publication_year,
      abstract: reconstructAbstract(item?.abstract_inverted_index),
      pdfUrl,
      // 优先保留期刊官网文章页（供官网直连下载规则使用），回退 DOI 链接
      sourceUrl: item?.primary_location?.landing_page_url
        || item?.landing_page_url
        || (item?.doi ? `https://doi.org/${doi}` : (item?.id || null)),
      sourceName: 'OpenAlex',
      volume: item?.biblio?.volume || null,
      issue: item?.biblio?.issue || null,
      publicationDate: item?.publication_date || null,
      citedByCount: item?.cited_by_count,
    });
    if (record) records.push(record);
  }
  return records;
}

/**
 * Crossref 适配器：GET https://api.crossref.org/works?query=…&rows=…&select=…
 */
async function searchCrossref(query, perPage) {
  const url = new URL('https://api.crossref.org/works');
  url.searchParams.set('query', query);
  url.searchParams.set('rows', String(perPage));
  url.searchParams.set(
    'select',
    'DOI,title,author,container-title,issued,abstract,URL,link,license',
  );
  const body = await fetchJson(url.href, 'Crossref', { timeoutMs: SEARCH_TIMEOUT_MS, cacheTtlMs: CACHE_TTL_MS });
  return mapCrossrefWorks(body);
}

/** 把 Crossref works 响应映射为统一文献记录（搜索与期刊同步共用）。 */
export function mapCrossrefWorks(body) {
  const items = Array.isArray(body?.message?.items) ? body.message.items : [];
  const records = [];
  for (const item of items) {
    const title = Array.isArray(item?.title) ? item.title[0] : item?.title;
    const venue = Array.isArray(item?.['container-title']) ? item['container-title'][0] : null;
    const year = item?.issued?.['date-parts']?.[0]?.[0] || null;
    const pdfLink = (Array.isArray(item?.link) ? item.link : [])
      .find((link) => String(link?.['content-type'] || link?.content_type || '').includes('pdf'));
    const record = normalizeRecord('crossref', String(item?.DOI || ''), {
      doi: item?.DOI,
      title,
      authors: (item?.author || [])
        .map((author) => [author?.given, author?.family].filter(Boolean).join(' '))
        .filter(Boolean)
        .slice(0, 8)
        .join(', '),
      venue,
      year,
      abstract: stripXml(item?.abstract),
      pdfUrl: httpsOnly(pdfLink?.URL),
      sourceUrl: item?.URL || (item?.DOI ? `https://doi.org/${item.DOI}` : null),
      sourceName: 'Crossref',
      volume: item?.volume || null,
      issue: item?.issue || null,
      publicationDate: (() => {
        const parts = (item?.published || item?.['published-print'] || item?.['published-online'])?.['date-parts']?.[0];
        if (!Array.isArray(parts) || !parts.length) return null;
        const [y, m = 1, d = 1] = parts;
        return [y, m, d].map(value => String(value).padStart(2, '0')).join('-');
      })(),
    });
    if (record) records.push(record);
  }
  return records;
}

function xmlUnescape(value) {
  return String(value || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * arXiv 适配器：GET https://export.arxiv.org/api/query?search_query=all:…&max_results=…
 * 返回 Atom XML，按 <entry> 切片解析。
 */
async function searchArxiv(query, perPage) {
  const url = new URL('https://export.arxiv.org/api/query');
  url.searchParams.set('search_query', `all:${query}`);
  url.searchParams.set('start', '0');
  url.searchParams.set('max_results', String(perPage));
  url.searchParams.set('sortBy', 'relevance');
  const body = await fetchRaw(url.href, 'arXiv', { timeoutMs: SEARCH_TIMEOUT_MS, cacheTtlMs: CACHE_TTL_MS });
  return mapArxivFeed(body);
}

/** 把 arXiv Atom XML 映射为统一文献记录。 */
export function mapArxivFeed(xml) {
  const text = String(xml || '');
  const entries = [];
  const entryPattern = /<entry[\s>][\s\S]*?<\/entry>/g;
  let match;
  while ((match = entryPattern.exec(text)) !== null) entries.push(match[0]);
  const records = [];
  for (const entry of entries) {
    const grab = (pattern) => {
      const found = entry.match(pattern);
      return found ? xmlUnescape(found[1].trim()) : '';
    };
    const id = grab(/<id>\s*([^<]+?)\s*<\/id>/);
    const arxivIdMatch = id.match(/arxiv\.org\/(?:abs|pdf)\/([^\/?#]+)/);
    const arxivId = arxivIdMatch ? arxivIdMatch[1] : null;
    if (!arxivId) continue;
    const absUrl = `https://arxiv.org/abs/${arxivId}`;
    const doi = grab(/<arxiv:doi[^>]*>\s*([^<]+?)\s*<\/arxiv:doi>/).replace(/^https?:\/\/doi\.org\//i, '') || null;
    const published = grab(/<published>\s*([^<]+?)\s*<\/published>/);
    const year = published ? Number(published.slice(0, 4)) || null : null;
    const record = normalizeRecord('arxiv', arxivId, {
      doi: doi || null,
      title: grab(/<title>\s*([^<]+?)\s*<\/title>/),
      authors: [...entry.matchAll(/<name>\s*([^<]+?)\s*<\/name>/g)]
        .map((found) => xmlUnescape(found[1].trim()))
        .filter(Boolean)
        .slice(0, 8)
        .join(', '),
      venue: 'arXiv',
      year,
      abstract: grab(/<summary>\s*([^<]+?)\s*<\/summary>/),
      pdfUrl: `https://arxiv.org/pdf/${arxivId}`,
      sourceUrl: absUrl,
      sourceName: 'arXiv',
      publicationDate: published ? published.slice(0, 10) : null,
    });
    if (record) records.push(record);
  }
  return records;
}

/** 把 PubMed pubdate（如 "2023 May" / "2023 May 15" / "2023"）规范为 YYYY-MM-DD。 */
function normalizePubMedDate(pubdate) {
  const trimmed = String(pubdate || '').trim();
  if (!trimmed) return null;
  const months = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  const match = trimmed.match(/^(\d{4})(?:\s+([A-Za-z]+)(?:\s+(\d{1,2}))?)?/);
  if (!match) return trimmed.slice(0, 10) || null;
  const year = match[1];
  const month = match[2] ? months[String(match[2]).toLowerCase().slice(0, 3)] : null;
  const day = match[3] ? Number(match[3]) : null;
  if (!month) return `${year}-01-01`;
  const mm = String(month).padStart(2, '0');
  const dd = day ? String(day).padStart(2, '0') : '01';
  return `${year}-${mm}-${dd}`;
}

/**
 * PubMed 适配器（NCBI E-utilities，两步）：
 * 1) esearch.fcgi 命中 PMID 列表；2) esummary.fcgi 取题录元数据。
 */
async function searchPubMed(query, perPage) {
  const esearchUrl = new URL('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi');
  esearchUrl.searchParams.set('db', 'pubmed');
  esearchUrl.searchParams.set('term', query);
  esearchUrl.searchParams.set('retmode', 'json');
  esearchUrl.searchParams.set('retmax', String(perPage));
  esearchUrl.searchParams.set('sort', 'relevance');
  const esearchBody = await fetchJson(esearchUrl.href, 'PubMed', { timeoutMs: SEARCH_TIMEOUT_MS, cacheTtlMs: CACHE_TTL_MS });
  const idList = Array.isArray(esearchBody?.esearchresult?.idlist) ? esearchBody.esearchresult.idlist : [];
  if (!idList.length) return [];
  const esummaryUrl = new URL('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi');
  esummaryUrl.searchParams.set('db', 'pubmed');
  esummaryUrl.searchParams.set('id', idList.join(','));
  esummaryUrl.searchParams.set('retmode', 'json');
  const esummaryBody = await fetchJson(esummaryUrl.href, 'PubMed', { timeoutMs: SEARCH_TIMEOUT_MS, cacheTtlMs: CACHE_TTL_MS });
  return mapPubMedJson(esummaryBody, idList);
}

/** 把 PubMed esummary 响应映射为统一文献记录。 */
export function mapPubMedJson(body, idList = null) {
  const result = body?.result;
  if (!result || typeof result !== 'object') return [];
  const uids = Array.isArray(idList) && idList.length
    ? idList
    : (Array.isArray(result?.uids) ? result.uids : []);
  const records = [];
  for (const uid of uids) {
    const item = result[uid];
    if (!item || typeof item !== 'object') continue;
    const doiMatch = String(item?.elocationid || '').match(/doi:\s*([^\s]+)/i);
    const doi = doiMatch ? doiMatch[1].replace(/\.$/, '') : null;
    const pubdate = String(item?.pubdate || '');
    const record = normalizeRecord('pubmed', uid, {
      doi,
      title: item?.title,
      authors: (Array.isArray(item?.authors) ? item.authors : [])
        .map((author) => author?.name)
        .filter(Boolean)
        .slice(0, 8)
        .join(', '),
      venue: item?.fulljournalname || item?.source || 'PubMed',
      year: Number(pubdate.slice(0, 4)) || null,
      abstract: '',
      pdfUrl: null,
      sourceUrl: `https://pubmed.ncbi.nlm.nih.gov/${uid}/`,
      sourceName: 'PubMed',
      publicationDate: normalizePubMedDate(pubdate),
    });
    if (record) records.push(record);
  }
  return records;
}

/**
 * 本地网络兼容层（DSH 移植）：替代 OpenHanako 的 ctx.network.fetch。
 * - 全局 fetch + AbortSignal 超时（node 24 环境）；
 * - 响应体积上限（maxResponseBytes）；
 * - 5 分钟 GET 内存缓存（cacheTtlMs）——与原版宿主级缓存语义一致；
 * - 返回 { status, ok, buffer } 以便 fetchRaw / fetchJson 复用。
 */
const responseCache = new Map();
// 单条缓存理论上限 4MB：无上限时长期运行的宿主进程会持续累积，这里封顶并惰性清理
const RESPONSE_CACHE_MAX_ENTRIES = 64;

function cacheGet(url) {
  const hit = responseCache.get(url);
  if (!hit) return null;
  if (hit.expires <= Date.now()) {
    responseCache.delete(url);
    return null;
  }
  return hit.payload;
}

function cacheSet(url, payload, cacheTtlMs) {
  if (responseCache.size >= RESPONSE_CACHE_MAX_ENTRIES) {
    const now = Date.now();
    for (const [key, entry] of responseCache) {
      if (entry.expires <= now) responseCache.delete(key);
    }
    while (responseCache.size >= RESPONSE_CACHE_MAX_ENTRIES) {
      responseCache.delete(responseCache.keys().next().value);
    }
  }
  responseCache.set(url, { payload, expires: Date.now() + cacheTtlMs });
}

async function httpFetch(url, { timeoutMs, maxResponseBytes, cacheTtlMs, headers }) {
  if (cacheTtlMs) {
    const cached = cacheGet(url);
    if (cached) return cached;
  }
  const res = await fetch(url, {
    method: 'GET',
    headers,
    signal: AbortSignal.timeout(timeoutMs),
    redirect: 'follow',
  });
  const buffer = Buffer.from(await res.arrayBuffer());
  if (maxResponseBytes && buffer.byteLength > maxResponseBytes) {
    throw new Error(`response exceeds ${maxResponseBytes} bytes`);
  }
  const payload = { status: res.status, ok: res.ok, buffer };
  if (cacheTtlMs && res.ok) cacheSet(url, payload, cacheTtlMs);
  return payload;
}

async function fetchRaw(url, source, { timeoutMs, cacheTtlMs }) {
  await throttleSource(source);
  const attempt = async (retryLeft) => {
    let response;
    try {
      response = await httpFetch(url, {
        timeoutMs,
        maxResponseBytes: 4 * 1024 * 1024,
        cacheTtlMs,
        headers: {
          Accept: 'application/atom+xml, application/xml, text/xml, */*',
          'User-Agent': 'HanaResearch/0.6 (+local research library)',
        },
      });
    } catch (error) {
      throw new LiteratureSearchError(
        'SEARCH_SOURCE_UNREACHABLE',
        `${source} 检索源不可达：${error?.message || '网络错误'}`,
        502,
        { source, code: error?.code || null },
      );
    }
    if (response.status === 429 && retryLeft > 0) {
      await new Promise(resolve => setTimeout(resolve, 1000 * (3 - retryLeft)));
      return attempt(retryLeft - 1);
    }
    if (!response.ok) {
      throw new LiteratureSearchError(
        'SEARCH_SOURCE_HTTP_ERROR',
        `${source} 检索失败（HTTP ${response.status}）`,
        502,
        { source, status: response.status },
      );
    }
    try {
      return response.buffer.toString('utf8');
    } catch (error) {
      throw new LiteratureSearchError('SEARCH_SOURCE_BAD_RESPONSE', `${source} 返回了无法读取的内容`, 502, { source });
    }
  };
  return attempt(2);
}

async function fetchJson(url, source, { timeoutMs, cacheTtlMs }) {
  await throttleSource(source);
  const attempt = async (retryLeft) => {
    let response;
    try {
      response = await httpFetch(url, {
        timeoutMs,
        maxResponseBytes: 2 * 1024 * 1024,
        cacheTtlMs,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'HanaResearch/0.6 (+local research library)',
        },
      });
    } catch (error) {
      throw new LiteratureSearchError(
        'SEARCH_SOURCE_UNREACHABLE',
        `${source} 检索源不可达：${error?.message || '网络错误'}`,
        502,
        { source, code: error?.code || null },
      );
    }
    if (response.status >= 300 && response.status < 400) {
      throw new LiteratureSearchError('SEARCH_SOURCE_REDIRECT', `${source} 检索源返回了意外重定向`, 502, { source });
    }
    // 429 限流：等待后重试（指数退避），最多 2 次
    if (response.status === 429) {
      if (retryLeft > 0) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (3 - retryLeft)));
        return attempt(retryLeft - 1);
      }
      // OpenAlex 免费额度（每日 $0.1 / 1000 credits）用尽时同样返回 429，UTC 午夜重置
      throw new LiteratureSearchError('SEARCH_SOURCE_RATE_LIMITED', `${source} 请求次数达到每日免费额度上限（约 UTC 午夜重置），请稍后再试`, 502, {
        source,
        status: 429,
      });
    }
    if (!response.ok) {
      throw new LiteratureSearchError(
        'SEARCH_SOURCE_HTTP_ERROR',
        `${source} 检索失败（HTTP ${response.status}）`,
        502,
        { source, status: response.status },
      );
    }
    try {
      return JSON.parse(response.buffer.toString('utf8'));
    } catch (error) {
      throw new LiteratureSearchError('SEARCH_SOURCE_BAD_JSON', `${source} 返回了无法解析的内容`, 502, { source });
    }
  };
  return attempt(2);
}

/** 导出供期刊同步等服务复用（与检索同款网络语义）。 */
export { fetchJson };

const SOURCE_ADAPTERS = {
  openalex: searchOpenAlex,
  crossref: searchCrossref,
  arxiv: searchArxiv,
  pubmed: searchPubMed,
};

function normalizeSources(sources) {
  const requested = Array.isArray(sources) && sources.length
    ? sources.map((source) => String(source).trim().toLowerCase())
    : Object.keys(SOURCE_ADAPTERS);
  return requested.filter((source) => SOURCE_ADAPTERS[source]);
}

/** 下载白名单主机匹配（与宿主 network.allowedHosts 语义一致：精确或 *. 子域）。 */
export function isHostAllowed(rawUrl, allowedHosts) {
  let host;
  try {
    host = new URL(String(rawUrl || '')).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (!Array.isArray(allowedHosts)) return false;
  return allowedHosts.some((pattern) => {
    const value = String(pattern || '').trim().toLowerCase();
    if (!value) return false;
    if (value.startsWith('*.')) {
      const suffix = value.slice(1);
      return host.endsWith(suffix) && host.length > suffix.length;
    }
    return host === value;
  });
}

function keyForDedupe(record) {
  if (record.doi) return `doi:${record.doi.toLowerCase()}`;
  const normalized = String(record.title || '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '');
  return normalized ? `title:${normalized}` : null;
}

/**
 * 执行跨源检索。任何单源失败都被收集到 failed 列表，不中断整体结果。
 *
 * @param {{ query: string, sources?: string[], perSource?: number, allowedPdfHosts?: string[] }} opts
 */
export async function searchLiterature({ query, sources, perSource, allowedPdfHosts = [] }) {
  const normalizedQuery = normalizeSearchQuery(query);
  const enabledSources = normalizeSources(sources);
  if (!enabledSources.length) {
    throw new LiteratureSearchError('SEARCH_NO_SOURCE', '没有可用的检索源', 400);
  }
  const perPage = Math.min(Math.max(Number(perSource) || DEFAULT_PER_SOURCE, 1), 25);

  const settled = await Promise.all(enabledSources.map(async (source) => {
    try {
      const records = await SOURCE_ADAPTERS[source](normalizedQuery, perPage);
      return { ok: true, source, records };
    } catch (error) {
      return {
        ok: false,
        source,
        error: {
          code: error?.code || 'SEARCH_SOURCE_FAILED',
          message: error?.message || '检索源失败',
        },
      };
    }
  }));

  const results = [];
  const seen = new Set();
  const failed = [];
  for (const outcome of settled) {
    if (!outcome.ok) {
      failed.push({ source: outcome.source, code: outcome.error.code, message: outcome.error.message });
      continue;
    }
    for (const record of outcome.records) {
      const key = keyForDedupe(record);
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      results.push({
        ...record,
        pdfUrl: record.pdfUrl && isHostAllowed(record.pdfUrl, allowedPdfHosts) ? record.pdfUrl : null,
      });
    }
  }

  return {
    query: normalizedQuery,
    sources: enabledSources,
    total: results.length,
    failed,
    results,
  };
}
