import { ResearchStoreError } from './store.js';

function safeName(value) {
  return String(value || '研究项目').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/g, '').slice(0, 80) || '研究项目';
}

function csvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function xml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function overviewData(store, projectId) {
  const project = store.getProject(projectId);
  if (!project) throw new ResearchStoreError('PROJECT_NOT_FOUND', '项目不存在', 404);
  return { project, prisma: store.buildPrismaOverview(projectId) };
}

export function buildPrismaCsv(store, projectId) {
  const { project, prisma } = overviewData(store, projectId);
  const rows = [
    ['PRISMA 2020 流程台账', project.title],
    ['生成时间', prisma.generatedAt],
    [],
    ['阶段', '指标', '数量', '说明'],
    ['识别', '数据库与注册平台记录', prisma.identification.databaseRecords, '来自已登记批次'],
    ['识别', '其他来源记录', prisma.identification.otherRecords, '来自已登记批次'],
    ['识别', '去重移除', prisma.identification.duplicatesRemoved, '人工登记，不由当前项目反推'],
    ['识别', '其他原因移除', prisma.identification.removedOther, '进入题录筛选前'],
    ['题录筛选', '项目记录', prisma.screening.projectRecords, '当前项目实际唯一文献'],
    ['题录筛选', '已筛选', prisma.screening.screened, '题录/摘要结论非待筛选'],
    ['题录筛选', '排除', prisma.screening.excluded, '题录/摘要排除'],
    ['全文获取', '寻求获取', prisma.retrieval.sought, '已进入全文获取流程'],
    ['全文获取', '未获取', prisma.retrieval.notRetrieved, '明确记录无法获取'],
    ['全文评估', '已评估', prisma.eligibility.assessed, '全文结论非待筛选'],
    ['全文评估', '排除', prisma.eligibility.excluded, '全文排除'],
    ['纳入', '最终纳入研究', prisma.included.studies, '全文筛选纳入'],
    [],
    ['全文排除理由', '数量'],
    ...prisma.eligibility.exclusionReasons.map(item => [item.reason, item.count]),
    [],
    ['检索批次', '来源类型', '来源名称', '检索日期', '检索式', '发现', '去重', '其他移除', '导入项目', '备注'],
    ...prisma.batches.map(batch => [batch.id, batch.sourceType, batch.sourceName, batch.searchedAt || '', batch.query, batch.recordsFound, batch.duplicatesRemoved, batch.removedOther, batch.recordsImported, batch.notes]),
    [],
    ['口径提醒'],
    ...prisma.warnings.map(warning => [warning]),
  ];
  return Buffer.from(`\uFEFF${rows.map(row => row.map(csvCell).join(',')).join('\r\n')}`, 'utf8');
}

export function buildPrismaJson(store, projectId) {
  const { project, prisma } = overviewData(store, projectId);
  return Buffer.from(JSON.stringify({ standard: 'PRISMA 2020', project, prisma }, null, 2), 'utf8');
}

function flowBox({ x, y, width = 480, height = 92, kicker, title, detail = '', tone = 'neutral' }) {
  const colors = {
    neutral: ['#fffdf8', '#d8d0c4', '#2f312f'],
    accent: ['#f7eee7', '#b26042', '#6f3623'],
    danger: ['#fbefed', '#b25b50', '#7c312a'],
    ok: ['#eef5ef', '#5f8066', '#315b3b'],
  }[tone] || ['#fffdf8', '#d8d0c4', '#2f312f'];
  return `<g transform="translate(${x} ${y})"><rect width="${width}" height="${height}" rx="14" fill="${colors[0]}" stroke="${colors[1]}" stroke-width="1.5"/><text x="22" y="25" font-size="12" font-weight="700" letter-spacing="1.5" fill="${colors[2]}">${xml(kicker)}</text><text x="22" y="53" font-size="21" font-weight="700" fill="#252824">${xml(title)}</text>${detail ? `<text x="22" y="76" font-size="13" fill="#6f716c">${xml(detail)}</text>` : ''}</g>`;
}

