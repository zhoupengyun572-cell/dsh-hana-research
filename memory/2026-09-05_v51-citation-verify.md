# v51 引用核验（schema v22 + 双源审计 + AI 草稿即时核验）

时间：2026-09-05（Asia/Shanghai）

对应 `docs/OPTIMIZATION_PLAN.md` P0-2。定位：**审计，不是改写**——四态标记 + 逐字段冲突，绝不静默修正引用。

## 已实现

### schema v22（lib/store.js）

- `RESEARCH_SCHEMA_VERSION` 21 → 22（备份条件沿用 `>=14 && <22`，覆盖全部未发布跳段）。
- `citation_verifications`：`citation_id` UNIQUE（ON CONFLICT 更新 = 重复核验幂等）、四态 CHECK、`conflicts_json`/`sources_json`、FK 级联。

### 核验引擎（lib/citation-verify.js，新文件）

- `normalizeDoi`：去 URL/doi: 前缀、小写、去尾标点。
- `titleSimilarity`：归一化后字符 bigram Dice（中英文稳健）。
- `compareCitationFields`：题名 0.82 / 年份 / 期刊 0.6 阈值；**跨语言（CJK↔拉丁）不硬判**——中文刊的 Crossref/OpenAlex 记录常只收录英文题名，真机实测曾误报 mismatch，已改为上层转人工。
- `verifyPaperCitation` 四态：双源确认且字段一致 → verified；字段冲突 → mismatch；双源 404 → not_found（幻觉）；单源确认/网络不可达/无 DOI/**跨语言** → manual_needed（附 reason + 中文说明）。
- 404 识别兼容两种形态：`error.status === 404`（桩）与 `error.details.status === 404`（literature-search fetchJson 真实形态：SEARCH_SOURCE_HTTP_ERROR, status=502, details.status=404）——真机实测抓到。
- `verifySummaryCitations`（无状态，供 AI 草稿即时核验）：提取草稿中的 DOI（正则+归一化）与《题名》引用；DOI 逐条双源确认；题名先匹配本地库（精确+0.9 相似度），库外题名 → manual_needed（可能是库外真实文献，也可能是编造）。

### 落库与 API

- `store.replaceCitationVerifications(noteDocumentId, results)`：校验 citationId 归属（外来 ID 拒收）、upsert 幂等；`listCitationVerifications` 按 note document 列出。
- `POST /note-documents/:id/verify-citations`（逐引文核验+落库+counts）、`GET /note-documents/:id/citation-verifications`。
- `POST /projects/:id/summary` 增强：AI 草稿生成后**自动即时核验**，响应从 `{ text }` 变为 `{ text, citationReport }`（核验失败不阻塞草稿，citationReport=null）。
- `CitationVerifyError` 加入 withError 错误链。

### UI（assets/research.js|css）

- AI 综述草稿弹窗新增「引用核验」报告块：四态计数行 + 逐条徽标（已确认/字段冲突/未收录·疑似幻觉/需人工核对）+ 冲突明细（字段：库内 vs 在线）；标注「双源审计，仅标记不改写」。

### 设计取舍记录

- AI 综述草稿本身**无状态**（不落库，每次现生成），故草稿核验不落库、随响应返回；落库账本只针对汇总笔记的结构化引文（note_citations）。
- Agent 只读工具 `verify_note_citations` 未做（计划内，低优先），待办。

## 验证

- 新增 `tests/citation-verify.test.mjs` 8/8（全离线桩注入）：v22 表、DOI 归一化、相似度/字段冲突、四态全路径、summary 审计（幻觉 DOI not_found、库外题名 manual、库内题名 verified + matchedPaperId）、账本幂等/拒收外来 ID、无 DOI API 路径、跨语言转人工、fetchJson 404 形态。
- 全量 `node --test`：**207/207**。
- 真机（schemaVersion 22）：真实网络双源核验——真实中文文献 DOI → manual_needed（双源确认 + 中英题名提示）；幻觉 DOI → not_found。验收实例已停止。

## 留给后续的清单

1. 汇总笔记引文处的核验徽标 UI（阅读工作区 React 侧，需构建）+ Agent 只读工具 `verify_note_citations`。
2. AI 草稿生成 prompt 增强：要求模型输出 DOI（现靠文本里自带的 DOI 提取）。
3. P0-4 性能清账（0.5.0 最后一项）：API 路由样板收敛、`/papers` 旧契约、N+1、阅读器资产瘦身。
4. 阅读工作台「本文/全库」搜索双模式（P0-1 尾巴）。
