# HanaResearch → DeepSeek Harness 插件移植方案

- 状态：设计稿（v1，2026-08-15）
- 目标产物：`@local/dsh-hana-research` 静态 Cordis 插件，安装到 DSH profile（与 `dsh-research-spike` 同一路线）
- 参考实现：`openhanako-research-agent/plugins/hana-research` v0.15.0（已冻结归档，仅作参照，不改动）

## 1. 背景

HanaResearch（文献中心 / 项目库 / PDF 阅读 / 笔记 / 翻译 / 期刊同步 / 16 个 Agent 工具）原为 OpenHanako 桌面应用内的插件。项目方向已决定：**将完整功能集重建为 DeepSeek Harness（Cordis 静态）插件**。

`dsh-research-spike` 已验证的路线可行性（全部实测通过）：

| 验证点 | 结果 |
|---|---|
| 静态插件安装（profile `cordis.patch.yml` + `node_modules/@local/`） | ✅ 当前 Harness 已加载 |
| 宿主 `webServer` 路由 + `node:sqlite` 落盘 | ✅ `/api/research-spike/health` 200 |
| 出站 HTTPS（OpenAlex 真实检索） | ✅ 返回真实文献结果 |
| 动态工具对模型可见可调用 | ✅ `research_spike_search` 已在工具列表 |
| 客户端 UI（`settings.section` 插槽） | ✅ bundle 已加载，设置页分区待视觉确认 |
| 持久性（跨重启） | ✅ 检索记录跨重启保留 |

## 2. 移植目标形态

```
profile/
  node_modules/@local/dsh-hana-research/     ← 插件包（无外部运行时依赖，见 §7.6）
    package.json                             ← exports["./client"] + dsh.client.platform: "web"
    lib/index.js                             ← 宿主半（webServer 路由 + store + 工具 + 定时器）
    lib/client.js                            ← 客户端半（factory-CJS bundle，注册插槽 UI）
    lib/*.js                                 ← 移植的服务模块
    assets/*                                 ← 前端资产（research.js/css 等 + pdfjs.mjs）
cordis.patch.yml                             ← insert: @local/dsh-hana-research
```

- 安装/回滚流程沿用 spike README 的步骤（备份 patch → 复制包 → 追加条目 → 重启）。
- **开发期迭代手段**：同一份宿主逻辑先在会话内以动态 Cordis 插件（`cordis_define`/`cordis_run`）验证，稳定后落为静态包；静态包改动需重启 Harness 生效。

## 3. 能力映射总表（OpenHanako → DSH）

| OpenHanako 机制 | DSH 对应物 | 说明 |
|---|---|---|
| 插件 manifest 网络白名单（`network.allowedHosts`） | 插件内部常量 + `lib/pdf-import.js` 现有 allowedHosts 逻辑 | DSH 无 manifest 白名单机制；"能检索到"与"能合法下载"分离的下载白名单**原样保留为代码层** |
| 插件 `ctx.network`（宿主网络包装） | `ctx.web.fetch()`（WebFetchProvider）或全局 `fetch` | 静态插件运行在完整 Node 环境；`ctx.web` 受提供者选择语义约束，全局 fetch 更直接。**默认全局 fetch + 插件自管超时/大小/重定向校验**（pdf-import 现有逻辑直接复用） |
| `ctx.dataDir`（插件数据目录） | `$DSH_HOME/plugin-data/hana-research/` | spike 已验证同一模式 |
| better-sqlite3 | `node:sqlite`（`DatabaseSync`） | API 差异见 §5.1 |
| Hono `app.get/post(route, c => …)` 路由 | `webServer.register({kind, path, handler})` | handler 为 node:http `(req, res)`；JSON 编解码手写；`prefix` 路由一个入口分发所有 `/api/hana-research/*` |
| 宿主 iframe 工作区扩展点 `contributes.primaryWorkspaces` | **无直接对应物**（DSH 插槽均为 React 组件，无 iframe 工作区插槽） | 核心架构决策见 §4 |
| 工具声明式约定（`tools/*.js` + `sessionPermission` + `describeSideEffect`） | `ctx.tools.register(ToolDefinition)` + `tools/pre-execute` 瀑布 + `approval` 服务 | 权限模型见 §6 |
| `store.auditAgentToolCall`（审计） | 保留 store 内审计表；DSH 侧可用 `tools/post-execute` / `tools/result` 事件旁挂 | 审计逻辑本身移植不变 |
| `translation-config.json`（自带 AI Key） | **首选复用宿主模型**：`agentDefaultModel.currentSelection()` + `ctx.llm.stream(GenerateOptions)`；可选 `settings` 服务持久化自带 Key 模式 | 见 §5.5 |
| `setTimeout` 定时同步（期刊） | `ctx.timer.interval` / `ctx.timer.timeout` | 生命周期随插件 fiber 自动清理 |
| 对话内嵌 iframe 卡片（`routes/cards.js`） | `tool.call.toolview`（keyed，按工具名分发）+ 插件页面路由 | React 壳内嵌 iframe 指向插件卡片路由 |
| 订阅主动汇报（未完成的闭环） | `agent/session-start` / `agent/pre-step` 事件 | DSH 有事件可挂，闭环可补齐（§7.5） |
| 宿主主题 CSS 变量注入（`--bg-card` 等） | 客户端 `Theme.listTokens` + CSS 变量 | iframe 内页面同源，可直接读宿主变量（需验证继承方式） |
| 表面会话权限（surface session） | DSH 无 surface 概念；权限语义由工具定义 + 会话策略承担 | 见 §6 |

