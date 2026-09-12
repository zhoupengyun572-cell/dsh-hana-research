# GitHub 上传前体检与加固

时间：2026-09-12（Asia/Shanghai）

## 体检结论

- 确认本目录是独立 Git 仓库，上级 `deep seek/` 仅是多项目工作集合；同步修正了 `CLAUDE.md` 的过时说明。
- GitHub 远程仓库已存在，但本地此前未配置 `origin`。远程 `main` 是 0.4.0 的 5 个公开提交，本地 `main` 是无共同祖先的 0.5.0 开发历史；上传前需以保留双方父节点的合并提交连接历史，避免强推覆盖远程。
- 当前与历史对象均无 GitHub 100 MiB 限制风险；最大历史 blob 约 8.21 MiB。未发现被跟踪的 `.env`、私钥或凭据文件，也没有冲突标记。
- GitHub Actions 使用的 `actions/checkout@v7` 与 `actions/setup-node@v7` 均已远程验证存在。

## 修复

- 根依赖：`pdfkit` 升至 0.20.2，并通过 npm override 与 `pnpm-workspace.yaml` 将 ExcelJS 的间接 `uuid` 固定到 11.1.1；npm 与 pnpm 锁文件同步。
- 阅读器前端：全部 Tiptap 依赖由 3.30.1 升至 3.31.3，修复原型属性注入/XSS 与 Markdown ReDoS 公告；重新生成 `assets/reader-workbench.js`。
- 测试稳定性：PDF.js 文本提取测试改用 PDFKit 本地动态生成的真实 PDF，不再依赖 arXiv 下载，消除网络抖动导致的随机 CI 失败。

## 验证

- 从锁文件干净安装：根目录 `npm ci`、`web/` 下 `npm ci` 均成功。
- 安全审计：根生产依赖与 `web/` 依赖均为 0 个已知漏洞。
- 测试：根项目 208/208；编辑器 7/7。
- npm 包：0.5.0-beta.1，76 文件，约 18.95 MiB（低于 30 MiB 预算）。
- `git diff --check` 通过；仅有 Windows autocrlf 的换行提示。

## 剩余发布动作

- 提交上述加固改动。
- 以 ours 内容策略合并 `origin/main` 的无关历史，保留 GitHub 旧提交并避免 force push。
- 最终复核后创建 `v0.5.0-beta.1` 标签；推送与创建 GitHub Release 由用户确认后执行。
