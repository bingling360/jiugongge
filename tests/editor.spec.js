// 编辑器模式测试
const { test, expect } = require('@playwright/test');

test.describe('编辑器测试', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/editor.html');
  });

  test('编辑器页面加载', async ({ page }) => {
    await expect(page).toHaveTitle(/魔塔/);
  });

  test('编辑器工具栏可见', async ({ page }) => {
    await page.waitForSelector('#toolBar', { state: 'visible' });
    await expect(page.locator('#toolBar')).toBeVisible();
  });
});
