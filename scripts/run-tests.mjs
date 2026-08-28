#!/usr/bin/env node
/**
 * 跨平台测试入口：逐个枚举 tests/*.test.mjs 后交给 node --test。
 * Windows 下不能把目录名直接传给 node --test（会丢失子进程退出码），
 * 因此 CI 与本地统一走本脚本。用法：node scripts/run-tests.mjs
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const TESTS = fs
	.readdirSync(path.join(ROOT, "tests"))
	.filter((name) => name.endsWith(".test.mjs"))
	.sort();

let total = 0;
let failed = 0;
const failedFiles = [];

for (const name of TESTS) {
	const result = spawnSync(process.execPath, ["--test", path.join(ROOT, "tests", name)], {
		encoding: "utf8",
	});
	const stdout = result.stdout || "";
	const picked = [...stdout.matchAll(/^ℹ (tests|pass|fail) (\d+)$/gm)].map((m) => [m[1], Number(m[2])]);
	const counts = Object.fromEntries(picked);
	const tests = counts.tests ?? 0;
	const pass = counts.pass ?? 0;
	const fail = counts.fail ?? (tests ? tests - pass : result.status === 0 ? 0 : 1);
	total += tests;
	if (fail > 0 || result.status !== 0) {
		failed += fail || 1;
		failedFiles.push(name);
		console.error(`✖ ${name} (${tests} tests, ${fail} failed)`);
		const tail = (result.stdout || "").split("\n").slice(-80).join("\n");
		console.error(tail);
		if (result.stderr) console.error(result.stderr);
	} else {
		console.log(`✔ ${name} (${tests} tests)`);
	}
}

console.log(`\nTotal: ${total}, failed: ${failed}`);
if (failed > 0) {
	console.error(`Failing files: ${failedFiles.join(", ")}`);
	process.exit(1);
}
