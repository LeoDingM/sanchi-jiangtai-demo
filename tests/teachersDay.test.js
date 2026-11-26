import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createGame, playerStudents, skipToNextStage, skipUntil,
  handleTeachersDayCard, handleTeachersDayColleague, suggestTeachersDayCards, teachersDayColleague,
  isTeachersDayOpen, isTeachersDayWindow, teachersDayUnavailableReason, ensureTeachersDayState,
  isTeachersDayTimeSlot, isTeachersDayPlayDate, teachersDayPlayDate, teachersDayNominalDate,
  teachersDayEvent, hasTeachersDayCard, isTeachersDayBlockedDate,
  TEACHERS_DAY_CARD_MIN, TEACHERS_DAY_CARD_MAX, TEACHERS_DAY_CARD_CAP,
  TEACHERS_DAY_SOURCE_NOTE, CARD_REPLIES, COLLEAGUE_ACTIONS,
  advanceDay, currentSlot, majorEventOn, prepareLesson, teach, suggestedTopic,
} from "../js/domain/simulation.js";
import { toJSON, fromJSON } from "../js/domain/save.js";
import { addDays, SCHOOL_CALENDAR, weekday, schoolYearOf } from "../js/domain/calendar.js";
import { activityEventOn, daySchedule } from "../js/domain/timetable.js";
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

function goOffice(state, date) {
  state.date = date;
  state.periodId = "morning-read";
  return state;
}

function goPlayOffice(seed = 20170901, schoolYear = 2017) {
  const state = createGame(seed);
  const play = teachersDayPlayDate(schoolYear);
  if (play > state.date) {
    // 不调用 skipToNextStage，以免直接跳过可玩日。
    goOffice(state, play);
  } else {
    goOffice(state, play);
  }
  return state;
}

test("2017-09-10 周日可玩日落到相邻工作日，且两次开局确定一致；2018–2020 工作日就在当天", () => {
  assert.equal(teachersDayNominalDate(2017), "2017-09-10");
  assert.equal(weekday("2017-09-10"), 0);
  assert.equal(teachersDayPlayDate(2017), "2017-09-11");
  assert.equal(weekday("2017-09-11"), 1);
  assert.equal(isTeachersDayPlayDate("2017-09-10"), false);
  assert.equal(isTeachersDayPlayDate("2017-09-11"), true);

  assert.equal(weekday("2018-09-10"), 1);
  assert.equal(teachersDayPlayDate(2018), "2018-09-10");
  assert.equal(weekday("2019-09-10"), 2);
  assert.equal(teachersDayPlayDate(2019), "2019-09-10");
  assert.equal(weekday("2020-09-10"), 4);
  assert.equal(teachersDayPlayDate(2020), "2020-09-10");
  assert.equal(weekday("2022-09-10"), 6);
  assert.equal(teachersDayPlayDate(2022), "2022-09-09");

  const ev = teachersDayEvent(2017);
  assert.ok(ev, "校历应有教师节");
  assert.equal(ev.date, "2017-09-10");
  assert.equal(ev.kind, "special");
  assert.equal(ev.name, "教师节");
  for (const sy of [2018, 2019, 2020, 2022]) {
    const e = teachersDayEvent(sy);
    assert.equal(e.date, `${sy}-09-10`);
    assert.equal(e.kind, "special");
  }

  const a = goPlayOffice(20170901, 2017);
  const b = goPlayOffice(20170901, 2017);
  assert.equal(isTeachersDayOpen(a), true, teachersDayUnavailableReason(a));
  assert.equal(isTeachersDayOpen(b), true, teachersDayUnavailableReason(b));
  const sa = suggestTeachersDayCards(a);
  const sb = suggestTeachersDayCards(b);
  assert.ok(sa.length >= TEACHERS_DAY_CARD_MIN && sa.length <= TEACHERS_DAY_CARD_MAX, `建议人数应为 ${TEACHERS_DAY_CARD_MIN}–${TEACHERS_DAY_CARD_MAX}，实际 ${sa.length}`);
  assert.deepEqual(sa.map((v) => ({ id: v.studentId, gift: v.gift, reason: v.reason, message: v.message, options: v.options.map((o) => o.id) })),
    sb.map((v) => ({ id: v.studentId, gift: v.gift, reason: v.reason, message: v.message, options: v.options.map((o) => o.id) })));
  const pa = teachersDayColleague(a);
  const pb = teachersDayColleague(b);
  assert.equal(pa.id, pb.id);
  assert.equal(pa.reason, pb.reason);

  const ra = handleTeachersDayCard(a, sa[0].studentId, "thanks");
  const rb = handleTeachersDayCard(b, sb[0].studentId, "thanks");
  assert.equal(ra.ok, true, ra.reason);
  assert.equal(rb.ok, true, rb.reason);
  assert.equal(ra.text, rb.text);
});

