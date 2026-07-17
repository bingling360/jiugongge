// 跨层追猎 e2e 测试：模拟完整的 moveOneStep → checkBlock → _checkBlock_chase 流程
// 使用真实的 functions.js (getCheckBlock) + control.js (_checkBlock_chase) + plugins.js (moveBlockAcross)
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('跨层追猎 e2e 测试', () => {
  let core, controldata, control;

  beforeEach(() => {
    const makeMap = () => Array(13).fill(null).map(() => Array(13).fill(0));
    core = global.core = {
      __SIZE__: 13,
      status: {
        hero: { loc: { x: 10, y: 5 }, hp: 1000, flags: {}, statistics: { extraDamage: 0 } },
        floorId: 'MT4',
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
        checkBlock: null,
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
      updateDamage: vi.fn(),
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
      getBlock: (x, y, fid = core.status.floorId, showDisable) => {
        const b = core.getMapBlocksObj(fid)[x + ',' + y];
        if (b && (showDisable || !b.disable)) return b;
        return null;
      },
      removeBlock: vi.fn((x, y, fid) => {
        const m = core.status.maps[fid];
        if (!m || !m.map || !m.map[y]) return;
        m.map[y][x] = 0;
        if (m.blocks) m.blocks = null;
        if (core.status.mapBlockObjs) core.status.mapBlockObjs[fid] = null;
        core.extractBlocks(fid);
      }),
      setBlock: vi.fn((id, x, y, fid) => {
        const m = core.status.maps[fid];
        if (!m || !m.map) return;
        if (!m.map[y]) m.map[y] = [];
        m.map[y][x] = id;
        if (m.blocks) m.blocks = null;
        if (core.status.mapBlockObjs) core.status.mapBlockObjs[fid] = null;
        core.extractBlocks(fid);
        core.getMapBlocksObj(fid);
      }),
      changeFloor: vi.fn((fid, stair, heroLoc, time, cb) => { core.status.floorId = fid; if (heroLoc) Object.assign(core.status.hero.loc, heroLoc); core.updateCheckBlock(fid); if (cb) cb(); }),
      moveOneStep: vi.fn((cb) => { if (cb) cb(); }),
      checkRouteFolding: vi.fn(),
      plugin: {
        cubeMap: {
          moveBlockAcross: function(fromFloor, x, y, toFloor, toX, toY) {
            var block = core.getBlock(x, y, fromFloor);
            if (!block) return;
            var targetBlock = core.getBlock(toX, toY, toFloor, false);
            if (targetBlock && targetBlock.event) {
              var cls = targetBlock.event.cls || '';
              if (!core.control.getChaseType().includes(cls) || targetBlock.event.data) return;
            } else if (targetBlock) return;
            core.removeBlock(x, y, fromFloor);
            core.setBlock(block.event.id, toX, toY, toFloor);
            if (fromFloor == core.status.floorId || toFloor == core.status.floorId) core.redrawMap();
            core.updateCheckBlock();
            core.updateDamage();
          },
          invalidateCheckBlockCache: vi.fn(),
        },
        autoClear: vi.fn(),
      },
    };

    // 加载真实 functions.js
    const fcode = fs.readFileSync(path.join(__dirname, '../project/functions.js'), 'utf-8');
    (0, eval)(fcode);
    controldata = globalThis.functions_d6ad677b_427a_4623_b50f_a445a3b0ef8a.control;
    core.control.controldata = controldata;

    // 加载真实 control.js
    const ccode = fs.readFileSync(path.join(__dirname, '../libs/control.js'), 'utf-8');
    const ControlCtor = (0, eval)(`(function(){${ccode};return control;})()`);
    control = Object.create(ControlCtor.prototype);
  });

  // 基本检测：怪物在 MT1(2,2) 追猎到 MT4
  it('[检测] MT1 怪物追猎到 MT4：chase 应有记录', () => {
    core.status.maps['MT1'].map[2][2] = 325; // MT1 x=2, y=2
    core.status.hero.loc = { x: 10, y: 5 };
    core.status.floorId = 'MT4';
    const info = controldata.getCheckBlock('MT4');
    expect(info.chase['10,5']).toBeDefined();
  });

  // 跨面执行：使用 moveBlockAcross
  it('[执行] MT1 怪物跨面到 MT4：使用 moveBlockAcross', () => {
    core.status.maps['MT1'].map[0][2] = 325; // MT1 x=2, y=0 (边缘)
    core.status.hero.loc = { x: 10, y: 5 };
    core.status.floorId = 'MT4';
    const info = controldata.getCheckBlock('MT4');
    const currChase = info.chase['10,5'];
    expect(currChase).toBeDefined();
    // 执行追猎
    control._checkBlock_chase(currChase);
    // 怪物应从 MT1 移除
    expect(core.status.maps['MT1'].map[0][2]).toBe(0);
    // 怪物应出现在 MT4 (cubeStep(MT1,2,0,"up") = MT4(10,0))
    expect(core.status.maps['MT4'].map[0][10]).toBe(325);
  });

  // 连续多步：怪物逐步靠近边缘再跨面
  it('[执行] MT1 怪物逐步移动到边缘后跨面到 MT4', () => {
    core.status.maps['MT1'].map[2][2] = 325; // MT1 x=2, y=2
    core.status.hero.loc = { x: 10, y: 5 };
    core.status.floorId = 'MT4';
    for (let i = 0; i < 4; i++) {
      const info = controldata.getCheckBlock('MT4');
      const currChase = info.chase['10,5'];
      if (!currChase) break;
      control._checkBlock_chase(currChase);
    }
    // 怪物应从 MT1 移除
    expect(core.status.maps['MT1'].map[2][2]).toBe(0);
    // 怪物应在 MT4 上某处
    let found = false;
    for (let y = 0; y < 13; y++) {
      for (let x = 0; x < 13; x++) {
        if (core.status.maps['MT4'].map[y][x] === 325) found = true;
      }
    }
    expect(found).toBe(true);
  });

  // 坐标旋转不触发
  it('[验证] MT2(x=10) 向下坐标旋转到 MT5：不触发', () => {
    core.status.maps['MT2'].map[11][10] = 325;
    core.status.hero.loc = { x: 0, y: 10 };
    core.status.floorId = 'MT5';
    const info = controldata.getCheckBlock('MT5');
    expect(info.chase['0,10']).toBeUndefined();
  });

  // 道具不阻挡
  it('[遮挡] 路径上有道具不阻挡追猎', () => {
    core.status.maps['MT1'].map[1][2] = 50; // 道具 ID
    core.status.maps['MT1'].map[2][2] = 325; // 怪物
    core.status.hero.loc = { x: 10, y: 5 };
    core.status.floorId = 'MT4';
    // 需要让 getBlock 返回道具的 cls='items'
    const origGetBlock = core.getBlock;
    core.getBlock = (x, y, fid, showDisable) => {
      const m = core.status.maps[fid || core.status.floorId];
      if (!m || !m.map || !m.map[y]) return null;
      const id = m.map[y][x];
      if (!id) return null;
      if (id === 325) return { x, y, event: { id: 325, cls: 'enemys' }, disable: false };
      return { x, y, event: { id, cls: 'items' }, disable: false };
    };
    const info = controldata.getCheckBlock('MT4');
    core.getBlock = origGetBlock;
    expect(info.chase['10,5']).toBeDefined();
  });

  // moveBlockAcross 被调用
  it('[验证] 跨面执行时 moveBlockAcross 被调用', () => {
    core.status.maps['MT1'].map[0][2] = 325;
    core.status.hero.loc = { x: 10, y: 5 };
    core.status.floorId = 'MT4';
    const info = controldata.getCheckBlock('MT4');
    const currChase = info.chase['10,5'];
    const spy = vi.spyOn(core.plugin.cubeMap, 'moveBlockAcross');
    control._checkBlock_chase(currChase);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  // redrawMap 被调用（跨面到当前层时）
  it('[验证] 跨面到当前层时 redrawMap 被调用', () => {
    core.status.maps['MT1'].map[0][2] = 325;
    core.status.hero.loc = { x: 10, y: 5 };
    core.status.floorId = 'MT4';
    const info = controldata.getCheckBlock('MT4');
    const currChase = info.chase['10,5'];
    core.redrawMap.mockClear();
    control._checkBlock_chase(currChase);
    expect(core.redrawMap).toHaveBeenCalled();
  });
});