## 4. 核心架构决策：UI 载体

### 4.1 决策：iframe 复用（阶段 1–3），React 渐进融合（阶段 4+）

DSH 客户端没有"插件 iframe 工作区"插槽，但有：

- `webServer` 可提供**同源 HTML 页面路由**（`prefix` 路由 + node:http handler 自服务静态资源）；
- 实测 Web GUI 无 CSP 头，同源 iframe 嵌入无阻碍；
- 大量低替换风险插槽可承载入口：`sidebar.footer.action`、`conversation.session.header.actions`、`conversation.chat.turnTail`、`conversation.chat.assistant-actions`、`settings.section`。

因此：

1. **页面本体（文献中心 / 项目库 / PDF 阅读器 / 项目笔记）**：原封迁移 `assets/research.js`（~100 KB）与 `research.css`（~52 KB）为插件 `assets/`，由 webServer 路由提供完整 HTML 页面；客户端在插槽里注册入口按钮，点击后以**全屏 overlay**（`shell.overlay`）承载 iframe（或独立浏览器标签打开，备选）。
2. **对话卡片**：React 壳 + iframe（`tool.call.toolview` keyed 注册），卡片路由由插件 webServer 提供——与 OpenHanako 版 `cards.js` 的 iframe 卡片机制一致。
3. **设置页**：`settings.section` 注册"科研"分区（翻译设置、主题订阅管理、数据目录信息等），React 实现。
4. **渐进融合**：高频交互面（设置、对话卡片、工具栏）逐步 React 原生实现，大页面保留 iframe——避免一次性重写 150 KB 前端。

### 4.2 备选方案（记录，不采用）

- **A2 React 全量重写**：与宿主融合度最高，但 100 KB 原生 JS + 52 KB CSS 的重写工作量巨大，且丢失经过验证的双栏几何选区等复杂逻辑，风险高。
- **A3 独立标签页**：无 iframe 嵌套问题，但脱离 DSH 会话上下文，交互割裂，仅作 fallback。

### 4.3 页面与宿主的数据通道

- 页面（iframe 内）→ 宿主：同源 `fetch("/api/hana-research/...")`（spike 已验证同源 fetch 可用）。
- 页面 ↔ 会话上下文：**页面不做会话感知**（保持纯工具页面），需要会话数据时由宿主端注入查询参数或由 React 壳通过 `harness.handle` RPC 获取后 postMessage 传入。
- 多页面同步（阅读器 ↔ 项目笔记）：OpenHanako 版用 BroadcastChannel + localStorage；同源 iframe 下 BroadcastChannel 同样可用，**原样保留**。

## 5. 模块级移植映射

### 5.1 `lib/research-store.js`（核心，70 KB）→ `lib/store.js`

