# 第三方依赖与许可证清单（2026-08-25）

## 阅读工作区前端（web/，构建期依赖，运行时为打包产物）

| 依赖 | 版本 | 许可证 | 用途 |
| --- | --- | --- | --- |
| @embedpdf/react-pdf-viewer | 2.15.0 | MIT（npm 标注）/ Apache-2.0（仓库 v2 分支 README） | PDF 阅读器 React 封装 |
| @embedpdf/snippet | 2.15.0（传递依赖） | MIT（npm） | EmbedPDF 完整 viewer 实现（工具栏/侧栏/主题） |
| @embedpdf/core / models / engines / utils | 2.15.0 | MIT（npm） | 插件注册表、数据模型、PDFium 引擎编排 |
| @embedpdf/pdfium | 2.15.0 | MIT + `LICENSE.pdfium`（PDFium fork，Apache-2.0） | PDF 渲染引擎（WASM 4.6MB，自托管于 `assets/vendor/embedpdf/pdfium.wasm`） |
| @embedpdf/plugin-*（render/zoom/scroll/search/selection/annotation/thumbnail/export/i18n/ui 等） | 2.15.0 | MIT（npm） | 渲染/缩放/滚动/搜索/选择/批注/缩略图/导出等能力插件 |
| @embedpdf/fonts-sc | 1.0.0 | **OFL-1.1**（Noto Sans Hans） | 简体中文 fallback 字体（.otf 自托管于 `assets/vendor/embedpdf/fonts/`） |
| react / react-dom | 18.3.1 | MIT | UI 框架（打包进 bundle） |
| preact | ^10（EmbedPDF snippet 依赖） | MIT | EmbedPDF 内部组件层 |
| @tiptap/core / pm / react / starter-kit | 3.30.1 | MIT | 笔记编辑器核心、ProseMirror、React 绑定、基础扩展 |
| @tiptap/extension-underline / link / table / table-row / table-cell / table-header / task-list / task-item / placeholder | 3.30.1 | MIT | 下划线/超链接/表格/任务列表/占位符扩展 |
| @tiptap/markdown | 3.30.1 | MIT | Markdown 导入导出（基于 marked） |
| esbuild | 0.28.2（devDependency） | MIT | 前端构建 |
| happy-dom | ^20（devDependency） | MIT | 无头 DOM 测试环境 |

## 宿主/数据与导出层（Node）

- `node:sqlite`（Node 内置，实验 API）——数据存储
- `docx` 9.7.1（MIT）——原生 Office Open XML 项目笔记生成
- `exceljs` 4.4.0（MIT）——原生 XLSX 证据矩阵生成
- `pdfkit` 0.20.1（MIT）——内嵌中文字体的可搜索 PDF 生成
- `@deepseek-ai/dsh` / `dsh-tools` 0.1.0-rc.9（peer，安装期注入）

## 已移除的运行时依赖

- 旧自研 pdf.js 完整 viewer（`assets/vendor/pdfjs-app/`，Apache-2.0）——保留为不可见回退（`/reader-legacy`），新模块稳定后清理
- `assets/vendor/pdfjs-viewer/`（自研组件层回退壳，Apache-2.0）——同上

## 许可证声明落位

- EmbedPDF 与 PDFium 的版权声明随 npm 包分发（`node_modules/@embedpdf/*/LICENSE*`）；
- 自托管字体 Noto Sans Hans 遵循 SIL OFL 1.1（允许再分发，保留字体名）；
- 打包产物 `assets/reader-workbench.js` 内保留各包 LICENSE 头注释（esbuild banner 保留）。

> 注意：EmbedPDF 仓库根 README 标注 Apache-2.0，各 npm 包 package.json 标注 MIT；本插件按较宽松的 MIT 使用 EmbedPDF v2（稳定版），同时遵守 PDFium（Apache-2.0）与字体（OFL-1.1）的再分发条款。未引入 AGPL 或需订阅的 Tiptap Pro 功能。
