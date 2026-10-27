import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const APP = 'http://127.0.0.1:5173/';
const API = 'http://127.0.0.1:8787';
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

async function newMember(nickname) {
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
  const bad = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('response', (r) => {
    if (r.status() >= 400) bad.push(`${r.status()} ${r.request().method()} ${r.url()}`);
  });
  await page.goto(APP, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  if (await page.getByRole('button', { name: '跳过' }).count()) {
    await page.getByRole('button', { name: '跳过' }).click();
    await page.waitForTimeout(300);
  }
  await page.evaluate(() => {
    location.hash = '#/settings';
  });
  await page.waitForTimeout(700);
  await page.locator('input[placeholder*="workers.dev"]').fill(API);
  await page.locator('input[placeholder="同事怎么称呼你，如：前台小满"]').fill(nickname);
  return { ctx, page, errors, bad };
}

const go = async (page, hash) => {
  await page.evaluate((h) => {
    location.hash = h;
  }, hash);
  await page.waitForTimeout(900);
};

// A 创建工作区
const A = await newMember('小满');
await A.page.locator('input[placeholder="如：前厅创作组"]').fill('前厅创作组');
await A.page.getByRole('button', { name: '新建工作区' }).click();
await A.page.waitForTimeout(2800);
await A.page.waitForLoadState('networkidle');
const teamText = await A.page.locator('main').innerText();
const codeMatch = teamText.match(/工作区码\s*([2-9A-HJ-NP-Z]{6})/);
const code = codeMatch?.[1] ?? '';
check('创建工作区并显示工作区码', /^[2-9A-HJ-NP-Z]{6}$/.test(code), `code=${code}`);

// A 添加只有自己能看到的任务
await go(A.page, '#/plan');
await A.page.getByPlaceholder('快速添加任务，回车保存').fill('只有A能看到的任务');
await A.page.keyboard.press('Enter');
await A.page.waitForTimeout(800);
const aTasks = await A.page.locator('main ul li').count();
check('A 在线清单可写（3 条）', aTasks === 3, `li=${aTasks}`);

// B 用工作区码加入
const B = await newMember('阿珍');
await B.page.locator('input[placeholder="例如 K7M2QX"]').fill(code);
await B.page.getByRole('button', { name: '加入工作区' }).click();
await B.page.waitForTimeout(2800);
await B.page.waitForLoadState('networkidle');
await go(B.page, '#/plan');
const bMain = await B.page.locator('main').innerText();
check('B 加入后进入在线清单', bMain.includes('在线协作中'), bMain.slice(0, 50).replace(/\n/g, ' '));
check('B 看不到 A 的私有任务', !bMain.includes('只有A能看到的任务'));
const bTasks = await B.page.locator('main ul li').count();
check('B 自己有 2 条预置任务', bTasks === 2, `li=${bTasks}`);

// B 加任务，A 刷新页面后仍看不到
await B.page.getByPlaceholder('快速添加任务，回车保存').fill('只有B能看到的任务');
await B.page.keyboard.press('Enter');
await B.page.waitForTimeout(800);
await A.page.reload({ waitUntil: 'networkidle' });
await A.page.waitForTimeout(1400);
const aMain2 = await A.page.locator('main').innerText();
check('A 看不到 B 的私有任务', !aMain2.includes('只有B能看到的任务'));

// 在线人数
await go(A.page, '#/settings');
await A.page.waitForTimeout(1600);
const settingsText = await A.page.locator('main').innerText();
check(
  '设置页显示在线成员',
  settingsText.includes('阿珍') && /在线\s*2\s*人/.test(settingsText),
  settingsText.match(/在线\s*\d+\s*人/)?.[0] ?? 'none',
);
await A.page.screenshot({ path: 'shots/14-team-settings.png' });

// 共享内容库：A 收藏一条
await go(A.page, '#/inspiration');
await A.page.locator('main button[class*="card"]').first().click();
await A.page.waitForTimeout(800);
await A.page.getByRole('button', { name: '收藏', exact: true }).click();
await A.page.waitForTimeout(800);
await A.page.locator('[role="dialog"] button[aria-label="关闭"]').click();
await A.page.waitForTimeout(500);

await go(B.page, '#/library');
const bLib = await B.page.locator('main').innerText();
check('B 看到 A 收藏的内容（共享内容库）', bLib.includes('共 1 条'), bLib.slice(0, 50).replace(/\n/g, ' '));

// 共享批次：A 刷新后 B 重新加载看到同一批
const batchBefore = (await A.page.locator('main').innerText()).match(/第\s*(\d+)\s*批/)?.[1];
await A.page.getByRole('button', { name: '刷新选题' }).click();
await A.page.waitForTimeout(1500);
const aBatch = (await A.page.locator('main').innerText()).match(/第\s*(\d+)\s*批/)?.[1];
await go(B.page, '#/inspiration');
await B.page.waitForTimeout(1200);
const bBatch = (await B.page.locator('main').innerText()).match(/第\s*(\d+)\s*批/)?.[1];
check('A 刷新后批次号 +1', Number(aBatch) === Number(batchBefore) + 1, `${batchBefore} → ${aBatch}`);
check('B 看到同一批次', aBatch === bBatch, `A=${aBatch} B=${bBatch}`);

// B 删除收藏，A 刷新内容库后看不到
await go(B.page, '#/library');
await B.page.locator('button[aria-label="从内容库移除"]').first().click();
await B.page.waitForTimeout(500);
await B.page.getByRole('button', { name: '移除', exact: true }).click();
await B.page.waitForTimeout(1000);
await A.page.reload({ waitUntil: 'networkidle' });
await A.page.waitForTimeout(1400);
await go(A.page, '#/library');
const aLib = await A.page.locator('main').innerText();
check('A 看到 B 的删除（内容库同步）', aLib.includes('内容库还是空的'), aLib.slice(0, 50).replace(/\n/g, ' '));

check('A 无运行时错误', A.errors.length === 0, A.errors.slice(0, 2).join(' | '));
check('B 无运行时错误', B.errors.length === 0, B.errors.slice(0, 2).join(' | '));
if (A.bad.length || B.bad.length) {
  console.log('A 4xx:', A.bad.slice(0, 5).join(' ; '));
  console.log('B 4xx:', B.bad.slice(0, 5).join(' ; '));
}

await go(A.page, '#/plan');
await A.page.screenshot({ path: 'shots/15-online-plan.png' });
await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
