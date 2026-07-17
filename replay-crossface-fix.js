'use strict';
/*
 * replay-crossface-fix.js
 * ---------------------------------------------------------------------------
 * 离线修复工具：针对“跨面方向被录成旋转后的 newDir、回放时二次旋转导致走错面”
 * 这一录像 bug，对旧版 .h5route 做规范化修复。
 *
 * 复现根因（已核对源码）：
 *   - 录制端 project/plugins.js 跨面 moveAction 重写：route.push(newDir)（旋转后方向）
 *   - 回放端 libs/control.js _replayAction_move：moveHero(token) 把 token 当“输入方向”
 *     → 跨面重写用 token=newDir 重新 cubeMap.step ⇒ 落到错误面/坐标 ⇒ 后续错位 ⇒ 硬失败。
 *   - 普通移动记录的是输入方向 dir（control.js:708），跨面却记录 newDir，二者不一致。
 *
 * 拓扑限制：
 *   - 侧面 MT0~MT3：newDir→dir 可唯一反推。
 *   - 顶面 MT4 / 底面 MT5：四条边均进入同一目标边（up/down），newDir 恒为 down/up，
 *     无法唯一反推 ⇒ 用“后续步合法性”做延续一致性搜索来消歧。
 *
 * 产出：<原名>.fixed.h5route（原文件不动）。修复版跨面 token 统一为“输入方向 dir”，
 *       配合引擎修复（plugins.js 改为 route.push(dir)）即可完整跑通。
 * ---------------------------------------------------------------------------
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PROJ = __dirname;
const H5PATH = process.argv[2] || 'C:/Users/xuan/Downloads/lifangti_20260716230451.h5route';

// ============================ 1. 载入 LZString ============================
let LZString;
try { LZString = require(path.join(PROJ, 'libs/thirdparty/lz-string.min.js')); }
catch (e) {
  const code = fs.readFileSync(path.join(PROJ, 'libs/thirdparty/lz-string.min.js'), 'utf8');
  LZString = (new Function(code + '\nreturn LZString;'))();
}
if (!LZString || !LZString.decompressFromBase64) { console.error('无法载入 LZString'); process.exit(1); }

// ============================ 2. 载入数据 ============================
function loadTopObject(file) {
  const code = fs.readFileSync(file, 'utf8').trim();
  const body = code.replace(/^var\s+[A-Za-z0-9_]+\s*=\s*/, '').replace(/;\s*$/, '');
  return (new Function('return (' + body + ');'))();
}
const data = loadTopObject(path.join(PROJ, 'project/data.js'));
const blocksInfo = loadTopObject(path.join(PROJ, 'project/maps.js'));
const floorIds = data.main.floorIds;
const main = { floors: {} };
for (const fid of floorIds) {
  const ff = path.join(PROJ, 'project/floors', fid + '.js');
  if (fs.existsSync(ff)) (new Function('main', fs.readFileSync(ff, 'utf8')))(main);
}
const floors = main.floors;

// id -> number 反查（用于编码 item:/equip:/fly:/...)
const revMap = {};
for (const num of Object.keys(blocksInfo)) {
  const def = blocksInfo[num];
  if (def && def.id) revMap[def.id] = Number(num);
}

