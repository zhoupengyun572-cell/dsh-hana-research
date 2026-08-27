# v37 里程碑：排版舒适化与主题适配

时间：2026-08-27（Asia/Shanghai）

## 目标

UI 客户端化第二阶段（M2）：按用户选定的"适度舒适"方向治理字号体系，修补深色模式破绽，收敛圆角 token。

## 已实现

- **字号阶梯**（research.css 全库 sed 批处理）：
  - 7 / 7.5 / 8 / 8.5 / 8.8 / 9 / 9.5 / 10 / 10.5px → **11px**（约 190 处声明，最低可读字号确立）
  - 半像素取值清零：11.5→12、12.5→13、13.5→14、15.5→16
  - 字号规格从 20 种收敛为 16 种（其余为大标题离散档，保留）
- **重点阅读面升档**：阅读抽屉笔记正文与 AI 简报 pre 正文 12→13px。
- **v35 质量评定编辑器放宽**：RoB/GRADE 编辑器容器 padding 与行间距整体 +2~4px 档（rob-editor-form、rob-domain-editor、grade-meta-grid、grade-domain-editor、quality-reviewer-switch）。
- **深色模式补漏**（原 ~24 处硬编码浅色 hex）：
  - RoB 交通灯四态、GRADE 确定性四级：改为 `color-mix(语义色相 × var(--research-card))` 底 + `color-mix(色相 × var(--research-ink))` 文字——随宿主深浅色自动适配（浏览器强制深色截图验证通过）
  - `.task-priority.高` → danger/danger-soft token；重复文献绿色系文字 #326b4c → `var(--research-ok)`；选择浮层中性灰 #777168/#666b70/#817c74/#4c5259 → `var(--research-muted)`；.pdf-page-wrap.pending 底色 → card token
- **圆角收敛**：13 种散值（3/4/5/7/8/9/11/13…）折叠到四个既有 token（radius 6 / control 8 / lg 10 / card 12），234 处 border-radius 声明完成 var() 化；999 药丸、50% 圆形、2px 书脊发丝角作为语义特例保留。
- **链接型按钮修复**：新增 `a.button { color: ink; text-decoration:none }`，导出下载链接不再显示浏览器默认蓝色下划线（验收截图中发现）。
- gap/padding 的全量数值收敛评估后**主动推迟**：全库机械替换 wrap 风险高收益低，留给 M3 应用壳重建时在新组件中执行 token 纪律。

## 实施事故与修复

- grade-1 替换串中误输入中文字符产生非法 hex `#80302六`，当轮 grep 自检发现并修正为 `#82352b`；随后用非 ASCII 十六进制全文扫描确认无同类污染。

## 验证

- 全部 Node 测试：153/153 通过（纯 CSS + version.js 变更）。
- 浏览器验收（Playwright + 系统 Chrome，端口动态发现=5493）：0 console error/warning；窄屏无横向溢出；无问题项。
- 截图对比确认：`output/playwright/v37-literature-desktop.png`（浅色舒适化）、`v37-quality-light.png`（质量评定台放宽后）、`v37-quality-forced-dark.png`（语义色深色自适应）、`v37-literature-dark.png`（深色全页）、`v37-projects-desktop.png`、`v37-literature-narrow.png`。

## 部署状态

- 运行副本已同步 research.css + lib/version.js（备份：`C:\Users\zhou\.codex\backups\dsh-hana-research\20260827-ui-v37-before\`）。
- Harness 在 M1 与 M2 之间被外部重启过一次，当前健康端口 **5493**（再次强调动态端口勿硬编码）；重启前健康检查仍报 v36，静态资产 v37 即时生效。

## 下一步（M3 · v38）

应用壳：激活 .app-bar 常驻顶栏（品牌+工作区切换器+命令面板+设置）、SPA 路由化（两页面无刷新切换 + View Transitions）、右键 context menu。该阶段动 lib/pages.js 页面壳与研究页架构层，需要重启 Harness 生效（届时征求用户同意）。
