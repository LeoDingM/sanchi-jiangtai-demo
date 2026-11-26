import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createGame, playerStudents, skipToNextStage, skipUntil, skipToNextSchoolYear,
  handleOpeningDay, composeOpeningDayBrief, openingDayOptionsFor,
  isOpeningDayOpen, isOpeningDayWindow, openingDayUnavailableReason, ensureOpeningDayState,
  isOpeningDayTimeSlot, isOpeningDayPlayDate, openingPlayDate, openingPlayDateFor,
  openingCalendarEvent, openingEventForPlayDate, openingEventAround,
  isFallOpeningEvent, isSpringOpeningEvent, openingEventKindName, hasOpeningDayRecord,
  FALL_OPENING_ACTIONS, SPRING_OPENING_ACTIONS, OPENING_DAY_SOURCE_NOTE,
  advanceDay, currentSlot, majorEventOn, prepareLesson, teach, suggestedTopic,
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

function goOffice(state, date) {
  state.date = date;
  state.periodId = "morning-read";
  return state;
}

function goPlayOffice(seed, playDate) {
  const state = createGame(seed);
  goOffice(state, playDate);
  return state;
}

test("2017-09-01 周五开局当天可参加开学典礼，两次开局确定一致", () => {
  assert.equal(weekday("2017-09-01"), 5);
  const ev = openingCalendarEvent(2017, "fall");
  assert.ok(ev, "校历应有秋季开学");
  assert.equal(ev.date, "2017-09-01");
  assert.equal(ev.kind, "opening");
  assert.equal(ev.name, "2017学年开学");
  assert.equal(isFallOpeningEvent(ev), true);
  assert.equal(openingPlayDate(ev), "2017-09-01");
  assert.equal(isOpeningDayPlayDate("2017-09-01"), true);
  assert.equal(openingEventKindName(ev), "开学典礼");

  const a = createGame(20170901);
  const b = createGame(20170901);
  assert.equal(a.date, "2017-09-01");
  assert.equal(a.periodId, "morning-read");
  assert.equal(isOpeningDayOpen(a), true, openingDayUnavailableReason(a));
  assert.equal(isOpeningDayOpen(b), true, openingDayUnavailableReason(b));
  const oa = openingDayOptionsFor(a);
  const ob = openingDayOptionsFor(b);
  assert.equal(oa.length, FALL_OPENING_ACTIONS.length);
  assert.deepEqual(oa.map((v) => ({ id: v.id, label: v.label, text: v.text })), ob.map((v) => ({ id: v.id, label: v.label, text: v.text })));
  const ra = handleOpeningDay(a, "stand");
  const rb = handleOpeningDay(b, "stand");
  assert.equal(ra.ok, true, ra.reason);
  assert.equal(rb.ok, true, rb.reason);
  assert.equal(ra.text, rb.text);
  assert.match(ra.text, /开学典礼/);
  assert.match(ra.text, /赵映秋/);
  assert.match(ra.text, /校领导/);
  assert.match(ra.text, /不是主持人/);
  assert.match(ra.text, /卓行16班/);
  assert.doesNotMatch(ra.text, /第二场全校典礼/);
});

test("周末开学日的可玩向后落到最近上课工作日；工作日就在当天；校历日期不改", () => {
  assert.equal(weekday("2018-09-01"), 6);
  assert.equal(openingPlayDateFor(2018, "fall"), "2018-09-03");
  assert.equal(weekday("2018-09-03"), 1);
  assert.equal(isOpeningDayPlayDate("2018-09-01"), false);
  assert.equal(isOpeningDayPlayDate("2018-09-03"), true);
  assert.equal(isOpeningDayPlayDate("2018-08-31"), false, "不可前移到学期开始前");

  assert.equal(weekday("2019-09-01"), 0);
  assert.equal(openingPlayDateFor(2019, "fall"), "2019-09-02");
  assert.equal(isOpeningDayPlayDate("2019-09-01"), false);
  assert.equal(isOpeningDayPlayDate("2019-09-02"), true);

  assert.equal(weekday("2020-09-01"), 2);
  assert.equal(openingPlayDateFor(2020, "fall"), "2020-09-01");
  assert.equal(isOpeningDayPlayDate("2020-09-01"), true);

  assert.equal(weekday("2018-02-22"), 4);
  const spring2017 = openingCalendarEvent(2017, "spring");
  assert.ok(spring2017);
  assert.equal(spring2017.date, "2018-02-22");
  assert.equal(spring2017.name, "下学期开学");
  assert.equal(isSpringOpeningEvent(spring2017), true);
  assert.equal(openingPlayDate(spring2017), "2018-02-22");
  assert.equal(openingEventKindName(spring2017), "报到");

  assert.equal(weekday("2020-02-22"), 6);
  const spring2019 = openingCalendarEvent(2019, "spring");
  assert.equal(spring2019.date, "2020-02-22");
  assert.equal(openingPlayDate(spring2019), "2020-02-24");
  assert.equal(weekday("2020-02-24"), 1);
  assert.equal(isOpeningDayPlayDate("2020-02-22"), false);
  assert.equal(isOpeningDayPlayDate("2020-02-24"), true);
  assert.equal(isOpeningDayPlayDate("2020-02-21"), false);

  for (const sy of [2017, 2018, 2019, 2020]) {
    const fall = openingCalendarEvent(sy, "fall");
    assert.equal(fall.date, `${sy}-09-01`);
    assert.equal(fall.kind, "opening");
    assert.equal(fall.name, `${sy}学年开学`);
    assert.notEqual(fall.kind, "activity");
    const spring = openingCalendarEvent(sy, "spring");
    assert.equal(spring.date, `${sy + 1}-02-22`);
    assert.equal(spring.kind, "opening");
    assert.equal(spring.name, "下学期开学");
    assert.notEqual(spring.kind, "activity");
  }

  const formal2017 = SCHOOL_CALENDAR.filter((e) => e.date === "2017-09-04" && e.name === "正式上课");
  for (const e of formal2017) {
    assert.equal(e.kind, "school");
    assert.notEqual(e.kind, "activity");
    assert.notEqual(e.kind, "opening");
  }
});

