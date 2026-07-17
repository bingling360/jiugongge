'use strict';
// 跨面录像修复——重构版
// 真实引擎驱动，逐步回放原始录像，按几何规则找出“记录成 newDir、回放时跨不出去”的跨面 token，
// 将其还原为真实输入方向（贴边处的外向方向），使回放能真正执行跨面操作。
// 规则（精确区分“坏掉的跨面”与“沿边正常行走”）：
//   在贴边（非角点）位置时，若记录的 token 应用后【不跨面】，但该边的【外向方向】应用后【跨面】，
//   则说明记录的 token 是旋转后的 newDir（贴边沿边走/向内走），应改为外向方向。
//   沿边正常行走：外向方向应用后同样是“不跨面”（向内走），故不会被误改。
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = 'http://127.0.0.1:1055/';
const ORIG = 'C:/Users/xuan/Downloads/lifangti_20260716230451.h5route';
const OUT  = 'C:/Users/xuan/Downloads/lifangti_20260716230451.fixed.h5route';

function buildHarness() {
  // 在浏览器内注入真实楼层 + 桩，返回可复用的辅助函数
  return async (RAW) => {
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
    const cubeStep = (f,x,y,d) => _cm.step(f,x,y,d);
    if (_cm) { const _rc = _cm.canCross; _cm.canCross = function () { try { return _rc.apply(this, arguments); } catch (e) { return true; } }; }
    core.getBlock = function (x, y, fid) { fid = fid || core.status.floorId; const m = core.status.maps[fid]; if (!m) return null;
      const id = m.map[y] && m.map[y][x]; if (!id) return null; return { x, y, event: { id }, disable: false }; };

    const fd = core.firstData || data.firstData || data;
    const h = (fd && fd.hero) || { loc: { x:6,y:6,direction:'up' } };
    function resetHero() {
      core.status.hero = { loc: { x:h.loc.x, y:h.loc.y, direction:h.loc.direction||'up' }, hp:999999, atk:999, def:999, items:{tools:{},constants:{}}, equipment:{} };
      core.status.floorId = (fd && fd.floorId) || floorIds[0];
      core.status.thisMap = core.status.maps[core.status.floorId];
    }
    const DIRS = ['up','down','left','right'];
    const opposite = { up:'down', down:'up', left:'right', right:'left' };
    function snap() { return { f: core.status.floorId, x: core.status.hero.loc.x, y: core.status.hero.loc.y, d: core.status.hero.loc.direction }; }
    function outwardDir(pos) {
      const W = core.floors[pos.f].width, H = core.floors[pos.f].height;
      const e = [];
      if (pos.y === 0) e.push('up');
      if (pos.y === H-1) e.push('down');
      if (pos.x === 0) e.push('left');
      if (pos.x === W-1) e.push('right');
      return e.length === 1 ? e[0] : null;
    }
    function crosses(f,x,y,d) { const t = cubeStep(f,x,y,d); return !!(t && t.crossed); }
    function applyToken(token) {
      if (DIRS.indexOf(token) >= 0) { if (core.status.heroMoving !== 0) core.status.heroMoving = 0; core.moveHero(token, function(){}); return; }
      if (token.indexOf('move:') === 0) { const p = token.substring(5).split(':'); const x=+p[0], y=+p[1]; if(!isNaN(x)&&!isNaN(y)){ core.status.hero.loc.x=x; core.status.hero.loc.y=y; } return; }
      // turn:/turn:left/getNext/item:/choices: 等不改变位置，忽略
    }

    const meta = JSON.parse(LZ.decompressFromBase64(RAW));
    const tokens = core.decodeRoute(meta.route);
    const report = { changes: [], iterations: 0 };

    let changed = true;
    while (changed) {
      changed = false; report.iterations++;
      resetHero();
      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (DIRS.indexOf(token) < 0) { applyToken(token); continue; }
        const pre = snap();
        const od = outwardDir(pre);
        if (od) {
          // 精确判别“坏掉的跨面”：记录的 token 等于“从该边外向方向跨出所产生的 newDir”，
          // 且把它当输入方向应用时【并不会跨面】（因 newDir 在贴边处是向内/沿边方向）。
          // 对称的正确跨面：token==newDir 但应用时【会跨面】→ 不动。
          // 沿边正常行走：token 不是任何 newDir → 不动。
          const adj = cubeStep && _cm.getAdjacent ? _cm.getAdjacent(pre.f, od) : null;
          const newDirPerOd = adj ? opposite[adj[1]] : null;
          const tokenIsNewDir = !!newDirPerOd && token === newDirPerOd;
          const tokenCrosses = crosses(pre.f, pre.x, pre.y, token);
          if (tokenIsNewDir && !tokenCrosses) {
            report.changes.push({ i, from: token, to: od, at: pre.f+'('+pre.x+','+pre.y+')' });
            tokens[i] = od; changed = true; break;
          }
        }
        applyToken(token);
      }
    }

    // 验证：完整回放修正后的 tokens，统计跨面与终点
    resetHero();
    const crossesList = [];
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const before = snap();
      applyToken(token);
      const after = snap();
      if (before.f !== after.f) crossesList.push({ i, token, from: before.f+'('+before.x+','+before.y+')', to: after.f+'('+after.x+','+after.y+')' });
    }
    const final = snap();

    // 跨面统计已反映在 crossesList 中。方向重录一致性（是否与录像记录的方向序列一致）
    // 由 verify_crossface_playback.js 用真实引擎回放判定，这里仅确认修正后每个方向 token
    // 都作为“真实输入方向”被 moveAction 重录（重写后 dir == token 恒成立）。

    const newMeta = Object.assign({}, meta, { route: core.encodeRoute(tokens) });
    const compressed = LZ.compressToBase64(JSON.stringify(newMeta));
    return { report, final, crosses: crossesList, compressed, totalTokens: tokens.length };
  };
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => { const c = window.core || (window.main && window.main.core); return !!(c && c.control && c.control.controldata && typeof c.control.controldata.getCheckBlock === 'function'); }, { timeout: 30000 });

  const fn = buildHarness();
  const res = await page.evaluate(fn, fs.readFileSync(ORIG,'utf8').trim());

  console.log('=== 重构结果 ===');
  console.log('迭代次数:', res.report.iterations);
  console.log('改动 token:', res.report.changes.length);
  res.report.changes.forEach(c => console.log('  步'+c.i+': '+c.from+' -> '+c.to+'  @'+c.at));
  console.log('修正后跨面次数:', res.crosses.length);
  res.crosses.forEach(c => console.log('  步'+c.i, c.token, c.from+'->'+c.to));
  console.log('终点:', JSON.stringify(res.final));
  console.log('总 token:', res.totalTokens);
  console.log('（跨面“是否真正执行”与“记录一致性”由 verify_crossface_playback.js 用真实引擎回放判定）');

  if (res.report.changes.length > 0) {
    fs.writeFileSync(OUT, res.compressed);
    console.log('已写出修复录像:', OUT);
  } else {
    console.log('未检测到需要修复的跨面 token（录像本身无需修复）');
  }
  if (errors.length) { console.log('--- 页面错误 ---'); errors.slice(0,5).forEach(e=>console.log('  ',e)); }
  await browser.close();
})();
