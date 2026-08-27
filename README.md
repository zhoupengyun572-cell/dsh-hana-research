# DSH Hana Research（@local/dsh-hana-research）

将 OpenHanako 版 HanaResearch（文献中心 / 项目库 / PDF 阅读与笔记）移植为 DeepSeek Harness 静态 Cordis 插件。

- 移植方案（历史）：`archive/docs/PORT_PLAN.md`
- 产品功能设计（历史）：`archive/docs/PRODUCT_DESIGN.md`
- **插件关键内容总览**：`docs/PLUGIN_OVERVIEW.md`
- **用户使用说明书（含工作流程图与功能树形图）**：`docs/USER_GUIDE.md`
- 阅读工作区（历史，EmbedPDF + Tiptap）：`archive/docs/PHASE_READER_WORKBENCH.md`
- 历史阶段文档/验证脚本/截图与临时产物：集中归档于 `archive/`（含 `archive/MANIFEST-历史档案清单.md`，记录原路径→归档路径映射）
- 第三方依赖与许可证：`THIRD_PARTY_LICENSES.md`
- 参考实现（已冻结）：`../openhanako-research-agent/plugins/hana-research/`（v0.15.0）

## 包结构

- `package.json` — `exports["./client"]` + `dsh.client.platform: "web"`
- `lib/index.js` — 宿主半：数据层初始化 + 业务 API + 页面/资产路由 + 期刊同步
- `lib/store.js` — 数据层（node:sqlite，schema **v19**：文献/项目/批注/逐句笔记/阅读状态/系统综述筛选/研究编码/风险偏倚/GRADE/引文）
- `lib/annotation-migrate.js` — 旧自研批注 → EmbedPDF 标准批注换算与序列化（纯函数）
- `lib/api.js` — REST API（检索/项目/批注/笔记/翻译/期刊 + v12 阅读工作区接口）
- `lib/exporters.js` — 原生 DOCX/PDF 项目笔记与 CSV/XLSX 证据矩阵导出（v29）
- `lib/pages.js` — `/ui/hana-research/*` 页面壳（文献中心/项目库/卡片/阅读工作区）
- `assets/research.js|css` — 原生 JS 单页应用（文献中心 + 项目库）
- `assets/reader-workbench.js|css` — **阅读工作区前端**（React + EmbedPDF + Tiptap，esbuild 构建产物）
- `assets/vendor/embedpdf/` — PDFium WASM + 简体中文 fallback 字体（自托管，无 CDN）
- `web/` — 阅读工作区**源码与构建**（React 18 + @embedpdf/react-pdf-viewer 2.15 + @tiptap 3.30，`npm run build` 输出到 assets/）
- `tests/*.test.mjs` — 数据层/API 测试；`web/tests/` — Markdown/引文节点测试

## 阅读工作区（v12）

三栏 Zotero 式文献阅读：左侧（目录/缩略图/搜索/批注列表，可折叠可调宽）· 中央 EmbedPDF（渲染/缩放/连续滚动/选择/高亮/下划线/删除线/便签/评论/自由文本/批注侧栏/深浅色/进度恢复/批注导入导出/导出带批注 PDF）· 右侧 Tiptap 文献笔记（标题/列表/任务/引用/代码/链接/表格/撤销重做/Markdown 导入导出/自动保存/字数/引文卡片一键跳回原文）。

入口不变：项目抽屉「打开阅读器」→ `/ui/hana-research/reader?projectId&attachmentId`。
旧官方 pdf.js viewer 保留为不可见回退：`/ui/hana-research/reader-legacy`（新模块稳定后清理）。

## 研究资料导出（v29）

- 项目笔记：Markdown、原生 `.docx`、内嵌中文字体的可搜索 `.pdf`
- 证据矩阵：UTF-8 BOM `.csv`、带冻结标题/筛选/语义列宽的原生 `.xlsx`、Markdown
- 原生文件由插件服务端生成，不依赖浏览器打印或伪装扩展名

## 系统综述筛选（v30）

- 每个项目独立维护纳入与排除标准，支持“标准名称｜操作性说明”
- 题录/摘要筛选与全文筛选分别记录：待筛选、纳入、待定、排除
- 排除必须填写理由，可直接选择项目排除标准；判断、理由与更新时间可追溯
- 证据页显示双阶段进度与最终纳入数；全文阶段在题录纳入/待定后开放
- CSV、XLSX 与 Markdown 证据矩阵同步包含两阶段结论及排除理由

## 自定义研究编码（v31）

- 每个项目可独立定义文本、数字、单选、多选、是/否五类证据字段，并设置操作性定义、必填状态与导出顺序
- 内置通用实证研究、系统综述/元分析、量表开发与验证三套模板；应用模板只更新草稿，保存后才生效
- 每篇文献在证据页折叠填写结构化编码，显示已编码数量和必填完成状态
- 删除已有编码值的字段默认被阻止，二次确认后才执行级联删除

## 质量评定与证据确定性（v35）

- 按具体结局保存 RoB 2、ROBINS-I 与心理学通用框架的领域判断和支持依据
- 双人评定分别保存 A/B 原始记录；分歧逐领域裁决，工具版本切换不会串用历史结论
- ROBINS-I V2 明确标注为 2025 草案；导出保留模板版本和完整审计链
- GRADE 按关键/重要结局记录升降级依据，区分系统建议等级与研究者确认等级
- 风险偏倚矩阵、GRADE 证据概况和完整 JSON 审计数据可直接导出
- Markdown、CSV 和 XLSX 证据矩阵动态追加项目字段；XLSX 额外生成“编码字典”工作表

## 安装（需重启 Harness 生效）

1. 备份 `C:\Users\zhou\.dsh\profiles\web\cordis.patch.yml`
2. 复制本包到 `C:\Users\zhou\.dsh\profiles\node_modules\@local\dsh-hana-research\`
3. `cordis.patch.yml` 追加：
   ```yaml
   - insert:
       - id: hana-research
         name: '@local/dsh-hana-research'
   ```
4. 重启 DeepSeek Harness（首次启动自动执行 schema v15 迁移；从 v14 升级前会自动保留 `.bak-v15-*` 快照，旧批注在新阅读器打开对应 PDF 时自动换算导入）

## 前端构建（阅读工作区改版时）

```powershell
cd web
npm install            # 首次：锁定版本依赖
npm run build          # esbuild 打包 → assets/reader-workbench.js|css + vendor/embedpdf/
npm run dev            # watch 模式
```

## 验证

- 数据层测试：`node tests/store.test.mjs` 等全部 `tests/*.test.mjs`（node:test，临时目录自动清理）
- 前端单元：`cd web; node tests/markdown.test.mjs`
- 重启后：`GET /api/hana-research/health` 应返回 `{ok:true, releaseVersion:"v31", schemaVersion:15, ...}`
- 数据目录：`$DSH_HOME/plugin-data/hana-research/research.db`（WAL，schema v15）

## 回滚

1. `cordis.patch.yml` 删除 `hana-research` 条目（还原备份）
2. 删除 `C:\Users\zhou\.dsh\profiles\node_modules\@local\dsh-hana-research\`
3. 重启应用。插件失败只会标记该 entry FAILED，不影响应用启动。
4. 数据回滚：schema v15 以新增表为主，旧表结构保留；如需回退，用迁移前快照 `research.db.bak-v15-*` 覆盖 `research.db`（先停服）。
