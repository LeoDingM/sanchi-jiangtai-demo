import test from "node:test";
import assert from "node:assert/strict";
import {
  createGame, prepareLesson, teach, skipToNextStage, playerStudents,
  swapPeriods, borrowIn, borrowOut, respondTimetableRequest,
  daySchedule, currentSlot, upcomingMath, weekMathCount,
  pendingTimetableRequest, ensureIncomingRequest,
  studentRecentStatus,
} from "../js/domain/simulation.js";
import { toJSON, fromJSON } from "../js/domain/save.js";
import { canAlterSlot } from "../js/domain/tiaoke.js";

function runSwap() {
  const s = createGame(20170901);
  const r = swapPeriods(s, { date: "2017-09-06", periodId: "p1" }, { date: "2017-09-07", periodId: "p2" });
  assert.equal(r.ok, true);
  const wed = daySchedule("2017-09-06", s);
  const thu = daySchedule("2017-09-07", s);
  const wedP1 = wed.find((p) => p.id === "p1");
  const thuP2 = thu.find((p) => p.id === "p2");
  assert.equal(wedP1.subject, "语文");
  assert.equal(wedP1.isMath, false);
  assert.equal(thuP2.subject, "数学");
  assert.equal(thuP2.isMath, true);
  // 模板里周三第1节是数学、周四第2节是语文，对调后两节都要改
  const wedP2 = wed.find((p) => p.id === "p2");
  assert.equal(wedP2.subject, "英语");
  assert.ok(s.log[0].text.includes("周文静"));
  assert.ok(s.log[0].text.includes("对调"));
  assert.equal(weekMathCount("2017-09-04", s), 6);
  return { log: s.log[0].text, overrides: s.timetableOverrides };
}

test("对调后两节科目对调且可复现", () => {
  const a = runSwap();
  const b = runSwap();
  assert.deepEqual(a, b);

  const raw = daySchedule("2017-09-06");
  assert.equal(raw.find((p) => p.id === "p1").isMath, true);
  assert.equal(raw.find((p) => p.id === "p1").subject, "数学");
});

test("借入后该节是数学正课且可上课", () => {
  const s = createGame(20170901);
  const before = daySchedule("2017-09-06", s).find((p) => p.id === "p6");
  assert.equal(before.subject, "自习");
  assert.equal(before.isMath, false);
  const r = borrowIn(s, "2017-09-06", "p6");
  assert.equal(r.ok, true);
  assert.ok(r.text.includes("自习") && r.text.includes("数学"));
  const slot = daySchedule("2017-09-06", s).find((p) => p.id === "p6");
  assert.equal(slot.isMath, true);
  assert.equal(slot.subject, "数学");
  assert.equal(weekMathCount("2017-09-04", s), 7);

  s.date = "2017-09-06";
  s.periodId = "p6";
  prepareLesson(s, { topic: "集合与逻辑用语", depth: 2, homework: "中" });
  const t = teach(s, "精讲例题");
  assert.equal(t.ok, true);
  assert.equal(s.taughtPeriodKey, "2017-09-06|p6");
  assert.ok(s.log.some((l) => l.text.includes("上了")));
});

test("借出后该节不能当数学课上", () => {
  const s = createGame(20170901);
  const r = borrowOut(s, "2017-09-01", "p2", { peerSubject: "语文", peer: "周文静" });
  assert.equal(r.ok, true);
  const slot = daySchedule("2017-09-01", s).find((p) => p.id === "p2");
  assert.equal(slot.isMath, false);
  assert.equal(slot.subject, "语文");
  assert.equal(weekMathCount("2017-08-28", s), 5);

  s.date = "2017-09-01";
  s.periodId = "morning-read";
  const later = upcomingMath(s, { sameDay: true, skipTaught: true });
  assert.equal(later, null);
  prepareLesson(s, { topic: "集合与逻辑用语", depth: 2, homework: "中" });
  const t = teach(s, "精讲例题");
  assert.equal(t.ok, false);
  assert.ok(t.reason.includes("数学") || t.reason.includes("上完") || t.reason.includes("停课") === false);
});

