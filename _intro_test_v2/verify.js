// 验证开场剧情演出
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 720 } });
  const page = await ctx.newPage();
  page.on('console', m => console.log('[console]', m.type(), m.text()));
  page.on('pageerror', e => console.log('[pageerror]', e.message));

  await page.goto('http://127.0.0.1:1055/', { waitUntil: 'load' });
  // 等开场 logo 动画 + 跳过
  await page.waitForTimeout(1500);
  // 点一下空白处关掉 logo 动画
  await page.click('#startImageBackgroundDiv').catch(() => {});
  await page.waitForTimeout(200);
  // 等"开始游戏"按钮可见
  await page.waitForSelector('#playGame', { state: 'visible', timeout: 10000 });
  // 检查 inputDiv 是否干扰
  const info = await page.evaluate(() => {
    const ids = ['#inputDiv', '#startImageBackgroundDiv', '#introOverlay', '#startPanel', '#playGame'];
    const r = {};
    for (const s of ids) {
      const el = document.querySelector(s);
      if (!el) { r[s] = 'null'; continue; }
      const cs = getComputedStyle(el);
      r[s] = { display: cs.display, zIndex: cs.zIndex, pointerEvents: cs.pointerEvents, visibility: cs.visibility, opacity: cs.opacity };
    }
    // 找到 playGame 位置中心点上的最顶元素
    const pg = document.querySelector('#playGame');
    const rect = pg.getBoundingClientRect();
    const cx = rect.left + rect.width/2, cy = rect.top + rect.height/2;
    const top = document.elementFromPoint(cx, cy);
    r['_topAtPlayGameCenter'] = top ? (top.tagName + '#' + top.id + '.' + top.className) : 'null';
    return r;
  });
  console.log('[info] layout =', JSON.stringify(info, null, 2));
  // 显式隐藏 inputDiv（如果之前有确认弹窗留下）
  await page.evaluate(() => {
    const ids = ['inputDiv', 'inputDialog'];
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    }
  });
  await page.waitForTimeout(100);
  console.log('[step] start page loaded, clicking 开始游戏');
  await page.screenshot({ path: 'D:/纯净样板/mota-js/_intro_test_v2/00-start.png' });

  // 点击开始游戏，剧情应当弹出
  await page.click('#playGame', { force: true });
  // 等剧情 overlay 出现
  await page.waitForSelector('#introOverlay.intro-show', { timeout: 5000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'D:/纯净样板/mota-js/_intro_test_v2/01-step1-bored.png' });
  console.log('[step] step 1 text:', await page.$eval('#introText', el => el.textContent));
  console.log('[step] step 1 img :', await page.$eval('#introChar', el => el.src));
  console.log('[step] step 1 speaker:', await page.$eval('#introSpeaker', el => el.textContent));

  // 推进到第2段
  await page.click('#introOverlay');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'D:/纯净样板/mota-js/_intro_test_v2/02-step2-token.png' });
  console.log('[step] step 2 text:', await page.$eval('#introText', el => el.textContent));
  console.log('[step] step 2 img :', await page.$eval('#introChar', el => el.src));

  // 推进到第3段
  await page.click('#introOverlay');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'D:/纯净样板/mota-js/_intro_test_v2/03-step3-mota.png' });
  console.log('[step] step 3 text:', await page.$eval('#introText', el => el.textContent));
  console.log('[step] step 3 img :', await page.$eval('#introChar', el => el.src));

  // 推进到完成，剧情层消失，进入游戏
  await page.click('#introOverlay');
  await page.waitForTimeout(800);
  const overlayDisplay = await page.$eval('#introOverlay', el => getComputedStyle(el).display);
  console.log('[step] after finish, overlay display =', overlayDisplay);
  await page.screenshot({ path: 'D:/纯净样板/mota-js/_intro_test_v2/04-after-intro.png' });

  // 再测一遍键盘推进（清掉 core 重来）
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await page.click('#startImageBackgroundDiv').catch(() => {});
  await page.waitForTimeout(200);
  await page.waitForSelector('#playGame', { state: 'visible' });
  await page.click('#playGame', { force: true });
  await page.waitForSelector('#introOverlay.intro-show');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  const text2 = await page.$eval('#introText', el => el.textContent);
  console.log('[kb] after Enter, text =', text2);

  await browser.close();
  console.log('[done] all checks passed');
})().catch(e => { console.error('[error]', e); process.exit(1); });