test("2017-09-01 当天 prepareLesson / teach 仍然可用，不是全天停课；majorEventOn 仍不是考试或活动大事件", () => {
  const state = createGame(20170901);
  assert.equal(majorEventOn("2017-09-01"), null);
  assert.equal(activityEventOn("2017-09-01"), null);
  const sched = daySchedule("2017-09-01", state);
  const mathSlots = sched.filter((p) => p.isMath);
  assert.ok(mathSlots.length >= 1, "开学日应仍有数学正课");
  assert.ok(mathSlots.every((p) => !p.isExamDay && !p.isActivityPeriod), "数学正课不应被标成停课或活动占用");
  assert.ok(sched.some((p) => p.id === "morning-read" && !p.isExamDay && !p.isActivityPeriod));

  const topic = suggestedTopic(state);
  const prepMorning = prepareLesson(state, { topic, depth: 2, homework: "中" });
  assert.equal(prepMorning.ok, true, prepMorning.reason || prepMorning.text);
  const taughtMorning = teach(state, "新授课");
  assert.equal(taughtMorning.ok, true, taughtMorning.reason || taughtMorning.text);

  const state2 = createGame(20170901);
  state2.periodId = mathSlots[0].id;
  assert.equal(isOpeningDayOpen(state2), false, "数学正课时不应打断上课");
  assert.match(openingDayUnavailableReason(state2), /数学正课/);
  const prep = prepareLesson(state2, { topic: suggestedTopic(state2), depth: 2, homework: "中" });
  assert.equal(prep.ok, true, prep.reason || prep.text);
  const taught = teach(state2, "新授课");
  assert.equal(taught.ok, true, taught.reason || taught.text);

  goOffice(state2, "2017-09-01");
  assert.equal(isOpeningDayOpen(state2), true, openingDayUnavailableReason(state2));
  assert.equal(isOpeningDayTimeSlot(currentSlot(state2), state2.date), true);
});

test("每个开学事件只能参加一次；处理写入日志和纪要，不改能力、分数、省控；春季是报到不是第二场典礼", () => {
  const state = createGame(20170901);
  const beforeAbility = abilityMap(state);
  const beforePotential = potentialMap(state);
  const beforeExams = examTotals(state);
  const officialBefore = officialProvincialPack(2017);
  const linesBefore = JSON.stringify(provincialLines(2017));
  const prepBefore = state.player.prep;

  const brief = composeOpeningDayBrief(state);
  assert.ok(brief);
  assert.equal(brief.kind, "ceremony");
  const r = handleOpeningDay(state, "note");
  assert.equal(r.ok, true, r.reason);
  assert.match(r.text, /开学典礼|本学年的要求/);
  assert.match(r.minutes, /宁川中学/);
  assert.match(OPENING_DAY_SOURCE_NOTE, /不是某所实校或教育行政部门公告的日期/);
  assert.ok(state.log.some((l) => String(l.text || "").includes("开学典礼") && String(l.text || "").includes("赵映秋")));
  assert.equal(hasOpeningDayRecord(state, openingCalendarEvent(2017, "fall")), true);
  const again = handleOpeningDay(state, "stand");
  assert.equal(again.ok, false);
  assert.match(again.reason, /已经参加过|只能参加一次/);
  assert.equal(isOpeningDayOpen(state), false);

  assert.equal(state.player.prep, prepBefore);
  assert.deepEqual(abilityMap(state), beforeAbility);
  assert.deepEqual(potentialMap(state), beforePotential);
  assert.deepEqual(examTotals(state), beforeExams);
  assert.deepEqual(officialProvincialPack(2017), officialBefore);
  assert.equal(JSON.stringify(provincialLines(2017)), linesBefore);

  goOffice(state, "2018-02-22");
  assert.equal(isOpeningDayPlayDate(state.date), true);
  assert.equal(isOpeningDayOpen(state), true, openingDayUnavailableReason(state));
  const opts = openingDayOptionsFor(state);
  assert.deepEqual(opts.map((o) => o.id), SPRING_OPENING_ACTIONS.map((a) => a.id));
  const spring = handleOpeningDay(state, "look");
  assert.equal(spring.ok, true, spring.reason);
  assert.match(spring.text, /报到/);
  assert.match(spring.text, /不是第二场全校典礼/);
  assert.doesNotMatch(spring.text, /全校集合举行开学典礼/);
  const springAgain = handleOpeningDay(state, "count");
  assert.equal(springAgain.ok, false);

  assert.deepEqual(abilityMap(state), beforeAbility);
  assert.deepEqual(officialProvincialPack(2017), officialBefore);
});

