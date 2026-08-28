# 安全政策（Security Policy）

支持版本：`0.4.0-beta.1`（Beta）。漏洞与安全问题请通过 [GitHub Issues](https://github.com/zhoupengyun572-cell/dsh-hana-research/issues) 报告；请勿在报告中上传真实研究数据、受版权保护的 PDF 或其他敏感材料。

## 数据存放位置

- 研究数据库与 PDF 附件：`$DSH_HOME/plugin-data/hana-research/`（`research.db` + WAL，`library/pdfs/`）。卸载插件不会删除该目录。
- 插件不向作者或任何第三方上报使用数据；健康检查接口不返回本机绝对路径。

## 联网行为清单

插件运行时仅发起以下 HTTPS 出站请求，全部使用「重定向手动跟随 + 每跳白名单 + 私网地址拦截」：

| 目的 | 目标 |
| --- | --- |
| 文献检索 | api.openalex.org、api.crossref.org、export.arxiv.org、eutils.ncbi.nlm.nih.gov 等（见 `lib/api.js` `DOWNLOAD_ALLOWED_HOSTS`） |
| 开放获取 PDF 定位 | api.unpaywall.org |
| PDF 全文下载 | 仅白名单内的出版商/预印本主机，重定向目标逐跳重新校验 |
| 期刊官网元数据 | journal.psych.ac.cn（中文标题补全，固定主机） |
| Agent 联网检索 | 由宿主 Harness 提供的联网工具完成，不经插件代码 |

任何主机不在白名单内、解析到私网/本机地址、或使用非 HTTPS 时，下载会以明确错误终止（`PLUGIN_NETWORK_HOST_NOT_ALLOWED` / `PLUGIN_NETWORK_PRIVATE_HOST_FORBIDDEN` / `PDF_URL_INSECURE`）。

## 输入与文件安全

- PDF 上传与下载均校验 `%PDF-` 签名与 40 MB 体积上限；下载内容按 SHA-256 内容寻址落盘，文件名经过控制字符清洗。
- 静态资产路由对路径做 resolve + 前缀校验，防目录穿越。
- 附件读取路由只暴露数据库中已登记的附件；上传的原始文件名仅用于展示。

## 已知剩余风险（如实披露）

- `exceljs → uuid@8.3.2` 存在一项中等审计告警，上游尚未发版修复；`xlsx` 导出由 `exceljs` 完成。npm overrides 对发布包的消费者不生效，故暂以等待上游升级为主。
- 6 项弃用的传递依赖（inflight、glob、rimraf、fstream、lodash.isequal、uuid），均位于三个生产依赖（docx/exceljs/pdfkit）内部。
- 宿主沙箱语义（如私网拦截）在本插件内以本地兼容层实现，若宿主未来恢复 `network` 沙箱 API，将迁移回宿主实现。
- PDF 下载读取整个响应到内存（上限 40 MB）；附件文件流同样整读。大规模并发使用可能占用较多内存。
