import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import JavaScriptObfuscator from 'javascript-obfuscator';
import { minify } from 'html-minifier-terser';

const root = dirname(fileURLToPath(import.meta.url));
const outDir = join(root, 'release');
const repoUrl = 'https://github.com/luckinov/learn-anew';
const releaseUrl = `${repoUrl}/releases/latest`;
const siteUrl = 'https://luckinov.github.io/learn-anew/';

// 上线哪些页、对应哪本课本，都写在各动画目录的 meta.json 里。这里不再手写名单。

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

const repoLinkStyle = `<style>
.learn-anew-links{display:flex;gap:12px;flex-wrap:wrap;justify-content:center;margin:0 0 18px;font-family:-apple-system,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif}
.learn-anew-links a{color:#e7f0ff;background:rgba(8,12,28,.72);border:1px solid rgba(160,190,255,.45);border-radius:999px;padding:10px 16px;min-height:44px;box-sizing:border-box;display:inline-flex;align-items:center;font-size:15px;font-weight:600;text-decoration:none;touch-action:manipulation}
#start .learn-anew-links{flex-shrink:0}
html.light .learn-anew-links a{color:#102033;background:#fff;border-color:#1d4e89}
body>.learn-anew-links{position:fixed;z-index:80;left:50%;bottom:max(16px,env(safe-area-inset-bottom));transform:translateX(-50%);margin:0}
</style>`;

function repoNav(home) {
  return `<nav class="learn-anew-links" aria-label="站点和源码"><a href="${home}">首页</a><a href="${repoUrl}" target="_blank" rel="noopener noreferrer">GitHub</a></nav>`;
}

function insertAfterStart(html, snippet) {
  const open = /<div\s+id=["']start["'][^>]*>/i.exec(html);
  if (!open) return null;
  const at = open.index + open[0].length;
  return html.slice(0, at) + snippet + html.slice(at);
}

function attachRepoLinks(html, rel) {
  const depth = rel.split('/').length - 1;
  const home = `${'../'.repeat(depth)}index.html`;
  const nav = repoNav(home);
  const withStyle = html.includes('</head>')
    ? html.replace('</head>', `${repoLinkStyle}</head>`)
    : `${repoLinkStyle}${html}`;
  const withStart = insertAfterStart(withStyle, nav);
  if (withStart) return withStart;
  if (withStyle.includes('</body>')) return withStyle.replace('</body>', `${nav}</body>`);
  return `${withStyle}${nav}`;
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
  const html = attachRepoLinks(restoreSpecialScripts(minified, protectedHtml.blocks), rel);
  const dest = join(outDir, rel);
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, html);
  console.log(`${rel}  ${(src.length / 1024).toFixed(1)} KB → ${(html.length / 1024).toFixed(1)} KB`);
  return html;
}

const PRIMARY_GRADES = new Set(['一年级', '二年级', '三年级', '四年级', '五年级', '六年级', '低年级', '中年级', '高年级', '不限年级']);
const JUNIOR_GRADES = new Set(['七年级', '八年级', '九年级', '不限年级']);
const SUBJECTS = new Set(['语文', '数学', '英语', '道德与法治', '科学', '物理', '化学', '生物', '历史', '地理', '信息科技', '音乐', '美术', '体育与健康']);
const GRADE_RANK = ['一年级', '二年级', '三年级', '低年级', '四年级', '五年级', '中年级', '六年级', '高年级', '七年级', '八年级', '九年级', '不限年级'];

function fail(folder, message) {
  throw new Error(`${folder}/meta.json：${message}`);
}

function text(folder, obj, key, max) {
  const value = obj?.[key];
  if (typeof value !== 'string' || !value.trim()) fail(folder, `缺少「${key}」`);
  const trimmed = value.trim();
  if ([...trimmed].length > max) fail(folder, `「${key}」请写短一些，不超过 ${max} 个字`);
  return trimmed;
}

function bookLine(book) {
  const grade = book.年级 === '不限年级' ? book.学段 : `${book.学段}${book.年级}`;
  const loosen = book.对应 === '主题' ? '' : ` · ${book.对应}`;
  return `人教版 · ${grade} · ${book.科目} · ${book.主题}${loosen}`;
}

