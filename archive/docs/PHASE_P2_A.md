# P2 增强批次 A：被引计数 + AI 期刊简报 + AI 综述草稿（2026-08-16）

按 `docs/PRODUCT_DESIGN.md` 路线图的 P2 第一批次，AI 功能全部走宿主配置模型（`agentDefaultModel` 选中项 → `ctx.llm.stream`），无独立 API key。

## 交付内容

### OpenAlex 被引次数（L7，schema v7）
- 迁移：`papers.cited_by_count INTEGER`（v6→v7，`ALTER TABLE ... ADD COLUMN` 幂等）
- store：`normalizePaper`/`rowToPaper` 暴露 `citedByCount`；`upsertSearchResult` 与 PDF 导入两个 INSERT/upsert 均含该列，重同步时 `COALESCE` 保留旧值
- 检索：`literature-search.js` 的 OpenAlex 映射带 `cited_by_count`，`normalizeRecord` 统一输出 `citedByCount`（非法/缺失 → null）
- 期刊同步：`journal-sync.js` 在同步 OpenAlex 文献时同步被引数（变化时更新）
- 前端：文献卡元信息行新增「被引 N」徽标（`.paper-cited`，仅 `citedByCount > 0` 时显示）

### AI 期刊简报（P2）
- API `POST /journals/brief`：汇总同步状态（源数/异常数）+ 最近 12 条同步日志 + 最近 30 篇期刊文献清单 → 宿主模型输出 120–200 字中文简报
- 前端：期刊更新条新增「AI 简报」按钮 → modal（`.journal-brief-text` 预格式化文本，失败显示原因）

### AI 综述草稿（P2）
- API `POST /projects/:projectId/summary`：项目文献清单 + 至多 80 条笔记（含文献标题/页码/标签）→ 宿主模型生成 Markdown 综述草稿（背景/发现/方法/争议/下一步）；无笔记无文献时 400「SUMMARY_EMPTY」
- 前端：项目抽屉新增「生成综述草稿」按钮 → modal（复用简报文本样式）

### 宿主 LLM 链路修复（关键）
排查中修正两处真实接口契约问题（对齐 `dsh-llm` 源码）：
1. `finish.reason` 是**对象** `{ kind: 'stop'|'tool-calls'|'max-tokens'|'aborted'|'error', failure }`，不是字符串 —— 原字符串比较导致所有失败被静默吞掉；现按 `kind` 判断并透出 `failure.message`
2. `messages[].content` 必须是 **ContentBlock 数组**（`[{ type: 'text', text }]`），不是裸字符串 —— 原调用抛 `content.some is not a function`
- `api.js` 的 `withError` 补挂 `HostLlmError`（此前 LLM 失败一律 500 INTERNAL_ERROR，现返回 502/503 与具体 code/message）

## 验证

- 测试 **62/62**（工作区 53：store 12 + pdf-import 6 + tools 8 + ai 12 + enhancements 15；profile compat 9）
- enhancements 新增 `citedByCount roundtrip`：落库/重启重读/缺失为 null/COALESCE 保留旧值
- ai 新增 content-block 与对象 finish reason 断言（回归保护）
- 实测：`/papers` 1409 篇中 1023 篇带 `citedByCount`；`/journals/brief` 与 `/projects/:id/summary` 端到端返回真实中文结果（宿主模型）
- Playwright smoke（tests/smoke-p2a.mjs）：被引徽标 161 个、AI 简报按钮 + 真内容、项目抽屉综述草稿按钮 + 真内容（无笔记项目正确拒绝编造）、零 JS 错误

## 待重启生效与回归

宿主侧（schema v7 迁移、两条 AI 路由、withError 修复、被引同步）需重启；前端资源 no-cache 已生效。

重启后人工回归：
1. 文献卡显示「被引 N」（OpenAlex 来源文献）
2. 期刊更新条「AI 简报」→ 弹出中文简报
3. 项目抽屉「生成综述草稿」→ 弹出 Markdown 草稿
4. 无笔记项目点草稿 → 提示「项目还没有笔记或文献」

## 已知限制

- 被引数只在同步/检索时更新，不单独定时刷新
- 简报/草稿为一次性生成，无流式打字效果与停止按钮（可后续加）
- 若宿主未配置模型：两条 AI 路由返回 503 `LLM_NO_MODEL`，前端 modal 显示失败原因而非白屏
