# P1 增强批次 2：标签管理、批注颜色、项目概览、阅读器目录（2026-08-16）

按 `docs/PRODUCT_DESIGN.md` 路线图的 P1 第二批次。

## 交付内容

### 标签管理（L14，schema 不变，tags_json 直接操作）
- store：`renameNoteTag(old, new)`（全局替换 + **同名自动合并** + 关联高亮 payload 同步 + 审计）、`removeNoteTag(tag)`（全库删除 + 高亮同步 + 审计）——修复了 SELECT 漏列 `annotation_id` 导致高亮不更新的 bug
- API：`GET /notes/tags`（聚合列表）、`POST /notes/tags/rename`、`POST /notes/tags/remove`
- 前端：文献中心「标签管理」按钮 → modal：每个标签显示色块/名称/使用数 + 改名输入 + 删除按钮 + 色板（8 色）；颜色存 localStorage（`hana-research-tag-colors`），改名时颜色随迁

### 批注颜色（P10）
- 摘录面板新增「高亮颜色」色板（6 色），选中后随摘录保存（`createSelectionNote` 的 color 字段）

### 项目概览（P2）
- 项目抽屉顶部概览条：`文献 N 篇 · 已读 X · 在读 Y · 笔记 N 条 · 最近活动日期`（前端从现有数据组装，无新 API）

### 阅读器目录（P9）
- 打开 PDF 时 `pdf.getOutline()` 加载目录；有目录的 PDF 显示「☰ 目录」按钮与左侧栏（与缩略图互斥）
- 递归渲染多级目录（缩进）；点击跳页（`resolveOutlinePage`：数组 dest / 字符串 dest → `getDestination` + `getPageIndex` 尽力解析）

## 验证

- 测试 **50/50 工作区**（enhancements 13/13 新增 rename 合并+高亮同步、remove）+ compat 9/9@profile = **59/59**
- 标签管理实测：2 条旧标签 → rename → 新标签 count=2；remove → 清空
- Playwright smoke：标签管理按钮/modal 打开、项目概览行渲染（"文献 1 篇 · 已读 0 · 最近活动 2026-08-16"）、零 JS 错误
- 阅读器目录：需真实 PDF 打开验证（有 outline 才显示按钮）

## 待重启生效

宿主侧（store rename/remove 修复 + 3 个标签 API）需重启；前端 assets 已动态生效（重启前调标签 API 会 404，属预期）。

重启后人工回归：
1. 阅读 PDF → 选中文字 → 摘录面板出现色板 → 选色保存 → 高亮颜色正确
2. 文献中心「标签管理」→ 改名（同名校合并）/ 删除 / 颜色设置 → 摘录颜色同步
3. 项目抽屉概览条显示已读进度
4. 打开带目录的 PDF（如教科书/学位论文）→ ☰ 目录侧栏 → 点击跳页

## 已知限制

- 标签颜色仅 UI 层（localStorage），不随数据库迁移；换机器/清缓存后颜色恢复默认
- 目录 dest 解析为尽力而为（部分 PDF 大纲结构异常时点击无效，不报错）
- 阅读器目录需 PDF 自带 outline（扫描版无）