// 方块定义缓存（passability 用）
const blockCache = {};
function blockInfo(floorId, x, y) {
  const key = floorId + ',' + x + ',' + y;
  if (blockCache[key]) return blockCache[key];
  const f = floors[floorId];
  if (!f || x < 0 || y < 0 || x >= f.width || y >= f.height) return null;
  const num = f.map[y][x];
  let def;
  if (num === 0 || num == null) def = { cls: 'terrains', id: 'none', noPass: false };
  else {
    const raw = blocksInfo[num];
    if (!raw) def = { cls: 'terrains', id: 'none', noPass: false };
    else {
      def = JSON.parse(JSON.stringify(raw));
      if (def.noPass == null) def.noPass = def.canPass == null ? def.cls !== 'items' : !def.canPass;
      delete def.canPass;
    }
  }
  blockCache[key] = def;
  return def;
}
// 勇士是否能“踏入”某格（位置模拟用）：
//   mota-js 的 cls 为复数（enemys/npcs/items/terrains/doors…），敌人/NPC/道具/机关
//   均视为可踏入（战斗或触发后落在该格）；只有“纯地形墙”（cls==terrains 且 noPass）拦截。
function isWall(floorId, x, y) {
  const b = blockInfo(floorId, x, y);
  if (!b) return false;                       // 空格可走
  if (b.cls && b.cls !== 'terrains') return false; // 敌人/NPC/道具/门等可踏入
  if (b.event || b.trigger) return false;     // 带事件/触发的地形也可踏入
  return !!b.noPass;                          // 纯地形墙拦截
}

// ============================ 3. 解码 / 编码 route ============================
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
    while (decodeObj.index < decodeObj.route.length) {
      const ch = decodeObj.route.charAt(decodeObj.index);
      if (ch >= '0' && ch <= '9') num += ch;
      else if (ch === '-' && first) num += ch;
      else break;
      first = false; decodeObj.index++;
    }
    if (num.length === 0) num = '1';
    return noparse ? num : parseInt(num, 10);
  }
  function getString() {
    let str = '';
    while (decodeObj.index < decodeObj.route.length && decodeObj.route.charAt(decodeObj.index) !== ':') str += decodeObj.route.charAt(decodeObj.index++);
    decodeObj.index++;
    return str;
  }
  function number2id(number) {
    if (/^\d+$/.test(number)) { const info = blocksInfo[number]; if (info) return info.id; }
    return number;
  }
  function decodeOne(c) {
    if (c === '(') {
      const idx = decodeObj.route.indexOf(')', decodeObj.index);
      if (idx >= 0) { decodeObj.ans.push(decodeObj.route.substring(decodeObj.index, idx)); decodeObj.index = idx + 1; return; }
    }
    const nxt = (c === 'I' || c === 'e' || c === 'F' || c === 'S' || c === 'Q' || c === 't') ? getString() : getNumber();
    switch (c) {
      case 'U': case 'D': case 'L': case 'R': for (let i = 0; i < nxt; i++) decodeObj.ans.push(mp[c]); break;
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
      case 'k': decodeObj.index++; var px = getNumber(); decodeObj.index++; var py = getNumber(); decodeObj.ans.push('click:' + nxt + ':' + px + ':' + py); break;
      case 'X': decodeObj.ans.push('random:' + nxt); break;
    }
  }
  while (decodeObj.index < decodeObj.route.length) decodeOne(decodeObj.route.charAt(decodeObj.index++));
  return decodeObj.ans;
}

function encodeRoute(arr) {
  let ans = '', last = '', cnt = 0;
  const flush = () => { if (cnt > 0) { ans += last.charAt(0).toUpperCase(); if (cnt > 1) ans += cnt; cnt = 0; } };
  const id2n = (id) => (revMap[id] != null ? revMap[id] : id);
  const enc = (t) => {
    if (t.indexOf('item:') === 0) return 'I' + id2n(t.substring(5)) + ':';
    if (t.indexOf('unEquip:') === 0) return 'u' + t.substring(8);
    if (t.indexOf('equip:') === 0) return 'e' + id2n(t.substring(6)) + ':';
    if (t.indexOf('saveEquip:') === 0) return 's' + t.substring(10);
    if (t.indexOf('loadEquip:') === 0) return 'l' + t.substring(10);
    if (t.indexOf('fly:') === 0) return 'F' + t.substring(4) + ':';
    if (t === 'choices:none') return 'c';
    if (t.indexOf('choices:') === 0) return 'C' + t.substring(8);
    if (t.indexOf('shop:') === 0) return 'S' + t.substring(5) + ':';
    if (t === 'turn') return 'T';
    if (t.indexOf('turn:') === 0) return 't' + t.substring(5).charAt(0).toUpperCase() + ':';
    if (t === 'getNext') return 'G';
    if (t === 'input:none') return 'p';
    if (t.indexOf('input:') === 0) return 'P' + t.substring(6);
    if (t.indexOf('input2:') === 0) return 'Q' + t.substring(7) + ':';
    if (t === 'no') return 'N';
    if (t.indexOf('move:') === 0) return 'M' + t.substring(5);
    if (t.indexOf('key:') === 0) return 'K' + t.substring(4);
    if (t.indexOf('click:') === 0) return 'k' + t.substring(6);
    if (t.indexOf('random:') === 0) return 'X' + t.substring(7);
    return '(' + t + ')';
  };
  for (const t of arr) {
    if (t === 'up' || t === 'down' || t === 'left' || t === 'right') {
      if (t !== last && cnt > 0) flush();
      last = t; cnt++;
    } else { flush(); ans += enc(t); }
  }
  flush();
  return ans;
}

