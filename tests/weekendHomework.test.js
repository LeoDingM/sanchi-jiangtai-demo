import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createGame, playerStudents, prepareLesson, teach, skipToNextStage, skipUntil,
  handleWeekendHomework, composeWeekendHwBrief, weekendHwOptionsFor, composeWeekendHwMinutes,
  isWeekendHwOpen, isWeekendHwWindow, weekendHwUnavailableReason,
  ensureWeekendHwState, hasWeekendHwThisWeek, latestWeekendHwThisWeek,
  isWeekendHwTimeSlot, weekWeekendHwKey, termWeekendHwKey, weekendOfKey,
  weekendHwWindowDate, isWeekendHwWindowDate, isWeekendHwNoClassDate, composeWeekendHwLayers,
  weekendHwFollowUp, WEEKEND_HW_ACTIONS, WEEKEND_HW_SOURCE_NOTE, WEEKEND_HW_WEEK_CAP,
  currentSlot, majorEventOn, hostClassMeeting, advanceDay, reviewHomework,
  studentRecentStatus, isStudyHallSubject,
} from "../js/domain/simulation.js";
import { toJSON, fromJSON } from "../js/domain/save.js";
import { addDays, SCHOOL_CALENDAR, weekday } from "../js/domain/calendar.js";
import { activityEventOn, daySchedule } from "../js/domain/timetable.js";
import { officialProvincialPack, provincialLines } from "../js/domain/jiangxi.js";
import { isOpenHomework, allHomeworkRows } from "../js/domain/teaching.js";

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

function homeworkSnapshot(state) {
  return allHomeworkRows(state).map((r) => ({
    id: r.id, topic: r.topic, date: r.date, status: r.status, quality: r.quality,
    correction: r.correction, reviewed: !!r.reviewed, urged: !!r.urged, score: r.score,
  }));
}

function goOffice(state, date, periodId = "morning-read") {
  state.date = date;
  state.periodId = periodId;
  return state;
}

function firstWindowOffice(seed = 20170901) {
  const state = createGame(seed);
  goOffice(state, "2017-09-08");
  return state;
}

