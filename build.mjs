import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import JavaScriptObfuscator from 'javascript-obfuscator';
import { minify } from 'html-minifier-terser';

const root = dirname(fileURLToPath(import.meta.url));
const outDir = join(root, 'release');

const pages = [
  ['states-of-matter/index.html', '固液气物态变化，平面演示'],
  ['states-of-matter/3d.html', '固液气物态变化，三维演示，打开时需要联网'],
  ['sorting-visualizer/index.html', '几种常见排序算法的过程'],
  ['fractal/index.html', '拖动、缩放，看分形怎么长出来'],
  ['svg-demo/index.html', '用 SVG 画出来的几个小例子'],
];

const titles = {
  'states-of-matter/index.html': '物态变化 · 2D',
  'states-of-matter/3d.html': '物态变化 · 3D',
  'sorting-visualizer/index.html': '排序算法',
  'fractal/index.html': '无限分形',
  'svg-demo/index.html': 'SVG 演示',
};

// 跟 states-of-matter/build.mjs 同一套保守选项：字符串会打乱，但每帧的物理循环不做控制流平坦化。
const obfuscatorOptions = {
  compact: true,
  target: 'browser',
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,
  renameProperties: false,
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 1,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayWrappersCount: 2,
  stringArrayWrappersType: 'function',
  stringArrayCallsTransform: false,
  splitStrings: false,
  unicodeEscapeSequence: false,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  numbersToExpressions: false,
  transformObjectKeys: false,
  selfDefending: false,
  debugProtection: false,
  disableConsoleOutput: false,
  sourceMap: false,
};

const scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;

function scriptType(attrs) {
  const m = attrs.match(/\btype\s*=\s*["']([^"']+)["']/i);
  return m ? m[1].toLowerCase() : '';
}

function shouldObfuscate(attrs) {
  if (/\bsrc\s*=/i.test(attrs)) return false;
  const type = scriptType(attrs);
  if (!type || type === 'module' || type === 'text/javascript' || type === 'application/javascript') return true;
  return false;
}

