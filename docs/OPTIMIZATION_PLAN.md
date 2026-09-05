# Hana Research 综合优化计划（2026-09）

> 基于代码盘点 + GitHub 生态调研的比对结论与分级优化路线。供 0.4.x → 0.7 迭代参考。
> 调研日期：2026-09-05。基线版本：`0.4.0-beta.1`（schema v19，Node 测试 175/175）。

---

## 1. 调研方法与范围

- **代码盘点**：`lib/`（1.04 万行）与 `web/src` 的能力确认，重点核对全文检索、PDF 文本提取、去重、引文网络、性能遗留。
- **GitHub 调研**：18 组关键词检索 + 11 个重点仓库 README 精读，覆盖四类对标：
  1. AI 研究 Agent（gpt-researcher、STORM、PaperQA2、opendraft、FWMA、dzhng/deep-research）
  2. 文献管理工具（Zotero 插件生态、Paperlib、Wispar）
  3. 系统综述自动化（MetaScreener、ASReview、AI-Powered-Literature-Review-Skills、LatteReview）
  4. DSH 平台生态（create-dsh-plugin、dsh-web-auth、dsh-plugin-mcp-manager、nature-academic-search）
- **npm 选型核查**：PDF 文本提取（pdf-parse v2 / unpdf）、统计绘图（@observablehq/plot）、DSH 官方对 SQLite FTS5 的使用先例。

## 2. 当前基线与代码盘点结论

已有能力（保持并强化）：四源检索 + 期刊同步、去重合并、项目驾驶舱（PRISMA / 双独立筛选 / 自定义编码 / RoB 2 / ROBINS-I / GRADE）、EmbedPDF 三栏精读、逐句证据卡、汇总笔记（10 节模板）、段级缓存翻译、原生导出、20 个 Agent 工具（读写分离 + 审批审计）。

代码盘点确认的**缺口**（与下文编号对应）：

| # | 缺口 | 证据 |
|---|---|---|
| G1 | 无跨库全文检索：没有 SQLite FTS5 表，文献搜索仅元数据，逐句笔记仅 LIKE | `lib/store.js` 无 FTS5；`api.js /search` 未索引 PDF 内容 |
| G2 | 无服务端 PDF 文本提取：PDF 内容只存在于客户端 EmbedPDF，服务端无法筛选/索引 | `lib/pdf-import.js` 只存文件；全文提取仅在浏览器侧 |
| G3 | AI 综述草稿无引用核验：AI 生成内容可能引用不存在的文献，无字段级核验 | `lib/reporting.js`、汇总笔记无 verification 链路 |
| G4 | 筛选阶段无 AI 辅助：双人工筛选科学但慢，无预筛/置信度分层 | `store.js` 筛选字段全为人工决策 |
| G5 | 引文网络浅：单跳 related/citations（max 12），无多跳、无可视化、无时间线 | `lib/openalex-network.js`（150 行） |
| G6 | 无定量综合：证据矩阵止步定性，无效应量、森林图、异质性 I² | `quality-export.js` / 证据矩阵导出 |
| G7 | 数据源少：缺 Europe PMC、Semantic Scholar；无 MeSH 检索式辅助；无试验注册库 | `literature-search.js` 四源 |
| G8 | 性能遗留：API 路由样板 90+ 处、`/papers` 旧契约全量返回、`renameNoteTag` N+1、`syncProjectNotesFile` 写放大 | `memory/2026-08-31_v48` 后续清单 |
| G9 | 前端资产重：`reader-workbench.js` 2.8MB 单文件 | `assets/` 体积 |
| G10 | 扫描版 PDF 无 OCR；macOS/Linux 无实机验收 | `web/` 构建产物；README 兼容性标注 |

## 3. 对标项目总览

### 3.1 同平台（DeepSeek Harness）生态 —— 竞合关系最重要

