import { getStore, textResult, runTool } from './_shared.js';

export const name = 'get_ai_screening';
export const description = '查看项目 AI 预筛（第三评审）的任务运行与建议：运行进度、按置信度分层的 include/exclude/uncertain 建议（含理由与逐条标准命中），以及与人工筛选结论的一致率统计。AI 建议只作参考，不会改动人工筛选与 PRISMA 统计。只读操作。';
export const promptGuidelines = '当用户询问 AI 预筛进展或建议、想在人工筛选前先了解机器意见、或要核对 AI 与人工判断的差异时调用本工具。汇报时必须说明这是 AI 建议而非筛选结论。';
export const sessionPermission = { readOnly: true };
export const parameters = {
  type: 'object',
  properties: {
    projectId: { type: 'string', description: '项目 ID' },
    include: { type: 'string', enum: ['runs', 'results', 'agreement'], description: '查看内容：runs=任务列表（默认），results=建议明细，agreement=与人工筛选的一致率' },
    stage: { type: 'string', enum: ['title_abstract', 'full_text'], description: '筛选阶段（results / agreement 可选，默认不限）' },
    runId: { type: 'string', description: '运行任务 ID（results / agreement 可选，缺省取全部或最新）' },
    tier: { type: 'string', enum: ['1', '2', '3'], description: '置信分层：1=高置信，2=低置信，3=建议转人工（results 可选）' },
  },
  required: ['projectId'],
};

function formatRun(run) {
  return `- ${run.id}｜阶段 ${run.stage === 'full_text' ? '全文' : '题录/摘要'}｜${run.status}｜进度 ${run.processed}/${run.total}（纳入 ${run.included} · 排除 ${run.excluded} · 不确定 ${run.uncertain}）${run.error ? `｜错误：${run.error}` : ''}［runId: ${run.id}］`;
}

export function execute(input, ctx) {
  return runTool('查看 AI 预筛', () => {
    const store = getStore(ctx);
    const projectId = String(input?.projectId || '').trim();
    const project = store.getProject(projectId);
    if (!project) return textResult(`错误（PROJECT_NOT_FOUND）：项目 ${projectId} 不存在。`, { error: 'PROJECT_NOT_FOUND' });
    const include = ['runs', 'results', 'agreement'].includes(input?.include) ? input.include : 'runs';
    const stage = ['title_abstract', 'full_text'].includes(input?.stage) ? input.stage : null;
    const runId = String(input?.runId || '').trim() || null;

    if (include === 'runs') {
      const runs = store.listAiScreeningRuns(projectId);
      if (!runs.length) {
        return textResult(`项目「${project.title}」还没有 AI 预筛任务。可在项目的筛选页签开启 AI 预筛。`, { project: { id: project.id, title: project.title }, runs: [] });
      }
      return textResult(`项目「${project.title}」AI 预筛任务：\n${runs.map(formatRun).join('\n')}\n\nAI 建议仅为第三评审参考，人工双筛与 PRISMA 统计不受影响。`, {
        project: { id: project.id, title: project.title },
        runs,
      });
    }

    if (include === 'results') {
      const tier = ['1', '2', '3'].includes(String(input?.tier || '')) ? Number(input.tier) : null;
      const results = store.listAiScreenings(projectId, { runId, stage, tier });
      if (!results.length) {
        return textResult(`项目「${project.title}」没有匹配的 AI 预筛建议。`, { project: { id: project.id, title: project.title }, results: [] });
      }
      const tierText = { 1: '高置信', 2: '低置信', 3: '转人工' };
      const shown = results.slice(0, 30);
      const lines = shown.map(item => `- [${tierText[item.tier]}] ${item.decision === 'include' ? '建议纳入' : item.decision === 'exclude' ? '建议排除' : '不确定'}（置信 ${item.confidence}）${item.title || item.paperId}：${item.rationale || '（无理由）'}［paperId: ${item.paperId}］`);
      const overflow = results.length - shown.length;
      return textResult(`项目「${project.title}」AI 预筛建议${overflow > 0 ? `（共 ${results.length} 条，显示前 ${shown.length} 条）` : ''}：\n${lines.join('\n')}\n\n引用建议时请注明这是 AI 预筛意见；正式结论以人工筛选为准。`, {
        project: { id: project.id, title: project.title },
        total: results.length,
        results: shown,
      });
    }

    const agreement = store.buildAiScreeningAgreement(projectId, { stage: stage || 'title_abstract', runId });
    if (!agreement.available) {
      return textResult(`项目「${project.title}」${stage === 'full_text' ? '全文' : '题录/摘要'}阶段还没有 AI 预筛任务，无法计算一致率。`, { project: { id: project.id, title: project.title }, agreement });
    }
    const percent = value => (value === null ? '—' : `${value}%`);
    return textResult(`项目「${project.title}」AI 预筛与人工筛选一致率（${agreement.stage === 'full_text' ? '全文' : '题录/摘要'}，样本 ${agreement.sampleSize} 篇）：\n- 一致率 ${percent(agreement.agreementRate)}｜敏感度 ${percent(agreement.sensitivity)}｜特异度 ${percent(agreement.specificity)}\n- 判断分布：双方纳入 ${agreement.counts.tp}｜AI 纳入人工未纳 ${agreement.counts.fp}｜AI 排除人工纳入 ${agreement.counts.fn}｜双方排除 ${agreement.counts.tn}\n- 需人工复核的差异 ${agreement.overrides} 处${agreement.criteriaChanged ? '｜注意：纳排标准在运行后已修改，结果基于旧标准' : ''}\n\n该统计仅描述 AI 与人工的吻合程度，不替代人工筛选。`, {
      project: { id: project.id, title: project.title },
      agreement,
    });
  });
}
