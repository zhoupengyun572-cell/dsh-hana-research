# v49 AI 预筛（schema v20 + runner + Agent 工具 + UI）

时间：2026-09-05（Asia/Shanghai）

对应 `docs/OPTIMIZATION_PLAN.md` §6（P0-3 AI 预筛）任务 #1–#6 全部完成。

## 已实现

### schema v20（lib/store.js）

- `RESEARCH_SCHEMA_VERSION` 19 → 20；迁移块照例先 `.bak-v20-*` 备份（仅 19→20 升级路径触发，全新库不备份）。
- 新表 `ai_screening_runs`（stage/criteria_hash/criteria_snapshot/target_paper_ids/model/prompt_version/status/计数器/last_paper_id/error）+ `paper_ai_screenings`（decision/confidence/rationale/per_criteria/tier/sent_scope，`UNIQUE(run_id, paper_id)` 幂等）。
- **AI = 第三评审**：结果只落新表，不写 `paper_screening_reviews` 与 `project_papers` 人工字段，双盲与 PRISMA 口径物理隔离（测试有断言）。
- store 方法：`createAiScreeningRun`（targets 快照入库，断点续跑依据）/ `getAiScreeningRun` / `listAiScreeningRuns` / `updateAiScreeningRunStatus`（状态机：running 只能从 queued/paused/failed 进入，resume 保留 last_paper_id 游标）/ `appendAiScreeningResult`（tier 服务端计算：uncertain 或 <0.5→3，≥0.75→1，其余→2；计数器由表内派生，重复写入不重复计数）/ `listAiScreenings`（tier/stage/runId 过滤）/ `buildAiScreeningAgreement`（与人工最终结论对齐：include=阳性、maybe 算阴性保守口径；含 criteriaChanged 标记）。

### 预筛引擎（lib/ai-screening.js，新文件）

- `buildScreeningSystemPrompt`：第三评审角色 + 逐条纳排标准 + 强制 JSON 契约；明确「只依据所给材料、不足则 uncertain、禁外部知识补判」。
- `buildScreeningUserPrompt`：题录（题名/作者/年/刊/DOI/摘要 800 字）+ full_text 阶段附全文段落（P0-1 索引就绪前不会传入）。
- `normalizeScreeningPayload`：非法 decision→uncertain、confidence 收敛 [0,1]、perCriteria 与标准清单对齐（匹配 label 补 id）。
- `aiScreenPaper`：`completeWithHostLlm({ temperature: 0 })`；JSON 解析复用 `ai-search.js` 的 `extractJsonFromAi`；解析失败**容错降级**（uncertain + parseError）不抛错，模型不可用抛 `AiScreeningError`（AI_SCREENING_NO_MODEL / AI_SCREENING_UNREACHABLE）。

### 串行队列 runner（lib/api.js）

- 1 并发队列（跟随翻译任务模式）；每篇开始前核对 run 状态 → 暂停/取消立即停止且**不覆盖用户设置的状态**；模型返回期间被暂停时丢弃在途结果（容忍 `AI_SCREENING_RUN_NOT_RUNNING`）。
- 断点续跑：跳过本 run 已写入结果的文献；失败（模型错误等）→ run 标 failed + error，resume 后从断点继续，UNIQUE 幂等兜底不重复。
- `sentScope` 固定 `metadata`（仅题录+摘要），「含全文段落」档等 P0-1 后再开。

### API（8 条路由，前缀 `/api/hana-research`）

- `POST /projects/:id/screening/ai-runs`（无宿主模型 → 400 AI_SCREENING_NO_MODEL；入队返回 201）
- `GET /projects/:id/screening/ai-runs` · `GET .../ai-runs/:runId`（404 AI_SCREENING_RUN_NOT_FOUND）
- `POST .../ai-runs/:runId/pause|resume|cancel`
- `GET /projects/:id/screening/ai?runId=&stage=&tier=` · `GET /projects/:id/screening/ai-agreement?stage=&runId=`
- `AiScreeningError` 已加入 withError 错误类链。

### Agent 工具（第 21 个）

- `tools/get-ai-screening.js`（只读，runTool 包装）：runs / results / agreement 三视图；guidelines 明确「汇报时必须说明是 AI 建议而非筛选结论」。
- `register-tools.js` 注册（20 → 21）；`package.json` files 白名单与 release-metadata 的 `RUNTIME_TOOL_FILES` 已同步。

### 口径同步

- 9 个既有测试文件的 schema 断言 19→20；compat 工具数 20→21；README/README.en/PLUGIN_OVERVIEW/USER_GUIDE 的 schema v20 与「21 个工具」。
- 打包：`tools/get-ai-screening.js` 进 files 白名单；`lib/ai-screening.js` 由 `lib` 目录规则覆盖；30MB 体积预算内。

