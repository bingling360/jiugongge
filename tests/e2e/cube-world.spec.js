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

test("3D 总览保持等边正方体，并能连续越过顶面和底面旋转", async ({ page }) => {
    await bootGame(page);
    await page.evaluate(() => core.keyUp(67));
    await expect(page.locator("#cube-world-overlay")).toBeVisible();
    const frame = page.frameLocator("#cube-world-frame");
    await expect(frame.locator("#cube")).toBeVisible();

    const geometry = await frame.locator("#cube").evaluate((cube) => {
        const matrix = new DOMMatrix(getComputedStyle(cube).transform);
        const origin = new DOMPoint(0, 0, 0).matrixTransform(matrix);
        const edge = (x, y, z) => {
            const end = new DOMPoint(x, y, z).matrixTransform(matrix);
            const vector = { x: end.x - origin.x, y: end.y - origin.y, z: end.z - origin.z };
            return {
                spatial: Math.hypot(vector.x, vector.y, vector.z),
                projected: Math.hypot(vector.x, vector.y)
            };
        };
        const faces = Array.from(document.querySelectorAll(".face"), (face) => {
            const style = getComputedStyle(face);
            const canvas = face.querySelector("canvas");
            const faceMatrix = new DOMMatrix(style.transform);
            const center = new DOMPoint(0, 0, 0).matrixTransform(faceMatrix);
            const combined = matrix.multiply(faceMatrix);
            const half = parseFloat(style.width) / 2;
            const points = [[-half, -half], [half, -half], [half, half], [-half, half]].map(([x, y]) => {
                const point = new DOMPoint(x, y, 0).matrixTransform(combined);
                return { x: point.x, y: point.y };
            });
            const vector = (from, to) => ({ x: to.x - from.x, y: to.y - from.y });
            const parallelError = (left, right) => Math.abs(left.x * right.y - left.y * right.x) /
                (Math.hypot(left.x, left.y) * Math.hypot(right.x, right.y));
            return {
                width: parseFloat(style.width), height: parseFloat(style.height),
                canvasWidth: canvas.width, canvasHeight: canvas.height,
                backfaceVisibility: style.backfaceVisibility,
                centerRadius: Math.hypot(center.x, center.y, center.z),
                oppositeEdgeErrors: [
                    parallelError(vector(points[0], points[1]), vector(points[3], points[2])),
                    parallelError(vector(points[0], points[3]), vector(points[1], points[2]))
                ]
            };
        });
        return {
            perspective: getComputedStyle(document.getElementById("scene")).perspective,
            axes: [edge(1, 0, 0), edge(0, 1, 0), edge(0, 0, 1)],
            faces
        };
    });

    expect(geometry.perspective).toBe("none");
    expect(geometry.faces).toHaveLength(6);
    for (const face of geometry.faces) {
        expect(face.width).toBeCloseTo(face.height, 6);
        expect(face.canvasWidth).toBe(face.canvasHeight);
        expect(face.backfaceVisibility).toBe("hidden");
        // CSS 像素布局会将 vmin 结果量化到约 1/64px；这里只容许该级别的舍入误差。
        expect(Math.abs(face.centerRadius - face.width / 2)).toBeLessThan(0.01);
        expect(Math.max(...face.oppositeEdgeErrors)).toBeLessThan(1e-12);
    }
    const spatialLengths = geometry.axes.map((axis) => axis.spatial);
    const projectedLengths = geometry.axes.map((axis) => axis.projected);
    expect(Math.max(...spatialLengths) - Math.min(...spatialLengths)).toBeLessThan(1e-6);
    expect(Math.max(...projectedLengths) - Math.min(...projectedLengths)).toBeLessThan(1e-6);

    // 六个快捷观察按钮也必须把对应面的外法线准确转向观察者。
    for (let index = 0; index < 6; index++) {
        const floorId = `MT${index}`;
        await frame.locator(`[data-face="${floorId}"]`).click();
        const normal = await frame.locator(`.face[data-floor="${floorId}"]`).evaluate((face) => {
            const cubeMatrix = new DOMMatrix(getComputedStyle(document.getElementById("cube")).transform);
            const faceMatrix = new DOMMatrix(getComputedStyle(face).transform);
            const result = new DOMPoint(0, 0, 1, 0).matrixTransform(cubeMatrix.multiply(faceMatrix));
            const length = Math.hypot(result.x, result.y, result.z);
            return { x: result.x / length, y: result.y / length, z: result.z / length };
        });
        expect(normal.x).toBeCloseTo(0, 6);
        expect(normal.y).toBeCloseTo(0, 6);
        expect(normal.z).toBeCloseTo(1, 6);
    }
    await frame.locator("#reset").click();

    const quaternion = () => frame.locator("body").evaluate(() => CubeViewer.getViewState().quaternion);
    const angularDistance = (left, right) => {
        const dot = Math.abs(left.reduce((sum, value, index) => sum + value * right[index], 0));
        return 2 * Math.acos(Math.min(1, dot));
    };
    const sceneBox = await frame.locator("#scene").boundingBox();
    const dragAcrossPole = async () => {
        const x = sceneBox.x + sceneBox.width / 2;
        const startY = sceneBox.y + sceneBox.height * 0.24;
        const endY = sceneBox.y + sceneBox.height * 0.76;
        await page.mouse.move(x, startY);
        await page.mouse.down();
        await page.mouse.move(x, endY, { steps: 12 });
        await page.mouse.up();
    };

    const before = await quaternion();
    await dragAcrossPole();
    const afterFirstCrossing = await quaternion();
    await dragAcrossPole();
    const afterSecondCrossing = await quaternion();
    expect(angularDistance(before, afterFirstCrossing)).toBeGreaterThan(1);
    expect(angularDistance(afterFirstCrossing, afterSecondCrossing)).toBeGreaterThan(1);
    const dynamicAxisLengths = await frame.locator("#cube").evaluate((cube) => {
        const matrix = new DOMMatrix(getComputedStyle(cube).transform);
        const origin = new DOMPoint(0, 0, 0).matrixTransform(matrix);
        return [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map(([x, y, z]) => {
            const end = new DOMPoint(x, y, z).matrixTransform(matrix);
            return Math.hypot(end.x - origin.x, end.y - origin.y, end.z - origin.z);
        });
    });
    expect(Math.max(...dynamicAxisLengths) - Math.min(...dynamicAxisLengths)).toBeLessThan(1e-6);
    await expect(frame.locator("#scene")).not.toHaveClass(/dragging/);
    expect(await frame.locator("body").evaluate(() => CubeViewer.getViewState().pointerCount)).toBe(0);

    // 关闭后再次打开必须重新导航，不能继续复用可能带旧透视参数的 iframe。
    const firstViewerUrl = await frame.locator("body").evaluate(() => location.href);
    await frame.locator("body").evaluate(() => { document.body.dataset.staleViewerProbe = "true"; });
    await page.evaluate(() => core.plugin.cubeWorld.closeViewer());
    await expect(page.locator("#cube-world-overlay")).toBeHidden();
    await page.evaluate(() => core.plugin.cubeWorld.openViewer());
    await expect(page.locator("#cube-world-overlay")).toBeVisible();
    await expect(frame.locator("body")).not.toHaveAttribute("data-stale-viewer-probe", "true");
    const secondViewerUrl = await frame.locator("body").evaluate(() => location.href);
    expect(secondViewerUrl).not.toBe(firstViewerUrl);
    expect(secondViewerUrl).toContain("&open=");
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
    await expect.poll(() => page.evaluate(() => ({
        key: core.itemCount("yellowKey"), target: core.getBlockId(3, 0, "MT3")
    }))).toEqual({ key: 4, target: null });
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

test("跨面普通墙复用面内碰触语义，不会误走开门管线", async ({ page }) => {
    await bootGame(page);
    await changeFloor(page, "MT4", { x: 10, y: 9, direction: "right" });
    const mapExample = await page.evaluate(() => {
        // 对照组：本层右侧是一堵普通黄墙。
        core.setBlock(1, 11, 9, "MT4");
        // 实验组：MT4(12,9) 向右跨面后的落点 MT3(3,0) 也是同一种墙。
        core.setBlock(1, 3, 0, "MT3");
        const describe = (x, y, floorId) => {
            const block = core.getBlock(x, y, floorId);
            return {
                floorId, x, y, number: block.id, id: block.event.id,
                trigger: block.event.trigger || null,
                hasDoorInfo: !!block.event.doorInfo
            };
        };

        window.__crossWallOpenDoorCalls = [];
        window.__crossWallOriginalOpenDoor = core.openDoor;
        core.openDoor = function (x, y, needKey, callback, floorId) {
            window.__crossWallOpenDoorCalls.push({ x, y, needKey, floorId });
            return window.__crossWallOriginalOpenDoor.apply(this, arguments);
        };
        core.setHeroLoc("direction", "right", true);
        return {
            sameFloorWall: describe(11, 9, "MT4"),
            crossFloorWall: describe(3, 0, "MT3")
        };
    });
    expect(mapExample).toEqual({
        sameFloorWall: {
            floorId: "MT4", x: 11, y: 9, number: 1, id: "yellowWall",
            trigger: null, hasDoorInfo: true
        },
        crossFloorWall: {
            floorId: "MT3", x: 3, y: 0, number: 1, id: "yellowWall",
            trigger: null, hasDoorInfo: true
        }
    });

    await moveOnce(page);
    const sameFloor = await page.evaluate(() => ({
        floorId: core.status.floorId,
        loc: core.clone(core.status.hero.loc),
        target: core.getBlockId(11, 9, "MT4"),
        openDoorCalls: core.clone(window.__crossWallOpenDoorCalls)
    }));
    expect(sameFloor).toEqual({
        floorId: "MT4",
        loc: { x: 10, y: 9, direction: "right" },
        target: "yellowWall",
        openDoorCalls: []
    });

    await changeFloor(page, "MT4", { x: 12, y: 9, direction: "right" });
    await page.evaluate(() => core.setHeroLoc("direction", "right", true));
    await moveOnce(page);
    const crossFloor = await page.evaluate(() => {
        const state = {
            floorId: core.status.floorId,
            loc: core.clone(core.status.hero.loc),
            target: core.getBlockId(3, 0, "MT3"),
            openDoorCalls: core.clone(window.__crossWallOpenDoorCalls)
        };
        core.openDoor = window.__crossWallOriginalOpenDoor;
        delete window.__crossWallOriginalOpenDoor;
        delete window.__crossWallOpenDoorCalls;
        return state;
    });

    expect(crossFloor).toEqual({
        floorId: "MT4",
        loc: { x: 12, y: 9, direction: "right" },
        target: "yellowWall",
        openDoorCalls: []
    });
});

test("跨旋转边后只重排地图格，素材保持正向且没有旋转动画", async ({ page }) => {
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
        heroScreenCell: core.plugin.cubeWorld.logicalCellToScreen(core.getHeroLoc("x"), core.getHeroLoc("y")),
        stageExists: !!document.getElementById("cube-world-stage"),
        bgParent: document.getElementById("bg").parentElement.id,
        uiParent: document.getElementById("ui").parentElement.id,
        worldCanvasStyles: ["bg", "event", "hero", "event2", "fg", "damage", "animate"].map((id) => {
            const node = document.getElementById(id);
            const style = getComputedStyle(node);
            const matrix = style.transform === "none" ? new DOMMatrix() : new DOMMatrix(style.transform);
            return {
                id, inlineTransform: node.style.transform,
                rotationTerms: [matrix.b, matrix.c],
                transitionDuration: style.transitionDuration
            };
        }),
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
        quarter: 3, screenDirection: "right", heroScreenCell: { x: 0, y: 9 },
        stageExists: false, bgParent: "gameDraw", uiParent: "gameDraw",
        dynamicParents: ["gameDraw", "gameDraw"]
    });
    expect(state.worldCanvasStyles.every((one) => !one.inlineTransform.includes("rotate"))).toBe(true);
    expect(state.worldCanvasStyles.every((one) => one.rotationTerms.every((value) => Math.abs(value) < 1e-9))).toBe(true);
    expect(state.worldCanvasStyles.every((one) => one.transitionDuration === "0s")).toBe(true);

    // 全量绘制先生成一张标准投影地图。逻辑格 (4,0) 的黄钥匙应进入
    // 屏幕格 (0,8)，并由原生绘制完整复制素材像素，而不是旋转画布。
    const pixels = await page.evaluate(() => {
        const block = core.getBlock(4, 0);
        const blockInfo = core.getBlockInfo(block);
        const source = document.createElement("canvas");
        source.width = source.height = 32;
        const sourceCtx = source.getContext("2d");
        sourceCtx.drawImage(blockInfo.image,
            blockInfo.posX * 32, blockInfo.posY * blockInfo.height + blockInfo.height - 32,
            32, 32, 0, 0, 32, 32);

        const target = core.plugin.cubeWorld.logicalCellToScreen(4, 0);
        const projection = core.plugin.cubeWorld.buildMapProjection();
        const actual = core.canvas.event.getImageData(target.x * 32, target.y * 32, 32, 32).data;
        const expected = sourceCtx.getImageData(0, 0, 32, 32).data;
        const canonical = core.canvas.event.getImageData(4 * 32, 0, 32, 32).data;
        let equal = actual.length === expected.length;
        for (let i = 0; equal && i < actual.length; i++) equal = actual[i] === expected[i];
        const canonicalAlpha = Array.from(canonical).filter((_, index) => index % 4 === 3)
            .reduce((sum, value) => sum + value, 0);
        return {
            target, equal, canonicalAlpha,
            projectionHasBlock: projection.blocks.some((one) =>
                one.x === target.x && one.y === target.y && one.id === block.id)
        };
    });
    expect(pixels).toEqual({
        target: { x: 0, y: 8 }, equal: true, canonicalAlpha: 0, projectionHasBlock: true
    });

    // 地图布局处于四分之三转朝向；继续按屏幕“右”应换算成逻辑“下”。
    await expect.poll(() => page.evaluate(() =>
        !core.status.lockControl && !core.status.event.id
    )).toBe(true);
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => page.evaluate(() => core.getHeroLoc("y"))).toBe(1);
    state = await page.evaluate(() => ({
        loc: core.clone(core.status.hero.loc),
        route: core.status.route.slice(-1)[0]
    }));
    expect(state).toMatchObject({ loc: { x: 3, y: 1, direction: "down" }, route: "down" });

    // 输入分发保留屏幕坐标给 UI，仅在地图寻路处理器边界换成逻辑格；
    // 手势提示点也必须留在实际按下的屏幕格。
    const touchInput = await page.evaluate(() => {
        core.clearMap("ui");
        let raw = null;
        const marks = [];
        const originalFillRect = core.fillRect;
        core.fillRect = function (ctx, x, y, width, height) {
            if (ctx === "ui" && width === 8 && height === 8) marks.push({ x, y });
            return originalFillRect.apply(this, arguments);
        };
        core.registerAction("ondown", "cube-input-probe", (x, y, px, py) => {
            raw = { x, y, px, py };
            return false;
        }, 10);
        const scale = core.domStyle.scale;
        core.actions.ondown({
            x: (2 * 32 + 16) * scale,
            y: (9 * 32 + 16) * scale,
            size: 32 * scale
        });
        core.unregisterAction("ondown", "cube-input-probe");
        core.fillRect = originalFillRect;
        const result = {
            raw,
            routeStart: core.clone(core.status.stepPostfix[0]),
            marks
        };
        clearTimeout(core.timeout.onDownTimeout);
        core.timeout.onDownTimeout = null;
        core.status.stepPostfix = [];
        core.status.downTime = null;
        core.clearMap("ui");
        return result;
    });
    expect(touchInput.raw).toEqual({ x: 2, y: 9, px: 80, py: 304 });
    expect(touchInput.routeStart).toEqual({ x: 3, y: 2 });
    expect(touchInput.marks.at(-1)).toEqual({ x: 76, y: 300 });

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
        core.plugin.cubeWorld.syncMapOrientation();
        core.loadData(data, () => resolve(quarter));
    }));
    expect(savedQuarter).toBe(3);
    await expect.poll(() => page.evaluate(() => core.plugin.cubeWorld.getViewQuarter())).toBe(3);
    await expect.poll(() => page.evaluate(() =>
        core.plugin.cubeWorld.logicalCellToScreen(core.getHeroLoc("x"), core.getHeroLoc("y"))
    )).toEqual({ x: 2, y: 9 });
    await expect(page.locator("#cube-world-stage")).toHaveCount(0);

    // 增量拾取/删除也必须清理映射后的屏幕格，不能在原逻辑位置误清。
    const removedItem = await page.evaluate(() => {
        const cell = core.plugin.cubeWorld.logicalCellToScreen(4, 0);
        const alphaAt = () => Array.from(core.canvas.event.getImageData(
            cell.x * 32, cell.y * 32, 32, 32
        ).data).filter((_, index) => index % 4 === 3).reduce((sum, value) => sum + value, 0);
        const before = alphaAt();
        core.removeBlock(4, 0);
        return { before, after: alphaAt() };
    });
    expect(removedItem.before).toBeGreaterThan(0);
    expect(removedItem.after).toBe(0);
});

