const { test, expect } = require("@playwright/test");

async function bootGame(page) {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.stack || String(error)));
    await page.goto("/");
    await page.waitForFunction(() => window.core && core.plugin && core.plugin.cubeWorld && core.initStatus && core.initStatus.maps);
    // 启动剧情本身由内容单测覆盖；浏览器机制用例直接清空对话，避免依赖按键动画时序。
    await page.evaluate(() => {
        core.firstData.startText = [];
        core.floorIds.forEach((floorId) => {
            core.floors[floorId].firstArrive = [];
            core.floors[floorId].eachArrive = [];
        });
    });
    await page.locator("#playGame").click();
    await page.waitForFunction(() => core.status && core.status.played);
    await page.waitForFunction(() => core.status.floorId === "MT0" && !core.status.event.id && !core.status.lockControl);
    expect(errors, "页面初始化不应抛出脚本异常").toEqual([]);
}

async function changeFloor(page, floorId, loc) {
    await page.evaluate(({ floorId, loc }) => new Promise((resolve) => {
        core.changeFloor(floorId, null, loc, 0, resolve);
    }), { floorId, loc });
}

async function moveOnce(page) {
    await page.evaluate(() => new Promise((resolve) => core.moveAction(resolve)));
}

test("真实页面加载六面运行时，并可通过 C 键打开和停止 3D 总览", async ({ page }) => {
    await bootGame(page);
    const runtime = await page.evaluate(() => ({
        faces: core.plugin.cubeWorld.faces,
        floorIds: core.floorIds,
        title: core.firstData.title
    }));
    expect(runtime.faces).toEqual(["MT0", "MT1", "MT2", "MT3", "MT4", "MT5"]);
    expect(runtime.floorIds).toEqual(runtime.faces);
    expect(runtime.title).toBe("立方体世界");

    await page.evaluate(() => core.keyUp(67));
    await expect(page.locator("#cube-world-overlay")).toBeVisible();
    const frame = page.frameLocator("#cube-world-frame");
    await expect(frame.locator(".face")).toHaveCount(6);
    await expect(frame.locator(".face.current")).toHaveAttribute("data-floor", "MT0");
    await expect(frame.locator("#error")).toBeHidden();
    await expect(frame.locator("#cube")).toBeVisible();

    await frame.locator('[data-face="MT4"]').click();
    await expect(frame.locator('[data-face="MT4"]')).toHaveClass(/active/);
    await frame.locator("#close").click();
    await expect(page.locator("#cube-world-overlay")).toBeHidden();
});

test("核心图片加载失败时使用占位图提示错误并继续进入游戏", async ({ page }) => {
    await page.route("**/project/materials/icons.png*", (route) => route.abort());
    await bootGame(page);
    const warning = page.locator("#cube-load-warning");
    await expect(warning).toBeVisible();
    await expect(warning).toContainText("materials/icons");
    await expect.poll(() => page.evaluate(() => core.status.played && core.status.floorId)).toBe("MT0");
    await warning.click();
    await expect(warning).toBeHidden();
});

test("旋转边上的远程门保留钥匙语义，第二次输入才真正跨面", async ({ page }) => {
    await bootGame(page);
    await changeFloor(page, "MT4", { x: 12, y: 9, direction: "right" });
    await page.evaluate(() => {
        core.status.hero.items.tools.yellowKey = 5;
        core.setBlock(81, 3, 0, "MT3");
        core.setHeroLoc("direction", "right", true);
    });

    await moveOnce(page);
    let state = await page.evaluate(() => ({
        floorId: core.status.floorId,
        loc: core.clone(core.status.hero.loc),
        key: core.itemCount("yellowKey"),
        target: core.getBlockId(3, 0, "MT3"),
        route: core.status.route.slice(-1)[0]
    }));
    expect(state.floorId).toBe("MT4");
    expect(state.loc).toMatchObject({ x: 12, y: 9, direction: "right" });
    expect(state.key).toBe(4);
    expect(state.target).toBeNull();
    expect(state.route).toBe("right");

    await moveOnce(page);
    state = await page.evaluate(() => ({ floorId: core.status.floorId, loc: core.clone(core.status.hero.loc), route: core.status.route.slice(-1)[0] }));
    expect(state.floorId).toBe("MT3");
    expect(state.loc).toMatchObject({ x: 3, y: 0, direction: "down" });
    expect(state.route).toBe("right");
});

