# DSH Hana Research

<p align="center">
  <strong>为心理学与社会科学研究打造的本地优先文献工作台</strong><br />
  在 DeepSeek Harness 中完成文献发现、PDF 精读、证据整理、系统综述与研究写作。
</p>

<p align="center">
  <a href="https://github.com/zhoupengyun572-cell/dsh-hana-research/releases/tag/v0.4.0-beta.1"><img alt="Release" src="https://img.shields.io/github/v/release/zhoupengyun572-cell/dsh-hana-research?include_prereleases&style=flat-square"></a>
  <a href="https://github.com/zhoupengyun572-cell/dsh-hana-research/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/zhoupengyun572-cell/dsh-hana-research/ci.yml?branch=main&style=flat-square&label=CI"></a>
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square"></a>
  <img alt="Node.js 22.13+" src="https://img.shields.io/badge/Node.js-%E2%89%A522.13-43853d?style=flat-square&logo=node.js&logoColor=white">
  <img alt="DeepSeek Harness plugin" src="https://img.shields.io/badge/DeepSeek_Harness-plugin-4b6bfb?style=flat-square">
</p>

<p align="center">
  <b>中文</b> · <a href="README.en.md">English</a> ·
  <a href="docs/USER_GUIDE.md">使用指南</a> ·
  <a href="https://github.com/zhoupengyun572-cell/dsh-hana-research/issues">问题反馈</a>
</p>

![Hana Research 阅读工作台：PDF、批注与结构化文献笔记](docs/images/reader-workspace.png)

> [!IMPORTANT]
> 当前版本为 `0.4.0-beta.1`，面向 DeepSeek Harness 开发者预览版。Windows 已完成真实端到端验收；Ubuntu/Windows × Node 22/24 已通过自动化 CI。

## 它解决什么问题

研究资料经常散落在检索网页、PDF 阅读器、表格和笔记软件中。Hana Research 把这些环节收进同一个可追溯工作流：

1. 从 OpenAlex、Crossref、arXiv 和 PubMed 发现文献，或直接上传本地 PDF。
2. 按研究问题建立项目，让每篇文献、批注、任务和笔记都有明确归属。
3. 在三栏阅读器中精读 PDF，把高亮、原文摘录和研究者判断连接到具体页码。
4. 需要系统综述时，再展开双阶段筛选、PRISMA、研究编码、偏倚风险和 GRADE。
5. 导出项目笔记、证据矩阵、引文和带批注 PDF，并把当前上下文交给 Harness Agent 协作。

## 核心能力

| 工作阶段 | Hana Research 提供什么 |
|---|---|
| 文献发现 | 四源并发检索、AI 解读、保存检索、新结果提醒、期刊同步、自定义期刊源 |
| 项目组织 | 项目库、文献角色、阅读状态、优先级、研究任务、跨文献关系与下一步建议 |
| PDF 精读 | 目录/缩略图/搜索、彩色批注、逐页定位、阅读进度、结构化摘录与文献总结 |
| 系统综述 | 纳排标准、题录/摘要与全文双阶段筛选、双人独立判断、冲突仲裁、PRISMA 2020 |
| 证据综合 | 自定义研究编码、RoB 2 / ROBINS-I、GRADE、证据矩阵与论证链 |
| 导出与协作 | Markdown、DOCX、PDF、CSV、XLSX、BibTeX、RIS；20 个 Harness Agent 工具 |

系统综述工具采用渐进披露：如果你只想收藏、阅读和记笔记，可以跳过筛选、编码与质量评定。

## 界面预览

<table>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/images/project-library.png" alt="Hana Research 项目库" /><br />
      <sub><b>项目库</b>：每个研究问题拥有独立的文献、PDF、任务和笔记空间。</sub>
    </td>
    <td width="50%" valign="top">
      <img src="docs/images/project-overview.png" alt="Hana Research 项目概览" /><br />
      <sub><b>项目概览</b>：聚焦下一步、最近活动和证据缺口，避免把所有工具堆在首屏。</sub>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/images/evidence-workflow.png" alt="Hana Research 系统综述与项目文献" /><br />
      <sub><b>证据工作流</b>：按需展开筛选、数据提取和质量评定。</sub>
    </td>
    <td width="50%" valign="top">
      <img src="docs/images/reader-workspace.png" alt="Hana Research PDF 阅读工作台" /><br />
      <sub><b>阅读工作台</b>：原文、批注与结构化文献笔记保持同屏并可回到来源页。</sub>
    </td>
  </tr>
