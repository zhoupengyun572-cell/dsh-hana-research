/**
 * HanaResearch AI 全网检索增强（DSH 移植版）。
 *
 * 「检索直接调用 AI 全网资源」：
 * - 多源检索（OpenAlex / Crossref / arXiv / PubMed）由 literature-search 完成；
 * - 本模块用宿主配置的模型（agentDefaultModel 选中项 → ctx.llm.stream）对多源
 *   结果做智能去重、相关性排序与中文推荐解读；
 * - 宿主未配置模型或 AI 调用失败时，检索本身不受影响（纯多源列表兜底）。
 */

const AI_SEARCH_TIMEOUT_MS = 90_000;
const MAX_CANDIDATES = 30;

import { completeWithHostLlm } from './host-llm.js';

export class AiSearchError extends Error {
  constructor(code, message, status = 400, details = {}) {
    super(message);
    this.name = 'AiSearchError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function buildSystemPrompt() {
  return `你是一名资深学术研究助理。用户会在全网学术数据库（OpenAlex、Crossref、arXiv、PubMed）中检索一个主题，并把去重后的候选文献列表交给你。

请完成三件事：
1. 用中文写一段 80–150 字的检索主题综述（summarize 当前主题下这些文献的总体研究脉络）；
2. 按与检索主题的相关性、影响力与新颖度，把候选文献排序，选出最值得读的 3–6 篇（recommendations），每篇给出 1 句中文推荐理由；
3. 只输出 JSON，不要输出任何其他文字。

JSON 格式严格如下：
{
  "summary": "中文综述",
  "recommendations": [
    { "index": 0, "reason": "中文推荐理由" }
  ]
}
其中 index 必须取自已提供列表中的序号（0 起）。`;
}

function buildUserPrompt(query, results) {
  const lines = results.map((record, index) => {
    const authors = record.authors ? `；作者：${record.authors}` : '';
    const abstract = record.abstract ? `；摘要：${record.abstract.slice(0, 300)}` : '';
    const venue = record.venue ? `；期刊/来源：${record.venue}` : '';
    return `[${index}] 标题：${record.title}（${record.sourceName}，${record.year || '年份未知'}${venue}）${authors}${abstract}`;
  });
  return `检索主题：${query}\n\n候选文献：\n${lines.join('\n')}`;
}

/** 从 AI 文本中提取 JSON（裸 JSON / 围栏代码块 / 首尾花括号片段）。 */
export function extractJsonFromAi(text) {
  const trimmed = String(text || '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) {
      try {
        return JSON.parse(fenced[1].trim());
      } catch {
        /* 继续尝试裸 JSON 片段 */
      }
    }
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        /* 放弃解析 */
      }
    }
  }
  return null;
}

/** 校验并规范化 AI 推荐：丢弃非法/越界/重复 index，空理由补默认文案。 */
export function normalizeAiRecommendations(payload, total) {
  const recommendations = Array.isArray(payload?.recommendations) ? payload.recommendations : [];
  const seen = new Set();
  const normalized = [];
  for (const item of recommendations) {
    if (!item || typeof item !== 'object') continue;
    const index = Number(item.index);
    if (!Number.isInteger(index) || index < 0 || index >= total) continue;
    if (seen.has(index)) continue;
    seen.add(index);
    normalized.push({
      index,
      reason: String(item.reason || '').trim().slice(0, 200) || '值得优先阅读',
    });
  }
  return normalized;
}

/**
 * 用 AI 对多源检索结果做去重排序与中文推荐。
 *
 * @param {{ llm: object, selection: {provider:string, model:string}, query: string, results: object[] }} opts
 * @returns {Promise<{ summary: string, recommendations: {index:number, reason:string}[] }>}
 */
export async function aiSummarizeSearch({ llm, selection, query, results }) {
  const candidates = Array.isArray(results) ? results.slice(0, MAX_CANDIDATES) : [];
  if (!candidates.length) {
    throw new AiSearchError('AI_SEARCH_NO_RESULTS', '没有可交给 AI 分析的检索结果', 400);
  }
  let content;
  try {
    content = await completeWithHostLlm({
      llm,
      selection,
      system: buildSystemPrompt(),
      user: buildUserPrompt(String(query || ''), candidates),
      timeoutMs: AI_SEARCH_TIMEOUT_MS,
    });
  } catch (error) {
    if (error instanceof AiSearchError) throw error;
    throw new AiSearchError(
      error?.code === 'LLM_NO_MODEL' ? 'AI_SEARCH_NO_MODEL' : 'AI_SEARCH_UNREACHABLE',
      error?.message || 'AI 服务不可用',
      error?.status || 502,
    );
  }
  const payload = extractJsonFromAi(content);
  if (!payload) {
    throw new AiSearchError('AI_SEARCH_BAD_JSON', 'AI 返回的内容不是有效 JSON', 502);
  }
  return {
    summary: String(payload.summary || '').trim().slice(0, 2000),
    recommendations: normalizeAiRecommendations(payload, candidates.length),
  };
}
