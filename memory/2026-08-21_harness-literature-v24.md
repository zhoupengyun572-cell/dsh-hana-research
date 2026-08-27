# HanaResearch v24 · 主题安全按钮与紧凑文献中心

## 目标

- 修复 Harness 暗色主题下主按钮浅底白字、文字不可辨认的问题。
- 继续 v23 之后的下一阶段：让文献中心更接近 Harness 的紧凑无衬线工作台。
- 用户在观看网课，本轮不激活、不切换、不刷新 DeepSeek Harness 桌面窗口。

## 实现

- 主按钮不再假设 `--accent` 是深色：使用 `--research-ink` 与卡片背景混合生成主题安全的中性强调底色。
- 主按钮 hover/active 只做即时颜色与轻微按压反馈，不再上浮或发光。
- 文献中心加入 `native-literature-view`，统一 1180px 内容边界。
- 顶部 Agent 入口移入“更多”，页面头只保留一个低噪声操作入口。
- 空检索说明移除；搜索、库内筛选、期刊更新之间的间距压缩。
- 文献条目改为紧凑无衬线列表；取消衬线标题、卡片漂移、装饰线和逐条入场动画。
- 文献元数据与操作按钮缩小，窄屏时操作区自然换行。
- 下拉菜单仅保留 130ms、从触发器方向出现的轻微过渡；reduced-motion 下完全关闭。
- 资源版本更新为 `v24`。

## 验证

- `node --check assets/research.js`：通过。
- `tests/*.test.mjs`：112/112 通过。
- `web/tests/markdown.test.mjs`：7/7 通过；合计 119/119。
- 后台 Playwright 1440×900：文献中心与项目详情均无横向溢出。
- 模拟 Harness 深色主题、接近白色 accent：
  - “继续阅读 · 第 1 页”文字：`rgb(232, 238, 248)`。
  - 按钮背景：约 `rgb(44, 53, 65)`。
  - 截图中的白底白字问题已消失。
- 后台截图：
  - `output/playwright/hana-v24-literature-dark.png`
  - `output/playwright/hana-v24-project-dark.png`

## 部署

- 已同步到 `C:\Users\zhou\.dsh\profiles\node_modules\@local\dsh-hana-research`。
- 源码与运行副本 SHA-256 一致。
- 恢复备份：`C:\Users\zhou\.codex\backups\dsh-hana-research\ui-v23-before-v24-sync-20260821-234500`。
- 未触碰或重启用户当前的 Harness 窗口；下次重新打开科研面板时加载新静态资源。
