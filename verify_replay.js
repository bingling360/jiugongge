'use strict';
// 真实引擎回放验证器：headless Chrome 加载游戏（真实 cubeMap / moveAction 已在引擎中），
// 再把【真实】的 6 面楼层地图注入 core.status.maps / core.floors，用真实 moveHero 逐步回放，
// 渲染/动画桩为同步。检测录像能否跑通、是否在跨面处错位。
const { chromium } = require('playwright');
const fs = require('fs');

const BASE = 'http://127.0.0.1:1055/';
const ORIG = 'C:/Users/xuan/Downloads/lifangti_20260716230451.h5route';
const FIXED = 'C:/Users/xuan/Downloads/lifangti_20260716230451.fixed.h5route';

function drive(page, file, label) {
  const raw = fs.readFileSync(file, 'utf8').trim();
  return page.evaluate(async (raw) => {
    const out = { label: '', total: 0, steps: [], error: null, final: null, failedAt: -1, floors: [] };
    const core = window.core || (window.main && window.main.core);
    if (!core) return Object.assign(out, { error: 'core 未加载' });
    const LZ = window.LZString;
    if (!LZ) return Object.assign(out, { error: 'LZString 未加载' });

    // ---- 载入真实数据/地图/楼层 ----
    async function get(u) { const r = await fetch(u); if (!r.ok) throw new Error('fetch ' + u + ' ' + r.status); return r.text(); }
    function loadVar(code, name) {
      try { return new Function(code + '\n;return (' + name + ');')(); }
      catch (e) { return new Function('main', code + '\n;return main;')(); }
    }
    const dataCode = await get('/project/data.js');
    const data = loadVar(dataCode, 'data');
    const floorIds = (data.main && data.main.floorIds) || data.floorIds || ['MT0','MT1','MT2','MT3','MT4','MT5'];
    out.floors = floorIds;
    const main = { floors: {} };
    for (const fid of floorIds) {
      const fc = await get('/project/floors/' + fid + '.js');
      new Function('main', fc)(main);
    }
    // 注入真实楼层
    core.floors = core.floors || {};
    core.status.maps = core.status.maps || {};
    core.status.mapBlockObjs = {};
    for (const fid of floorIds) {
      const f = main.floors[fid];
      if (!f) continue;
      core.floors[fid] = { floorId: fid, width: f.width || 13, height: f.height || 13, map: f.map, blocks: null };
      core.status.maps[fid] = { floorId: fid, width: f.width || 13, height: f.height || 13, map: f.map, blocks: null };
    }

    // ---- 桩：渲染/动画/事件同步化，只保留真实移动与跨面几何 ----
    core.isReplaying = () => true;
    core.status.heroMoving = 0;
    core.status.replay = { replaying: true, pausing: false, failed: false, animate: false, toReplay: [], totalList: [], steps: 0, save: [] };
    core.status.event = core.status.event || {}; core.status.event.id = null;
    core.status.route = core.status.route || [];
    core.setHeroMoveInterval = function (fn) { fn(); };
    core.moveOneStep = function (cb) { if (cb) cb(); };
    core.checkRouteFolding = function () {};
    core.drawHero = function () {}; core.redrawMap = function () {};
    core.updateStatusBar = function () {}; core.checkAutoEvents = function () {};
    core.trigger = function (x, y, cb) { if (cb) cb(); };
    core.canMoveHero = function () { return true; };
    core.hasFlag = function () { return false; }; core.setFlag = function () {};
    core.getNextItem = core.getNextItem || function () {};
    core.useItem = core.useItem || function (id, nr, cb) { if (cb) cb(); };
    core.loadEquip = core.loadEquip || function (id, cb) { if (cb) cb(); };
    core.status.automaticRoute = core.status.automaticRoute || { moveStepBeforeStop: [], lastDirection: null };
    core.changeFloor = function (fid, stair, heroLoc, time, cb) {
      core.status.floorId = fid;
      core.status.thisMap = core.status.maps[fid];
      if (heroLoc) Object.assign(core.status.hero.loc, heroLoc);
      if (cb) cb();
    };
    const _cm = (core.plugin && core.plugin.cubeMap) || core.cubeMap;
    if (_cm) {
      const _realCanCross = _cm.canCross;
      _cm.canCross = function () { try { return _realCanCross.apply(this, arguments); } catch (e) { return true; } };
    }

    // getBlock：从真实地图读取（位置追踪足够）
    core.getBlock = function (x, y, fid, showDisable) {
      fid = fid || core.status.floorId;
      const m = core.status.maps[fid]; if (!m) return null;
      const id = m.map[y] && m.map[y][x];
      if (!id) return null;
      return { x: x, y: y, event: { id: id }, disable: false };
    };

    // ---- 英雄起点 ----
    const fd = core.firstData || data.firstData || data;
    const h = (fd && fd.hero) || { loc: { x: 6, y: 6, direction: 'up' } };
    core.status.hero = { loc: { x: h.loc.x, y: h.loc.y, direction: h.loc.direction || 'up' },
      hp: 999999, atk: 999, def: 999, items: { tools: {}, constants: {} }, equipment: {} };
    core.status.floorId = (fd && fd.floorId) || floorIds[0];
    core.status.thisMap = core.status.maps[core.status.floorId];

    // ---- 解码并回放 ----
    let meta;
    try { meta = JSON.parse(LZ.decompressFromBase64(raw)); }
    catch (e) { return Object.assign(out, { error: '解压失败: ' + e.message }); }
    const route = core.decodeRoute(meta.route);
    out.total = route.length;

    const snap = () => ({ f: core.status.floorId, x: core.status.hero.loc.x, y: core.status.hero.loc.y, d: core.status.hero.loc.direction });
    let idx = 0, done = false;
    function processToken(token, cbk) {
      if (core.status.heroMoving !== 0) core.status.heroMoving = 0;
      if (['up', 'down', 'left', 'right'].indexOf(token) >= 0) {
        try { core.moveHero(token, cbk); }
        catch (e) { out.error = 'moveHero 异常 @' + idx + '(' + token + '): ' + e.message; cbk(); }
      } else if (token.indexOf('move:') === 0) {
        const p = token.substring(5).split(':'); const x = +p[0], y = +p[1];
        if (!isNaN(x) && !isNaN(y)) { core.status.hero.loc.x = x; core.status.hero.loc.y = y; }
        cbk();
      } else if (token.indexOf('turn:') === 0) { core.status.hero.loc.direction = token.substring(5); cbk(); }
      else if (token === 'turn') { const m = { up: 'right', right: 'down', down: 'left', left: 'up' }; core.status.hero.loc.direction = m[core.status.hero.loc.direction] || 'up'; cbk(); }
      else { cbk(); }
    }
    while (idx < route.length && !done) {
      const token = route[idx];
      const before = snap();
      let cbCalled = false;
      processToken(token, function () {
        if (cbCalled) return; cbCalled = true;
        const after = snap();
        out.steps.push({ i: idx, t: token, before, after });
        const f = core.floors[after.f];
        if (f && (after.x < 0 || after.y < 0 || after.x >= f.width || after.y >= f.height)) {
          out.failedAt = idx; out.error = '英雄越界 @step' + idx + ' -> ' + JSON.stringify(after); done = true; return;
        }
        idx++;
      });
      if (out.error) { done = true; }
    }
    out.final = snap();
    return out;
  }, raw);
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const c = window.core || (window.main && window.main.core);
    return !!(c && c.control && c.control.controldata && typeof c.control.controldata.getCheckBlock === 'function');
  }, { timeout: 30000 });

  for (const [name, file] of [['原始录像(预期坏)', ORIG], ['修复后录像(预期好)', FIXED]]) {
    console.log('===== ' + name + ' =====');
    const r = await drive(page, file, name);
    if (r.error) console.log('  错误:', r.error);
    else {
      console.log('  楼层:', r.floors.join(','));
      console.log('  总步数:', r.total, ' 越界/失败步:', r.failedAt);
      console.log('  终点:', JSON.stringify(r.final));
      const cross = r.steps.filter(s => s.before.f !== s.after.f);
      console.log('  跨面次数:', cross.length);
      cross.forEach(c => console.log('    步' + c.i, c.t, c.before.f + '(' + c.before.x + ',' + c.before.y + ')->' + c.after.f + '(' + c.after.x + ',' + c.after.y + ')'));
    }
  }
  if (errors.length) { console.log('--- 页面错误(节选) ---'); errors.slice(0, 8).forEach(e => console.log('  ', e)); }
  await browser.close();
})();
