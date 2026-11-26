import test from "node:test";
import assert from "node:assert/strict";
import { createGame, skipToNextStage, playerStudents, teach } from "../js/domain/simulation.js";
import { toJSON, fromJSON, saveSlot, loadSlotResult, writeFailureReason } from "../js/domain/save.js";
import { startNewGameSession, continueGameSession } from "../js/domain/bootFlow.js";
import { CLASS_BLUEPRINT, PLAYER_CLASS_NO } from "../js/domain/config.js";

const PLAYER_CLASS_SIZE = CLASS_BLUEPRINT.find((c) => c.no === PLAYER_CLASS_NO).size;

test("存档读档往返后日期、学生和后续考试仍一致", () => {
  const a = createGame(20170901, "林知秋");
  teach(a, "精讲例题");
  skipToNextStage(a);
  const json = toJSON(a);
  const b = fromJSON(json);
  assert.equal(b.date, a.date);
  assert.equal(playerStudents(b).length, PLAYER_CLASS_SIZE);
  assert.equal(PLAYER_CLASS_SIZE, 74);
  assert.equal(playerStudents(b)[0].name, playerStudents(a)[0].name);
  assert.equal(Object.keys(b.exams).length, Object.keys(a.exams).length);
  const key = Object.keys(a.exams)[0];
  const sa = a.exams[key].rows[0];
  const sb = b.exams[key].rows[0];
  assert.equal(sb.total, sa.total);
});

function quotaError() {
  const e = new Error("The quota has been exceeded.");
  e.name = "QuotaExceededError";
  e.code = 22;
  return e;
}

test("写入失败时 saveSlot 返回失败而不是抛错", () => {
  const a = createGame(20170901, "林知秋");
  const quota = { setItem() { throw quotaError(); } };
  const r = saveSlot(a, "auto", quota);
  assert.equal(r.ok, false);
  assert.match(r.reason, /空间不足|没有写上/);
  assert.doesNotMatch(r.reason, /QuotaExceeded|setItem/i);
  const boom = { setItem() { throw new Error("disk broke"); } };
  const r2 = saveSlot(a, 0, boom);
  assert.equal(r2.ok, false);
  assert.match(r2.reason, /写入失败|没有写上/);
  const none = saveSlot(a, "auto", null);
  assert.equal(none.ok, false);
  assert.ok(writeFailureReason(quotaError()).includes("空间不足"));
});

test("开档流程在 persist 失败后仍能进入游戏，不丢掉刚生成的进度", async () => {
  const painted = [];
  const order = [];
  const fakeState = { seed: 20170901, date: "2017-09-01", player: { name: "林知秋" } };
  const r = await startNewGameSession({
    playerName: "林知秋",
    seed: 20170901,
    typed: true,
    createGameAsync: async (_seed, _name, hooks) => {
      order.push("create");
      hooks?.onProgress?.({ label: "正在生成全校名单", progress: 40 });
      return fakeState;
    },
    saveAuto: () => {
      order.push("save");
      return { ok: false, reason: "本机存档空间不足，自动档没有写上。游戏仍可继续，请稍后清理后再保存，或下载存档文件。" };
    },
    paint: (info) => {
      order.push("paint");
      painted.push(info);
    },
    yieldFn: async () => { order.push("yield"); },
  });
  assert.equal(r.entered, true);
  assert.equal(r.saved, false);
  assert.equal(r.state, fakeState);
  assert.equal(r.state.date, "2017-09-01");
  assert.match(r.toast, /空间不足|没有写上/);
  assert.ok(painted.length >= 1);
  assert.ok(painted[0].label.includes("生成") || painted[0].label.includes("名单") || painted[0].label.includes("存档"));
  assert.equal(order[0], "paint");
  assert.ok(order.indexOf("create") > order.indexOf("yield"));
  assert.ok(painted.some((x) => /写入存档|存档/.test(x.label)));
});

test("继续存档在没有档或读失败时给出中文原因，不假装进入游戏", async () => {
  const empty = await continueGameSession({
    loadAuto: () => ({ ok: false, empty: true, reason: "还没有自动存档", state: null }),
    paint: () => {},
    yieldFn: async () => {},
  });
  assert.equal(empty.entered, false);
  assert.match(empty.reason, /还没有自动存档/);
  const bad = await continueGameSession({
    loadAuto: () => { throw new Error("corrupt"); },
    paint: () => {},
    yieldFn: async () => {},
  });
  assert.equal(bad.entered, false);
  assert.match(bad.reason, /失败|损坏/);
  const broken = loadSlotResult("auto", { getItem() { throw new Error("nope"); } });
  assert.equal(broken.ok, false);
  assert.match(broken.reason, /失败|损坏/);
});
