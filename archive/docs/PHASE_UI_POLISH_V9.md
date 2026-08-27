# UI 精修 v9：按钮分层 · 阅读器笔记面板 · 主题实时跟随（2026-08-16 第二轮）

承接 `PHASE_UI_POLISH.md` 的编辑排版风，本轮按用户反馈解决三个具体问题：
「UI 太粗糙 / 部分功能按钮融入背景」「笔记功能没有放进阅读器」「插件应随 Harness 界面主题变动」。

## 1. 按钮与背景明确分层（research.css + reader-app.css）

- **研究页（`assets/research.css` 末尾新增 UI 精修层 v9）**：
  - 默认 `.button`：描边加深为 `--research-line-strong` + 微渐变底 + 基础投影；hover 上浮 1px、accent 描边、`--research-shadow-2`
  - `.chip` / `.chip-small` / `.journal-source-chip`：统一带基础投影，hover 浮起；选中态保持 accent 内环
  - 阅读器回退壳 `.reader-tools button`：补描边与 hover 层级
  - 图标小按钮（modal/drawer/composer 关闭、更多）：统一 30px 圆底 + hover 圆底反白
  - 输入控件 hover 描边加深、focus accent 光环
- **官方阅读器（`assets/reader-app.css`）**：
  - `.toolbarButton` 全部补透明边框→hover 显边框+投影→active 下压，焦点环 accent
  - 官方 `--button-*` 变量加深对比；工具栏整体加底阴影
  - 「返回」按钮 accent 描边醒目化

## 2. 阅读器右侧笔记面板（reader-app-bridge.js / reader-app.css）

在官方 pdf.js 完整 viewer 右侧注入**可收起/展开的笔记面板**：

- **入口**：工具栏右侧「笔记」按钮（accent 描边 + 数量徽标）
- **面板**：右侧滑出 336px；顶部「AI 汇总」+ 收起按钮；下方笔记列表
- **每条笔记**：页码徽标、tag 圆点、引用块（quote）、正文、标签；操作「跳页 / 编辑 / 删除」
- **编辑**：就地展开表单（引用 / 正文 / 标签逗号分隔）→ `PATCH /projects/:id/notes/:noteId` 保存；同步覆盖层标题
- **删除**：优先走 notes 删除（级联清理关联高亮），面板与覆盖层同步移除
- **AI 汇总**：调 `/projects/:id/summary`，轻量 Markdown 渲染（标题/列表/引用/加粗/代码）显示综述草稿
- **收起/展开**：工具栏按钮切换；收起后右侧留 34px 竖条「笔记」把手可再展开；翻页只刷新计数不打断编辑
- **数据流**：高亮摘录保存/删除实时同步面板（selection-note 返回 `{ annotation, note }`）

后端配套（`lib/api.js`）：
- 新增 `PATCH /projects/:projectId/notes/:noteId`（content/quote/tags/pageNumber 部分更新，复用 `store.updateNote`，含标签规范化与审计）
- reader 接口 `notes` 改为 `store.listNotes(projectId, attachmentId)` —— 面板只显示**本 PDF** 的笔记

## 3. 主题实时跟随 Harness UI（theme-bridge.js + pages.js THEME_BRIDGE_SCRIPT v3）

原来只在页面加载时读一次父窗口 token，且读的是 `documentElement`——实测 **DSH 主题 tokens 挂在 `body` 上**，且存在多层 iframe 嵌套。v3 升级：

- **向上查找**：沿同源 parent 链找最近一个暴露 `--dsw-alias-*` 的文档（支持多层嵌套）
- **本地回退**：找不到宿主 tokens 时回退读取祖先已注入的本地变量（`--accent/--bg/--text/...`）
- **body 优先**：CSS 变量读 `document.body`（tokens 实际挂载处），`documentElement` 兜底
- **实时同步**：MutationObserver 监听宿主 `documentElement` 与 `body` 的 class/style/data-theme 变化，宿主切换主题（12 套）时**立即**重读并应用
- 自身 `DOMContentLoaded` 后重试一次，避免父文档 body 晚解析

`pages.js` 内联桥脚本（研究页壳用）与 `assets/theme-bridge.js`（官方 viewer 外链版，兼容其 CSP）保持同一逻辑。

## 附带修复

- **`reader-app.html` 文件头 4 个重复 BOM**（历次 PowerShell 处理叠加）导致浏览器把 CSP meta 解析进 body、head 失效 → 清理为无 BOM，消除 CSP 忽略告警
- 官方 viewer 工具栏各官方按钮补齐 hover/active/focus 状态，白色主题/深色主题下均与背景分层

## 验证

- 测试：新增 `tests/notes-update.test.mjs`（PATCH 路由 + reader notes 按附件过滤 + 空内容 400）；全部测试套件通过（store 12 / pdf-import 6 / ai 12 / tools 8 / network 9 / enhancements 22 / compat 9 / notes-update 1）
- Playwright iframe 验证（`openhanako-research-agent/verify-notes-panel.mjs`，真实 GUI 父页 + 真实最小 PDF）：
  - viewer 加载 1 页、笔记徽标计数 ✓
  - 笔记引用/正文/标签渲染 ✓、收起→把手→展开 ✓、编辑表单打开→取消 ✓
  - AI 汇总按钮 ✓
  - **主题注入**：父页 tokens (#13243E/#F4F8FD) → reader `--accent/--bg` 注入成功 ✓
  - **实时同步**：模拟宿主改 token → reader 立即跟随（#AA00BB/#112233）✓
  - 零 JS 错误 ✓
- store 层验证：selection-note 创建、listNotes(projectId, attachmentId) 过滤、updateNote 更新+annotationId 保留、deleteNote 级联删高亮 ✓

## 已知限制与后续

- host 端改动（api.js PATCH 路由、pages.js 桥脚本 v3）需**重启 DSH** 生效；assets（theme-bridge.js、reader-app.css、research.css、reader-app-bridge.js）已 no-cache 即时生效
- `ASSET_VERSION` 已 bump 至 **v9**
- 「AI 汇总」面板内耗时较长（模型调用），期间按钮禁用并显示加载态；失败可重试