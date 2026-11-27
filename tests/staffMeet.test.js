import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createGame, playerStudents, prepareLesson, teach, skipToNextStage, skipUntil,
  handleFacultyMeet, composeFacultyMeetBrief, facultyMeetOptionsFor, composeFacultyMeetMinutes,
  isFacultyMeetOpen, isFacultyMeetWindow, facultyMeetUnavailableReason,
  ensureFacultyMeetState, hasFacultyMeet, facultyMeetDateForOpening, facultyMeetDateOfTerm,
  facultyMeetOpeningEvent, isFacultyMeetDate, isFacultyMeetTimeSlot, termOpeningEvent,
  isStaffMeetNoClassDate, FACULTY_MEET_ACTIONS, FACULTY_MEET_SOURCE_NOTE, FACULTY_HOST_TITLE,
  handleGradeMeet, composeGradeMeetBrief, gradeMeetOptionsFor, composeGradeMeetMinutes,
  isGradeMeetOpen, isGradeMeetWindow, gradeMeetUnavailableReason,
  ensureGradeMeetState, hasGradeMeet, currentGradeMeetExam, settledGradeMeetExams,
  gradeMeetPublishDate, isGradeMeetTimeSlot, isGradeMeetExamKind,
  GRADE_MEET_ACTIONS, GRADE_MEET_SOURCE_NOTE, GRADE_DIRECTOR_NAME, GRADE_DIRECTOR_TITLE,
  handleQualityMeet, currentQualityMeetExam, hasQualityMeet, qualityMeetUnavailableReason,
  isQualityMeetOpen, isDutyWeekOpen, isGroupPrepOpen, isOpeningDayOpen,
  currentSlot, majorEventOn, hostClassMeeting, consultMentor, advanceDay,
  listExamReports,
} from "../js/domain/simulation.js";
import { toJSON, fromJSON } from "../js/domain/save.js";
import { addDays, SCHOOL_CALENDAR, weekday } from "../js/domain/calendar.js";
import { activityEventOn, daySchedule } from "../js/domain/timetable.js";
import { officialProvincialPack, provincialLines } from "../js/domain/jiangxi.js";
import { isStudyHallSubject } from "../js/domain/studyHall.js";
import { openingPlayDate } from "../js/domain/openingDay.js";

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

function goOffice(state, date, periodId = "morning-read") {
  state.date = date;
  state.periodId = periodId;
  return state;
}

function firstFacultyOffice(seed = 20170901) {
  const state = createGame(seed);
  goOffice(state, "2017-09-04");
  return state;
}

function periodOn(state, date, pred) {
  goOffice(state, date, "morning-read");
  const slot = daySchedule(date, state).find(pred);
  return slot || null;
}

function settleUntil(state, date, kind, entryYear = 2017, maxSteps = 90) {
  skipUntil(state, (s) => {
    return s.date >= date && listExamReports(s, { entryYear }).some((r) => r.examKind === kind);
  }, maxSteps);
  return state;
}

function afterPublishOffice(state, exam) {
  const pub = gradeMeetPublishDate(exam);
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
  const exam = currentGradeMeetExam(goOffice(state, "2017-10-18"))
    || settledGradeMeetExams(state).find((e) => e.examKind === "monthly");
  assert.ok(exam, "应已结算第一次月考");
  afterPublishOffice(state, exam);
  return state;
}

