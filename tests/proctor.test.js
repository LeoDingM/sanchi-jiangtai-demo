import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createGame, playerStudents, skipToNextStage, skipUntil, currentSlot,
  doProctorAction, isProctorOpen, proctorUnavailableReason, proctorChoices,
  proctorAssignment, ensureProctorState, markClassPapers, isMarkingOpen,
  markingUnavailableReason, markingPapers, pendingGradeableExam,
  isSchoolGradeableKind, examEventOn, listExamReports, examIsSettled,
  PROCTOR_SESSION_CAP, PROCTOR_SOURCE_NOTE, GRADEABLE_EXAM_KINDS,
} from "../js/domain/simulation.js";
import { toJSON, fromJSON } from "../js/domain/save.js";
import { SCHOOL_CALENDAR } from "../js/domain/calendar.js";
import { provincialLines } from "../js/domain/jiangxi.js";

function abilityMap(state) {
  const out = {};
  for (const s of playerStudents(state)) out[s.id] = { ...s.ability };
  return out;
}

function examTotals(state) {
  const out = {};
  for (const ex of Object.values(state.exams || {})) {
    for (const row of ex.rows || []) out[`${ex.examId || ex.date}|${row.studentId}`] = row.total;
  }
  return out;
}

function snapshotScores(state) {
  return { ability: abilityMap(state), totals: examTotals(state) };
}

function assertScoresUntouched(before, state) {
  assert.deepEqual(abilityMap(state), before.ability, "不应改学生能力");
  assert.deepEqual(examTotals(state), before.totals, "不应改考试分数");
}

function goExamMorning(state, date = "2017-10-16") {
  state.date = date;
  state.periodId = "morning-read";
  return state;
}

function goExamAfternoon(state, date = "2017-10-16") {
  state.date = date;
  state.periodId = "p5";
  return state;
}

function goOffice(state, date = "2017-10-17") {
  state.date = date;
  state.periodId = "morning-read";
  return state;
}

function settleFirstMonthly(state) {
  const ev = examEventOn("2017-10-16");
  assert.ok(ev && ev.examKind === "monthly", "2017-10-16 应是第一次月考");
  skipToNextStage(state);
  assert.equal(state.date, "2017-10-16");
  assert.ok(listExamReports(state, { entryYear: state.player.cohortYear }).some((r) => r.examKind === "monthly"));
  return ev;
}

test("监考安排对同一 seed、考试、日期确定，非考试日不可监考", () => {
  const a = createGame(20170901);
  const b = createGame(20170901);
  goOffice(a, "2017-09-04");
  goOffice(b, "2017-09-04");
  assert.equal(isProctorOpen(a), false);
  assert.match(proctorUnavailableReason(a), /不是校历上的考试日|没有监考/);
  assert.equal(examEventOn("2017-09-04"), null);

  settleFirstMonthly(a);
  settleFirstMonthly(b);
  goExamMorning(a);
  goExamMorning(b);
  const aa = proctorAssignment(a);
  const ba = proctorAssignment(b);
  assert.ok(aa && ba);
  assert.equal(aa.room, ba.room);
  assert.equal(aa.examId, ba.examId);
  assert.match(aa.room, /考场/);
  assert.match(aa.note, /宁川中学校内考务安排/);
  const ca = proctorChoices(a);
  const cb = proctorChoices(b);
  assert.ok(ca.length >= 2, "考场可做的操作不应是空菜单");
  assert.deepEqual(ca.map((x) => x.id), cb.map((x) => x.id));
  const r1 = doProctorAction(a, "patrol");
  const r2 = doProctorAction(b, "patrol");
  assert.equal(r1.ok, true, r1.reason);
  assert.equal(r2.ok, true, r2.reason);
  assert.equal(r1.text, r2.text);
  assert.match(r1.text, /巡考|纪律/);
  assert.match(r1.text, /宁川中学/);
});

