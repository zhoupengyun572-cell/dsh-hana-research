// v44 流式文件响应验证：PDF 附件路由经真实 HTTP 服务返回完整字节与正确响应头。
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { ResearchStore, clearResearchStoreCache } from "../lib/store.js";
import { createApiHandler } from "../lib/api.js";
import { storeUploadedPdf } from "../lib/pdf-import.js";

function makeStore(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-stream-"));
  const store = new ResearchStore(dir, { seedDemoData: true });
  t.after(() => {
    clearResearchStoreCache();
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return store;
}

function makePdfBuffer(marker) {
  const buffer = Buffer.alloc(256 * 1024, 0x20);
  buffer.write("%PDF-1.7\n", 0, "latin1");
  buffer.write(String(marker).padEnd(64, " "), 40, "latin1");
  return buffer;
}

async function listen(t, handler) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${port}`;
}

test("attachment file route streams full payload with correct headers", async (t) => {
  const store = makeStore(t);
  const api = createApiHandler({ logger: { error() {} } }, store);
  const project = store.createProject({ title: "流式验证" });
  const { attachment } = storeUploadedPdf({
    store,
    projectId: project.id,
    buffer: makePdfBuffer("stream-check"),
    originalName: "stream-check.pdf",
    title: "流式验证文献",
  });
  const base = await listen(t, (req, res) => {
    const url = new URL(req.url ?? "/", "http://dsh.local");
    void api.handle(req, res, url);
  });

  const response = await fetch(`${base}/api/hana-research/attachments/${attachment.id}/file`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/pdf");
  const body = Buffer.from(await response.arrayBuffer());
  assert.equal(body.length, Number(response.headers.get("content-length")));
  assert.equal(body.subarray(0, 5).toString("ascii"), "%PDF-");
  assert.ok(body.toString("latin1").includes("stream-check"), "payload contains original bytes");
});

test("missing attachment still returns 404 json", async (t) => {
  const store = makeStore(t);
  const api = createApiHandler({ logger: { error() {} } }, store);
  const base = await listen(t, (req, res) => {
    const url = new URL(req.url ?? "/", "http://dsh.local");
    void api.handle(req, res, url);
  });
  const response = await fetch(`${base}/api/hana-research/attachments/no-such/file`);
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error, "ATTACHMENT_NOT_FOUND");
});
