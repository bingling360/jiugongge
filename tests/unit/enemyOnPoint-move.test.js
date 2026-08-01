"use strict";

// 验证 exchangeEnemyOnPoint / moveEnemyOnPoint 去掉深拷贝后，仅做引用搬移，行为不变。

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const eventsSource = fs.readFileSync(path.resolve(__dirname, "../../libs/events.js"), "utf8");

function makeCore() {
    const flags = { enemyOnPoint: {} };
    const core = {
        flags,
        status: { floorId: "MT0", damage: {} },
        updateStatusBar() { updated = true; },
        isset(v) { return v !== undefined && v !== null; },
        control: { invalidateDamageCache() {} } // mock：显伤缓存失效钩子
    };
    let updated = false;
    core._wasRefreshed = () => updated;
    return core;
}

test("exchangeEnemyOnPoint 交换两点 delta 且不深拷贝（共享引用但各自独立）", () => {
    const core = makeCore();
    const ctx = {
        core,
        flags: core.flags,
        console,
        window: {},
        document: {},
        setTimeout,
        main: { mode: "play" },
        functions_d6ad677b_427a_4623_b50f_a445a3b0ef8a: { enemys: {} },
        events_c12a15a8_c380_4b28_8144_256cba95f760: { commonEvent: {} }
    };
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(eventsSource, ctx, { filename: "libs/events.js" });
    const events = new ctx.events();

    // 在 MT0 层设置两点的怪物覆盖属性
    core.flags.enemyOnPoint.MT0 = {
        "1,1": { hp: 100, atk: 50 },
        "2,2": { hp: 200, def: 30 }
    };

    events.exchangeEnemyOnPoint(1, 1, 2, 2, "MT0", true);

    // 交换后：(1,1) 应变为原 (2,2) 的内容，(2,2) 应变为原 (1,1) 的内容
    expect(core.flags.enemyOnPoint.MT0["1,1"]).toEqual({ hp: 200, def: 30 });
    expect(core.flags.enemyOnPoint.MT0["2,2"]).toEqual({ hp: 100, atk: 50 });

    // 引用确实被搬移（不是拷贝出来的新对象），原对象身份保持
    const a = core.flags.enemyOnPoint.MT0["1,1"];
    const b = core.flags.enemyOnPoint.MT0["2,2"];
    expect(a).toBe(core.flags.enemyOnPoint.MT0["1,1"]); // 同一引用
    expect(b).toBe(core.flags.enemyOnPoint.MT0["2,2"]);

    // 通过其中一处修改，不应影响另一处（两者是不同坐标的不同 delta 对象）
    a.mdef = 5;
    expect(b.mdef).toBeUndefined();
});

test("moveEnemyOnPoint 搬移 delta 且不深拷贝", () => {
    const core = makeCore();
    const ctx = {
        core,
        flags: core.flags,
        console,
        window: {},
        document: {},
        setTimeout,
        main: { mode: "play" },
        functions_d6ad677b_427a_4623_b50f_a445a3b0ef8a: { enemys: {} },
        events_c12a15a8_c380_4b28_8144_256cba95f760: { commonEvent: {} }
    };
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(eventsSource, ctx, { filename: "libs/events.js" });
    const events = new ctx.events();

    core.flags.enemyOnPoint.MT0 = { "1,1": { hp: 120 } };

    events.moveEnemyOnPoint(1, 1, 3, 3, "MT0", true);

    expect(core.flags.enemyOnPoint.MT0["1,1"]).toBeUndefined();
    expect(core.flags.enemyOnPoint.MT0["3,3"]).toEqual({ hp: 120 });
    expect(core.flags.enemyOnPoint.MT0["3,3"]).toBe(core.flags.enemyOnPoint.MT0["3,3"]);
});
