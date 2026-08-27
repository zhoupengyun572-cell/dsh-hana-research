# v38c 里程碑：项目详情渐进披露与文献卡降噪

时间：2026-08-27（Asia/Shanghai）

## 问题

用户反馈项目详情的“证据”页同时铺开文献筛选、研究编码、质量评定、项目上下文和单篇文献全部操作，进入后难以理解各模块用途，也无法判断应该先做什么。

## 设计裁决

- 采用“学术工作台的渐进披露”方向，不删除研究功能，只改变默认暴露层级。
- 项目首页继续回答“下一步做什么”；证据页先呈现文献，再按需进入专业方法工具。
- 系统综述工具明确标为可选，并用自然语言解释三者分别解决：纳入哪些研究、提取哪些数据、证据是否可信。
- 同一时间只展开一个专业工作台，避免三个高密度界面纵向叠加。

## 已实现

- 新增三步“可选研究流程”：筛选文献、提取研究数据、评定证据质量；默认全部折叠，展开一项会收起其他项。
- 文献列表建立独立标题与说明，角色筛选保留但文案简化。
- 单篇文献改为摘要卡：默认只显示来源、标题、PDF/角色/筛选状态和主要阅读入口。
- 筛选结论、全文获取、项目角色和研究编码移入“整理这篇文献”折叠区。
- 翻译、译文和建立文献关系移入单篇文献“更多”菜单。
- 移除重复的右侧“项目上下文”栏，内容区恢复全宽；Agent 入口移入项目级“更多”菜单。
- 空项目提供明确的导入/上传提示。

## 验证

- `assets/research.js` 语法检查通过。
- 全部 Node 测试 153/153 通过；阅读编辑器测试 11/11 通过。
- 真实 Harness（动态端口 11609）项目库、项目详情和证据页请求全部 200；控制台 0 error / 0 warning。
- 桌面验证：流程默认折叠、筛选工作台展开、文献摘要卡与“整理这篇文献”展开均正常。
- 430px 窄屏：document clientWidth=420、scrollWidth=420、body scrollWidth=420，无横向溢出。
- 截图：
  - `output/playwright/v38c-project-evidence-desktop.png`
  - `output/playwright/v38c-project-cards-desktop.png`
  - `output/playwright/v38c-screening-expanded.png`
  - `output/playwright/v38c-project-evidence-narrow.png`
  - `output/playwright/v38c-paper-workflow-narrow.png`

## 部署与恢复

- 已同步 `assets/research.js|css` 到运行副本；静态资源按请求读取，无需重启 Harness。
- 同步前备份：`C:\Users\zhou\.codex\backups\dsh-hana-research\20260827-194625-project-layout-v38c-before`。
- 本轮未修改数据库、schema、API 或用户项目数据。

## 后续观察

- 收集用户对“证据”命名是否仍偏抽象的反馈；如仍不清晰，可改为“文献与证据”。
- 若项目类型明确为非综述类，可进一步将可选研究流程默认降级为单行入口。
