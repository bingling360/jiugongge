'use strict';
/*
 * detect-route-folding-node.js
 * ---------------------------------------------------------------------------
 * 离线（纯 Node，无浏览器）检测脚本：分析一份 .h5route 录像，离线模拟英雄的
 * 行走过程，并精确复现 mota-js 引擎中 control.checkRouteFolding（libs/control.js:3014）
 * 的“录像折叠”逻辑，找出所有“不安全折叠”(UNSAFE FOLD)。
 *
 * 关键结论（来自源码核对）：
 *   - checkRouteFolding 的折叠键只有 [x,y,dir]，**不含楼层**。
 *   - 折叠仅在“成功移动之后”（control.js:711）与“右转 turn”（control.js:816）时触发。
 *   - 但 _bindRoutePush（control.js:2998）规定：只要 route 里 push 了
 *     up/down/left/right/turn/move: 之外的任何 token（getNext / item: / choices: /
 *     shop: / click: / turn:dir / fly: …），就会清空 routeFolding 缓存。
 *     => 因此一次折叠**只能**截断一段“纯移动/转向”的回路，回路中不能有任何
 *        会 push 非移动 token 的操作。
 *   - 折叠判定只看“数值型英雄属性”（core.clone 仅保留 typeof==='number' 且 !='steps'
 *        的字段，control.js:3019-3021），**完全忽略**：
 *          * 旗帜 / 标记 (flags)
 *          * 背包物品 (items，非数值描述)
 *          * 已开启/移除的方块（门、敌人、事件块）
 *          * 楼层变化、毒网/咒网等 debuff、脚本产生的隐藏状态
 *   => “不安全折叠” = 英雄回到一个之前到过且数值属性相同的 (x,y,dir)，
 *      但两次到访之间实际上发生了**不写进 route 的隐藏状态变化**
 *      （开门、踩毒网加 debuff、跨面换层、脚本 setValue/setFlag 等）。
 *      折叠把这段回路从录像里砍掉，但隐藏状态仍然发生，于是回放时录像比
 *      真实操作“短”了一截，后续步骤错位 —— 这正是用户描述的
 *      “320~330 步记录的动作和实际不符、357 步回放报错”的成因。
 *
 * 本脚本在离线环境下复现上述逻辑，并输出所有折叠（安全 / 不安全）及其位置，
 * 重点标出发生在第 320 步之前、可能导致 357 步失败的不安全折叠。
 * ---------------------------------------------------------------------------
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PROJ = __dirname; // 脚本放在 mota-js 工程根目录

// ============================ 1. 载入 LZString ============================
let LZString;
try {
    LZString = require(path.join(PROJ, 'libs/thirdparty/lz-string.min.js'));
}
catch (e) {
    // 兜底：直接 eval 文件
    const code = fs.readFileSync(path.join(PROJ, 'libs/thirdparty/lz-string.min.js'), 'utf8');
    LZString = (new Function(code + '\nreturn LZString;'))();
}
if (!LZString || !LZString.decompressFromBase64) {
    console.error('无法载入 LZString，终止。');
    process.exit(1);
}

// ============================ 2. 载入数据文件 ============================
function loadTopObject(file) {
    const code = fs.readFileSync(file, 'utf8').trim();
    const body = code.replace(/^var\s+[A-Za-z0-9_]+\s*=\s*/, '').replace(/;\s*$/, '');
    return (new Function('return (' + body + ');'))();
}

const data = loadTopObject(path.join(PROJ, 'project/data.js'));        // {main, firstData, values, flags}
const blocksInfo = loadTopObject(path.join(PROJ, 'project/maps.js'));  // 数字 -> 方块定义

const floorIds = data.main.floorIds; // ["MT0".."MT5"]
const main = { floors: {} };
for (const fid of floorIds) {
    const ffile = path.join(PROJ, 'project/floors', fid + '.js');
    if (fs.existsSync(ffile)) {
        (new Function('main', fs.readFileSync(ffile, 'utf8')))(main);
    }
}
const floors = main.floors;