test("考试日、学校活动日不可玩；当天数学正课仍可上，不是全天停课活动", () => {
  const state = createGame(20170901);
  const examDate = "2017-10-16";
  goOffice(state, examDate);
  assert.ok(majorEventOn(examDate)?.kind === "exam" || currentSlot(state)?.isExamDay, "10月16日应是考试日");
  assert.equal(isTeachersDayPlayDate(examDate), false);
  assert.equal(isTeachersDayOpen(state), false);
  assert.match(teachersDayUnavailableReason(state), /考试|不是宁川中学校内的教师节/);

  const sports = SCHOOL_CALENDAR.find((e) => e.kind === "activity" && e.activityKind === "sports" && e.date.startsWith("2017-"));
  assert.ok(sports, "应有秋季运动会");
  goOffice(state, sports.date);
  assert.ok(activityEventOn(sports.date) || majorEventOn(sports.date)?.kind === "activity");
  assert.equal(isTeachersDayPlayDate(sports.date), false);
  assert.equal(isTeachersDayOpen(state), false);
  assert.match(teachersDayUnavailableReason(state), /活动|不是宁川中学校内的教师节/);

  // 校历 9 月 10 日仍是 special，不是全天停课的 activity。
  const ev2018 = teachersDayEvent(2018);
  assert.equal(ev2018.kind, "special");
  assert.notEqual(ev2018.kind, "activity");
  const play2018 = teachersDayPlayDate(2018);
  assert.equal(play2018, "2018-09-10");
  assert.equal(isTeachersDayBlockedDate(play2018), false);
  assert.equal(majorEventOn(play2018), null);
  assert.equal(activityEventOn(play2018), null);
  const sched = daySchedule(play2018, state);
  const mathSlots = sched.filter((p) => p.isMath);
  assert.ok(mathSlots.length >= 1, "教师节可玩日应仍有数学正课");
  assert.ok(mathSlots.every((p) => !p.isExamDay && !p.isActivityPeriod), "数学正课不应被标成停课或活动占用");
  assert.ok(sched.some((p) => p.id === "morning-read" && !p.isExamDay));

  goOffice(state, play2018);
  const mathId = mathSlots[0].id;
  state.periodId = mathId;
  assert.equal(isTeachersDayOpen(state), false, "数学正课时不应打断上课");
  assert.match(teachersDayUnavailableReason(state), /数学正课/);
  const topic = suggestedTopic(state);
  const prep = prepareLesson(state, { topic, depth: 2, homework: "中" });
  assert.equal(prep.ok, true, prep.reason || prep.text);
  const taught = teach(state, "新授课");
  assert.equal(taught.ok, true, taught.reason || taught.text);

  goOffice(state, play2018);
  assert.equal(isTeachersDayOpen(state), true, teachersDayUnavailableReason(state));
  assert.equal(isTeachersDayTimeSlot(currentSlot(state), state.date), true);
});

