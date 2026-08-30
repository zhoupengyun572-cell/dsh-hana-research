# v48 阅读器健壮性收尾：ErrorBoundary、滚动进度入库、交接握手统一

时间：2026-08-31（Asia/Shanghai）

## 已实现

### React ErrorBoundary（web/main.jsx + workbench.css）

- `ReaderErrorBoundary` 包裹 PdfWorkspace：渲染崩溃不再整页白屏，显示错误信息 + 「重试」（setState 清错误 = 整树重挂软恢复）+ 「返回项目库」出口；componentDidCatch 记录组件栈。
- 起因是 v47 真机白屏事故（TDZ 崩溃无兜底）。

### 滚动翻页进度防抖入库（web/src/app.jsx）

- v47 修好了滚动跟踪（onPageChange → activePage），但进度仍只在退出/布局变化时写库，崩溃即丢页码。
- 现在翻页事件直接入队 progressQueue（自带 600ms 防抖），携带真实 zoom 与当前布局。
- **真机端到端验证**：滚动到第 6 页后直接查服务端 reading-state——`currentPage: 6, zoom: 0.927`（真实缩放值，非手写 PUT 值），链路 onPageChange → 防抖队列 → API → DB 全通。

### Agent 交接握手统一（web/src/app.jsx）

- 笔记卡「论证关系建议」此前裸 postMessage（无 requestId/ack/超时）——没有可用输入框时静默失败零反馈。
- 抽出 `handoffPromptToAgent({ prompt, label })`（requestId + ack 监听 + 2.4s 超时），顶部「交给 Agent」与笔记卡两处共用；笔记卡交接成功/失败均有 toast。

### 评估结论：弹层工厂第二步取消

- 抽样核查 36 处 openModalLayer 调用点：v36 工厂已收编 aria/焦点/Tab 圈闭/遮罩关闭；每处剩余的"样板"实际只有一行 `innerHTML+append`，其余是不可压缩的独有 HTML 与事件绑定。预估 300–400 行的收敛空间实际不足 50 行，价值密度低，不再做。

## 验证

- 根测试 175/175；web 构建 + Markdown 测试 13/13。
- 真机（独立 Harness）：进度入库链路端到端验证通过；ErrorBoundary 为标准 React class 边界（fallback UI 编译进产物，崩溃路径无法自然触发，靠结构保证）。
- 验收实例已停止、scratch 已清理；v48 bundle 已同步运行副本（新页面直接生效）。

## 环境备忘（补充）

- 先 `mkdir -p profiles` 再 `mklink` 会静默失败（v47 已记录），本次又踩：**junction 类环境准备必须先检查目标不存在，或 mklink 后必须校验 LinkType==='Junction' 且 @local 可列出**。

## 留给后续的清单

1. API 路由样板收敛（90+ 处 withError 三行 → route 装饰器）+ 错误类基类归并。
2. journal-sync 之外的全表扫描清理（/papers 旧契约全量返回、renameNoteTag N+1、syncProjectNotesFile 写放大）。
3. PDF 附件同步读（runTranslationTask 内 readFileSync 40MB）改流式或 Worker。