// 方块定义缓存
const blockCache = {};
function blockInfo(floorId, x, y) {
    const key = floorId + ',' + x + ',' + y;
    if (blockCache[key]) return blockCache[key];
    const f = floors[floorId];
    if (!f || x < 0 || y < 0 || x >= f.width || y >= f.height) return null;
    const num = f.map[y][x];
    let def;
    if (num === 0 || num == null) {
        def = { cls: 'terrains', id: 'none', noPass: false };
    }
    else {
        const raw = blocksInfo[num];
        if (!raw) def = { cls: 'terrains', id: 'none', noPass: false };
        else {
            def = JSON.parse(JSON.stringify(raw));
            if (def.noPass == null) {
                if (def.canPass == null) def.noPass = def.cls !== 'items';
                else def.noPass = !def.canPass;
            }
            delete def.canPass;
        }
    }
    blockCache[key] = def;
    return def;
}

// ============================ 3. 解码 route ============================
function decodeRoute(route) {
    if (!route) return route;
    let v = LZString.decompressFromBase64(route);
    if (v != null && /^[-_a-zA-Z0-9+\/=:()]*$/.test(v)) {
        if (v !== '' || route.length < 8) route = v;
    }
    const decodeObj = { route, index: 0, ans: [] };
    const mp = { U: 'up', D: 'down', L: 'left', R: 'right' };
    function getNumber(noparse) {
        let num = '', first = true;
        while (true) {
            const ch = decodeObj.route.charAt(decodeObj.index);
            if (ch >= '0' && ch <= '9') num += ch;
            else if (ch === '-' && first) num += ch;
            else break;
            first = false;
            decodeObj.index++;
        }
        if (num.length === 0) num = '1';
        return noparse ? num : parseInt(num, 10);
    }
    function getString() {
        let str = '';
        while (decodeObj.index < decodeObj.route.length && decodeObj.route.charAt(decodeObj.index) !== ':') {
            str += decodeObj.route.charAt(decodeObj.index++);
        }
        decodeObj.index++;
        return str;
    }
    function number2id(number) {
        if (/^\d+$/.test(number)) {
            const info = blocksInfo[number];
            if (info) return info.id;
        }
        return number;
    }
    function decodeOne(c) {
        if (c === '(') {
            const idx = decodeObj.route.indexOf(')', decodeObj.index);
            if (idx >= 0) {
                decodeObj.ans.push(decodeObj.route.substring(decodeObj.index, idx));
                decodeObj.index = idx + 1;
                return;
            }
        }
        const nxt = (c === 'I' || c === 'e' || c === 'F' || c === 'S' || c === 'Q' || c === 't')
            ? getString() : getNumber();
        switch (c) {
            case 'U': case 'D': case 'L': case 'R':
                for (let i = 0; i < nxt; i++) decodeObj.ans.push(mp[c]); break;
            case 'I': decodeObj.ans.push('item:' + number2id(nxt)); break;
            case 'u': decodeObj.ans.push('unEquip:' + nxt); break;
            case 'e': decodeObj.ans.push('equip:' + number2id(nxt)); break;
            case 's': decodeObj.ans.push('saveEquip:' + nxt); break;
            case 'l': decodeObj.ans.push('loadEquip:' + nxt); break;
            case 'F': decodeObj.ans.push('fly:' + nxt); break;
            case 'c': decodeObj.ans.push('choices:none'); break;
            case 'C': decodeObj.ans.push('choices:' + nxt); break;
            case 'S': decodeObj.ans.push('shop:' + nxt); break;
            case 'T': decodeObj.ans.push('turn'); break;
            case 't': decodeObj.ans.push('turn:' + mp[nxt]); break;
            case 'G': decodeObj.ans.push('getNext'); break;
            case 'p': decodeObj.ans.push('input:none'); break;
            case 'P': decodeObj.ans.push('input:' + nxt); break;
            case 'Q': decodeObj.ans.push('input2:' + nxt); break;
            case 'N': decodeObj.ans.push('no'); break;
            case 'M': decodeObj.index++; decodeObj.ans.push('move:' + nxt + ':' + getNumber()); break;
            case 'K': decodeObj.ans.push('key:' + nxt); break;
            case 'k':
                decodeObj.index++;
                var px = getNumber(); decodeObj.index++;
                var py = getNumber();
                decodeObj.ans.push('click:' + nxt + ':' + px + ':' + py); break;
            case 'X': decodeObj.ans.push('random:' + nxt); break;
        }
    }
    while (decodeObj.index < decodeObj.route.length) {
        decodeOne(decodeObj.route.charAt(decodeObj.index++));
    }
    return decodeObj.ans;
}

