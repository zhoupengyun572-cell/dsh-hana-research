// 静态检查：useCallback/useMemo/useEffect 的依赖数组里是否引用了「在之后声明」的 const。
import fs from 'node:fs';
const src = fs.readFileSync('web/src/app.jsx', 'utf8');
const lines = src.split('\n');

const decls = new Map(); // name -> line (1-based) of `const NAME = use...`
for (let i = 0; i < lines.length; i++) {
  const m = /^\s*(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(useCallback|useMemo|useEffect|useRef|useState)/.exec(lines[i]);
  if (m) decls.set(m[1], i + 1);
}

const problems = [];
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  // 依赖数组：[a, b, c]
  const m = /(useCallback|useMemo|useEffect)\(\s*[^]*?\[\s*([^\]]*)\]/.exec(line);
  if (!m) continue;
  const deps = m[2].split(',').map(s => s.trim()).filter(Boolean);
  for (const dep of deps) {
    const declLine = decls.get(dep);
    if (declLine && declLine > i + 1) {
      problems.push(`line ${i + 1}: dep '${dep}' declared at line ${declLine} (TDZ risk)`);
    }
  }
}
// 也检查函数体内直接引用（不在 deps 中，靠闭包）：跳过——闭包在调用期求值，无 TDZ。
console.log(problems.length ? problems.join('\n') : 'NO TDZ ISSUES');
process.exit(problems.length ? 1 : 0);
