"use strict";

const test = globalThis.test || require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const CubeWorld = require("../../project/cube.js");

const root = path.resolve(__dirname, "../..");

function loadScript(context, relative) {
    const filename = path.join(root, relative);
    vm.runInContext(fs.readFileSync(filename, "utf8"), context, { filename });
}

function valueByPrefix(context, prefix) {
    const key = Object.keys(context).find((name) => name.startsWith(prefix));
    assert.ok(key, `missing ${prefix}`);
    return context[key];
}

function loadContent() {
    const context = vm.createContext({ main: { floors: {} } });
    ["project/data.js", "project/maps.js", "project/enemys.js", "project/icons.js"].forEach((file) => loadScript(context, file));
    for (let index = 0; index < 6; index++) loadScript(context, `project/floors/MT${index}.js`);
    return {
        data: valueByPrefix(context, "data_"),
        maps: valueByPrefix(context, "maps_"),
        enemies: valueByPrefix(context, "enemys_"),
        icons: valueByPrefix(context, "icons_"),
        floors: context.main.floors
    };
}

const content = loadContent();

test("六张 13×13 地图和初始状态形成完整立方体内容", () => {
    assert.deepEqual(Array.from(content.data.main.floorIds), ["MT0", "MT1", "MT2", "MT3", "MT4", "MT5"]);
    assert.equal(content.data.firstData.floorId, "MT0");
    assert.equal(content.data.firstData.hero.hp, 12000);
    assert.equal(content.data.firstData.hero.atk, 20);
    assert.equal(content.data.firstData.hero.def, 20);
    assert.equal(content.data.firstData.hero.items.tools.yellowKey, 2);
    assert.equal(content.data.firstData.hero.items.tools.blueKey, 1);
    assert.equal(content.data.flags.enableRouteFolding, true);

    for (const floorId of content.data.main.floorIds) {
        const floor = content.floors[floorId];
        assert.ok(floor, floorId);
        assert.equal(floor.width, 13, floorId);
        assert.equal(floor.height, 13, floorId);
        assert.equal(floor.map.length, 13, floorId);
        floor.map.forEach((row) => assert.equal(row.length, 13, floorId));
        const edges = [floor.map[0], floor.map[12], floor.map.map((row) => row[0]), floor.map.map((row) => row[12])];
        edges.forEach((edge, index) => assert.ok(edge.includes(0), `${floorId} edge ${index} has no crossing`));
    }
    assert.equal(content.floors.MT0.map[6][6], 0, "出生点必须可站立");
});

test("地图使用的每个数字图块都有注册，怪物同时具备数据和图标", () => {
    const used = new Set();
    Object.values(content.floors).forEach((floor) => floor.map.flat().forEach((number) => number && used.add(String(number))));
    for (const number of used) {
        const tile = content.maps[number];
        assert.ok(tile, `unregistered tile ${number}`);
        if (/^enemy/.test(tile.cls)) {
            assert.ok(content.enemies[tile.id], `missing enemy ${tile.id}`);
            assert.ok(Object.prototype.hasOwnProperty.call(content.icons[tile.cls], tile.id), `missing icon ${tile.id}`);
        }
    }
    assert.equal(content.maps[344].id, "xishiFairy");
    assert.equal(content.icons.enemys.xishiFairy, content.icons.enemys.tulipFairy);
});

