# Milestone 4：研究驾驶舱 / 阅读→证据闭环 / 副驾驶 / 研究闭环 / 设置个性化

日期：2026-08-20

## 已完成功能

1. **项目研究驾驶舱**（`assets/research.js` 项目抽屉重构）
   - 抽屉从长列表升级为页签：概览 / 证据 / 任务与笔记，默认落在概览而非文献列表。
   - 概览顶部新增「下一步」卡片（可折叠、记忆折叠状态）：最重要的待推进任务、证据缺口、最近阅读位置、明确主操作（继续阅读 / 推进任务 / 精读补证据 / 上传 PDF）。
   - 证据页保留原文献列表、角色筛选、译文展开、证据矩阵与论证链；任务与笔记页收敛研究任务面板与项目笔记。
   - 首次打开优先呈现项目进度与下一步；「回到项目」自动重开抽屉并恢复原页签。

2. **阅读 → 证据闭环**（`lib/store.js` + `lib/api.js` + `web/src/app.jsx`）
   - 逐句笔记升级为结构化证据卡：研究问题/论点、方法/样本、局限、可用章节，存于 `sentence_notes.position_json.__evidence`（复用既有列，无需迁移，`Evidence` 经 `sentenceNoteRow` 回显）。
   - 卡片更多菜单新增：进入证据矩阵（→项目库自动重开抽屉并弹出证据矩阵）、建议创建任务（ConfirmDialog 显式确认后写 `研究任务/状态:待办/优先级:普通` 并关联 paperId）、建议论证关系（只交 Agent 出候选，不直接写入）。
   - 能力探测 `GET /capabilities`：宿主未重启时证据输入呈只读预览（带说明），避免旧宿主静默丢写入。

3. **Agent 副驾驶**（概览页，≤3 条可执行建议）
   - 数据驱动：逾期/高优先任务提醒、有 PDF 无笔记的证据缺口候选、今日推进顺序。
   - 每项建议带「查看依据（真实数据弹窗）/ 交给 Agent / 暂不处理（localStorage 记忆）」。
   - Agent 只生成拟执行计划；写操作一律用户确认 + 宿主审计（策略写入所有「交给 Agent」指令）。

4. **研究闭环可视化**
   - 研究问题 → 检索 → 候选文献 → 精读证据 → 论证链 → 任务 → 写作产出。
   - 每阶段显示真实数量 / 完成度；无法计算的阶段明确显示「尚未建立关联」，不伪造进度。

5. **设置与个性化**（顶栏齿轮，localStorage）
   - 专注模式（隐藏次要按钮）、信息密度（紧凑/舒适/宽松）、动效强度（跟随系统/减弱/标准，支持较快 reduced-motion）、默认项目（与文献中心目标项目联动 + 打开项目库自动展开）、Agent 写操作策略、快捷键开关。
   - 快捷键：Ctrl/⌘K 聚焦搜索、Alt 1/2/3 切页签、N 新建项目、Esc 关闭遮罩；表单补 sr-only / aria 标签。

## 新增/变更文件

- `lib/store.js`：`createSentenceNote/updateSentenceNote` 支持 evidence（position_json.__evidence）；`sentenceNoteRow` 回显 evidence；新增 `buildCockpitStats(projectId)` 聚合与 `hostCapabilities()`。
- `lib/api.js`：`GET /projects/:id/cockpit-stats`、`GET /capabilities`。
- `assets/research.js`：设置体系 + 页签抽屉（openProjectDrawer 重写）+ 下一步卡 + 副驾驶 + 研究闭环 + 读者返回证据矩阵联动；`assets/research.css`：对应样式与 reduced-motion/专注/密度。
- `web/src/services.js`：`getCapabilities` / `createProjectNote` / `getCockpitStats`。
- `web/src/app.jsx`：证据卡 UI + 三个闭环动作（置于 goBack 之后避免 TDZ）；`web/src/workbench.css`：证据卡样式。
- `lib/pages.js`：`ASSET_VERSION` v17 → v18。
- 测试：`tests/sentence-notes.test.mjs` 新增证据 + cockpit-stats 两组断言；`tests/notes-update.test.mjs` 新增 `/capabilities` 与 `/projects/:id/cockpit-stats` 路由级验证（createApiHandler 直驱路由表，不依赖重启）；`tests/ai.test.mjs` 下载超时 30s→60s（全量并发防抖）。
- 工具：`tools/verify-cockpit.mjs`（页签/下一步/副驾驶/闭环/设置）、`tools/verify-evidence-closure.mjs`（阅读→证据矩阵闭环）。

