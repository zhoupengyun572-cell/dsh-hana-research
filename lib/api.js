// DSH 移植：研究业务 API（/api/hana-research/* 前缀下的 dispatch）。
// 原版 routes/api.js（Hono app）改为 webServer handler 内的轻量路由表。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { searchLiterature, LiteratureSearchError } from "./literature-search.js";
import { syncAllJournals, syncOneJournalSource, resolveJournalSource, ensureJournalSources } from "./journal-sync.js";
import { ResearchStoreError } from "./store.js";
import { downloadAndStorePdf, storeUploadedPdf, PdfImportError } from "./pdf-import.js";
import { resolveOfficialDownloadUrl } from "./official-download.js";
import { aiSummarizeSearch, AiSearchError } from "./ai-search.js";
import { aiScreenPaper, AiScreeningError, AI_SCREENING_PROMPT_VERSION } from "./ai-screening.js";
import { queueFulltextIndex, rebuildFulltextIndex, FulltextIndexError } from "./fulltext-index.js";
import { verifyPaperCitation, verifySummaryCitations, CitationVerifyError } from "./citation-verify.js";
import { fetchRelatedWorks, fetchCitationNetwork } from "./openalex-network.js";
import {
	readTranslationConfig,
	writeTranslationConfig,
	translationConfigView,
	TranslationError,
} from "./translation.js";
import { translateDocument } from "./document-translation.js";
import { exportCitations, exportFileName } from "./bibtex.js";
import { completeWithHostLlm, HostLlmError } from "./host-llm.js";
import { buildProjectExport } from "./exporters.js";
import { buildPrismaExport } from "./prisma-export.js";
import { buildQualityExport } from "./quality-export.js";
import {
  legacyAnnotationToEmbedPdf,
  serializeAnnotations,
} from "./annotation-migrate.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PDFJS_PATH = path.join(HERE, "..", "assets", "vendor", "pdfjs.mjs");

/** 下载白名单（原版 manifest network.allowedHosts，DSH 无 manifest 机制 → 代码常量）。 */
export const DOWNLOAD_ALLOWED_HOSTS = [
  "frontiersin.org", "*.frontiersin.org",
  "api.openalex.org", "api.crossref.org", "api.deepseek.com", "api.unpaywall.org",
  "www.mdpi.com", "pmc.ncbi.nlm.nih.gov", "europepmc.org", "link.springer.com",
  "www.nature.com", "journals.plos.org", "academic.oup.com", "journals.sagepub.com",
  "onlinelibrary.wiley.com", "www.sciencedirect.com", "arxiv.org", "export.arxiv.org",
  "eutils.ncbi.nlm.nih.gov", "psyarxiv.com", "osf.io", "journal.psych.ac.cn",
];

const JOURNAL_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;

function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

function sendText(res, status, text, headers = {}) {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8", ...headers });
  res.end(text);
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 2 * 1024 * 1024) throw new ResearchStoreError("INVALID_JSON", "请求体过大", 413);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ResearchStoreError("INVALID_JSON", "请求内容不是有效 JSON", 400);
  }
}

/** 读取原始请求体（上传 PDF 用，上限 41 MB）。 */
async function readRawBody(req, maxBytes = 41 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new ResearchStoreError("UPLOAD_TOO_LARGE", "上传内容超过 40 MB 上限", 413);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * 最小 multipart/form-data 解析（仅支持文本字段 + 一个文件字段）：
 * 返回 { fields: {name: string}, file: { name, filename, buffer } | null }。
 * 导出供测试直接验证。
 */
export function parseMultipart(buffer, contentType) {
  const boundaryMatch = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(String(contentType || ""));
  const boundary = (boundaryMatch?.[1] || boundaryMatch?.[2] || "").trim();
  if (!boundary) throw new ResearchStoreError("UPLOAD_INVALID", "缺少 multipart boundary", 400);
  const delimiter = Buffer.from(`--${boundary}`);
  const fields = {};
  let file = null;
  let cursor = 0;
  while (cursor < buffer.length) {
    const start = buffer.indexOf(delimiter, cursor);
    if (start === -1) break;
    const headerStart = start + delimiter.length;
    // 结束分隔符：--boundary--
    if (buffer[headerStart] === 0x2d && buffer[headerStart + 1] === 0x2d) break;
    // 跳过 boundary 后的 CRLF / LF
    let pos = headerStart;
    if (buffer[pos] === 0x0d && buffer[pos + 1] === 0x0a) pos += 2;
    else if (buffer[pos] === 0x0a) pos += 1;
    // header 结束于空行
    let headerEnd = buffer.indexOf(Buffer.from("\r\n\r\n"), pos);
    if (headerEnd === -1) headerEnd = buffer.indexOf(Buffer.from("\n\n"), pos);
    if (headerEnd === -1) break;
    const headerLine = buffer.subarray(pos, headerEnd).toString("latin1");
    // body 起点（跳过空行）；\r\n\r\n 是 4 字节，\n\n 是 2 字节
    let bodyStart = headerEnd;
    if (buffer[bodyStart] === 0x0d && buffer[bodyStart + 1] === 0x0a) bodyStart += 4;
    else bodyStart += 2;
    // body 终点 = 下一个 delimiter（去掉尾部 CRLF）
    const bodyEnd = buffer.indexOf(delimiter, bodyStart);
    if (bodyEnd === -1) break;
    let body = buffer.subarray(bodyStart, bodyEnd);
    if (body.length >= 2 && body[body.length - 2] === 0x0d && body[body.length - 1] === 0x0a) {
      body = body.subarray(0, body.length - 2);
    }
    const nameMatch = /name="([^"]*)"/.exec(headerLine);
    const filenameMatch = /filename="([^"]*)"/.exec(headerLine);
    const name = nameMatch?.[1] || "";
    if (filenameMatch) {
      file = { name, filename: filenameMatch[1], buffer: body };
    } else if (name) {
      fields[name] = body.toString("utf8");
    }
    cursor = bodyEnd;
  }
  return { fields, file };
}

/** 简单路径匹配：'/papers/:paperId/favorite' → { paperId }。 */
function matchPath(pattern, pathname) {
  const patternParts = pattern.split("/").filter(Boolean);
  const pathParts = pathname.split("/").filter(Boolean);
  if (patternParts.length !== pathParts.length) return null;
  const params = {};
  for (let i = 0; i < patternParts.length; i += 1) {
    const part = patternParts[i];
    if (part.startsWith(":")) params[part.slice(1)] = decodeURIComponent(pathParts[i]);
    else if (part !== pathParts[i]) return null;
  }
  return params;
}

/** 期刊同步状态机（防重入），定时器在 index.js 挂。 */
export function createJournalSync(store) {
  let running = false;
  return {
    isRunning: () => running,
    start() {
      if (running) return { started: false, running: true };
      running = true;
      (async () => {
        try {
          await syncAllJournals({ store, allowedPdfHosts: DOWNLOAD_ALLOWED_HOSTS });
        } catch {
          // syncAllJournals 已逐源降级；此处兜底
        } finally {
          running = false;
        }
      })();
      return { started: true, running: true };
    },
    async startSource(sourceId) {
      if (running) return { started: false, running: true };
      const source = store.listJournalSources().find(item => item.id === sourceId);
      if (!source) throw new ResearchStoreError('JOURNAL_SOURCE_NOT_FOUND', '期刊源不存在', 404);
      if (!source.enabled) throw new ResearchStoreError('JOURNAL_SOURCE_DISABLED', '请先启用该期刊源', 409);
      running = true;
      try {
        const result = await syncOneJournalSource({ store, source, allowedPdfHosts: DOWNLOAD_ALLOWED_HOSTS });
        return { started: true, running: false, result };
      } finally {
        running = false;
      }
    },
  };
}