// ============================ 4. 立方体模型 ============================
const opposite = { up: 'down', down: 'up', left: 'right', right: 'left' };
const scan = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const DIRS = ['up', 'down', 'left', 'right'];
const edges = {
  MT0: { up: ['MT4', 'down'], down: ['MT5', 'up'], left: ['MT2', 'right'], right: ['MT3', 'left'] },
  MT1: { up: ['MT4', 'up'], down: ['MT5', 'down'], left: ['MT3', 'right'], right: ['MT2', 'left'] },
  MT2: { up: ['MT4', 'left'], down: ['MT5', 'left'], left: ['MT1', 'right'], right: ['MT0', 'left'] },
  MT3: { up: ['MT4', 'right'], down: ['MT5', 'right'], left: ['MT0', 'right'], right: ['MT1', 'left'] },
  MT4: { up: ['MT1', 'up'], down: ['MT0', 'up'], left: ['MT2', 'up'], right: ['MT3', 'up'] },
  MT5: { up: ['MT0', 'down'], down: ['MT1', 'down'], left: ['MT2', 'down'], right: ['MT3', 'down'] }
};
const edgeReverse = {
  MT0: { up: false, down: false, left: false, right: false },
  MT1: { up: true, down: true, left: false, right: false },
  MT2: { up: false, down: true, left: false, right: false },
  MT3: { up: true, down: false, left: false, right: false },
  MT4: { up: true, down: false, left: false, right: true },
  MT5: { up: false, down: true, left: true, right: false }
};
const faces = floorIds;
function isCubeFloor(f) { return faces.indexOf(f) >= 0; }
function floorSize(fid) { const f = floors[fid] || {}; return { width: f.width || 13, height: f.height || 13 }; }
function landAtEdge(floorId, edge, t, reverse) {
  const size = floorSize(floorId);
  const max = (edge === 'left' || edge === 'right' ? size.height : size.width) - 1;
  t = Math.max(0, Math.min(t, max));
  if (reverse) t = max - t;
  if (edge === 'up') return { x: t, y: 0 };
  if (edge === 'down') return { x: t, y: size.height - 1 };
  if (edge === 'left') return { x: 0, y: t };
  return { x: size.width - 1, y: t };
}
function cubeStep(floorId, x, y, direction) {
  if (!isCubeFloor(floorId) || !scan[direction]) return null;
  const size = floorSize(floorId);
  const nx = x + scan[direction][0], ny = y + scan[direction][1];
  if (nx >= 0 && nx < size.width && ny >= 0 && ny < size.height)
    return { floorId: floorId, x: nx, y: ny, crossed: false };
  const edge = (edges[floorId] || {})[direction];
  if (!edge) return null;
  const targetFloor = edge[0], targetEdge = edge[1];
  const t = (direction === 'left' || direction === 'right') ? y : x;
  const loc = landAtEdge(targetFloor, targetEdge, t, (edgeReverse[floorId] || {})[direction]);
  return { floorId: targetFloor, x: loc.x, y: loc.y, direction: direction, crossed: true };
}
function newDirOf(floorId, dir) { const e = (edges[floorId] || {})[dir]; return e ? opposite[e[1]] : dir; }

