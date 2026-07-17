/*
 * 立方体世界的纯几何与纯计算内核。
 *
 * 本文件不依赖 mota-js 的 core，因此既能在浏览器中使用，也能直接由 Node
 * 测试。所有跨面功能必须通过这里的 step() 获取“位置 + 新朝向”，禁止在
 * 其他文件中维护第二份邻接表或坐标反转表。
 */
(function (root, factory) {
    var api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    if (root) root.CubeWorld = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";

    var FACE_IDS = ["MT0", "MT1", "MT2", "MT3", "MT4", "MT5"];
    var FACE_TITLES = {
        MT0: "正面",
        MT1: "后面",
        MT2: "左面",
        MT3: "右面",
        MT4: "顶面",
        MT5: "底面"
    };

    // n: 面朝外法向；u: 屏幕向右；v: 屏幕向下。
    // 邻接关系和沿边坐标是否反转均由这三个向量推导，不另设人工反转表。
    var FRAMES = {
        MT0: { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
        MT1: { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
        MT2: { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
        MT3: { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
        MT4: { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
        MT5: { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] }
    };

    var DIRECTIONS = ["up", "right", "down", "left"];
    var DIRECTION8 = [
        "up", "rightup", "right", "rightdown",
        "down", "leftdown", "left", "leftup"
    ];
    var OPPOSITE = {
        up: "down", down: "up", left: "right", right: "left",
        leftup: "rightdown", rightdown: "leftup",
        rightup: "leftdown", leftdown: "rightup"
    };
    var SCAN = {
        up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0]
    };

    function directionIndex(direction) {
        return DIRECTIONS.indexOf(direction);
    }

    function normalizeQuarter(quarter) {
        quarter = Number(quarter) || 0;
        return ((Math.round(quarter) % 4) + 4) % 4;
    }

    // 画面顺时针旋转 quarter 个 90 度后，逻辑方向在屏幕上的朝向。
    function logicalToScreenDirection(direction, quarter) {
        var index = directionIndex(direction);
        if (index < 0) return null;
        return DIRECTIONS[(index + normalizeQuarter(quarter)) % 4];
    }

    // 玩家按下的是屏幕方向；运行时必须换算回当前面的规范坐标方向。
    function screenToLogicalDirection(direction, quarter) {
        var index = directionIndex(direction);
        if (index < 0) return null;
        return DIRECTIONS[(index - normalizeQuarter(quarter) + 4) % 4];
    }

    // 跨面前后的逻辑方向可能不同。调整目标面的显示角度，使前进方向
    // 在屏幕上保持不变，从而让两张地图的出口边和入口边视觉相接。
    function viewQuarterAfterCross(currentQuarter, sourceDirection, targetDirection) {
        var sourceIndex = directionIndex(sourceDirection);
        var targetIndex = directionIndex(targetDirection);
        if (sourceIndex < 0 || targetIndex < 0) return normalizeQuarter(currentQuarter);
        return normalizeQuarter(currentQuarter + sourceIndex - targetIndex);
    }

    function add(a, b) {
        return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
    }

    function sub(a, b) {
        return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    }

    function scale(a, value) {
        return [a[0] * value, a[1] * value, a[2] * value];
    }

    function dot(a, b) {
        return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    }

    function vectorKey(a) {
        return a.join(",");
    }

    function sign(value) {
        return value < 0 ? -1 : value > 0 ? 1 : 0;
    }

    function worldDirection(frame, direction) {
        if (direction === "left") return scale(frame.u, -1);
        if (direction === "right") return frame.u.slice();
        if (direction === "up") return scale(frame.v, -1);
        if (direction === "down") return frame.v.slice();
        return null;
    }

    function directionFromSigns(x, y) {
        if (x < 0 && y < 0) return "leftup";
        if (x > 0 && y < 0) return "rightup";
        if (x < 0 && y > 0) return "leftdown";
        if (x > 0 && y > 0) return "rightdown";
        if (x < 0) return "left";
        if (x > 0) return "right";
        if (y < 0) return "up";
        if (y > 0) return "down";
        return null;
    }

    function cloneState(state) {
        var result = {
            floorId: state.floorId,
            x: state.x,
            y: state.y,
            direction: state.direction
        };
        if (state.distance != null) result.distance = state.distance;
        return result;
    }

    function createGeometry(options) {
        options = options || {};
        var defaultSize = options.size || 13;
        var sizes = options.sizes || {};
        var edgeCache = {};
        var areaCache = {};
        var kingGraph = null;

        function getSize(floorId) {
            var one = sizes[floorId];
            if (typeof one === "number") return { width: one, height: one };
            if (one) return { width: one.width, height: one.height };
            return { width: defaultSize, height: defaultSize };
        }

        function isFace(floorId) {
            return FACE_IDS.indexOf(floorId) >= 0;
        }

        function assertState(state) {
            if (!state || !isFace(state.floorId)) throw new Error("未知立方体面: " + (state && state.floorId));
            var size = getSize(state.floorId);
            if (!Number.isInteger(state.x) || !Number.isInteger(state.y)
                || state.x < 0 || state.y < 0 || state.x >= size.width || state.y >= size.height) {
                throw new Error("坐标越界: " + state.floorId + "(" + state.x + "," + state.y + ")");
            }
        }

        function deriveEdge(floorId, direction) {
            var cacheKey = floorId + ":" + direction;
            if (edgeCache[cacheKey]) return edgeCache[cacheKey];
            if (!isFace(floorId) || !SCAN[direction]) return null;

            var source = FRAMES[floorId];
            var targetNormal = worldDirection(source, direction);
            var targetFace = FACE_IDS.filter(function (id) {
                return vectorKey(FRAMES[id].n) === vectorKey(targetNormal);
            })[0];
            if (!targetFace) throw new Error("无法推导相邻面: " + cacheKey);

            var target = FRAMES[targetFace];
            var targetEdge = DIRECTIONS.filter(function (candidate) {
                return vectorKey(worldDirection(target, candidate)) === vectorKey(source.n);
            })[0];
            if (!targetEdge) throw new Error("无法推导目标边: " + cacheKey);

            var sourceTangent = direction === "left" || direction === "right" ? source.v : source.u;
            var targetTangent = targetEdge === "left" || targetEdge === "right" ? target.v : target.u;
            var reverse = dot(sourceTangent, targetTangent) < 0;
            var result = {
                sourceFace: floorId,
                sourceEdge: direction,
                targetFace: targetFace,
                targetEdge: targetEdge,
                reverse: reverse,
                direction: OPPOSITE[targetEdge]
            };
            edgeCache[cacheKey] = result;
            return result;
        }

        function step(state, direction) {
            assertState(state);
            direction = direction || state.direction;
            if (!SCAN[direction]) return null;
            var sourceSize = getSize(state.floorId);
            var delta = SCAN[direction];
            var nx = state.x + delta[0];
            var ny = state.y + delta[1];
            if (nx >= 0 && ny >= 0 && nx < sourceSize.width && ny < sourceSize.height) {
                return {
                    floorId: state.floorId,
                    x: nx,
                    y: ny,
                    direction: direction,
                    crossed: false,
                    sourceEdge: null,
                    targetEdge: null
                };
            }

            var edge = deriveEdge(state.floorId, direction);
            var targetSize = getSize(edge.targetFace);
            var sourceLength = direction === "left" || direction === "right" ? sourceSize.height : sourceSize.width;
            var targetLength = edge.targetEdge === "left" || edge.targetEdge === "right" ? targetSize.height : targetSize.width;
            if (sourceLength !== targetLength) {
                throw new Error("相邻边长度不一致: " + state.floorId + "/" + direction);
            }
            var t = direction === "left" || direction === "right" ? state.y : state.x;
            if (edge.reverse) t = targetLength - 1 - t;
            var x;
            var y;
            if (edge.targetEdge === "up") { x = t; y = 0; }
            if (edge.targetEdge === "down") { x = t; y = targetSize.height - 1; }
            if (edge.targetEdge === "left") { x = 0; y = t; }
            if (edge.targetEdge === "right") { x = targetSize.width - 1; y = t; }
            return {
                floorId: edge.targetFace,
                x: x,
                y: y,
                direction: edge.direction,
                crossed: true,
                sourceEdge: direction,
                targetEdge: edge.targetEdge
            };
        }

        function stateKey(state, withDirection) {
            var key = state.floorId + ":" + state.x + ":" + state.y;
            return withDirection ? key + ":" + (state.direction || "") : key;
        }

        function cellCenter(state) {
            assertState(state);
            var size = getSize(state.floorId);
            if (size.width !== size.height) throw new Error("三维格点图目前要求每个面为正方形");
            var n = size.width;
            var frame = FRAMES[state.floorId];
            return add(add(
                scale(frame.n, n),
                scale(frame.u, -n + 2 * state.x + 1)
            ), scale(frame.v, -n + 2 * state.y + 1));
        }

        function cellCorners(state) {
            assertState(state);
            var size = getSize(state.floorId);
            if (size.width !== size.height) throw new Error("三维格点图目前要求每个面为正方形");
            var n = size.width;
            var frame = FRAMES[state.floorId];
            return [[state.x, state.y], [state.x + 1, state.y], [state.x, state.y + 1], [state.x + 1, state.y + 1]].map(function (point) {
                return add(add(
                    scale(frame.n, n),
                    scale(frame.u, -n + 2 * point[0])
                ), scale(frame.v, -n + 2 * point[1]));
            });
        }

        function cardinalNeighbors(state) {
            return DIRECTIONS.map(function (direction) {
                var next = step(state, direction);
                return { state: next, direction: direction };
            });
        }

        function buildKingGraph() {
            if (kingGraph) return kingGraph;
            var vertexCells = {};
            var cells = {};
            FACE_IDS.forEach(function (floorId) {
                var size = getSize(floorId);
                for (var y = 0; y < size.height; y++) {
                    for (var x = 0; x < size.width; x++) {
                        var state = { floorId: floorId, x: x, y: y, direction: "up" };
                        var key = stateKey(state);
                        cells[key] = state;
                        cellCorners(state).forEach(function (corner) {
                            var vk = vectorKey(corner);
                            if (!vertexCells[vk]) vertexCells[vk] = [];
                            vertexCells[vk].push(key);
                        });
                    }
                }
            });

            var graph = {};
            Object.keys(cells).forEach(function (key) { graph[key] = {}; });
            Object.keys(vertexCells).forEach(function (vertex) {
                var list = vertexCells[vertex];
                list.forEach(function (a) {
                    list.forEach(function (b) {
                        if (a !== b) graph[a][b] = true;
                    });
                });
            });

            kingGraph = { cells: cells, graph: graph };
            return kingGraph;
        }

        function kingNeighbors(state) {
            assertState(state);
            var built = buildKingGraph();
            var key = stateKey(state);
            var center = cellCenter(state);
            var frame = FRAMES[state.floorId];
            var order = {};
            DIRECTION8.forEach(function (direction, index) { order[direction] = index; });
            return Object.keys(built.graph[key]).map(function (targetKey) {
                var target = cloneState(built.cells[targetKey]);
                var delta = sub(cellCenter(target), center);
                var direction = directionFromSigns(sign(dot(delta, frame.u)), sign(dot(delta, frame.v)));
                return { state: target, direction: direction };
            }).sort(function (a, b) {
                var byDirection = (order[a.direction] || 0) - (order[b.direction] || 0);
                return byDirection || stateKey(a.state).localeCompare(stateKey(b.state));
            });
        }

        function neighbors(state, square) {
            return square ? kingNeighbors(state) : cardinalNeighbors(state);
        }

        function neighborsInDirection(state, direction) {
            if (SCAN[direction]) return [{ state: step(state, direction), direction: direction }];
            return kingNeighbors(state).filter(function (one) { return one.direction === direction; });
        }

        function area(state, range, square) {
            assertState(state);
            range = Math.max(0, Math.floor(range || 0));
            var cacheKey = stateKey(state) + ":" + range + ":" + (square ? "8" : "4");
            if (areaCache[cacheKey]) return areaCache[cacheKey].map(cloneState);
            var visited = {};
            var queue = [{ state: cloneState(state), distance: 0 }];
            visited[stateKey(state)] = 0;
            for (var index = 0; index < queue.length; index++) {
                var current = queue[index];
                if (current.distance >= range) continue;
                neighbors(current.state, square).forEach(function (entry) {
                    var key = stateKey(entry.state);
                    if (visited[key] != null) return;
                    visited[key] = current.distance + 1;
                    queue.push({ state: cloneState(entry.state), distance: current.distance + 1 });
                });
            }
            var result = queue.map(function (one) {
                var value = cloneState(one.state);
                value.distance = one.distance;
                return value;
            });
            areaCache[cacheKey] = result;
            return result.map(cloneState);
        }

        function distance(from, to, square, maxDistance) {
            assertState(from);
            assertState(to);
            if (stateKey(from) === stateKey(to)) return 0;
            var maximum = maxDistance == null ? FACE_IDS.length * defaultSize * defaultSize : maxDistance;
            var cells = area(from, maximum, square);
            var targetKey = stateKey(to);
            for (var i = 0; i < cells.length; i++) {
                if (stateKey(cells[i]) === targetKey) return cells[i].distance;
            }
            return Infinity;
        }

        function areAdjacentFaces(a, b) {
            if (!isFace(a) || !isFace(b) || a === b) return false;
            return DIRECTIONS.some(function (direction) {
                return deriveEdge(a, direction).targetFace === b;
            });
        }

        function trace(state, direction, options) {
            options = options || {};
            var maximum = options.maxSteps || FACE_IDS.length * defaultSize * 2;
            var maximumCrossings = options.maxCrossings == null ? Infinity : options.maxCrossings;
            var current = cloneState(state);
            current.direction = direction || current.direction;
            var visited = {};
            var result = [];
            var crossings = 0;
            visited[stateKey(current, true)] = true;
            for (var stepIndex = 1; stepIndex <= maximum; stepIndex++) {
                var next = step(current, current.direction);
                if (next.crossed) crossings++;
                if (crossings > maximumCrossings) break;
                var nextKey = stateKey(next, true);
                // 封闭立方体上的直线最终会绕回原处。结果只包含尚未访问的
                // 后继格，避免把发射源再次作为射线终点返回。
                if (visited[nextKey]) break;
                visited[nextKey] = true;
                next.step = stepIndex;
                next.crossings = crossings;
                result.push(next);
                if (options.stop && options.stop(next)) break;
                current = next;
            }
            return result;
        }

        return {
            faces: FACE_IDS.slice(),
            titles: Object.assign({}, FACE_TITLES),
            frames: FRAMES,
            isFace: isFace,
            size: getSize,
            edge: deriveEdge,
            step: step,
            trace: trace,
            stateKey: stateKey,
            cellCenter: cellCenter,
            cellCorners: cellCorners,
            cardinalNeighbors: cardinalNeighbors,
            kingNeighbors: kingNeighbors,
            neighbors: neighbors,
            neighborsInDirection: neighborsInDirection,
            area: area,
            distance: distance,
            areAdjacentFaces: areAdjacentFaces,
            opposite: function (direction) { return OPPOSITE[direction]; }
        };
    }

    function stableStringify(value) {
        var stack = [];

        function encode(one) {
            if (one === null) return "null";
            if (typeof one === "string" || typeof one === "boolean") return JSON.stringify(one);
            if (typeof one === "number") {
                if (Number.isNaN(one)) return '"__NaN__"';
                if (one === Infinity) return '"__Infinity__"';
                if (one === -Infinity) return '"__-Infinity__"';
                return JSON.stringify(one);
            }
            if (typeof one === "undefined") return '"__undefined__"';
            if (typeof one === "function" || typeof one === "symbol" || typeof one === "bigint") {
                throw new Error("不支持序列化的状态类型: " + typeof one);
            }
            if (stack.indexOf(one) >= 0) throw new Error("状态中存在循环引用");
            stack.push(one);
            var result;
            if (Array.isArray(one)) {
                result = "[" + one.map(encode).join(",") + "]";
            } else {
                result = "{" + Object.keys(one).sort().map(function (key) {
                    return JSON.stringify(key) + ":" + encode(one[key]);
                }).join(",") + "}";
            }
            stack.pop();
            return result;
        }

        try {
            return encode(value);
        } catch (e) {
            return null;
        }
    }

    // 精确模拟“吸噬”对怪物存活回合数的影响。护盾只抵消勇士实际
    // 承受的伤害，被护盾抵消的部分不会触发回复。
    function simulateAbsorb(options) {
        options = options || {};
        var monsterHp = Math.max(0, Number(options.monsterHp) || 0);
        var heroDamage = Math.max(0, Number(options.heroDamage) || 0);
        var shield = Math.max(0, Number(options.shield) || 0);
        var absorb = Math.max(0, Number(options.absorb) || 0);
        var firstStrike = Math.max(0, Number(options.firstStrike) || 0);
        var counterDamage = Math.max(0, Number(options.counterDamage) || 0);
        var regularDamage = Math.max(0, Number(options.regularDamage) || 0);
        var beforeFirst = Math.max(0, Number(options.nonAttackBeforeFirst) || 0);
        var afterFirst = Math.max(0, Number(options.nonAttackAfterFirst) || 0);
        var maximum = Math.max(1, Number(options.maxTurns) || 1000000);
        var healed = 0;

        function receive(amount, canHeal) {
            var blocked = Math.min(shield, amount);
            shield -= blocked;
            var actual = amount - blocked;
            if (canHeal && actual > 0) {
                var value = actual * absorb;
                monsterHp += value;
                healed += value;
            }
        }

        if (heroDamage <= 0) return { winnable: false, turn: Infinity, reason: "no-damage" };
        receive(beforeFirst, false);
        receive(firstStrike, true);
        receive(afterFirst, false);

        for (var turn = 1; turn <= maximum; turn++) {
            var hpBeforeHit = monsterHp;
            // 反击按勇士的攻击次数触发，包含最后一击；先结算它可让战斗
            // 伤害公式与吸噬的生命递推使用同一条时间线。
            receive(counterDamage, true);
            monsterHp -= heroDamage;
            if (monsterHp <= 0) {
                return {
                    winnable: true,
                    turn: turn,
                    monsterHpBeforeFinalHit: hpBeforeHit,
                    healed: healed,
                    shieldRemaining: shield
                };
            }
            receive(regularDamage, true);

            // 护盾耗尽后每轮净生命不再下降，则之后也不可能获胜。
            if (shield <= 0 && monsterHp >= hpBeforeHit && monsterHp > heroDamage) {
                return { winnable: false, turn: Infinity, reason: "absorb-lock", healed: healed };
            }
        }
        return { winnable: false, turn: Infinity, reason: "turn-limit", healed: healed };
    }

    return {
        FACE_IDS: FACE_IDS.slice(),
        FACE_TITLES: Object.assign({}, FACE_TITLES),
        FRAMES: FRAMES,
        DIRECTIONS: DIRECTIONS.slice(),
        DIRECTION8: DIRECTION8.slice(),
        OPPOSITE: Object.assign({}, OPPOSITE),
        normalizeQuarter: normalizeQuarter,
        logicalToScreenDirection: logicalToScreenDirection,
        screenToLogicalDirection: screenToLogicalDirection,
        viewQuarterAfterCross: viewQuarterAfterCross,
        createGeometry: createGeometry,
        stableStringify: stableStringify,
        simulateAbsorb: simulateAbsorb
    };
});
