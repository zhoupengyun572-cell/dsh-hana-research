import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  annotationRowToView,
  transferItemsToRows,
} from './annotation-migrate.js';

const stores = new Map();

/**
 * node:sqlite 无内置 transaction；以 BEGIN/COMMIT/ROLLBACK 实现兼容层。
 * 与 better-sqlite3 的 db.transaction(fn) 语义一致（fn 为同步函数）。
 * 导出以便测试直接验证回滚语义。
 */
export function withTransaction(db, fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // 回滚失败不覆盖原始错误
    }
    throw error;
  }
}

export const RESEARCH_SCHEMA_VERSION = 19;

export const RISK_OF_BIAS_TEMPLATES = [
  {
    id: 'rob2-2019', label: 'RoB 2（2019）', family: 'rob2', status: 'current',
    description: '随机平行对照试验；按具体结局评定。',
    judgments: ['low', 'some_concerns', 'high'],
    domains: [
      ['randomization', '随机化过程'], ['deviations', '偏离预期干预'], ['missing', '缺失结局数据'],
      ['measurement', '结局测量'], ['reporting', '报告结果选择'],
    ],
  },
  {
    id: 'robins-i-2016', label: 'ROBINS-I（2016）', family: 'robins', status: 'current',
    description: '非随机干预研究；使用已定稿的七领域版本。',
    judgments: ['low', 'moderate', 'serious', 'critical', 'no_information'],
    domains: [
      ['confounding', '混杂'], ['selection', '研究对象选择'], ['classification', '干预分类'],
      ['deviations', '偏离预期干预'], ['missing', '缺失数据'], ['measurement', '结局测量'], ['reporting', '报告结果选择'],
    ],
  },
  {
    id: 'robins-i-v2-draft-2025', label: 'ROBINS-I V2（2025 草案）', family: 'robins', status: 'draft',
    description: '官方仍标为草案；版本状态会随项目一并保存。',
    judgments: ['low', 'moderate', 'serious', 'critical', 'no_information'],
    domains: [
      ['confounding', '混杂'], ['classification', '干预分类'], ['selection', '进入研究的选择'],
      ['missing', '缺失数据'], ['measurement', '结局测量'], ['reporting', '报告结果选择'],
    ],
  },
  {
    id: 'psychology-general', label: '心理学通用质量框架', family: 'generic', status: 'local',
    description: '观察性、测量与心理学实证研究的项目内框架；不等同于官方 RoB 工具。',
    judgments: ['low', 'some_concerns', 'high'],
    domains: [
      ['sampling', '抽样与选择'], ['measurement', '测量质量'], ['confounding', '混杂控制'],
      ['missing', '缺失数据'], ['reporting', '选择性报告'],
    ],
  },
].map(template => ({ ...template, domains: template.domains.map(([id, label]) => ({ id, label })) }));

export const GRADE_DOMAINS = [
  { id: 'risk_bias', label: '偏倚风险', direction: 'down' },
  { id: 'inconsistency', label: '不一致性', direction: 'down' },
  { id: 'indirectness', label: '间接性', direction: 'down' },
  { id: 'imprecision', label: '不精确性', direction: 'down' },
  { id: 'publication_bias', label: '发表偏倚', direction: 'down' },
  { id: 'large_effect', label: '大效应', direction: 'up' },
  { id: 'dose_response', label: '剂量反应', direction: 'up' },
  { id: 'residual_confounding', label: '残余混杂反向作用', direction: 'up' },
];

function normalizeDoiForMatch(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//, '')
    .replace(/^doi\s*:\s*/, '')
    .replace(/[\s.,;]+$/g, '');
}

