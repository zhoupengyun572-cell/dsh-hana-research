import { getStore, textResult, runTool } from './_shared.js';

export const name = 'report_journal_updates';

export const description =
  '汇报各期刊源最近一次同步的状态：新增文献数、抓取数、异常源，并附对话卡片展示最近同步的期刊。只读操作。';

export const promptGuidelines = [
  '当用户询问「期刊更新」「最近文献」「有哪些新文章」时调用本工具。',
  '调用后对话流会渲染期刊更新卡片，用户可在卡片内直接触发「立即同步全部期刊」。',
  '若存在异常期刊源，应在回复中主动指出并建议重试同步。',
].join('\n');

export const sessionPermission = { readOnly: true };

export const parameters = {
  type: 'object',
  properties: {},
};

export function execute(_params, ctx) {
  return runTool('汇报期刊更新', () => {
    const store = getStore(ctx);
    const sources = store.listJournalSources();
    const logs = store.listJournalSyncLogs(30);
    const synced = sources.filter(source => source.lastSyncedAt && !source.lastError);
    const failed = sources.filter(source => source.lastError);

    const recent = new Map();
    for (const log of logs) {
      if (!recent.has(log.venue)) recent.set(log.venue, log);
    }
    const recentList = [...recent.values()].slice(0, 12);

    const lines = recentList.map(log => {
      const state = log.error
        ? `异常（${log.error.slice(0, 60)}）`
        : `抓取 ${log.fetched} 篇${log.inserted ? `，新增 ${log.inserted} 篇` : '，无新增'}`;
      return `- ${log.venue}：${state}`;
    });

    const card = {
      pluginId: 'hana-research',
      type: 'iframe',
      route: '/cards/journal-updates',
      title: '期刊更新',
      description: `${synced.length}/${sources.length} 个期刊源正常${failed.length ? `，${failed.length} 个异常` : ''}。可在卡片内触发立即同步。`,
      aspectRatio: '3:4',
    };

    return textResult(
      `期刊同步状态：${synced.length}/${sources.length} 个源正常${failed.length ? `，${failed.length} 个异常` : ''}。\n${lines.join('\n')}`,
      {
        total: sources.length,
        synced: synced.length,
        failed: failed.length,
        recent: recentList,
        card,
      },
    );
  });
}
