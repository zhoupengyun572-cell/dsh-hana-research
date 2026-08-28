// R5 security regressions: PDF download allowlist and SSRF guards.
// Run: node --test tests/security.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import dns from "node:dns";
import {
	fetchPdfFollowingValidatedRedirects,
	PdfImportError,
} from "../lib/pdf-import.js";

function fakePdfBuffer() {
	const buffer = Buffer.alloc(2048, 0x20);
	buffer.write("%PDF-1.7\n", 0, "latin1");
	return buffer;
}

function response({ status = 200, location = null, contentType = "application/pdf", body = fakePdfBuffer() }) {
	const bytes = body instanceof Buffer ? body : Buffer.from(body);
	return {
		status,
		ok: status >= 200 && status < 300,
		headers: {
			get(name) {
				if (String(name).toLowerCase() === "location") return location;
				if (String(name).toLowerCase() === "content-type") return contentType;
				return null;
			},
		},
		arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
	};
}

/** 用受控解析器替换 dns.promises.lookup，并保证测试结束后恢复。 */
function stubDns(t, address = "203.0.113.10") {
	const original = dns.promises.lookup;
	dns.promises.lookup = async () => [{ address, family: 4 }];
	t.after(() => {
		dns.promises.lookup = original;
	});
}

function stubFetch(t, handler) {
	const original = globalThis.fetch;
	const calls = [];
	globalThis.fetch = async (url, options) => {
		calls.push({ url: String(url), options });
		return handler(calls.length, String(url));
	};
	t.after(() => {
		globalThis.fetch = original;
	});
	return calls;
}

test("redirect hop outside the allowlist is blocked before the request", async (t) => {
	stubDns(t);
	const calls = stubFetch(t, () => response({ status: 302, location: "https://evil.example/x.pdf" }));
	await assert.rejects(
		() => fetchPdfFollowingValidatedRedirects("https://good.example/paper.pdf", ["good.example"]),
		(error) => error instanceof PdfImportError && error.code === "PLUGIN_NETWORK_HOST_NOT_ALLOWED",
	);
	assert.equal(calls.length, 1, "only the initial allowlisted hop may hit the network");
});

test("redirect hop inside the allowlist is followed", async (t) => {
	stubDns(t);
	const calls = stubFetch(t, (n) =>
		n === 1
			? response({ status: 302, location: "https://mirror.good.example/paper.pdf" })
			: response({ status: 200 }),
	);
	const result = await fetchPdfFollowingValidatedRedirects("https://good.example/paper.pdf", [
		"good.example",
		"*.good.example",
	]);
	assert.equal(result.finalUrl, "https://mirror.good.example/paper.pdf");
	assert.equal(calls.length, 2);
});

test("private IP literal hosts are rejected without any request", async (t) => {
	stubDns(t);
	const calls = stubFetch(t, () => {
		throw new Error("fetch must not be called for a private host");
	});
	for (const host of ["127.0.0.1", "10.1.2.3", "192.168.0.9", "169.254.1.1", "[::1]"]) {
		await assert.rejects(
			() => fetchPdfFollowingValidatedRedirects(`https://${host}/paper.pdf`, ["good.example"]),
			(error) => error instanceof PdfImportError && error.code === "PLUGIN_NETWORK_HOST_NOT_ALLOWED",
			`${host} must be rejected by the allowlist`,
		);
	}
	assert.equal(calls.length, 0);
});

test("hostnames resolving to private addresses are rejected", async (t) => {
	stubDns(t, "192.168.1.5");
	const calls = stubFetch(t, () => {
		throw new Error("fetch must not be called for a private target");
	});
	await assert.rejects(
		() => fetchPdfFollowingValidatedRedirects("https://internal.example/paper.pdf", ["internal.example"]),
		(error) => error instanceof PdfImportError && error.code === "PLUGIN_NETWORK_PRIVATE_HOST_FORBIDDEN",
	);
	assert.equal(calls.length, 0);
});

test("insecure (non-HTTPS) download targets are rejected", async (t) => {
	stubDns(t);
	stubFetch(t, () => {
		throw new Error("fetch must not be called for insecure targets");
	});
	await assert.rejects(
		() => fetchPdfFollowingValidatedRedirects("http://good.example/paper.pdf", ["good.example"]),
		PdfImportError,
	);
});
