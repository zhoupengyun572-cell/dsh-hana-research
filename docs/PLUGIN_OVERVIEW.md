# Hana Research · 当前插件关键内容总览（Overview）

> 面向维护者/使用者的「当前状态 + 目录索引」汇总；与 `docs/USER_GUIDE.md`（使用向）互补。
> 最后一版更新：2026-08-28（社区发布准备基线 0.4.0-beta.1）。

## 1. 一句话定位

面向心理学研究工作流的 DSH 静态 Cordis 插件：把「检索 → 导入项目 → PDF 精读 → 证据提取 → 论证构建 → 写作推进 → Agent 辅助」做成**本地优先、可追溯**的闭环。

## 2. 当前状态速览

| 项 | 值 |
|---|---|
| 包名 | `dsh-hana-research`（`dsh.bundle` → `cordis.patch.yml` → `lib/index.js`，client 平台 web） |
| 数据库 | SQLite WAL，schema 版本 **v19**（`$DSH_HOME/plugin-data/hana-research/research.db`） |
| 前端资产版本 | 与 `HANA_RELEASE_VERSION` 共用 **0.4.0-beta.1**（`lib/pages.js`，升级资源强制刷新缓存） |
| 自动化测试 | `tests/*.test.mjs` **158/158** 通过；`web/tests/markdown.test.mjs` **7/7** 通过 |
| 当前验证套件 | `tools/{button-audit, verify-cockpit, verify-evidence-closure, verify-shortcuts, walk-workbench-buttons}.mjs` |
| 部署目标 | 通过 `dsh plugin --profile web add dsh-hana-research` 安装到目标 Profile，并由包内 `dsh.bundle` 自动挂载 |

## 3. 顶层结构（当前在用的最小集）

```
dsh-hana-research/
├─ lib/           宿主：store.js(数据层) · api.js(REST) · pages.js(页面/资产路由) · index.js(装配)
│                 register-tools.js(20 个 Agent 工具) · reporting.js(订阅汇报) · client.js(桥接)
├─ assets/        research.js|css(文献中心+项目库 SPA) · reader-workbench.js|css(阅读工作区)
│                 research-companion.js(上下文伴生) · research-cards.js(对话卡) · vendor/embedpdf(自托管)
├─ web/           阅读工作区源码（React18 + @embedpdf/react-pdf-viewer 2.15 + @tiptap 3.30，esbuild 构建）
├─ tests/         *.test.mjs 自动化测试（node --test）
├─ tools/         运行时 Agent 工具(*.js) + 当前验证套件(*.mjs) + cleanup-temp-entities.mjs
├─ docs/          USER_GUIDE.md（使用说明+流程图） · PLUGIN_OVERVIEW.md（本文件）
└─ README.md · README.en.md · SECURITY.md · CONTRIBUTING.md · THIRD_PARTY_LICENSES.md
```

> `lib/`、`assets/` 和 `tools/*.js` 是运行必需；`web/` 是阅读工作区源码，`tests/` 与 `tools/*.mjs` 用于开发验证。

## 4. 功能能力矩阵

| 模块 | 入口/界面 | 关键能力 |
|---|---|---|
| 文献中心 | `/ui/hana-research/literature` | 四源检索 + AI 解读、保存检索/一键重跑/新结果提醒、期刊同步(内置+自定义)+AI 简报、收藏/集合、主题·状态·方法学筛选、文献角色状态/优先级/BibTeX·RIS/相似/引文、下载导入 |
| 项目驾驶舱 | `/ui/hana-research/projects`（抽屉三页签） | 概览(下一步卡 + 研究副驾驶 ≤3 建议 + 研究闭环 7 阶段) · 证据(文献卡/角色/论证链/证据矩阵) · 任务与笔记 |
| 阅读工作台 | `/ui/hana-research/reader?projectId&attachmentId` | 三栏(目录/缩略图/搜索/批注列表 · EmbedPDF · 逐句/汇总)；选区工具栏(复制/高亮/下划线/删除线/分节/逐句/引用到汇总/AI 解释)；进度记忆；导出带批注 PDF |
| 证据与写作 | 阅读器 → 项目 | 结构化证据卡(问题/方法样本/局限/章节) → 证据矩阵；逐句→汇总(引文=摘录+我的理解+分类标签，10 节模板)；论证关系(支持/反驳/被引用)；AI 综述草稿；全文翻译(译文子文档，段级缓存)；导出(Markdown/Word/PDF/RIS/BibTeX) |
| 研究任务 | 项目任务页 / Agent 工具 | 复用笔记标签(`研究任务/状态:*/优先级:*/截止:*`)，新增/优先级/截止/关联文献/完成重开/筛选 |
| Agent 协作 | 各处「交给 Agent」 + 副驾驶 | 20 个工具；只读可主动用，写入需确认+宿主审批+审计；接力进草稿由用户发送；project-overview/brief/news cards |
| 设置个性化 | 顶栏齿轮 | 专注模式、信息密度、动效强度(支持 prefers-reduced-motion)、默认项目、Agent 写策略、快捷键开关 |

