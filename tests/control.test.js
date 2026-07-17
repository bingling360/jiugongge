// 跨层追猎真实端到端测试
// 使用真实的 cubeStep（来自 project/functions.js）和 _checkBlock_chase（来自 libs/control.js）
// 不再 mock cubeStep，确保测试的是真实代码逻辑
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('跨层追猎端到端（真实 cubeStep + _checkBlock_chase）', () => {
  let core, control, controldata, cubeMap;

  beforeEach(() => {
    // 构造 13x13 的空地图
    const makeMap = () => Array(13).fill(null).map(() => Array(13).fill(0));

    core = global.core = {
      __SIZE__: 13,
      status: {
        // 玩家在 MT3(1,5) —— 用户场景中的位置
        hero: { loc: { x: 1, y: 5 }, hp: 1000, flags: {}, statistics: { extraDamage: 0 } },
        floorId: 'MT3',
        event: {},
        mapBlockObjs: {},
        route: [],
        automaticRoute: { moveStepBeforeStop: [], lastDirection: null },
        heroMoving: 0,
        maps: {
          'MT0': { floorId: 'MT0', map: makeMap(), blocks: null },
          'MT1': { floorId: 'MT1', map: makeMap(), blocks: null },
          'MT2': { floorId: 'MT2', map: makeMap(), blocks: null },
          'MT3': { floorId: 'MT3', map: makeMap(), blocks: null },
          'MT4': { floorId: 'MT4', map: makeMap(), blocks: null },
          'MT5': { floorId: 'MT5', map: makeMap(), blocks: null },
        },
      },
      floors: {
        'MT0': { width: 13, height: 13 },
        'MT1': { width: 13, height: 13 },
        'MT2': { width: 13, height: 13 },
        'MT3': { width: 13, height: 13 },
        'MT4': { width: 13, height: 13 },
        'MT5': { width: 13, height: 13 },
      },
      utils: {
        scan: { up:{x:0,y:-1}, down:{x:0,y:1}, left:{x:-1,y:0}, right:{x:1,y:0} },
      },
      control: { controldata: {} },
      maps: {
        _generateMovableArray_arrays: () => ({
          map: Array(13).fill(null).map(() => Array(13).fill(0)),
        }),
        _canMoveHero_checkCannotInOut: () => false,
      },
      flags: { canGoDeadZone: true },
      values: { lavaDamage: 0 },
      // 目标位置为空，允许移动
      getBlock: vi.fn(() => null),
      getHeroLoc: (name) => core.status.hero.loc[name],
      hasItem: () => true,
      hasSpecial: (special, flag) => (special === 100 || special === 221) && flag === 16
        || (Array.isArray(special) ? special.includes(flag) : special === flag),
      hasFlag: (name) => !!(core.status.hero && core.status.hero.flags && core.status.hero.flags[name]),
      enemys: {
        hasSpecial: (special, flag) => (special === 100 || special === 221) && flag === 16
          || (Array.isArray(special) ? special.includes(flag) : special === flag),
        canBattle: vi.fn(() => true),
        enemydata: { getEnemyInfo: vi.fn(() => ({})) },
      },
      getEnemyValue: vi.fn((id, name) => {
        if (id === 100 || id === 'enemy100' || id === 221 || id === 'yellowGateKeeper') {
          const enemy = { id: id === 221 ? 'yellowGateKeeper' : 'enemy100', special: [16], hp: 1, atk: 1, def: 0 };
          return name == null ? enemy : enemy[name];
        }
        return null;
      }),
      getFaceDownId: (block) => block && block.event ? block.event.id : null,
      getSpecialFlag: () => 0,
      getDamage: () => 999,
      getCheckBlock: vi.fn(() => ({ damage: {} })),
      updateCheckBlock: vi.fn((floorId) => {
        core.status.checkBlock = controldata ? controldata.getCheckBlock(floorId) : { damage: {} };
        return true;
      }),
      canMoveHero: () => true,
      inArray: (array, value) => Array.isArray(array) && array.includes(value),
      clamp: (x, a, b) => Math.min(Math.max(x, a), b),
      noPass: (x, y, floorId) => !!core.getBlock(x, y, floorId),
      turnDirection: (cmd, dir) => {
        if (cmd === ':back') {
          const rev = { up:'down', down:'up', left:'right', right:'left' };
          return rev[dir];
        }
        return dir;
      },
      updateMap: vi.fn(),
      drawMap: vi.fn(),
      redrawMap: vi.fn(),
      updateDamage: vi.fn(),
      updateStatusBar: vi.fn(),
      drawTip: vi.fn(),
      drawHeroAnimate: vi.fn(),
      insertAction: vi.fn(),
      autosave: vi.fn(),
      push: (array, value) => {
        if (Array.isArray(value)) array.push(...value);
        else if (value != null) array.push(value);
      },
      plugin: { autoClear: null, showComment: vi.fn() },
      getLocalStorage: vi.fn(() => false),
      changeFloor: vi.fn((floorId, stair, heroLoc, time, callback) => {
        core.status.floorId = floorId;
        core.status.hero.loc = Object.assign({}, core.status.hero.loc, heroLoc);
        core.updateCheckBlock(floorId);
        if (callback) callback();
      }),
      trigger: vi.fn((x, y, callback) => { if (callback) callback(); }),
      moveOneStep: vi.fn((callback) => { if (callback) callback(); }),
      checkRouteFolding: vi.fn(),
    };

    // 加载 functions.js，提取真实的 controldata（包含真实 cubeStep + CUBE_EDGES）
    // 用 indirect eval (0, eval) 在全局作用域执行，使 var 声明成为 globalThis 属性
    const fs = require('fs'), path = require('path');
    const fcode = fs.readFileSync(path.join(__dirname, '../project/functions.js'), 'utf-8');
    (0, eval)(fcode);
    controldata = globalThis.functions_d6ad677b_427a_4623_b50f_a445a3b0ef8a.control;
    // 注入到 core，这样 cubeStep 内部的 core.control.controldata.cubeStep 调用也用真实实现
    core.control.controldata = controldata;
    core.extractBlocks = (floorId) => {
      const floor = core.status.maps[floorId];
      if (!floor || floor.blocks) return;
      floor.blocks = [];
      floor.map.forEach((row, y) => row.forEach((id, x) => {
        if (id) floor.blocks.push({ x, y, event: { id }, disable: false });
      }));
    };
    core.getMapBlocksObj = (floorId) => {
      floorId = floorId || core.status.floorId;
      if (core.status.mapBlockObjs[floorId]) return core.status.mapBlockObjs[floorId];
      core.extractBlocks(floorId);
      const obj = {};
      core.status.maps[floorId].blocks.forEach(block => {
        obj[block.x + ',' + block.y] = block;
      });
      return core.status.mapBlockObjs[floorId] = obj;
    };
    core.getBlock = vi.fn((x, y, floorId = core.status.floorId, showDisable) => {
      const block = core.getMapBlocksObj(floorId)[x + ',' + y];
      if (block && (showDisable || !block.disable)) return block;
      return null;
    });

    // 加载 control.js，提取真实的 _checkBlock_chase
    // 不实例化 Control（构造函数依赖完整 core 环境），只取 prototype 上的方法
    const ccode = fs.readFileSync(path.join(__dirname, '../libs/control.js'), 'utf-8');
    const ControlCtor = (0, eval)(`(function(){${ccode};return control;})()`);
    control = Object.create(ControlCtor.prototype);

    globalThis.control = ControlCtor;
    globalThis.actions = function actions() {};
    globalThis.actions.prototype = {};
    const pcode = fs.readFileSync(path.join(__dirname, '../project/plugins.js'), 'utf-8');
    // plugins.js 在加载时引用全局 items（真实游戏环境由其它脚本注入），测试环境需先打桩
    globalThis.items = function () {};
    globalThis.items.prototype = {};
    (0, eval)(pcode);
    const pluginHost = { _afterLoadResources: null };
    globalThis.plugins_bb40132b_638b_4a9f_b028_d3fe47acc8d1.cubeMap.call(pluginHost);
    cubeMap = pluginHost.cubeMap;
  });

  describe('cubeStep 真实跨面逻辑', () => {
    it('MT0(12,5) 向右跨面到 MT3(0,5) [用户场景]', () => {
      const r = controldata.cubeStep('MT0', 12, 5, 'right');
      expect(r).toEqual({ floorId: 'MT3', x: 0, y: 5 });
    });

    it('MT3(0,5) 向左跨面回到 MT0(12,5)', () => {
      const r = controldata.cubeStep('MT3', 0, 5, 'left');
      expect(r).toEqual({ floorId: 'MT0', x: 12, y: 5 });
    });

    it('同层不跨面 MT3(1,5) 向右到 MT3(2,5)', () => {
      const r = controldata.cubeStep('MT3', 1, 5, 'right');
      expect(r).toEqual({ floorId: 'MT3', x: 2, y: 5 });
    });

    it('MT0 向左跨面到 MT2', () => {
      const r = controldata.cubeStep('MT0', 0, 5, 'left');
      expect(r.floorId).toBe('MT2');
      expect(r.x).toBe(12);
      expect(r.y).toBe(5);
    });

    it('MT5(0,0) 向左跨面到 MT2(12,12)', () => {
      const r = controldata.cubeStep('MT5', 0, 0, 'left');
      expect(r).toEqual({ floorId: 'MT2', x: 12, y: 12 });
      expect(cubeMap.step('MT5', 0, 0, 'left')).toMatchObject({ floorId: 'MT2', x: 12, y: 12, crossed: true });
    });

    // ===== 用户反馈的真实场景：左面(MT2) (0,12) 往左走应该到 (12,12) 而不是 (12,0) =====
    it('用户场景：MT2(0,12) 向左跨面到 MT1(12,12)', () => {
      const r = controldata.cubeStep('MT2', 0, 12, 'left');
      expect(r).toEqual({ floorId: 'MT1', x: 12, y: 12 });
      expect(cubeMap.step('MT2', 0, 12, 'left')).toMatchObject({ floorId: 'MT1', x: 12, y: 12, crossed: true });
    });

    it('用户场景往返：MT1(12,12) 向右跨面回到 MT2(0,12)', () => {
      const r = controldata.cubeStep('MT1', 12, 12, 'right');
      expect(r).toEqual({ floorId: 'MT2', x: 0, y: 12 });
    });

    it('左面四角往左走的坐标映射正确（按 3D 模型相对位置）', () => {
      // MT2 左边缘 y=0..12 映射到 MT1 右边缘 y=0..12（不翻转）
      expect(controldata.cubeStep('MT2', 0, 0, 'left')).toEqual({ floorId: 'MT1', x: 12, y: 0 });
      expect(controldata.cubeStep('MT2', 0, 6, 'left')).toEqual({ floorId: 'MT1', x: 12, y: 6 });
      expect(controldata.cubeStep('MT2', 0, 12, 'left')).toEqual({ floorId: 'MT1', x: 12, y: 12 });
    });

    it('所有跨面边界往返后回到原坐标', () => {
      const CUBE_EDGES = controldata.CUBE_EDGES;
      const points = {
        up: [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 12, y: 0 }],
        down: [{ x: 0, y: 12 }, { x: 6, y: 12 }, { x: 12, y: 12 }],
        left: [{ x: 0, y: 0 }, { x: 0, y: 6 }, { x: 0, y: 12 }],
        right: [{ x: 12, y: 0 }, { x: 12, y: 6 }, { x: 12, y: 12 }],
      };
      Object.keys(CUBE_EDGES).forEach(floorId => {
        Object.keys(CUBE_EDGES[floorId]).forEach(dir => {
          points[dir].forEach(p => {
            const next = controldata.cubeStep(floorId, p.x, p.y, dir);
            expect(next.floorId).not.toBe(floorId);
            const backDir = CUBE_EDGES[floorId][dir][1];
            const back = controldata.cubeStep(next.floorId, next.x, next.y, backDir);
            expect(back).toEqual({ floorId, x: p.x, y: p.y });
          });
        });
      });
    });
  });

  describe('跨面目标格战斗判定', () => {
    const target = { floorId: 'MT3', x: 0, y: 5, crossed: true };

    it('跨面目标格是能打过的怪物时允许过去', () => {
      core.getBlock = vi.fn(() => ({
        disable: false,
        event: { id: 100, cls: 'enemys', trigger: 'battle', noPass: true },
      }));
      core.enemys.canBattle = vi.fn(() => true);

      expect(cubeMap.canCross('MT0', 12, 5, 'right', target)).toBe(true);
      expect(core.enemys.canBattle).toHaveBeenCalledWith(100, 0, 5, 'MT3');
    });

    it('跨面目标格是打不过的怪物时不能过去', () => {
      core.getBlock = vi.fn(() => ({
        disable: false,
        event: { id: 100, cls: 'enemys', trigger: 'battle', noPass: true },
      }));
      core.enemys.canBattle = vi.fn(() => false);

      expect(cubeMap.canCross('MT0', 12, 5, 'right', target)).toBe(false);
    });

    it('跨面目标格是非战斗阻挡时仍然不能过去', () => {
      core.getBlock = vi.fn(() => ({
        disable: false,
        event: { id: 'wall', cls: 'terrains', trigger: null, noPass: true },
      }));
      core.enemys.canBattle = vi.fn(() => true);

      expect(cubeMap.canCross('MT0', 12, 5, 'right', target)).toBe(false);
    });

    it('跨面进入怪物格时先在源层存档并触发战斗，再切到目标层', () => {
      core.status.floorId = 'MT0';
      core.status.hero.loc = { x: 12, y: 5, direction: 'right' };
      const order = [];
      core.getBlock = vi.fn(() => ({
        disable: false,
        event: { id: 100, cls: 'enemys', trigger: 'battle', noPass: true },
      }));
      core.enemys.canBattle = vi.fn(() => true);
      core.autosave = vi.fn(() => order.push('autosave:' + core.status.floorId + ':' + core.status.hero.loc.x + ',' + core.status.hero.loc.y));
      core.trigger = vi.fn((x, y, callback) => {
        order.push('trigger:' + core.status.floorId + ':' + x + ',' + y);
        if (callback) callback();
      });
      core.changeFloor = vi.fn((floorId, stair, heroLoc, time, callback) => {
        order.push('changeFloor:' + core.status.floorId + '->' + floorId);
        core.status.floorId = floorId;
        core.status.hero.loc = Object.assign({}, core.status.hero.loc, heroLoc);
        core.updateCheckBlock(floorId);
        if (callback) callback();
      });
      core.moveOneStep = vi.fn((callback) => {
        order.push('moveOneStep:' + core.status.floorId + ':' + core.status.hero.loc.x + ',' + core.status.hero.loc.y);
        if (callback) callback();
      });

      control.moveAction();

      expect(order).toEqual([
        'autosave:MT0:12,5',
        'trigger:MT3:0,5',
        'changeFloor:MT0->MT3',
        'moveOneStep:MT3:0,5',
      ]);
      expect(core.changeFloor).toHaveBeenCalled();
      expect(core.trigger).toHaveBeenCalledWith(0, 5, expect.any(Function));
      expect(core.moveOneStep).toHaveBeenCalled();
      expect(core.status.__cubeCrossInfo).toBeUndefined();
    });
  });

  describe('跨层夹击检测', () => {
    it('玩家在跨面边缘时，跨面一侧和同层另一侧可以组成夹击', () => {
      // MT3(0,5) 的左侧跨面邻居是 MT0(12,5)，右侧是 MT3(1,5)。
      core.status.maps['MT0'].map[5][12] = 100;
      core.status.maps['MT3'].map[5][1] = 100;
      core.status.floorId = 'MT3';
      core.status.hero.hp = 1000;

      const info = controldata.getCheckBlock('MT3');

      expect(info.damage['0,5']).toBe(500);
      expect(info.type['0,5']['夹击伤害']).toBe(true);
    });

    it('跨层夹击要求两侧怪物相同', () => {
      core.status.maps['MT0'].map[5][12] = 100;
      core.status.maps['MT3'].map[5][1] = 200;
      core.status.floorId = 'MT3';

      const info = controldata.getCheckBlock('MT3');

      expect(info.damage['0,5']).toBeUndefined();
    });

    it('同层两侧同种夹击怪仍然正常夹击', () => {
      core.status.maps['MT3'].map[5][1] = 100;
      core.status.maps['MT3'].map[5][3] = 100;
      core.status.floorId = 'MT3';
      core.status.hero.hp = 1000;

      const info = controldata.getCheckBlock('MT3');

      expect(info.damage['2,5']).toBe(500);
      expect(info.type['2,5']['夹击伤害']).toBe(true);
    });

    it('刚跨面落到边缘时，不用返回源面的方向参与夹击', () => {
      // 从 MT0(0,12) 向下跨到 MT5(0,0) 时，MT5(0,0) 的 up 方向会回到源面。
      // 这一步不应把源面 MT0(0,12) 当作 MT5(0,0) 夹击的一侧。
      core.status.maps['MT0'].map[12][0] = 221;
      core.status.maps['MT5'].map[1][0] = 221;
      core.status.floorId = 'MT5';
      core.status.hero.hp = 1000;
      core.status.__cubeCrossInfo = { floorId: 'MT5', x: 0, y: 0, ignoreDir: 'up' };

      const info = controldata.getCheckBlock('MT5');

      expect(info.damage['0,0']).toBeUndefined();
      delete core.status.__cubeCrossInfo;
    });

    it('从MT0(0,12)向下跨到底面时，切层更新伤害图也不产生MT5(0,0)夹击', () => {
      core.status.maps['MT0'].map[12][0] = 221;
      core.status.maps['MT5'].map[1][0] = 221;
      core.status.floorId = 'MT0';
      core.status.hero.loc = { x: 0, y: 12, direction: 'down' };
      core.status.hero.hp = 1000;

      control.moveAction();

      expect(core.changeFloor).toHaveBeenCalled();
      expect(core.status.floorId).toBe('MT5');
      expect(core.status.hero.loc.x).toBe(0);
      expect(core.status.hero.loc.y).toBe(0);
      expect(core.status.checkBlock.damage['0,0']).toBeUndefined();
      expect(core.status.__cubeCrossInfo).toBeUndefined();
    });

    it('跨面过程中即使临时按源层MT0(0,0)计算，也不产生夹击伤害', () => {
      core.status.maps['MT0'].map[0][1] = 221;
      core.status.maps['MT2'].map[0][12] = 221;
      core.status.floorId = 'MT0';
      core.status.hero.hp = 1000;
      core.status.__cubeCrossInfo = {
        fromFloor: 'MT0',
        floorId: 'MT5',
        x: 0,
        y: 0,
        ignoreDir: 'up'
      };

      const info = controldata.getCheckBlock('MT0');

      expect(info.damage['0,0']).toBeUndefined();
      delete core.status.__cubeCrossInfo;
    });

    it('跨面过程中即使沿用了旧的源层MT0(0,0)夹击伤害图，checkBlock也不会扣血', () => {
      core.status.maps['MT0'].map[0][1] = 221;
      core.status.maps['MT2'].map[0][12] = 221;
      core.status.floorId = 'MT0';
      core.status.hero.loc = { x: 0, y: 0, direction: 'down' };
      core.status.hero.hp = 1000;

      // 模拟旧伤害图已经在跨面标记写入前生成：此时 MT0(0,0) 有夹击伤害。
      core.status.checkBlock = controldata.getCheckBlock('MT0');
      expect(core.status.checkBlock.damage['0,0']).toBe(500);

      core.status.__cubeCrossInfo = {
        fromFloor: 'MT0',
        floorId: 'MT5',
        x: 0,
        y: 0,
        ignoreDir: 'up'
      };

      control.checkBlock();

      expect(core.status.hero.hp).toBe(1000);
      expect(core.drawTip).not.toHaveBeenCalledWith(expect.stringContaining('夹击伤害'), expect.anything());
      delete core.status.__cubeCrossInfo;
    });

    it('MT0(0,12) 向下跨到 MT5(0,0) 的切层瞬间，不结算旧的 MT0(0,0) 夹击伤害', () => {
      core.status.maps['MT0'].map[0][1] = 221;
      core.status.maps['MT2'].map[0][12] = 221;
      core.status.floorId = 'MT0';
      core.status.hero.loc = { x: 0, y: 12, direction: 'down' };
      core.status.hero.hp = 1000;

      core.status.checkBlock = controldata.getCheckBlock('MT0');
      expect(core.status.checkBlock.damage['0,0']).toBe(500);

      core.changeFloor = vi.fn((floorId, stair, heroLoc, time, callback) => {
        core.status.hero.loc = Object.assign({}, core.status.hero.loc, heroLoc);
        expect(core.status.floorId).toBe('MT0');
        expect(core.status.hero.loc.x).toBe(0);
        expect(core.status.hero.loc.y).toBe(0);

        control.checkBlock();
        expect(core.status.hero.hp).toBe(1000);

        core.status.floorId = floorId;
        core.updateCheckBlock(floorId);
        if (callback) callback();
      });
      core.moveOneStep = vi.fn((callback) => {
        control.checkBlock();
        if (callback) callback();
      });

      control.moveAction();

      expect(core.changeFloor).toHaveBeenCalled();
      expect(core.status.floorId).toBe('MT5');
      expect(core.status.hero.loc.x).toBe(0);
      expect(core.status.hero.loc.y).toBe(0);
      expect(core.status.hero.hp).toBe(1000);
      expect(core.drawTip).not.toHaveBeenCalledWith(expect.stringContaining('夹击伤害'), expect.anything());
      expect(core.status.__cubeCrossInfo).toBeUndefined();
    });
  });

  it('MT0(0,12) 向下跨到 MT5(0,0) 时，目标层真实存在的夹击伤害会正常触发', () => {
    core.status.maps['MT2'].map[12][12] = 221;
    core.status.maps['MT5'].map[0][1] = 221;
    core.status.floorId = 'MT0';
    core.status.hero.loc = { x: 0, y: 12, direction: 'down' };
    core.status.hero.hp = 1000;
    core.moveOneStep = vi.fn((callback) => {
      control.checkBlock();
      if (callback) callback();
    });

    control.moveAction();

    expect(core.changeFloor).toHaveBeenCalled();
    expect(core.status.floorId).toBe('MT5');
    expect(core.status.hero.loc.x).toBe(0);
    expect(core.status.hero.loc.y).toBe(0);
    expect(core.status.checkBlock.damage['0,0']).toBe(500);
    expect(core.status.hero.hp).toBe(500);
    expect(core.drawTip).toHaveBeenCalledWith(expect.stringContaining('夹击伤害'));
    expect(core.status.__cubeCrossInfo).toBeUndefined();
  });

  describe('跨层追猎检测逻辑（最近方向选择，与 functions.js 源码一致）', () => {
    // 与 functions.js 跨层追猎检测逻辑完全一致（含方向旋转检查）
    const CUBE_EDGES = {
      MT0:{up:["MT4","down"],down:["MT5","up"],left:["MT2","right"],right:["MT3","left"]},
      MT1:{up:["MT5","down"],down:["MT4","up"],left:["MT3","right"],right:["MT2","left"]},
      MT2:{up:["MT4","left"],down:["MT5","left"],left:["MT1","right"],right:["MT0","left"]},
      MT3:{up:["MT4","right"],down:["MT5","right"],left:["MT0","right"],right:["MT1","left"]},
      MT4:{up:["MT1","down"],down:["MT0","up"],left:["MT2","up"],right:["MT3","up"]},
      MT5:{up:["MT0","down"],down:["MT1","up"],left:["MT2","down"],right:["MT3","down"]}
    };
    // 判断跨面后方向是否保持一致（直线扫描）
    const _isStraightCross = function(fromF, dir) {
      var e = CUBE_EDGES[fromF];
      if (!e || !e[dir]) return false;
      var te = e[dir][1];
      var dirH = (dir === "left" || dir === "right");
      var teH = (te === "left" || te === "right");
      return dirH === teH;
    };
    const detectChase = function(srcF, sx, sy, floorId, chase) {
      var _projDir = function(srcF, sx, sy, dir, floorId) {
        var visited = {}, f = srcF, cx = sx, cy = sy;
        for (var step = 0; step < 200; step++) {
          var key = f + "," + cx + "," + cy;
          if (visited[key]) break;
          visited[key] = true;
          var nextS = core.control.controldata.cubeStep(f, cx, cy, dir);
          if (!nextS) break;
          // 跨面允许（含坐标旋转的跨面）：与修复后的真实代码一致，不再以 _isStraightCross 阻断
          f = nextS.floorId; cx = nextS.x; cy = nextS.y;
          if (f === floorId) return { dir: dir, step: step + 1 };
        }
        return null;
      };
      var dirs = ["left", "right", "up", "down"];
      var projections = [];
      dirs.forEach(function(d) {
        var p = _projDir(srcF, sx, sy, d, floorId);
        if (p) projections.push(p);
      });
      if (projections.length > 0) {
        projections.sort(function(a, b) { return a.step - b.step; });
        var minStep = projections[0].step;
        var nearest = projections.filter(function(p) { return p.step === minStep; });
        if (nearest.length === 1) {
          var bestDir = nearest[0].dir;
          var visited = {}, f = srcF, cx = sx, cy = sy;
          for (var step = 0; step < 200; step++) {
            var key = f + "," + cx + "," + cy;
            if (visited[key]) break;
            visited[key] = true;
            var s = core.control.controldata.cubeStep(f, cx, cy, bestDir);
            if (!s) break;
            f = s.floorId; cx = s.x; cy = s.y;
            if (f === floorId) {
              var ck = cx + "," + cy;
              if (!chase[ck]) chase[ck] = [];
              chase[ck].push({ x: sx, y: sy, dir: bestDir, srcFloor: srcF, step: step + 1 });
            }
          }
        }
      }
    };

    it('用户场景：怪物MT0(12,5) 只记录right方向（最近），不记录left（环绕）', () => {
      const chase = {};
      detectChase('MT0', 12, 5, 'MT3', chase);
      // right 1 步到 MT3，left 需环绕 39 步，只记录 right
      expect(chase['0,5']).toBeDefined();
      expect(chase['1,5']).toBeDefined();
      expect(chase['1,5'][0].dir).toBe('right');
      expect(chase['1,5'][0].srcFloor).toBe('MT0');
      // 每个位置只有一条记录（只有 right 方向）
      expect(chase['1,5'].length).toBe(1);
    });

    it('玩家踩到MT3(1,5) 触发的追猎方向为right，怪物跨面到MT3(0,5)', () => {
      const chase = {};
      detectChase('MT0', 12, 5, 'MT3', chase);
      const rec = chase['1,5'][0];
      expect(rec.dir).toBe('right');
      const stepTo = core.control.controldata.cubeStep(rec.srcFloor, rec.x, rec.y, rec.dir);
      expect(stepTo).toEqual({ floorId: 'MT3', x: 0, y: 5 });
    });

    it('right方向距离比left方向近（cubeStep 验证）', () => {
      const stepRight = core.control.controldata.cubeStep('MT0', 12, 5, 'right');
      expect(stepRight.floorId).toBe('MT3');
      const stepLeft = core.control.controldata.cubeStep('MT0', 12, 5, 'left');
      expect(stepLeft.floorId).toBe('MT0');
    });

    // ===== 用户场景验证（修复后：跨层追猎允许坐标旋转的跨面） =====
    it('修复后：怪物MT4(12,12) 玩家在MT3，坐标旋转跨面也能触发追猎', () => {
      const chase = {};
      // 玩家在 MT3，怪物在 MT4(12,12)
      // 修复前 MT4 right -> MT3 up 被判为坐标旋转而阻断；修复后允许跨面，应触发追猎
      detectChase('MT4', 12, 12, 'MT3', chase);
      // 应当记录追猎位置（MT4(12,12) 向右一步跨面到 MT3(0,0)）
      expect(Object.keys(chase).length).toBeGreaterThan(0);
      expect(chase['0,0']).toBeDefined();
      expect(chase['0,0'][0].srcFloor).toBe('MT4');
    });

    it('验证：MT4 right -> MT3 up 是坐标旋转（非直线扫描）', () => {
      // dir=right (水平), te=up (垂直)，方向变了，不是直线扫描
      expect(_isStraightCross('MT4', 'right')).toBe(false);
      // 对比：MT0 right -> MT3 left 是直线扫描（dir=right, te=left 都是水平）
      expect(_isStraightCross('MT0', 'right')).toBe(true);
    });

    it('方向旋转：MT4 right 跨面到 MT3，方向应为 down', () => {
      // 从 MT4 right 出去，进入 MT3 up 边，进入后方向 = opposite(up) = down
      const opposite = { up:'down', down:'up', left:'right', right:'left' };
      const edge = CUBE_EDGES['MT4']['right']; // ["MT3","up"]
      const newDir = opposite[edge[1]];
      expect(newDir).toBe('down');
    });

    it('坐标验证：MT4(12,9) right 跨面到 MT3(3,0)（按 3D 模型拓扑，已修正旧的错误期望 9,0）', () => {
      const r = core.control.controldata.cubeStep('MT4', 12, 9, 'right');
      expect(r).toEqual({ floorId: 'MT3', x: 3, y: 0 });
    });
  });

  describe('激光跨层：真实 getCheckBlock vs 几何真值对比', () => {
    // 独立实现的"几何真值"激光：从怪物位置向四个方向沿 cubeStep 行走，
    // 收集整条射线经过的所有格子（直到回到起点附近形成闭环），与代码输出逐面比对。
    // 几何真值激光：与游戏 _laserDir 完全一致的语义（用于回归守卫）。
    // 关键：跨面时若目标边与当前方向“相同”（如 up→up）为旋转穿越，
    // 需翻转方向以维持直线，否则竖直激光会在 top↔back 之间反弹，无法绕成立方体整圈。
    function groundTruth(srcF, sx, sy) {
      const result = {}; // floorId -> Set("x,y")
      const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
      const dirs = ['left', 'right', 'up', 'down'];
      dirs.forEach((dir) => {
        const visited = new Set();
        let f = srcF, cx = sx, cy = sy, d = dir;
        for (let i = 0; i < 200; i++) {
          const key = f + ',' + cx + ',' + cy;
          if (visited.has(key)) break; // 闭环
          visited.add(key);
          const s = core.control.controldata.cubeStep(f, cx, cy, d);
          if (!s) break;
          if (s.floorId !== f) {
            // 跨面：旋转穿越时翻转方向以维持直线
            const edge = (core.control.controldata.CUBE_EDGES[f] || {})[d];
            if (edge && edge[1] === d) d = OPP[d];
          }
          f = s.floorId; cx = s.x; cy = s.y;
          // 激光不伤害自身格（与代码一致：源格若为 floorId 也不计入伤害）
          if (!(f === srcF && cx === sx && cy === sy)) {
            (result[f] = result[f] || new Set()).add(cx + ',' + cy);
          }
        }
      });
      return result;
    }

    function runComparison(srcF, sx, sy, laserId) {
      core.getEnemyValue = vi.fn((id) => {
        if (id === laserId) return { special: [24], laser: 25 };
        return null;
      });
      // 清空所有地图，仅放置一个激光怪
      ['MT0','MT1','MT2','MT3','MT4','MT5'].forEach((fid) => {
        core.status.maps[fid].map = Array(13).fill(null).map(() => Array(13).fill(0));
        core.status.maps[fid].blocks = null;
      });
      // 关键：清除 mapBlockObjs 缓存，否则 getMapBlocksObj 会返回上一次调用残留的方块
      core.status.mapBlockObjs = {};
      core.status.maps[srcF].map[sy][sx] = laserId;

      const truth = groundTruth(srcF, sx, sy);
      if (srcF === 'MT0' && sx === 6 && sy === 6) {
        console.log('TRUTH MT0 =', JSON.stringify([...(truth['MT0'] || [])].sort()));
        console.log('TRUTH MT4 =', JSON.stringify([...(truth['MT4'] || [])].sort()));
      }
      const faces = ['MT0','MT1','MT2','MT3','MT4','MT5'];
      let mismatches = [];
      faces.forEach((fid) => {
        const info = controldata.getCheckBlock(fid);
        const codeCells = new Set(
          Object.keys(info.damage).filter((k) => info.type[k] && info.type[k]['激光伤害'])
        );
        const truthCells = truth[fid] || new Set();
        // 激光不伤害怪物自身格子，从真值中剔除源格后比较
        if (fid === srcF) { truthCells.delete(sx + ',' + sy); codeCells.delete(sx + ',' + sy); }
        const missing = [...truthCells].filter((k) => !codeCells.has(k));
        const extra = [...codeCells].filter((k) => !truthCells.has(k));
        if (missing.length || extra.length) {
          mismatches.push({ fid, missing, extra });
          console.log(`  源(${srcF},${sx},${sy}) 面${fid}: truth=${JSON.stringify([...truthCells].sort())}`);
          console.log(`  源(${srcF},${sx},${sy}) 面${fid}: code =${JSON.stringify([...codeCells].sort())}`);
        }
      });
      return mismatches;
    }

    it('MT0(6,6) 中心激光怪：全 6 面 y/x 轴跨层与真值一致', () => {
      const m = runComparison('MT0', 6, 6, 'laser');
      console.log('MT0(6,6) mismatches=' + JSON.stringify(m));
      expect(m).toEqual([]);
    });

    it('MT4(6,6) 顶面激光怪：全 6 面一致', () => {
      const m = runComparison('MT4', 6, 6, 'laser');
      console.log('MT4(6,6) mismatches=' + JSON.stringify(m));
      expect(m).toEqual([]);
    });

    it('MT2(6,6) 左面激光怪：全 6 面一致', () => {
      const m = runComparison('MT2', 6, 6, 'laser');
      console.log('MT2(6,6) mismatches=' + JSON.stringify(m));
      expect(m).toEqual([]);
    });

    it('MT5(3,9) 底面非中心激光怪：全 6 面一致', () => {
      const m = runComparison('MT5', 3, 9, 'laser');
      console.log('MT5(3,9) mismatches=' + JSON.stringify(m));
      expect(m).toEqual([]);
    });

    it('全位置扫描：每面边缘/角落激光怪，跨层坐标与真值完全一致', () => {
      const positions = [];
      // 中心、四边中点、四角、若干内部点
      const pts = [[6,6],[0,6],[12,6],[6,0],[6,12],[0,0],[12,0],[0,12],[12,12],[3,3],[9,9],[0,3],[12,9],[3,0],[9,12]];
      const faces = ['MT0','MT1','MT2','MT3','MT4','MT5'];
      let allMismatch = [];
      faces.forEach((f) => pts.forEach((p) => {
        const m = runComparison(f, p[0], p[1], 'laser');
        if (m.length) allMismatch.push({ src: f + '(' + p[0] + ',' + p[1] + ')', m });
      }));
      console.log('全位置扫描 mismatch 总数=' + allMismatch.length);
      if (allMismatch.length) console.log(JSON.stringify(allMismatch.slice(0, 5)));
      expect(allMismatch).toEqual([]);
    });
  });

  describe('_checkBlock_chase 执行逻辑（用户场景验证）', () => {
    it('用户场景：怪物MT0(12,5) 玩家踩到MT3(1,5) 怪物跨面到MT3(0,5)', () => {
      // 怪物 ID=100 放在 MT0(12,5)
      core.status.maps['MT0'].map[5][12] = 100;
      // 玩家在 MT3(1,5)
      core.status.hero.loc = { x: 1, y: 5 };
      core.status.floorId = 'MT3';

      // 追猎信息（由 _chaseDir 检测生成，含 step=立体距离）
      const chase = [{ x: 12, y: 5, dir: 'right', srcFloor: 'MT0', step: 2 }];

      const actions = control._checkBlock_chase(chase);

      // 怪物应从 MT0(12,5) 跨面到 MT3(0,5)
      expect(core.status.maps['MT0'].map[5][12]).toBe(0);
      expect(core.status.maps['MT3'].map[5][0]).toBe(100);
      // 应添加刷新地图的 action（用真实存在的 core.redrawMap，不是不存在的 updateMap）
      expect(actions.length).toBeGreaterThan(0);
      expect(actions[0].type).toBe('function');
      // 关键：action 函数体里调用的是真实 API core.redrawMap，不是不存在的 core.updateMap
      expect(actions[0].function).toContain('redrawMap');
      expect(actions[0].function).not.toContain('updateMap');
      // async function action 必须自己调用 core.doAction() 推进事件队列，否则卡死
      expect(actions[0].function).toContain('doAction');
    });

    it('目标位置被占用时怪物不移动', () => {
      core.status.maps['MT0'].map[5][12] = 100;
      // MT3(0,5) 已有别的怪物
      core.status.maps['MT3'].map[5][0] = 200;
      core.getBlock = vi.fn(() => ({ id: 200 }));  // 目标位置有 block

      const chase = [{ x: 12, y: 5, dir: 'right', srcFloor: 'MT0', step: 2 }];
      control._checkBlock_chase(chase);

      // 怪物不动
      expect(core.status.maps['MT0'].map[5][12]).toBe(100);
      expect(core.status.maps['MT3'].map[5][0]).toBe(200);
    });

    it('怪物在源层不存在时不执行', () => {
      // MT0(12,5) 没有怪物
      core.status.maps['MT0'].map[5][12] = 0;
      const chase = [{ x: 12, y: 5, dir: 'right', srcFloor: 'MT0', step: 2 }];
      const actions = control._checkBlock_chase(chase);
      expect(actions).toEqual([]);
    });

    it('本层追猎（srcFloor为空）走原逻辑', () => {
      core.status.maps['MT3'].map[5][6] = 100;
      const chase = [{ x: 6, y: 5, dir: 'down' }];
      const actions = control._checkBlock_chase(chase);
      expect(actions.length).toBeGreaterThan(0);
      expect(actions[0].type).toBe('if');
    });

    it('距离相等时不移动（用户需求：立体距离相等则不动）', () => {
      // 同一怪物 MT0(12,5)，两个方向 step 相同
      core.status.maps['MT0'].map[5][12] = 100;
      const chase = [
        { x: 12, y: 5, dir: 'right', srcFloor: 'MT0', step: 5 },
        { x: 12, y: 5, dir: 'left',  srcFloor: 'MT0', step: 5 },
      ];
      const actions = control._checkBlock_chase(chase);
      // 距离相等，不移动
      expect(actions).toEqual([]);
      expect(core.status.maps['MT0'].map[5][12]).toBe(100);
    });

    it('距离更近则移动（选择 step 最小的方向）', () => {
      // right step=2 比 left step=26 近，应执行 right
      core.status.maps['MT0'].map[5][12] = 100;
      const chase = [
        { x: 12, y: 5, dir: 'right', srcFloor: 'MT0', step: 2 },
        { x: 12, y: 5, dir: 'left',  srcFloor: 'MT0', step: 26 },
      ];
      control._checkBlock_chase(chase);
      // 怪物向 right 移动，跨面到 MT3(0,5)
      expect(core.status.maps['MT0'].map[5][12]).toBe(0);
      expect(core.status.maps['MT3'].map[5][0]).toBe(100);
    });
  });

  describe('完整流程：检测 + 执行', () => {
    it('用户场景完整流程：检测玩家在MT3(1,5) 然后执行追猎', () => {
      // 1. 怪物在 MT0(12,5)
      core.status.maps['MT0'].map[5][12] = 100;
      core.status.hero.loc = { x: 1, y: 5 };
      core.status.floorId = 'MT3';

      // 2. 运行检测逻辑（与 functions.js 源码一致：只记录最近方向）
      const chase = {};
      // _projDir: 收集四方向到达当前层的最近 step
      const _projDir = function(srcF, sx, sy, dir, floorId) {
        var visited = {}, f = srcF, cx = sx, cy = sy;
        for (var step = 0; step < 200; step++) {
          var key = f + "," + cx + "," + cy;
          if (visited[key]) break;
          visited[key] = true;
          var s = core.control.controldata.cubeStep(f, cx, cy, dir);
          if (!s) break;
          f = s.floorId; cx = s.x; cy = s.y;
          if (f === floorId) return { dir: dir, step: step + 1 };
        }
        return null;
      };
      var dirs = ["left", "right", "up", "down"];
      var projections = [];
      dirs.forEach(function(d) {
        var p = _projDir('MT0', 12, 5, d, 'MT3');
        if (p) projections.push(p);
      });
      // 选最近方向
      projections.sort(function(a, b) { return a.step - b.step; });
      var minStep = projections[0].step;
      var nearest = projections.filter(function(p) { return p.step === minStep; });
      expect(nearest.length).toBe(1); // right 最近，唯一
      var bestDir = nearest[0].dir;
      expect(bestDir).toBe('right');
      // 沿最近方向扫描记录追猎（只记录落在当前层的位置）
      var visited = {}, f = 'MT0', cx = 12, cy = 5;
      for (var step = 0; step < 200; step++) {
        var key = f + "," + cx + "," + cy;
        if (visited[key]) break;
        visited[key] = true;
        var s = core.control.controldata.cubeStep(f, cx, cy, bestDir);
        if (!s) break;
        f = s.floorId; cx = s.x; cy = s.y;
        if (f === 'MT3') {
          var ck = cx + "," + cy;
          if (!chase[ck]) chase[ck] = [];
          chase[ck].push({ x: 12, y: 5, dir: bestDir, srcFloor: 'MT0', step: step + 1 });
        }
      }

      // 3. 玩家踩到 MT3(1,5)，取出追猎信息
      const loc = '1,5';
      const currChase = chase[loc];
      expect(currChase).toBeDefined();
      expect(currChase.length).toBe(1); // 只有 right 方向

      // 4. 执行追猎
      control._checkBlock_chase(currChase);

      // 5. 验证：怪物从 MT0(12,5) 跨面到 MT3(0,5)
      expect(core.status.maps['MT0'].map[5][12]).toBe(0);
      expect(core.status.maps['MT3'].map[5][0]).toBe(100);
    });

    it('怪物跨面到本层后，mapBlockObjs 缓存被清除（本层追猎能检测到）', () => {
      // 验证修复：跨层追猎执行后清除 mapBlockObjs 缓存
      core.status.maps['MT0'].map[5][12] = 100;
      core.status.hero.loc = { x: 1, y: 5 };
      core.status.floorId = 'MT3';
      core.status.mapBlockObjs = { 'MT0': {old: true}, 'MT3': {old: true} };

      const chase = [{ x: 12, y: 5, dir: 'right', srcFloor: 'MT0', step: 2 }];
      control._checkBlock_chase(chase);

      // 缓存应被清除（设为 null），下次 getCheckBlock 会重新提取
      expect(core.status.mapBlockObjs['MT3']).toBeNull();
      expect(core.status.mapBlockObjs['MT0']).toBeNull();
    });
  });
});
