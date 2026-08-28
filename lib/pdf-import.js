import crypto from 'node:crypto';
import dns from 'node:dns';
import fs from 'node:fs';
import path from 'node:path';
import { isHostAllowed } from './literature-search.js';
import { resolveOfficialDownloadUrl } from './official-download.js';

const MAX_PDF_BYTES = 40 * 1024 * 1024;
const MAX_REDIRECTS = 5;
/** Unpaywall 查询邮箱（其免费 API 要求携带 email 参数）。 */
const UNPAYWALL_EMAIL = 'research@dsh.local';

/**
 * 本地网络兼容层（DSH 移植）：替代 OpenHanako 的 ctx.network.fetch。
 * 保留宿主语义：手动重定向（redirect: 'manual'）、超时、体积上限；
 * 并在宿主缺失 network 沙箱时自行兜底：逐调用主机白名单 + 私网地址拦截。
 * 返回 { status, ok, headers, buffer }。
 */
async function pdfFetch(url, { timeoutMs, maxBytes, headers, allowedHosts }) {
  const target = new URL(url);
  if (target.protocol !== 'https:') {
    throw forbiddenHostError('PLUGIN_NETWORK_HOST_NOT_ALLOWED', 'PDF 下载仅允许 HTTPS 地址');
  }
  if (allowedHosts && !isHostAllowed(target.href, allowedHosts)) {
    throw forbiddenHostError('PLUGIN_NETWORK_HOST_NOT_ALLOWED', '该 PDF 来源尚未进入允许下载的开放获取来源列表');
  }
  await assertPublicHost(target.hostname);
  const res = await fetch(target.href, {
    method: 'GET',
    redirect: 'manual',
    signal: AbortSignal.timeout(timeoutMs),
    headers,
  });
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.byteLength > maxBytes) {
    const error = new Error(`response exceeds ${maxBytes} bytes`);
    error.code = 'PLUGIN_NETWORK_RESPONSE_TOO_LARGE';
    throw error;
  }
  return { status: res.status, ok: res.ok, headers: res.headers, buffer };
}

function forbiddenHostError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

/** 解析主机名并拒绝解析到本机/内网/链路本地地址的目标（防 SSRF）。 */
async function assertPublicHost(hostname) {
  const lowered = String(hostname || '').toLowerCase();
  if (isPrivateAddress(lowered.replace(/^\[|\]$/g, ''))) {
    throw forbiddenHostError('PLUGIN_NETWORK_PRIVATE_HOST_FORBIDDEN', '出于安全原因，不能从本机或内网地址下载 PDF');
  }
  let addresses;
  try {
    addresses = await dns.promises.lookup(lowered, { all: true });
  } catch {
    throw forbiddenHostError('PLUGIN_NETWORK_HOST_NOT_ALLOWED', 'PDF 来源地址无法解析');
  }
  if (!addresses.length || addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw forbiddenHostError('PLUGIN_NETWORK_PRIVATE_HOST_FORBIDDEN', '出于安全原因，不能从本机或内网地址下载 PDF');
  }
}

function isPrivateAddress(address) {
  const value = String(address || '').toLowerCase();
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(value);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if ([a, b, Number(v4[3]), Number(v4[4])].some((n) => n > 255)) return true;
    if (a === 0 || a === 10 || a === 127) return true; // unspecified / private / loopback
    if (a === 169 && b === 254) return true; // link-local
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a === 198 && (b === 18 || b === 19)) return true; // benchmark
    if (a >= 224) return true; // multicast + reserved
    return false;
  }
  if (!value.includes(':')) return false; // not an IP literal; DNS path
  if (value === '::' || value === '::1') return true;
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(value);
  if (mapped) return isPrivateAddress(mapped[1]);
  if (/^f[cd][0-9a-f]{2}:/.test(value)) return true; // fc00::/7 unique local
  if (/^fe[89ab][0-9a-f]:/.test(value)) return true; // fe80::/10 link local
  if (/^ff/.test(value)) return true; // multicast
  return false;
}