test("跨旋转边后地图对齐入口，屏幕方向、点击寻路和读档保持同一视角", async ({ page }) => {
    await bootGame(page);
    await changeFloor(page, "MT4", { x: 12, y: 9, direction: "right" });
    await page.evaluate(() => {
        core.removeBlock(3, 0, "MT3");
        core.removeBlock(3, 1, "MT3");
        core.removeBlock(3, 2, "MT3");
        core.setHeroLoc("direction", "right", true);
    });

    await moveOnce(page);
    let state = await page.evaluate(() => ({
        floorId: core.status.floorId,
        loc: core.clone(core.status.hero.loc),
        quarter: core.plugin.cubeWorld.getViewQuarter(),
        screenDirection: core.plugin.cubeWorld.logicalToScreenDirection(core.getHeroLoc("direction")),
        stageQuarter: document.getElementById("cube-world-stage").dataset.viewQuarter,
        bgParent: document.getElementById("bg").parentElement.id,
        uiParent: document.getElementById("ui").parentElement.id,
        dynamicParents: (() => {
            const world = core.createCanvas("cube-world-layer-probe", 0, 0, 32, 32, 80).canvas;
            const screen = core.createCanvas("cube-screen-layer-probe", 0, 0, 32, 32, 140).canvas;
            const parents = [world.parentElement.id, screen.parentElement.id];
            core.deleteCanvas("cube-world-layer-probe");
            core.deleteCanvas("cube-screen-layer-probe");
            return parents;
        })()
    }));
    expect(state).toMatchObject({
        floorId: "MT3", loc: { x: 3, y: 0, direction: "down" },
        quarter: 3, screenDirection: "right", stageQuarter: "3",
        bgParent: "cube-world-stage", uiParent: "gameDraw",
        dynamicParents: ["cube-world-stage", "gameDraw"]
    });
    await expect.poll(() => page.evaluate(() => core.plugin.cubeWorld.isViewTransitioning())).toBe(false);

    // 画面已经逆时针转 90 度；继续按屏幕“右”应换算成地图逻辑“下”。
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => page.evaluate(() => core.getHeroLoc("y"))).toBe(1);
    state = await page.evaluate(() => ({
        loc: core.clone(core.status.hero.loc),
        route: core.status.route.slice(-1)[0]
    }));
    expect(state).toMatchObject({ loc: { x: 3, y: 1, direction: "down" }, route: "down" });

    // 逻辑格 (3,2) 旋转后显示在屏幕格 (2,9)；点击所见位置仍应寻路到逻辑格。
    const box = await page.locator("#data").boundingBox();
    await page.locator("#data").click({
        position: { x: box.width * 2.5 / 13, y: box.height * 9.5 / 13 }
    });
    await expect.poll(() => page.evaluate(() => [core.getHeroLoc("x"), core.getHeroLoc("y")])).toEqual([3, 2]);

    const savedQuarter = await page.evaluate(() => new Promise((resolve) => {
        const data = core.saveData();
        const quarter = data.hero.flags.__cubeViewQuarter__;
        core.removeFlag("__cubeViewQuarter__");
        core.plugin.cubeWorld.syncViewRotation(false);
        core.loadData(data, () => resolve(quarter));
    }));
    expect(savedQuarter).toBe(3);
    await expect.poll(() => page.evaluate(() => core.plugin.cubeWorld.getViewQuarter())).toBe(3);
    await expect(page.locator("#cube-world-stage")).toHaveAttribute("data-view-quarter", "3");
});