test("监考写入日志，不改学生分数、能力或省控", () => {
  const state = createGame(20170901);
  settleFirstMonthly(state);
  goExamMorning(state);
  const before = snapshotScores(state);
  const lines = {
    2016: provincialLines(2016, "li"),
    2017: provincialLines(2017, "li"),
    2018: provincialLines(2018, "li"),
    2019: provincialLines(2019, "li"),
    2020: provincialLines(2020, "li"),
  };
  assert.equal(isProctorOpen(state), true, proctorUnavailableReason(state));
  const r = doProctorAction(state, "patrol");
  assert.equal(r.ok, true, r.reason);
  assert.ok((state.log || []).some((l) => l.text === r.text));
  const incident = proctorChoices(state).find((c) => c.id !== "collect" && c.id !== "patrol") || proctorChoices(state)[0];
  if (incident) {
    const r2 = doProctorAction(state, incident.id);
    assert.equal(r2.ok, true, r2.reason);
    assert.ok((state.log || []).some((l) => l.text === r2.text));
  }
  assertScoresUntouched(before, state);
  assert.deepEqual(provincialLines(2018, "li"), lines[2018]);
  assert.equal(provincialLines(2020, "li").first, 535);
  assert.deepEqual(provincialLines(2016, "li"), lines[2016]);
  assert.deepEqual(provincialLines(2017, "li"), lines[2017]);
  assert.deepEqual(provincialLines(2019, "li"), lines[2019]);
  assert.deepEqual(provincialLines(2020, "li"), lines[2020]);
});

test("同一场监考有上限，收卷后本场不能再刷", () => {
  const state = createGame(20170901);
  settleFirstMonthly(state);
  goExamMorning(state);
  let n = 0;
  for (let i = 0; i < 8; i++) {
    const choices = proctorChoices(state);
    if (!choices.length) break;
    const next = choices.find((c) => c.id === "collect") && i >= 1 ? choices.find((c) => c.id === "collect") : choices[0];
    const r = doProctorAction(state, next.id);
    assert.equal(r.ok, true, r.reason);
    n += 1;
  }
  assert.ok(n <= PROCTOR_SESSION_CAP, `同一场不应超过 ${PROCTOR_SESSION_CAP} 次，实际 ${n}`);
  assert.equal(isProctorOpen(state), false);
  assert.match(proctorUnavailableReason(state), /收卷|不要反复|本场/);
  const fail = doProctorAction(state, "patrol");
  assert.equal(fail.ok, false);
});