describe("周末分层作业布置", { concurrency: 1 }, () => {
test("开局当天是开学典礼可玩日，不能布置；第一次窗口落在其后第一个合格周五，两次开局同一周选择结果确定一致", () => {
  assert.equal(weekday("2017-09-01"), 5);
  assert.equal(weekday("2017-09-08"), 5);
  const opening = createGame(20170901);
  goOffice(opening, "2017-09-01");
  assert.equal(isWeekendHwWindowDate("2017-09-01", opening), false);
  assert.equal(isWeekendHwOpen(opening), false);
  assert.match(weekendHwUnavailableReason(opening), /开学典礼|报到/);
  assert.equal(weekendHwWindowDate("2017-09-01", opening), "");
  assert.equal(weekendHwWindowDate("2017-09-08", opening), "2017-09-08");

  const a = firstWindowOffice(20170901);
  const b = firstWindowOffice(20170901);
  assert.equal(isWeekendHwOpen(a), true, weekendHwUnavailableReason(a));
  assert.equal(isWeekendHwOpen(b), true, weekendHwUnavailableReason(b));
  assert.equal(isWeekendHwWindow(a), true);
  assert.equal(weekendHwWindowDate(a.date, a), "2017-09-08");

  const ba = composeWeekendHwBrief(a);
  const bb = composeWeekendHwBrief(b);
  assert.ok(ba && bb);
  assert.deepEqual(
    {
      topic: ba.topic,
      preview: ba.preview,
      foundation: ba.foundation.map((s) => s.id),
      extension: ba.extension.map((s) => s.id),
      consolidateCount: ba.consolidateCount,
    },
    {
      topic: bb.topic,
      preview: bb.preview,
      foundation: bb.foundation.map((s) => s.id),
      extension: bb.extension.map((s) => s.id),
      consolidateCount: bb.consolidateCount,
    },
  );
  assert.ok(ba.foundation.length >= 2 && ba.foundation.length <= 8);
  assert.ok(ba.extension.length >= 2 && ba.extension.length <= 8);
  assert.ok(ba.consolidateCount >= 0);
  const overlap = ba.foundation.filter((s) => ba.extension.some((e) => e.id === s.id));
  assert.equal(overlap.length, 0);

  const oa = weekendHwOptionsFor(a);
  const ob = weekendHwOptionsFor(b);
  assert.equal(oa.length, 3);
  assert.deepEqual(oa.map((o) => ({ id: o.id, label: o.label, text: o.text })), ob.map((o) => ({ id: o.id, label: o.label, text: o.text })));
  assert.deepEqual(oa.map((o) => o.id), WEEKEND_HW_ACTIONS.map((x) => x.id));
  for (const o of oa) {
    assert.equal(composeWeekendHwMinutes(a, o.id, ba), o.text);
    assert.match(o.text, /周末/);
    assert.match(o.text, /任课/);
    assert.match(o.text, /不能代替/);
    assert.match(o.text, /随堂作业/);
    assert.doesNotMatch(o.text, /你作为班主任|你主持了班会|改任班主任/);
    assert.ok(o.text.includes("分层作业") || WEEKEND_HW_SOURCE_NOTE.includes("周末"));
  }

  const ra = handleWeekendHomework(a, "layered");
  const rb = handleWeekendHomework(b, "layered");
  assert.equal(ra.ok, true, ra.reason);
  assert.equal(rb.ok, true, rb.reason);
  assert.equal(ra.text, rb.text);
  assert.match(ra.text, /按订正情况分层/);
  assert.ok((a.log || []).some((l) => l.text === ra.text));
  assert.equal(hasWeekendHwThisWeek(a), true);
  assert.equal(WEEKEND_HW_WEEK_CAP, 1);
});

test("数学正课、辅导时段、晚自习、自习看班节、考试日、活动日、周日、家长会当天、开学典礼或报到可玩日不可开；每周最多一次", () => {
  const state = firstWindowOffice();

  goOffice(state, "2017-09-08", "p2");
  const math = currentSlot(state);
  assert.equal(math.isMath, true, `2017-09-08 p2 应为数学正课，实际 ${math.subject}`);
  assert.equal(isWeekendHwOpen(state), false);
  assert.equal(isWeekendHwWindow(state), false);
  assert.match(weekendHwUnavailableReason(state), /数学正课/);

  goOffice(state, "2017-09-04", "evening-1");
  const tutor = currentSlot(state);
  assert.ok(tutor.isTutoring || /晚/.test(tutor.name || "") || tutor.id.startsWith("evening"));
  assert.equal(isWeekendHwOpen(state), false);
  assert.match(weekendHwUnavailableReason(state), /辅导|晚自习|办公室坐班|周五|周四/);

  goOffice(state, "2017-09-08", "evening-2");
  const hall = currentSlot(state);
  assert.equal(isStudyHallSubject(hall), true);
  assert.equal(isWeekendHwTimeSlot(hall, "2017-09-08"), false);
  assert.equal(isWeekendHwOpen(state), false);
  assert.match(weekendHwUnavailableReason(state), /自习看班|办公室坐班/);

  goOffice(state, "2017-11-17");
  assert.ok(majorEventOn("2017-11-17")?.kind === "exam" || SCHOOL_CALENDAR.some((e) => e.kind === "exam" && e.date <= "2017-11-17"));
  assert.equal(isWeekendHwOpen(state), false);
  assert.match(weekendHwUnavailableReason(state), /考试/);
  assert.equal(weekendHwWindowDate("2017-11-17", state), "");
  goOffice(state, "2017-11-16");
  assert.equal(isWeekendHwOpen(state), false);
  assert.match(weekendHwUnavailableReason(state), /考试|窗口|本周没有/);

  goOffice(state, "2017-10-27");
  assert.ok(activityEventOn("2017-10-27"));
  assert.equal(isWeekendHwOpen(state), false);
  assert.match(weekendHwUnavailableReason(state), /活动/);
  assert.equal(weekendHwWindowDate("2017-10-27", state), "");
  goOffice(state, "2017-10-26");
  assert.ok(activityEventOn("2017-10-26"));
  assert.equal(isWeekendHwOpen(state), false);

  goOffice(state, "2017-09-10");
  assert.equal(weekday("2017-09-10"), 0);
  assert.equal(isWeekendHwOpen(state), false);
  assert.match(weekendHwUnavailableReason(state), /周日/);

  goOffice(state, "2017-11-25");
  assert.equal(weekday("2017-11-25"), 6);
  assert.equal(majorEventOn("2017-11-25")?.kind, "parents");
  assert.equal(isWeekendHwOpen(state), false);
  assert.match(weekendHwUnavailableReason(state), /家长会|周六/);

  goOffice(state, "2018-02-22");
  assert.equal(weekday("2018-02-22"), 4);
  assert.equal(isWeekendHwOpen(state), false);
  assert.match(weekendHwUnavailableReason(state), /开学典礼|报到/);
  assert.equal(weekendHwWindowDate("2018-02-22", state), "2018-02-23");
  goOffice(state, "2018-02-23");
  assert.equal(weekendHwWindowDate("2018-02-23", state), "2018-02-23");
  assert.equal(isWeekendHwOpen(state), true, weekendHwUnavailableReason(state));

  const once = firstWindowOffice();
  const r1 = handleWeekendHomework(once, "uniform");
  assert.equal(r1.ok, true, r1.reason);
  assert.equal(hasWeekendHwThisWeek(once), true);
  const again = handleWeekendHomework(once, "layered");
  assert.equal(again.ok, false);
  assert.match(again.reason, /每周最多|已经布置/);
  assert.equal(isWeekendHwWindow(once), true);
  goOffice(once, "2017-09-15");
  assert.notEqual(weekWeekendHwKey("2017-09-15"), weekWeekendHwKey("2017-09-08"));
  assert.equal(isWeekendHwOpen(once), true, weekendHwUnavailableReason(once));
});

test("周五若是考试日且周四可坐班，则提前到本周四；不要改到周六日", () => {
  const state = createGame(20170901);
  assert.equal(weekday("2018-06-01"), 5);
  goOffice(state, "2018-06-01");
  assert.equal(isWeekendHwOpen(state), false);
  assert.match(weekendHwUnavailableReason(state), /考试/);
  assert.equal(weekendHwWindowDate("2018-06-01", state), "2018-05-31");
  goOffice(state, "2018-05-31");
  assert.equal(weekday("2018-05-31"), 4);
  assert.equal(isWeekendHwWindowDate("2018-05-31", state), true);
  assert.equal(isWeekendHwOpen(state), true, weekendHwUnavailableReason(state));
  const r = handleWeekendHomework(state, "extend");
  assert.equal(r.ok, true, r.reason);
  assert.equal(hasWeekendHwThisWeek(state, "2018-06-01"), true);
  goOffice(state, "2018-06-02");
  assert.equal(isWeekendHwOpen(state), false);
  assert.match(weekendHwUnavailableReason(state), /周六|周日|考试|窗口|请放到/);
  goOffice(state, "2018-06-03");
  assert.equal(isWeekendHwOpen(state), false);
  assert.match(weekendHwUnavailableReason(state), /周日/);
});

test("处理写入日志和档案近况，不改能力、分数、省控，也不改备课充分度，也不把随堂作业自动判完", () => {
  const state = firstWindowOffice();
  const prep = prepareLesson(state, { topic: "集合与逻辑用语", depth: 2, homework: "中" });
  assert.equal(prep.ok, true);
  goOffice(state, "2017-09-08", "p1");
  const taught = teach(state, "精讲例题");
  assert.equal(taught.ok, true, taught.reason);
  goOffice(state, "2017-09-08", "morning-read");
  const openBefore = homeworkSnapshot(state);
  assert.ok(openBefore.length > 0, "上课后应已有随堂作业");
  const openIds = openBefore.filter((r) => {
    const row = allHomeworkRows(state).find((x) => x.id === r.id && x.topic === r.topic);
    return isOpenHomework(row);
  }).map((r) => `${r.id}|${r.topic}|${r.correction}`);
  assert.ok(openIds.length > 0, "应有尚未闭环的随堂作业");

  const beforeAbility = abilityMap(state);
  const beforePotential = potentialMap(state);
  const beforeExams = examTotals(state);
  const officialBefore = officialProvincialPack(2017);
  const linesBefore = JSON.stringify(provincialLines(2017));
  const prepBefore = state.player.prep;
  const planBefore = state.player.lessonPlan && JSON.parse(JSON.stringify(state.player.lessonPlan));
  const roleBefore = state.player.role;

  const r = handleWeekendHomework(state, "layered");
  assert.equal(r.ok, true, r.reason);
  assert.match(r.text, /周末/);
  assert.match(r.text, /不能代替/);
  assert.match(r.minutes, /任课数学老师/);
  assert.equal(r.rec.role, "任课数学老师");
  assert.ok((state.log || []).some((l) => l.text === r.text));
  assert.ok((state.weekendHomeworks || []).some((m) => m.minutes === r.minutes));
  assert.equal(ensureWeekendHwState(state).done, true);
  assert.equal(state.weekendHomework.followUp?.text, "本周末有分层作业");
  assert.equal(weekendHwFollowUp(state)?.text, "本周末有分层作业");
  assert.equal(weekendOfKey(state.date), "2017-09-09");

  const named = playerStudents(state).filter((s) => s.lastWeekendHomework);
  assert.ok(named.length >= 2);
  for (const s of named) {
    const status = studentRecentStatus(s, state);
    assert.match(status, /周末作业/);
    assert.ok((s.weekendHomeworkNotes || []).length >= 1);
  }

  assert.deepEqual(abilityMap(state), beforeAbility);
  assert.deepEqual(potentialMap(state), beforePotential);
  assert.deepEqual(examTotals(state), beforeExams);
  assert.deepEqual(officialProvincialPack(2017), officialBefore);
  assert.equal(JSON.stringify(provincialLines(2017)), linesBefore);
  assert.equal(state.player.prep, prepBefore);
  assert.deepEqual(state.player.lessonPlan, planBefore);
  assert.equal(state.player.role, roleBefore);

  const openAfter = homeworkSnapshot(state);
  assert.deepEqual(openAfter, openBefore);

  const stillOpen = allHomeworkRows(state).filter((row) => isOpenHomework(row));
  assert.ok(stillOpen.length > 0, "周末作业不应把随堂作业自动判完");
  const internHost = hostClassMeeting(state);
  assert.equal(internHost.ok, false);
  assert.match(internHost.reason || internHost.text || "", /实习|班主任|主持/);
});

test("自动推进能越过未布置的周五，不卡死，也不自动代做", () => {
  const state = firstWindowOffice();
  assert.equal(isWeekendHwOpen(state), true, weekendHwUnavailableReason(state));
  const start = state.date;
  state.periodId = "noon";
  const stepped = advanceDay(state);
  assert.ok(stepped);
  assert.equal(state.date, addDays(start, 1));
  assert.equal(hasWeekendHwThisWeek(state, start), false);

  goOffice(state, start);
  assert.equal(isWeekendHwOpen(state), true, weekendHwUnavailableReason(state));
  const r = skipToNextStage(state);
  assert.equal(r.ok, true, r.reason);
  assert.ok(state.date > start, `应越过未布置的周末作业继续推进，当前 ${state.date}`);
  assert.equal(hasWeekendHwThisWeek(state, start), false);
  assert.equal((state.weekendHomeworks || []).length, 0);

  skipUntil(state, (s) => s.date >= "2017-11-15", 40);
  assert.ok(state.date >= "2017-11-15", `应能推进到期中，当前 ${state.date}`);
  assert.equal((state.weekendHomeworks || []).length, 0);
});

test("存档往返后记录仍在", () => {
  const a = firstWindowOffice();
  const r = handleWeekendHomework(a, "extend");
  assert.equal(r.ok, true, r.reason);
  const b = fromJSON(toJSON(a));
  assert.equal(b.date, a.date);
  assert.equal(b.weekendHomework.done, true);
  assert.equal(b.weekendHomework.lastAction, "extend");
  assert.equal(b.weekendHomeworks[0].minutes, a.weekendHomeworks[0].minutes);
  assert.equal(b.weekendHomeworks[0].topic, a.weekendHomeworks[0].topic);
  assert.equal(hasWeekendHwThisWeek(b), true);
  const again = handleWeekendHomework(b, "layered");
  assert.equal(again.ok, false);
  const named = playerStudents(b).filter((s) => s.lastWeekendHomework);
  assert.ok(named.length >= 2);
  assert.equal(b.weekendHomework.followUp?.text, "本周末有分层作业");
});

test("无课周不要硬凑；办公室和日常教学有周末作业入口，非窗口日不常驻空面板，教室正课不插入该面板", () => {
  const state = createGame(20170901);
  goOffice(state, "2018-01-26");
  assert.equal(isWeekendHwNoClassDate("2018-01-26"), true);
  assert.equal(weekendHwWindowDate("2018-01-26", state), "");
  assert.equal(isWeekendHwOpen(state), false);
  assert.match(weekendHwUnavailableReason(state), /没有正常上课|硬凑|窗口/);

  goOffice(state, "2018-07-13");
  assert.equal(isWeekendHwNoClassDate("2018-07-13"), true);
  assert.equal(isWeekendHwOpen(state), false);

  const src = readFileSync(new URL("../js/ui/app.js", import.meta.url), "utf8");
  assert.match(src, /function weekendHwPanelHtml\s*\(/);
  assert.match(src, /周末作业/);
  assert.match(src, /data-weekend-hw/);
  assert.match(src, /handleWeekendHomework/);
  assert.match(src, /分层预览/);
  const officeFn = src.slice(src.indexOf("function officeCollabHtml"), src.indexOf("function bindOfficeActions"));
  assert.match(officeFn, /weekendHwPanelHtml/);
  const teachFn = src.slice(src.indexOf("function viewTeach"), src.indexOf("function viewPlacement"));
  assert.match(teachFn, /officeCollabHtml\(\)/);
  const logFn = src.slice(src.indexOf("function viewLog"), src.indexOf("function viewSave"));
  assert.match(logFn, /周末作业|weekendHomeworks/);
  const classFn = src.slice(src.indexOf("function viewClassroom"), src.indexOf("function viewRoster"));
  assert.doesNotMatch(classFn, /weekendHwPanelHtml/);
});
});