| 项目 | Star | 状态 | 关系与启示 |
|---|---|---|---|
| [wp-a/nature-academic-search](https://github.com/wp-a/nature-academic-search) | 183 | 活跃 | **同平台最强互补品**：五源检索（含 Europe PMC）+ 字段级引用核验 + MeSH + 有界引文图谱，DSH Bundle 形态。占据「检索+核验」心智；我们占「精读+综述工作流」。启示：引用核验账本（verified/mismatch/not_found/manual_needed）、结果指纹审计 |
| [kaijia323/create-dsh-plugin](https://github.com/kaijia323/create-dsh-plugin) | 6 | 新 | 官方能力清单：`defineTool` DSL（后台任务、策略钩子、UI 卡片、Code Mode）、`Service` 依赖声明、`LlmAdapter`、五种事件模式。**我们目前只用了一半平台能力** |
| henlii/dsh-plugins、dsh-plugin-mcp-manager、dsh-pluginmanager、mddl-harness | 2–5 | 新 | 生态刚起步，尚无第二个垂直研究插件 → **先发优势窗口**；UI 卡片/设置页等通用交互模式可互认 |

### 3.2 系统综述自动化 —— 我们的功能腹地，方法论最值得搬

| 项目 | Star | License | 可借鉴点 |
|---|---|---|---|
| [ChaokunHong/MetaScreener](https://github.com/ChaokunHong/MetaScreener) | 1328 | Apache-2.0 | **AI 预筛完整范式**：PICO/PEO/SPIDER 纳排标准 AI 生成 → 分层决策（硬规则排除 / 高置信自动 / 中置信 / 人工复核）→ 人工覆写反馈回路 → WSS@95、敏感度、Brier 校准指标 → 全程审计（temperature=0、逐条决策留痕）。风险评定同含 RoB 2 / ROBINS-I / QUADAS-2 |
| [asreview/asreview](https://github.com/asreview/asreview) | 1002 | Apache-2.0 | 主动学习筛选（人工标注少量 → 模型排序下一批）、停止规则、模拟实验评估 |
| [JinchengGao-Infty/FWMA](https://github.com/JinchengGao-Infty/FWMA) | 58 | Apache-2.0 | 「AI 议会」多角色评审（主持人 + 2 名专家多轮辩论，0–5 分，辩论记录可审计）；**流水线每步可断点续跑**；PDF 多策略下载（直链→Unpaywall→DOI→浏览器） |
| stephenlzc/AI-Powered-Literature-Review-Skills | 137 | MIT | 综述生成 4 步质量闭环：大纲 → 初稿 → 质量审查（评分 <70 打回重写，<60 重做大纲）→ 润色 |
| [prisma-flowdiagram/PRISMA2020](https://github.com/prisma-flowdiagram/PRISMA2020) | 289 | — | PRISMA 2020 流程图规范的渲染细节（我们已有，可对齐视觉规范） |

### 3.3 AI 研究 Agent —— 报告生成与引用忠实度

| 项目 | Star | License | 可借鉴点 |
|---|---|---|---|
| [Future-House/paper-qa](https://github.com/Future-House/paper-qa) | 9156 | Apache-2.0 | **引用忠实度**：每条陈述回指原文页码 + 评分校验（是否存在支撑句）；矛盾检测（同一问题多篇文献结论冲突时显式标注） |
| [federicodeponte/opendraft](https://github.com/federicodeponte/opendraft) | 400 | MIT | **双源 DOI 确认**：引用仅在 ≥2 个数据库（CrossRef/OpenAlex/Semantic Scholar）确认后才写入；19 个专职 agent 分工 |
| [stanford-oval/storm](https://github.com/stanford-oval/storm) | 31227 | MIT | 多视角问题生成 + 大纲驱动写作（先研究提纲再填内容，而非一次性生成） |
| assafelovic/gpt-researcher | 29295 | Apache-2.0 | 计划-执行-验证分离的多 agent 编排；引用密度可配置 |

### 3.4 文献管理工具 —— 细节体验

| 项目 | Star | License | 可借鉴点 |
|---|---|---|---|
| windingwind/zotero-pdf-translate | 11708 | AGPL-3.0 | 20+ 翻译引擎抽象与缓存策略（我们已有段级缓存，可扩展引擎位） |
| windingwind/zotero-better-notes | 8171 | AGPL-3.0 | 笔记模板市场、文献笔记与工作区联动 |
| l0o0/jasminum | 7191 | AGPL-3.0 | **中文元数据**（CNKI）：中文心理学用户刚需，中文题名匹配已有雏形（`chinese-title.js`）可延伸 |
| [Future-Scholars/paperlib](https://github.com/Future-Scholars/paperlib) | 2285 | GPL-3.0 | 多 scraper 元数据抓取架构、全文+高级搜索、RSS 订阅、评分/旗标 |
| Scriptbash/Wispar | 205 | GPL-3.0 | 期刊 RSS 聚合体验（我们期刊同步可补 RSS 源类型） |

**JS 生态结论**：无成熟 meta-analysis / forest plot 库；效应量计算（SMD/RR/OR 及方差池化）为简单公式可纯 JS 实现，森林图用 `@observablehq/plot` 或自绘 SVG。服务端 PDF 文本提取用 `unpdf`（与 EmbedPDF 同源 pdf.js，版面一致性最好）或 `pdf-parse` v2。DSH 官方包已在用 SQLite FTS5，宿主 node:sqlite 支持 FTS5 无疑。

## 4. 差距分析（六维比对）

| 维度 | 我们 | 生态标杆 | 差距结论 |
|---|---|---|---|
| 检索广度 | 四源、期刊同步 | nature-academic-search 五源+MeSH+试验注册 | 中等：补 Europe PMC/S2 与 MeSH 即可对齐 |
| 筛选科学性 | 双人工独立筛选+仲裁（科学性强） | MetaScreener/ASReview：AI 分层预筛+人工复核 | **互补而非替代**：缺 AI 预筛选项 |
| 证据可信度 | 引用保留标题/DOI/页码/标签（好） | PaperQA2 忠实度评分、opendraft 双源 DOI 确认 | 落后：AI 生成物无核验闭环 |
| 全文能力 | 仅当前打开的 PDF 可搜索 | Zotero/Paperlib 全库全文检索 | **明显落后（G1/G2 一体解决）** |
| 定量综合 | 定性证据矩阵 | RevMan 类效应量+森林图（无开源 JS 等价物） | 空白，但是心理学综述刚需 |
| Agent 深度 | 20 工具+审批审计（平台领先） | FWMA 断点续跑、gpt-researcher 计划-执行分离 | 中等：缺批量/长任务与进度汇报 |

## 5. 优化计划

> 排序原则：先补「可信度地基」（G1/G2/G3 是所有 AI 功能的前置），再做差异化亮点，最后锦上添花。
> 每项验收沿用现有基线：`node --test` 全绿 + 新增针对性测试 + 真机截图验收 + `memory/` 记录。

### P0 —— 可信度地基（建议 0.5.0，2–3 周）

#### P0-1 服务端 PDF 文本提取 + 全库全文检索（解 G1+G2）✅ 后端+API+文献中心入口已完成（2026-09-05，见 memory/2026-09-05_v50-fulltext-search.md）；阅读工作台「本文/全库」双模式待做
- **对标**：Zotero fulltext、Paperlib 全文搜索、DSH 官方 `dsh-session-query-sqlite`（FTS5 先例）。
- **实现**：
  1. `lib/` 新增 `fulltext-index.js`：用 `unpdf`（纯 JS、与 EmbedPDF 同为 pdf.js 系）逐页提取文本；
  2. SQLite 建 `papers_fts`（FTS5，`content`/`page`/`attachment_id`/`paper_id`，`tokenize='unicode61 remove_diacritics 2'`）；中文按字切分（unicode61 对 CJK 逐字索引可用，先不做 jieba）；
  3. 触发时机：PDF 导入后异步后台任务（复用 v43 串行队列模式），失败可重试、进度可查；
  4. API：`GET /search/fulltext?q=`（命中高亮片段 + 页码 + paper 聚合）；阅读工作台搜索栏升级为「本文/全库」双模式；
  5. 存量库：设置页提供「重建索引」按钮，分批处理避免阻塞。
- **边界**：索引为本地文件内容，不外发；隐私声明更新。
- **验收**：导入 100 页 PDF 后按短语检索命中正确页码；FTS 建表迁移测试；索引任务幂等测试；真机全库搜索截图。
- **预估**：8–10 人日。

#### P0-2 AI 生成物引用核验闭环（解 G3）✅ 核心已完成（2026-09-05，见 memory/2026-09-05_v51-citation-verify.md）：引擎 + v22 账本 + API + AI 草稿即时核验报告；React 侧徽标与 Agent 工具待做
- **对标**：opendraft 双源 DOI 确认、nature-academic-search 字段级核验账本、PaperQA2 忠实度。
- **实现**：
  1. `lib/citation-verify.js`：对 AI 综述草稿/汇总笔记中的每条引用做「DOI 归一化 → Crossref+OpenAlex 双源确认 → 字段比对（题名/年份/期刊）」，输出 `verified / mismatch / not_found / manual_needed` 四态；
  2. 核验结果落库（新表 `citation_verifications`，含逐字段冲突与来源 URL），汇总笔记界面显示核验徽标，点击看冲突明细；
  3. AI 综述草稿生成时同步要求模型输出 DOI，生成后自动进入核验队列；
  4. Agent 工具新增只读 `verify_note_citations`。
- **原则**：核验是「审计」不是「自动改写」——mismatch 只标记并给出建议，不静默替换（与现有「不把元数据当全文」原则一致）。
- **验收**：构造含幻觉 DOI 的样例笔记，四态全命中；字段冲突展示测试；真机截图。
- **预估**：5–6 人日。

#### P0-3 AI 辅助预筛（可选层，不替代双人工筛选）（解 G4）✅ 已确认纳入 0.5.0（2026-09-05），可执行拆解见第 6 节
- **对标**：MetaScreener 分层决策、ASReview 主动学习。
- **实现**：
  1. 项目筛选设置新增「AI 预筛」开关（默认关）；打开后用纳排标准（复用现有 inclusion/exclusion 字段）对题录+摘要（有全文则含相关段落，依托 P0-1 索引）逐篇生成 include/exclude/uncertain + 理由 + 置信度；
  2. 分层展示：高置信自动归入「AI 建议」列，uncertain 与低置信自动进入人工双筛队列——**不改变 PRISMA 口径**，AI 决策单独统计（借鉴 MetaScreener 的 tier 思路但单模型简化）；
  3. 人工覆写 AI 建议时记录反馈（为后续排序学习留数据）；
  4. 温度 0 + 逐条审计留痕（沿用宿主 LLM，写操作仍走审批）；
  5. 筛选质量指标：在 PRISMA 报告中增加 AI 预筛与人工结论的一致率、敏感度（可选 WSS@95，供方法学附件用）。
- **边界**：README 明确「AI 预筛为效率工具，正式系统综述仍需双人工筛选」。
- **验收**：预筛任务可取消/续跑（FWMA 断点续跑思路）；一致性统计测试；真机走查。
- **预估**：6–8 人日。

#### P0-4 性能与工程遗留清账（解 G8、G9 部分）✅ 完成（2026-09-05，见 memory/2026-09-05_v52-performance-cleanup.md）：renameNoteTag N+1、笔记文件写放大已修；/papers 旧契约盘点为兼容层无需改动；withError 样板收敛评估后推迟至 0.6；阅读器资产评估为无低垂果实
- **实现**（承接 v48 清单）：API 路由样板收敛（`withError` 三行 → route 装饰器，90+ 处）；`/papers` 分页契约收口（v28 已做服务端分页，清旧全量调用方）；`renameNoteTag` N+1 与 `syncProjectNotesFile` 写放大修复；`reader-workbench.js` 评估 esbuild 代码分割/树摇（目标 ≤2MB）。
- **验收**：现有 175+ 测试全绿；按钮审计/验证套件通过；构建产物体积记录进 CHANGELOG。
- **预估**：4–5 人日。

### P1 —— 差异化增强（建议 0.6.0，3–4 周）

#### P1-1 AI 综述草稿升级：大纲驱动 + 证据绑定（对标 STORM/综述 skill 质量闭环）
- 从「一次生成」改为「大纲（多视角问题生成）→ 分节草稿（只允许引用项目内已核验证据卡，逐句带页码回指）→ 质量审查（覆盖率/引用密度评分，低分自动重写对应节）→ 润色」四步；
- 复用 P0-2 核验：草稿中新增引用即时核验；矛盾检测——同一论点下两篇文献结论冲突时显式标注「存在分歧」（PaperQA2 思路的简化版）。
- **预估**：8–10 人日。

#### P1-2 引文网络增强（解 G5）
- 多跳检索（depth=2 显式开关，遵循 nature-academic-search 的「有界图谱 + 截断原因」契约：nodes/edges/observed_by/truncated）；
- 项目库内新增网络视图（力导向图，含参考文献/被引两个方向，节点=项目文献或外部文献）；「引文时间线」（该领域研究脉络）；
- 与论证链打通：网络节点可一键「加入项目 / 建立论证关系」。
- **预估**：6–8 人日。

#### P1-3 数据源扩展 + 检索式辅助（解 G7）
- 新增 Europe PMC（开放全文线索好、与 PubMed 互补）、Semantic Scholar（补引用关系，显式开关控制配额）；
- PubMed 检索式构建辅助：MeSH 主题词查询（NCBI E-utilities 免费接口）→ 中英主题词分组组合 → 可复制的检索式（nature-academic-search 的 lookup_mesh 交互模式）；
- ClinicalTrials.gov 试验注册查询（`entity_type=trial`，试验与论文分开核验，心理学 RCT 综述有用）。
- **预估**：5–7 人日。

#### P1-4 筛选管线断点续跑 + 批量操作
- 期刊同步/预筛/索引/翻译统一为「可续跑任务框架」（进度、失败重试、幂等键），Agent 可通过只读工具查询任务进度；
- 文献库批量操作：批量加入项目、批量打标签、批量导出（Zotero 式多选体验）。
- **预估**：5–6 人日。

### P2 —— 进阶能力与生态（0.7.0 及以后）

#### P2-1 定量综合模块（解 G6）——心理学综述刚需
- 效应量计算（纯 JS）：连续型 SMD（Hedges g）/ 均值差，二分类 OR/RR，各自方差池化；
- 随机/固定效应模型、异质性 I²/Q、森林图（自绘 SVG 或 `@observablehq/plot`，导出 SVG/PNG）；
- 数据来源：证据卡新增「数值结果」结构字段（均值/SD/n），手工录入或 AI 辅助从全文抽取（依托 P0-1 索引定位 Results 段）+ 人工确认；
- **边界**：定位为「描述性辅助计算」，输出明确标注非 RevMan 替代，方法学细节引用 Cochrane Handbook 公式。
- **预估**：10–12 人日。

#### P2-2 DSH 平台能力深化
- 采用 `defineTool` 的 UI 卡片（Agent 检索结果以卡片而非纯文本回贴对话）；策略钩子接入写审批展示；事件系统（`tools/result` 等）做「检索完成 → 新结果提醒」的推送化；
- 与 DSH 生态互操作：输出 OpenAPI 描述或 MCP 桥（使 nature-academic-search 等 bundle 的检索能力可作为我们「外部源」被调用——竞合互补）。

#### P2-3 中文文献与体验补强
- CNKI/万方元数据接入评估（jasminum 思路，注意反爬与合规）；中文题名去重强化（`chinese-title.js` 扩展：拼音/繁简归一）；
- 期刊同步补 RSS 源类型（Wispar 思路）；翻译引擎位扩展（保留现有段级缓存）。

#### P2-4 跨平台与健壮性
- macOS/Linux 实机验收（CI 已过，补真机）；扫描版 PDF OCR 评估（tesseract.wasm 或调用宿主多模态，视宿主能力定）——扫描件在心理学旧文献中占比不低，但不做默认承诺。

### 明确不做（本期）

| 项 | 理由 |
|---|---|
| 多 LLM 集成投票（MetaScreener 原版形态） | 插件内无多模型 API 通道，宿主只提供一个 LLM；用分层置信度简化版即可获得 80% 价值 |
| Sci-Hub 类全文获取 | 法律与安全边界，维持 Unpaywall 合法路线 |
| 云同步/协作 | 本地优先是定位与卖点；Yjs/CRDT 类复杂度不匹配当前阶段 |
| 自研向量库/本地嵌入检索 | 宿主无 embedding 端点；FTS5+LLM 已覆盖绝大多数检索场景，待平台提供 embedding 再评估 |
| 替代 Zotero 的通用文献管理 | 定位是「心理学研究工作流」，不追求大而全 |

### 里程碑与节奏建议

| 版本 | 主题 | 内容 |
|---|---|---|
| 0.5.0 | 可信度地基 | P0-1 ~ P0-4（全文检索、引用核验、**AI 预筛（已确认）**、性能清账） |
| 0.6.0 | 综述与发现 | P1-1 ~ P1-4（大纲驱动综述、引文网络、数据源、任务框架） |
| 0.7.0 | 定量与生态 | P2-1、P2-2 优先；P2-3/P2-4 穿插 |

### 风险与依赖

1. **包体积**：unpdf 等新增依赖使 18.5MB 包上涨 → 只引入纯 JS 依赖、按需懒加载、发布前体积门槛（≤25MB）写进 CI。
2. **宿主 LLM 额度**：预筛/综述批任务沿用 v43 串行队列 + 额度保护，提供「仅元数据/含全文」两档发送范围（透明度）。
3. **API 限流**：Crossref/OpenAlex/S2 均有礼貌池要求 → 统一 `fetchWithBackoff`（openalex-network.js 已有雏形）提升为公共模块，UA 带联系方式。
4. **科学性边界**：所有 AI 辅助功能（预筛/综述/抽取）在 UI 与 README 中声明「辅助而非替代人工判断」，PRISMA 口径不被 AI 统计污染。
5. **DSH 平台演进**：开发者预览期 API 可能变化 → 平台深依赖项（事件/UI 卡片）放 0.7，先做与平台无关的 P0/P1。

---

## 6. P0-3 AI 预筛 · 可执行任务拆解（0.5.0）

> 2026-09-05 决策：纳入 0.5.0。定位：**第三评审**——只出建议、不替代双人工筛选，PRISMA 口径不混入 AI 数字。

### 6.1 设计决策（与现有结构的衔接）

| 决策 | 结论 | 理由 |
|---|---|---|
| 存储位置 | **新表** `ai_screening_runs` + `paper_ai_screenings`，**不**扩 `paper_screening_reviews.reviewer_key` | 双筛表语义保持「两个人工评审」；不动 CHECK 约束；AI 数字与 PRISMA 主流程物理隔离 |
| 纳排标准 | 复用 `project_screening_criteria`，运行时对标准内容做 `criteria_hash` 快照存入 run | 标准事后修改时，旧 AI 结果可标记「基于旧标准」，避免误读 |
| 阶段 | `stage` 支持 `title` / `fulltext`，与现有双筛阶段对齐 | 题录筛与全文筛都可预筛 |
| LLM 调用 | `completeWithHostLlm({ temperature: 0 })`，单次处理 1 篇（逐条审计、可断点） | 复用 v43 串行队列保护额度；温度 0 + prompt_version 落库保证可复现 |
| Agent 工具 | 仅新增**只读** `get_ai_screening`；运行预筛暂不做 Agent 工具 | 批量消耗宿主额度的动作先收敛在 UI；0.6 评估是否开放（走审批） |
| 人工双盲 | AI 建议不预填 reviewer A/B 字段；提供显式「复制为我的初筛草稿」按钮并标注来源 | 保住双独立筛选的科学性（预填会污染盲评） |

### 6.2 数据模型（schema v19 → v20，升级前照例 `.bak-v20` 备份）

```
ai_screening_runs
  id, project_id, stage('title'|'fulltext'),
  criteria_hash, criteria_snapshot(JSON),
  model, prompt_version,
  status('queued'|'running'|'paused'|'done'|'failed'|'cancelled'),
  total, processed, included, excluded, uncertain,
  last_paper_id,            -- 断点续跑游标
  error, created_at, updated_at

paper_ai_screenings
  id, run_id, project_id, paper_id, stage,
  decision('include'|'exclude'|'uncertain'),
  confidence REAL,          -- 0–1
  rationale TEXT,
  per_criteria JSON,        -- 每条纳排标准: {id, hit, evidence}
  tier INTEGER,             -- 1 高置信 / 2 低置信 / 3 转人工
  sent_scope('metadata'|'fulltext_excerpt'),
  created_at
  UNIQUE(run_id, paper_id)  -- 幂等
```

### 6.3 分层路由与一致率

- tier1：confidence ≥ 0.75 且 decision ≠ uncertain → 「AI 建议」列。
- tier2：0.5 ≤ confidence < 0.75 → 「AI 建议」列，标注低置信。
- tier3：< 0.5 或 uncertain → **自动进入人工双筛待办**（不产生 AI 建议数字）。
- 一致率（`GET .../ai-agreement`）：在已有最终人工决定的子集上计算 AI 相对人工的敏感度/特异度/一致率；人工决定与 AI 不一致即视为「覆写」，作为后续调参依据（ASReview 反馈回路的最小版）。

### 6.4 LLM 输出契约与容错

- system：纳排标准逐条注入；要求只依据所给题录/摘要/段落，禁止外部知识补判（沿用「不把检索元数据当全文」原则）。
- user：单篇 paper 的题录 +（可选）全文相关段落。
- 输出强制 JSON：`{decision, confidence, rationale, criteria:[{id, hit, evidence}]}`；解析失败重试 1 次，仍失败落 `uncertain + error 标记`，不中断 run。

### 6.5 API（前缀 `/api/hana-research`）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/projects/:id/screening/ai-runs` | `{stage, paperIds?}`（缺省=待筛全量），创建 run 入队 |
| GET | `/projects/:id/screening/ai-runs` | run 列表 + 进度计数 |
| POST | `/screening/ai-runs/:runId/cancel` · `/resume` | 取消 / 断点续跑 |
| GET | `/projects/:id/screening/ai?stage=&tier=` | 结果列表（rationale、per_criteria 可展开） |
| GET | `/projects/:id/screening/ai-agreement` | 与人工结论一致率统计 |

### 6.6 UI（项目证据页签 · 筛选区）

1. 「AI 预筛」折叠区：项目级开关（默认关）+ 发送范围选择（默认「仅题录与摘要」；「含全文相关段落」档在 P0-1 索引就绪前禁用置灰）。
2. 运行 → 进度条（复用 v36 modal/toast 工厂），可暂停/取消。
3. 结果列表按 tier 分组：决定徽标、置信度条、理由折叠、per-criteria 命中表。
4. PRISMA 面板新增独立「AI 辅助」统计块（含一致率），主流程数字不变。

### 6.7 任务序列（合计约 8 人日）

| # | 任务 | 产出 | 预估 |
|---|---|---|---|
| 1 | schema v20 迁移 + store CRUD（run 生命周期/幂等/断点） | `store.js` + 迁移测试 | 1.0 |
| 2 | 预筛 prompt + JSON 解析容错 + 单测 | 新 `lib/ai-screening.js` | 1.0 |
| 3 | 接入串行队列：断点续跑、取消、进度上报 | 队列适配 | 1.5 |
| 4 | API 路由 + 错误路径 | `api.js` | 1.0 |
| 5 | UI：AI 预筛区 + 结果列表 + PRISMA 统计块 | `assets/research.js|css` | 2.0 |
| 6 | 只读 Agent 工具 `get_ai_screening` + 审计 | `register-tools.js` | 0.5 |
| 7 | `tools/verify-ai-screening.mjs` + 真机端到端（建项目→导入 3 篇→预筛→人工筛→一致率）+ README/SECURITY 更新 + `memory/` 记录 | 验收证据 | 1.0 |

### 6.8 验收清单

- [ ] 迁移：v19→v20 存量库升级成功，`.bak-v20` 快照存在，旧数据零丢失。
- [ ] 断点续跑：run 中途取消（或模拟崩溃）后 resume，不重复计费、不重复落行（UNIQUE 幂等）。
- [ ] 容错：模拟非法 JSON / 超时 → paper 落 uncertain + error，run 不中断。
- [ ] 分层：tier1/2/3 路由正确，tier3 出现在人工双筛待办中。
- [ ] 盲评：AI 建议未写入 `paper_screening_reviews`；「复制为初筛草稿」带来源标注。
- [ ] PRISMA：主流程数字与 AI 统计块完全独立。
- [ ] 隐私：发送范围默认仅元数据；SECURITY.md 更新说明发送内容与落库位置。
- [ ] 全量 `node --test` 绿 + 按钮/验证套件通过 + 真机截图（浅色/深色、窄屏）。

### 6.9 依赖与顺序

> **进度（2026-09-05）**：P0-3 全部完成——schema v20 迁移、store CRUD、预筛引擎 `lib/ai-screening.js`、串行队列 runner、8 条 API 路由、Agent 工具 `get_ai_screening`、筛选页「AI 预筛」折叠区 + PRISMA「AI 辅助」统计块，真机截图验收通过（见 `memory/2026-09-05_v49-ai-screening-backend.md`）。

- 与 P0-1 **解耦**：元数据档可先行交付（runner 现固定 sentScope=metadata）；「含全文相关段落」档等 P0-1 索引就绪后打开。
- 与 P0-2 无依赖；若同版交付，预筛 rationale 中的引文同样进入核验队列（顺带收益）。
- 与 P0-4 共享串行队列改造，建议任务 #3 与 P0-4 的队列收敛合并实施。

---

## 附：调研来源清单

同平台：wp-a/nature-academic-search（183★）、kaijia323/create-dsh-plugin、henlii/dsh-plugins、HuanLinOTO/dsh-plugin-mcp-manager、zdjmrq/dsh-pluginmanager、taltara/mddl-harness。
系统综述：ChaokunHong/MetaScreener（1328★）、asreview/asreview（1002★）、JinchengGao-Infty/FWMA、stephenlzc/AI-Powered-Literature-Review-Skills、PouriaRouzrokh/LatteReview、prisma-flowdiagram/PRISMA2020。
AI Agent：Future-House/paper-qa（9156★）、federicodeponte/opendraft（400★）、stanford-oval/storm（31227★）、assafelovic/gpt-researcher（29295★）、dzhng/deep-research、bytedance/deer-flow。
文献管理：windingwind/zotero-pdf-translate（11708★）、zotero-better-notes（8171★）、l0o0/jasminum（7191★）、Future-Scholars/paperlib（2285★）、Scriptbash/Wispar（205★）。
npm 选型：unpdf、pdf-parse v2、@observablehq/plot、@deepseek-ai/dsh-session-query-sqlite（FTS5 先例）。
