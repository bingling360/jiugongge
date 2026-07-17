"use strict";

const test = globalThis.test || require("node:test");
const assert = require("node:assert/strict");
const CubeWorld = require("../../project/cube.js");

const geometry = CubeWorld.createGeometry({ size: 13 });

const expectedEdges = {
    MT0: { up: ["MT4", "down"], down: ["MT5", "up"], left: ["MT2", "right"], right: ["MT3", "left"] },
    MT1: { up: ["MT4", "up"], down: ["MT5", "down"], left: ["MT3", "right"], right: ["MT2", "left"] },
    MT2: { up: ["MT4", "left"], down: ["MT5", "left"], left: ["MT1", "right"], right: ["MT0", "left"] },
    MT3: { up: ["MT4", "right"], down: ["MT5", "right"], left: ["MT0", "right"], right: ["MT1", "left"] },
    MT4: { up: ["MT1", "up"], down: ["MT0", "up"], left: ["MT2", "up"], right: ["MT3", "up"] },
    MT5: { up: ["MT0", "down"], down: ["MT1", "down"], left: ["MT2", "down"], right: ["MT3", "down"] }
};

test("三维坐标基推导出功能规格中的全部 24 条边", () => {
    for (const face of CubeWorld.FACE_IDS) {
        for (const direction of CubeWorld.DIRECTIONS) {
            const edge = geometry.edge(face, direction);
            assert.deepEqual(
                [edge.targetFace, edge.targetEdge],
                expectedEdges[face][direction],
                `${face}/${direction}`
            );
            assert.equal(edge.direction, CubeWorld.OPPOSITE[edge.targetEdge]);
        }
    }
});

test("每条边的每个坐标都能跨出后原路返回", () => {
    for (const face of CubeWorld.FACE_IDS) {
        for (const direction of CubeWorld.DIRECTIONS) {
            for (let t = 0; t < 13; t++) {
                const horizontal = direction === "left" || direction === "right";
                const source = {
                    floorId: face,
                    x: horizontal ? (direction === "left" ? 0 : 12) : t,
                    y: horizontal ? t : (direction === "up" ? 0 : 12),
                    direction
                };
                const target = geometry.step(source);
                const back = geometry.step(target, CubeWorld.OPPOSITE[target.direction]);
                assert.equal(back.floorId, source.floorId, `${face}/${direction}/${t}: floor`);
                assert.equal(back.x, source.x, `${face}/${direction}/${t}: x`);
                assert.equal(back.y, source.y, `${face}/${direction}/${t}: y`);
                assert.equal(back.direction, CubeWorld.OPPOSITE[direction], `${face}/${direction}/${t}: direction`);
            }
        }
    }
});

test("旋转边会同时旋转路径方向", () => {
    const topToRight = geometry.step({ floorId: "MT4", x: 12, y: 9, direction: "right" });
    assert.deepEqual(
        { floorId: topToRight.floorId, x: topToRight.x, y: topToRight.y, direction: topToRight.direction },
        { floorId: "MT3", x: 3, y: 0, direction: "down" }
    );

    const laser = geometry.trace(
        { floorId: "MT2", x: 0, y: 0, direction: "up" },
        "up",
        { maxSteps: 3 }
    );
    assert.deepEqual(
        laser.map(({ floorId, x, y, direction }) => ({ floorId, x, y, direction })),
        [
            { floorId: "MT4", x: 0, y: 0, direction: "right" },
            { floorId: "MT4", x: 1, y: 0, direction: "right" },
            { floorId: "MT4", x: 2, y: 0, direction: "right" }
        ]
    );
});

test("跨越旋转边后调整画面，使屏幕前进方向保持连续", () => {
    const target = geometry.step({ floorId: "MT4", x: 12, y: 9, direction: "right" });
    const quarter = CubeWorld.viewQuarterAfterCross(0, "right", target.direction);
    assert.equal(target.direction, "down");
    assert.equal(quarter, 3);
    assert.equal(CubeWorld.logicalToScreenDirection(target.direction, quarter), "right");
});

test("屏幕方向按当前画面角度反算为规范地图方向", () => {
    assert.equal(CubeWorld.screenToLogicalDirection("right", 3), "down");
    assert.equal(CubeWorld.screenToLogicalDirection("up", 3), "right");
    for (const quarter of [0, 1, 2, 3]) {
        for (const direction of CubeWorld.DIRECTIONS) {
            const screen = CubeWorld.logicalToScreenDirection(direction, quarter);
            assert.equal(CubeWorld.screenToLogicalDirection(screen, quarter), direction);
        }
    }
});