export class PdfImportError extends Error {
  constructor(code, message, status = 400, details = {}) {
    super(message);
    this.name = 'PdfImportError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/**
 * 解析这篇文献可合法下载的 PDF 地址（按优先级）：
 * 1. 文献自带 pdfUrl 且主机在下载白名单内 → 直接使用；
 * 2. 期刊官网直连规则（如心理学报/心理科学进展官网的开放下载接口）；
 * 3. 按 DOI 查询 Unpaywall（开放获取聚合），取 OA PDF 链接（须在白名单内）；
 * 4. 都没有 → 返回 null（订阅制文献，无法合法下载）。
 */
export async function resolveDownloadablePdf({ paper, allowedHosts = [] }) {
  let direct = null;
  try {
    direct = normalizeHttpsUrl(paper?.pdfUrl);
  } catch {
    direct = null;
  }
  if (direct && isHostAllowed(direct, allowedHosts)) return direct;

  const official = resolveOfficialDownloadUrl(paper);
  if (official && isHostAllowed(official, allowedHosts)) return official;

  const doi = String(paper?.doi || '').trim();
  if (!doi) return null;
  try {
    const url = `https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=${encodeURIComponent(UNPAYWALL_EMAIL)}`;
    const response = await pdfFetch(url, {
      timeoutMs: 20_000,
      maxBytes: 2 * 1024 * 1024,
      headers: { Accept: 'application/json' },
      allowedHosts: ['api.unpaywall.org'],
    });
    if (!response.ok) return null;
    const data = JSON.parse(response.buffer.toString('utf8'));
    const candidates = [
      data?.best_oa_location?.url_for_pdf,
      ...(Array.isArray(data?.oa_locations) ? data.oa_locations.map(location => location?.url_for_pdf) : []),
    ].filter(Boolean);
    for (const candidate of candidates) {
      if (isHostAllowed(candidate, allowedHosts)) return candidate;
    }
    return null;
  } catch {
    return null;
  }
}

export async function downloadAndStorePdf({ store, projectId, paper, allowedHosts = [] }) {
  const project = store.getProject(projectId);
  if (!project) throw new PdfImportError('PROJECT_NOT_FOUND', '目标项目不存在', 404);

  const pdfUrl = await resolveDownloadablePdf({ paper, allowedHosts });
  if (!pdfUrl) {
    throw new PdfImportError(
      'NO_PDF_SOURCE',
      '该文献暂无开放获取 PDF 版本（可能为订阅制），可先作为元数据收藏或加入项目。',
      404,
    );
  }

  const reusable = store.findReusableAttachment({ ...paper, pdfUrl });
  if (reusable) {
    return {
      ...store.linkExistingAttachment({ projectId, paper: { ...paper, pdfUrl }, attachment: reusable }),
      reused: true,
    };
  }

  const downloaded = await fetchPdfFollowingValidatedRedirects(pdfUrl, allowedHosts);
  const sha256 = crypto.createHash('sha256').update(downloaded.buffer).digest('hex');
  const fileName = safePdfFileName(paper?.title, sha256);
  const relativePath = path.join('library', 'pdfs', `${sha256}.pdf`);
  const absolutePath = store.resolveAttachmentPath(relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeAtomicIfMissing(absolutePath, downloaded.buffer);

  try {
    return {
      ...store.importPaperAttachment({
        projectId,
        paper: { ...paper, pdfUrl },
        attachment: {
          fileName,
          relativePath,
          byteSize: downloaded.buffer.byteLength,
          sha256,
          sourceUrl: downloaded.finalUrl,
        },
      }),
      reused: false,
    };
  } catch (error) {
    if (!store.findReusableAttachment({ ...paper, pdfUrl })) {
      try { fs.unlinkSync(absolutePath); } catch {}
    }
    throw error;
  }
}

export function storeUploadedPdf({ store, projectId, buffer, originalName, title }) {
  const pdfBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  assertPdfBuffer(pdfBuffer, 'application/pdf');
  const project = store.getProject(projectId);
  if (!project) throw new PdfImportError('PROJECT_NOT_FOUND', '目标项目不存在', 404);

  const sha256 = crypto.createHash('sha256').update(pdfBuffer).digest('hex');
  const reusable = store.findAttachmentBySha256(sha256);
  const cleanTitle = String(title || originalName || '本地 PDF').replace(/\.pdf$/i, '').trim().slice(0, 500) || '本地 PDF';
  const paper = reusable
    ? store.getPaper(reusable.matched_paper_id)
    : {
        id: `local-${sha256.slice(0, 24)}`,
        title: cleanTitle,
        authors: '',
        venue: '本地 PDF',
        topic: '未分类',
        sourceName: '本地上传',
      };

  if (reusable) {
    return {
      ...store.linkExistingAttachment({ projectId, paper, attachment: reusable }),
      reused: true,
    };
  }

  const fileName = safePdfFileName(cleanTitle, sha256);
  const relativePath = path.join('library', 'pdfs', `${sha256}.pdf`);
  const absolutePath = store.resolveAttachmentPath(relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeAtomicIfMissing(absolutePath, pdfBuffer);
  try {
    return {
      ...store.importPaperAttachment({
        projectId,
        paper,
        attachment: {
          fileName,
          relativePath,
          byteSize: pdfBuffer.byteLength,
          sha256,
          sourceUrl: `local-upload:${encodeURIComponent(String(originalName || fileName).slice(0, 240))}`,
        },
      }),
      reused: false,
    };
  } catch (error) {
    if (!store.findAttachmentBySha256(sha256)) {
      try { fs.unlinkSync(absolutePath); } catch {}
    }
    throw error;
  }
}

export async function fetchPdfFollowingValidatedRedirects(initialUrl, allowedHosts = []) {
  let currentUrl = normalizeHttpsUrl(initialUrl);
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    let response;
    try {
      // 每一跳都重新执行白名单与私网校验：初始 URL 合法不代表重定向目标合法。
      response = await pdfFetch(currentUrl, {
        timeoutMs: 30_000,
        maxBytes: MAX_PDF_BYTES,
        headers: {
          Accept: 'application/pdf,application/octet-stream;q=0.9',
          'User-Agent': 'HanaResearch/0.2 (+local research library)',
        },
        allowedHosts,
      });
    } catch (error) {
      throw new PdfImportError(
        error?.code || 'PDF_DOWNLOAD_FAILED',
        humanizeNetworkError(error),
        error?.code?.includes('NOT_ALLOWED') || error?.code?.includes('FORBIDDEN') ? 403 : 502,
      );
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new PdfImportError('PDF_REDIRECT_INVALID', 'PDF 下载地址返回了无目标的重定向', 502);
      if (redirectCount === MAX_REDIRECTS) throw new PdfImportError('PDF_REDIRECT_LIMIT', 'PDF 下载重定向次数过多', 502);
      currentUrl = normalizeHttpsUrl(new URL(location, currentUrl).href);
      continue;
    }

    if (!response.ok) {
      throw new PdfImportError('PDF_DOWNLOAD_HTTP_ERROR', `PDF 下载失败（HTTP ${response.status}）`, 502, {
        status: response.status,
      });
    }

    assertPdfBuffer(response.buffer, response.headers.get('content-type'));
    return { buffer: response.buffer, finalUrl: currentUrl };
  }
  throw new PdfImportError('PDF_REDIRECT_LIMIT', 'PDF 下载重定向次数过多', 502);
}

export function assertPdfBuffer(buffer, contentType = '') {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8) {
    throw new PdfImportError('PDF_EMPTY', '下载结果为空或不是有效 PDF', 422);
  }
  if (buffer.length > MAX_PDF_BYTES) {
    throw new PdfImportError('PDF_TOO_LARGE', 'PDF 超过 40 MB 的当前导入上限', 413);
  }
  const headerWindow = buffer.subarray(0, Math.min(buffer.length, 1024)).toString('latin1');
  if (!headerWindow.includes('%PDF-')) {
    const received = String(contentType || '').split(';')[0].trim() || 'unknown';
    throw new PdfImportError('PDF_SIGNATURE_INVALID', `下载内容不是 PDF（${received}）`, 422);
  }
}

export function safePdfFileName(title, sha256) {
  const cleaned = String(title || 'paper')
    .normalize('NFKC')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 110);
  return `${cleaned || 'paper'}-${String(sha256).slice(0, 8)}.pdf`;
}

function normalizeHttpsUrl(value) {
  let url;
  try {
    url = new URL(String(value || '').trim());
  } catch {
    throw new PdfImportError('PDF_URL_INVALID', 'PDF 地址无效', 400);
  }
  if (url.protocol !== 'https:') throw new PdfImportError('PDF_URL_INSECURE', 'PDF 下载仅允许 HTTPS 地址', 400);
  url.username = '';
  url.password = '';
  url.hash = '';
  return url.href;
}

function writeAtomicIfMissing(targetPath, buffer) {
  if (fs.existsSync(targetPath)) return;
  const tempPath = `${targetPath}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(tempPath, buffer, { flag: 'wx' });
    try {
      fs.renameSync(tempPath, targetPath);
    } catch (error) {
      if (!fs.existsSync(targetPath)) throw error;
      fs.unlinkSync(tempPath);
    }
  } finally {
    if (fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath); } catch {}
    }
  }
}

function humanizeNetworkError(error) {
  const code = String(error?.code || '');
  if (code === 'PLUGIN_NETWORK_HOST_NOT_ALLOWED') return '该 PDF 来源尚未进入允许下载的开放获取来源列表';
  if (code === 'PLUGIN_NETWORK_PRIVATE_HOST_FORBIDDEN') return '出于安全原因，不能从本机或内网地址下载 PDF';
  if (code === 'PLUGIN_NETWORK_RESPONSE_TOO_LARGE') return 'PDF 超过 40 MB 的当前导入上限';
  if (error?.name === 'AbortError') return 'PDF 下载超时';
  return 'PDF 下载失败，请检查来源地址或网络连接';
}