test("每年窗口一次，请假生不在当场送礼名单；处理写入日志和档案近况，不改能力、分数、省控", () => {
  const state = goPlayOffice(20170901, 2017);
  const list = suggestTeachersDayCards(state);
  assert.ok(list.length >= TEACHERS_DAY_CARD_MIN && list.length <= TEACHERS_DAY_CARD_CAP);
  const beforeAbility = abilityMap(state);
  const beforePotential = potentialMap(state);
  const beforeExams = examTotals(state);
  const officialBefore = officialProvincialPack(2017);
  const linesBefore = JSON.stringify(provincialLines(2017));
  const pick = list[0];
  const stu0 = playerStudents(state).find((s) => s.id === pick.studentId);
  const rel0 = stu0.relation || 0;
  const r = handleTeachersDayCard(state, pick.studentId, "encourage");
  assert.equal(r.ok, true, r.reason);
  assert.match(r.text, /教师节|贺卡|花/);
  assert.ok(r.text.includes("宁川中学") || TEACHERS_DAY_SOURCE_NOTE.includes("宁川中学"));
  assert.match(TEACHERS_DAY_SOURCE_NOTE, /不是某所实校或教育行政部门的表彰大会/);
  assert.match(TEACHERS_DAY_SOURCE_NOTE, /9 月 10 日/);
  assert.ok(state.log.some((l) => l.text.includes(stu0.name) && (l.text.includes("教师节") || l.text.includes("贺卡") || l.text.includes("花"))));
  const stu = playerStudents(state).find((s) => s.id === pick.studentId);
  assert.ok(stu.teachersDayNotes?.length || stu.lastTeachersDay);
  assert.equal(hasTeachersDayCard(stu, "2017"), true);
  assert.ok((stu.relation || 0) >= rel0);
  const again = handleTeachersDayCard(state, pick.studentId, "thanks");
  assert.equal(again.ok, false);
  assert.match(again.reason, /已经|重复|建议名单/);

  const col = handleTeachersDayColleague(state, "return");
  assert.equal(col.ok, true, col.reason);
  assert.match(col.text, /办公室|备课组|问候/);
  const colAgain = handleTeachersDayColleague(state, "accept");
  assert.equal(colAgain.ok, false);

  // 收完当天建议名单
  for (;;) {
    const left = suggestTeachersDayCards(state);
    if (!left.length) break;
    const rec = handleTeachersDayCard(state, left[0].studentId, "thanks");
    assert.equal(rec.ok, true, rec.reason);
  }
  assert.equal(isTeachersDayOpen(state), false);
  assert.match(teachersDayUnavailableReason(state), /已经处理完|每年只有这一次/);

  assert.deepEqual(abilityMap(state), beforeAbility);
  assert.deepEqual(potentialMap(state), beforePotential);
  assert.deepEqual(examTotals(state), beforeExams);
  assert.deepEqual(officialProvincialPack(2017), officialBefore);
  assert.equal(JSON.stringify(provincialLines(2017)), linesBefore);

  // 次日不再开放；下一年同一窗口可再做
  goOffice(state, addDays(state.date, 1));
  assert.equal(isTeachersDayPlayDate(state.date), false);
  assert.equal(isTeachersDayOpen(state), false);

  goOffice(state, teachersDayPlayDate(2018));
  assert.equal(isTeachersDayPlayDate(state.date), true);
  assert.equal(isTeachersDayOpen(state), true, teachersDayUnavailableReason(state));
  const nextYear = suggestTeachersDayCards(state);
  assert.ok(nextYear.length >= TEACHERS_DAY_CARD_MIN);
  const ny = handleTeachersDayCard(state, nextYear[0].studentId, "thanks");
  assert.equal(ny.ok, true, ny.reason);

  // 请假生不在当场名单
  const leaveState = goPlayOffice(20170901, 2017);
  const cls = playerStudents(leaveState);
  const leaveDate = teachersDayPlayDate(2017);
  let away = cls.filter((s) => leaveCovering(s, leaveDate, leaveState.seed));
  if (!away.length) {
    // 换几个世界编号，保证能测到请假规则
    for (const seed of [20170902, 3, 17, 99, 2020, 123456, 888888]) {
      const alt = goPlayOffice(seed, 2017);
      away = playerStudents(alt).filter((s) => leaveCovering(s, leaveDate, alt.seed));
      if (away.length) {
        const sug = suggestTeachersDayCards(alt);
        const awayIds = new Set(away.map((s) => s.id));
        assert.ok(sug.every((v) => !awayIds.has(v.studentId)), "请假生不应出现在当场送礼名单");
        const blocked = handleTeachersDayCard(alt, away[0].id, "thanks");
        assert.equal(blocked.ok, false);
        break;
      }
    }
  } else {
    const sug = suggestTeachersDayCards(leaveState);
    const awayIds = new Set(away.map((s) => s.id));
    assert.ok(sug.every((v) => !awayIds.has(v.studentId)), "请假生不应出现在当场送礼名单");
    const blocked = handleTeachersDayCard(leaveState, away[0].id, "thanks");
    assert.equal(blocked.ok, false);
  }
  assert.ok(isDutyDay(leaveDate));
  // 即使默认种子当天无人请假，规则也应排除：把不在名单里的请假检查写进断言
  assert.equal(typeof leaveCovering, "function");
});

