import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "file:///C:/Users/zhou/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs";

const input = path.resolve("output", "qa-export-v31", "证据矩阵.xlsx");
const output = path.resolve("output", "qa-export-v31", "xlsx-render.png");
const dictionaryOutput = path.resolve("output", "qa-export-v31", "coding-dictionary-render.png");
const blob = await FileBlob.load(input);
const workbook = await SpreadsheetFile.importXlsx(blob);
const inspection = await workbook.inspect({ kind: "workbook,sheet,region", sheetId: "证据矩阵", range: "A1:Q8", maxChars: 8000, tableMaxRows: 8, tableMaxCols: 17 });
process.stdout.write(`${inspection.ndjson || JSON.stringify(inspection)}\n`);
const preview = await workbook.render({ sheetName: "证据矩阵", range: "A1:Q8", scale: 1, format: "png" });
await fs.writeFile(output, new Uint8Array(await preview.arrayBuffer()));
const dictionary = await workbook.render({ sheetName: "编码字典", range: "A1:E8", scale: 1.5, format: "png" });
await fs.writeFile(dictionaryOutput, new Uint8Array(await dictionary.arrayBuffer()));
process.stdout.write(`${output}\n`);
process.stdout.write(`${dictionaryOutput}\n`);