/** 注册全部业务 API，返回 (req, res, url) handler。 */
export function createApiHandler(ctx, store) {
  const journalSync = createJournalSync(store);

  const routes = [];
  const route = (method, pattern, handler, options = {}) => routes.push({ method, pattern, handler, raw: options.raw === true });

  const withError = async (res, action) => {
    try {
      return await action();
    } catch (error) {
      // 流式响应中途失败时响应头已发出，只能断开连接；否则会抛 ERR_HTTP_HEADERS_SENT
      if (res.headersSent) {
        res.destroy();
        return undefined;
      }
      if (error instanceof ResearchStoreError || error instanceof LiteratureSearchError || error instanceof PdfImportError || error instanceof TranslationError || error instanceof AiSearchError || error instanceof AiScreeningError || error instanceof FulltextIndexError || error instanceof CitationVerifyError || error instanceof HostLlmError) {
        return sendJson(res, error.status || 400, {
          error: error.code,
          message: error.message,
          ...(error.details && Object.keys(error.details).length ? { details: error.details } : {}),
        });
      }
      ctx.logger.error("hana-research api error: %s", error?.stack || error);
      return sendJson(res, 500, { error: "INTERNAL_ERROR", message: "内部错误" });
    }
  };

  // ── 检索（纯读，不落库） ──
  route("GET", "/search", async (req, res, { query }) => {
    await withError(res, async () => {
      const sourcesRaw = query.get("sources") || "";
      const result = await searchLiterature({
        query: query.get("q") || "",
        sources: sourcesRaw ? sourcesRaw.split(",").map((item) => item.trim()).filter(Boolean) : undefined,
        perSource: Number(query.get("perSource") || 10),
        allowedPdfHosts: DOWNLOAD_ALLOWED_HOSTS,
      });
      return sendJson(res, 200, result);
    });
  });

  // ── 全网检索（四源 + AI 解读；AI 走宿主模型，失败降级不阻断） ──
  route("GET", "/search/web", async (req, res, { query }) => {
    await withError(res, async () => {
      const result = await searchLiterature({
        query: query.get("q") || "",
        sources: ["openalex", "crossref", "arxiv", "pubmed"],
        perSource: Number(query.get("perSource") || 8),
        allowedPdfHosts: DOWNLOAD_ALLOWED_HOSTS,
      });
      let ai = null;
      let aiError = null;
      if (result.results.length) {
        try {
          const selection = ctx.agentDefaultModel?.currentSelection?.();
          ai = await aiSummarizeSearch({
            llm: ctx.get("llm"),
            selection,
            query: result.query,
            results: result.results,
          });
        } catch (error) {
          aiError = {
            code: error?.code || "AI_SEARCH_FAILED",
            message: error?.message || "AI 分析不可用",
          };
        }
      }
      return sendJson(res, 200, { ...result, ai, aiError });
    });
  });

  // ── 翻译设置（宿主模型模式：仅语言项） ──
  route("GET", "/translate/config", async (req, res) => {
    await withError(res, async () => {
      return sendJson(res, 200, { config: translationConfigView(store.dataDir) });
    });
  });

  route("POST", "/translate/config", async (req, res, { body }) => {
    await withError(res, async () => {
      writeTranslationConfig(store.dataDir, body);
      return sendJson(res, 200, { config: translationConfigView(store.dataDir) });
    });
  });

  // ── 保存检索结果（DOI 去重 upsert） ──
  route("POST", "/search/save", async (req, res, { body }) => {
    await withError(res, async () => {
      const paper = store.upsertSearchResult(body.record);
      return sendJson(res, 201, { paper });
    });
  });

  // ── 文献库 ──
  route("GET", "/papers", async (req, res, { query }) => {
    await withError(res, async () => {
      const collectionMap = store.paperCollectionMap();
      const allPapers = store.listPapers().map((paper) => ({
        ...paper,
        // P1 增强：所属文献集合
        collectionIds: collectionMap.get(paper.id) || [],
        // 服务端计算可下载性：自带 PDF / 有 DOI（Unpaywall 兜底）/ 官网直连规则
        canDownload: Boolean(paper.pdfUrl || paper.doi || resolveOfficialDownloadUrl(paper)),
      }));
      // 无 paged 参数时保留旧契约，避免旧客户端和 Agent 工具受到影响。
      if (query.get("paged") !== "1") return sendJson(res, 200, { papers: allPapers });

      const q = String(query.get("q") || "").trim().toLowerCase();
      const customTag = String(query.get("customTag") || "").trim().toLowerCase();
      const topic = String(query.get("topic") || "").trim();
      const venue = String(query.get("venue") || "").trim();
      const readStatus = String(query.get("readStatus") || "").trim();
      const collectionId = String(query.get("collection") || "").trim();
      const methodology = String(query.get("methodology") || "").trim();
      const favoriteOnly = query.get("favorite") === "1";
      const rawPageSize = Number(query.get("pageSize") || 60);
      const rawPage = Number(query.get("page") || 1);
      const pageSize = Number.isFinite(rawPageSize) ? Math.min(Math.max(Math.trunc(rawPageSize), 20), 100) : 60;
      const requestedPage = Number.isFinite(rawPage) ? Math.max(Math.trunc(rawPage), 1) : 1;
      const matchesText = (paper, needle) => {
        if (!needle) return true;
        return `${paper.title || ""} ${paper.authors || ""} ${paper.topic || ""} ${paper.venue || ""} ${paper.abstract || ""}`
          .toLowerCase().includes(needle);
      };
      const filtered = allPapers.filter((paper) => (
        matchesText(paper, q)
        && matchesText(paper, customTag)
        && (!topic || topic === "全部" || paper.topic === topic)
        && (!venue || venue === "全部" || paper.venue === venue)
        && (!readStatus || readStatus === "全部" || (paper.readStatus || "unread") === readStatus)
        && (!collectionId || collectionId === "全部" || paper.collectionIds.includes(collectionId))
        && (!methodology || methodology === "全部" || (paper.methodology || []).includes(methodology))
        && (!favoriteOnly || paper.favorite)
      ));
      const total = filtered.length;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const page = Math.min(requestedPage, totalPages);
      const offset = (page - 1) * pageSize;
      const venueCounts = Object.create(null);
      const topics = new Set();
      let favoriteCount = 0;
      for (const paper of allPapers) {
        if (paper.topic) topics.add(paper.topic);
        if (paper.venue) venueCounts[paper.venue] = Number(venueCounts[paper.venue] || 0) + 1;
        if (paper.favorite) favoriteCount += 1;
      }
      return sendJson(res, 200, {
        papers: filtered.slice(offset, offset + pageSize),
        pagination: { page, pageSize, total, totalPages, hasMore: page < totalPages },
        facets: {
          topics: [...topics].sort((a, b) => a.localeCompare(b, "zh")),
          venueCounts,
          favoriteCount,
          libraryTotal: allPapers.length,
        },
      });
    });
  });

  // ── 文献去重（v16：可解释候选、忽略、事务合并与即时撤销） ──
  route("GET", "/papers/duplicates", async (req, res, { query }) => {
    await withError(res, async () => sendJson(res, 200, store.listDuplicateCandidates({
      projectId: query.get("projectId") || null,
      includeIgnored: query.get("includeIgnored") === "1",
      limit: Number(query.get("limit") || 100),
    })));
  });

  route("POST", "/papers/duplicates/ignore", async (req, res, { body }) => {
    await withError(res, async () => sendJson(res, 200, store.ignoreDuplicateCandidate(body.leftPaperId, body.rightPaperId)));
  });

  route("POST", "/papers/duplicates/merge", async (req, res, { body }) => {
    await withError(res, async () => sendJson(res, 200, store.mergeDuplicatePapers(body.targetPaperId, body.sourcePaperId)));
  });

  route("POST", "/papers/duplicates/merges/:mergeId/undo", async (req, res, { params }) => {
    await withError(res, async () => sendJson(res, 200, store.undoPaperMerge(params.mergeId)));
  });

  route("PATCH", "/papers/:paperId/favorite", async (req, res, { params, body }) => {
    await withError(res, async () => {
      const paper = store.setFavorite(params.paperId, body.favorite === true);
      return sendJson(res, 200, { paper });
    });
  });

  // ── 阅读状态与优先级（P1 增强） ──
  route("PATCH", "/papers/:paperId/status", async (req, res, { params, body }) => {
    await withError(res, async () => {
      const paper = store.setPaperStatus(params.paperId, {
        readStatus: body.readStatus,
        priority: body.priority,
      });
      return sendJson(res, 200, { paper });
    });
  });

  // ── 方法学标注（P2 增强：L10 研究设计/测量工具/样本人群标签） ──
  route("PATCH", "/papers/:paperId/methodology", async (req, res, { params, body }) => {
    await withError(res, async () => {
      const paper = store.setPaperMethodology(params.paperId, body.tags);
      return sendJson(res, 200, { paper });
    });
  });

  // ── 相似文献推荐（P2 增强：L11 OpenAlex related_works） ──
  route("GET", "/papers/:paperId/related", async (req, res, { params, query }) => {
    await withError(res, async () => {
      const paper = store.getPaper(params.paperId);
      if (!paper) throw new ResearchStoreError("PAPER_NOT_FOUND", "文献不存在", 404);
      const max = Math.min(Math.max(Number(query.get("max") || 10), 1), 20);
      const result = await fetchRelatedWorks(paper, max);
      return sendJson(res, 200, result);
    });
  });

  // ── 引文网络浏览（P2 增强：L12 参考文献 / 被引文献） ──
  route("GET", "/papers/:paperId/citations", async (req, res, { params, query }) => {
    await withError(res, async () => {
      const paper = store.getPaper(params.paperId);
      if (!paper) throw new ResearchStoreError("PAPER_NOT_FOUND", "文献不存在", 404);
      const max = Math.min(Math.max(Number(query.get("max") || 12), 1), 25);
      const result = await fetchCitationNetwork(paper, max);
      return sendJson(res, 200, result);
    });
  });

  // ── 保存的检索（P2 增强：L6 检索历史、一键重跑、新结果提醒标记） ──
  route("GET", "/searches", async (req, res) => {
    await withError(res, async () => {
      return sendJson(res, 200, { searches: store.listSavedSearches() });
    });
  });

  route("POST", "/searches", async (req, res, { body }) => {
    await withError(res, async () => {
      const search = store.saveSearch({
        name: body.name,
        query: body.query,
        sources: body.sources,
        perSource: body.perSource,
        filters: body.filters,
      });
      return sendJson(res, 201, { search });
    });
  });

  route("PATCH", "/searches/:searchId", async (req, res, { params, body }) => {
    await withError(res, async () => {
      const search = store.updateSavedSearch(params.searchId, {
        name: body.name,
        alertEnabled: body.alertEnabled,
      });
      return sendJson(res, 200, { search });
    });
  });

  route("DELETE", "/searches/:searchId", async (req, res, { params }) => {
    await withError(res, async () => {
      return sendJson(res, 200, { deleted: store.deleteSavedSearch(params.searchId) });
    });
  });

  // 一键重跑：实时检索全部来源，记录结果快照并计算相对上次的新增结果
  route("POST", "/searches/:searchId/run", async (req, res, { params }) => {
    await withError(res, async () => {
      const saved = store.getSavedSearch(params.searchId);
      if (!saved) throw new ResearchStoreError("SEARCH_NOT_FOUND", "保存的检索不存在", 404);
      const result = await searchLiterature({
        query: saved.query,
        sources: saved.sources.length ? saved.sources : undefined,
        perSource: saved.perSource,
        allowedPdfHosts: DOWNLOAD_ALLOWED_HOSTS,
      });
      const records = result.results || [];
      const resultIds = records.map((record) => {
        const doi = String(record?.doi || "").trim().toLowerCase();
        if (doi) return `doi-${doi.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
        const source = String(record?.source || "").trim();
        const sourceId = String(record?.sourceId || "").trim();
        return source && sourceId
          ? `${source}-${sourceId.replace(/[^a-z0-9_-]+/gi, "-").toLowerCase()}`
          : "";
      }).filter(Boolean);
      const run = store.recordSearchRun(params.searchId, resultIds);
      return sendJson(res, 200, {
        search: store.getSavedSearch(params.searchId),
        total: run.total,
        newIds: run.newIds,
        newCount: run.newIds.length,
        firstRun: run.firstRun,
        papers: records,
      });
    });
  });

  // ── 引用导出（BibTeX / RIS，P1 增强） ──
  route("POST", "/papers/export", async (req, res, { body }) => {
    await withError(res, async () => {
      const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
      if (!ids.length) throw new ResearchStoreError("EXPORT_EMPTY", "请先选择要导出的文献", 400);
      const papers = ids.map((id) => store.getPaper(id)).filter(Boolean);
      if (!papers.length) throw new ResearchStoreError("EXPORT_EMPTY", "所选文献不存在", 404);
      const format = String(body.format || "bibtex").toLowerCase();
      const text = exportCitations(papers, format);
      const fileName = exportFileName(format, "papers");
      const encodedName = encodeURIComponent(fileName);
      res.writeHead(200, {
        "content-type": format === "ris" ? "application/x-research-info-systems; charset=utf-8" : "application/x-bibtex; charset=utf-8",
        "content-disposition": `attachment; filename*=UTF-8''${encodedName}`,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      });
      res.end(text);
    });
  });

  // ── 项目（P1：文献中心"选择目标项目"需要；完整项目库 API 在 P2） ──
  route("GET", "/projects", async (req, res) => {
    await withError(res, async () => {
      return sendJson(res, 200, { projects: store.listProjects() });
    });
  });

  // ── 项目（P2 完整项目库） ──
  route("POST", "/projects", async (req, res, { body }) => {
    await withError(res, async () => {
      const project = store.createProject(body);
      return sendJson(res, 201, { project });
    });
  });

  route("DELETE", "/projects/:projectId", async (req, res, { params }) => {
    await withError(res, async () => {
      const result = store.deleteProject(params.projectId);
      return sendJson(res, 200, { deleted: true, ...result });
    });
  });

  route("GET", "/projects/:projectId/papers", async (req, res, { params }) => {
    await withError(res, async () => {
      return sendJson(res, 200, {
        project: store.getProject(params.projectId),
        papers: store.listProjectPapers(params.projectId),
      });
    });
  });

  // ── 把已保存文献加入项目（纯元数据，P2 增强） ──
  route("POST", "/projects/:projectId/papers", async (req, res, { params, body }) => {
    await withError(res, async () => {
      const paper = store.addPaperToProject(params.projectId, String(body.paperId || ""));
      return sendJson(res, 201, { paper });
    });
  });

  // ── 项目类型/状态（P1 增强） ──
  route("PATCH", "/projects/:projectId", async (req, res, { params, body }) => {
    await withError(res, async () => {
      const project = store.updateProjectMeta(params.projectId, {
        projectType: body.projectType,
        status: body.status,
      });
      return sendJson(res, 200, { project });
    });
  });

  // ── 项目内文献角色（P2 增强：P3 核心/背景/方法参考/结果对比） ──
  route("PATCH", "/projects/:projectId/papers/:paperId/role", async (req, res, { params, body }) => {
    await withError(res, async () => {
      const paper = store.setPaperRole(params.projectId, params.paperId, body.role);
      return sendJson(res, 200, { paper });
    });
  });

  // ── 系统综述筛选（v14：纳排标准 + 题录/全文双阶段决策） ──
  route("GET", "/projects/:projectId/screening", async (req, res, { params }) => {
    await withError(res, async () => sendJson(res, 200, store.buildScreeningOverview(params.projectId)));
  });

  route("PUT", "/projects/:projectId/screening/criteria", async (req, res, { params, body }) => {
    await withError(res, async () => {
      const criteria = store.replaceScreeningCriteria(params.projectId, body.criteria);
      return sendJson(res, 200, { criteria });
    });
  });

  route("PATCH", "/projects/:projectId/papers/:paperId/screening", async (req, res, { params, body }) => {
    await withError(res, async () => {
      const paper = store.updatePaperScreening({
        projectId: params.projectId,
        paperId: params.paperId,
        stage: body.stage,
        decision: body.decision,
        reason: body.reason,
      });
      return sendJson(res, 200, { paper });
    });
  });

  route("POST", "/projects/:projectId/screening/batch", async (req, res, { params, body }) => {
    await withError(res, async () => sendJson(res, 200, store.updatePaperScreeningBatch({
      projectId: params.projectId,
      paperIds: body.paperIds,
      stage: body.stage,
      decision: body.decision,
      reason: body.reason,
    }))); 
  });

  // ── 双人独立筛选（v17：项目级启用、独立判断、冲突仲裁与一致性统计） ──
  route("PUT", "/projects/:projectId/screening/dual-config", async (req, res, { params, body }) => {
    await withError(res, async () => sendJson(res, 200, store.configureDualScreening(params.projectId, {
      enabled: body.enabled === true,
      reviewerAName: body.reviewerAName,
      reviewerBName: body.reviewerBName,
      importLegacy: body.importLegacy === true,
    })));
  });

  route("PATCH", "/projects/:projectId/papers/:paperId/screening/reviews/:reviewerKey", async (req, res, { params, body }) => {
    await withError(res, async () => sendJson(res, 200, { paperScreening: store.updateIndependentScreening({
      projectId: params.projectId,
      paperId: params.paperId,
      reviewerKey: params.reviewerKey,
      stage: body.stage,
      decision: body.decision,
      reason: body.reason,
    }) }));
  });

  route("POST", "/projects/:projectId/papers/:paperId/screening/resolve", async (req, res, { params, body }) => {
    await withError(res, async () => sendJson(res, 200, { paperScreening: store.resolveScreeningConflict({
      projectId: params.projectId,
      paperId: params.paperId,
      stage: body.stage,
      decision: body.decision,
      reason: body.reason,
      resolutionNote: body.resolutionNote,
    }) }));
  });

  // ── AI 预筛（v20：第三评审；只出建议，不改人工字段与 PRISMA 口径） ──
  route("POST", "/projects/:projectId/screening/ai-runs", async (req, res, { params, body }) => {
    await withError(res, async () => {
      const selection = ctx.agentDefaultModel?.currentSelection?.();
      if (!selection?.provider || !selection?.model) {
        throw new AiScreeningError('AI_SCREENING_NO_MODEL', '宿主未配置模型，无法运行 AI 预筛', 400);
      }
      const run = store.createAiScreeningRun({
        projectId: params.projectId,
        stage: body.stage,
        paperIds: body.paperIds ?? null,
        model: selection.model,
        promptVersion: AI_SCREENING_PROMPT_VERSION,
      });
      startAiScreeningTask(ctx, store, { projectId: params.projectId, runId: run.id }, selection);
      return sendJson(res, 201, { run });
    });
  });

  route("GET", "/projects/:projectId/screening/ai-runs", async (req, res, { params }) => {
    await withError(res, async () => sendJson(res, 200, { runs: store.listAiScreeningRuns(params.projectId) }));
  });

  route("GET", "/projects/:projectId/screening/ai-runs/:runId", async (req, res, { params }) => {
    await withError(res, async () => sendJson(res, 200, { run: store.getAiScreeningRun(params.projectId, params.runId) }));
  });

  route("POST", "/projects/:projectId/screening/ai-runs/:runId/pause", async (req, res, { params }) => {
    await withError(res, async () => sendJson(res, 200, { run: store.updateAiScreeningRunStatus({ projectId: params.projectId, runId: params.runId, status: "paused" }) }));
  });

  route("POST", "/projects/:projectId/screening/ai-runs/:runId/resume", async (req, res, { params }) => {
    await withError(res, async () => {
      const selection = ctx.agentDefaultModel?.currentSelection?.();
      if (!selection?.provider || !selection?.model) {
        throw new AiScreeningError('AI_SCREENING_NO_MODEL', '宿主未配置模型，无法继续 AI 预筛', 400);
      }
      const run = store.updateAiScreeningRunStatus({ projectId: params.projectId, runId: params.runId, status: "queued" });
      startAiScreeningTask(ctx, store, { projectId: params.projectId, runId: params.runId }, selection);
      return sendJson(res, 200, { run });
    });
  });

  route("POST", "/projects/:projectId/screening/ai-runs/:runId/cancel", async (req, res, { params }) => {
    await withError(res, async () => sendJson(res, 200, { run: store.updateAiScreeningRunStatus({ projectId: params.projectId, runId: params.runId, status: "cancelled" }) }));
  });

  route("GET", "/projects/:projectId/screening/ai", async (req, res, { params, query }) => {
    await withError(res, async () => sendJson(res, 200, { results: store.listAiScreenings(params.projectId, {
      runId: query.get("runId") || null,
      stage: query.get("stage") || null,
      tier: query.get("tier") || null,
    }) }));
  });

  route("GET", "/projects/:projectId/screening/ai-agreement", async (req, res, { params, query }) => {
    await withError(res, async () => sendJson(res, 200, store.buildAiScreeningAgreement(params.projectId, {
      stage: query.get("stage") || "title_abstract",
      runId: query.get("runId") || null,
    })));
  });

  // ── PRISMA 2020（v18：检索批次、全文获取状态、流程统计与可复核导出） ──
  route("GET", "/projects/:projectId/prisma", async (req, res, { params }) => {
    await withError(res, async () => sendJson(res, 200, store.buildPrismaOverview(params.projectId)));
  });

  route("POST", "/projects/:projectId/prisma/batches", async (req, res, { params, body }) => {
    await withError(res, async () => sendJson(res, 201, { batch: store.createPrismaBatch(params.projectId, body), prisma: store.buildPrismaOverview(params.projectId) }));
  });

  route("PATCH", "/projects/:projectId/prisma/batches/:batchId", async (req, res, { params, body }) => {
    await withError(res, async () => sendJson(res, 200, { batch: store.updatePrismaBatch(params.projectId, params.batchId, body), prisma: store.buildPrismaOverview(params.projectId) }));
  });

  route("DELETE", "/projects/:projectId/prisma/batches/:batchId", async (req, res, { params }) => {
    await withError(res, async () => sendJson(res, 200, { ...store.deletePrismaBatch(params.projectId, params.batchId), prisma: store.buildPrismaOverview(params.projectId) }));
  });

  route("PATCH", "/projects/:projectId/papers/:paperId/retrieval", async (req, res, { params, body }) => {
    await withError(res, async () => sendJson(res, 200, store.updatePaperRetrieval({ projectId: params.projectId, paperId: params.paperId, status: body.status, reason: body.reason })));
  });

  route("GET", "/projects/:projectId/prisma/export", async (req, res, { params, query }) => {
    await withError(res, async () => {
      const result = buildPrismaExport(store, params.projectId, query.get("format"));
      const encodedName = encodeURIComponent(result.fileName);
      res.writeHead(200, {
        "content-type": result.mime,
        "content-disposition": `attachment; filename*=UTF-8''${encodedName}`,
        "content-length": String(result.body.length),
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      });
      res.end(result.body);
    });
  });

  // ── 研究编码（v15：项目字段模板 + 逐篇结构化证据值） ──
  route("GET", "/projects/:projectId/evidence-coding", async (req, res, { params }) => {
    await withError(res, async () => sendJson(res, 200, store.getEvidenceCoding(params.projectId)));
  });

  route("GET", "/projects/:projectId/quality", async (req, res, { params }) => {
    await withError(res, async () => sendJson(res, 200, store.buildQualityOverview(params.projectId)));
  });

  route("PUT", "/projects/:projectId/quality/config", async (req, res, { params, body }) => {
    await withError(res, async () => sendJson(res, 200, { config: store.updateQualityConfig(params.projectId, body), quality: store.buildQualityOverview(params.projectId) }));
  });

  route("PUT", "/projects/:projectId/papers/:paperId/quality/reviews", async (req, res, { params, body }) => {
    await withError(res, async () => sendJson(res, 200, { quality: store.saveRobReview(params.projectId, params.paperId, body) }));
  });

  route("POST", "/projects/:projectId/papers/:paperId/quality/resolve", async (req, res, { params, body }) => {
    await withError(res, async () => sendJson(res, 200, { quality: store.resolveRobDomain(params.projectId, params.paperId, body) }));
  });

  route("POST", "/projects/:projectId/grade/outcomes", async (req, res, { params, body }) => {
    await withError(res, async () => sendJson(res, 201, { outcome: store.saveGradeOutcome(params.projectId, body) }));
  });

  route("PUT", "/projects/:projectId/grade/outcomes/:outcomeId", async (req, res, { params, body }) => {
    await withError(res, async () => sendJson(res, 200, { outcome: store.saveGradeOutcome(params.projectId, body, params.outcomeId) }));
  });

  route("DELETE", "/projects/:projectId/grade/outcomes/:outcomeId", async (req, res, { params }) => {
    await withError(res, async () => sendJson(res, 200, store.deleteGradeOutcome(params.projectId, params.outcomeId)));
  });

  route("GET", "/projects/:projectId/quality/export", async (req, res, { params, query }) => {
    await withError(res, async () => {
      const project = store.getProject(params.projectId);
      if (!project) throw new ResearchStoreError('PROJECT_NOT_FOUND', '项目不存在', 404);
      const requestedFormat = query.get('format');
      const format = ['json','rob-csv','grade-csv'].includes(requestedFormat) ? requestedFormat : 'json';
      const output = buildQualityExport(project, store.buildQualityOverview(params.projectId), format);
      res.writeHead(200, { 'content-type': output.contentType, 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(output.fileName)}` });
      res.end(output.body);
    });
  }, { raw: true });

  route("PUT", "/projects/:projectId/evidence-fields", async (req, res, { params, body }) => {
    await withError(res, async () => {
      const fields = store.replaceEvidenceFields(params.projectId, body.fields, { force: body.force === true });
      return sendJson(res, 200, { fields, coding: store.getEvidenceCoding(params.projectId) });
    });
  });

  route("PATCH", "/projects/:projectId/papers/:paperId/evidence-coding", async (req, res, { params, body }) => {
    await withError(res, async () => sendJson(res, 200, store.updatePaperEvidenceCoding({
      projectId: params.projectId,
      paperId: params.paperId,
      values: body.values,
    })));
  });

  // ── 导入：检索结果一键下载（Unpaywall + 官网直连 + 白名单校验） ──
  route("POST", "/projects/:projectId/import-pdf", async (req, res, { params, body }) => {
    await withError(res, async () => {
      const paper = store.getPaper(String(body.paperId || ""));
      if (!paper) throw new ResearchStoreError("PAPER_NOT_FOUND", "文献不存在", 404);
      const result = await downloadAndStorePdf({
        store,
        projectId: params.projectId,
        paper,
        allowedHosts: DOWNLOAD_ALLOWED_HOSTS,
      });
      queueFulltextIndex(ctx, store, result.attachment?.id || result.id);
      return sendJson(res, result.reused ? 200 : 201, result);
    });
  });

  // ── 上传：本地 PDF 直接导入（multipart） ──
  route("POST", "/projects/:projectId/upload-pdf", async (req, res, { params, rawBody, contentType }) => {
    await withError(res, async () => {
      const { fields, file } = parseMultipart(rawBody, contentType);
      if (!file || !file.buffer?.length) {
        throw new ResearchStoreError("PDF_FILE_REQUIRED", "请选择要上传的 PDF 文件", 400);
      }
      const result = storeUploadedPdf({
        store,
        projectId: params.projectId,
        buffer: file.buffer,
        originalName: file.filename || "",
        title: fields.title || file.filename || "",
      });
      queueFulltextIndex(ctx, store, result.attachment?.id || result.id);
      return sendJson(res, result.reused ? 200 : 201, result);
    });
  }, { raw: true });

  // ── 全文检索（v21：本地 PDF 内容，FTS5；不外发） ──
  route("GET", "/search/fulltext", async (req, res, { query }) => {
    await withError(res, async () => sendJson(res, 200, store.searchFullText({
      query: query.get("q") || "",
      projectId: query.get("projectId") || null,
      limit: query.get("limit") || 20,
    })));
  });

  route("GET", "/search/fulltext/status", async (req, res) => {
    await withError(res, async () => sendJson(res, 200, store.fulltextIndexStatus()));
  });

  route("POST", "/search/fulltext/rebuild", async (req, res, { body }) => {
    await withError(res, async () => sendJson(res, 202, rebuildFulltextIndex(ctx, store, { force: body?.force === true })));
  });

  // ── 阅读器上下文 + 批注 + 笔记（notes 限定本 PDF 附件） ──
  route("GET", "/projects/:projectId/reader/:attachmentId", async (req, res, { params }) => {
    await withError(res, async () => {
      return sendJson(res, 200, {
        ...store.getAttachmentContext(params.projectId, params.attachmentId),
        annotations: store.listAnnotations(params.projectId, params.attachmentId),
        notes: store.listNotes(params.projectId, params.attachmentId),
      });
    });
  });

  route("POST", "/projects/:projectId/attachments/:attachmentId/annotations", async (req, res, { params, body }) => {
    await withError(res, async () => {
      const annotation = store.createAnnotation({
        projectId: params.projectId,
        attachmentId: params.attachmentId,
        pageNumber: body.pageNumber,
        kind: body.kind,
        payload: body.payload,
      });
      return sendJson(res, 201, { annotation });
    });
  });

  route("POST", "/projects/:projectId/attachments/:attachmentId/selection-note", async (req, res, { params, body }) => {
    await withError(res, async () => {
      const note = store.createSelectionNote({
        projectId: params.projectId,
        attachmentId: params.attachmentId,
        pageNumber: body.pageNumber,
        quote: body.quote,
        content: body.content,
        tags: body.tags,
        rects: body.rects,
        color: body.color,
      });
      return sendJson(res, 201, note);
    });
  });

  route("DELETE", "/projects/:projectId/annotations/:annotationId", async (req, res, { params }) => {
    await withError(res, async () => {
      const deleted = store.deleteAnnotation(params.projectId, params.annotationId);
      return sendJson(res, 200, { deleted });
    });
  });

  route("GET", "/projects/:projectId/notes", async (req, res, { params }) => {
    await withError(res, async () => {
      return sendJson(res, 200, {
        project: store.getProject(params.projectId),
        notes: store.listNotes(params.projectId),
      });
    });
  });

  route("PATCH", "/projects/:projectId/notes/:noteId", async (req, res, { params, body }) => {
    await withError(res, async () => {
      const note = store.updateNote({
        projectId: params.projectId,
        noteId: params.noteId,
        content: body.content,
        quote: body.quote,
        tags: body.tags,
        pageNumber: body.pageNumber,
      });
      return sendJson(res, 200, { note });
    });
  });

  route("GET", "/projects/:projectId/notes/file", async (req, res, { params }) => {
    await withError(res, async () => {
      const result = store.getProjectNotesFile(params.projectId);
      const encodedName = encodeURIComponent(result.fileName);
      res.writeHead(200, {
        "content-type": "text/markdown; charset=utf-8",
        "content-disposition": `attachment; filename*=UTF-8''${encodedName}`,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      });
      res.end(result.body);
    });
  });

  route("GET", "/projects/:projectId/export", async (req, res, { params, query }) => {
    await withError(res, async () => {
      const result = await buildProjectExport(store, params.projectId, query.get("format"));
      const encodedName = encodeURIComponent(result.fileName);
      res.writeHead(200, {
        "content-type": result.mime,
        "content-disposition": `attachment; filename*=UTF-8''${encodedName}`,
        "content-length": String(result.body.length),
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      });
      res.end(result.body);
    });
  });

  route("POST", "/projects/:projectId/attachments/:attachmentId/notes", async (req, res, { params, body }) => {
    await withError(res, async () => {
      const note = store.createNote({
        projectId: params.projectId,
        attachmentId: params.attachmentId,
        pageNumber: body.pageNumber,
        content: body.content,
        quote: body.quote,
        tags: body.tags,
        linkedPaperId: body.linkedPaperId,
      });
      return sendJson(res, 201, { note });
    });
  });

  // ── 项目级通用笔记（P2 增强：P11 跨文献笔记，无附件也可创建） ──
  route("POST", "/projects/:projectId/notes", async (req, res, { params, body }) => {
    await withError(res, async () => {
      const note = store.createNote({
        projectId: params.projectId,
        paperId: body.paperId || null,
        content: body.content,
        tags: body.tags,
        linkedPaperId: body.linkedPaperId,
      });
      return sendJson(res, 201, { note });
    });
  });

  // ── 文献关系（P2 增强：P5 项目内论证链） ──
  route("GET", "/projects/:projectId/relations", async (req, res, { params }) => {
    await withError(res, async () => {
      return sendJson(res, 200, { relations: store.listPaperRelations(params.projectId) });
    });
  });

  route("POST", "/projects/:projectId/relations", async (req, res, { params, body }) => {
    await withError(res, async () => {
      const relation = store.addPaperRelation({
        projectId: params.projectId,
        fromPaperId: body.fromPaperId,
        toPaperId: body.toPaperId,
        relation: body.relation,
        note: body.note,
      });
      return sendJson(res, 201, { relation });
    });
  });

  route("DELETE", "/relations/:relationId", async (req, res, { params }) => {
    await withError(res, async () => {
      return sendJson(res, 200, { deleted: store.removePaperRelation(params.relationId) });
    });
  });

  // ── 证据矩阵（P2 增强：P4 表格式证据概览） ──
  route("GET", "/projects/:projectId/evidence-matrix", async (req, res, { params }) => {
    await withError(res, async () => {
      return sendJson(res, 200, store.buildEvidenceMatrix(params.projectId));
    });
  });

  // ── 研究驾驶舱聚合（P6：概览/副驾驶/研究闭环用同一份真实统计） ──
  route("GET", "/projects/:projectId/cockpit-stats", async (req, res, { params }) => {
    await withError(res, async () => {
      return sendJson(res, 200, store.buildCockpitStats(params.projectId));
    });
  });

  // ── 宿主能力（前端分级：宿主未重启时新增功能优雅降级，不静默失败） ──
  route("GET", "/capabilities", async (req, res) => {
    await withError(res, async () => {
      return sendJson(res, 200, store.hostCapabilities());
    });
  });

  route("DELETE", "/projects/:projectId/notes/:noteId", async (req, res, { params }) => {
    await withError(res, async () => {
      const deleted = store.deleteNote(params.projectId, params.noteId);
      return sendJson(res, 200, { deleted });
    });
  });

  // ── PDF 附件文件流（阅读器加载） ──
  route("GET", "/attachments/:attachmentId/file", async (req, res, { params }) => {
    await withError(res, async () => {
      const attachment = store.getAttachment(params.attachmentId);
      if (!attachment || !fs.existsSync(attachment.absolutePath)) {
        throw new ResearchStoreError("ATTACHMENT_NOT_FOUND", "PDF 附件不存在", 404);
      }
      // 流式响应：整份 readFileSync（上限 40MB）会阻塞事件循环
      const stat = await fs.promises.stat(attachment.absolutePath);
      const encodedName = encodeURIComponent(attachment.fileName);
      res.writeHead(200, {
        "content-type": "application/pdf",
        "content-length": String(stat.size),
        "content-disposition": `inline; filename*=UTF-8''${encodedName}`,
        "cache-control": "private, max-age=3600",
        "x-content-type-options": "nosniff",
      });
      await pipeline(fs.createReadStream(attachment.absolutePath), res);
    });
  });

  // ── pdf.js 渲染引擎（serverless 单文件构建，worker 内联） ──
  route("GET", "/pdfjs.mjs", async (req, res) => {
    await withError(res, async () => {
      if (!fs.existsSync(PDFJS_PATH)) {
        throw new ResearchStoreError("PDFJS_NOT_FOUND", "pdf.js 资产缺失", 500);
      }
      const stat = await fs.promises.stat(PDFJS_PATH);
      res.writeHead(200, {
        "content-type": "text/javascript; charset=utf-8",
        "content-length": String(stat.size),
        "cache-control": "private, max-age=86400",
        "x-content-type-options": "nosniff",
      });
      await pipeline(fs.createReadStream(PDFJS_PATH), res);
    });
  });

  // ── 翻译任务（宿主模型）：启动 / 轮询 / 列表 / 下载 ──
  route("POST", "/projects/:projectId/attachments/:attachmentId/translate", async (req, res, { params, body }) => {
    await withError(res, async () => {
      const targetLang = typeof body.targetLang === "string" && body.targetLang.trim()
        ? body.targetLang.trim().slice(0, 16)
        : "zh";
      const config = readTranslationConfig(store.dataDir);
      const selection = ctx.agentDefaultModel?.currentSelection?.();
      if (!selection?.provider || !selection?.model) {
        throw new TranslationError("TRANSLATE_NO_MODEL", "宿主未配置可用模型，请在 DSH 设置中配置模型后重试", 403);
      }
      const doc = store.createTranslationDoc({
        projectId: params.projectId,
        attachmentId: params.attachmentId,
        targetLang,
        sourceLang: config.sourceLang,
      });
      startTranslationTask(ctx, store, doc.id, params.attachmentId, { ...config, targetLang }, selection);
      return sendJson(res, 201, { doc });
    });
  });

  route("GET", "/translate/document/:id", async (req, res, { params }) => {
    await withError(res, async () => {
      const doc = store.getTranslationDoc(params.id);
      if (!doc) throw new ResearchStoreError("TRANSLATION_DOC_NOT_FOUND", "译文任务不存在", 404);
      return sendJson(res, 200, { doc });
    });
  });

  route("GET", "/projects/:projectId/translations", async (req, res, { params }) => {
    await withError(res, async () => {
      return sendJson(res, 200, { docs: store.listTranslationDocs(params.projectId) });
    });
  });

  route("GET", "/translate/document/:id/file", async (req, res, { params }) => {
    await withError(res, async () => {
      const doc = store.getTranslationDoc(params.id);
      if (!doc?.absolutePath || !fs.existsSync(doc.absolutePath)) {
        throw new ResearchStoreError("TRANSLATION_FILE_NOT_FOUND", "译文文档不存在", 404);
      }
      const stat = await fs.promises.stat(doc.absolutePath);
      const encodedName = encodeURIComponent(doc.fileName || "translation.md");
      res.writeHead(200, {
        "content-type": "text/markdown; charset=utf-8",
        "content-length": String(stat.size),
        "content-disposition": `attachment; filename*=UTF-8''${encodedName}`,
        "cache-control": "private, max-age=3600",
        "x-content-type-options": "nosniff",
      });
      await pipeline(fs.createReadStream(doc.absolutePath), res);
    });
  });

  // ── 标签管理（P1 增强：列表/改名/合并/删除） ──
  route("GET", "/notes/tags", async (req, res, { query }) => {
    await withError(res, async () => {
      const projectId = query.get("projectId") || null;
      return sendJson(res, 200, { tags: store.listTags(projectId) });
    });
  });

  route("POST", "/notes/tags/rename", async (req, res, { body }) => {
    await withError(res, async () => {
      const affected = store.renameNoteTag(body.oldTag, body.newTag);
      return sendJson(res, 200, { affected });
    });
  });

  route("POST", "/notes/tags/remove", async (req, res, { body }) => {
    await withError(res, async () => {
      const affected = store.removeNoteTag(body.tag);
      return sendJson(res, 200, { affected });
    });
  });

  // ── 文献集合（P1 增强：Collections） ──
  route("GET", "/collections", async (req, res) => {
    await withError(res, async () => {
      return sendJson(res, 200, { collections: store.listCollections() });
    });
  });

  route("POST", "/collections", async (req, res, { body }) => {
    await withError(res, async () => {
      const collection = store.createCollection({ title: body.title, description: body.description });
      return sendJson(res, 201, { collection });
    });
  });

  route("DELETE", "/collections/:collectionId", async (req, res, { params }) => {
    await withError(res, async () => {
      const deleted = store.deleteCollection(params.collectionId);
      return sendJson(res, 200, { deleted });
    });
  });

  route("POST", "/collections/:collectionId/papers", async (req, res, { params, body }) => {
    await withError(res, async () => {
      const added = store.addPaperToCollection(params.collectionId, String(body.paperId || ""));
      return sendJson(res, 200, { added });
    });
  });

  route("DELETE", "/collections/:collectionId/papers/:paperId", async (req, res, { params }) => {
    await withError(res, async () => {
      const removed = store.removePaperFromCollection(params.collectionId, params.paperId);
      return sendJson(res, 200, { removed });
    });
  });

  // ── AI 期刊简报（P2 增强：宿主模型汇总最近同步与新增文献） ──
  route("POST", "/journals/brief", async (req, res) => {
    await withError(res, async () => {
      const selection = ctx.agentDefaultModel?.currentSelection?.();
      if (!selection?.provider || !selection?.model) {
        throw new HostLlmError("LLM_NO_MODEL", "宿主未配置可用模型，请在 DSH 设置中配置模型后重试", 503);
      }
      ensureJournalSources(store);
      const sources = store.listJournalSources();
      const logs = store.listJournalSyncLogs(12);
      const recent = new Map();
      for (const log of logs) {
        if (!recent.has(log.venue)) recent.set(log.venue, log);
      }
      const syncedSources = sources.filter(source => source.lastSyncedAt);
      const recentList = [...recent.values()].slice(0, 10);
      const recentPapers = store.listPapers()
        .filter(p => p.sourceName === "期刊同步")
        .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
        .slice(0, 30)
        .map(p => `- ${p.title}（${p.venue}，${p.year || "年份未知"}${p.citedByCount ? `，被引 ${p.citedByCount}` : ""}）`)
        .join("\n");
      const system = `你是一名心理学学术情报助理。用户会给你期刊同步的最新状态与最近文献清单，请用中文输出一份 120–200 字的期刊简报：概述近期动态、点出最值得关注的 2–4 篇文献（给出标题与理由）、提醒异常期刊源。不要输出 Markdown 标题，直接分段。`;
      const user = `同步状态：${syncedSources.length}/${sources.length} 个期刊源正常${sources.filter(s => s.lastError).length ? `，${sources.filter(s => s.lastError).length} 个异常` : ""}。\n\n最近同步：\n${recentList.map(log => `- ${log.venue}：抓取 ${log.fetched}，新增 ${log.inserted}${log.error ? `（异常：${log.error.slice(0, 80)}）` : ""}`).join("\n") || "（暂无）"}\n\n最近文献：\n${recentPapers || "（暂无）"}`;
      const text = await completeWithHostLlm({ llm: ctx.get("llm"), selection, system, user, temperature: 0.4, timeoutMs: 90000 });
      return sendJson(res, 200, { text });
    });
  });

  // ── AI 项目综述草稿（P2 增强：汇总项目笔记生成结构化草稿） ──
  route("POST", "/projects/:projectId/summary", async (req, res, { params }) => {
    await withError(res, async () => {
      const selection = ctx.agentDefaultModel?.currentSelection?.();
      if (!selection?.provider || !selection?.model) {
        throw new HostLlmError("LLM_NO_MODEL", "宿主未配置可用模型，请在 DSH 设置中配置模型后重试", 503);
      }
      const project = store.getProject(params.projectId);
      if (!project) throw new ResearchStoreError("PROJECT_NOT_FOUND", "项目不存在", 404);
      const notes = store.listNotes(params.projectId);
      const papers = store.listProjectPapers(params.projectId);
      if (!notes.length && !papers.length) {
        throw new ResearchStoreError("SUMMARY_EMPTY", "项目还没有笔记或文献，无法生成综述草稿", 400);
      }
      const noteLines = notes.slice(0, 80).map(note => {
        const paperTitle = note.paperTitle ? `《${note.paperTitle}》` : "项目笔记";
        const tags = note.tags?.length ? ` [${note.tags.join(", ")}]` : "";
        return `- ${paperTitle} 第 ${note.pageNumber || "?"} 页${tags}：${String(note.content || "").slice(0, 200)}`;
      }).join("\n");
      const paperLines = papers.slice(0, 30).map(p => `- ${p.title}（${p.venue}，${p.year || "年份未知"}）`).join("\n");
      const system = `你是一名心理学研究助理。用户会给你一个研究项目的文献清单与阅读笔记，请用中文生成一份综述草稿（Markdown 格式），结构为：\n# 标题（根据内容拟定）\n## 研究背景与问题\n## 主要发现与证据\n## 方法与测量\n## 争议与不足\n## 下一步方向\n基于笔记内容写作，不要编造笔记中没有的内容；每节 3–6 句。`;
      const user = `项目：${project.title}（${project.description || "无描述"}）\n\n文献清单：\n${paperLines || "（暂无）"}\n\n阅读笔记：\n${noteLines || "（暂无）"}`;
      const text = await completeWithHostLlm({ llm: ctx.get("llm"), selection, system, user, temperature: 0.4, timeoutMs: 120000 });
      // 生成后即时核验草稿引用（DOI 双源 + 题名对库）：失败不阻塞草稿返回
      let citationReport = null;
      try {
        citationReport = await verifySummaryCitations({ text, papers });
      } catch (error) {
        ctx.logger?.warn?.("hana-research summary citation verify failed: %s", error?.stack || error);
      }
      return sendJson(res, 200, { text, citationReport });
    });
  });

  // ── 期刊源与同步 ──
  route("GET", "/journals", async (req, res) => {
    await withError(res, async () => {
      ensureJournalSources(store);
      return sendJson(res, 200, {
        sources: store.listJournalSources(),
        logs: store.listJournalSyncLogs(6),
        running: journalSync.isRunning(),
        newCounts: store.journalNewCounts(),
      });
    });
  });

  route("POST", "/journals/sync", async (req, res) => {
    await withError(res, async () => {
      return sendJson(res, 200, journalSync.start());
    });
  });

  // 订阅前按 ISSN 识别期刊并预览最近文章（只读，不落库）。
  route("POST", "/journals/resolve", async (req, res, { body }) => {
    await withError(res, async () => {
      const journal = await resolveJournalSource(body?.issn);
      const knownIssns = new Set([journal.issn, ...(journal.issns || [])]);
      const existing = store.listJournalSources().find(source => knownIssns.has(source.issn)) || null;
      return sendJson(res, 200, { journal, existing });
    });
  });

  // ── 自定义期刊源（P1 增强：按 ISSN 添加） ──
  route("POST", "/journals/custom", async (req, res, { body }) => {
    await withError(res, async () => {
      const source = store.addCustomJournalSource({
        venue: body.venue,
        issn: body.issn,
        topic: body.topic,
      });
      return sendJson(res, 201, { source });
    });
  });

  route("PATCH", "/journals/:sourceId", async (req, res, { params, body }) => {
    await withError(res, async () => {
      const source = store.updateJournalSource(params.sourceId, body || {});
      return sendJson(res, 200, { source });
    });
  });

  route("DELETE", "/journals/:sourceId", async (req, res, { params }) => {
    await withError(res, async () => {
      const result = store.deleteCustomJournalSource(params.sourceId);
      return sendJson(res, 200, result);
    });
  });

  route("POST", "/journals/:sourceId/sync", async (req, res, { params }) => {
    await withError(res, async () => {
      const result = await journalSync.startSource(params.sourceId);
      return sendJson(res, result.started ? 200 : 409, result);
    });
  });

  // ── 标记期刊已查看（新文献徽标归零） ──
  route("POST", "/journals/:sourceId/view", async (req, res, { params }) => {
    await withError(res, async () => {
      const source = store.touchJournalViewed(params.sourceId);
      return sendJson(res, 200, { source });
    });
  });

  // ── 阅读进度（P1 增强：重开续读） ──
  route("PUT", "/attachments/:attachmentId/progress", async (req, res, { params, body }) => {
    await withError(res, async () => {
      const progress = store.setReadingProgress(params.attachmentId, body.pageNumber);
      return sendJson(res, 200, progress);
    });
  });

  // ════════════════════════════════════════════════════════
  // v12 阅读工作区 API：阅读状态 / 文献笔记 / 引文 / EmbedPDF 批注
  // ════════════════════════════════════════════════════════

  route("GET", "/papers/:paperId/reading-state", async (req, res, { params }) => {
    await withError(res, async () => {
      if (!store.getPaper(params.paperId)) throw new ResearchStoreError("PAPER_NOT_FOUND", "文献不存在", 404);
      return sendJson(res, 200, { state: store.getReadingState(params.paperId) });
    });
  });

  route("PUT", "/papers/:paperId/reading-state", async (req, res, { params, body }) => {
    await withError(res, async () => {
      const state = store.putReadingState({ paperId: params.paperId, ...(body || {}) });
      return sendJson(res, 200, { state });
    });
  });

  route("GET", "/papers/:paperId/note-document", async (req, res, { params }) => {
    await withError(res, async () => {
      if (!store.getPaper(params.paperId)) throw new ResearchStoreError("PAPER_NOT_FOUND", "文献不存在", 404);
      return sendJson(res, 200, { document: store.getPaperNoteDocument(params.paperId) });
    });
  });

  route("PUT", "/papers/:paperId/note-document", async (req, res, { params, body }) => {
    await withError(res, async () => {
      const document = store.putPaperNoteDocument({ paperId: params.paperId, ...(body || {}) });
      return sendJson(res, 200, { document });
    });
  });

  route("GET", "/note-documents/:noteDocumentId/citations", async (req, res, { params }) => {
    await withError(res, async () => {
      return sendJson(res, 200, { citations: store.listCitations(params.noteDocumentId) });
    });
  });

  // ── 引用核验（v22：四态审计，不自动改写） ──
  route("POST", "/note-documents/:noteDocumentId/verify-citations", async (req, res, { params }) => {
    await withError(res, async () => {
      const citations = store.listCitations(params.noteDocumentId);
      const results = [];
      for (const citation of citations) {
        const paper = store.getPaper(citation.paperId);
        if (!paper) continue;
        const report = await verifyPaperCitation(paper);
        results.push({ citationId: citation.id, paperId: citation.paperId, ...report });
      }
      const counts = { verified: 0, mismatch: 0, not_found: 0, manual_needed: 0 };
      for (const item of results) counts[item.status] = (counts[item.status] || 0) + 1;
      const verifications = store.replaceCitationVerifications(params.noteDocumentId, results);
      return sendJson(res, 200, { results: verifications, counts });
    });
  });

  route("GET", "/note-documents/:noteDocumentId/citation-verifications", async (req, res, { params }) => {
    await withError(res, async () => sendJson(res, 200, { verifications: store.listCitationVerifications(params.noteDocumentId) }));
  });

  route("POST", "/note-documents/:noteDocumentId/citations", async (req, res, { params, body }) => {
    await withError(res, async () => {
      const citation = store.addCitation({ noteDocumentId: params.noteDocumentId, ...(body || {}) });
      return sendJson(res, 201, { citation });
    });
  });

  route("PATCH", "/citations/:citationId", async (req, res, { params, body }) => {
    await withError(res, async () => {
      const citation = store.updateCitation(params.citationId, body || {});
      return sendJson(res, 200, { citation });
    });
  });

  route("DELETE", "/citations/:citationId", async (req, res, { params }) => {
    await withError(res, async () => {
      return sendJson(res, 200, store.deleteCitation(params.citationId));
    });
  });

  route("GET", "/attachments/:attachmentId/annotations-v2", async (req, res, { params }) => {
    await withError(res, async () => {
      return sendJson(res, 200, { annotations: store.listAnnotationsV2(params.attachmentId) });
    });
  });

  route("PUT", "/attachments/:attachmentId/annotations-v2", async (req, res, { params, body }) => {
    await withError(res, async () => {
      const annotations = store.replaceAnnotationsV2(params.attachmentId, (body || {}).items || []);
      return sendJson(res, 200, { annotations });
    });
  });

  // v12 阅读工作区：高亮摘录 → 项目笔记（选中文字高亮后自动记一条项目笔记，对齐旧版行为）
  route("POST", "/attachments/:attachmentId/highlight-note", async (req, res, { params, body }) => {
    await withError(res, async () => {
      const note = store.createHighlightNote({
        attachmentId: params.attachmentId,
        pageNumber: (body || {}).pageNumber,
        quote: (body || {}).quote,
        content: (body || {}).content,
        tags: (body || {}).tags,
        annotationId: (body || {}).annotationId,
      });
      return sendJson(res, 201, { note });
    });
  });

  // ════════════════════════════════════════════════════════
  // v13 阅读工作区 API：逐句笔记 / 分类 / 标签颜色
  // ════════════════════════════════════════════════════════

  route("GET", "/papers/:paperId/sentence-notes", async (req, res, { params, query }) => {
    await withError(res, async () => {
      const notes = store.listSentenceNotes({
        paperId: params.paperId,
        q: query.get("q") || "",
        categoryId: query.get("category") || null,
        tag: query.get("tag") || null,
        status: query.get("status") || null,
        starred: query.get("starred") === "1",
        sort: query.get("sort") || "page",
        attachmentId: query.get("attachmentId") || null,
      });
      return sendJson(res, 200, { notes });
    });
  });

  route("POST", "/papers/:paperId/sentence-notes", async (req, res, { params, body }) => {
    await withError(res, async () => {
      const note = store.createSentenceNote({ paperId: params.paperId, ...(body || {}) });
      return sendJson(res, 201, { note });
    });
  });

  route("PATCH", "/sentence-notes/:noteId", async (req, res, { params, body }) => {
    await withError(res, async () => {
      const note = store.updateSentenceNote(params.noteId, body || {});
      return sendJson(res, 200, { note });
    });
  });

  route("DELETE", "/sentence-notes/:noteId", async (req, res, { params }) => {
    await withError(res, async () => {
      return sendJson(res, 200, store.deleteSentenceNote(params.noteId));
    });
  });

  route("POST", "/sentence-notes/:noteId/relocate", async (req, res, { params, body }) => {
    await withError(res, async () => {
      const note = store.relocateSentenceNote(params.noteId, { annotationId: (body || {}).annotationId });
      return sendJson(res, 200, { note });
    });
  });

  route("GET", "/note-categories", async (req, res) => {
    await withError(res, async () => {
      return sendJson(res, 200, { categories: store.listNoteCategories() });
    });
  });

  route("POST", "/note-categories", async (req, res, { body }) => {
    await withError(res, async () => {
      const category = store.createNoteCategory(body || {});
      return sendJson(res, 201, { category });
    });
  });

  route("PATCH", "/note-categories/:categoryId", async (req, res, { params, body }) => {
    await withError(res, async () => {
      const category = store.updateNoteCategory(params.categoryId, body || {});
      return sendJson(res, 200, { category });
    });
  });

  route("DELETE", "/note-categories/:categoryId", async (req, res, { params }) => {
    await withError(res, async () => {
      return sendJson(res, 200, store.deleteNoteCategory(params.categoryId));
    });
  });

  // 标签颜色（同一套标签体系，仅持久化颜色元数据）
  route("PUT", "/notes/tags/color", async (req, res, { body }) => {
    await withError(res, async () => {
      const result = store.saveTagColor((body || {}).tag, (body || {}).color);
      return sendJson(res, 200, result);
    });
  });

  // 旧自研批注 → EmbedPDF 批注换算（纯计算不落库；pageSizes 由前端从引擎读取后传入）
  route("POST", "/attachments/:attachmentId/annotations/convert-legacy", async (req, res, { params, body }) => {
    await withError(res, async () => {
      const pageSizes = (body || {}).pageSizes || {};
      const legacy = store.listAnnotationsV2(params.attachmentId)
        .filter(item => !item.embedPdf && item.payload && Array.isArray(item.payload.rects) && item.payload.rects.length);
      const items = [];
      const failed = [];
      for (const item of legacy) {
        const size = pageSizes[item.pageNumber];
        if (!size?.width || !size?.height) {
          failed.push({ id: item.id, pageNumber: item.pageNumber, reason: "MISSING_PAGE_SIZE" });
          continue;
        }
        try {
          const annotation = legacyAnnotationToEmbedPdf(item, size.width, size.height);
          annotation.id = item.id;
          items.push({ pageIndex: item.pageNumber - 1, annotation });
        } catch (error) {
          failed.push({ id: item.id, pageNumber: item.pageNumber, reason: String(error?.message || error) });
        }
      }
      return sendJson(res, 200, { items, failed, legacyCount: legacy.length, converted: items.length });
    });
  });

  // AI 解释选中文本（宿主模型）
  route("POST", "/attachments/:attachmentId/annotations/:annotationId/explain", async (req, res, { params, body }) => {
    await withError(res, async () => {
      const selection = ctx.agentDefaultModel?.currentSelection?.();
      if (!selection?.provider || !selection?.model) {
        throw new HostLlmError("LLM_NO_MODEL", "宿主未配置可用模型，请在 DSH 设置中配置模型后重试", 503);
      }
      const attachment = store.getAttachment(params.attachmentId);
      if (!attachment) throw new ResearchStoreError("ATTACHMENT_NOT_FOUND", "PDF 附件不存在", 404);
      const text = String((body || {}).text || "").trim().slice(0, 8000);
      if (!text) throw new ResearchStoreError("TEXT_REQUIRED", "选中文本不能为空", 400);
      const context = String((body || {}).context || "").trim().slice(0, 4000);
      const system = `你是一名心理学学术阅读助理。用户从论文中选中了一段文字，请用中文给出简明解释（150 字以内）：先一句话概括这段文字的含义，再点出它在论文论证中的作用或值得注意的方法/术语。不要输出标题，直接分段。`;
      const user = `论文：${attachment.fileName}\n${context ? `上下文：${context}\n` : ""}\n选中文字：\n${text}`;
      const answer = await completeWithHostLlm({ llm: ctx.get("llm"), selection, system, user, temperature: 0.3, timeoutMs: 60000 });
      return sendJson(res, 200, { text: answer });
    });
  });

  // 批注全量快照（JSON 导出，供前端调试/备份；带批注 PDF 由前端 EmbedPDF 引擎导出）
  route("GET", "/attachments/:attachmentId/annotations-export", async (req, res, { params }) => {
    await withError(res, async () => {
      const annotations = store.listAnnotationsV2(params.attachmentId)
        .filter(item => item.embedPdf)
        .map(item => ({ pageIndex: item.pageNumber - 1, annotation: item.embedPdf.annotation }));
      return sendJson(res, 200, { items: annotations, serialized: serializeAnnotations(annotations) });
    });
  });

  return {
    handle: async (req, res, url) => {
      const pathname = url.pathname.replace(/^\/api\/hana-research/, "") || "/";
      for (const entry of routes) {
        if (entry.method !== req.method) continue;
        let params;
        try {
          params = matchPath(entry.pattern, pathname);
        } catch {
          // 非法百分号编码等路径解析异常：显式 400，避免请求悬挂
          return sendJson(res, 400, { error: "BAD_REQUEST", message: "路径包含非法字符" });
        }
        if (!params) continue;
        let body = null;
        let rawBody = null;
        if (req.method === "POST" || req.method === "PATCH" || req.method === "PUT") {
          try {
            rawBody = await readRawBody(req);
          } catch (error) {
            if (error instanceof ResearchStoreError) {
              return sendJson(res, error.status || 400, { error: error.code, message: error.message });
            }
            return sendJson(res, 400, { error: "BODY_READ_FAILED", message: "请求体读取失败" });
          }
          if (!entry.raw && rawBody) {
            try {
              body = JSON.parse(rawBody.toString("utf8"));
            } catch {
              body = null;
            }
          }
        }
        try {
          return await entry.handler(req, res, {
            params,
            query: url.searchParams,
            body,
            rawBody,
            contentType: req.headers["content-type"] || "",
          });
        } catch (error) {
          // 处理器抛出且响应未开始：兜底 500；已开始时只能记录并终止
          ctx.logger.error("hana-research api handler error: %s", error?.stack || error);
          if (!res.headersSent) return sendJson(res, 500, { error: "INTERNAL_ERROR", message: "内部错误" });
          res.end();
          return undefined;
        }
      }
      return sendJson(res, 404, { error: "NOT_FOUND", message: "接口不存在" });
    },
    journalSync,
  };
}