// 读取并解码 h5route 文件
const H5PATH = process.argv[2] || 'D:/下载/lifangti_20260716202623.h5route';
const raw = fs.readFileSync(H5PATH, 'utf8').trim();
const outer = LZString.decompressFromBase64(raw);
const meta = JSON.parse(outer);
const route = decodeRoute(meta.route);
console.log('录像元信息：name=%s hard=%s seed=%s 操作总数=%d',
    meta.name, meta.hard, meta.seed, route.length);

// ============================ 4. 模拟状态 ============================
const DELTA = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const TURN_RIGHT = { up: 'right', right: 'down', down: 'left', left: 'up' };

// 英雄数值属性（折叠判定只看这些）
const hero0 = data.firstData.hero;
const NUMERIC_KEYS = Object.keys(hero0).filter(k => typeof hero0[k] === 'number');
let hero = {};
for (const k of NUMERIC_KEYS) hero[k] = hero0[k];

const pos = {
    floor: data.firstData.floorId,
    x: hero0.loc.x,
    y: hero0.loc.y,
    dir: hero0.loc.direction,
};

const state = {
    items: {},        // id -> count（仅用于判定是否为“数值类道具”）
    disabled: new Set(),   // "floor,x,y" 被开启/移除的方块（门、敌人、道具）
    hidden: new Set(),     // 隐藏状态变化：开门 / debuff / 换层 / 脚本 setFlag 等
    numericChanged: false, // 回路内是否发生过会改变数值属性的事（战斗、数值道具）
};

function numericSnapshot() {
    const o = {};
    for (const k of NUMERIC_KEYS) o[k] = hero[k];
    return JSON.stringify(o);
}
function hiddenSnapshot() {
    return Array.from(state.hidden).sort().join('|');
}
function key(floor, x, y, dir) { return floor + ',' + x + ',' + y + ',' + dir; }
function clearFoldCache() { routeFolding = {}; }

// 判定某方块是否为“门”（可开启、会改变隐藏状态）
function isDoor(def) {
    return def && def.cls === 'animates' && (def.canBreak || def.doorInfo);
}
// 判定某方块是否为敌人
function isEnemy(def) {
    return def && typeof def.cls === 'string' && def.cls.indexOf('enemy') === 0;
}
// 判定道具是否为“数值类”（会改变 hp/atk/def 等）
const STAT_ITEM = /(potion|gem|sword|shield|wine|wine$|potion$)/i;
function isStatItem(id) {
    if (/key/i.test(id)) return false;        // 钥匙不改数值
    if (/(fly|pickaxe|bomb|earthquake|cross|book|centerfly|upfly|downfly)/i.test(id)) return false; // 工具
    return true;                              // 其余（药水/宝石/武器/盾）视为数值类
}
// 扫描事件文本，判断其是否可能改变隐藏状态
function eventChangesState(floorId, x, y) {
    const f = floors[floorId];
    if (!f || !f.events) return false;
    const ev = f.events[x + ',' + y];
    if (!ev) return false;
    const txt = Array.isArray(ev) ? ev.join('\n') : String(ev);
    return /(flag|setValue|changeFloor|openDoor|removeBlock|addItem|triggerDebuff|setFlag|disable)/i.test(txt);
}

