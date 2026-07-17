"use strict";

const test = globalThis.test || require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const CubeWorld = require("../../project/cube.js");

const controlSource = fs.readFileSync(path.resolve(__dirname, "../../libs/control.js"), "utf8");

function clone(value, filter) {
    if (value == null || typeof value !== "object") return value;
    const output = Array.isArray(value) ? [] : {};
    Object.keys(value).forEach((key) => {
        if (!filter || filter(key, value[key])) output[key] = clone(value[key]);
    });
    return output;
}

function createHarness() {
    const hero = {
        hp: 12000, atk: 20, def: 20, mdef: 0, money: 0, exp: 0, steps: 0,
        loc: { x: 6, y: 6, direction: "up" },
        flags: { visitedFloor: { MT0: true } },
        items: { constants: { book: 1 }, tools: {}, equips: {} },
        equipment: [], followers: []
    };
    const core = {
        flags: { enableRouteFolding: true },
        values: { lavaDamage: 100 },
        status: {
            floorId: "MT0", hero,
            event: { id: null }, replay: {}, route: ["right", "left"], routeFolding: {},
            shops: { moneyShop: { visited: true } },
            maps: { MT0: { deleted: false, map: [[0]], blocks: [] } }
        },
        extractBlocks() {},
        clone,
        isPlaying: () => true,
        isReplaying: () => false,
        getHeroLoc(name) { return hero.loc[name]; },
        same(a, b) { return CubeWorld.stableStringify(a) === CubeWorld.stableStringify(b); },
        clearRouteFolding() { core.status.routeFolding = {}; }
    };
    const context = vm.createContext({ core, CubeWorld, console, window: {}, document: {}, setTimeout, clearTimeout, setInterval, clearInterval });
    vm.runInContext(controlSource, context, { filename: "libs/control.js" });
    const instance = Object.create(context.control.prototype);
    core.control = instance;
    core.clearRouteFolding = instance.clearRouteFolding.bind(instance);
    return { core, instance };
}

test("录像指纹覆盖楼层删除、完整块事件、透明度、滤镜和隐藏 flag", () => {
    const { core, instance } = createHarness();
    const signatures = [];
    signatures.push(instance._getRouteFoldingSignature());
    core.status.maps.MT0.deleted = true;
    signatures.push(instance._getRouteFoldingSignature());
    core.status.maps.MT0.deleted = false;
    core.status.maps.MT0.blocks.push({ x: 0, y: 0, opacity: 0.5, filter: { blur: 1 }, event: { id: "sign", data: [{ type: "text", text: "A" }] } });
    signatures.push(instance._getRouteFoldingSignature());
    core.status.maps.MT0.blocks[0].event.data[0].text = "B";
    signatures.push(instance._getRouteFoldingSignature());
    core.status.hero.flags.hideFloors = { MT1: true };
    signatures.push(instance._getRouteFoldingSignature());
    core.values.lavaDamage = 101;
    signatures.push(instance._getRouteFoldingSignature());
    assert.equal(new Set(signatures).size, signatures.length);
});

test("图块数组顺序变化但语义状态相同时保持同一指纹", () => {
    const { core, instance } = createHarness();
    core.status.maps.MT0.blocks = [
        { x: 1, y: 0, event: { id: "redGem" } },
        { x: 0, y: 1, event: { id: "blueGem" } }
    ];
    const before = instance._getRouteFoldingSignature();
    core.status.maps.MT0.blocks.reverse();
    const after = instance._getRouteFoldingSignature();
    assert.equal(after, before);
});

test("完全相同的六面状态才折叠路线，状态变化后不折叠", () => {
    const { core, instance } = createHarness();
    instance.checkRouteFolding();
    core.status.route.push("right");
    core.status.route.push("left");
    instance.checkRouteFolding();
    assert.deepEqual(Array.from(core.status.route), ["right", "left"]);

    core.status.hero.flags.poison = true;
    core.status.route.push("right");
    core.status.route.push("left");
    instance.checkRouteFolding();
    assert.equal(core.status.route.length, 4, "隐藏状态改变后不应复用旧前缀");
});

test("无法序列化的循环状态直接禁用本次折叠，不会共享错误哨兵", () => {
    const { core, instance } = createHarness();
    core.status.hero.flags.loop = core.status.hero.flags;
    assert.equal(instance._getRouteFoldingSignature(), null);
    core.status.routeFolding.any = { length: 1 };
    instance.checkRouteFolding();
    assert.equal(Object.keys(core.status.routeFolding).length, 0);
});
