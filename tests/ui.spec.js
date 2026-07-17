// UI 交互测试
const { test, expect } = require('@playwright/test');

test.describe('UI 交互测试', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // 等待游戏加载
    await page.waitForSelector('#startPanel', { state: 'visible' });
  });

  test('开始游戏按钮存在', async ({ page }) => {
    const playButton = page.locator('#playGame');
    await expect(playButton).toBeVisible();
  });

  test('读档按钮存在', async ({ page }) => {
    const loadButton = page.locator('#loadGame');
    await expect(loadButton).toBeVisible();
  });

  test('音乐按钮可见', async ({ page }) => {
    await expect(page.locator('#musicBtn')).toBeVisible();
  });
});
