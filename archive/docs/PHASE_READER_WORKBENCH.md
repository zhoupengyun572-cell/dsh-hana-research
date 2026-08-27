# 阅读工作区 v12：EmbedPDF + Tiptap 三栏重构（2026-08-16）

以 EmbedPDF（PDF 阅读/搜索/批注引擎）替换自研 PDF 阅读器，以 Tiptap（文献级笔记编辑器）替换右侧简单笔记面板，形成 Zotero 风格三栏文献阅读工作区。UI 全部使用宿主 DSH 主题 tokens，随 Harness 主题实时变动。

## 架构

```
┌────────────────────────────────────────────────────────────────┐
│ 壳页面 /ui/hana-research/reader（pages.js renderWorkbenchShell） │
│   theme-bridge（宿主 tokens → :root，实时监听）                   │
│   reader-workbench.css / reader-workbench.js（esbuild 产物）     │
│   React 18 + @embedpdf/react-pdf-viewer 2.15 + @tiptap 3.30     │
├────────────────────────────────────────────────────────────────┤
│ PdfWorkspace（web/src/app.jsx）三栏                             │
│  左栏：目录占位 / 缩略图 / 搜索 / 批注列表（折叠+拖拽调宽+记忆）      │
│  中央：EmbedPDF（wasmUrl 自托管 + 字体自托管 + 自定义选择工具条）    │
│  右栏：Tiptap 笔记（引文卡片 node + 自动保存 + 保存状态）           │
├────────────────────────────────────────────────────────────────┤
│ 服务层（web/src/services.js）                                    │
│  Blob URL 生命周期 / 防抖保存队列（进度·批注·笔记，失败可重试）      │
├────────────────────────────────────────────────────────────────┤
│ API /api/hana-research（lib/api.js）                            │
│  reading-state / note-document / citations / annotations-v2 /    │
│  convert-legacy / explain（宿主模型）                            │
├────────────────────────────────────────────────────────────────┤
│ 数据层（lib/store.js，schema v12，SQLite）                       │
│  paper_reading_state / paper_note_documents / note_citations     │
│  annotations 新增 subtype + embed_pdf_data（EmbedPDF JSON）      │
└────────────────────────────────────────────────────────────────┘
```

## 数据结构（v12）

- **阅读状态** `paper_reading_state`：paperId 主键；currentPage / zoom / scrollMode / 左右栏宽与折叠 / updatedAt（原子 upsert，防抖保存）
- **文献笔记** `paper_note_documents`：paperId 唯一；title / tiptap_json（权威存储）/ markdown（镜像）/ 时间戳
- **引文** `note_citations`：noteDocumentId / annotationId / pageNumber / quotedText / prefix / suffix / **annotation_deleted**（批注删除时置 1：引文文本保留、定位标失效）
- **批注** `annotations`（复用表）：`subtype`（highlight/underline/strikeout/text/note/ink/…）+ `embed_pdf_data`（EmbedPDF AnnotationTransferItem JSON）+ 原 payload_json（旧格式）
- 原始 PDF **从不覆盖**；导出带批注 PDF 由 EmbedPDF 引擎生成新 Blob 下载

## 关键决策

- **前端框架**：引入 React 18 + esbuild 构建管线（原插件为原生 JS，无构建步骤；构建产物提交为静态资产，运行时零构建）
- **EmbedPDF v2.15**（稳定版；v3 开发中未用）：官方 npm 包集成，未魔改仓库；WASM（4.6MB）+ 中文字体自托管，`fontFallback` 配置本地字体，**零外部 CDN**
- **选择工具条**：基于 SelectionPlugin 的 `onMenuPlacement` 自绘浮层（高亮/下划线/删除线/评论/引用到笔记/复制/AI 解释）
- **批注持久化**：`exportAnnotations()`（AnnotationTransferItem JSON）→ 防抖全量保存；加载时 `importAnnotations()`；旧批注经 `percentRectToPdfRect`（y 轴翻转）换算为标准 PDF highlight 对象
- **引文闭环**：选中文本 →「引用到笔记」→ 创建高亮 + Tiptap 插入 citationCard 原子节点（保存 annotationId/pageNumber/quotedText）→ 点击卡片 `selectAnnotation + jumpToPage` 跳回原文
- **主题**：读宿主 body 上的 `--dsw-alias-*`（已实测 tokens 挂在 body 而非 html）→ 生成 EmbedPDF light/dark 覆盖 + 工作区 CSS 变量；MutationObserver 实时跟随；用户可强制 浅色/深色/跟随宿主 三模式
- **CSP**：工作区壳自带最小 CSP（`script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'` 等），不关闭 CSP，仅开放 EmbedPDF 必需权限

## 数据迁移

- schema v12 原地迁移（幂等）：新增 3 表 + annotations 2 列 + 旧批注 subtype 回填
- 迁移前备份：`research.db.bak-v11-<时间戳>`（VACUUM INTO 在线快照）
- 旧高亮批注在新工作区打开对应 PDF 时自动换算导入（页面尺寸取自引擎；失败项保留原样并在控制台/提示中报告，不丢弃）
- 旧阅读进度（attachments.last_page）在新模块读取（reading-state 为空时回退）；旧摘录笔记/项目汇总继续可用，旧 reader 保留为 `/reader-legacy` 回退

## 验证

- 数据层：`tests/reading-v2.test.mjs`（15 例：序列化/换算/状态/笔记/引文/幂等/中文路径/原子性）
- 前端单元：`web/tests/markdown.test.mjs`（6 例：Markdown 往返/中文标点/引文节点/跳转定位）
- 集成：`openhanako-research-agent/verify-workbench.mjs`（Playwright：打开中文名 PDF/搜索/高亮/批注列表/笔记自动保存/侧栏折叠记忆/主题/重开恢复）
- Harness 内验证：重启后核对 schema v12、新路由、WASM/Worker 加载、日志无异常

## 维护要点（详见最终汇报第 10 节）

- **改前端**：改 `web/src/*` → `cd web; npm run build` → 重新部署 assets（`ASSET_VERSION` 在 lib/pages.js 递增）
- **EmbedPDF 升级**：改 web/package.json 锁定版本 → npm install → build → 用 verify-workbench.mjs 回归；注意 wasm 与字体目录同步拷贝
- **Worker/WASM**：EmbedPDF worker 为运行时 Blob URL（module worker，自包含），WASM 经 `wasmUrl` 显式自托管；勿把 wasm 移出 assets/vendor/embedpdf/
- **CSP**：壳页面最小 CSP 已覆盖 EmbedPDF 需求；新增需要 eval/remote 的功能时按最小权限追加
- **批注格式**：数据库存 `AnnotationTransferItem[]`（`{ pageIndex, annotation, ctx? }`），annotation 为标准 PDF 批注对象（rect 左下原点、segmentRects 高亮 quads）；版本升级时用 `deserializeAnnotations` 校验
