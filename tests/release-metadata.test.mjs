import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { RESEARCH_SCHEMA_VERSION } from "../lib/store.js";
import { HANA_RELEASE_VERSION } from "../lib/version.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

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
