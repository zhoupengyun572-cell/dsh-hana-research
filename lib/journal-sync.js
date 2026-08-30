/**
 * 期刊官网数据同步（HanaResearch 阶段 F）。
 *
 * 期刊源通过 OpenAlex 的「按来源 ISSN 过滤」接口拉取该刊最新文献：
 *   https://api.openalex.org/works?filter=locations.source.issn:{issn},from_publication_date:{date}&sort=publication_date:desc
 * OpenAlex 收录国内外核心期刊的最新元数据（标题、作者、期刊、年份、摘要、DOI），
 * 是期刊官网的权威聚合数据源，接口开放且已在插件网络白名单内（api.openalex.org）。
 *
 * 同步策略：
 * - 每个期刊源独立拉取（失败降级：单源失败不影响其他源，原因写入源状态与日志）；
 * - DOI 去重：已存在的 DOI 跳过（本地文献库幂等）；无 DOI 记录按
 *   source-sourceId 稳定 id 幂等 upsert；
 * - 结果写入 papers 表（复用 upsertSearchResult），期刊名与主题按源定义覆盖，
 *   来源标记为「期刊同步」；
 * - 定时（默认 24h）或手动触发；每次同步写 journal_sync_log。
 */

import { fetchJson, mapOpenAlexWorks, mapCrossrefWorks, isHostAllowed, OPENALEX_MAILTO, LiteratureSearchError } from './literature-search.js';
import { CN_TITLE_JOURNALS, officialArticlePageUrl, fetchChineseTitle, sleep } from './chinese-title.js';

const SYNC_TIMEOUT_MS = 30_000;
const DEFAULT_DAYS_BACK = 30;
const DEFAULT_PER_PAGE = 100;
const MAX_PAGES = 5;
/** 源与源之间的最小间隔（OpenAlex 429 缓解：逐源串行 + 源间节流）。 */
const SOURCE_INTERVAL_MS = 1200;
/** 限流后重试 OpenAlex 前的等待（秒）。 */
const RATE_LIMIT_RETRY_MS = 15_000;
/** Crossref 回退路径的首次窗口（天）。 */
const INITIAL_WINDOW_DAYS = 365;
/** 每刊保留的最近期次数（含「在线优先」组）。 */
const LATEST_ISSUES_COUNT = 3;
/** 「在线优先」组（无卷期/连续出版期刊）保留的最大条数。 */
const ONLINE_FIRST_CAP = 80;

/** 内置期刊源：国外核心期刊 + 国内期刊（ISSN 为官方刊号）。region: intl 国外 / cn 国内。 */
export const JOURNAL_SOURCES = [
  { id: 'frontiers-psychology', venue: 'Frontiers in Psychology', issn: '1664-1078', topic: '情绪与健康', region: 'intl' },
  { id: 'jpsp', venue: 'Journal of Personality and Social Psychology', issn: '0022-3514', topic: '社会与人格', region: 'intl' },
  { id: 'psychological-review', venue: 'Psychological Review', issn: '0033-295X', topic: '认知与学习', region: 'intl' },
  { id: 'american-psychologist', venue: 'American Psychologist', issn: '0003-066X', topic: '社会与人格', region: 'intl' },
  { id: 'clinical-psychology-review', venue: 'Clinical Psychology Review', issn: '0272-7358', topic: '临床与咨询', region: 'intl' },
  { id: 'annual-review-psychology', venue: 'Annual Review of Psychology', issn: '0066-4308', topic: '认知与学习', region: 'intl' },
  { id: 'psychological-science', venue: 'Psychological Science', issn: '0956-7976', topic: '认知与学习', region: 'intl' },
  { id: 'cognition-and-emotion', venue: 'Cognition and Emotion', issn: '0269-9931', topic: '情绪与健康', region: 'intl' },
  { id: 'cognitive-therapy-research', venue: 'Cognitive Therapy and Research', issn: '0147-5916', topic: '临床与咨询', region: 'intl' },
  { id: 'psychological-bulletin', venue: 'Psychological Bulletin', issn: '0033-2909', topic: '社会与人格', region: 'intl' },
  { id: 'journal-of-personality', venue: 'Journal of Personality', issn: '0022-3506', topic: '社会与人格', region: 'intl' },
  { id: 'perspectives-psych-science', venue: 'Perspectives on Psychological Science', issn: '1745-6916', topic: '社会与人格', region: 'intl' },
  { id: 'review-general-psychology', venue: 'Review of General Psychology', issn: '1089-2680', topic: '社会与人格', region: 'intl' },
  { id: 'emotion', venue: 'Emotion', issn: '1528-3542', topic: '情绪与健康', region: 'intl' },
  { id: 'trends-cognitive-sciences', venue: 'Trends in Cognitive Sciences', issn: '1364-6613', topic: '认知与学习', region: 'intl' },
  { id: 'psychological-inquiry', venue: 'Psychological Inquiry', issn: '1047-840X', topic: '动机与决策', region: 'intl' },
  { id: 'developmental-psychology', venue: 'Developmental Psychology', issn: '0012-1649', topic: '发展与教育', region: 'intl' },
  { id: 'j-abnormal-psychology', venue: 'Journal of Abnormal Psychology', issn: '0021-843X', topic: '临床与咨询', region: 'intl' },
  { id: 'personality-ind-differences', venue: 'Personality and Individual Differences', issn: '0191-8869', topic: '社会与人格', region: 'intl' },
  { id: 'j-exp-psych-general', venue: 'Journal of Experimental Psychology: General', issn: '0096-3445', topic: '认知与学习', region: 'intl' },
  { id: 'acta-psychologica-sinica', venue: '心理学报', issn: '0439-755X', topic: '情绪与健康', region: 'cn' },
  { id: 'advances-psych-science', venue: '心理科学进展', issn: '1671-3710', topic: '认知与学习', region: 'cn' },
  { id: 'psychological-science-cn', venue: '心理科学', issn: '1671-6981', topic: '社会与人格', region: 'cn' },
  { id: 'psych-dev-education', venue: '心理发展与教育', issn: '1001-4918', topic: '发展与教育', region: 'cn' },
  { id: 'chin-j-clinical-psychology', venue: '中国临床心理学杂志', issn: '1005-3611', topic: '临床与咨询', region: 'cn' },
];

