// 录像回放修复测试
// 以 fixtures/ 目录下两份不可变的 .h5route 录像为基准，
// 在真实浏览器中回放录像，检测录像能否完整跑通（不报错、记录一致、且具备确定性）。
//
// 覆盖两种玩家真实路径：
//   1) realistic：等待首屏事件（含首屏 choices）消费完毕后再点击“播放”（常规路径）。
//   2) immediate：进入回放后立刻点击“播放”（首屏 choices 事件尚未触发），
//      用于复现并验证修复“回放循环/ignoreInput 抢先消费 choices:/random: 数值型操作、
//      导致与事件争抢 toReplay 队列、弹出原生 prompt 卡死”的 bug。
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const LZString = require("../../libs/thirdparty/lz-string.min.js");

const ROUTE_DIR = path.join(__dirname, "..", "fixtures");
const RECORDINGS = [
  "lifangti_20260721190907.h5route",
  "lifangti_20260721190821.h5route",
];

function loadRecordingRaw(name) {
  return fs.readFileSync(path.join(ROUTE_DIR, name), "utf8").trim();
}

async function oneRun(page, name, immediate) {
  await page.goto("/");
  await page.waitForFunction(
    () => window.core && core.initStatus && core.initStatus.maps,
    null,
    { timeout: 30000 }
  );

  const raw = loadRecordingRaw(name);
  await page.evaluate((raw) => {
    const obj = JSON.parse(LZString.decompressFromBase64(raw));
    const route = core.decodeRoute(obj.route);
    core.startGame(obj.hard || "", obj.seed, route);
    core.status.replay.speed = 24;
    if (core.control.setHeroMoveInterval) core.control.setHeroMoveInterval();
  }, raw);

  if (immediate) {
    // 立即恢复回放（首屏 choices 事件尚未触发），复现抢消费 bug
    await page.evaluate(() => core.control.resumeReplay());
  } else {
    // 等待首屏事件消费完毕，再点击一次“播放”
    await page.waitForFunction(() => {
      const r = core.status.replay || {};
      if (!r.replaying || !r.pausing) return false;
      if (core.status.event.id) return false;
      if (core.isMoving() || r.animate) return false;
      const top = r.toReplay && r.toReplay.length ? r.toReplay[0] : null;
      if (top && (top.indexOf("choices:") == 0 || top.indexOf("random:") == 0)) return false;
      return true;
    }, null, { timeout: 30000 });
    await page.evaluate(() => core.control.resumeReplay());
  }

  // 轮询回放状态
  const deadline = Date.now() + 120000;
  let res = null;
  let iter = 0;
  while (Date.now() < deadline) {
    res = await page.evaluate(() => {
      const r = core.status.replay || {};
      return {
        replaying: !!r.replaying,
        pausing: !!r.pausing,
        failed: !!r.failed,
        failedStep: r.failedStep,
        waitingValue: !!r.waitingValue,
        toReplayLen: r.toReplay ? r.toReplay.length : -1,
        routeLen: core.status.route ? core.status.route.length : -1,
        moving: core.isMoving(),
        heroStop: core.status.heroStop,
        animate: !!r.animate,
        eventId: core.status.event ? core.status.event.id : null,
        hero: (function () {
          try {
            return { x: core.getHeroLoc("x"), y: core.getHeroLoc("y"), floor: core.status.floorId };
          } catch (e) { return null; }
        })(),
      };
    });
    if (++iter % 20 === 0) console.log(`[${immediate ? "immediate" : "realistic"} poll ${iter}] ` + JSON.stringify(res));
    if (res.failed) break;
    if (res.eventId === "myprompt" || (typeof res.eventId === "string" && res.eventId.indexOf("prompt") >= 0)) break;
    if (!res.replaying && res.toReplayLen === 0) break;
    await page.waitForTimeout(100);
  }
  console.log(`FINAL[${immediate ? "immediate" : "realistic"}]: ` + JSON.stringify(res));
  await page.evaluate(() => { try { if (core.ui && core.ui.closePanel) core.ui.closePanel(); } catch (e) {} });
  return res;
}

test.describe("魔塔录像回放修复", () => {
  for (const name of RECORDINGS) {
    for (const mode of ["realistic", "immediate"]) {
      test(`录像 ${name} [${mode}] 应能完整且确定性地跑通`, async ({ page }) => {
        const pageErrors = [];
        page.on("pageerror", (e) => pageErrors.push(e.stack || String(e)));

        const run1 = await oneRun(page, name, mode === "immediate");
        const run2 = await oneRun(page, name, mode === "immediate");

        if (pageErrors.length) { console.log("--- 页面异常 ---"); pageErrors.forEach((l) => console.log(l)); }

        for (const [label, r] of [["第1次", run1], ["第2次", run2]]) {
          expect(r && !r.failed, `${label}：录像回放失败（录像文件出错）`).toBeTruthy();
          expect(r && r.eventId !== "myprompt", `${label}：录像回放被阻塞在原生 prompt（choices/random 操作错位）`).toBeTruthy();
          const finished = r && !r.replaying && r.toReplayLen === 0;
          expect(finished, `${label}：录像回放未正常结束（eventId=${r && r.eventId}, toReplayLen=${r && r.toReplayLen}）`).toBeTruthy();
        }

        // 确定性：两次回放必须产生完全一致的最终状态与路线
        const a = run1, b = run2;
        expect(JSON.stringify(a.hero), `录像 ${name} [${mode}] 回放不具备确定性（英雄位置两次不一致）`).toBe(
          JSON.stringify(b.hero)
        );
        expect(JSON.stringify(a.routeLen), `录像 ${name} [${mode}] 回放不具备确定性（路线长度两次不一致）`).toBe(
          JSON.stringify(b.routeLen)
        );
        expect(a.toReplayLen, `录像 ${name} [${mode}] 回放不具备确定性`).toBe(b.toReplayLen);
      });
    }
  }
});
