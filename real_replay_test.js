'use strict';
// 真实回放链路测试：直接驱动引擎的 replay 机制（replay -> _replayAction_move -> moveHero -> moveAction -> changeFloor -> replay）
// 复用 真实 cubeMap / moveAction / checkRouteFolding，只桩掉渲染/动画/输入轮询。
// 关键：回放会【重新录制】进 core.status.route，结束后 _replay_finished 做“记录不一致”一致性校验。
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = 'http://127.0.0.1:1055/';
const ORIG = fs.readFileSync('C:/Users/xuan/Downloads/lifangti_20260716230451.h5route', 'utf8').trim();
const FIX = fs.readFileSync('C:/Users/xuan/Downloads/lifangti_20260716230451.fixed.h5route', 'utf8').trim();

function run(page, raw, label) {
  return page.evaluate(async ({ raw, label }) => {
    const out = { label, error: null, finishMsg: null, cross: [], steps: 0, final: null, consistent: null, routeLen: -1, totalLen: -1 };
    const core = window.core || (window.main && window.main.core);
    if (!core) return Object.assign(out, { error: 'core 未加载' });
    const LZ = window.LZString;
    if (!LZ) return Object.assign(out, { error: 'LZString 未加载' });

    async function get(u) { const r = await fetch(u); if (!r.ok) throw new Error('fetch ' + u + ' ' + r.status); return r.text(); }
    function loadVar(code, name) { try { return new Function(code + '\n;return (' + name + ');')(); } catch (e) { return new Function('main', code + '\n;return main;')(); } }
    const dataCode = await get('/project/data.js');
    const data = loadVar(dataCode, 'data');
    const floorIds = (data.main && data.main.floorIds) || data.floorIds || ['MT0','MT1','MT2','MT3','MT4','MT5'];
    const main = { floors: {} };
    for (const fid of floorIds) { const fc = await get('/project/floors/' + fid + '.js'); new Function('main', fc)(main); }
    core.floors = core.floors || {};
    core.status.maps = core.status.maps || {};
    for (const fid of floorIds) {
      const f = main.floors[fid]; if (!f) continue;
      core.floors[fid] = { floorId: fid, width: f.width || 13, height: f.height || 13, map: f.map };
      core.status.maps[fid] = { floorId: fid, width: f.width || 13, height: f.height || 13, map: f.map };
    }

    // ---- 桩：只保留真实移动与跨面几何 ----
    core.isPlaying = () => true;
    core.isReplaying = () => true;
    core.flags = core.flags || { enableRouteFolding: false };
    if (core.status.hero) core.status.hero.flags = core.status.hero.flags || {};
    if (typeof window !== 'undefined') window.flags = (core.status.hero && core.status.hero.flags) || {};
    core.status.heroMoving = 0;
    core.status.event = core.status.event || {}; core.status.event.id = null;
    core.status.route = [];
    core.setHeroMoveInterval = function (fn) { fn(); };
    core.moveOneStep = function (cb) { if (cb) cb(); };
    // checkRouteFolding 保持真实（这是录像折叠逻辑，可能是失败来源），但兜底防崩
    const _realFold = core.checkRouteFolding;
    core.checkRouteFolding = function () { try { if (_realFold) _realFold.call(core); } catch (e) { out.error = (out.error || '') + '[fold:' + e.message + ']'; } };
    core.drawHero = function () {}; core.redrawMap = function () {};
    core.updateStatusBar = function () {}; core.checkAutoEvents = function () {};
    core.trigger = function (x, y, cb) { if (cb) cb(); };
    core.canMoveHero = function () { return true; };
    core.hasFlag = function () { return false; }; core.setFlag = function () {};
    core.getNextItem = core.getNextItem || function () {};
    core.useItem = core.useItem || function (id, nr, cb) { if (cb) cb(); };
    core.loadEquip = core.loadEquip || function (id, cb) { if (cb) cb(); };
    core.status.automaticRoute = core.status.automaticRoute || { moveStepBeforeStop: [], lastDirection: null };
    // changeFloor：同步桩，仅设置楼层与英雄落点（保留真实跨面几何由 moveAction 计算）
    core.changeFloor = function (fid, stair, heroLoc, time, cb) {
      core.status.floorId = fid;
      core.status.thisMap = core.status.maps[fid];
      if (heroLoc) Object.assign(core.status.hero.loc, heroLoc);
      if (cb) cb();
    };
    const _cm = (core.plugin && core.plugin.cubeMap) || core.cubeMap;
    if (_cm) { const _rc = _cm.canCross; _cm.canCross = function () { try { return _rc.apply(this, arguments); } catch (e) { out.error = (out.error || '') + '[canCross:' + e.message + ']'; return true; } }; }
    core.getBlock = function (x, y, fid, showDisable) {
      fid = fid || core.status.floorId; const m = core.status.maps[fid]; if (!m) return null;
      const id = m.map[y] && m.map[y][x]; if (!id) return null;
      return { x: x, y: y, event: { id: id }, disable: false };
    };
    // 捕获 finish / error 提示
    core.ui = core.ui || {};
    core.ui.drawConfirmBox = function (msg) { out.finishMsg = msg; };

    // 英雄起点
    const fd = core.firstData || data.firstData || data;
    const h = (fd && fd.hero) || { loc: { x: 6, y: 6, direction: 'up' } };
    core.status.hero = { loc: { x: h.loc.x, y: h.loc.y, direction: h.loc.direction || 'up' },
      hp: 999999, atk: 999, def: 999, items: { tools: {}, constants: {} }, equipment: {} };
    core.status.floorId = (fd && fd.floorId) || floorIds[0];
    core.status.thisMap = core.status.maps[core.status.floorId];

    // 解码
    let meta; try { meta = JSON.parse(LZ.decompressFromBase64(raw)); } catch (e) { return Object.assign(out, { error: '解压失败: ' + e.message }); }
    const route = core.decodeRoute(meta.route);
    out.totalLen = route.length;

    // 直接装配 replay 状态（绕过 startReplay 的 canvas/toolbar 依赖）
    core.status.replay = core.status.replay || {};
    core.status.replay.replaying = true;
    core.status.replay.pausing = false;
    core.status.replay.failed = false;
    core.status.replay.animate = false;
    core.status.replay.toReplay = core.cloneArray ? core.cloneArray(route) : route.slice();
    core.status.replay.totalList = core.status.route.concat(route);
    core.status.replay.steps = 0;
    core.status.replay.save = [];

    const snap = () => ({ f: core.status.floorId, x: core.status.hero.loc.x, y: core.status.hero.loc.y, d: core.status.hero.loc.direction });
    let prev = snap();
    // 递归回调驱动：每个 move 完成后 core.replay 被再次调用
    let guard = 0;
    const origReplay = core.control.replay.bind(core.control);
    // 包装 replay 以便追踪跨面
    function drive() {
      if (guard++ > route.length + 50) { out.error = (out.error || '') + '[guard-hit]'; return; }
      if (core.status.replay.toReplay.length === 0) { origReplay(); return; }
      const before = snap();
      const action = core.status.replay.toReplay[0];
      // 调用真实 replay 处理一个 action（它会 shift 并触发 moveHero->...->callback(=replay)）
      origReplay();
      const after = snap();
      if (before.f !== after.f) out.cross.push({ i: route.length - core.status.replay.toReplay.length, t: action, from: before.f + '(' + before.x + ',' + before.y + ')', to: after.f + '(' + after.x + ',' + after.y + ')' });
      if (core.status.replay.failed) { out.error = (out.error || '') + '[replay-failed@' + action + ']'; return; }
      if (core.status.replay.toReplay.length > 0 && core.status.replay.pausing === false) drive();
    }
    try { drive(); } catch (e) { out.error = (out.error || '') + '[throw:' + e.message + ']'; }

    out.steps = core.status.replay.steps;
    out.final = snap();
    out.routeLen = core.status.route.length;
    out.totalLen2 = core.status.replay.totalList.length;
    // 一致性：route 是否以 totalList 为子数组（subarray 检查）
    try {
      const sub = core.subarray ? core.subarray(core.status.route, core.status.replay.totalList) : null;
      out.consistent = (core.status.route.length === core.status.replay.totalList.length) && sub !== null;
    } catch (e) { out.consistent = 'ERR:' + e.message; }
    return out;
  }, { raw, label });
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => { const c = window.core || (window.main && window.main.core); return !!(c && c.control && c.control.controldata && typeof c.control.controldata.getCheckBlock === 'function'); }, { timeout: 30000 });

  for (const [label, raw] of [['原始录像', ORIG], ['修复后录像', FIX]]) {
    console.log('===== ' + label + ' =====');
    const r = await run(page, raw, label);
    console.log('  finishMsg:', JSON.stringify(r.finishMsg));
    console.log('  error:', r.error || '(无)');
    console.log('  steps:', r.steps, ' routeLen:', r.routeLen, ' totalLen:', r.totalLen2);
    console.log('  记录一致(无不一致提示):', r.consistent);
    console.log('  终点:', JSON.stringify(r.final));
    console.log('  跨面次数:', r.cross.length);
    r.cross.forEach(c => console.log('    步' + c.i, c.t, c.from + '->' + c.to));
  }
  if (errors.length) { console.log('--- 页面错误(节选) ---'); errors.slice(0, 10).forEach(e => console.log('  ', e)); }
  await browser.close();
})();
