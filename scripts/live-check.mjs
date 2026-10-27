import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

/**
 * 线上地址验收：node scripts/live-check.mjs https://<你的站点>/
 * 覆盖：首屏、manifest、图标、Service Worker、离线、Hash 路由、深链 404、控制台错误
 */
const BASE = (process.argv[2] || '').replace(/\/*$/, '/');
if (!BASE.startsWith('http')) {
  console.error('用法：node scripts/live-check.mjs https://example.com/app/');
  process.exit(2);
}
mkdirSync('shots', { recursive: true });

const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`);
};

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
});
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  locale: 'zh-CN',
  timezoneId: 'Asia/Shanghai',
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto(BASE, { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(1200);
check('线上地址可打开', (await page.title()).includes('酒店自媒体创作工作台'));
if (await page.getByRole('button', { name: '跳过' }).count()) {
  await page.getByRole('button', { name: '跳过' }).click();
  await page.waitForTimeout(400);
}
check('首页渲染每日计划', (await page.locator('main').innerText()).includes('每日计划'));

const manifestHref = await page.getAttribute('link[rel="manifest"]', 'href');
const manifestUrl = new URL(manifestHref ?? '', page.url()).toString();
const manifestRes = await ctx.request.get(manifestUrl);
const manifest = await manifestRes.json();
check('manifest 线上可访问', manifestRes.ok() && manifest.name === '酒店自媒体创作工作台');
const icons = [];
for (const icon of manifest.icons) icons.push((await ctx.request.get(new URL(icon.src, manifestUrl).toString())).status());
check('图标线上可访问', icons.every((s) => s === 200), icons.join(','));

let swReady = false;
try {
  swReady = await page.evaluate(
    () =>
      new Promise((resolve) => {
        if (!('serviceWorker' in navigator)) return resolve(false);
        const timer = setTimeout(() => resolve(false), 12000);
        navigator.serviceWorker.ready.then(() => {
          clearTimeout(timer);
          resolve(true);
        });
      }),
  );
} catch {
  swReady = false;
}
check('Service Worker 已注册（HTTPS）', swReady);

await page.waitForTimeout(1500);
await ctx.setOffline(true);
await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
await page.waitForTimeout(1500);
const offlineText = await page.locator('body').innerText().catch(() => '');
check('断网仍可打开', offlineText.includes('每日计划') || offlineText.includes('离线'), offlineText.slice(0, 40).replace(/\n/g, ' '));
await ctx.setOffline(false);

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
if (await page.getByRole('button', { name: '跳过' }).count()) await page.getByRole('button', { name: '跳过' }).click();
await page.evaluate(() => {
  location.hash = '#/hotspot';
});
await page.waitForTimeout(1200);
check('Hash 路由可用', (await page.locator('main').innerText()).includes('爆款热点'));
check('无运行时错误', errors.length === 0, errors.slice(0, 2).join(' | '));

// 深链兜底会故意产生一次 404（GitHub Pages 的 404 页），随后由页面跳回应用
// 临时 CDN/托管（如 brewpage）没有 SPA fallback，Hash 路由不依赖深链，跳过
const skipDeepLink = /brewpage\.app|jsdelivr|statically|githack/i.test(BASE);
if (!skipDeepLink) {
  await page.goto(BASE + 'some/deep/link', { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(1800);
  check('深链 404 兜底回到应用', (await page.locator('body').innerText()).includes('每日计划'));
} else {
  console.log('SKIP 深链 404 兜底（该托管无 SPA fallback，Hash 路由不受影响）');
}

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.screenshot({ path: 'shots/16-live-home.png' });
await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
