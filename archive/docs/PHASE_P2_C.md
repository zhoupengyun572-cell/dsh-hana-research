# P2 增强批次 C：相似文献 + 引文网络 + 期刊分组（2026-08-16）

按 `docs/PRODUCT_DESIGN.md` 路线图的 P2 第三批（L11 / L12 / L3），schema v10。

## 交付内容

### 相似文献推荐（L11）
- OpenAlex **related_works 端点已停用**（实测恒返回空）→ 按设计文档备选路线改走「关键词匹配」：
  - `relatedKeywords(paper)`：标题+主题词提取（英文停用词表 + 常见中文词去噪、去重、最多 6 词）
  - `GET /works?search={关键词}` 检索 → 排除自身（同 DOI / 同标题）→ 返回统一文献记录（可收藏）
- API：`GET /papers/:paperId/related?max=`（1–20）
- 前端：文献卡「相关」按钮 → modal（`networkWorkCard` 列表，含被引徽标、原文链接、一键收藏）

### 引文网络浏览（L12）
- 新模块 `lib/openalex-network.js`：`resolveOpenAlexWorkId`（落库 `openalexId` → `sourceId` → DOI 查询三级解析）、`fetchCitationNetwork`（主 work 的 `referenced_works` 批量拉取 + `cited_by_api_url` 被引一页）
- 降级：参考文献批量 / 被引拉取失败各自静默为空，互不阻断；新论文无引用数据时显示「暂无记录」
- API：`GET /papers/:paperId/citations?max=`（1–25）
- 前端：文献卡「引文」按钮 → modal（参考文献 / 被引文献两个 tab 切换，同样支持收藏）

### OpenAlex work id 落库（schema v9→v10）
- `papers.openalex_id` 列；`normalizePaper` 从 `openalexId` / openalex 源 `sourceId`（W 号）推导；两个 INSERT/upsert 均落该列（COALESCE 保留）；`rowToPaper` 暴露——引文/相似文献免二次解析

### 期刊分组视图（L3，schema v9）
- `journal_sources.region` 列（cn/intl）；25 个内置源标注 region（5 国内 + 20 国外）；`ensureJournalSources` 同步写入；自定义源默认 intl
- 前端：期刊更新条按「国内期刊 / 国外期刊」两组 `<details>` 折叠（折叠状态 localStorage 记忆）

### 网络健壮性（OpenAlex 配额制）
- 实测发现 OpenAlex 已切换**付费配额制**（免费 $0.1/天 ≈ 1000 credits，用尽返回 429，UTC 午夜重置）：
  - `fetchWithBackoff`：429 时 20s 长退避重试一次
  - 缓存提升至 30 分钟（引文/相似文献内容稳定）
  - 429 错误文案改为「请求次数达到每日免费额度上限（约 UTC 午夜重置）」
- 额度耗尽时各功能按既有降级路径呈现清晰错误，不白屏

## 验证

- 测试 **75/75**（工作区 66：store 12 + pdf-import 6 + tools 8 + ai 12 + enhancements 19 + network 9；profile compat 9）
- network 新增 9 用例：workId 三级解析、DOI filter 小写、related 关键词检索 + 排除自身、relatedKeywords 停用词/去重/限长、引文批量 + 被引、失败降级
- enhancements 新增 openalexId roundtrip（W 号落库 / 非 openalex 源 null / 显式字段优先）
- 实测（真网络）：citations 在经典论文上返回 6–12 条真实参考文献；related 返回 10 条相似文献（含被引 5110 的 COVID 经典文献）；OpenAlex 免费额度耗尽 → 429 文案准确、恢复后自动正常
- Playwright smoke（tests/smoke-p2c.mjs）：相关/引文按钮 1409、期刊分组折叠（可见 0/DOM 5）、引文 modal 12 条、相关 modal 10 条、零 JS 错误

## 待重启生效与回归

宿主侧（schema v9/v10、3 个 API、region 落库）需重启；前端资源 no-cache 已生效。

重启后人工回归：
1. 文献卡「引文」→ 参考文献/被引 tab（老论文有数据；新论文显示暂无记录）
2. 文献卡「相关」→ 相似文献列表 → 收藏一键入库
3. 期刊更新条国内/国外分组折叠（状态记忆）

## 已知限制

- OpenAlex 免费额度（$0.1/天）可能被期刊同步 + 检索耗尽，夜间 UTC 重置；若需更高配额需在 OpenAlex 配置付费 API key（插件暂未接入 key 配置）
- 相似文献为关键词检索（related_works 端点已停用），非语义向量推荐
- 引文网络仅一层（不递归展开）；被引端点对部分新论文缺失（OpenAlex 数据侧）
