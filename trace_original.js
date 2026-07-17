'use strict';
// 用真实引擎逐步回放原始录像，打印每一步：token、跨面前位置、是否跨面、跨面后位置。
// 目的：看清录像里到底存了什么方向的 token，以及哪些跨面 token 在回放时“没跨出去”。
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = 'http://127.0.0.1:1055/';
const RAW = fs.readFileSync('C:/Users/xuan/Downloads/lifangti_20260716230451.h5route', 'utf8').trim();

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => { const c = window.core || (window.main && window.main.core); return !!(c && c.control && c.control.controldata && typeof c.control.controldata.getCheckBlock === 'function'); }, { timeout: 30000 });

  const out = await page.evaluate(async (RAW) => {
    const core = window.core || (window.main && window.main.core);
    const LZ = window.LZString;
    async function get(u) { const r = await fetch(u); if (!r.ok) throw new Error('fetch ' + u); return r.text(); }
    function loadVar(code, name) { try { return new Function(code + '\n;return (' + name + ');')(); } catch (e) { return new Function('main', code + '\n;return main;')(); } }
    const data = loadVar(await get('/project/data.js'), 'data');
    const floorIds = (data.main && data.main.floorIds) || data.floorIds || ['MT0','MT1','MT2','MT3','MT4','MT5'];
    const main = { floors: {} };
    for (const fid of floorIds) { const fc = await get('/project/floors/' + fid + '.js'); new Function('main', fc)(main); }
    core.floors = core.floors || {}; core.status.maps = core.status.maps || {};
    for (const fid of floorIds) { const f = main.floors[fid]; if (!f) continue;
      core.floors[fid] = { floorId: fid, width: f.width||13, height: f.height||13, map: f.map };
      core.status.maps[fid] = { floorId: fid, width: f.width||13, height: f.height||13, map: f.map }; }

    core.isReplaying = () => false;
    core.status.heroMoving = 0;
    core.status.route = [];
    core.setHeroMoveInterval = function (fn) { fn(); };
    core.moveOneStep = function (cb) { if (cb) cb(); };
    core.checkRouteFolding = function () {};
    core.drawHero = function () {}; core.redrawMap = function () {};
    core.updateStatusBar = function () {}; core.checkAutoEvents = function () {};
    core.trigger = function (x,y,cb) { if (cb) cb(); };
    core.canMoveHero = function () { return true; };
    core.hasFlag = function () { return false; }; core.setFlag = function () {};
    core.status.automaticRoute = core.status.automaticRoute || { moveStepBeforeStop: [], lastDirection: null };
    core.changeFloor = function (fid, stair, heroLoc, time, cb) {
      core.status.floorId = fid; core.status.thisMap = core.status.maps[fid];
      if (heroLoc) Object.assign(core.status.hero.loc, heroLoc); if (cb) cb();
    };
    const _cm = (core.plugin && core.plugin.cubeMap) || core.cubeMap;
    if (_cm) { const _rc = _cm.canCross; _cm.canCross = function () { try { return _rc.apply(this, arguments); } catch (e) { return true; } }; }
    core.getBlock = function (x, y, fid) { fid = fid || core.status.floorId; const m = core.status.maps[fid]; if (!m) return null;
      const id = m.map[y] && m.map[y][x]; if (!id) return null; return { x, y, event: { id }, disable: false }; };
    const fd = core.firstData || data.firstData || data;
    const h = (fd && fd.hero) || { loc: { x:6,y:6,direction:'up' } };
    core.status.hero = { loc: { x:h.loc.x, y:h.loc.y, direction:h.loc.direction||'up' }, hp:999999, atk:999, def:999, items:{tools:{},constants:{}}, equipment:{} };
    core.status.floorId = (fd && fd.floorId) || floorIds[0];
    core.status.thisMap = core.status.maps[core.status.floorId];

    const meta = JSON.parse(LZ.decompressFromBase64(RAW));
    const route = core.decodeRoute(meta.route);
    const W = (core.floors[core.status.floorId].width), H = (core.floors[core.status.floorId].height);
    const snap = () => ({ f: core.status.floorId, x: core.status.hero.loc.x, y: core.status.hero.loc.y, d: core.status.hero.loc.direction });
    const steps = [];
    for (let i = 0; i < route.length; i++) {
      const token = route[i];
      const before = snap();
      const onEdge = (before.x===0?'L':'')+(before.x===W-1?'R':'')+(before.y===0?'U':'')+(before.y===H-1?'D':'');
      let cbCalled = false;
      const errs = [];
      try { core.moveHero(token, () => { cbCalled = true; }); } catch (e) { errs.push(e.message); }
      const after = snap();
      const crossed = before.f !== after.f;
      steps.push({ i, token, before: before.f+'('+before.x+','+before.y+')', after: after.f+'('+after.x+','+after.y+')', onEdge, crossed, err: errs.join('|') });
    }
    return steps;
  }, RAW);

  console.log('idx token  before          after           edge  cross  err');
  for (const s of out) {
    console.log(String(s.i).padStart(3), (s.token||'').padEnd(6), s.before.padEnd(14), s.after.padEnd(14), (s.onEdge||'-').padEnd(5), String(s.crossed).padEnd(5), s.err||'');
  }
  await browser.close();
})();