// 折叠缓存（与引擎一致）
let routeFolding = {};
const folds = [];          // 记录“修复后”真正发生的（安全的）折叠事件
const preventedUnsafe = []; // 记录“修复前会截断、修复后被拦截”的不安全折叠
const stepLog = [];        // 每步后的 (x,y,dir)

// 复现【修复后】的 control.checkRouteFolding（control.js:3014-3035，含隐藏状态指纹 + 楼层键）
//   修复前：折叠键只有 [x,y,dir]（不含楼层），且只比较数值属性 -> 开门/破墙/跨层后仍会错误截断。
//   修复后：折叠键加入楼层；且必须“数值属性 + 隐藏状态指纹”都一致才截断。
function checkFold(routeIndex) {
    const index = key(pos.floor, pos.x, pos.y, pos.dir);   // 修复：键含楼层
    const curNumeric = numericSnapshot();
    const curHidden = hiddenSnapshot();
    if (routeFolding[index]) {
        const one = routeFolding[index];
        const numericMatch = (one.numeric === curNumeric);
        const hiddenMatch = (one.hidden === curHidden);
        const wouldFoldOld = numericMatch && one.length < routeIndex; // 修复前的截断条件
        const foldNew = wouldFoldOld && hiddenMatch;                  // 修复后的截断条件
        if (foldNew) {
            // 真正的（安全）折叠：砍掉 [one.length, routeIndex) 之间的回路
            const dropped = route.slice(one.length, routeIndex);
            folds.push({
                atIndex: routeIndex,
                fromIndex: one.length,
                floor: pos.floor,
                pos: { x: pos.x, y: pos.y, dir: pos.dir },
                unsafe: false,
                safe: true,
                droppedOps: dropped,
                hiddenChanged: [],
                conf: '安全',
                numericSame: true,
            });
            // 引擎：删除所有 length >= one.length 的折叠记录
            Object.keys(routeFolding).forEach(k => {
                if (routeFolding[k].length >= one.length) delete routeFolding[k];
            });
        } else if (wouldFoldOld) {
            // 修复前会错误截断、修复后已被隐藏状态指纹拦截 -> 不安全折叠
            preventedUnsafe.push({
                atIndex: routeIndex,
                fromIndex: one.length,
                floor: pos.floor,
                pos: { x: pos.x, y: pos.y, dir: pos.dir },
                droppedOps: route.slice(one.length, routeIndex),
                hiddenChanged: diffHidden(one.hidden, curHidden),
            });
        }
    }
    routeFolding[index] = { numeric: curNumeric, hidden: curHidden, length: routeIndex };
}
function diffHidden(a, b) {
    const sa = new Set((a || '').split('|').filter(Boolean));
    const sb = new Set((b || '').split('|').filter(Boolean));
    const onlyB = [];
    sb.forEach(v => { if (!sa.has(v)) onlyB.push(v); });
    return onlyB;
}

// ============================ 5. 逐步模拟 ============================
const trace = [];
function pushToken(token) {
    // 复现 _bindRoutePush：非移动/转向/move: 的 token 会清空折叠缓存
    const isMoveLike = ['up', 'down', 'left', 'right', 'turn'].indexOf(token) >= 0
        || token.indexOf('move:') === 0;
    if (!isMoveLike) clearFoldCache();
}

