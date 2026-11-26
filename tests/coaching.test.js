import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createGame, playerStudents, prepareLesson, teach, skipToNextStage, skipUntil,
  handleCoaching, suggestRemedial, suggestEnrichment, suggestCoaching,
  isCoachingOpen, isCoachingWindow, coachingUnavailableReason,
  ensureCoachingState, studentRecentStatus, currentSlot, majorEventOn,
  COACH_DAY_CAP, COACH_TERM_CAP, COACH_SESSION_MIN, COACH_SESSION_MAX, advanceDay,
} from "../js/domain/simulation.js";
import { toJSON, fromJSON } from "../js/domain/save.js";
import { addDays, SCHOOL_CALENDAR, weekday } from "../js/domain/calendar.js";
import { activityEventOn } from "../js/domain/timetable.js";
import { leaveCovering, isDutyDay } from "../js/domain/health.js";
import { officialProvincialPack, provincialLines } from "../js/domain/jiangxi.js";

function abilityMap(state) {
  const out = {};
  for (const s of playerStudents(state)) out[s.id] = { ...s.ability };
  return out;
}

function potentialMap(state) {
  const out = {};
  for (const s of playerStudents(state)) out[s.id] = s.potential ? { ...s.potential } : s.potential;
  return out;
}

function examTotals(state) {
  const out = {};
  for (const ex of Object.values(state.exams || {})) {
    for (const row of ex.rows || []) {
      out[`${ex.examId || ex.date}|${row.studentId}`] = { total: row.total, math: row.math, rank: row.rank, line: row.line };
    }
  }
  return out;
}

function goOffice(state, date = "2017-09-04") {
  state.date = date;
  state.periodId = "morning-read";
  return state;
}

function goTutoring(state, date = "2017-09-04") {
  state.date = date;
  state.periodId = "evening-1";
  return state;
}

function prepAndTeach(state) {
  prepareLesson(state, { topic: "集合与逻辑用语", depth: 2, homework: "中" });
  teach(state, "精讲例题");
  return state;
}

test("建议名单对同一 seed、日期、节次确定，两次开局一致", () => {
  const a = createGame(20170901);
  const b = createGame(20170901);
  prepAndTeach(a);
  prepAndTeach(b);
  goTutoring(a);
  goTutoring(b);
  const ra = suggestRemedial(a);
  const rb = suggestRemedial(b);
  const ea = suggestEnrichment(a);
  const eb = suggestEnrichment(b);
  assert.ok(ra.length >= COACH_SESSION_MIN && ra.length <= COACH_SESSION_MAX, `补差应为 2–4 人，实际 ${ra.length}`);
  assert.ok(ea.length >= COACH_SESSION_MIN && ea.length <= COACH_SESSION_MAX, `培优应为 2–4 人，实际 ${ea.length}`);
  assert.deepEqual(
    ra.map((v) => ({ id: v.studentId, reason: v.reason })),
    rb.map((v) => ({ id: v.studentId, reason: v.reason })),
  );
  assert.deepEqual(
    ea.map((v) => ({ id: v.studentId, reason: v.reason })),
    eb.map((v) => ({ id: v.studentId, reason: v.reason })),
  );
  const remIds = new Set(ra.map((v) => v.studentId));
  const enrIds = new Set(ea.map((v) => v.studentId));
  for (const id of remIds) assert.equal(enrIds.has(id), false, "同一人不应同时出现在补差和培优名单");
  assert.deepEqual(suggestRemedial(goTutoring(a)).map((v) => v.studentId), ra.map((v) => v.studentId));
  const both = suggestCoaching(a);
  assert.deepEqual(both.remedial.map((v) => v.studentId), ra.map((v) => v.studentId));
});

