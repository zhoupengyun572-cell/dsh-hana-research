# Hana Research 社区发布计划

目标候选版本：`0.4.0-beta.1`  
目标渠道：DeepSeek Harness 社区插件目录  
状态：发布加固进行中

## 发布原则

- 先完成可重复的一键安装，再公开仓库或提交社区收录。
- 默认不携带作者个人研究项目、真实用户数据、本机路径或开发档案。
- 写操作继续经过 Harness approval；联网目标、数据落点与权限必须对用户透明。
- 每个阶段必须有自动化测试、干净环境验证或明确的人工验收证据。
- Harness 仍处于开发者预览期，候选版明确标记 Beta，并声明兼容范围。

## 发布门槛

只有以下条件全部满足，才允许公开标记 `0.4.0-beta.1`：

- [x] `dsh plugin --profile web add <specifier>` 可在全新 Profile 一次安装并自动激活（本地 `.tgz` 候选包已验证；公开 specifier 待 R8）。
- [x] 更新、卸载和重新安装可正确维护 bundle 配置层，且卸载不删除独立研究数据目录。
- [x] 新用户默认使用空白数据库；作者项目与文献种子仅允许显式测试/开发 opt-in。
- [x] 发布包具有明确文件白名单，不包含 `archive/`、`memory/`、测试截图或协作文件。
- [x] 直接依赖、peer 依赖、Node 与 Harness 兼容范围完整声明。
- [x] 生产依赖无已知高危/严重漏洞；中低风险均有处理或书面说明。
- [x] PDF 下载重定向、响应体积、路径访问和 API 暴露完成安全验证。
- [x] LICENSE、第三方许可证、README、隐私/权限说明、更新日志和支持政策齐全。
- [x] CI 自动执行完整 Node 测试、编辑器测试、打包检查和干净安装冒烟。
- [x] 至少完成 Windows 实机验收；其他平台若未验证，README 必须明确标注。
- [x] 候选包在真实 Harness 中完成安装→创建项目→上传 PDF→阅读批注→导出→升级→卸载闭环。

## 分阶段执行

### R0：发布基线与版本口径

统一 npm、前端资产、健康检查和公开文档版本；固定 schema 与 Harness 开发基线；增加元数据一致性测试。

验收：公开文档只出现当前有效版本口径，自动测试阻止版本再次漂移。

### R1：标准 Harness Bundle

增加 `dsh.bundle` manifest 和 `cordis.patch.yml`；改用正式包名；移除手工修改用户 Profile 的安装要求。

验收：全新临时 Profile 通过一行命令安装，`--dump-config` 能看到 Hana Research 配置层。

状态：已完成。正式包名为 `dsh-hana-research`；npm 当前未发现同名公开包。候选 `.tgz` 已在隔离的全新 `web` Profile 完成安装、启动、更新、卸载和重新安装验证。

### R2：隐私与初始数据

移除作者项目种子、本机绝对路径和健康接口路径泄露；示例内容改为显式选择导入。

验收：全新数据库为空；仓库与发布包扫描不出现作者用户名、作者项目名或真实本机路径。

状态：已完成。运行时默认空数据库，示例数据仅能显式启用；健康接口不再返回数据库绝对路径，公开源码和文档已通过作者用户名、作者项目名及本机路径扫描。发布包和公开仓库历史将在 R3/R8 再执行独立扫描。

### R3：发布包瘦身

使用 `files` 白名单；排除 archive、memory、tests、tools、web 源码和旧回退资产；评估字体子集与旧 pdf.js 清理。

验收：`npm pack --dry-run` 文件表全部可解释，压缩包目标不超过 30 MB。

状态：已完成。`files` 白名单仅保留 `lib`、`assets`、`docs`、`cordis.patch.yml`、`tools/` 内 21 个运行时 Agent 工具模块（`lib/register-tools.js` 导入的集合）、README 与第三方许可清单。移除未使用的 3 个 Noto 字重（约 24 MB）与旧版 pdf.js 阅读器全部资产（`pdfjs-app` 约 12 MB、`pdfjs-viewer` 约 6 MB、对应桥接与路由）；阅读工作区自 v12 起为唯一入口，工作台字体回退仅自托管 Regular/Bold 两个字重。候选包压缩后 18.5 MB（此前约 63 MB）；`npm pack --dry-run` 共 63 个文件且全部可解释。发布元数据测试新增白名单、体积门槛、运行时工具完整性回归与旧资产禁入校验。

### R4：依赖与兼容

声明 Node、Harness、`dsh-tools` 兼容范围；消除本机软链接依赖；完成干净依赖安装与多版本启动验证。

验收：不借用开发机全局依赖即可安装和运行；兼容矩阵有可复现结果。

状态：已完成。`engines.node >= 22.13.0`（`node:sqlite` 免旗标下限，官方文档核实）；`@deepseek-ai/dsh-tools` 以 optional peer `^0.1.0-rc.13` 声明——裸装验证发现该精确版本不在公共 npm（公网止于 0.1.0-rc.8 / 0.1.1-rc.2），非可选 peer 会让任何安装以 ETARGET 失败，故保持 optional 并由 Harness Profile 在运行时提供（隔离 Profile 冒烟确认）。干净环境裸装候选包成功（127 个包，仅注册表拉取）；npm audit 无高危/严重项，3 项中等均来自 `exceljs → uuid@8.3.2` 链（上游未修复，书面说明已写入 README）；弃用告警 6 项（inflight/glob/rimraf/fstream/lodash.isequal/uuid）全部位于三个生产依赖的传递树内，属上游问题。兼容矩阵：Windows 实机 + Node 24.15 + Harness rc.13 已验证；其他 Node/平台未实测并在 README 标注。

