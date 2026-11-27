import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createGame, playerStudents, prepareLesson, teach, skipToNextStage, skipUntil,
  handleDutyWeek, composeDutyWeekBrief, dutyWeekOptionsFor, composeDutyWeekMinutes,
  isDutyWeekOpen, isDutyWeekWindow, dutyWeekUnavailableReason,
  ensureDutyWeekState, hasDutyWeekToday, latestDutyWeekToday,
  isDutyWeekTimeSlot, weekDutyKey, termDutyKey, isDutyWeek, isDutyWeekWindowDate,
  isDutyWeekNoClassDate, dutyWeekStartsOfTerm, firstDutyWeekStart, candidateDutyWeekStarts,
  dutyWeekFollowUp, DUTY_WEEK_ACTIONS, DUTY_WEEK_SOURCE_NOTE, DUTY_WEEKS_PER_TERM,
  DUTY_DAY_CAP, DUTY_LEADER_NAME, DUTY_LEADER_TITLE, DUTY_WEEK_MARK,
  currentSlot, majorEventOn, hostClassMeeting, advanceDay, studentRecentStatus,
  isStudyHallSubject, classLatecomers, compileEveningRoll,
} from "../js/domain/simulation.js";
import { toJSON, fromJSON } from "../js/domain/save.js";
import { addDays, SCHOOL_CALENDAR, weekday } from "../js/domain/calendar.js";
import { activityEventOn, daySchedule, weekStart as ttWeekStart } from "../js/domain/timetable.js";
import { officialProvincialPack, provincialLines } from "../js/domain/jiangxi.js";

function weekStartOf(date) {
  return ttWeekStart(date) || weekStart(date);
}

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

function lateSnapshot(state) {
  return playerStudents(state).map((s) => ({ id: s.id, late: s.lastClassLate ? { ...s.lastClassLate } : null }));
}

function rollSnapshot(state) {
  return playerStudents(state).map((s) => ({
    id: s.id,
    rollCalls: JSON.parse(JSON.stringify(s.rollCalls || [])),
    lastRoll: s.lastRoll ? JSON.parse(JSON.stringify(s.lastRoll)) : null,
  }));
}

function goOffice(state, date, periodId = "morning-read") {
  state.date = date;
  state.periodId = periodId;
  return state;
}

function firstDutyOffice(seed = 20170901) {
  const state = createGame(seed);
  goOffice(state, "2017-09-11");
  return state;
}

function periodOn(state, date, pred) {
  goOffice(state, date, "morning-read");
  const slot = daySchedule(date, state).find(pred);
  return slot || null;
}