test("阅卷只在月考/期中/期末/模拟结算后的办公室坐班可用，联考/会考/高考不可在本校阅卷", () => {
  const state = createGame(20170901);
  goOffice(state, "2017-09-04");
  assert.equal(isMarkingOpen(state), false);
  assert.match(markingUnavailableReason(state), /还没有|结算/);

  settleFirstMonthly(state);
  goExamMorning(state);
  assert.equal(isMarkingOpen(state), false, "考试当天上午不可阅卷");
  assert.match(markingUnavailableReason(state), /下午办公室|翌日|结算/);

  goExamAfternoon(state);
  assert.equal(isMarkingOpen(state), true, markingUnavailableReason(state));
  const pending = pendingGradeableExam(state);
  assert.ok(pending && pending.examKind === "monthly");
  const papers = markingPapers(state);
  assert.ok(papers.length >= 3 && papers.length <= 6, `应列出 3–6 份卷，实际 ${papers.length}`);

  goOffice(state, "2017-10-17");
  assert.equal(isMarkingOpen(state), true, markingUnavailableReason(state));

  const mid = createGame(20170901);
  skipUntil(mid, (s) => s.date >= "2017-11-15" && listExamReports(s, { entryYear: 2017 }).some((r) => r.examKind === "midterm"), 20);
  assert.ok(listExamReports(mid, { entryYear: 2017 }).some((r) => r.examKind === "midterm"));
  goOffice(mid, "2017-11-18");
  const midPending = pendingGradeableExam(mid);
  assert.ok(midPending && (midPending.examKind === "midterm" || isSchoolGradeableKind(midPending.examKind)));
  assert.equal(isMarkingOpen(mid), true, markingUnavailableReason(mid));

  const joint = createGame(20170901);
  skipUntil(joint, (s) => s.date >= "2018-04-18" && listExamReports(s, { entryYear: 2017 }).some((r) => r.examKind === "city"), 40);
  assert.ok(joint.date >= "2018-04-18");
  const city = listExamReports(joint, { entryYear: 2017 }).find((r) => r.examKind === "city");
  // 高一不参加市联考；把日期放到联考后的坐班，若本班最近场是联考/会考/高考则不可在本校阅
  goOffice(joint, "2018-04-19");
  const latestCityCohort = listExamReports(joint, { entryYear: 2017 })[0];
  if (latestCityCohort && ["city", "province", "huikao", "gaokao"].includes(latestCityCohort.examKind) && !pendingGradeableExam(joint)) {
    assert.equal(isMarkingOpen(joint), false);
    assert.match(markingUnavailableReason(joint), /不在本校改/);
  }

  const gk = createGame(20170901);
  skipUntil(gk, (s) => listExamReports(s, { entryYear: 2017 }).some((r) => r.examKind === "gaokao"), 90);
  const gkReport = listExamReports(gk, { entryYear: 2017 }).find((r) => r.examKind === "gaokao");
  assert.ok(gkReport, "应能结算到本届高考");
  goOffice(gk, "2020-06-10");
  // 即使还有更早未阅的校内卷，也必须能指出高考卷不在本校改；若只剩高考则不可阅
  const pendingAfterGk = pendingGradeableExam(gk);
  if (!pendingAfterGk) {
    assert.equal(isMarkingOpen(gk), false);
    assert.match(markingUnavailableReason(gk), /不在本校改/);
  } else {
    assert.ok(isSchoolGradeableKind(pendingAfterGk.examKind));
    assert.notEqual(pendingAfterGk.examKind, "gaokao");
  }

  const hk = SCHOOL_CALENDAR.find((e) => e.examKind === "huikao" && e.date.startsWith("2018-06"));
  assert.ok(hk);
  const hkState = createGame(20170901);
  skipUntil(hkState, (s) => s.date >= hk.date && (examIsSettled(s, hk.id) || listExamReports(s, { entryYear: 2016 }).some((r) => r.examKind === "huikao") || listExamReports(s).some((r) => r.examKind === "huikao")), 50);
  const huikaoReports = listExamReports(hkState).filter((r) => r.examKind === "huikao");
  assert.ok(huikaoReports.length, "会考应已结算");
  // 玩家本班是 2017 级，2018 年 6 月仍是高一，会考是高二的；本班不应把会考当作本校阅卷
  const mineHk = listExamReports(hkState, { entryYear: 2017 }).find((r) => r.examKind === "huikao");
  assert.equal(mineHk, undefined);
});

