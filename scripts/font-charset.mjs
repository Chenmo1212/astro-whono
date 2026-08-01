import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const ROOT = process.cwd();
const OUTPUT_PATH = path.join(ROOT, 'tools', 'charset-common.txt');
const BASE_CHARSET_PATH = path.join(ROOT, 'tools', 'charset-base.txt');

const ASCII_LETTERS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const ASCII_DIGITS = '0123456789';
const ASCII_PUNCT = "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~";
const CJK_PUNCT = '，。！？；：、（）《》〈〉「」『』【】〔〕“”‘’—…·•';
const EXTRA_SPACES = ' \u00A0\u3000';

const EXTRA_CHARS = [
  ASCII_LETTERS,
  ASCII_DIGITS,
  ASCII_PUNCT,
  CJK_PUNCT,
  EXTRA_SPACES
].join('');

const SOURCE_DIRS = [
  { dir: path.join(ROOT, 'src', 'content'), exts: new Set(['.md']) },
  { dir: path.join(ROOT, 'src', 'pages'), exts: new Set(['.astro']) },
  { dir: path.join(ROOT, 'src', 'components'), exts: new Set(['.astro']) },
  { dir: path.join(ROOT, 'src', 'layouts'), exts: new Set(['.astro']) },
  // Theme Console 可编辑文案（brandTitle/quote/导航 label/页面标题等）也会用公开字体渲染。
  { dir: path.join(ROOT, 'src', 'data', 'settings'), exts: new Set(['.json']) }
];

const SOURCE_FILES = [
  path.join(ROOT, 'site.config.mjs')
];

const charset = new Set();

const addText = (text) => {
  for (const ch of text) {
    charset.add(ch);
  }
};

const walk = async (dir, exts, results) => {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath, exts, results);
      continue;
    }
    if (exts.has(path.extname(entry.name))) {
      results.push(fullPath);
    }
  }
};

const collectFiles = async () => {
  const files = [];
  for (const source of SOURCE_DIRS) {
    try {
      await walk(source.dir, source.exts, files);
    } catch (_) {
      // Ignore missing directories to keep the script portable.
    }
  }
  for (const filePath of SOURCE_FILES) {
    try {
      await fs.access(filePath);
      files.push(filePath);
    } catch (_) {
      // Ignore missing files to keep the script portable.
    }
  }
  return files;
};

const main = async () => {
  try {
    const baseText = await fs.readFile(BASE_CHARSET_PATH, 'utf8');
    addText(baseText);
  } catch (_) {
    // Optional base charset file; ignore if missing.
  }

  const files = await collectFiles();
  for (const filePath of files) {
    const text = await fs.readFile(filePath, 'utf8');
    addText(text);
  }

  addText(EXTRA_CHARS);

  const sorted = Array.from(charset).sort((a, b) => a.codePointAt(0) - b.codePointAt(0));

  if (process.argv.includes('--check')) {
    let committed;
    try {
      committed = await fs.readFile(OUTPUT_PATH, 'utf8');
    } catch (_) {
      console.error('[check:font-charset] Missing charset file / 缺少字符集文件');
      console.error(`- expected path: ${OUTPUT_PATH}`);
      console.error('- fix: run `npm run font:build`');
      process.exit(1);
    }

    const committedSet = new Set(committed.replace(/\n$/, ''));
    const missing = sorted.filter((ch) => !committedSet.has(ch));
    if (missing.length > 0) {
      console.error('[check:font-charset] Charset is stale / 字符集已过期，字体子集缺少以下字符：');
      console.error(`- missing characters (${missing.length}): ${missing.join('')}`);
      console.error('- fix: run `npm run font:build` and commit the regenerated fonts.');
      process.exit(1);
    }

    const stale = Array.from(committedSet).filter((ch) => !charset.has(ch));
    if (stale.length > 0) {
      console.error('[check:font-charset] Charset has stale characters / 字符集含已不再使用的字符：');
      console.error(`- stale characters (${stale.length}): ${stale.join('')}`);
      console.error('- fix: run `npm run font:build` and commit the regenerated fonts.');
      process.exit(1);
    }

    // stamp 由 font:subset 成功后写入（charset 文件的 sha256）：拦截“跑了 font:charset
    // 却没跑 font:subset”的 woff2 过期状态——纯 txt 对比无法发现。
    const stampPath = path.join(path.dirname(OUTPUT_PATH), 'charset-common.sha256');
    let stamp = '';
    try {
      stamp = (await fs.readFile(stampPath, 'utf8')).trim();
    } catch (_) {
      // Missing stamp is handled by the mismatch branch below.
    }
    const committedHash = createHash('sha256').update(committed).digest('hex');
    if (stamp !== committedHash) {
      console.error('[check:font-charset] Font subsets are stale / 字体子集未随字符集重生成：');
      console.error(`- expected stamp (${stampPath}): ${committedHash}`);
      console.error(`- actual stamp: ${stamp || '(missing)'}`);
      console.error('- fix: run `npm run font:subset` (or `npm run font:build`) and commit the regenerated fonts.');
      process.exit(1);
    }

    console.log(`charset up to date: ${OUTPUT_PATH}`);
    return;
  }

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, `${sorted.join('')}\n`, 'utf8');

  console.log(`charset generated: ${OUTPUT_PATH}`);
  console.log(`characters: ${sorted.length}`);
};

await main();
