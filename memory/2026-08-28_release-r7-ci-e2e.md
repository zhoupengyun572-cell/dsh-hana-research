# 社区发布 R7：CI 与发布候选

时间：2026-08-28（Asia/Shanghai）

## 目标

建立 GitHub Actions；生成候选包及校验和；在真实 Harness 完成端到端发布验收。

## 已完成

- `.github/workflows/ci.yml`：ubuntu+windows × Node 22/24 矩阵——根依赖安装、完整测试（`scripts/run-tests.mjs`）、web 编辑器测试（`npm ci` + node --test）、`npm pack` 打包 + sha256 并上传 artifact。
- `scripts/run-tests.mjs`：跨平台测试入口，逐个枚举 `tests/*.test.mjs`（规避 Windows 下把目录传给 node --test 的已知问题），聚合通过/失败并输出失败文件明细。
- 根 `package-lock.json`（在干净临时目录生成——本地 node_modules 是 pnpm 结构，npm 无法就地生成）：CI 与贡献者可复现安装。
- 候选包 `dsh-hana-research-0.4.0-beta.1.tgz` + 校验和 sha256 `a5be5b5a4be801dd9de416e505776575f3938731a10fd78f520cb465ca9ff921`（产物在 `output/`，不入库）。
- 真实 Harness 端到端闭环（隔离全新 DSH_HOME + 全新 web Profile）：add → 创建项目(201) → multipart 上传 PDF(201) → selection-note 批注(201) → 项目笔记 Markdown(200)/DOCX(200) 导出 → 附件文件流(200, application/pdf) → `plugin update`（pnpm 完成、配置层保留、projects:1 数据保留）→ `plugin remove`（配置层归零、`research.db` 保留）。端到端验收走 API 层；UI 层冒烟在 v20–v40 开发迭代中持续执行。

## 发现的安装器问题（记入已知问题）

1. **含空格路径拆参**：`dsh plugin add` 对带空格的 `.tgz` 路径或源码目录都会把参数拆开（pnpm 收到残缺路径）。R1 只记录了源码目录的情况；R7 确认 tgz 路径同样受影响。社区用户走 npm/GitHub specifier 不受影响；本地安装请用无空格路径。安装命令自身未报错而是 pnpm 报错，体验需要上游改进。
2. **DSH_HOME 反斜杠陷阱**：在 Git Bash 中 `export DSH_HOME="C:\Users\..."` 经 `source`/变量转写后反斜杠被吞，变成盘符相对路径 `C:Userszhou...`；Node `path.resolve` 会把它解析到盘根（本次实测生成 `C:\UserszhouAppData...`）。**必须用正斜杠**（`C:/Users/...`，Windows API 原生接受）或 `cygpath -w` 后立即使用、不经变量转写。本次误写目录已删除并重做。

## 验证

- `node scripts/run-tests.mjs`：167/167 通过（含发布元数据、安全回归）。
- 编辑器测试 7/7；`npm pack` 白名单/体积测试随 run-tests 一并通过。
- 端到端闭环如上全部通过；工作区无未提交变更后提交。

## 后续边界

- R8（需要用户决策）：公开仓库名/账号/渠道确认后创建公开仓库与 Release，README/SECURITY 补反馈渠道，验证社区索引可发现性与公开 specifier 一行安装。