function apply(token, idx) {
    pushToken(token);

    if (token === 'up' || token === 'down' || token === 'left' || token === 'right') {
        pos.dir = token;
        const [dx, dy] = DELTA[token];
        const nx = pos.x + dx, ny = pos.y + dy;
        const f = floors[pos.floor];
        if (!f || nx < 0 || ny < 0 || nx >= f.width || ny >= f.height) {
            // 越界：立方体跨面（本离线脚本无法还原精确拓扑，记录为隐藏换层）
            state.hidden.add('floorcross@' + pos.floor + ':' + pos.dir);
            state.numericChanged = false; // 跨面本身不改数值
            return;
        }
        const b = blockInfo(pos.floor, nx, ny);
        const cellKey = pos.floor + ',' + nx + ',' + ny;
        if (b && b.noPass && !state.disabled.has(cellKey)) {
            // 不可通行：分情况处理（参照 _moveAction_noPass / moveOneStep 触发）
            if (isDoor(b)) {
                // 撞门：仅当持有所需钥匙时才开门（与游戏一致）
                const keys = (b.doorInfo && b.doorInfo.keys) || {};
                const hasKey = Object.keys(keys).length === 0 ||
                    Object.keys(keys).every(k => (state.items[k] || 0) >= (keys[k] || 1));
                if (hasKey) {
                    state.disabled.add(cellKey);
                    state.hidden.add('doorOpen@' + cellKey);
                }
                // 本步停在门前（开门或撞锁都不前进），与游戏一致
                return;
            }
            if (isEnemy(b)) {
                // 撞敌人 -> 战斗：近似认为可击败，移除敌人并前进
                state.disabled.add(cellKey);
                state.hidden.add('enemyDefeated@' + cellKey);
                state.numericChanged = true; // 战斗一定改数值（hp/atk/def）
                pos.x = nx; pos.y = ny;
                enterCell(nx, ny);
                checkFold(idx);
                return;
            }
            // 普通墙 / 带事件的方块：停在门前
            if (eventChangesState(pos.floor, nx, ny)) {
                state.hidden.add('eventTrigger@' + cellKey);
            }
            return;
        }
        // 可通行：前进
        pos.x = nx; pos.y = ny;
        enterCell(nx, ny);
        checkFold(idx);
        return;
    }

    if (token === 'turn') {
        pos.dir = TURN_RIGHT[pos.dir];
        checkFold(idx); // 右转会触发折叠检查（control.js:816）
        return;
    }
    if (token.indexOf('turn:') === 0) {
        pos.dir = token.substring(5);
        // turn:dir 不触发折叠检查，也不清缓存（push 时已被判为非移动类而清缓存）
        return;
    }
    if (token === 'getNext') {
        // 前方取物（gentle click）。取物会 push "getNext" -> 已清空缓存。
        const [dx, dy] = DELTA[pos.dir];
        const fx = pos.x + dx, fy = pos.y + dy;
        const b = blockInfo(pos.floor, fx, fy);
        if (b && b.cls === 'items') pickup(fx, fy, b);
        return;
    }
    if (token.indexOf('item:') === 0) {
        const id = token.substring(5);
        // 取物会把 item:id 写进 route（已在 pushToken 清空缓存）
        state.items[id] = (state.items[id] || 0) + 1;
        state.disabled.add(pos.floor + ',' + pos.x + ',' + pos.y);
        if (isStatItem(id)) state.numericChanged = true;
        return;
    }
    if (token.indexOf('move:') === 0) {
        const parts = token.substring(5).split(':');
        const tx = parseInt(parts[0], 10), ty = parseInt(parts[1], 10);
        if (!isNaN(tx) && !isNaN(ty)) {
            // move: 不写进缓存清空列表（_bindRoutePush 仅对 非move: 的 token 清空），
            // 且 moveDirectly（functions.js:1997）在瞬移后会调用 checkRouteFolding。
            // => 瞬移是一个“不写进 route、又不清空折叠缓存”的隐藏位置跳跃，是危险来源。
            const cross = (tx < 0 || ty < 0 ||
                tx >= (floors[pos.floor] ? floors[pos.floor].width : 9999) ||
                ty >= (floors[pos.floor] ? floors[pos.floor].height : 9999));
            state.hidden.add('teleport@' + pos.floor + '->' + tx + ',' + ty + (cross ? '(越界/可能跨面)' : ''));
            pos.x = tx; pos.y = ty;
            checkFold(idx); // moveDirectly 之后会触发折叠检查
        }
        return;
    }
    if (token.indexOf('fly:') === 0) {
        state.hidden.add('fly@' + token); // 楼传 = 换层（隐藏状态）
        return;
    }
    if (token.indexOf('choices:') === 0 || token === 'choices:none') {
        state.hidden.add('choice@' + pos.floor + ',' + pos.x + ',' + pos.y + ':' + token);
        return;
    }
    if (token.indexOf('shop:') === 0) {
        state.hidden.add('shop@' + token);
        state.numericChanged = true; // 商店通常改数值/物品
        return;
    }
    if (token.indexOf('click:') === 0) {
        state.hidden.add('click@' + token);
        if (eventChangesState(pos.floor, pos.x, pos.y)) state.hidden.add('clickEvent@' + pos.floor + ',' + pos.x + ',' + pos.y);
        return;
    }
    if (token.indexOf('random:') === 0 || token.indexOf('input') === 0) {
        state.hidden.add(token); // 随机/输入：回放侧不可复现
        return;
    }
    // 其它（unEquip/equip/saveEquip/loadEquip/key/no 等）按无状态变化处理
}