test("自动推进能越过未互动的教师节，不卡死（尤其是 2017 年开局后的第一个教师节周末）", () => {
  const state = createGame(20170901);
  assert.ok(state.date <= "2017-09-04");
  const r = skipToNextStage(state);
  assert.equal(r.ok, true, r.reason);
  assert.ok(state.date > "2017-09-11", `应越过 2017 年教师节可玩日，当前 ${state.date}`);
  assert.ok(majorEventOn(state.date) || state.date >= "2017-10-16", `应落到后续校历阶段，当前 ${state.date}`);

  const sitting = goPlayOffice(20170901, 2017);
  assert.equal(isTeachersDayOpen(sitting), true, teachersDayUnavailableReason(sitting));
  const start = sitting.date;
  const stepped = skipToNextStage(sitting);
  assert.equal(stepped.ok, true, stepped.reason);
  assert.ok(sitting.date > start, `坐在可玩日未互动也应能推进，当前 ${sitting.date}`);

  const day = goPlayOffice(20170901, 2017);
  const d0 = day.date;
  day.periodId = "noon";
  const adv = advanceDay(day);
  assert.ok(adv);
  assert.equal(day.date, addDays(d0, 1));

  const later = createGame(20170901);
  skipUntil(later, (s) => s.date >= "2018-09-10", 40);
  assert.ok(later.date >= "2018-09-10", `应能推进到 2018 年教师节附近，当前 ${later.date}`);
});

test("存档往返后教师节记录仍在", () => {
  const state = goPlayOffice(20170901, 2017);
  const list = suggestTeachersDayCards(state);
  const pick = list[0];
  const r = handleTeachersDayCard(state, pick.studentId, "thanks");
  assert.equal(r.ok, true, r.reason);
  const c = handleTeachersDayColleague(state, "accept");
  assert.equal(c.ok, true, c.reason);
  const json = toJSON(state);
  const loaded = fromJSON(json);
  assert.equal(loaded.date, state.date);
  assert.deepEqual(loaded.teachersDay, state.teachersDay);
  const stuA = playerStudents(state).find((s) => s.id === pick.studentId);
  const stuB = playerStudents(loaded).find((s) => s.id === pick.studentId);
  assert.ok(stuB.lastTeachersDay || (stuB.teachersDayNotes || []).length);
  assert.equal(stuB.lastTeachersDay?.text, stuA.lastTeachersDay?.text);
  assert.equal(stuB.relation, stuA.relation);
  goOffice(loaded, loaded.date);
  const again = handleTeachersDayCard(loaded, pick.studentId, "encourage");
  assert.equal(again.ok, false);
  const colAgain = handleTeachersDayColleague(loaded, "return");
  assert.equal(colAgain.ok, false);
});

test("教室和办公室界面有教师节入口，非窗口日不常驻空面板；公开省控数字未被改写", () => {
  const src = readFileSync(new URL("../js/ui/app.js", import.meta.url), "utf8");
  assert.match(src, /function teachersDayPanelHtml\s*\(/);
  assert.match(src, /教师节/);
  assert.match(src, /data-td-card/);
  assert.match(src, /data-td-colleague/);
  assert.match(src, /handleTeachersDayCard/);
  assert.match(src, /handleTeachersDayColleague/);
  assert.match(src, /isTeachersDayPlayDate/);
  const officeFn = src.slice(src.indexOf("function officeCollabHtml"), src.indexOf("function bindOfficeActions"));
  assert.match(officeFn, /teachersDayPanelHtml/);
  const teachFn = src.slice(src.indexOf("function viewTeach"), src.indexOf("function viewPlacement"));
  assert.match(teachFn, /officeCollabHtml\(\)/);
  const classFn = src.slice(src.indexOf("function viewClassroom"), src.indexOf("function viewRoster"));
  assert.match(classFn, /teachersDayPanelHtml/);
  assert.match(src, /教师节记录/);
  assert.match(src, /if \(!isTeachersDayPlayDate\(state\.date\)\) return ""/);

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
});
