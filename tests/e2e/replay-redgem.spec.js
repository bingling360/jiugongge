// 录像回放修复测试（轻按拾取 / 连续回放确定性）
// 基准录像：lifangti_20260721215127.h5route （不可变动）
//   现象：连续(自动)回放时，轻按拾取(getNext)会“变成普通移动”，红宝石等道具未被拾取；
//        而 N 键逐步播放(N 键每步之间停顿)却正常。
//   根因：
//     1) 回放中 item: 动作原本依赖 setTimeout 打开工具栏并延迟施加效果(破墙/拾取)，
//        连续回放时该延迟与后续移动形成竞态，使整段回放在不同运行间非确定性地偏离
//        （已实测两次连续回放终点不同：MT3(3,8) vs MT0(12,8)）；
//     2) getNext 轻按动作在 hero 仍在移动(isMoving)时会被 getNextItem 静默丢弃，
//        导致轻按拾取丢失、看起来像一次普通移动。
//   修复（libs/control.js）：
//     - 回放期间 item: 动作直接施加效果（与 speed==24 / hideInReplay 同路），消除竞态；
//     - getNext 轻按动作先等待 hero 完全静止再拾取，避免被静默丢弃。
//   本测试在正常速度(speed=1)下回放，验证：连续回放确定性地完整跑通，
//   且结果与逐步播放一致（轻按拾取不丢失）。录像文件不作任何修改。
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const LZString = require("../../libs/thirdparty/lz-string.min.js");

const ROUTE_FILE = "lifangti_20260721215127.h5route";
const ROUTE_DIR = path.join(__dirname, "..", "fixtures");

function loadRaw() {
  return fs.readFileSync(path.join(ROUTE_DIR, ROUTE_FILE), "utf8").trim();
}

async function runContinuous(page, speed) {
  const raw = loadRaw();
  await page.evaluate(
    (args) => {
      const obj = JSON.parse(LZString.decompressFromBase64(args.raw));
      const route = core.decodeRoute(obj.route);
      core.startGame(obj.hard || "", obj.seed, route);
      core.status.replay.speed = args.speed;
      core.control.resumeReplay();
    },
    { raw, speed }
  );
  return await page.evaluate(async () => {
    let guard = 0;
    while (core.isReplaying() && guard < 8000) {
      await new Promise((r) => setTimeout(r, 20));
      guard++;
    }
    var r = core.status.replay || {};
    return {
      replaying: !!r.replaying,
      failed: !!r.failed,
      failedStep: r.failedStep,
      toReplayLen: (r.toReplay || []).length,
      eventId: (core.status.event.id && core.status.event.id !== "confirmBox") ? core.status.event.id : null,
      hero: { x: core.getHeroLoc("x"), y: core.getHeroLoc("y"), floor: core.status.floorId, atk: core.status.hero.atk },
      items: Object.keys(core.status.hero.items).sort(),
    };
  });
}

async function runStep(page, speed) {
  const raw = loadRaw();
  await page.evaluate(
    (args) => {
      const obj = JSON.parse(LZString.decompressFromBase64(args.raw));
      const route = core.decodeRoute(obj.route);
      core.startGame(obj.hard || "", obj.seed, route);
      core.status.replay.speed = args.speed;
      // 暂停回放，模拟用户先暂停再用 N 键逐步播放
      core.control.pauseReplay();
    },
    { raw, speed }
  );
  // 用真实键盘 N 键逐步播放（与用户操作一致），每步等待英雄静止后再按下一键
  let guard = 0;
  while (guard < 600) {
    const done = await page.evaluate(() => !core.isReplaying());
    if (done) break;
    const settled = await page.evaluate(
      () =>
        core.status.replay.pausing &&
        !core.isMoving() &&
        !core.status.replay.animate &&
        !core.status.event.id &&
        core.isReplaying()
    );
    if (settled) {
      await page.keyboard.press("n");
    }
    await page.waitForTimeout(12);
    guard++;
  }
  return await page.evaluate(() => {
    var r = core.status.replay || {};
    return {
      replaying: !!r.replaying,
      failed: !!r.failed,
      failedStep: r.failedStep,
      toReplayLen: (r.toReplay || []).length,
      eventId: (core.status.event.id && core.status.event.id !== "confirmBox") ? core.status.event.id : null,
      hero: { x: core.getHeroLoc("x"), y: core.getHeroLoc("y"), floor: core.status.floorId, atk: core.status.hero.atk },
      items: Object.keys(core.status.hero.items).sort(),
    };
  });
}

function assertComplete(label, r) {
  expect(r.failed, `${label}: 回放不应失败 failedStep=${r.failedStep}`).toBe(false);
  expect(r.replaying, `${label}: 回放应当完整结束`).toBe(false);
  expect(r.toReplayLen, `${label}: 所有动作应被消费`).toBe(0);
  expect(r.eventId, `${label}: 不应卡在原生 prompt`).toBe(null);
}

test("连续回放：确定性 + 完整跑通（正常速度，两次运行一致）", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(
    () => window.core && core.initStatus && core.initStatus.maps,
    null,
    { timeout: 30000 }
  );

  const a = await runContinuous(page, 1);
  const b = await runContinuous(page, 1);

  assertComplete("runA", a);
  assertComplete("runB", b);

  // 确定性：两次连续回放结果完全一致
  expect(JSON.stringify(a.hero), "连续回放应确定性").toBe(JSON.stringify(b.hero));
  expect(JSON.stringify(a.items), "连续回放应确定性(items)").toBe(JSON.stringify(b.items));
  console.log("continuous hero=", JSON.stringify(a.hero), "items=", JSON.stringify(a.items));
});

test("连续回放与逐步(N键)回放结果一致（轻按拾取不丢失）", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(
    () => window.core && core.initStatus && core.initStatus.maps,
    null,
    { timeout: 30000 }
  );

  const cont = await runContinuous(page, 1);
  const step = await runStep(page, 1);

  assertComplete("cont", cont);
  assertComplete("step", step);

  expect(JSON.stringify(cont.hero), "连续应与逐步一致").toBe(JSON.stringify(step.hero));
  expect(JSON.stringify(cont.items), "连续应与逐步一致(items)").toBe(JSON.stringify(step.items));
  console.log("cont hero=", JSON.stringify(cont.hero), "step hero=", JSON.stringify(step.hero));
});

test("连续回放：跨速度确定性（speed=1 与 speed=24 终点一致）", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(
    () => window.core && core.initStatus && core.initStatus.maps,
    null,
    { timeout: 30000 }
  );

  const s1 = await runContinuous(page, 1);
  const s24 = await runContinuous(page, 24);

  assertComplete("s1", s1);
  assertComplete("s24", s24);
  expect(JSON.stringify(s1.hero), "speed=1 与 speed=24 应一致").toBe(JSON.stringify(s24.hero));
  expect(JSON.stringify(s1.items), "speed=1 与 speed=24 应一致(items)").toBe(JSON.stringify(s24.items));
});