export function ensureJournalSources(store) {
  store.ensureJournalSources(JOURNAL_SOURCES);
}

export function normalizeIssnInput(value) {
  const compact = String(value || '').toUpperCase().replace(/[^0-9X]/g, '');
  if (!/^\d{7}[\dX]$/.test(compact)) return '';
  const sum = compact.slice(0, 7).split('').reduce((total, digit, index) => total + Number(digit) * (8 - index), 0);
  const remainder = (11 - (sum % 11)) % 11;
  const expected = remainder === 10 ? 'X' : String(remainder);
  if (compact[7] !== expected) return '';
  return compact.slice(0, 4) + '-' + compact.slice(4);
}

/** 根据 ISSN 从 OpenAlex 识别期刊，并返回少量最新文章供订阅前核对。 */
export async function resolveJournalSource(issn) {
  const cleanIssn = normalizeIssnInput(issn);
  if (!cleanIssn) {
    throw new LiteratureSearchError('JOURNAL_ISSN_INVALID', 'ISSN 格式或校验位不正确', 400);
  }
  const sourceUrl = new URL(`https://api.openalex.org/sources/issn:${encodeURIComponent(cleanIssn)}`);
  sourceUrl.searchParams.set('mailto', OPENALEX_MAILTO);
  let source;
  try {
    source = await fetchJson(sourceUrl.href, `ISSN ${cleanIssn}`, { timeoutMs: SYNC_TIMEOUT_MS, cacheTtlMs: 5 * 60_000 });
  } catch (error) {
    if (error?.details?.status === 404) {
      throw new LiteratureSearchError('JOURNAL_SOURCE_NOT_FOUND', 'OpenAlex 未找到该 ISSN 对应的期刊', 404, { issn: cleanIssn });
    }
    throw error;
  }
  if (source?.type && source.type !== 'journal') {
    throw new LiteratureSearchError('JOURNAL_SOURCE_NOT_JOURNAL', '该 ISSN 对应的来源不是学术期刊', 400, { issn: cleanIssn });
  }
  const previewUrl = new URL('https://api.openalex.org/works');
  previewUrl.searchParams.set('filter', `locations.source.issn:${cleanIssn}`);
  previewUrl.searchParams.set('per-page', '3');
  previewUrl.searchParams.set('sort', 'publication_date:desc');
  previewUrl.searchParams.set('mailto', OPENALEX_MAILTO);
  const previewBody = await fetchJson(previewUrl.href, `期刊 ${source?.display_name || cleanIssn} 预览`, {
    timeoutMs: SYNC_TIMEOUT_MS,
    cacheTtlMs: 5 * 60_000,
  });
  const preview = mapOpenAlexWorks(previewBody).slice(0, 3).map(record => ({
    title: record.title,
    year: record.year,
    doi: record.doi || null,
    publicationDate: record.publicationDate || null,
  }));
  return {
    venue: String(source?.display_name || '').trim(),
    issn: normalizeIssnInput(source?.issn_l) || cleanIssn,
    issns: [...new Set((source?.issn || [cleanIssn]).map(normalizeIssnInput).filter(Boolean))],
    openAlexId: String(source?.id || '').split('/').pop() || null,
    homepageUrl: source?.homepage_url || null,
    worksCount: Number(source?.works_count || 0),
    isOpenAccess: Boolean(source?.is_oa),
    region: source?.country_code === 'CN' ? 'cn' : 'intl',
    preview,
  };
}

