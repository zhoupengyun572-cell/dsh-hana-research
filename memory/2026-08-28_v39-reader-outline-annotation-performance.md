# v39 里程碑：阅读器大纲、批注浮层与性能治理

时间：2026-08-28（Asia/Shanghai）

## 目标

完成阅读工作台 M4：阅读器大纲树、批注就地操作浮层、阅读器弹窗统一、主题持久化和缩略图性能治理。

## 已实现

- 左侧“目录”接入 EmbedPDF Bookmark API，递归展示 PDF 内置大纲、章节展开状态、页码与当前页高亮；无目录文档给出明确空状态。
- 画布批注选中后显示轻量浮层，支持直接改色、编辑评论和删除；Esc 或关闭按钮可退出。
- 删除批注、新建分类、编辑评论、分类/标签改名全部移除 `window.prompt/confirm`，统一使用阅读器模态组件；输入弹窗在分类管理层之上正确显示。
- 阅读器主题模式通过安全 localStorage 适配器持久化，受限存储环境自动回退；浅色模式跨刷新恢复已验证。
- 缩略图改为 IntersectionObserver 按需生成，保留可滚动占位、当前页态与 Blob URL 缓存，并在文档切换/卸载时释放 URL。
- 修复随本轮验收暴露的 EmbedPDF 2.x 页信息路径问题：页数与尺寸来自 `document.pages`，并随引擎状态更新。

## 验证

- `npm --prefix web run build`：通过。
- 全部 Node 测试：153/153 通过。
- 阅读器测试：13/13 通过（新增主题存储与书签工具测试）。
- 真实 Harness 动态端口：6857；健康检查 200，schema 19，releaseVersion 仍为 v38（本轮仅静态资产，无需重启加载后端版本号）。
- 真实 19 页 PDF：缩略图首屏仅生成 10 张，其余 9 张保持占位，滚动区域正常；控制台 0 error / 0 warning。
- 真实交互：无目录空状态、批注浮层、删除确认、评论输入、主题跨刷新恢复均通过。
- 截图：
  - `output/playwright/v39/v39-outline.png`
  - `output/playwright/v39/v39-thumbnails-lazy.png`
  - `output/playwright/v39/v39-annotation-peek.png`
  - `output/playwright/v39/v39-unified-dialog.png`
  - `output/playwright/v39/v39-input-dialog.png`

## 部署与恢复

- 已同步 `assets/reader-workbench.js|css` 到运行副本，静态资源直接生效。
- 同步前备份：`C:\Users\zhou\.codex\backups\dsh-hana-research\v39-20260828-104829`。
- Harness 原先未运行；本轮仅启动隐藏验收实例，没有关闭或重启用户正在使用的实例。
- 未修改数据库 schema、后端 API 或用户文献内容；验收后恢复原主题为“跟随宿主”、左右面板为原折叠状态。

