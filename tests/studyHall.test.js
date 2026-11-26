import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createGame, playerStudents, prepareLesson, teach, skipToNextStage, skipUntil,
  handleStudyHall, composeStudyHallBrief, studyHallOptionsFor, composeStudyHallMinutes,
  isStudyHallOpen, isStudyHallWindow, studyHallUnavailableReason,
  ensureStudyHallState, hasStudyHallThisSlot, latestStudyHallThisSlot,
  isStudyHallTimeSlot, isStudyHallSubject, studyHallSlotKey,
  STUDY_HALL_ACTIONS, STUDY_HALL_SOURCE_NOTE,
  tutorEvening, homeroomEveningRoll, isTutoringSlot,
  currentSlot, majorEventOn, advanceDay, advancePeriod, borrowIn, studentRecentStatus,
} from "../js/domain/simulation.js";
import { toJSON, fromJSON } from "../js/domain/save.js";
import { addDays, SCHOOL_CALENDAR, weekday } from "../js/domain/calendar.js";
import { activityEventOn, daySchedule } from "../js/domain/timetable.js";
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

function goSlot(state, date, periodId) {
  state.date = date;
  state.periodId = periodId;
  return state;
}

function freshSlot(seed, date, periodId) {
  const state = createGame(seed);
  return goSlot(state, date, periodId);
}

