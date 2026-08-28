# DSH Hana Research（dsh-hana-research）

面向心理学与社会科学研究的本地文献工作台，以静态 Cordis 插件形式运行于 DeepSeek Harness。

- **插件关键内容总览**：`docs/PLUGIN_OVERVIEW.md`
- **用户使用说明书（含工作流程图与功能树形图）**：`docs/USER_GUIDE.md`
- 第三方依赖与许可证：`THIRD_PARTY_LICENSES.md`

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
旧官方 pdf.js viewer 回退（`/reader-legacy`）已随社区发布瘦身移除（v12 起工作区即为唯一默认入口）。

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

## 应用壳与客户端路由（v38）

- 常驻顶栏：品牌区（文献研究台）+ 命令面板/设置工具组，sticky 毛玻璃跟随宿主主题，窄屏自动紧凑
- **工作区切换器按嵌入态自适应**：内嵌于 Harness 时隐藏（宿主已自带「文献中心/项目库」页签，v23 裁决插件内不重复导航）；独立打开深链接时显示，页面可互切
- **SPA 路由**：同一文档内切换——pushState + View Transitions 形变过渡，无整页白屏重载；浏览器前进/后退可用；深链接与旧书签完全兼容；Ctrl/Cmd/中键点击仍由浏览器新开标签
- 切换时自动收起项目抽屉、保存文献筛选现场、按视图恢复滚动位置
- 右键上下文菜单：文献卡（阅读器打开/复制标题/复制 DOI）、项目卡（打开详情/复制名称），pointer 定位视口钳制、Esc/外点关闭
- 阅读器保持整页跳转（编辑器窗口隐喻）；Alt P 命令面板跨区跳转改走路由
- 安全存储层：宿主以受限方式嵌入导致 localStorage 被拒时启动不崩，静默回退内存态

## 项目详情渐进披露（v38c）

- “证据”页不再同时堆叠筛选、研究编码和质量评定三个完整工作台；改为带用途说明的三步可选流程，默认全部折叠，且同一时间只展开一项
- 明确提示：仅用于收藏、阅读和记笔记时可跳过系统综述工具，降低新用户理解成本
- 文献卡默认只显示来源、标题、PDF/角色/筛选状态与阅读入口；筛选结论、全文获取、项目角色和研究编码收进“整理这篇文献”
- 翻译、译文和建立关系收进单篇文献“更多”，减少常驻按钮数量
- 移除与项目首页信息重复的右侧上下文栏，项目详情恢复全宽；Agent 入口移入项目“更多”菜单
- 桌面与 430px 窄屏均采用相同的信息层级，窄屏无横向溢出

## 排版舒适化与主题适配（v37）

- 全库消灭 <11px 字号与半像素取值：20 种字规格收敛为 16 种，最小可读字号 11px；阅读工作台笔记与 AI 简报正文升至 13px
- v35 质量评定（RoB/GRADE）编辑器间距整体放宽一档
- RoB 交通灯、GRADE 确定性色块改为"语义色相 × 卡片底"混合——宿主切深色后不再是刺眼浅色块；任务优先级、重复文献绿色系、选择浮层中性灰全部接入 token
- border-radius 从 13 种散值收敛到 4 个 token 档位（6/8/10/12px + 药丸/圆形/发丝特例），234 处声明 token 化
- 链接型按钮（导出下载 `<a class="button">`）不再继承浏览器默认蓝

## 统一弹层与通知（v36）

- 全部模态共用同一个弹层工厂：Tab 焦点圈闭、关闭后焦点还原到触发按钮、遮罩点击关闭（带拖拽误触保护）、入场自动聚焦与 aria 兜底
- 新增样式化确认 / 选择 / 输入对话框，替换全部 7 处原生 `window.confirm`；破坏性操作使用红色强调确认键
- 三套互不相干的 toast（reader-toast / undo-toast / #notice）合并为单一通知中心：底部居中堆叠、悬停暂停倒计时、支持「撤销」等内联动作按钮
- 页眉常驻「命令面板」「设置」入口按钮，孤儿功能修复；命令面板快捷键定为 Alt P（Ctrl/⌘K 继续让给宿主 Harness）
- 弹层内按 Esc 始终能关层（输入态不再拦截）；z-index 收敛为 menu/toast/modal 三个 token