</table>

截图使用合成演示 PDF 与公开书目信息，不包含真实用户项目或私人研究数据。

## 安装

需要已安装的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 和 `web` Profile。推荐固定到已发布标签：

```powershell
dsh plugin --profile web add github:zhoupengyun572-cell/dsh-hana-research#v0.4.0-beta.1
```

安装完成后重启 Harness。插件会通过包内 `dsh.bundle` 自动加入 `web` Profile，无需手工编辑配置。

也可以从 [GitHub Release](https://github.com/zhoupengyun572-cell/dsh-hana-research/releases/tag/v0.4.0-beta.1) 下载 `.tgz`。发布包 SHA-256：

```text
437495d420fdff5268d8fb5431a06b8f7afcb7702ae4aa7133531f6bd9b2a8e7
```

更新与卸载：

```powershell
dsh plugin --profile web update dsh-hana-research
dsh plugin --profile web remove dsh-hana-research
```

卸载插件不会自动删除研究数据。

## 三分钟开始使用

1. 打开“项目库”，新建一个研究项目。
2. 在项目中上传 PDF，或从“文献中心”检索并导入开放文献。
3. 打开 PDF，选中文字创建批注或摘录；在右侧总结模板中整理研究问题、方法、结果与局限。

完整流程、快捷键和系统综述说明见[用户使用指南](docs/USER_GUIDE.md)。

## 本地数据与安全边界

- 数据默认存放在 `$DSH_HOME/plugin-data/hana-research/`，包括 SQLite `research.db`、PDF、翻译与项目笔记。
- 当前数据库为 **schema v19**；升级前会在需要时保留迁移快照。
- 新安装默认是空数据库，不自动携带作者项目或演示文献。
- 写入型 Agent 工具需要用户确认，并由 Harness approval 与本地审计记录约束。
- 联网检索、开放 PDF 下载、AI 解读与翻译的目标域名和限制见[安全政策](SECURITY.md)。
- 生产依赖无已知高危/严重漏洞；剩余上游告警与平台验证边界在安全政策中如实披露。

## 兼容性与已知限制

- Node.js `>=22.13.0`；Harness 实机基线为 `@deepseek-ai/dsh-tools 0.1.0-rc.13`，CI 使用可公开安装的 `0.1.1-rc.2` 回归。
- Windows 已完成安装、阅读、批注、导出、更新和卸载闭环；Ubuntu 当前只有自动化 CI，没有完整 GUI 人工验收。
- UI 当前以简体中文为主。
- Harness 仍处开发者预览期，因此暂不承诺跨所有预览版本的稳定兼容。

## 文档

- [用户使用指南](docs/USER_GUIDE.md)：快速上手、工作流、功能树、FAQ 与备份恢复
- [插件技术总览](docs/PLUGIN_OVERVIEW.md)：架构、能力矩阵、数据模型、API 与 Agent 工具
- [更新日志](CHANGELOG.md)
- [安全政策](SECURITY.md)
- [贡献指南](CONTRIBUTING.md)
- [第三方许可证](THIRD_PARTY_LICENSES.md)

## 开发与验证

```powershell
npm ci
node scripts/run-tests.mjs

cd web
npm ci
node --test tests/*.test.mjs
npm run build
```

完整测试基线：根测试 167/167、阅读器编辑器测试 13/13。公开 CI 覆盖 Ubuntu/Windows × Node 22/24，并验证发布包白名单和体积上限。

## 反馈与贡献

- Bug：[提交问题](https://github.com/zhoupengyun572-cell/dsh-hana-research/issues/new?template=bug_report.yml)
- 功能建议：[提交功能请求](https://github.com/zhoupengyun572-cell/dsh-hana-research/issues/new?template=feature_request.yml)
- 安全问题：请遵循[安全政策](SECURITY.md)，不要在公开 Issue 中披露敏感细节。

欢迎先阅读[贡献指南](CONTRIBUTING.md)。提交问题时请附 Harness/Node 版本、操作系统、复现步骤和必要的脱敏日志。

## License

[MIT](LICENSE) © 2026 Hana Research contributors