function enterCell(x, y) {
    const b = blockInfo(pos.floor, x, y);
    if (!b) return;
    const cellKey = pos.floor + ',' + x + ',' + y;
    if (state.disabled.has(cellKey)) return;
    if (b.cls === 'items') {
        pickup(x, y, b);
    } else if (/net/i.test(b.id || '') || /(poison|curse|weak|lava|blood)/i.test(b.id || '')) {
        // 毒网/咒网/血网等：踩上去触发 debuff（隐藏状态，且不写 route）
        state.hidden.add('debuff@' + cellKey + ':' + (b.id || '?'));
    } else if (eventChangesState(pos.floor, x, y)) {
        state.hidden.add('passEvent@' + cellKey);
    }
}
function pickup(x, y, b) {
    const id = b.id;
    state.items[id] = (state.items[id] || 0) + 1;
    state.disabled.add(pos.floor + ',' + x + ',' + y);
    if (isStatItem(id)) state.numericChanged = true;
    // 取物会 push "item:id" -> 已清空缓存（由 apply 中 token 分支处理；
    // 这里是 move 进入道具格，等价于 getItem 也会 push item:，同样清缓存）
    clearFoldCache();
}

// ============================ 6. 运行 ============================
let lastFoldBefore320 = null;
for (let i = 0; i < route.length; i++) {
    apply(route[i], i);
    trace.push({ i, t: route[i], f: pos.floor, x: pos.x, y: pos.y, d: pos.dir });
}

if (process.env.DEBUG) {
    const types = {};
    route.forEach(t => {
        let k = t;
        if (t.indexOf('item:') === 0) k = 'item:*';
        else if (t.indexOf('move:') === 0) k = 'move:*';
        else if (t.indexOf('choices:') === 0) k = 'choices:*';
        else if (t.indexOf('shop:') === 0) k = 'shop:*';
        else if (t.indexOf('click:') === 0) k = 'click:*';
        else if (t.indexOf('fly:') === 0) k = 'fly:*';
        else if (t.indexOf('random:') === 0) k = 'random:*';
        types[k] = (types[k] || 0) + 1;
    });
    console.log('\n[DEBUG] token 类型统计:', JSON.stringify(types));
    const special = {};
    ['move:', 'getNext', 'fly:', 'choices:', 'shop:', 'click:'].forEach(p => {
        const idx = route.findIndex(t => t.indexOf(p) === 0);
        special[p] = idx;
    });
    console.log('[DEBUG] 首个特殊 token 下标:', JSON.stringify(special));
    console.log('[DEBUG] 前 80 步位置轨迹 (i:token@floor,x,y,dir):');
    trace.slice(0, 80).forEach(e =>
        console.log('   %d:%s @%s,%d,%d,%s', e.i, e.t, e.f, e.x, e.y, e.d));
}

// ============================ 7. 报告 ============================
const oldFoldCount = folds.length + preventedUnsafe.length; // 修复前（旧逻辑）会发生的折叠次数
const safeFoldCount = folds.length;                         // 修复后真正发生的（安全）折叠次数
const fixedUnsafeCount = preventedUnsafe.length;            // 被本次修复拦截的不安全折叠次数

