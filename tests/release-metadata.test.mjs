import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { RESEARCH_SCHEMA_VERSION } from "../lib/store.js";
import { HANA_RELEASE_VERSION } from "../lib/version.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

// Agent tool modules imported by lib/register-tools.js; everything else in tools/ is dev-only.
const RUNTIME_TOOL_FILES = new Set([
	"tools/_shared.js",
	"tools/add-paper-to-project.js",
	"tools/complete-project-task.js",
	"tools/create-project-note.js",
	"tools/create-project-task.js",
	"tools/delete-project-note.js",
	"tools/edit-project-note.js",
	"tools/get-project-brief.js",
	"tools/get-reader-context.js",
	"tools/get-research-context.js",
	"tools/list-project-tasks.js",
	"tools/list-research-projects.js",
	"tools/list-subscriptions.js",
	"tools/list-tags.js",
	"tools/read-project-notes.js",
	"tools/report-journal-updates.js",
	"tools/save-search-result.js",
	"tools/search-literature.js",
	"tools/search-project-papers.js",
	"tools/subscribe-topic.js",
	"tools/unsubscribe-topic.js",
]);

function readJson(relativePath) {
	return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
}

test("release metadata uses one package and asset version", () => {
	const rootPackage = readJson("package.json");
	const webPackage = readJson("web/package.json");
	assert.equal(rootPackage.name, "dsh-hana-research");
	assert.equal(rootPackage.version, HANA_RELEASE_VERSION);
	assert.equal(webPackage.version, HANA_RELEASE_VERSION);
});

