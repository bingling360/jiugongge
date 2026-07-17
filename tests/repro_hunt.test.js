// 跨层追猎 bug 复现（独立 harness，不加载 plugins.js 以避免 items is not defined）
// 直接加载真实的 functions.js（cubeStep / getCheckBlock）和 control.js（_checkBlock_chase）
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('跨层追猎 bug 复现', () => {
  let core, controldata, control;

  beforeEach(() => {
    const makeMap = () => Array(13).fill(null).map(() => Array(13).fill(0));
    core = global.core = {
      __SIZE__: 13,
      status: {
        hero: { loc: { x: 0, y: 10 }, hp: 1000, flags: {}, statistics: { extraDamage: 0 } },
        floorId: 'MT5',
        event: {},
        mapBlockObjs: {},
        route: [],
        automaticRoute: { moveStepBeforeStop: [], lastDirection: null },
        heroMoving: 0,
        maps: {
          MT0: { map: makeMap(), blocks: null },
          MT1: { map: makeMap(), blocks: null },
          MT2: { map: makeMap(), blocks: null },
          MT3: { map: makeMap(), blocks: null },
          MT4: { map: makeMap(), blocks: null },
          MT5: { map: makeMap(), blocks: null },
        },
      },
      floors: {
        MT0: { width: 13, height: 13 }, MT1: { width: 13, height: 13 },
        MT2: { width: 13, height: 13 }, MT3: { width: 13, height: 13 },
        MT4: { width: 13, height: 13 }, MT5: { width: 13, height: 13 },
      },
      utils: { scan: { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } } },
      control: { controldata: {}, getChaseType: () => ['items'] },
      flags: { canGoDeadZone: true },
      values: { lavaDamage: 0 },
      hasItem: () => true,
      hasSpecial: (sp, flag) => (Array.isArray(sp) ? sp.includes(flag) : sp === flag),
      hasFlag: () => false,
      enemys: { hasSpecial: (sp, flag) => (Array.isArray(sp) ? sp.includes(flag) : sp === flag), canBattle: vi.fn(() => true) },
      getEnemyValue: vi.fn((id) => (id ? { id, special: [28], hp: 1, atk: 1, def: 0 } : null)),
      getFaceDownId: (b) => (b && b.event ? b.event.id : null),
      getSpecialFlag: () => 0,
      getDamage: () => 999,
      getCheckBlock: vi.fn(() => ({ damage: {} })),
      updateCheckBlock: vi.fn((fid) => { core.status.checkBlock = controldata.getCheckBlock(fid); return true; }),
      canMoveHero: () => true,
      turnDirection: (cmd, dir) => (cmd === ':back' ? { up: 'down', down: 'up', left: 'right', right: 'left' }[dir] : dir),
      redrawMap: vi.fn(),
      extractBlocks: (fid) => {
        const f = core.status.maps[fid];
        if (!f || f.blocks) return;
        f.blocks = [];
        f.map.forEach((row, y) => row.forEach((id, x) => { if (id) f.blocks.push({ x, y, event: { id }, disable: false }); }));
      },
      getMapBlocksObj: (fid) => {
        fid = fid || core.status.floorId;
        if (core.status.mapBlockObjs[fid]) return core.status.mapBlockObjs[fid];
        core.extractBlocks(fid);
        const o = {};
        core.status.maps[fid].blocks.forEach((b) => { o[b.x + ',' + b.y] = b; });
        return (core.status.mapBlockObjs[fid] = o);
      },
      changeFloor: vi.fn((fid, stair, heroLoc, time, cb) => { core.status.floorId = fid; if (heroLoc) Object.assign(core.status.hero.loc, heroLoc); core.updateCheckBlock(fid); if (cb) cb(); }),
      moveOneStep: vi.fn((cb) => { if (cb) cb(); }),
      checkRouteFolding: vi.fn(),
    };
    // 自定义 getBlock：基于 mapBlockObjs
    core.getBlock = (x, y, fid = core.status.floorId, showDisable) => {
      const b = core.getMapBlocksObj(fid)[x + ',' + y];
      if (b && (showDisable || !b.disable)) return b;
      return null;
    };

    // 加载真实 functions.js
    const fcode = fs.readFileSync(path.join(__dirname, '../project/functions.js'), 'utf-8');
    (0, eval)(fcode);
    controldata = globalThis.functions_d6ad677b_427a_4623_b50f_a445a3b0ef8a.control;
    core.control.controldata = controldata;

    // 加载真实 control.js，取 _checkBlock_chase
    const ccode = fs.readFileSync(path.join(__dirname, '../libs/control.js'), 'utf-8');
    const ControlCtor = (0, eval)(`(function(){${ccode};return control;})()`);
    control = Object.create(ControlCtor.prototype);
  });

  // 控制组：MT0（前面）向下跨到 MT5（底面），直线扫描，当前应当能追猎
  it('[控制组] 怪物在 MT0(x=10) 向下跨到 MT5：应当触发追猎', () => {
    core.status.maps['MT0'].map[12][10] = 'hunter';
    core.status.hero.loc = { x: 10, y: 0 };
    core.status.floorId = 'MT5';
    const info = controldata.getCheckBlock('MT5');
    expect(info.chase['10,0']).toBeDefined();
  });

  // 验证：MT2（左面 x=10）向下跨到 MT5（底面）是坐标旋转，不应触发追猎
  // MT2.down -> MT5.left: dir=down(垂直), targetEdge=left(水平), _isStraightCross=false
  it('[验证] MT2(x=10) 向下坐标旋转跨面到 MT5：不应触发追猎', () => {
    core.status.maps['MT2'].map[11][10] = 'hunter';
    core.status.hero.loc = { x: 0, y: 10 };
    core.status.floorId = 'MT5';
    const info = controldata.getCheckBlock('MT5');
    expect(info.chase['0,10']).toBeUndefined();
  });

  // 验证：MT3（右面 x=10）向下跨到 MT5 也是坐标旋转，不应触发
  // MT3.down -> MT5.right: dir=down(垂直), targetEdge=right(水平), _isStraightCross=false
  it('[验证] MT3(x=10) 向下坐标旋转跨面到 MT5：不应触发追猎', () => {
    core.status.maps['MT3'].map[11][10] = 'hunter';
    core.status.hero.loc = { x: 12, y: 10 };
    core.status.floorId = 'MT5';
    const info = controldata.getCheckBlock('MT5');
    expect(info.chase['12,10']).toBeUndefined();
  });

  // 执行验证：MT0(x=10,y=11) 追猎玩家 MT5(10,5)，直线扫描，怪物应逐格靠近并跨面到 MT5
  // MT0.down -> MT5.up: dir=down(垂直), targetEdge=up(垂直), _isStraightCross=true
  it('[执行] MT0 怪物逐格靠近并最终跨面到 MT5', () => {
    core.status.maps['MT0'].map[11][10] = 'hunter'; // MT0 x=10, y=11
    core.status.hero.loc = { x: 10, y: 5 };          // MT5 x=10, y=5
    core.status.floorId = 'MT5';
    // 模拟玩家移动：每步检测+执行
    for (let i = 0; i < 3; i++) {
      const info = controldata.getCheckBlock('MT5');
      const currChase = info.chase['10,5'];
      expect(currChase).toBeDefined();
      control._checkBlock_chase(currChase);
    }
    // 跨层执行：怪物从 MT0 离开
    expect(core.status.maps['MT0'].map[11][10]).toBe(0);
    expect(core.status.maps['MT0'].map[12][10]).toBe(0);
    // 怪物已跨面到 MT5(10,0)：cubeStep(MT0,10,12,"down") = MT5(10,0)
    expect(core.status.maps['MT5'].map[0][10]).toBe('hunter');
  });
});
