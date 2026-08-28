// 阅读工作区构建脚本：esbuild 打包 React + EmbedPDF + Tiptap → 插件静态资产。
// 同时把 PDFium WASM 与中文字体从 node_modules 拷贝到 assets/vendor/embedpdf/（自托管，禁 CDN）。
import { build, context } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT_DIR = path.join(ROOT, 'assets');
const VENDOR_OUT = path.join(OUT_DIR, 'vendor', 'embedpdf');

const watch = process.argv.includes('--watch');

async function copyVendorAssets() {
  fs.mkdirSync(path.join(VENDOR_OUT, 'fonts'), { recursive: true });
  const pdfiumWasm = path.join(HERE, 'node_modules', '@embedpdf', 'pdfium', 'dist', 'pdfium.wasm');
  fs.copyFileSync(pdfiumWasm, path.join(VENDOR_OUT, 'pdfium.wasm'));
  const fontsDir = path.join(HERE, 'node_modules', '@embedpdf', 'fonts-sc', 'fonts');
  if (fs.existsSync(fontsDir)) {
    for (const file of fs.readdirSync(fontsDir)) {
      if (file.endsWith('.otf')) {
        fs.copyFileSync(path.join(fontsDir, file), path.join(VENDOR_OUT, 'fonts', file));
      }
    }
  } else {
    // fonts-sc 不是 snippet 的直接依赖时，从嵌套依赖目录解析
    const candidates = [
      path.join(HERE, 'node_modules', '.pnpm'),
    ];
    console.warn('[build] fonts-sc 未安装：中文 fallback 字体未拷贝（不影响英文 PDF；建议 npm i @embedpdf/fonts-sc@1.0.0）');
  }
  console.log('[build] vendor assets copied →', path.relative(ROOT, VENDOR_OUT));
}

const buildOptions = {
  entryPoints: [path.join(HERE, 'src', 'main.jsx')],
  outfile: path.join(OUT_DIR, 'reader-workbench.js'),
  bundle: true,
  format: 'esm',
  target: ['chrome105', 'edge105', 'firefox115'],
  jsx: 'automatic',
  minify: !watch,
  sourcemap: watch,
  charset: 'utf8',
  logLevel: 'info',
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  loader: {
    '.otf': 'file',
    '.wasm': 'file',
    '.woff': 'file',
    '.woff2': 'file',
  },
};

async function run() {
  await copyVendorAssets();
  if (watch) {
    const ctx = await context(buildOptions);
    await ctx.watch();
    console.log('[build] watching…');
    return ctx;
  }
  const result = await build(buildOptions);
  const out = result.outputFiles || [];
  for (const file of out) {
    console.log('[build]', path.relative(ROOT, file.path), (file.contents.length / 1024).toFixed(1) + 'KB');
  }
  console.log('[build] done → assets/reader-workbench.js');
}

run().catch((error) => {
  console.error('[build] FAILED:', error);
  process.exit(1);
});
