# 社区发布 R3：发布包瘦身

时间：2026-08-28（Asia/Shanghai）

## 目标

`files` 白名单让发布包只含运行必需内容；评估字体子集与旧 pdf.js 清理；压缩包不超过 30 MB。

## 已完成

- `package.json` 新增 `files` 白名单：`lib`、`assets`、`docs`、`cordis.patch.yml`、README、THIRD_PARTY_LICENSES，以及 `tools/` 中被 `lib/register-tools.js` 导入的 21 个运行时 Agent 工具模块（`_shared.js` + 20 个工具）。
- 移除未使用的 3 个 Noto 字重（Light/DemiLight/Medium，约 24 MB）：工作台运行时只自托管 Regular/Bold（GB2312 回退注册表），其余字重仅存在于 embedpdf 的 CDN 回退清单。
- 移除旧版 pdf.js 阅读器：`/reader-legacy` 路由、`renderReaderShell`、`reader-bridge.js`、`reader.css`、`reader-app-bridge.js`、`reader-app.css`、`assets/vendor/pdfjs-app`（12 MB）、`assets/vendor/pdfjs-viewer`（6 MB）、调试残留 `_dbg-workbench.css`。UI 中无任何 reader-legacy 入口链接，阅读工作区自 v12 起为唯一默认入口。
- `assets/vendor/pdfjs.mjs`（Node 侧文本抽取 + 文档翻译）保留。
- 发布元数据测试新增：白名单边界、禁止目录（archive/memory/tests/web/output/work/node_modules）、30 MB 体积门槛、dev-only 工具脚本禁入、以及「lib 导入的每个 ../tools/*.js 必须在发布包内」回归守卫（对应本次冒烟发现的问题）。
- README 中 reader-legacy 回退描述已同步更新；发布计划文档 R3 状态与风险基线已更新。

## 冒烟发现并修复

- 首版白名单遗漏 `tools/`，隔离全新 Profile 安装后 Harness 启动即失败（register-tools.js 导入 `tools/add-paper-to-project.js` 报 ERR_MODULE_NOT_FOUND）。已将运行时工具纳入白名单并加自动回归守卫。
- 同版本 `.tgz` 用 `dsh plugin update` 重装时 pnpm 可能复用旧内容（added 0），冒烟需先 remove 再 add 才能保证包内容被替换。

## 验证

- `npm pack --dry-run`：63 个文件全部可解释（lib 24、assets 12、docs 3、tools 21、元数据 5）。
- 候选包 `dsh-hana-research-0.4.0-beta.1.tgz` 压缩后 18.5 MB（R1 时约 63 MB）。
- 隔离全新 DSH_HOME + 全新 web Profile：`--dump-config` 显示 `# == dsh-hana-research`；Harness 启动无错误；`/ui/hana-research/literature`、`/ui/hana-research/reader` 均 HTTP 200；`pdfium.wasm` 4.6 MB 正常下发；`/reader-legacy` 与 `pdfjs-app` 资产返回 404；health 返回 `{ok:true, schemaVersion:19, releaseVersion:"0.4.0-beta.1", projects:0, papers:0}`（空启动，无绝对路径）。
- 全部 Node 测试：160/160 通过（新增 2 条发布元数据测试）；Markdown 编辑器测试：7/7 通过。

## 后续边界

- R4：依赖与兼容声明（`@deepseek-ai/dsh-tools` 未声明、弃用依赖与 uuid 告警、多版本启动验证）。
- R5：安全加固（PDF 重定向白名单、流式体积限制、API 审计）。
- 字体子集化未做：导出内容为用户任意文本，静态子集不可行；如需进一步瘦身可评估 WOFF2 化或按需字形，暂缓。
