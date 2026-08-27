# 阅读器升级：官方 pdf.js PDFViewer 组件移植（2026-08-16）

按用户要求移植成熟开源方案解决 PDF 选中体验问题。放弃自研几何选区，改用 **Mozilla pdf.js 官方 PDFViewer 组件**（Chrome PDF 阅读器同源实现，Apache-2.0）。

## 背景：自研选区的缺陷

旧实现为自研「几何选区」：不依赖浏览器原生选区，按行 Y 轴近似过滤 + 字符比例估算裁剪 → 行高不齐/上下标/连字符时选中断开、串行。自研 PDF 渲染壳（页面拼接、懒加载、滚动）整体交互也不及官方组件。

## 方案：官方 PDFViewer 组件（v6.2.108）

- **资源**（`assets/vendor/pdfjs-viewer/`，共 5.5MB）：`pdf.min.mjs`、`pdf.worker.min.mjs`、`pdf_viewer.mjs`（官方 web 应用底层组件，文本选择/滚动/缩放/搜索均官方实现）、`pdf_viewer.css`、cmaps/standard_fonts/wasm（CJK 与高级渲染支持）、images
- **新页面** `/ui/hana-research/reader`（`lib/pages.js` renderReaderShell）：官方组件壳 + 自定义工具栏（返回/标题/翻页/缩放/搜索/高亮/笔记）+ 主题桥
- **桥接** `assets/reader-bridge.js`：
  - `globalThis.pdfjsLib` 先于 `pdf_viewer.mjs` 加载（模块顶层解构依赖）
  - `PDFViewer` + `EventBus` + `PDFLinkService` + `PDFFindController` 官方接线
  - 本地 PDF 字节加载（插件 API）→ `getDocument({ data, cMapUrl, standardFontDataUrl, wasmUrl })`
  - 续读移入 `pagesinit`（v6 在页视图就绪前设置页码会抛错）
  - 进度/在读状态自动写回
- **批注体系保留**：数据库 annotations 以覆盖层（`.hana-annotation-layer`，百分比定位随缩放自适应）渲染在官方页面上；点击查看/删除
- **摘录**：官方 textLayer 上原生选区（字符级精确）→ 预览高亮 → 弹窗（标签/颜色/笔记）→ 保存进数据库（覆盖层即时更新）
- **主题融合** `assets/reader.css`：pdf_viewer.css 变量映射宿主 tokens；官方 annotationLayer 放行指针（不挡 textLayer 选择）
- `openPdfReader` 改为跳转新页面；旧自研阅读器代码保留（不再入口）

## 关键坑（v6 适配）

1. `pdf_viewer.mjs` 模块顶层解构 `globalThis.pdfjsLib` → 先动态 import 库并设置全局
2. `container` 必须绝对定位（官方校验）
3. `currentPageNumber` 需在 `pagesinit` 后设置
4. 官方 `.annotationLayer` 默认接指针，遮挡 textLayer 拖选 → `pointer-events: none`
5. 搜索需显式创建 `PDFFindController` 传入

## 验证（Playwright，`tests/verify-viewer.mjs`）

- 19 页 PDF 加载、标题、初始缩放 100%、翻页/缩放正常、零 JS 错误
- 拖选：29 个字符级预览矩形、跨行摘录连续无串行（「…第 34 卷」+正文段落逐字精确）
- 保存摘录 → 笔记落库 OK → 覆盖层即时渲染 26 个批注矩形
- 笔记面板、批注点击/删除（API 同旧链路）
- 测试数据已清理

## 已知限制

- 官方链接注释（PDF 内嵌链接）因 annotationLayer 放行指针而不可点击（后续可按需恢复：检测点击坐标命中链接）
- 工具栏为自建紧凑版（无官方侧栏/缩略图）；如需可后续加
- 旧自研阅读器代码保留在 research.js（约 900 行），确认稳定后可清理

## 增补：官方完整 viewer 应用移植（v6，2026-08-16）

用户再次反馈体验问题并询问开源社区方案。调研结论：**开源社区最成熟的浏览器 PDF 阅读器 = pdf.js 官方完整 web viewer 应用**（Firefox 内置 PDF 阅读器本体，含 SelectionManager、高亮编辑器、侧栏/缩略图/大纲/搜索）。此前集成的是其组件层（PDFViewer），缺官方 UI 与选择管理。

**移植内容**：
- 从 mozilla/pdf.js GitHub release 下载 v6.2.108 dist（含完整 web viewer 应用），拷贝至 `assets/vendor/pdfjs-app/`（build + web + locale + cmaps，19.7MB，删 .map）
- `reader-app.html`：官方 viewer.html 改造（绝对化资源路径、注入主题桥与桥接脚本）
- `reader-app-bridge.js` 重写为普通脚本 + `webviewerloaded` 同步钩子（**关键时序**：viewer.mjs 顶层在 readyState=interactive 时立即 run，body 末尾的 module 永远晚于 run——官方扩展点是 webviewerloaded 事件，run(config) 前同步触发）
  - preferences 经 localStorage `pdfjs.preferences` 注入：annotationEditorMode=3（高亮）、enableHighlightFloatingButton=true
  - file 参数经 history.replaceState 注入（run 前）
  - 高亮 editor 增删经 MutationObserver 同步数据库（quote 从 textLayer 矩形反查、颜色转 hex、rects 百分比）
  - 已有批注覆盖层、阅读进度/在读状态、返回按钮、标题注入
- `reader-app.css`：官方 viewer.css 变量映射宿主主题 + 隐藏无关按钮（下载/打印/打开/搜索条等）+ 覆盖层/弹窗样式

**踩坑记录**：
1. viewer.mjs 自举时序（interactive 立即 run）→ webviewerloaded 钩子方案
2. `import './viewer.mjs'` 相对路径解析到错误目录 → 绝对 URL
3. 官方 viewer.html 的相对引用相对页面目录解析 → 全部绝对化
4. PowerShell `-replace`/`Set-Content` 修改中文 JS 会破坏 UTF-8 → 改用 edit/write 工具与 .NET UTF8 字节级操作
5. CSP（script-src 'self'）禁止内联脚本 → 主题桥改外链文件

**验证**（`tests/verify-full-viewer.mjs`）：19 页加载、返回按钮、官方高亮按钮、**官方高亮 editor 创建 → 数据库保存成功**（quote 逐字正确）、零 JS 错误。
