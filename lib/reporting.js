// Agent 研究工作流 + 订阅主动汇报：
// 每个新会话注入一段紧凑的 HanaResearch 使用约定，让插件真正进入
// Agent 的“检索 → 收集 → 精读 → 综合”工作流；若订阅有更新，再附加动态提示。
//
// 实现要点：
// - 监听 agent/session-start（每个会话生命周期开始触发一次，含恢复会话）；
// - 注册到 agent 的 scoped ctx 上的 systemPrompt.section——只对该 agent 生效，
//   随 agent 销毁自动清理；
// - 同一 agent 只注入一次（WeakSet 防重，section 同名重复注册会抛错）。

const injectedAgents = new WeakSet();

export function registerSubscriptionReporting(ctx, store) {
  return ctx.on("agent/session-start", (payload) => {
    const agent = payload?.agent;
    if (!agent?.ctx || injectedAgents.has(agent)) return;

    let subscriptions;
    let recentLogs;
    try {
      subscriptions = store.listTopicSubscriptions();
      recentLogs = store.listJournalSyncLogs(6);
    } catch {
      return;
    }
    const hasNew = subscriptions.length > 0 && recentLogs.some((log) => log.inserted > 0);

    const systemPrompt = agent.ctx.get?.("systemPrompt");
    if (!systemPrompt) return;

    const topics = subscriptions.map((s) => s.topic).join("、");
    const subscriptionHint = hasNew
      ? `\n- 用户订阅了「${topics}」，期刊同步最近有新增文献；相关提问先调用 hana_research_report_journal_updates。`
      : "";
    try {
      systemPrompt.section({
        name: "hana-research-workflow",
        order: 150,
        text:
          "HanaResearch 是用户的本地研究工作台。使用约定：\n" +
          "- 用户提及“我的项目/文献/笔记/之前的研究”时，不要猜测；先用 hana_research_get_research_context，聚焦某项目时用 hana_research_get_project_brief。\n" +
          "- 按检索 → 保存/导入 → PDF 精读与证据笔记 → 跨文献综合推进；只读工具可主动调用，写入工具仅在用户明确要求后调用并接受确认。\n" +
          "- 项目下一步可用 hana_research_list_project_tasks 查看；只有用户明确要求记录任务时才创建，完成任务前也要获得用户确认。\n" +
          "- 依据本地证据回答时保留文献标题、DOI（如有）、页码与标签；没有 PDF/笔记时不得声称读过全文。\n" +
          "- 检索结果、期刊动态和项目概览可在对话中显示交互卡片；优先给出可继续执行的下一步。" +
          subscriptionHint,
      });
      injectedAgents.add(agent);
      ctx.logger.info("hana-research: injected subscription reporting for session %s", agent.id);
    } catch (error) {
      ctx.logger.warn("hana-research: subscription injection failed: %s", error?.message || error);
    }
  });
}