### R5：安全加固

修复依赖告警、PDF 重定向白名单与流式体积限制；审计 API、文件路径、上传、导出、日志和联网行为。

验收：安全回归测试通过，剩余风险记录在 `SECURITY.md`。

状态：已完成。修复移植层缺失的两项网络防护：PDF 下载重定向此前只验 HTTPS、未对跳转目标重新执行白名单（可被 302 弹出白名单），且本地 `pdfFetch` 不再经过宿主 network 沙箱、无法拦截内网地址；现在每一跳都重新执行主机白名单与 DNS 解析私网拦截（覆盖 IPv4 私网/回环/链路本地/CGNAT 与 IPv6 唯一本地/链路本地/IPv4 映射地址），Unpaywall 查询同样收紧到固定主机。新增 5 条安全回归测试（重定向出白名单拒绝、白名单内跳转放行、私网 IP 字面量拒绝、解析到私网的主机拒绝、非 HTTPS 拒绝）。附件/资产路由复核无目录穿越，上传与下载均有 PDF 签名 + 40 MB 上限。`uuid@8.3.2` 中等告警经评估确认 npm overrides 对发布包消费者不生效，作为上游问题记录于 `SECURITY.md`；联网行为、数据落点与剩余风险清单见该文件。

### R6：公开文档与治理

提供中英文 README、LICENSE、CHANGELOG、SECURITY、CONTRIBUTING；说明联网域名、数据目录、备份恢复、权限和问题反馈。

验收：陌生用户只阅读公开文档即可完成安装、使用、更新和卸载。

状态：已完成。新增根 `LICENSE`（MIT）、`CHANGELOG.md`（0.4.0-beta.1 条目，Keep a Changelog 口径）、`CONTRIBUTING.md`（环境、测试命令、memory 协作约定、发布门槛联动）与 `README.en.md`（英文入口，明确中文文档为准）；全部加入 `files` 白名单并由发布元数据测试断言存在性与 CHANGELOG 版本同步。数据目录、备份回滚、schema 快照已在 README 与用户指南第 5 节；联网域名与剩余风险在 `SECURITY.md`；写入权限与审计说明在用户指南与 README。问题反馈渠道留待 R8 公开时补充联系方式。

### R7：CI 与发布候选

建立 GitHub Actions；生成候选包及校验和；在真实 Harness 完成端到端发布验收。

验收：CI 全绿，候选包安装闭环通过，工作区无未提交变更。

状态：已完成（远端 CI 首跑待 R8 公开仓库）。新增 `.github/workflows/ci.yml`（ubuntu+windows × Node 22/24 矩阵：根测试、编辑器测试、打包与校验和产物上传）与跨平台 `scripts/run-tests.mjs`（解决 Windows 下 node --test 目录传参问题）；提交根 `package-lock.json` 供 CI 复现安装。CI 各步骤已在本地完整复演：`scripts/run-tests.mjs` 167/167、编辑器 7/7、`npm pack` + sha256（`a5be5b5a4be801dd9de416e505776575f3938731a10fd78f520cb465ca9ff921`，与 CHANGELOG/README 版本一致）。真实 Harness 端到端闭环在隔离全新 Profile 完成：安装→创建项目→上传 PDF→选择批注→Markdown/DOCX 导出→附件流→`plugin update`（配置层保留、数据保留）→`plugin remove`（配置层移除、`research.db` 保留）。过程中确认两个安装器已知问题并记录 memory：`dsh plugin add` 对含空格路径会拆参（tgz 与源码目录皆然，社区 npm/GitHub 安装不受影响）；`DSH_HOME` 环境变量必须使用正斜杠 Windows 路径，反斜杠经 bash 转写会被吞掉导致数据落点漂移。

### R8：公开与社区收录

在用户确认账号、仓库名和发布渠道后创建公开仓库/Release，添加 `dsh-plugin` topic，并验证社区索引可发现性。

验收：公开安装命令从零可用，Release 与文档中的版本和校验和一致。

## 当前已知风险基线

- 标准 bundle 与正式包名已在 R1 完成；公开 npm/GitHub specifier 待 R8。
- 发布包已完成瘦身（R3）：`files` 白名单 + 旧 pdf.js 清理后压缩 18.5 MB；`tools/` 中 6 个开发脚本与 `shots/` 截图目录不进入发布包。
- 作者项目种子已改为显式测试/开发 opt-in；运行时默认空数据库。
- 依赖与兼容已在 R4 声明：`engines.node >= 22.13.0`；`dsh-tools` 为 optional peer（公网无 rc.13，由宿主提供）；剩余依赖风险仅 `exceljs → uuid@8.3.2` 中等告警与 6 项上游弃用告警，均已书面说明。
- README、用户指南和维护者总览曾存在版本/schema 口径漂移。
- README、用户指南和维护者总览曾存在版本/schema 口径漂移。
- 尚无公开 Git 远程、CI、根 LICENSE、安全政策或一键安装验证。
