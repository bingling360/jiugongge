/* global CubeWorld, core, control, items */
(function (root, factory) {
    var api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    if (root) root.CubeWorldRuntime = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";

    function install(plugin) {
        if (typeof CubeWorld === "undefined") throw new Error("CubeWorld 几何内核未加载");

        var sizes = {};
        CubeWorld.FACE_IDS.forEach(function (floorId) {
            var floor = core.floors[floorId] || {};
            sizes[floorId] = { width: floor.width || 13, height: floor.height || 13 };
        });
        var geometry = CubeWorld.createGeometry({ sizes: sizes });
        var pendingCrosses = {};
        var pendingCrossId = 0;
        var viewerOverlay = null;
        var viewerFrame = null;
        var mobilePad = null;
        var pendingViewQuarter = null;
        var mapRenderDepth = 0;
        var mapRendererInstalled = false;
        var VIEW_QUARTER_FLAG = "__cubeViewQuarter__";
        var KEY_DIRECTIONS = { 37: "left", 38: "up", 39: "right", 40: "down" };

        function state(floorId, x, y, direction) {
            return { floorId: floorId, x: x, y: y, direction: direction || "up" };
        }

        function clonePoint(point) {
            if (!point) return null;
            return { floorId: point.floorId, x: point.x, y: point.y, direction: point.direction };
        }

        function isFace(floorId) {
            return geometry.isFace(floorId);
        }

        function hasMaps() {
            return core.status && core.status.maps;
        }

        function getBlocks(floorId) {
            if (!hasMaps() || !core.status.maps[floorId]) return [];
            core.extractBlocks(floorId);
            return (core.status.maps[floorId].blocks || []).filter(function (block) {
                return block && !block.disable;
            });
        }

        function getEnemy(block, floorId) {
            if (!block || !block.event) return null;
            return core.getEnemyValue(block.event.id, null, block.x, block.y, floorId);
        }

        function getBlock(point) {
            return core.getBlock(point.x, point.y, point.floorId, false);
        }

        function isEnemyBlock(block) {
            return !!(block && block.event && /^enemy/.test(block.event.cls || ""));
        }

        function isSightPassable(point) {
            var block = getBlock(point);
            if (!block || block.disable || !block.event) return true;
            var cls = block.event.cls || "";
            return core.control.getChaseType().indexOf(cls) >= 0 && !block.event.data;
        }

        function isMonsterDestinationEmpty(point) {
            return getBlock(point) == null;
        }

        function locKey(point) {
            return point.x + "," + point.y;
        }

        function sourceKey(point) {
            return point.floorId + ":" + point.x + ":" + point.y;
        }

        function addDamage(info, point, value, label) {
            if (!value) return;
            var key = locKey(point);
            info.damage[key] = (info.damage[key] || 0) + value;
            info.type[key] = info.type[key] || {};
            info.type[key][label] = true;
        }

        function addRecord(bucket, point, record) {
            var key = locKey(point);
            if (!bucket[key]) bucket[key] = [];
            bucket[key].push(record);
        }

        function traceChase(source, initialDirection, targetFloorId) {
            var result = [];
            var current = state(source.floorId, source.x, source.y, initialDirection);
            var crossings = 0;
            var visited = {};
            var firstStep = null;
            var maximum = 2 * geometry.size(source.floorId).width + 2;
            for (var distance = 1; distance <= maximum; distance++) {
                var visitKey = geometry.stateKey(current, true);
                if (visited[visitKey]) break;
                visited[visitKey] = true;
                var next = geometry.step(current, current.direction);
                if (next.crossed) crossings++;
                if (crossings > 1) break;
                if (!firstStep) firstStep = next;
                if (!isSightPassable(next)) break;
                if (next.floorId === targetFloorId) {
                    result.push({ point: next, distance: distance, firstStep: firstStep, initialDirection: initialDirection });
                }
                current = next;
            }
            return result;
        }

        function buildCheckBlock(floorId) {
            floorId = floorId || core.status.floorId;
            if (!isFace(floorId) || !hasMaps() || !core.status.maps[floorId]) return null;

            var info = {
                damage: {}, type: {}, repulse: {}, ambush: {}, chase: {},
                needCache: false, cache: {}
            };

            getBlocks(floorId).forEach(function (block) {
                if (block.event.id === "lavaNet" && !core.hasItem("amulet")) {
                    addDamage(info, block, core.values.lavaDamage, (block.event.name || "血网") + "伤害");
                }
            });

            CubeWorld.FACE_IDS.forEach(function (sourceFloorId) {
                getBlocks(sourceFloorId).forEach(function (block) {
                    var enemy = getEnemy(block, sourceFloorId);
                    if (!enemy) return;
                    var source = state(sourceFloorId, block.x, block.y, "up");

                    if (core.hasSpecial(enemy.special, 15) && !core.hasFlag("no_zone")) {
                        var zoneHits = {};
                        geometry.area(source, enemy.range || 1, !!enemy.zoneSquare).forEach(function (point) {
                            if (geometry.stateKey(point) === geometry.stateKey(source) || point.floorId !== floorId) return;
                            var key = geometry.stateKey(point);
                            if (zoneHits[key]) return;
                            zoneHits[key] = true;
                            addDamage(info, point, enemy.zone || 0, "领域伤害");
                        });
                    }

                    if (core.hasSpecial(enemy.special, 24) && !core.hasFlag("no_laser")) {
                        var laserHits = {};
                        CubeWorld.DIRECTIONS.forEach(function (direction) {
                            geometry.trace(source, direction, { maxSteps: 8 * geometry.size(sourceFloorId).width }).forEach(function (point) {
                                var key = geometry.stateKey(point);
                                if (key === geometry.stateKey(source) || point.floorId !== floorId || laserHits[key]) return;
                                laserHits[key] = true;
                                addDamage(info, point, enemy.laser || 0, "激光伤害");
                            });
                        });
                    }

                    if (core.hasSpecial(enemy.special, 18) && !core.hasFlag("no_repulse")) {
                        geometry.neighbors(source, !!enemy.zoneSquare).forEach(function (entry) {
                            var point = entry.state;
                            if (point.floorId !== floorId) return;
                            addDamage(info, point, enemy.repulse || 0, "阻击伤害");
                            var awayDirection = geometry.opposite(entry.direction);
                            var destinations = geometry.neighborsInDirection(source, awayDirection)
                                .map(function (one) { return one.state; }).filter(isMonsterDestinationEmpty);
                            addRecord(info.repulse, point, {
                                cube: true, kind: "repulse", id: block.event.id,
                                source: clonePoint(source),
                                destination: destinations[0] ? clonePoint(destinations[0]) : null,
                                direction: awayDirection
                            });
                        });
                    }

                    if (core.hasSpecial(enemy.special, 27) && !core.hasFlag("no_ambush")) {
                        geometry.neighbors(source, !!enemy.zoneSquare).forEach(function (entry) {
                            if (entry.state.floorId !== floorId) return;
                            addRecord(info.ambush, entry.state, {
                                cube: true, id: block.event.id, source: clonePoint(source), direction: entry.direction
                            });
                        });
                    }

                    if (core.hasSpecial(enemy.special, 28) && !core.hasFlag("no_chase")) {
                        CubeWorld.DIRECTIONS.forEach(function (direction) {
                            traceChase(source, direction, floorId).forEach(function (hit) {
                                addRecord(info.chase, hit.point, {
                                    cube: true, kind: "chase", id: block.event.id,
                                    source: clonePoint(source), destination: clonePoint(hit.firstStep),
                                    direction: direction, distance: hit.distance
                                });
                            });
                        });
                    }
                });
            });

            if (!core.hasFlag("no_betweenAttack")) {
                var size = geometry.size(floorId);
                for (var y = 0; y < size.height; y++) {
                    for (var x = 0; x < size.width; x++) {
                        var center = state(floorId, x, y, "up");
                        var matched = [];
                        [["left", "right"], ["up", "down"]].forEach(function (pair) {
                            var a = geometry.step(center, pair[0]);
                            var b = geometry.step(center, pair[1]);
                            var idA = core.getFaceDownId(getBlock(a));
                            var idB = core.getFaceDownId(getBlock(b));
                            if (idA && idA === idB && core.hasSpecial(idA, 16)) matched.push({ id: idA, point: a });
                        });
                        if (!matched.length) continue;
                        var key = x + "," + y;
                        var value = Math.floor((core.status.hero.hp - (info.damage[key] || 0)) / 2);
                        if (core.flags.betweenAttackMax) {
                            matched.forEach(function (one) {
                                var enemyDamage = core.getDamage(one.id, one.point.x, one.point.y, one.point.floorId);
                                if (enemyDamage != null) value = Math.min(value, enemyDamage);
                            });
                        }
                        if (value > 0) addDamage(info, center, value, "夹击伤害");
                    }
                }
            }
            return info;
        }

        function copyBlockMetadata(snapshot, placed, destinationDirection) {
            Object.keys(snapshot).forEach(function (key) {
                // id 是当前朝向对应的图块数字，应保留 setBlock 生成的目标值；
                // 其余块级脚本、透明度、滤镜和自定义字段完整复制。
                if (key === "x" || key === "y" || key === "id") return;
                placed[key] = core.clone(snapshot[key]);
            });
            var faceIds = placed.event && placed.event.faceIds;
            if (faceIds && destinationDirection && faceIds[destinationDirection]) {
                placed.event.id = faceIds[destinationDirection];
                placed.id = core.getNumberById(placed.event.id);
            }
        }

        function relocateBlock(source, destination) {
            if (!source || !destination || !isFace(source.floorId) || !isFace(destination.floorId)) return false;
            if (!isMonsterDestinationEmpty(destination)) return false;
            var block = core.getBlock(source.x, source.y, source.floorId, false);
            if (!block || block.disable || !block.event) return false;
            var snapshot = core.clone(block);
            var targetId = snapshot.event.id;
            var faceIds = snapshot.event.faceIds;
            if (faceIds && destination.direction && faceIds[destination.direction]) targetId = faceIds[destination.direction];
            var number = core.getNumberById(targetId);
            if (!(number > 0)) return false;
            core.removeBlock(source.x, source.y, source.floorId);
            core.setBlock(number, destination.x, destination.y, destination.floorId);
            var placed = core.getBlock(destination.x, destination.y, destination.floorId, false);
            if (!placed) return false;
            copyBlockMetadata(snapshot, placed, destination.direction);
            placed.x = destination.x;
            placed.y = destination.y;
            if (core.status.mapBlockObjs) {
                core.status.mapBlockObjs[source.floorId] = null;
                core.status.mapBlockObjs[destination.floorId] = null;
            }
            return true;
        }

        function refreshDamage() {
            if (!core.status || !isFace(core.status.floorId)) return;
            core.updateCheckBlock(core.status.floorId);
            core.updateDamage();
            core.redrawMap();
            refreshViewer();
        }

        function executeMonsterMove(record) {
            if (!record || !record.destination) return false;
            var sourceBlock = core.getBlock(record.source.x, record.source.y, record.source.floorId, false);
            if (!sourceBlock || (record.id && sourceBlock.event.id !== record.id)) return false;
            var moved = relocateBlock(record.source, record.destination);
            if (moved) refreshDamage();
            return moved;
        }

        function selectChases(records) {
            var groups = {};
            (records || []).forEach(function (record) {
                if (!record || !record.cube) return;
                var key = sourceKey(record.source);
                if (!groups[key]) groups[key] = [];
                groups[key].push(record);
            });
            var selected = [];
            Object.keys(groups).sort().forEach(function (key) {
                var group = groups[key].slice().sort(function (a, b) { return a.distance - b.distance; });
                var minimum = group[0].distance;
                var nearest = group.filter(function (one) { return one.distance === minimum; });
                if (nearest.length === 1) selected.push(nearest[0]);
            });
            return selected.sort(function (a, b) {
                return a.distance - b.distance || sourceKey(a.source).localeCompare(sourceKey(b.source));
            });
        }

        function battleAt(floorId, x, y, callback) {
            var block = core.getBlock(x, y, floorId, false);
            if (!isEnemyBlock(block)) {
                if (callback) callback();
                return;
            }
            core.battle(block.event.id, x, y, true, callback, floorId);
        }

        function openDoorsWhenClear(floorId, enemyIds, doors) {
            enemyIds = enemyIds || [];
            doors = doors || [];
            var remains = enemyIds.some(function (enemyId) {
                return core.searchBlock(enemyId, floorId).length > 0;
            });
            if (remains) return false;
            var actions = doors.filter(function (loc) {
                var block = core.getBlock(loc[0], loc[1], floorId, false);
                return block && block.event && block.event.doorInfo;
            }).map(function (loc) {
                return { type: "openDoor", loc: [loc[0], loc[1]], floorId: floorId, needKey: false };
            });
            if (actions.length) core.insertAction(actions, null, null, null, false, floorId);
            return actions.length > 0;
        }

        function refreshViewer() {
            if (!viewerOverlay || viewerOverlay.style.display === "none" || !viewerFrame) return;
            try {
                if (viewerFrame.contentWindow && viewerFrame.contentWindow.CubeViewer) {
                    viewerFrame.contentWindow.CubeViewer.refresh();
                }
            } catch (e) {
                console.warn("刷新六面总览失败", e);
            }
        }

        function openViewer() {
            if (!viewerOverlay || !core.status || !core.status.played || !isFace(core.status.floorId)) return false;
            viewerOverlay.style.display = "block";
            viewerOverlay.setAttribute("aria-hidden", "false");
            if (!viewerFrame.parentNode) viewerOverlay.appendChild(viewerFrame);
            viewerFrame.inert = false;
            if (!viewerFrame.dataset.started) {
                viewerFrame.dataset.started = "true";
                viewerFrame.src = viewerFrame.dataset.src;
            }
            refreshViewer();
            setTimeout(function () {
                refreshViewer();
                if (viewerFrame && viewerFrame.contentWindow) viewerFrame.contentWindow.focus();
            }, 0);
            return true;
        }

        function closeViewer() {
            if (!viewerOverlay || viewerOverlay.style.display === "none") return false;
            viewerOverlay.style.display = "none";
            viewerOverlay.setAttribute("aria-hidden", "true");
            if (viewerFrame) viewerFrame.inert = true;
            if (window.focus) window.focus();
            if (document.body && document.body.focus) document.body.focus();
            return true;
        }

        function toggleViewer() {
            if (viewerOverlay && viewerOverlay.style.display !== "none") return closeViewer();
            return openViewer();
        }

        function directionEvent(keyCode, down) {
            var event = {
                keyCode: keyCode,
                preventDefault: function () { },
                stopPropagation: function () { },
                stopImmediatePropagation: function () { }
            };
            if (down) core.onkeyDown(event);
            else core.onkeyUp(event);
        }

        function getViewQuarter() {
            if (!core.status || !core.status.hero) return 0;
            return CubeWorld.normalizeQuarter(core.getFlag(VIEW_QUARTER_FLAG, 0));
        }

        function storeViewQuarter(quarter) {
            quarter = CubeWorld.normalizeQuarter(quarter);
            if (!core.status || !core.status.hero) return quarter;
            if (quarter === 0) core.removeFlag(VIEW_QUARTER_FLAG);
            else core.setFlag(VIEW_QUARTER_FLAG, quarter);
            return quarter;
        }

        function currentFaceSize() {
            var floor = core.floors[core.status && core.status.floorId] || {};
            return floor.width || core.__SIZE__ || 13;
        }

        function logicalCellToScreen(x, y, quarter) {
            if (quarter == null) quarter = getViewQuarter();
            return CubeWorld.logicalToScreenCell(x, y, currentFaceSize(), quarter);
        }

        function screenCellToLogical(x, y, quarter) {
            if (quarter == null) quarter = getViewQuarter();
            return CubeWorld.screenToLogicalCell(x, y, currentFaceSize(), quarter);
        }

        // 32px 格子左上角的连续映射。它只旋转运动向量和格子位置，传给
        // drawImage 的源像素与目标宽高不变，因此人物素材始终保持正向。
        function mapMovingCellTopLeft(px, py) {
            var quarter = getViewQuarter();
            var length = currentFaceSize() * 32;
            if (quarter === 1) return { x: length - 32 - py, y: px };
            if (quarter === 2) return { x: length - 32 - px, y: length - 32 - py };
            if (quarter === 3) return { x: py, y: length - 32 - px };
            return { x: px, y: py };
        }

        // 显伤、动画中心和楼层贴图的格内偏移属于屏幕排版，不应随地图
        // 转成侧向；只替换它们所在的格子。
        function mapPixelKeepingCellOffset(px, py) {
            var size = currentFaceSize();
            var cellX = Math.max(0, Math.min(size - 1, Math.floor(px / 32)));
            var cellY = Math.max(0, Math.min(size - 1, Math.floor(py / 32)));
            var screen = CubeWorld.logicalToScreenCell(cellX, cellY, size, getViewQuarter());
            return { x: screen.x * 32 + px - cellX * 32, y: screen.y * 32 + py - cellY * 32 };
        }

        function hasMapOrientation() {
            return !!(core.status && isFace(core.status.floorId) && getViewQuarter() !== 0);
        }

        function setupMapPresentation() {
            if (!core.dom || !core.dom.gameDraw) return null;
            // 兼容热更新前曾创建的旧容器，但正常启动不会再创建任何旋转层。
            var oldStage = document.getElementById("cube-world-stage");
            if (oldStage) {
                while (oldStage.firstChild) core.dom.gameDraw.insertBefore(oldStage.firstChild, oldStage);
                oldStage.remove();
            }
            ["gif", "gif2", "bg", "event", "hero", "event2", "fg", "damage", "animate"].forEach(function (id) {
                var node = document.getElementById(id);
                if (!node) return;
                node.style.transform = "";
                node.style.transition = "";
                node.style.transformOrigin = "";
                node.style.willChange = "";
            });
            return core.dom.gameDraw;
        }

        function mapBlockInfoDirection(blockInfo) {
            if (!blockInfo || !blockInfo.faceIds || !Object.keys(blockInfo.faceIds).length) return blockInfo;
            var screenDirection = CubeWorld.logicalToScreenDirection(blockInfo.face, getViewQuarter());
            var screenId = blockInfo.faceIds[screenDirection];
            var icons = core.material.icons[blockInfo.cls] || {};
            if (screenId == null || icons[screenId] == null) return blockInfo;
            return Object.assign({}, blockInfo, {
                id: screenId,
                face: screenDirection,
                posY: icons[screenId]
            });
        }

        function mapContext(ctx) {
            return typeof ctx === "string" ? core.canvas[ctx] : ctx;
        }

        function isMapContext(ctx) {
            var actual = mapContext(ctx);
            return ["bg", "bg2", "event", "event2", "fg", "fg2"].some(function (name) {
                return core.canvas[name] && actual === core.canvas[name];
            });
        }

        function shouldMapBlockContext(ctx) {
            return hasMapOrientation() && (mapRenderDepth > 0 || isMapContext(ctx));
        }

        function runMapRender(active, owner, func, args) {
            if (!active) return func.apply(owner, args);
            mapRenderDepth++;
            try {
                return func.apply(owner, args);
            } finally {
                mapRenderDepth--;
            }
        }

        function configDrawsOnMap(config) {
            if (config == null) return true;
            if (typeof config === "string" || config.canvas) return false;
            return config.ctx == null;
        }

        function installMapRenderer() {
            if (mapRendererInstalled) return;
            mapRendererInstalled = true;

            var originalBgDraw = core.maps._drawBg_draw;
            core.maps._drawBg_draw = function (floorId, toDrawCtx, cacheCtx, config) {
                return runMapRender(!!(config && config.onMap && isFace(floorId)), this,
                    originalBgDraw, arguments);
            };

            var originalFgDraw = core.maps._drawFg_draw;
            core.maps._drawFg_draw = function (floorId, toDrawCtx, cacheCtx, config) {
                return runMapRender(!!(config && config.onMap && isFace(floorId)), this,
                    originalFgDraw, arguments);
            };

            var originalDrawEvents = core.maps.drawEvents;
            core.maps.drawEvents = function (floorId, blocks, config) {
                floorId = floorId || core.status.floorId;
                return runMapRender(isFace(floorId) && configDrawsOnMap(config), this,
                    originalDrawEvents, arguments);
            };

            var canonicalDrawingCell = null;
            var originalDrawBlockInfo = core.maps._drawBlockInfo;
            core.maps._drawBlockInfo = function (blockInfo, x, y, ctx) {
                if (!shouldMapBlockContext(ctx)) return originalDrawBlockInfo.apply(this, arguments);
                var screen = logicalCellToScreen(x, y);
                var previous = canonicalDrawingCell;
                canonicalDrawingCell = { x: x, y: y };
                try {
                    return originalDrawBlockInfo.call(this, mapBlockInfoDirection(blockInfo), screen.x, screen.y, ctx);
                } finally {
                    canonicalDrawingCell = previous;
                }
            };

            var originalDrawBlockInfoBgFg = core.maps._drawBlockInfo_bgfg;
            core.maps._drawBlockInfo_bgfg = function (blockInfo, name, x, y, ctx) {
                if (!shouldMapBlockContext(ctx)) return originalDrawBlockInfoBgFg.apply(this, arguments);
                var screen = logicalCellToScreen(x, y);
                var previous = canonicalDrawingCell;
                canonicalDrawingCell = { x: x, y: y };
                try {
                    return originalDrawBlockInfoBgFg.call(this, mapBlockInfoDirection(blockInfo), name,
                        screen.x, screen.y, ctx);
                } finally {
                    canonicalDrawingCell = previous;
                }
            };

            var originalShouldBlurFg = core.maps._drawBlockInfo_shouldBlurFg;
            core.maps._drawBlockInfo_shouldBlurFg = function (x, y) {
                if (canonicalDrawingCell) return originalShouldBlurFg.call(this,
                    canonicalDrawingCell.x, canonicalDrawingCell.y);
                return originalShouldBlurFg.apply(this, arguments);
            };

            // 引擎原版的删除逻辑会直接按逻辑像素清空 event/event2；在离散
            // 朝向下会清错屏幕格。小地图固定 13x13，删除时完整重绘既可靠
            // 又能同时清掉高图块、滤镜和显伤残影。
            var originalRemoveBlockFromMap = core.maps._removeBlockFromMap;
            core.maps._removeBlockFromMap = function (floorId, block) {
                if (!hasMapOrientation() || floorId !== core.status.floorId) {
                    return originalRemoveBlockFromMap.apply(this, arguments);
                }
                var screen = logicalCellToScreen(block.x, block.y);
                core.removeGlobalAnimate(block.x, block.y);
                [
                    "_bigImage_header_" + block.x + "_" + block.y,
                    "_bigImage_body_" + block.x + "_" + block.y,
                    "_bigImage_header_" + screen.x + "_" + screen.y,
                    "_bigImage_body_" + screen.x + "_" + screen.y
                ].forEach(function (name) { core.deleteCanvas(name); });
                core.redrawMap();
                core.updateStatusBar();
            };

            // Autotile 先按规范坐标拼好四个子块，再只平移到目标屏幕格；
            // 不对拼好的纹理做 canvas.rotate。
            var originalDrawAutotile = core.maps._drawAutotile;
            core.maps._drawAutotile = function (ctx, mapArr, block, size, left, top, status, onMap) {
                if (!onMap || !shouldMapBlockContext(ctx)) return originalDrawAutotile.apply(this, arguments);
                var actual = mapContext(ctx);
                if (!actual || !actual.save) return originalDrawAutotile.apply(this, arguments);
                var screen = logicalCellToScreen(block.x, block.y);
                actual.save();
                actual.translate((screen.x - block.x) * size, (screen.y - block.y) * size);
                try {
                    return originalDrawAutotile.apply(this, arguments);
                } finally {
                    actual.restore();
                }
            };

            var originalAutotileAnimate = core.maps._drawAutotileAnimate;
            core.maps._drawAutotileAnimate = function (block, animate) {
                if (!hasMapOrientation()) return originalAutotileAnimate.apply(this, arguments);
                var screen = logicalCellToScreen(block.x, block.y);
                var cv = block.name ? core.canvas[block.name] : core.canvas.event;
                var px = 32 * screen.x - 32 * core.bigmap.posX;
                var py = 32 * screen.y - 32 * core.bigmap.posY;
                cv.clearRect(px, py, 32, 32);
                var alpha = null;
                if (block.opacity != null) alpha = core.setAlpha(cv, block.opacity);
                core.setFilter(cv, block.filter);
                if (block.name) {
                    if (block.name === "bg") core.drawImage("bg", core.material.groundCanvas.canvas, px, py);
                    this._drawAutotile(cv, this._getBgFgMapArray(block.name), block, 32, 0, 0, animate, true);
                } else {
                    this._drawAutotile(cv, this.getMapArray(), block, 32, 0, 0, animate, true);
                }
                core.setFilter(cv, null);
                if (alpha != null) core.setAlpha(cv, alpha);
            };

            var originalFloorImage = core.maps._drawFloorImage;
            core.maps._drawFloorImage = function (ctx, name, one, image, currStatus, onMap) {
                if (!onMap || !hasMapOrientation()) return originalFloorImage.apply(this, arguments);
                var screen = mapPixelKeepingCellOffset(one.x || 0, one.y || 0);
                var mapped = Object.assign({}, one, { x: screen.x, y: screen.y });
                return originalFloorImage.call(this, ctx, name, mapped, image, currStatus, onMap);
            };

            var originalFloorGif = core.maps._drawFloorImages_gif;
            core.maps._drawFloorImages_gif = function (image, dx, dy) {
                if (!hasMapOrientation()) return originalFloorGif.apply(this, arguments);
                var screen = mapPixelKeepingCellOffset(dx, dy);
                return originalFloorGif.call(this, image, screen.x, screen.y);
            };

            var originalHeroDrawObjects = core.control._drawHero_getDrawObjs;
            core.control._drawHero_getDrawObjs = function (direction, x, y, status, offset) {
                var blocks = originalHeroDrawObjects.apply(this, arguments);
                if (!hasMapOrientation()) return blocks;
                blocks.forEach(function (block) {
                    var screen = mapMovingCellTopLeft(block.posx, block.posy);
                    block.posx = screen.x;
                    block.posy = screen.y;
                    var logicalDirection = block.index === 0 ? direction :
                        ((core.status.hero.followers[block.index - 1] || {}).direction);
                    var screenDirection = CubeWorld.logicalToScreenDirection(logicalDirection, getViewQuarter());
                    if (screenDirection && core.material.icons.hero[screenDirection]) {
                        block.heroIcon = core.material.icons.hero[screenDirection];
                    }
                });
                return blocks.sort(function (a, b) {
                    return a.posy === b.posy ? b.index - a.index : a.posy - b.posy;
                });
            };

            // 移动、跳跃、淡入淡出图块使用独立动态画布；只映射画布位置
            // 并选择正常的屏幕方向帧，画布里的素材像素依旧不旋转。
            var originalMoveDetachedBlock = core.maps._moveDetachedBlock;
            core.maps._moveDetachedBlock = function (blockInfo, nowX, nowY, opacity, canvases) {
                if (!hasMapOrientation()) return originalMoveDetachedBlock.apply(this, arguments);
                var screen = mapMovingCellTopLeft(nowX, nowY);
                return originalMoveDetachedBlock.call(this, mapBlockInfoDirection(blockInfo),
                    screen.x, screen.y, opacity, canvases);
            };

            var originalDamageDraw = core.control._drawDamage_draw;
            core.control._drawDamage_draw = function (ctx, onMap) {
                if (!onMap || !hasMapOrientation() || !core.status.damage) {
                    return originalDamageDraw.apply(this, arguments);
                }
                var data = core.status.damage.data;
                var extraData = core.status.damage.extraData;
                var mapEntry = function (one) {
                    var screen = mapPixelKeepingCellOffset(one.px, one.py);
                    return Object.assign({}, one, { px: screen.x, py: screen.y });
                };
                core.status.damage.data = data.map(mapEntry);
                core.status.damage.extraData = extraData.map(mapEntry);
                try {
                    return originalDamageDraw.apply(this, arguments);
                } finally {
                    core.status.damage.data = data;
                    core.status.damage.extraData = extraData;
                }
            };

            var originalAnimateFrame = core.maps._drawAnimateFrame;
            core.maps._drawAnimateFrame = function (name, animate, centerX, centerY, index) {
                if (!hasMapOrientation() || name !== "animate") return originalAnimateFrame.apply(this, arguments);
                var screen = mapPixelKeepingCellOffset(centerX, centerY);
                return originalAnimateFrame.call(this, name, animate, screen.x, screen.y, index);
            };

            var originalDrawRoute = core.control._setAutomaticRoute_drawRoute;
            core.control._setAutomaticRoute_drawRoute = function (moveStep) {
                if (!hasMapOrientation()) return originalDrawRoute.apply(this, arguments);
                core.status.automaticRoute.offsetX = 0;
                core.status.automaticRoute.offsetY = 0;
                var ctx = core.createCanvas("route", 0, 0, core.__PIXELS__, core.__PIXELS__, 95);
                core.clearMap(ctx);
                ctx.fillStyle = "#bfbfbf";
                ctx.strokeStyle = "#bfbfbf";
                ctx.lineWidth = 8;
                for (var m = 0; m < moveStep.length; m++) {
                    var cell = logicalCellToScreen(moveStep[m].x, moveStep[m].y);
                    if (m === moveStep.length - 1) {
                        ctx.fillRect(cell.x * 32 + 10, cell.y * 32 + 10, 12, 12);
                    } else {
                        var cx = cell.x * 32 + 16, cy = cell.y * 32 + 16;
                        var currDir = CubeWorld.logicalToScreenDirection(moveStep[m].direction, getViewQuarter());
                        var nextDir = CubeWorld.logicalToScreenDirection(moveStep[m + 1].direction, getViewQuarter());
                        ctx.beginPath();
                        ctx.moveTo(cx - core.utils.scan[currDir].x * 11, cy - core.utils.scan[currDir].y * 11);
                        ctx.lineTo(cx, cy);
                        ctx.lineTo(cx + core.utils.scan[nextDir].x * 11, cy + core.utils.scan[nextDir].y * 11);
                        ctx.stroke();
                    }
                }
            };

            var originalClearRouteNode = core.control.clearAutomaticRouteNode;
            core.control.clearAutomaticRouteNode = function (x, y) {
                if (!hasMapOrientation()) return originalClearRouteNode.apply(this, arguments);
                var screen = logicalCellToScreen(x, y);
                core.clearMap("route", screen.x * 32 + 5, screen.y * 32 + 5, 27, 27);
            };
        }

        function redrawMapOrientation() {
            if (!core.status || !core.status.played || !isFace(core.status.floorId) || !core.status.maps) {
                return getViewQuarter();
            }
            core.redrawMap();
            core.drawHero();
            return getViewQuarter();
        }

        function applyViewQuarter(quarter, redraw) {
            quarter = storeViewQuarter(quarter);
            if (redraw !== false) redrawMapOrientation();
            return quarter;
        }

        function syncMapOrientation() {
            return redrawMapOrientation();
        }

        // 保留旧名称给存档或脚本调用；现在没有任何 DOM/CSS 旋转。
        function syncViewRotation() {
            return syncMapOrientation();
        }

        function resetViewFromState() {
            pendingViewQuarter = null;
            return getViewQuarter();
        }

        function prepareCrossView(sourceDirection, targetDirection) {
            pendingViewQuarter = CubeWorld.viewQuarterAfterCross(
                getViewQuarter(), sourceDirection, targetDirection
            );
            return pendingViewQuarter;
        }

        function beforeChangeFloorView(floorId) {
            if (!isFace(floorId)) {
                return storeViewQuarter(0);
            }
            if (pendingViewQuarter != null) {
                return storeViewQuarter(pendingViewQuarter);
            }
            // 读档恢复保存的朝向；飞行、脚本换层和新开游戏没有连续共享
            // 边，绘制目标面前先回到规范朝向。
            if (core.hasFlag("__fromLoad__")) return getViewQuarter();
            return storeViewQuarter(0);
        }

        function afterChangeFloorView() {
            pendingViewQuarter = null;
            return getViewQuarter();
        }

        function screenLocationToLogical(loc) {
            if (!loc) return loc;
            var quarter = getViewQuarter();
            if (quarter === 0) return loc;
            var length = core.__PIXELS__ * core.domStyle.scale;
            var logical = CubeWorld.screenToLogicalPoint(loc.x, loc.y, length, quarter);
            var maximum = Math.max(0, length - 0.001);
            return {
                x: Math.max(0, Math.min(maximum, logical.x)),
                y: Math.max(0, Math.min(maximum, logical.y)),
                size: loc.size
            };
        }

        function installViewIntegration() {
            var originalGetClickLoc = core.actions._getClickLoc;
            core.actions._getClickLoc = function (x, y) {
                var loc = originalGetClickLoc.call(this, x, y);
                if (!loc || !core.status || !core.status.played || core.status.lockControl
                    || !isFace(core.status.floorId)) return loc;
                return screenLocationToLogical(loc);
            };

            core.registerAction("keyDown", "cube-screen-direction", function (keyCode) {
                var screenDirection = KEY_DIRECTIONS[keyCode];
                if (!screenDirection || !core.status.played || core.status.lockControl
                    || !isFace(core.status.floorId) || core.isReplaying()) return false;
                core.moveHero(CubeWorld.screenToLogicalDirection(screenDirection, getViewQuarter()));
                return true;
            }, 20);
        }

        function showLoadWarnings() {
            var failures = core.loader && core.loader.failedImages || [];
            var old = document.getElementById("cube-load-warning");
            if (!failures.length) {
                if (old) old.remove();
                return false;
            }
            var warning = old || document.createElement("button");
            warning.id = "cube-load-warning";
            warning.type = "button";
            warning.setAttribute("role", "alert");
            warning.title = "点击关闭提示";
            warning.style.cssText = "position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:2147483600;max-width:min(92vw,760px);padding:9px 14px;border:1px solid #fca5a5;border-radius:9px;background:rgba(127,29,29,.96);color:#fff;font:14px/1.4 sans-serif;box-shadow:0 5px 20px rgba(0,0,0,.45);cursor:pointer";
            warning.textContent = failures.length + " 张图片加载失败，已使用透明占位图继续启动：" + failures.join("、");
            warning.onclick = function () { warning.remove(); };
            if (!old) document.body.appendChild(warning);
            return true;
        }

        function setupUI() {
            if (document.getElementById("cube-world-overlay")) return;
            var style = document.createElement("style");
            style.textContent = "#cube-world-overlay{position:fixed;inset:0;z-index:2147483000;background:#05070c;display:none}" +
                "#cube-world-frame{width:100%;height:100%;border:0;display:block}" +
                "#cube-mobile-pad{position:fixed;z-index:2147482000;right:max(14px,env(safe-area-inset-right));bottom:max(14px,env(safe-area-inset-bottom));display:none;grid-template-columns:52px 52px 52px;grid-template-rows:52px 52px 52px;gap:5px;touch-action:none;user-select:none}" +
                "#cube-mobile-pad button{border:1px solid rgba(255,255,255,.55);border-radius:14px;background:rgba(15,23,42,.78);color:#fff;font-size:25px;box-shadow:0 3px 14px rgba(0,0,0,.35);-webkit-tap-highlight-color:transparent}" +
                "#cube-mobile-pad button:active{background:#2563eb;transform:scale(.94)}" +
                "#cube-mobile-pad [data-dir=up]{grid-column:2;grid-row:1}#cube-mobile-pad [data-dir=left]{grid-column:1;grid-row:2}#cube-mobile-pad [data-dir=right]{grid-column:3;grid-row:2}#cube-mobile-pad [data-dir=down]{grid-column:2;grid-row:3}" +
                "@media (pointer:coarse),(max-width:760px){#cube-mobile-pad{display:grid}}";
            document.head.appendChild(style);

            viewerOverlay = document.createElement("div");
            viewerOverlay.id = "cube-world-overlay";
            // 使用内联初值作为唯一状态源，避免 CSS 隐藏但 style.display 为空时
            // 第一次按 C 被误判成“已经打开”。
            viewerOverlay.style.display = "none";
            viewerOverlay.setAttribute("aria-hidden", "true");
            viewerFrame = document.createElement("iframe");
            viewerFrame.id = "cube-world-frame";
            viewerFrame.title = "立方体六面总览";
            viewerFrame.tabIndex = -1;
            viewerFrame.inert = true;
            viewerFrame.dataset.src = "cube-map-viewer.html?v=" + encodeURIComponent(main.version || "3.0.0");
            viewerFrame.addEventListener("load", function () {
                if (!viewerFrame.dataset.started) return;
                refreshViewer();
                if (viewerOverlay.style.display !== "none" && viewerFrame.contentWindow) viewerFrame.contentWindow.focus();
            });
            document.body.appendChild(viewerOverlay);

            mobilePad = document.createElement("div");
            mobilePad.id = "cube-mobile-pad";
            mobilePad.setAttribute("aria-label", "移动方向键");
            [["up", 38, "↑"], ["left", 37, "←"], ["right", 39, "→"], ["down", 40, "↓"]].forEach(function (data) {
                var button = document.createElement("button");
                var activePointerId = null;
                button.type = "button";
                button.dataset.dir = data[0];
                button.dataset.key = data[1];
                button.textContent = data[2];
                button.setAttribute("aria-label", data[0]);
                button.addEventListener("pointerdown", function (event) {
                    event.preventDefault();
                    if (activePointerId != null) return;
                    activePointerId = event.pointerId;
                    button.setPointerCapture(event.pointerId);
                    directionEvent(Number(button.dataset.key), true);
                });
                ["pointerup", "pointercancel", "lostpointercapture"].forEach(function (name) {
                    button.addEventListener(name, function (event) {
                        event.preventDefault();
                        if (activePointerId !== event.pointerId) return;
                        activePointerId = null;
                        directionEvent(Number(button.dataset.key), false);
                    });
                });
                mobilePad.appendChild(button);
            });
            document.body.appendChild(mobilePad);

            core.registerAction("keyUp", "cube-world-viewer", function (keyCode) {
                if (keyCode !== 67 || !core.status.played) return false;
                toggleViewer();
                return true;
            }, 200);

            window.addEventListener("keydown", function (event) {
                if (!viewerOverlay || viewerOverlay.style.display === "none") return;
                event.preventDefault();
                event.stopImmediatePropagation();
            }, true);
            window.addEventListener("keyup", function (event) {
                if (!viewerOverlay || viewerOverlay.style.display === "none") return;
                event.preventDefault();
                event.stopImmediatePropagation();
                if (event.keyCode === 27 || event.keyCode === 67) closeViewer();
            }, true);

            var flyIcon = core.statusBar && core.statusBar.image && core.statusBar.image.fly;
            if (flyIcon) {
                flyIcon.title = "六面总览（C）";
                flyIcon.alt = "六面总览";
                flyIcon.onclick = function (event) {
                    if (event) event.stopPropagation();
                    if (!core.isReplaying()) openViewer();
                };
            }
        }

        function canCrossTerrain(from, target, direction) {
            if (core.inArray((core.floors[from.floorId].cannotMove || {})[from.x + "," + from.y], direction)) return false;
            if (core.inArray((core.floors[target.floorId].cannotMoveIn || {})[target.x + "," + target.y], geometry.opposite(target.direction))) return false;
            var fromArrays = core.maps._generateMovableArray_arrays(from.floorId);
            var sourceNumbers = Object.keys(fromArrays).map(function (name) { return fromArrays[name][from.y][from.x]; });
            if (core.maps._canMoveHero_checkCannotInOut(sourceNumbers, "cannotOut", direction)) return false;
            var targetArrays = core.maps._generateMovableArray_arrays(target.floorId);
            var targetNumbers = Object.keys(targetArrays).map(function (name) { return targetArrays[name][target.y][target.x]; });
            if (core.maps._canMoveHero_checkCannotInOut(targetNumbers, "cannotIn", target.direction)) return false;
            return true;
        }

        function canEnterCrossTarget(target) {
            var block = getBlock(target);
            if (block && block.event && block.event.noPass) return false;
            if (!core.flags.canGoDeadZone && !core.status.lockControl && !block) {
                var check = buildCheckBlock(target.floorId);
                var damage = check && check.damage[locKey(target)] || 0;
                if (Math.max(core.status.hero.hp, 1) <= damage) return false;
            }
            return true;
        }

        function recordAttempt(controller, direction, callback) {
            core.status.route.push(direction);
            core.status.automaticRoute.moveStepBeforeStop = [];
            core.status.automaticRoute.lastDirection = direction;
            core.drawHero();
            core.clearContinueAutomaticRoute();
            core.stopAutomaticRoute();
            if (callback) callback();
        }

        function crossHero(target, direction, recordRoute, callback) {
            if (recordRoute) core.status.route.push(direction);
            core.status.holdingKeys = [];
            core.status.heroStop = true;
            core.status.automaticRoute.moveStepBeforeStop = [];
            core.status.automaticRoute.lastDirection = target.direction;
            prepareCrossView(direction, target.direction);
            core.changeFloor(target.floorId, null, { x: target.x, y: target.y, direction: target.direction }, 0, function () {
                core.moveOneStep(function () {
                    // `trigger` 在已有自定义事件时会先异步回调、再把系统事件
                    // 排入动作队列。跨层转场正好会放大这个时序差，导致落点
                    // 道具有时留在脚下。以落点的实时状态兜底一次，已处理过
                    // 的道具已经被移除，因此不会重复结算。
                    var landing = getBlock(target);
                    if (landing && landing.event && landing.event.trigger === "getItem") {
                        core.getItem(landing.event.id, 1, target.x, target.y, false, function () {
                            core.checkRouteFolding();
                            if (callback) callback();
                        }, target.floorId);
                        return;
                    }
                    core.checkRouteFolding();
                    if (callback) callback();
                });
            });
        }

        function finishPendingCross(id) {
            var pending = pendingCrosses[id];
            if (!pending) {
                if (core.status.event.id === "action") core.doAction();
                return;
            }
            delete pendingCrosses[id];
            var resume = pending.callback;
            if (pending.resumeAction) {
                resume = function () {
                    // 先把挂起的动作队列继续到稳定点，再兑现本次移动的回调。
                    // 否则 Playwright、自动寻路和按键释放都会永久等待。
                    core.doAction();
                    if (pending.callback) pending.callback();
                };
            }
            if (!canEnterCrossTarget(pending.target)) {
                if (resume) resume();
                return;
            }
            crossHero(pending.target, pending.direction, false, resume);
        }

        function schedulePendingCross(target, direction, callback) {
            var id = ++pendingCrossId;
            var inAction = core.status.event.id === "action";
            pendingCrosses[id] = { target: clonePoint(target), direction: direction, callback: callback, resumeAction: inAction };
            if (inAction) {
                core.insertAction({
                    type: "function", async: true,
                    "function": "function(){core.plugin.cubeWorld.finishPendingCross(" + id + ");}"
                }, null, null, null, true);
            } else setTimeout(function () { finishPendingCross(id); }, 1);
        }

        function queueEventCross(block, target, direction, callback) {
            var id = ++pendingCrossId;
            pendingCrosses[id] = {
                target: clonePoint(target), direction: direction,
                callback: callback, resumeAction: true
            };
            var actions = core.clone(block.event.event);
            if (!(actions instanceof Array)) actions = [actions];
            actions.push({
                type: "function", async: true,
                "function": "function(){core.plugin.cubeWorld.finishPendingCross(" + id + ");}"
            });
            // 把续行明确放在远程事件的末尾；不能依赖 trigger 对事件数组的
            // 早回调，否则续行与 NPC 的移除动作会发生竞态。
            core.insertAction(actions, target.x, target.y, null, false, target.floorId);
        }

        function handleCrossInteraction(controller, from, target, direction, callback) {
            if (!canCrossTerrain(from, target, direction)) {
                recordAttempt(controller, direction, callback);
                return true;
            }
            var block = getBlock(target);
            if (!block || !block.event || !block.event.noPass) {
                if (!canEnterCrossTarget(target)) recordAttempt(controller, direction, callback);
                else crossHero(target, direction, true, callback);
                return true;
            }
            if (block.event.doorInfo) {
                recordAttempt(controller, direction);
                core.openDoor(target.x, target.y, true, callback, target.floorId);
                return true;
            }
            if (block.event.id === "box" || block.event.id === "boxed" || block.event.trigger === "pushBox") {
                recordAttempt(controller, direction, callback);
                return true;
            }
            if (block.event.trigger === "battle" || isEnemyBlock(block)) {
                recordAttempt(controller, direction);
                if (!core.enemys.canBattle(block.event.id, target.x, target.y, target.floorId)) {
                    core.battle(block.event.id, target.x, target.y, false, callback, target.floorId);
                    return true;
                }
                core.battle(block.event.id, target.x, target.y, false, function () {
                    schedulePendingCross(target, direction, callback);
                }, target.floorId);
                return true;
            }
            if (block.event.event && !block.event.script) {
                recordAttempt(controller, direction);
                queueEventCross(block, target, direction, callback);
                return true;
            }
            if ((block.event.trigger && block.event.trigger !== "null") || block.event.event) {
                recordAttempt(controller, direction);
                core.trigger(target.x, target.y, function () {
                    schedulePendingCross(target, direction, callback);
                }, target.floorId);
                return true;
            }
            recordAttempt(controller, direction, callback);
            return true;
        }

        function consumeCrossTool(itemId, target, callback, noRoute) {
            var block = getBlock(target);
            if (!block || !block.event) return false;
            var success = itemId === "pickaxe" && block.event.canBreak;
            if (itemId === "icePickaxe" && block.event.id === "ice") success = true;
            if (itemId === "bomb" && isEnemyBlock(block)) {
                var enemy = getEnemy(block, target.floorId);
                success = !!enemy && !enemy.notBomb;
            }
            if (!success || !core.hasItem(itemId)) return false;
            var itemData = core.material.items[itemId];
            if (core.getLocalStorage("autoSaveBeforeUseItem") && itemData.cls === "tools") {
                if (noRoute) core.autosave(true); else core.autosave(false);
            }
            if (itemId === "icePickaxe") {
                core.drawTip(itemData.name + "使用成功", itemId);
                core.items._afterUseItem(itemId);
                if (!noRoute) core.status.route.push("item:" + itemId);
                // 冰墙本质是门；走开门管线才能保留音效和 afterOpenDoor。
                core.openDoor(target.x, target.y, false, function () {
                    refreshDamage();
                    if (callback) callback();
                }, target.floorId);
                return true;
            }
            core.removeBlock(target.x, target.y, target.floorId);
            core.playSound(itemId === "bomb" ? "炸弹" : "破墙镐");
            core.drawTip(itemData.name + "使用成功", itemId);
            core.items._afterUseItem(itemId);
            if (!noRoute) core.status.route.push("item:" + itemId);
            refreshDamage();
            if (callback) callback();
            return true;
        }

        function applyCubeAura(info, enemy, x, y, floorId) {
            if (!info || !isFace(floorId) || x == null || y == null) return info;
            var target = state(floorId, x, y, "up");
            var hpBuff = 0, atkBuff = 0, defBuff = 0, usedEnemyIds = {}, guards = [];
            CubeWorld.FACE_IDS.forEach(function (sourceFloorId) {
                getBlocks(sourceFloorId).forEach(function (block) {
                    var sourceEnemy = getEnemy(block, sourceFloorId);
                    if (!sourceEnemy) return;
                    var sourceEnemyId = sourceEnemy.id || block.event.id;
                    var source = state(sourceFloorId, block.x, block.y, "up");
                    if (core.hasSpecial(sourceEnemy.special, 25)) {
                        var inRange = sourceEnemy.haloRange == null;
                        if (sourceEnemy.haloRange != null) {
                            inRange = geometry.distance(source, target, !!sourceEnemy.haloSquare, sourceEnemy.haloRange) <= sourceEnemy.haloRange;
                        }
                        if (inRange && (sourceEnemy.haloAdd || !usedEnemyIds[sourceEnemyId])) {
                            hpBuff += sourceEnemy.hpBuff || 0;
                            atkBuff += sourceEnemy.atkBuff || 0;
                            defBuff += sourceEnemy.defBuff || 0;
                            usedEnemyIds[sourceEnemyId] = true;
                        }
                    }
                    if (core.hasSpecial(sourceEnemy.special, 26) && geometry.distance(source, target, true, 1) === 1) {
                        guards.push({ floorId: sourceFloorId, x: block.x, y: block.y, id: block.event.id });
                    }
                });
            });
            info.hp = Math.floor(info.hp * (1 + hpBuff / 100));
            info.atk = Math.floor(info.atk * (1 + atkBuff / 100));
            info.def = Math.floor(info.def * (1 + defBuff / 100));
            info.guards = guards;
            return info;
        }

        var runtime = {
            geometry: geometry, faces: CubeWorld.FACE_IDS.slice(), titles: CubeWorld.FACE_TITLES,
            isFace: isFace, buildCheckBlock: buildCheckBlock, relocateBlock: relocateBlock,
            executeMonsterMove: executeMonsterMove, selectChases: selectChases, battleAt: battleAt,
            finishPendingCross: finishPendingCross, applyCubeAura: applyCubeAura,
            refreshDamage: refreshDamage, openDoorsWhenClear: openDoorsWhenClear,
            openViewer: openViewer, closeViewer: closeViewer, toggleViewer: toggleViewer,
            refreshViewer: refreshViewer, setupUI: setupUI, showLoadWarnings: showLoadWarnings,
            setupMapPresentation: setupMapPresentation, getViewQuarter: getViewQuarter,
            applyViewQuarter: applyViewQuarter, syncMapOrientation: syncMapOrientation,
            syncViewRotation: syncViewRotation, resetViewFromState: resetViewFromState,
            beforeChangeFloorView: beforeChangeFloorView, afterChangeFloorView: afterChangeFloorView,
            logicalCellToScreen: logicalCellToScreen, screenCellToLogical: screenCellToLogical,
            logicalToScreenDirection: function (direction) {
                return CubeWorld.logicalToScreenDirection(direction, getViewQuarter());
            },
            screenToLogicalDirection: function (direction) {
                return CubeWorld.screenToLogicalDirection(direction, getViewQuarter());
            },
            screenLocationToLogical: screenLocationToLogical
        };
        plugin.cubeWorld = runtime;

        installMapRenderer();
        installViewIntegration();

        var previousAfterLoadResources = plugin._afterLoadResources;
        plugin._afterLoadResources = function () {
            if (previousAfterLoadResources) previousAfterLoadResources.apply(this, arguments);
            setupMapPresentation();
            setupUI();
            showLoadWarnings();
        };

        var originalGetCheckBlock = core.control.controldata.getCheckBlock;
        core.control.controldata.getCheckBlock = function (floorId) {
            floorId = floorId || core.status.floorId;
            if (isFace(floorId)) return buildCheckBlock(floorId);
            return originalGetCheckBlock.call(this, floorId);
        };

        var originalEnemyInfo = core.enemys.enemydata.getEnemyInfo;
        core.enemys.enemydata.getEnemyInfo = function (enemy, hero, x, y, floorId) {
            floorId = floorId || core.status.floorId;
            var info = originalEnemyInfo.call(this, enemy, hero, x, y, floorId);
            return isFace(floorId) ? applyCubeAura(info, enemy, x, y, floorId) : info;
        };

        var originalMoveAction = control.prototype.moveAction;
        control.prototype.moveAction = function (callback) {
            var floorId = core.status.floorId;
            var direction = core.getHeroLoc("direction");
            if (!isFace(floorId) || core.status.heroMoving > 0) return originalMoveAction.call(this, callback);
            var from = state(floorId, core.getHeroLoc("x"), core.getHeroLoc("y"), direction);
            var target = geometry.step(from, direction);
            if (!target || !target.crossed) return originalMoveAction.call(this, callback);
            return handleCrossInteraction(this, from, target, direction, callback);
        };

        // 夹击依赖当前生命值，追猎与阻击又会改变地图。六面世界每走一步
        // 都从实时状态重算，避免继承上一格或上一轮战斗留下的陈旧结果。
        var originalMoveOneStep = control.prototype.moveOneStep;
        control.prototype.moveOneStep = function (callback) {
            if (isFace(core.status.floorId)) {
                var fresh = buildCheckBlock(core.status.floorId);
                if (fresh) core.status.checkBlock = fresh;
            }
            return originalMoveOneStep.call(this, callback);
        };

        var originalRepulse = control.prototype._checkBlock_repulse;
        control.prototype._checkBlock_repulse = function (records) {
            records = records || [];
            var actions = originalRepulse.call(this, records.filter(function (one) { return !one || !one.cube; }));
            records.filter(function (one) { return one && one.cube && one.destination; }).forEach(function (record) {
                actions.push({ type: "function", "function": "function(){core.plugin.cubeWorld.executeMonsterMove(" + JSON.stringify(record) + ");}" });
            });
            return actions;
        };

        var originalChase = control.prototype._checkBlock_chase;
        control.prototype._checkBlock_chase = function (records) {
            records = records || [];
            var actions = originalChase.call(this, records.filter(function (one) { return !one || !one.cube; }));
            selectChases(records).forEach(function (record) {
                actions.push({ type: "function", "function": "function(){core.plugin.cubeWorld.executeMonsterMove(" + JSON.stringify(record) + ");}" });
            });
            return actions;
        };

        var originalAmbush = control.prototype._checkBlock_ambush;
        control.prototype._checkBlock_ambush = function (records) {
            records = records || [];
            var actions = originalAmbush.call(this, records.filter(function (one) { return !one || !one.cube; }));
            records.filter(function (one) { return one && one.cube; }).forEach(function (record) {
                actions.push({
                    type: "function", async: true,
                    "function": "function(){core.plugin.cubeWorld.battleAt(" + JSON.stringify(record.source.floorId)
                        + "," + record.source.x + "," + record.source.y + ",core.doAction);}"
                });
            });
            return actions;
        };

        var originalAdjacentChase = control.prototype.checkBlock_adjacentChase;
        control.prototype.checkBlock_adjacentChase = function (inAction) {
            if (!isFace(core.status.floorId)) return originalAdjacentChase.call(this, inAction);
            var hero = state(core.status.floorId, core.getHeroLoc("x"), core.getHeroLoc("y"), core.getHeroLoc("direction"));
            var seen = {}, actions = [];
            geometry.cardinalNeighbors(hero).forEach(function (entry) {
                var point = entry.state;
                var block = getBlock(point);
                if (!isEnemyBlock(block) || !core.hasSpecial(block.event.id, 28)) return;
                var key = sourceKey(point);
                if (seen[key]) return;
                seen[key] = true;
                actions.push({
                    type: "function", async: true,
                    "function": "function(){core.plugin.cubeWorld.battleAt(" + JSON.stringify(point.floorId)
                        + "," + point.x + "," + point.y + ",core.doAction);}"
                });
            });
            if (!inAction) return actions;
            if (actions.length) core.insertAction(actions);
            core.doAction();
        };

        var originalCanUseItem = items.prototype.canUseItem;
        items.prototype.canUseItem = function (itemId) {
            if (isFace(core.status.floorId) && core.hasItem(itemId)
                && ["pickaxe", "icePickaxe", "bomb"].indexOf(itemId) >= 0) {
                var from = state(core.status.floorId, core.getHeroLoc("x"), core.getHeroLoc("y"), core.getHeroLoc("direction"));
                var target = geometry.step(from, from.direction);
                if (target && target.crossed) {
                    var block = getBlock(target);
                    if (itemId === "pickaxe" && block && block.event && block.event.canBreak) return true;
                    if (itemId === "icePickaxe" && block && block.event && block.event.id === "ice") return true;
                    if (itemId === "bomb" && isEnemyBlock(block)) {
                        var enemy = getEnemy(block, target.floorId);
                        if (enemy && !enemy.notBomb) return true;
                    }
                }
            }
            return originalCanUseItem.call(this, itemId);
        };

        var originalUseItem = items.prototype.useItem;
        items.prototype.useItem = function (itemId, noRoute, callback) {
            if (isFace(core.status.floorId) && ["pickaxe", "icePickaxe", "bomb"].indexOf(itemId) >= 0) {
                var from = state(core.status.floorId, core.getHeroLoc("x"), core.getHeroLoc("y"), core.getHeroLoc("direction"));
                var target = geometry.step(from, from.direction);
                if (target && target.crossed && consumeCrossTool(itemId, target, callback, noRoute)) return;
            }
            return originalUseItem.call(this, itemId, noRoute, callback);
        };

        return runtime;
    }

    return { install: install };
});
