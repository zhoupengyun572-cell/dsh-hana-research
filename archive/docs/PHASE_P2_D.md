# P2 增强批次 D：论证链 + 证据矩阵 + 跨文献笔记 + 导出扩展（2026-08-16）

按 `docs/PRODUCT_DESIGN.md` 路线图的 P2 第四批（P5 / P4 / P11 / P8），schema v11。**P2 至此全部完成。**

## 交付内容

### 文献关系 / 论证链（P5，schema v11 新表 paper_relations）
- 新表：`paper_relations`（from/to 文献 + relation: supports/refutes/cites + note，FK 级联删除）
- store：`addPaperRelation`（校验：两篇都须在项目内、非自身、关系合法、同对同关系去重；审计）、`listPaperRelations`（带双方标题）、`removePaperRelation`
- API：`GET/POST /projects/:id/relations`、`DELETE /relations/:id`
- 前端：项目抽屉每篇文献卡「关系」按钮 → modal（来源文献 + 目标文献下拉 + 关系类型支持/反驳/被引用 + 备注）；抽屉「论证链」区列出关系（A 支持 B）可删除

### 证据矩阵（P4）
- store：`buildEvidenceMatrix` —— 项目文献 ×（设计=方法学标注、角色、笔记数、笔记摘要（引文+内容拼接）、标签）+ 论证链文本
- API：`GET /projects/:id/evidence-matrix`
- 前端：抽屉「证据矩阵」按钮 → modal 表格（sticky 表头、滚动）+「导出 CSV」（UTF-8 BOM，Excel 兼容）/「导出 Markdown」

### 跨文献笔记（P11，schema v11）
- `notes.linked_paper_id` 列；`createNote` 支持 `linkedPaperId`（校验文献存在）；`listNotes`/`noteRow` 暴露 `linkedPaperTitle`；项目 Markdown 汇总含「关联《…》」
- API：新增项目级笔记创建 `POST /projects/:id/notes`（无附件）；附件级创建透传 linkedPaperId
- 前端：抽屉「项目笔记」区 —— 新建表单（textarea + 关联文献下拉 + 保存）、笔记列表（来源/页码/关联徽标 ↔/标签/删除）

### 导出扩展（P8）
- 抽屉「导出笔记」按钮 → 三选：
  - **Markdown**：走既有 `/notes/file` 下载
  - **Word（.doc）**：Markdown → 最小 HTML 转换 → Word 兼容 HTML 文档（`.doc` 可直接打开）
  - **PDF**：新窗口渲染打印样式 → `window.print()`（用户选「另存为 PDF」）
- 通用工具：`downloadBlob` / `safeFileName` / `mdToHtml`（标题/引用/列表/分隔线/粗斜体/行内代码）

### 附带：文献纯元数据加入项目
- store `addPaperToProject`（幂等）+ `POST /projects/:id/papers` —— 已保存文献不下载 PDF 也可加入项目（验证 P5 的前提，也补全产品路径）

## 验证

- 测试 **78/78**（工作区 69：store 12 + pdf-import 6 + tools 8 + ai 12 + enhancements 22 + network 9；profile compat 9）
- enhancements 新增 3 用例：`paper relations`（增删查 + 5 项校验 + 审计）、`cross-paper notes`（关联校验/暴露/Markdown 含关联）、`buildEvidenceMatrix`（角色/设计/笔记聚合/标签/论证链）
- 实测 API：relations 创建/列表、evidence-matrix 3 篇聚合、跨文献笔记 linkedTitle
- Playwright smoke（tests/smoke-p2d.mjs）：关系 modal 保存 1→2 条、笔记 2→3 条 + 关联徽标、证据矩阵 3 行 + 论证链 + CSV/MD 按钮、导出三选项、零 JS 错误
- smoke 测试数据已清理（关系/笔记）

## 待重启生效与回归

宿主侧（schema v11、4 组 API）需重启；前端资源 no-cache 已生效。

重启后人工回归：
1. 抽屉文献「关系」→ 标注 → 论证链区出现并可删除
2. 「证据矩阵」→ 表格 + 导出 CSV（Excel 中文正常）/ Markdown
3. 抽屉「项目笔记」→ 新建（可关联文献）→ 列表显示 ↔ 徽标
4. 「导出笔记」→ Markdown / Word（.doc 可打开）/ PDF（打印预览）

## 已知限制

- Word 导出为 Word 兼容 HTML（非原生 .docx 二进制）；如需原生 docx 需引入依赖库（细节优化阶段评估）
- PDF 导出依赖浏览器打印（headless 场景不可用，属人工导出路径）
- 证据矩阵按「文献 × 笔记」聚合，暂不支持用户自定义研究问题列（可后续扩展）
