import { getStore, textResult, runTool, agentInfo } from './_shared.js';

export const name = 'unsubscribe_topic';

export const description =
  '取消一个研究主题订阅：之后不再主动汇报该主题的期刊新文献。写入操作（不可恢复）。';

export const sessionPermission = { kind: 'review' };

export const describeSideEffect = (input) => ({
  kind: 'workspace_write',
  summary: `取消研究主题订阅「${input?.topic || ''}」`,
  ruleId: 'hana-research-unsubscribe-topic',
});

export const parameters = {
  type: 'object',
  properties: {
    topic: { type: 'string', description: '要取消订阅的主题名称' },
  },
  required: ['topic'],
};

export function execute(input, ctx) {
  return runTool('取消主题订阅', () => {
    const store = getStore(ctx);
    const topic = String(input?.topic || '').trim();
    if (!topic) throw new Error('主题名称不能为空');
    const removed = store.unsubscribeTopic(topic);
    if (removed) {
      store.auditAgentToolCall(name, { topic }, agentInfo(ctx));
    }
    return removed
      ? textResult(`已取消订阅「${topic}」。`, { topic, removed: true })
      : textResult(`没有找到订阅「${topic}」，无需取消。`, { topic, removed: false });
  });
}