// ============================ 5. 起始状态 ============================
const hero0 = (data.firstData && data.firstData.hero) || (data.main && data.main.hero) || {};
const startFloor = (data.firstData && data.firstData.floorId) || floorIds[0];
const start = {
  floor: startFloor,
  x: (hero0.loc && hero0.loc.x) || 0,
  y: (hero0.loc && hero0.loc.y) || 0,
  dir: (hero0.loc && hero0.loc.direction) || 'up'
};

// ============================ 6. 延续一致性消歧（MT4/MT5） ============================
function scoreLanding(tf, tx, ty, nd, tokens, idx) {
  let score = 0;
  for (let k = 1; k <= 5 && idx + k < tokens.length; k++) {
    const nt = tokens[idx + k];
    if (!DIRS.includes(nt)) { if (nt.indexOf('move:') === 0 || nt.indexOf('fly:') === 0) score += 0.5; continue; }
    const s = cubeStep(tf, tx, ty, nt);
    if (s && s.crossed) { score += 1; continue; }
    const nx = tx + scan[nt][0], ny = ty + scan[nt][1];
    const f = floors[tf];
    if (!f || nx < 0 || ny < 0 || nx >= f.width || ny >= f.height) { score -= 1; continue; }
    const b = blockInfo(tf, nx, ny);
    if (b && !b.noPass) score += 1; else score -= 0.5;
  }
  return score;
}
function disambiguate(floor, x, y, token, tokens, idx) {
  const cands = DIRS.filter(d => { const s = cubeStep(floor, x, y, d); return s && s.crossed; });
  if (cands.length === 0) return null;
  let best = cands[0], bestScore = -Infinity;
  for (const d of cands) {
    const s = cubeStep(floor, x, y, d);
    const nd = newDirOf(floor, d);
    const sc = scoreLanding(s.floorId, s.x, s.y, nd, tokens, idx);
    if (sc > bestScore) { bestScore = sc; best = d; }
  }
  return best;
}

// ============================ 7. 主流程：模拟 + 规范化 ============================
const raw = fs.readFileSync(H5PATH, 'utf8').trim();
const outer = LZString.decompressFromBase64(raw);
const meta = JSON.parse(outer);
const tokens = decodeRoute(meta.route);

let floor = start.floor, x = start.x, y = start.y, dir = start.dir;
const out = [];
const conversions = [];
let crossCount = 0;

// 应用一次跨面：输入方向 d，落点与朝向按立方体模型计算
function applyCross(f, xx, yy, d) {
  const s = cubeStep(f, xx, yy, d);
  const nd = newDirOf(f, d);
  return { floorId: s.floorId, x: s.x, y: s.y, dir: nd };
}

