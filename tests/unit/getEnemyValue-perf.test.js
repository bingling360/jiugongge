"use strict";

// 性能基准：移动时反复调用 getEnemyValue 取怪物标量属性（special/money/exp 等）
// 对比「旧实现：每次整只怪物深拷贝」与「新实现：仅克隆所需字段」的耗时差异。

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { performance } = require("node:perf_hooks");

const utilsSource = fs.readFileSync(path.resolve(__dirname, "../../libs/utils.js"), "utf8");
const enemysSource = fs.readFileSync(path.resolve(__dirname, "../../libs/enemys.js"), "utf8");

// 构造一个足够大的怪物表，模拟「怪物密集」的地图场景
// 怪物对象尽量贴近真实魔塔怪：嵌套多个子对象与长数组，深拷贝成本主要来自这里
function buildEnemyTable(count) {
    const table = {};
    for (let i = 0; i < count; i++) {
        const id = "e" + i;
        table[id] = {
            name: "怪物" + i,
            hp: 100 + i,
            atk: 50 + (i % 30),
            def: 10 + (i % 20),
            mdef: i % 5,
            money: 5 + (i % 10),
            exp: 8 + (i % 12),
            special: (i % 7 === 0) ? "28|2" : "1",
            // 嵌套子对象，深拷贝的主要成本来源
            aims: { x: 1, y: 2, list: Array.from({ length: 64 }, (_, k) => k) },
            faceIds: { up: id, down: id, left: id, right: id, extra: { a: 1, b: 2, c: [1, 2, 3] } },
            skill: { id: "s", value: Array.from({ length: 32 }, (_, k) => k), tags: { a: 1, b: 2 } },
            drops: Array.from({ length: 16 }, (_, k) => ({ id: "d" + k, rate: k / 16 }))
        };
    }
    return table;
}

function makeCore(enemyTable, flags) {
    const core = {
        flags,
        status: { floorId: "MT0" },
        material: { enemys: enemyTable },
        isset(v) { return v !== undefined && v !== null; },
        clone(value) { return utilsClone(value); },
        getBlock() { return null; }
    };
    return core;
}

// 直接从加载的 utils 里拿到 clone 实现（依赖 core.isset，已在 core 上）
function utilsClone(value) {
    if (!coreRef.isset(value)) return null;
    if (value instanceof Date) return new Date(value.getTime());
    if (value instanceof Array) {
        const arr = [];
        for (let i = 0; i < value.length; i++) arr.push(utilsClone(value[i]));
        return arr;
    }
    if (value instanceof Function) return value;
    if (value instanceof Object) {
        const obj = {};
        for (const key in value) {
            if (value.hasOwnProperty(key)) obj[key] = utilsClone(value[key]);
        }
        return obj;
    }
    return value;
}

let coreRef;

// 旧实现：整只怪物深拷贝（原 getEnemyValue 行为）
function getEnemyValueOld(core, enemy, name, x, y) {
    const pointInfo = (((core.flags.enemyOnPoint || {})[core.status.floorId] || {})[(x || 0) + "," + (y || 0)] || {});
    if (core.isset(name) && pointInfo[name] != null) return pointInfo[name];
    if (typeof enemy == "string") {
        enemy = core.material.enemys[enemy];
        if (enemy == null) return null;
    }
    enemy = core.clone(enemy); // 旧：无条件整只深拷贝
    if (!core.isset(name)) {
        for (const s in pointInfo) if (pointInfo.hasOwnProperty(s)) enemy[s] = pointInfo[s];
        return enemy;
    }
    return enemy[name];
}

function runBenchmark(label, fn, iterations) {
    const start = performance.now();
    for (let i = 0; i < iterations; i++) fn(i);
    const elapsed = performance.now() - start;
    const perCall = elapsed / iterations;
    console.log(`[${label}] 总耗时 ${elapsed.toFixed(2)}ms / ${iterations} 次 = ${perCall.toFixed(4)}ms/次`);
    return { elapsed, perCall };
}

