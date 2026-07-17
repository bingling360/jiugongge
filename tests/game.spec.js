// 基础测试示例
const { test, expect } = require('@playwright/test');

test.describe('游戏核心流程', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('页面标题正确', async ({ page }) => {
    await expect(page).toHaveTitle(/HTML5魔塔/);
  });

  test('开始界面显示', async ({ page }) => {
    // 等待加载提示消失
    await page.waitForSelector('#startPanel', { state: 'visible' });
    await expect(page.locator('#startPanel')).toBeVisible();
  });

  test('可以点击开始游戏', async ({ page }) => {
    // 等待开始面板可见
    await page.waitForSelector('#playGame', { state: 'visible' });
    await page.click('#playGame');
    // 验证游戏画布出现
    await expect(page.locator('#gameCanvas')).toBeVisible();
  });
});