function checkBook(folder, book, index) {
  if (!book || typeof book !== 'object' || Array.isArray(book)) fail(folder, `课本第 ${index + 1} 条不是对象`);
  const edition = text(folder, book, '版本', 20);
  const note = text(folder, book, '说明', 80);
  if (edition === '不对应课文') {
    const extra = Object.keys(book).filter((key) => key !== '版本' && key !== '说明');
    if (extra.length) fail(folder, '标了「不对应课文」就不要再写年级、科目');
    return { 版本: edition, 说明: note, 不对应课文: true };
  }
  if (edition !== '人教版') fail(folder, '版本只写「人教版」。纯试验页写「不对应课文」');
  const stage = text(folder, book, '学段', 4);
  if (stage !== '小学' && stage !== '初中') fail(folder, '学段只写「小学」或「初中」');
  const grade = text(folder, book, '年级', 4);
  const allowed = stage === '小学' ? PRIMARY_GRADES : JUNIOR_GRADES;
  if (!allowed.has(grade)) fail(folder, `${stage}没有「${grade}」。可以写具体年级，也可以写低年级、中年级、高年级、不限年级`);
  const subject = text(folder, book, '科目', 6);
  if (!SUBJECTS.has(subject)) fail(folder, `科目「${subject}」不在名单里。用课本上的科目名，例如科学、物理、数学、信息科技`);
  const topic = text(folder, book, '主题', 20);
  const match = text(folder, book, '对应', 4);
  if (!['笼统', '主题', '拓展'].includes(match)) fail(folder, '对应只写「笼统」「主题」或「拓展」');
  return { 版本: edition, 学段: stage, 年级: grade, 科目: subject, 主题: topic, 对应: match, 说明: note };
}

function checkPage(folder, page, index) {
  if (!page || typeof page !== 'object' || Array.isArray(page)) fail(folder, `页面第 ${index + 1} 条不是对象`);
  const file = text(folder, page, '文件', 40);
  if (file.includes('/') || file.includes('\\') || !file.endsWith('.html')) {
    fail(folder, `「${file}」要写本文件夹里的 html 文件名，不要写路径`);
  }
  const publish = text(folder, page, '发布', 4);
  if (!['在线', '仅下载', '不发布'].includes(publish)) fail(folder, '发布只写「在线」「仅下载」或「不发布」');
  if (typeof page.要联网 !== 'boolean') fail(folder, `${file} 的「要联网」要写 true 或 false`);
  return {
    file,
    title: text(folder, page, '标题', 24),
    desc: text(folder, page, '说明', 40),
    publish,
    needsNet: page.要联网,
  };
}

async function loadTopics() {
  const entries = await readdir(root, { withFileTypes: true });
  const topics = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'release') continue;
    const folder = entry.name;
    const dir = join(root, folder);
    const files = await readdir(dir);
    const htmlFiles = files.filter((name) => name.endsWith('.html')).sort();
    if (htmlFiles.length === 0) continue;

    const metaPath = join(dir, 'meta.json');
    let raw;
    try {
      raw = JSON.parse(await readFile(metaPath, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`${folder} 里有网页，但没有 meta.json。先写好人教版的年级和科目，构建才会通过。`);
      }
      throw new Error(`${folder}/meta.json 不是合法的 JSON\n${error.message}`);
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail(folder, '内容必须是一个对象');
    const id = text(folder, raw, 'id', 40);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || id !== folder) {
      fail(folder, `id 要和文件夹名一样，现在文件夹是 ${folder}`);
    }

    const status = text(folder, raw, '状态', 4);
    if (!['可讲', '草稿', '内部'].includes(status)) fail(folder, '状态只写「可讲」「草稿」或「内部」');
    if (!Array.isArray(raw.课本) || raw.课本.length === 0) fail(folder, '至少写一条课本');
    const books = raw.课本.map((book, index) => checkBook(folder, book, index));
    const unrelated = books.filter((book) => book.不对应课文);
    if (unrelated.length && unrelated.length !== books.length) fail(folder, '不要把「不对应课文」和人教版写在一起');
    if (!Array.isArray(raw.页面) || raw.页面.length === 0) fail(folder, '至少写一个页面');
    const pages = raw.页面.map((page, index) => checkPage(folder, page, index));
    const listed = pages.map((page) => page.file).sort();
    if (new Set(listed).size !== listed.length) fail(folder, '同一个 html 写了两次');
    if (listed.join('\n') !== htmlFiles.join('\n')) {
      fail(folder, `页面名单和文件夹里的 html 不一致。文件夹里有：${htmlFiles.join('、')}`);
    }
    for (const page of pages) {
      page.href = `${folder}/${page.file}`;
    }

    const shipped = pages.some((page) => page.publish !== '不发布');
    if (status === '可讲' && !shipped) fail(folder, '状态是「可讲」，至少有一页要写「在线」或「仅下载」');
    if (status !== '可讲' && shipped) fail(folder, '草稿和内部页面的发布要写「不发布」，确认能讲了再改成「可讲」');
    if (unrelated.length && (status !== '内部' || shipped)) {
      fail(folder, '不对应课文的试验页只能是「内部」，并且不要发布');
    }

    const resources = raw.资源 ?? [];
    if (!Array.isArray(resources) || resources.some((name) => typeof name !== 'string' || name.includes('/') || name.includes('..'))) {
      fail(folder, '资源要写成文件夹名的数组，例如 ["voice"]');
    }
    for (const name of resources) {
      const resourceDir = join(dir, name);
      try {
        const info = await readdir(resourceDir);
        if (!info) fail(folder, `找不到资源文件夹 ${name}`);
      } catch (error) {
        if (error.code === 'ENOTDIR' || error.code === 'ENOENT') fail(folder, `找不到资源文件夹 ${name}`);
        throw error;
      }
    }

    topics.push({
      id,
      folder,
      title: text(folder, raw, '标题', 20),
      blurb: text(folder, raw, '一句话', 40),
      status,
      books,
      pages,
      resources,
    });
  }
  return topics;
}