test("自动推进能越过未参加的典礼和报到，不卡死；下一学年停在开学日但不代做", () => {
  const state = createGame(20170901);
  assert.equal(isOpeningDayOpen(state), true, openingDayUnavailableReason(state));
  const r = skipToNextStage(state);
  assert.equal(r.ok, true, r.reason);
  assert.ok(state.date > "2017-09-01", `应越过开局开学典礼，当前 ${state.date}`);
  assert.equal(hasOpeningDayRecord(state, openingCalendarEvent(2017, "fall")), false);

  const sitting = createGame(20170901);
  const start = sitting.date;
  sitting.periodId = "noon";
  const adv = advanceDay(sitting);
  assert.ok(adv);
  assert.equal(sitting.date, addDays(start, 1));
  assert.equal(hasOpeningDayRecord(sitting, openingCalendarEvent(2017, "fall")), false);

  const year = createGame(20170901);
  const skip = skipToNextSchoolYear(year);
  assert.equal(skip.ok, true, skip.reason);
  assert.equal(year.date, "2018-09-01");
  assert.equal(hasOpeningDayRecord(year, openingCalendarEvent(2018, "fall")), false);
  assert.equal(hasOpeningDayRecord(year, openingCalendarEvent(2017, "fall")), false);
  assert.match(skip.message || "", /2018学年开学/);
  assert.equal(isOpeningDayPlayDate("2018-09-01"), false);
  goOffice(year, "2018-09-03");
  assert.equal(isOpeningDayOpen(year), true, openingDayUnavailableReason(year));

  const later = createGame(20170901);
  skipUntil(later, (s) => s.date >= "2018-02-22", 80);
  assert.ok(later.date >= "2018-02-22", `应能推进到春季报到附近，当前 ${later.date}`);
  assert.equal(hasOpeningDayRecord(later, openingCalendarEvent(2017, "spring")), false);
  if (later.date === "2018-02-22") {
    goOffice(later, "2018-02-22");
    assert.equal(isOpeningDayOpen(later), true, openingDayUnavailableReason(later));
    const stepped = skipToNextStage(later);
    assert.equal(stepped.ok, true, stepped.reason);
    assert.ok(later.date > "2018-02-22");
    assert.equal(hasOpeningDayRecord(later, openingCalendarEvent(2017, "spring")), false);
  }
});

test("存档往返后开学日记录仍在", () => {
  const state = createGame(20170901);
  const r = handleOpeningDay(state, "count");
  assert.equal(r.ok, true, r.reason);
  const json = toJSON(state);
  const loaded = fromJSON(json);
  assert.equal(loaded.date, state.date);
  assert.deepEqual(loaded.openingDay, state.openingDay);
  assert.equal((loaded.openingDays || []).length, (state.openingDays || []).length);
  assert.equal(loaded.openingDays[0].minutes, state.openingDays[0].minutes);
  assert.equal(hasOpeningDayRecord(loaded, openingCalendarEvent(2017, "fall")), true);
  goOffice(loaded, loaded.date);
  const again = handleOpeningDay(loaded, "stand");
  assert.equal(again.ok, false);
});

test("办公室和日常教学有开学典礼或报到入口，非窗口日不常驻空面板；公开省控数字未被改写；校历查询函数仍可用", () => {
  const src = readFileSync(new URL("../js/ui/app.js", import.meta.url), "utf8");
  assert.match(src, /function openingDayPanelHtml\s*\(/);
  assert.match(src, /开学典礼/);
  assert.match(src, /data-opening-day/);
  assert.match(src, /handleOpeningDay/);
  assert.match(src, /isOpeningDayPlayDate/);
  const officeFn = src.slice(src.indexOf("function officeCollabHtml"), src.indexOf("function bindOfficeActions"));
  assert.match(officeFn, /openingDayPanelHtml/);
  const teachFn = src.slice(src.indexOf("function viewTeach"), src.indexOf("function viewPlacement"));
  assert.match(teachFn, /officeCollabHtml\(\)/);
  assert.match(src, /if \(!isOpeningDayPlayDate\(state\.date\)\) return ""/);

  const sat = goPlayOffice(20170901, "2018-09-01");
  assert.equal(isOpeningDayPlayDate(sat.date), false);
  assert.equal(isOpeningDayWindow(sat), false);
  assert.match(openingDayUnavailableReason(sat), /周六|之后最近的上课工作日|2018-09-03/);
  ensureOpeningDayState(sat);

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

  const shifted = openingEventAround("2018-09-01");
  assert.ok(shifted);
  assert.equal(openingEventForPlayDate("2018-09-03")?.id, shifted.id);
});
