import { expect, test } from '@playwright/test';
import { engineReady, PLAYER } from './helpers';

/**
 * Perf smoke on the low tier (BRIEF §12): draw calls must stay within the pack's low budget. Frame rate in CI
 * runs on a software renderer and is recorded, not asserted; real-device numbers go in docs/PERF.md.
 */
for (const [pack, budget] of [['giza-plateau', 150], ['solar-system', 150]] as const) {
  test(`${pack} stays within the low-tier draw-call budget`, async ({ page }) => {
    await page.goto(`${PLAYER}/play/${pack}?tier=low&perf=1&intro=0`);
    await engineReady(page);
    await page.waitForFunction(() => (window as unknown as { rihla: { engine: { phase: string } } }).rihla.engine.phase === 'play', null, { timeout: 120_000 });
    await page.waitForTimeout(8000);
    const stats = await page.evaluate(() => {
      const e = (window as unknown as { rihla: { engine: { renderer: { info: { render: { calls: number; triangles: number } } } } } }).rihla.engine;
      const el = document.querySelector('.perf') as HTMLElement | null;
      return { calls: e.renderer.info.render.calls, triangles: e.renderer.info.render.triangles, fps: Number(el?.dataset.fps ?? 0) };
    });
    test.info().annotations.push({ type: 'perf', description: JSON.stringify(stats) });
    console.log(`[perf] ${pack} low: ${JSON.stringify(stats)}`);
    expect(stats.calls).toBeLessThanOrEqual(budget);
  });
}