test("阅卷摘记不改分数，存档往返后记录仍在", () => {
  const state = createGame(20170901);
  settleFirstMonthly(state);
  goOffice(state, "2017-10-17");
  const before = snapshotScores(state);
  const papers = markingPapers(state);
  assert.ok(papers.length >= 3);
  const r = markClassPapers(state);
  assert.equal(r.ok, true, r.reason);
  assert.ok((state.log || []).some((l) => l.text === r.text));
  assert.match(r.text, /数学卷/);
  assert.match(r.text, /不改分数/);
  assertScoresUntouched(before, state);
  const markedIds = r.papers.map((p) => p.studentId);
  const touched = playerStudents(state).filter((s) => markedIds.includes(s.id));
  assert.ok(touched.length >= 3);
  assert.ok(touched.every((s) => s.lastMarking && s.lastMarking.statusLine));
  const again = markClassPapers(state);
  assert.equal(again.ok, false);
  assert.match(again.reason, /已经阅过|最多阅一轮|明天/);

  const json = toJSON(state);
  const loaded = fromJSON(json);
  assert.ok(loaded.proctor?.markings?.length);
  assert.equal(loaded.proctor.markings[0].examId, r.rec.examId);
  assert.deepEqual(
    (loaded.proctor.markings[0].papers || []).map((p) => ({ id: p.studentId, note: p.note })),
    r.papers.map((p) => ({ id: p.studentId, note: p.note })),
  );
  const loadedTouched = playerStudents(loaded).filter((s) => markedIds.includes(s.id));
  assert.ok(loadedTouched.every((s) => s.lastMarking?.statusLine));
  assert.deepEqual(examTotals(loaded), before.totals);
  goOffice(loaded, "2017-10-17");
  assert.equal(isMarkingOpen(loaded), false);
});

test("自动推进仍能结算考试并越过考试日，不因未监考或未阅卷卡死", () => {
  const state = createGame(20170901);
  const first = skipToNextStage(state);
  assert.equal(first.ok, true);
  assert.equal(first.event.kind, "exam");
  assert.equal(state.date, "2017-10-16");
  const reports = listExamReports(state, { entryYear: 2017 });
  assert.ok(reports.some((r) => r.examKind === "monthly" && r.date === "2017-10-16"));
  const totals = examTotals(state);
  assert.ok(Object.keys(totals).length > 0);
  ensureProctorState(state);
  assert.equal((state.proctor.records || []).length, 0);
  assert.equal((state.proctor.markings || []).length, 0);

  const second = skipToNextStage(state);
  assert.equal(second.ok, true, second.reason);
  assert.ok(state.date > "2017-10-16", `应越过考试日，实际停在 ${state.date}`);
  assert.deepEqual(examTotals(state), totals, "越过考试日时不得改已结算分数");

  const mid = skipUntil(state, (s) => s.date >= "2017-11-15" && listExamReports(s, { entryYear: 2017 }).some((r) => r.examKind === "midterm"), 12);
  assert.ok(mid.length >= 1);
  assert.ok(listExamReports(state, { entryYear: 2017 }).some((r) => r.examKind === "midterm"));
  const afterMid = skipToNextStage(state);
  assert.equal(afterMid.ok, true);
  assert.ok(state.date > "2017-11-15");
});

test("办公室、日常教学、教室和校历能看到监考与阅卷", () => {
  const src = readFileSync(new URL("../js/ui/app.js", import.meta.url), "utf8");
  assert.match(src, /function proctorPanelHtml\s*\(/);
  assert.match(src, /function markingPanelHtml\s*\(/);
  assert.match(src, /阅本班数学卷/);
  assert.match(src, /data-proctor/);
  assert.match(src, /data-mark-papers/);
  assert.match(src, /宁川中学校内考务安排/);
  const officeFn = src.slice(src.indexOf("function officeCollabHtml"), src.indexOf("function bindOfficeActions"));
  assert.match(officeFn, /markingPanelHtml\(\)/);
  const teachFn = src.slice(src.indexOf("function viewTeach"), src.indexOf("function viewPlacement"));
  assert.match(teachFn, /proctorPanelHtml\(\)/);
  const classFn = src.slice(src.indexOf("function viewClassroom"), src.indexOf("function viewRoster"));
  assert.match(classFn, /proctorPanelHtml\(\)/);
  assert.match(src, /function viewLog/);
  assert.match(src, /校内考务安排/);
  assert.match(PROCTOR_SOURCE_NOTE, /宁川中学校内考务安排/);
  assert.deepEqual(GRADEABLE_EXAM_KINDS.slice().sort(), ["final", "midterm", "mock1", "mock2", "mock3", "monthly"]);
});