test("旋转朝向下本面战斗结束后不会残留怪物、显伤或动画虚影", async ({ page }) => {
    await bootGame(page);
    await changeFloor(page, "MT4", { x: 12, y: 9, direction: "right" });
    await page.evaluate(() => {
        core.extractBlocks("MT3");
        core.removeBlockByIndexes(core.status.maps.MT3.blocks.map((_, index) => index), "MT3");
        core.setHeroLoc("direction", "right", true);
    });
    await moveOnce(page);

    const correspondence = await page.evaluate(() => {
        const logical = { x: 3, y: 1 };
        const screen = core.plugin.cubeWorld.logicalCellToScreen(logical.x, logical.y);

        const canonicalRefs = {
            blocks: core.status.maps.MT3.blocks,
            map: core.status.maps.MT3.map,
            images: core.status.maps.MT3.images,
            blockObjs: core.status.mapBlockObjs.MT3,
            bg: core.status.bgmaps.MT3,
            fg: core.status.fgmaps.MT3
        };
        core.redrawMap();
        const canonicalRestored =
            core.status.maps.MT3.blocks === canonicalRefs.blocks &&
            core.status.maps.MT3.map === canonicalRefs.map &&
            core.status.maps.MT3.images === canonicalRefs.images &&
            core.status.mapBlockObjs.MT3 === canonicalRefs.blockObjs &&
            core.status.bgmaps.MT3 === canonicalRefs.bg &&
            core.status.fgmaps.MT3 === canonicalRefs.fg;

        // 动态地图叠加层必须使用与标准地图相同的格映射。
        const itemStart = core.plugin.pickOneMapItemAnimate("redPotion", logical.x, logical.y);
        core.plugin.clearAttractAnimate();
        core.setFlag("comment", true);
        core.setFlag("commentCollection", { MT3: { "3,1": ["probe"] } });
        let signCall = null;
        const originalDrawIcon = core.drawIcon;
        core.drawIcon = function (ctx, id, x, y) {
            if (ctx === "sign" && id === "postman") signCall = { x, y };
            return originalDrawIcon.apply(this, arguments);
        };
        core.plugin.drawCommentSign();
        core.drawIcon = originalDrawIcon;
        core.plugin.clearCommentSign();
        core.removeFlag("comment");
        core.removeFlag("commentCollection");

        // 楼层贴图显隐键属于规范坐标，不能被投影后碰巧同名的 flag 误伤。
        const probeName = "__cube_floor_probe__.png";
        const probe = document.createElement("canvas");
        probe.width = probe.height = 32;
        probe.getContext("2d").fillStyle = "#ff00ff";
        probe.getContext("2d").fillRect(0, 0, 32, 32);
        core.material.images.images[probeName] = probe;
        const oldImages = core.status.maps.MT3.images;
        core.status.maps.MT3.images = [{
            name: probeName, x: logical.x * 32, y: logical.y * 32, canvas: "fg"
        }];
        const sourceFlag = `__floorImg__MT3_${logical.x * 32}_${logical.y * 32}`;
        const collisionFlag = `__floorImg__MT3_${screen.x * 32}_${screen.y * 32}`;
        core.removeFlag(sourceFlag);
        core.setFlag(collisionFlag, true);
        core.redrawMap();
        const visibleColor = Array.from(core.canvas.fg.getImageData(
            screen.x * 32 + 16, screen.y * 32 + 16, 1, 1
        ).data);
        core.setFlag(sourceFlag, true);
        core.redrawMap();
        const hiddenColor = Array.from(core.canvas.fg.getImageData(
            screen.x * 32 + 16, screen.y * 32 + 16, 1, 1
        ).data);
        core.status.maps.MT3.images = oldImages;
        delete core.material.images.images[probeName];
        core.removeFlag(sourceFlag);
        core.removeFlag(collisionFlag);
        core.redrawMap();

        // 可选的 bg2/fg2 也属于标准投影，不允许留在规范数组坐标。
        const hadBg2Maps = Object.prototype.hasOwnProperty.call(core.status, "bg2maps");
        const oldBg2Maps = core.status.bg2maps;
        const bg2 = Array.from({ length: 13 }, () => Array(13).fill(0));
        const redPotion = core.getNumberById("redPotion");
        bg2[logical.y][logical.x] = redPotion;
        core.status.bg2maps = Object.assign({}, oldBg2Maps || {}, { MT3: bg2 });
        const layerProjection = core.plugin.cubeWorld.buildMapProjection();
        const projectedBg2 = layerProjection.layerMaps.bg2[screen.y][screen.x];
        if (hadBg2Maps) core.status.bg2maps = oldBg2Maps;
        else delete core.status.bg2maps;

        // 跳跃的地图路径随朝向变化，但抬升始终是屏幕竖直方向。
        const hero = core.clone(core.status.hero.loc);
        const heroScreen = core.plugin.cubeWorld.logicalCellToScreen(hero.x, hero.y);
        const jump = core.maps.__generateJumpInfo(hero.x, hero.y, hero.x, hero.y + 2, 500);
        jump.width = core.material.icons.hero.width || 32;
        jump.height = core.material.icons.hero.height;
        const half = Math.floor(jump.jump_count / 2);
        for (let i = 0; i < half; i++) core.events._jumpHero_jumping(jump);
        const jumpCenter = { ...core.status.heroCenter };
        const standingCenter = {
            px: heroScreen.x * 32 + 16,
            py: heroScreen.y * 32 + 32 - core.material.icons.hero.height / 2
        };
        core.drawHero();

        return {
            screen, itemStart, signCall, visibleColor, hiddenColor,
            projectedBg2, redPotion, jumpCenter, standingCenter, canonicalRestored
        };
    });
    expect(correspondence).toMatchObject({
        screen: { x: 1, y: 9 },
        itemStart: { x: 32, y: 288 },
        signCall: { x: 32, y: 288 },
        canonicalRestored: true
    });
    expect(correspondence.visibleColor).toEqual([255, 0, 255, 255]);
    expect(correspondence.hiddenColor).not.toEqual([255, 0, 255, 255]);
    expect(correspondence.projectedBg2).toBe(correspondence.redPotion);
    expect(correspondence.jumpCenter.px).toBeGreaterThan(correspondence.standingCenter.px);
    expect(correspondence.jumpCenter.py).toBeLessThan(correspondence.standingCenter.py);

    const skipPerform = await page.evaluate(() => {
        core.setLocalStorage("skipPerform", true);
        core.plugin.checkSkipFuncs();
        const before = core.status.animateObjs.length;
        const id = core.drawAnimate("hand", 3, 1);
        const after = core.status.animateObjs.length;
        core.setLocalStorage("skipPerform", false);
        core.plugin.checkSkipFuncs();
        return { id, before, after };
    });
    expect(skipPerform).toEqual({ id: -1, before: 0, after: 0 });

    await page.evaluate(() => {
        // 玩法设置会重新绑定动画实现；重绑定后仍必须保留六面投影。
        core.setLocalStorage("skipPerform", false);
        core.plugin.checkSkipFuncs();
        core.status.hero.atk = 9999;
        core.status.hero.def = 9999;
        core.setBlock(201, 3, 1, "MT3");
        core.setHeroLoc("direction", "down", true);
        core.updateStatusBar();
    });
    await expect.poll(() => page.evaluate(() => {
        const cell = core.plugin.cubeWorld.logicalCellToScreen(3, 1);
        return core.status.globalAnimateObjs.some((block) => block.x === cell.x && block.y === cell.y);
    })).toBe(true);
    const placement = await page.evaluate(() => {
        const cell = core.plugin.cubeWorld.logicalCellToScreen(3, 1);
        const alpha = (x, y) => Array.from(core.canvas.event.getImageData(
            x * 32, y * 32, 32, 32
        ).data).filter((_, index) => index % 4 === 3).reduce((sum, value) => sum + value, 0);
        return {
            cell,
            projected: alpha(cell.x, cell.y),
            canonical: alpha(3, 1),
            total: Array.from(core.canvas.event.getImageData(
                0, 0, core.__PIXELS__, core.__PIXELS__
            ).data).filter((_, index) => index % 4 === 3).reduce((sum, value) => sum + value, 0),
            animateCells: core.status.globalAnimateObjs.map((block) => ({ x: block.x, y: block.y }))
        };
    });
    expect(placement.cell).toEqual({ x: 1, y: 9 });
    expect(placement.projected).toBeGreaterThan(0);
    expect(placement.canonical).toBe(0);
    expect(placement.total).toBe(placement.projected);
    expect(placement.animateCells).toEqual([{ x: 1, y: 9 }]);

    const windowAnimation = await page.evaluate(() => {
        const id = core.drawAnimate("hand", 3, 1, true);
        const obj = core.status.animateObjs.find((one) => one.id === id);
        const center = { centerX: obj.centerX, centerY: obj.centerY };
        core.stopAnimate(id, false);
        return center;
    });
    expect(windowAnimation).toEqual({ centerX: 112, centerY: 48 });

    await page.evaluate(() => {
        window.__cubeOriginalRedrawMap = core.maps.redrawMap;
        window.__cubeOriginalDrawAnimateFrame = core.maps._drawAnimateFrame;
        window.__cubeRedrawCount = 0;
        window.__cubeAnimateCenters = [];
        core.maps.redrawMap = function () {
            window.__cubeRedrawCount++;
            return window.__cubeOriginalRedrawMap.apply(this, arguments);
        };
        core.maps._drawAnimateFrame = function (name, animate, centerX, centerY, index) {
            window.__cubeAnimateCenters.push({ centerX, centerY, index });
            return window.__cubeOriginalDrawAnimateFrame.apply(this, arguments);
        };
    });
    await page.evaluate(() => new Promise((resolve) => {
        core.battle("greenSlime", 3, 1, false, resolve, "MT3");
    }));
    await expect.poll(() => page.evaluate(() => core.getBlockId(3, 1, "MT3"))).toBeNull();
    await expect.poll(() => page.evaluate(() => (core.status.animateObjs || []).length)).toBe(0);
    await expect.poll(() => page.evaluate(() => !core.status.lockControl && !core.status.event.id)).toBe(true);

    const residue = await page.evaluate(() => {
        const cell = core.plugin.cubeWorld.logicalCellToScreen(3, 1);
        const redraws = window.__cubeRedrawCount;
        const animateCenters = window.__cubeAnimateCenters;
        core.maps.redrawMap = window.__cubeOriginalRedrawMap;
        core.maps._drawAnimateFrame = window.__cubeOriginalDrawAnimateFrame;
        delete window.__cubeOriginalRedrawMap;
        delete window.__cubeOriginalDrawAnimateFrame;
        delete window.__cubeRedrawCount;
        delete window.__cubeAnimateCenters;
        const alpha = (id, x, y, width, height) => {
            const data = core.canvas[id].getImageData(x, y, width, height).data;
            let sum = 0;
            for (let i = 3; i < data.length; i += 4) sum += data[i];
            return sum;
        };
        return {
            quarter: core.plugin.cubeWorld.getViewQuarter(), redraws, animateCenters,
            cell,
            event: alpha("event", cell.x * 32, cell.y * 32, 32, 32),
            event2: alpha("event2", cell.x * 32, Math.max(0, cell.y * 32 - 32), 32, 64),
            canonicalEvent: alpha("event", 3 * 32, 1 * 32, 32, 32),
            canonicalEvent2: alpha("event2", 3 * 32, 0, 32, 64),
            totalEvent: alpha("event", 0, 0, core.__PIXELS__, core.__PIXELS__),
            totalEvent2: alpha("event2", 0, 0, core.__PIXELS__, core.__PIXELS__),
            damage: alpha("damage", cell.x * 32, cell.y * 32, 32, 32),
            animate: alpha("animate", 0, 0, core.__PIXELS__, core.__PIXELS__),
            globalAtProjected: core.status.globalAnimateObjs.filter((block) =>
                block.x === cell.x && block.y === cell.y).length,
            globalAtCanonical: core.status.globalAnimateObjs.filter((block) =>
                block.x === 3 && block.y === 1).length
        };
    });
    expect(residue).toMatchObject({
        quarter: 3, redraws: 0, cell: { x: 1, y: 9 },
        event: 0, event2: 0, canonicalEvent: 0, canonicalEvent2: 0,
        totalEvent: 0, totalEvent2: 0, damage: 0, animate: 0,
        globalAtProjected: 0, globalAtCanonical: 0
    });
    expect(residue.animateCenters.length).toBeGreaterThan(0);
    expect(residue.animateCenters.every((one) =>
        one.centerX === 48 && one.centerY === 304
    )).toBe(true);
});

