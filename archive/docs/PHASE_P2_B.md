# P2 增强批次 B：保存检索与提醒 + 方法学标注 + 文献角色（2026-08-16）

按 `docs/PRODUCT_DESIGN.md` 路线图的 P2 第二批（L6 / L10 / P3），schema v8。

## 交付内容

### 保存的检索与提醒（L6，schema v8 新表 saved_searches）
- 新表：`saved_searches`（name/query/sources JSON/per_source/filters JSON/alert_enabled/last_run_at/last_result_ids JSON/last_result_count）
- store：`saveSearch`（命名+校验+审计）、`listSavedSearches`/`getSavedSearch`、`updateSavedSearch`（改名/提醒开关）、`deleteSavedSearch`、`recordSearchRun`（记录结果 id 快照，计算相对上次的新增）
- API：`GET/POST /searches`、`PATCH/DELETE /searches/:id`、`POST /searches/:id/run`（实时四源检索 → 快照 → 返回 `{total, newIds, newCount, firstRun, papers}`）
- 前端：检索条「保存检索」按钮（命名 modal + 提醒开关）；「保存的检索（N）」按钮 → 列表（一键重跑 / 提醒开关 / 删除）；重跑后结果内新增文献按 `newIds` 高亮（`state.searchNewIds`），并提示「相较上次新增 N 条」；首次运行作为基线
- 提醒语义：开启提醒后，重跑时高亮新增文献并提示（不额外消耗模型额度）

### 方法学标注（L10）
- 迁移：`papers.methodology_json`（JSON 数组，≤12 个标签、每个 ≤24 字符，去重）
- store：`setPaperMethodology`（校验+审计），`rowToPaper` 暴露 `methodology`
- API：`PATCH /papers/:paperId/methodology`
- 前端：文献卡「方法学」按钮 → modal（预设研究设计 chip：实验/相关/纵向/元分析/质性/量表开发/干预研究 + 自定义输入，逗号分隔）；卡片元信息行显示方法学徽标；筛选行「全部方法学」chips 按标签筛选，计数提示含「方法学」

### 项目内文献角色（P3）
- 迁移：`project_papers.role`（core/background/method/compare/''）
- store：`setPaperRole`（校验+审计），`listProjectPapers` 返回 `role`
- API：`PATCH /projects/:projectId/papers/:paperId/role`
- 前端：项目抽屉每篇文献有角色徽标 + 下拉（未标记/核心文献/背景/方法参考/结果对比，即时保存）；抽屉顶部「全部角色」筛选行

## 验证

- 测试 **68/68**（工作区 59：store 12 + pdf-import 6 + tools 8 + ai 12 + enhancements 18；profile compat 9）
- enhancements 新增 3 个用例：`setPaperMethodology`（去重/校验/审计）、`setPaperRole`（设置/清空/校验/审计）、`saved searches CRUD + recordSearchRun`（首次基线/新增检测/改名/提醒开关/删除）
- 实测 API：schema 8；`/searches` CRUD 全通；`/papers/:id/methodology` 与 `/projects/:id/papers/:id/role` 全通
- Playwright smoke（tests/smoke-p2b.mjs）：保存检索按钮、方法学 modal 保存后徽标出现、筛选 chips、保存列表/提醒开关/重跑返回 24 条、抽屉角色徽标「核心文献」+ 角色筛选、零 JS 错误

## 待重启生效与回归

宿主侧（schema v8、3 组 API）需重启；前端资源 no-cache 已生效。

重启后人工回归：
1. 检索 → 「保存检索」→ 命名保存 → 「保存的检索」列表 → 重跑（首跑为基线，二跑提示新增）
2. 文献卡「方法学」→ 选预设/自定义 → 保存 → 卡片徽标 + 按方法学筛选
3. 项目抽屉 → 文献角色下拉 → 徽标变化 + 按角色筛选

## 已知限制

- 「新结果提醒」目前只体现在重跑高亮与提示；自动定时重跑/推送到会话汇报未做（可后续接 A5 周报）
- 方法学标注为文献级轻量标签，未与笔记标签体系统一（L14 统一标签系统留待后续批次）
- 角色筛选为抽屉内即时过滤，不持久化筛选状态
