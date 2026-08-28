import { getStore, textResult, runTool } from './_shared.js';

export const name = 'list_subscriptions';

export const description =
  '列出当前全部研究主题订阅（主题、匹配关键词、限定的期刊源、最近检查时间）。只读操作。';

export const sessionPermission = { readOnly: true };

export const parameters = {
  type: 'object',
  properties: {},
};

export function execute(_params, ctx) {
  return runTool('列出主题订阅', () => {
    const store = getStore(ctx);
    const subscriptions = store.listTopicSubscriptions();
    if (!subscriptions.length) {
      return textResult('当前没有研究主题订阅。可以用 subscribe_topic 订阅一个主题，例如「情绪调节」。', { subscriptions: [] });
    }
    const lines = subscriptions.map(item => {
      const journalNote = item.journalIds?.length ? `（限定 ${item.journalIds.length} 个期刊源）` : '（关注全部期刊）';
      const checked = item.lastCheckedAt ? `，最近检查 ${item.lastCheckedAt}` : '';
      return `- ${item.topic}：关键词「${item.keywords}」${journalNote}${checked}`;
    });
    return textResult(`共 ${subscriptions.length} 个主题订阅：\n${lines.join('\n')}`, { subscriptions });
  });
}
