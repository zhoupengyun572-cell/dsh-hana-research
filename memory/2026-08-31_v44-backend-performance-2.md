# v44 后端性能第二轮：流式文件响应、期刊同步索引合并、翻译缓存内存化

时间：2026-08-31（Asia/Shanghai）

## 背景

v43 后端性能主线的延续，处理审查清单中剩余的三个 IO/吞吐项：40MB 同步整读阻塞事件循环、期刊同步每源三重全表扫描、段级翻译缓存 O(n²) 文件 IO。

## 已实现

### 流式文件响应（lib/api.js）

- `/attachments/:id/file`（PDF 附件，上限 40MB）、`/pdfjs.mjs`（2.7MB 引擎）、`/translate/document/:id/file`（译文文档）三条路由由 `readFileSync + res.end` 改为 `fs.promises.stat` 取长度 + `fs.createReadStream → pipeline(res)`，不再把整份文件读入内存阻塞事件循环。
- `withError` 增加 `headersSent` 保护：流式响应中途失败时只能断开连接（`res.destroy()`），避免 sendJson 二次写头抛 ERR_HTTP_HEADERS_SENT。
- 新增真实 HTTP 集成测试（node:http 起服务 + fetch）：完整字节、content-length 一致、PDF 头、404 JSON 路径均验证。

### 期刊同步索引合并（lib/journal-sync.js）

- 原实现每个源执行 `listPaperDois + listPaperIds + listPapers` 三次全表（25 源 = 75 次全表/轮），且 `existingDois` 赋值后从未使用（死变量）。
- 新增 `buildLibraryIndex(store)`：每轮同步（syncAllJournals）只构建一次 `{ paperByDoi, existingIds }`，经 `syncOneJournalSource → syncJournalSource` 透传共享，插入后原地更新（轮内串行无并发问题）。单源同步路径（API startSource）无索引时自建，行为不变。

### 翻译段级缓存内存化（lib/translation.js）

- 原实现每段翻译整读 + 整写 `translation-cache.json`（最多 2000 条），一篇 N 段文献 = N 次全量读 + N 次全量写，O(n²) 文件 IO。
- 改为进程内存 Map 为准：首次访问加载一次；写入只更新内存，500ms 防抖后合并落盘（TTL 清理 + 2000 条截断仍在落盘时执行，原子替换保留）。
- 导出 `flushTranslationCache(dataDir)`；插件卸载钩子（index.js dispose）冲刷一次，减少退出丢缓存窗口。代价：进程崩溃瞬间未落盘的最后几段丢缓存（下次重译），对缓存可接受。
- 新增测试：flush 后磁盘文件可见、可回读。

## 验证

- 根测试 175 项全绿（新增 3 项：流式响应 ×2 + 缓存落盘 ×1）。
- lib/api.js / journal-sync.js / translation.js / index.js 均通过 node --check。

## 部署说明

- 全部为 lib 层改动，无静态资产；随 0.4.0-beta.1+v41+v44 整体升级并重启 Harness 时生效（需用户同意）。

## 留给 v45 的清单

1. 弹层工厂第二步：36 处 openModalLayer 样板收敛；109 处 data-* 绑定器收敛为事件委托。
2. API 路由样板收敛（90+ 处 withError 三行 → route 装饰器）+ 错误类基类归并。
3. journal-sync 之外的其他全表扫描清理（/papers 旧契约全量返回、renameNoteTag N+1）。
4. 真机截图债务：v41/v42 主题切换与 SPA 转场验证（Harness 启动后动态发现端口）。