test("数学正课、考试日、活动日、周日、家长会当天、非辅导且非办公室坐班时不可用", () => {
  const state = createGame(20170901);
  prepAndTeach(state);

  goOffice(state, "2017-09-04");
  assert.equal(isCoachingOpen(state), true, coachingUnavailableReason(state));
  assert.equal(isCoachingWindow(state), true);

  goTutoring(state, "2017-09-04");
  const tutorSlot = currentSlot(state);
  assert.equal(tutorSlot.isTutoring, true);
  assert.equal(isCoachingOpen(state), true, coachingUnavailableReason(state));

  state.periodId = "p2";
  const mathSlot = currentSlot(state);
  assert.equal(mathSlot.isMath, true);
  assert.equal(isCoachingOpen(state), false);
  assert.match(coachingUnavailableReason(state), /数学正课/);

  state.periodId = "evening-2";
  assert.equal(currentSlot(state).isTutoring, false);
  assert.equal(isCoachingOpen(state), false);
  assert.match(coachingUnavailableReason(state), /普通晚自习|不是辅导时段/);

  state.date = "2017-09-06";
  state.periodId = "evening-1";
  assert.equal(weekday(state.date), 3);
  assert.equal(currentSlot(state).isTutoring, false);
  assert.equal(isCoachingOpen(state), false);
  assert.match(coachingUnavailableReason(state), /普通晚自习|不是辅导时段/);

  state.date = "2017-09-04";
  state.periodId = "noon";
  assert.equal(isCoachingOpen(state), false);
  assert.match(coachingUnavailableReason(state), /辅导时段或办公室坐班/);

  state.date = "2017-10-16";
  state.periodId = "morning-read";
  assert.ok(majorEventOn("2017-10-16"));
  assert.equal(isCoachingOpen(state), false);
  assert.match(coachingUnavailableReason(state), /考试/);

  const sports = SCHOOL_CALENDAR.find((e) => e.kind === "activity" && e.activityKind === "sports" && e.date.startsWith("2017"));
  assert.ok(sports, "应有 2017 年运动会");
  state.date = sports.date;
  state.periodId = "morning-read";
  assert.ok(activityEventOn(state.date));
  assert.equal(isCoachingOpen(state), false);
  assert.match(coachingUnavailableReason(state), /活动/);

  const newyear = SCHOOL_CALENDAR.find((e) => e.kind === "activity" && e.activityKind === "newyear" && e.date.startsWith("2017"));
  assert.ok(newyear);
  state.date = newyear.date;
  state.periodId = "morning-read";
  assert.equal(isCoachingOpen(state), false);

  state.date = "2017-09-03";
  state.periodId = "rest";
  assert.equal(weekday(state.date), 0);
  assert.equal(isCoachingOpen(state), false);
  assert.match(coachingUnavailableReason(state), /周日/);

  const parents = SCHOOL_CALENDAR.find((e) => e.kind === "parents" && e.date.startsWith("2017"));
  assert.ok(parents);
  state.date = parents.date;
  state.periodId = "morning-read";
  assert.equal(isCoachingOpen(state), false);
  assert.match(coachingUnavailableReason(state), /家长会/);
});

