// P2 增强（L11/L12）：OpenAlex 引文网络与相似文献。
// - 相似文献：GET /works/{id}/related_works
// - 引文网络：GET /works/{id} 的 referenced_works（参考文献）+ cited_by_api_url（被引文献）
// 复用 literature-search 的 fetchJson / mapOpenAlexWorks（同款限流、重试、缓存）。
import { fetchJson, mapOpenAlexWorks, OPENALEX_MAILTO, LiteratureSearchError } from './literature-search.js';

const NETWORK_TIMEOUT_MS = 25_000;
const NETWORK_CACHE_TTL_MS = 30 * 60 * 1000; // 30 分钟（引文/相似文献内容相对稳定）
const RATE_LIMIT_RETRY_MS = 20_000; // 429 限流长退避后重试一次

/** 429 限流时等待后重试一次的包装（fetchJson 内部已有短退避；fetchFn 可注入）。 */
async function fetchWithBackoff(fetchFn, url, source, options) {
  try {
    return await fetchFn(url, source, options);
  } catch (error) {
    if (error?.code === 'SEARCH_SOURCE_RATE_LIMITED') {
      await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_RETRY_MS));
      return fetchFn(url, source, options);
    }
    throw error;
  }
}

/**
 * 从本地论文记录解析 OpenAlex work id（W 号）：
 * - 落库的 paper.openalexId 优先（schema v10 后 upsert 时保存）；
 * - 其次 source=openalex 且 sourceId 形如 W\d+；
 * - 否则按 DOI 查询一次（works?filter=doi:…）。
 * @param {object} paper 本地论文（含 openalexId/source/sourceId/doi）
 * @param {Function} [fetchWork] 可注入的请求函数（测试用），默认 fetchJson
 * @returns {Promise<string|null>} work id 或 null
 */
export async function resolveOpenAlexWorkId(paper, fetchWork = fetchJson) {
  const stored = String(paper?.openalexId || '').trim();
  if (/^W\d+$/i.test(stored)) return stored;
  const sourceId = String(paper?.sourceId || '').trim();
  if (String(paper?.source || '').toLowerCase() === 'openalex' && /^W\d+$/i.test(sourceId)) {
    return sourceId;
  }
  const doi = String(paper?.doi || '').trim().toLowerCase();
  if (!doi) return null;
  const url = new URL('https://api.openalex.org/works');
  url.searchParams.set('filter', `doi:${doi}`);
  url.searchParams.set('per-page', '1');
  url.searchParams.set('mailto', OPENALEX_MAILTO);
  const body = await fetchWork(url.href, 'OpenAlex', { timeoutMs: NETWORK_TIMEOUT_MS, cacheTtlMs: NETWORK_CACHE_TTL_MS });
  const id = body?.results?.[0]?.id || null;
  return id ? String(id).split('/').pop() : null;
}

