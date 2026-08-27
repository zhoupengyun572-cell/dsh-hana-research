# v38 里程碑：应用壳与客户端路由（SPA）

时间：2026-08-27（Asia/Shanghai）

## 目标

UI 客户端化第三阶段（M3）：激活沉睡的 .app-bar 顶栏体系，把"文献中心 ↔ 项目库"从整页跳转升级为无刷新客户端路由，补右键菜单。用户已授权自行重启 Harness。

## 已实现

- **常驻顶栏**：`.app-bar` 从死样式复活——品牌 mark+「文献研究台」、分段切换器、右侧命令面板/设置工具组（自 M1 的页眉位置上移，页眉动作区只留业务按钮）；sticky 毛玻璃；≤620px 隐藏标题文字。
- **SPA 路由**（纯客户端，服务端零改动）：
  - `navigateWorkspace()`：离开视图时收起抽屉/记忆滚动/保存筛选现场 → `document.startViewTransition(runSwap)` 形变过渡（reduced-motion 或不支持时直接切换）→ pushState 更新 URL
  - popstate 驱动前进/后退；`routeFromLocation()` 深链接兜底；模块级 `workspace` 改 let 成为路由事实源
  - 切换器为真实 `<a>` 锚点（复用 v21 休眠样式约定 aria-current），普通左键拦截路由化，Ctrl/Cmd/Shift/中键保留浏览器原生行为
  - MutationObserver 在每次视图重渲染后同步切换器选中态（顶栏随 innerHTML 整体重建，一次性调用会丢失标记——浏览器验收发现）
- **右键上下文菜单**：`openContextMenu(items)` 通用实现（menu-pop 视觉语言、光标定位视口钳制、外点/Esc 关闭、首项聚焦）；文献卡=在阅读器打开(有 PDF 时)/复制标题/复制 DOI，项目卡=打开详情/复制名称。
- 命令面板 goto-* 跳转改走 `navigateWorkspace`。

## 实施事故与教训

- 中途一轮"脚本拼装 research.js"因 shell 函数替换锚点切割不当产生函数头嵌套，引发作用域吞没：症状先是诡异的全测试 60-90ms 秒挂（模块加载成功但视图缺件），此前同族手法还产生过 49s OOM 级挂起。最终弃用增量手术，改为**确定性重建脚本**：所有代码段从可信快照按行切片取材、装配到 git HEAD 基线、每步锚点断言唯一命中（rebuild-v38.cjs 留档 backups 目录）。教训：对单文件大模块做结构性多段编辑时，必须用可重放的确定性装配，禁止手工字符串拼接叠加。

## 验证

- 全部 Node 测试：153/153（含更新后的切换器存在性/选中态断言）。
- Harness 冷启动验证：`E:\DeepSeekHarness\DeepSeek Harness\DeepSeek Harness.exe` 启动成功，健康端口动态发现=11609，releaseVersion=v38。
- 浏览器全流程验收（Chrome headless）：深链接直达 ✓ 切换器标亮 ✓ 三次内部导航 navigation entries 恒为 1（无整页重载铁证）✓ 抽屉切走自动收起 ✓ 后退回项目库 ✓ 右键菜单弹出与 Esc 关闭 ✓ Alt P ✓ 窄屏无溢出 ✓ 控制台 0 error/0 warning。
- 截图：`output/playwright/v38-literature-bar.png`（顶栏全景）、`v38-projects-bar.png`、`v38-drawer-with-bar.png`、`v38-context-menu.png`、`v38-narrow.png`。

## 部署状态

- 运行副本已同步 assets/research.js|css + lib/version.js（备份 `C:\Users\zhou\.codex\backups\dsh-hana-research\20260827-ui-v38-before\`）；lib/pages.js 本轮零改动。
- Harness 由本轮自行启动并保持运行（端口 11609 动态分配）。

## 下一步（M4 · v39）

阅读工作区客户端化：EmbedPDF 大纲树接入左栏目录 Tab、画布高亮就地 peek 浮层（改色/评论/删除）、5 处原生 prompt/confirm 样式化、toast 动画堆叠、主题偏好持久化、面板折叠过渡与缩略图性能治理。改 web/src 后需 npm run build 并重启生效。

---

## 补丁（同日 · 用户反馈驱动）

用户在真实宿主里指出顶栏切换器与 Harness 自带页签重复。查档确认 **v23 已裁决"外层只保留 Harness 自带文献中心/项目库/关闭，插件内不重复导航"**——本轮复活顶栏时误把内部切换器带了回来；此前 Playwright 直连插件 URL 验收，看不到宿主壳导致漏检。

### 修复

1. **嵌入态自适应**：新增 `HANA_EMBEDDED`（parent!==window 探测）；内嵌时 shell 不渲染工作区切换器（宿主页签为准），独立打开深链接时保留以保证页面可互切。
2. **安全存储层（顺带加固）**：双模式验证的探针暴露真问题——受限嵌入环境下裸 `localStorage` 访问抛 SecurityError 会中断模块求值、页面永远停在骨架屏。新增 `safeStorage` 包装器（探测可用性→拒绝时回退内存态），全文件 38 处直接存储调用统一改道。

### 验证补充

- 同源包装 iframe 模拟宿主：内嵌=无本地切换器+工具组保留 ✓ 直连=切换器在 ✓
- 截图 `output/playwright/v38b-direct-bar.png` / `v38b-embedded-bar.png`
- 全量测试 153/153。

### 流程教训（叠加此前的确定性重建）

**验收环境必须覆盖真实宿主嵌装形态**：纯直连截图看不见宿主 chrome，等于漏验半数集成面。后续里程碑（M4 起）浏览器验收需含一层"模拟宿主 iframe 用例"，并在方案阶段先翻 memory 检索同类裁决（v23 的重复导航裁定就在档案里）。