test("沿同一条物理边原路返回会恢复原画面角度", () => {
    const forward = geometry.step({ floorId: "MT4", x: 12, y: 9, direction: "right" });
    const onRight = CubeWorld.viewQuarterAfterCross(0, "right", forward.direction);
    const backward = geometry.step(forward, CubeWorld.OPPOSITE[forward.direction]);
    const backOnTop = CubeWorld.viewQuarterAfterCross(
        onRight, CubeWorld.OPPOSITE[forward.direction], backward.direction
    );
    assert.equal(backward.floorId, "MT4");
    assert.equal(backOnTop, 0);
});

test("真实表面直线可连续跨越多条旋转边且在闭环前停止", () => {
    const source = { floorId: "MT2", x: 0, y: 0, direction: "up" };
    const line = geometry.trace(source, "up", { maxSteps: 60 });
    assert.deepEqual(
        line.filter(one => one.crossed).map(({ step, floorId, x, y, direction }) => ({ step, floorId, x, y, direction })),
        [
            { step: 1, floorId: "MT4", x: 0, y: 0, direction: "right" },
            { step: 14, floorId: "MT3", x: 12, y: 0, direction: "down" },
            { step: 27, floorId: "MT5", x: 12, y: 12, direction: "left" },
            { step: 40, floorId: "MT2", x: 0, y: 12, direction: "up" }
        ]
    );
    const directedKeys = line.map(one => geometry.stateKey(one, true));
    assert.equal(new Set(directedKeys).size, directedKeys.length);
    assert.equal(directedKeys.includes(geometry.stateKey(source, true)), false);
    assert.equal(line.length, 51);
});

test("表面范围采用格子邻接图且结果天然去重", () => {
    const source = { floorId: "MT0", x: 0, y: 0, direction: "up" };
    for (const square of [false, true]) {
        for (const range of [1, 2, 3]) {
            const area = geometry.area(source, range, square);
            const keys = area.map(one => geometry.stateKey(one));
            assert.equal(new Set(keys).size, keys.length, `${square}/${range}`);
            assert.equal(keys.filter(key => key === geometry.stateKey(source)).length, 1);
        }
    }
    assert.equal(geometry.area(source, 1, false).length, 5);
    assert.equal(geometry.area(source, 1, true).length, 8);
    assert.equal(geometry.distance(source, geometry.step(source, "left"), false, 1), 1);
    assert.equal(geometry.distance(source, { floorId: "MT1", x: 12, y: 12, direction: "up" }, false, 1), Infinity);
});

test("立方体顶点的三面共点邻域只返回唯一格子", () => {
    const corner = { floorId: "MT0", x: 0, y: 0, direction: "up" };
    const neighbors = geometry.kingNeighbors(corner).map(one => geometry.stateKey(one.state));
    assert.equal(neighbors.length, 7);
    assert.equal(new Set(neighbors).size, neighbors.length);
    assert.ok(neighbors.includes("MT4:0:12"));
    assert.ok(neighbors.includes("MT2:12:0"));
    const area = geometry.area(corner, 1, true).map(one => geometry.stateKey(one));
    assert.equal(area.filter(key => key === geometry.stateKey(corner)).length, 1);
});

test("stableStringify 不受对象键顺序影响，循环状态安全失败", () => {
    assert.equal(
        CubeWorld.stableStringify({ z: 1, a: { y: 2, x: 3 } }),
        CubeWorld.stableStringify({ a: { x: 3, y: 2 }, z: 1 })
    );
    const cyclic = {};
    cyclic.self = cyclic;
    assert.equal(CubeWorld.stableStringify(cyclic), null);
});

test("吸噬只按穿透护盾的实际攻击伤害回复", () => {
    const result = CubeWorld.simulateAbsorb({
        monsterHp: 100,
        heroDamage: 30,
        shield: 20,
        regularDamage: 30,
        absorb: 0.5
    });
    assert.equal(result.winnable, true);
    assert.equal(result.turn, 5);
    assert.equal(result.healed, 50);
});

test("先攻参与吸噬，回复不改变返回的原始怪物生命", () => {
    const options = {
        monsterHp: 100,
        heroDamage: 30,
        shield: 20,
        firstStrike: 30,
        regularDamage: 30,
        absorb: 0.5
    };
    const result = CubeWorld.simulateAbsorb(options);
    assert.equal(result.winnable, true);
    assert.equal(result.turn, 6);
    assert.equal(options.monsterHp, 100);
});

test("反击在每次勇士攻击时触发，包含可能成为最后一击的回合", () => {
    const result = CubeWorld.simulateAbsorb({
        monsterHp: 60,
        heroDamage: 30,
        counterDamage: 20,
        absorb: 0.5
    });
    assert.equal(result.winnable, true);
    assert.equal(result.turn, 3);
    assert.equal(result.healed, 30);
});

test("回复不低于每回合输出时正确判定不可战斗", () => {
    const result = CubeWorld.simulateAbsorb({
        monsterHp: 100,
        heroDamage: 10,
        regularDamage: 30,
        absorb: 0.5
    });
    assert.equal(result.winnable, false);
    assert.equal(result.reason, "absorb-lock");
});