test("每天和每学期上限生效；请假生不在当场名单", () => {
  const state = createGame(20170901);
  prepAndTeach(state);
  goTutoring(state, "2017-09-04");
  assert.equal(isCoachingOpen(state), true, coachingUnavailableReason(state));
  const list = suggestRemedial(state);
  assert.ok(list.length >= COACH_SESSION_MIN);
  const r = handleCoaching(state, "remedial", list.map((v) => v.studentId), "fixErrors");
  assert.equal(r.ok, true, r.reason);
  assert.equal(COACH_DAY_CAP, 1);
  assert.equal(isCoachingOpen(state), false);
  assert.match(coachingUnavailableReason(state), /每天最多一场|已经做过一场/);
  const again = handleCoaching(state, "enrich", suggestEnrichment(state).map((v) => v.studentId), "extend");
  assert.equal(again.ok, false);

  goOffice(state, "2017-09-05");
  assert.equal(isCoachingOpen(state), true, coachingUnavailableReason(state));

  const cls = playerStudents(state);
  let leaveDate = "2017-09-05";
  let away = [];
  for (let i = 0; i < 40; i++) {
    if (isDutyDay(leaveDate) && weekday(leaveDate) !== 0 && !majorEventOn(leaveDate) && !activityEventOn(leaveDate)) {
      away = cls.filter((s) => leaveCovering(s, leaveDate, state.seed));
      if (away.length) break;
    }
    leaveDate = addDays(leaveDate, 1);
  }
  assert.ok(away.length, "应能找到请假不在校的学生");
  const leaveSlot = weekday(leaveDate) === 1 ? "evening-1" : "morning-read";
  state.date = leaveDate;
  state.periodId = leaveSlot;
  if (!isCoachingOpen(state)) {
    state.periodId = "morning-read";
  }
  if (isCoachingOpen(state)) {
    const rem = suggestRemedial(state);
    const enr = suggestEnrichment(state);
    const awayIds = new Set(away.map((s) => s.id));
    assert.ok(rem.every((v) => !awayIds.has(v.studentId)), "请假生不应出现在补差名单");
    assert.ok(enr.every((v) => !awayIds.has(v.studentId)), "请假生不应出现在培优名单");
    const blocked = handleCoaching(state, "remedial", [away[0].id, ...(rem[0] ? [rem[0].studentId] : [])], "fixErrors");
    assert.equal(blocked.ok, false);
  }

  goOffice(state, "2017-09-11");
  ensureCoachingState(state);
  state.coaching.count = COACH_TERM_CAP;
  assert.equal(isCoachingOpen(state), false);
  assert.match(coachingUnavailableReason(state), /上限|这学期/);
  const over = handleCoaching(state, "remedial", suggestRemedial(state).map((v) => v.studentId), "fixErrors");
  assert.equal(over.ok, false);
});

test("处理写入日志和档案近况，不改能力、分数或省控", () => {
  const state = createGame(20170901);
  prepAndTeach(state);
  goTutoring(state, "2017-09-04");
  const list = suggestRemedial(state);
  assert.ok(list.length >= COACH_SESSION_MIN);
  const beforeAbility = abilityMap(state);
  const beforePotential = potentialMap(state);
  const beforeExams = examTotals(state);
  const officialBefore = officialProvincialPack(2017);
  const linesBefore = JSON.stringify(provincialLines(2017));
  const rel0 = Object.fromEntries(list.map((v) => {
    const s = playerStudents(state).find((x) => x.id === v.studentId);
    return [v.studentId, s.relation || 0];
  }));
  const r = handleCoaching(state, "remedial", list.map((v) => v.studentId), "clearHw");
  assert.equal(r.ok, true, r.reason);
  assert.ok(r.text.includes("补差") || r.text.includes("课余"));
  assert.ok(r.text.includes("数学"));
  assert.ok(r.text.includes("不是补习班") || r.text.includes("校外培训"));
  assert.ok(r.text.includes("宁川中学"));
  for (const v of list) {
    assert.ok(r.text.includes(v.name));
    const stu = playerStudents(state).find((s) => s.id === v.studentId);
    assert.equal(stu.lastCoaching.date, state.date);
    assert.equal(stu.lastCoaching.kind, "remedial");
    const status = studentRecentStatus(stu, state);
    assert.ok(status.includes("补差") || status.includes(stu.lastCoaching.statusLine.split("：")[0]), status);
    assert.ok((stu.relation || 0) >= rel0[v.studentId]);
  }
  assert.ok((state.log || []).some((l) => l.text === r.text || (l.text || "").includes("补差")));
  assert.deepEqual(abilityMap(state), beforeAbility);
  assert.deepEqual(potentialMap(state), beforePotential);
  assert.deepEqual(examTotals(state), beforeExams);
  assert.deepEqual(officialProvincialPack(2017), officialBefore);
  assert.equal(JSON.stringify(provincialLines(2017)), linesBefore);
});

