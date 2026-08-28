import { ResearchStoreError } from '../lib/store.js';
import { PdfImportError } from '../lib/pdf-import.js';
import { LiteratureSearchError } from '../lib/literature-search.js';
import { DOWNLOAD_ALLOWED_HOSTS } from '../lib/api.js';

/**
 * HanaResearch 工具层共享辅助（DSH 移植版）。
 * 本文件不导出 name/description/execute，不会被当作工具注册；
 * 仅被同目录下的工具模块复用。
 *
 * 与 OpenHanako 版的差异：
 * - 下载白名单从插件 manifest 改为代码常量（DOWNLOAD_ALLOWED_HOSTS）；
 * - store 由注册器（tools/register.js）注入 ctx.store，不再从 dataDir 重建；
 * - 审计来源信息由注册器从 DSH 工具执行上下文（exec.agent）提取。
 */

/** 下载白名单（检索结果 pdfUrl 预过滤 + 导入链路共用）。 */
export function readAllowedPdfHosts() {
  return DOWNLOAD_ALLOWED_HOSTS;
}

/** 从工具调用上下文解析研究数据库 store（注册器注入）。 */
export function getStore(ctx) {
  return ctx?.store || null;
}

/** 标准的工具文本结果（与 DSH content block 兼容）。 */
export function textResult(text, details) {
  return {
    content: [{ type: 'text', text }],
    ...(details && typeof details === 'object' ? { details } : {}),
  };
}

/** 已知业务错误（ResearchStoreError / PdfImportError / LiteratureSearchError）的友好结果。 */
export function errorResult(error, fallback = '操作失败') {
  const code = error?.code || 'RESEARCH_TOOL_ERROR';
  const message = error?.message || fallback;
  return textResult(`错误（${code}）：${message}`, { error: code });
}

/** 是否为已知业务错误类型。 */
export function isKnownError(error) {
  return error instanceof ResearchStoreError
    || error instanceof PdfImportError
    || error instanceof LiteratureSearchError;
}

/** 从未知的运行错误生成结果，避免把堆栈泄漏给模型。 */
export function unknownErrorResult(action, error) {
  return textResult(`${action}失败：${error?.message || '未知错误'}`, {
    error: 'RESEARCH_TOOL_UNKNOWN_ERROR',
  });
}

/** 从工具调用上下文提取来源信息，用于审计记录（注册器提供）。 */
export function agentInfo(ctx) {
  return {
    sessionId: ctx?.sessionId || null,
    sessionPath: ctx?.sessionPath || null,
    userId: ctx?.userId || null,
    agentId: ctx?.agentId || null,
  };
}

/** 统一执行包装：同步与异步均捕获，已知业务错误转友好结果，其余转为通用错误结果。 */
export function runTool(action, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      return result.catch((error) => {
        if (isKnownError(error)) return errorResult(error);
        return unknownErrorResult(action, error);
      });
    }
    return result;
  } catch (error) {
    if (isKnownError(error)) return errorResult(error);
    return unknownErrorResult(action, error);
  }
}