function implantKind(state, examKind, examName, date) {
  const ev = SCHOOL_CALENDAR.find((e) => e.examKind === examKind && (!date || e.date === date))
    || { id: `exam-${examKind}`, name: examName, date, examKind, days: 2 };
  const base = settledGradeMeetExams(state)[0] || Object.values(state.exams || {})[0];
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

describe("年级会与教职工大会", { concurrency: 1 }, () => {
test("2017 年第一次教职工大会不落在 2017-09-01 开学典礼当天，而在其后第一个上课工作日；两次开局同一天选择结果确定一致", () => {
  assert.equal(weekday("2017-09-01"), 5);
  assert.equal(weekday("2017-09-04"), 1);
  const opening = SCHOOL_CALENDAR.find((e) => e.id === "open-2017-fall");
  assert.ok(opening);
  assert.equal(openingPlayDate(opening), "2017-09-01");
  assert.equal(facultyMeetDateForOpening(opening), "2017-09-04");
  assert.equal(facultyMeetDateOfTerm("2017-09-01"), "2017-09-04");
  assert.equal(isFacultyMeetDate("2017-09-01"), false);
  assert.equal(isFacultyMeetDate("2017-09-04"), true);

  const ceremony = createGame(20170901);
  goOffice(ceremony, "2017-09-01");
  assert.equal(isFacultyMeetOpen(ceremony), false);
  assert.equal(isFacultyMeetWindow(ceremony), false);
  assert.match(facultyMeetUnavailableReason(ceremony), /开学典礼|报到|上课工作日/);
  assert.ok(!facultyMeetUnavailableReason(ceremony).includes("2017-08-31"));

  const early = createGame(20170901);
  goOffice(early, "2017-08-31");
  assert.equal(isFacultyMeetOpen(early), false);
  assert.equal(isFacultyMeetDate("2017-08-31"), false);

  const a = firstFacultyOffice(20170901);
  const b = firstFacultyOffice(20170901);
  assert.equal(isFacultyMeetOpen(a), true, facultyMeetUnavailableReason(a));
  assert.equal(isFacultyMeetOpen(b), true, facultyMeetUnavailableReason(b));
  assert.equal(isFacultyMeetWindow(a), true);
  assert.equal(facultyMeetOpeningEvent(a.date)?.id, "open-2017-fall");
  assert.equal(termOpeningEvent(a.date)?.id, "open-2017-fall");

  const ba = composeFacultyMeetBrief(a);
  const bb = composeFacultyMeetBrief(b);
  assert.ok(ba && bb);
  assert.deepEqual(
    { points: ba.points, shortPoints: ba.shortPoints, req: ba.req, arrange: ba.arrange },
    { points: bb.points, shortPoints: bb.shortPoints, req: bb.req, arrange: bb.arrange },
  );
  const oa = facultyMeetOptionsFor(a);
  const ob = facultyMeetOptionsFor(b);
  assert.equal(oa.length, 3);
  assert.deepEqual(oa.map((o) => ({ id: o.id, label: o.label, text: o.text })), ob.map((o) => ({ id: o.id, label: o.label, text: o.text })));
  assert.deepEqual(oa.map((o) => o.id), FACULTY_MEET_ACTIONS.map((x) => x.id));
  for (const o of oa) {
    assert.equal(composeFacultyMeetMinutes(a, o.id, ba), o.text);
    assert.match(o.text, /教职工大会/);
    assert.match(o.text, /校领导/);
    assert.match(o.text, /任课/);
    assert.doesNotMatch(o.text, /质量分析会已经开过|你主持了这次教职工大会|你作为校领导|改任校领导|你是年级主任/);
    assert.ok(o.text.includes(FACULTY_MEET_SOURCE_NOTE) || FACULTY_MEET_SOURCE_NOTE.includes("教职工大会"));
  }
  assert.match(ba.shortPoints, /教职工大会|校领导/);
  assert.doesNotMatch(ba.shortPoints, /你主持了/);

  const ra = handleFacultyMeet(a, "listen");
  const rb = handleFacultyMeet(b, "listen");
  assert.equal(ra.ok, true, ra.reason);
  assert.equal(rb.ok, true, rb.reason);
  assert.equal(ra.text, rb.text);
  assert.match(ra.text, /教职工大会/);
  assert.match(ra.text, /到场听完/);
  assert.ok((a.log || []).some((l) => l.text === ra.text));
  assert.equal(hasFacultyMeet(a, facultyMeetOpeningEvent(a.date)), true);
  assert.equal(a.facultyMeet.done, true);

  const springOpen = SCHOOL_CALENDAR.find((e) => e.id === "open-2017-spring");
  assert.ok(springOpen);
  assert.equal(springOpen.date, "2018-02-22");
  assert.equal(weekday("2018-02-22"), 4);
  assert.equal(facultyMeetDateForOpening(springOpen), "2018-02-23");
  const spring = createGame(20170901);
  goOffice(spring, "2018-02-22");
  assert.equal(isFacultyMeetOpen(spring), false);
  assert.match(facultyMeetUnavailableReason(spring), /开学典礼|报到|上课工作日/);
  goOffice(spring, "2018-02-23");
  assert.equal(isFacultyMeetDate("2018-02-23"), true);
  assert.equal(isFacultyMeetOpen(spring), true, facultyMeetUnavailableReason(spring));
});

test("年级会仅在月考/期中/期末/模拟成绩公布后的办公室坐班可开；联考/会考/高考后不可开；同一场考试不能开第二次", () => {
  assert.equal(isGradeMeetExamKind("monthly"), true);
  assert.equal(isGradeMeetExamKind("midterm"), true);
  assert.equal(isGradeMeetExamKind("final"), true);
  assert.equal(isGradeMeetExamKind("mock1"), true);
  assert.equal(isGradeMeetExamKind("mock2"), true);
  assert.equal(isGradeMeetExamKind("mock3"), true);
  assert.equal(isGradeMeetExamKind("city"), false);
  assert.equal(isGradeMeetExamKind("province"), false);
  assert.equal(isGradeMeetExamKind("huikao"), false);
  assert.equal(isGradeMeetExamKind("gaokao"), false);

  const state = createGame(20170901);
  goOffice(state, "2017-09-04");
  assert.equal(isGradeMeetOpen(state), false);
  assert.match(gradeMeetUnavailableReason(state), /月考、期中、期末或模拟|联考、会考、高考/);

  settleUntil(state, "2017-10-16", "monthly");
  const monthlyExam = currentGradeMeetExam(goOffice(state, "2017-10-18"))
    || settledGradeMeetExams(state).find((e) => e.examKind === "monthly");
  assert.ok(monthlyExam, "应已结算第一次月考");
  afterPublishOffice(state, monthlyExam);
  assert.equal(isGradeMeetOpen(state), true, gradeMeetUnavailableReason(state));
  assert.equal(isGradeMeetWindow(state), true);
  assert.equal(currentGradeMeetExam(state).examKind, "monthly");
  assert.equal(isGradeMeetTimeSlot(currentSlot(state), state.date), true);

  const first = handleGradeMeet(state, "listen");
  assert.equal(first.ok, true, first.reason);
  assert.equal(hasGradeMeet(state, monthlyExam), true);
  const again = handleGradeMeet(state, "notes");
  assert.equal(again.ok, false);
  assert.match(again.reason, /已经开过|只开一次|已经参加/);
  assert.equal(isGradeMeetOpen(state), false);
  assert.match(gradeMeetUnavailableReason(state), /已经开过|只开一次|已经参加/);
  assert.equal(isGradeMeetWindow(state), true);

  const next = toMonthlyOffice(20170908);
  settleUntil(next, "2017-11-15", "midterm");
  const midExam = settledGradeMeetExams(next).find((e) => e.examKind === "midterm");
  assert.ok(midExam, "应已结算期中");
  afterPublishOffice(next, midExam);
  assert.equal(isGradeMeetOpen(next), true, gradeMeetUnavailableReason(next));
  assert.equal(currentGradeMeetExam(next).examKind, "midterm");

  const finalExam = implantKind(next, "final", "期末考试", "2018-01-16");
  afterPublishOffice(next, finalExam);
  assert.equal(isGradeMeetOpen(next), true, gradeMeetUnavailableReason(next));
  assert.equal(currentGradeMeetExam(next).examKind, "final");

  const mockExam = implantKind(next, "mock1", "高三一模", "2018-05-08");
  afterPublishOffice(next, mockExam);
  assert.equal(isGradeMeetOpen(next), true, gradeMeetUnavailableReason(next));
  assert.equal(currentGradeMeetExam(next).examKind, "mock1");

  const cityExam = implantKind(next, "city", "市联考", "2018-04-18");
  afterPublishOffice(next, cityExam);
  assert.equal(isGradeMeetOpen(next), false);
  assert.equal(currentGradeMeetExam(next), null);
  assert.match(gradeMeetUnavailableReason(next), /联考、会考、高考|月考、期中、期末或模拟/);

  const hkExam = implantKind(next, "huikao", "会考", "2018-06-18");
  afterPublishOffice(next, hkExam);
  assert.equal(isGradeMeetOpen(next), false);
  assert.equal(currentGradeMeetExam(next), null);

  const gkExam = implantKind(next, "gaokao", "高考", "2018-06-07");
  afterPublishOffice(next, gkExam);
  assert.equal(isGradeMeetOpen(next), false);
  assert.equal(currentGradeMeetExam(next), null);
});

test("数学正课、辅导、晚自习、自习看班、考试日、活动日、周日、家长会当天、开学典礼或报到可玩日不可开", () => {
  const state = firstFacultyOffice();
  assert.equal(isFacultyMeetOpen(state), true, facultyMeetUnavailableReason(state));

  const mathSlot = periodOn(state, "2017-09-04", (p) => p.isMath && !p.isTutoring);
  assert.ok(mathSlot, "2017-09-04 应有数学正课");
  goOffice(state, "2017-09-04", mathSlot.id);
  assert.equal(currentSlot(state).isMath, true);
  assert.equal(isFacultyMeetOpen(state), false);
  assert.match(facultyMeetUnavailableReason(state), /数学正课/);
  assert.equal(isFacultyMeetWindow(state), true);

  const tutorSlot = periodOn(state, "2017-09-04", (p) => p.isTutoring || /^evening/.test(p.id));
  if (tutorSlot) {
    goOffice(state, "2017-09-04", tutorSlot.id);
    assert.equal(isFacultyMeetOpen(state), false);
    assert.match(facultyMeetUnavailableReason(state), /辅导|晚自习|办公室坐班/);
  }

  const hallSlot = periodOn(state, "2017-09-04", (p) => isStudyHallSubject(p));
  if (hallSlot) {
    goOffice(state, "2017-09-04", hallSlot.id);
    assert.equal(isFacultyMeetTimeSlot(hallSlot, "2017-09-04"), false);
    assert.equal(isFacultyMeetOpen(state), false);
    assert.match(facultyMeetUnavailableReason(state), /自习看班|办公室坐班/);
  } else {
    goOffice(state, "2017-09-08", "evening-2");
    const hall = currentSlot(state);
    if (isStudyHallSubject(hall)) {
      assert.equal(isFacultyMeetTimeSlot(hall, "2017-09-08"), false);
      assert.equal(isFacultyMeetOpen(state), false);
      assert.match(facultyMeetUnavailableReason(state), /自习看班|办公室坐班|窗口已经过了|上课工作日/);
    }
  }

  goOffice(state, "2017-09-04", "noon");
  assert.equal(isFacultyMeetOpen(state), false);
  assert.match(facultyMeetUnavailableReason(state), /办公室坐班/);

  const grade = toMonthlyOffice();
  const openDate = grade.date;
  const gMath = periodOn(grade, openDate, (p) => p.isMath && !p.isTutoring);
  if (gMath) {
    goOffice(grade, openDate, gMath.id);
    assert.equal(isGradeMeetOpen(grade), false);
    assert.match(gradeMeetUnavailableReason(grade), /数学正课/);
  }
  goOffice(grade, "2017-10-23");
  grade.periodId = "evening-1";
  assert.equal(currentSlot(grade).isTutoring, true);
  assert.equal(isGradeMeetOpen(grade), false);
  assert.match(gradeMeetUnavailableReason(grade), /辅导时段|晚自习/);
  grade.periodId = "evening-2";
  assert.equal(isGradeMeetOpen(grade), false);
  assert.match(gradeMeetUnavailableReason(grade), /晚自习|辅导时段|办公室坐班/);

  goOffice(state, "2017-11-17");
  assert.ok(majorEventOn("2017-11-17")?.kind === "exam" || SCHOOL_CALENDAR.some((e) => e.kind === "exam" && e.date <= "2017-11-17"));
  assert.equal(isFacultyMeetOpen(state), false);
  assert.match(facultyMeetUnavailableReason(state), /考试|窗口已经过了/);
  assert.equal(isGradeMeetOpen(state), false);
  assert.match(gradeMeetUnavailableReason(state), /考试/);

  const sports = SCHOOL_CALENDAR.find((e) => e.kind === "activity" && e.activityKind === "sports" && e.date.startsWith("2017"));
  assert.ok(sports);
  goOffice(state, sports.date);
  assert.ok(activityEventOn(state.date));
  assert.equal(isFacultyMeetOpen(state), false);
  assert.match(facultyMeetUnavailableReason(state), /活动/);
  assert.equal(isGradeMeetOpen(state), false);
  assert.match(gradeMeetUnavailableReason(state), /活动/);

  goOffice(state, "2017-09-10");
  assert.equal(weekday("2017-09-10"), 0);
  assert.equal(isFacultyMeetOpen(state), false);
  assert.match(facultyMeetUnavailableReason(state), /周日/);
  goOffice(grade, "2017-10-22");
  assert.equal(weekday(grade.date), 0);
  grade.periodId = "rest";
  assert.equal(isGradeMeetOpen(grade), false);
  assert.match(gradeMeetUnavailableReason(grade), /周日/);

  const parents = SCHOOL_CALENDAR.find((e) => e.kind === "parents" && e.date.startsWith("2017"));
  assert.ok(parents);
  goOffice(state, parents.date);
  assert.equal(isFacultyMeetOpen(state), false);
  assert.match(facultyMeetUnavailableReason(state), /家长会|周六/);
  goOffice(grade, parents.date);
  assert.equal(isGradeMeetOpen(grade), false);
  assert.match(gradeMeetUnavailableReason(grade), /家长会|周六/);

  goOffice(state, "2017-09-01");
  assert.equal(isFacultyMeetOpen(state), false);
  assert.match(facultyMeetUnavailableReason(state), /开学典礼|报到/);
  goOffice(state, "2018-02-22");
  assert.equal(isFacultyMeetOpen(state), false);
  assert.match(facultyMeetUnavailableReason(state), /开学典礼|报到/);
});

test("处理写入日志和纪要，不改能力、分数、省控，也不占用 consultMentor 当日次数，也不改写质量分析会记录", () => {
  const faculty = firstFacultyOffice();
  const prep = prepareLesson(faculty, { topic: "集合与逻辑用语", depth: 2, homework: "中" });
  assert.equal(prep.ok, true);
  const beforeAbility = abilityMap(faculty);
  const beforePotential = potentialMap(faculty);
  const beforeExams = examTotals(faculty);
  const officialBefore = officialProvincialPack(2017);
  const linesBefore = JSON.stringify(provincialLines(2017));
  const prepBefore = faculty.player.prep;
  const planBefore = faculty.player.lessonPlan && JSON.parse(JSON.stringify(faculty.player.lessonPlan));
  const mentorBefore = faculty.mentorConsultedOn;
  const roleBefore = faculty.player.role;
  const officialFlag = faculty.player.official;

  const fr = handleFacultyMeet(faculty, "askMentor");
  assert.equal(fr.ok, true, fr.reason);
  assert.match(fr.text, /教职工大会/);
  assert.match(fr.text, /任课/);
  assert.match(fr.text, /校领导主持/);
  assert.doesNotMatch(fr.text, /你主持了这次教职工大会|你作为校领导|改任校领导|你是年级主任/);
  assert.equal(fr.rec.role, "任课数学老师");
  assert.equal(fr.rec.hostTitle, FACULTY_HOST_TITLE);
  assert.ok((faculty.log || []).some((l) => l.text === fr.text));
  assert.ok((faculty.facultyMeetings || []).some((m) => m.minutes === fr.minutes));
  assert.equal(ensureFacultyMeetState(faculty).done, true);
  assert.equal(faculty.mentorConsultedOn, mentorBefore);
  assert.equal(faculty.player.prep, prepBefore);
  assert.deepEqual(faculty.player.lessonPlan, planBefore);
  assert.equal(faculty.player.role, roleBefore);
  assert.equal(faculty.player.official, officialFlag);
  assert.deepEqual(abilityMap(faculty), beforeAbility);
  assert.deepEqual(potentialMap(faculty), beforePotential);
  assert.deepEqual(examTotals(faculty), beforeExams);
  assert.deepEqual(officialProvincialPack(2017), officialBefore);
  assert.equal(JSON.stringify(provincialLines(2017)), linesBefore);

  const consult = consultMentor(faculty);
  assert.equal(consult.ok, true, consult.reason);
  assert.equal(faculty.mentorConsultedOn, faculty.date);
  assert.doesNotMatch(consult.reason || consult.text || "", /大会已经占用|请教次数已/);

  const internHost = hostClassMeeting(faculty);
  assert.equal(internHost.ok, false);
  assert.match(internHost.reason || internHost.text || "", /实习|班主任|主持/);

  const grade = toMonthlyOffice();
  const exam = currentGradeMeetExam(grade);
  const qualityBefore = JSON.stringify(grade.qualityMeetings || []);
  const qualityBox = JSON.stringify(grade.qualityMeet || null);
  const gAbility = abilityMap(grade);
  const gPotential = potentialMap(grade);
  const gExams = examTotals(grade);
  const gMentor = grade.mentorConsultedOn;
  const gPrep = grade.player.prep;
  const gRole = grade.player.role;

  const gr = handleGradeMeet(grade, "askMentor");
  assert.equal(gr.ok, true, gr.reason);
  assert.match(gr.text, /年级会/);
  assert.match(gr.text, /赖厚安/);
  assert.match(gr.text, /年级主任/);
  assert.match(gr.text, /虚构|任课/);
  assert.match(gr.minutes, /各科按已公布/);
  assert.doesNotMatch(gr.text, /你主持了这次年级会|你作为年级主任|改任年级主任|你是校领导/);
  assert.doesNotMatch(gr.minutes, /本班数学均分|省控一本|你主持了这次质量分析会/);
  assert.equal(gr.rec.role, "任课数学老师");
  assert.equal(gr.rec.host, GRADE_DIRECTOR_NAME);
  assert.equal(gr.rec.hostTitle, GRADE_DIRECTOR_TITLE);
  assert.ok((grade.log || []).some((l) => l.text === gr.text));
  assert.ok((grade.gradeMeetings || []).some((m) => m.minutes === gr.minutes));
  assert.equal(ensureGradeMeetState(grade).done, true);
  assert.equal(grade.mentorConsultedOn, gMentor);
  assert.equal(grade.player.prep, gPrep);
  assert.equal(grade.player.role, gRole);
  assert.equal(JSON.stringify(grade.qualityMeetings || []), qualityBefore);
  assert.equal(JSON.stringify(grade.qualityMeet || null), qualityBox);
  assert.deepEqual(abilityMap(grade), gAbility);
  assert.deepEqual(potentialMap(grade), gPotential);
  assert.deepEqual(examTotals(grade), gExams);
  assert.deepEqual(officialProvincialPack(2017), officialBefore);
  assert.equal(JSON.stringify(provincialLines(2017)), linesBefore);

  const gConsult = consultMentor(grade);
  assert.equal(gConsult.ok, true, gConsult.reason);
  assert.equal(grade.mentorConsultedOn, grade.date);

  // 同一窗口日仍可另开备课组质量分析会，互不改写。
  if (isQualityMeetOpen(grade)) {
    const qr = handleQualityMeet(grade, "listen");
    assert.equal(qr.ok, true, qr.reason);
    assert.equal(hasQualityMeet(grade, currentQualityMeetExam(grade) || exam), true);
    assert.equal((grade.gradeMeetings || []).some((m) => m.minutes === gr.minutes), true);
    assert.ok((grade.qualityMeetings || []).some((m) => m.minutes === qr.minutes));
  } else {
    assert.match(qualityMeetUnavailableReason(grade) || "", /质量分析会|已经开过|教师节|办公室/);
  }
});

test("文案能区分教职工大会、年级会、备课组质量分析会；玩家不是主持人，也不是年级主任或校领导", () => {
  const faculty = firstFacultyOffice();
  const fa = facultyMeetOptionsFor(faculty);
  for (const o of fa) {
    assert.match(o.text, /教职工大会/);
    assert.doesNotMatch(o.text, /这是宁川中学数学备课组的校内质量分析会|备课组质量分析会已经开过/);
    assert.doesNotMatch(o.text, /你主持|你作为校领导|你作为年级主任|改任年级主任|改任校领导/);
    assert.match(o.text, /不是主持人|不是校领导/);
  }
  const fr = handleFacultyMeet(faculty, "notes");
  assert.equal(fr.ok, true, fr.reason);
  assert.match(fr.text, /教职工大会/);
  assert.doesNotMatch(fr.text, /你主持了/);
  assert.equal(String(faculty.player.role || "").includes("校领导"), false);
  assert.equal(String(faculty.player.role || "").includes("年级主任"), false);

  const grade = toMonthlyOffice();
  const ga = gradeMeetOptionsFor(grade, currentGradeMeetExam(grade));
  for (const o of ga) {
    assert.match(o.text, /年级会/);
    assert.match(o.text, /赖厚安/);
    assert.match(o.text, /虚构/);
    assert.doesNotMatch(o.text, /这是宁川中学数学备课组的校内质量分析会|陈正衡主持会议/);
    assert.doesNotMatch(o.text, /你主持|你作为年级主任|你作为校领导|钟永泰主持/);
    assert.match(o.text, /不是主持人|不是年级主任/);
  }
  const facultySrc = readFileSync(new URL("../js/domain/staffMeet.js", import.meta.url), "utf8");
  assert.match(facultySrc, /赖厚安/);
  assert.match(facultySrc, /虚构/);
  assert.doesNotMatch(facultySrc, /陈正衡主持|钟永泰主持/);
  assert.doesNotMatch(facultySrc, /examAi\.js|requestExamAnalysis|buildExamAnalysisPayload/);
  assert.doesNotMatch(facultySrc, /drawLineChart|drawBarChart|charts\.js/);
});

test("自动推进能越过未参加的大会，不卡死，也不自动代做", () => {
  const state = firstFacultyOffice();
  assert.equal(isFacultyMeetOpen(state), true, facultyMeetUnavailableReason(state));
  const start = state.date;
  state.periodId = "noon";
  const stepped = advanceDay(state);
  assert.ok(stepped);
  assert.equal(state.date, addDays(start, 1));
  assert.equal((state.facultyMeetings || []).length, 0);
  assert.equal(hasFacultyMeet(state, facultyMeetOpeningEvent(start) || termOpeningEvent(start)), false);

  goOffice(state, start);
  assert.equal(isFacultyMeetOpen(state), true, facultyMeetUnavailableReason(state));
  const r = skipToNextStage(state);
  assert.equal(r.ok, true, r.reason);
  assert.ok(state.date > start, `应越过未参加的教职工大会继续推进，当前 ${state.date}`);
  assert.equal((state.facultyMeetings || []).length, 0);

  const grade = toMonthlyOffice();
  assert.equal(isGradeMeetOpen(grade), true, gradeMeetUnavailableReason(grade));
  const gStart = grade.date;
  grade.periodId = "noon";
  const gStep = advanceDay(grade);
  assert.ok(gStep);
  assert.equal(grade.date, addDays(gStart, 1));
  assert.equal((grade.gradeMeetings || []).length, 0);

  goOffice(grade, gStart);
  const gSkip = skipToNextStage(grade);
  assert.equal(gSkip.ok, true, gSkip.reason);
  assert.ok(grade.date > gStart, `应越过未参加的年级会继续推进，当前 ${grade.date}`);
  assert.equal((grade.gradeMeetings || []).length, 0);

  skipUntil(grade, (s) => s.date >= "2017-11-15", 40);
  assert.ok(grade.date >= "2017-11-15", `应能推进到期中，当前 ${grade.date}`);
  assert.equal((grade.gradeMeetings || []).length, 0);
  assert.equal((state.facultyMeetings || []).length, 0);
});

test("存档往返后纪要仍在", () => {
  const a = firstFacultyOffice();
  const fr = handleFacultyMeet(a, "notes");
  assert.equal(fr.ok, true, fr.reason);
  const b = fromJSON(toJSON(a));
  assert.equal(b.date, a.date);
  assert.equal(b.facultyMeet.done, true);
  assert.equal(b.facultyMeet.lastAction, "notes");
  assert.equal(b.facultyMeetings[0].minutes, a.facultyMeetings[0].minutes);
  assert.equal(b.facultyMeetings[0].kindName, "教职工大会");
  assert.equal(hasFacultyMeet(b, facultyMeetOpeningEvent(b.date)), true);
  const again = handleFacultyMeet(b, "listen");
  assert.equal(again.ok, false);

  const g = toMonthlyOffice();
  const gr = handleGradeMeet(g, "notes");
  assert.equal(gr.ok, true, gr.reason);
  const h = fromJSON(toJSON(g));
  assert.equal(h.date, g.date);
  assert.equal(h.gradeMeet.done, true);
  assert.equal(h.gradeMeet.lastAction, "notes");
  assert.equal(h.gradeMeetings[0].minutes, g.gradeMeetings[0].minutes);
  assert.equal(h.gradeMeetings[0].examKind, "monthly");
  assert.equal(h.gradeMeetings[0].host, GRADE_DIRECTOR_NAME);
  assert.equal(hasGradeMeet(h, currentGradeMeetExam(h)), true);
  const gAgain = handleGradeMeet(h, "listen");
  assert.equal(gAgain.ok, false);
});

test("办公室/日常教学在窗口有入口，非窗口日不常驻空面板，教室正课不插入；寒暑假不要硬凑", () => {
  const state = createGame(20170901);
  goOffice(state, "2018-01-26");
  assert.equal(isStaffMeetNoClassDate("2018-01-26"), true);
  assert.equal(isFacultyMeetOpen(state), false);
  assert.match(facultyMeetUnavailableReason(state), /寒暑假|没有正常上课|硬凑|窗口已经过了/);

  goOffice(state, "2018-07-13");
  assert.equal(isStaffMeetNoClassDate("2018-07-13"), true);
  assert.equal(isFacultyMeetOpen(state), false);

  const src = readFileSync(new URL("../js/ui/app.js", import.meta.url), "utf8");
  assert.match(src, /function facultyMeetPanelHtml\s*\(/);
  assert.match(src, /function gradeMeetPanelHtml\s*\(/);
  assert.match(src, /教职工大会/);
  assert.match(src, /年级会/);
  assert.match(src, /data-faculty-meet/);
  assert.match(src, /data-grade-meet/);
  assert.match(src, /handleFacultyMeet/);
  assert.match(src, /handleGradeMeet/);
  const officeFn = src.slice(src.indexOf("function officeCollabHtml"), src.indexOf("function bindOfficeActions"));
  assert.match(officeFn, /facultyMeetPanelHtml/);
  assert.match(officeFn, /gradeMeetPanelHtml/);
  const teachFn = src.slice(src.indexOf("function viewTeach"), src.indexOf("function viewPlacement"));
  assert.match(teachFn, /officeCollabHtml\(\)/);
  const logFn = src.slice(src.indexOf("function viewLog"), src.indexOf("function viewSave"));
  assert.match(logFn, /教职工大会纪要|facultyMeetings/);
  assert.match(logFn, /年级会纪要|gradeMeetings/);
  const classFn = src.slice(src.indexOf("function viewClassroom"), src.indexOf("function viewRoster"));
  assert.doesNotMatch(classFn, /facultyMeetPanelHtml/);
  assert.doesNotMatch(classFn, /gradeMeetPanelHtml/);

  // 两会与已有办公室事项在同一坐班日各自判断，标题必须能区分。
  const sameDay = firstFacultyOffice();
  assert.equal(isFacultyMeetOpen(sameDay), true);
  assert.ok(typeof isDutyWeekOpen === "function");
  assert.ok(typeof isGroupPrepOpen === "function");
  assert.ok(typeof isOpeningDayOpen === "function");
  const calSrc = readFileSync(new URL("../js/domain/calendar.js", import.meta.url), "utf8");
  assert.doesNotMatch(calSrc, /facultyMeet|gradeMeet|教职工大会|staffMeet/);
});
});
