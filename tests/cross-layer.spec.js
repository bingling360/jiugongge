// 跨层追猎/阻击 E2E 测试（真实浏览器游戏运行时）
//
// 背景：本游戏在 headless Chrome 下无法完成“完整开局”（resetGame 依赖图片资源解码，
// core.material.images 在 headless 下不会被填充；且 core 的方法转发、地图 block 萃取等
// 机制在未完整 boot 时缺失）。这些都与“跨层追猎”逻辑无关——追猎检测/执行只依赖
// core.control.controldata.getCheckBlock / _checkBlock_chase / cubeStep 等真实代码，
// 以及 core.status / core.floors / core.material.enemys 等数据结构。
//
// 因此本 e2e 的策略是（与已通过的 vitest 复现用例 repro_hunt.test.js 完全一致，只是搬进
// 真实浏览器运行时）：
//   1) 等待真实引擎初始化（window.core 加载，暴露真实的 getCheckBlock/_checkBlock_chase）；
//   2) 在真实 core 上补齐引擎“脚手架”方法（extractBlocks / getMapBlocksObj / getBlock /
//      changeFloor / moveOneStep / updateCheckBlock 等）——这些方法与跨层追猎算法无关，
//      仅用于让 getCheckBlock 能在最小地图下运行；
//   3) 用构造的 6 面地图直接驱动【真实】的 getCheckBlock 与 _checkBlock_chase，验证跨层追猎修复。
const { test, expect } = require('@playwright/test');

// 等待真实引擎初始化：core.init 异步加载楼层，完成后
// core.control.controldata.getCheckBlock 才就绪（这正是被修复的跨层追猎检测函数）。
// headless 下 core 顶层方法转发未完整生效，这里重新执行一次。
async function waitForEngine(page) {
  await page.waitForFunction(() => {
    const c = window.core || (window.main && window.main.core);
    return !!(c && c.control && c.control.controldata
      && typeof c.control.controldata.getCheckBlock === 'function');
  }, { timeout: 20000 });
  await page.evaluate(() => {
    const c = window.core || (window.main && window.main.core);
    if (c && c._forwardFuncs) c._forwardFuncs();
  });
}

// 在真实 core 上补齐引擎脚手架（与 repro_hunt.test.js 一致），避免依赖 headless 下
// 不可用的图片/地图块萃取机制。被测试的真实逻辑（getCheckBlock/_checkBlock_chase/
// cubeStep）保持不动。
async function installHuntStubs(page) {
  await page.evaluate(() => {
    const core = window.core || (window.main && window.main.core);

    core.__SIZE__ = 13;
    core.flags = core.flags || {};
    core.flags.canGoDeadZone = true;
    core.values = core.values || {};
    core.values.lavaDamage = core.values.lavaDamage || 0;

    core.utils = core.utils || {};
    core.utils.scan = core.utils.scan || {
      up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
    };

    // 地图块萃取/查询脚手架（与真实算法无关）
    core.extractBlocks = function (fid) {
      const f = core.status.maps[fid];
      if (!f || f.blocks) return;
      f.blocks = [];
      f.map.forEach(function (row, y) {
        row.forEach(function (id, x) {
          if (id) f.blocks.push({ x: x, y: y, event: { id: id }, disable: false });
        });
      });
    };
    core.getMapBlocksObj = function (fid) {
      fid = fid || core.status.floorId;
      if (core.status.mapBlockObjs[fid]) return core.status.mapBlockObjs[fid];
      core.extractBlocks(fid);
      const o = {};
      core.status.maps[fid].blocks.forEach(function (b) { o[b.x + ',' + b.y] = b; });
      return (core.status.mapBlockObjs[fid] = o);
    };
    core.getBlock = function (x, y, fid, showDisable) {
      fid = fid || core.status.floorId;
      const b = core.getMapBlocksObj(fid)[x + ',' + y];
      if (b && (showDisable || !b.disable)) return b;
      return null;
    };

    // 怪物/特殊能力相关（确定性桩，强制覆盖，避免 headless 下真实实现
    // 返回 truthy 的 no_chase/no_zone 等 flag 或读取不到的敌人数据导致漏检）
    core.hasItem = function () { return true; };
    core.hasFlag = function () { return false; };
    core.hasSpecial = function (sp, flag) {
      return Array.isArray(sp) ? sp.includes(flag) : sp === flag;
    };
    core.enemys = core.enemys || {};
    core.enemys.hasSpecial = core.hasSpecial;
    core.enemys.canBattle = function () { return true; };
    core.getEnemyValue = function (id) {
      return id ? { id: id, special: [28], hp: 1, atk: 1, def: 0 } : null;
    };
    core.getFaceDownId = function (b) { return b && b.event ? b.event.id : null; };
    core.getSpecialFlag = function () { return 0; };
    core.getDamage = function () { return 999; };

    // 楼层切换/移动脚手架（与跨层 cubeStep 真实逻辑解耦，强制覆盖）
    core.updateCheckBlock = function (fid) {
      core.status.checkBlock = core.control.controldata.getCheckBlock(fid);
      return true;
    };
    core.changeFloor = function (fid, stair, heroLoc, time, cb) {
      core.status.floorId = fid;
      if (heroLoc) Object.assign(core.status.hero.loc, heroLoc);
      core.updateCheckBlock(fid);
      if (cb) cb();
    };
    core.moveOneStep = function (cb) { if (cb) cb(); };
    core.checkRouteFolding = function () {};
    core.canMoveHero = function () { return true; };
    core.turnDirection = function (cmd, dir) {
      return cmd === ':back'
        ? { up: 'down', down: 'up', left: 'right', right: 'left' }[dir]
        : dir;
    };
    core.redrawMap = function () {};
  });
}

