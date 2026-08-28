# DSH Hana Research（dsh-hana-research）

> A local academic workbench for psychology research, as a DeepSeek Harness plugin.
> 中文文档为准：请阅读 [README.md](README.md)（canonical）· [用户使用说明书](docs/USER_GUIDE.md) · [插件总览](docs/PLUGIN_OVERVIEW.md) · [更新日志](CHANGELOG.md)。

Hana Research turns a personal literature workflow — **discover → organize → close-read PDFs → synthesize evidence → write** — into a plugin for the DeepSeek Harness desktop app, with an agent collaboration layer on top.

## Highlights

- **Literature center** — multi-source discovery (OpenAlex, Crossref, arXiv, PubMed/Europe PMC), journal subscription sync, duplicate detection and merging.
- **Project cockpit** — PRISMA flow, dual independent screening with criteria, custom evidence coding fields, RoB 2 / ROBINS-I / GRADE quality appraisal, risk-of-bias and GRADE export.
- **Reading workbench** — three-pane PDF reading (outline & thumbnails / EmbedPDF canvas / Tiptap notes): highlight, underline, strikethrough, sticky notes, comments, free text, annotation import/export, annotated-PDF export, progress resume, AI briefings.
- **Native exports** — project notes as Markdown / `.docx` / searchable `.pdf` with embedded Chinese fonts; evidence matrices as UTF-8 BOM `.csv` / frozen-header `.xlsx` / Markdown. Generated server-side, no browser print hacks.
- **Agent tools** — 20 read/write agent tools; every write keeps the Harness approval confirmation and audit trail. Agent citations keep title, DOI, page and tags — retrieval metadata is never presented as "read in full".

## Install (Beta)

Requires the [DeepSeek Harness](https://www.deepseek.com) desktop app (developer preview).

```powershell
dsh plugin --profile web add github:zhoupengyun572-cell/dsh-hana-research#v0.4.0-beta.1
```

Update / uninstall:

```powershell
dsh plugin --profile web update dsh-hana-research
dsh plugin --profile web remove dsh-hana-research
```

The Git tag is intentionally pinned. You can also download the `.tgz` and SHA-256 file from the [GitHub Release](https://github.com/zhoupengyun572-cell/dsh-hana-research/releases/tag/v0.4.0-beta.1), then install the local tarball.

## Compatibility

- **Node ≥ 22.13.0** (the floor where `node:sqlite` loads without a flag). At runtime the Node binary ships with the Harness desktop app; verified on Windows + Node 24.15. Other Node versions and macOS/Linux are untested.
- **Harness developer preview**, baseline `@deepseek-ai/dsh-tools 0.1.0-rc.13`. `defineTool` is provided by the host; the plugin declares it as an *optional* peer dependency (`^0.1.0-rc.13`) because that exact build is not on public npm.
- **Production dependencies**: `docx`, `exceljs`, `pdfkit` only. Known residual risk: a moderate audit finding via `exceljs → uuid@8.3.2`, pending an upstream fix (see [SECURITY.md](SECURITY.md)).

## Data & privacy

- Database and PDF library: `$DSH_HOME/plugin-data/hana-research/` (SQLite, schema v19). Uninstalling the plugin does **not** delete your research data.
- First install starts with an **empty database**; demo seeding is an explicit opt-in for development only.
- Outbound requests are HTTPS-only against a fixed allowlist (search APIs, Unpaywall, allowlisted publisher hosts). Redirect hops are re-validated; hosts resolving to private/loopback addresses are rejected. Full inventory in [SECURITY.md](SECURITY.md).
- The health endpoint returns no absolute paths; no telemetry.

## Verify

```bash
node --test tests/store.test.mjs     # …and the other tests/*.test.mjs files
node --test web/tests/markdown.test.mjs
```

After a restart: `GET /api/hana-research/health` → `{ok:true, releaseVersion:"0.4.0-beta.1", schemaVersion:19, …}`.

## License

[MIT](LICENSE) · third-party notices in [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).

Questions, bug reports, and security reports: [GitHub Issues](https://github.com/zhoupengyun572-cell/dsh-hana-research/issues).
