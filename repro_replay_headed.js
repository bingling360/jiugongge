'use strict';
// 有头浏览器里跑【真实完整回放】：core.startGame(hard,seed,decodeRoute(route)) -> startReplay -> replay...
// 目的：复现用户在游戏里看到的“录像文件出错，当前操作：move:x:y”，并抓到失败时勇士的 楼层+坐标。
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = 'http://127.0.0.1:1055/';
const which = process.argv[2] || 'orig';
const FILE = which === 'fixed'
  ? 'C:/Users/xuan/Downloads/lifangti_20260716230451.fixed.h5route'
  : 'C:/Users/xuan/Downloads/lifangti_20260716230451.h5route';
const RAW = fs.readFileSync(FILE, 'utf8').trim();

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--no-sandbox', '--mute-audio'] });
  const page = await browser.newPage();
  const logs = [];
  page.on('console', m => { const t = m.text(); logs.push(t); });
  page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message));

  await page.goto(BASE, { waitUntil: 'load' });

  // 等真实引擎完整就绪（图片资源在有头模式会真正解码）
  await page.waitForFunction(() => {
    const c = window.core || (window.main && window.main.core);
    return !!(c && typeof c.startGame === 'function' && window.main && window.main.mode === 'play'
      && c.initStatus && c.initStatus.maps && c.initStatus.maps.MT0
      && c.firstData && c.firstData.hero);
  }, { timeout: 60000 }).catch(() => {});

  const bootInfo = await page.evaluate(() => {
    const c = window.core || (window.main && window.main.core);
    return {
      hasStart: typeof c.startGame === 'function',
      mode: window.main && window.main.mode,
      imgs: c.material && c.material.images ? Object.keys(c.material.images).length : 0,
      floors: c.floors ? Object.keys(c.floors).length : 0,
      initMaps: c.initStatus && c.initStatus.maps ? Object.keys(c.initStatus.maps).length : 0,
    };
  });
  console.log('BOOT:', JSON.stringify(bootInfo));

  // 安装钩子 + 启动真实回放
  await page.evaluate((RAW) => {
    const core = window.core || (window.main && window.main.core);
    const LZ = window.LZString;
    window.__done = null;
    window.__fail = null;
    window.__trace = [];

    // 干净轨迹：钩 core.status.route.push —— 每次重录发生在【该步动作完成时】，
    // 此刻勇士位置是该步的最终位置，不受动画异步影响。
    window.__installPushHook = function () {
      const arr = core.status.route;
      if (!arr || arr.__hooked) return;
      const _push = arr.push.bind(arr);
      arr.push = function (v) {
        try { window.__trace.push({ token: v, f: core.status.floorId, x: core.getHeroLoc('x'), y: core.getHeroLoc('y'), d: core.getHeroLoc('direction') }); } catch (e) {}
        return _push(v);
      };
      arr.__hooked = true;
    };

    // 抓失败：包裹 _replay_error，记录失败 token + 当前楼层/坐标，并自动关闭弹窗、停止
    const _err = core.control._replay_error.bind(core.control);
    core.control._replay_error = function (action, callback) {
      window.__fail = {
        action: action,
        floorId: core.status.floorId,
        x: core.getHeroLoc('x'), y: core.getHeroLoc('y'), d: core.getHeroLoc('direction'),
        recorded: (core.status.route || []).length,
      };
      // 不弹确认框，直接停
      try { core.status.replay.replaying = false; core.status.replay.failed = true; core.stopReplay && core.stopReplay(true); } catch (e) {}
      window.__done = 'FAIL';
    };
    // 抓成功：包裹 _replay_finished
    const _fin = core.control._replay_finished ? core.control._replay_finished.bind(core.control) : null;
    if (_fin) core.control._replay_finished = function () {
      window.__done = window.__done || 'FINISH';
      try { return _fin.apply(this, arguments); } catch (e) {}
    };
    // 屏蔽可能的阻塞弹窗
    if (core.ui) {
      core.ui.drawConfirmBox = function (t, yes, no) { if (no) no(); };
      core.myconfirm = function (t, yes, no) { if (yes) yes(); };
    }

    const meta = JSON.parse(LZ.decompressFromBase64(RAW));
    window.__meta = { name: meta.name, hard: meta.hard, seed: meta.seed };
    const route = core.decodeRoute(meta.route);
    window.__routeLen = route.length;

    // 启动游戏并回放（与 chooseReplayFile 完全一致的真实链路）
    core.startGame(meta.hard || '', meta.seed, route);

    // 拉满速度 + 用 resumeReplay（自带忙判断，避免重入打乱轨迹）驱动回放
    window.__spd = setInterval(function () {
      try {
        if (!(core.status && core.status.replay)) return;
        window.__installPushHook();
        core.status.replay.speed = 24;
        if (core.status.replay.replaying && core.status.replay.pausing) {
          core.resumeReplay();
        }
      } catch (e) {}
    }, 15);
  }, RAW);

  // 轮询直到完成或超时
  const start = Date.now();
  let state = null;
  while (Date.now() - start < 90000) {
    state = await page.evaluate(() => {
      const core = window.core || (window.main && window.main.core);
      return {
        done: window.__done,
        fail: window.__fail,
        replaying: core.status && core.status.replay ? core.status.replay.replaying : null,
        toReplay: core.status && core.status.replay ? (core.status.replay.toReplay || []).length : null,
        total: core.status && core.status.replay ? (core.status.replay.totalList || []).length : null,
        floorId: core.status && core.status.floorId,
        hx: core.getHeroLoc ? core.getHeroLoc('x') : null,
        hy: core.getHeroLoc ? core.getHeroLoc('y') : null,
        routeLen: window.__routeLen,
        recorded: core.status && core.status.route ? core.status.route.length : null,
      };
    });
    if (state.done) break;
    await new Promise(r => setTimeout(r, 300));
  }

  const trace = await page.evaluate(() => window.__trace || []);
  console.log('WHICH:', which);
  console.log('META:', JSON.stringify(await page.evaluate(() => window.__meta)));
  console.log('ROUTE_LEN:', state && state.routeLen);
  console.log('RESULT:', JSON.stringify(state, null, 0));

  console.log('\n--- 逐 token 真实回放轨迹（重录完成时刻的勇士位置）---');
  console.log('idx  token            pos-after-step    cross');
  let prevF = null;
  trace.forEach((t, i) => {
    const ps = t.f + '(' + t.x + ',' + t.y + ')';
    const cross = (prevF && prevF !== t.f) ? 'CROSS ' + prevF + '->' + t.f : '';
    console.log(String(i).padStart(3), (t.token || '').padEnd(15), ps.padEnd(16), cross);
    prevF = t.f;
  });

  console.log('\n--- 关键 console 日志 ---');
  logs.filter(l => /录像文件出错|之前的10个操作|接下来10个操作|回放|开始游戏|开始播放|错误|error|Error/i.test(l))
    .slice(-30).forEach(l => console.log('   ', l));

  await browser.close();
})();