function normalizeTitleForMatch(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleTokens(value) {
  const normalized = normalizeTitleForMatch(value);
  if (!normalized) return [];
  const words = normalized.split(' ').filter(token => token.length > 1);
  if (words.length > 1) return [...new Set(words)];
  return [...new Set([...normalized].filter(char => !/\s/u.test(char)))];
}

function authorTokens(value) {
  return [...new Set(String(value || '').normalize('NFKC').toLowerCase()
    .replace(/\bet\s+al\.?\b/g, ' ')
    .split(/[,;，、&]|\band\b/u)
    .map(part => part.replace(/[.()]/g, ' ').trim().split(/\s+/)[0])
    .filter(token => token && token.length > 1))];
}

function jaccard(left, right) {
  const a = new Set(left);
  const b = new Set(right);
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const item of a) if (b.has(item)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

function duplicatePairKey(leftId, rightId) {
  return [String(leftId), String(rightId)].sort().join('::');
}

export const EVIDENCE_CODING_TEMPLATES = [
  {
    id: 'empirical-general',
    label: '通用实证研究',
    description: '适合横断、纵向、实验与混合方法研究。',
    fields: [
      { label: '研究设计', type: 'select', options: ['横断研究', '纵向研究', '实验研究', '质性研究', '混合方法', '其他'], required: true },
      { label: '样本人群', type: 'text', required: true },
      { label: '样本量', type: 'number', required: false },
      { label: '核心变量', type: 'text', required: true },
      { label: '主要结论', type: 'text', required: true },
    ],
  },
  {
    id: 'systematic-review',
    label: '系统综述 / 元分析',
    description: '适合提取综述研究特征、效应量和偏倚风险。',
    fields: [
      { label: '研究设计', type: 'select', options: ['横断研究', '纵向研究', '实验研究', '质性研究', '混合方法', '其他'], required: true },
      { label: '样本量', type: 'number', required: false },
      { label: '效应量与指标', type: 'text', required: false },
      { label: '偏倚风险', type: 'select', options: ['低风险', '部分担忧', '高风险', '未评估'], required: true },
      { label: '主要结论', type: 'text', required: true },
    ],
  },
  {
    id: 'scale-development',
    label: '量表开发与验证',
    description: '适合记录测量工具、样本、信效度和因子结构。',
    fields: [
      { label: '量表名称', type: 'text', required: true },
      { label: '目标人群', type: 'text', required: true },
      { label: '样本量', type: 'number', required: false },
      { label: '因子结构', type: 'text', required: true },
      { label: '信度证据', type: 'text', required: false },
      { label: '效度证据', type: 'text', required: false },
    ],
  },
];

/** 默认笔记分类（v13 种子；id 稳定生成 cat-<name>，颜色可改）。 */
export const DEFAULT_NOTE_CATEGORIES = [
  ['研究问题', '#d97c6d'],
  ['理论概念', '#8bb8e8'],
  ['研究假设', '#c9a3e8'],
  ['研究方法', '#7cc27f'],
  ['样本', '#e8a08b'],
  ['测量工具', '#8be0e0'],
  ['研究结果', '#f0c94f'],
  ['结论', '#c98be8'],
  ['局限', '#b8b8b8'],
  ['实践启示', '#8be0b8'],
  ['与当前项目相关', '#e88b8b'],
  ['待验证', '#f2b04f'],
  ['其他', '#a8a8a8'],
];

/** 逐句笔记状态白名单（inbox 待整理 / organized 已整理 / verify 待验证）。 */
export const SENTENCE_NOTE_STATUSES = ['inbox', 'organized', 'verify'];

const ANNOTATION_KINDS = new Set(['highlight', 'area']);

const seededProjects = [
  {
    id: 'project-demo-literature-review',
    title: '示例：情绪调节文献综述',
    description: '仅用于测试与开发环境的通用文献综述示例。',
    color: '#9b694d',
  },
  {
    id: 'project-demo-assessment',
    title: '示例：测评工具开发',
    description: '仅用于测试与开发环境的通用测评项目示例。',
    color: '#607966',
  },
];

const seededPapers = [
  {
    id: 'doi-10-3389-fpsyg-2024-1425465',
    doi: '10.3389/fpsyg.2024.1425465',
    topic: '情绪与健康',
    venue: 'Frontiers in Psychology',
    year: 2024,
    title: 'Strategies and goals in Emotion Regulation models: a systematic review',
    abstract: '系统梳理情绪调节模型中的策略与目标，并比较其理论基础与概念边界。',
    authors: 'Martínez-Priego, García-Noblejas & Roca',
    pdfUrl: 'https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2024.1425465/pdf',
    sourceUrl: 'https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2024.1425465/full',
    sourceName: 'Frontiers',
  },
  {
    id: 'doi-10-3389-fpsyg-2024-1400223',
    doi: '10.3389/fpsyg.2024.1400223',
    topic: '情绪与健康',
    venue: 'Frontiers in Psychology',
    year: 2024,
    title: 'Emotion regulation use in daily-life and its association with regulation success, self-efficacy, stress, and rumination',
    abstract: '以日常生活资料检验情绪调节策略使用与调节成功、自我效能、压力和反刍之间的联系。',
    authors: 'Int-Veen et al.',
    pdfUrl: 'https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2024.1400223/pdf',
    sourceUrl: 'https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2024.1400223/full',
    sourceName: 'Frontiers',
  },
  {
    id: 'doi-10-3389-fpsyg-2024-1272643',
    doi: '10.3389/fpsyg.2024.1272643',
    topic: '社会与人格',
    venue: 'Frontiers in Psychology',
    year: 2024,
    title: 'Latent profiles of emotion regulation among university students',
    abstract: '识别大学生情绪调节潜在类型，并考察其与反复消极思维、网络成瘾和主观幸福感的关联。',
    authors: 'Oliveira et al.',
    pdfUrl: 'https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2024.1272643/pdf',
    sourceUrl: 'https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2024.1272643/full',
    sourceName: 'Frontiers',
  },
  {
    id: 'pmc-11449430',
    doi: null,
    topic: '心理测量与统计',
    venue: 'Frontiers in Psychology',
    year: 2024,
    title: 'Coping and emotion regulation: A conceptual and measurement scoping review',
    abstract: '比较应对与情绪调节研究中的概念和测量工具，梳理二者的重叠与差异。',
    authors: '',
    pdfUrl: null,
    sourceUrl: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11449430/',
    sourceName: 'PubMed Central',
  },
  // ── 国外核心期刊（真实经典文献，DOI 可查证） ──
  {
    id: 'doi-10-1037-1089-2680-2-3-271',
    doi: '10.1037/1089-2680.2.3.271',
    topic: '情绪与健康',
    venue: 'Review of General Psychology',
    year: 1998,
    title: 'The emerging field of emotion regulation: An integrative review',
    abstract: '情绪调节领域的奠基性综述：界定情绪调节的概念、过程模型与测量方向。',
    authors: 'Gross, J. J.',
    pdfUrl: null,
    sourceUrl: 'https://doi.org/10.1037/1089-2680.2.3.271',
    sourceName: '内置文献库',
  },
  {
    id: 'doi-10-1037-0022-3514-85-2-348',
    doi: '10.1037/0022-3514.85.2.348',
    topic: '情绪与健康',
    venue: 'Journal of Personality and Social Psychology',
    year: 2003,
    title: 'Individual differences in two emotion regulation processes: Implications for affect, relationships, and well-being',
    abstract: '经典量表研究：区分认知重评与表达抑制两种情绪调节策略的个体差异及其与幸福感的关系。',
    authors: 'Gross, J. J., & John, O. P.',
    pdfUrl: null,
    sourceUrl: 'https://doi.org/10.1037/0022-3514.85.2.348',
    sourceName: '内置文献库',
  },
  {
    id: 'doi-10-1111-j-1745-6924-2008-00088-x',
    doi: '10.1111/j.1745-6924.2008.00088.x',
    topic: '临床与咨询',
    venue: 'Perspectives on Psychological Science',
    year: 2008,
    title: 'Rethinking rumination',
    abstract: '重新审视反刍思维的构念：区分反省性沉思与强迫性反刍及其对抑郁的影响。',
    authors: 'Nolen-Hoeksema, S., Wisco, B. E., & Lyubomirsky, S.',
    pdfUrl: null,
    sourceUrl: 'https://doi.org/10.1111/j.1745-6924.2008.00088.x',
    sourceName: '内置文献库',
  },
  {
    id: 'doi-10-1037-0003-066x-56-3-218',
    doi: '10.1037/0003-066X.56.3.218',
    topic: '情绪与健康',
    venue: 'American Psychologist',
    year: 2001,
    title: 'The role of positive emotions in positive psychology: The broaden-and-build theory of positive emotions',
    abstract: '扩展-建构理论：积极情绪扩展认知与行为资源并建构长期心理资本。',
    authors: 'Fredrickson, B. L.',
    pdfUrl: null,
    sourceUrl: 'https://doi.org/10.1037/0003-066X.56.3.218',
    sourceName: '内置文献库',
  },
  {
    id: 'doi-10-1037-0003-066x-58-9-697',
    doi: '10.1037/0003-066X.58.9.697',
    topic: '动机与决策',
    venue: 'American Psychologist',
    year: 2003,
    title: 'A perspective on judgment and choice: Mapping bounded rationality',
    abstract: '展望理论视角下的判断与决策：双系统与有限理性框架。',
    authors: 'Kahneman, D.',
    pdfUrl: null,
    sourceUrl: 'https://doi.org/10.1037/0003-066X.58.9.697',
    sourceName: '内置文献库',
  },
  {
    id: 'doi-10-1037-0022-3514-74-5-1252',
    doi: '10.1037/0022-3514.74.5.1252',
    topic: '动机与决策',
    venue: 'Journal of Personality and Social Psychology',
    year: 1998,
    title: 'Ego depletion: Is the active self a limited resource?',
    abstract: '自我损耗经典实验：自我控制是一种可耗竭的有限资源。',
    authors: 'Baumeister, R. F., Bratslavsky, E., Muraven, M., & Tice, D. M.',
    pdfUrl: null,
    sourceUrl: 'https://doi.org/10.1037/0022-3514.74.5.1252',
    sourceName: '内置文献库',
  },
  {
    id: 'doi-10-1016-j-cpr-2009-11-004',
    doi: '10.1016/j.cpr.2009.11.004',
    topic: '临床与咨询',
    venue: 'Clinical Psychology Review',
    year: 2010,
    title: 'Emotion-regulation strategies across psychopathology: A meta-analytic review',
    abstract: '元分析：情绪调节策略（重评、接受、回避、反刍等）与各类心理病理症状的关系。',
    authors: 'Aldao, A., Nolen-Hoeksema, S., & Schweizer, S.',
    pdfUrl: null,
    sourceUrl: 'https://doi.org/10.1016/j.cpr.2009.11.004',
    sourceName: '内置文献库',
  },
  {
    id: 'doi-10-1146-annurev-psych-52-1-1',
    doi: '10.1146/annurev.psych.52.1.1',
    topic: '社会与人格',
    venue: 'Annual Review of Psychology',
    year: 2001,
    title: 'Social cognitive theory: An agentic perspective',
    abstract: '社会认知理论的能动性视角：自我效能、目标与自我调节机制。',
    authors: 'Bandura, A.',
    pdfUrl: null,
    sourceUrl: 'https://doi.org/10.1146/annurev.psych.52.1.1',
    sourceName: '内置文献库',
  },
  {
    id: 'doi-10-1111-j-1467-9280-2005-01641-x',
    doi: '10.1111/j.1467-9280.2005.01641.x',
    topic: '动机与决策',
    venue: 'Psychological Science',
    year: 2005,
    title: 'Self-discipline outdoes IQ in predicting academic performance of adolescents',
    abstract: '追踪研究：自律对学业成绩的预测力超过智力测验。',
    authors: 'Duckworth, A. L., & Seligman, M. E. P.',
    pdfUrl: null,
    sourceUrl: 'https://doi.org/10.1111/j.1467-9280.2005.01641.x',
    sourceName: '内置文献库',
  },
  {
    id: 'doi-10-1126-science-2658056',
    doi: '10.1126/science.2658056',
    topic: '发展与教育',
    venue: 'Science',
    year: 1989,
    title: 'Delay of gratification in children',
    abstract: '棉花糖实验经典追踪研究：幼儿延迟满足与成年后的适应结果。',
    authors: 'Mischel, W., Shoda, Y., & Rodriguez, M. L.',
    pdfUrl: null,
    sourceUrl: 'https://doi.org/10.1126/science.2658056',
    sourceName: '内置文献库',
  },
  {
    id: 'doi-10-1007-s10608-012-9476-1',
    doi: '10.1007/s10608-012-9476-1',
    topic: '临床与咨询',
    venue: 'Cognitive Therapy and Research',
    year: 2012,
    title: 'The efficacy of cognitive behavioral therapy: A review of meta-analyses',
    abstract: '对 CBT 疗效元分析的综述：覆盖抑郁、焦虑、创伤等障碍。',
    authors: 'Hofmann, S. G., Asnaani, A., Vonk, I. J. J., Sawyer, A. T., & Fang, A.',
    pdfUrl: null,
    sourceUrl: 'https://doi.org/10.1007/s10608-012-9476-1',
    sourceName: '内置文献库',
  },
  {
    id: 'doi-10-1037-0022-3514-54-6-1063',
    doi: '10.1037/0022-3514.54.6.1063',
    topic: '心理测量与统计',
    venue: 'Journal of Personality and Social Psychology',
    year: 1988,
    title: 'Development and validation of brief measures of positive and negative affect: The PANAS scales',
    abstract: '正负性情绪量表（PANAS）的编制与效度验证，情绪测量的经典工具。',
    authors: 'Watson, D., Clark, L. A., & Tellegen, A.',
    pdfUrl: null,
    sourceUrl: 'https://doi.org/10.1037/0022-3514.54.6.1063',
    sourceName: '内置文献库',
  },
  {
    id: 'doi-10-1037-0033-295x-98-2-224',
    doi: '10.1037/0033-295X.98.2.224',
    topic: '文化与自我',
    venue: 'Psychological Review',
    year: 1991,
    title: 'Culture and the self: Implications for cognition, emotion, and motivation',
    abstract: '独立型与互依型自我构念的开创性论述，跨文化心理学经典。',
    authors: 'Markus, H. R., & Kitayama, S.',
    pdfUrl: null,
    sourceUrl: 'https://doi.org/10.1037/0033-295X.98.2.224',
    sourceName: '内置文献库',
  },
  {
    id: 'doi-10-1037-0033-2909-119-2-197',
    doi: '10.1037/0033-2909.119.2.197',
    topic: '心理测量与统计',
    venue: 'Psychological Bulletin',
    year: 1996,
    title: 'Dispositional differences in cognitive motivation: The life and times of individuals varying in need for cognition',
    abstract: '认知需求（Need for Cognition）构念的综述与量表研究。',
    authors: 'Cacioppo, J. T., Petty, R. E., Feinstein, J. A., & Jarvis, W. B. G.',
    pdfUrl: null,
    sourceUrl: 'https://doi.org/10.1037/0033-2909.119.2.197',
    sourceName: '内置文献库',
  },
  {
    id: 'doi-10-1207-s15327965pli1104-01',
    doi: '10.1207/S15327965PLI1104_01',
    topic: '动机与决策',
    venue: 'Psychological Inquiry',
    year: 2000,
    title: 'The "what" and "why" of goal pursuits: Human needs and the self-determination of behavior',
    abstract: '自我决定理论：胜任、自主与归属三种基本心理需要与内在动机。',
    authors: 'Deci, E. L., & Ryan, R. M.',
    pdfUrl: null,
    sourceUrl: 'https://doi.org/10.1207/S15327965PLI1104_01',
    sourceName: '内置文献库',
  },
  {
    id: 'doi-10-1037-0022-3514-80-3-501',
    doi: '10.1037/0022-3514.80.3.501',
    topic: '动机与决策',
    venue: 'Journal of Personality and Social Psychology',
    year: 2001,
    title: 'A 2 × 2 achievement goal framework',
    abstract: '成就目标 2×2 框架：掌握/表现 × 趋近/回避的动机结构。',
    authors: 'Elliot, A. J., & McGregor, H. A.',
    pdfUrl: null,
    sourceUrl: 'https://doi.org/10.1037/0022-3514.80.3.501',
    sourceName: '内置文献库',
  },
  {
    id: 'doi-10-1080-1047840x-2014-940781',
    doi: '10.1080/1047840X.2014.940781',
    topic: '情绪与健康',
    venue: 'Psychological Inquiry',
    year: 2015,
    title: 'Emotion regulation: Current status and future prospects',
    abstract: '情绪调节研究现状与展望：过程模型、扩展方向与开放问题。',
    authors: 'Gross, J. J.',
    pdfUrl: null,
    sourceUrl: 'https://doi.org/10.1080/1047840X.2014.940781',
    sourceName: '内置文献库',
  },
  {
    id: 'doi-10-1080-02699930802619031',
    doi: '10.1080/02699930802619031',
    topic: '情绪与健康',
    venue: 'Cognition and Emotion',
    year: 2009,
    title: 'The psychology of emotion regulation: An integrative review',
    abstract: '情绪调节心理学的整合综述：过程、策略与目标框架。',
    authors: 'Koole, S. L.',
    pdfUrl: null,
    sourceUrl: 'https://doi.org/10.1080/02699930802619031',
    sourceName: '内置文献库',
  },
  {
    id: 'doi-10-1016-j-cpr-2008-01-002',
    doi: '10.1016/j.cpr.2008.01.002',
    topic: '临床与咨询',
    venue: 'Clinical Psychology Review',
    year: 2008,
    title: 'The evolution of the cognitive model of depression and its neurobiological correlates',
    abstract: '抑郁认知模型的演进及其神经生物学基础。',
    authors: 'Beck, A. T.',
    pdfUrl: null,
    sourceUrl: 'https://doi.org/10.1016/j.cpr.2008.01.002',
    sourceName: '内置文献库',
  },
  {
    id: 'doi-10-1016-j-cpr-2011-09-004',
    doi: '10.1016/j.cpr.2011.09.004',
    topic: '临床与咨询',
    venue: 'Clinical Psychology Review',
    year: 2012,
    title: 'Emotion regulation and anxiety disorders: A critical review',
    abstract: '情绪调节与焦虑障碍关系的批判性综述。',
    authors: 'Cisler, J. M., & Olatunji, B. O.',
    pdfUrl: null,
    sourceUrl: 'https://doi.org/10.1016/j.cpr.2011.09.004',
    sourceName: '内置文献库',
  },
  {
    id: 'doi-10-1016-j-tics-2005-03-010',
    doi: '10.1016/j.tics.2005.03.010',
    topic: '认知与学习',
    venue: 'Trends in Cognitive Sciences',
    year: 2005,
    title: 'The cognitive control of emotion',
    abstract: '情绪认知控制的神经机制：前额叶对情绪反应的调节。',
    authors: 'Ochsner, K. N., & Gross, J. J.',
    pdfUrl: null,
    sourceUrl: 'https://doi.org/10.1016/j.tics.2005.03.010',
    sourceName: '内置文献库',
  },
  {
    id: 'doi-10-1111-j-1467-6494-2004-00298-x',
    doi: '10.1111/j.1467-6494.2004.00298.x',
    topic: '情绪与健康',
    venue: 'Journal of Personality',
    year: 2004,
    title: 'Healthy and unhealthy emotion regulation: Personality processes, individual differences, and life span development',
    abstract: '健康与不健康情绪调节的人格过程与个体差异综述。',
    authors: 'John, O. P., & Gross, J. J.',
    pdfUrl: null,
    sourceUrl: 'https://doi.org/10.1111/j.1467-6494.2004.00298.x',
    sourceName: '内置文献库',
  },
  // ── 国内期刊（经公开检索核实的真实条目） ──
  {
    id: 'seed-xlxb-self-focused-reappraisal',
    doi: null,
    topic: '情绪与健康',
    venue: '心理学报',
    year: 2020,
    title: '自我关注重评和情境关注重评情绪调节策略及对随后认知控制的影响',
    abstract: '考察自我关注重评与情境关注重评两种策略对随后认知控制任务表现的影响。',
    authors: '',
    pdfUrl: null,
    sourceUrl: 'https://journal.psych.ac.cn/xlxb/CN/lexeme/showArticleByLexeme.do?articleID=4840',
    sourceName: '内置文献库',
  },
  {
    id: 'seed-xlkxjz-emotion-spin',
    doi: null,
    topic: '情绪与健康',
    venue: '心理科学进展',
    year: null,
    title: '情绪自旋及其心理健康功能',
    abstract: '综述情绪自旋（情绪在效价维度上的波动）的构念、测量及其心理健康功能。',
    authors: '',
    pdfUrl: null,
    sourceUrl: 'https://journal.psych.ac.cn/xlkxjz/CN/lexeme/showArticleByLexeme.do?articleID=5523',
    sourceName: '内置文献库',
  },
  {
    id: 'seed-xlkx-negative-emotion-memory',
    doi: null,
    topic: '认知与学习',
    venue: '心理科学',
    year: 2022,
    title: '负性情绪对不同语义、空间关系联结记忆的影响',
    abstract: '考察负性情绪对语义联结记忆与空间关系联结记忆的差异化影响。',
    authors: '',
    pdfUrl: null,
    sourceUrl: 'https://med.wanfangdata.com.cn/Paper/Detail?id=PeriodicalPaper_xlkx202206006&dbid=WF_QK',
    sourceName: '内置文献库',
  },
  {
    id: 'seed-xlkx-social-anxiety-flexibility',
    doi: null,
    topic: '临床与咨询',
    venue: '心理科学',
    year: null,
    title: '社交焦虑大学生情绪调节灵活性：情绪内容对策略选择和使用的影响',
    abstract: '考察社交焦虑大学生的情绪调节灵活性，以及情绪内容对策略选择的影响。',
    authors: '',
    pdfUrl: null,
    sourceUrl: 'https://m.qikan.cqvip.com/Article/ArticleDetail?id=7105194323',
    sourceName: '内置文献库',
  },
  {
    id: 'seed-xlfz-parental-resilience',
    doi: null,
    topic: '发展与教育',
    venue: '心理发展与教育',
    year: 2023,
    title: '父母心理弹性与自闭症谱系障碍儿童情绪行为问题的关系：一个有调节的中介模型',
    abstract: '考察父母心理弹性如何通过家庭教养等中介影响自闭症谱系障碍儿童的情绪行为问题。',
    authors: '',
    pdfUrl: null,
    sourceUrl: 'https://wap.cnki.net/touch/web/Journal/Article/XLFZ202302011.html',
    sourceName: '内置文献库',
  },
  {
    id: 'seed-xlfz-adolescent-regulation',
    doi: null,
    topic: '发展与教育',
    venue: '心理发展与教育',
    year: null,
    title: '中国青少年情绪调节的发展特点',
    abstract: '描述中国青少年情绪调节策略随年龄发展的特点与趋势。',
    authors: '',
    pdfUrl: null,
    sourceUrl: 'https://www.lwinst.com/Liems/web/result/detail.htm?id=d25f6fbd2b09e418b0b02492293f8b42',
    sourceName: '内置文献库',
  },
  {
    id: 'seed-zglcxlxzz-heterogeneity',
    doi: null,
    topic: '心理测量与统计',
    venue: '中国临床心理学杂志',
    year: null,
    title: '大学生认知情绪调节的异质性：基于潜在剖面分析',
    abstract: '用潜在剖面分析识别大学生认知情绪调节策略的异质性类型。',
    authors: '',
    pdfUrl: null,
    sourceUrl: 'https://cjournal.hep.com.cn/1005-3611/CN/1210580008801628329',
    sourceName: '内置文献库',
  },
  {
    id: 'seed-zglcxlxzz-family-depression',
    doi: null,
    topic: '临床与咨询',
    venue: '中国临床心理学杂志',
    year: 2020,
    title: '家庭功能对青少年抑郁的影响：一项有调节的中介效应',
    abstract: '考察家庭功能经中介与调节路径对青少年抑郁的影响机制。',
    authors: '',
    pdfUrl: null,
    sourceUrl: 'https://search.napstic.cn/literature/periodical/010zglcxlxzz202004008',
    sourceName: '内置文献库',
  },
  {
    id: 'seed-zglcxlxzz-mindfulness',
    doi: null,
    topic: '临床与咨询',
    venue: '中国临床心理学杂志',
    year: 2021,
    title: '手机成瘾、非理性拖延与抑郁、焦虑的关系：正念的保护性作用',
    abstract: '检验正念在手机成瘾、非理性拖延与抑郁焦虑关系中的保护性作用。',
    authors: '',
    pdfUrl: null,
    sourceUrl: 'https://search.napstic.cn/literature/periodical/010zglcxlxzz202101010',
    sourceName: '内置文献库',
  },
];

function nowIso() {
  return new Date().toISOString();
}

function rowToProject(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    color: row.color,
    projectType: row.project_type || '',
    status: row.status || 'active',
    paperCount: Number(row.paper_count || 0),
    pdfCount: Number(row.pdf_count || 0),
    noteCount: Number(row.note_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToPaper(row) {
  return {
    id: row.id,
    doi: row.doi || null,
    title: row.title,
    authors: row.authors,
    venue: row.venue,
    year: row.year,
    abstract: row.abstract,
    topic: row.topic,
    pdfUrl: row.pdf_url || null,
    sourceUrl: row.source_url || null,
    sourceName: row.source_name || null,
    favorite: row.is_favorite === 1,
    readStatus: row.read_status || 'unread',
    priority: row.priority || '',
    citedByCount: row.cited_by_count == null ? null : Number(row.cited_by_count),
    openalexId: row.openalex_id || null,
    methodology: parseMethodologyJson(row.methodology_json),
    role: row.role || '',
    titleAbstractDecision: row.title_abstract_decision || 'pending',
    titleAbstractReason: row.title_abstract_reason || '',
    fullTextDecision: row.full_text_decision || 'pending',
    fullTextReason: row.full_text_reason || '',
    screeningUpdatedAt: row.screening_updated_at || null,
    retrievalStatus: row.retrieval_status || 'auto',
    retrievalReason: row.retrieval_reason || '',
    retrievalUpdatedAt: row.retrieval_updated_at || null,
    attachmentId: row.attachment_id || null,
    importedProjectIds: row.imported_project_ids
      ? row.imported_project_ids.split(',').filter(Boolean)
      : [],
  };
}

function parseMethodologyJson(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(tag => typeof tag === 'string').slice(0, 12) : [];
  } catch {
    return [];
  }
}

function evidenceFieldRow(row) {
  let options = [];
  try { options = JSON.parse(row.options_json || '[]'); } catch { options = []; }
  return {
    id: row.id,
    projectId: row.project_id,
    label: row.label,
    description: row.description || '',
    type: row.field_type,
    options: Array.isArray(options) ? options : [],
    position: Number(row.position || 0),
    required: row.required === 1,
  };
}

function evidenceValueIsEmpty(value) {
  return value === null || value === undefined || (typeof value === 'string' && !value.trim()) || (Array.isArray(value) && value.length === 0);
}

function normalizeEvidenceValue(field, value) {
  if (evidenceValueIsEmpty(value)) return null;
  if (field.type === 'number') {
    const numeric = typeof value === 'number' ? value : Number(String(value).trim());
    if (!Number.isFinite(numeric)) throw new ResearchStoreError('EVIDENCE_VALUE_INVALID', `“${field.label}”必须是有效数字`, 400);
    return numeric;
  }
  if (field.type === 'boolean') {
    if (value !== true && value !== false) throw new ResearchStoreError('EVIDENCE_VALUE_INVALID', `“${field.label}”必须选择是或否`, 400);
    return value;
  }
  if (field.type === 'select') {
    const text = String(value).trim();
    if (!field.options.includes(text)) throw new ResearchStoreError('EVIDENCE_VALUE_INVALID', `“${field.label}”的选项无效`, 400);
    return text;
  }
  if (field.type === 'multi_select') {
    const items = [...new Set((Array.isArray(value) ? value : []).map(item => String(item).trim()).filter(Boolean))];
    if (items.length > 20 || items.some(item => !field.options.includes(item))) throw new ResearchStoreError('EVIDENCE_VALUE_INVALID', `“${field.label}”包含无效选项`, 400);
    return items.length ? items : null;
  }
  const text = String(value).trim();
  if (text.length > 2000) throw new ResearchStoreError('EVIDENCE_VALUE_TOO_LONG', `“${field.label}”不能超过 2000 字`, 400);
  return text || null;
}

function savedSearchRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    query: row.query,
    sources: JSON.parse(row.sources || '[]'),
    perSource: Number(row.per_source || 8),
    filters: JSON.parse(row.filters || '{}'),
    alertEnabled: row.alert_enabled === 1,
    lastRunAt: row.last_run_at || null,
    lastResultCount: Number(row.last_result_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class ResearchStore {
  constructor(dataDir, options = {}) {
    if (!dataDir) throw new Error('ResearchStore requires dataDir');
    this.dataDir = path.resolve(dataDir);
    this.dbPath = path.join(this.dataDir, 'research.db');
    this.libraryDir = path.join(this.dataDir, 'library', 'pdfs');
    this.projectNotesDir = path.join(this.dataDir, 'library', 'projects');
    fs.mkdirSync(this.libraryDir, { recursive: true });
    fs.mkdirSync(this.projectNotesDir, { recursive: true });
    const Database = options.Database || DatabaseSync;
    this.db = new Database(options.dbPath || this.dbPath);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA synchronous = NORMAL');
    this.db.exec('PRAGMA foreign_keys = ON');
    this.#initSchema();
    if (options.seedDemoData === true) this.#seedDemoData();
  }

  #initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS research_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        color TEXT NOT NULL DEFAULT '#806b8e',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        archived_at TEXT
      );

      CREATE TABLE IF NOT EXISTS papers (
        id TEXT PRIMARY KEY,
        doi TEXT UNIQUE,
        title TEXT NOT NULL,
        authors TEXT NOT NULL DEFAULT '',
        venue TEXT NOT NULL DEFAULT '',
        year INTEGER,
        abstract TEXT NOT NULL DEFAULT '',
        topic TEXT NOT NULL DEFAULT '',
        pdf_url TEXT,
        source_url TEXT,
        source_name TEXT,
        is_favorite INTEGER NOT NULL DEFAULT 0 CHECK(is_favorite IN (0, 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS project_papers (
        project_id TEXT NOT NULL,
        paper_id TEXT NOT NULL,
        added_at TEXT NOT NULL,
        PRIMARY KEY (project_id, paper_id),
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS attachments (
        id TEXT PRIMARY KEY,
        paper_id TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'pdf',
        file_name TEXT NOT NULL,
        relative_path TEXT NOT NULL UNIQUE,
        mime_type TEXT NOT NULL,
        byte_size INTEGER NOT NULL,
        sha256 TEXT NOT NULL,
        source_url TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE (paper_id, sha256),
        FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_project_papers_paper ON project_papers(paper_id);
      CREATE INDEX IF NOT EXISTS idx_attachments_paper ON attachments(paper_id);

      CREATE TABLE IF NOT EXISTS annotations (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        attachment_id TEXT NOT NULL,
        page_number INTEGER NOT NULL,
        kind TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (attachment_id) REFERENCES attachments(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        paper_id TEXT,
        attachment_id TEXT,
        page_number INTEGER,
        content TEXT NOT NULL,
        quote TEXT NOT NULL DEFAULT '',
        tags_json TEXT NOT NULL DEFAULT '[]',
        annotation_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE SET NULL,
        FOREIGN KEY (attachment_id) REFERENCES attachments(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS research_audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        detail_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS translation_docs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        paper_id TEXT NOT NULL,
        attachment_id TEXT NOT NULL,
        file_name TEXT,
        relative_path TEXT,
        source_lang TEXT NOT NULL DEFAULT 'en',
        target_lang TEXT NOT NULL DEFAULT 'zh',
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK(status IN ('pending', 'running', 'done', 'failed')),
        progress_done INTEGER NOT NULL DEFAULT 0,
        progress_total INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        model TEXT,
        char_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE,
        FOREIGN KEY (attachment_id) REFERENCES attachments(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_translation_docs_project ON translation_docs(project_id);

      CREATE TABLE IF NOT EXISTS journal_sources (
        id TEXT PRIMARY KEY,
        venue TEXT NOT NULL,
        issn TEXT NOT NULL,
        topic TEXT NOT NULL DEFAULT '未分类',
        enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0, 1)),
        last_synced_at TEXT,
        last_inserted INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS journal_sync_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_id TEXT NOT NULL,
        venue TEXT NOT NULL,
        fetched INTEGER NOT NULL DEFAULT 0,
        inserted INTEGER NOT NULL DEFAULT 0,
        pruned INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_journal_sync_log_created ON journal_sync_log(created_at);

      CREATE TABLE IF NOT EXISTS topic_subscriptions (
        id TEXT PRIMARY KEY,
        topic TEXT NOT NULL UNIQUE,
        keywords TEXT NOT NULL DEFAULT '',
        journal_ids TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        last_checked_at TEXT
      );

      CREATE TABLE IF NOT EXISTS collections (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS collection_papers (
        collection_id TEXT NOT NULL,
        paper_id TEXT NOT NULL,
        added_at TEXT NOT NULL,
        PRIMARY KEY (collection_id, paper_id),
        FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
        FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_collection_papers_paper ON collection_papers(paper_id);

      CREATE TABLE IF NOT EXISTS saved_searches (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        query TEXT NOT NULL,
        sources TEXT NOT NULL DEFAULT '[]',
        per_source INTEGER NOT NULL DEFAULT 8,
        filters TEXT NOT NULL DEFAULT '{}',
        alert_enabled INTEGER NOT NULL DEFAULT 0 CHECK(alert_enabled IN (0, 1)),
        last_run_at TEXT,
        last_result_ids TEXT NOT NULL DEFAULT '[]',
        last_result_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS paper_relations (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        from_paper_id TEXT NOT NULL,
        to_paper_id TEXT NOT NULL,
        relation TEXT NOT NULL CHECK(relation IN ('supports', 'refutes', 'cites')),
        note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (from_paper_id) REFERENCES papers(id) ON DELETE CASCADE,
        FOREIGN KEY (to_paper_id) REFERENCES papers(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_paper_relations_project ON paper_relations(project_id);
    `);
    const noteColumns = new Set(this.db.prepare('PRAGMA table_info(notes)').all().map(column => column.name));
    if (!noteColumns.has('quote')) this.db.exec("ALTER TABLE notes ADD COLUMN quote TEXT NOT NULL DEFAULT ''");
    if (!noteColumns.has('tags_json')) this.db.exec("ALTER TABLE notes ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]'");
    if (!noteColumns.has('annotation_id')) this.db.exec('ALTER TABLE notes ADD COLUMN annotation_id TEXT');
    const logColumns = new Set(this.db.prepare('PRAGMA table_info(journal_sync_log)').all().map(column => column.name));
    if (!logColumns.has('pruned')) this.db.exec('ALTER TABLE journal_sync_log ADD COLUMN pruned INTEGER NOT NULL DEFAULT 0');

    // ── schema v5 原地迁移（P1 增强）：阅读状态/优先级、项目类型/状态、期刊查看时间、阅读进度 ──
    const paperColumns = new Set(this.db.prepare('PRAGMA table_info(papers)').all().map(column => column.name));
    if (!paperColumns.has('read_status')) this.db.exec("ALTER TABLE papers ADD COLUMN read_status TEXT NOT NULL DEFAULT 'unread'");
    if (!paperColumns.has('priority')) this.db.exec("ALTER TABLE papers ADD COLUMN priority TEXT NOT NULL DEFAULT ''");
    if (!paperColumns.has('cited_by_count')) this.db.exec('ALTER TABLE papers ADD COLUMN cited_by_count INTEGER');

    // ── schema v8 原地迁移（P2 增强）：方法学标注、项目内文献角色 ──
    if (!paperColumns.has('methodology_json')) this.db.exec("ALTER TABLE papers ADD COLUMN methodology_json TEXT NOT NULL DEFAULT '[]'");
    const projectPaperColumns = new Set(this.db.prepare('PRAGMA table_info(project_papers)').all().map(column => column.name));
    if (!projectPaperColumns.has('role')) this.db.exec("ALTER TABLE project_papers ADD COLUMN role TEXT NOT NULL DEFAULT ''");
    const projectColumns = new Set(this.db.prepare('PRAGMA table_info(projects)').all().map(column => column.name));
    if (!projectColumns.has('project_type')) this.db.exec("ALTER TABLE projects ADD COLUMN project_type TEXT NOT NULL DEFAULT ''");
    if (!projectColumns.has('status')) this.db.exec("ALTER TABLE projects ADD COLUMN status TEXT NOT NULL DEFAULT 'active'");
    const sourceColumns = new Set(this.db.prepare('PRAGMA table_info(journal_sources)').all().map(column => column.name));
    if (!sourceColumns.has('last_viewed_at')) this.db.exec('ALTER TABLE journal_sources ADD COLUMN last_viewed_at TEXT');
    if (!sourceColumns.has('is_custom')) this.db.exec('ALTER TABLE journal_sources ADD COLUMN is_custom INTEGER NOT NULL DEFAULT 0');

    // ── schema v9 原地迁移（P2 增强）：期刊源国内外分组 ──
    if (!sourceColumns.has('region')) this.db.exec("ALTER TABLE journal_sources ADD COLUMN region TEXT NOT NULL DEFAULT 'intl'");

    // ── schema v10 原地迁移（P2 增强）：OpenAlex work id 落库（引文网络免二次解析） ──
    if (!paperColumns.has('openalex_id')) this.db.exec('ALTER TABLE papers ADD COLUMN openalex_id TEXT');

    // ── schema v11 原地迁移（P2 增强）：跨文献笔记关联 ──
    if (!noteColumns.has('linked_paper_id')) this.db.exec('ALTER TABLE notes ADD COLUMN linked_paper_id TEXT');
    const attachmentColumns = new Set(this.db.prepare('PRAGMA table_info(attachments)').all().map(column => column.name));
    if (!attachmentColumns.has('last_page')) this.db.exec('ALTER TABLE attachments ADD COLUMN last_page INTEGER');
    if (!attachmentColumns.has('last_read_at')) this.db.exec('ALTER TABLE attachments ADD COLUMN last_read_at TEXT');

    // ── schema v12 原地迁移（阅读工作区：EmbedPDF 批注 + Tiptap 文献笔记 + 引文 + 阅读状态） ──
    const annotationColumns = new Set(this.db.prepare('PRAGMA table_info(annotations)').all().map(column => column.name));
    if (!annotationColumns.has('subtype')) this.db.exec("ALTER TABLE annotations ADD COLUMN subtype TEXT NOT NULL DEFAULT ''");
    if (!annotationColumns.has('embed_pdf_data')) this.db.exec('ALTER TABLE annotations ADD COLUMN embed_pdf_data TEXT');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS paper_reading_state (
        paper_id TEXT PRIMARY KEY,
        current_page INTEGER NOT NULL DEFAULT 1,
        zoom REAL NOT NULL DEFAULT 1,
        scroll_mode TEXT NOT NULL DEFAULT 'continuous',
        left_panel_width INTEGER NOT NULL DEFAULT 260,
        right_panel_width INTEGER NOT NULL DEFAULT 380,
        left_panel_collapsed INTEGER NOT NULL DEFAULT 0,
        right_panel_collapsed INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS paper_note_documents (
        id TEXT PRIMARY KEY,
        paper_id TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL DEFAULT '',
        tiptap_json TEXT NOT NULL DEFAULT '{}',
        markdown TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS note_citations (
        id TEXT PRIMARY KEY,
        note_document_id TEXT NOT NULL,
        paper_id TEXT NOT NULL,
        annotation_id TEXT,
        page_number INTEGER NOT NULL DEFAULT 1,
        quoted_text TEXT NOT NULL DEFAULT '',
        prefix TEXT NOT NULL DEFAULT '',
        suffix TEXT NOT NULL DEFAULT '',
        annotation_deleted INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        FOREIGN KEY (note_document_id) REFERENCES paper_note_documents(id) ON DELETE CASCADE,
        FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_citations_note ON note_citations(note_document_id);
      CREATE INDEX IF NOT EXISTS idx_citations_annotation ON note_citations(annotation_id);
      CREATE INDEX IF NOT EXISTS idx_annotations_attachment ON annotations(attachment_id);
    `);
    // 幂等补写旧批注 subtype（由 kind 推导），仅当 subtype 为空时执行一次
    this.db.prepare(`
      UPDATE annotations SET subtype = CASE lower(kind)
        WHEN 'highlight' THEN 'highlight'
        WHEN 'area' THEN 'square'
        ELSE 'highlight'
      END WHERE subtype = ''
    `).run();
    // ── schema v13 迁移（阅读工作区：逐句笔记 + 分类 + 标签颜色 + 汇总笔记分类/标签 + Tab 记忆） ──
    // 结构性变更前先备份数据库（WAL checkpoint 后复制；幂等：仅 schema_version < 13 时执行一次）。
    // 备份失败不阻断启动（结构变更继续执行），但会记录警告。
    const metaRow = this.db.prepare("SELECT value FROM research_meta WHERE key = 'schema_version'").get();
    const currentVersion = Number(metaRow?.value || 0);
    if (currentVersion < 13 && fs.existsSync(this.dbPath)) {
      try {
        this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
        const stamp = nowIso().replace(/[:.]/g, '-');
        const backupPath = `${this.dbPath}.bak-v13-${stamp}`;
        fs.copyFileSync(this.dbPath, backupPath);
        this.#audit('schema.backup', 'database', backupPath, { from: currentVersion, to: 13 });
      } catch (error) {
        console.warn('[hana-research] 数据库备份失败（迁移继续）:', error?.message || error);
      }
    }
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS note_categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        color TEXT NOT NULL DEFAULT '#8bb8e8',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS note_tag_colors (
        tag TEXT PRIMARY KEY,
        color TEXT NOT NULL DEFAULT '#8bb8e8',
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sentence_notes (
        id TEXT PRIMARY KEY,
        paper_id TEXT NOT NULL,
        attachment_id TEXT,
        annotation_id TEXT,
        quoted_text TEXT NOT NULL DEFAULT '',
        comment TEXT NOT NULL DEFAULT '',
        page_number INTEGER NOT NULL DEFAULT 1,
        position_json TEXT NOT NULL DEFAULT '{}',
        category_id TEXT,
        tags_json TEXT NOT NULL DEFAULT '[]',
        importance INTEGER NOT NULL DEFAULT 2,
        starred INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'inbox',
        annotation_deleted INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_sentence_notes_paper ON sentence_notes(paper_id);
      CREATE INDEX IF NOT EXISTS idx_sentence_notes_annotation ON sentence_notes(annotation_id);
    `);
    const noteDocColumns = new Set(this.db.prepare('PRAGMA table_info(paper_note_documents)').all().map(column => column.name));
    if (!noteDocColumns.has('category_id')) this.db.exec('ALTER TABLE paper_note_documents ADD COLUMN category_id TEXT');
    if (!noteDocColumns.has('tags_json')) this.db.exec("ALTER TABLE paper_note_documents ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]'");
    const readingColumns = new Set(this.db.prepare('PRAGMA table_info(paper_reading_state)').all().map(column => column.name));
    if (!readingColumns.has('right_tab')) this.db.exec("ALTER TABLE paper_reading_state ADD COLUMN right_tab TEXT NOT NULL DEFAULT 'sentence'");
    // 幂等种子：13 个默认分类（INSERT OR IGNORE，重复运行不产生变化）
    const seedCategory = this.db.prepare('INSERT OR IGNORE INTO note_categories(id, name, color, created_at) VALUES(?, ?, ?, ?)');
    const seedStamp = nowIso();
    for (const [name, color] of DEFAULT_NOTE_CATEGORIES) {
      seedCategory.run(`cat-${name}`, name, color, seedStamp);
    }

    // ── schema v14 迁移（系统综述：题录/全文双阶段筛选 + 项目纳排标准） ──
    if (currentVersion >= 13 && currentVersion < 14 && fs.existsSync(this.dbPath)) {
      try {
        this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
        const stamp = nowIso().replace(/[:.]/g, '-');
        const backupPath = `${this.dbPath}.bak-v14-${stamp}`;
        fs.copyFileSync(this.dbPath, backupPath);
        this.#audit('schema.backup', 'database', backupPath, { from: currentVersion, to: 14 });
      } catch (error) {
        console.warn('[hana-research] 数据库备份失败（v14 迁移继续）:', error?.message || error);
      }
    }
    if (!projectPaperColumns.has('title_abstract_decision')) this.db.exec("ALTER TABLE project_papers ADD COLUMN title_abstract_decision TEXT NOT NULL DEFAULT 'pending'");
    if (!projectPaperColumns.has('title_abstract_reason')) this.db.exec("ALTER TABLE project_papers ADD COLUMN title_abstract_reason TEXT NOT NULL DEFAULT ''");
    if (!projectPaperColumns.has('full_text_decision')) this.db.exec("ALTER TABLE project_papers ADD COLUMN full_text_decision TEXT NOT NULL DEFAULT 'pending'");
    if (!projectPaperColumns.has('full_text_reason')) this.db.exec("ALTER TABLE project_papers ADD COLUMN full_text_reason TEXT NOT NULL DEFAULT ''");
    if (!projectPaperColumns.has('screening_updated_at')) this.db.exec('ALTER TABLE project_papers ADD COLUMN screening_updated_at TEXT');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS project_screening_criteria (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('include', 'exclude')),
        label TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        position INTEGER NOT NULL DEFAULT 0,
        enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0, 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_screening_criteria_project ON project_screening_criteria(project_id, kind, position);
    `);

    // ── schema v15 迁移（项目级证据字段 + 逐篇研究编码） ──
    if (currentVersion >= 14 && currentVersion < 15 && fs.existsSync(this.dbPath)) {
      try {
        this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
        const stamp = nowIso().replace(/[:.]/g, '-');
        const backupPath = `${this.dbPath}.bak-v15-${stamp}`;
        fs.copyFileSync(this.dbPath, backupPath);
        this.#audit('schema.backup', 'database', backupPath, { from: currentVersion, to: 15 });
      } catch (error) {
        console.warn('[hana-research] 数据库备份失败（v15 迁移继续）:', error?.message || error);
      }
    }
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS project_evidence_fields (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        label TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        field_type TEXT NOT NULL CHECK(field_type IN ('text', 'number', 'select', 'multi_select', 'boolean')),
        options_json TEXT NOT NULL DEFAULT '[]',
        position INTEGER NOT NULL DEFAULT 0,
        required INTEGER NOT NULL DEFAULT 0 CHECK(required IN (0, 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_evidence_fields_project_label ON project_evidence_fields(project_id, label COLLATE NOCASE);
      CREATE INDEX IF NOT EXISTS idx_evidence_fields_project_position ON project_evidence_fields(project_id, position);

      CREATE TABLE IF NOT EXISTS project_paper_evidence_values (
        project_id TEXT NOT NULL,
        paper_id TEXT NOT NULL,
        field_id TEXT NOT NULL,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (project_id, paper_id, field_id),
        FOREIGN KEY (project_id, paper_id) REFERENCES project_papers(project_id, paper_id) ON DELETE CASCADE,
        FOREIGN KEY (field_id) REFERENCES project_evidence_fields(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_evidence_values_field ON project_paper_evidence_values(field_id);
    `);

    // ── schema v16 迁移（文献去重：忽略清单 + 可撤销合并日志） ──
    if (currentVersion >= 15 && currentVersion < 16 && fs.existsSync(this.dbPath)) {
      try {
        this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
        const stamp = nowIso().replace(/[:.]/g, '-');
        const backupPath = `${this.dbPath}.bak-v16-${stamp}`;
        fs.copyFileSync(this.dbPath, backupPath);
        this.#audit('schema.backup', 'database', backupPath, { from: currentVersion, to: 16 });
      } catch (error) {
        console.warn('[hana-research] 数据库备份失败（v16 迁移继续）:', error?.message || error);
      }
    }
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS paper_duplicate_ignores (
        pair_key TEXT PRIMARY KEY,
        left_paper_id TEXT NOT NULL,
        right_paper_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (left_paper_id) REFERENCES papers(id) ON DELETE CASCADE,
        FOREIGN KEY (right_paper_id) REFERENCES papers(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS paper_merge_log (
        id TEXT PRIMARY KEY,
        target_paper_id TEXT NOT NULL,
        source_paper_id TEXT NOT NULL,
        source_title TEXT NOT NULL,
        snapshot_json TEXT NOT NULL,
        summary_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        undone_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_paper_merge_log_created ON paper_merge_log(created_at DESC);
    `);

    // ── schema v17 迁移（双人独立筛选 + 冲突仲裁 + 一致性统计） ──
    if (currentVersion >= 16 && currentVersion < 17 && fs.existsSync(this.dbPath)) {
      try {
        this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
        const stamp = nowIso().replace(/[:.]/g, '-');
        const backupPath = `${this.dbPath}.bak-v17-${stamp}`;
        fs.copyFileSync(this.dbPath, backupPath);
        this.#audit('schema.backup', 'database', backupPath, { from: currentVersion, to: 17 });
      } catch (error) {
        console.warn('[hana-research] 数据库备份失败（v17 迁移继续）:', error?.message || error);
      }
    }
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS project_dual_screening_config (
        project_id TEXT PRIMARY KEY,
        enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0, 1)),
        reviewer_a_name TEXT NOT NULL DEFAULT '审查者 A',
        reviewer_b_name TEXT NOT NULL DEFAULT '审查者 B',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS paper_screening_reviews (
        project_id TEXT NOT NULL,
        paper_id TEXT NOT NULL,
        stage TEXT NOT NULL CHECK(stage IN ('title_abstract', 'full_text')),
        reviewer_key TEXT NOT NULL CHECK(reviewer_key IN ('a', 'b')),
        decision TEXT NOT NULL CHECK(decision IN ('pending', 'include', 'exclude', 'maybe')),
        reason TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL,
        PRIMARY KEY (project_id, paper_id, stage, reviewer_key),
        FOREIGN KEY (project_id, paper_id) REFERENCES project_papers(project_id, paper_id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_screening_reviews_project_stage ON paper_screening_reviews(project_id, stage, reviewer_key);

      CREATE TABLE IF NOT EXISTS paper_screening_resolutions (
        project_id TEXT NOT NULL,
        paper_id TEXT NOT NULL,
        stage TEXT NOT NULL CHECK(stage IN ('title_abstract', 'full_text')),
        decision TEXT NOT NULL CHECK(decision IN ('include', 'exclude', 'maybe')),
        reason TEXT NOT NULL DEFAULT '',
        resolution_note TEXT NOT NULL DEFAULT '',
        resolved_at TEXT NOT NULL,
        PRIMARY KEY (project_id, paper_id, stage),
        FOREIGN KEY (project_id, paper_id) REFERENCES project_papers(project_id, paper_id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_screening_resolutions_project_stage ON paper_screening_resolutions(project_id, stage);
    `);

    // ── schema v18 迁移（PRISMA：检索批次 + 全文获取 + 可复核流程统计） ──
    if (currentVersion >= 17 && currentVersion < 18 && fs.existsSync(this.dbPath)) {
      try {
        this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
        const stamp = nowIso().replace(/[:.]/g, '-');
        const backupPath = `${this.dbPath}.bak-v18-${stamp}`;
        fs.copyFileSync(this.dbPath, backupPath);
        this.#audit('schema.backup', 'database', backupPath, { from: currentVersion, to: 18 });
      } catch (error) {
        console.warn('[hana-research] 数据库备份失败（v18 迁移继续）:', error?.message || error);
      }
    }
    if (!projectPaperColumns.has('retrieval_status')) this.db.exec("ALTER TABLE project_papers ADD COLUMN retrieval_status TEXT NOT NULL DEFAULT 'auto'");
    if (!projectPaperColumns.has('retrieval_reason')) this.db.exec("ALTER TABLE project_papers ADD COLUMN retrieval_reason TEXT NOT NULL DEFAULT ''");
    if (!projectPaperColumns.has('retrieval_updated_at')) this.db.exec('ALTER TABLE project_papers ADD COLUMN retrieval_updated_at TEXT');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS project_prisma_batches (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        source_type TEXT NOT NULL CHECK(source_type IN ('database', 'register', 'other')),
        source_name TEXT NOT NULL,
        query TEXT NOT NULL DEFAULT '',
        searched_at TEXT,
        records_found INTEGER NOT NULL DEFAULT 0 CHECK(records_found >= 0),
        duplicates_removed INTEGER NOT NULL DEFAULT 0 CHECK(duplicates_removed >= 0),
        removed_other INTEGER NOT NULL DEFAULT 0 CHECK(removed_other >= 0),
        records_imported INTEGER NOT NULL DEFAULT 0 CHECK(records_imported >= 0),
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_prisma_batches_project_date ON project_prisma_batches(project_id, searched_at, created_at);
    `);

    // ── schema v19 迁移（结局级风险偏倚 + 双人裁决 + GRADE） ──
    if (currentVersion >= 18 && currentVersion < 19 && fs.existsSync(this.dbPath)) {
      try {
        this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
        const stamp = nowIso().replace(/[:.]/g, '-');
        const backupPath = `${this.dbPath}.bak-v19-${stamp}`;
        fs.copyFileSync(this.dbPath, backupPath);
        this.#audit('schema.backup', 'database', backupPath, { from: currentVersion, to: 19 });
      } catch (error) {
        console.warn('[hana-research] 数据库备份失败（v19 迁移继续）:', error?.message || error);
      }
    }
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS project_quality_config (
        project_id TEXT PRIMARY KEY,
        template_id TEXT NOT NULL DEFAULT 'psychology-general',
        dual_enabled INTEGER NOT NULL DEFAULT 0 CHECK(dual_enabled IN (0, 1)),
        reviewer_a_name TEXT NOT NULL DEFAULT '评定者 A',
        reviewer_b_name TEXT NOT NULL DEFAULT '评定者 B',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS paper_rob_reviews (
        project_id TEXT NOT NULL,
        paper_id TEXT NOT NULL,
        assessment_id TEXT NOT NULL DEFAULT 'primary',
        outcome_label TEXT NOT NULL DEFAULT '主要结局',
        template_id TEXT NOT NULL,
        reviewer_key TEXT NOT NULL CHECK(reviewer_key IN ('a', 'b')),
        domain_id TEXT NOT NULL,
        judgment TEXT NOT NULL,
        support TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL,
        PRIMARY KEY (project_id, paper_id, assessment_id, reviewer_key, domain_id),
        FOREIGN KEY (project_id, paper_id) REFERENCES project_papers(project_id, paper_id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_rob_reviews_project ON paper_rob_reviews(project_id, assessment_id, reviewer_key);

      CREATE TABLE IF NOT EXISTS paper_rob_resolutions (
        project_id TEXT NOT NULL,
        paper_id TEXT NOT NULL,
        assessment_id TEXT NOT NULL DEFAULT 'primary',
        template_id TEXT NOT NULL,
        domain_id TEXT NOT NULL,
        judgment TEXT NOT NULL,
        resolution_note TEXT NOT NULL DEFAULT '',
        resolved_at TEXT NOT NULL,
        PRIMARY KEY (project_id, paper_id, assessment_id, template_id, domain_id),
        FOREIGN KEY (project_id, paper_id) REFERENCES project_papers(project_id, paper_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS project_grade_outcomes (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        importance TEXT NOT NULL DEFAULT 'critical' CHECK(importance IN ('critical', 'important', 'not_important')),
        study_design TEXT NOT NULL DEFAULT 'randomized' CHECK(study_design IN ('randomized', 'observational', 'other')),
        effect_estimate TEXT NOT NULL DEFAULT '',
        participants INTEGER,
        studies INTEGER,
        confirmed_certainty INTEGER CHECK(confirmed_certainty BETWEEN 1 AND 4),
        confirmation_note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_grade_outcomes_project ON project_grade_outcomes(project_id, importance, created_at);

      CREATE TABLE IF NOT EXISTS grade_domain_judgments (
        outcome_id TEXT NOT NULL,
        domain_id TEXT NOT NULL,
        level INTEGER NOT NULL DEFAULT 0 CHECK(level BETWEEN -2 AND 2),
        rationale TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL,
        PRIMARY KEY (outcome_id, domain_id),
        FOREIGN KEY (outcome_id) REFERENCES project_grade_outcomes(id) ON DELETE CASCADE
      );
    `);

    this.db.prepare(`
      INSERT INTO research_meta(key, value) VALUES('schema_version', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(String(RESEARCH_SCHEMA_VERSION));
  }

  #seedDemoData() {
    const timestamp = nowIso();
    const insertProject = this.db.prepare(`
      INSERT OR IGNORE INTO projects(id, title, description, color, created_at, updated_at)
      VALUES(@id, @title, @description, @color, @createdAt, @updatedAt)
    `);
    const insertPaper = this.db.prepare(`
      INSERT OR IGNORE INTO papers(
        id, doi, title, authors, venue, year, abstract, topic, pdf_url, source_url,
        source_name, created_at, updated_at
      ) VALUES(
        @id, @doi, @title, @authors, @venue, @year, @abstract, @topic, @pdfUrl,
        @sourceUrl, @sourceName, @createdAt, @updatedAt
      )
    `);
    withTransaction(this.db, () => {
      for (const project of seededProjects) {
        insertProject.run({ ...project, createdAt: timestamp, updatedAt: timestamp });
      }
      for (const paper of seededPapers) {
        insertPaper.run({ ...paper, createdAt: timestamp, updatedAt: timestamp });
      }
    });
  }

  listProjects() {
    return this.db.prepare(`
      SELECT p.*,
        COUNT(DISTINCT pp.paper_id) AS paper_count,
        COUNT(DISTINCT a.id) AS pdf_count,
        COUNT(DISTINCT n.id) AS note_count
      FROM projects p
      LEFT JOIN project_papers pp ON pp.project_id = p.id
      LEFT JOIN attachments a ON a.paper_id = pp.paper_id AND a.kind = 'pdf'
      LEFT JOIN notes n ON n.project_id = p.id
      WHERE p.archived_at IS NULL
      GROUP BY p.id
      ORDER BY p.updated_at DESC, p.created_at DESC
    `).all().map(rowToProject);
  }

  getProject(projectId) {
    return this.listProjects().find((project) => project.id === projectId) || null;
  }

  /** 删除项目（级联：关联/批注/笔记/引文随外键清理；项目 Markdown 汇总文件删除；文献保留在文献中心）。 */
  deleteProject(projectId) {
    const project = this.getProject(projectId);
    if (!project) throw new ResearchStoreError('PROJECT_NOT_FOUND', '项目不存在', 404);
    const linkedPaperIds = this.db.prepare('SELECT paper_id FROM project_papers WHERE project_id = ?').all(projectId)
      .map(row => row.paper_id);
    // 论文维度的证据链（汇总笔记/阅读进度/逐句笔记/引文）只在该论文删除后不再属于任何项目时清理，
    // 否则同属项目 B 的共享论文会被连带清空。
    const orphanedPaperFilter = `
      SELECT paper_id FROM project_papers
      WHERE project_id = ?
        AND NOT EXISTS (
          SELECT 1 FROM project_papers other
          WHERE other.paper_id = project_papers.paper_id AND other.project_id != project_papers.project_id
        )`;
    withTransaction(this.db, () => {
      this.db.prepare(`DELETE FROM note_citations WHERE paper_id IN (${orphanedPaperFilter})`).run(projectId);
      this.db.prepare(`DELETE FROM paper_note_documents WHERE paper_id IN (${orphanedPaperFilter})`).run(projectId);
      this.db.prepare(`DELETE FROM paper_reading_state WHERE paper_id IN (${orphanedPaperFilter})`).run(projectId);
      // v13：逐句笔记随项目级联（笔记为项目证据链一部分），仅限删除后成为孤儿的论文
      this.db.prepare(`DELETE FROM sentence_notes WHERE paper_id IN (${orphanedPaperFilter})`).run(projectId);
      this.db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
    });
    // 项目笔记汇总文件
    const safeProjectId = String(projectId).replace(/[^a-z0-9_-]/gi, '_');
    const notesFile = path.join(this.projectNotesDir, safeProjectId, 'project-notes.md');
    try {
      fs.rmSync(path.dirname(notesFile), { recursive: true, force: true });
    } catch { /* 文件删除失败不影响数据库删除 */ }
    this.#audit('project.delete', 'project', projectId, { title: project.title, linkedPapers: linkedPaperIds.length });
    return { id: projectId, linkedPaperIds: linkedPaperIds.length };
  }

  createProject(input) {
    const title = String(input?.title || '').trim();
    if (!title) throw new ResearchStoreError('PROJECT_TITLE_REQUIRED', '项目名称不能为空', 400);
    if (title.length > 80) throw new ResearchStoreError('PROJECT_TITLE_TOO_LONG', '项目名称不能超过 80 个字符', 400);
    const description = String(input?.description || '新建研究项目，等待添加文献与研究笔记。').trim().slice(0, 500);
    const color = /^#[0-9a-f]{6}$/i.test(input?.color) ? input.color : '#806b8e';
    const id = crypto.randomUUID();
    const timestamp = nowIso();
    this.db.prepare(`
      INSERT INTO projects(id, title, description, color, created_at, updated_at)
      VALUES(?, ?, ?, ?, ?, ?)
    `).run(id, title, description, color, timestamp, timestamp);
    this.#audit('project.create', 'project', id, { title });
    return this.getProject(id);
  }

  listPapers() {
    return this.db.prepare(`
      SELECT p.*,
        MIN(a.id) AS attachment_id,
        GROUP_CONCAT(DISTINCT pp.project_id) AS imported_project_ids
      FROM papers p
      LEFT JOIN attachments a ON a.paper_id = p.id AND a.kind = 'pdf'
      LEFT JOIN project_papers pp ON pp.paper_id = p.id
      GROUP BY p.id
      ORDER BY p.year DESC, p.updated_at DESC, p.title ASC
    `).all().map(rowToPaper);
  }

  getPaper(paperId) {
    return this.listPapers().find((paper) => paper.id === paperId) || null;
  }

  listProjectPapers(projectId) {
    if (!this.getProject(projectId)) throw new ResearchStoreError('PROJECT_NOT_FOUND', '项目不存在', 404);
    return this.db.prepare(`
      SELECT p.*, MIN(a.id) AS attachment_id, ? AS imported_project_ids, MAX(pp.role) AS role,
        MAX(pp.title_abstract_decision) AS title_abstract_decision,
        MAX(pp.title_abstract_reason) AS title_abstract_reason,
        MAX(pp.full_text_decision) AS full_text_decision,
        MAX(pp.full_text_reason) AS full_text_reason,
        MAX(pp.screening_updated_at) AS screening_updated_at,
        MAX(pp.retrieval_status) AS retrieval_status,
        MAX(pp.retrieval_reason) AS retrieval_reason,
        MAX(pp.retrieval_updated_at) AS retrieval_updated_at
      FROM project_papers pp
      JOIN papers p ON p.id = pp.paper_id
      LEFT JOIN attachments a ON a.paper_id = p.id AND a.kind = 'pdf'
      WHERE pp.project_id = ?
      GROUP BY p.id
      ORDER BY pp.added_at DESC
    `).all(projectId, projectId).map(rowToPaper);
  }

  setFavorite(paperId, favorite) {
    const result = this.db.prepare(`
      UPDATE papers SET is_favorite = ?, updated_at = ? WHERE id = ?
    `).run(favorite ? 1 : 0, nowIso(), paperId);
    if (result.changes === 0) throw new ResearchStoreError('PAPER_NOT_FOUND', '文献不存在', 404);
    this.#audit(favorite ? 'paper.favorite' : 'paper.unfavorite', 'paper', paperId);
    return this.getPaper(paperId);
  }

  /** 更新文献阅读状态与优先级（P1 增强）。 */
  setPaperStatus(paperId, { readStatus, priority } = {}) {
    const row = this.db.prepare('SELECT * FROM papers WHERE id = ?').get(paperId);
    if (!row) throw new ResearchStoreError('PAPER_NOT_FOUND', '文献不存在', 404);
    const nextRead = ['unread', 'reading', 'read'].includes(readStatus) ? readStatus : row.read_status;
    const nextPriority = ['', 'p0', 'p1', 'p2'].includes(priority) ? priority : row.priority;
    this.db.prepare('UPDATE papers SET read_status = ?, priority = ?, updated_at = ? WHERE id = ?')
      .run(nextRead, nextPriority, nowIso(), paperId);
    this.#audit('paper.status', 'paper', paperId, { readStatus: nextRead, priority: nextPriority });
    return this.getPaper(paperId);
  }

  /** L10 增强：方法学标注（研究设计/测量工具/样本人群标签，与文献绑定的轻量标签）。 */
  setPaperMethodology(paperId, tags) {
    const paper = this.db.prepare('SELECT id FROM papers WHERE id = ?').get(paperId);
    if (!paper) throw new ResearchStoreError('PAPER_NOT_FOUND', '文献不存在', 404);
    if (!Array.isArray(tags)) throw new ResearchStoreError('METHODOLOGY_INVALID', '方法学标注必须是标签数组', 400);
    const clean = [];
    for (const tag of tags) {
      const text = String(tag || '').trim();
      if (!text) continue;
      if (text.length > 24) throw new ResearchStoreError('METHODOLOGY_INVALID', `标签「${text}」不能超过 24 个字符`, 400);
      if (!clean.includes(text)) clean.push(text);
    }
    if (clean.length > 12) throw new ResearchStoreError('METHODOLOGY_INVALID', '方法学标注最多 12 个标签', 400);
    this.db.prepare('UPDATE papers SET methodology_json = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(clean), nowIso(), paperId);
    this.#audit('paper.methodology', 'paper', paperId, { tags: clean });
    return this.getPaper(paperId);
  }

  /** P3 增强：项目内文献角色标记（核心/背景/方法参考/结果对比）。 */
  setPaperRole(projectId, paperId, role = '') {
    if (!['', 'core', 'background', 'method', 'compare'].includes(role)) {
      throw new ResearchStoreError('ROLE_INVALID', '文献角色只能是核心文献/背景/方法参考/结果对比', 400);
    }
    const result = this.db.prepare(`
      UPDATE project_papers SET role = ? WHERE project_id = ? AND paper_id = ?
    `).run(role, projectId, paperId);
    if (result.changes === 0) throw new ResearchStoreError('PROJECT_PAPER_NOT_FOUND', '项目中没有该文献', 404);
    this.#audit('project.paper.role', 'paper', paperId, { projectId, role });
    return this.listProjectPapers(projectId).find((paper) => paper.id === paperId) || null;
  }

  listScreeningCriteria(projectId) {
    if (!this.getProject(projectId)) throw new ResearchStoreError('PROJECT_NOT_FOUND', '项目不存在', 404);
    return this.db.prepare(`
      SELECT * FROM project_screening_criteria
      WHERE project_id = ?
      ORDER BY kind DESC, position ASC, created_at ASC
    `).all(projectId).map(row => ({
      id: row.id,
      projectId: row.project_id,
      kind: row.kind,
      label: row.label,
      description: row.description || '',
      position: Number(row.position || 0),
      enabled: row.enabled === 1,
    }));
  }

  replaceScreeningCriteria(projectId, criteria) {
    if (!this.getProject(projectId)) throw new ResearchStoreError('PROJECT_NOT_FOUND', '项目不存在', 404);
    if (!Array.isArray(criteria) || criteria.length > 30) throw new ResearchStoreError('SCREENING_CRITERIA_INVALID', '纳入/排除标准必须是最多 30 条的数组', 400);
    const normalized = criteria.map((item, index) => {
      const kind = String(item?.kind || '');
      const label = String(item?.label || '').trim();
      const description = String(item?.description || '').trim();
      if (!['include', 'exclude'].includes(kind)) throw new ResearchStoreError('SCREENING_CRITERIA_INVALID', '标准类型只能是纳入或排除', 400);
      if (!label || label.length > 100) throw new ResearchStoreError('SCREENING_CRITERIA_INVALID', '标准名称不能为空且不能超过 100 字', 400);
      if (description.length > 500) throw new ResearchStoreError('SCREENING_CRITERIA_INVALID', '标准说明不能超过 500 字', 400);
      return { id: String(item.id || crypto.randomUUID()), kind, label, description, position: index, enabled: item.enabled !== false };
    });
    const stamp = nowIso();
    withTransaction(this.db, () => {
      this.db.prepare('DELETE FROM project_screening_criteria WHERE project_id = ?').run(projectId);
      const insert = this.db.prepare(`
        INSERT INTO project_screening_criteria(id, project_id, kind, label, description, position, enabled, created_at, updated_at)
        VALUES(@id, @projectId, @kind, @label, @description, @position, @enabled, @createdAt, @updatedAt)
      `);
      for (const item of normalized) insert.run({ ...item, projectId, enabled: item.enabled ? 1 : 0, createdAt: stamp, updatedAt: stamp });
    });
    this.#audit('screening.criteria.replace', 'project', projectId, { count: normalized.length });
    return this.listScreeningCriteria(projectId);
  }

  updatePaperScreening({ projectId, paperId, stage, decision, reason = '' }) {
    if (!['title_abstract', 'full_text'].includes(stage)) throw new ResearchStoreError('SCREENING_STAGE_INVALID', '筛选阶段无效', 400);
    if (!['pending', 'include', 'exclude', 'maybe'].includes(decision)) throw new ResearchStoreError('SCREENING_DECISION_INVALID', '筛选结论无效', 400);
    const cleanReason = String(reason || '').trim();
    if (cleanReason.length > 500) throw new ResearchStoreError('SCREENING_REASON_TOO_LONG', '筛选理由不能超过 500 字', 400);
    if (decision === 'exclude' && !cleanReason) throw new ResearchStoreError('SCREENING_REASON_REQUIRED', '排除文献时必须填写理由', 400);
    const decisionColumn = stage === 'title_abstract' ? 'title_abstract_decision' : 'full_text_decision';
    const reasonColumn = stage === 'title_abstract' ? 'title_abstract_reason' : 'full_text_reason';
    const stamp = nowIso();
    const result = this.db.prepare(`
      UPDATE project_papers SET ${decisionColumn} = ?, ${reasonColumn} = ?, screening_updated_at = ?
      WHERE project_id = ? AND paper_id = ?
    `).run(decision, cleanReason, stamp, projectId, paperId);
    if (result.changes === 0) throw new ResearchStoreError('PROJECT_PAPER_NOT_FOUND', '项目中没有该文献', 404);
    this.#audit('screening.paper.update', 'paper', paperId, { projectId, stage, decision, reason: cleanReason });
    return this.listProjectPapers(projectId).find(paper => paper.id === paperId) || null;
  }

  updatePaperScreeningBatch({ projectId, paperIds, stage, decision, reason = '' }) {
    if (!['title_abstract', 'full_text'].includes(stage)) throw new ResearchStoreError('SCREENING_STAGE_INVALID', '筛选阶段无效', 400);
    if (!['pending', 'include', 'exclude', 'maybe'].includes(decision)) throw new ResearchStoreError('SCREENING_DECISION_INVALID', '筛选结论无效', 400);
    const ids = [...new Set((Array.isArray(paperIds) ? paperIds : []).map(value => String(value || '')).filter(Boolean))];
    if (!ids.length || ids.length > 500) throw new ResearchStoreError('SCREENING_BATCH_INVALID', '请选择 1–500 篇项目文献', 400);
    const cleanReason = String(reason || '').trim();
    if (cleanReason.length > 500) throw new ResearchStoreError('SCREENING_REASON_TOO_LONG', '筛选理由不能超过 500 字', 400);
    if (decision === 'exclude' && !cleanReason) throw new ResearchStoreError('SCREENING_REASON_REQUIRED', '批量排除时必须填写理由', 400);
    const placeholders = ids.map(() => '?').join(',');
    const found = this.db.prepare(`SELECT paper_id FROM project_papers WHERE project_id = ? AND paper_id IN (${placeholders})`).all(projectId, ...ids);
    if (found.length !== ids.length) throw new ResearchStoreError('PROJECT_PAPER_NOT_FOUND', '所选文献中有项目外文献', 404);
    const decisionColumn = stage === 'title_abstract' ? 'title_abstract_decision' : 'full_text_decision';
    const reasonColumn = stage === 'title_abstract' ? 'title_abstract_reason' : 'full_text_reason';
    const stamp = nowIso();
    const update = this.db.prepare(`UPDATE project_papers SET ${decisionColumn} = ?, ${reasonColumn} = ?, screening_updated_at = ? WHERE project_id = ? AND paper_id = ?`);
    withTransaction(this.db, () => { for (const paperId of ids) update.run(decision, cleanReason, stamp, projectId, paperId); });
    this.#audit('screening.paper.batch', 'project', projectId, { stage, decision, count: ids.length, reason: cleanReason });
    return { updated: ids.length, overview: this.buildScreeningOverview(projectId) };
  }

  buildScreeningOverview(projectId) {
    const papers = this.listProjectPapers(projectId);
    const count = (field, decision) => papers.filter(paper => paper[field] === decision).length;
    return {
      projectId,
      criteria: this.listScreeningCriteria(projectId),
      titleAbstract: Object.fromEntries(['pending', 'include', 'maybe', 'exclude'].map(decision => [decision, count('titleAbstractDecision', decision)])),
      fullText: Object.fromEntries(['pending', 'include', 'maybe', 'exclude'].map(decision => [decision, count('fullTextDecision', decision)])),
      total: papers.length,
      finalIncluded: count('fullTextDecision', 'include'),
      papers,
      dualScreening: this.buildDualScreeningOverview(projectId, papers),
      prisma: this.buildPrismaOverview(projectId, papers),
    };
  }

  listPrismaBatches(projectId) {
    if (!this.getProject(projectId)) throw new ResearchStoreError('PROJECT_NOT_FOUND', '项目不存在', 404);
    return this.db.prepare(`SELECT * FROM project_prisma_batches WHERE project_id = ? ORDER BY COALESCE(searched_at, created_at) DESC, created_at DESC`).all(projectId).map(row => ({
      id: row.id,
      projectId: row.project_id,
      sourceType: row.source_type,
      sourceName: row.source_name,
      query: row.query || '',
      searchedAt: row.searched_at || null,
      recordsFound: Number(row.records_found || 0),
      duplicatesRemoved: Number(row.duplicates_removed || 0),
      removedOther: Number(row.removed_other || 0),
      recordsImported: Number(row.records_imported || 0),
      notes: row.notes || '',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  #normalizePrismaBatch(input, current = null) {
    const sourceType = String(input?.sourceType ?? current?.sourceType ?? 'database');
    const sourceName = String(input?.sourceName ?? current?.sourceName ?? '').trim();
    const query = String(input?.query ?? current?.query ?? '').trim();
    const searchedAtInput = input?.searchedAt ?? current?.searchedAt ?? null;
    const searchedAt = searchedAtInput ? String(searchedAtInput).trim() : null;
    const notes = String(input?.notes ?? current?.notes ?? '').trim();
    const integer = (value, fallback = 0) => {
      const parsed = Number(value ?? fallback);
      return Number.isInteger(parsed) && parsed >= 0 ? parsed : NaN;
    };
    const recordsFound = integer(input?.recordsFound, current?.recordsFound);
    const duplicatesRemoved = integer(input?.duplicatesRemoved, current?.duplicatesRemoved);
    const removedOther = integer(input?.removedOther, current?.removedOther);
    const recordsImported = integer(input?.recordsImported, current?.recordsImported);
    if (!['database', 'register', 'other'].includes(sourceType)) throw new ResearchStoreError('PRISMA_BATCH_INVALID', '来源类型无效', 400);
    if (!sourceName || sourceName.length > 120) throw new ResearchStoreError('PRISMA_BATCH_INVALID', '来源名称不能为空且不能超过 120 字', 400);
    if (query.length > 4000 || notes.length > 1000) throw new ResearchStoreError('PRISMA_BATCH_INVALID', '检索式或备注过长', 400);
    if (searchedAt && !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(searchedAt)) throw new ResearchStoreError('PRISMA_BATCH_INVALID', '检索日期格式无效', 400);
    if ([recordsFound, duplicatesRemoved, removedOther, recordsImported].some(Number.isNaN)) throw new ResearchStoreError('PRISMA_BATCH_INVALID', '批次数量必须是非负整数', 400);
    if (duplicatesRemoved + removedOther > recordsFound) throw new ResearchStoreError('PRISMA_BATCH_INVALID', '去重数与其他移除数之和不能超过检索记录数', 400);
    if (recordsImported > recordsFound - duplicatesRemoved - removedOther) throw new ResearchStoreError('PRISMA_BATCH_INVALID', '导入项目数不能超过移除后的可用记录数', 400);
    return { sourceType, sourceName, query, searchedAt, recordsFound, duplicatesRemoved, removedOther, recordsImported, notes };
  }

  createPrismaBatch(projectId, input = {}) {
    if (!this.getProject(projectId)) throw new ResearchStoreError('PROJECT_NOT_FOUND', '项目不存在', 404);
    const item = this.#normalizePrismaBatch(input);
    const id = crypto.randomUUID();
    const stamp = nowIso();
    this.db.prepare(`INSERT INTO project_prisma_batches(id, project_id, source_type, source_name, query, searched_at, records_found, duplicates_removed, removed_other, records_imported, notes, created_at, updated_at)
      VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, projectId, item.sourceType, item.sourceName, item.query, item.searchedAt, item.recordsFound, item.duplicatesRemoved, item.removedOther, item.recordsImported, item.notes, stamp, stamp);
    this.#audit('prisma.batch.create', 'prisma_batch', id, { projectId, sourceName: item.sourceName, recordsFound: item.recordsFound });
    return this.listPrismaBatches(projectId).find(batch => batch.id === id);
  }

  updatePrismaBatch(projectId, batchId, input = {}) {
    const current = this.listPrismaBatches(projectId).find(batch => batch.id === batchId);
    if (!current) throw new ResearchStoreError('PRISMA_BATCH_NOT_FOUND', '检索批次不存在', 404);
    const item = this.#normalizePrismaBatch(input, current);
    const stamp = nowIso();
    this.db.prepare(`UPDATE project_prisma_batches SET source_type = ?, source_name = ?, query = ?, searched_at = ?, records_found = ?, duplicates_removed = ?, removed_other = ?, records_imported = ?, notes = ?, updated_at = ? WHERE id = ? AND project_id = ?`)
      .run(item.sourceType, item.sourceName, item.query, item.searchedAt, item.recordsFound, item.duplicatesRemoved, item.removedOther, item.recordsImported, item.notes, stamp, batchId, projectId);
    this.#audit('prisma.batch.update', 'prisma_batch', batchId, { projectId, sourceName: item.sourceName, recordsFound: item.recordsFound });
    return this.listPrismaBatches(projectId).find(batch => batch.id === batchId);
  }

  deletePrismaBatch(projectId, batchId) {
    if (!this.getProject(projectId)) throw new ResearchStoreError('PROJECT_NOT_FOUND', '项目不存在', 404);
    const result = this.db.prepare('DELETE FROM project_prisma_batches WHERE id = ? AND project_id = ?').run(batchId, projectId);
    if (!result.changes) throw new ResearchStoreError('PRISMA_BATCH_NOT_FOUND', '检索批次不存在', 404);
    this.#audit('prisma.batch.delete', 'prisma_batch', batchId, { projectId });
    return { deleted: true, id: batchId };
  }

  updatePaperRetrieval({ projectId, paperId, status, reason = '' }) {
    const normalized = String(status || '');
    if (!['auto', 'sought', 'retrieved', 'not_retrieved'].includes(normalized)) throw new ResearchStoreError('PRISMA_RETRIEVAL_INVALID', '全文获取状态无效', 400);
    const cleanReason = String(reason || '').trim();
    if (cleanReason.length > 500) throw new ResearchStoreError('PRISMA_RETRIEVAL_INVALID', '全文获取说明不能超过 500 字', 400);
    if (normalized === 'not_retrieved' && !cleanReason) throw new ResearchStoreError('PRISMA_RETRIEVAL_REASON_REQUIRED', '无法获取全文时必须填写原因', 400);
    const result = this.db.prepare('UPDATE project_papers SET retrieval_status = ?, retrieval_reason = ?, retrieval_updated_at = ? WHERE project_id = ? AND paper_id = ?')
      .run(normalized, normalized === 'auto' ? '' : cleanReason, nowIso(), projectId, paperId);
    if (!result.changes) throw new ResearchStoreError('PROJECT_PAPER_NOT_FOUND', '项目中没有该文献', 404);
    this.#audit('prisma.retrieval.update', 'paper', paperId, { projectId, status: normalized, reason: cleanReason });
    const papers = this.listProjectPapers(projectId);
    return { paper: papers.find(paper => paper.id === paperId), prisma: this.buildPrismaOverview(projectId, papers) };
  }

  buildPrismaOverview(projectId, paperRows = null) {
    const papers = paperRows || this.listProjectPapers(projectId);
    const batches = this.listPrismaBatches(projectId);
    const sum = (rows, field) => rows.reduce((total, row) => total + Number(row[field] || 0), 0);
    const databaseBatches = batches.filter(batch => batch.sourceType !== 'other');
    const otherBatches = batches.filter(batch => batch.sourceType === 'other');
    const databaseRecords = sum(databaseBatches, 'recordsFound');
    const otherRecords = sum(otherBatches, 'recordsFound');
    const identified = databaseRecords + otherRecords;
    const duplicatesRemoved = sum(batches, 'duplicatesRemoved');
    const removedOther = sum(batches, 'removedOther');
    const imported = sum(batches, 'recordsImported');
    const effectiveStatus = paper => {
      if (paper.retrievalStatus && paper.retrievalStatus !== 'auto') return paper.retrievalStatus;
      if (paper.fullTextDecision !== 'pending') return 'retrieved';
      if (['include', 'maybe'].includes(paper.titleAbstractDecision)) return paper.attachmentId ? 'retrieved' : 'sought';
      return 'not_sought';
    };
    const statuses = Object.fromEntries(['not_sought', 'sought', 'retrieved', 'not_retrieved'].map(status => [status, papers.filter(paper => effectiveStatus(paper) === status).length]));
    const titleScreened = papers.filter(paper => paper.titleAbstractDecision !== 'pending').length;
    const reportsSought = statuses.sought + statuses.retrieved + statuses.not_retrieved;
    const reportsAssessed = papers.filter(paper => paper.fullTextDecision !== 'pending').length;
    const exclusionReasons = new Map();
    for (const paper of papers.filter(item => item.fullTextDecision === 'exclude')) {
      const reason = String(paper.fullTextReason || '未填写具体理由').trim();
      exclusionReasons.set(reason, (exclusionReasons.get(reason) || 0) + 1);
    }
    const reasonGroups = [...exclusionReasons.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason, 'zh-CN'));
    const accountedAfterRemoval = Math.max(0, identified - duplicatesRemoved - removedOther);
    const warnings = [];
    if (!batches.length) warnings.push('尚未登记检索批次；识别与去重数字无法从项目文献反推。');
    if (batches.length && imported !== papers.length) warnings.push(`批次登记导入 ${imported} 条，当前项目有 ${papers.length} 篇；请核对跨批次重复、后续增删或漏记。`);
    if (batches.length && accountedAfterRemoval !== imported) warnings.push(`移除后应有 ${accountedAfterRemoval} 条，但登记导入 ${imported} 条；尚有 ${Math.abs(accountedAfterRemoval - imported)} 条未对齐。`);
    return {
      projectId,
      complete: batches.length > 0 && warnings.length === 0,
      warnings,
      batches,
      identification: { databaseRecords, otherRecords, total: identified, duplicatesRemoved, removedOther, afterRemoval: accountedAfterRemoval, imported },
      screening: { projectRecords: papers.length, screened: titleScreened, awaiting: papers.length - titleScreened, excluded: papers.filter(paper => paper.titleAbstractDecision === 'exclude').length },
      retrieval: { sought: reportsSought, retrieved: statuses.retrieved, notRetrieved: statuses.not_retrieved, awaiting: statuses.sought, notSought: statuses.not_sought },
      eligibility: { assessed: reportsAssessed, awaiting: papers.filter(paper => effectiveStatus(paper) === 'retrieved' && paper.fullTextDecision === 'pending').length, excluded: papers.filter(paper => paper.fullTextDecision === 'exclude').length, maybe: papers.filter(paper => paper.fullTextDecision === 'maybe').length, exclusionReasons: reasonGroups },
      included: { studies: papers.filter(paper => paper.fullTextDecision === 'include').length },
      generatedAt: nowIso(),
    };
  }

  getDualScreeningConfig(projectId) {
    if (!this.getProject(projectId)) throw new ResearchStoreError('PROJECT_NOT_FOUND', '项目不存在', 404);
    const row = this.db.prepare('SELECT * FROM project_dual_screening_config WHERE project_id = ?').get(projectId);
    return {
      projectId,
      enabled: row?.enabled === 1,
      reviewerAName: row?.reviewer_a_name || '审查者 A',
      reviewerBName: row?.reviewer_b_name || '审查者 B',
      updatedAt: row?.updated_at || null,
    };
  }

  configureDualScreening(projectId, { enabled = false, reviewerAName = '审查者 A', reviewerBName = '审查者 B', importLegacy = false } = {}) {
    if (!this.getProject(projectId)) throw new ResearchStoreError('PROJECT_NOT_FOUND', '项目不存在', 404);
    const cleanA = String(reviewerAName || '').trim().slice(0, 60);
    const cleanB = String(reviewerBName || '').trim().slice(0, 60);
    if (!cleanA || !cleanB) throw new ResearchStoreError('SCREENING_REVIEWER_NAME_REQUIRED', '两位审查者的名称都不能为空', 400);
    if (cleanA.toLocaleLowerCase() === cleanB.toLocaleLowerCase()) throw new ResearchStoreError('SCREENING_REVIEWER_NAME_DUPLICATE', '两位审查者需要使用不同名称', 400);
    const stamp = nowIso();
    let imported = 0;
    withTransaction(this.db, () => {
      this.db.prepare(`INSERT INTO project_dual_screening_config(project_id, enabled, reviewer_a_name, reviewer_b_name, created_at, updated_at)
        VALUES(?, ?, ?, ?, ?, ?) ON CONFLICT(project_id) DO UPDATE SET enabled = excluded.enabled, reviewer_a_name = excluded.reviewer_a_name, reviewer_b_name = excluded.reviewer_b_name, updated_at = excluded.updated_at`)
        .run(projectId, enabled ? 1 : 0, cleanA, cleanB, stamp, stamp);
      if (enabled && importLegacy) {
        const memberships = this.db.prepare('SELECT * FROM project_papers WHERE project_id = ?').all(projectId);
        const insert = this.db.prepare(`INSERT OR IGNORE INTO paper_screening_reviews(project_id, paper_id, stage, reviewer_key, decision, reason, updated_at) VALUES(?, ?, ?, 'a', ?, ?, ?)`);
        for (const row of memberships) {
          if ((row.title_abstract_decision || 'pending') !== 'pending') imported += Number(insert.run(projectId, row.paper_id, 'title_abstract', row.title_abstract_decision, row.title_abstract_reason || '', row.screening_updated_at || stamp).changes || 0);
          if ((row.full_text_decision || 'pending') !== 'pending') imported += Number(insert.run(projectId, row.paper_id, 'full_text', row.full_text_decision, row.full_text_reason || '', row.screening_updated_at || stamp).changes || 0);
        }
      }
    });
    this.#audit('screening.dual.configure', 'project', projectId, { enabled: Boolean(enabled), reviewerAName: cleanA, reviewerBName: cleanB, imported });
    return { config: this.getDualScreeningConfig(projectId), imported, overview: this.buildDualScreeningOverview(projectId) };
  }

  updateIndependentScreening({ projectId, paperId, stage, reviewerKey, decision, reason = '' }) {
    const config = this.getDualScreeningConfig(projectId);
    if (!config.enabled) throw new ResearchStoreError('DUAL_SCREENING_DISABLED', '请先为当前项目启用双人筛选', 409);
    if (!['title_abstract', 'full_text'].includes(stage)) throw new ResearchStoreError('SCREENING_STAGE_INVALID', '筛选阶段无效', 400);
    if (!['a', 'b'].includes(reviewerKey)) throw new ResearchStoreError('SCREENING_REVIEWER_INVALID', '审查者标识无效', 400);
    if (!['pending', 'include', 'exclude', 'maybe'].includes(decision)) throw new ResearchStoreError('SCREENING_DECISION_INVALID', '筛选结论无效', 400);
    const membership = this.db.prepare('SELECT 1 AS ok FROM project_papers WHERE project_id = ? AND paper_id = ?').get(projectId, paperId);
    if (!membership) throw new ResearchStoreError('PROJECT_PAPER_NOT_FOUND', '项目中没有该文献', 404);
    const cleanReason = String(reason || '').trim();
    if (cleanReason.length > 500) throw new ResearchStoreError('SCREENING_REASON_TOO_LONG', '筛选理由不能超过 500 字', 400);
    if (decision === 'exclude' && !cleanReason) throw new ResearchStoreError('SCREENING_REASON_REQUIRED', '排除文献时必须填写理由', 400);
    const stamp = nowIso();
    withTransaction(this.db, () => {
      this.db.prepare(`INSERT INTO paper_screening_reviews(project_id, paper_id, stage, reviewer_key, decision, reason, updated_at)
        VALUES(?, ?, ?, ?, ?, ?, ?) ON CONFLICT(project_id, paper_id, stage, reviewer_key) DO UPDATE SET decision = excluded.decision, reason = excluded.reason, updated_at = excluded.updated_at`)
        .run(projectId, paperId, stage, reviewerKey, decision, cleanReason, stamp);
      this.db.prepare('DELETE FROM paper_screening_resolutions WHERE project_id = ? AND paper_id = ? AND stage = ?').run(projectId, paperId, stage);
      this.#syncDualScreeningFinal(projectId, paperId, stage, stamp);
    });
    this.#audit('screening.dual.review', 'paper', paperId, { projectId, stage, reviewerKey, decision, reason: cleanReason });
    return this.buildDualScreeningOverview(projectId).byPaper[paperId];
  }

  resolveScreeningConflict({ projectId, paperId, stage, decision, reason = '', resolutionNote = '' }) {
    const config = this.getDualScreeningConfig(projectId);
    if (!config.enabled) throw new ResearchStoreError('DUAL_SCREENING_DISABLED', '请先为当前项目启用双人筛选', 409);
    if (!['title_abstract', 'full_text'].includes(stage)) throw new ResearchStoreError('SCREENING_STAGE_INVALID', '筛选阶段无效', 400);
    if (!['include', 'exclude', 'maybe'].includes(decision)) throw new ResearchStoreError('SCREENING_DECISION_INVALID', '仲裁结论无效', 400);
    const reviews = this.db.prepare('SELECT * FROM paper_screening_reviews WHERE project_id = ? AND paper_id = ? AND stage = ?').all(projectId, paperId, stage);
    const a = reviews.find(row => row.reviewer_key === 'a');
    const b = reviews.find(row => row.reviewer_key === 'b');
    if (!a || !b || a.decision === 'pending' || b.decision === 'pending' || a.decision === b.decision) {
      throw new ResearchStoreError('SCREENING_CONFLICT_NOT_READY', '只有两位审查者均已提交且结论不一致时才能仲裁', 409);
    }
    const cleanReason = String(reason || '').trim();
    const cleanNote = String(resolutionNote || '').trim();
    if (cleanReason.length > 500 || cleanNote.length > 1000) throw new ResearchStoreError('SCREENING_REASON_TOO_LONG', '仲裁理由或说明过长', 400);
    if (decision === 'exclude' && !cleanReason) throw new ResearchStoreError('SCREENING_REASON_REQUIRED', '仲裁为排除时必须填写理由', 400);
    const stamp = nowIso();
    withTransaction(this.db, () => {
      this.db.prepare(`INSERT INTO paper_screening_resolutions(project_id, paper_id, stage, decision, reason, resolution_note, resolved_at)
        VALUES(?, ?, ?, ?, ?, ?, ?) ON CONFLICT(project_id, paper_id, stage) DO UPDATE SET decision = excluded.decision, reason = excluded.reason, resolution_note = excluded.resolution_note, resolved_at = excluded.resolved_at`)
        .run(projectId, paperId, stage, decision, cleanReason, cleanNote, stamp);
      this.#syncDualScreeningFinal(projectId, paperId, stage, stamp);
    });
    this.#audit('screening.dual.resolve', 'paper', paperId, { projectId, stage, decision, reason: cleanReason, resolutionNote: cleanNote });
    return this.buildDualScreeningOverview(projectId).byPaper[paperId];
  }

  buildDualScreeningOverview(projectId, paperRows = null) {
    const config = this.getDualScreeningConfig(projectId);
    const papers = paperRows || this.listProjectPapers(projectId);
    const reviews = this.db.prepare('SELECT * FROM paper_screening_reviews WHERE project_id = ?').all(projectId);
    const resolutions = this.db.prepare('SELECT * FROM paper_screening_resolutions WHERE project_id = ?').all(projectId);
    const reviewMap = new Map(reviews.map(row => [`${row.paper_id}::${row.stage}::${row.reviewer_key}`, row]));
    const resolutionMap = new Map(resolutions.map(row => [`${row.paper_id}::${row.stage}`, row]));
    const stages = ['title_abstract', 'full_text'];
    const byPaper = {};
    const conflicts = [];
    for (const paper of papers) {
      byPaper[paper.id] = { paperId: paper.id, title: paper.title };
      for (const stage of stages) {
        const viewReview = key => {
          const row = reviewMap.get(`${paper.id}::${stage}::${key}`);
          return { decision: row?.decision || 'pending', reason: row?.reason || '', updatedAt: row?.updated_at || null };
        };
        const a = viewReview('a');
        const b = viewReview('b');
        const resolutionRow = resolutionMap.get(`${paper.id}::${stage}`);
        const resolution = resolutionRow ? { decision: resolutionRow.decision, reason: resolutionRow.reason || '', resolutionNote: resolutionRow.resolution_note || '', resolvedAt: resolutionRow.resolved_at } : null;
        const complete = a.decision !== 'pending' && b.decision !== 'pending';
        const agreed = complete && a.decision === b.decision;
        const status = resolution ? 'resolved' : (!complete ? (a.decision === 'pending' && b.decision === 'pending' ? 'unreviewed' : 'in_progress') : (agreed ? 'agreement' : 'conflict'));
        const finalDecision = resolution?.decision || (agreed ? a.decision : 'pending');
        const item = { stage, a, b, status, complete, agreed, finalDecision, resolution };
        byPaper[paper.id][stage === 'title_abstract' ? 'titleAbstract' : 'fullText'] = item;
        if (status === 'conflict') conflicts.push({ paperId: paper.id, title: paper.title, stage, a, b });
      }
    }
    const stageStats = {};
    for (const stage of stages) {
      const items = Object.values(byPaper).map(item => item[stage === 'title_abstract' ? 'titleAbstract' : 'fullText']);
      const paired = items.filter(item => item.complete);
      const agreementCount = paired.filter(item => item.agreed).length;
      const categories = ['include', 'maybe', 'exclude'];
      let kappa = null;
      if (paired.length >= 2) {
        const observed = agreementCount / paired.length;
        const expected = categories.reduce((sum, decision) => {
          const pa = paired.filter(item => item.a.decision === decision).length / paired.length;
          const pb = paired.filter(item => item.b.decision === decision).length / paired.length;
          return sum + pa * pb;
        }, 0);
        kappa = Math.abs(1 - expected) < 1e-12 ? (observed === 1 ? 1 : 0) : (observed - expected) / (1 - expected);
        kappa = Math.round(kappa * 1000) / 1000;
      }
      stageStats[stage === 'title_abstract' ? 'titleAbstract' : 'fullText'] = {
        total: items.length,
        paired: paired.length,
        agreementCount,
        agreementRate: paired.length ? Math.round((agreementCount / paired.length) * 1000) / 10 : null,
        kappa,
        counts: Object.fromEntries(['unreviewed', 'in_progress', 'agreement', 'conflict', 'resolved'].map(status => [status, items.filter(item => item.status === status).length])),
      };
    }
    return { config, byPaper, conflicts, conflictCount: conflicts.length, stages: stageStats };
  }

  #syncDualScreeningFinal(projectId, paperId, stage, stamp) {
    const reviews = this.db.prepare('SELECT reviewer_key, decision, reason FROM paper_screening_reviews WHERE project_id = ? AND paper_id = ? AND stage = ?').all(projectId, paperId, stage);
    const a = reviews.find(row => row.reviewer_key === 'a');
    const b = reviews.find(row => row.reviewer_key === 'b');
    const resolution = this.db.prepare('SELECT decision, reason FROM paper_screening_resolutions WHERE project_id = ? AND paper_id = ? AND stage = ?').get(projectId, paperId, stage);
    const agreed = a && b && a.decision !== 'pending' && a.decision === b.decision;
    const decision = resolution?.decision || (agreed ? a.decision : 'pending');
    const reason = resolution?.reason || (agreed ? (a.reason || b.reason || '') : '');
    const decisionColumn = stage === 'title_abstract' ? 'title_abstract_decision' : 'full_text_decision';
    const reasonColumn = stage === 'title_abstract' ? 'title_abstract_reason' : 'full_text_reason';
    this.db.prepare(`UPDATE project_papers SET ${decisionColumn} = ?, ${reasonColumn} = ?, screening_updated_at = ? WHERE project_id = ? AND paper_id = ?`)
      .run(decision, reason, stamp, projectId, paperId);
  }

  // ── 研究编码（v15：项目字段定义 + 逐篇结构化证据值） ──

  listEvidenceFields(projectId) {
    if (!this.getProject(projectId)) throw new ResearchStoreError('PROJECT_NOT_FOUND', '项目不存在', 404);
    return this.db.prepare(`
      SELECT * FROM project_evidence_fields
      WHERE project_id = ?
      ORDER BY position ASC, created_at ASC
    `).all(projectId).map(evidenceFieldRow);
  }

  replaceEvidenceFields(projectId, fields, { force = false } = {}) {
    if (!this.getProject(projectId)) throw new ResearchStoreError('PROJECT_NOT_FOUND', '项目不存在', 404);
    if (!Array.isArray(fields) || fields.length > 30) throw new ResearchStoreError('EVIDENCE_FIELDS_INVALID', '研究编码字段必须是最多 30 项的数组', 400);
    const existing = this.listEvidenceFields(projectId);
    const existingIds = new Set(existing.map(field => field.id));
    const labels = new Set();
    const normalized = fields.map((item, index) => {
      const label = String(item?.label || '').trim();
      const description = String(item?.description || '').trim();
      const type = String(item?.type || 'text');
      if (!label || label.length > 80) throw new ResearchStoreError('EVIDENCE_FIELDS_INVALID', '字段名称不能为空且不能超过 80 字', 400);
      const labelKey = label.toLocaleLowerCase('zh-CN');
      if (labels.has(labelKey)) throw new ResearchStoreError('EVIDENCE_FIELDS_DUPLICATE', `字段“${label}”重复`, 400);
      labels.add(labelKey);
      if (description.length > 500) throw new ResearchStoreError('EVIDENCE_FIELDS_INVALID', `“${label}”的说明不能超过 500 字`, 400);
      if (!['text', 'number', 'select', 'multi_select', 'boolean'].includes(type)) throw new ResearchStoreError('EVIDENCE_FIELDS_INVALID', `“${label}”的字段类型无效`, 400);
      let options = [...new Set((Array.isArray(item?.options) ? item.options : []).map(value => String(value).trim()).filter(Boolean))];
      if (options.some(value => value.length > 80) || options.length > 30) throw new ResearchStoreError('EVIDENCE_FIELDS_INVALID', `“${label}”的选项最多 30 项且每项不超过 80 字`, 400);
      if (['select', 'multi_select'].includes(type) && options.length < 1) throw new ResearchStoreError('EVIDENCE_FIELDS_INVALID', `“${label}”至少需要一个选项`, 400);
      if (!['select', 'multi_select'].includes(type)) options = [];
      return {
        id: existingIds.has(String(item?.id || '')) ? String(item.id) : crypto.randomUUID(),
        projectId,
        label,
        description,
        type,
        options,
        position: index,
        required: item?.required === true,
      };
    });
    const keptIds = new Set(normalized.map(field => field.id));
    const removedIds = existing.filter(field => !keptIds.has(field.id)).map(field => field.id);
    let removedValueCount = 0;
    if (removedIds.length) {
      const placeholders = removedIds.map(() => '?').join(',');
      removedValueCount = Number(this.db.prepare(`SELECT COUNT(*) AS c FROM project_paper_evidence_values WHERE project_id = ? AND field_id IN (${placeholders})`).get(projectId, ...removedIds)?.c || 0);
    }
    const incompatibleValues = [];
    const convertedValues = [];
    for (const field of normalized) {
      const previous = existing.find(item => item.id === field.id);
      if (!previous || (previous.type === field.type && JSON.stringify(previous.options) === JSON.stringify(field.options))) continue;
      const rows = this.db.prepare('SELECT paper_id, value_json FROM project_paper_evidence_values WHERE project_id = ? AND field_id = ?').all(projectId, field.id);
      for (const row of rows) {
        try {
          const nextValue = normalizeEvidenceValue(field, JSON.parse(row.value_json));
          if (nextValue === null) incompatibleValues.push({ paperId: row.paper_id, fieldId: field.id });
          else if (JSON.stringify(nextValue) !== row.value_json) convertedValues.push({ paperId: row.paper_id, fieldId: field.id, value: nextValue });
        } catch {
          incompatibleValues.push({ paperId: row.paper_id, fieldId: field.id });
        }
      }
    }
    const destructiveValueCount = removedValueCount + incompatibleValues.length;
    if (destructiveValueCount > 0 && !force) {
      throw new ResearchStoreError('EVIDENCE_FIELDS_IN_USE', '移除字段或修改字段类型会删除不兼容的已有编码，请确认后重试', 409, { fieldCount: new Set([...removedIds, ...incompatibleValues.map(item => item.fieldId)]).size, valueCount: destructiveValueCount });
    }
    const stamp = nowIso();
    withTransaction(this.db, () => {
      if (removedIds.length) {
        const placeholders = removedIds.map(() => '?').join(',');
        this.db.prepare(`DELETE FROM project_evidence_fields WHERE project_id = ? AND id IN (${placeholders})`).run(projectId, ...removedIds);
      }
      const upsert = this.db.prepare(`
        INSERT INTO project_evidence_fields(id, project_id, label, description, field_type, options_json, position, required, created_at, updated_at)
        VALUES(@id, @projectId, @label, @description, @type, @optionsJson, @position, @required, @createdAt, @updatedAt)
        ON CONFLICT(id) DO UPDATE SET label = excluded.label, description = excluded.description,
          field_type = excluded.field_type, options_json = excluded.options_json, position = excluded.position,
          required = excluded.required, updated_at = excluded.updated_at
      `);
      for (const field of normalized) upsert.run({
        id: field.id,
        projectId: field.projectId,
        label: field.label,
        description: field.description,
        type: field.type,
        optionsJson: JSON.stringify(field.options),
        position: field.position,
        required: field.required ? 1 : 0,
        createdAt: existingIds.has(field.id) ? (existing.find(item => item.id === field.id)?.createdAt || stamp) : stamp,
        updatedAt: stamp,
      });
      const deleteValue = this.db.prepare('DELETE FROM project_paper_evidence_values WHERE project_id = ? AND paper_id = ? AND field_id = ?');
      for (const item of incompatibleValues) deleteValue.run(projectId, item.paperId, item.fieldId);
      const updateValue = this.db.prepare('UPDATE project_paper_evidence_values SET value_json = ?, updated_at = ? WHERE project_id = ? AND paper_id = ? AND field_id = ?');
      for (const item of convertedValues) updateValue.run(JSON.stringify(item.value), stamp, projectId, item.paperId, item.fieldId);
    });
    this.#audit('evidence.fields.replace', 'project', projectId, { count: normalized.length, removed: removedIds.length, removedValueCount, incompatibleValueCount: incompatibleValues.length });
    return this.listEvidenceFields(projectId);
  }

  getEvidenceCoding(projectId) {
    const fields = this.listEvidenceFields(projectId);
    const papers = this.listProjectPapers(projectId);
    const values = Object.fromEntries(papers.map(paper => [paper.id, {}]));
    const rows = this.db.prepare(`
      SELECT paper_id, field_id, value_json FROM project_paper_evidence_values
      WHERE project_id = ?
    `).all(projectId);
    for (const row of rows) {
      if (!values[row.paper_id]) values[row.paper_id] = {};
      try { values[row.paper_id][row.field_id] = JSON.parse(row.value_json); } catch { values[row.paper_id][row.field_id] = null; }
    }
    const required = fields.filter(field => field.required);
    const paperStats = Object.fromEntries(papers.map(paper => {
      const paperValues = values[paper.id] || {};
      const coded = fields.filter(field => !evidenceValueIsEmpty(paperValues[field.id])).length;
      const complete = fields.length > 0 && required.every(field => !evidenceValueIsEmpty(paperValues[field.id]));
      return [paper.id, { coded, total: fields.length, complete }];
    }));
    return {
      projectId,
      fields,
      templates: EVIDENCE_CODING_TEMPLATES,
      values,
      paperStats,
      totalPapers: papers.length,
      papersCoded: Object.values(paperStats).filter(item => item.coded > 0).length,
      papersComplete: Object.values(paperStats).filter(item => item.complete).length,
    };
  }

  updatePaperEvidenceCoding({ projectId, paperId, values }) {
    const membership = this.db.prepare('SELECT 1 AS ok FROM project_papers WHERE project_id = ? AND paper_id = ?').get(projectId, paperId);
    if (!membership) throw new ResearchStoreError('PROJECT_PAPER_NOT_FOUND', '项目中没有该文献', 404);
    if (!values || typeof values !== 'object' || Array.isArray(values)) throw new ResearchStoreError('EVIDENCE_VALUES_INVALID', '研究编码必须是字段值对象', 400);
    const fields = this.listEvidenceFields(projectId);
    const fieldMap = new Map(fields.map(field => [field.id, field]));
    const entries = Object.entries(values);
    if (entries.length > 30) throw new ResearchStoreError('EVIDENCE_VALUES_INVALID', '单次最多更新 30 个编码字段', 400);
    const normalized = entries.map(([fieldId, value]) => {
      const field = fieldMap.get(fieldId);
      if (!field) throw new ResearchStoreError('EVIDENCE_FIELD_NOT_FOUND', '研究编码字段不存在或不属于当前项目', 404);
      return [fieldId, normalizeEvidenceValue(field, value)];
    });
    const stamp = nowIso();
    const upsert = this.db.prepare(`
      INSERT INTO project_paper_evidence_values(project_id, paper_id, field_id, value_json, updated_at)
      VALUES(?, ?, ?, ?, ?)
      ON CONFLICT(project_id, paper_id, field_id) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
    `);
    const remove = this.db.prepare('DELETE FROM project_paper_evidence_values WHERE project_id = ? AND paper_id = ? AND field_id = ?');
    withTransaction(this.db, () => {
      for (const [fieldId, value] of normalized) {
        if (value === null) remove.run(projectId, paperId, fieldId);
        else upsert.run(projectId, paperId, fieldId, JSON.stringify(value), stamp);
      }
    });
    this.#audit('evidence.paper.update', 'paper', paperId, { projectId, fields: normalized.map(([fieldId]) => fieldId) });
    const coding = this.getEvidenceCoding(projectId);
    return { paperId, values: coding.values[paperId] || {}, stats: coding.paperStats[paperId] };
  }

  // ── 文献关系（P2 增强：P5 项目内论证链：A 支持/反驳/被 B 引用） ──

  listPaperRelations(projectId) {
    if (!this.getProject(projectId)) throw new ResearchStoreError('PROJECT_NOT_FOUND', '项目不存在', 404);
    return this.db.prepare(`
      SELECT r.*, fp.title AS from_title, tp.title AS to_title
      FROM paper_relations r
      JOIN papers fp ON fp.id = r.from_paper_id
      JOIN papers tp ON tp.id = r.to_paper_id
      WHERE r.project_id = ?
      ORDER BY r.created_at DESC
    `).all(projectId).map(paperRelationRow);
  }

  addPaperRelation({ projectId, fromPaperId, toPaperId, relation, note = '' }) {
    if (!this.getProject(projectId)) throw new ResearchStoreError('PROJECT_NOT_FOUND', '项目不存在', 404);
    if (!['supports', 'refutes', 'cites'].includes(relation)) {
      throw new ResearchStoreError('RELATION_INVALID', '关系类型只能是支持/反驳/被引用', 400);
    }
    const fromId = String(fromPaperId || '');
    const toId = String(toPaperId || '');
    if (!fromId || !toId) throw new ResearchStoreError('RELATION_PAPERS_REQUIRED', '请选择两篇文献', 400);
    if (fromId === toId) throw new ResearchStoreError('RELATION_SELF', '不能与自身建立关系', 400);
    const projectPaperIds = new Set(this.listProjectPapers(projectId).map((paper) => paper.id));
    if (!projectPaperIds.has(fromId) || !projectPaperIds.has(toId)) {
      throw new ResearchStoreError('RELATION_PAPER_NOT_IN_PROJECT', '关系两端的文献都必须在本项目中', 400);
    }
    const duplicate = this.db.prepare(`
      SELECT id FROM paper_relations
      WHERE project_id = ? AND from_paper_id = ? AND to_paper_id = ? AND relation = ?
    `).get(projectId, fromId, toId, relation);
    if (duplicate) throw new ResearchStoreError('RELATION_EXISTS', '该文献关系已存在', 409);
    const id = crypto.randomUUID();
    const timestamp = nowIso();
    this.db.prepare(`
      INSERT INTO paper_relations(id, project_id, from_paper_id, to_paper_id, relation, note, created_at)
      VALUES(?, ?, ?, ?, ?, ?, ?)
    `).run(id, projectId, fromId, toId, relation, String(note || '').trim().slice(0, 500), timestamp);
    this.#audit('paper.relation.add', 'paper_relation', id, { projectId, fromPaperId: fromId, toPaperId: toId, relation });
    return this.listPaperRelations(projectId).find((rel) => rel.id === id) || null;
  }

  removePaperRelation(relationId) {
    const row = this.db.prepare('SELECT * FROM paper_relations WHERE id = ?').get(relationId);
    if (!row) throw new ResearchStoreError('RELATION_NOT_FOUND', '文献关系不存在', 404);
    this.db.prepare('DELETE FROM paper_relations WHERE id = ?').run(relationId);
    this.#audit('paper.relation.remove', 'paper_relation', relationId, { projectId: row.project_id });
    return true;
  }

  // ── 证据矩阵（P2 增强：P4 研究问题 × 文献 表格式视图） ──

  buildEvidenceMatrix(projectId) {
    const papers = this.listProjectPapers(projectId);
    const coding = this.getEvidenceCoding(projectId);
    const notes = this.listNotes(projectId);
    const relations = this.listPaperRelations(projectId);
    const notesByPaper = new Map();
    for (const note of notes) {
      const key = note.paperId || '__general__';
      if (!notesByPaper.has(key)) notesByPaper.set(key, []);
      notesByPaper.get(key).push(note);
    }
    const relationLines = relations.map((rel) => {
      const label = { supports: '支持', refutes: '反驳', cites: '引用' }[rel.relation] || rel.relation;
      return `${rel.fromTitle} ${label} ${rel.toTitle}${rel.note ? `（${rel.note}）` : ''}`;
    });
    return {
      projectId,
      fields: coding.fields,
      papers: papers.map((paper) => {
        const paperNotes = notesByPaper.get(paper.id) || [];
        const merged = paperNotes
          .map((note) => (note.quote ? `「${note.quote}」` : '') + (note.content || ''))
          .filter(Boolean)
          .join('\n')
          .slice(0, 1200);
        return {
          id: paper.id,
          title: paper.title,
          venue: paper.venue,
          year: paper.year,
          role: paper.role || '',
          titleAbstractDecision: paper.titleAbstractDecision || 'pending',
          titleAbstractReason: paper.titleAbstractReason || '',
          fullTextDecision: paper.fullTextDecision || 'pending',
          fullTextReason: paper.fullTextReason || '',
          codingValues: coding.values[paper.id] || {},
          codingStats: coding.paperStats[paper.id] || { coded: 0, total: coding.fields.length, complete: false },
          methodology: paper.methodology || [],
          design: (paper.methodology || []).join('、'),
          noteCount: paperNotes.length,
          notesSummary: merged,
          tags: [...new Set(paperNotes.flatMap((note) => note.tags || []))].join('、'),
        };
      }),
      generalNotes: notesByPaper.get('__general__')?.map((note) => note.content) || [],
      relations: relationLines,
    };
  }

  // ── 研究驾驶舱聚合（P6：概览/副驾驶/研究闭环使用真实数据，不伪造进度） ──

  buildCockpitStats(projectId) {
    if (!this.getProject(projectId)) throw new ResearchStoreError('PROJECT_NOT_FOUND', '项目不存在', 404);
    const papers = this.listProjectPapers(projectId);
    const notes = this.listNotes(projectId);
    const relations = this.listPaperRelations(projectId);
    const paperIdExpr = 'SELECT paper_id FROM project_papers WHERE project_id = ?';
    const papersWithPdf = papers.filter((p) => p.attachmentId);
    const notedPaperIds = new Set(notes.map((n) => n.paperId).filter(Boolean));
    const sentenceNotedPaperIds = new Set(
      this.db.prepare(`SELECT DISTINCT paper_id AS pid FROM sentence_notes WHERE paper_id IN (${paperIdExpr})`)
        .all(projectId).map((r) => r.pid)
    );
    const tasks = notes.filter((note) => Array.isArray(note.tags) && note.tags.includes('研究任务'));
    const todoTasks = tasks.filter((task) => !task.tags.includes('状态:完成'));
    const doneTasks = tasks.filter((task) => task.tags.includes('状态:完成'));
    const relationType = { supports: 0, refutes: 0, cites: 0 };
    for (const rel of relations) {
      if (relationType[rel.relation] !== undefined) relationType[rel.relation] += 1;
    }
    const sentenceNotes = Number(this.db.prepare(
      `SELECT COUNT(*) AS c FROM sentence_notes WHERE paper_id IN (${paperIdExpr})`
    ).get(projectId)?.c || 0);
    const noteDocuments = Number(this.db.prepare(
      `SELECT COUNT(*) AS c FROM paper_note_documents WHERE paper_id IN (${paperIdExpr})`
    ).get(projectId)?.c || 0);
    const translations = Number(this.db.prepare(
      'SELECT COUNT(*) AS c FROM translation_docs WHERE project_id = ?'
    ).get(projectId)?.c || 0);
    const reading = this.db.prepare(`
      SELECT r.paper_id, r.current_page, r.updated_at, p.title, MIN(a.id) AS attachment_id
      FROM paper_reading_state r
      JOIN papers p ON p.id = r.paper_id
      LEFT JOIN attachments a ON a.paper_id = p.id AND a.kind = 'pdf'
      WHERE r.paper_id IN (${paperIdExpr})
      GROUP BY r.paper_id
      ORDER BY r.updated_at DESC
      LIMIT 5
    `).all(projectId).map((row) => ({
      paperId: row.paper_id,
      page: Number(row.current_page || 1),
      title: row.title,
      attachmentId: row.attachment_id || null,
      updatedAt: row.updated_at,
    }));
    const savedSearches = Number(this.db.prepare('SELECT COUNT(*) AS c FROM saved_searches').get()?.c || 0);
    const researchQuestions = notes.filter((n) => (n.tags || []).some((tag) => tag.startsWith('研究问题'))).length;
    const candidates = papersWithPdf
      .filter((p) => !notedPaperIds.has(p.id) && !sentenceNotedPaperIds.has(p.id))
      .slice(0, 3)
      .map((p) => ({ id: p.id, title: p.title, attachmentId: p.attachmentId }));
    const evidences = notes.filter((n) => (n.tags || []).some((tag) => tag.startsWith('证据'))).length;
    return {
      projectId,
      projectStatus: this.getProject(projectId)?.status || 'active',
      papers: {
        total: papers.length,
        withPdf: papersWithPdf.length,
        metadataOnly: papers.length - papersWithPdf.length,
        read: papers.filter((p) => p.readStatus === 'read').length,
        reading: papers.filter((p) => p.readStatus === 'reading').length,
        star: papers.filter((p) => p.favorite).length,
      },
      evidence: {
        sentenceNotes,
        notes: notes.length,
        researchQuestions,
        evidences,
        categories: this.listNoteCategories().length,
      },
      writing: {
        noteDocuments,
        translations,
        total: noteDocuments + translations,
      },
      tasks: {
        todo: todoTasks.length,
        done: doneTasks.length,
        total: tasks.length,
        open: todoTasks.map((task) => ({
          id: task.id,
          content: String(task.content || '').slice(0, 120),
          priority: (task.tags || []).find((tag) => tag.startsWith('优先级:'))?.slice('优先级:'.length) || '普通',
          due: (task.tags || []).find((tag) => tag.startsWith('截止:'))?.slice('截止:'.length) || '',
          paperTitle: task.paperTitle || null,
        })),
      },
      relations: { total: relations.length, ...relationType },
      reading,
      candidates,
      searches: { saved: savedSearches, hasSearches: savedSearches > 0 },
    };
  }

  // ── 宿主能力（前端探测新增功能是否可用，避免宿主未重启时静默失败） ──

  hostCapabilities() {
    return {
      evidence: true,
      screening: true,
      evidenceCoding: true,
      cockpitStats: true,
      settings: true,
    };
  }

  // ── 保存的检索（P2 增强：L6 检索历史与一键重跑） ──

  listSavedSearches() {
    return this.db.prepare(`
      SELECT * FROM saved_searches ORDER BY updated_at DESC
    `).all().map(savedSearchRow);
  }

  getSavedSearch(searchId) {
    return savedSearchRow(this.db.prepare('SELECT * FROM saved_searches WHERE id = ?').get(searchId));
  }

  saveSearch({ name, query, sources, perSource = 8, filters = {} } = {}) {
    const cleanName = String(name || '').trim();
    if (!cleanName) throw new ResearchStoreError('SEARCH_NAME_REQUIRED', '请为保存的检索命名', 400);
    if (cleanName.length > 60) throw new ResearchStoreError('SEARCH_NAME_TOO_LONG', '名称不能超过 60 个字符', 400);
    const cleanQuery = String(query || '').trim();
    if (!cleanQuery) throw new ResearchStoreError('SEARCH_QUERY_REQUIRED', '检索关键词不能为空', 400);
    const id = crypto.randomUUID();
    const timestamp = nowIso();
    this.db.prepare(`
      INSERT INTO saved_searches(id, name, query, sources, per_source, filters, created_at, updated_at)
      VALUES(?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, cleanName, cleanQuery,
      JSON.stringify(Array.isArray(sources) ? sources.map(String).filter(Boolean) : []),
      Number.isInteger(Number(perSource)) ? Math.min(Math.max(Number(perSource), 1), 25) : 8,
      JSON.stringify(filters && typeof filters === 'object' ? filters : {}),
      timestamp, timestamp,
    );
    this.#audit('search.save', 'saved_search', id, { name: cleanName, query: cleanQuery });
    return this.getSavedSearch(id);
  }

  updateSavedSearch(searchId, { name, alertEnabled } = {}) {
    const existing = this.db.prepare('SELECT * FROM saved_searches WHERE id = ?').get(searchId);
    if (!existing) throw new ResearchStoreError('SEARCH_NOT_FOUND', '保存的检索不存在', 404);
    const nextName = name === undefined ? existing.name : String(name).trim();
    if (!nextName) throw new ResearchStoreError('SEARCH_NAME_REQUIRED', '名称不能为空', 400);
    if (nextName.length > 60) throw new ResearchStoreError('SEARCH_NAME_TOO_LONG', '名称不能超过 60 个字符', 400);
    const nextAlert = alertEnabled === undefined ? existing.alert_enabled : (alertEnabled ? 1 : 0);
    this.db.prepare('UPDATE saved_searches SET name = ?, alert_enabled = ?, updated_at = ? WHERE id = ?')
      .run(nextName, nextAlert, nowIso(), searchId);
    this.#audit('search.update', 'saved_search', searchId, { alertEnabled: nextAlert === 1 });
    return this.getSavedSearch(searchId);
  }

  deleteSavedSearch(searchId) {
    const result = this.db.prepare('DELETE FROM saved_searches WHERE id = ?').run(searchId);
    if (result.changes === 0) throw new ResearchStoreError('SEARCH_NOT_FOUND', '保存的检索不存在', 404);
    this.#audit('search.delete', 'saved_search', searchId);
    return true;
  }

  /**
   * 记录保存检索的一次实际运行结果集合，返回相对上次运行的新增结果 id。
   * 首次运行不视为「新增」（newIds 为空）。
   */
  recordSearchRun(searchId, resultIds) {
    const existing = this.db.prepare('SELECT * FROM saved_searches WHERE id = ?').get(searchId);
    if (!existing) throw new ResearchStoreError('SEARCH_NOT_FOUND', '保存的检索不存在', 404);
    const previous = JSON.parse(existing.last_result_ids || '[]');
    const current = Array.isArray(resultIds) ? resultIds.map(String).filter(Boolean) : [];
    const previousSet = new Set(previous);
    const newIds = previous.length ? current.filter((id) => !previousSet.has(id)) : [];
    const timestamp = nowIso();
    this.db.prepare(`
      UPDATE saved_searches
      SET last_run_at = ?, last_result_ids = ?, last_result_count = ?, updated_at = ?
      WHERE id = ?
    `).run(timestamp, JSON.stringify(current), current.length, timestamp, searchId);
    return { newIds, total: current.length, firstRun: previous.length === 0 };
  }

  /** 标记期刊源已查看（新文献徽标依据）：记录查看时间。 */
  touchJournalViewed(sourceId) {
    this.db.prepare('UPDATE journal_sources SET last_viewed_at = ? WHERE id = ?').run(nowIso(), sourceId);
    return this.db.prepare('SELECT * FROM journal_sources WHERE id = ?').get(sourceId)
      ? this.listJournalSources().find((source) => source.id === sourceId) || null
      : null;
  }

  /** 添加自定义期刊源（P1 增强）：按 ISSN 追踪任意 OpenAlex 收录期刊。 */
  addCustomJournalSource({ venue, issn, topic = '自定义' }) {
    const cleanVenue = String(venue || '').trim();
    const cleanIssn = normalizeIssn(issn);
    if (!cleanVenue || !cleanIssn) {
      throw new ResearchStoreError('JOURNAL_SOURCE_REQUIRED', '请填写期刊名称与有效 ISSN', 400);
    }
    const id = `custom-${cleanIssn.replace(/[^0-9xX]/gi, '').toLowerCase()}`;
    const existing = this.db.prepare('SELECT * FROM journal_sources WHERE id = ? OR issn = ?').get(id, cleanIssn);
    if (existing) {
      throw new ResearchStoreError('JOURNAL_SOURCE_EXISTS', '该 ISSN 已在期刊源列表中', 409);
    }
    this.db.prepare(`
      INSERT INTO journal_sources(id, venue, issn, topic, enabled, is_custom, created_at)
      VALUES(?, ?, ?, ?, 1, 1, ?)
    `).run(id, cleanVenue, cleanIssn, String(topic).trim().slice(0, 60) || '自定义', nowIso());
    this.#audit('journal.source.custom', 'journal', id, { venue: cleanVenue, issn: cleanIssn });
    return this.listJournalSources().find((source) => source.id === id) || null;
  }

  /** 更新期刊源：内置源只允许启停；自定义源可编辑名称、ISSN 与主题。 */
  updateJournalSource(sourceId, patch = {}) {
    const row = this.db.prepare('SELECT * FROM journal_sources WHERE id = ?').get(sourceId);
    if (!row) throw new ResearchStoreError('JOURNAL_SOURCE_NOT_FOUND', '期刊源不存在', 404);
    const isCustom = row.is_custom === 1;
    const editsMetadata = patch.venue !== undefined || patch.issn !== undefined || patch.topic !== undefined;
    if (editsMetadata && !isCustom) {
      throw new ResearchStoreError('JOURNAL_SOURCE_BUILTIN_LOCKED', '内置期刊只能暂停或启用，不能修改题录信息', 403);
    }
    const venue = editsMetadata ? String(patch.venue ?? row.venue).trim().slice(0, 120) : row.venue;
    const issn = editsMetadata ? normalizeIssn(patch.issn ?? row.issn) : row.issn;
    const topic = editsMetadata ? String(patch.topic ?? row.topic).trim().slice(0, 60) || '自定义' : row.topic;
    if (!venue || !issn) throw new ResearchStoreError('JOURNAL_SOURCE_REQUIRED', '请填写期刊名称与有效 ISSN', 400);
    if (issn !== row.issn) {
      const duplicate = this.db.prepare('SELECT id FROM journal_sources WHERE issn = ? AND id <> ?').get(issn, sourceId);
      if (duplicate) throw new ResearchStoreError('JOURNAL_SOURCE_EXISTS', '该 ISSN 已在期刊源列表中', 409);
    }
    const enabled = patch.enabled === undefined ? row.enabled : (patch.enabled ? 1 : 0);
    this.db.prepare(`
      UPDATE journal_sources SET venue = ?, issn = ?, topic = ?, enabled = ? WHERE id = ?
    `).run(venue, issn, topic, enabled, sourceId);
    this.#audit('journal.source.update', 'journal', sourceId, { venue, issn, topic, enabled: Boolean(enabled) });
    return this.listJournalSources().find(source => source.id === sourceId) || null;
  }

  /** 删除自定义期刊源；已同步文献保留在文献库中。 */
  deleteCustomJournalSource(sourceId) {
    const row = this.db.prepare('SELECT * FROM journal_sources WHERE id = ?').get(sourceId);
    if (!row) throw new ResearchStoreError('JOURNAL_SOURCE_NOT_FOUND', '期刊源不存在', 404);
    if (row.is_custom !== 1) {
      throw new ResearchStoreError('JOURNAL_SOURCE_BUILTIN_LOCKED', '内置期刊不能删除，可以将它暂停', 403);
    }
    withTransaction(this.db, () => {
      this.db.prepare('DELETE FROM journal_sync_log WHERE source_id = ?').run(sourceId);
      this.db.prepare('DELETE FROM journal_sources WHERE id = ?').run(sourceId);
      this.#audit('journal.source.delete', 'journal', sourceId, { venue: row.venue, issn: row.issn });
    });
    return { id: sourceId, venue: row.venue, deleted: true, papersPreserved: true };
  }

  /** 记录阅读进度（P1 增强：重开续读）。 */
  setReadingProgress(attachmentId, pageNumber) {
    const page = Number(pageNumber);
    if (!Number.isInteger(page) || page < 1 || page > 100_000) {
      throw new ResearchStoreError('PAGE_NUMBER_INVALID', '页码必须是正整数', 400);
    }
    const result = this.db.prepare(`
      UPDATE attachments SET last_page = ?, last_read_at = ? WHERE id = ?
    `).run(page, nowIso(), attachmentId);
    if (result.changes === 0) throw new ResearchStoreError('ATTACHMENT_NOT_FOUND', 'PDF 附件不存在', 404);
    return { attachmentId, lastPage: page, lastReadAt: nowIso() };
  }

  /** 更新项目类型/状态（P1 增强）。 */
  updateProjectMeta(projectId, { projectType, status } = {}) {
    const row = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
    if (!row) throw new ResearchStoreError('PROJECT_NOT_FOUND', '项目不存在', 404);
    const nextType = typeof projectType === 'string' ? projectType.trim().slice(0, 40) : row.project_type || '';
    const nextStatus = ['active', 'done', 'archived'].includes(status) ? status : row.status || 'active';
    this.db.prepare('UPDATE projects SET project_type = ?, status = ?, updated_at = ? WHERE id = ?')
      .run(nextType, nextStatus, nowIso(), projectId);
    this.#audit('project.meta', 'project', projectId, { projectType: nextType, status: nextStatus });
    return this.getProject(projectId);
  }

  /** 每刊新增文献计数（created_at 晚于 last_viewed_at，且未收藏过/未标记已读）。 */
  journalNewCounts() {
    const rows = this.db.prepare(`
      SELECT s.id AS source_id, s.venue, s.last_viewed_at,
        COUNT(p.id) AS new_count
      FROM journal_sources s
      LEFT JOIN papers p ON p.venue = s.venue
        AND p.source_name = '期刊同步'
        AND p.read_status = 'unread'
        AND (s.last_viewed_at IS NULL OR p.created_at > s.last_viewed_at)
      GROUP BY s.id
    `).all();
    return Object.fromEntries(rows.map((row) => [row.source_id, Number(row.new_count || 0)]));
  }

  // ── 文献集合（P1 增强：Collections） ──

  listCollections() {
    return this.db.prepare(`
      SELECT c.*, COUNT(cp.paper_id) AS paper_count
      FROM collections c
      LEFT JOIN collection_papers cp ON cp.collection_id = c.id
      GROUP BY c.id
      ORDER BY c.updated_at DESC, c.created_at DESC
    `).all().map(row => ({
      id: row.id,
      title: row.title,
      description: row.description,
      paperCount: Number(row.paper_count || 0),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  createCollection({ title, description = '' }) {
    const cleanTitle = String(title || '').trim();
    if (!cleanTitle) throw new ResearchStoreError('COLLECTION_TITLE_REQUIRED', '收藏集名称不能为空', 400);
    const id = `collection-${crypto.randomUUID().slice(0, 12)}`;
    const timestamp = nowIso();
    this.db.prepare(`
      INSERT INTO collections(id, title, description, created_at, updated_at)
      VALUES(?, ?, ?, ?, ?)
    `).run(id, cleanTitle.slice(0, 80), String(description || '').trim().slice(0, 300), timestamp, timestamp);
    this.#audit('collection.create', 'collection', id, { title: cleanTitle });
    return this.listCollections().find(item => item.id === id) || null;
  }

  deleteCollection(collectionId) {
    const result = this.db.prepare('DELETE FROM collections WHERE id = ?').run(collectionId);
    if (result.changes === 0) throw new ResearchStoreError('COLLECTION_NOT_FOUND', '收藏集不存在', 404);
    this.#audit('collection.delete', 'collection', collectionId);
    return true;
  }

  addPaperToCollection(collectionId, paperId) {
    if (!this.db.prepare('SELECT 1 FROM collections WHERE id = ?').get(collectionId)) {
      throw new ResearchStoreError('COLLECTION_NOT_FOUND', '收藏集不存在', 404);
    }
    if (!this.db.prepare('SELECT 1 FROM papers WHERE id = ?').get(paperId)) {
      throw new ResearchStoreError('PAPER_NOT_FOUND', '文献不存在', 404);
    }
    this.db.prepare(`
      INSERT OR IGNORE INTO collection_papers(collection_id, paper_id, added_at) VALUES(?, ?, ?)
    `).run(collectionId, paperId, nowIso());
    this.db.prepare('UPDATE collections SET updated_at = ? WHERE id = ?').run(nowIso(), collectionId);
    this.#audit('collection.paper.add', 'collection', collectionId, { paperId });
    return true;
  }

  removePaperFromCollection(collectionId, paperId) {
    const result = this.db.prepare(`
      DELETE FROM collection_papers WHERE collection_id = ? AND paper_id = ?
    `).run(collectionId, paperId);
    if (result.changes === 0) throw new ResearchStoreError('COLLECTION_PAPER_NOT_FOUND', '该文献不在收藏集中', 404);
    this.db.prepare('UPDATE collections SET updated_at = ? WHERE id = ?').run(nowIso(), collectionId);
    this.#audit('collection.paper.remove', 'collection', collectionId, { paperId });
    return true;
  }

  /** 全量文献→集合关系映射（供文献列表合并 collectionIds）。 */
  paperCollectionMap() {
    const rows = this.db.prepare(`
      SELECT paper_id, collection_id FROM collection_papers ORDER BY added_at ASC
    `).all();
    const map = new Map();
    for (const row of rows) {
      if (!map.has(row.paper_id)) map.set(row.paper_id, []);
      map.get(row.paper_id).push(row.collection_id);
    }
    return map;
  }

  findReusableAttachment(paper) {
    const doi = String(paper?.doi || '').trim() || null;
    const sourceUrl = String(paper?.pdfUrl || '').trim() || null;
    const row = this.db.prepare(`
      SELECT a.*, p.id AS matched_paper_id
      FROM attachments a
      JOIN papers p ON p.id = a.paper_id
      WHERE (? IS NOT NULL AND p.doi = ?)
         OR (? IS NOT NULL AND a.source_url = ?)
      ORDER BY a.created_at DESC
      LIMIT 1
    `).get(doi, doi, sourceUrl, sourceUrl);
    if (!row) return null;
    const absolutePath = this.resolveAttachmentPath(row.relative_path);
    return fs.existsSync(absolutePath) ? { ...row, absolutePath } : null;
  }

  findAttachmentBySha256(sha256) {
    const digest = String(sha256 || '').trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(digest)) return null;
    const row = this.db.prepare(`
      SELECT a.*, p.id AS matched_paper_id
      FROM attachments a
      JOIN papers p ON p.id = a.paper_id
      WHERE a.sha256 = ?
      ORDER BY a.created_at DESC
      LIMIT 1
    `).get(digest);
    if (!row) return null;
    const absolutePath = this.resolveAttachmentPath(row.relative_path);
    return fs.existsSync(absolutePath) ? { ...row, absolutePath } : null;
  }

  importPaperAttachment({ projectId, paper, attachment }) {
    if (!this.getProject(projectId)) throw new ResearchStoreError('PROJECT_NOT_FOUND', '项目不存在', 404);
    const normalized = normalizePaper(paper);
    const timestamp = nowIso();
    const attachmentId = attachment.id || crypto.randomUUID();
    withTransaction(this.db, () => {
      this.db.prepare(`
        INSERT INTO papers(
          id, doi, title, authors, venue, year, abstract, topic, pdf_url, source_url,
          source_name, cited_by_count, openalex_id, created_at, updated_at
        ) VALUES(
          @id, @doi, @title, @authors, @venue, @year, @abstract, @topic, @pdfUrl,
          @sourceUrl, @sourceName, @citedByCount, @openalexId, @createdAt, @updatedAt
        )
        ON CONFLICT(id) DO UPDATE SET
          doi = COALESCE(excluded.doi, papers.doi), title = excluded.title,
          authors = excluded.authors, venue = excluded.venue, year = excluded.year,
          abstract = excluded.abstract, topic = excluded.topic,
          pdf_url = COALESCE(excluded.pdf_url, papers.pdf_url),
          source_url = COALESCE(excluded.source_url, papers.source_url),
          source_name = COALESCE(excluded.source_name, papers.source_name),
          cited_by_count = COALESCE(excluded.cited_by_count, papers.cited_by_count),
          openalex_id = COALESCE(excluded.openalex_id, papers.openalex_id),
          updated_at = excluded.updated_at
      `).run({ ...normalized, createdAt: timestamp, updatedAt: timestamp });
      this.db.prepare(`
        INSERT OR IGNORE INTO project_papers(project_id, paper_id, added_at) VALUES(?, ?, ?)
      `).run(projectId, normalized.id, timestamp);
      this.db.prepare(`
        INSERT OR IGNORE INTO attachments(
          id, paper_id, kind, file_name, relative_path, mime_type, byte_size, sha256,
          source_url, created_at
        ) VALUES(?, ?, 'pdf', ?, ?, 'application/pdf', ?, ?, ?, ?)
      `).run(
        attachmentId,
        normalized.id,
        attachment.fileName,
        attachment.relativePath,
        attachment.byteSize,
        attachment.sha256,
        attachment.sourceUrl,
        timestamp,
      );
      this.db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(timestamp, projectId);
      this.#audit('paper.import_pdf', 'paper', normalized.id, {
        projectId,
        attachmentId,
        byteSize: attachment.byteSize,
        sha256: attachment.sha256,
      });
    });
    const saved = this.db.prepare('SELECT * FROM attachments WHERE paper_id = ? AND sha256 = ?')
      .get(normalized.id, attachment.sha256);
    return {
      project: this.getProject(projectId),
      paper: this.getPaper(normalized.id),
      attachment: attachmentRow(saved),
    };
  }

  linkExistingAttachment({ projectId, paper, attachment }) {
    const normalized = normalizePaper({ ...paper, id: attachment.matched_paper_id || paper.id });
    return this.importPaperAttachment({
      projectId,
      paper: normalized,
      attachment: {
        id: attachment.id,
        fileName: attachment.file_name,
        relativePath: attachment.relative_path,
        byteSize: attachment.byte_size,
        sha256: attachment.sha256,
        sourceUrl: attachment.source_url,
      },
    });
  }

  getAttachment(attachmentId) {
    const row = this.db.prepare('SELECT * FROM attachments WHERE id = ?').get(attachmentId);
    if (!row) return null;
    return { ...attachmentRow(row), absolutePath: this.resolveAttachmentPath(row.relative_path) };
  }

  getAttachmentContext(projectId, attachmentId) {
    const row = this.db.prepare(`
      SELECT a.*, p.title AS paper_title, p.authors AS paper_authors,
        p.venue AS paper_venue, p.year AS paper_year, p.doi AS paper_doi,
        pr.id AS project_id, pr.title AS project_title
      FROM attachments a
      JOIN papers p ON p.id = a.paper_id
      JOIN project_papers pp ON pp.paper_id = p.id
      JOIN projects pr ON pr.id = pp.project_id
      WHERE pr.id = ? AND a.id = ? AND pr.archived_at IS NULL
    `).get(projectId, attachmentId);
    if (!row) throw new ResearchStoreError('ATTACHMENT_NOT_IN_PROJECT', '该 PDF 不属于当前项目', 404);
    return {
      project: { id: row.project_id, title: row.project_title },
      paper: {
        id: row.paper_id,
        title: row.paper_title,
        authors: row.paper_authors,
        venue: row.paper_venue,
        year: row.paper_year,
        doi: row.paper_doi || null,
      },
      attachment: attachmentRow(row),
    };
  }

  listAnnotations(projectId, attachmentId) {
    this.getAttachmentContext(projectId, attachmentId);
    return this.db.prepare(`
      SELECT * FROM annotations
      WHERE project_id = ? AND attachment_id = ?
      ORDER BY page_number ASC, created_at ASC
    `).all(projectId, attachmentId).map(annotationRow);
  }

  createAnnotation({ projectId, attachmentId, pageNumber, kind, payload }) {
    this.getAttachmentContext(projectId, attachmentId);
    const normalizedPage = normalizePageNumber(pageNumber, true);
    const normalizedKind = String(kind || '').trim();
    if (!ANNOTATION_KINDS.has(normalizedKind)) {
      throw new ResearchStoreError('ANNOTATION_KIND_INVALID', '不支持的批注类型', 400);
    }
    const normalizedPayload = normalizeAnnotationPayload(payload);
    const id = crypto.randomUUID();
    const timestamp = nowIso();
    this.db.prepare(`
      INSERT INTO annotations(id, project_id, attachment_id, page_number, kind, payload_json, created_at, updated_at)
      VALUES(?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, projectId, attachmentId, normalizedPage, normalizedKind, JSON.stringify(normalizedPayload), timestamp, timestamp);
    this.db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(timestamp, projectId);
    this.#audit('annotation.create', 'annotation', id, { projectId, attachmentId, pageNumber: normalizedPage, kind: normalizedKind });
    return annotationRow(this.db.prepare('SELECT * FROM annotations WHERE id = ?').get(id));
  }

  deleteAnnotation(projectId, annotationId) {
    const row = this.db.prepare('SELECT * FROM annotations WHERE id = ? AND project_id = ?').get(annotationId, projectId);
    if (!row) throw new ResearchStoreError('ANNOTATION_NOT_FOUND', '批注不存在', 404);
    this.db.prepare('DELETE FROM annotations WHERE id = ?').run(annotationId);
    this.db.prepare('UPDATE notes SET annotation_id = NULL WHERE project_id = ? AND annotation_id = ?').run(projectId, annotationId);
    // v12：标记关联引文定位失效（保留引文文本）
    this.markCitationsStaleByAnnotation(annotationId);
    this.#audit('annotation.delete', 'annotation', annotationId, { projectId, attachmentId: row.attachment_id });
    this.syncProjectNotesFile(projectId);
    return { id: annotationId };
  }

  listNotes(projectId, attachmentId = null) {
    if (attachmentId) this.getAttachmentContext(projectId, attachmentId);
    else if (!this.getProject(projectId)) throw new ResearchStoreError('PROJECT_NOT_FOUND', '项目不存在', 404);
    const rows = attachmentId
      ? this.db.prepare(`
          SELECT n.*, p.title AS paper_title, p.venue AS paper_venue, p.year AS paper_year,
            lp.title AS linked_paper_title
          FROM notes n
          LEFT JOIN papers p ON p.id = n.paper_id
          LEFT JOIN papers lp ON lp.id = n.linked_paper_id
          WHERE n.project_id = ? AND n.attachment_id = ?
          ORDER BY n.created_at DESC
        `).all(projectId, attachmentId)
      : this.db.prepare(`
          SELECT n.*, p.title AS paper_title, p.venue AS paper_venue, p.year AS paper_year,
            lp.title AS linked_paper_title
          FROM notes n
          LEFT JOIN papers p ON p.id = n.paper_id
          LEFT JOIN papers lp ON lp.id = n.linked_paper_id
          WHERE n.project_id = ?
          ORDER BY n.created_at DESC
        `).all(projectId);
    return rows.map(noteRow);
  }

  createNote({ projectId, attachmentId = null, paperId = null, pageNumber = null, content, quote = '', tags = [], annotationId = null, linkedPaperId = null }) {
    let context = null;
    if (attachmentId) context = this.getAttachmentContext(projectId, attachmentId);
    else if (!this.getProject(projectId)) throw new ResearchStoreError('PROJECT_NOT_FOUND', '项目不存在', 404);
    const normalizedContent = String(content || '').trim();
    if (!normalizedContent) throw new ResearchStoreError('NOTE_CONTENT_REQUIRED', '笔记内容不能为空', 400);
    if (normalizedContent.length > 10_000) throw new ResearchStoreError('NOTE_TOO_LONG', '单条笔记不能超过 10000 个字符', 400);
    const id = crypto.randomUUID();
    const timestamp = nowIso();
    const normalizedPage = normalizePageNumber(pageNumber, false);
    const linkedPaperIdValue = context?.paper.id || (paperId ? String(paperId) : null);
    const normalizedQuote = String(quote || '').trim().slice(0, 5000);
    const normalizedTags = normalizeTags(tags);
    // P2 增强（P11）：跨文献笔记关联——linkedPaperId 指向另一篇文献
    let crossLinked = null;
    if (linkedPaperId !== null && linkedPaperId !== undefined && linkedPaperId !== '') {
      const linked = this.db.prepare('SELECT id FROM papers WHERE id = ?').get(String(linkedPaperId));
      if (!linked) throw new ResearchStoreError('LINKED_PAPER_NOT_FOUND', '关联的文献不存在', 404);
      crossLinked = String(linkedPaperId);
    }
    this.db.prepare(`
      INSERT INTO notes(id, project_id, paper_id, attachment_id, page_number, content, quote, tags_json, annotation_id, linked_paper_id, created_at, updated_at)
      VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, projectId, linkedPaperIdValue, attachmentId, normalizedPage, normalizedContent, normalizedQuote, JSON.stringify(normalizedTags), annotationId, crossLinked, timestamp, timestamp);
    this.db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(timestamp, projectId);
    this.#audit('note.create', 'note', id, { projectId, attachmentId, pageNumber: normalizedPage, tags: normalizedTags, linkedPaperId: crossLinked });
    this.syncProjectNotesFile(projectId);
    return this.listNotes(projectId).find(note => note.id === id);
  }

  createSelectionNote({ projectId, attachmentId, pageNumber, quote, content = '', tags = [], rects, color = '#8bb8e8' }) {
    const context = this.getAttachmentContext(projectId, attachmentId);
    const normalizedPage = normalizePageNumber(pageNumber, true);
    const normalizedQuote = String(quote || '').trim().slice(0, 5000);
    if (!normalizedQuote) throw new ResearchStoreError('NOTE_QUOTE_REQUIRED', '选中文本不能为空', 400);
    const normalizedContent = String(content || '').trim().slice(0, 10_000);
    const normalizedTags = normalizeTags(tags);
    const normalizedPayload = normalizeAnnotationPayload({ rects, color, quote: normalizedQuote, tags: normalizedTags });
    const annotationId = crypto.randomUUID();
    const noteId = crypto.randomUUID();
    const timestamp = nowIso();
    withTransaction(this.db, () => {
      this.db.prepare(`
        INSERT INTO annotations(id, project_id, attachment_id, page_number, kind, payload_json, created_at, updated_at)
        VALUES(?, ?, ?, ?, 'highlight', ?, ?, ?)
      `).run(annotationId, projectId, attachmentId, normalizedPage, JSON.stringify(normalizedPayload), timestamp, timestamp);
      this.db.prepare(`
        INSERT INTO notes(id, project_id, paper_id, attachment_id, page_number, content, quote, tags_json, annotation_id, created_at, updated_at)
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(noteId, projectId, context.paper.id, attachmentId, normalizedPage, normalizedContent, normalizedQuote, JSON.stringify(normalizedTags), annotationId, timestamp, timestamp);
      this.db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(timestamp, projectId);
      this.#audit('selection-note.create', 'note', noteId, { projectId, attachmentId, pageNumber: normalizedPage, annotationId, tags: normalizedTags });
    });
    this.syncProjectNotesFile(projectId);
    return {
      annotation: annotationRow(this.db.prepare('SELECT * FROM annotations WHERE id = ?').get(annotationId)),
      note: this.listNotes(projectId).find(note => note.id === noteId),
    };
  }

  /**
   * v12 阅读工作区：高亮摘录 → 项目笔记（与旧版"选中高亮即记笔记"行为对齐）。
   * 批注已由 EmbedPDF 引擎管理（annotations.embed_pdf_data），这里只追加 notes 行，
   * annotation_id 关联到引擎批注 id；quote 必填、正文可空。
   */
  createHighlightNote({ attachmentId, pageNumber, quote, content = '', tags = [], annotationId = null }) {
    const attachment = this.db.prepare('SELECT * FROM attachments WHERE id = ?').get(attachmentId);
    if (!attachment) throw new ResearchStoreError('ATTACHMENT_NOT_FOUND', 'PDF 附件不存在', 404);
    const link = this.db.prepare(`
      SELECT pp.project_id FROM project_papers pp
      JOIN attachments a ON a.paper_id = pp.paper_id
      WHERE a.id = ? LIMIT 1
    `).get(attachmentId);
    if (!link?.project_id) throw new ResearchStoreError('ATTACHMENT_ORPHANED', 'PDF 附件未关联任何项目', 400);
    const projectId = link.project_id;
    const normalizedQuote = String(quote || '').trim().slice(0, 5000);
    if (!normalizedQuote) throw new ResearchStoreError('NOTE_QUOTE_REQUIRED', '选中文本不能为空', 400);
    const id = crypto.randomUUID();
    const timestamp = nowIso();
    const normalizedPage = normalizePageNumber(pageNumber, true);
    const normalizedContent = String(content || '').trim().slice(0, 10_000);
    const normalizedTags = normalizeTags(tags);
    const context = this.getAttachmentContext(projectId, attachmentId);
    this.db.prepare(`
      INSERT INTO notes(id, project_id, paper_id, attachment_id, page_number, content, quote, tags_json, annotation_id, created_at, updated_at)
      VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, projectId, context.paper.id, attachmentId, normalizedPage, normalizedContent, normalizedQuote,
      JSON.stringify(normalizedTags), annotationId || null, timestamp, timestamp);
    this.db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(timestamp, projectId);
    this.#audit('highlight-note.create', 'note', id, { projectId, attachmentId, pageNumber: normalizedPage, annotationId, tags: normalizedTags });
    this.syncProjectNotesFile(projectId);
    return this.listNotes(projectId).find(note => note.id === id);
  }

  deleteNote(projectId, noteId) {
    const row = this.db.prepare('SELECT * FROM notes WHERE id = ? AND project_id = ?').get(noteId, projectId);
    if (!row) throw new ResearchStoreError('NOTE_NOT_FOUND', '笔记不存在', 404);
    withTransaction(this.db, () => {
      this.db.prepare('DELETE FROM notes WHERE id = ?').run(noteId);
      if (row.annotation_id) this.db.prepare('DELETE FROM annotations WHERE id = ? AND project_id = ?').run(row.annotation_id, projectId);
    });
    if (row.annotation_id) {
      // v12：级联删除批注时同步标记关联引文定位失效
      this.markCitationsStaleByAnnotation(row.annotation_id);
    }
    this.#audit('note.delete', 'note', noteId, { projectId, attachmentId: row.attachment_id });
    this.syncProjectNotesFile(projectId);
    return { id: noteId, annotationId: row.annotation_id || null };
  }

  /**
   * 更新一条项目笔记的可编辑字段（content / quote / tags / pageNumber）。
   * 未提供的字段保持原值；关联高亮（annotation_id）存在时同步其 quote 与 tags，
   * 使摘录高亮与笔记文本保持一致；随后重建项目级 Markdown 并写 note.update 审计。
   */
  updateNote({ projectId, noteId, content, quote, tags, pageNumber }) {
    const row = this.db.prepare('SELECT * FROM notes WHERE id = ? AND project_id = ?').get(noteId, projectId);
    if (!row) throw new ResearchStoreError('NOTE_NOT_FOUND', '笔记不存在', 404);
    const nextContent = content === undefined ? String(row.content || '') : String(content || '');
    const normalizedContent = nextContent.trim();
    if (!normalizedContent) throw new ResearchStoreError('NOTE_CONTENT_REQUIRED', '笔记内容不能为空', 400);
    if (normalizedContent.length > 10_000) throw new ResearchStoreError('NOTE_TOO_LONG', '单条笔记不能超过 10000 个字符', 400);
    const nextQuote = quote === undefined
      ? String(row.quote || '')
      : String(quote || '').trim().slice(0, 5000);
    const nextTags = tags === undefined ? parseJsonArray(row.tags_json) : normalizeTags(tags);
    const nextPage = pageNumber === undefined ? row.page_number : normalizePageNumber(pageNumber, false);
    const timestamp = nowIso();

    withTransaction(this.db, () => {
      this.db.prepare(`
        UPDATE notes SET content = ?, quote = ?, tags_json = ?, page_number = ?, updated_at = ?
        WHERE id = ? AND project_id = ?
      `).run(normalizedContent, nextQuote, JSON.stringify(nextTags), nextPage, timestamp, noteId, projectId);
      if (row.annotation_id) {
        const annotation = this.db.prepare('SELECT * FROM annotations WHERE id = ?').get(row.annotation_id);
        if (annotation) {
          try {
            const payload = JSON.parse(annotation.payload_json || '{}');
            if (quote !== undefined) payload.quote = nextQuote;
            if (tags !== undefined) payload.tags = nextTags;
            this.db.prepare('UPDATE annotations SET payload_json = ?, updated_at = ? WHERE id = ?')
              .run(JSON.stringify(payload), timestamp, row.annotation_id);
          } catch {
            // 高亮载荷损坏时只更新笔记，不阻塞编辑
          }
        }
      }
      this.db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(timestamp, projectId);
    });
    this.#audit('note.update', 'note', noteId, { projectId, pageNumber: nextPage, tags: nextTags });
    this.syncProjectNotesFile(projectId);
    return this.listNotes(projectId).find(note => note.id === noteId);
  }

  // ════════════════════════════════════════════════════════
  // v12 阅读工作区：阅读状态 / 文献笔记 / 引文 / EmbedPDF 批注
  // ════════════════════════════════════════════════════════

  /** 读取某文献的阅读状态（不存在返回 null）。 */
  getReadingState(paperId) {
    const row = this.db.prepare('SELECT * FROM paper_reading_state WHERE paper_id = ?').get(paperId);
    if (!row) return null;
    return readingStateRow(row);
  }

  /** 原子 upsert 阅读状态（字段可选，未提供的保留旧值）。 */
  putReadingState({ paperId, currentPage, zoom, scrollMode, leftPanelWidth, rightPanelWidth, leftPanelCollapsed, rightPanelCollapsed, rightTab }) {
    if (!paperId) throw new ResearchStoreError('PAPER_REQUIRED', '文献 ID 不能为空', 400);
    const existing = this.getReadingState(paperId);
    const timestamp = nowIso();
    const next = {
      paperId,
      currentPage: currentPage === undefined || currentPage === null
        ? (existing?.currentPage ?? 1)
        : normalizePageNumber(currentPage, true),
      zoom: clampNumber(Number(zoom), 0.1, 8, existing?.zoom ?? 1),
      scrollMode: scrollMode === undefined || scrollMode === null
        ? (existing?.scrollMode ?? 'continuous')
        : String(scrollMode).slice(0, 20),
      leftPanelWidth: clampNumber(Number(leftPanelWidth), 160, 640, existing?.leftPanelWidth ?? 260),
      rightPanelWidth: clampNumber(Number(rightPanelWidth), 240, 720, existing?.rightPanelWidth ?? 380),
      leftPanelCollapsed: leftPanelCollapsed === undefined ? Boolean(existing?.leftPanelCollapsed) : Boolean(leftPanelCollapsed),
      rightPanelCollapsed: rightPanelCollapsed === undefined ? Boolean(existing?.rightPanelCollapsed) : Boolean(rightPanelCollapsed),
      rightTab: rightTab === undefined || rightTab === null
        ? (existing?.rightTab ?? 'sentence')
        : (rightTab === 'summary' ? 'summary' : 'sentence'),
    };
    this.db.prepare(`
      INSERT INTO paper_reading_state(
        paper_id, current_page, zoom, scroll_mode, left_panel_width, right_panel_width,
        left_panel_collapsed, right_panel_collapsed, right_tab, updated_at
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(paper_id) DO UPDATE SET
        current_page = excluded.current_page, zoom = excluded.zoom,
        scroll_mode = excluded.scroll_mode, left_panel_width = excluded.left_panel_width,
        right_panel_width = excluded.right_panel_width,
        left_panel_collapsed = excluded.left_panel_collapsed,
        right_panel_collapsed = excluded.right_panel_collapsed,
        right_tab = excluded.right_tab,
        updated_at = excluded.updated_at
    `).run(paperId, next.currentPage, next.zoom, next.scrollMode, next.leftPanelWidth, next.rightPanelWidth,
      next.leftPanelCollapsed ? 1 : 0, next.rightPanelCollapsed ? 1 : 0, next.rightTab, timestamp);
    return this.getReadingState(paperId);
  }

  /** 读取文献级笔记文档（Tiptap JSON + Markdown 镜像；不存在返回 null）。 */
  getPaperNoteDocument(paperId) {
    const row = this.db.prepare('SELECT * FROM paper_note_documents WHERE paper_id = ?').get(paperId);
    if (!row) return null;
    return noteDocumentRow(row);
  }

  /** 原子 upsert 文献笔记文档（保存失败抛错，由调用层提示）。v13 支持分类与标签。 */
  putPaperNoteDocument({ paperId, title, tiptapJson, markdown, categoryId, tags }) {
    if (!paperId) throw new ResearchStoreError('PAPER_REQUIRED', '文献 ID 不能为空', 400);
    const timestamp = nowIso();
    const existing = this.db.prepare('SELECT id FROM paper_note_documents WHERE paper_id = ?').get(paperId);
    const id = existing?.id || crypto.randomUUID();
    const tiptap = tiptapJson === undefined || tiptapJson === null ? {} : tiptapJson;
    const md = markdown === undefined || markdown === null ? '' : String(markdown);
    const titleText = String(title || '').trim().slice(0, 300);
    const nextCategory = categoryId === undefined ? (this.db.prepare('SELECT category_id FROM paper_note_documents WHERE paper_id = ?').get(paperId)?.category_id ?? null) : this.#resolveCategoryId(categoryId);
    const nextTags = tags === undefined
      ? (this.db.prepare('SELECT tags_json FROM paper_note_documents WHERE paper_id = ?').get(paperId)?.tags_json ?? '[]')
      : JSON.stringify(normalizeTags(tags));
    this.db.prepare(`
      INSERT INTO paper_note_documents(id, paper_id, title, tiptap_json, markdown, category_id, tags_json, created_at, updated_at)
      VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(paper_id) DO UPDATE SET
        title = excluded.title, tiptap_json = excluded.tiptap_json,
        markdown = excluded.markdown, category_id = excluded.category_id,
        tags_json = excluded.tags_json, updated_at = excluded.updated_at
    `).run(id, paperId, titleText, JSON.stringify(tiptap), md, nextCategory, nextTags, timestamp, timestamp);
    this.#audit('paper-note.save', 'note_document', id, { paperId, markdownLength: md.length });
    return this.getPaperNoteDocument(paperId);
  }

  /** 列出某笔记文档的全部引文（按页码排序）。 */
  listCitations(noteDocumentId) {
    return this.db.prepare(`
      SELECT * FROM note_citations WHERE note_document_id = ?
      ORDER BY page_number ASC, created_at ASC
    `).all(noteDocumentId).map(citationRow);
  }

  addCitation({ noteDocumentId, paperId, annotationId = null, pageNumber, quotedText, prefix = '', suffix = '' }) {
    if (!noteDocumentId) throw new ResearchStoreError('NOTE_REQUIRED', '笔记文档 ID 不能为空', 400);
    const doc = this.db.prepare('SELECT id FROM paper_note_documents WHERE id = ?').get(noteDocumentId);
    if (!doc) throw new ResearchStoreError('NOTE_NOT_FOUND', '笔记文档不存在', 404);
    const id = crypto.randomUUID();
    const timestamp = nowIso();
    this.db.prepare(`
      INSERT INTO note_citations(
        id, note_document_id, paper_id, annotation_id, page_number, quoted_text,
        prefix, suffix, annotation_deleted, created_at
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
    `).run(id, noteDocumentId, paperId, annotationId, normalizePageNumber(pageNumber, true),
      String(quotedText || '').trim().slice(0, 5000), String(prefix || '').slice(0, 500),
      String(suffix || '').slice(0, 500), timestamp);
    return this.listCitations(noteDocumentId).find(item => item.id === id);
  }

  updateCitation(citationId, { quotedText, prefix, suffix, pageNumber }) {
    const row = this.db.prepare('SELECT * FROM note_citations WHERE id = ?').get(citationId);
    if (!row) throw new ResearchStoreError('CITATION_NOT_FOUND', '引文不存在', 404);
    this.db.prepare(`
      UPDATE note_citations SET
        quoted_text = ?, prefix = ?, suffix = ?, page_number = ?
      WHERE id = ?
    `).run(
      quotedText === undefined ? row.quoted_text : String(quotedText).trim().slice(0, 5000),
      prefix === undefined ? row.prefix : String(prefix).slice(0, 500),
      suffix === undefined ? row.suffix : String(suffix).slice(0, 500),
      pageNumber === undefined ? row.page_number : normalizePageNumber(pageNumber, true),
      citationId,
    );
    return this.db.prepare('SELECT * FROM note_citations WHERE id = ?').get(citationId) && citationRow(this.db.prepare('SELECT * FROM note_citations WHERE id = ?').get(citationId));
  }

  deleteCitation(citationId) {
    const result = this.db.prepare('DELETE FROM note_citations WHERE id = ?').run(citationId);
    return { deleted: result.changes > 0 };
  }

  /** 批注被删除时标记相关引文定位失效（不删除引文文本本身）。 */
  markCitationsStaleByAnnotation(annotationId) {
    if (!annotationId) return 0;
    const result = this.db.prepare(`
      UPDATE note_citations SET annotation_deleted = 1 WHERE annotation_id = ?
    `).run(annotationId);
    return result.changes;
  }

  // ════════════════════════════════════════════════════════
  // v13 阅读工作区：逐句笔记 / 分类 / 标签颜色
  // ════════════════════════════════════════════════════════

  /** 批注被删除时标记相关逐句笔记定位失效（笔记保留，仅标记）。 */
  markSentenceNotesStaleByAnnotation(annotationId) {
    if (!annotationId) return 0;
    const result = this.db.prepare(`
      UPDATE sentence_notes SET annotation_deleted = 1, updated_at = ? WHERE annotation_id = ?
    `).run(nowIso(), annotationId);
    return result.changes;
  }

  /**
   * 列出某文献的逐句笔记；支持全文搜索、分类/标签/状态/收藏筛选与排序。
   * categoryId 传 'none' 表示未分类（含空值）。
   */
  listSentenceNotes({ paperId, q = '', categoryId = null, tag = null, status = null, starred = false, sort = 'page', attachmentId = null }) {
    if (!this.getPaper(paperId)) throw new ResearchStoreError('PAPER_NOT_FOUND', '文献不存在', 404);
    const conditions = ['s.paper_id = ?'];
    const params = [paperId];
    if (attachmentId) { conditions.push('s.attachment_id = ?'); params.push(attachmentId); }
    const keyword = String(q || '').trim().slice(0, 100);
    if (keyword) {
      const kw = `%${keyword}%`;
      conditions.push('(s.quoted_text LIKE ? OR s.comment LIKE ?)');
      params.push(kw, kw);
    }
    if (categoryId === 'none') conditions.push("(s.category_id IS NULL OR s.category_id = '')");
    else if (categoryId) { conditions.push('s.category_id = ?'); params.push(categoryId); }
    if (tag) {
      conditions.push('EXISTS (SELECT 1 FROM json_each(s.tags_json) WHERE json_each.value = ?)');
      params.push(String(tag).slice(0, 30));
    }
    if (status) { conditions.push('s.status = ?'); params.push(status); }
    if (starred) conditions.push('s.starred = 1');
    const order = sort === 'updated'
      ? 's.updated_at DESC'
      : sort === 'created'
        ? 's.created_at DESC'
        : 's.page_number ASC, s.created_at ASC';
    const rows = this.db.prepare(`
      SELECT s.*, c.name AS category_name, c.color AS category_color
      FROM sentence_notes s
      LEFT JOIN note_categories c ON c.id = s.category_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY ${order}
    `).all(...params);
    return rows.map(sentenceNoteRow);
  }

  /**
   * 创建逐句笔记。幂等：同一文献下相同 annotation_id 已存在时直接返回现有记录
   * （防止前端重试/双击产生重复笔记）。annotationId 为空时按引用文本去重。
   */
  createSentenceNote({ paperId, attachmentId = null, annotationId = null, quotedText = '', comment = '', pageNumber = 1, position = null, categoryId = null, tags = [], importance = 2, starred = false, status = 'inbox', evidence = null }) {
    if (!this.getPaper(paperId)) throw new ResearchStoreError('PAPER_NOT_FOUND', '文献不存在', 404);
    const quote = String(quotedText || '').trim().slice(0, 5000);
    if (!quote) throw new ResearchStoreError('NOTE_QUOTE_REQUIRED', '原文摘录不能为空', 400);
    const normalizedTags = normalizeTags(tags);
    const normalizedStatus = SENTENCE_NOTE_STATUSES.includes(status) ? status : 'inbox';
    const normalizedCategory = this.#resolveCategoryId(categoryId);
    if (annotationId) {
      const existing = this.db.prepare(`
        SELECT id FROM sentence_notes WHERE paper_id = ? AND annotation_id = ?
      `).get(paperId, annotationId);
      if (existing) {
        return this.getSentenceNote(existing.id);
      }
    } else {
      // 无批注关联时按 文献+页码+摘录 去重（完全一致视为重复提交）
      const existing = this.db.prepare(`
        SELECT id FROM sentence_notes WHERE paper_id = ? AND page_number = ? AND quoted_text = ?
      `).get(paperId, normalizePageNumber(pageNumber, false), quote);
      if (existing) return this.getSentenceNote(existing.id);
    }
    const id = crypto.randomUUID();
    const timestamp = nowIso();
    this.db.prepare(`
      INSERT INTO sentence_notes(
        id, paper_id, attachment_id, annotation_id, quoted_text, comment, page_number,
        position_json, category_id, tags_json, importance, starred, status,
        annotation_deleted, created_at, updated_at
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `).run(id, paperId, attachmentId, annotationId || null, quote, String(comment || '').slice(0, 20000),
      normalizePageNumber(pageNumber, false),
      JSON.stringify(withPositionEvidence(position, evidence)).slice(0, 65536),
      normalizedCategory, JSON.stringify(normalizedTags),
      clampNumber(Number(importance), 1, 3, 2), starred ? 1 : 0, normalizedStatus, timestamp, timestamp);
    this.#audit('sentence-note.create', 'sentence_note', id, { paperId, pageNumber: normalizePageNumber(pageNumber, false), annotationId, tags: normalizedTags });
    return this.getSentenceNote(id);
  }

  /** 读取单条逐句笔记（含分类名/颜色）。 */
  getSentenceNote(noteId) {
    const row = this.db.prepare(`
      SELECT s.*, c.name AS category_name, c.color AS category_color
      FROM sentence_notes s LEFT JOIN note_categories c ON c.id = s.category_id
      WHERE s.id = ?
    `).get(noteId);
    if (!row) throw new ResearchStoreError('NOTE_NOT_FOUND', '逐句笔记不存在', 404);
    return sentenceNoteRow(row);
  }

  /** 更新逐句笔记可编辑字段（未提供的字段保持原值）。evidence 存入 position_json.__evidence。 */
  updateSentenceNote(noteId, { comment, quotedText, pageNumber, categoryId, tags, importance, starred, status, evidence }) {
    const current = this.db.prepare('SELECT * FROM sentence_notes WHERE id = ?').get(noteId);
    if (!current) throw new ResearchStoreError('NOTE_NOT_FOUND', '逐句笔记不存在', 404);
    const next = {
      comment: comment === undefined ? current.comment : String(comment).slice(0, 20000),
      quotedText: quotedText === undefined ? current.quoted_text : String(quotedText).trim().slice(0, 5000),
      pageNumber: pageNumber === undefined ? Number(current.page_number || 1) : normalizePageNumber(pageNumber, false),
      categoryId: categoryId === undefined ? current.category_id : this.#resolveCategoryId(categoryId),
      tags: tags === undefined ? parseJsonArray(current.tags_json) : normalizeTags(tags),
      importance: importance === undefined ? Number(current.importance || 2) : clampNumber(Number(importance), 1, 3, 2),
      starred: starred === undefined ? current.starred === 1 : Boolean(starred),
      status: status === undefined ? current.status : (SENTENCE_NOTE_STATUSES.includes(status) ? status : 'inbox'),
    };
    let nextPositionJson = current.position_json;
    if (evidence !== undefined) {
      let position = {};
      try { position = JSON.parse(current.position_json || '{}'); } catch { position = {}; }
      nextPositionJson = JSON.stringify(withPositionEvidence(position, evidence)).slice(0, 65536);
    }
    this.db.prepare(`
      UPDATE sentence_notes SET
        comment = ?, quoted_text = ?, page_number = ?, category_id = ?, tags_json = ?,
        importance = ?, starred = ?, status = ?, position_json = ?, updated_at = ?
      WHERE id = ?
    `).run(next.comment, next.quotedText, next.pageNumber, next.categoryId, JSON.stringify(next.tags),
      next.importance, next.starred ? 1 : 0, next.status, nextPositionJson, nowIso(), noteId);
    this.#audit('sentence-note.update', 'sentence_note', noteId, { pageNumber: next.pageNumber, tags: next.tags, starred: next.starred, status: next.status, evidence: evidence !== undefined });
    return this.getSentenceNote(noteId);
  }

  /** 删除逐句笔记（默认不触碰 PDF 批注；批注删除由前端经批注 API 差集处理）。 */
  deleteSentenceNote(noteId) {
    const row = this.db.prepare('SELECT * FROM sentence_notes WHERE id = ?').get(noteId);
    if (!row) throw new ResearchStoreError('NOTE_NOT_FOUND', '逐句笔记不存在', 404);
    this.db.prepare('DELETE FROM sentence_notes WHERE id = ?').run(noteId);
    this.#audit('sentence-note.delete', 'sentence_note', noteId, { annotationId: row.annotation_id || null });
    return { deleted: true, annotationId: row.annotation_id || null };
  }

  /** 重新建立逐句笔记与批注的关联（原批注删除后手动修复定位）。 */
  relocateSentenceNote(noteId, { annotationId }) {
    const current = this.db.prepare('SELECT id FROM sentence_notes WHERE id = ?').get(noteId);
    if (!current) throw new ResearchStoreError('NOTE_NOT_FOUND', '逐句笔记不存在', 404);
    if (!annotationId) throw new ResearchStoreError('ANNOTATION_REQUIRED', '批注 ID 不能为空', 400);
    this.db.prepare(`
      UPDATE sentence_notes SET annotation_id = ?, annotation_deleted = 0, updated_at = ? WHERE id = ?
    `).run(annotationId, nowIso(), noteId);
    this.#audit('sentence-note.relocate', 'sentence_note', noteId, { annotationId });
    return this.getSentenceNote(noteId);
  }

  #resolveCategoryId(categoryId) {
    if (!categoryId) return null;
    const row = this.db.prepare('SELECT id FROM note_categories WHERE id = ?').get(categoryId);
    return row ? row.id : null;
  }

  /** 列出全部分类（含名称/颜色，按创建顺序）。 */
  listNoteCategories() {
    return this.db.prepare(`
      SELECT * FROM note_categories ORDER BY created_at ASC, name ASC
    `).all().map(noteCategoryRow);
  }

  /** 创建自定义分类；重名抛 409。 */
  createNoteCategory({ name, color }) {
    const cleanName = String(name || '').trim().slice(0, 30);
    if (!cleanName) throw new ResearchStoreError('CATEGORY_REQUIRED', '分类名不能为空', 400);
    const dup = this.db.prepare('SELECT id FROM note_categories WHERE name = ?').get(cleanName);
    if (dup) throw new ResearchStoreError('CATEGORY_EXISTS', '分类已存在', 409);
    const id = crypto.randomUUID();
    const timestamp = nowIso();
    this.db.prepare(`
      INSERT INTO note_categories(id, name, color, created_at) VALUES(?, ?, ?, ?)
    `).run(id, cleanName, /^#[0-9a-f]{6}$/i.test(color || '') ? color : '#8bb8e8', timestamp);
    this.#audit('note-category.create', 'note_category', id, { name: cleanName });
    return noteCategoryRow(this.db.prepare('SELECT * FROM note_categories WHERE id = ?').get(id));
  }

  /** 重命名/改色分类（重名抛 409）。 */
  updateNoteCategory(categoryId, { name, color }) {
    const row = this.db.prepare('SELECT * FROM note_categories WHERE id = ?').get(categoryId);
    if (!row) throw new ResearchStoreError('CATEGORY_NOT_FOUND', '分类不存在', 404);
    const nextName = name === undefined ? row.name : String(name).trim().slice(0, 30);
    if (!nextName) throw new ResearchStoreError('CATEGORY_REQUIRED', '分类名不能为空', 400);
    const dup = this.db.prepare('SELECT id FROM note_categories WHERE name = ? AND id != ?').get(nextName, categoryId);
    if (dup) throw new ResearchStoreError('CATEGORY_EXISTS', '分类已存在', 409);
    const nextColor = color === undefined ? row.color : (/^#[0-9a-f]{6}$/i.test(color) ? color : row.color);
    this.db.prepare('UPDATE note_categories SET name = ?, color = ? WHERE id = ?').run(nextName, nextColor, categoryId);
    this.#audit('note-category.update', 'note_category', categoryId, { name: nextName });
    return noteCategoryRow(this.db.prepare('SELECT * FROM note_categories WHERE id = ?').get(categoryId));
  }

  /** 删除分类：笔记保留并归入未分类（不级联删除笔记）。 */
  deleteNoteCategory(categoryId) {
    const row = this.db.prepare('SELECT id FROM note_categories WHERE id = ?').get(categoryId);
    if (!row) throw new ResearchStoreError('CATEGORY_NOT_FOUND', '分类不存在', 404);
    withTransaction(this.db, () => {
      this.db.prepare("UPDATE sentence_notes SET category_id = NULL, updated_at = ? WHERE category_id = ?").run(nowIso(), categoryId);
      this.db.prepare("UPDATE paper_note_documents SET category_id = NULL, updated_at = ? WHERE category_id = ?").run(nowIso(), categoryId);
      this.db.prepare('DELETE FROM note_categories WHERE id = ?').run(categoryId);
    });
    this.#audit('note-category.delete', 'note_category', categoryId, {});
    return { deleted: true };
  }

  /** 保存标签颜色（INSERT OR REPLACE；标签本身仍存于笔记 tags_json）。 */
  saveTagColor(tag, color) {
    const cleanTag = String(tag || '').trim().replace(/^#/, '').slice(0, 30);
    if (!cleanTag) throw new ResearchStoreError('TAG_REQUIRED', '标签不能为空', 400);
    const cleanColor = /^#[0-9a-f]{6}$/i.test(color || '') ? color : '#8bb8e8';
    this.db.prepare(`
      INSERT INTO note_tag_colors(tag, color, updated_at) VALUES(?, ?, ?)
      ON CONFLICT(tag) DO UPDATE SET color = excluded.color, updated_at = excluded.updated_at
    `).run(cleanTag, cleanColor, nowIso());
    return { tag: cleanTag, color: cleanColor };
  }

  /** 全部标签颜色映射 { tag: color }。 */
  listTagColors() {
    return this.db.prepare('SELECT * FROM note_tag_colors').all()
      .reduce((acc, row) => { acc[row.tag] = row.color; return acc; }, {});
  }

  /** 读取 research_meta 键值（不存在返回 null；供迁移/测试/健康检查使用）。 */
  getMetaValue(key) {
    const row = this.db.prepare('SELECT value FROM research_meta WHERE key = ?').get(key);
    return row ? row.value : null;
  }

  /** 读取附件全部批注的 v2 视图（含 EmbedPDF 数据与旧载荷）。 */
  listAnnotationsV2(attachmentId) {
    const rows = this.db.prepare(`
      SELECT * FROM annotations WHERE attachment_id = ? ORDER BY page_number ASC, created_at ASC
    `).all(attachmentId);
    return rows.map(annotationRowToView);
  }

  /** 批量替换附件批注（EmbedPDF transfer items 全量保存；原子事务）。 */
  replaceAnnotationsV2(attachmentId, items) {
    const attachment = this.db.prepare('SELECT * FROM attachments WHERE id = ?').get(attachmentId);
    if (!attachment) throw new ResearchStoreError('ATTACHMENT_NOT_FOUND', 'PDF 附件不存在', 404);
    // attachment 无 project_id 列：经 paper_id → project_papers 反查所属项目
    const link = this.db.prepare(`
      SELECT pp.project_id FROM project_papers pp
      JOIN attachments a ON a.paper_id = pp.paper_id
      WHERE a.id = ? LIMIT 1
    `).get(attachmentId);
    if (!link?.project_id) throw new ResearchStoreError('ATTACHMENT_ORPHANED', 'PDF 附件未关联任何项目', 400);
    const rows = transferItemsToRows(attachmentId, items);
    const timestamp = nowIso();
    withTransaction(this.db, () => {
      const upd = this.db.prepare(`
        UPDATE annotations SET subtype = ?, embed_pdf_data = ?, payload_json = ?, page_number = ?, updated_at = ?
        WHERE id = ?
      `);
      const ins = this.db.prepare(`
        INSERT INTO annotations(id, project_id, attachment_id, page_number, kind, payload_json, subtype, embed_pdf_data, created_at, updated_at)
        VALUES(?, ?, ?, ?, 'highlight', '{}', ?, ?, ?, ?)
      `);
      for (const row of rows) {
        const embedJson = JSON.stringify(row.embedPdf);
        const payload = {
          rects: [], color: extractAnnotationColor(row.embedPdf), quote: row.selectedText,
        };
        const uid = row.embedPdf?.annotation?.id;
        const matched = uid ? this.db.prepare('SELECT id FROM annotations WHERE id = ?').get(uid) : null;
        if (matched) {
          upd.run(row.subtype, embedJson, JSON.stringify(payload), row.pageNumber, timestamp, matched.id);
        } else {
          ins.run(uid || crypto.randomUUID(), link.project_id, attachmentId, row.pageNumber, row.subtype, embedJson, timestamp, timestamp);
        }
      }
      // 删除该附件下、未出现在新列表中的纯 UI 批注（有摘录笔记/逐句笔记关联的保留）。
      // 空批次同样执行差集删除（用户删光全部批注的合法场景）。
      const keepIds = new Set(rows.map(r => r.embedPdf?.annotation?.id).filter(Boolean));
      {
        const notesLinked = new Set([
          ...this.db.prepare('SELECT DISTINCT annotation_id FROM notes WHERE annotation_id IS NOT NULL').all().map(r => r.annotation_id),
          ...this.db.prepare('SELECT DISTINCT annotation_id FROM sentence_notes WHERE annotation_id IS NOT NULL').all().map(r => r.annotation_id),
        ]);
        const del = this.db.prepare('DELETE FROM annotations WHERE id = ?');
        const toDelete = this.db.prepare('SELECT id, embed_pdf_data FROM annotations WHERE attachment_id = ?').all(attachmentId)
          // 跳过未迁移的 legacy 批注（embed_pdf_data 为空）——迁移由打开 PDF 时的换算流程处理
          .filter(r => !keepIds.has(r.id) && !notesLinked.has(r.id) && r.embed_pdf_data !== null);
        for (const row of toDelete) {
          del.run(row.id);
          // v12：批注删除 → 关联引文标记定位失效（引文文本保留）
          this.markCitationsStaleByAnnotation(row.id);
          // v13：批注删除 → 关联逐句笔记标记定位失效（笔记保留）
          this.markSentenceNotesStaleByAnnotation(row.id);
        }
      }
    });
    this.#audit('annotation.replace_v2', 'attachment', attachmentId, { count: rows.length });
    return this.listAnnotationsV2(attachmentId);
  }

  /**
   * 聚合笔记标签及使用次数（覆盖项目笔记、逐句笔记与汇总笔记；含颜色）。
   * projectId 为空时统计全部项目。
   */
  listTags(projectId = null) {
    if (projectId && !this.getProject(projectId)) {
      throw new ResearchStoreError('PROJECT_NOT_FOUND', '项目不存在', 404);
    }
    const rows = projectId
      ? this.db.prepare(`
          SELECT tags_json FROM notes WHERE project_id = ?
          UNION ALL
          SELECT s.tags_json FROM sentence_notes s
            JOIN project_papers pp ON pp.paper_id = s.paper_id AND pp.project_id = ?
          UNION ALL
          SELECT d.tags_json FROM paper_note_documents d
            JOIN project_papers pp ON pp.paper_id = d.paper_id AND pp.project_id = ?
        `).all(projectId, projectId, projectId)
      : this.db.prepare(`
          SELECT tags_json FROM notes
          UNION ALL
          SELECT tags_json FROM sentence_notes
          UNION ALL
          SELECT tags_json FROM paper_note_documents
        `).all();
    const counts = new Map();
    for (const row of rows) {
      for (const tag of parseJsonArray(row.tags_json)) {
        counts.set(tag, (counts.get(tag) || 0) + 1);
      }
    }
    const colors = this.listTagColors();
    return [...counts.entries()]
      .map(([tag, count]) => ({ tag, count, color: colors[tag] || null }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'zh'));
  }

  /**
   * 全局重命名笔记标签（P1 增强：标签管理；v13 覆盖逐句笔记与汇总笔记）。
   * 把所有笔记/逐句笔记/汇总笔记 tags_json 中的 oldTag 替换为 newTag（含关联高亮载荷）；
   * 若 newTag 已存在则自然合并（计数相加）。返回受影响记录数。
   */
  renameNoteTag(oldTag, newTag) {
    const from = String(oldTag || '').trim().replace(/^#/, '').slice(0, 30);
    const to = String(newTag || '').trim().replace(/^#/, '').slice(0, 30);
    if (!from) throw new ResearchStoreError('TAG_REQUIRED', '标签不能为空', 400);
    if (!to) throw new ResearchStoreError('TAG_REQUIRED', '新标签名不能为空', 400);
    if (from === to) return 0;

    const notes = this.db.prepare('SELECT id, project_id, tags_json, annotation_id FROM notes').all();
    const sentenceNotes = this.db.prepare('SELECT id, tags_json FROM sentence_notes').all();
    const noteDocs = this.db.prepare('SELECT id, tags_json FROM paper_note_documents').all();
    let affected = 0;
    withTransaction(this.db, () => {
      const updateNote = this.db.prepare('UPDATE notes SET tags_json = ?, updated_at = ? WHERE id = ?');
      const updateSentence = this.db.prepare('UPDATE sentence_notes SET tags_json = ?, updated_at = ? WHERE id = ?');
      const updateDoc = this.db.prepare('UPDATE paper_note_documents SET tags_json = ?, updated_at = ? WHERE id = ?');
      const updateAnnotation = this.db.prepare('UPDATE annotations SET payload_json = ? WHERE id = ?');
      for (const note of notes) {
        const tags = parseJsonArray(note.tags_json);
        if (!tags.includes(from)) continue;
        const nextTags = [...new Set(tags.map(tag => tag === from ? to : tag))];
        updateNote.run(JSON.stringify(nextTags), nowIso(), note.id);
        if (note.annotation_id) {
          const annotation = this.db.prepare('SELECT * FROM annotations WHERE id = ?').get(note.annotation_id);
          if (annotation) {
            try {
              const payload = JSON.parse(annotation.payload_json || '{}');
              if (Array.isArray(payload.tags)) {
                payload.tags = [...new Set(payload.tags.map(tag => tag === from ? to : tag))];
                updateAnnotation.run(JSON.stringify(payload), note.annotation_id);
              }
            } catch { /* 载荷损坏跳过 */ }
          }
        }
        affected += 1;
      }
      for (const note of sentenceNotes) {
        const tags = parseJsonArray(note.tags_json);
        if (!tags.includes(from)) continue;
        updateSentence.run(JSON.stringify([...new Set(tags.map(tag => tag === from ? to : tag))]), nowIso(), note.id);
        affected += 1;
      }
      for (const doc of noteDocs) {
        const tags = parseJsonArray(doc.tags_json);
        if (!tags.includes(from)) continue;
        updateDoc.run(JSON.stringify([...new Set(tags.map(tag => tag === from ? to : tag))]), nowIso(), doc.id);
        affected += 1;
      }
    });
    if (affected) {
      this.#audit('note.tag.rename', 'note', from, { to, affected });
    }
    return affected;
  }

  /** 从全部笔记/逐句笔记/汇总笔记与关联高亮中删除标签（P1 增强；v13 全覆盖）。返回受影响记录数。 */
  removeNoteTag(tag) {
    const target = String(tag || '').trim().replace(/^#/, '').slice(0, 30);
    if (!target) throw new ResearchStoreError('TAG_REQUIRED', '标签不能为空', 400);
    const notes = this.db.prepare('SELECT id, project_id, tags_json, annotation_id FROM notes').all();
    const sentenceNotes = this.db.prepare('SELECT id, tags_json FROM sentence_notes').all();
    const noteDocs = this.db.prepare('SELECT id, tags_json FROM paper_note_documents').all();
    let affected = 0;
    withTransaction(this.db, () => {
      const updateNote = this.db.prepare('UPDATE notes SET tags_json = ?, updated_at = ? WHERE id = ?');
      const updateSentence = this.db.prepare('UPDATE sentence_notes SET tags_json = ?, updated_at = ? WHERE id = ?');
      const updateDoc = this.db.prepare('UPDATE paper_note_documents SET tags_json = ?, updated_at = ? WHERE id = ?');
      const updateAnnotation = this.db.prepare('UPDATE annotations SET payload_json = ? WHERE id = ?');
      for (const note of notes) {
        const tags = parseJsonArray(note.tags_json);
        if (!tags.includes(target)) continue;
        const nextTags = tags.filter(tag => tag !== target);
        updateNote.run(JSON.stringify(nextTags), nowIso(), note.id);
        if (note.annotation_id) {
          const annotation = this.db.prepare('SELECT * FROM annotations WHERE id = ?').get(note.annotation_id);
          if (annotation) {
            try {
              const payload = JSON.parse(annotation.payload_json || '{}');
              if (Array.isArray(payload.tags)) {
                payload.tags = payload.tags.filter(tag => tag !== target);
                updateAnnotation.run(JSON.stringify(payload), note.annotation_id);
              }
            } catch { /* 载荷损坏跳过 */ }
          }
        }
        affected += 1;
      }
      for (const note of sentenceNotes) {
        const tags = parseJsonArray(note.tags_json);
        if (!tags.includes(target)) continue;
        updateSentence.run(JSON.stringify(tags.filter(tag => tag !== target)), nowIso(), note.id);
        affected += 1;
      }
      for (const doc of noteDocs) {
        const tags = parseJsonArray(doc.tags_json);
        if (!tags.includes(target)) continue;
        updateDoc.run(JSON.stringify(tags.filter(tag => tag !== target)), nowIso(), doc.id);
        affected += 1;
      }
    });
    if (affected) {
      this.#audit('note.tag.remove', 'note', target, { affected });
    }
    return affected;
  }

  syncProjectNotesFile(projectId) {
    const project = this.getProject(projectId);
    if (!project) throw new ResearchStoreError('PROJECT_NOT_FOUND', '项目不存在', 404);
    const notes = this.listNotes(projectId);
    const safeProjectId = String(projectId).replace(/[^a-z0-9_-]/gi, '_');
    const projectDir = path.join(this.projectNotesDir, safeProjectId);
    fs.mkdirSync(projectDir, { recursive: true });
    const filePath = path.join(projectDir, 'project-notes.md');
    const body = renderProjectNotesMarkdown(project, notes);
    const tempPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    fs.writeFileSync(tempPath, body, 'utf8');
    fs.renameSync(tempPath, filePath);
    return { filePath, fileName: `${safeMarkdownFileName(project.title)}-项目笔记.md`, body, noteCount: notes.length };
  }

  getProjectNotesFile(projectId) {
    return this.syncProjectNotesFile(projectId);
  }

  /**
   * 扫描本地文献库中的疑似重复项。DOI 使用规范化精确匹配；无共同 DOI 时，
   * 综合标题、作者与年份给出可解释分数。这里只生成候选，不自动改写数据。
   */
  listDuplicateCandidates({ projectId = null, includeIgnored = false, limit = 100 } = {}) {
    if (projectId && !this.getProject(projectId)) {
      throw new ResearchStoreError('PROJECT_NOT_FOUND', '项目不存在', 404);
    }
    const papers = projectId
      ? this.db.prepare(`SELECT p.* FROM papers p JOIN project_papers pp ON pp.paper_id = p.id WHERE pp.project_id = ? ORDER BY p.id`).all(projectId)
      : this.db.prepare('SELECT * FROM papers ORDER BY id').all();
    const ignored = new Set(this.db.prepare('SELECT pair_key FROM paper_duplicate_ignores').all().map(row => row.pair_key));
    const prepared = papers.map(row => ({
      row,
      doi: normalizeDoiForMatch(row.doi),
      title: normalizeTitleForMatch(row.title),
      titleTokens: titleTokens(row.title),
      authorTokens: authorTokens(row.authors),
      year: Number(row.year) || null,
    }));
    const candidates = [];
    for (let leftIndex = 0; leftIndex < prepared.length; leftIndex += 1) {
      const left = prepared[leftIndex];
      for (let rightIndex = leftIndex + 1; rightIndex < prepared.length; rightIndex += 1) {
        const right = prepared[rightIndex];
        const pairKey = duplicatePairKey(left.row.id, right.row.id);
        if (!includeIgnored && ignored.has(pairKey)) continue;
        const exactDoi = Boolean(left.doi && right.doi && left.doi === right.doi);
        // 两条均有 DOI 且规范化后不同，应视为不同出版物（常见于同名目录页、补充材料）。
        if (left.doi && right.doi && !exactDoi) continue;
        const exactTitle = Boolean(left.title && left.title === right.title);
        if (!exactDoi && !exactTitle) {
          const lengthRatio = Math.min(left.title.length, right.title.length) / Math.max(left.title.length, right.title.length, 1);
          if (lengthRatio < 0.72) continue;
        }
        const titleScore = exactTitle ? 1 : jaccard(left.titleTokens, right.titleTokens);
        const authorScore = jaccard(left.authorTokens, right.authorTokens);
        const yearGap = left.year && right.year ? Math.abs(left.year - right.year) : null;
        const yearScore = yearGap === 0 ? 1 : (yearGap === 1 ? 0.6 : (yearGap === null ? 0.35 : 0));
        const score = exactDoi ? 1 : (titleScore * 0.76 + authorScore * 0.16 + yearScore * 0.08);
        const substantiveExactTitle = exactTitle && (/\p{Script=Han}/u.test(left.title) ? left.title.length >= 10 : left.title.length >= 24 || authorScore >= 0.5);
        const plausible = exactDoi
          || (substantiveExactTitle && (yearGap === null || yearGap <= 1))
          || (titleScore >= 0.9 && (yearGap === null || yearGap <= 1))
          || (titleScore >= 0.82 && authorScore >= 0.5 && (yearGap === null || yearGap <= 1));
        if (!plausible) continue;
        const reasons = [];
        if (exactDoi) reasons.push('DOI 完全一致');
        if (exactTitle) reasons.push('规范化标题一致');
        else reasons.push(`标题相似 ${Math.round(titleScore * 100)}%`);
        if (authorScore > 0) reasons.push(`作者重合 ${Math.round(authorScore * 100)}%`);
        if (yearGap === 0) reasons.push('年份一致');
        else if (yearGap === 1) reasons.push('年份相差 1 年');
        candidates.push({ pairKey, exactDoi, score, titleScore, authorScore, yearGap, reasons, left: rowToPaper(left.row), right: rowToPaper(right.row), ignored: ignored.has(pairKey) });
      }
    }
    candidates.sort((a, b) => Number(b.exactDoi) - Number(a.exactDoi) || b.score - a.score || a.pairKey.localeCompare(b.pairKey));
    const sliced = candidates.slice(0, Math.min(Math.max(Number(limit) || 100, 1), 300));
    const ids = [...new Set(sliced.flatMap(candidate => [candidate.left.id, candidate.right.id]))];
    const stats = new Map(ids.map(id => [id, this.#paperMergeStats(id)]));
    return {
      candidates: sliced.map(candidate => ({
        ...candidate,
        confidence: candidate.exactDoi ? 'exact' : (candidate.score >= 0.9 ? 'high' : 'review'),
        left: { ...candidate.left, mergeStats: stats.get(candidate.left.id) },
        right: { ...candidate.right, mergeStats: stats.get(candidate.right.id) },
      })),
      total: candidates.length,
      ignoredCount: ignored.size,
      scanned: papers.length,
    };
  }

  ignoreDuplicateCandidate(leftPaperId, rightPaperId) {
    const left = this.db.prepare('SELECT id FROM papers WHERE id = ?').get(leftPaperId);
    const right = this.db.prepare('SELECT id FROM papers WHERE id = ?').get(rightPaperId);
    if (!left || !right || leftPaperId === rightPaperId) {
      throw new ResearchStoreError('DUPLICATE_PAIR_INVALID', '重复候选中的文献不存在或选择无效', 400);
    }
    const [first, second] = [String(leftPaperId), String(rightPaperId)].sort();
    const pairKey = duplicatePairKey(first, second);
    this.db.prepare(`INSERT OR REPLACE INTO paper_duplicate_ignores(pair_key, left_paper_id, right_paper_id, created_at) VALUES(?, ?, ?, ?)`)
      .run(pairKey, first, second, nowIso());
    this.#audit('paper.duplicate.ignore', 'paper_pair', pairKey, { leftPaperId: first, rightPaperId: second });
    return { ignored: true, pairKey };
  }

  mergeDuplicatePapers(targetPaperId, sourcePaperId) {
    const targetId = String(targetPaperId || '');
    const sourceId = String(sourcePaperId || '');
    if (!targetId || !sourceId || targetId === sourceId) throw new ResearchStoreError('PAPER_MERGE_INVALID', '请选择两篇不同的文献', 400);
    const target = this.db.prepare('SELECT * FROM papers WHERE id = ?').get(targetId);
    const source = this.db.prepare('SELECT * FROM papers WHERE id = ?').get(sourceId);
    if (!target || !source) throw new ResearchStoreError('PAPER_NOT_FOUND', '待合并文献不存在', 404);
    const targetDoi = normalizeDoiForMatch(target.doi);
    const sourceDoi = normalizeDoiForMatch(source.doi);
    if (targetDoi && sourceDoi && targetDoi !== sourceDoi) {
      throw new ResearchStoreError('PAPER_MERGE_DOI_CONFLICT', '两篇文献的 DOI 不同，不能直接合并', 409);
    }
    const targetDoc = this.db.prepare('SELECT * FROM paper_note_documents WHERE paper_id = ?').get(targetId);
    const sourceDoc = this.db.prepare('SELECT * FROM paper_note_documents WHERE paper_id = ?').get(sourceId);
    if (targetDoc && sourceDoc) {
      throw new ResearchStoreError('PAPER_MERGE_NOTE_CONFLICT', '两篇文献都已有汇总笔记。请先人工整理其中一份，再执行合并', 409);
    }
    const conflicts = this.#paperMergeConflicts(targetId, sourceId);
    if (conflicts.length) {
      throw new ResearchStoreError('PAPER_MERGE_DATA_CONFLICT', '两篇文献存在不能自动取舍的项目数据，请先人工统一后再合并', 409, { conflicts });
    }

    const mergeId = crypto.randomUUID();
    const snapshot = this.#paperMergeSnapshot(targetId, sourceId);
    const summary = withTransaction(this.db, () => {
      const timestamp = nowIso();
      const projectsMoved = this.#mergeProjectMemberships(targetId, sourceId, timestamp);
      this.db.prepare('INSERT OR IGNORE INTO collection_papers(collection_id, paper_id, added_at) SELECT collection_id, ?, added_at FROM collection_papers WHERE paper_id = ?')
        .run(targetId, sourceId);
      this.db.prepare('DELETE FROM collection_papers WHERE paper_id = ?').run(sourceId);

      this.db.prepare('UPDATE notes SET paper_id = ? WHERE paper_id = ?').run(targetId, sourceId);
      this.db.prepare('UPDATE notes SET linked_paper_id = ? WHERE linked_paper_id = ?').run(targetId, sourceId);
      this.db.prepare('UPDATE sentence_notes SET paper_id = ? WHERE paper_id = ?').run(targetId, sourceId);
      this.db.prepare('UPDATE note_citations SET paper_id = ? WHERE paper_id = ?').run(targetId, sourceId);
      this.db.prepare('UPDATE translation_docs SET paper_id = ?, updated_at = ? WHERE paper_id = ?').run(targetId, timestamp, sourceId);
      if (sourceDoc) this.db.prepare('UPDATE paper_note_documents SET paper_id = ?, updated_at = ? WHERE paper_id = ?').run(targetId, timestamp, sourceId);

      const targetReading = this.db.prepare('SELECT * FROM paper_reading_state WHERE paper_id = ?').get(targetId);
      const sourceReading = this.db.prepare('SELECT * FROM paper_reading_state WHERE paper_id = ?').get(sourceId);
      if (sourceReading && !targetReading) this.db.prepare('UPDATE paper_reading_state SET paper_id = ? WHERE paper_id = ?').run(targetId, sourceId);
      else if (sourceReading) this.db.prepare('DELETE FROM paper_reading_state WHERE paper_id = ?').run(sourceId);

      const sourceAttachments = this.db.prepare('SELECT * FROM attachments WHERE paper_id = ? ORDER BY created_at').all(sourceId);
      let attachmentsMoved = 0;
      let attachmentsReused = 0;
      for (const attachment of sourceAttachments) {
        const existing = this.db.prepare('SELECT id FROM attachments WHERE paper_id = ? AND sha256 = ?').get(targetId, attachment.sha256);
        if (existing) {
          this.db.prepare('UPDATE annotations SET attachment_id = ? WHERE attachment_id = ?').run(existing.id, attachment.id);
          this.db.prepare('UPDATE notes SET attachment_id = ? WHERE attachment_id = ?').run(existing.id, attachment.id);
          this.db.prepare('UPDATE translation_docs SET attachment_id = ?, updated_at = ? WHERE attachment_id = ?').run(existing.id, timestamp, attachment.id);
          this.db.prepare('UPDATE sentence_notes SET attachment_id = ? WHERE attachment_id = ?').run(existing.id, attachment.id);
          this.db.prepare('DELETE FROM attachments WHERE id = ?').run(attachment.id);
          attachmentsReused += 1;
        } else {
          this.db.prepare('UPDATE attachments SET paper_id = ? WHERE id = ?').run(targetId, attachment.id);
          attachmentsMoved += 1;
        }
      }

      this.db.prepare('UPDATE paper_relations SET from_paper_id = ? WHERE from_paper_id = ?').run(targetId, sourceId);
      this.db.prepare('UPDATE paper_relations SET to_paper_id = ? WHERE to_paper_id = ?').run(targetId, sourceId);
      this.db.prepare('DELETE FROM paper_relations WHERE from_paper_id = to_paper_id').run();
      const relations = this.db.prepare('SELECT * FROM paper_relations ORDER BY created_at, id').all();
      const seenRelations = new Set();
      for (const relation of relations) {
        const key = [relation.project_id, relation.from_paper_id, relation.to_paper_id, relation.relation].join('::');
        if (seenRelations.has(key)) this.db.prepare('DELETE FROM paper_relations WHERE id = ?').run(relation.id);
        else seenRelations.add(key);
      }

      if (!target.doi && source.doi) this.db.prepare('UPDATE papers SET doi = NULL WHERE id = ?').run(sourceId);
      const tags = [...new Set([...parseMethodologyJson(target.methodology_json), ...parseMethodologyJson(source.methodology_json)])].slice(0, 12);
      const preferLonger = (left, right) => String(right || '').trim().length > String(left || '').trim().length ? right : left;
      const readRank = { unread: 0, reading: 1, read: 2 };
      const priorityRank = { '': 0, p2: 1, p1: 2, p0: 3 };
      const readStatus = (readRank[source.read_status] || 0) > (readRank[target.read_status] || 0) ? source.read_status : target.read_status;
      const priority = (priorityRank[source.priority] || 0) > (priorityRank[target.priority] || 0) ? source.priority : target.priority;
      this.db.prepare(`UPDATE papers SET doi = ?, title = ?, authors = ?, venue = ?, year = ?, abstract = ?, topic = ?,
        pdf_url = ?, source_url = ?, source_name = ?, is_favorite = ?, read_status = ?, priority = ?, cited_by_count = ?,
        methodology_json = ?, openalex_id = ?, updated_at = ? WHERE id = ?`).run(
        target.doi || source.doi, preferLonger(target.title, source.title), preferLonger(target.authors, source.authors),
        target.venue || source.venue, target.year || source.year, preferLonger(target.abstract, source.abstract), target.topic || source.topic,
        target.pdf_url || source.pdf_url, target.source_url || source.source_url, target.source_name || source.source_name,
        target.is_favorite || source.is_favorite ? 1 : 0, readStatus || 'unread', priority || '',
        Math.max(Number(target.cited_by_count) || 0, Number(source.cited_by_count) || 0) || null,
        JSON.stringify(tags), target.openalex_id || source.openalex_id, timestamp, targetId,
      );
      this.db.prepare('DELETE FROM papers WHERE id = ?').run(sourceId);
      const result = { projectsMoved, attachmentsMoved, attachmentsReused, targetPaperId: targetId, sourcePaperId: sourceId };
      this.db.prepare(`INSERT INTO paper_merge_log(id, target_paper_id, source_paper_id, source_title, snapshot_json, summary_json, created_at) VALUES(?, ?, ?, ?, ?, ?, ?)`)
        .run(mergeId, targetId, sourceId, source.title, JSON.stringify(snapshot), JSON.stringify(result), timestamp);
      this.#audit('paper.merge', 'paper_merge', mergeId, result);
      return result;
    });
    return { mergeId, paper: this.getPaper(targetId), summary, undoAvailable: true };
  }

  undoPaperMerge(mergeId) {
    const log = this.db.prepare('SELECT * FROM paper_merge_log WHERE id = ?').get(String(mergeId || ''));
    if (!log) throw new ResearchStoreError('PAPER_MERGE_NOT_FOUND', '合并记录不存在', 404);
    if (log.undone_at) throw new ResearchStoreError('PAPER_MERGE_ALREADY_UNDONE', '该次合并已经撤销', 409);
    const latest = this.db.prepare('SELECT action, entity_id FROM research_audit_log ORDER BY id DESC LIMIT 1').get();
    if (latest?.action !== 'paper.merge' || latest?.entity_id !== log.id) {
      throw new ResearchStoreError('PAPER_MERGE_UNDO_EXPIRED', '合并后已有其他数据变更。为避免覆盖新内容，不能自动撤销', 409);
    }
    const snapshot = JSON.parse(log.snapshot_json);
    withTransaction(this.db, () => {
      this.#clearPaperMergeRows(log.target_paper_id, log.source_paper_id);
      const order = ['papers', 'project_papers', 'attachments', 'annotations', 'notes', 'translation_docs', 'collections_papers', 'paper_reading_state', 'paper_note_documents', 'note_citations', 'sentence_notes', 'paper_relations', 'project_paper_evidence_values', 'paper_screening_reviews', 'paper_screening_resolutions', 'paper_duplicate_ignores'];
      for (const key of order) this.#insertSnapshotRows(key === 'collections_papers' ? 'collection_papers' : key, snapshot[key] || []);
      this.db.prepare('UPDATE paper_merge_log SET undone_at = ? WHERE id = ?').run(nowIso(), log.id);
      this.#audit('paper.merge.undo', 'paper_merge', log.id, { targetPaperId: log.target_paper_id, sourcePaperId: log.source_paper_id });
    });
    return { undone: true, mergeId: log.id, papers: [this.getPaper(log.target_paper_id), this.getPaper(log.source_paper_id)] };
  }

  #paperMergeConflicts(targetId, sourceId) {
    const conflicts = [];
    const targetMemberships = new Map(this.db.prepare('SELECT * FROM project_papers WHERE paper_id = ?').all(targetId).map(row => [row.project_id, row]));
    for (const source of this.db.prepare('SELECT * FROM project_papers WHERE paper_id = ?').all(sourceId)) {
      const target = targetMemberships.get(source.project_id);
      if (!target) continue;
      if (target.role && source.role && target.role !== source.role) conflicts.push({ type: 'role', projectId: source.project_id });
      for (const field of ['title_abstract_decision', 'full_text_decision']) {
        const left = target[field] || 'pending';
        const right = source[field] || 'pending';
        if (left !== 'pending' && right !== 'pending' && left !== right) conflicts.push({ type: field, projectId: source.project_id });
      }
      const leftRetrieval = target.retrieval_status || 'auto';
      const rightRetrieval = source.retrieval_status || 'auto';
      if (leftRetrieval !== 'auto' && rightRetrieval !== 'auto' && leftRetrieval !== rightRetrieval) conflicts.push({ type: 'retrieval_status', projectId: source.project_id });
    }
    const targetValues = new Map(this.db.prepare('SELECT project_id, field_id, value_json FROM project_paper_evidence_values WHERE paper_id = ?').all(targetId)
      .map(row => [`${row.project_id}::${row.field_id}`, row.value_json]));
    for (const row of this.db.prepare('SELECT project_id, field_id, value_json FROM project_paper_evidence_values WHERE paper_id = ?').all(sourceId)) {
      const existing = targetValues.get(`${row.project_id}::${row.field_id}`);
      if (existing !== undefined && existing !== row.value_json) conflicts.push({ type: 'evidence_value', projectId: row.project_id, fieldId: row.field_id });
    }
    const targetReviews = new Map(this.db.prepare('SELECT project_id, stage, reviewer_key, decision, reason FROM paper_screening_reviews WHERE paper_id = ?').all(targetId)
      .map(row => [`${row.project_id}::${row.stage}::${row.reviewer_key}`, row]));
    for (const row of this.db.prepare('SELECT project_id, stage, reviewer_key, decision, reason FROM paper_screening_reviews WHERE paper_id = ?').all(sourceId)) {
      const existing = targetReviews.get(`${row.project_id}::${row.stage}::${row.reviewer_key}`);
      if (existing && (existing.decision !== row.decision || existing.reason !== row.reason)) conflicts.push({ type: 'dual_screening_review', projectId: row.project_id, stage: row.stage, reviewerKey: row.reviewer_key });
    }
    const targetResolutions = new Map(this.db.prepare('SELECT project_id, stage, decision, reason, resolution_note FROM paper_screening_resolutions WHERE paper_id = ?').all(targetId)
      .map(row => [`${row.project_id}::${row.stage}`, row]));
    for (const row of this.db.prepare('SELECT project_id, stage, decision, reason, resolution_note FROM paper_screening_resolutions WHERE paper_id = ?').all(sourceId)) {
      const existing = targetResolutions.get(`${row.project_id}::${row.stage}`);
      if (existing && (existing.decision !== row.decision || existing.reason !== row.reason || existing.resolution_note !== row.resolution_note)) conflicts.push({ type: 'dual_screening_resolution', projectId: row.project_id, stage: row.stage });
    }
    return conflicts;
  }

  #mergeProjectMemberships(targetId, sourceId, timestamp) {
    let moved = 0;
    const sourceRows = this.db.prepare('SELECT * FROM project_papers WHERE paper_id = ?').all(sourceId);
    for (const source of sourceRows) {
      const target = this.db.prepare('SELECT * FROM project_papers WHERE project_id = ? AND paper_id = ?').get(source.project_id, targetId);
      if (!target) {
        this.db.prepare(`INSERT INTO project_papers(project_id, paper_id, added_at, role, title_abstract_decision, title_abstract_reason, full_text_decision, full_text_reason, screening_updated_at, retrieval_status, retrieval_reason, retrieval_updated_at)
          VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(source.project_id, targetId, source.added_at, source.role, source.title_abstract_decision, source.title_abstract_reason, source.full_text_decision, source.full_text_reason, source.screening_updated_at, source.retrieval_status || 'auto', source.retrieval_reason || '', source.retrieval_updated_at || null);
      } else {
        const titleDecision = target.title_abstract_decision !== 'pending' ? target.title_abstract_decision : source.title_abstract_decision;
        const fullDecision = target.full_text_decision !== 'pending' ? target.full_text_decision : source.full_text_decision;
        const retrievalStatus = (target.retrieval_status || 'auto') !== 'auto' ? target.retrieval_status : (source.retrieval_status || 'auto');
        const retrievalFromSource = (target.retrieval_status || 'auto') === 'auto' && (source.retrieval_status || 'auto') !== 'auto';
        this.db.prepare(`UPDATE project_papers SET role = ?, title_abstract_decision = ?, title_abstract_reason = ?, full_text_decision = ?, full_text_reason = ?, screening_updated_at = ?, retrieval_status = ?, retrieval_reason = ?, retrieval_updated_at = ? WHERE project_id = ? AND paper_id = ?`).run(
          target.role || source.role, titleDecision, target.title_abstract_reason || source.title_abstract_reason,
          fullDecision, target.full_text_reason || source.full_text_reason,
          [target.screening_updated_at, source.screening_updated_at].filter(Boolean).sort().at(-1) || null,
          retrievalStatus, retrievalFromSource ? (source.retrieval_reason || '') : (target.retrieval_reason || ''),
          [target.retrieval_updated_at, source.retrieval_updated_at].filter(Boolean).sort().at(-1) || null,
          source.project_id, targetId,
        );
      }
      const values = this.db.prepare('SELECT * FROM project_paper_evidence_values WHERE project_id = ? AND paper_id = ?').all(source.project_id, sourceId);
      for (const value of values) {
        this.db.prepare(`INSERT OR IGNORE INTO project_paper_evidence_values(project_id, paper_id, field_id, value_json, updated_at) VALUES(?, ?, ?, ?, ?)`)
          .run(value.project_id, targetId, value.field_id, value.value_json, value.updated_at || timestamp);
      }
      const reviews = this.db.prepare('SELECT * FROM paper_screening_reviews WHERE project_id = ? AND paper_id = ?').all(source.project_id, sourceId);
      for (const review of reviews) {
        this.db.prepare(`INSERT OR IGNORE INTO paper_screening_reviews(project_id, paper_id, stage, reviewer_key, decision, reason, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?)`)
          .run(review.project_id, targetId, review.stage, review.reviewer_key, review.decision, review.reason, review.updated_at);
      }
      const resolutions = this.db.prepare('SELECT * FROM paper_screening_resolutions WHERE project_id = ? AND paper_id = ?').all(source.project_id, sourceId);
      for (const resolution of resolutions) {
        this.db.prepare(`INSERT OR IGNORE INTO paper_screening_resolutions(project_id, paper_id, stage, decision, reason, resolution_note, resolved_at) VALUES(?, ?, ?, ?, ?, ?, ?)`)
          .run(resolution.project_id, targetId, resolution.stage, resolution.decision, resolution.reason, resolution.resolution_note, resolution.resolved_at);
      }
      this.db.prepare('DELETE FROM paper_screening_reviews WHERE project_id = ? AND paper_id = ?').run(source.project_id, sourceId);
      this.db.prepare('DELETE FROM paper_screening_resolutions WHERE project_id = ? AND paper_id = ?').run(source.project_id, sourceId);
      this.db.prepare('DELETE FROM project_paper_evidence_values WHERE project_id = ? AND paper_id = ?').run(source.project_id, sourceId);
      this.db.prepare('DELETE FROM project_papers WHERE project_id = ? AND paper_id = ?').run(source.project_id, sourceId);
      moved += 1;
    }
    return moved;
  }

  #paperMergeSnapshot(targetId, sourceId) {
    const ids = [targetId, sourceId];
    const attachments = this.db.prepare('SELECT * FROM attachments WHERE paper_id IN (?, ?)').all(...ids);
    const attachmentIds = attachments.map(row => row.id);
    const noteDocs = this.db.prepare('SELECT * FROM paper_note_documents WHERE paper_id IN (?, ?)').all(...ids);
    const docIds = noteDocs.map(row => row.id);
    const inList = (values) => values.length ? values.map(() => '?').join(',') : "''";
    return {
      papers: this.db.prepare('SELECT * FROM papers WHERE id IN (?, ?)').all(...ids),
      project_papers: this.db.prepare('SELECT * FROM project_papers WHERE paper_id IN (?, ?)').all(...ids),
      attachments,
      annotations: attachmentIds.length ? this.db.prepare(`SELECT * FROM annotations WHERE attachment_id IN (${inList(attachmentIds)})`).all(...attachmentIds) : [],
      notes: this.db.prepare(`SELECT * FROM notes WHERE paper_id IN (?, ?) OR linked_paper_id IN (?, ?)${attachmentIds.length ? ` OR attachment_id IN (${inList(attachmentIds)})` : ''}`).all(...ids, ...ids, ...attachmentIds),
      translation_docs: this.db.prepare(`SELECT * FROM translation_docs WHERE paper_id IN (?, ?)${attachmentIds.length ? ` OR attachment_id IN (${inList(attachmentIds)})` : ''}`).all(...ids, ...attachmentIds),
      collections_papers: this.db.prepare('SELECT * FROM collection_papers WHERE paper_id IN (?, ?)').all(...ids),
      paper_reading_state: this.db.prepare('SELECT * FROM paper_reading_state WHERE paper_id IN (?, ?)').all(...ids),
      paper_note_documents: noteDocs,
      note_citations: this.db.prepare(`SELECT * FROM note_citations WHERE paper_id IN (?, ?)${docIds.length ? ` OR note_document_id IN (${inList(docIds)})` : ''}`).all(...ids, ...docIds),
      sentence_notes: this.db.prepare(`SELECT * FROM sentence_notes WHERE paper_id IN (?, ?)${attachmentIds.length ? ` OR attachment_id IN (${inList(attachmentIds)})` : ''}`).all(...ids, ...attachmentIds),
      paper_relations: this.db.prepare('SELECT * FROM paper_relations WHERE from_paper_id IN (?, ?) OR to_paper_id IN (?, ?)').all(...ids, ...ids),
      project_paper_evidence_values: this.db.prepare('SELECT * FROM project_paper_evidence_values WHERE paper_id IN (?, ?)').all(...ids),
      paper_screening_reviews: this.db.prepare('SELECT * FROM paper_screening_reviews WHERE paper_id IN (?, ?)').all(...ids),
      paper_screening_resolutions: this.db.prepare('SELECT * FROM paper_screening_resolutions WHERE paper_id IN (?, ?)').all(...ids),
      paper_duplicate_ignores: this.db.prepare('SELECT * FROM paper_duplicate_ignores WHERE left_paper_id IN (?, ?) OR right_paper_id IN (?, ?)').all(...ids, ...ids),
    };
  }

  #clearPaperMergeRows(targetId, sourceId) {
    const ids = [targetId, sourceId];
    const attachmentIds = this.db.prepare('SELECT id FROM attachments WHERE paper_id IN (?, ?)').all(...ids).map(row => row.id);
    const docIds = this.db.prepare('SELECT id FROM paper_note_documents WHERE paper_id IN (?, ?)').all(...ids).map(row => row.id);
    const inList = values => values.length ? values.map(() => '?').join(',') : "''";
    this.db.prepare('DELETE FROM project_paper_evidence_values WHERE paper_id IN (?, ?)').run(...ids);
    this.db.prepare('DELETE FROM paper_screening_reviews WHERE paper_id IN (?, ?)').run(...ids);
    this.db.prepare('DELETE FROM paper_screening_resolutions WHERE paper_id IN (?, ?)').run(...ids);
    this.db.prepare(`DELETE FROM note_citations WHERE paper_id IN (?, ?)${docIds.length ? ` OR note_document_id IN (${inList(docIds)})` : ''}`).run(...ids, ...docIds);
    this.db.prepare(`DELETE FROM sentence_notes WHERE paper_id IN (?, ?)${attachmentIds.length ? ` OR attachment_id IN (${inList(attachmentIds)})` : ''}`).run(...ids, ...attachmentIds);
    this.db.prepare(`DELETE FROM notes WHERE paper_id IN (?, ?) OR linked_paper_id IN (?, ?)${attachmentIds.length ? ` OR attachment_id IN (${inList(attachmentIds)})` : ''}`).run(...ids, ...ids, ...attachmentIds);
    this.db.prepare(`DELETE FROM translation_docs WHERE paper_id IN (?, ?)${attachmentIds.length ? ` OR attachment_id IN (${inList(attachmentIds)})` : ''}`).run(...ids, ...attachmentIds);
    if (attachmentIds.length) this.db.prepare(`DELETE FROM annotations WHERE attachment_id IN (${inList(attachmentIds)})`).run(...attachmentIds);
    this.db.prepare('DELETE FROM paper_relations WHERE from_paper_id IN (?, ?) OR to_paper_id IN (?, ?)').run(...ids, ...ids);
    this.db.prepare('DELETE FROM collection_papers WHERE paper_id IN (?, ?)').run(...ids);
    this.db.prepare('DELETE FROM paper_reading_state WHERE paper_id IN (?, ?)').run(...ids);
    this.db.prepare('DELETE FROM paper_note_documents WHERE paper_id IN (?, ?)').run(...ids);
    this.db.prepare('DELETE FROM attachments WHERE paper_id IN (?, ?)').run(...ids);
    this.db.prepare('DELETE FROM project_papers WHERE paper_id IN (?, ?)').run(...ids);
    this.db.prepare('DELETE FROM paper_duplicate_ignores WHERE left_paper_id IN (?, ?) OR right_paper_id IN (?, ?)').run(...ids, ...ids);
    this.db.prepare('DELETE FROM papers WHERE id IN (?, ?)').run(...ids);
  }

  #insertSnapshotRows(table, rows) {
    const allowed = new Set(['papers', 'project_papers', 'attachments', 'annotations', 'notes', 'translation_docs', 'collection_papers', 'paper_reading_state', 'paper_note_documents', 'note_citations', 'sentence_notes', 'paper_relations', 'project_paper_evidence_values', 'paper_screening_reviews', 'paper_screening_resolutions', 'paper_duplicate_ignores']);
    if (!allowed.has(table)) throw new Error(`Unsupported snapshot table: ${table}`);
    for (const row of rows) {
      const columns = Object.keys(row);
      const sql = `INSERT INTO ${table} (${columns.map(column => `"${column}"`).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`;
      this.db.prepare(sql).run(...columns.map(column => row[column]));
    }
  }

  #paperMergeStats(paperId) {
    const scalar = (sql, ...args) => Number(this.db.prepare(sql).get(...args)?.count || 0);
    return {
      projects: scalar('SELECT COUNT(*) AS count FROM project_papers WHERE paper_id = ?', paperId),
      attachments: scalar('SELECT COUNT(*) AS count FROM attachments WHERE paper_id = ?', paperId),
      notes: scalar('SELECT COUNT(*) AS count FROM notes WHERE paper_id = ? OR linked_paper_id = ?', paperId, paperId),
      sentenceNotes: scalar('SELECT COUNT(*) AS count FROM sentence_notes WHERE paper_id = ?', paperId),
      noteDocuments: scalar('SELECT COUNT(*) AS count FROM paper_note_documents WHERE paper_id = ?', paperId),
      citations: scalar('SELECT COUNT(*) AS count FROM note_citations WHERE paper_id = ?', paperId),
      relations: scalar('SELECT COUNT(*) AS count FROM paper_relations WHERE from_paper_id = ? OR to_paper_id = ?', paperId, paperId),
      codingValues: scalar('SELECT COUNT(*) AS count FROM project_paper_evidence_values WHERE paper_id = ?', paperId),
    };
  }

  /** 把一篇已保存的文献加入项目（纯元数据，不下载 PDF）。幂等。 */
  addPaperToProject(projectId, paperId) {
    if (!this.getProject(projectId)) throw new ResearchStoreError('PROJECT_NOT_FOUND', '项目不存在', 404);
    const paper = this.db.prepare('SELECT id FROM papers WHERE id = ?').get(String(paperId || ''));
    if (!paper) throw new ResearchStoreError('PAPER_NOT_FOUND', '文献不存在', 404);
    this.db.prepare(`
      INSERT OR IGNORE INTO project_papers(project_id, paper_id, added_at) VALUES(?, ?, ?)
    `).run(projectId, paperId, nowIso());
    return this.listProjectPapers(projectId).find((item) => item.id === paperId) || null;
  }

  /**
   * 把一条统一文献检索记录安全地写入本地文献表（insert-or-update）。
   * - 有 DOI 时优先按 DOI 去重：若已有同 DOI 文献则复用其 id，保留收藏等状态；
   * - 无 DOI 时用 source-sourceId 生成稳定 id；
   * - 不覆盖已有 pdf_url / source_url / source_name（除非新记录提供了它们）；
   * - 记录一条 paper.search_saved 审计。
   */
  upsertSearchResult(record) {
    const source = String(record?.source || '').trim();
    const sourceId = String(record?.sourceId || '').trim();
    const doi = String(record?.doi || '').trim() || null;
    const fallbackId = doi
      ? `doi-${doi.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`
      : (source && sourceId ? `${source}-${String(sourceId).replace(/[^a-z0-9_-]+/gi, '-').toLowerCase()}` : '');
    // normalizePaper 对缺失年份（null/''）会转成 0，这里先转成 undefined 让其落库为 NULL
    const safeRecord = { ...record, id: record?.id || fallbackId || undefined };
    if (safeRecord.year === null || safeRecord.year === undefined || safeRecord.year === '') {
      safeRecord.year = undefined;
    }
    const normalized = normalizePaper(safeRecord);

    let targetId = normalized.id;
    if (normalized.doi) {
      const existing = this.db.prepare('SELECT id FROM papers WHERE doi = ? AND id != ? LIMIT 1')
        .get(normalized.doi, normalized.id);
      if (existing) targetId = existing.id;
    }

    const timestamp = nowIso();
    this.db.prepare(`
      INSERT INTO papers(
        id, doi, title, authors, venue, year, abstract, topic, pdf_url, source_url,
        source_name, cited_by_count, openalex_id, created_at, updated_at
      ) VALUES(
        @id, @doi, @title, @authors, @venue, @year, @abstract, @topic, @pdfUrl,
        @sourceUrl, @sourceName, @citedByCount, @openalexId, @createdAt, @updatedAt
      )
      ON CONFLICT(id) DO UPDATE SET
        doi = COALESCE(excluded.doi, papers.doi), title = excluded.title,
        authors = excluded.authors, venue = excluded.venue, year = excluded.year,
        abstract = excluded.abstract, topic = excluded.topic,
        pdf_url = COALESCE(excluded.pdf_url, papers.pdf_url),
        source_url = COALESCE(excluded.source_url, papers.source_url),
        source_name = COALESCE(excluded.source_name, papers.source_name),
        cited_by_count = COALESCE(excluded.cited_by_count, papers.cited_by_count),
        openalex_id = COALESCE(excluded.openalex_id, papers.openalex_id),
        updated_at = excluded.updated_at
    `).run({ ...normalized, id: targetId, createdAt: timestamp, updatedAt: timestamp });
    this.#audit('paper.search_saved', 'paper', targetId, {
      source,
      sourceId,
      doi: normalized.doi,
      title: normalized.title,
    });
    return this.getPaper(targetId);
  }

  /**
   * 创建一条全文翻译任务记录（pending）。译文文档最终写入
   * library/projects/<projectId>/translations/ 目录，记录里只存相对路径。
   */
  createTranslationDoc({ projectId, attachmentId, sourceLang = 'en', targetLang = 'zh' }) {
    const context = this.getAttachmentContext(projectId, attachmentId);
    const id = crypto.randomUUID();
    const timestamp = nowIso();
    this.db.prepare(`
      INSERT INTO translation_docs(
        id, project_id, paper_id, attachment_id, source_lang, target_lang,
        status, progress_done, progress_total, created_at, updated_at
      ) VALUES(?, ?, ?, ?, ?, ?, 'pending', 0, 0, ?, ?)
    `).run(id, projectId, context.paper.id, attachmentId, sourceLang, targetLang, timestamp, timestamp);
    this.#audit('translation.document.create', 'translation_doc', id, {
      projectId, attachmentId, paperId: context.paper.id, sourceLang, targetLang,
    });
    return this.getTranslationDoc(id);
  }

  /** 更新翻译任务的状态/进度/结果；状态首次进入 done/failed 时写对应审计。 */
  updateTranslationDoc(id, patch = {}) {
    const row = this.db.prepare('SELECT * FROM translation_docs WHERE id = ?').get(id);
    if (!row) throw new ResearchStoreError('TRANSLATION_DOC_NOT_FOUND', '译文文档记录不存在', 404);
    const status = patch.status !== undefined ? String(patch.status) : row.status;
    const done = patch.progressDone !== undefined ? Number(patch.progressDone) : row.progress_done;
    const total = patch.progressTotal !== undefined ? Number(patch.progressTotal) : row.progress_total;
    const file = patch.fileName !== undefined ? (patch.fileName ? String(patch.fileName) : null) : row.file_name;
    const rel = patch.relativePath !== undefined ? (patch.relativePath ? String(patch.relativePath) : null) : row.relative_path;
    const error = patch.error !== undefined ? (patch.error ? String(patch.error).slice(0, 1000) : null) : row.error;
    const model = patch.model !== undefined ? (patch.model ? String(patch.model) : null) : row.model;
    const chars = patch.charCount !== undefined ? Number(patch.charCount) : row.char_count;
    const timestamp = nowIso();
    this.db.prepare(`
      UPDATE translation_docs SET status = ?, progress_done = ?, progress_total = ?,
        file_name = ?, relative_path = ?, error = ?, model = ?, char_count = ?, updated_at = ?
      WHERE id = ?
    `).run(status, done, total, file, rel, error, model, chars, timestamp, id);
    if (status === 'done' && row.status !== 'done') {
      this.#audit('translation.document.complete', 'translation_doc', id, {
        projectId: row.project_id, fileName: file, charCount: chars, model,
      });
    }
    if (status === 'failed' && row.status !== 'failed') {
      this.#audit('translation.document.fail', 'translation_doc', id, {
        projectId: row.project_id, error, progressDone: done, progressTotal: total,
      });
    }
    return this.getTranslationDoc(id);
  }

  listTranslationDocs(projectId) {
    if (!this.getProject(projectId)) throw new ResearchStoreError('PROJECT_NOT_FOUND', '项目不存在', 404);
    return this.db.prepare(`
      SELECT t.*, p.title AS paper_title
      FROM translation_docs t
      JOIN papers p ON p.id = t.paper_id
      WHERE t.project_id = ?
      ORDER BY t.updated_at DESC
    `).all(projectId).map(translationDocRow);
  }

  getTranslationDoc(id) {
    const row = this.db.prepare(`
      SELECT t.*, p.title AS paper_title
      FROM translation_docs t
      JOIN papers p ON p.id = t.paper_id
      WHERE t.id = ?
    `).get(id);
    if (!row) return null;
    const doc = translationDocRow(row);
    if (row.relative_path) doc.absolutePath = this.resolveAttachmentPath(row.relative_path);
    return doc;
  }

  /** 译文文档目录：library/projects/<projectId>/translations/ */
  translationFileDir(projectId) {
    const safeProjectId = String(projectId).replace(/[^a-z0-9_-]/gi, '_');
    return path.join(this.projectNotesDir, safeProjectId, 'translations');
  }

  // ── 期刊源与定时同步 ───────────────────────

  /** 预设期刊源 upsert（INSERT ... ON CONFLICT：修正 venue/issn/topic，不触碰 enabled 与同步状态）。 */
  ensureJournalSources(sources) {
    const upsert = this.db.prepare(`
      INSERT INTO journal_sources(id, venue, issn, topic, region, enabled, created_at)
      VALUES(?, ?, ?, ?, ?, 1, ?)
      ON CONFLICT(id) DO UPDATE SET
        venue = excluded.venue,
        issn = excluded.issn,
        topic = excluded.topic,
        region = excluded.region
    `);
    const timestamp = nowIso();
    withTransaction(this.db, () => {
      for (const source of sources) {
        if (!source?.id || !source?.issn) continue;
        upsert.run(
          String(source.id),
          String(source.venue || ''),
          String(source.issn).trim(),
          String(source.topic || '未分类'),
          String(source.region === 'cn' ? 'cn' : 'intl'),
          timestamp,
        );
      }
    });
  }

  listJournalSources() {
    return this.db.prepare(`
      SELECT * FROM journal_sources
      ORDER BY enabled DESC, venue COLLATE NOCASE ASC
    `).all().map(journalSourceRow);
  }

  upsertJournalSourceStatus(id, patch = {}) {
    const row = this.db.prepare('SELECT * FROM journal_sources WHERE id = ?').get(id);
    if (!row) return null;
    this.db.prepare(`
      UPDATE journal_sources SET
        last_synced_at = COALESCE(?, last_synced_at),
        last_inserted = ?,
        last_error = ?,
        enabled = ?
      WHERE id = ?
    `).run(
      patch.lastSyncedAt !== undefined ? patch.lastSyncedAt : null,
      patch.lastInserted !== undefined ? Number(patch.lastInserted) : row.last_inserted,
      patch.lastError !== undefined ? (patch.lastError ? String(patch.lastError).slice(0, 500) : null) : row.last_error,
      patch.enabled !== undefined ? (patch.enabled ? 1 : 0) : row.enabled,
      id,
    );
    return this.listJournalSources().find(source => source.id === id) || null;
  }

  addJournalSyncLog(entry) {
    this.db.prepare(`
      INSERT INTO journal_sync_log(source_id, venue, fetched, inserted, pruned, error, created_at)
      VALUES(?, ?, ?, ?, ?, ?, ?)
    `).run(
      String(entry.sourceId || ''),
      String(entry.venue || '').slice(0, 200),
      Number(entry.fetched || 0),
      Number(entry.inserted || 0),
      Number(entry.pruned || 0),
      entry.error ? String(entry.error).slice(0, 500) : null,
      nowIso(),
    );
  }

  /**
   * 安全清理超出「近三期」的旧期刊同步文献：
   * - 只处理 source_name = '期刊同步' 且 venue 匹配的记录；
   * - 跳过已收藏（is_favorite=1）、已进入项目（project_papers）、已有 PDF 附件（attachments）的文献；
   * - 每次删除写一条 journal.prune 审计。
   * @returns {number} 清理的文献数
   */
  pruneJournalSyncPapers(venue, keepIds) {
    const keep = new Set(Array.from(keepIds || []).map(id => String(id)));
    const candidates = this.db.prepare(`
      SELECT p.id FROM papers p
      WHERE p.source_name = '期刊同步' AND p.venue = ?
        AND p.is_favorite = 0
        AND NOT EXISTS (SELECT 1 FROM project_papers pp WHERE pp.paper_id = p.id)
        AND NOT EXISTS (SELECT 1 FROM attachments a WHERE a.paper_id = p.id)
    `).all(String(venue || ''));
    return withTransaction(this.db, () => {
      let pruned = 0;
      const remove = this.db.prepare('DELETE FROM papers WHERE id = ?');
      for (const row of candidates) {
        if (keep.has(row.id)) continue;
        remove.run(row.id);
        pruned += 1;
      }
      if (pruned > 0) {
        this.#audit('journal.prune', 'journal', String(venue || ''), { venue, pruned });
      }
      return pruned;
    });
  }

  listJournalSyncLogs(limit = 8) {
    return this.db.prepare(`
      SELECT * FROM journal_sync_log
      ORDER BY id DESC
      LIMIT ?
    `).all(limit).map(journalSyncLogRow);
  }

  /** 主题订阅（阶段「研究工作流」骨架）：按主题关键词订阅期刊最新文献。 */
  listTopicSubscriptions() {
    return this.db.prepare(`
      SELECT * FROM topic_subscriptions
      ORDER BY created_at DESC
    `).all().map(row => ({
      id: row.id,
      topic: row.topic,
      keywords: row.keywords,
      journalIds: JSON.parse(row.journal_ids || '[]'),
      createdAt: row.created_at,
      lastCheckedAt: row.last_checked_at || null,
    }));
  }

  subscribeTopic({ topic, keywords = '', journalIds = [] }) {
    const id = crypto.randomUUID();
    const timestamp = nowIso();
    this.db.prepare(`
      INSERT INTO topic_subscriptions(id, topic, keywords, journal_ids, created_at)
      VALUES(?, ?, ?, ?, ?)
      ON CONFLICT(topic) DO UPDATE SET
        keywords = excluded.keywords,
        journal_ids = excluded.journal_ids
    `).run(id, String(topic || '').trim().slice(0, 80), String(keywords || '').trim().slice(0, 300), JSON.stringify(Array.isArray(journalIds) ? journalIds.map(String).slice(0, 30) : []), timestamp);
    this.#audit('topic.subscribe', 'topic', String(topic || '').trim().slice(0, 80));
    return this.listTopicSubscriptions().find(item => item.topic === String(topic || '').trim());
  }

  unsubscribeTopic(topic) {
    const result = this.db.prepare('DELETE FROM topic_subscriptions WHERE topic = ?')
      .run(String(topic || '').trim());
    if (result.changes > 0) {
      this.#audit('topic.unsubscribe', 'topic', String(topic || '').trim().slice(0, 80));
    }
    return result.changes > 0;
  }

  /** 当前文献库中全部 DOI（用于同步时判断新增）。 */
  listPaperDois() {
    return new Set(
      this.db.prepare('SELECT doi FROM papers WHERE doi IS NOT NULL AND doi != ?').all('')
        .map(row => row.doi),
    );
  }

  /** 当前文献库中全部文献 id（用于无 DOI 记录的幂等判定）。 */
  listPaperIds() {
    return new Set(this.db.prepare('SELECT id FROM papers').all().map(row => row.id));
  }

  /**
   * 记录一次 Agent 工具调用（写入类工具在完成状态变更后调用）。
   * 底层 store 方法已写入各自的动作审计行（如 note.create），这里再追加
   * 一条 agent.tool.invoke 来源记录，把「哪个会话、哪个工具、什么参数」
   * 与数据变更审计行关联起来。参数会做有界序列化，避免超大内容进库。
   */
  auditAgentToolCall(toolName, params = {}, agent = {}) {
    this.#audit('agent.tool.invoke', 'tool', String(toolName || 'unknown').slice(0, 120), {
      params: sanitizeAuditParams(params),
      sessionId: agent.sessionId || null,
      sessionPath: agent.sessionPath || null,
      userId: agent.userId || null,
      agentId: agent.agentId || null,
    });
  }

  resolveAttachmentPath(relativePath) {
    const absolute = path.resolve(this.dataDir, relativePath);
    const relative = path.relative(this.dataDir, absolute);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new ResearchStoreError('ATTACHMENT_PATH_INVALID', '附件路径无效', 500);
    }
    return absolute;
  }

  getQualityConfig(projectId) {
    if (!this.getProject(projectId)) throw new ResearchStoreError('PROJECT_NOT_FOUND', '项目不存在', 404);
    const row = this.db.prepare('SELECT * FROM project_quality_config WHERE project_id = ?').get(projectId);
    const screening = this.db.prepare('SELECT * FROM project_dual_screening_config WHERE project_id = ?').get(projectId);
    return {
      projectId,
      templateId: row?.template_id || 'psychology-general',
      dualEnabled: row?.dual_enabled === 1,
      reviewerAName: row?.reviewer_a_name || screening?.reviewer_a_name || '评定者 A',
      reviewerBName: row?.reviewer_b_name || screening?.reviewer_b_name || '评定者 B',
      updatedAt: row?.updated_at || null,
    };
  }

  updateQualityConfig(projectId, input = {}) {
    const current = this.getQualityConfig(projectId);
    const templateId = String(input.templateId ?? current.templateId);
    if (!RISK_OF_BIAS_TEMPLATES.some(item => item.id === templateId)) throw new ResearchStoreError('ROB_TEMPLATE_INVALID', '风险偏倚模板无效', 400);
    const reviewerAName = String(input.reviewerAName ?? current.reviewerAName).trim().slice(0, 60) || '评定者 A';
    const reviewerBName = String(input.reviewerBName ?? current.reviewerBName).trim().slice(0, 60) || '评定者 B';
    const dualEnabled = input.dualEnabled ?? current.dualEnabled;
    const stamp = nowIso();
    this.db.prepare(`INSERT INTO project_quality_config(project_id, template_id, dual_enabled, reviewer_a_name, reviewer_b_name, created_at, updated_at)
      VALUES(?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id) DO UPDATE SET template_id=excluded.template_id, dual_enabled=excluded.dual_enabled,
      reviewer_a_name=excluded.reviewer_a_name, reviewer_b_name=excluded.reviewer_b_name, updated_at=excluded.updated_at`)
      .run(projectId, templateId, dualEnabled ? 1 : 0, reviewerAName, reviewerBName, stamp, stamp);
    this.#audit('quality.config.update', 'project', projectId, { templateId, dualEnabled: Boolean(dualEnabled) });
    return this.getQualityConfig(projectId);
  }

  saveRobReview(projectId, paperId, input = {}) {
    if (!this.db.prepare('SELECT 1 FROM project_papers WHERE project_id = ? AND paper_id = ?').get(projectId, paperId)) throw new ResearchStoreError('PROJECT_PAPER_NOT_FOUND', '项目中没有该文献', 404);
    const config = this.getQualityConfig(projectId);
    const template = RISK_OF_BIAS_TEMPLATES.find(item => item.id === String(input.templateId || config.templateId));
    if (!template) throw new ResearchStoreError('ROB_TEMPLATE_INVALID', '风险偏倚模板无效', 400);
    const reviewerKey = String(input.reviewerKey || 'a');
    if (!['a', 'b'].includes(reviewerKey)) throw new ResearchStoreError('ROB_REVIEWER_INVALID', '评定者无效', 400);
    if (reviewerKey === 'b' && !config.dualEnabled) throw new ResearchStoreError('ROB_DUAL_DISABLED', '尚未启用双人质量评定', 409);
    const assessmentId = String(input.assessmentId || 'primary').trim().slice(0, 80) || 'primary';
    const outcomeLabel = String(input.outcomeLabel || '主要结局').trim().slice(0, 160) || '主要结局';
    const domains = Array.isArray(input.domains) ? input.domains : [];
    const allowedDomains = new Set(template.domains.map(item => item.id));
    const seen = new Set();
    const normalized = domains.map(item => {
      const domainId = String(item?.domainId || '');
      const judgment = String(item?.judgment || '');
      const support = String(item?.support || '').trim();
      if (!allowedDomains.has(domainId) || seen.has(domainId)) throw new ResearchStoreError('ROB_DOMAIN_INVALID', '风险偏倚领域无效或重复', 400);
      if (!['pending', ...template.judgments].includes(judgment)) throw new ResearchStoreError('ROB_JUDGMENT_INVALID', '风险偏倚判断无效', 400);
      if (support.length > 2000) throw new ResearchStoreError('ROB_SUPPORT_TOO_LONG', '判断依据不能超过 2000 字', 400);
      seen.add(domainId);
      return { domainId, judgment, support };
    });
    const stamp = nowIso();
    const upsert = this.db.prepare(`INSERT INTO paper_rob_reviews(project_id,paper_id,assessment_id,outcome_label,template_id,reviewer_key,domain_id,judgment,support,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(project_id,paper_id,assessment_id,reviewer_key,domain_id) DO UPDATE SET
      outcome_label=excluded.outcome_label,template_id=excluded.template_id,judgment=excluded.judgment,support=excluded.support,updated_at=excluded.updated_at`);
    withTransaction(this.db, () => { for (const item of normalized) upsert.run(projectId, paperId, assessmentId, outcomeLabel, template.id, reviewerKey, item.domainId, item.judgment, item.support, stamp); });
    this.#audit('quality.rob.review', 'paper', paperId, { projectId, assessmentId, reviewerKey, domains: normalized.length });
    return this.buildQualityOverview(projectId);
  }

  resolveRobDomain(projectId, paperId, input = {}) {
    if (!this.db.prepare('SELECT 1 FROM project_papers WHERE project_id = ? AND paper_id = ?').get(projectId, paperId)) throw new ResearchStoreError('PROJECT_PAPER_NOT_FOUND', '项目中没有该文献', 404);
    const config = this.getQualityConfig(projectId);
    const template = RISK_OF_BIAS_TEMPLATES.find(item => item.id === config.templateId);
    const assessmentId = String(input.assessmentId || 'primary').trim().slice(0, 80) || 'primary';
    const domainId = String(input.domainId || '');
    const judgment = String(input.judgment || '');
    const resolutionNote = String(input.resolutionNote || '').trim();
    if (!template?.domains.some(item => item.id === domainId) || !template.judgments.includes(judgment)) throw new ResearchStoreError('ROB_RESOLUTION_INVALID', '裁决领域或结论无效', 400);
    if (!resolutionNote || resolutionNote.length > 2000) throw new ResearchStoreError('ROB_RESOLUTION_NOTE_REQUIRED', '请填写不超过 2000 字的裁决依据', 400);
    const pair = this.db.prepare(`SELECT reviewer_key,judgment FROM paper_rob_reviews WHERE project_id=? AND paper_id=? AND assessment_id=? AND domain_id=?`).all(projectId, paperId, assessmentId, domainId);
    if (pair.length < 2) throw new ResearchStoreError('ROB_RESOLUTION_PREMATURE', '两位评定者均提交后才能裁决', 409);
    const stamp = nowIso();
    this.db.prepare(`INSERT INTO paper_rob_resolutions(project_id,paper_id,assessment_id,template_id,domain_id,judgment,resolution_note,resolved_at)
      VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(project_id,paper_id,assessment_id,template_id,domain_id) DO UPDATE SET judgment=excluded.judgment,resolution_note=excluded.resolution_note,resolved_at=excluded.resolved_at`)
      .run(projectId, paperId, assessmentId, template.id, domainId, judgment, resolutionNote, stamp);
    this.#audit('quality.rob.resolve', 'paper', paperId, { projectId, assessmentId, domainId, judgment });
    return this.buildQualityOverview(projectId);
  }

  listGradeOutcomes(projectId) {
    if (!this.getProject(projectId)) throw new ResearchStoreError('PROJECT_NOT_FOUND', '项目不存在', 404);
    const rows = this.db.prepare('SELECT * FROM project_grade_outcomes WHERE project_id=? ORDER BY CASE importance WHEN \'critical\' THEN 0 WHEN \'important\' THEN 1 ELSE 2 END, created_at').all(projectId);
    const domainStmt = this.db.prepare('SELECT * FROM grade_domain_judgments WHERE outcome_id=?');
    return rows.map(row => {
      const domains = Object.fromEntries(domainStmt.all(row.id).map(item => [item.domain_id, { level: Number(item.level), rationale: item.rationale || '' }]));
      const start = row.study_design === 'randomized' ? 4 : row.study_design === 'observational' ? 2 : 3;
      const suggestedCertainty = Math.max(1, Math.min(4, start + Object.values(domains).reduce((sum, item) => sum + Number(item.level || 0), 0)));
      return { id: row.id, projectId: row.project_id, title: row.title, importance: row.importance, studyDesign: row.study_design,
        effectEstimate: row.effect_estimate || '', participants: row.participants == null ? null : Number(row.participants), studies: row.studies == null ? null : Number(row.studies),
        confirmedCertainty: row.confirmed_certainty == null ? null : Number(row.confirmed_certainty), confirmationNote: row.confirmation_note || '', suggestedCertainty, domains,
        createdAt: row.created_at, updatedAt: row.updated_at };
    });
  }

  saveGradeOutcome(projectId, input = {}, outcomeId = null) {
    if (!this.getProject(projectId)) throw new ResearchStoreError('PROJECT_NOT_FOUND', '项目不存在', 404);
    const current = outcomeId ? this.listGradeOutcomes(projectId).find(item => item.id === outcomeId) : null;
    if (outcomeId && !current) throw new ResearchStoreError('GRADE_OUTCOME_NOT_FOUND', 'GRADE 结局不存在', 404);
    const title = String(input.title ?? current?.title ?? '').trim();
    const importance = String(input.importance ?? current?.importance ?? 'critical');
    const studyDesign = String(input.studyDesign ?? current?.studyDesign ?? 'randomized');
    const effectEstimate = String(input.effectEstimate ?? current?.effectEstimate ?? '').trim();
    const numberOrNull = value => value === '' || value == null ? null : Number(value);
    const participants = numberOrNull(input.participants ?? current?.participants);
    const studies = numberOrNull(input.studies ?? current?.studies);
    const confirmedCertainty = numberOrNull(input.confirmedCertainty ?? current?.confirmedCertainty);
    const confirmationNote = String(input.confirmationNote ?? current?.confirmationNote ?? '').trim();
    if (!title || title.length > 200 || !['critical','important','not_important'].includes(importance) || !['randomized','observational','other'].includes(studyDesign)) throw new ResearchStoreError('GRADE_OUTCOME_INVALID', 'GRADE 结局信息无效', 400);
    if (effectEstimate.length > 500 || confirmationNote.length > 2000 || [participants, studies].some(value => value != null && (!Number.isInteger(value) || value < 0)) || (confirmedCertainty != null && ![1,2,3,4].includes(confirmedCertainty))) throw new ResearchStoreError('GRADE_OUTCOME_INVALID', 'GRADE 数量、确定性或说明无效', 400);
    const domainsInput = Array.isArray(input.domains) ? input.domains : null;
    const normalizedDomains = domainsInput?.map(item => {
      const def = GRADE_DOMAINS.find(domain => domain.id === String(item?.domainId));
      const level = Number(item?.level || 0); const rationale = String(item?.rationale || '').trim();
      if (!def || !Number.isInteger(level) || level < -2 || level > 2 || (def.direction === 'down' && level > 0) || (def.direction === 'up' && level < 0) || rationale.length > 2000) throw new ResearchStoreError('GRADE_DOMAIN_INVALID', 'GRADE 领域判断无效', 400);
      return { domainId: def.id, level, rationale };
    }) || null;
    const id = outcomeId || crypto.randomUUID(); const stamp = nowIso();
    withTransaction(this.db, () => {
      this.db.prepare(`INSERT INTO project_grade_outcomes(id,project_id,title,importance,study_design,effect_estimate,participants,studies,confirmed_certainty,confirmation_note,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,importance=excluded.importance,study_design=excluded.study_design,effect_estimate=excluded.effect_estimate,participants=excluded.participants,studies=excluded.studies,confirmed_certainty=excluded.confirmed_certainty,confirmation_note=excluded.confirmation_note,updated_at=excluded.updated_at`)
        .run(id, projectId, title, importance, studyDesign, effectEstimate, participants, studies, confirmedCertainty, confirmationNote, current?.createdAt || stamp, stamp);
      if (normalizedDomains) {
        this.db.prepare('DELETE FROM grade_domain_judgments WHERE outcome_id=?').run(id);
        const insert = this.db.prepare('INSERT INTO grade_domain_judgments(outcome_id,domain_id,level,rationale,updated_at) VALUES(?,?,?,?,?)');
        for (const item of normalizedDomains) insert.run(id, item.domainId, item.level, item.rationale, stamp);
      }
    });
    this.#audit('quality.grade.save', 'grade_outcome', id, { projectId, title });
    return this.listGradeOutcomes(projectId).find(item => item.id === id);
  }

  deleteGradeOutcome(projectId, outcomeId) {
    const result = this.db.prepare('DELETE FROM project_grade_outcomes WHERE id=? AND project_id=?').run(outcomeId, projectId);
    if (!result.changes) throw new ResearchStoreError('GRADE_OUTCOME_NOT_FOUND', 'GRADE 结局不存在', 404);
    this.#audit('quality.grade.delete', 'grade_outcome', outcomeId, { projectId });
    return { deleted: true };
  }

  buildQualityOverview(projectId) {
    const config = this.getQualityConfig(projectId);
    const template = RISK_OF_BIAS_TEMPLATES.find(item => item.id === config.templateId) || RISK_OF_BIAS_TEMPLATES.at(-1);
    const papers = this.listProjectPapers(projectId);
    const reviews = this.db.prepare('SELECT * FROM paper_rob_reviews WHERE project_id=? AND assessment_id=\'primary\'').all(projectId);
    const resolutions = this.db.prepare('SELECT * FROM paper_rob_resolutions WHERE project_id=? AND assessment_id=\'primary\'').all(projectId);
    const severity = template.family === 'robins' ? ['low','moderate','serious','critical','no_information'] : ['low','some_concerns','high'];
    const byPaper = {};
    for (const paper of papers) {
      const paperReviews = reviews.filter(row => row.paper_id === paper.id && row.template_id === template.id);
      const paperResolutions = resolutions.filter(row => row.paper_id === paper.id && row.template_id === template.id);
      const domains = template.domains.map(domain => {
        const a = paperReviews.find(row => row.domain_id === domain.id && row.reviewer_key === 'a');
        const b = paperReviews.find(row => row.domain_id === domain.id && row.reviewer_key === 'b');
        const resolution = paperResolutions.find(row => row.domain_id === domain.id);
        const conflict = Boolean(config.dualEnabled && a && b && a.judgment !== 'pending' && b.judgment !== 'pending' && a.judgment !== b.judgment && !resolution);
        const finalJudgment = resolution?.judgment || (!config.dualEnabled ? a?.judgment : (a?.judgment === b?.judgment ? a?.judgment : null)) || null;
        return { ...domain, a: a ? { judgment:a.judgment,support:a.support,updatedAt:a.updated_at } : null, b: b ? { judgment:b.judgment,support:b.support,updatedAt:b.updated_at } : null,
          resolution: resolution ? { judgment:resolution.judgment,note:resolution.resolution_note,resolvedAt:resolution.resolved_at } : null, conflict, finalJudgment };
      });
      const finals = domains.map(item => item.finalJudgment).filter(value => value && value !== 'pending');
      const complete = finals.length === domains.length;
      const overall = complete ? finals.reduce((worst, value) => severity.indexOf(value) > severity.indexOf(worst) ? value : worst, severity[0]) : null;
      byPaper[paper.id] = { paperId:paper.id,title:paper.title,outcomeLabel:paperReviews[0]?.outcome_label || '主要结局',domains,complete,overall,conflicts:domains.filter(item => item.conflict).length };
    }
    const items = Object.values(byPaper);
    return { projectId, config, templates:RISK_OF_BIAS_TEMPLATES, template, gradeDomains:GRADE_DOMAINS, byPaper, papers:items,
      summary:{ total:items.length, complete:items.filter(item=>item.complete).length, conflicts:items.reduce((sum,item)=>sum+item.conflicts,0), high:items.filter(item=>['high','serious','critical'].includes(item.overall)).length },
      gradeOutcomes:this.listGradeOutcomes(projectId) };
  }

  #audit(action, entityType, entityId, detail = {}) {
    this.db.prepare(`
      INSERT INTO research_audit_log(action, entity_type, entity_id, detail_json, created_at)
      VALUES(?, ?, ?, ?, ?)
    `).run(action, entityType, entityId, JSON.stringify(detail), nowIso());
  }

  close() {
    // node:sqlite 的 close() 非幂等（重复关闭抛 ERR_INVALID_STATE），
    // 这里与 better-sqlite3 的幂等语义对齐，并置空句柄。
    if (this.db) {
      try {
        this.db.close();
      } catch {
        // 已关闭或关闭失败均视为已关闭
      }
      this.db = null;
    }
  }
}

function normalizePaper(paper) {
  const title = String(paper?.title || '').trim();
  const pdfUrl = String(paper?.pdfUrl || '').trim();
  if (!title) throw new ResearchStoreError('PAPER_TITLE_REQUIRED', '文献标题不能为空', 400);
  const doi = String(paper?.doi || '').trim() || null;
  // P2 增强（v10）：OpenAlex work id（W 号）落库，引文网络/相似文献免二次解析。
  // 记录自带的 openalexId 优先；openalex 源且 sourceId 形如 W\d+ 时兜底。
  const rawOpenalexId = String(paper?.openalexId || '').trim();
  const rawSourceId = String(paper?.sourceId || '').trim();
  const openalexId = /^W\d+$/i.test(rawOpenalexId)
    ? rawOpenalexId
    : (String(paper?.source || '').toLowerCase() === 'openalex' && /^W\d+$/i.test(rawSourceId)
      ? rawSourceId
      : null);
  return {
    id: String(paper?.id || (doi ? `doi-${doi.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}` : crypto.randomUUID())).trim(),
    doi,
    title: title.slice(0, 500),
    authors: String(paper?.authors || '').trim().slice(0, 500),
    venue: String(paper?.venue || '').trim().slice(0, 200),
    year: Number.isInteger(Number(paper?.year)) ? Number(paper.year) : null,
    abstract: String(paper?.abstract || '').trim().slice(0, 5000),
    topic: String(paper?.topic || '').trim().slice(0, 120),
    pdfUrl: pdfUrl || null,
    sourceUrl: String(paper?.sourceUrl || '').trim() || null,
    sourceName: String(paper?.sourceName || '').trim().slice(0, 120) || null,
    citedByCount: Number.isInteger(Number(paper?.citedByCount)) ? Number(paper.citedByCount) : null,
    openalexId,
  };
}

function normalizePageNumber(value, required) {
  if ((value === null || value === undefined || value === '') && !required) return null;
  const page = Number(value);
  if (!Number.isInteger(page) || page < 1 || page > 100_000) {
    throw new ResearchStoreError('PAGE_NUMBER_INVALID', '页码必须是正整数', 400);
  }
  return page;
}

function normalizeAnnotationPayload(payload) {
  const rects = Array.isArray(payload?.rects) ? payload.rects : [];
  if (rects.length < 1 || rects.length > 200) {
    throw new ResearchStoreError('ANNOTATION_RECTS_INVALID', '批注必须包含 1 至 200 个有效区域', 400);
  }
  const normalizedRects = rects.map((rect) => {
    const values = ['x', 'y', 'width', 'height'].map((key) => Number(rect?.[key]));
    const [x, y, width, height] = values;
    if (values.some((value) => !Number.isFinite(value)) || x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 1.001 || y + height > 1.001) {
      throw new ResearchStoreError('ANNOTATION_RECT_INVALID', '批注区域超出页面范围', 400);
    }
    return { x, y, width, height };
  });
  const color = /^#[0-9a-f]{6}$/i.test(payload?.color) ? payload.color : '#f0c94f';
  return {
    rects: normalizedRects,
    color,
    quote: String(payload?.quote || '').trim().slice(0, 2000),
    tags: normalizeTags(payload?.tags),
  };
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  return [...new Set(tags.map(tag => String(tag || '').trim().replace(/^#/, '').slice(0, 30)).filter(Boolean))].slice(0, 8);
}

/** 结构化证据字段（阅读 → 证据卡）：对应研究问题/论点、方法/样本、局限、可用章节。 */
const EVIDENCE_FIELDS = ['question', 'method', 'limitation', 'section'];

function normalizeEvidence(value) {
  if (!value || typeof value !== 'object') return null;
  const out = {};
  for (const key of EVIDENCE_FIELDS) {
    const text = String(value[key] || '').trim().slice(0, 2000);
    if (text) out[key] = text;
  }
  return Object.keys(out).length ? out : null;
}

/** 把结构化证据合并进 position 对象（保留定位字段；evidence 为空时清除该键）。 */
function withPositionEvidence(position, evidence) {
  const pos = position && typeof position === 'object' ? { ...position } : {};
  const norm = normalizeEvidence(evidence);
  if (norm) pos.__evidence = norm;
  else delete pos.__evidence;
  return pos;
}

function annotationRow(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    attachmentId: row.attachment_id,
    pageNumber: row.page_number,
    kind: row.kind,
    payload: JSON.parse(row.payload_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function noteRow(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    paperId: row.paper_id || null,
    attachmentId: row.attachment_id || null,
    pageNumber: row.page_number || null,
    content: row.content,
    quote: row.quote || '',
    tags: parseJsonArray(row.tags_json),
    annotationId: row.annotation_id || null,
    linkedPaperId: row.linked_paper_id || null,
    linkedPaperTitle: row.linked_paper_title || null,
    paperTitle: row.paper_title || null,
    paperVenue: row.paper_venue || null,
    paperYear: row.paper_year || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function readingStateRow(row) {
  if (!row) return null;
  return {
    paperId: row.paper_id,
    currentPage: Number(row.current_page || 1),
    zoom: Number(row.zoom || 1),
    scrollMode: row.scroll_mode || 'continuous',
    leftPanelWidth: Number(row.left_panel_width || 260),
    rightPanelWidth: Number(row.right_panel_width || 380),
    leftPanelCollapsed: row.left_panel_collapsed === 1,
    rightPanelCollapsed: row.right_panel_collapsed === 1,
    rightTab: row.right_tab || 'sentence',
    updatedAt: row.updated_at,
  };
}

function noteDocumentRow(row) {
  if (!row) return null;
  let tiptap = {};
  try {
    tiptap = JSON.parse(row.tiptap_json || '{}');
  } catch {
    tiptap = {};
  }
  return {
    id: row.id,
    paperId: row.paper_id,
    title: row.title || '',
    tiptapJson: tiptap,
    markdown: row.markdown || '',
    categoryId: row.category_id || null,
    tags: parseJsonArray(row.tags_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function sentenceNoteRow(row) {
  if (!row) return null;
  let position = {};
  try {
    position = JSON.parse(row.position_json || '{}');
  } catch {
    position = {};
  }
  if (!position || typeof position !== 'object') position = {};
  let evidence = null;
  if (position.__evidence) {
    evidence = normalizeEvidence(position.__evidence) || null;
    if (evidence) delete position.__evidence;
  }
  return {
    id: row.id,
    paperId: row.paper_id,
    attachmentId: row.attachment_id || null,
    annotationId: row.annotation_id || null,
    quotedText: row.quoted_text || '',
    comment: row.comment || '',
    pageNumber: Number(row.page_number || 1),
    position,
    evidence,
    categoryId: row.category_id || null,
    categoryName: row.category_name || null,
    categoryColor: row.category_color || null,
    tags: parseJsonArray(row.tags_json),
    importance: Number(row.importance || 2),
    starred: row.starred === 1,
    status: row.status || 'inbox',
    annotationDeleted: row.annotation_deleted === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function noteCategoryRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    color: row.color || '#8bb8e8',
    createdAt: row.created_at,
  };
}

function citationRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    noteDocumentId: row.note_document_id,
    paperId: row.paper_id,
    annotationId: row.annotation_id || null,
    pageNumber: Number(row.page_number || 1),
    quotedText: row.quoted_text || '',
    prefix: row.prefix || '',
    suffix: row.suffix || '',
    annotationDeleted: row.annotation_deleted === 1,
    createdAt: row.created_at,
  };
}

function clampNumber(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

/** 从 EmbedPDF transfer item 提取颜色（strokeColor > color > 默认）。 */
function extractAnnotationColor(item) {
  const annotation = item?.annotation;
  if (!annotation) return '#FFFF98';
  return String(annotation.strokeColor || annotation.color || '#FFFF98');
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function paperRelationRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id,
    fromPaperId: row.from_paper_id,
    fromTitle: row.from_title,
    toPaperId: row.to_paper_id,
    toTitle: row.to_title,
    relation: row.relation,
    note: row.note || '',
    createdAt: row.created_at,
  };
}

function sanitizeAuditParams(params) {
  try {
    const text = JSON.stringify(params ?? {});
    if (text.length <= 4000) return JSON.parse(text);
    return { truncated: true, preview: text.slice(0, 4000) };
  } catch {
    return {};
  }
}

function safeMarkdownFileName(value) {
  return String(value || '研究项目').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 80) || '研究项目';
}

function renderProjectNotesMarkdown(project, notes) {
  const lines = [
    `# ${project.title}`,
    '',
    '> 此文件由 HanaResearch 自动汇总，跟随项目更新。每条记录保留来源文献与页码。',
    '',
    `- 笔记数量：${notes.length}`,
    `- 最近更新：${nowIso()}`,
    '',
  ];
  if (!notes.length) {
    lines.push('目前还没有项目笔记。', '');
    return lines.join('\n');
  }
  const byPaper = new Map();
  for (const note of notes) {
    const source = note.paperTitle || '项目通用笔记';
    if (!byPaper.has(source)) byPaper.set(source, []);
    byPaper.get(source).push(note);
  }
  for (const [source, sourceNotes] of byPaper) {
    lines.push(`## ${source}`, '');
    for (const note of sourceNotes) {
      const tags = note.tags.length ? note.tags.map(tag => `#${tag}`).join(' ') : '未标签';
      lines.push(`### ${tags}`, '', `*来源：${source}${note.pageNumber ? ` · 第 ${note.pageNumber} 页` : ''}${note.linkedPaperTitle ? ` · 关联《${note.linkedPaperTitle}》` : ''}*`, '');
      if (note.quote) lines.push('> ' + note.quote.replace(/\r?\n/g, '\n> '), '');
      if (note.content) lines.push(note.content, '');
      lines.push(`_记录时间：${note.createdAt}_`, '', '---', '');
    }
  }
  return lines.join('\n');
}

function attachmentRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    paperId: row.paper_id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    byteSize: row.byte_size,
    sha256: row.sha256,
    sourceUrl: row.source_url,
    lastPage: row.last_page == null ? null : Number(row.last_page),
    lastReadAt: row.last_read_at || null,
    createdAt: row.created_at,
  };
}

function translationDocRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id,
    paperId: row.paper_id,
    paperTitle: row.paper_title || null,
    attachmentId: row.attachment_id,
    fileName: row.file_name || null,
    relativePath: row.relative_path || null,
    sourceLang: row.source_lang,
    targetLang: row.target_lang,
    status: row.status,
    progressDone: Number(row.progress_done || 0),
    progressTotal: Number(row.progress_total || 0),
    error: row.error || null,
    model: row.model || null,
    charCount: Number(row.char_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeIssn(value) {
  const compact = String(value || '').toUpperCase().replace(/[^0-9X]/g, '');
  if (!/^\d{7}[\dX]$/.test(compact)) return '';
  const sum = compact.slice(0, 7).split('').reduce((total, digit, index) => total + Number(digit) * (8 - index), 0);
  const remainder = (11 - (sum % 11)) % 11;
  const expected = remainder === 10 ? 'X' : String(remainder);
  if (compact[7] !== expected) return '';
  return compact.slice(0, 4) + '-' + compact.slice(4);
}

function journalSourceRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    venue: row.venue,
    issn: row.issn,
    topic: row.topic,
    enabled: row.enabled === 1,
    lastSyncedAt: row.last_synced_at || null,
    lastInserted: Number(row.last_inserted || 0),
    lastError: row.last_error || null,
    lastViewedAt: row.last_viewed_at || null,
    isCustom: row.is_custom === 1,
    region: row.region === 'cn' ? 'cn' : 'intl',
    createdAt: row.created_at,
  };
}

function journalSyncLogRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    sourceId: row.source_id,
    venue: row.venue,
    fetched: Number(row.fetched || 0),
    inserted: Number(row.inserted || 0),
    pruned: Number(row.pruned || 0),
    error: row.error || null,
    createdAt: row.created_at,
  };
}

export class ResearchStoreError extends Error {
  constructor(code, message, status = 400, details = null) {
    super(message);
    this.name = 'ResearchStoreError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function getResearchStore(dataDir) {
  const key = path.resolve(dataDir);
  if (!stores.has(key)) stores.set(key, new ResearchStore(key));
  return stores.get(key);
}

export function clearResearchStoreCache() {
  for (const store of stores.values()) store.close();
  stores.clear();
}
