import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const OUT = 'shots';
mkdirSync(OUT, { recursive: true });

const BROWSER = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://127.0.0.1:4173/';

const browser = await chromium.launch({ executablePath: BROWSER, headless: true });

async function shotMobile(name, setup) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  if (await page.getByRole('button', { name: '跳过' }).count()) {
    await page.getByRole('button', { name: '跳过' }).click();
    await page.waitForTimeout(400);
  }
  await setup(page);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  const text = await page.evaluate(() => document.body.innerText.slice(0, 400));
  console.log(`--- ${name} ok, errors=${errors.length}`);
  if (errors.length) console.log(errors.slice(0, 5).join('\n'));
  console.log(text.replace(/\n+/g, ' | ').slice(0, 260));
  await ctx.close();
}

await shotMobile('01-plan', async () => {});

await shotMobile('02-plan-progress', async (page) => {
  const cb = page.locator('button[aria-label^="完成"], button[aria-label^="取消完成"]').first();
  await cb.click();
  await page.waitForTimeout(300);
});

await shotMobile('03-inspiration', async (page) => {
  await page.locator('a[href="#/inspiration"]').first().click();
  await page.waitForTimeout(700);
});

await shotMobile('04-topic-detail', async (page) => {
  await page.locator('a[href="#/inspiration"]').first().click();
  await page.waitForTimeout(700);
  await page.locator('main button').filter({ hasText: '赞' }).first().click();
  await page.waitForTimeout(500);
});

await shotMobile('05-hotspot', async (page) => {
  await page.locator('a[href="#/hotspot"]').first().click();
  await page.waitForTimeout(700);
});

await shotMobile('06-hotspot-detail', async (page) => {
  await page.locator('a[href="#/hotspot"]').first().click();
  await page.waitForTimeout(700);
  await page.locator('main button').filter({ hasText: '3 套方案' }).first().click();
  await page.waitForTimeout(500);
});

await shotMobile('07-history', async (page) => {
  await page.locator('a[href="#/plan"]').first().click();
  await page.waitForTimeout(400);
  await page.getByText('历史', { exact: true }).click();
  await page.waitForTimeout(500);
});

await shotMobile('08-settings', async (page) => {
  await page.locator('a[href="#/settings"]').first().click();
  await page.waitForTimeout(500);
});

// 桌面 / 平板：验证左侧展开导航
{
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
  });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/09-desktop.png` });
  console.log('--- 09-desktop ok');
  await ctx.close();
}

await browser.close();
console.log('done');
