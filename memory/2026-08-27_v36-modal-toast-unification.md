# v36 里程碑：统一弹层与通知体系

时间：2026-08-27（Asia/Shanghai）

## 目标

UI 客户端化改版第一阶段（四阶段计划之 M1）：清除最重的"网页感"交互债——弹层碎片化、原生 confirm、三套 toast 并存、设置/命令面板无入口。

## 已实现

- **统一弹层工厂** `openModalLayer()`（assets/research.js）：注册表化生命周期；Tab 焦点圈闭；关闭后焦点还原到触发元素；遮罩点击关闭（pointerdown 位移阈值防拖拽误触）；入场自动聚焦 + aria role/label 兜底；`[data-modal-cancel]` 自动绑定。
- **31 处复制粘贴的 modal-layer 样板**全部迁移到工厂（三种文本变体 replace_all 机械替换）。
- **样式化对话框**：`confirmDialog()` / `choiceDialog()` / `promptDialog()`，替换全部 7 处原生确认（期刊订阅移除、标签删除、重复文献合并、收藏导出格式、编码字段强制保存、PRISMA 批次删除、GRADE 结局删除）。破坏性操作红色确认键 `.danger-primary`。导出 BibTeX/RIS 从"确定/取消二义"改为真正的双选一对话框，取消不再误选 RIS。
- **单一通知中心** `showHanaToast()`：底部居中堆叠（最多 4 条）、悬停暂停倒计时、info/success/error/action 四种语义色、内联动作按钮；原 showNotice / showReaderToast / showUndoToast 三个函数签名保留为薄封装，几十处调用点零改动；2 处直写 #notice 的遗留代码改为走中心。
- **孤儿入口修复**：页眉动作区常驻「命令面板」「设置」两个工具按钮（hr-head-tool）；命令面板快捷键 Alt P。
- **Esc 修复**：全局快捷键中 Esc 处理移到"输入中"守卫之前——弹层自动聚焦输入框后 Esc 仍能关层（浏览器验收发现的真实回归并已修复）。
- z-index 收敛：新增 `--research-z-modal(40)/--research-z-toast(70)/--research-z-menu(90)` 三个 token 并替换字面量；保持既有层级关系不变。
- 新组件样式（通知中心 / 对话框 / 页眉工具）与既有 token 体系一致；reduced-motion 由既有全局规则覆盖。

## 方法学边界

- 本轮纯前端交互层；未动 schema、API、数据语义。
- 命令面板保持现有 `.command-layer` 自绘实现，仅补入口与快捷键；其并入工厂推迟到 M3 导航壳阶段评估。

## 验证

- 全部 Node 测试：153/153 通过（含 ui-interactions.test.mjs 6 项——更新了 4 处断言以匹配有意的行为变更：页眉动作区子元素数、通知迁移后 toast 选择器、撤销提示类名）。
- 语法检查 research.js 通过；web/ 未改动，编辑器测试不涉及。
- 真实 Harness 页面验收（系统 Chrome + Playwright，端口 13015 动态发现）：
  - 页眉工具按钮 ×2 存在；点齿轮开设置弹窗焦点入层、Esc 关层、焦点还原按钮；
  - Alt P 打开命令面板；「更多→交给 Agent」触发底部堆叠 toast 截图确认；
  - 项目抽屉 → 证据页签 → PRISMA 弹层打开即聚焦；
  - 桌面 1440 与窄屏 430 均无横向溢出；
  - 浏览器控制台 0 error、0 warning。
- 截图：`output/playwright/v36-literature-desktop.png`、`v36-settings-modal.png`、`v36-command-palette.png`、`v36-toast-center.png`、`v36-prisma-modal-focus.png`、`v36-project-drawer.png`、`v36-literature-narrow.png`。

## 部署状态

- 运行副本已同步（backup → copy）：dev 的 `assets/research.js|css`、`lib/version.js` → `C:\Users\zhou\.dsh\profiles\node_modules\@local\dsh-hana-research\`。
- 静态资产每请求读盘（pages.js:336 readFileSync），新页面字节即刻生效；**Harness 尚未重启**，lib 模块驻留的 releaseVersion 仍报 v35——重启后翻 v36（重启需用户同意，未执行）。老浏览器会话建议 Ctrl+F5 一次以防 heuristic cache 旧 ?v35 资源。
- 回滚备份：`C:\Users\zhou\.codex\backups\dsh-hana-research\20260827-ui-v36-before\`（含同步前 research.js/css/version.js）。

## 实施教训

- 对 `openModalLayer()` 工厂做 replace_all 迁移时，把工厂自身函数体内的 createElement 两行也替换成了自递归调用——被既有的 happy-dom UI 测试当场拦下（journal/screening/coding 三组弹层打不开），定位后还原。教训：全量文本替换前应先排除新模式自身的定义域。

## 下一步（M2 · v37）

排版适度舒适化：字号阶梯 token 化（消灭 ≤10px 与半像素字号）、间距/圆角收敛到 space/radius token、~24 处硬编码浅色 hex 的深色模式补漏、清理死样式； RoB/GRADE 密排板块单独放宽。之后 M3 应用壳+SPA 路由、M4 阅读器大纲树+批注 peek。