test("跨面怪物胜利后进入目标格，块级元数据与远程战斗楼层不会错位", async ({ page }) => {
    await bootGame(page);
    await changeFloor(page, "MT0", { x: 12, y: 6, direction: "right" });
    const metadata = await page.evaluate(() => {
        core.status.hero.atk = 200;
        core.status.hero.def = 200;
        core.setBlock(201, 12, 7, "MT2");
        const moving = core.getBlock(12, 7, "MT2", false);
        moving.opacity = 0.66;
        moving.event.event = [{ type: "tip", text: "保留的块事件" }];
        const moved = core.plugin.cubeWorld.relocateBlock(
            { floorId: "MT2", x: 12, y: 7 },
            { floorId: "MT0", x: 0, y: 7, direction: "right" }
        );
        const placed = core.getBlock(0, 7, "MT0", false);
        core.removeBlock(12, 8, "MT2");
        core.removeBlock(0, 8, "MT0");
        core.setBlock(133, 12, 8, "MT2");
        const orientedMoved = core.plugin.cubeWorld.relocateBlock(
            { floorId: "MT2", x: 12, y: 8 },
            { floorId: "MT0", x: 0, y: 8, direction: "left" }
        );
        const oriented = core.getBlock(0, 8, "MT0", false);
        core.setBlock(201, 0, 6, "MT3");
        core.setHeroLoc("direction", "right", true);
        return {
            moved, opacity: placed.opacity, event: placed.event.event,
            orientedMoved, orientedId: oriented.event.id, orientedNumber: oriented.id,
            orientedMapNumber: core.getMapNumber(0, 8, "MT0", true)
        };
    });
    expect(metadata).toEqual({
        moved: true, opacity: 0.66, event: [{ type: "tip", text: "保留的块事件" }],
        orientedMoved: true, orientedId: "npc1", orientedNumber: 134, orientedMapNumber: 134
    });
    await moveOnce(page);
    const state = await page.evaluate(() => ({
        floorId: core.status.floorId,
        loc: core.clone(core.status.hero.loc),
        target: core.getBlockId(0, 6, "MT3"),
        route: core.status.route.slice(-1)[0]
    }));
    expect(state.floorId).toBe("MT3");
    expect(state.loc).toMatchObject({ x: 0, y: 6, direction: "right" });
    expect(state.target).toBeNull();
    expect(state.route).toBe("right");
});

