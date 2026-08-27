import { getStore, textResult, runTool, agentInfo } from './_shared.js';

export const name = 'subscribe_topic';

export const description =
  '订阅一个研究主题：后续期刊同步新增的文献若匹配主题关键词，Agent 会在对话中主动汇报。写入操作。';

export const sessionPermission = { kind: 'review' };

export const describeSideEffect = (input) => ({
  kind: 'workspace_write',
  summary: `订阅研究主题「${input?.topic || ''}」（关键词：${input?.keywords || '无'}）`,
  ruleId: 'hana-research-subscribe-topic',
});

export const parameters = {
  type: 'object',
  properties: {
    topic: { type: 'string', description: '主题名称，如「情绪调节」' },
    keywords: { type: 'string', description: '可选：匹配关键词（逗号分隔），不填则匹配主题名' },
    journalIds: {
      type: 'array',
      items: { type: 'string' },
      description: '可选：限定关注的期刊源 id（如 acta-psychologica-sinica），不填则关注全部',
    },
  },
  required: ['topic'],
};

export function execute(input, ctx) {
  return runTool('订阅主题', () => {
    const store = getStore(ctx);
    const topic = String(input?.topic || '').trim();
    if (!topic) throw new Error('主题名称不能为空');
    const subscription = store.subscribeTopic({
      topic,
      keywords: String(input?.keywords || topic),
      journalIds: input?.journalIds,
    });
    store.auditAgentToolCall(name, {
      topic: subscription.topic,
      keywords: subscription.keywords,
      journalIds: subscription.journalIds,
    }, agentInfo(ctx));
    const note = subscription.journalIds?.length
      ? `，限定 ${subscription.journalIds.length} 个期刊源`
      : '（关注全部期刊）';
    return textResult(`已订阅研究主题「${subscription.topic}」${note}。之后期刊同步的新文献若匹配关键词「${subscription.keywords}」，我会在对话中汇报。`, { subscription });
  });
}