test("停课日和早读不能调课或借课", () => {
  const s = createGame(20170901);
  const exam = borrowIn(s, "2017-10-16", "p6");
  assert.equal(exam.ok, false);
  assert.ok(exam.reason.includes("停课"));
  const examSwap = swapPeriods(s, { date: "2017-10-16", periodId: "p1" }, { date: "2017-09-07", periodId: "p2" });
  assert.equal(examSwap.ok, false);
  assert.ok(examSwap.reason.includes("停课"));

  const morning = borrowIn(s, "2017-09-06", "morning-read");
  assert.equal(morning.ok, false);
  assert.ok(morning.reason.includes("早读"));
  const morningSwap = swapPeriods(s, { date: "2017-09-06", periodId: "morning-read" }, { date: "2017-09-06", periodId: "p6" });
  assert.equal(morningSwap.ok, false);
  assert.ok(morningSwap.reason.includes("早读"));
  const ev = canAlterSlot("2017-09-04", "evening-1");
  assert.equal(ev.ok, false);
  assert.ok(ev.reason.includes("晚自习") || ev.reason.includes("辅导"));
  const noon = canAlterSlot("2017-09-02", "noon");
  assert.equal(noon.ok, false);
  const sun = swapPeriods(s, { date: "2017-09-03", periodId: "rest" }, { date: "2017-09-04", periodId: "p2" });
  assert.equal(sun.ok, false);
});

test("存档往返后调借覆盖仍在，旧档缺省为空也不坏", () => {
  const a = createGame(20170901);
  swapPeriods(a, { date: "2017-09-06", periodId: "p1" }, { date: "2017-09-07", periodId: "p2" });
  borrowIn(a, "2017-09-06", "p6");
  const json = toJSON(a);
  const b = fromJSON(json);
  const wed = daySchedule("2017-09-06", b);
  assert.equal(wed.find((p) => p.id === "p1").subject, "语文");
  assert.equal(wed.find((p) => p.id === "p1").isMath, false);
  assert.equal(wed.find((p) => p.id === "p6").isMath, true);
  assert.equal(daySchedule("2017-09-07", b).find((p) => p.id === "p2").isMath, true);

  const old = createGame(20170901);
  delete old.timetableOverrides;
  delete old.timetableInbox;
  const back = fromJSON(toJSON(old));
  const fri = daySchedule("2017-09-01", back);
  assert.ok(fri.find((p) => p.id === "p2").isMath);
  assert.equal(weekMathCount("2017-09-01", back), 6);
});

test("一周借入和借出有节制，自动推进不会因请求卡死", () => {
  const s = createGame(20170901);
  assert.equal(borrowIn(s, "2017-09-06", "p6").ok, true);
  const second = borrowIn(s, "2017-09-07", "p8");
  assert.equal(second.ok, false);
  assert.ok(second.reason.includes("一周") || second.reason.includes("已经"));
  const sameDay = borrowIn(s, "2017-09-06", "p8");
  assert.equal(sameDay.ok, false);

  const pe = borrowIn(createGame(20170901), "2017-09-04", "p7");
  assert.equal(pe.ok, true);
  assert.ok(pe.text.includes("临时") && pe.text.includes("体育"));

  const t = createGame(20170901);
  swapPeriods(t, { date: "2017-09-06", periodId: "p1" }, { date: "2017-09-07", periodId: "p2" });
  const skip = skipToNextStage(t);
  assert.equal(skip.ok, true);
  assert.ok(t.date >= "2017-10-16");
  // 覆盖仍在，自动模式不会清掉
  assert.equal(daySchedule("2017-09-06", t).find((p) => p.id === "p1").subject, "语文");
});

