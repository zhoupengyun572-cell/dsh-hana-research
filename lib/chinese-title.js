// 国内期刊官网中文标题补全。
//
// 背景：OpenAlex/Crossref 对国内期刊只提供英文翻译题录（language: en，
// 无中文标题字段），导致心理学报/心理科学进展的同步文献在列表中显示英文。
// 这些期刊官网（journal.psych.ac.cn）文章页是 UTF-8 中文，<title> 即中文标题，
// 可据此补全，覆盖翻译题录。
//
// 幂等性：仅当标题不含中文字符时才补抓；补全后标题含中文，后续同步自动跳过。

const CN_TITLE_HOST = "journal.psych.ac.cn";

/** 需要中文标题补全的期刊源（venue 名）。 */
export const CN_TITLE_JOURNALS = new Set(["心理学报", "心理科学进展"]);

const REQUEST_TIMEOUT_MS = 15_000;
const USER_AGENT = "HanaResearch/0.2 (+local research library)";

/**
 * 从文献记录推导官网文章页 URL：
 * 1) 官网 PDF 直链（downloadArticleFile.do?id=xxx）→ 文章页 showArticleByLexeme.do?articleID=xxx；
 * 2) 心理学报 DOI（10.3724/SP.J.1041.*）→ 官网 DOI 落地页。
 * 无法推导返回 null。
 */
export function officialArticlePageUrl(record) {
  const pdfUrl = String(record?.pdfUrl || "");
  const pdfMatch = /journal\.psych\.ac\.cn\/(xlxb|xlkxjz)\/CN\/article\/downloadArticleFile\.do\?[^]*?id=(\d+)/i.exec(pdfUrl);
  if (pdfMatch) {
    return `https://${CN_TITLE_HOST}/${pdfMatch[1]}/CN/lexeme/showArticleByLexeme.do?articleID=${pdfMatch[2]}`;
  }
  const doi = String(record?.doi || "");
  const doiMatch = /^10\.3724\/SP\.J\.1041\./i.test(doi);
  if (doiMatch) {
    return `https://${CN_TITLE_HOST}/xlxb/CN/${doi}`;
  }
  return null;
}

/**
 * 抓取官网文章页并解析中文标题。
 * 失败或标题不含中文字符时返回 null（保持英文题录）。
 */
export async function fetchChineseTitle(articleUrl, timeoutMs = REQUEST_TIMEOUT_MS) {
  try {
    const res = await fetch(articleUrl, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,*/*" },
    });
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength > 1024 * 1024) return null;
    const html = buffer.toString("utf8");
    const match = html.match(/<title>([\s\S]*?)<\/title>/i);
    if (!match) return null;
    const cleaned = String(match[1])
      .replace(/\s+/g, " ")
      .replace(/[|｜]\s*[^|｜]*$/, "") // 去掉站点后缀（如 " | 心理学报"）
      .trim();
    if (!/[\u4e00-\u9fa5]/.test(cleaned)) return null;
    return cleaned.slice(0, 500);
  } catch {
    return null;
  }
}

/** 小睡（官网请求节流）。 */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
