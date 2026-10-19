import { expect, test } from '@playwright/test';
import { portalLogin } from './helpers';

test.describe('Flow C: publisher batch to download', () => {
  test('creates a QR batch for a linked page and downloads the print sheet', async ({ page }) => {
    await portalLogin(page, 'editor@demo.publisher');
    await page.getByRole('link', { name: 'إدارة النشر' }).click();
    await page.getByRole('link', { name: 'افتح' }).first().click();
    await page.waitForURL(/\/app\/publisher\/books\//);
    await page.getByRole('button', { name: 'اعمل الأكواد' }).first().click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: /ورقة الطباعة/ }).first().click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.svg$/);
  });
});
