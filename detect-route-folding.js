/*
 * 录像折叠检测器（mota-js / 立方体 lifangti 系列）
 * ---------------------------------------------------------------
 * 用途：检测"录制期 route 折叠(checkRouteFolding) 是否把录像录错了"，
 *       即引擎只在数值英雄属性相同时就截断 route，却忽略了
 *       flag / 背包 / 敌人 / 被禁用 block / 楼层 等非数值状态的变化，
 *       导致回放时从错误状态重放，最终在后面某步（如 357 步）报错。
 *
 * 用法（在游戏页面的浏览器控制台运行本文件内容）：
 *   1) 录制新一盘之前安装本脚本 → 只要出现红色"⚠ 不安全折叠"，就坐实了根因。
 *   2) 回放你那份出问题的 .h5route 之前安装本脚本 → 会抓取 357 步的【回放报错】上下文。
 *   3) 运行 detectorReport() 查看收集到的全部日志。
 *
 * 说明：本脚本只做"检测/打印"，不修改任何游戏逻辑（除临时 hook 外）。
 */
(function () {
  if (!window.core || !core.control || !core.control.checkRouteFolding) {
    console.error('未检测到 mota-js 引擎(core)，请在游戏页面（已加载引擎+本游戏）的控制台运行本脚本。');
    return;
  }

  const C = core.control;
  const origCheck = C.checkRouteFolding.bind(C);
  const origIsReplaying = core.isReplaying.bind(core);
  const origReplayError = C._replay_error ? C._replay_error.bind(C) : null;

  const visitStore = {};   // "x,y,dir" -> 第一次访问时的完整状态快照
  const logs = [];
  let forceFolding = false; // 高级开关：回放期也强制按"录制期"执行折叠逻辑

  // 完整状态快照：引擎折叠只比数值英雄属性，这里额外抓所有被忽略的状态
  function fullState() {
    const h = core.status.hero || {};
    const heroNonNum = {};
    for (const k in h) {
      if (k !== 'steps' && typeof h[k] !== 'number') heroNonNum[k] = h[k];
    }
    return {
      floor: core.status.floorId,
      flags: JSON.parse(JSON.stringify(core.status.flags || {})),
      items: JSON.parse(JSON.stringify(core.status.items || {})),
      enemy: JSON.parse(JSON.stringify(core.status.enemy || {})),
      disabled: JSON.parse(JSON.stringify((window.flags && window.flags.__disabled__) || {})),
      heroNonNum: heroNonNum
    };
  }
  function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function diffKeys(a, b) {
    const ka = Object.keys(a), kb = Object.keys(b);
    const all = Array.from(new Set(ka.concat(kb)));
    return all.filter(k => !eq(a[k], b[k]));
  }

  // ---- hook: checkRouteFolding ----
  C.checkRouteFolding = function () {
    if (!core.flags.enableRouteFolding || !core.isPlaying()) return origCheck();

    const x = core.getHeroLoc('x'), y = core.getHeroLoc('y'), d = core.getHeroLoc('direction').charAt(0);
    const key = x + ',' + y + ',' + d;
    const cur = fullState();
    const before = core.status.route.length;

    const wasReplaying = origIsReplaying();
    if (forceFolding && wasReplaying) {
      // 高级：回放期也临时让折叠逻辑当"非回放"执行，复现录制期行为（会改动本次回放）
      core.isReplaying = function () { return false; };
      try { origCheck(); } finally { core.isReplaying = origIsReplaying; }
    } else {
      origCheck(); // 录制期会真正执行；回放期因 isReplaying 早退，不干扰原回放
    }

    const after = core.status.route.length;
    if (after < before) {
      const first = visitStore[key];
      const unsafe = !first || !eq(first, cur);
      const diff = (first && diffKeys(first, cur)) || [];
      const msg = '【折叠截断】位置(' + x + ',' + y + ',' + d + ') route ' + before + '→' + after +
        ' | 不安全(全状态变化)=' + unsafe + (unsafe ? ' 差异键:' + diff.join(',') : '');
      console.warn(msg);
      logs.push({ type: 'fold', x, y, d, before, after, unsafe: !!unsafe, diff });
      if (unsafe) {
        console.error('  ⚠ 不安全折叠：两次访问间 ' + diff.join('/') + ' 已变化，但引擎只看数值英雄属性就截断了 route。' +
          '回放会从截断处的错误状态重放 —— 这正是 320–330 录错、后续(如357步)报错的强候选根因！');
      }
    }
    if (!visitStore[key]) visitStore[key] = cur;
  };

  // ---- hook: _replay_error（抓取失败上下文） ----
  if (origReplayError) {
    C._replay_error = function (action, cb) {
      const steps = core.status.replay ? core.status.replay.steps : '?';
      console.error('【回放报错】当前操作=' + action + ' 已消费步数≈' + steps);
      const len = core.status.replay ? core.status.replay.toReplay.length : 0;
      const prev = core.status.replay ? core.status.replay.totalList.slice(-len - 11, -len - 1) : [];
      const next = core.status.replay ? core.status.replay.toReplay.slice(0, 10) : [];
      console.error('  之前10个操作:', prev);
      console.error('  之后10个操作:', next);
      logs.push({ type: 'error', action, steps, prev, next });
      return origReplayError(action, cb);
    };
  }

  console.log('✅ 录像折叠检测器已安装。');
  console.log('   · 录制新一盘时本脚本会自动记录每一次"不安全折叠"。');
  console.log('   · 回放出问题的 .h5route 时会打印 357 步附近的【回放报错】上下文。');
  console.log('   · 运行 detectorReport() 查看收集到的日志；detectorForceFolding(true) 可在回放期也强制跑折叠逻辑（会改动本次回放，仅用于诊断）。');

  window.detectorReport = function () { console.table(logs); return logs; };
  window.detectorForceFolding = function (on) { forceFolding = !!on; console.log('forceFolding=' + forceFolding); };
  window.__detectorLogs = logs;
})();
