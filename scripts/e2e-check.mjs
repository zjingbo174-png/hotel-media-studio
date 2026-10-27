import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const BROWSER = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://127.0.0.1:4173/';
mkdirSync('shots', { recursive: true });

const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok, extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`);
};

const browser = await chromium.launch({ executablePath: BROWSER, headless: true });
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
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(700);

// 首次引导（只出现一次）
if (await page.getByRole('button', { name: '跳过' }).count()) {
  await page.getByRole('button', { name: '跳过' }).click();
  await page.waitForTimeout(400);
}

const taskTitles = () => page.locator('main ul li p.text-\\[15px\\]').allInnerTexts();
const doneCount = async () => (await page.locator('button[aria-label^="取消完成"]').count());
const progressText = async () => (await page.locator('section.card').first().innerText()).replace(/\s+/g, ' ');

/* 1. 预置任务 */
check('首屏预置 2 条任务', (await taskTitles()).length === 2, (await taskTitles()).join(' / '));

/* 2. 新增任务（快速添加） */
await page.getByPlaceholder('快速添加任务，回车保存').fill('核对今日 OTA 报价');
await page.keyboard.press('Enter');
await page.waitForTimeout(700);
check('新增任务成功', (await taskTitles()).length === 3, (await taskTitles()).join(' / '));

/* 3. 打卡 */
await page.locator('button[aria-label^="完成："]').first().click();
await page.waitForTimeout(400);
check('打卡后进度 1/3', (await progressText()).includes('1/3'), await progressText());
check('完成态可识别', (await doneCount()) === 1);

/* 4. 删除 + 撤销 */
await page.locator('button[aria-label^="删除："]').last().click();
await page.getByRole('button', { name: '删除', exact: true }).last().click();
await page.waitForTimeout(500);
check('删除后剩 2 条', (await taskTitles()).length === 2);
await page.getByRole('button', { name: '撤销', exact: true }).click();
await page.waitForTimeout(500);
check('撤销后恢复 3 条', (await taskTitles()).length === 3);

/* 5. 刷新后仍持久化 */
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(900);
check('刷新后任务持久化', (await taskTitles()).length === 3, (await taskTitles()).join(' / '));
check('刷新后打卡状态保留', (await doneCount()) === 1);

/* 6. 选题列表与刷新 */
await page.locator('a[href="#/inspiration"]').first().click();
await page.waitForTimeout(900);
const cards = page.locator('main button[class*="card"]');
const topicCount = await page.locator('main > div > div.space-y-2\\.5 > button').count();
check('选题 12 条', topicCount === 12, `count=${topicCount}`);
const batchBefore = await page.locator('main header + div').first().innerText().catch(() => '');
await page.getByRole('button', { name: '刷新选题' }).click();
await page.waitForTimeout(900);
const headerText = (await page.locator('main').innerText()).slice(0, 120).replace(/\s+/g, ' ');
check('刷新后批次号变化', headerText.includes('第 2 批'), headerText);

/* 7. 收藏 + 内容库 */
await page.locator('main button[class*="card"]').first().click();
await page.waitForTimeout(600);
await page.getByRole('button', { name: '收藏', exact: true }).click();
await page.waitForTimeout(500);
await page.locator('[role="dialog"] button[aria-label="关闭"]').click();
await page.waitForTimeout(400);
await page.locator('a[href="#/library"]').first().click();
await page.waitForTimeout(700);
const libText = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
check('内容库有 1 条收藏', libText.includes('收藏') && libText.includes('共 1 条'), libText.slice(0, 80));

/* 8. 换批后收藏不丢 */
await page.locator('a[href="#/inspiration"]').first().click();
await page.waitForTimeout(700);
await page.getByRole('button', { name: '刷新选题' }).click();
await page.waitForTimeout(900);
await page.locator('a[href="#/library"]').first().click();
await page.waitForTimeout(700);
const libText2 = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
check('换批后收藏仍在', libText2.includes('共 1 条'), libText2.slice(0, 60));

/* 9. 提醒：把提醒时间改到 00:01 后重新加载，应出现提醒条 */
await page.locator('a[href="#/settings"]').first().click();
await page.waitForTimeout(600);
await page.locator('input[type="time"]').fill('00:01');
await page.waitForTimeout(600);
await page.locator('a[href="#/plan"]').first().click();
await page.waitForTimeout(800);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
const planText = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
check('到点未打卡出现提醒条', planText.includes('没打卡'), planText.slice(0, 80));

/* 10. 今天不再提醒 */
if (planText.includes('没打卡')) {
  await page.getByRole('button', { name: '今天不再提醒' }).click();
  await page.waitForTimeout(500);
  const after = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
  check('关闭后当日不再提醒', !after.includes('没打卡'), after.slice(0, 60));
}

/* 11. 导航样式切换 */
await page.locator('a[href="#/settings"]').first().click();
await page.waitForTimeout(500);
await page.getByRole('button', { name: '底部栏' }).click();
await page.waitForTimeout(600);
check('切换为底部 Tab', (await page.locator('nav[aria-label="底部导航"]').count()) === 1);
await page.getByRole('button', { name: '左侧栏' }).click();
await page.waitForTimeout(500);

/* 12. 热点详情三套方案 */
await page.locator('a[href="#/hotspot"]').first().click();
await page.waitForTimeout(800);
await page.locator('main button[class*="card"]').first().click();
await page.waitForTimeout(600);
const dialog = page.locator('[role="dialog"]');
const hasThree = (await dialog.innerText()).includes('A · 同结构换场景');
check('热点详情含 A 方案', hasThree);
const tabs = dialog.locator('button.chip');
const tabCount = await tabs.count();
check('三套方案可切换', tabCount >= 3, `tabs=${tabCount}`);
await tabs.nth(2).click();
await page.waitForTimeout(400);
check('切换到 C 方案', (await dialog.innerText()).includes('换冲突或结论'));
await dialog.getByRole('button', { name: '复制这套方案' }).click().catch(() => {});
await page.waitForTimeout(600);

/* 13. 控制台无错误 */
check('无运行时错误', errors.length === 0, errors.slice(0, 3).join(' | '));

await page.screenshot({ path: 'shots/10-e2e-last.png' });
await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log('FAILED:', failed.map((f) => f.name).join(', '));
  process.exit(1);
}
