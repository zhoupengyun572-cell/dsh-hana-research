# v50 全文检索（schema v21 + FTS5 + 服务端 PDF 提取）

时间：2026-09-05（Asia/Shanghai）

对应 `docs/OPTIMIZATION_PLAN.md` P0-1 的后端 + API + 文献中心入口。**阅读工作台（web/ React）搜索栏「本文/全库」双模式未做**，留待下一轮（需 esbuild 重建）。

## 已实现

### schema v21（lib/store.js）

- `RESEARCH_SCHEMA_VERSION` 20 → 21；**备份条件放宽为 `currentVersion >= 14 && < 21`**——v20 从未随版本发布（0.4.0-beta.1 = v19），真实升级路径是 v19→v21，若只覆盖 20→21，存量用户库升级将不产生备份（迁移测试抓到了这个边界）。
- `papers_fts` FTS5 虚表：`content`（索引列）+ `paper_id`/`attachment_id`/`page`（UNINDEXED），`tokenize='unicode61 remove_diacritics 2'`。
- `attachments` 新列：`fts_status`（pending/ready/empty/failed，默认 pending）、`fts_indexed_at`、`fts_page_count`；`attachmentRow` 视图带出 `ftsStatus/ftsIndexedAt/ftsPageCount`。

### CJK 检索的关键决策（lib/fulltext-index.js）

- **unicode61 不切分 CJK**（连续汉字 = 单个长 token，子词查询全 miss）。方案：索引与查询两侧对 CJK 字符逐字补空格（unigram），短语引号保证相邻匹配；拉丁词原样。`buildMatchQuery('正念 干预')` → `"正 念" "干 预"`（词间 AND）；查询内 `"` 转义为 `""`。
- 展示侧 `restoreCjkSpacing` 还原索引注入的空格（高亮标记 ⟦⟧ 不受影响）。
- 提取复用 vendored `assets/vendor/pdfjs.mjs`（与翻译同一引擎，**未引入新依赖**）；逐页提取（unlike 翻译的扁平化 `extractPdfText`），单页 20000 字符上限、400 页上限（`truncated` 标记）。
- 扫描件（无可提取文本）→ `empty` 状态，与 `failed`（解析失败）区分。

### 队列与钩子

- 1 并发串行队列（跟随翻译队列）：按附件去重、失败落状态+审计、可重复执行（整体替换该附件 FTS 行，幂等）。
- 导入钩子：`/projects/:id/upload-pdf` 与 `/import-pdf` 成功后自动入队索引。
- 合并/删除清理：`mergeDuplicatePapers` 中被复用删除的附件清 FTS 行、被移动的附件直接 `UPDATE papers_fts SET paper_id`（避免重提取）；论文删除路径统一 `deleteFulltextForPapers/ForAttachments`。
- 重建：`POST /search/fulltext/rebuild {force}` → pending/failed（force 时含全部）入队，返回排队数 + 状态。

### API（3 条，前缀 `/api/hana-research`）

- `GET /search/fulltext?q=&projectId=&limit=` → paper 聚合命中（每篇 ≤3 条：页码 + `snippet()` 高亮片段），按 bm25 rank 排序；附首个所属项目（id/标题）供前端跳转阅读器。
- `GET /search/fulltext/status` → { total, pending, ready, empty, failed }。
- `POST /search/fulltext/rebuild` → 202。
- `FulltextIndexError` 加入 withError 错误链。

### 前端（assets/research.js|css）

- 文献中心工具栏（筛选当前文献库旁）新增「全文检索」按钮 → 弹窗：搜索框、索引状态行（可检索/待索引/失败/无文本层）、结果卡（标题/期刊/年份 + 逐页命中高亮 + 「打开 PDF」跳阅读器，未入项目文献显示提示）、「重建索引」按钮。隐私文案固定在弹窗首行。
- 结果片段 ⟦⟧ 渲染为 `<mark>` 高亮。

## 验证

- 新增 `tests/fulltext.test.mjs` 8/8：v21 表结构、v20 迁移备份、CJK 切分/还原/转义、真实 pdf.js 提取（手工构建带正确 xref 的多页 PDF fixture，纯离线）、页码命中（短语只在第 2 页）、项目过滤、幂等重建、CJK 合成行检索、扫描件 empty/损坏 failed、队列串行排空、force 重建、3 条 API 路由。
- 全量 `node --test`：**199/199**。
- 真机（dsh web @ 3080，schemaVersion 21）：真实库 2 份 PDF 重建索引 8 秒内 ready×2；中文「情绪调节」命中《资源稀缺…》第 8 页（片段高亮正确、返回项目上下文）；英文 "emotion" 命中 18/19 页；弹窗 UI 截图验收通过（含索引状态行、打开 PDF 按钮）。验收实例与标签页已清理。

## 测试基建备注

- 测试 fixture 走 `importPaperAttachment` 时 `sourceUrl` 必须传 `""` 而非 `null`（列 NOT NULL，`INSERT OR IGNORE` 会静默吞掉违规行 → 返回 attachment: null，报错形态极具迷惑性）。
- PDF fixture 用 `buildTestPdf(pageTexts)` 程序化构建（Catalog/Pages/Page/内容流 + 动态计算 xref 偏移），不依赖网络下载。

## 留给后续的清单

1. 阅读工作台（web/ React）搜索栏「本文/全库」双模式：调 `/search/fulltext`，命中跳页（需 esbuild 重建 + 真机验收）。
2. 阅读器跳转支持页码定位（reader URL 带 page 参数，React 侧消费）。
3. 索引进度可视化进阶（pending 数量大时的进度条；当前只有状态计数）。
4. P0-2 引用核验、P0-4 性能清账（0.5.0 剩余项）。