test("跨面道具、NPC 与破墙镐遵循本层同等语义", async ({ page }) => {
    await bootGame(page);
    await changeFloor(page, "MT4", { x: 12, y: 9, direction: "right" });
    const atkBefore = await page.evaluate(() => {
        core.setBlock(27, 3, 0, "MT3");
        core.setHeroLoc("direction", "right", true);
        return core.status.hero.atk;
    });
    await moveOnce(page);
    let state = await page.evaluate(() => ({
        floorId: core.status.floorId, loc: core.clone(core.status.hero.loc),
        atk: core.status.hero.atk, block: core.getBlockId(3, 0, "MT3")
    }));
    expect(state.floorId).toBe("MT3");
    expect(state.loc).toMatchObject({ x: 3, y: 0, direction: "down" });
    expect(state.atk).toBe(atkBefore + 4);
    expect(state.block).toBeNull();

    await changeFloor(page, "MT4", { x: 12, y: 9, direction: "right" });
    await page.evaluate(() => {
        core.setBlock(129, 3, 0, "MT3");
        core.getBlock(3, 0, "MT3", false).event.event = [{
            type: "function",
            "function": "function(){core.setFlag('remoteNpc',true);core.removeBlock(3,0,'MT3');}"
        }];
        core.setHeroLoc("direction", "right", true);
    });
    await moveOnce(page);
    state = await page.evaluate(() => ({ floorId: core.status.floorId, flag: core.getFlag("remoteNpc"), block: core.getBlockId(3, 0, "MT3") }));
    expect(state).toEqual({ floorId: "MT3", flag: true, block: null });

    await changeFloor(page, "MT4", { x: 12, y: 9, direction: "right" });
    const canUsePickaxe = await page.evaluate(() => {
        core.setBlock(1, 3, 0, "MT3");
        core.status.hero.items.tools.pickaxe = 1;
        core.setHeroLoc("direction", "right", true);
        return core.canUseItem("pickaxe");
    });
    expect(canUsePickaxe).toBe(true);
    await page.evaluate(() => new Promise((resolve) => core.useItem("pickaxe", false, resolve)));
    state = await page.evaluate(() => ({
        floorId: core.status.floorId, block: core.getBlockId(3, 0, "MT3"),
        pickaxe: core.itemCount("pickaxe"), route: core.status.route.slice(-1)[0]
    }));
    expect(state).toEqual({ floorId: "MT4", block: null, pickaxe: 0, route: "item:pickaxe" });

    await changeFloor(page, "MT4", { x: 12, y: 9, direction: "right" });
    const canUseIcePickaxe = await page.evaluate(() => {
        core.setBlock(6, 3, 0, "MT3");
        core.floors.MT3.afterOpenDoor["3,0"] = [{
            type: "function", "function": "function(){core.setFlag('remoteIceOpened',true);}"
        }];
        core.status.hero.items.tools.icePickaxe = 1;
        core.setHeroLoc("direction", "right", true);
        return core.canUseItem("icePickaxe");
    });
    expect(canUseIcePickaxe).toBe(true);
    await page.evaluate(() => new Promise((resolve) => core.useItem("icePickaxe", false, resolve)));
    await expect.poll(() => page.evaluate(() => core.getFlag("remoteIceOpened"))).toBe(true);
    state = await page.evaluate(() => ({
        floorId: core.status.floorId, block: core.getBlockId(3, 0, "MT3"),
        icePickaxe: core.itemCount("icePickaxe"), route: core.status.route.slice(-1)[0]
    }));
    expect(state).toEqual({ floorId: "MT4", block: null, icePickaxe: 0, route: "item:icePickaxe" });
});

test("激光与追猎在旋转边后继续沿真实表面直线，目标格不重复计伤", async ({ page }) => {
    await bootGame(page);
    const result = await page.evaluate(() => {
        for (const floorId of core.plugin.cubeWorld.faces) {
            core.extractBlocks(floorId);
            core.status.maps[floorId].blocks.slice().forEach((block) => {
                if (["grayPriest", "tulipFairy", "keiskeiFairy"].includes(block.event.id)) {
                    core.removeBlock(block.x, block.y, floorId);
                }
            });
        }
        core.setBlock(279, 0, 0, "MT2");
        core.setBlock(325, 1, 0, "MT2");
        const check = core.plugin.cubeWorld.buildCheckBlock("MT4");
        const chase = check.chase["1,1"] || [];
        return {
            laser0: check.damage["0,0"],
            laser1: check.damage["1,0"],
            laser2: check.damage["2,0"],
            chase: chase.map((one) => ({ source: one.source, destination: one.destination, distance: one.distance }))
        };
    });
    expect(result.laser0).toBe(30);
    expect(result.laser1).toBe(30);
    expect(result.laser2).toBe(30);
    expect(result.chase).toContainEqual(expect.objectContaining({
        source: expect.objectContaining({ floorId: "MT2", x: 1, y: 0 }),
        destination: expect.objectContaining({ floorId: "MT4", x: 0, y: 1, direction: "right" })
    }));
});

