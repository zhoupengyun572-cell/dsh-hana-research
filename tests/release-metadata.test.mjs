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
	assert.equal(rootPackage.version, HANA_RELEASE_VERSION);
	assert.equal(webPackage.version, HANA_RELEASE_VERSION);
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
