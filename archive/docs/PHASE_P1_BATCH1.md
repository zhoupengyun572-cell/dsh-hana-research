# P1 增强批次 1：阅读状态/优先级、BibTeX 导出、自定义期刊、项目元数据、新文献徽标、续读（2026-08-16）

按 `docs/PRODUCT_DESIGN.md` 路线图推进 P1 高价值项（第一批）。

## 交付内容

### 数据层（schema v5，原地迁移）
- `papers` + `read_status`（unread/reading/read，默认 unread）+ `priority`（''/p0/p1/p2）
- `projects` + `project_type`（综述/实证研究/元分析/量表开发/课程作业）+ `status`（active/done/archived）
- `journal_sources` + `last_viewed_at`（新文献徽标依据）+ `is_custom`（自定义期刊源标记）
- `attachments` + `last_page` + `last_read_at`（阅读进度续读）
- 行映射（rowToPaper/rowToProject/journalSourceRow/attachmentRow）暴露新字段

### store 方法（lib/store.js）
- `setPaperStatus`（状态/优先级 + 审计）、`touchJournalViewed`、`addCustomJournalSource`（ISSN 去重 + 审计）、`setReadingProgress`（页码校验）、`updateProjectMeta`（类型/状态 + 审计）、`journalNewCounts`（每刊未读新文献计数：read_status=unread 且 created_at > last_viewed_at）

### 引用导出（lib/bibtex.js，纯函数）
- BibTeX：稳定 key（作者+年份+标题首词，批量去重加后缀）、LaTeX 特殊字符转义
- RIS：Journal Article 条目
- `exportCitations` 按格式分发、`exportFileName` 带日期

### API（lib/api.js，+8 路由）
- `PATCH /papers/:id/status` · `POST /papers/export`（BibTeX/RIS 文件下载）· `PATCH /projects/:id`（类型/状态）· `POST /journals/custom`（自定义期刊）· `POST /journals/:id/view`（查看标记）· `PUT /attachments/:id/progress`（续读）；`GET /journals` 返回 `newCounts`

### 前端（assets/research.js + research.css）
- 文献卡：阅读状态徽标（在读/已读）+ 优先级徽标（P0 红/P1 黄/P2 灰）+ 三个按钮（状态循环切换、优先级循环、单篇 BibTeX 导出下载）
- 状态筛选行（全部/未读/在读/已读）并入筛选逻辑与计数提示
- 期刊栏：「＋ 添加期刊」按钮（modal 填名称/ISSN/主题 → POST 创建）；每刊「新 N」徽标（newCounts）；点击期刊 chip 先标记已查看再筛选
- 项目抽屉：类型/状态下拉（即时保存 + 刷新项目列表）
- 阅读器：打开时从 `attachment.lastPage` 续读 + 标记「在读」；翻页节流保存进度（800ms）

## 验证

- 新增 `tests/enhancements.test.mjs` **11/11**：v5 迁移列、状态/优先级（含非法值保持）、自定义期刊（重复/空拒绝+审计）、查看标记、新文献计数（含已读归零）、进度（含页码校验）、项目元数据、BibTeX（转义/多条目/key 去重）、RIS、格式分发、key 稳定性
- 全套 **57/57**（store 12 + pdf-import 6 + tools 8 + ai 11 + enhancements 11 + compat 9@profile）
- Playwright smoke：状态筛选 4 chips、每卡 3 新按钮（1409 卡）、添加期刊 modal、零 JS 错误

## 待重启生效与人工回归

宿主侧（store/api）改动需重启；前端 assets 动态读取已生效（无新按钮的旧宿主下点击会 404，属预期）。

重启后人工回归清单：
1. 期刊栏显示「新 N」徽标；点击期刊 → 徽标归零
2. 文献卡状态切换：未读→在读→已读（筛选联动）；优先级 P0/P1/P2
3. 单篇「BibTeX」按钮下载 .bib 文件
4. 「＋ 添加期刊」添加一个 ISSN → 出现在期刊栏 → 立即更新可同步
5. 项目抽屉类型/状态下拉保存
6. 阅读器：读到第 N 页关闭，重开恢复到第 N 页；文献自动标「在读」

## 已知限制

- 新文献徽标基于 `created_at > last_viewed_at` 且未读；历史存量文献首次启动会全部视为「新」（点击期刊即归零）
- 自定义期刊源依赖 OpenAlex 收录（ISSN 过滤），未收录期刊同步返回 0 篇（与内置源同语义）
- 优先级/状态为轻量标记，无独立筛选视图之外的排序
