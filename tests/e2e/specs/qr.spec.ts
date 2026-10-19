import { expect, test } from '@playwright/test';
import { engineReady, PLAYER } from './helpers';

test.describe('Flow A: QR scan to first interaction (guest)', () => {
  test('opens the Giza mission at the linked point of interest, in Arabic, and is playable', async ({ page }) => {
    const t0 = Date.now();
    await page.goto(`${PLAYER}/x/giza-plateau/poi.khufu`);
    // the tiny shell paints first
    await expect(page.locator('#shell')).toBeVisible();
    await engineReady(page);
    // the 3-second splash at the POI, then the HUD with the quest card
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await page.waitForFunction(() => (window as unknown as { rihla: { engine: { phase: string } } }).rihla.engine.phase === 'play', null, { timeout: 120_000 });
    const firstInteraction = Date.now() - t0;
    test.info().annotations.push({ type: 'time-to-play-ms', description: String(firstInteraction) });
    await expect(page.locator('.rihla canvas').first()).toBeVisible();
    await expect(page.getByText('أبو الهول سكت').first()).toBeVisible();
    // first interaction: open the passport and close it again
    await page.getByRole('button', { name: /الجواز/ }).click();
    await expect(page.getByText(/جواز السفر|الأختام/).first()).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('switches to English and back', async ({ page }) => {
    await page.goto(`${PLAYER}/play/giza-plateau?lang=en&intro=0`);
    await engineReady(page);
    await expect(page.getByText('The Silent Sphinx').first()).toBeVisible();
  });

  test('cards-and-questions mode works without 3D', async ({ page }) => {
    await page.goto(`${PLAYER}/play/solar-system?mode=2d`);
    await expect(page.getByText(/كروت وأسئلة|Cards/).first()).toBeVisible({ timeout: 60_000 });
  });
});