test("存档往返后培优补差记录仍在", () => {
  const a = createGame(20170901);
  prepAndTeach(a);
  goTutoring(a, "2017-09-04");
  const list = suggestRemedial(a);
  const r = handleCoaching(a, "remedial", list.map((v) => v.studentId), "fixErrors");
  assert.equal(r.ok, true, r.reason);
  goOffice(a, "2017-09-05");
  const enrich = suggestEnrichment(a);
  const e = handleCoaching(a, "enrich", enrich.map((v) => v.studentId), "extend");
  assert.equal(e.ok, true, e.reason);
  const b = fromJSON(toJSON(a));
  assert.equal(b.date, a.date);
  assert.equal(b.coaching.count, a.coaching.count);
  assert.equal(b.coaching.kind, "enrich");
  const stuA = playerStudents(a).find((s) => s.id === list[0].studentId);
  const stuB = playerStudents(b).find((s) => s.id === list[0].studentId);
  assert.equal(stuB.lastCoaching.kind, "remedial");
  assert.equal(stuB.lastCoaching.text, stuA.lastCoaching.text);
  assert.ok((stuB.coachings || []).some((x) => x.kind === "remedial"));
  const enA = playerStudents(a).find((s) => s.id === enrich[0].studentId);
  const enB = playerStudents(b).find((s) => s.id === enrich[0].studentId);
  assert.equal(enB.lastCoaching.kind, "enrich");
  assert.equal(enB.lastCoaching.text, enA.lastCoaching.text);
  const again = handleCoaching(b, "enrich", enrich.map((v) => v.studentId), "extend");
  assert.equal(again.ok, false);
});

test("自动推进能越过有名额的日子，不卡死", () => {
  const state = createGame(20170901);
  prepAndTeach(state);
  goTutoring(state, "2017-09-04");
  assert.equal(isCoachingOpen(state), true, coachingUnavailableReason(state));
  const r = skipToNextStage(state);
  assert.equal(r.ok, true, r.reason);
  assert.ok(state.date >= "2017-10-16", `应越过辅导日到达第一次月考或更后，当前 ${state.date}`);
  assert.ok(majorEventOn(state.date) || (state.exams && Object.keys(state.exams).length), "应落到考试或已结算考试");

  const mid = createGame(20170901);
  goOffice(mid, "2017-09-04");
  assert.equal(isCoachingOpen(mid), true);
  skipUntil(mid, (s) => s.date >= "2018-01-16", 40);
  assert.ok(mid.date >= "2018-01-16", `应能推进到期末，当前 ${mid.date}`);

  const day = createGame(20170901);
  day.date = "2017-09-04";
  day.periodId = "noon";
  const stepped = advanceDay(day);
  assert.ok(stepped);
  assert.equal(day.date, "2017-09-05");
});

test("日常教学、教室和办公室界面有培优补差入口，档案能看到记录", () => {
  const src = readFileSync(new URL("../js/ui/app.js", import.meta.url), "utf8");
  assert.match(src, /function coachingPanelHtml\s*\(/);
  assert.match(src, /培优补差/);
  assert.match(src, /data-coach-kind/);
  assert.match(src, /data-coach-act/);
  assert.match(src, /handleCoaching/);
  assert.match(src, /培优补差记录/);
  const officeFn = src.slice(src.indexOf("function officeCollabHtml"), src.indexOf("function bindOfficeActions"));
  assert.match(officeFn, /coachingPanelHtml/);
  const classFn = src.slice(src.indexOf("function viewClassroom"), src.indexOf("function viewRoster"));
  assert.match(classFn, /coachingPanelHtml/);
  const teachFn = src.slice(src.indexOf("function viewTeach"), src.indexOf("function viewPlacement"));
  assert.match(teachFn, /officeCollabHtml\(\)/);
});
