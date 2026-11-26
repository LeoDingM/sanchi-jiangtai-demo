import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createGame, playerStudents, prepareLesson, teach, skipToNextStage, skipUntil,
  handleQualityMeet, composeQualityMeetBrief, qualityMeetOptionsFor, composeQualityMeetMinutes,
  isQualityMeetOpen, isQualityMeetWindow, qualityMeetUnavailableReason, currentQualityMeetExam,
  ensureQualityMeetState, hasQualityMeet, settledQualityMeetExams, qualityMeetPublishDate,
  isQualityMeetTimeSlot, isQualityMeetExamKind, typicalErrorTopics, qualityMeetColleagues,
  QUALITY_MEET_ACTIONS, QUALITY_MEET_SOURCE_NOTE,
  currentSlot, majorEventOn, hostClassMeeting, consultMentor,
  advanceDay, listExamReports,
} from "../js/domain/simulation.js";
import { toJSON, fromJSON } from "../js/domain/save.js";
import { addDays, SCHOOL_CALENDAR, weekday } from "../js/domain/calendar.js";
import { activityEventOn } from "../js/domain/timetable.js";
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

function settleUntil(state, date, kind, entryYear = 2017, maxSteps = 90) {
  skipUntil(state, (s) => {
    return s.date >= date && listExamReports(s, { entryYear }).some((r) => r.examKind === kind);
  }, maxSteps);
  return state;
}

function afterPublishOffice(state, exam) {
  const pub = qualityMeetPublishDate(exam);
  let d = pub;
  for (let i = 0; i < 14; i++) {
    const wd = weekday(d);
    const major = majorEventOn(d);
    const activity = activityEventOn(d);
    if (wd >= 1 && wd <= 5 && !major && !activity) {
      goOffice(state, d);
      return d;
    }
    d = addDays(d, 1);
  }
  goOffice(state, pub);
  return pub;
}

function toMonthlyOffice(seed = 20170901) {
  const state = createGame(seed);
  settleUntil(state, "2017-10-16", "monthly");
  const exam = currentQualityMeetExam(goOffice(state, "2017-10-18"))
    || settledQualityMeetExams(state).find((e) => e.examKind === "monthly");
  assert.ok(exam, "应已结算第一次月考");
  afterPublishOffice(state, exam);
  return state;
}

function implantKind(state, examKind, examName, date) {
  const ev = SCHOOL_CALENDAR.find((e) => e.examKind === examKind && (!date || e.date === date))
    || { id: `exam-${examKind}`, name: examName, date, examKind, days: 2 };
  const base = settledQualityMeetExams(state)[0] || Object.values(state.exams || {})[0];
  assert.ok(base, "需要一场已结算考试作为模板");
  const copy = {
    ...base,
    examId: ev.id,
    examName: ev.name || examName,
    examKind,
    date: ev.date,
    pruned: false,
  };
  state.exams = { [`${state.player.cohortYear}|${copy.examId}`]: copy };
  return copy;
}