/**
 * 后台执行全文翻译：立即返回，失败状态写回 translation_docs。
 * 段级缓存保证失败重试不重复消耗模型额度。
 * v43：串行队列（1 并发）保护宿主模型额度；同文档去重；异常写失败状态并记日志（原实现静默吞掉）。
 */
const translationQueue = [];
const translationQueuedDocs = new Set();
const TRANSLATION_MAX_CONCURRENT = 1;
let translationRunning = 0;

function startTranslationTask(ctx, store, docId, attachmentId, config, selection) {
  if (translationQueuedDocs.has(docId)) return;
  translationQueuedDocs.add(docId);
  translationQueue.push({ docId, attachmentId, config, selection });
  pumpTranslationQueue(ctx, store);
}

function pumpTranslationQueue(ctx, store) {
  while (translationRunning < TRANSLATION_MAX_CONCURRENT && translationQueue.length) {
    const task = translationQueue.shift();
    translationRunning += 1;
    runTranslationTask(ctx, store, task).finally(() => {
      translationQueuedDocs.delete(task.docId);
      translationRunning -= 1;
      pumpTranslationQueue(ctx, store);
    });
  }
}

async function runTranslationTask(ctx, store, { docId, attachmentId, config, selection }) {
  try {
    const attachment = store.getAttachment(attachmentId);
    if (!attachment || !fs.existsSync(attachment.absolutePath)) {
      store.updateTranslationDoc(docId, { status: "failed", error: "PDF 附件不存在" });
      return;
    }
    const pdfjs = await import(pathToFileURL(PDFJS_PATH).href);
    const pdfData = new Uint8Array(fs.readFileSync(attachment.absolutePath));
    await translateDocument({
      store,
      llm: ctx.get("llm"),
      selection,
      pdfjs,
      pdfData,
      docId,
      config,
      sourceLang: config.sourceLang,
      targetLang: config.targetLang,
    });
  } catch (error) {
    ctx.logger?.error?.("hana-research translation task %s failed: %s", docId, error?.stack || error);
    try {
      store.updateTranslationDoc(docId, { status: "failed", error: String(error?.message || error).slice(0, 300) });
    } catch { /* 状态写失败不中断队列 */ }
  }
}