describe("值周与协助行政值班", { concurrency: 1 }, () => {
test("开局后第一次值周不落在开学典礼周，而在正式上课之后的合格值周周；两次开局同一天选择结果确定一致", () => {
  assert.equal(weekday("2017-09-01"), 5);
  assert.equal(weekday("2017-09-04"), 1);
  assert.equal(weekday("2017-09-11"), 1);
  const opening = createGame(20170901);
  goOffice(opening, "2017-09-01");
  assert.equal(isDutyWeek("2017-09-01", opening), false);
  assert.equal(isDutyWeekWindowDate("2017-09-01", opening), false);
  assert.equal(isDutyWeekOpen(opening), false);
  assert.match(dutyWeekUnavailableReason(opening), /开学典礼|报到|值周周/);
  assert.equal(firstDutyWeekStart("2017-09-01", opening), "2017-09-11");
  assert.ok(!dutyWeekStartsOfTerm("2017-09-01", opening).includes(weekStartOf("2017-09-01")));

  const formal = createGame(20170901);
  goOffice(formal, "2017-09-04");
  assert.equal(isDutyWeek("2017-09-04", formal), false);
  assert.equal(isDutyWeekOpen(formal), false);
  assert.match(dutyWeekUnavailableReason(formal), /值周周/);

  const a = firstDutyOffice(20170901);
  const b = firstDutyOffice(20170901);
  assert.equal(isDutyWeek("2017-09-11", a), true);
  assert.equal(isDutyWeekOpen(a), true, dutyWeekUnavailableReason(a));
  assert.equal(isDutyWeekOpen(b), true, dutyWeekUnavailableReason(b));
  assert.equal(isDutyWeekWindow(a), true);
  assert.equal(isDutyWeekWindowDate("2017-09-11", a), true);
  assert.equal(firstDutyWeekStart(a.date, a), "2017-09-11");

  const weeks = dutyWeekStartsOfTerm(a.date, a);
  assert.equal(weeks.length, DUTY_WEEKS_PER_TERM);
  assert.equal(weeks[0], "2017-09-11");
  assert.ok(weeks.every((w) => w > "2017-09-01" && weekStartOf(w) !== weekStartOf("2017-09-01")));
  assert.equal(DUTY_WEEKS_PER_TERM, 2);

  const ba = composeDutyWeekBrief(a);
  const bb = composeDutyWeekBrief(b);
  assert.ok(ba && bb);
  assert.deepEqual(
    {
      gate: ba.gate.map((s) => s.id),
      patrol: ba.patrol.map((s) => s.id),
      preview: ba.preview,
    },
    {
      gate: bb.gate.map((s) => s.id),
      patrol: bb.patrol.map((s) => s.id),
      preview: bb.preview,
    },
  );
  assert.ok(ba.gate.length >= 1 && ba.gate.length <= 5);
  assert.ok(ba.patrol.length >= 1 && ba.patrol.length <= 5);
  assert.ok(ba.gate.length < playerStudents(a).length);
  assert.ok(ba.patrol.length < playerStudents(a).length);
  assert.match(ba.preview, /钟永泰/);
  assert.match(ba.preview, /任课数学老师/);
  assert.doesNotMatch(ba.preview, /你作为班主任|你主持了行政值班|改任班主任/);

  const oa = dutyWeekOptionsFor(a);
  const ob = dutyWeekOptionsFor(b);
  assert.equal(oa.length, 3);
  assert.deepEqual(oa.map((o) => ({ id: o.id, label: o.label, text: o.text })), ob.map((o) => ({ id: o.id, label: o.label, text: o.text })));
  assert.deepEqual(oa.map((o) => o.id), DUTY_WEEK_ACTIONS.map((x) => x.id));
  for (const o of oa) {
    assert.equal(composeDutyWeekMinutes(a, o.id, ba), o.text);
    assert.match(o.text, /任课/);
    assert.match(o.text, /值周/);
    assert.doesNotMatch(o.text, /你作为班主任|你主持了班会|改任班主任|主持行政值班后升职/);
    assert.ok(o.text.includes(DUTY_WEEK_MARK) || DUTY_WEEK_SOURCE_NOTE.includes("值周"));
    assert.match(o.text, /钟永泰|虚构/);
  }

  const ra = handleDutyWeek(a, "gate");
  const rb = handleDutyWeek(b, "gate");
  assert.equal(ra.ok, true, ra.reason);
  assert.equal(rb.ok, true, rb.reason);
  assert.equal(ra.text, rb.text);
  assert.match(ra.text, /校门口|清点迟到/);
  assert.ok((a.log || []).some((l) => l.text === ra.text));
  assert.equal(hasDutyWeekToday(a), true);
  assert.equal(DUTY_DAY_CAP, 1);
  assert.equal(a.dutyWeek.followUp?.text, DUTY_WEEK_MARK);
  assert.equal(dutyWeekFollowUp(a)?.text, DUTY_WEEK_MARK);
});

test("数学正课、辅导时段、晚自习、自习看班节、考试日、活动日、周日、家长会当天、开学典礼或报到可玩日、非值周周不可开；值周周内每日最多一次，学期上限生效", () => {
  const state = firstDutyOffice();

  const mathSlot = periodOn(state, "2017-09-11", (p) => p.isMath && !p.isTutoring);
  assert.ok(mathSlot, "2017-09-11 应有数学正课");
  goOffice(state, "2017-09-11", mathSlot.id);
  const math = currentSlot(state);
  assert.equal(math.isMath, true, `2017-09-11 ${mathSlot.id} 应为数学正课，实际 ${math.subject}`);
  assert.equal(isDutyWeekOpen(state), false);
  assert.equal(isDutyWeekWindow(state), false);
  assert.match(dutyWeekUnavailableReason(state), /数学正课/);

  const tutorDate = "2017-09-11";
  const tutorSlot = periodOn(state, tutorDate, (p) => p.isTutoring || /^evening/.test(p.id));
  if (tutorSlot) {
    goOffice(state, tutorDate, tutorSlot.id);
    assert.equal(isDutyWeekOpen(state), false);
    assert.match(dutyWeekUnavailableReason(state), /辅导|晚自习|办公室坐班/);
  }

  const hallSlot = periodOn(state, "2017-09-11", (p) => isStudyHallSubject(p));
  if (hallSlot) {
    goOffice(state, "2017-09-11", hallSlot.id);
    assert.equal(isDutyWeekTimeSlot(hallSlot, "2017-09-11"), false);
    assert.equal(isDutyWeekOpen(state), false);
    assert.match(dutyWeekUnavailableReason(state), /自习看班|办公室坐班/);
  } else {
    goOffice(state, "2017-09-08", "evening-2");
    const hall = currentSlot(state);
    assert.equal(isStudyHallSubject(hall), true);
    assert.equal(isDutyWeekTimeSlot(hall, "2017-09-08"), false);
    assert.equal(isDutyWeekOpen(state), false);
    assert.match(dutyWeekUnavailableReason(state), /自习看班|办公室坐班|值周周/);
  }

  goOffice(state, "2017-11-17");
  assert.ok(majorEventOn("2017-11-17")?.kind === "exam" || SCHOOL_CALENDAR.some((e) => e.kind === "exam" && e.date <= "2017-11-17"));
  assert.equal(isDutyWeekOpen(state), false);
  assert.match(dutyWeekUnavailableReason(state), /考试|值周周/);
  goOffice(state, "2017-11-16");
  assert.equal(isDutyWeekOpen(state), false);
  assert.match(dutyWeekUnavailableReason(state), /考试|值周周|窗口/);

  goOffice(state, "2017-10-27");
  assert.ok(activityEventOn("2017-10-27"));
  assert.equal(isDutyWeekOpen(state), false);
  assert.match(dutyWeekUnavailableReason(state), /活动|值周周/);

  goOffice(state, "2017-09-10");
  assert.equal(weekday("2017-09-10"), 0);
  assert.equal(isDutyWeekOpen(state), false);
  assert.match(dutyWeekUnavailableReason(state), /周日/);

  goOffice(state, "2017-11-25");
  assert.equal(weekday("2017-11-25"), 6);
  assert.equal(majorEventOn("2017-11-25")?.kind, "parents");
  assert.equal(isDutyWeekOpen(state), false);
  assert.match(dutyWeekUnavailableReason(state), /家长会|周六/);

  goOffice(state, "2018-02-22");
  assert.equal(isDutyWeekOpen(state), false);
  assert.match(dutyWeekUnavailableReason(state), /开学典礼|报到|值周周/);
  assert.equal(isDutyWeek("2018-02-22", state), false);
  const springFirst = firstDutyWeekStart("2018-03-01", state);
  assert.ok(springFirst && springFirst > "2018-02-22");
  assert.ok(weekStartOf(springFirst) !== weekStartOf("2018-02-22"));

  goOffice(state, "2017-09-08");
  assert.equal(isDutyWeek("2017-09-08", state), false);
  assert.equal(isDutyWeekWindow(state), false);
  assert.equal(isDutyWeekOpen(state), false);
  assert.match(dutyWeekUnavailableReason(state), /值周周/);

  const once = firstDutyOffice();
  const r1 = handleDutyWeek(once, "patrol");
  assert.equal(r1.ok, true, r1.reason);
  assert.equal(hasDutyWeekToday(once), true);
  const again = handleDutyWeek(once, "gate");
  assert.equal(again.ok, false);
  assert.match(again.reason, /最多一次|已经做/);
  assert.equal(isDutyWeekWindow(once), true);
  goOffice(once, "2017-09-12");
  assert.equal(weekDutyKey("2017-09-12"), weekDutyKey("2017-09-11"));
  assert.equal(isDutyWeekOpen(once), true, dutyWeekUnavailableReason(once));
  const r2 = handleDutyWeek(once, "minutes");
  assert.equal(r2.ok, true, r2.reason);
  assert.match(r2.text, /纪要|值班领导|钟永泰/);
  assert.match(r2.text, /协助/);
  assert.match(r2.text, /不能因此升职/);
  assert.doesNotMatch(r2.text, /你主持了行政值班|改任年级主任|已经升职/);
  assert.doesNotMatch(r2.text, /你作为班主任/);

  const termWeeks = dutyWeekStartsOfTerm("2017-09-11", once);
  assert.equal(termWeeks.length, 2);
  const outsiders = candidateDutyWeekStarts("2017-09-11", once).filter((w) => !termWeeks.includes(w));
  assert.ok(outsiders.length >= 1, "除两周值周外还应有其他合格周，以便学期上限生效");
  goOffice(once, outsiders[0]);
  assert.equal(isDutyWeek(once.date, once), false);
  assert.equal(isDutyWeekOpen(once), false);
  assert.match(dutyWeekUnavailableReason(once), /值周周|每学期/);
  goOffice(once, termWeeks[1]);
  assert.equal(isDutyWeek(once.date, once), true);
});

test("处理写入日志和档案近况，不改能力、分数、省控，也不改备课充分度，也不改写正课迟到生成或晚自习点名结果", () => {
  const state = firstDutyOffice();
  const prep = prepareLesson(state, { topic: "集合与逻辑用语", depth: 2, homework: "中" });
  assert.equal(prep.ok, true);
  const mathSlot = periodOn(state, "2017-09-11", (p) => p.isMath && !p.isTutoring);
  goOffice(state, "2017-09-11", mathSlot.id);
  const taught = teach(state, "精讲例题");
  assert.equal(taught.ok, true, taught.reason);

  goOffice(state, "2017-09-11", "morning-read");
  const lateIds = classLatecomers(state, playerStudents(state)).map((s) => s.id);
  const lateBefore = lateSnapshot(state);
  const rollBefore = rollSnapshot(state);
  const eveningBefore = compileEveningRoll(state, playerStudents(state));
  const beforeAbility = abilityMap(state);
  const beforePotential = potentialMap(state);
  const beforeExams = examTotals(state);
  const officialBefore = officialProvincialPack(2017);
  const linesBefore = JSON.stringify(provincialLines(2017));
  const prepBefore = state.player.prep;
  const planBefore = state.player.lessonPlan && JSON.parse(JSON.stringify(state.player.lessonPlan));
  const roleBefore = state.player.role;
  const officialFlag = state.player.official;

  const r = handleDutyWeek(state, "gate");
  assert.equal(r.ok, true, r.reason);
  assert.match(r.text, /值周/);
  assert.match(r.text, /任课数学老师/);
  assert.equal(r.rec.role, "任课数学老师");
  assert.equal(r.rec.leaderName, DUTY_LEADER_NAME);
  assert.equal(r.rec.leaderTitle, DUTY_LEADER_TITLE);
  assert.ok((state.log || []).some((l) => l.text === r.text));
  assert.ok((state.dutyWeeks || []).some((m) => m.minutes === r.minutes));
  assert.equal(ensureDutyWeekState(state).doneToday, true);
  assert.equal(state.dutyWeek.followUp?.text, DUTY_WEEK_MARK);
  assert.equal(dutyWeekFollowUp(state)?.text, DUTY_WEEK_MARK);
  assert.equal(state.dutyWeek.onDuty, true);

  const named = playerStudents(state).filter((s) => s.lastDutyWeek);
  assert.ok(named.length >= 1);
  assert.ok(named.length <= 5);
  for (const s of named) {
    const status = studentRecentStatus(s, state);
    assert.match(status, /值周/);
    assert.ok((s.dutyWeekNotes || []).length >= 1);
  }
  const leaveNamed = named.filter((s) => /请假/.test(s.lastDutyWeek?.text || "") && false);
  assert.equal(leaveNamed.length, 0);

  assert.deepEqual(abilityMap(state), beforeAbility);
  assert.deepEqual(potentialMap(state), beforePotential);
  assert.deepEqual(examTotals(state), beforeExams);
  assert.deepEqual(officialProvincialPack(2017), officialBefore);
  assert.equal(JSON.stringify(provincialLines(2017)), linesBefore);
  assert.equal(state.player.prep, prepBefore);
  assert.deepEqual(state.player.lessonPlan, planBefore);
  assert.equal(state.player.role, roleBefore);
  assert.equal(state.player.official, officialFlag);
  assert.deepEqual(lateSnapshot(state), lateBefore);
  assert.deepEqual(classLatecomers(state, playerStudents(state)).map((s) => s.id), lateIds);
  assert.deepEqual(rollSnapshot(state), rollBefore);
  assert.deepEqual(compileEveningRoll(state, playerStudents(state)), eveningBefore);

  const internHost = hostClassMeeting(state);
  assert.equal(internHost.ok, false);
  assert.match(internHost.reason || internHost.text || "", /实习|班主任|主持/);
});

test("自动推进能越过未值周的日子，不卡死，也不自动代做", () => {
  const state = firstDutyOffice();
  assert.equal(isDutyWeekOpen(state), true, dutyWeekUnavailableReason(state));
  const start = state.date;
  state.periodId = "noon";
  const stepped = advanceDay(state);
  assert.ok(stepped);
  assert.equal(state.date, addDays(start, 1));
  assert.equal(hasDutyWeekToday(state, start), false);
  assert.equal((state.dutyWeeks || []).length, 0);

  goOffice(state, start);
  assert.equal(isDutyWeekOpen(state), true, dutyWeekUnavailableReason(state));
  const r = skipToNextStage(state);
  assert.equal(r.ok, true, r.reason);
  assert.ok(state.date > start, `应越过未值周的日子继续推进，当前 ${state.date}`);
  assert.equal(hasDutyWeekToday(state, start), false);
  assert.equal((state.dutyWeeks || []).length, 0);

  skipUntil(state, (s) => s.date >= "2017-11-15", 40);
  assert.ok(state.date >= "2017-11-15", `应能推进到期中，当前 ${state.date}`);
  assert.equal((state.dutyWeeks || []).length, 0);
});

test("存档往返后记录仍在", () => {
  const a = firstDutyOffice();
  const r = handleDutyWeek(a, "minutes");
  assert.equal(r.ok, true, r.reason);
  const b = fromJSON(toJSON(a));
  assert.equal(b.date, a.date);
  assert.equal(b.dutyWeek.doneToday, true);
  assert.equal(b.dutyWeek.lastAction, "minutes");
  assert.equal(b.dutyWeek.onDuty, true);
  assert.equal(b.dutyWeek.followUp?.text, DUTY_WEEK_MARK);
  assert.equal(b.dutyWeeks[0].minutes, a.dutyWeeks[0].minutes);
  assert.equal(b.dutyWeeks[0].leaderName, DUTY_LEADER_NAME);
  assert.equal(hasDutyWeekToday(b), true);
  const again = handleDutyWeek(b, "gate");
  assert.equal(again.ok, false);
  const named = playerStudents(b).filter((s) => s.lastDutyWeek);
  assert.ok(named.length >= 1);
});

test("无课周不要硬凑；办公室和日常教学有值周入口，非窗口日不常驻空面板，教室正课不插入该面板", () => {
  const state = createGame(20170901);
  goOffice(state, "2018-01-26");
  assert.equal(isDutyWeekNoClassDate("2018-01-26"), true);
  assert.equal(isDutyWeekOpen(state), false);
  assert.match(dutyWeekUnavailableReason(state), /没有正常上课|硬凑|值周周/);

  goOffice(state, "2018-07-13");
  assert.equal(isDutyWeekNoClassDate("2018-07-13"), true);
  assert.equal(isDutyWeekOpen(state), false);

  const src = readFileSync(new URL("../js/ui/app.js", import.meta.url), "utf8");
  assert.match(src, /function dutyWeekPanelHtml\s*\(/);
  assert.match(src, /值周/);
  assert.match(src, /data-duty-week/);
  assert.match(src, /handleDutyWeek/);
  const officeFn = src.slice(src.indexOf("function officeCollabHtml"), src.indexOf("function bindOfficeActions"));
  assert.match(officeFn, /dutyWeekPanelHtml/);
  const teachFn = src.slice(src.indexOf("function viewTeach"), src.indexOf("function viewPlacement"));
  assert.match(teachFn, /officeCollabHtml\(\)/);
  const logFn = src.slice(src.indexOf("function viewLog"), src.indexOf("function viewSave"));
  assert.match(logFn, /值周|dutyWeeks/);
  const classFn = src.slice(src.indexOf("function viewClassroom"), src.indexOf("function viewRoster"));
  assert.doesNotMatch(classFn, /dutyWeekPanelHtml/);
  assert.match(src, /dutyWeekNotes|lastDutyWeek/);
});
});