test("跨面怪物复用面内战斗语义，胜利后下一次输入才进入目标格", async ({ page }) => {
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
    await expect.poll(() => page.evaluate(() => core.getBlockId(0, 6, "MT3"))).toBeNull();
    let state = await page.evaluate(() => ({
        floorId: core.status.floorId,
        loc: core.clone(core.status.hero.loc),
        target: core.getBlockId(0, 6, "MT3"),
        route: core.status.route.slice(-1)[0]
    }));
    expect(state.floorId).toBe("MT0");
    expect(state.loc).toMatchObject({ x: 12, y: 6, direction: "right" });
    expect(state.target).toBeNull();
    expect(state.route).toBe("right");

    await moveOnce(page);
    state = await page.evaluate(() => ({ floorId: core.status.floorId, loc: core.clone(core.status.hero.loc) }));
    expect(state.floorId).toBe("MT3");
    expect(state.loc).toMatchObject({ x: 0, y: 6, direction: "right" });
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
    await expect.poll(() => page.evaluate(() => ({
        flag: core.getFlag("remoteNpc"), block: core.getBlockId(3, 0, "MT3"),
        stable: !core.status.event.id && !core.status.lockControl
    }))).toEqual({ flag: true, block: null, stable: true });
    state = await page.evaluate(() => ({ floorId: core.status.floorId, flag: core.getFlag("remoteNpc"), block: core.getBlockId(3, 0, "MT3") }));
    expect(state).toEqual({ floorId: "MT4", flag: true, block: null });
    await moveOnce(page);
    state = await page.evaluate(() => ({ floorId: core.status.floorId, loc: core.clone(core.status.hero.loc) }));
    expect(state.floorId).toBe("MT3");
    expect(state.loc).toMatchObject({ x: 3, y: 0, direction: "down" });

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

test("跨面落点道具在到达事件队列中仍由原生触发且只结算一次", async ({ page }) => {
    await bootGame(page);
    await changeFloor(page, "MT4", { x: 12, y: 9, direction: "right" });
    const atkBefore = await page.evaluate(() => {
        core.floors.MT3.eachArrive = [
            { type: "sleep", time: 80 },
            {
                type: "function",
                "function": "function(){core.setFlag('crossArrivalCount',core.getFlag('crossArrivalCount',0)+1);}"
            }
        ];
        core.setBlock(27, 3, 0, "MT3");
        core.setHeroLoc("direction", "right", true);
        return core.status.hero.atk;
    });

    await moveOnce(page);
    await expect.poll(() => page.evaluate(() => ({
        floorId: core.status.floorId,
        arrivalCount: core.getFlag("crossArrivalCount", 0),
        atk: core.status.hero.atk,
        block: core.getBlockId(3, 0, "MT3"),
        stable: !core.status.event.id && !core.status.lockControl
    }))).toEqual({
        floorId: "MT3", arrivalCount: 1, atk: atkBefore + 4, block: null, stable: true
    });
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

test("追猎怪与普通物品在同面和跨面安全换位，双方块数据均保留", async ({ page }) => {
    await bootGame(page);
    const result = await page.evaluate(() => {
        [[4, 4], [5, 4], [6, 4]].forEach(([x, y]) => core.removeBlock(x, y, "MT0"));
        core.setBlock(325, 4, 4, "MT0");
        core.setBlock(21, 5, 4, "MT0");
        const sameMonster = core.getBlock(4, 4, "MT0", false);
        const sameItem = core.getBlock(5, 4, "MT0", false);
        core.setBlockOpacity(0.61, 4, 4, "MT0");
        sameMonster.chaseMarker = "same-monster";
        core.setBlockOpacity(0.37, 5, 4, "MT0");
        sameItem.swapMarker = "same-item";
        const sameRecord = (core.plugin.cubeWorld.buildCheckBlock("MT0").chase["6,4"] || [])
            .find((one) => one.source.floorId === "MT0" && one.source.x === 4 && one.source.y === 4);
        const sameDestination = sameRecord && core.clone(sameRecord.destination);
        const sameUsesSharedAction = core.control._checkBlock_chase([sameRecord]).some((action) =>
            String(action.function || "").includes("core.control._executeChaseMove"));
        const sameMoved = core.plugin.cubeWorld.executeMonsterMove(sameRecord);
        const sameSource = core.getBlock(4, 4, "MT0", false);
        const sameTarget = core.getBlock(5, 4, "MT0", false);

        [[1, 0]].forEach(([x, y]) => core.removeBlock(x, y, "MT2"));
        [[0, 1], [1, 1]].forEach(([x, y]) => core.removeBlock(x, y, "MT4"));
        core.setBlock(325, 1, 0, "MT2");
        core.setBlock(21, 0, 1, "MT4");
        const crossMonster = core.getBlock(1, 0, "MT2", false);
        const crossItem = core.getBlock(0, 1, "MT4", false);
        core.setBlockOpacity(0.73, 1, 0, "MT2");
        core.setBlockFilter({ hue: 30 }, 1, 0, "MT2");
        crossMonster.chaseMarker = "cross-monster";
        core.setEnemyOnPoint(1, 0, "MT2", "hp", 777, null, null, true);
        core.setBlockOpacity(0.46, 0, 1, "MT4");
        core.setBlockFilter({ blur: 1 }, 0, 1, "MT4");
        crossItem.swapMarker = "cross-item";
        crossItem.event.event = [{ type: "tip", text: "跨面换位后保留" }];
        const crossRecord = (core.plugin.cubeWorld.buildCheckBlock("MT4").chase["1,1"] || [])
            .find((one) => one.source.floorId === "MT2" && one.source.x === 1 && one.source.y === 0);
        const crossDestination = crossRecord && core.clone(crossRecord.destination);
        const crossUsesSharedAction = core.control._checkBlock_chase([crossRecord]).some((action) =>
            String(action.function || "").includes("core.control._executeChaseMove"));
        const crossMoved = core.plugin.cubeWorld.executeMonsterMove(crossRecord);
        const crossSource = core.getBlock(1, 0, "MT2", false);
        const crossTarget = core.getBlock(0, 1, "MT4", false);

        return {
            same: {
                destination: sameDestination, usesSharedAction: sameUsesSharedAction, moved: sameMoved,
                sourceId: sameSource && sameSource.event.id,
                sourceOpacity: sameSource && sameSource.opacity,
                sourceMarker: sameSource && sameSource.swapMarker,
                targetId: sameTarget && sameTarget.event.id,
                targetOpacity: sameTarget && sameTarget.opacity,
                targetMarker: sameTarget && sameTarget.chaseMarker
            },
            cross: {
                destination: crossDestination, usesSharedAction: crossUsesSharedAction, moved: crossMoved,
                sourceId: crossSource && crossSource.event.id,
                sourceNumber: core.getMapNumber(1, 0, "MT2", true),
                sourceOpacity: crossSource && crossSource.opacity,
                sourceOpacityFlag: core.maps._getBlockOpacityFromFlag("MT2", 1, 0),
                sourceFilter: crossSource && crossSource.filter,
                sourceFilterFlag: core.maps._getBlockFilterFromFlag("MT2", 1, 0),
                sourceMarker: crossSource && crossSource.swapMarker,
                sourceEvent: crossSource && crossSource.event.event,
                targetId: crossTarget && crossTarget.event.id,
                targetNumber: core.getMapNumber(0, 1, "MT4", true),
                targetOpacity: crossTarget && crossTarget.opacity,
                targetOpacityFlag: core.maps._getBlockOpacityFromFlag("MT4", 0, 1),
                targetFilter: crossTarget && crossTarget.filter,
                targetFilterFlag: core.maps._getBlockFilterFromFlag("MT4", 0, 1),
                targetMarker: crossTarget && crossTarget.chaseMarker,
                targetHp: core.getEnemyValue("keiskeiFairy", "hp", 0, 1, "MT4")
            }
        };
    });

    expect(result.same).toEqual({
        destination: { floorId: "MT0", x: 5, y: 4, direction: "right" }, usesSharedAction: true, moved: true,
        sourceId: "yellowKey", sourceOpacity: 0.37, sourceMarker: "same-item",
        targetId: "keiskeiFairy", targetOpacity: 0.61, targetMarker: "same-monster"
    });
    expect(result.cross).toEqual({
        destination: { floorId: "MT4", x: 0, y: 1, direction: "right" }, usesSharedAction: true, moved: true,
        sourceId: "yellowKey", sourceNumber: 21, sourceOpacity: 0.46, sourceOpacityFlag: 0.46,
        sourceFilter: { blur: 1 }, sourceFilterFlag: { blur: 1 }, sourceMarker: "cross-item",
        sourceEvent: [{ type: "tip", text: "跨面换位后保留" }],
        targetId: "keiskeiFairy", targetNumber: 325, targetOpacity: 0.73, targetOpacityFlag: 0.73,
        targetFilter: { hue: 30 }, targetFilterFlag: { hue: 30 },
        targetMarker: "cross-monster", targetHp: 777
    });
});

test("追猎和阻击拒绝事件块、隐藏块、过期记录与非法目标", async ({ page }) => {
    await bootGame(page);
    const result = await page.evaluate(() => {
        [[2, 2], [3, 2], [4, 2]].forEach(([x, y]) => core.removeBlock(x, y, "MT0"));
        core.setBlock(325, 2, 2, "MT0");
        core.setBlock(21, 3, 2, "MT0");
        core.getBlock(3, 2, "MT0", false).event.data = [{ type: "tip", text: "阻挡追猎" }];
        const check = core.plugin.cubeWorld.buildCheckBlock("MT0");
        const fromSource = (records) => (records || []).filter((one) =>
            one.source.floorId === "MT0" && one.source.x === 2 && one.source.y === 2);
        const atItem = fromSource(check.chase["3,2"]);
        const behindItem = fromSource(check.chase["4,2"]);
        const forgedChaseMoved = core.plugin.cubeWorld.executeMonsterMove({
            cube: true, kind: "chase", id: "keiskeiFairy",
            source: { floorId: "MT0", x: 2, y: 2 },
            destination: { floorId: "MT0", x: 3, y: 2, direction: "right" }
        });

        [[8, 8], [9, 8]].forEach(([x, y]) => core.removeBlock(x, y, "MT0"));
        core.setBlock(326, 8, 8, "MT0");
        core.setBlock(21, 9, 8, "MT0");
        const repulse = (core.plugin.cubeWorld.buildCheckBlock("MT0").repulse["7,8"] || [])
            .find((one) => one.source.floorId === "MT0" && one.source.x === 8 && one.source.y === 8);
        const repulseDestination = repulse && repulse.destination;
        const forgedRepulse = core.clone(repulse);
        forgedRepulse.destination = { floorId: "MT0", x: 9, y: 8, direction: "right" };
        const forgedRepulseMoved = core.plugin.cubeWorld.executeMonsterMove(forgedRepulse);

        [[10, 10], [11, 10]].forEach(([x, y]) => core.removeBlock(x, y, "MT0"));
        core.setBlock(325, 10, 10, "MT0");
        core.setBlock(21, 11, 10, "MT0");
        core.hideBlock(11, 10, "MT0");
        const hiddenMoved = core.plugin.cubeWorld.executeMonsterMove({
            cube: true, kind: "chase", id: "keiskeiFairy",
            source: { floorId: "MT0", x: 10, y: 10 },
            destination: { floorId: "MT0", x: 11, y: 10, direction: "right" }
        });
        const hiddenTarget = core.getBlock(11, 10, "MT0", true);

        [[6, 11], [7, 11]].forEach(([x, y]) => core.removeBlock(x, y, "MT0"));
        core.setBlock(326, 6, 11, "MT0");
        const staleRepulse = {
            cube: true, kind: "repulse", id: "tulipFairy",
            source: { floorId: "MT0", x: 6, y: 11 },
            destination: { floorId: "MT0", x: 7, y: 11, direction: "right" }
        };
        core.removeBlock(6, 11, "MT0");
        core.setBlock(21, 6, 11, "MT0");
        const staleRepulseMoved = core.plugin.cubeWorld.executeMonsterMove(staleRepulse);

        const hero = {
            floorId: core.status.floorId,
            x: core.getHeroLoc("x"), y: core.getHeroLoc("y")
        };
        const guardSource = hero.x === 0 && hero.y === 0
            ? { floorId: "MT0", x: 1, y: 0 }
            : { floorId: "MT0", x: 0, y: 0 };
        core.removeBlock(hero.x, hero.y, hero.floorId);
        core.removeBlock(guardSource.x, guardSource.y, guardSource.floorId);
        core.setBlock(325, guardSource.x, guardSource.y, guardSource.floorId);
        const intoHeroMoved = core.control._executeChaseMove({
            kind: "chase", id: "keiskeiFairy", source: guardSource,
            destination: { floorId: hero.floorId, x: hero.x, y: hero.y, direction: "right" }
        });
        const samePointExchanged = core.maps.exchangeBlocks(guardSource, guardSource, "left");
        const fractionalMoved = core.maps.relocateBlock(guardSource,
            { floorId: "MT0", x: 1.5, y: 1, direction: "right" });

        return {
            chase: {
                atItem: atItem.length, behindItem: behindItem.length, forgedMoved: forgedChaseMoved,
                sourceId: core.getBlockId(2, 2, "MT0"), targetId: core.getBlockId(3, 2, "MT0")
            },
            repulse: {
                destination: repulseDestination, forgedMoved: forgedRepulseMoved,
                sourceId: core.getBlockId(8, 8, "MT0"), targetId: core.getBlockId(9, 8, "MT0")
            },
            hidden: {
                moved: hiddenMoved, sourceId: core.getBlockId(10, 10, "MT0"),
                targetId: hiddenTarget && hiddenTarget.event.id,
                targetDisabled: hiddenTarget && hiddenTarget.disable
            },
            guards: {
                staleRepulseMoved,
                staleSourceId: core.getBlockId(6, 11, "MT0"),
                staleTargetId: core.getBlockId(7, 11, "MT0"),
                intoHeroMoved, samePointExchanged, fractionalMoved,
                guardSourceId: core.getBlockId(guardSource.x, guardSource.y, guardSource.floorId),
                heroTargetId: core.getBlockId(hero.x, hero.y, hero.floorId)
            }
        };
    });

    expect(result.chase).toEqual({
        atItem: 0, behindItem: 0, forgedMoved: false,
        sourceId: "keiskeiFairy", targetId: "yellowKey"
    });
    expect(result.repulse).toEqual({
        destination: null, forgedMoved: false,
        sourceId: "tulipFairy", targetId: "yellowKey"
    });
    expect(result.hidden).toEqual({
        moved: false, sourceId: "keiskeiFairy",
        targetId: "yellowKey", targetDisabled: true
    });
    expect(result.guards).toEqual({
        staleRepulseMoved: false, staleSourceId: "yellowKey", staleTargetId: null,
        intoHeroMoved: false, samePointExchanged: false, fractionalMoved: false,
        guardSourceId: "keiskeiFairy", heroTargetId: null
    });
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
