"use strict";

// 显伤数值缓存验证：勇士攻防血/楼层/开关/怪物覆盖/怪物数量不变时跳过 _updateDamage_damage 重算；
// 任一变化时重算；改怪/删怪会令缓存失效。

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const controlSource = fs.readFileSync(path.resolve(__dirname, "../../libs/control.js"), "utf8");
const eventsSource = fs.readFileSync(path.resolve(__dirname, "../../libs/events.js"), "utf8");

// 构造一个能让 updateDamage 跑起来的最小 core，并劫持 _updateDamage_damage / drawDamage 计数
function makeCoreForControl() {
    const recalc = { count: 0 };
    const draw = { count: 0 };
    const blocks = [{ x: 1, y: 1, event: { id: "slime", cls: "enemy0", displayDamage: true }, disable: false }];
    const core = {
        status: {
            gameOver: false,
            floorId: "MT0",
            damage: { posX: 0, posY: 0 },
            hero: { atk: 10, def: 5, mdef: 3, hp: 100 },
            maps: { MT0: { blocks } }
        },
        flags: {
            displayEnemyDamage: true, displayCritical: false,
            displayExtraDamage: false, extraDamageType: 0
        },
        bigmap: { posX: 0, posY: 0, extend: 1 },
        floors: { MT0: { width: 5, height: 5 } },
        hasItem() { return true; },
        getLocalStorage() { return { leftdown: { 1: "damage", 2: "critical" }, rightup: {} }; },
        extractBlocks() {},
        clearMap() {},
        canvas: { damage: {} },
        utils: { formatBigNumber: (v) => String(v) },
        formatBigNumber: (v) => String(v),
        enemys: {
            getEnemyValue() { return 1; },
            getDamageString() { return { damage: "5", color: "#fff" }; },
            nextCriticals() { return []; }
        },
        updateStatusBar() {},
        setLocalStorage() {},
        calValue(v) { return typeof v === "number" ? v : Number(v) || 0; },
        getEnemyValue() { return 1; },
        material: { enemys: { slime: {} } },
        getBlock() { return { x: 1, y: 1, event: { id: "slime", cls: "enemy0" } }; }
    };
    core.main = { mode: "play" };
    core.control = null; // 稍后填充
    return { core, recalc, draw, blocks };
}

// 加载真实 control.js 并构造实例（跳过依赖运行时的 _init）
function makeControl(core, extra) {
    const ctx = Object.assign({
        core, console, window: {}, document: {}, setTimeout,
        main: { mode: "play" },
        functions_d6ad677b_427a_4623_b50f_a445a3b0ef8a: { control: {}, enemys: {} }
    }, extra || {});
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(controlSource, ctx, { filename: "libs/control.js" });
    ctx.control.prototype._init = function () {}; // 跳过真实初始化，依赖均已在 mock core 提供
    const control = new ctx.control();
    control.core = core;
    core.control = control;
    return control;
}

test("显伤缓存：勇士属性不变时跳过 _updateDamage_damage 重算", () => {
    const { core, recalc, draw } = makeCoreForControl();
    const control = makeControl(core);
    // 劫持重算与绘制计数
    control._updateDamage_damage = function () { recalc.count++; core.status.damage.data = core.status.damage.data || []; };
    control._updateDamage_extraDamage = function () {};
    control.drawDamage = function () { draw.count++; };

    control.updateDamage("MT0");      // 首次：重算
    expect(recalc.count).toBe(1);
    control.updateDamage("MT0");      // 勇士属性未变：应命中缓存，跳过
    expect(recalc.count).toBe(1);
    expect(draw.count).toBe(2);       // 仍会重绘（viewport 平移）
});

test("显伤缓存：勇士攻击变化触发重算", () => {
    const { core, recalc } = makeCoreForControl();
    const control = makeControl(core);
    control._updateDamage_damage = function () { recalc.count++; core.status.damage.data = core.status.damage.data || []; };
    control._updateDamage_extraDamage = function () {};
    control.drawDamage = function () {};

    control.updateDamage("MT0");
    expect(recalc.count).toBe(1);
    core.status.hero.atk = 999;       // 攻击变化
    control.updateDamage("MT0");
    expect(recalc.count).toBe(2);     // 缓存失效，重算
});

test("显伤缓存：改怪（enemyOnPoint）令缓存失效", () => {
    const { core, recalc } = makeCoreForControl();
    const control = makeControl(core);
    // 同时加载 events.js，使其 setEnemyOnPoint 可调用并触发 invalidateDamageCache
    const ectx = {
        core, flags: core.flags, console, window: {}, document: {}, setTimeout, main: { mode: "play" },
        functions_d6ad677b_427a_4623_b50f_a445a3b0ef8a: { control: {}, enemys: {} },
        events_c12a15a8_c380_4b28_8144_256cba95f760: { commonEvent: {} }
    };
    ectx.globalThis = ectx;
    vm.createContext(ectx);
    vm.runInContext(eventsSource, ectx, { filename: "libs/events.js" });
    core.events = new ectx.events();
    control._updateDamage_damage = function () { recalc.count++; core.status.damage.data = core.status.damage.data || []; };
    control._updateDamage_extraDamage = function () {};
    control.drawDamage = function () {};

    control.updateDamage("MT0");
    expect(recalc.count).toBe(1);

    // 改怪覆盖属性，应令缓存失效
    core.events.setEnemyOnPoint(1, 1, "MT0", "hp", 50);
    control.updateDamage("MT0");
    expect(recalc.count).toBe(2);

    // 不再改怪，属性不变 → 命中缓存
    control.updateDamage("MT0");
    expect(recalc.count).toBe(2);
});

test("显伤缓存：增删怪（怪物数量变化）令缓存失效", () => {
    const { core, recalc, blocks } = makeCoreForControl();
    const control = makeControl(core);
    control._updateDamage_damage = function () { recalc.count++; core.status.damage.data = core.status.damage.data || []; };
    control._updateDamage_extraDamage = function () {};
    control.drawDamage = function () {};

    control.updateDamage("MT0");
    expect(recalc.count).toBe(1);

    // 新增一只怪 → enemyCount 变化 → 缓存失效
    blocks.push({ x: 2, y: 2, event: { id: "bat", cls: "enemy0", displayDamage: true }, disable: false });
    control.updateDamage("MT0");
    expect(recalc.count).toBe(2);
});
