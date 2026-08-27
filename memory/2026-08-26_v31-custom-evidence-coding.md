# v31：自定义研究编码与证据矩阵（2026-08-26）

## 里程碑

- 插件升级到 `v31` / `0.3.1`，数据库 schema 升级到 `15`。
- 项目证据区新增“研究编码”工作台，支持按项目配置字段并逐篇提取结构化证据。
- 内置三套草稿模板：通用实证研究、系统综述 / 元分析、量表开发与验证。
- 字段类型支持文本、数字、单选、多选、布尔值；支持必填、定义、选项、排序和删除保护。
- 模板只替换当前弹窗草稿，必须点击“保存字段”后才写入数据库。
- 已有编码值的字段删除或不兼容变更会返回冲突详情，并要求二次确认强制变更。
- 证据矩阵、CSV、XLSX 导出已同步自定义字段；XLSX 新增“编码字典”工作表。

## 交互与视觉修复

- 修复文本/数字字段错误显示选项输入框的问题。
- 将字段编辑行整理为清晰的多行结构。
- 修复编码字段弹窗继承 440px 通用宽度而产生横向滚动、必填和排序操作被裁切的问题；桌面端最大 900px，窄屏自动贴合视口。
- 390×844 实机检查无页面级横向溢出，桌面端字段编辑容器 `clientWidth === scrollWidth`。
- Harness 控制台：0 errors / 0 warnings；`GET /evidence-coding` 实际请求均为 200。

## 验证

- 主测试：138 / 138 通过。
- Web 编辑器测试：11 / 11 通过。
- 合计：149 / 149 通过。
- XLSX 三个工作表完成结构与渲染检查；修复了编码字典空单元格被误写为数值的问题。
- 视觉产物：
  - `output/playwright/v31-coding-template-final.png`
  - `output/playwright/v31-coding-template-mobile.png`
  - `output/playwright/v31-evidence-coding-mobile.png`
  - `output/qa-export-v31/证据矩阵.xlsx`
  - `output/qa-export-v31/xlsx-render.png`
  - `output/qa-export-v31/coding-dictionary-render.png`

## 部署与数据安全

- 正式桌面客户端已重启，当前 Harness 后端监听 `127.0.0.1:6085`，健康检查为 `v31`、schema `15`、2 个项目。
- 本轮只应用模板到浏览器草稿并取消，`青少年情绪应对` 仍为 0 个编码字段、0 条编码值；未写入真实项目编码数据。
- schema 迁移备份：`C:\Users\zhou\.dsh\plugin-data\hana-research\research.db.bak-v15-2026-08-25T15-09-20-580Z`。
- v31 部署前文件备份：`C:\Users\zhou\.codex\backups\dsh-hana-research\20260825-230858-v30-before-v31`。

## 下一阶段

1. 文献重复检测：DOI 精确匹配 + 标题/作者/年份相似匹配，提供候选合并审查。
2. 双人筛选与冲突复核：记录审阅者、独立判断、冲突状态和仲裁结果。
3. PRISMA 流程统计：自动汇总检索、去重、筛选、排除理由与最终纳入数量，并支持导出。
