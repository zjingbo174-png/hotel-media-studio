import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * 零账号发布：把 site/ 目录上传到 BrewPage（免费、无需注册），得到一个 HTTPS 网址。
 * 注意：这是**临时**演示地址，默认 15 天、最长 30 天过期；正式长期使用建议国内静态托管（EdgeOne Pages）。
 *
 * 用法：node scripts/publish-brewpage.mjs [--zip dist/site.zip]
 * 产物：打印访问链接与过期时间；ownerToken 保存在 .brewpage-owner.json（已 gitignore）。
 */

const SITE = path.resolve('site');
const API = 'https://brewpage.app';

async function walk(dir, base = '') {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...(await walk(path.join(dir, entry.name), rel)));
    else out.push({ rel, abs: path.join(dir, entry.name) });
  }
  return out;
}

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const files = await walk(SITE);
if (files.length === 0) {
  console.error('site/ 为空，先执行 node scripts/publish-site.mjs --build');
  process.exit(1);
}

// BrewPage 不接收 .webmanifest 扩展名：改名为 manifest.json 并改写 index.html 引用，
// 这样 PWA 仍可安装（图标、start_url、scope 都是相对路径，不受影响）。
const overrides = new Map();
const skip = new Set();
for (const file of files) {
  if (file.rel.endsWith('.webmanifest')) {
    const jsonPath = file.rel.replace(/\.webmanifest$/, '.json');
    overrides.set(jsonPath, await readFile(file.abs));
    skip.add(file.rel);
  }
  if (file.rel === 'index.html') {
    const html = await readFile(file.abs, 'utf8');
    overrides.set('index.html', Buffer.from(html.replaceAll('manifest.webmanifest', 'manifest.json'), 'utf8'));
  }
  if (file.rel === 'sw.js') {
    // sw.js 的预缓存清单里也引用了 manifest.webmanifest，一并改名，否则安装时 404 导致 SW 起不来
    const sw = await readFile(file.abs, 'utf8');
    overrides.set('sw.js', Buffer.from(sw.replaceAll('manifest.webmanifest', 'manifest.json'), 'utf8'));
  }
  if (file.rel.startsWith('.')) skip.add(file.rel); // .nojekyll 等点文件不传
}

const form = new FormData();
for (const file of files) {
  if (skip.has(file.rel)) continue;
  const buf = overrides.get(file.rel) ?? (await readFile(file.abs));
  const rel = file.rel;
  const type = types[path.extname(rel)] ?? 'application/octet-stream';
  form.append('files', new Blob([buf], { type }), path.basename(rel));
  form.append('paths', rel);
}
for (const [rel, buf] of overrides) {
  if (files.some((f) => f.rel === rel)) continue; // 已作为普通文件上传
  form.append('files', new Blob([buf], { type: types[path.extname(rel)] ?? 'application/octet-stream' }), path.basename(rel));
  form.append('paths', rel);
}

const url = `${API}/api/sites?ttl=30&entry=index.html`;
console.log(`上传 ${files.length} 个文件到 ${url} …`);
const res = await fetch(url, { method: 'POST', body: form });
const text = await res.text();
if (!res.ok) {
  console.error(`发布失败 HTTP ${res.status}: ${text.slice(0, 500)}`);
  process.exit(1);
}
const data = JSON.parse(text);

await writeFile(
  '.brewpage-owner.json',
  JSON.stringify({ id: data.id, link: data.link, ownerLink: data.ownerLink, ownerToken: data.ownerToken, expiresAt: data.expiresAt }, null, 2),
  'utf8',
);

console.log('\n发布成功：');
console.log(`  访问链接：${data.link}`);
console.log(`  过期时间：${data.expiresAt}`);
console.log(`  文件数：${data.fileCount}，大小：${(data.totalSizeBytes / 1024 / 1024).toFixed(2)} MB`);
console.log('\nownerToken 已保存到 .brewpage-owner.json（不要提交、不要发人）');
