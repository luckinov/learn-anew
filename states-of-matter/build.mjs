import { readFile, writeFile, mkdir } from 'node:fs/promises';
import JavaScriptObfuscator from 'javascript-obfuscator';
import { minify } from 'html-minifier-terser';

const src = await readFile(new URL('./index.html', import.meta.url), 'utf8');
const m = src.match(/<script>([\s\S]*?)<\/script>/);
if (!m) throw new Error('index.html 中找不到 <script>');

// 包进闭包，让顶层声明变成局部变量，才能被重命名
const js = JavaScriptObfuscator.obfuscate(`(() => {\n${m[1]}\n})();`, {
  compact: true,
  target: 'browser',
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,
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
  // 下面几项会拖慢每帧几十万次的物理/绘制循环，保持关闭
  controlFlowFlattening: false,
  deadCodeInjection: false,
  numbersToExpressions: false,
  transformObjectKeys: false,
  selfDefending: false,
  debugProtection: false,
  disableConsoleOutput: false,
}).getObfuscatedCode();

const html = await minify(src.replace(m[0], () => `<script>${js}</script>`), {
  collapseWhitespace: true,
  removeComments: true,
  minifyCSS: true,
  minifyJS: false,
});

await mkdir(new URL('./release/', import.meta.url), { recursive: true });
await writeFile(new URL('./release/index.html', import.meta.url), html);
console.log(`release/index.html  ${(src.length / 1024).toFixed(1)} KB → ${(html.length / 1024).toFixed(1)} KB`);