## 质量评定与证据确定性（v35）

- 按具体结局保存 RoB 2、ROBINS-I 与心理学通用框架的领域判断和支持依据
- 双人评定分别保存 A/B 原始记录；分歧逐领域裁决，工具版本切换不会串用历史结论
- ROBINS-I V2 明确标注为 2025 草案；导出保留模板版本和完整审计链
- GRADE 按关键/重要结局记录升降级依据，区分系统建议等级与研究者确认等级
- 风险偏倚矩阵、GRADE 证据概况和完整 JSON 审计数据可直接导出
- Markdown、CSV 和 XLSX 证据矩阵动态追加项目字段；XLSX 额外生成“编码字典”工作表

## 安装（Beta 候选版）

推荐固定到已发布的 Git tag 安装：

```powershell
dsh plugin --profile web add github:zhoupengyun572-cell/dsh-hana-research#v0.4.0-beta.1
```

安装命令会读取包内 `dsh.bundle`，自动把 Hana Research 配置层加入 `web` Profile，无需手工修改 `cordis.patch.yml`。安装完成后重启 DeepSeek Harness。首次启动会自动迁移到当前 schema v19；跨版本升级会在需要时保留迁移前快照，旧批注在新阅读器打开对应 PDF 时自动换算导入。

也可以从 [GitHub Release](https://github.com/zhoupengyun572-cell/dsh-hana-research/releases/tag/v0.4.0-beta.1) 下载 `.tgz`，再把本地文件路径传给同一条 `add` 命令。建议始终固定 tag 或校验 Release 中的 SHA-256，避免上游分支更新静默改变安装内容。

更新和卸载：

```powershell
dsh plugin --profile web update dsh-hana-research
dsh plugin --profile web remove dsh-hana-research
```

## 兼容性

- **Node ≥ 22.13.0**（`node:sqlite` 免旗标下限）。实际运行时随 DeepSeek Harness 桌面端内置 Node 分发；已在 Windows 实机 + Node 24.15 验证，其他版本未逐一实测。
- **DeepSeek Harness 开发者预览**（开发基线 `@deepseek-ai/dsh-tools 0.1.0-rc.13`）。`defineTool` 由宿主提供，插件以 optional peer 声明兼容范围 `^0.1.0-rc.13`；该精确版本目前不在公共 npm 注册表，因此不依赖注册表安装，始终由 Harness Profile 提供。
- **生产依赖**仅 3 个：`docx`、`exceljs`、`pdfkit`（导出用）。`exceljs` 的传递依赖 `uuid@8.3.2` 存在一项中等审计告警，上游尚未发版修复；风险评估见 [SECURITY.md](SECURITY.md)。

问题反馈与安全报告入口：[GitHub Issues](https://github.com/zhoupengyun572-cell/dsh-hana-research/issues)。

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
- 重启后：`GET /api/hana-research/health` 应返回 `{ok:true, releaseVersion:"0.4.0-beta.1", schemaVersion:19, ...}`
- 数据目录：`$DSH_HOME/plugin-data/hana-research/research.db`（WAL，schema v19）

## 回滚

1. 执行 `dsh plugin --profile web remove dsh-hana-research`。
2. 重启应用。卸载插件不会自动删除 `$DSH_HOME/plugin-data/hana-research/` 中的研究数据。
3. 数据回滚：先停止 Harness，再使用对应迁移前快照 `research.db.bak-v*` 覆盖数据库；不要跨 schema 直接用旧代码写入新数据库。