// ── AI 预筛后台任务（schema v20）：串行队列保护宿主模型额度；断点续跑幂等（跟随翻译队列模式） ──
const aiScreeningQueue = [];
const aiScreeningQueuedRuns = new Set();
const AI_SCREENING_MAX_CONCURRENT = 1;
let aiScreeningRunning = 0;

function startAiScreeningTask(ctx, store, { projectId, runId }, selection) {
  if (aiScreeningQueuedRuns.has(runId)) return;
  aiScreeningQueuedRuns.add(runId);
  aiScreeningQueue.push({ projectId, runId, selection });
  pumpAiScreeningQueue(ctx, store);
}

function pumpAiScreeningQueue(ctx, store) {
  while (aiScreeningRunning < AI_SCREENING_MAX_CONCURRENT && aiScreeningQueue.length) {
    const task = aiScreeningQueue.shift();
    aiScreeningRunning += 1;
    runAiScreeningTask(ctx, store, task).finally(() => {
      aiScreeningQueuedRuns.delete(task.runId);
      aiScreeningRunning -= 1;
      pumpAiScreeningQueue(ctx, store);
    });
  }
}

async function runAiScreeningTask(ctx, store, { projectId, runId, selection }) {
  try {
    const run = store.getAiScreeningRun(projectId, runId);
    if (run.status === "cancelled" || run.status === "done") return;
    if (run.status === "paused") return; // 用户已暂停：保持 paused，等待 resume 重新入队
    store.updateAiScreeningRunStatus({ projectId, runId, status: "running" });
    const llm = ctx.get("llm");
    const criteria = store.listScreeningCriteria(projectId).filter(item => item.enabled);
    const papers = new Map(store.listProjectPapers(projectId).map(paper => [paper.id, paper]));
    // 断点续跑：跳过本 run 已写入结果的文献（appendAiScreeningResult 的 UNIQUE 幂等再兜一层）
    const processed = new Set(store.listAiScreenings(projectId, { runId }).map(item => item.paperId));
    for (const paperId of run.targetPaperIds) {
      if (processed.has(paperId)) continue;
      // 每篇开始前核对状态：用户暂停/取消时立即停止，且不覆盖用户设置的状态
      const current = store.getAiScreeningRun(projectId, runId);
      if (current.status !== "running") return;
      const paper = papers.get(paperId);
      if (!paper) continue;
      // P0-1 全文索引就绪前仅发送题录与摘要（sentScope: metadata）
      const result = await aiScreenPaper({ llm, selection, criteria, paper, stage: run.stage });
      try {
        store.appendAiScreeningResult({
          runId,
          paperId,
          decision: result.decision,
          confidence: result.confidence,
          rationale: result.rationale,
          perCriteria: result.perCriteria,
          sentScope: "metadata",
        });
      } catch (error) {
        // 模型返回期间用户暂停/取消：丢弃本次结果并保持用户设置的状态
        if (error?.code === "AI_SCREENING_RUN_NOT_RUNNING") return;
        throw error;
      }
    }
    const finalRun = store.getAiScreeningRun(projectId, runId);
    if (finalRun.status === "running") store.updateAiScreeningRunStatus({ projectId, runId, status: "done" });
  } catch (error) {
    ctx.logger?.error?.("hana-research ai screening run %s failed: %s", runId, error?.stack || error);
    try {
      store.updateAiScreeningRunStatus({
        projectId,
        runId,
        status: "failed",
        error: error instanceof AiScreeningError ? `${error.code}: ${error.message}` : String(error?.message || error).slice(0, 300),
      });
    } catch { /* 状态写失败不中断队列 */ }
  }
}

export { JOURNAL_SYNC_INTERVAL_MS };
