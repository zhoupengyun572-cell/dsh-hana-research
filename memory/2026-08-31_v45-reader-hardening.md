# v45 阅读工作台加固：保存队列互斥续轮、引文生命周期闭环、缩略图 LRU

时间：2026-08-31（Asia/Shanghai）

## 背景

三路深度审查中阅读器（web/src）侧剩余的数据安全与内存项。v41 已修退出丢逐句笔记与证据字段互丢；本轮处理保存队列的并发缺陷、引文"移除卡片不删记录"的失同步、缩略图 blob 无上限。

## 已实现

### 保存队列健壮化（web/src/services.js createSaveQueue）

- **单一在途 promise 互斥**：原实现 flushNow 与 flushImmediately 各自为政（saving 标志互不相认），退出冲刷会和在途防抖保存对同一 payload 双重 PUT；现在两者复用同一个 inFlight promise。
- **保存期间新编辑自动续轮**：原实现 saving 期间被定时器触发的 flushNow 直接 return 且无重试路径（dirty=true、timer=null），数据滞留到下一次用户操作；现在 performFlush 完成后检查"保存期间是否又有 schedule"，有则同轮续存直至收敛，才报 saved。
- **失败归还语义修正**：保存期间无新编辑时失败内容归还 pendingPayload；有新编辑时保留最新值（PUT 全量语义 latest-wins，与原行为一致）。

### 引文生命周期闭环（web/src/app.jsx + tiptap-config.jsx）

- 旧链路断裂：卡片插入时 citationId 恒为 null（后端 id 从未回填），"移除卡片"只删文档节点——服务端引文记录与底部引文条永久残留失同步；services.js 的 deleteCitation 全项目零调用。
- 现在：addCitation 成功后把真实 citationId 回填到卡片节点（setNodeMarkup，取最后一张未回填的同源卡片）；移除卡片先经 citationJumpHolder.onRemove 调 deleteCitation 删除服务端记录并刷新引文条，再删节点；旧卡片（无 citationId）按注解 id+页码回退匹配引文条数据。
- 撤销删除（Ctrl+Z 恢复节点）后服务端记录已删——卡片仍可跳转展示，但引文条不再显示；为一致性与"移除"语义的取舍，已记录。

### 缩略图缓存 LRU + 自愈（web/src/app.jsx ThumbnailItem）

- 原实现：blob URL 只在卸载/换文档时回收，上千页 PDF 连续滚动全部缩略图常驻内存；错误条目永久缓存不重试；IntersectionObserver 首次加载后即断开。
- 现在：LRU 上限 200 条，ready 条目刷新使用顺序，超限驱逐最旧并 revoke 其 blob；错误条目带尝试次数（≤2 次有限重试）；观察器持续存活，被驱逐页面再次可见时自动重载；img onError 回落到占位状态（驱逐后 blob 失效的自愈路径）。

## 验证

- web 构建成功（assets/reader-workbench.js|css）；Markdown 编辑器测试 13/13；根测试 175/175。
- 已同步阅读器构建产物到运行副本（新页面直接生效）；同步前备份 `C:\Users\zhou\.codex\backups\dsh-hana-research\v45-reader-hardening-20260831-010440`。

## 留给 v46 的清单

1. 翻页全树重渲染治理：LeftPanel/RightPanel React.memo + 回调稳定化（长文献滚动/翻页卡顿点）。
2. 弹层工厂第二步（36 处 openModalLayer 样板收敛）与 API 路由样板收敛（90+ 处 withError）。
3. 真机截图债务：v41-v45 的主题切换、SPA 转场、引文移除闭环验证（Harness 启动后动态发现端口）。