export function buildPrismaSvg(store, projectId) {
  const { project, prisma: p } = overviewData(store, projectId);
  const reasonText = p.eligibility.exclusionReasons.length
    ? p.eligibility.exclusionReasons.slice(0, 3).map(item => `${item.reason}（${item.count}）`).join('；')
    : '尚无全文排除理由';
  const warning = p.warnings[0] || '批次登记与项目文献数量已对齐';
  const boxes = [
    flowBox({ x: 70, y: 180, width: 490, kicker: 'DATABASES / REGISTERS', title: `识别记录 ${p.identification.databaseRecords}`, detail: `${p.batches.filter(item => item.sourceType !== 'other').length} 个来源批次`, tone: 'accent' }),
    flowBox({ x: 640, y: 180, width: 490, kicker: 'OTHER METHODS', title: `其他来源 ${p.identification.otherRecords}`, detail: `${p.batches.filter(item => item.sourceType === 'other').length} 个来源批次`, tone: 'accent' }),
    flowBox({ x: 360, y: 340, kicker: 'REMOVED BEFORE SCREENING', title: `筛选前移除 ${p.identification.duplicatesRemoved + p.identification.removedOther}`, detail: `去重 ${p.identification.duplicatesRemoved} · 其他原因 ${p.identification.removedOther}`, tone: 'danger' }),
    flowBox({ x: 360, y: 500, kicker: 'TITLE / ABSTRACT SCREENING', title: `题录筛选 ${p.screening.screened}`, detail: `待筛 ${p.screening.awaiting} · 排除 ${p.screening.excluded}` }),
    flowBox({ x: 360, y: 660, kicker: 'REPORTS SOUGHT FOR RETRIEVAL', title: `寻求全文 ${p.retrieval.sought}`, detail: `已获取 ${p.retrieval.retrieved} · 未获取 ${p.retrieval.notRetrieved} · 获取中 ${p.retrieval.awaiting}` }),
    flowBox({ x: 360, y: 820, kicker: 'FULL-TEXT ELIGIBILITY', title: `全文评估 ${p.eligibility.assessed}`, detail: `待评估 ${p.eligibility.awaiting} · 排除 ${p.eligibility.excluded} · 待定 ${p.eligibility.maybe}` }),
    flowBox({ x: 360, y: 980, kicker: 'STUDIES INCLUDED', title: `最终纳入 ${p.included.studies}`, detail: '以全文筛选最终结论为准', tone: 'ok' }),
  ].join('');
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1240" viewBox="0 0 1200 1240" role="img" aria-labelledby="title desc">
  <title id="title">${xml(project.title)} PRISMA 2020 流程图</title>
  <desc id="desc">由 HanaResearch 根据检索批次、筛选结论和全文获取记录生成。</desc>
  <rect width="1200" height="1240" fill="#f5f1e9"/>
  <text x="70" y="72" font-family="Georgia, 'Noto Serif CJK SC', serif" font-size="34" font-weight="700" fill="#252824">${xml(project.title)}</text>
  <text x="70" y="108" font-family="'Noto Sans CJK SC', sans-serif" font-size="15" fill="#6f716c">PRISMA 2020 · 文献识别与筛选流程</text>
  <g fill="none" stroke="#9d897a" stroke-width="2"><path d="M315 272v40h285v28"/><path d="M885 272v40H600v28"/><path d="M600 432v68M600 592v68M600 752v68M600 912v68"/></g>
  <g font-family="'Noto Sans CJK SC', 'Microsoft YaHei', sans-serif">${boxes}</g>
  <g transform="translate(70 1115)" font-family="'Noto Sans CJK SC', sans-serif"><text font-size="12" font-weight="700" fill="#7c312a">口径提醒</text><text y="25" font-size="13" fill="#6f716c">${xml(warning.slice(0, 105))}</text><text y="55" font-size="12" fill="#6f716c">全文排除：${xml(reasonText.slice(0, 120))}</text><text y="86" font-size="11" fill="#92958f">生成于 ${xml(p.generatedAt)} · HanaResearch</text></g>
</svg>`, 'utf8');
}

export function buildPrismaExport(store, projectId, format = 'svg') {
  const normalized = String(format || 'svg').toLowerCase();
  const project = store.getProject(projectId);
  if (!project) throw new ResearchStoreError('PROJECT_NOT_FOUND', '项目不存在', 404);
  const base = `${safeName(project.title)}-PRISMA-2020`;
  if (normalized === 'svg') return { body: buildPrismaSvg(store, projectId), mime: 'image/svg+xml; charset=utf-8', fileName: `${base}.svg` };
  if (normalized === 'csv') return { body: buildPrismaCsv(store, projectId), mime: 'text/csv; charset=utf-8', fileName: `${base}-台账.csv` };
  if (normalized === 'json') return { body: buildPrismaJson(store, projectId), mime: 'application/json; charset=utf-8', fileName: `${base}.json` };
  throw new ResearchStoreError('PRISMA_EXPORT_FORMAT_INVALID', 'PRISMA 导出仅支持 SVG、CSV 或 JSON', 400);
}