for (let i = 0; i < tokens.length; i++) {
  const tk = tokens[i];
  if (!DIRS.includes(tk)) {
    // 非方向 token：原样保留；move:/fly: 推进坐标（fly 不知道目标层，floor 维持）
    out.push(tk);
    if (tk.indexOf('move:') === 0) {
      const p = tk.substring(5).split(':');
      const tx = parseInt(p[0], 10), ty = parseInt(p[1], 10);
      if (!isNaN(tx) && !isNaN(ty)) { x = tx; y = ty; }
    }
    continue;
  }

  const size = floorSize(floor);
  const atEdge = {
    up: y === 0,
    down: y === size.height - 1,
    left: x === 0,
    right: x === size.width - 1
  };
  const stepT = cubeStep(floor, x, y, tk);

  // (a) token 当输入方向本身就能跨面 → 它是“干净”的输入方向（MT0 恒如此；
  //     MT1 左右、MT2/MT3 的某些方向也如此），原样保留即可。
  if (stepT && stepT.crossed) {
    out.push(tk);
    const r = applyCross(floor, x, y, tk);
    floor = r.floorId; x = r.x; y = r.y; dir = r.dir;
    crossCount++;
    continue;
  }

  // (b) token 是“被录成旋转后 newDir”的跨面：找输入方向 d 满足
  //     “勇士当前正好贴在该方向的边” 且 newDir(floor,d) === token。
  //     几何约束（必须贴边）使 MT4/MT5、MT2/MT3 的歧义在大多数情况唯一确定。
  const cands = DIRS.filter(d =>
    atEdge[d] && newDirOf(floor, d) === tk && (() => { const s = cubeStep(floor, x, y, d); return s && s.crossed; })());
  if (cands.length > 0) {
    let pick = cands[0];
    if (cands.length > 1) pick = disambiguate(floor, x, y, tk, tokens, i) || cands[0];
    conversions.push({ i, token: tk, toInput: pick, floor, x, y, reason: 'newDir→input(几何约束)' });
    out.push(pick);
    const r = applyCross(floor, x, y, pick);
    floor = r.floorId; x = r.x; y = r.y; dir = r.dir;
    crossCount++;
    continue;
  }

  // (c) 普通移动（可能撞墙）：原样保留；只有纯墙拦截才不前进。
  out.push(tk);
  const nx = x + scan[tk][0], ny = y + scan[tk][1];
  const fl = floors[floor];
  const enterable = !isWall(floor, nx, ny);
  if (enterable && fl && nx >= 0 && ny >= 0 && nx < fl.width && ny < fl.height) { x = nx; y = ny; }
  dir = tk;
}

// ============================ 8. 自检：用修复后逻辑重放 ============================
function selfCheck(tokArr) {
  let f = start.floor, xx = start.x, yy = start.y, dd = start.dir;
  let suspicious = 0;
  for (let i = 0; i < tokArr.length; i++) {
    const tk = tokArr[i];
    if (!DIRS.includes(tk)) {
      if (tk.indexOf('move:') === 0) {
        const p = tk.substring(5).split(':');
        const tx = parseInt(p[0], 10), ty = parseInt(p[1], 10);
        if (!isNaN(tx) && !isNaN(ty)) { xx = tx; yy = ty; }
      }
      continue;
    }
    const s = cubeStep(f, xx, yy, tk);
    if (s && s.crossed) { const nd = newDirOf(f, tk); f = s.floorId; xx = s.x; yy = s.y; dd = nd; }
    else {
      const fl = floors[f]; const nx = xx + scan[tk][0], ny = yy + scan[tk][1];
      if (!isWall(f, nx, ny) && fl && nx >= 0 && ny >= 0 && nx < fl.width && ny < fl.height) { xx = nx; yy = ny; }
      dd = tk;
    }
  }
  return { endFloor: f, endX: xx, endY: yy, endDir: dd, suspicious };
}

