# HanaResearch 协作说明

## 项目定位

这是面向心理学研究工作流的 DeepSeek Harness 静态 Cordis 插件。核心链路是：
检索文献 → 保存/导入项目 → PDF 精读与证据笔记 → 跨文献综合 → Agent 辅助研究。

## 开发约定

- 中文沟通与中文界面优先，文件统一使用 UTF-8。
- 先给出短计划，再实施；每个可验证里程碑写入 `memory/`。
- 不把检索元数据误称为已阅读全文；Agent 引用本地证据时保留标题、DOI、页码与标签。
- 只读 Agent 工具可以主动使用；写入工具必须保留 Harness approval 确认与审计。
- UI 保持“温暖的学术编辑台”方向，跟随宿主主题，兼顾深色模式、窄屏和 reduced-motion。
- 修改阅读工作台源码后在 `web/` 运行构建，产物为 `assets/reader-workbench.js|css`。
- 布局相关交付必须在真实 Harness 页面截图检查；当前端口应动态发现，不要硬编码旧端口 1678。
- 工作区不是 git 仓库，不依赖 git 状态作为验证条件。

## 验证基线

- 全部 Node 测试：枚举 `tests/*.test.mjs` 后交给 `node --test`（Windows 下不要把目录名直接传给 Node）。
- 编辑器测试：`web/tests/markdown.test.mjs`。
- 真实页面：健康检查、阅读工作台冒烟、多尺寸文献中心菜单/横向溢出检查。

## 部署说明

- 开发目录：本目录。
- 当前开发运行副本位于 `$DSH_HOME/profiles/node_modules/` 对应的本地插件目录。
- 同步运行副本前先在 `$CODEX_HOME/backups/dsh-hana-research/` 建可恢复备份。
- 静态资源可由新页面直接读取；宿主工具、事件和系统提示变更需要重启 Harness，未经用户同意不要擅自关闭应用。