test("package declares an installable Harness bundle", () => {
	const rootPackage = readJson("package.json");
	assert.equal(rootPackage.private, undefined);
	assert.equal(rootPackage.dsh?.bundle?.patch, "./cordis.patch.yml");
	assert.equal(rootPackage.dsh?.client?.platform, "web");
	const patch = fs.readFileSync(path.join(ROOT, "cordis.patch.yml"), "utf8");
	assert.match(patch, /id:\s*hana-research/);
	assert.match(patch, /name:\s*['"]?dsh-hana-research['"]?/);
	const client = fs.readFileSync(path.join(ROOT, "lib/client.js"), "utf8");
	assert.match(client, /id:\s*["']dsh-hana-research["']/);
});

test("runtime dependencies and compatibility are declared", () => {
	const rootPackage = readJson("package.json");
	// node:sqlite (lib/store.js) is only importable without --experimental-sqlite since Node 22.13.
	assert.match(rootPackage.engines?.node ?? "", /^>=22\.13\.0$/);
	// defineTool comes from the host; the exact dev-baseline version (0.1.0-rc.13) is not on
	// public npm, so the peer must stay optional or every bare install fails with ETARGET.
	assert.equal(rootPackage.peerDependencies?.["@deepseek-ai/dsh-tools"], "^0.1.0-rc.13");
	assert.equal(rootPackage.peerDependenciesMeta?.["@deepseek-ai/dsh-tools"]?.optional, true);
});

test("public documentation reports the current release and schema", () => {
	const readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");
	const guide = fs.readFileSync(path.join(ROOT, "docs/USER_GUIDE.md"), "utf8");
	const overview = fs.readFileSync(path.join(ROOT, "docs/PLUGIN_OVERVIEW.md"), "utf8");
	for (const document of [readme, guide, overview]) {
		assert.match(document, new RegExp(HANA_RELEASE_VERSION.replaceAll(".", "\\.")));
		assert.match(document, new RegExp(`schema (?:v)?${RESEARCH_SCHEMA_VERSION}`, "i"));
	}
});

test("community runtime and public docs do not expose author-local paths", () => {
	const publicFiles = [
		"README.md",
		"docs/COMMUNITY_RELEASE_PLAN.md",
		"docs/PLUGIN_OVERVIEW.md",
		"docs/USER_GUIDE.md",
		"lib/index.js",
		"lib/store.js",
		"package.json",
	];
	for (const relativePath of publicFiles) {
		const content = fs.readFileSync(path.join(ROOT, relativePath), "utf8");
		assert.doesNotMatch(content, /C:\\Users\\zhou/i, `${relativePath} contains an author-local path`);
		assert.doesNotMatch(content, /@local\/dsh-hana-research/i, `${relativePath} contains the development package name`);
		assert.doesNotMatch(content, /Chat-SJT|青少年情绪应对/i, `${relativePath} contains an author project`);
	}
	const hostEntry = fs.readFileSync(path.join(ROOT, "lib/index.js"), "utf8");
	assert.doesNotMatch(hostEntry, /dbPath:\s*store\.dbPath/, "health payload must not expose the absolute database path");
});

test("release package is whitelist-only and stays within the size budget", () => {
	const rootPackage = readJson("package.json");
	assert.ok(Array.isArray(rootPackage.files) && rootPackage.files.length > 0, "package.json must declare a files whitelist");

	// npm pack --dry-run is the authoritative source for what a community install receives.
	const dryRun = execFileSync("npm", ["pack", "--dry-run", "--json"], { cwd: ROOT, encoding: "utf8", shell: process.platform === "win32" });
	const packed = JSON.parse(dryRun)[0];
	assert.equal(packed.name, "dsh-hana-research");
	assert.equal(packed.version, HANA_RELEASE_VERSION);

	const allowedRoots = new Set([
		"lib",
		"assets",
		"docs",
		"cordis.patch.yml",
		"tools",
		"README.md",
		"THIRD_PARTY_LICENSES.md",
		"package.json",
	]);
	for (const file of packed.files) {
		const top = file.path.split("/")[0];
		assert.ok(allowedRoots.has(top), `unexpected file in release package: ${file.path}`);
	}
	const tops = new Set(packed.files.map((file) => file.path.split("/")[0]));
	for (const required of ["lib", "assets", "cordis.patch.yml", "tools"]) {
		assert.ok(tops.has(required), `release package must contain ${required}`);
	}
	// tools/ contains dev-only audit scripts; only the runtime agent tools may ship.
	const devToolScripts = packed.files
		.map((file) => file.path)
		.filter((p) => p.startsWith("tools/") && !RUNTIME_TOOL_FILES.has(p));
	assert.deepEqual(devToolScripts, [], `dev-only tool scripts leaked into the package: ${devToolScripts.join(", ")}`);
	for (const forbidden of ["archive", "memory", "tests", "web", "output", "work", "node_modules"]) {
		assert.ok(!tops.has(forbidden), `release package must not contain ${forbidden}`);
	}

	// 30 MB compressed ceiling (R3 acceptance); fonts and wasm dominate the payload.
	assert.ok(packed.size <= 30 * 1024 * 1024, `release package too large: ${(packed.size / 1048576).toFixed(1)} MB`);

	// Regression guard: every tools/*.js module imported by lib/ must ship, or the
	// plugin tree fails to load in a fresh install (caught by the R3 smoke test).
	const packedPaths = new Set(packed.files.map((file) => file.path));
	const libSources = fs.readdirSync(path.join(ROOT, "lib")).filter((name) => name.endsWith(".js"));
	for (const name of libSources) {
		const content = fs.readFileSync(path.join(ROOT, "lib", name), "utf8");
		for (const match of content.matchAll(/["']\.\.\/tools\/([^"']+)["']/g)) {
			const toolPath = `tools/${match[1]}`;
			assert.ok(packedPaths.has(toolPath), `lib/${name} imports ${toolPath} but it is not in the files whitelist`);
		}
	}
});

test("bundled reader ships only the pdfium workbench, not the legacy pdf.js app", () => {
	const bundledAssets = [
		"assets/reader-workbench.js",
		"assets/reader-workbench.css",
		"assets/research.js",
		"assets/research.css",
		"assets/theme-bridge.js",
		"assets/vendor/pdfjs.mjs",
		"assets/vendor/embedpdf/pdfium.wasm",
		"assets/vendor/embedpdf/fonts/NotoSansHans-Regular.otf",
		"assets/vendor/embedpdf/fonts/NotoSansHans-Bold.otf",
	];
	for (const relativePath of bundledAssets) {
		assert.ok(fs.existsSync(path.join(ROOT, relativePath)), `missing bundled asset: ${relativePath}`);
	}
	// The legacy viewer route was removed in R3; its assets must not return to the bundle.
	for (const relativePath of [
		"assets/reader-bridge.js",
		"assets/reader.css",
		"assets/reader-app-bridge.js",
		"assets/reader-app.css",
		"assets/vendor/pdfjs-app",
		"assets/vendor/pdfjs-viewer",
		"assets/vendor/embedpdf/fonts/NotoSansHans-Light.otf",
		"assets/vendor/embedpdf/fonts/NotoSansHans-DemiLight.otf",
		"assets/vendor/embedpdf/fonts/NotoSansHans-Medium.otf",
	]) {
		assert.equal(fs.existsSync(path.join(ROOT, relativePath)), false, `legacy asset must stay out of the bundle: ${relativePath}`);
	}
	const pages = fs.readFileSync(path.join(ROOT, "lib/pages.js"), "utf8");
	assert.doesNotMatch(pages, /reader-legacy/, "legacy reader route must not return");
});