describe("自习课看班", { concurrency: 1 }, () => {
test("高一混合课表周三 p6、周四 p8、周五 evening-2 可看班；两次开局同一节选择结果确定一致", () => {
  assert.equal(weekday("2017-09-06"), 3);
  assert.equal(weekday("2017-09-07"), 4);
  assert.equal(weekday("2017-09-08"), 5);

  const slots = [
    ["2017-09-06", "p6"],
    ["2017-09-07", "p8"],
    ["2017-09-08", "evening-2"],
  ];
  for (const [date, periodId] of slots) {
    const a = freshSlot(20170901, date, periodId);
    const b = freshSlot(20170901, date, periodId);
    const slotA = currentSlot(a);
    assert.equal(slotA.subject, "自习", `${date} ${periodId} 应为自习，实际 ${slotA.subject}`);
    assert.equal(slotA.isMath, false);
    assert.equal(slotA.isTutoring, false);
    assert.equal(isStudyHallSubject(slotA), true);
    assert.equal(isStudyHallTimeSlot(slotA, date), true);
    assert.equal(isStudyHallWindow(a), true);
    assert.equal(isStudyHallOpen(a), true, studyHallUnavailableReason(a));
    assert.equal(isStudyHallOpen(b), true, studyHallUnavailableReason(b));

    const ba = composeStudyHallBrief(a);
    const bb = composeStudyHallBrief(b);
    assert.ok(ba && bb);
    assert.deepEqual(
      { shortPoints: ba.shortPoints, mood: ba.mood, ask: ba.askStudent?.id, chat: ba.chat.people.map((s) => s.id) },
      { shortPoints: bb.shortPoints, mood: bb.mood, ask: bb.askStudent?.id, chat: bb.chat.people.map((s) => s.id) },
    );
    const oa = studyHallOptionsFor(a);
    const ob = studyHallOptionsFor(b);
    assert.equal(oa.length, 3);
    assert.deepEqual(oa.map((o) => ({ id: o.id, label: o.label, text: o.text })), ob.map((o) => ({ id: o.id, label: o.label, text: o.text })));
    assert.deepEqual(oa.map((o) => o.id), STUDY_HALL_ACTIONS.map((x) => x.id));
    for (const o of oa) {
      assert.equal(composeStudyHallMinutes(a, o.id, ba), o.text);
      assert.match(o.text, /自习/);
      assert.match(o.text, /卓行16班/);
      assert.match(o.text, /任课/);
      assert.match(o.text, /不是班主任/);
      assert.doesNotMatch(o.text, /你主持了班会|你作为班主任|第二场全校典礼/);
      assert.ok(o.text.includes("数学晚自习") || STUDY_HALL_SOURCE_NOTE.includes("数学晚自习"));
    }

    const ra = handleStudyHall(a, "patrol");
    const rb = handleStudyHall(b, "patrol");
    assert.equal(ra.ok, true, ra.reason);
    assert.equal(rb.ok, true, rb.reason);
    assert.equal(ra.text, rb.text);
    assert.match(ra.text, /巡视纪律/);
    assert.match(ra.text, /看自习/);
    assert.ok((a.log || []).some((l) => l.text === ra.text));
  }
});

test("数学正课、数学晚自习或答疑、考试日、活动占用节、周日、家长会当天不可看班；被借成数学的自习应按上课处理", () => {
  const state = createGame(20170901);

  goSlot(state, "2017-09-06", "p1");
  const math = currentSlot(state);
  assert.equal(math.isMath, true);
  assert.equal(isStudyHallOpen(state), false);
  assert.match(studyHallUnavailableReason(state), /数学正课/);

  goSlot(state, "2017-09-04", "evening-1");
  const tutor = currentSlot(state);
  assert.equal(isTutoringSlot(tutor), true);
  assert.equal(tutor.subject.includes("数学晚自习") || tutor.isTutoring, true);
  assert.equal(isStudyHallOpen(state), false);
  assert.match(studyHallUnavailableReason(state), /数学晚自习|答疑/);
  const ev = tutorEvening(state, "巡视");
  assert.equal(ev.ok, true, ev.reason);
  assert.match(ev.text, /晚自习|巡视|座位/);

  goSlot(state, "2017-09-05", "evening-2");
  assert.equal(isTutoringSlot(currentSlot(state)), true);
  assert.equal(isStudyHallOpen(state), false);
  assert.match(studyHallUnavailableReason(state), /数学晚自习|答疑/);

  goSlot(state, "2017-11-15", "p6");
  assert.equal(weekday("2017-11-15"), 3);
  assert.ok(majorEventOn("2017-11-15")?.kind === "exam" || currentSlot(state).isExamDay);
  assert.notEqual(currentSlot(state).subject, "自习");
  assert.equal(isStudyHallOpen(state), false);
  assert.match(studyHallUnavailableReason(state), /考试/);

  const sports = SCHOOL_CALENDAR.find((e) => e.kind === "activity" && e.activityKind === "sports");
  assert.ok(sports);
  goSlot(state, sports.date, "p6");
  assert.ok(activityEventOn(sports.date) || currentSlot(state).isActivityPeriod);
  assert.equal(isStudyHallOpen(state), false);
  assert.match(studyHallUnavailableReason(state), /活动/);

  goSlot(state, "2017-09-10", "rest");
  assert.equal(weekday("2017-09-10"), 0);
  assert.equal(isStudyHallOpen(state), false);
  assert.match(studyHallUnavailableReason(state), /周日/);

  const parents = SCHOOL_CALENDAR.find((e) => e.id === "parents-fall-2017" || (e.kind === "parents" && e.date.startsWith("2017")));
  assert.ok(parents);
  goSlot(state, parents.date, "p6");
  assert.equal(isStudyHallOpen(state), false);
  assert.match(studyHallUnavailableReason(state), /家长会/);

  const borrow = createGame(20170901);
  const before = daySchedule("2017-09-06", borrow).find((p) => p.id === "p6");
  assert.equal(before.subject, "自习");
  const bi = borrowIn(borrow, "2017-09-06", "p6");
  assert.equal(bi.ok, true, bi.reason);
  goSlot(borrow, "2017-09-06", "p6");
  const taken = currentSlot(borrow);
  assert.equal(taken.subject, "数学");
  assert.equal(taken.isMath, true);
  assert.equal(isStudyHallOpen(borrow), false);
  assert.match(studyHallUnavailableReason(borrow), /数学正课|上课/);
  const hall = handleStudyHall(borrow, "patrol");
  assert.equal(hall.ok, false);
  prepareLesson(borrow, { topic: "集合与逻辑用语", depth: 2, homework: "中" });
  const lesson = teach(borrow, "精讲例题");
  assert.equal(lesson.ok, true, lesson.reason || lesson.text);
  assert.equal(hasStudyHallThisSlot(borrow, "2017-09-06", "p6"), false);
});

test("同一节只能看班一次；处理写入日志和档案近况，不改能力、分数、省控", () => {
  const officialBefore = officialProvincialPack(2017);
  const linesBefore = JSON.stringify(provincialLines(2017));
  const state = freshSlot(20170901, "2017-09-06", "p6");
  const beforeAbility = abilityMap(state);
  const beforePotential = potentialMap(state);
  const beforeExams = examTotals(state);
  const beforePrep = state.player.prep;
  const beforeLessons = (state.player.lessons || []).length;

  const opts = studyHallOptionsFor(state);
  assert.equal(opts.length, 3);
  const r = handleStudyHall(state, "note");
  assert.equal(r.ok, true, r.reason);
  assert.match(r.text, /记下交头接耳或走神|看自习/);
  assert.ok((state.log || []).some((l) => String(l.text).includes("看自习")));
  assert.equal(hasStudyHallThisSlot(state), true);
  assert.equal(isStudyHallOpen(state), false);
  assert.match(studyHallUnavailableReason(state), /已经看过|同一节只能/);
  const again = handleStudyHall(state, "patrol");
  assert.equal(again.ok, false);
  assert.equal(isStudyHallWindow(state), true, "已看过后仍可查阅纪要，面板不当成空菜单常驻到别的节");

  const rec = latestStudyHallThisSlot(state);
  assert.ok(rec?.minutes);
  assert.equal(rec.actionId, "note");
  const noted = playerStudents(state).filter((s) => s.lastStudyHall?.slotKey === rec.slotKey);
  assert.ok(noted.length >= 1, "记下的人应写入档案近况");
  for (const s of noted) {
    const status = studentRecentStatus(s, state);
    assert.match(status, /自习看班|交头接耳|走神/);
  }

  const other = freshSlot(20170901, "2017-09-06", "p6");
  const ans = handleStudyHall(other, "answer");
  assert.equal(ans.ok, true, ans.reason);
  assert.match(ans.text, /作业问询|问询/);
  const asked = playerStudents(other).find((s) => s.lastStudyHall?.actionId === "answer");
  if (asked) {
    assert.match(studentRecentStatus(asked, other), /自习看班|作业/);
  }

  assert.deepEqual(abilityMap(state), beforeAbility);
  assert.deepEqual(potentialMap(state), beforePotential);
  assert.deepEqual(examTotals(state), beforeExams);
  assert.equal(state.player.prep, beforePrep);
  assert.equal((state.player.lessons || []).length, beforeLessons);
  assert.deepEqual(officialProvincialPack(2017), officialBefore);
  assert.equal(JSON.stringify(provincialLines(2017)), linesBefore);
  assert.deepEqual(abilityMap(other), beforeAbility);
  assert.deepEqual(officialProvincialPack(2017), officialBefore);
});

test("自动推进能越过未看班的自习，不卡死，也不改写晚自习答疑或点名", () => {
  const sitting = freshSlot(20170901, "2017-09-06", "p6");
  assert.equal(isStudyHallOpen(sitting), true, studyHallUnavailableReason(sitting));
  const start = sitting.date;
  sitting.periodId = "noon";
  const stepped = advanceDay(sitting);
  assert.ok(stepped);
  assert.equal(sitting.date, addDays(start, 1));
  assert.equal(hasStudyHallThisSlot(sitting, "2017-09-06", "p6"), false);

  const walk = freshSlot(20170901, "2017-09-06", "p6");
  assert.equal(isStudyHallOpen(walk), true);
  let guard = 0;
  while (!(walk.date === "2017-09-08" && walk.periodId === "evening-2") && guard++ < 40) {
    const r = advancePeriod(walk);
    assert.equal(r.ok, true, r.reason || r.text);
  }
  assert.equal(walk.date, "2017-09-08");
  assert.equal(walk.periodId, "evening-2");
  assert.equal(currentSlot(walk).subject, "自习");
  assert.equal(isStudyHallOpen(walk), true, studyHallUnavailableReason(walk));
  assert.equal((walk.studyHalls || []).length, 0);
  const passed = advancePeriod(walk);
  assert.equal(passed.ok, true, passed.reason || passed.text);
  assert.ok(walk.date > "2017-09-08" || walk.periodId !== "evening-2");
  assert.equal((walk.studyHalls || []).length, 0);

  const state = freshSlot(20170901, "2017-09-06", "p6");
  assert.equal(isStudyHallOpen(state), true);
  const r = skipToNextStage(state);
  assert.equal(r.ok, true, r.reason);
  assert.ok(state.date > "2017-09-06", `应越过未看班的自习继续推进，当前 ${state.date}`);
  assert.equal((state.studyHalls || []).length, 0);
  assert.equal(hasStudyHallThisSlot(state, "2017-09-06", "p6"), false);
  assert.equal(hasStudyHallThisSlot(state, "2017-09-07", "p8"), false);
  assert.equal(hasStudyHallThisSlot(state, "2017-09-08", "evening-2"), false);

  skipUntil(state, (s) => s.date >= "2017-11-15", 40);
  assert.ok(state.date >= "2017-11-15", `应能推进到期中，当前 ${state.date}`);

  const tutor = createGame(20170901);
  goSlot(tutor, "2017-09-04", "evening-1");
  assert.equal(isTutoringSlot(currentSlot(tutor)), true);
  const patrol = tutorEvening(tutor, "巡视");
  assert.equal(patrol.ok, true, patrol.reason);
  const roll = homeroomEveningRoll(tutor);
  assert.equal(roll.ok, true, roll.reason);
  assert.equal(isStudyHallOpen(tutor), false);
});

test("存档往返后看班记录仍在", () => {
  const a = freshSlot(20170901, "2017-09-07", "p8");
  const r = handleStudyHall(a, "answer");
  assert.equal(r.ok, true, r.reason);
  const b = fromJSON(toJSON(a));
  assert.equal(b.date, a.date);
  assert.equal(b.periodId, a.periodId);
  assert.equal(b.studyHall.done, true);
  assert.equal(b.studyHall.lastAction, "answer");
  assert.equal(b.studyHalls[0].minutes, a.studyHalls[0].minutes);
  assert.equal(hasStudyHallThisSlot(b), true);
  assert.equal(latestStudyHallThisSlot(b).actionId, "answer");
  const asked = playerStudents(b).find((s) => s.lastStudyHall?.actionId === "answer");
  if (asked) {
    const orig = playerStudents(a).find((s) => s.id === asked.id);
    assert.equal(asked.lastStudyHall.statusLine, orig.lastStudyHall.statusLine);
    assert.equal(asked.relation, orig.relation);
  }
  const again = handleStudyHall(b, "patrol");
  assert.equal(again.ok, false);
});

test("分科后课表以实际科目为准：理科周五 p8 是自习，可看班", () => {
  const state = createGame(20170901);
  const cohort = state.cohorts[state.player.cohortYear];
  cohort.trackSplit = true;
  for (const s of cohort.students) {
    if (s.classNo === state.player.classNo && !s.repeat) s.track = "li";
  }
  goSlot(state, "2018-03-02", "p8");
  assert.equal(weekday("2018-03-02"), 5);
  assert.equal(currentSlot(state).subject, "自习");
  assert.equal(isStudyHallOpen(state), true, studyHallUnavailableReason(state));
  const r = handleStudyHall(state, "patrol");
  assert.equal(r.ok, true, r.reason);
});

test("日常教学和教室有自习看班入口，不是自习节不常驻空面板；公开省控数字未被改写", () => {
  const src = readFileSync(new URL("../js/ui/app.js", import.meta.url), "utf8");
  assert.match(src, /function studyHallPanelHtml\s*\(/);
  assert.match(src, /自习看班/);
  assert.match(src, /data-study-hall/);
  assert.match(src, /handleStudyHall/);
  const teachFn = src.slice(src.indexOf("function viewTeach"), src.indexOf("function viewPlacement"));
  assert.match(teachFn, /studyHallPanelHtml/);
  const classFn = src.slice(src.indexOf("function viewClassroom"), src.indexOf("function viewRoster"));
  assert.match(classFn, /studyHallPanelHtml/);
  const officeFn = src.slice(src.indexOf("function officeCollabHtml"), src.indexOf("function bindOfficeActions"));
  assert.doesNotMatch(officeFn, /studyHallPanelHtml/);
  const logFn = src.slice(src.indexOf("function viewLog"), src.indexOf("function viewSave"));
  assert.match(logFn, /自习看班|studyHalls/);
  assert.match(src, /isStudyHallWindow\(state\)/);

  const expect = {
    2016: { wen: [523, 450], li: [529, 445] },
    2017: { wen: [533, 458], li: [503, 422] },
    2018: { wen: [568, 496], li: [527, 447] },
    2019: { wen: [558, 502], li: [522, 449] },
    2020: { wen: [547, 488], li: [535, 463] },
  };
  for (const [year, tracks] of Object.entries(expect)) {
    for (const track of ["wen", "li"]) {
      const [first, second] = tracks[track];
      const L = provincialLines(Number(year), track);
      assert.equal(L.first, first, `${year} ${track} 一本`);
      assert.equal(L.second, second, `${year} ${track} 二本`);
    }
  }
  const pack = officialProvincialPack(2020);
  assert.ok(pack);
  assert.ok(studyHallSlotKey("2017-09-06", "p6"));
  ensureStudyHallState(createGame(20170901));
});
});
