# v43 后端性能：单行直查、索引、去重剪枝、缓存封顶、翻译队列

时间：2026-08-31（Asia/Shanghai）

## 背景

三路深度审查的后端主线。数据层的系统性问题是"写路径高频经全表聚合回读"（getProject/getPaper 都是先跑全库 JOIN 聚合再 find），叠加期刊页全表扫描、重复检测 O(n²)、检索缓存无界、翻译任务无并发控制。

## 已实现

### 数据层单行直查（lib/store.js）

- `getProject`：改为按 id 的单行聚合 SELECT（同 listProjects 形状：COUNT DISTINCT 三联 + archived 过滤），不再 `listProjects().find()`。该函数有 29 处调用（几乎每个写路径的 404 前置检查），旧实现每次触发全项目扫描。
- `getPaper`：同理改为单行 SELECT（MIN(a.id) + GROUP_CONCAT 形状与 listPapers 一致）。
- rowToProject/rowToPaper 为纯行映射，输出形状逐字段一致；171 项既有测试无改动全过。

### 索引

- 新增 `idx_papers_venue_source ON papers(venue, source_name)`：期刊订阅同步与 journalNewCounts 按 venue+source_name 关联 papers，此前每次 GET /journals 全表扫描。`CREATE INDEX IF NOT EXISTS` 位于基础 schema 块，存量库启动时自动补建。papers.doi 已有 UNIQUE 索引，不重复建。

### 重复检测剪枝（listDuplicateCandidates）

- 原实现全库两两比较（O(n²)，同步执行，万级库卡请求线程）。
- 新实现两条互补路径，语义完全一致：
  1. **DOI 分桶**：双有 DOI 的文献对只可能在规范化 DOI 相同的桶内成对（不同 DOI 本就按规则排除）；
  2. **标题路径**：仅"至少一条无 DOI"的组合需要，左侧无 DOI × 右侧任意、左侧有 DOI × 右侧无 DOI 两个循环互补不重复。复杂度 O(n²) → O(|无DOI| × n)。
- 等价性验证：260 篇随机混合库（DOI 缺失/URL 前缀/大小写规范化、标题片段组合、多作者/年份），旧算法逐对复算与新实现对比——候选总数一致（32385），top-300 的 pairKey/exactDoi/score/分项分完全一致（0 差异）。
- 新增回归测试锁定交界语义：单侧 DOI 对仍走标题路径、不同 DOI 永不成对、规范化同 DOI 走分桶。

### 检索缓存封顶（lib/literature-search.js）

- responseCache（5 分钟 GET 缓存）原来只增不删，单条理论上限 4MB，长期运行持续累积。
- 封顶 64 条：读取时惰性删过期；写入超限时先清过期、再 FIFO 驱逐最旧。

### 翻译后台任务加固（lib/api.js startTranslationTask）

- 串行队列（1 并发）保护宿主模型额度，pump 逐个调度；原实现 fire-and-forget 无上限并发。
- 同 docId 去重（队列/执行中不再重复入队），完成后可重新发起（重试语义不变）。
- 外层 catch 不再静默：记 ctx.logger.error 并把失败状态+错误信息写回 translation_docs（截断 300 字符）。

## 验证

- 根测试 172 项全绿（新增 1 项重复检测语义回归；本机有网，此前的两个外网依赖测试也通过）。
- lib/api.js / literature-search.js / store.js node --check 通过。

## 部署说明

- 本里程碑全部为 lib 层改动，无静态资产。运行副本 lib 仍为 0.4.0 前基线，**不选择性同步**（避免混合状态）；v41/v43 的 lib 修复随 0.4.0-beta.1+v41+v43 整体升级并重启 Harness 时一并生效（需用户同意）。

## 留给 v44 的清单

1. 弹层工厂第二步：36 处 openModalLayer 样板收敛（innerHTML+bind+close 统一），109 处 data-* 绑定器收敛为事件委托。
2. API 路由样板收敛（90+ 处 withError 三行 → route 装饰器）+ 错误类基类归并。
3. PDF 附件响应改流式（readFileSync 40MB 阻塞事件循环）、journal-sync 每轮同步前一次性加载 DOI/id 映射。
4. 真机截图债务：v41/v42 主题切换与 SPA 转场验证（Harness 启动后动态发现端口）。
