// 诊断：心理学报官网文章页结构
const url = "https://journal.psych.ac.cn/xlxb/CN/lexeme/showArticleByLexeme.do?articleID=16470";
const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
console.log("status:", r.status, "| type:", r.headers.get("content-type"));
const buf = Buffer.from(await r.arrayBuffer());
console.log("bytes:", buf.length);

const utf8 = buf.toString("utf8");
const titleUtf8 = utf8.match(/<title>([^<]*)<\/title>/);
console.log("utf8 title tag:", titleUtf8?.[1]?.slice(0, 120));

// GBK 解码尝试（如果 utf8 是乱码）
try {
  const gbk = new TextDecoder("gbk").decode(buf);
  const titleGbk = gbk.match(/<title>([^<]*)<\/title>/);
  console.log("gbk title tag:", titleGbk?.[1]?.slice(0, 120));
  const metaGbk = gbk.match(/<meta[^>]*name="citation_title"[^>]*content="([^"]*)"/i);
  console.log("gbk citation_title:", metaGbk?.[1]?.slice(0, 120));
} catch (e) {
  console.log("gbk decode failed:", e.message);
}

// 编码声明
const head = buf.subarray(0, 2000).toString("latin1");
const charset = head.match(/charset=([a-zA-Z0-9-]+)/i);
console.log("charset declared:", charset?.[1]);
const citation = utf8.match(/<meta[^>]*name="citation_title"[^>]*content="([^"]*)"/i);
console.log("utf8 citation_title:", citation?.[1]?.slice(0, 120));
