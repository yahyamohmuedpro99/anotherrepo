import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { PORTAL } from './helpers';

for (const path of ['/', '/catalog', '/packs/giza-plateau', '/login', '/privacy']) {
  test(`portal ${path} has no serious accessibility violations`, async ({ page }) => {
    await page.goto(`${PORTAL}${path}`);
    await page.waitForLoadState('networkidle');
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
    const serious = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });
}

test('portal is usable at 360 px without horizontal scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto(`${PORTAL}/catalog`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