- schema v4 全部表与迁移逻辑原样保留（`projects` / `papers` / `project_papers` / `attachments` / `annotations` / `notes` / `research_audit_log` / `research_meta` / `translation_docs` / `journal_sources` / `journal_sync_log` / `topic_subscriptions`）。
- SQLite 驱动替换：`better-sqlite3` → `node:sqlite` `DatabaseSync`。
  - `prepare().get/all/run`、`exec`：**API 同名同语义**，直接替换构造。
  - `db.pragma('journal_mode = WAL')` 等：改为 `db.exec("PRAGMA journal_mode = WAL")`。
  - `db.transaction(fn)`：**node:sqlite 无内置事务**，写一个小兼容层：
    ```js
    function withTransaction(db, fn) {
      db.exec('BEGIN');
      try { const r = fn(); db.exec('COMMIT'); return r; }
      catch (e) { db.exec('ROLLBACK'); throw e; }
    }
    ```
    替换全部 `.transaction(...)` 调用点（约 8 处，先 grep 清点）。
- seed 数据、Markdown 汇总生成、审计（`auditAgentToolCall`）原样保留。
- 数据目录：`$DSH_HOME/plugin-data/hana-research/research.db` + `library/pdfs/`（内容寻址）+ `library/projects/<id>/project-notes.md` + `library/projects/<id>/translations/`。**与 OpenHanako 版（`.hanako-dev`）隔离**；迁移工具不在本方案范围（§8.6 未决）。

### 5.2 `lib/literature-search.js` + `lib/ai-search.js`

- 四源适配器（OpenAlex / Crossref / arXiv / PubMed）、统一模型、去重、降级：**原样迁移**；网络调用改全局 `fetch`（12 s 超时、150 ms 节流保留）。
- `ai-search.js`：`aiSummarizeSearch` 的 DeepSeek HTTP 调用 → **改走宿主 `ctx.llm.stream`**（provider/model 取 `agentDefaultModel.currentSelection()`），或保留"自带 Key → 直连 `api.deepseek.com`"模式（配置存 `settings`）。首选宿主复用；AI 失败降级逻辑不变。

### 5.3 `lib/pdf-import.js` + `lib/official-download.js`

- 安全下载链路（HTTPS 校验、白名单、重定向逐跳校验、超时、体积、PDF 签名、SHA-256、原子写）：**原样迁移**，网络层改全局 `fetch`。
- 白名单来源：manifest → 插件内常量数组（与 spike 无关，代码内维护）。

### 5.4 `lib/journal-sync.js` + `routes/api.js` 的定时器

- 同步逻辑（ISSN 过滤、近三期保留、清理、节流）原样迁移。
- 定时器：`startJournalSyncTimer` 的 `setTimeout` 链 → `ctx.timer.timeout`/`ctx.timer.interval`（首延迟 15 s + 24 h），disposer 由 fiber 自动清理，无需 `stopJournalSyncTimer` 手动导出。
- 防重入 `journalSyncRunning` 保留。

### 5.5 `lib/translation.js` + `lib/document-translation.js`

- OpenAI 兼容适配器：首选改为宿主 `ctx.llm.stream`（注意 `llm.stream` 是流式；翻译服务需要把流聚合成完整文本，或查 `llm` 是否有非流式封装——无则手写聚合）。
- 段级翻译缓存（30 天 TTL）、费用确认层、进度持久化：原样迁移。
- 配置：`translation-config.json` 文件 → **DSH `settings` 服务**（`settings.register<ns>('research.translation', schema)`）持久化；Key 只写不回显的策略保留。
- 宿主 pdfjs 依赖：见 §5.7。

### 5.6 `routes/api.js` → webServer prefix 路由

- 一个 `prefix` 路由 `kind: 'prefix', path: '/api/hana-research'`，handler 内按 `req.url` 分发（写一个小型 dispatch：method + path 模式匹配，参数从 `URL` 解析）。
- 全部业务 API（§HANDOFF 文档第 8 节清单）一一对应迁移：
  - 请求体：`readJson` 手写（`req` 上流式收集 body → JSON.parse）。
  - 响应：`sendJson` 助手（spike 已有）；文件流（PDF 附件 / 译文下载 / 笔记 Markdown）：`res.writeHead` + `fs.createReadStream().pipe(res)`，保留 Content-Type / Content-Disposition / nosniff / Cache-Control 语义。
  - 上传（`upload-pdf`）：解析 multipart body（手写或引入最小解析器）——**实现期风险点**，标注为验证项。
  - 错误映射：`withApiError` 的业务错误 → 统一 `{error, message, details}` JSON。
- `routes/workspaces.js`：页面壳路由（HTML 字符串 + assets 引用）→ webServer 路由 `kind: 'prefix', path: '/ui/hana-research'`。
- `routes/cards.js`：卡片页面路由 → `kind: 'prefix', path: '/ui/hana-research/cards'`。