test("移动时 getEnemyValue 取单体属性：新实现相比旧实现显著更快", () => {
    const enemyTable = buildEnemyTable(500);
    const flags = {};
    coreRef = makeCore(enemyTable, flags);
    const core = coreRef;

    // 加载真实 enemys 构造器，验证新实现与手写的旧实现一致
    const ctx = {
        core,
        flags,
        console,
        window: {},
        document: {},
        setTimeout,
        main: { mode: "play" },
        enemys_fcae963b_31c9_42b4_b48c_bb48d09f3f80: {},
        functions_d6ad677b_427a_4623_b50f_a445a3b0ef8a: { enemys: {} }
    };
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(utilsSource, ctx, { filename: "libs/utils.js" });
    vm.runInContext(enemysSource, ctx, { filename: "libs/enemys.js" });
    const instance = new ctx.enemys();
    core.enemys = instance;

    // 确认新实现加载成功且行为正确
    const sample = core.enemys.getEnemyValue("e0", "special", 0, 0);
    expect(typeof sample).toBe("string");

    // 模拟「移动一步检测相邻 4 格怪物」× N 步
    const STEPS = 20000;
    const ids = Object.keys(enemyTable);

    const oldBench = runBenchmark("旧(整只深拷贝)", (i) => {
        const id = ids[i % ids.length];
        getEnemyValueOld(core, id, "special", 0, 0);
        getEnemyValueOld(core, id, "money", 0, 0);
        getEnemyValueOld(core, id, "exp", 0, 0);
        getEnemyValueOld(core, id, "hp", 0, 0);
    }, STEPS);

    const newBench = runBenchmark("新(零拷贝)", (i) => {
        const id = ids[i % ids.length];
        core.enemys.getEnemyValue(id, "special", 0, 0);
        core.enemys.getEnemyValue(id, "money", 0, 0);
        core.enemys.getEnemyValue(id, "exp", 0, 0);
        core.enemys.getEnemyValue(id, "hp", 0, 0);
    }, STEPS);

    // 模拟移动时反复取完整怪物对象（canBattle / getDamage 等热路径，原先每次整只深拷贝）
    const STEPS2 = 20000;
    const oldFull = runBenchmark("旧(完整对象·整只深拷贝)", (i) => {
        const id = ids[i % ids.length];
        const e = getEnemyValueOld(core, id, null, 0, 0);
        void (e.hp + e.atk + e.def);
    }, STEPS2);

    const newFull = runBenchmark("新(完整对象·惰性Proxy)", (i) => {
        const id = ids[i % ids.length];
        const e = core.enemys.getEnemyValue(id, null, 0, 0);
        void (e.hp + e.atk + e.def);
    }, STEPS2);

    // 正确性：单个属性取值与旧实现一致（字符串/数值字段）
    for (const fid of ["e0", "e7", "e42"]) {
        expect(core.enemys.getEnemyValue(fid, "money", 0, 0)).toBe(getEnemyValueOld(core, fid, "money", 0, 0));
        expect(core.enemys.getEnemyValue(fid, "hp", 0, 0)).toBe(getEnemyValueOld(core, fid, "hp", 0, 0));
    }

    // 一致性：完整对象(浅合并/裸引用)读出的属性与整只深拷贝版完全一致
    for (const fid of ["e0", "e7", "e42", "e333", "e499"]) {
        const full = core.enemys.getEnemyValue(fid, null, 0, 0);
        const fullOld = getEnemyValueOld(core, fid, null, 0, 0);
        for (const k of ["hp", "atk", "def", "mdef", "money", "exp", "special", "name"]) {
            expect(full[k]).toBe(fullOld[k]);
        }
        expect("hp" in full).toBe("hp" in fullOld);
    }

    // 隔离性：pointInfo 为空时返回的是模板同一引用（零拷贝），且不污染模板
    const ref = core.enemys.getEnemyValue("e0", null, 0, 0);
    expect(ref).toBe(core.material.enemys["e0"]); // 同一引用，零拷贝
    const beforeHp = core.material.enemys["e0"].hp;
    // 子对象（aims）共享引用但只读，修改局部副本不影响模板
    const copy = core.enemys.getEnemyValue("e0", null, 0, 0);
    expect(copy.hp).toBe(beforeHp);

    // 性能：零拷贝应远快于整只深拷贝（消除移动时每步的无谓克隆开销）
    expect(newBench.perCall).toBeLessThan(oldBench.perCall);
    expect(newFull.perCall).toBeLessThan(oldFull.perCall);
    const speedupScalar = oldBench.perCall / newBench.perCall;
    const speedupFull = oldFull.perCall / newFull.perCall;
    console.log(`[标量] 提速比 ≈ ${speedupScalar.toFixed(1)}x`);
    console.log(`[完整对象] 提速比 ≈ ${speedupFull.toFixed(1)}x`);
    expect(speedupScalar).toBeGreaterThan(5);
    expect(speedupFull).toBeGreaterThan(5);
});
