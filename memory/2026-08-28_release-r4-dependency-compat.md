# 社区发布 R4：依赖与兼容

时间：2026-08-28（Asia/Shanghai）

## 目标

声明 Node、Harness、`dsh-tools` 兼容范围；不借用开发机全局依赖即可安装和运行；兼容矩阵有可复现结果。

## 已完成

- `engines.node = ">=22.13.0"`：`lib/store.js` 依赖 `node:sqlite`，官方文档核实免 `--experimental-sqlite` 旗标的下限为 v22.13.0/v23.4.0。
- `@deepseek-ai/dsh-tools` 以 **optional peer** `^0.1.0-rc.13` 声明。关键发现：该精确版本不在公共 npm（公网 0.1.0 线止于 rc.8，另有 0.1.1-rc.1/2），`defineTool` 始终由 Harness Profile 的宿主安装提供，因此 peer 必须保持 optional——非可选 peer 会让任何裸装以 `ETARGET` 直接失败（已实测复现）。
- 干净环境裸装验证：临时目录 `npm install <tgz>` 成功（127 包，全部来自注册表，未借用开发机依赖）。
- 兼容性说明写入 README（Node 下限、Harness rc.13 基线、peer 机制、依赖风险）。
- 发布元数据测试新增：engines 与 optional peer 断言，防止回归为非可选或删除声明。
- 隔离全新 Profile 重跑安装+启动冒烟：`--dump-config` 显示 `# == dsh-hana-research`，health 返回 `0.4.0-beta.1` 空库，0 错误。

## 依赖风险盘点（裸装实测）

- npm audit：无高危/严重；3 项中等全部来自 `exceljs → uuid@8.3.2` 链，上游 exceljs 未发版修复，属已知中低风险，README 已书面说明（R5 可评估 npm overrides 强制 uuid 升级，但需回归 exceljs 行为）。
- 6 项弃用告警：inflight、glob、rimraf、fstream、lodash.isequal、uuid，全部位于 docx/exceljs/pdfkit 的传递树内，非本插件可直接消除。

## 兼容矩阵（如实记录）

- 已验证：Windows 10/11 实机 + Node 24.15.0 + `dsh-tools 0.1.0-rc.13`（Harness 桌面端内置）。
- 未实测：其他 Node 版本（下限 22.13.0 由 node:sqlite 文档推导）、macOS/Linux。README 已按要求标注。

## 运维注意

- `dsh` CLI 不做 MSYS 路径转换：在 Git Bash 中 `DSH_HOME` 必须传 Windows 形式（`cygpath -w`），否则 dsh 静默回退默认 `~/.dsh`——本次曾因此把用户现有 Profile（含旧开发副本与真实数据库）启动在测试端口上，已终止并重做。隔离冒烟必须先 `cygpath -w` 再 export。
- 同版本 `.tgz` 重复 `dsh plugin update` 时 pnpm 可能复用旧内容（R3 已记录），冒烟前先 remove 再 add。

## 验证

- 裸装：`npm install` 成功，audit/dedupe 结果如上。
- 隔离 Profile：安装 → dump-config → 启动 → health/reader 200，全程 0 错误。
- 全部 Node 测试：161/161 通过（新增 1 条兼容声明断言）；Markdown 编辑器测试：7/7 通过。

## 后续边界

- R5：安全加固——`uuid` 中等告警的 override 可行性评估、PDF 重定向白名单、流式体积限制、API/路径/日志审计，产出 `SECURITY.md`。