## 验证

- 插件测试 109/109；阅读器编辑测试 7/7（`web/tests/markdown.test.mjs`）。
- 无头真实宿主：文献中心菜单回归通过；`tools/verify-cockpit.mjs` 页签/下一步卡/副驾驶(2 条建议)/闭环 7 阶段/设置弹窗/专注模式全绿、零控制台错误；`tools/smoke-workbench.mjs` 挂载+registry 就绪+零错误；`tools/test-selection-flow.mjs` 全链路（选区→工具栏→逐句→汇总→引文）通过、清理无残留；`tools/verify-evidence-closure.mjs` 证据矩阵闭环通过。
- 修复：新增三个闭环 useCallback 原置于 `goBack` 之前导致 minify 后 TDZ（Cannot access 'Vi' before initialization），已移至 `goBack/leaveAnyway` 之后。
- 部署哈希：assets/research.js、research.css、reader-workbench.js/css、lib/store.js、api.js、pages.js 同步安装版并 SHA-256 一致。

## 部署与恢复

- 安装位置：`C:\Users\zhou\.dsh\profiles\node_modules\@local\dsh-hana-research`
- 备份位置：`C:\Users\zhou\.codex\backups\dsh-hana-research\2026-08-20-cockpit-workbench-v18`
- 需要重启宿主生效：`GET /capabilities`、`GET /projects/:id/cockpit-stats`、证据持久化 `position_json.__evidence`（重启前前端自动降级：驾驶舱用客户端兜底统计、证据输入只读预览，均不静默失败）。

## 下一步候选

- 重启宿主后复测：驾驶舱聚合统计（逐句笔记/写作产出/保存检索计数）、结构化证据保存与证据矩阵核对。
- 证据卡批量操作、证据矩阵表格优化、副驾驶「查看依据」内直接跳转定位。

## 增补：按钮全量体检与快捷键修复（同日晚）

- 定位并修复「部分按键不生效」根因：`applyHanaSettings()`（安装快捷键 + 应用专注/密度/动效）只在改动设置时被调用，**页面首次加载未执行** → 首次访问 Ctrl/⌘K、Alt 1·2·3、N、Esc 全部不生效，且保存的界面偏好不落地。已改为模块启动即 `applyHanaSettings()`。
- 新增工具：`tools/button-audit.mjs`（隔离临时项目 + 临时 local papers，逐按钮断言副作用并捕获异常，测后自清）、`tools/walk-workbench-buttons.mjs`（阅读工作台两遍按钮步行，含汇总编辑器态）、`tools/verify-shortcuts.mjs`（快捷键与保存偏好首访验证）。
- 体检覆盖并全绿：文献中心（顶部动作/三组纸片/管理菜单/保存检索含空词守卫/纸卡 9 类按钮）、项目库（新建/交给Agent/抽屉三页签全部按钮含证据矩阵/导出/角色/关系增删/任务/笔记/下一步卡/副驾驶/闭环）、设置弹窗、阅读工作台 15 次控制点击零异常、快捷键首访即生效（双页 Ctrl+K / N / Alt1·2·3 / Esc）、保存偏好首访即应用（专注/密度/减弱动效）。
- 澄清非缺陷：`保存检索` 在无检索词时报错提示是正确守卫；专注模式隐藏次要按钮是设计行为。
- 顺带修复自制造问题：button-audit 首轮泄漏 5 个临时项目 → 清理至基线，`cleanup-temp-entities.mjs` 扩展临时命名（UI 验证项目-临时/UI 按钮体检-临时/UI 工作台按钮-临时），审计/步行工具均自删种子。
- 复验：插件测试 109/109；button-audit 与 verify-cockpit 零失败零控制台错误；`research.js` 同步安装版哈希一致；DB 无临时残留（projects=2, papers=1410）。