## 验证

- 新增 `tests/ai-screening.test.mjs` 15/15：v20 表结构、v19→v20 迁移备份幂等、标准前置校验、pending 目标选择、状态机非法转移拒绝、tier 路由与计数派生、幂等覆盖、过滤器、一致率（tp/fp/tn/fn=1/1/1/1、AI 不写人工字段、criteriaChanged）、AI 结果不污染 PRISMA/双筛、prompt 契约、规范化修复、BAD_JSON 容错、无模型 400、runner 串行完成、失败后断点续跑无重复、Agent 工具三视图。
- 全量 `node --test`：**189/190**；唯一失败为既有网络依赖测试 `extractPdfText works in Node with real PDF`（真实下载 arxiv PDF，全量并发时偶发超时，单跑 13/13 通过；与本次改动无关，建议后续给该测试加重试或本地 fixture）。
- `release-metadata`（npm pack 白名单/体积）、`compat`（21 工具编译）通过。

## 留给后续的清单

1. P0-1 全文索引就绪后：打开「含全文相关段落」档（sentScope: fulltext_excerpt，UI 发送范围选择）。
2. 一致率统计的 WSS@95（可选，方法学附件用）。
3. `extractPdfText` 网络依赖测试的稳定性处理。

## UI（任务 #5，同日补全）

### 筛选页签「AI 预筛」折叠区（assets/research.js|css）

- `renderScreeningWorkbench` 内新增 `<details data-ai-panel>`（虚线边框，与双筛面板同语言）：summary 含 kicker「AI Pre-screen」+ 状态徽标（未运行 / 排队中 / 进行中 n/m / 已暂停 / 运行失败）；body 含固定说明文案（不会改动人工判断、不进 PRISMA 主流程数字）+ 控制区 + 运行列表 + 分层建议 + 一致率块。
- 懒加载：`bindDrawer` 绑定 `toggle` 事件，展开时 `refreshAiScreeningPanel` 才请求 `/screening/ai-runs`；有活动 run 时 2.5s 轮询（`panel.isConnected && panel.open` 双守卫，收起/重开自动停）；收起时停止轮询。
- 控制区状态机：空闲→「运行 AI 预筛」（confirmDialog 声明消耗额度）；queued/running→进度条 + 暂停 + 取消；paused/failed→「从断点继续」+「重新运行」；纳排标准为空时按钮 disabled + title 提示。
- 分层建议按 tier 分组（高置信/低置信/转人工），每条含决定徽标、置信百分比、理由；include/exclude 条目带「采纳为初筛」按钮（uncertain 无）。采纳：非双筛模式 PATCH `/screening`（legacy 字段），双筛模式 PATCH `/screening/reviews/<当前身份>`；理由统一前缀「AI 建议（置信 x%）：」保证来源可追溯。
- 一致率块：一致率/敏感度/特异度/差异处数 + criteriaChanged 警示 + 「不进入 PRISMA 主流程数字」小字。

### PRISMA 弹窗「AI 辅助」统计块

- `renderPrismaModal` 台账侧新增 `data-prisma-ai` 块，`fillPrismaAiBlock` 并行拉取两阶段 agreement，按阶段渲染一致率行；标注「独立统计，不计入上方流程数字」。

### 环境与验收

- web Profile 的 junction 曾在 v48 后清理：本次经 PowerShell `New-Item -ItemType Junction` 重建 `~/.dsh/profiles/web/node_modules/@local/dsh-hana-research` → 开发目录（mklink 在 Git Bash 下参数会静默错传，PowerShell 创建后已校验 LinkType='Junction'），并保留为开发运行副本常态。
- 真机验收（dsh web @ 127.0.0.1:3080，动态发现）：schemaVersion 20 上线；AI 面板空态、徽标、按钮、PRISMA AI 块、窄屏 375px（无横向溢出）截图通过；`/screening/ai-runs` 返回 `{"runs":[]}`、agreement 返回 `{"available":false,"reason":"no_runs"}`。**未在真机点运行**（避免消耗宿主模型额度、不写用户真实项目数据），运行/确认/采纳全链路由 happy-dom 测试覆盖。验收实例已停止。
- happy-dom 定位桥对 CJK 文本超时（internal:text 与 role[name] 均失败），测试与真机脚本改用 `evaluate` 页面内脚本点击，属合理降级。

### 测试

- `tests/ui-interactions.test.mjs` 新增 AI 面板端到端用例（7/7）：面板默认折叠 → 展开懒加载 → 运行需确认弹窗 → POST 后运行列表/分层建议/一致率渲染 → 采纳 PATCH 带来源标注 → uncertain 无采纳按钮 → PRISMA AI 块渲染。
- 全量 `node --test`：**191/191**（含网络偶发的 extractPdfText 本次通过）。
