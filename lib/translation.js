/**
 * HanaResearch AI 翻译服务（DSH 移植版：复用宿主模型）。
 *
 * - 与 OpenHanako 版差异：不再使用独立 API Key / baseURL（api.deepseek.com
 *   直连），改经宿主 ctx.llm.stream 调用用户配置的模型（agentDefaultModel）；
 * - 保留 translation-config.json（sourceLang/targetLang，可选 model 提示），
 *   apiKey 字段仅做兼容占位（忽略）；
 * - 学术翻译提示词；按段落边界分块；段级译文缓存（TTL 30 天，防重复消耗）。
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { completeWithHostLlm } from './host-llm.js';

const TRANSLATION_TIMEOUT_MS = 90_000;
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 2000;

export class TranslationError extends Error {
  constructor(code, message, status = 400, details = {}) {
    super(message);
    this.name = 'TranslationError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const DEFAULT_CONFIG = {
  sourceLang: 'en',
  targetLang: 'zh',
};

function configPath(dataDir) {
  return path.join(dataDir, 'translation-config.json');
}

export function readTranslationConfig(dataDir) {
  try {
    const raw = JSON.parse(fs.readFileSync(configPath(dataDir), 'utf-8'));
    return {
      sourceLang: String(raw.sourceLang || DEFAULT_CONFIG.sourceLang).trim().slice(0, 16),
      targetLang: String(raw.targetLang || DEFAULT_CONFIG.targetLang).trim().slice(0, 16),
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

/** 写配置（仅语言项；apiKey/baseURL 不再使用）。 */
export function writeTranslationConfig(dataDir, patch = {}) {
  const current = readTranslationConfig(dataDir);
  const next = { ...current };
  if (typeof patch.sourceLang === 'string' && patch.sourceLang.trim()) next.sourceLang = patch.sourceLang.trim();
  if (typeof patch.targetLang === 'string' && patch.targetLang.trim()) next.targetLang = patch.targetLang.trim();
  fs.mkdirSync(dataDir, { recursive: true });
  const tempPath = `${configPath(dataDir)}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(next, null, 2), 'utf8');
  fs.renameSync(tempPath, configPath(dataDir));
  return { ...next };
}

/** 供 UI 回显的配置视图（宿主模型模式：无 key 概念）。 */
export function translationConfigView(dataDir) {
  const config = readTranslationConfig(dataDir);
  return {
    sourceLang: config.sourceLang,
    targetLang: config.targetLang,
    modelMode: 'host', // 复用宿主配置的模型
  };
}

function cacheFilePath(dataDir) {
  return path.join(dataDir, 'translation-cache.json');
}

function loadCache(dataDir) {
  try {
    return JSON.parse(fs.readFileSync(cacheFilePath(dataDir), 'utf-8'));
  } catch {
    return {};
  }
}

function saveCache(dataDir, cache) {
  const entries = Object.entries(cache).filter(([, entry]) => (
    entry?.translated && entry?.ts && Date.now() - entry.ts < CACHE_TTL_MS
  ));
  entries.sort((a, b) => b[1].ts - a[1].ts);
  const pruned = Object.fromEntries(entries.slice(0, CACHE_MAX_ENTRIES));
  const tempPath = `${cacheFilePath(dataDir)}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(pruned), 'utf8');
  fs.renameSync(tempPath, cacheFilePath(dataDir));
}

/** 查询段级缓存；返回 { hit, key, translated }。 */
export function cachedTranslation(dataDir, text) {
  const key = crypto.createHash('sha256').update(String(text || '')).digest('hex');
  const entry = loadCache(dataDir)[key];
  if (entry?.translated && entry?.ts && Date.now() - entry.ts < CACHE_TTL_MS) {
    return { hit: true, key, translated: String(entry.translated) };
  }
  return { hit: false, key, translated: null };
}

export function storeTranslationCache(dataDir, key, translated) {
  const cache = loadCache(dataDir);
  cache[key] = { translated: String(translated || ''), ts: Date.now() };
  saveCache(dataDir, cache);
}

/** 按段落边界分块，避免把段落切碎影响翻译质量。 */
export function splitIntoChunks(text, maxChars = 1600) {
  const paragraphs = String(text || '')
    .split(/\n{2,}/)
    .map(paragraph => paragraph.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const chunks = [];
  let current = [];
  let currentLength = 0;
  for (const paragraph of paragraphs) {
    if (currentLength + paragraph.length + 2 > maxChars && current.length) {
      chunks.push(current.join('\n\n'));
      current = [];
      currentLength = 0;
    }
    current.push(paragraph);
    currentLength += paragraph.length + 2;
  }
  if (current.length) chunks.push(current.join('\n\n'));
  return chunks;
}

function buildSystemPrompt(sourceLang, targetLang) {
  return `你是学术文献专业翻译。请把下面的${sourceLang}文本翻译成${targetLang}。

要求：
1. 忠实原文，不增删内容，不写解释或评注；
2. 专有名词与心理学/学术术语采用规范中文译名，必要时可括号保留英文原文；
3. 保留段落结构、编号、引用格式（如 (Smith, 2020)、[1]）、公式与图表标题；
4. 只输出译文本身，不要输出任何说明文字。`;
}

/**
 * 翻译单段文本（宿主模型）。
 * @param {{ llm: object, selection: {provider:string, model:string}, text: string, sourceLang?: string, targetLang?: string, timeoutMs?: number }} opts
 */
export async function translateChunk({ llm, selection, text, sourceLang = 'en', targetLang = 'zh', timeoutMs = TRANSLATION_TIMEOUT_MS }) {
  try {
    return await completeWithHostLlm({
      llm,
      selection,
      system: buildSystemPrompt(sourceLang, targetLang),
      user: String(text || ''),
      temperature: 0.2,
      timeoutMs,
    });
  } catch (error) {
    throw new TranslationError(
      error?.code === 'LLM_NO_MODEL' ? 'TRANSLATE_NO_MODEL' : 'TRANSLATE_UNREACHABLE',
      error?.message || '翻译服务不可用',
      error?.status || 502,
      { code: error?.code || null },
    );
  }
}
