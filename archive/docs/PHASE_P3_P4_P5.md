# P3–P5：Agent 工具层 + AI 能力 + 对话集成（已完成，2026-08-16）

## P3 Agent 工具层（16 个工具）

- `tools/`（16 个工具模块，从 OpenHanako 声明式工具层原样移植）+ `tools/_shared.js`（DSH 版：白名单常量、store 注入、审计来源）
- `lib/register-tools.js`：`ctx.tools.register(defineTool(...))` 注册器
  - 运行时名保留 `hana_research_` 前缀（如 `hana_research_list_research_projects`）
  - **写工具（7 个，`sessionPermission.kind === 'review'`）执行前经 `approval.request` 请求用户确认**——policy=ask 弹确认、never 自动拒绝（DSH 安全默认）；读工具（9 个）直接执行
  - 参数格式转换：原版标准 JSON Schema → dsh-tools 扁平格式（`lib/tool-utils.js`）
  - 结果转换：textResult → `{ text, ...details }`（模型可读）
  - 审计：写工具成功后 `store.auditAgentToolCall`，sessionId/agentId 取自 DSH 执行上下文（`exec.agent.id`）
- `lib/index.js`：inject 增加 `tools`、`approval`

## P4 AI 能力（宿主模型复用）

- `lib/host-llm.js`：公共宿主模型调用（`ctx.llm.stream` 聚合 text-delta；provider/model 取 `agentDefaultModel.currentSelection()`）
- `lib/ai-search.js`：AI 全网检索解读——原 HTTP 调 DeepSeek → 宿主模型；`extractJsonFromAi`/`normalizeAiRecommendations` 原样保留；失败降级（`aiError`）不阻断检索
- `lib/translation.js`：全文翻译——**不再需要 API Key**（宿主模型模式）；保留学术翻译提示词、段级 SHA-256 缓存（30 天 TTL）、语言配置（translation-config.json 仅存 sourceLang/targetLang）
- `lib/document-translation.js`：pdfjs（`assets/vendor/pdfjs.mjs` 服务端动态 import，`disableFontFace: true`）文本提取 → 分段 → 串行翻译 → Markdown 原子写入；进度写入 translation_docs
- API：`/search/web`（AI 解读已接通）、`/translate/config`（GET/POST）、`POST .../attachments/:id/translate`（启动，需宿主已配置模型，否则 403）、`GET /translate/document/:id`（轮询）、`GET /projects/:id/translations`、`GET /translate/document/:id/file`（下载）

## P5 对话集成

- **对话卡片**：`tool.call.toolview` 按工具名注册 React 壳（`hana_research_search_literature` / `hana_research_report_journal_updates` / `hana_research_list_research_projects`），渲染 iframe → `/ui/hana-research/cards/{search-results,journal-updates,project-overview}`；`assets/research-cards.js` 原样复用（apiUrl 前缀已改），卡片自拉数据、行内收藏/保存/导入
- **订阅主动汇报**（补上原版缺口）：`lib/reporting.js` 监听 `agent/session-start`，当存在主题订阅且期刊同步最近有新增时，在 agent 的 scoped ctx 上注册 `systemPrompt.section`（order 150）——提示模型主动调用期刊汇报/检索工具；同一 agent 只注入一次（WeakSet）
- 设置页（P1 已有）保持；主题桥覆盖卡片页面

## 验证

- 本地测试 **37/37**：store 12、pdf-import 6、tools 8（含 approval 前参数/结果转换、审计落库、真实四源检索工具）、ai 11（宿主 llm 聚合、JSON 提取/规范化、翻译分块/缓存、Node 下 pdfjs 真实 PDF 文本提取 15 页）
- 真实链路（本地）：四源检索、Emotion/心理学报同步（中文标题 46/46）、Frontiers 与心理学报官网 PDF 下载、pdfjs 文本提取
- 待重启验证：工具出现在模型工具列表（16 个）、写工具触发确认、`/search/web` 返回 AI 解读（宿主配置模型后）、翻译任务跑通、对话卡片渲染、订阅注入

## 已部署

41 个文件部署到 `profiles/node_modules/@local/dsh-hana-research/`。**需重启 Harness 生效**（宿主侧新代码 + 工具注册）。
