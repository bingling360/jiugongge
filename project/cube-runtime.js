/* global CubeWorld, core, control, items, maps */
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
        var viewerOpenId = 0;
        var mobilePad = null;
        var pendingViewQuarter = null;
        var activeMapProjection = null;
        var projectionRenderDepth = 0;
        var projectedOperationDepth = 0;
        var mapRendererInstalled = false;
        var PROJECTED_BLOCK = "__cubeProjectedBlock__";
        var PROJECTED_FLOOR_IMAGE = "__cubeProjectedFloorImage__";
        var PROJECTED_ANIMATE = "__cubeProjectedAnimate__";
        var SCREEN_OFFSET = "__cubeScreenOffset__";
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
            // 查看器是独立 iframe；关闭后复用旧文档会让开发期间修改过的
            // 投影代码永久滞留。每次打开都创建唯一 URL，加载和聚焦由 load
            // 事件统一完成，也避免在导航途中误刷新上一版文档。
            viewerFrame.dataset.started = "true";
            viewerOpenId++;
            viewerFrame.src = viewerFrame.dataset.src + "&open=" + Date.now() + "-" + viewerOpenId;
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

        function currentFaceSize(floorId) {
            floorId = floorId || (core.status && core.status.floorId);
            var floor = core.floors[floorId] || {};
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
        function mapMovingCellTopLeft(px, py, floorId, quarter) {
            if (quarter == null) quarter = getViewQuarter();
            var length = currentFaceSize(floorId) * 32;
            if (quarter === 1) return { x: length - 32 - py, y: px };
            if (quarter === 2) return { x: length - 32 - px, y: length - 32 - py };
            if (quarter === 3) return { x: py, y: length - 32 - px };
            return { x: px, y: py };
        }

        // 显伤、动画中心和楼层贴图的格内偏移属于屏幕排版，不应随地图
        // 转成侧向；只替换它们所在的格子。
        function mapPixelKeepingCellOffset(px, py, floorId, quarter) {
            if (quarter == null) quarter = getViewQuarter();
            var size = currentFaceSize(floorId);
            var cellX = Math.max(0, Math.min(size - 1, Math.floor(px / 32)));
            var cellY = Math.max(0, Math.min(size - 1, Math.floor(py / 32)));
            var screen = CubeWorld.logicalToScreenCell(cellX, cellY, size, quarter);
            return { x: screen.x * 32 + px - cellX * 32, y: screen.y * 32 + py - cellY * 32 };
        }

        function hasMapOrientation(floorId) {
            floorId = floorId || (core.status && core.status.floorId);
            return !!(core.status && floorId === core.status.floorId && isFace(floorId) && getViewQuarter() !== 0);
        }

        function setupMapPresentation() {
            if (!core.dom || !core.dom.gameDraw) return null;
            // 兼容热更新前曾创建的旧容器，但正常启动不会再创建任何旋转层。
            var oldStage = document.getElementById("cube-world-stage");
            if (oldStage) {
                while (oldStage.firstChild) core.dom.gameDraw.insertBefore(oldStage.firstChild, oldStage);
                oldStage.remove();
            }
            ["gif", "gif2", "bg", "bg2", "event", "hero", "event2", "fg", "fg2", "damage", "animate"].forEach(function (id) {
                var node = document.getElementById(id);
                if (!node) return;
                node.style.transform = "";
                node.style.transition = "";
                node.style.transformOrigin = "";
                node.style.willChange = "";
            });
            return core.dom.gameDraw;
        }

        function projectBlockInfoDirection(blockInfo, quarter) {
            if (!blockInfo || !blockInfo.faceIds || !Object.keys(blockInfo.faceIds).length) return blockInfo;
            if (quarter == null) quarter = getViewQuarter();
            var screenDirection = CubeWorld.logicalToScreenDirection(blockInfo.face, quarter);
            var screenId = blockInfo.faceIds[screenDirection];
            var icons = core.material.icons[blockInfo.cls] || {};
            if (screenId == null || icons[screenId] == null) return blockInfo;
            return Object.assign({}, blockInfo, {
                id: screenId,
                face: screenDirection,
                posY: icons[screenId]
            });
        }

        function markProjectedBlock(block) {
            try {
                Object.defineProperty(block, PROJECTED_BLOCK, { value: true, configurable: true });
            } catch (e) {
                block[PROJECTED_BLOCK] = true;
            }
            return block;
        }

        function isProjectedBlock(block) {
            return !!(block && block[PROJECTED_BLOCK]);
        }

        function projectBlock(block, floorId, quarter) {
            if (!block || isProjectedBlock(block)) return block;
            floorId = floorId || core.status.floorId;
            if (quarter == null) quarter = getViewQuarter();
            var screen = CubeWorld.logicalToScreenCell(block.x, block.y, currentFaceSize(floorId), quarter);
            var projected = Object.assign({}, block, { x: screen.x, y: screen.y });
            if (block.event) {
                projected.event = Object.assign({}, block.event);
                var faceIds = block.event.faceIds || {};
                var logicalDirection = Object.keys(faceIds).filter(function (direction) {
                    return faceIds[direction] === block.event.id;
                })[0];
                var screenDirection = CubeWorld.logicalToScreenDirection(logicalDirection, quarter);
                var screenId = faceIds[screenDirection];
                if (screenId) {
                    projected.event.id = screenId;
                    var screenNumber = core.getNumberById(screenId);
                    if (screenNumber > 0) projected.id = screenNumber;
                }
            }
            return markProjectedBlock(projected);
        }

        function projectMapNumber(number, floorId, quarter) {
            number = number && number.idnum || number || 0;
            if (!number) return 0;
            var source = core.getBlockByNumber(number);
            if (!source || !source.event) return number;
            return projectBlock({ x: 0, y: 0, id: number, event: source.event }, floorId, quarter).id;
        }

        function projectMapArray(array, floorId, quarter) {
            var floor = core.floors[floorId];
            var width = floor.width, height = floor.height;
            if (width !== height) throw new Error("立方体面必须是正方形地图：" + floorId);
            var projected = [];
            for (var y = 0; y < height; y++) projected.push(Array(width).fill(0));
            for (var y = 0; y < height; y++) {
                for (var x = 0; x < width; x++) {
                    var screen = CubeWorld.logicalToScreenCell(x, y, width, quarter);
                    projected[screen.y][screen.x] = projectMapNumber((array[y] || [])[x], floorId, quarter);
                }
            }
            return projected;
        }

        function projectFloorImages(images, floorId, quarter) {
            return (images || []).map(function (one) {
                var screen = mapPixelKeepingCellOffset(one.x || 0, one.y || 0, floorId, quarter);
                var projected = Object.assign({}, one, { x: screen.x, y: screen.y });
                try {
                    Object.defineProperty(projected, PROJECTED_FLOOR_IMAGE, {
                        value: { x: one.x, y: one.y }
                    });
                } catch (e) {
                    projected[PROJECTED_FLOOR_IMAGE] = { x: one.x, y: one.y };
                }
                return projected;
            });
        }

        function mapLayerNames(floorId) {
            return ["bg", "fg", "bg2", "fg2"].filter(function (name) {
                return name === "bg" || name === "fg" || core.status[name + "maps"]
                    || (core.floors[floorId] || {})[name + "map"] != null;
            });
        }

        // 构造一份只用于显示的标准地图。逻辑地图、事件坐标和存档数据都不
        // 修改；引擎绘制期间临时看到的是这份已经完成拓扑旋转的普通地图。
        function buildMapProjection(floorId) {
            floorId = floorId || core.status.floorId;
            if (activeMapProjection && activeMapProjection.floorId === floorId) {
                return activeMapProjection;
            }
            var quarter = getViewQuarter();
            var floor = core.floors[floorId];
            var map = core.status.maps[floorId];
            if (!floor || !map) return null;
            if (floor.width !== floor.height) throw new Error("立方体面必须是正方形地图：" + floorId);
            core.extractBlocks(floorId);
            var blocks = (map.blocks || []).map(function (block) {
                return projectBlock(block, floorId, quarter);
            });
            var blockObjs = {};
            blocks.forEach(function (block) { blockObjs[block.x + "," + block.y] = block; });
            var layerMaps = {};
            mapLayerNames(floorId).forEach(function (name) {
                layerMaps[name] = projectMapArray(
                    core.maps._getBgFgMapArray(name, floorId), floorId, quarter
                );
            });
            return {
                floorId: floorId,
                quarter: quarter,
                blocks: blocks,
                blockObjs: blockObjs,
                map: core.maps._getMapArrayFromBlocks(blocks, floor.width, floor.height),
                layerMaps: layerMaps,
                bgmap: layerMaps.bg,
                fgmap: layerMaps.fg,
                images: projectFloorImages(map.images || [], floorId, quarter)
            };
        }

        function withMapProjection(projection, owner, func, args) {
            if (!projection) return func.apply(owner, args);
            var floorId = projection.floorId;
            var map = core.status.maps[floorId];
            var hadMapBlockObjs = Object.prototype.hasOwnProperty.call(core.status, "mapBlockObjs");
            var originalMapBlockObjs = core.status.mapBlockObjs;
            var hadMapBlockObjsObject = !!originalMapBlockObjs && typeof originalMapBlockObjs === "object";
            var mapBlockObjs = hadMapBlockObjsObject
                ? originalMapBlockObjs : (core.status.mapBlockObjs = {});
            var saved = {
                blocks: map.blocks,
                map: map.map,
                images: map.images,
                layerMaps: {},
                blockObjs: mapBlockObjs[floorId],
                blockObjsExists: Object.prototype.hasOwnProperty.call(mapBlockObjs, floorId),
                active: activeMapProjection
            };
            map.blocks = projection.blocks;
            map.map = projection.map;
            map.images = projection.images;
            Object.keys(projection.layerMaps).forEach(function (name) {
                var statusKey = name + "maps";
                var cacheExists = Object.prototype.hasOwnProperty.call(core.status, statusKey);
                var cacheValue = core.status[statusKey];
                var cacheObject = !!cacheValue && typeof cacheValue === "object";
                var cache = cacheObject ? cacheValue : (core.status[statusKey] = {});
                saved.layerMaps[name] = {
                    statusKey: statusKey,
                    cacheExists: cacheExists,
                    cacheValue: cacheValue,
                    cacheObject: cacheObject,
                    floorExists: Object.prototype.hasOwnProperty.call(cache, floorId),
                    value: cache[floorId]
                };
                cache[floorId] = projection.layerMaps[name];
            });
            mapBlockObjs[floorId] = projection.blockObjs;
            activeMapProjection = projection;
            projectionRenderDepth++;
            try {
                return func.apply(owner, args);
            } finally {
                projectionRenderDepth--;
                activeMapProjection = saved.active;
                map.blocks = saved.blocks;
                map.map = saved.map;
                map.images = saved.images;
                Object.keys(saved.layerMaps).forEach(function (name) {
                    var record = saved.layerMaps[name];
                    if (!record.cacheExists) {
                        delete core.status[record.statusKey];
                    } else if (!record.cacheObject) {
                        core.status[record.statusKey] = record.cacheValue;
                    } else if (record.floorExists) {
                        core.status[record.statusKey][floorId] = record.value;
                    } else {
                        delete core.status[record.statusKey][floorId];
                    }
                });
                if (!hadMapBlockObjs) delete core.status.mapBlockObjs;
                else if (!hadMapBlockObjsObject) core.status.mapBlockObjs = originalMapBlockObjs;
                else if (saved.blockObjsExists) mapBlockObjs[floorId] = saved.blockObjs;
                else delete mapBlockObjs[floorId];
            }
        }

        function runProjectedOperation(owner, func, args) {
            projectedOperationDepth++;
            try {
                return func.apply(owner, args);
            } finally {
                projectedOperationDepth--;
            }
        }

        function isMapDrawingContext(ctx) {
            if (ctx == null) return true;
            var actual = typeof ctx === "string" ? core.canvas[ctx] : ctx;
            return ["bg", "bg2", "event", "event2", "fg", "fg2"].some(function (name) {
                return core.canvas[name] && actual === core.canvas[name];
            });
        }

        function projectVector(x, y, quarter) {
            quarter = CubeWorld.normalizeQuarter(quarter);
            if (quarter === 1) return { x: -y, y: x };
            if (quarter === 2) return { x: -x, y: -y };
            if (quarter === 3) return { x: y, y: -x };
            return { x: x, y: y };
        }

        function installMapRenderer() {
            if (mapRendererInstalled) return;
            mapRendererInstalled = true;

            // 全量绘制的唯一地图变换入口：先生成完整投影，再让引擎按普通
            // 地图依次绘制 bg / event / fg。各绘制原语不再自行换算坐标。
            var originalDrawMapAll = core.maps._drawMap_drawAll;
            core.maps._drawMap_drawAll = function (floorId) {
                floorId = floorId || core.status.floorId;
                if (!hasMapOrientation(floorId)) return originalDrawMapAll.apply(this, arguments);
                var projection = buildMapProjection(floorId);
                core.removeGlobalAnimate();
                core.deleteCanvas(function (name) { return name.indexOf("_bigImage_") === 0; });
                return withMapProjection(projection, this, originalDrawMapAll, arguments);
            };

            // 楼层贴图的隐藏 flag 使用规范像素坐标命名。每次绘制都按规范
            // flag 过滤；绘制投影副本时屏蔽同名屏幕坐标 flag，避免它误伤
            // 由另一个逻辑位置旋转到此处的可见贴图。
            var originalDrawFloorImages = core.maps._drawFloorImages;
            core.maps._drawFloorImages = function (floorId, ctx, name, images, currStatus, onMap) {
                floorId = floorId || core.status.floorId;
                if (!hasMapOrientation(floorId)) return originalDrawFloorImages.apply(this, arguments);
                if (!images && activeMapProjection && activeMapProjection.floorId === floorId) {
                    images = activeMapProjection.images;
                }
                var sourceImages = images || [];
                var projected = sourceImages.filter(function (one) {
                    return one && one[PROJECTED_FLOOR_IMAGE];
                });
                if (!projected.length) return originalDrawFloorImages.apply(this, arguments);

                // 显隐状态始终以规范地图里的像素坐标为键；动画帧也重新读取，
                // 不把投影构建时的一次快照当成长期状态。
                var visibleImages = sourceImages.filter(function (one) {
                    var source = one && one[PROJECTED_FLOOR_IMAGE];
                    if (!source) return true;
                    return !core.hasFlag("__floorImg__" + floorId + "_" + source.x + "_" + source.y);
                });
                var flags = core.status.hero && core.status.hero.flags;
                if (!flags) {
                    return originalDrawFloorImages.call(this, floorId, ctx, name,
                        visibleImages, currStatus, onMap);
                }
                var saved = {};
                visibleImages.forEach(function (one) {
                    if (!one || !one[PROJECTED_FLOOR_IMAGE]) return;
                    var key = "__floorImg__" + floorId + "_" + one.x + "_" + one.y;
                    if (saved[key]) return;
                    saved[key] = {
                        exists: Object.prototype.hasOwnProperty.call(flags, key),
                        value: flags[key]
                    };
                    delete flags[key];
                });
                try {
                    return originalDrawFloorImages.call(this, floorId, ctx, name,
                        visibleImages, currStatus, onMap);
                } finally {
                    Object.keys(saved).forEach(function (key) {
                        if (saved[key].exists) flags[key] = saved[key].value;
                        else delete flags[key];
                    });
                }
            };

            // setBlock、全局动画等增量入口同样接收一个投影后的标准 block。
            // 全量投影中的 block 已有标记，不会发生二次映射。
            var originalDrawBlock = core.maps.drawBlock;
            core.maps.drawBlock = function (block, animate, ctx) {
                if (!hasMapOrientation() || projectionRenderDepth > 0 || projectedOperationDepth > 0
                    || !isMapDrawingContext(ctx)) {
                    return originalDrawBlock.apply(this, arguments);
                }
                // 动画队列里保存的已经是屏幕坐标；用操作深度告诉开关门
                // 兼容层不要再把 _drawBlockInfo 的无 ctx 调用旋转一次。
                if (isProjectedBlock(block)) {
                    return runProjectedOperation(this, originalDrawBlock, arguments);
                }
                return runProjectedOperation(this, originalDrawBlock,
                    [projectBlock(block, core.status.floorId), animate, ctx]);
            };

            var originalAddGlobalAnimate = core.maps.addGlobalAnimate;
            core.maps.addGlobalAnimate = function (block) {
                if (projectionRenderDepth > 0) {
                    // bg/fg 图块由标准数组现场 initBlock，没有事件层投影块的
                    // 标记；入动画队列前补上，避免下一帧再次旋转。
                    if (block && !isProjectedBlock(block)) markProjectedBlock(block);
                    return originalAddGlobalAnimate.apply(this, arguments);
                }
                if (!hasMapOrientation() || projectedOperationDepth > 0 || isProjectedBlock(block)) {
                    return originalAddGlobalAnimate.apply(this, arguments);
                }
                return runProjectedOperation(this, originalAddGlobalAnimate,
                    [projectBlock(block, core.status.floorId)]);
            };

            var originalRemoveGlobalAnimate = core.maps.removeGlobalAnimate;
            core.maps.removeGlobalAnimate = function (x, y, name) {
                if (x == null || y == null || !hasMapOrientation()
                    || projectionRenderDepth > 0 || projectedOperationDepth > 0) {
                    return originalRemoveGlobalAnimate.apply(this, arguments);
                }
                var screen = logicalCellToScreen(x, y);
                return runProjectedOperation(this, originalRemoveGlobalAnimate, [screen.x, screen.y, name]);
            };

            // 原生删除会清除 event/event2、全局动画和大图块；给它投影 block
            // 即可精确清掉一个屏幕格，无需用 redrawMap 掩盖错位。
            var originalRemoveBlockFromMap = core.maps._removeBlockFromMap;
            core.maps._removeBlockFromMap = function (floorId, block) {
                if (!hasMapOrientation(floorId) || projectionRenderDepth > 0
                    || projectedOperationDepth > 0 || isProjectedBlock(block)) {
                    return originalRemoveBlockFromMap.apply(this, arguments);
                }
                return runProjectedOperation(this, originalRemoveBlockFromMap,
                    [floorId, projectBlock(block, floorId)]);
            };

            // 开关门是引擎内唯一绕过 drawBlock、直接调用绘制原语的地图动画。
            // 在这个遗留边界把参数变成标准屏幕坐标，原语本身仍保持原版。
            var originalDrawBlockInfo = core.maps._drawBlockInfo;
            core.maps._drawBlockInfo = function (blockInfo, x, y, ctx) {
                if (ctx != null || !hasMapOrientation() || projectionRenderDepth > 0
                    || projectedOperationDepth > 0) return originalDrawBlockInfo.apply(this, arguments);
                var screen = logicalCellToScreen(x, y);
                return runProjectedOperation(this, originalDrawBlockInfo,
                    [projectBlockInfoDirection(blockInfo), screen.x, screen.y, ctx]);
            };

            // Autotile 动画需要查询邻接数组；动画帧期间临时提供最新的投影
            // 地图，仍由引擎原生算法拼接四个子块。
            var originalAutotileAnimate = core.maps._drawAutotileAnimate;
            core.maps._drawAutotileAnimate = function (block, animate) {
                if (!hasMapOrientation()) return originalAutotileAnimate.apply(this, arguments);
                var projection = buildMapProjection(core.status.floorId);
                var shown = isProjectedBlock(block) ? block : projectBlock(block, core.status.floorId);
                return withMapProjection(projection, this, originalAutotileAnimate, [shown, animate]);
            };

            // 人物和跟随者也先形成标准屏幕坐标状态，再调用原版 drawHero。
            var originalDrawHero = core.control.drawHero;
            core.control.drawHero = function (status, offset, frame) {
                if (!hasMapOrientation() || projectedOperationDepth > 0) {
                    return originalDrawHero.apply(this, arguments);
                }
                var hero = core.status.hero;
                var logicalLoc = hero.loc;
                var logicalFollowers = hero.followers;
                var quarter = getViewQuarter();
                var screen = logicalCellToScreen(logicalLoc.x, logicalLoc.y, quarter);
                hero.loc = Object.assign({}, logicalLoc, {
                    x: screen.x,
                    y: screen.y,
                    direction: CubeWorld.logicalToScreenDirection(logicalLoc.direction, quarter) || logicalLoc.direction
                });
                hero.followers = (logicalFollowers || []).map(function (one) {
                    var cell = CubeWorld.logicalToScreenCell(one.x, one.y, currentFaceSize(), quarter);
                    return Object.assign({}, one, {
                        x: cell.x,
                        y: cell.y,
                        direction: CubeWorld.logicalToScreenDirection(one.direction, quarter) || one.direction
                    });
                });
                var shownOffset = offset;
                if (offset && typeof offset === "object") {
                    if (!offset[SCREEN_OFFSET]) {
                        var vector = projectVector(offset.x || 0, offset.y || 0, quarter);
                        shownOffset = Object.assign({}, offset, vector);
                    }
                }
                projectedOperationDepth++;
                try {
                    return originalDrawHero.call(this, status, shownOffset, frame);
                } finally {
                    projectedOperationDepth--;
                    hero.loc = logicalLoc;
                    hero.followers = logicalFollowers;
                }
            };

            // 原生跳跃把“沿地图移动”和“向屏幕上方抬升”合并在同一个 y
            // 偏移里。前者随地图朝向换算，后者是素材演出，必须保持竖直。
            var originalJumpHeroJumping = core.events._jumpHero_jumping;
            core.events._jumpHero_jumping = function (jumpInfo) {
                if (!hasMapOrientation()) return originalJumpHeroJumping.apply(this, arguments);
                core.clearMap("hero");
                core.maps.__updateJumpInfo(jumpInfo);
                var x = core.getHeroLoc("x"), y = core.getHeroLoc("y");
                var base = mapMovingCellTopLeft(32 * jumpInfo.x, 32 * jumpInfo.y);
                var start = logicalCellToScreen(x, y);
                var lift = 32 * jumpInfo.y - jumpInfo.py;
                var offset = {
                    x: base.x - start.x * 32,
                    y: base.y - start.y * 32 - lift
                };
                try {
                    Object.defineProperty(offset, SCREEN_OFFSET, { value: true });
                } catch (e) {
                    offset[SCREEN_OFFSET] = true;
                }
                core.drawHero("stop", offset);
            };

            // 移动、跳跃、淡入淡出图块使用屏幕坐标和屏幕方向调用原版
            // 动态画布逻辑，素材像素本身始终不旋转。
            var originalMoveDetachedBlock = core.maps._moveDetachedBlock;
            core.maps._moveDetachedBlock = function (blockInfo, nowX, nowY, opacity, canvases) {
                if (!hasMapOrientation() || projectedOperationDepth > 0) {
                    return originalMoveDetachedBlock.apply(this, arguments);
                }
                var screen = mapMovingCellTopLeft(nowX, nowY);
                return runProjectedOperation(this, originalMoveDetachedBlock,
                    [projectBlockInfoDirection(blockInfo), screen.x, screen.y, opacity, canvases]);
            };

            var originalJumpBlockJumping = core.maps._jumpBlock_jumping;
            core.maps._jumpBlock_jumping = function (blockInfo, canvases, jumpInfo) {
                if (!hasMapOrientation()) return originalJumpBlockJumping.apply(this, arguments);
                core.maps.__updateJumpInfo(jumpInfo);
                var base = mapMovingCellTopLeft(32 * jumpInfo.x, 32 * jumpInfo.y);
                var lift = 32 * jumpInfo.y - jumpInfo.py;
                return runProjectedOperation(this, originalMoveDetachedBlock, [
                    projectBlockInfoDirection(blockInfo), base.x, base.y - lift,
                    jumpInfo.opacity, canvases
                ]);
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
                core.status.damage.data = (data || []).map(mapEntry);
                core.status.damage.extraData = (extraData || []).map(mapEntry);
                try {
                    return originalDamageDraw.apply(this, arguments);
                } finally {
                    core.status.damage.data = data;
                    core.status.damage.extraData = extraData;
                }
            };

            // 普通动画在创建时一次性投影中心点，后续帧完全走引擎原版。
            var originalDrawAnimate = maps.prototype.drawAnimate;
            var projectedDrawAnimate = function (name, x, y, alignWindow, callback) {
                // alignWindow=true 明确表示视口相对坐标，属于屏幕空间，不能再
                // 当作逻辑地图格旋转。
                if (alignWindow || !core.status || !isFace(core.status.floorId)
                    || projectedOperationDepth > 0 || x == null || y == null) {
                    return originalDrawAnimate.apply(this, arguments);
                }
                var screen = logicalCellToScreen(x, y);
                var id = runProjectedOperation(this, originalDrawAnimate,
                    [name, screen.x, screen.y, alignWindow, callback]);
                var obj = (core.status.animateObjs || []).filter(function (one) {
                    return one.id === id;
                })[0];
                if (obj) {
                    try {
                        Object.defineProperty(obj, PROJECTED_ANIMATE, { value: true });
                    } catch (e) {
                        obj[PROJECTED_ANIMATE] = true;
                    }
                }
                return id;
            };
            // 玩法设置会把实例方法恢复为 maps.prototype.drawAnimate。同步更新
            // 原型，确保任何合法的运行时重绑定都不会丢失六面坐标投影。
            maps.prototype.drawAnimate = projectedDrawAnimate;
            core.maps.drawAnimate = projectedDrawAnimate;

            var originalDrawRoute = core.control._setAutomaticRoute_drawRoute;
            core.control._setAutomaticRoute_drawRoute = function (moveStep) {
                if (!hasMapOrientation()) return originalDrawRoute.apply(this, arguments);
                var quarter = getViewQuarter();
                var shown = moveStep.map(function (one) {
                    var cell = CubeWorld.logicalToScreenCell(one.x, one.y, currentFaceSize(), quarter);
                    return Object.assign({}, one, {
                        x: cell.x,
                        y: cell.y,
                        direction: CubeWorld.logicalToScreenDirection(one.direction, quarter) || one.direction
                    });
                });
                return runProjectedOperation(this, originalDrawRoute, [shown]);
            };

            var originalClearRouteNode = core.control.clearAutomaticRouteNode;
            core.control.clearAutomaticRouteNode = function (x, y) {
                if (!hasMapOrientation() || projectedOperationDepth > 0) {
                    return originalClearRouteNode.apply(this, arguments);
                }
                var screen = logicalCellToScreen(x, y);
                return runProjectedOperation(this, originalClearRouteNode, [screen.x, screen.y]);
            };
        }

        function clearProjectedAnimates() {
            if (!core.status || !core.status.animateObjs) return;
            core.status.animateObjs.filter(function (one) {
                return one && one[PROJECTED_ANIMATE];
            }).map(function (one) {
                return one.id;
            }).forEach(function (id) {
                // 取消旧坐标的显示，但保留原动画的完成回调，避免异步事件
                // 队列因朝向或楼层变化而失去续行信号。
                core.stopAnimate(id, true);
            });
        }

        function redrawMapOrientation() {
            if (!core.status || !core.status.played || !isFace(core.status.floorId) || !core.status.maps) {
                return getViewQuarter();
            }
            // 朝向切换后，旧队列中的 block 和大图块画布仍带有上一个屏幕
            // 坐标；全量生成新投影前先丢弃这些显示缓存。
            clearProjectedAnimates();
            if (core.plugin.clearAttractAnimate) core.plugin.clearAttractAnimate();
            core.removeGlobalAnimate();
            core.deleteCanvas(function (name) { return name.indexOf("_bigImage_") === 0; });
            core.redrawMap();
            core.drawHero();
            if (core.plugin.clearCommentSign) core.plugin.clearCommentSign();
            if (core.plugin.drawCommentSign) core.plugin.drawCommentSign();
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
            clearProjectedAnimates();
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
            // DOM 输入始终保留原始屏幕像素，让菜单、小地图等屏幕 UI 能按
            // 所见位置响应。只有原生地图寻路处理器收到参数时才换成逻辑格。
            var originalSysOnDown = core.actions._sys_ondown;
            var originalSysOnMove = core.actions._sys_onmove;
            var originalSysOnUp = core.actions._sys_onup;

            function mapActionPoint(x, y, px, py) {
                if (!hasMapOrientation()) return { x: x, y: y, px: px, py: py };
                var mapPx = px + core.bigmap.offsetX;
                var mapPy = py + core.bigmap.offsetY;
                var screenX = Math.floor(mapPx / 32);
                var screenY = Math.floor(mapPy / 32);
                var size = currentFaceSize();
                if (screenX < 0 || screenY < 0 || screenX >= size || screenY >= size) {
                    return { x: x, y: y, px: px, py: py };
                }
                var logical = screenCellToLogical(screenX, screenY);
                return {
                    x: logical.x,
                    y: logical.y,
                    px: logical.x * 32 + mapPx - screenX * 32 - core.bigmap.offsetX,
                    py: logical.y * 32 + mapPy - screenY * 32 - core.bigmap.offsetY
                };
            }

            function redrawTouchRoute() {
                if (!hasMapOrientation() || core.status.preview.enabled) return;
                var route = core.status.stepPostfix || [];
                // 原生处理器刚按逻辑格画过提示点；只擦除这些 8px 标记，
                // 不清空可能同在 ui 层的其他屏幕内容。
                route.forEach(function (one) {
                    core.clearMap("ui",
                        one.x * 32 + 12 - core.bigmap.offsetX,
                        one.y * 32 + 12 - core.bigmap.offsetY,
                        8, 8);
                });
                route.forEach(function (one) {
                    var screen = logicalCellToScreen(one.x, one.y);
                    core.fillRect("ui",
                        screen.x * 32 + 12 - core.bigmap.offsetX,
                        screen.y * 32 + 12 - core.bigmap.offsetY,
                        8, 8, "#bfbfbf");
                });
            }

            core.registerAction("ondown", "_sys_ondown", function (x, y, px, py) {
                var point = mapActionPoint(x, y, px, py);
                var result = originalSysOnDown.call(this, point.x, point.y, point.px, point.py);
                redrawTouchRoute();
                return result;
            }, 0);
            core.registerAction("onmove", "_sys_onmove", function (x, y, px, py) {
                var point = mapActionPoint(x, y, px, py);
                var result = originalSysOnMove.call(this, point.x, point.y, point.px, point.py);
                redrawTouchRoute();
                return result;
            }, 0);
            core.registerAction("onup", "_sys_onup", function (x, y, px, py) {
                var point = mapActionPoint(x, y, px, py);
                return originalSysOnUp.call(this, point.x, point.y, point.px, point.py);
            }, 0);

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

            // [disabled] feat 自带的 C 键(67) 3D 地图触发器已按需求禁用；引擎与 viewer 其余逻辑保留
            // core.registerAction("keyUp", "cube-world-viewer", function (keyCode) {
            //     if (keyCode !== 67 || !core.status.played) return false;
            //     toggleViewer();
            //     return true;
            // }, 200);

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
            buildMapProjection: buildMapProjection,
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
