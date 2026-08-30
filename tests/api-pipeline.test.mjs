// v41 API 管线加固验证：非法路径编码返回 400、路由内 404 正确映射、请求体超限透传 413。
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ResearchStore, clearResearchStoreCache } from "../lib/store.js";
import { createApiHandler } from "../lib/api.js";

function makeStore(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-api-pipeline-"));
  const store = new ResearchStore(dir, { seedDemoData: true });
  t.after(() => {
    clearResearchStoreCache();
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return store;
}

function request(api, { method = "GET", pathname, body = null } = {}) {
  const req = {
    method,
    headers: {},
    async *[Symbol.asyncIterator]() {
      if (body) yield Buffer.from(body);
    },
  };
  const res = {
    status: 0,
    headers: {},
    body: null,
    writeHead(status, headers = {}) { this.status = status; this.headers = headers; },
    end(chunk) { this.body = chunk; },
  };
  const url = new URL(`http://dsh.local/api/hana-research${pathname}`);
  return api.handle(req, res, url).then(() => res);
}

test("malformed percent-encoding in path returns 400 instead of hanging", async (t) => {
  const store = makeStore(t);
  const api = createApiHandler({ logger: { error() {} } }, store);
  const response = await request(api, { pathname: "/papers/%ZZ/favorite" });
  assert.equal(response.status, 400);
  assert.equal(JSON.parse(response.body).error, "BAD_REQUEST");
});

test("quality export for missing project maps to 404 PROJECT_NOT_FOUND", async (t) => {
  const store = makeStore(t);
  const api = createApiHandler({ logger: { error() {} } }, store);
  const response = await request(api, { pathname: "/projects/no-such-project/quality/export" });
  assert.equal(response.status, 404);
  const payload = JSON.parse(response.body);
  assert.equal(payload.error, "PROJECT_NOT_FOUND");
  assert.equal(payload.message, "项目不存在");
});

test("oversized request body is answered with 413 UPLOAD_TOO_LARGE", async (t) => {
  const store = makeStore(t);
  const api = createApiHandler({ logger: { error() {} } }, store);
  const oversized = Buffer.alloc(41 * 1024 * 1024 + 1, 0x20);
  const response = await request(api, { method: "POST", pathname: "/projects", body: oversized });
  assert.equal(response.status, 413);
  assert.equal(JSON.parse(response.body).error, "UPLOAD_TOO_LARGE");
});