// 构造 6 个面的地图并注册“追猎”(special 含 28)怪物，返回检测与执行结果
async function setupScenario(page, opts) {
  return await page.evaluate((o) => {
    const core = window.core || (window.main && window.main.core);
    const cd = core.control.controldata;
    const FACES = ['MT0', 'MT1', 'MT2', 'MT3', 'MT4', 'MT5'];

    core.status = core.status || {};
    core.status.maps = core.status.maps || {};
    core.floors = core.floors || {};
    core.status.mapBlockObjs = {};
    core.status.checkBlock = core.status.checkBlock || {};
    core.status.route = core.status.route || [];
    core.status.automaticRoute = core.status.automaticRoute || { moveStepBeforeStop: [], lastDirection: null };
    core.status.heroMoving = 0;
    core.status.event = core.status.event || {};

    FACES.forEach(function (f) {
      core.status.maps[f] = {
        map: Array.from({ length: 13 }, function () { return Array(13).fill(0); }),
        blocks: null,
      };
      core.floors[f] = { width: 13, height: 13, blocks: null };
    });

    // 注册带“追猎”的怪物
    core.material = core.material || {};
    core.material.enemys = core.material.enemys || {};
    core.material.enemys['HUNTER'] = {
      id: 'HUNTER', name: '测试猎人', special: [28], hp: 1, atk: 1, def: 0,
    };

    // 放置猎人
    core.status.maps[o.monsterFace].map[o.monsterY][o.monsterX] = 'HUNTER';

    // 玩家
    core.status.hero = { loc: { x: o.heroX, y: o.heroY }, hp: 1000, flags: {}, statistics: { extraDamage: 0 } };
    core.status.floorId = 'MT5';

    // 检测
    const info = cd.getCheckBlock('MT5');
    const detected = info.chase[o.heroX + ',' + o.heroY] || null;

    // 执行：逐格靠近并最终跨面到底面
    for (let i = 0; i < 6; i++) {
      const inf = cd.getCheckBlock('MT5');
      const ch = inf.chase[o.heroX + ',' + o.heroY];
      if (!ch || ch.length === 0) break;
      core.control._checkBlock_chase(ch);
    }

    let monsterFloor = null, monsterXY = null;
    FACES.forEach(function (f) {
      const m = core.status.maps[f];
      if (!m) return;
      for (let y = 0; y < 13; y++) for (let x = 0; x < 13; x++) {
        if (m.map[y][x] === 'HUNTER') { monsterFloor = f; monsterXY = [x, y]; }
      }
    });

    return { detected: detected, monsterFloor: monsterFloor, monsterXY: monsterXY };
  }, opts);
}

test.describe('跨层怪物技能', () => {
  test.describe.configure({ timeout: 60000 });

  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await waitForEngine(page);
    await installHuntStubs(page);
  });

  test('真实引擎已加载并暴露跨层追猎检测函数', async ({ page }) => {
    const ok = await page.evaluate(() => {
      const c = window.core || (window.main && window.main.core);
      return !!(c && c.control && c.control.controldata && typeof c.control.controldata.getCheckBlock === 'function');
    });
    expect(ok, '真实浏览器运行时应加载引擎并暴露 getCheckBlock').toBe(true);
  });

  // ===== 核心回归：侧面（MT2）怪物应能跨层追猎到底面（MT5） =====
  // 复现用户反馈的 bug：x=10 的侧面猎人无法跨层追到底面。
  test('跨层追猎：左面(MT2)猎人能跨面追猎到底面(MT5)', async ({ page }) => {
    const result = await setupScenario(page, {
      monsterFace: 'MT2', monsterX: 10, monsterY: 11,
      heroX: 0, heroY: 10,
    });
    expect(result.detected, '应能检测到 MT2→MT5 的跨层追猎').not.toBeNull();
    expect(result.detected.some((c) => c.srcFloor === 'MT2'), '追猎来源应为 MT2').toBe(true);
    expect(result.monsterFloor, '怪物应跨面到底面 MT5').toBe('MT5');
    expect(result.monsterXY, '怪物应出现在 MT5 上').not.toBeNull();
  });

  test('跨层追猎：右面(MT3)猎人也能跨面追猎到底面(MT5)', async ({ page }) => {
    const result = await setupScenario(page, {
      monsterFace: 'MT3', monsterX: 10, monsterY: 11,
      heroX: 12, heroY: 10,
    });
    expect(result.detected, '应能检测到 MT3→MT5 的跨层追猎').not.toBeNull();
    expect(result.detected.some((c) => c.srcFloor === 'MT3'), '追猎来源应为 MT3').toBe(true);
    expect(result.monsterFloor, '怪物应跨面到底面 MT5').toBe('MT5');
  });

  test('对照：前面(MT0)猎人本就能跨层追猎到底面(MT5)', async ({ page }) => {
    const result = await setupScenario(page, {
      monsterFace: 'MT0', monsterX: 10, monsterY: 12,
      heroX: 10, heroY: 0,
    });
    expect(result.detected, 'MT0→MT5 应检测到追猎').not.toBeNull();
  });
});
