// Screenshot helper: node shots.mjs <url> <out.png> [waitMs] [actions...]
import { chromium } from '@playwright/test';
const [url, out, wait = '8000', ...actions] = process.argv.slice(2);
const exe = process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 760 }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('response', (r) => { if (r.status() >= 400) logs.push('[http ' + r.status() + '] ' + r.url()); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message} ${(e.stack ?? '').split('\n').slice(1, 4).join(' | ')}`));
await page.goto(url);
await page.waitForTimeout(+wait);
for (const a of actions) {
  const [kind, arg, ms = '1500'] = a.split('|');
  if (kind === 'click') await page.click(arg, { timeout: 5000 }).catch((e) => logs.push('click fail ' + arg + ' ' + e.message));
  if (kind === 'key') await page.keyboard.press(arg);
  if (kind === 'fill') await page.fill(arg, ms);
  if (kind === 'goto') await page.goto(arg);
  if (kind === 'hold') { await page.keyboard.down(arg); await page.waitForTimeout(+ms); await page.keyboard.up(arg); }
  if (kind === 'eval') logs.push('eval: ' + JSON.stringify(await page.evaluate(arg)));
  if (kind === 'wait') await page.waitForTimeout(+arg);
  if (kind === 'shot') await page.screenshot({ path: arg });
}
await page.screenshot({ path: out });
console.log(logs.slice(0, 40).join('\n'));
await browser.close();
