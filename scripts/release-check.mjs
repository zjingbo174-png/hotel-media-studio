import { createServer } from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const DIST = path.resolve('dist');
const PREFIX = '/hotel-media-studio';
const PORT = 4190;

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  let p = decodeURIComponent(url.pathname);
  if (!p.startsWith(PREFIX)) {
    res.writeHead(404).end('not found');
    return;
  }
  p = p.slice(PREFIX.length) || '/';
  let file = path.join(DIST, p);
  if (p === '/' || p.endsWith('/')) file = path.join(DIST, 'index.html');
  try {
    const data = await fs.readFile(file);
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    // Pages 的 404.html 兜底
    const fallback = await fs.readFile(path.join(DIST, '404.html'));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(fallback);
  }
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`);
};

const BASE = `http://127.0.0.1:${PORT}${PREFIX}/`;
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
});
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  locale: 'zh-CN',
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
check('子路径部署可打开（GitHub Pages 同构）', (await page.title()).includes('酒店自媒体创作工作台'));
if (await page.getByRole('button', { name: '跳过' }).count()) {
  await page.getByRole('button', { name: '跳过' }).click();
  await page.waitForTimeout(400);
}
check('首页渲染每日计划', (await page.locator('main').innerText()).includes('每日计划'));

// manifest / icons
const manifestHref = await page.getAttribute('link[rel="manifest"]', 'href');
const manifestUrl = new URL(manifestHref ?? '', page.url()).toString();
const manifestRes = await ctx.request.get(manifestUrl);
const manifest = await manifestRes.json();
check('manifest 可访问且字段完整', manifestRes.ok() && manifest.name && manifest.display === 'standalone');
check('start_url/scope 为相对路径', manifest.start_url === './' && manifest.scope === './');
const iconStatuses = [];
for (const icon of manifest.icons) {
  const iconUrl = new URL(icon.src, manifestUrl).toString();
  iconStatuses.push((await ctx.request.get(iconUrl)).status());
}
check('图标全部可访问', iconStatuses.every((s) => s === 200), iconStatuses.join(','));

// service worker
let swReady = false;
try {
  swReady = await page.evaluate(
    () =>
      new Promise((resolve) => {
        if (!('serviceWorker' in navigator)) return resolve(false);
        const timer = setTimeout(() => resolve(false), 8000);
        navigator.serviceWorker.ready.then(() => {
          clearTimeout(timer);
          resolve(true);
        });
      }),
  );
} catch {
  swReady = false;
}
check('Service Worker 已注册', swReady);

// 离线可打开
await page.evaluate(() => navigator.serviceWorker.ready);
await page.waitForTimeout(1500);
await ctx.setOffline(true);
await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
await page.waitForTimeout(1200);
const offlineText = await page.locator('body').innerText().catch(() => '');
check('断网后仍可打开应用壳', offlineText.includes('每日计划') || offlineText.includes('离线'), offlineText.slice(0, 40).replace(/\n/g, ' '));
await ctx.setOffline(false);

// 路由
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
if (await page.getByRole('button', { name: '跳过' }).count()) await page.getByRole('button', { name: '跳过' }).click();
await page.evaluate(() => {
  location.hash = '#/hotspot';
});
await page.waitForTimeout(1200);
check('Hash 路由可用（热点页）', (await page.locator('main').innerText()).includes('爆款热点'));

// 深链 404 兜底
await page.goto(`http://127.0.0.1:${PORT}${PREFIX}/some/deep/link`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
check('404 兜底回到应用', (await page.locator('body').innerText()).includes('每日计划'));

check('无运行时错误', errors.length === 0, errors.slice(0, 2).join(' | '));

await browser.close();
server.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
