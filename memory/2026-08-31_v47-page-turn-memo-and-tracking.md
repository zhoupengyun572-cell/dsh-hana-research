# v47 翻页渲染治理 + 真机发现滚动翻页跟踪存量缺陷修复

时间：2026-08-31（Asia/Shanghai）

## 背景

阅读器翻页（setActivePage）会引发 PdfWorkspace 全树重渲染：右栏逐句笔记列表、汇总 Tab、TipTap 编辑器每次翻页都白白重渲，长文献+多笔记时是滚动/翻页卡顿点。真机验收环境（v46 流程）复用做行为验证。

## 已实现

### React.memo 渲染隔离（web/src/app.jsx + tiptap-config.jsx）

- memo 包裹：RightPanel、SummaryTab、SentenceNoteCard、AnnotationItem、ThumbnailItem（app.jsx）与 NoteEditor（tiptap-config.jsx）。
- 稳定化三个内联箭头（否则 memo 永远失效）：onTabChange → handleRightTabChange（useCallback，内部经 layoutRef/activePageRef/getCurrentZoom 读现值）、onFocusDone、onOpenMetaManager。逐一核对传入面板的全部回调依赖数组，均不随翻页变化。
- **真机度量**：MutationObserver 挂右栏，9 次跨页滚动 → 右栏 DOM 变动数为 0（memo 隔离生效）；缩略图高亮照常跟随。LeftPanel 因需要 activePage 做高亮仍随翻页渲染，其子项（AnnotationItem/ThumbnailItem）已 memo，只余 2 张缩略图因 active 翻转而重渲。

### 真机发现的存量缺陷：滚动翻页完全不跟踪

- 现象：滚轮滚到第 5 页，缩略图/批注高亮仍停在第 1 页，阅读进度也不会随滚动保存。
- 根因：EmbedPDF 的 store 在纯滚动时不派发任何 action（`store.subscribe` 零回调，真机挂计数器证实）——旧实现靠它更新 activePage，因此滚动翻页自 v12 起就只有"跳页"才生效。
- 修复：改用 scroll 插件的 `onPageChange` 事件（payload `{ documentId, pageNumber(1起), totalPages }`），在新 effect 中订阅，deps `[registry, documentId]`。
- **两个真机实测出的坑**（都已写进代码注释）：
  1. 事件必须在文档加载完成（documentId 就绪）后订阅——onViewerReady 时机（文档加载前）挂的事件会被静默丢弃；
  2. 订阅 effect 若引用在其后声明的 `getCapability`，deps 数组在渲染期求值会撞 TDZ 直接白屏（无 ErrorBoundary 兜底）——改为直接用 `registry` 取能力。

## 验证

- 真机（独立 Harness + Browser Use）：滚动 1→5 页，缩略图高亮逐页跟随（active=5 与引擎页一致）；右栏零变动；标题/保存状态正常。
- 根测试 175/175；web 构建 + Markdown 测试 13/13。
- 中途一次白屏回归（上述 TDZ 坑）真机即时发现并修复复验。
- 验收实例已停止、scratch 已清理；v47 reader bundle 已同步运行副本（新页面直接生效）。

## 环境备忘（复用 v46 流程时的注意项）

- mklink 前必须确保目标目录不存在（`mkdir -p` 先建了空目录会让 junction 静默失败，boot 会在空 profiles 上自行安装不含 @local 插件的子集，表现为插件 404）。
- 反复重启实例不会换 ASSET_VERSION 时浏览器可能用旧 bundle；重启实例即可换版本。
- pdfkit 生成 PDF 中文需显式注册字体；种子逐句笔记不带 attachmentId 时阅读器列表不可见（列表按 attachmentId 过滤）。

## 留给后续的清单

1. 弹层工厂第二步（36 处 openModalLayer 样板收敛）；API 路由样板收敛（90+ 处 withError）。
2. 阅读器 React ErrorBoundary（本次白屏事故再次确认其价值）。
3. 滚动翻页进度现在会跟随了，但 progressQueue 仍只在布局/Tab 变化与退出时写库——可考虑 onPageChange 防抖写入，进一步降低丢进度窗口。
