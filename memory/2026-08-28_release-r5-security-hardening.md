# 社区发布 R5：安全加固

时间：2026-08-28（Asia/Shanghai）

## 目标

修复依赖告警、PDF 重定向白名单与流式体积限制；审计 API、文件路径、上传、导出、日志和联网行为；剩余风险记录在 `SECURITY.md`。

## 审计发现与修复

1. **重定向白名单缺口（已修复）**：`fetchPdfFollowingValidatedRedirects` 的每一跳只做 HTTPS 规范化，未重新执行主机白名单——白名单内的初始地址可用 302 把下载弹到任意外部主机。现在 `pdfFetch` 每次调用都执行白名单校验，`allowedHosts` 贯穿下载与 Unpaywall 查询。
2. **私网地址拦截缺失（已修复）**：移植后的 `pdfFetch` 是裸 `fetch`，宿主 `network` 沙箱的 `PLUGIN_NETWORK_PRIVATE_HOST_FORBIDDEN` 语义没有本地实现（错误文案还在引用它）。新增 `assertPublicHost`：IP 字面量直接判定 + 主机名经 DNS 解析后逐地址判定，拒绝回环/私网/链路本地/CGNAT/组播及 IPv6 唯一本地、链路本地、IPv4 映射地址；DNS 解析失败同样拒绝。
3. **复核无恙的暴露面**：静态资产路由有 resolve + 前缀校验（防穿越）；附件文件流只走数据库登记的 `absolutePath`；上传/下载均有 `%PDF-` 签名与 40 MB 上限；`chinese-title.js` 出站 URL 恒为固定官网域名（仅派生自 psych.ac.cn 规则/DOI 前缀），带 15s 超时与 1MB 上限；健康接口不返回绝对路径（R2 已修）。
4. **uuid 中等告警**：npm overrides 只对安装根生效、对发布包的消费者无效，无法替 exceljs 修复，作为上游问题书面记录。

## 新增

- `tests/security.test.mjs`：5 条回归（重定向出白名单拒绝且不发起第二次请求、白名单内跳转放行、私网 IP 字面量拒绝、解析到私网的主机拒绝、非 HTTPS 拒绝）。测试桩 `globalThis.fetch` 与 `dns.promises.lookup` 并在测试后恢复。
- `SECURITY.md`：数据落点、完整联网行为清单、输入与文件安全、剩余风险披露；已加入 `files` 白名单。

## 验证

- 安全回归 5/5 通过；全部 Node 测试 166/166 通过（161 + 5）；Markdown 编辑器测试 7/7 通过。
- `npm pack --dry-run` 体积与白名单测试继续通过。

## 后续边界

- R6：公开文档与治理（中英 README、CHANGELOG、CONTRIBUTING、支持政策；SECURITY.md 反馈渠道在 R8 公开时补全联系人）。