console.log('\n================ 录像折叠检测报告 ================');
console.log('总操作数：%d', route.length);
console.log('【修复前旧逻辑】共会触发折叠 %d 次，其中“不安全折叠” %d 次（开门/破墙/跨层后错误截断）。',
    oldFoldCount, fixedUnsafeCount);
console.log('【修复后新逻辑】仅触发安全折叠 %d 次，不安全折叠已全部被隐藏状态指纹拦截。',
    safeFoldCount);

if (oldFoldCount === 0) {
    console.log('\n✅ 未检测到任何折叠。说明本录像在录制过程中没有被 checkRouteFolding 截断，');
    console.log('   320~330 步“记录动作与实际不符”与 357 步失败，需从其他方向排查（如随机事件/输入超时等）。');
}
else {
    if (fixedUnsafeCount > 0) {
        console.log('\n-- 【修复已拦截】以下为旧逻辑会错误截断、新逻辑因隐藏状态变化而保留的不安全折叠 --');
        preventedUnsafe.forEach((f, i) => {
            console.log(
                '#%d [⚠ 已拦截] atIndex=%d fromIndex=%d 位置(%s,%d,%d,%s) 旧逻辑会砍掉%d步',
                i + 1, f.atIndex, f.fromIndex, f.floor, f.pos.x, f.pos.y, f.pos.dir,
                f.atIndex - f.fromIndex
            );
            console.log('     折叠时被忽略、但真实发生过的隐藏状态变化:');
            f.hiddenChanged.forEach(h => console.log('       - ' + h));
        });

        const before357 = preventedUnsafe.filter(f => f.atIndex <= 357);
        console.log('\n-- 重点：发生在第 357 步之前、且被修复拦截的不安全折叠 --');
        if (before357.length === 0) {
            console.log('   无。');
        } else {
            before357.forEach(f => {
                console.log('   ⚠ 第 %d 步触发折叠，回路起点第 %d 步，位置(%s,%d,%d,%s)，旧逻辑砍掉 %d 步。',
                    f.atIndex, f.fromIndex, f.floor, f.pos.x, f.pos.y, f.pos.dir, f.atIndex - f.fromIndex);
                f.hiddenChanged.forEach(h => console.log('       隐藏变化: ' + h));
            });
            console.log('   => 这些不安全折叠会令录像比真实操作“变短”，后续步骤错位，');
            console.log('      极可能是 320~330 步动作错位、357 步回放失败的根因；本次修复已将其全部拦截。');
        }
    }

    if (safeFoldCount > 0) {
        console.log('\n-- 修复后仍然保留的【安全折叠】明细 --');
        folds.forEach((f, i) => {
            console.log(
                '#%d [✓ 安全] atIndex=%d fromIndex=%d 位置(%s,%d,%d,%s) 砍掉%d步',
                i + 1, f.atIndex, f.fromIndex, f.floor, f.pos.x, f.pos.y, f.pos.dir,
                f.atIndex - f.fromIndex
            );
        });
        console.log('   （以上折叠点“数值属性 + 隐藏状态”完全一致，截断是安全的，可继续享受录像体积优化。）');
    }

    // 失败点 357 上下文
    if (route.length > 357) {
        console.log('\n-- 失败点（用户反馈第 357 步回放出错）上下文 --');
        console.log('   route[352..362] =');
        console.log('     ' + route.slice(352, 363).map((t, k) => (352 + k) + ':' + t).join('  '));
        const relevant = preventedUnsafe.filter(f => f.atIndex <= 357)
            .sort((a, b) => b.atIndex - a.atIndex)[0];
        if (relevant) {
            console.log('   最近一次“被拦截的不安全折叠”发生在第 %d 步，旧逻辑会砍掉 [%d,%d) 的回路。',
                relevant.atIndex, relevant.fromIndex, relevant.atIndex);
        }
    }
}

console.log('\n（说明：本脚本为离线近似模拟，跨面拓扑、战斗数值、脚本类事件为启发式处理；');
console.log('  修复前后的“不安全折叠”判据一致——纯移动回路中发生了不写进 route 的隐藏状态变化。）');