function declaredFunctions(code) {
  const names = new Set();
  const re = /(?:^|[^.\w$])(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g;
  for (const m of code.matchAll(re)) names.add(m[1]);
  return names;
}

function handlerCallees(html) {
  const names = new Set();
  const attr = /\son[a-z]+\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
  const call = /\b([A-Za-z_$][\w$]*)\s*\(/g;
  for (const m of html.matchAll(attr)) {
    const expr = m[1] ?? m[2] ?? '';
    for (const c of expr.matchAll(call)) names.add(c[1]);
  }
  return names;
}

function obfuscateHtml(html) {
  const reserved = ['__three3d', ...handlerCallees(html)];
  return html.replace(scriptRe, (full, attrs, code) => {
    if (!code.trim() || !shouldObfuscate(attrs)) return full;
    const isModule = scriptType(attrs) === 'module';
    let source = code.replace(/\bwindow\.__three3d\b/g, "window['__three3d']");
    if (!isModule) {
      const needed = [...handlerCallees(html)].filter((name) => declaredFunctions(source).has(name));
      const exports = needed.map((name) => `globalThis[${JSON.stringify(name)}] = ${name};`).join('\n');
      source = `(() => {\n${source}\n${exports}\n})();\n`;
    }
    const js = JavaScriptObfuscator.obfuscate(source, {
      ...obfuscatorOptions,
      reservedStrings: reserved,
    }).getObfuscatedCode();
    return `<script${isModule ? ' type="module"' : ''}>${js}</script>`;
  });
}

function protectSpecialScripts(html) {
  const blocks = [];
  const out = html.replace(/<script\b[^>]*\btype\s*=\s*["'](?:x-shader\/[^"']+|importmap)["'][^>]*>[\s\S]*?<\/script>/gi, (block) => {
    const token = `%%PROTECTED_SCRIPT_${blocks.length}%%`;
    blocks.push(block);
    return token;
  });
  return { html: out, blocks };
}

function restoreSpecialScripts(html, blocks) {
  return html.replace(/%%PROTECTED_SCRIPT_(\d+)%%/g, (_, i) => blocks[Number(i)]);
}

async function buildPage(rel) {
  const src = await readFile(join(root, rel), 'utf8');
  const obfuscated = obfuscateHtml(src);
  const protectedHtml = protectSpecialScripts(obfuscated);
  const minified = await minify(protectedHtml.html, {
    collapseWhitespace: true,
    removeComments: true,
    minifyCSS: true,
    minifyJS: false,
  });
  const html = restoreSpecialScripts(minified, protectedHtml.blocks);
  const dest = join(outDir, rel);
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, html);
  console.log(`${rel}  ${(src.length / 1024).toFixed(1)} KB → ${(html.length / 1024).toFixed(1)} KB`);
  return html;
}

function landingPage() {
  const cards = pages.map(([href, desc]) => {
    const title = titles[href];
    return `<a class="card" href="${href}"><strong>${title}</strong><span>${desc}</span></a>`;
  }).join('\n');
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>learn-anew · 讲解动画</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; padding: 48px 20px 64px;
    font-family: -apple-system, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
    background: #0c1020; color: #e8eefc;
  }
  main { max-width: 720px; margin: 0 auto; }
  h1 { font-size: 32px; margin: 0 0 8px; }
  .lead { margin: 0 0 28px; color: #b7c3de; line-height: 1.6; }
  .cards { display: grid; gap: 12px; }
  a.card {
    display: block; padding: 18px 20px; border-radius: 14px; text-decoration: none; color: inherit;
    background: #171d33; border: 1px solid rgba(255,255,255,.08);
  }
  a.card:hover { border-color: rgba(140,180,255,.45); }
  a.card strong { display: block; font-size: 18px; margin-bottom: 4px; }
  a.card span { color: #9aabc8; font-size: 14px; line-height: 1.5; }
  footer { margin-top: 28px; color: #8b98b3; font-size: 14px; line-height: 1.7; }
  footer a { color: #9ec0ff; }
</style>
</head>
<body>
<main>
  <h1>讲解动画</h1>
  <p class="lead">用浏览器打开就行，不用安装别的软件。点下面任意一个开始看。</p>
  <div class="cards">
${cards}
  </div>
  <footer>
    <p>「物态变化 · 3D」第一次打开需要联网。</p>
    <p>想保存到自己电脑：到 <a href="https://github.com/luckinov/learn-anew/releases/latest">下载页</a> 下载压缩包，解压后双击 <code>index.html</code>。</p>
  </footer>
</main>
</body>
</html>
`;
}

const readme = `learn-anew 讲解动画

用浏览器打开本文件夹里的 index.html 即可，不需要安装开发工具。
建议使用 Chrome、Edge 或 Safari。

「物态变化 · 3D」需要联网，第一次打开会从网上加载三维图形库。

这是方便分享的混淆版。可读的源码在仓库里：
https://github.com/luckinov/learn-anew
`;

function extractScripts(html) {
  return [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].map((m) => ({
    attrs: m[1],
    code: m[2],
    type: scriptType(m[1]),
  }));
}

async function checkSyntax(rel, html) {
  const dir = await mkdtemp(join(tmpdir(), 'learn-anew-'));
  try {
    let i = 0;
    for (const script of extractScripts(html)) {
      if (!shouldObfuscate(script.attrs) || !script.code.trim()) continue;
      const file = join(dir, `s${i++}${script.type === 'module' ? '.mjs' : '.js'}`);
      await writeFile(file, script.code);
      const checked = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
      if (checked.status !== 0) {
        throw new Error(`${rel} 混淆后的脚本语法检查失败\n${checked.stderr}`);
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const built = new Map();
for (const [rel] of pages) built.set(rel, await buildPage(rel));

const indexHtml = landingPage();
await writeFile(join(outDir, 'index.html'), indexHtml);
await writeFile(join(outDir, '使用说明.txt'), readme);
await writeFile(join(outDir, '.nojekyll'), '');

for (const [rel, html] of built) await checkSyntax(rel, html);

const fractal = built.get('fractal/index.html');
if (!fractal.includes('id="vs"') || !fractal.includes('gl_Position') || !fractal.includes('id="fs"')) {
  throw new Error('分形页的着色器被破坏了');
}
const matter3d = built.get('states-of-matter/3d.html');
if (!/from["']three["']/.test(matter3d) || !matter3d.includes('__three3d')) {
  throw new Error('3D 页的模块引用或启动标记丢失了');
}
const sorting = built.get('sorting-visualizer/index.html');
for (const name of ['setMode', 'startSort', 'generateNewArray']) {
  if (!sorting.includes(name)) throw new Error(`排序页按钮函数 ${name} 丢失了`);
}

console.log('release/ 已生成');