### 5.7 PDF 渲染引擎（unpdf / pdfjs.mjs）

- OpenHanako 版通过 `require.resolve('unpdf')` 取 `pdfjs.mjs` 并经 `/api/pdfjs.mjs` 提供给浏览器；**DSH 环境没有 unpdf**。
- 方案：**把 `pdfjs.mjs` 及其 worker 资产复制进插件 `assets/vendor/pdfjs/`**（从 openhanako 的 `node_modules/unpdf/dist/` 提取），插件路由直接服务。宿主端文本提取（翻译）也加载同一份 pdfjs（ESM 动态 import 相对路径）。
- 这使插件**零外部 npm 依赖**（除 `@deepseek-ai/dsh-tools` 由 profile hoist 树解析，spike 已验证），规避 profile 依赖管理问题。
- 实现期验证：PDF.js 在 DSH Web 环境渲染真实 PDF（沿用 OpenHanako 的 Playwright 验证方法）。

### 5.8 `tools/*.js`（16 个工具）→ `ctx.tools.register`

- 工具定义（name/description/parameters/execute）：逐一声明迁移；`execute(input, ctx)` 的 ctx 依赖（`store`、`dataDir`）改为闭包注入。
- `tools/_shared.js`：`textResult`/`errorResult`/`runTool`/`agentInfo` 保留；`readAllowedPdfHosts` 改读插件常量。
- **权限模型迁移**（§6）：`sessionPermission: {readOnly: true}` → 读工具直接注册；`{kind: 'review'}` + `describeSideEffect` → 在工具执行内调用 `ctx.approval.request(...)`（或注册 `tools/pre-execute` 瀑布对写工具统一拦截确认），确认文案复用 `describeSideEffect` 的语义。
- 审计：写工具成功后 `store.auditAgentToolCall` 保留；来源信息（session/agent 身份）从工具执行上下文的 agent/session 获取。

### 5.9 `assets/research.js` / `research.css` / `research-companion.*` / `research-cards.js`

- 原样复制为插件资产，仅做以下适配：
  - API 前缀从宿主挂载路径改为 `/api/hana-research/...`；
  - iframe 宿主主题变量：OpenHanako 由宿主注入 `theme.css`；DSH 中 iframe 页面通过宿主传递主题（同源下可直接读 `document` 样式变量，或用 `Theme.listTokens` 查询后注入页面）——**实现期验证**；
  - 页面内跳转/深链接目标改为 DSH 会话入口（如"去对话查看"动作）。

## 6. 权限与安全模型

| 原语义 | 移植后 |
|---|---|
| 读工具自动执行 | `ctx.tools.register` 直接注册（读操作无状态变更） |
| 写工具 `kind: 'review'` + 用户确认 | `approval.request`（带 side-effect 摘要）或 `tools/pre-execute` 瀑布统一拦截；文案与"review"一致 |
| `research_audit_log` 审计 | store 原样保留；DSH 事件 `tools/result` 可选旁挂冗余记录 |
| 下载白名单 | 代码常量，保持"检索可及 ≠ 可下载"分离建模 |
| manifest 网络白名单 | 由 DSH 进程出站网络策略兜底；插件自身保持 HTTPS + 校验 |
| `full-access` 信任声明 | DSH 静态插件无此概念；写操作全部走确认 + 审计，不扩大隐式信任 |

## 7. 对话集成（相对原版的新增能力）

1. **对话内嵌卡片**：`tool.call.toolview` 按工具名注册 React 壳（检索结果 / 期刊更新 / 项目概览卡片），内部 iframe 指向插件卡片路由，保留原卡片的收藏/保存/导入内联操作。
2. **订阅主动汇报闭环**（原版缺口）：监听 `agent/session-start`（或 `agent/pre-step` 瀑布注入），当 `topic_subscriptions` 非空时在系统提示/首步注入"请汇报期刊同步新增匹配文献"的提示；`report_journal_updates` 工具保留为按需触发。
3. **入口与快捷操作**：`sidebar.footer.action`（"科研"入口）+ `conversation.session.header.actions`（当前会话"文献中心"按钮）+ `conversation.chat.assistant-actions`（回复后"查看文献"）。
4. **设置页**：`settings.section` 注册"科研（Hana Research）"：翻译配置、订阅管理、期刊源状态、数据目录展示。