function daysAgoIso(days) {
  const date = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

function volumeNumber(volume) {
  const match = String(volume || '').match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function issueNumber(issue) {
  const match = String(issue || '').match(/\d+/);
  return match ? Number(match[0]) : 0;
}

/**
 * 按「最近 N 期」裁剪文献列表：
 * - 有卷期（volume+issue 都非空）的记录按卷期分组；无卷期的归入「在线优先」组；
 * - 组间排序：组内最新发布日期 desc → 卷号 desc → 期号 desc（数字比较，
 *   解决 OpenAlex 对国内期刊使用年份占位日期导致的排序问题），保留最近 maxIssues 组；
 * - 「在线优先」组内部按发布日期取最近 onlineFirstCap 条（连续出版期刊防无限累积）。
 */
export function keepLatestIssues(records, maxIssues = LATEST_ISSUES_COUNT, onlineFirstCap = ONLINE_FIRST_CAP) {
  const groups = new Map();
  for (const record of records) {
    const key = record.volume && record.issue
      ? `v${record.volume}i${record.issue}`
      : 'online-first';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }
  const sorted = [...groups.entries()]
    .map(([key, items]) => ({
      key,
      items,
      latest: items.reduce((best, item) => {
        const date = item.publicationDate || '';
        return date > best ? date : best;
      }, ''),
      volume: volumeNumber(key.match(/^v(\S+?)i/)?.[1]),
      issue: issueNumber(key.match(/i(\S+)$/)?.[1]),
    }))
    .sort((a, b) => (
      (b.latest || '').localeCompare(a.latest || '')
      || b.volume - a.volume
      || b.issue - a.issue
    ));
  return sorted.slice(0, maxIssues).flatMap(group => (
    group.key === 'online-first'
      ? group.items
        .sort((x, y) => (y.publicationDate || '').localeCompare(x.publicationDate || ''))
        .slice(0, onlineFirstCap)
      : group.items
  ));
}

/**
 * 同步单个期刊源：拉取该刊最新文献（OpenAlex 按 publication_date 倒序取前 N 条，
 * 不再使用 from_publication_date 过滤——OpenAlex 对国内期刊的日期是年份占位，
 * 日期过滤会永久排除它们），裁剪为最近三期，再 upsert 进本地文献库；
 * 最后清理该刊超出近三期的旧同步文献（收藏/项目/附件除外）。
 * provider 为 'openalex'（默认）或 'crossref'；allowedPdfHosts 为下载白名单
 * （manifest network.allowedHosts），白名单外的开放 PDF 地址会被置空，
 * 避免出现「可下载」但实际被拒的卡片。
 * @returns {{ fetched: number, inserted: number, pruned: number }}
 */
export async function syncJournalSource({ store, source, daysBack = DEFAULT_DAYS_BACK, perPage = DEFAULT_PER_PAGE, allowedPdfHosts = [], provider = 'openalex', fromDate = null, libraryIndex = null }) {
  const records = provider === 'crossref'
    ? await fetchCrossrefJournalRecords(source, fromDate || daysAgoIso(daysBack), perPage)
    : await fetchOpenAlexJournalRecords(source, perPage);
  const normalized = keepLatestIssues(records).map(record => ({
    ...record,
    venue: String(source.venue || record.venue || '').trim(),
    topic: String(source.topic || '未分类').trim(),
    sourceName: '期刊同步',
    pdfUrl: record.pdfUrl && isHostAllowed(record.pdfUrl, allowedPdfHosts) ? record.pdfUrl : null,
  }));

  // 国内期刊官网中文标题补全：OpenAlex/Crossref 只提供英文翻译题录，
  // 对官网可访问的期刊（心理学报/心理科学进展）从官网文章页抓中文标题覆盖，
  // 并把 sourceUrl 一并改为官网文章页（用户可直达中文原文）。
  // 标题已含中文的记录跳过（幂等，存量在下次同步时自动补全）。
  // 批量并行（每批 5 个）避免 46+ 篇串行请求拖慢整个同步。
  if (CN_TITLE_JOURNALS.has(String(source.venue || '').trim())) {
    const pending = normalized.filter(record => !/[\u4e00-\u9fa5]/.test(String(record.title || '')));
    const BATCH_SIZE = 5;
    for (let i = 0; i < pending.length; i += BATCH_SIZE) {
      await Promise.all(pending.slice(i, i + BATCH_SIZE).map(async (record) => {
        const articleUrl = officialArticlePageUrl(record);
        if (!articleUrl) return;
        const zhTitle = await fetchChineseTitle(articleUrl);
        if (zhTitle) {
          record.title = zhTitle;
          record.sourceUrl = articleUrl; // 官网文章页优先于 doi.org
        }
      }));
      await sleep(250); // 官网节流（批间）
    }
  }

  const index = libraryIndex || buildLibraryIndex(store);
  const { paperByDoi, existingIds } = index;
  const keptIds = new Set();
  let inserted = 0;
  for (const record of normalized) {
    if (record.doi) {
      const existing = paperByDoi.get(record.doi);
      if (existing) {
        // 中文标题补全 / 被引次数更新后同步存量（仅当发生变化时写库）
        if (record.title !== existing.title || record.citedByCount !== existing.citedByCount) {
          store.upsertSearchResult(record);
        }
        keptIds.add(existing.id);
        continue;
      }
      const paper = store.upsertSearchResult(record);
      paperByDoi.set(record.doi, paper);
      keptIds.add(paper?.id || `doi-${record.doi.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`);
      inserted += 1;
    } else {
      const stableId = `${provider === 'crossref' ? 'crossref' : 'openalex'}-${String(record.sourceId || '').replace(/[^a-z0-9_-]+/gi, '-').toLowerCase()}`;
      if (existingIds.has(stableId)) {
        keptIds.add(stableId);
      } else {
        const paper = store.upsertSearchResult(record);
        existingIds.add(stableId);
        keptIds.add(paper?.id || stableId);
        inserted += 1;
      }
    }
  }
  const pruned = normalized.length
    ? store.pruneJournalSyncPapers(source.venue, keptIds)
    : 0;
  return { fetched: normalized.length, inserted, pruned };
}

/**
 * 每轮同步共用的库内索引：DOI→文献 映射 + 全部文献 ID 集合。
 * 原实现每个源各跑 listPaperDois + listPaperIds + listPapers 三次全表（25 源 = 75 次全表/轮），
 * 现在每轮只建一次，随插入原地更新（同步在轮内串行，无并发问题）。
 */
function buildLibraryIndex(store) {
  const papers = store.listPapers();
  const paperByDoi = new Map();
  for (const paper of papers) {
    if (paper.doi) paperByDoi.set(paper.doi, paper);
  }
  return { paperByDoi, existingIds: new Set(papers.map(paper => paper.id)) };
}

/** 同步一个期刊源并记录状态；OpenAlex 限流或不可达时重试后回退 Crossref。 */
export async function syncOneJournalSource({ store, source, daysBack = DEFAULT_DAYS_BACK, allowedPdfHosts = [], rateLimitRetryMs = RATE_LIMIT_RETRY_MS, libraryIndex = null }) {
  const index = libraryIndex || buildLibraryIndex(store);
  if (!source) throw new LiteratureSearchError('JOURNAL_SOURCE_NOT_FOUND', '期刊源不存在', 404);
  const startedAt = new Date().toISOString();
  try {
    let outcome;
    try {
      outcome = await syncJournalSource({ store, source, daysBack, allowedPdfHosts, provider: 'openalex', libraryIndex });
    } catch (error) {
      if (error?.code !== 'SEARCH_SOURCE_RATE_LIMITED' && error?.code !== 'SEARCH_SOURCE_UNREACHABLE') throw error;
      await new Promise(resolve => setTimeout(resolve, rateLimitRetryMs));
      try {
        outcome = await syncJournalSource({ store, source, daysBack, allowedPdfHosts, provider: 'openalex', libraryIndex });
      } catch (retryError) {
        if (retryError?.code !== 'SEARCH_SOURCE_RATE_LIMITED' && retryError?.code !== 'SEARCH_SOURCE_UNREACHABLE') throw retryError;
        outcome = await syncJournalSource({ store, source, daysBack, allowedPdfHosts, provider: 'crossref', libraryIndex });
      }
    }
    const { fetched, inserted, pruned } = outcome;
    store.upsertJournalSourceStatus(source.id, { lastSyncedAt: startedAt, lastInserted: inserted, lastError: null });
    store.addJournalSyncLog({ sourceId: source.id, venue: source.venue, fetched, inserted, pruned });
    return { sourceId: source.id, venue: source.venue, fetched, inserted, pruned, error: null };
  } catch (error) {
    const message = error?.message || '同步失败';
    store.upsertJournalSourceStatus(source.id, { lastSyncedAt: startedAt, lastInserted: 0, lastError: message });
    store.addJournalSyncLog({ sourceId: source.id, venue: source.venue, fetched: 0, inserted: 0, pruned: 0, error: message });
    return { sourceId: source.id, venue: source.venue, fetched: 0, inserted: 0, pruned: 0, error: message };
  }
}

async function fetchOpenAlexJournalRecords(source, perPage) {
  const url = new URL('https://api.openalex.org/works');
  url.searchParams.set('filter', `locations.source.issn:${String(source.issn).trim()}`);
  url.searchParams.set('per-page', String(perPage));
  url.searchParams.set('sort', 'publication_date:desc');
  url.searchParams.set('mailto', OPENALEX_MAILTO);
  const records = [];
  let cursor = '*';
  for (let page = 0; page < MAX_PAGES; page += 1) {
    url.searchParams.set('cursor', cursor);
    const body = await fetchJson(url.href, `期刊 ${source.venue}`, {
      timeoutMs: SYNC_TIMEOUT_MS,
      cacheTtlMs: 0,
    });
    const mapped = mapOpenAlexWorks(body);
    records.push(...mapped);
    cursor = body?.meta?.next_cursor;
    if (!cursor || mapped.length < perPage) break;
  }
  return records;
}

async function fetchCrossrefJournalRecords(source, fromDate, perPage) {
  const url = new URL('https://api.crossref.org/works');
  url.searchParams.set('filter', `issn:${String(source.issn).trim()},from-pub-date:${fromDate}`);
  url.searchParams.set('rows', String(perPage));
  url.searchParams.set('sort', 'published');
  url.searchParams.set('order', 'desc');
  url.searchParams.set('select', 'DOI,title,author,container-title,issued,abstract,URL,link');
  const records = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    url.searchParams.set('offset', String(page * perPage));
    const body = await fetchJson(url.href, `期刊 ${source.venue}（Crossref）`, {
      timeoutMs: SYNC_TIMEOUT_MS,
      cacheTtlMs: 0,
    });
    const mapped = mapCrossrefWorks(body);
    records.push(...mapped);
    if (mapped.length < perPage) break;
  }
  return records;
}

/**
 * 同步全部启用的期刊源（串行），更新各源状态并写同步日志。
 * 每次同步都会拉取各刊最新文献并保留近三期（OpenAlex 不支持可靠的
 * 增量日期窗口——国内期刊日期是年份占位——因此统一取最新 N 条再裁剪）。
 * @returns {{ sourceCount: number, insertedTotal: number, prunedTotal: number, failedCount: number, results: Array }}
 */
export async function syncAllJournals({ store, daysBack = DEFAULT_DAYS_BACK, allowedPdfHosts = [], rateLimitRetryMs = RATE_LIMIT_RETRY_MS }) {
  ensureJournalSources(store);
  const index = buildLibraryIndex(store);
  const sources = store.listJournalSources().filter(source => source.enabled);
  const results = [];
  for (let index = 0; index < sources.length; index += 1) {
    const source = sources[index];
    results.push(await syncOneJournalSource({ store, source, daysBack, allowedPdfHosts, rateLimitRetryMs, libraryIndex: index }));
    // 源间节流：避免 25 个源连续请求 OpenAlex 触发 429（每个源内部已有 250ms 限速）
    if (index < sources.length - 1) {
      await new Promise(resolve => setTimeout(resolve, SOURCE_INTERVAL_MS));
    }
  }
  return {
    sourceCount: results.length,
    insertedTotal: results.reduce((sum, result) => sum + result.inserted, 0),
    prunedTotal: results.reduce((sum, result) => sum + result.pruned, 0),
    failedCount: results.filter(result => result.error).length,
    results,
  };
}