test("四个清怪机关和底面关卡都有明确的开门闭环", () => {
    const cases = {
        MT2: { enemies: ["yellowGateKeeper"], count: 4, doors: [[6, 4], [4, 6], [8, 6], [6, 8]] },
        MT3: { enemies: ["yellowGateKeeper"], count: 4, doors: [[6, 4], [4, 6], [8, 6], [6, 8]] },
        MT4: { enemies: ["skeletonWarrior"], count: 4, doors: [[6, 3], [4, 5], [8, 5], [6, 8]] },
        MT5: { enemies: ["bluePriest", "rock"], count: 8, doors: [[6, 4], [4, 6], [8, 6], [6, 8]] }
    };
    for (const [floorId, expected] of Object.entries(cases)) {
        const floor = content.floors[floorId];
        const ids = floor.map.flat().map((number) => content.maps[number] && content.maps[number].id);
        assert.equal(ids.filter((id) => expected.enemies.includes(id)).length, expected.count, floorId);
        expected.doors.forEach(([x, y]) => assert.equal(content.maps[floor.map[y][x]].id, "specialDoor", `${floorId}:${x},${y}`));
        assert.equal(Object.keys(floor.afterBattle).length, expected.count, floorId);
        Object.values(floor.afterBattle).forEach((actions) => {
            const source = actions[0].function;
            assert.match(source, /openDoorsWhenClear/);
            assert.match(source, new RegExp(`'${floorId}'`));
        });
    }
});

test("吸噬怪、跨面能力、最终 Boss 和商店均在实际关卡中可达", () => {
    for (const id of ["soldier", "xishiFairy", "tulipFairy"]) {
        const enemy = content.enemies[id];
        assert.ok(enemy.special.includes(31), id);
        assert.ok(enemy.absorbValue > 0 && enemy.absorbValue <= 1, id);
    }
    assert.ok(content.enemies.tulipFairy.special.includes(18));
    assert.ok(content.enemies.tulipFairy.special.includes(24));
    assert.equal(content.enemies.tulipFairy.afterBattle[0].type, "win");
    assert.ok(content.floors.MT1.map.flat().includes(326), "最终 Boss 未放入关卡");
    assert.ok(content.floors.MT1.map.flat().includes(344), "吸噬测试怪未放入关卡");
    assert.deepEqual(Array.from(content.data.firstData.shops.slice(0, 2), (shop) => shop.id), ["moneyShop", "expShop"]);
    assert.ok(content.floors.MT2.map.flat().includes(130));
    assert.ok(content.floors.MT3.map.flat().includes(131));
});

test("六面静态通路连通，机关外敌人可达且开门后中央奖励区可进入", () => {
    const geometry = CubeWorld.createGeometry({ size: 13 });
    function reachable(openSpecialDoors) {
        const queue = [{ floorId: "MT0", x: 6, y: 6, direction: "up" }];
        const seen = new Set([geometry.stateKey(queue[0])]);
        for (let index = 0; index < queue.length; index++) {
            for (const entry of geometry.cardinalNeighbors(queue[index])) {
                const point = entry.state;
                const key = geometry.stateKey(point);
                if (seen.has(key)) continue;
                const number = content.floors[point.floorId].map[point.y][point.x];
                const tile = content.maps[number];
                if (tile && tile.cls === "terrains" && /Wall$/.test(tile.id)) continue;
                if (tile && tile.doorInfo && !(openSpecialDoors && tile.id === "specialDoor")) continue;
                seen.add(key);
                queue.push(point);
            }
        }
        return seen;
    }

    const before = reachable(false);
    for (const key of ["MT1:6:5", "MT2:6:3", "MT3:6:3", "MT4:6:2", "MT5:6:1"]) {
        assert.ok(before.has(key), `${key} should be reachable before opening mechanisms`);
    }
    for (const key of ["MT2:6:6", "MT3:6:6", "MT4:6:6", "MT5:6:6"]) {
        assert.equal(before.has(key), false, `${key} should initially be sealed`);
    }
    const after = reachable(true);
    for (const key of ["MT2:6:6", "MT3:6:6", "MT4:6:6", "MT5:6:6"]) {
        assert.ok(after.has(key), `${key} should open after its clear condition`);
    }
});

test("3D 查看器没有隐藏后仍运行的帧循环，并提供六面与关闭入口", () => {
    const html = fs.readFileSync(path.join(root, "cube-map-viewer.html"), "utf8");
    assert.doesNotMatch(html, /requestAnimationFrame/);
    for (let index = 0; index < 6; index++) assert.match(html, new RegExp(`data-floor="MT${index}"`));
    assert.match(html, /Esc \/ C 关闭/);
    assert.match(html, /CubeViewer/);
});