test("跨面光环与支援携带来源楼层，底面清怪后四扇机关门全部开启", async ({ page }) => {
    await bootGame(page);
    const mechanics = await page.evaluate(() => {
        for (const floorId of core.plugin.cubeWorld.faces) {
            core.extractBlocks(floorId);
            core.status.maps[floorId].blocks.slice().forEach((block) => {
                if (["goldSlime", "watcherSlime", "silverSlime"].includes(block.event.id)) core.removeBlock(block.x, block.y, floorId);
            });
        }
        core.setBlock(233, 12, 6, "MT2");
        core.setBlock(248, 12, 5, "MT2");
        core.setBlock(201, 0, 5, "MT0");
        const info = core.getEnemyInfo("greenSlime", null, 0, 5, "MT0");
        return { hp: info.hp, atk: info.atk, def: info.def, guards: info.guards };
    });
    expect(mechanics.hp).toBe(44);
    expect(mechanics.atk).toBe(25);
    expect(mechanics.def).toBe(3);
    expect(mechanics.guards).toContainEqual(expect.objectContaining({ floorId: "MT2", x: 12, y: 5, id: "silverSlime" }));

    await page.evaluate(() => {
        core.extractBlocks("MT5");
        core.status.maps.MT5.blocks.slice().forEach((block) => {
            if (["bluePriest", "rock"].includes(block.event.id)) core.removeBlock(block.x, block.y, "MT5");
        });
        core.plugin.cubeWorld.openDoorsWhenClear("MT5", ["bluePriest", "rock"], [[6, 4], [4, 6], [8, 6], [6, 8]]);
    });
    await page.waitForFunction(() => [[6, 4], [4, 6], [8, 6], [6, 8]].every(([x, y]) => !core.getBlock(x, y, "MT5")));
});

test("跨面夹击随生命实时重算，阻击怪可完整搬运到相邻面，吸噬接入战斗公式", async ({ page }) => {
    await bootGame(page);
    const result = await page.evaluate(() => {
        core.setFlag("no_zone", true);
        core.setFlag("no_laser", true);
        core.setFlag("no_chase", true);
        core.setFlag("no_ambush", true);
        core.setBlock(250, 12, 6, "MT2");
        core.setBlock(250, 1, 6, "MT0");
        core.status.hero.hp = 1000;
        const damage1000 = core.plugin.cubeWorld.buildCheckBlock("MT0").damage["0,6"];
        core.status.hero.hp = 800;
        const damage800 = core.plugin.cubeWorld.buildCheckBlock("MT0").damage["0,6"];

        core.setBlock(326, 12, 5, "MT4");
        core.removeBlock(7, 0, "MT3");
        const repulseInfo = core.plugin.cubeWorld.buildCheckBlock("MT4");
        const record = (repulseInfo.repulse["11,5"] || []).find((one) => one.source.floorId === "MT4" && one.source.x === 12);
        const moved = core.plugin.cubeWorld.executeMonsterMove(record);
        const placed = core.getBlockId(7, 0, "MT3");

        core.status.hero.hp = 12000;
        const absorb = core.getDamageInfo("xishiFairy", { hp: 12000, atk: 100, def: 0, mdef: 0 });
        return { damage1000, damage800, moved, placed, absorb: { mon_hp: absorb.mon_hp, turn: absorb.turn } };
    });
    expect(result.damage1000).toBe(500);
    expect(result.damage800).toBe(400);
    expect(result.moved).toBe(true);
    expect(result.placed).toBe("tulipFairy");
    expect(result.absorb).toEqual({ mon_hp: 350, turn: 6 });
});

test("移动端方向键可见并把触控按下/抬起映射为引擎方向输入", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await bootGame(page);
    const pad = page.locator("#cube-mobile-pad");
    await expect(pad).toBeVisible();
    await expect(pad.locator("button")).toHaveCount(4);
    await pad.locator('[data-dir="right"]').dispatchEvent("pointerdown", { pointerId: 1, pointerType: "touch", isPrimary: true });
    await pad.locator('[data-dir="right"]').dispatchEvent("pointerup", { pointerId: 1, pointerType: "touch", isPrimary: true });
    await expect.poll(() => page.evaluate(() => core.status.route.includes("right"))).toBe(true);
});
