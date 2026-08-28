# 贡献指南（Contributing）

感谢关注 Hana Research。本项目当前处于 Beta 加固期，欢迎 Issue、文档改进与测试反馈；大功能变更建议先开 Issue 讨论。

## 开发环境

- Node ≥ 22.13.0（`node:sqlite` 免旗标下限；开发机验证于 Node 24）。
- DeepSeek Harness 桌面端（开发者预览），本机 `~/.dsh` 为默认 `DSH_HOME`。
- 依赖安装：根目录 `npm install`；阅读工作台前端在 `web/` 下 `npm install`。

## 常用命令

```bash
# 全部数据层/API 测试（Windows 下不要把目录名直接传给 node --test）
node --test tests/store.test.mjs            # 或逐个枚举 tests/*.test.mjs

# Markdown 编辑器前端测试
node --test web/tests/markdown.test.mjs

# 修改阅读工作台源码后重新构建（产物：assets/reader-workbench.js|css）
cd web && npm run build

# 打包候选版本并核对体积/文件表
npm pack --dry-run
```

真实页面验证（阅读工作台冒烟、多尺寸菜单检查）需要在 Harness 中手动查看；布局相关交付请截图留档。

## 代码与提交约定

- 中文沟通与中文界面优先，文件统一 UTF-8。
- 提交信息使用 `feat:` / `fix:` / `chore:` 前缀，附发布阶段编号（如 R6）。
- 不要把检索元数据当作「已阅读全文」；Agent 工具引用本地证据时保留标题、DOI、页码与标签。
- 写入类操作必须保留 Harness approval 确认与审计链。
- `tests/`、`web/` 源码与 `tools/` 中的开发脚本不进入 npm/tarball 发布包（见根 `package.json` 的 `files` 白名单与 `tests/release-metadata.test.mjs` 守卫）。

## 发布流程

修改 `package.json`、`cordis.patch.yml`、README、文档或安全相关代码时，请同步运行 `node --test tests/release-metadata.test.mjs` 与 `node --test tests/security.test.mjs`，确保版本口径、隐私扫描、白名单与联网防护不被破坏。

## 行为准则

保持友善与学术诚信；引用他人工作时注明出处。

## 反馈与贡献

- 使用 [GitHub Issues](https://github.com/zhoupengyun572-cell/dsh-hana-research/issues) 提交可复现的问题或功能建议。
- 提交 Pull Request 前请运行完整测试，并说明兼容性与数据迁移影响。
- 请勿提交真实研究数据库、PDF、访问令牌、本机绝对路径或可识别参与者的信息。