function openAlexUrl(path, params) {
  const url = new URL(`https://api.openalex.org${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set('mailto', OPENALEX_MAILTO);
  return url.href;
}

/**
 * 相似文献推荐（L11）：OpenAlex 已停用 related_works 端点（恒返回空），
 * 改走设计文档的备选路线「本地关键词匹配」——取标题/主题词做 works?search= 检索，
 * 排除自身与标题近似的记录。fetchWork 可注入（测试用）。
 */
export async function fetchRelatedWorks(paper, max = 10, fetchWork = fetchJson) {
  const keywords = relatedKeywords(paper);
  if (!keywords) {
    throw new LiteratureSearchError('OPENALEX_ID_MISSING', '该文献没有可用的标题关键词，无法推荐相似文献', 404);
  }
  const body = await fetchWithBackoff(
    fetchWork,
    openAlexUrl('/works', { search: keywords, 'per-page': String(max + 3) }),
    'OpenAlex',
    { timeoutMs: NETWORK_TIMEOUT_MS, cacheTtlMs: NETWORK_CACHE_TTL_MS },
  );
  const selfDoi = String(paper?.doi || '').trim().toLowerCase();
  const selfTitle = String(paper?.title || '').trim().toLowerCase();
  const works = mapOpenAlexWorks(body)
    .filter(record => {
      if (selfDoi && String(record.doi || '').toLowerCase() === selfDoi) return false;
      if (selfTitle && String(record.title || '').toLowerCase() === selfTitle) return false;
      return true;
    })
    .slice(0, max);
  return { works };
}

/** 从论文标题/主题提取检索关键词（去停用词，最多 6 个词）。 */
export function relatedKeywords(paper) {
  const STOP = new Set([
    'the', 'a', 'an', 'of', 'in', 'on', 'for', 'and', 'or', 'to', 'with', 'by', 'from', 'at', 'as', 'is', 'are',
    'effect', 'effects', 'study', 'studies', 'role', 'influence', 'impact', 'toward', 'towards', 'among',
    '基于', '对', '的', '与', '及', '和', '在', '影响', '作用', '研究', '机制', '关系',
  ]);
  const raw = `${String(paper?.title || '')} ${String(paper?.topic || '')}`.toLowerCase();
  const words = raw
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(/\s+/)
    .map(word => word.trim())
    .filter(word => word.length >= 3 && !STOP.has(word));
  const unique = [...new Set(words)].slice(0, 6);
  return unique.length ? unique.join(' ') : null;
}

/** 按 OpenAlex id 列表批量拉取文献元数据（filter=ids.openalex:W1|W2）。失败返回空数组。 */
async function fetchWorksByIds(ids, max = 12, fetchWork = fetchJson) {
  if (!Array.isArray(ids) || !ids.length) return [];
  try {
    const body = await fetchWithBackoff(
      fetchWork,
      openAlexUrl('/works', { filter: `ids.openalex:${ids.slice(0, max).join('|')}`, 'per-page': String(max) }),
      'OpenAlex',
      { timeoutMs: NETWORK_TIMEOUT_MS, cacheTtlMs: NETWORK_CACHE_TTL_MS },
    );
    return mapOpenAlexWorks(body).slice(0, max);
  } catch {
    return []; // 参考文献批量拉取失败不阻断被引部分
  }
}

/**
 * 引文网络：{ workId, references: [], citedBy: [] }。
 * references 取论文直接引用的前 max 条；citedBy 取引用了该论文的前 max 条。
 * fetchWork 可注入（测试用）。
 */
export async function fetchCitationNetwork(paper, max = 12, fetchWork = fetchJson) {
  const workId = await resolveOpenAlexWorkId(paper, fetchWork);
  if (!workId) {
    throw new LiteratureSearchError('OPENALEX_ID_MISSING', '该文献没有 OpenAlex 标识，无法展开引文网络', 404);
  }
  const work = await fetchWithBackoff(
    fetchWork,
    openAlexUrl(`/works/${encodeURIComponent(workId)}`, {}),
    'OpenAlex',
    { timeoutMs: NETWORK_TIMEOUT_MS, cacheTtlMs: NETWORK_CACHE_TTL_MS },
  );
  const referenced = Array.isArray(work?.referenced_works)
    ? work.referenced_works.map((id) => String(id).split('/').pop()).filter(Boolean)
    : [];
  const references = await fetchWorksByIds(referenced, max, fetchWork);
  let citedBy = [];
  const citedByUrl = work?.cited_by_api_url;
  if (citedByUrl) {
    try {
      const body = await fetchWithBackoff(fetchWork, citedByUrl, 'OpenAlex', { timeoutMs: NETWORK_TIMEOUT_MS, cacheTtlMs: NETWORK_CACHE_TTL_MS });
      citedBy = mapOpenAlexWorks(body).slice(0, max);
    } catch {
      citedBy = []; // 被引拉取失败不阻断参考文献部分
    }
  }
  return { workId, references, citedBy };
}