## 5. 数据模型要点（schema v19）

- 核心表：`projects` / `papers` / `project_papers`(角色) / `attachments` / `annotations`(批注) / `notes`(项目笔记+任务) / `sentence_notes`(逐句笔记+结构化证据) / `paper_note_documents`(汇总笔记) / `note_citations`(引文) / `note_categories` / `note_tag_colors` / `paper_reading_state` / `paper_relations`(论证关系) / `saved_searches` / `collections` / `translation_docs` / `journal_sources` / `journal_sync_logs` / `topic_subscriptions` / `meta` + 审计表。
- 结构化证据存于 `sentence_notes.position_json.__evidence`（复用既有列，无独立迁移）。
- 任务与笔记共用一套 tags（`研究任务` 前缀体系），不建第二套存储。
- 升级前自动备份 `.bak-v<版本>-*` 快照。

## 6. 关键 REST API（前缀 `/api/hana-research`）

- 检索/期刊：`GET /search`、`/search/web`(含 AI)、`/searches`、`/journals`、`/journals/brief`
- 项目：`/projects`、`/projects/:id/papers|notes|relations|evidence-matrix|cockpit-stats`
- 阅读：`/projects/:id/reader/:attachmentId`、`/papers/:id/reading-state`、`/papers/:id/sentence-notes`(+PATCH/DELETE/relocate)、`/note-documents/:id/citations`、`/attachments/:id/annotations-v2`
- 能力探测：`GET /capabilities`（前端据此降级：宿主未重启时证据卡只读预览、驾驶舱客户端兜底统计）
- 导出：`/papers/export`(BibTeX/RIS)、`/projects/:id/notes/file`(Markdown)、`/attachments/:id/annotations-export`

## 7. 前端构建与部署

- 阅读工作区改版：`cd web && npm install && npm run build` → `assets/reader-workbench.js|css` + `vendor/embedpdf/`（自托管，无 CDN）。
- 资源版本：改版后递增 `lib/pages.js` 的 `ASSET_VERSION`。
- 前端资产免缓存磁盘读取：**刷新页面即生效**；`lib/`（数据层/新接口）需**重启 Harness** 生效。
- 同步：先备份 → 复制到部署目录 → SHA-256 校验一致。

## 8. Agent 工具与安全模式（20 个）

- 只读：get_research_context / get_project_brief / list_research_projects / list_project_tasks / search_literature / search_project_papers / read_project_notes / list_tags / list_subscriptions / get_reader_context / report_journal_updates
- 写入（均需确认 + 审批/审计）：save_search_result / add_paper_to_project / create_project_note / create_project_task / complete_project_task / edit_project_note / delete_project_note / subscribe_topic / unsubscribe_topic
- 原则：不把元数据当全文；引用证据保留标题/DOI/页码/标签；写操作必须显式确认。

## 9. 文档索引

| 文档 | 用途 |
|---|---|
| `docs/USER_GUIDE.md` | 使用说明书 + Mermaid 流程图/树形图 |
| `docs/PLUGIN_OVERVIEW.md` | 本文件：关键内容汇总 |
| `README.md` / `README.en.md` | 中英文安装、兼容性与隐私说明 |
| `SECURITY.md` / `CONTRIBUTING.md` | 安全边界、问题反馈与贡献约定 |