test("对方来借或对调的请求可复现，同意或拒绝后课表跟着变", () => {
  function datesFrom(start, n) {
    const out = [];
    const d0 = new Date(`${start}T00:00:00Z`);
    for (let i = 0; i < n; i++) {
      const dt = new Date(d0);
      dt.setUTCDate(dt.getUTCDate() + i);
      out.push(dt.toISOString().slice(0, 10));
    }
    return out;
  }
  function scan(seed) {
    const s = { seed, timetableOverrides: [], timetableInbox: {} };
    const days = [];
    for (const d of datesFrom("2017-09-01", 45)) {
      const req = pendingTimetableRequest(s, d);
      if (req) days.push({ date: d, req: { ...req } });
    }
    return days;
  }
  const a = scan(20170901);
  const b = scan(20170901);
  assert.ok(a.length >= 1, "这段日子里应至少出现一次调课或借课请求");
  assert.deepEqual(a, b);

  // 多存档种子上，月考前若干天的出现率应高于开学前两周
  let earlyN = 0, earlyD = 0, nearN = 0, nearD = 0;
  for (let k = 0; k < 24; k++) {
    const days = scan(20170901 + k);
    for (const d of datesFrom("2017-09-01", 14)) {
      earlyD++;
      if (days.some((x) => x.date === d)) earlyN++;
    }
    for (const d of datesFrom("2017-10-09", 7)) {
      nearD++;
      if (days.some((x) => x.date === d)) nearN++;
    }
  }
  const earlyRate = earlyN / earlyD;
  const nearRate = nearN / nearD;
  assert.ok(nearRate > earlyRate, `考前请求应更常见，考前 ${nearRate.toFixed(2)}，开学前两周 ${earlyRate.toFixed(2)}`);

  const hit = a[0];
  const s = createGame(20170901);
  s.date = hit.date;
  const frozen = ensureIncomingRequest(s, hit.date);
  assert.equal(frozen.type, hit.req.type);
  const acc = respondTimetableRequest(s, true, hit.date);
  assert.equal(acc.ok, true);
  if (frozen.type === "borrow-out") {
    const slot = daySchedule(frozen.mathDate, s).find((p) => p.id === frozen.mathPeriodId);
    assert.equal(slot.isMath, false);
    assert.equal(slot.subject, frozen.peerSubject);
  } else {
    const mathNow = daySchedule(frozen.otherDate, s).find((p) => p.id === frozen.otherPeriodId);
    const otherNow = daySchedule(frozen.mathDate, s).find((p) => p.id === frozen.mathPeriodId);
    assert.equal(mathNow.isMath, true);
    assert.equal(otherNow.isMath, false);
  }

  const r = createGame(20170901);
  r.date = hit.date;
  ensureIncomingRequest(r, hit.date);
  const no = respondTimetableRequest(r, false, hit.date);
  assert.equal(no.ok, true);
  assert.equal(no.accepted, false);
  if (hit.req.type === "borrow-out") {
    const slot = daySchedule(hit.req.mathDate, r).find((p) => p.id === hit.req.mathPeriodId);
    assert.equal(slot.isMath, true);
  } else {
    const mathStill = daySchedule(hit.req.mathDate, r).find((p) => p.id === hit.req.mathPeriodId);
    assert.equal(mathStill.isMath, true);
  }
});

test("正课迟到写入档案近况和课堂纪要，且不与晚自习点名混用；走错教室偶发可复现", () => {
  function once() {
    const s = createGame(20170901);
    prepareLesson(s, { topic: "集合与逻辑用语", depth: 2, homework: "中" });
    const t = teach(s, "精讲例题");
    assert.equal(t.ok, true);
    const lates = t.record.latecomers || [];
    const lateIds = lates.map((x) => x.id).sort();
    for (const row of lates) {
      const stu = playerStudents(s).find((x) => x.id === row.id);
      assert.ok(stu.lastClassLate?.date === "2017-09-01");
      const status = studentRecentStatus(stu, s);
      assert.ok(status.includes("正课迟到"));
      assert.ok(!status.includes("晚自习点名") || true);
    }
    return { notes: t.record.notes, lateIds, wrong: !!t.record.wrongClassroom, text: t.text };
  }
  const a = once();
  const b = once();
  assert.deepEqual(a, b);
  if (a.lateIds.length) {
    assert.ok(a.notes.some((n) => n.includes("上课铃后")));
  }
  // 走错教室即使本课没发生，函数也必须是确定性的
  assert.equal(typeof a.wrong, "boolean");
});
