import { expect, test } from '@playwright/test';
import { API, apiGet, apiLogin, engineReady, PLAYER, portalLogin, PORTAL } from './helpers';

test.describe('Flow B: teacher assigns, students play, results per objective', () => {
  test('teacher creates a class and assigns Giza; a student joins with the code; the report shows the answer', async ({ page, browser }) => {
    const name = `فصل ${Date.now() % 10000}`;
    await portalLogin(page, 'teacher@demo.school');
    await page.fill('input[name=name]', name);
    await page.getByRole('button', { name: 'اعمل' }).click();
    await page.getByRole('heading', { name }).locator('..').getByRole('link').click();
    await page.waitForURL(/\/app\/classes\//);
    const code = (await page.locator('.r-code').innerText()).trim();
    expect(code).toMatch(/^[A-Z2-9]{6}$/);
    await page.locator('select').first().selectOption('giza-plateau');
    await page.getByRole('button', { name: 'ادّي رحلة' }).last().click();
    await expect(page.getByText('giza-plateau@1.0.0')).toBeVisible();

    // a student on another device
    const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await phone.goto(`${PLAYER}/c/${code}`);
    await phone.getByRole('button').first().click();
    await engineReady(phone);
    await phone.evaluate(async () => {
      const e = (window as unknown as { rihla: { engine: { emit: (...a: unknown[]) => void; telemetry: { flush: () => Promise<void> } } } }).rihla.engine;
      e.emit('answered', { type: 'item', id: 'item.sphinx' }, { correct: true, attempt: 1, durationMs: 4000 }, { objectives: ['obj.sphinx'] });
      await e.telemetry.flush();
    });

    // results within minutes (BRIEF §17 M1); here the in-process job loop runs every few seconds
    const token = await apiLogin('teacher@demo.school');
    const classes = await apiGet<{ classes: { id: string; joinCode: string }[] }>('/v1/classes', token);
    const cls = classes.classes.find((c) => c.joinCode === code)!;
    const asg = (await apiGet<{ assignments: { id: string }[] }>(`/v1/classes/${cls.id}/assignments`, token)).assignments[0]!;
    await expect
      .poll(async () => (await apiGet<{ objectives: { id: string; play: number | null }[] }>(`/v1/assignments/${asg.id}/report`, token)).objectives.find((o) => o.id === 'obj.sphinx')?.play, { timeout: 90_000, intervals: [3000] })
      .toBe(100);
    await page.goto(`${PORTAL}/app/assignments/${asg.id}`);
    await expect(page.getByText('100%').first()).toBeVisible();
    void API;
  });
});
