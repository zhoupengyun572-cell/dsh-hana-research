/**
 * HanaResearch AI 预筛（第三评审）。
 *
 * 对项目筛选阶段（题录 / 全文）给出 include / exclude / uncertain 建议与置信度，
 * 结果只落 paper_ai_screenings（schema v20），不写 paper_screening_reviews 与
 * project_papers 的人工字段——双独立筛选与 PRISMA 口径完全不受影响。
 *
 * 原则：
 * - 模型只依据所给题录 / 摘要 / 全文段落判断，禁止用外部知识补判；
 * - temperature 0 + prompt_version 落库，结果可复现、可审计；
 * - 宿主只提供一个模型，无法做多 LLM 集成投票，用「置信度分层 + 人工复核」替代
 *   （分层路由见 docs/OPTIMIZATION_PLAN.md §6.3）。
 */

import { completeWithHostLlm } from './host-llm.js';
import { extractJsonFromAi } from './ai-search.js';

export const AI_SCREENING_PROMPT_VERSION = 'ais-v1';
const AI_SCREENING_TIMEOUT_MS = 90_000;
const ABSTRACT_LIMIT = 800;
const EXCERPT_LIMIT = 1200;
const MAX_EXCERPTS = 4;

export class AiScreeningError extends Error {
  constructor(code, message, status = 400, details = {}) {
    super(message);
    this.name = 'AiScreeningError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/**
 * 系统提示：第三评审角色 + 逐条标准判定 + 强制 JSON 契约。
 * criteria 为 store 里已启用的纳排标准（{ kind, label, description, position }）。
 */
export function buildScreeningSystemPrompt({ criteria, stage }) {
  const stageText = stage === 'full_text' ? '全文筛选阶段' : '题录/摘要筛选阶段';
  const lines = (Array.isArray(criteria) ? criteria : [])
    .map(item => `- [${item.kind === 'include' ? '纳入' : '排除'}] ${item.label}${item.description ? `：${item.description}` : ''}`);
  return `你是一名系统综述筛选助理，充当「第三评审」。现在处于${stageText}。

评审必须只依据用户提供的题录信息${stage === 'full_text' ? '与全文段落' : ''}判断，禁止使用外部知识或推测补全；材料不足以下结论时必须给 uncertain，不要猜。

纳排标准（逐条判定是否命中）：
${lines.join('\n') || '（未提供具体标准，按常规实证研究标准判断）'}

判定规则：
1. 任一排除标准明确命中 → exclude，并在 evidence 中引用命中原文；
2. 纳入标准全部满足且无排除标准命中 → include；
3. 信息不足、部分满足或存在明显歧义 → uncertain；
4. confidence 为 0–1 的数值，表示该结论的把握；拿不准时宁可降低置信度或给 uncertain；
5. rationale 用中文，不超过 200 字，说明关键依据。

只输出 JSON，格式严格如下：
{
  "decision": "include" | "exclude" | "uncertain",
  "confidence": 0.85,
  "rationale": "中文理由",
  "criteria": [
    { "label": "标准名称", "hit": true, "evidence": "命中所给材料中的原文片段" }
  ]
}`;
}

/**
 * 用户提示：单篇文献题录（+ 全文段落，带页码）。
 * paper 为 listProjectPapers 视图（title/authors/venue/year/abstract/doi）。
 * excerpts 为 [{ page, text }]，来自全文索引（P0-1），缺失时按题录判断。
 */
export function buildScreeningUserPrompt({ paper, stage, excerpts = [] }) {
  const meta = [
    `标题：${paper?.title || '（无标题）'}`,
    paper?.authors ? `作者：${String(paper.authors).slice(0, 200)}` : '',
    paper?.venue ? `期刊/来源：${paper.venue}` : '',
    paper?.year ? `年份：${paper.year}` : '',
    paper?.doi ? `DOI：${paper.doi}` : '',
  ].filter(Boolean).join('\n');
  const abstract = paper?.abstract ? `\n摘要：${String(paper.abstract).slice(0, ABSTRACT_LIMIT)}` : '';
  let section = '';
  if (stage === 'full_text' && Array.isArray(excerpts) && excerpts.length) {
    const parts = excerpts.slice(0, MAX_EXCERPTS)
      .map(item => `（第 ${item.page || '?'} 页）${String(item.text || '').slice(0, EXCERPT_LIMIT)}`);
    if (parts.length) section = `\n\n相关全文段落：\n${parts.join('\n---\n')}`;
  }
  return `待筛文献：\n${meta}${abstract}${section}\n\n请按系统提示的标准与 JSON 契约给出判定。`;
}

/**
 * 规范化模型输出：非法 decision 归为 uncertain，confidence 收敛到 [0,1]，
 * perCriteria 与标准清单对齐（未知项保留模型给的 label）。
 * 返回 { decision, confidence, rationale, perCriteria, parseError }。
 */
export function normalizeScreeningPayload(payload, criteria) {
  const definitions = Array.isArray(criteria) ? criteria : [];
  const findDefinition = label => definitions.find(item => item.label === label);
  const rawDecision = String(payload?.decision || '').trim().toLowerCase();
  const decision = ['include', 'exclude', 'uncertain'].includes(rawDecision) ? rawDecision : 'uncertain';
  let confidence = Number(payload?.confidence);
  if (!Number.isFinite(confidence)) confidence = 0;
  confidence = Math.min(1, Math.max(0, confidence));
  const rationale = String(payload?.rationale || '').trim().slice(0, 2000);
  const perCriteria = (Array.isArray(payload?.criteria) ? payload.criteria : [])
    .slice(0, 30)
    .map(item => {
      const label = String(item?.label || '').trim().slice(0, 100);
      const definition = findDefinition(label);
      return {
        id: definition?.id || '',
        label: definition?.label || label,
        hit: item?.hit === true,
        evidence: String(item?.evidence || '').trim().slice(0, 500),
      };
    });
  return { decision, confidence, rationale, perCriteria, parseError: false };
}

/**
 * 预筛单篇文献。
 * 模型输出不是有效 JSON 时按容错处理（uncertain + parseError），不抛异常，
 * 保证批量任务的连续性；模型不可用 / 无模型时抛 AiScreeningError（由调用方标记 run 失败）。
 */
export async function aiScreenPaper({ llm, selection, criteria, paper, stage = 'title_abstract', excerpts = [] }) {
  if (!['title_abstract', 'full_text'].includes(stage)) {
    throw new AiScreeningError('SCREENING_STAGE_INVALID', '筛选阶段无效', 400);
  }
  let content;
  try {
    content = await completeWithHostLlm({
      llm,
      selection,
      system: buildScreeningSystemPrompt({ criteria, stage }),
      user: buildScreeningUserPrompt({ paper, stage, excerpts }),
      temperature: 0,
      timeoutMs: AI_SCREENING_TIMEOUT_MS,
    });
  } catch (error) {
    if (error instanceof AiScreeningError) throw error;
    throw new AiScreeningError(
      error?.code === 'LLM_NO_MODEL' ? 'AI_SCREENING_NO_MODEL' : 'AI_SCREENING_UNREACHABLE',
      error?.message || 'AI 服务不可用',
      error?.status || 502,
    );
  }
  const payload = extractJsonFromAi(content);
  if (!payload) {
    return {
      decision: 'uncertain',
      confidence: 0,
      rationale: '',
      perCriteria: [],
      parseError: true,
    };
  }
  return normalizeScreeningPayload(payload, criteria);
}