describe("备课组质量分析会", { concurrency: 1 }, () => {
test("同一 seed + 对应考试，会议要点确定可复现", () => {
  const a = toMonthlyOffice(20170901);
  const b = toMonthlyOffice(20170901);
  assert.equal(isQualityMeetOpen(a), true, qualityMeetUnavailableReason(a));
  assert.equal(isQualityMeetOpen(b), true, qualityMeetUnavailableReason(b));
  const ba = composeQualityMeetBrief(a, currentQualityMeetExam(a));
  const bb = composeQualityMeetBrief(b, currentQualityMeetExam(b));
  assert.ok(ba && bb);
  assert.deepEqual(
    { points: ba.points, shortPoints: ba.shortPoints, topics: ba.topics, colleagues: ba.colleagues.map((c) => c.id), classMath: ba.classMath, gradeMath: ba.gradeMath },
    { points: bb.points, shortPoints: bb.shortPoints, topics: bb.topics, colleagues: bb.colleagues.map((c) => c.id), classMath: bb.classMath, gradeMath: bb.gradeMath },
  );
  const oa = qualityMeetOptionsFor(a, currentQualityMeetExam(a));
  const ob = qualityMeetOptionsFor(b, currentQualityMeetExam(b));
  assert.equal(oa.length, 3);
  assert.deepEqual(oa.map((o) => ({ id: o.id, text: o.text })), ob.map((o) => ({ id: o.id, text: o.text })));
  assert.deepEqual(oa.map((o) => o.id), QUALITY_MEET_ACTIONS.map((x) => x.id));
  for (const o of oa) {
    assert.equal(composeQualityMeetMinutes(a, currentQualityMeetExam(a), o.id, ba), o.text);
    assert.ok(o.text.includes("数学备课组"));
    assert.ok(o.text.includes("不是接任备课组长"));
    assert.ok(o.text.includes("考后 AI") || o.text.includes("不是成绩页"));
    assert.ok(o.text.includes("阅卷") || QUALITY_MEET_SOURCE_NOTE.includes("阅卷"));
    assert.ok(o.text.includes("学期评语") || QUALITY_MEET_SOURCE_NOTE.includes("学期评语"));
    assert.ok(o.text.includes("宁川中学"));
    assert.doesNotMatch(o.text, /你主持了这次质量分析会|你作为备课组长|你是教研组长/);
  }
  assert.ok(ba.classMath != null);
  assert.ok(ba.shortPoints.includes(String(ba.classMath)));
  assert.ok(typicalErrorTopics(a, currentQualityMeetExam(a)).length >= 1);
  assert.ok(qualityMeetColleagues(a, currentQualityMeetExam(a)).length >= 1);
  assert.ok(qualityMeetColleagues(a, currentQualityMeetExam(a)).length <= 2);
});

test("仅月考/期中/期末/模拟成绩公布后的办公室坐班可开；数学正课、考试日、活动日、周日、家长会当天、联考/会考/高考后不可开", () => {
  assert.equal(isQualityMeetExamKind("monthly"), true);
  assert.equal(isQualityMeetExamKind("midterm"), true);
  assert.equal(isQualityMeetExamKind("final"), true);
  assert.equal(isQualityMeetExamKind("mock1"), true);
  assert.equal(isQualityMeetExamKind("mock2"), true);
  assert.equal(isQualityMeetExamKind("mock3"), true);
  assert.equal(isQualityMeetExamKind("city"), false);
  assert.equal(isQualityMeetExamKind("province"), false);
  assert.equal(isQualityMeetExamKind("huikao"), false);
  assert.equal(isQualityMeetExamKind("gaokao"), false);

  const state = createGame(20170901);
  goOffice(state, "2017-09-04");
  assert.equal(isQualityMeetOpen(state), false);
  assert.match(qualityMeetUnavailableReason(state), /月考、期中、期末或模拟|联考、会考、高考/);

  goOffice(state, "2017-09-11");
  assert.equal(isQualityMeetOpen(state), false);
  assert.match(qualityMeetUnavailableReason(state), /教师节/);

  settleUntil(state, "2017-10-16", "monthly");
  const monthlyExam = currentQualityMeetExam(goOffice(state, "2017-10-18"))
    || settledQualityMeetExams(state).find((e) => e.examKind === "monthly");
  assert.ok(monthlyExam, "应已结算第一次月考");
  afterPublishOffice(state, monthlyExam);
  assert.equal(isQualityMeetOpen(state), true, qualityMeetUnavailableReason(state));
  assert.equal(isQualityMeetWindow(state), true);
  assert.equal(currentQualityMeetExam(state).examKind, "monthly");
  assert.equal(isQualityMeetTimeSlot(currentSlot(state), state.date), true);

  const openDate = state.date;
  state.periodId = "p2";
  const mathSlot = currentSlot(state);
  if (mathSlot?.isMath) {
    assert.equal(isQualityMeetOpen(state), false);
    assert.match(qualityMeetUnavailableReason(state), /数学正课/);
  } else {
    goOffice(state, "2017-10-21");
    state.periodId = "p3";
    if (currentSlot(state)?.isMath) {
      assert.equal(isQualityMeetOpen(state), false);
      assert.match(qualityMeetUnavailableReason(state), /数学正课/);
    }
  }

  // 周一晚自习才是数学辅导；第一次月考公布日若不是周一，改到窗口内的周一再验。
  goOffice(state, "2017-10-23");
  state.periodId = "evening-1";
  assert.equal(currentSlot(state).isTutoring, true);
  assert.equal(isQualityMeetOpen(state), false);
  assert.match(qualityMeetUnavailableReason(state), /辅导时段|晚自习/);

  state.periodId = "evening-2";
  assert.equal(isQualityMeetOpen(state), false);
  assert.match(qualityMeetUnavailableReason(state), /晚自习|辅导时段|办公室坐班/);

  goOffice(state, openDate);
  state.periodId = "noon";
  assert.equal(isQualityMeetOpen(state), false);
  assert.match(qualityMeetUnavailableReason(state), /办公室坐班/);

  goOffice(state, "2017-10-16");
  assert.ok(majorEventOn("2017-10-16"));
  assert.equal(isQualityMeetOpen(state), false);
  assert.match(qualityMeetUnavailableReason(state), /考试/);

  goOffice(state, "2017-10-17");
  assert.equal(isQualityMeetOpen(state), false);
  assert.match(qualityMeetUnavailableReason(state), /考试|公布/);

  const sports = SCHOOL_CALENDAR.find((e) => e.kind === "activity" && e.activityKind === "sports" && e.date.startsWith("2017"));
  assert.ok(sports);
  goOffice(state, sports.date);
  assert.ok(activityEventOn(state.date));
  assert.equal(isQualityMeetOpen(state), false);
  assert.match(qualityMeetUnavailableReason(state), /活动/);

  goOffice(state, "2017-10-22");
  assert.equal(weekday(state.date), 0);
  state.periodId = "rest";
  assert.equal(isQualityMeetOpen(state), false);
  assert.match(qualityMeetUnavailableReason(state), /周日/);

  settleUntil(state, "2017-11-15", "midterm");
  const midExam = settledQualityMeetExams(state).find((e) => e.examKind === "midterm");
  assert.ok(midExam, "应已结算期中");
  afterPublishOffice(state, midExam);
  assert.equal(isQualityMeetOpen(state), true, qualityMeetUnavailableReason(state));
  assert.equal(currentQualityMeetExam(state).examKind, "midterm");

  const parents = SCHOOL_CALENDAR.find((e) => e.kind === "parents" && e.date.startsWith("2017"));
  assert.ok(parents);
  goOffice(state, parents.date);
  assert.equal(isQualityMeetOpen(state), false);
  assert.match(qualityMeetUnavailableReason(state), /家长会/);

  // 期末、模拟用已结算成绩作模板植入，避免再开新档占内存；联考/会考/高考同样验证不可开。
  const finalExam = implantKind(state, "final", "期末考试", "2018-01-16");
  afterPublishOffice(state, finalExam);
  assert.equal(isQualityMeetOpen(state), true, qualityMeetUnavailableReason(state));
  assert.equal(currentQualityMeetExam(state).examKind, "final");

  const mockExam = implantKind(state, "mock1", "高三一模", "2018-05-08");
  afterPublishOffice(state, mockExam);
  assert.equal(isQualityMeetOpen(state), true, qualityMeetUnavailableReason(state));
  assert.equal(currentQualityMeetExam(state).examKind, "mock1");

  const cityExam = implantKind(state, "city", "市联考", "2018-04-18");
  afterPublishOffice(state, cityExam);
  assert.equal(isQualityMeetOpen(state), false);
  assert.equal(currentQualityMeetExam(state), null);
  assert.match(qualityMeetUnavailableReason(state), /联考、会考、高考|月考、期中、期末或模拟/);

  const hkExam = implantKind(state, "huikao", "会考", "2018-06-18");
  afterPublishOffice(state, hkExam);
  assert.equal(isQualityMeetOpen(state), false);
  assert.equal(currentQualityMeetExam(state), null);

  const gkExam = implantKind(state, "gaokao", "高考", "2018-06-07");
  afterPublishOffice(state, gkExam);
  assert.equal(isQualityMeetOpen(state), false);
  assert.equal(currentQualityMeetExam(state), null);
});

test("同一场考试不能开第二次", () => {
  const state = toMonthlyOffice();
  const exam = currentQualityMeetExam(state);
  const r = handleQualityMeet(state, "listen");
  assert.equal(r.ok, true, r.reason);
  assert.equal(hasQualityMeet(state, exam), true);
  const again = handleQualityMeet(state, "supplement");
  assert.equal(again.ok, false);
  assert.match(again.reason, /已经开过|只开一次|已经参加/);
  assert.equal(isQualityMeetOpen(state), false);
  assert.match(qualityMeetUnavailableReason(state), /已经开过|只开一次|已经参加/);
  assert.equal(isQualityMeetWindow(state), true);
});

test("写入日志和纪要，不改能力、分数、省控，也不调用或改写考后 AI；文案区分备课组会议与阅卷、学期评语、考后 AI，玩家仍不是备课组长", () => {
  const state = toMonthlyOffice();
  const beforeAbility = abilityMap(state);
  const beforePotential = potentialMap(state);
  const beforeExams = examTotals(state);
  const officialBefore = officialProvincialPack(2017);
  const linesBefore = JSON.stringify(provincialLines(2017));
  const mentorBefore = state.mentorConsultedOn;
  const roleBefore = state.player.role;
  const r = handleQualityMeet(state, "askMentor");
  assert.equal(r.ok, true, r.reason);
  assert.ok(r.text.includes("质量分析会"));
  assert.ok(r.text.includes("不是接任备课组长"));
  assert.ok(r.text.includes("考后 AI") || r.minutes.includes("考后 AI"));
  assert.ok(r.text.includes("阅卷") || r.minutes.includes("阅卷"));
  assert.ok(r.text.includes("学期评语") || r.minutes.includes("学期评语"));
  assert.ok(r.minutes.includes("宁川中学数学备课组"));
  assert.ok((r.rec.hostTitle || "").includes("备课组长"));
  assert.equal(r.rec.role, "任课数学老师");
  assert.doesNotMatch(r.text, /你主持了这次会|你作为备课组长|改任备课组长|你是教研组长/);
  assert.ok((state.log || []).some((l) => l.text === r.text || (l.text || "").includes("质量分析会")));
  assert.ok((state.qualityMeetings || []).some((m) => m.minutes === r.minutes));
  assert.equal(ensureQualityMeetState(state).done, true);
  assert.equal(state.mentorConsultedOn, mentorBefore);
  assert.equal(state.player.role, roleBefore);
  assert.equal(String(state.player.role || "").includes("备课组长"), false);
  assert.equal(String(state.player.role || "").includes("教研组长"), false);
  assert.deepEqual(abilityMap(state), beforeAbility);
  assert.deepEqual(potentialMap(state), beforePotential);
  assert.deepEqual(examTotals(state), beforeExams);
  assert.deepEqual(officialProvincialPack(2017), officialBefore);
  assert.equal(JSON.stringify(provincialLines(2017)), linesBefore);
  for (const ex of Object.values(state.exams || {})) {
    assert.equal(ex.aiCommentary, undefined);
    assert.equal(ex.examAi, undefined);
  }
  const src = readFileSync(new URL("../js/domain/qualityMeet.js", import.meta.url), "utf8");
  assert.doesNotMatch(src, /examAi\.js|requestExamAnalysis|buildExamAnalysisPayload/);
  assert.doesNotMatch(src, /drawLineChart|drawBarChart|charts\.js/);

  const consult = consultMentor(state);
  assert.ok(consult.ok === true || consult.ok === false);
  if (consult.ok === false) {
    assert.doesNotMatch(consult.reason || "", /质量分析会已经占用|请教次数已/);
  }

  const internHost = hostClassMeeting(state);
  assert.equal(internHost.ok, false);
  assert.match(internHost.reason || internHost.text || "", /实习|班主任|主持/);
});

test("存档往返后纪要仍在", () => {
  const a = toMonthlyOffice();
  const r = handleQualityMeet(a, "supplement");
  assert.equal(r.ok, true, r.reason);
  const b = fromJSON(toJSON(a));
  assert.equal(b.date, a.date);
  assert.equal(b.qualityMeet.done, true);
  assert.equal(b.qualityMeet.lastAction, "supplement");
  assert.equal(b.qualityMeetings[0].minutes, a.qualityMeetings[0].minutes);
  assert.equal(b.qualityMeetings[0].examKind, "monthly");
  assert.equal(hasQualityMeet(b, currentQualityMeetExam(b)), true);
  const again = handleQualityMeet(b, "listen");
  assert.equal(again.ok, false);
});

test("自动推进能越过未参加的分析会，不卡死", () => {
  const state = toMonthlyOffice();
  assert.equal(isQualityMeetOpen(state), true, qualityMeetUnavailableReason(state));
  const start = state.date;
  state.periodId = "noon";
  const stepped = advanceDay(state);
  assert.ok(stepped);
  assert.equal(state.date, addDays(start, 1));

  goOffice(state, start);
  assert.equal(isQualityMeetOpen(state), true, qualityMeetUnavailableReason(state));
  const r = skipToNextStage(state);
  assert.equal(r.ok, true, r.reason);
  assert.ok(state.date > start, `应越过未参加的分析会继续推进，当前 ${state.date}`);
  assert.ok(majorEventOn(state.date) || (state.exams && Object.keys(state.exams).length));

  skipUntil(state, (s) => s.date >= "2017-11-15", 40);
  assert.ok(state.date >= "2017-11-15", `应能推进到期中，当前 ${state.date}`);
});

test("办公室和日常教学界面有备课组质量分析会入口，学校日志能看到纪要", () => {
  const src = readFileSync(new URL("../js/ui/app.js", import.meta.url), "utf8");
  assert.match(src, /function qualityMeetPanelHtml\s*\(/);
  assert.match(src, /备课组质量分析会/);
  assert.match(src, /data-quality-meet/);
  assert.match(src, /handleQualityMeet/);
  const officeFn = src.slice(src.indexOf("function officeCollabHtml"), src.indexOf("function bindOfficeActions"));
  assert.match(officeFn, /qualityMeetPanelHtml/);
  const teachFn = src.slice(src.indexOf("function viewTeach"), src.indexOf("function viewPlacement"));
  assert.match(teachFn, /officeCollabHtml\(\)/);
  const logFn = src.slice(src.indexOf("function viewLog"), src.indexOf("function viewSave"));
  assert.match(logFn, /会议纪要|qualityMeetings/);
  const classFn = src.slice(src.indexOf("function viewClassroom"), src.indexOf("function viewRoster"));
  assert.doesNotMatch(classFn, /qualityMeetPanelHtml/);
});
});