## 8. 分阶段实施计划

每个阶段以可运行、可验证的增量收尾；阶段顺序按"先数据层 → 再页面 → 再 Agent 面"。

| 阶段 | 内容 | 验证标准 |
|---|---|---|
| **P0 包骨架 + 数据层** | 建 `dsh-hana-research` 包；store 移植（node:sqlite 兼容层）；`/api/hana-research/health` 路由 | `node --check`；health 200；WAL 库落盘；重启后数据仍在；schema v4 迁移测试 |
| **P1 文献中心** | 检索四源 API + 文献列表/收藏/保存 API + iframe 页面壳 + `sidebar.footer.action` 入口 + overlay 承载 | 真实检索返回；页面打开；同源 fetch 通；主题跟随宿主 |
| **P2 项目库 + PDF** | 项目/导入/上传 API；pdfjs 资产路由；阅读器页面；笔记 API + companion 页面 | 真实 Frontiers PDF 连续阅读 + 双栏选区回归（沿用 OpenHanako Playwright 方法） |
| **P3 Agent 工具层** | 16 工具注册 + 读写分级 + approval 确认 + 审计 | 工具列表可见；写工具触发确认；审计落库；工具单测 |
| **P4 AI 能力** | 翻译（宿主 llm）+ AI 检索解读 + 期刊同步（ctx.timer） | 真实翻译任务（若配置模型）；AI 解读降级路径；25 源同步 + 近三期保留测试 |
| **P5 对话集成** | 对话卡片（tool.call.toolview）+ 订阅主动汇报（agent/session-start）+ 设置页 | 工具调用出现卡片；订阅后新会话出现汇报提示；设置页可改配置并持久化 |

每阶段都跑：`node --check`、定向测试（store/检索/工具/同步）、真实数据回归、`git diff --check`；重要里程碑更新 `MEMORY.md` 与本文档。

## 9. 风险与未决问题

1. **multipart 上传解析**（P2）：webServer handler 需手写或引入最小 multipart 解析器——验证实现成本后决定（备选：上传改走 base64 JSON）。
2. **pdfjs 资产体积与加载**：`pdfjs.mjs` + worker 约数百 KB，随插件包分发；需验证 worker 在 DSH Web 下正确初始化（沿用 unpdf 的构建产物，不做自定义构建）。
3. **宿主 LLM 复用 vs 自带 Key**：`llm.stream` 为流式，翻译需聚合；`agentDefaultModel` 未配置时翻译/AI 解读自动降级——需与用户确认"翻译是否必须自带 Key 保证可用性"。
4. **iframe 观感融合**：overlay 全屏 iframe 与 DSH 原生 UI 的视觉/交互差异；主题变量继承需实现期实测（`Theme.listTokens` 提供 token 名，但 iframe 页面需宿主注入值）。
5. **静态插件迭代成本**：改静态包需重启 Harness；开发期用动态插件迭代，但动态插件不持久（重启丢失）——需约定"动态验证 → 静态落地"流程。
6. **数据隔离与迁移**：`.hanako-dev` 下的既有研究数据不自动迁移；迁移工具是否要做、何时做，需用户决定。
7. **工具确认 UX**：`approval.request` 的确认 UI 与 OpenHanako review 弹窗体验差异，需实现期验收。
8. **快捷入口命名冲突**：多个插件抢 `sidebar.footer.action` / `conversation.session.header.actions` 时按 order 排序——注册时选好 order 并文档化。
9. **订阅主动汇报的打扰控制**：注入提示要克制（仅当有未汇报匹配时），避免每会话骚扰。

## 10. 参考

- `openhanako-research-agent/plugins/hana-research/`（参考实现，v0.15.0 冻结）
- `openhanako-research-agent/docs/HANDOFF_TO_NEXT_TOOL.md`（功能与 API 清单）
- `dsh-research-spike/`（已验证的静态插件骨架：package.json 声明、宿主/客户端双面、安装流程）
- DSH Inspect Providers：`webServer` / `tools` / `llm` / `settings` / `timer` / `approval` / `agentDefaultModel`；客户端 `Slots.listSubTree`（sidebar.footer.action、shell.overlay、tool.call.toolview、settings.section、conversation.chat.turnTail 等）
- 事件目录：`agent/session-start`、`agent/pre-step`、`tools/pre-execute`、`tools/post-execute`、`tools/result`