function landingPage(onlinePages, downloadPages) {
  const rank = (page) => {
    const grade = page.books.find((book) => !book.不对应课文)?.年级;
    const index = GRADE_RANK.indexOf(grade);
    return index === -1 ? GRADE_RANK.length : index;
  };
  const cards = [...onlinePages].sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title, 'zh')).map((page) => {
    const books = page.books.filter((book) => !book.不对应课文).map((book) => `<em>${bookLine(book)}</em>`).join('');
    return `<a class="card" href="${page.href}"><strong>${page.title}</strong>${books}<span>${page.desc}</span></a>`;
  }).join('\n');
  const net = onlinePages.filter((page) => page.needsNet).map((page) => page.title);
  const netLine = net.length
    ? `<p>这些页面第一次打开需要联网：${net.join('、')}。用到的组件下载完就能看。</p>`
    : '';
  const offline = downloadPages.map((page) => `<code>${page.href}</code>（${page.title}）`).join('、');
  const offlineLine = offline
    ? `<p>想保存到自己电脑：到 <a href="${releaseUrl}">下载页</a> 下载压缩包，解压后双击 <code>index.html</code>。压缩包里还有：${offline}。这些页不放在线。</p>`
    : `<p>想保存到自己电脑：到 <a href="${releaseUrl}">下载页</a> 下载压缩包，解压后双击 <code>index.html</code>。</p>`;
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
  .lead { margin: 0 0 8px; color: #b7c3de; line-height: 1.6; }
  .cards { display: grid; gap: 12px; }
  a.card {
    display: block; padding: 18px 20px; border-radius: 14px; text-decoration: none; color: inherit;
    background: #171d33; border: 1px solid rgba(255,255,255,.08);
  }
  a.card:hover { border-color: rgba(140,180,255,.45); }
  a.card strong { display: block; font-size: 18px; margin-bottom: 4px; }
  a.card em { display: block; margin-top: 6px; color: #9ec0ff; font-style: normal; font-size: 13px; }
  a.card span { display: block; margin-top: 6px; color: #9aabc8; font-size: 14px; line-height: 1.5; }
  .repo { margin: 0 0 28px; color: #9aabc8; font-size: 15px; line-height: 1.7; }
  .repo a, footer a { color: #9ec0ff; }
  footer { margin-top: 28px; color: #8b98b3; font-size: 14px; line-height: 1.7; }
</style>
</head>
<body>
<main>
  <h1>讲解动画</h1>
  <p class="lead">用浏览器打开就行，不用安装别的软件。卡片上的年级和科目按人教版笼统标好，方便对着课本讲，不精确到某一课。</p>
  <p class="repo">源码在 <a href="${repoUrl}">GitHub</a>。仓库首页写着在线地址，从那边可以回到这里。</p>
  <div class="cards">
${cards}
  </div>
  <footer>
    ${netLine}
    ${offlineLine}
    <p>协议：<a href="https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh">知识共享 署名-非商业性使用-相同方式共享 4.0</a>。课堂和学习可以用，请勿商用。</p>
  </footer>
</main>
</body>
</html>
`;
}

function usageText(onlinePages, downloadPages) {
  const net = onlinePages.filter((page) => page.needsNet).map((page) => `「${page.title}」`).join('、');
  const netLine = net ? `${net}需要联网，第一次打开会从网上加载用到的组件。\n` : '';
  const offline = downloadPages.map((page) => `${page.href}（${page.title}）`).join('\n');
  const offlineLine = offline ? `这些页只在压缩包里，在线页面不放：\n${offline}\n` : '';
  return `learn-anew 讲解动画

用浏览器打开本文件夹里的 index.html 即可，不需要安装开发工具。
建议使用 Chrome、Edge 或 Safari。

首页卡片上的年级和科目，按人教版笼统标注，方便对着课本讲，不精确到某一课。

${netLine}${offlineLine}
这是方便分享的混淆版。开场画面上的「首页」回到本文件夹，「GitHub」打开源码：
${repoUrl}

在线页面：
${siteUrl}

协议：知识共享 署名-非商业性使用-相同方式共享 4.0（CC BY-NC-SA 4.0）。
可以在课堂和学习中使用、修改并分享。请保留署名。不要用于商业用途。
说明：https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh
法律文本在同目录的 LICENSE。
`;
}

function catalogJson(topics) {
  const entries = topics.filter((topic) => topic.status === '可讲').map((topic) => ({
    id: topic.id,
    标题: topic.title,
    一句话: topic.blurb,
    课本: topic.books.map(({ 不对应课文, ...book }) => book),
    页面: topic.pages.filter((page) => page.publish !== '不发布').map((page) => ({
      文件: page.href,
      标题: page.title,
      说明: page.desc,
      发布: page.publish,
      要联网: page.needsNet,
    })),
  }));
  return {
    说明: '年级和科目按人教版笼统对应，不精确到某一课。',
    条目: entries,
  };
}

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

async function checkNarration(topic) {
  for (const name of topic.resources) {
    const manifestPath = join(root, topic.folder, name, 'manifest.json');
    let raw;
    try {
      raw = await readFile(manifestPath, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    const manifest = JSON.parse(raw);
    if (!manifest.version || !Array.isArray(manifest.lines) || manifest.lines.length === 0) {
      throw new Error(`${topic.folder}/${name}/manifest.json 不是有效的讲解清单`);
    }
  }
}

const topics = await loadTopics();
if (!topics.some((topic) => topic.pages.some((page) => page.publish === '在线'))) {
  throw new Error('没有任何「在线」页面，首页会是空的');
}

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const onlinePages = [];
const downloadPages = [];
const built = new Map();
const sources = new Map();
for (const topic of topics) {
  const shipped = topic.pages.filter((page) => page.publish !== '不发布');
  if (shipped.length === 0) {
    console.log(`${topic.folder}  ${topic.status}，不发布`);
    continue;
  }
  await checkNarration(topic);
  for (const name of topic.resources) {
    await cp(join(root, topic.folder, name), join(outDir, topic.folder, name), { recursive: true });
  }
  for (const page of shipped) {
    page.books = topic.books;
    sources.set(page.href, await readFile(join(root, page.href), 'utf8'));
    built.set(page.href, await buildPage(page.href));
    if (page.publish === '在线') onlinePages.push(page);
    else downloadPages.push(page);
  }
}

const indexHtml = landingPage(onlinePages, downloadPages);
if (!indexHtml.includes(`href="${repoUrl}"`)) {
  throw new Error('首页没有链到 GitHub 仓库');
}
await writeFile(join(outDir, 'index.html'), indexHtml);
await writeFile(join(outDir, '使用说明.txt'), usageText(onlinePages, downloadPages));
await writeFile(join(outDir, 'catalog.json'), `${JSON.stringify(catalogJson(topics), null, 2)}\n`);
await writeFile(join(outDir, '.nojekyll'), '');
await cp(join(root, 'LICENSE'), join(outDir, 'LICENSE'));

for (const [rel, html] of built) {
  const home = `${'../'.repeat(rel.split('/').length - 1)}index.html`;
  if (!html.includes('class="learn-anew-links"') || !html.includes(`href="${home}"`) || !html.includes(`href="${repoUrl}"`)) {
    throw new Error(`${rel} 没有链回首页和 GitHub`);
  }
  await checkSyntax(rel, html);
}

for (const [rel, html] of built) {
  const source = sources.get(rel);
  if (source.includes('__three3d') && (!/from["']three["']/.test(html) || !html.includes('__three3d'))) {
    throw new Error(`${rel} 的三维模块引用或启动标记丢失了`);
  }
}

console.log('release/ 已生成');