// ============================ 8.5 诊断追踪 ============================
if (process.env.TRACE) {
  let f = start.floor, xx = start.x, yy = start.y, dd = start.dir;
  const hist = {};
  const convSet = {};
  conversions.forEach(c => { convSet[c.i] = c.toInput; });
  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i];
    let kind = '?';
    if (DIRS.includes(tk)) kind = 'dir';
    else if (tk.indexOf('item:') === 0) kind = 'item';
    else if (tk.indexOf('move:') === 0) kind = 'move';
    else if (tk.indexOf('fly:') === 0) kind = 'fly';
    else if (tk.indexOf('turn') === 0) kind = 'turn';
    else if (tk.indexOf('click:') === 0) kind = 'click';
    else if (tk.indexOf('shop:') === 0) kind = 'shop';
    else if (tk.indexOf('choice') === 0) kind = 'choice';
    else if (tk.indexOf('random') === 0) kind = 'random';
    else if (tk.indexOf('input') === 0) kind = 'input';
    else if (tk.indexOf('key:') === 0) kind = 'key';
    else if (tk.indexOf('getNext') === 0) kind = 'getNext';
    else kind = tk;
    hist[kind] = (hist[kind] || 0) + 1;
    if (DIRS.includes(tk)) {
      const size = floorSize(f);
      const atEdge = { up: yy === 0, down: yy === size.height - 1, left: xx === 0, right: xx === size.width - 1 };
      const s = cubeStep(f, xx, yy, tk);
      let tag = '';
      if (s && s.crossed) tag = ' [CROSS-clean]';
      else {
        const cands = DIRS.filter(d => atEdge[d] && newDirOf(f, d) === tk && (() => { const ss = cubeStep(f, xx, yy, d); return ss && ss.crossed; })());
        if (cands.length) tag = ' [CROSS-newDir→' + (cands.length === 1 ? cands[0] : '?') + ']';
        else tag = ' [walk]';
      }
      const line = `  ${i}\t${tk}\t${f}(${xx},${yy})\tdir=${dd}${tag}`;
      console.error(line);
      if (s && s.crossed) { const nd = newDirOf(f, tk); f = s.floorId; xx = s.x; yy = s.y; dd = nd; }
      else {
        const cands = DIRS.filter(d => atEdge[d] && newDirOf(f, d) === tk && (() => { const ss = cubeStep(f, xx, yy, d); return ss && ss.crossed; })());
        if (cands.length) {
          const pick = cands.length === 1 ? cands[0] : (disambiguate(f, xx, yy, tk, tokens, i) || cands[0]);
          const r = applyCross(f, xx, yy, pick); f = r.floorId; xx = r.x; yy = r.y; dd = r.dir;
        } else {
          const fl = floors[f]; const nx = xx + scan[tk][0], ny = yy + scan[tk][1];
          if (!isWall(f, nx, ny) && fl && nx >= 0 && ny >= 0 && nx < fl.width && ny < fl.height) { xx = nx; yy = ny; }
          dd = tk;
        }
      }
    } else if (tk.indexOf('move:') === 0) {
      const p = tk.substring(5).split(':');
      xx = parseInt(p[0], 10); yy = parseInt(p[1], 10);
    }
  }
  console.error('TOKEN HISTOGRAM: ' + JSON.stringify(hist));
  console.error('FINAL: ' + f + '(' + xx + ',' + yy + ') dir=' + dd);
}

// ============================ 9. 编码写盘 ============================
const compact = encodeRoute(out);
const meta2 = Object.assign({}, meta, { route: LZString.compressToBase64(compact) });
const outRaw = LZString.compressToBase64(JSON.stringify(meta2));
const outPath = H5PATH.replace(/\.h5route$/, '.fixed.h5route');
fs.writeFileSync(outPath, outRaw);

// ============================ 10. 报告 ============================
const sc = selfCheck(out);
console.log('========== 跨面方向录像修复 ==========');
console.log('源文件: %s', H5PATH);
console.log('起始: floor=%s (%d,%d) dir=%s', start.floor, start.x, start.y, start.dir);
console.log('总 token 数: %d, 跨面次数(修复后): %d', tokens.length, crossCount);
console.log('跨面 token 改写: %d 处', conversions.length);
conversions.forEach((c, i) =>
  console.log('  #%d 步%d floor=%s (%d,%d)  token=%s -> 输入方向=%s  [%s]',
    i + 1, c.i, c.floor, c.x, c.y, c.token, c.toInput, c.reason));
console.log('修复版终点: floor=%s (%d,%d) dir=%s', sc.endFloor, sc.endX, sc.endY, sc.endDir);
console.log('已写出: %s', outPath);

// 二次校验：把修复版再解回 token，确认与 out 一致（编码往返正确）
const outer2 = LZString.decompressFromBase64(outRaw);
const meta3 = JSON.parse(outer2);
const reTokens = decodeRoute(meta3.route);
const roundTrip = JSON.stringify(reTokens) === JSON.stringify(out);
console.log('编码往返一致: %s', roundTrip ? '是' : '否（⚠ 需检查编码器）');
