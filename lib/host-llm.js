// 宿主 LLM 公共调用（DSH 移植）：经 ctx.llm.stream 完成一次非流式语义的
// 文本补全（聚合 text-delta）。provider/model 取 agentDefaultModel 选中项。
// ai-search（检索解读）与 translation（全文翻译）共用。

export class HostLlmError extends Error {
  constructor(code, message, status = 502, details = {}) {
    super(message);
    this.name = 'HostLlmError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/**
 * 用宿主 LLM 流式调用聚合完整文本。
 * @param {{ llm: object, selection: {provider:string, model:string, reasoningEffort?:string}, system?: string, user: string, temperature?: number, timeoutMs?: number }} opts
 * @returns {Promise<string>} 完整输出文本
 */
export async function completeWithHostLlm({ llm, selection, system, user, temperature = 0.3, timeoutMs = 90_000 }) {
  if (!llm?.stream) throw new HostLlmError('LLM_UNAVAILABLE', '宿主模型服务不可用', 503);
  if (!selection?.provider || !selection?.model) {
    throw new HostLlmError('LLM_NO_MODEL', '宿主未配置可用模型', 503);
  }
  let text = '';
  try {
    const options = {
      provider: selection.provider,
      model: selection.model,
      ...(selection.reasoningEffort ? { reasoningEffort: selection.reasoningEffort } : {}),
      ...(system ? { system } : {}),
      messages: [{ role: 'user', content: [{ type: 'text', text: user }] }],
      temperature,
      signal: AbortSignal.timeout(timeoutMs),
    };
    for await (const chunk of llm.stream(options)) {
      if (chunk.type === 'text-delta') text += chunk.text;
      else if (chunk.type === 'finish') {
        // DSH: finish.reason 是对象（{ kind, failure }），kind: stop/tool-calls/max-tokens/aborted/error
        const kind = chunk.reason?.kind || chunk.reason;
        if (kind === 'aborted') {
          throw new HostLlmError('LLM_ABORTED', `模型调用被中断${chunk.reason?.failure?.message ? `：${chunk.reason.failure.message}` : ''}`, 502, {
            failure: chunk.reason?.failure || null,
          });
        }
        if (kind === 'error') {
          throw new HostLlmError('LLM_ERROR', `模型服务返回错误${chunk.reason?.failure?.message ? `：${chunk.reason.failure.message}` : ''}`, 502, {
            failure: chunk.reason?.failure || null,
          });
        }
      }
    }
  } catch (error) {
    if (error instanceof HostLlmError) throw error;
    throw new HostLlmError('LLM_UNREACHABLE', `模型服务不可达：${error?.message || '网络错误'}`, 502, {
      code: error?.code || null,
    });
  }
  if (!String(text).trim()) {
    throw new HostLlmError('LLM_EMPTY', '模型服务返回了空结果', 502);
  }
  return text;
}
