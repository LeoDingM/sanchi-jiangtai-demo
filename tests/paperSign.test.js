import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createGame, playerStudents, prepareLesson, teach, skipToNextStage, skipUntil,
  handlePaperSign, suggestPaperSignIssue, suggestPaperSignRegister, suggestPaperSignInform,
  paperSignOptionsFor, composePaperSignBrief, composePaperSignMinutes,
  isPaperSignOpen, isPaperSignWindow, paperSignUnavailableReason, currentPaperSignExam,
  ensurePaperSignState, hasIssued, hasReturned, settledPaperSignExams, paperSignPublishDate,
  isPaperSignTimeSlot, isPaperSignExamKind, paperSignProgress, currentSlot, majorEventOn,
  hostClassMeeting, studentRecentStatus, daySchedule,
  PAPER_SIGN_DAY_CAP, PAPER_SIGN_BATCH_MIN, PAPER_SIGN_BATCH_MAX, PAPER_SIGN_ACTIONS,
  PAPER_SIGN_SOURCE_NOTE,
  advanceDay, listExamReports,
} from "../js/domain/simulation.js";
import { toJSON, fromJSON } from "../js/domain/save.js";
import { addDays, SCHOOL_CALENDAR, weekday } from "../js/domain/calendar.js";
import { activityEventOn } from "../js/domain/timetable.js";
import { officialProvincialPack, provincialLines } from "../js/domain/jiangxi.js";
import { isOpeningDayPlayDate } from "../js/domain/openingDay.js";
import { leaveCovering, isDutyDay } from "../js/domain/health.js";

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

function commentSnap(state) {
  const out = {};
  for (const s of playerStudents(state)) {
    out[s.id] = {
      last: s.lastTermComment ? { ...s.lastTermComment } : null,
      recs: (s.termComments || []).map((r) => ({ ...r })),
    };
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
  const pub = paperSignPublishDate(exam);
  let d = pub;
  for (let i = 0; i < 14; i++) {
    const wd = weekday(d);
    const major = majorEventOn(d);
    const activity = activityEventOn(d);
    if (wd >= 1 && wd <= 5 && !major && !activity && !isOpeningDayPlayDate(d)) {
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
  const exam = currentPaperSignExam(goOffice(state, "2017-10-18"))
    || settledPaperSignExams(state).find((e) => e.examKind === "monthly");
  assert.ok(exam, "应已结算第一次月考");
  afterPublishOffice(state, exam);
  return state;
}

function toMidtermOffice(seed = 20170901) {
  const state = createGame(seed);
  settleUntil(state, "2017-11-15", "midterm");
  const exam = currentPaperSignExam(goOffice(state, "2017-11-20"))
    || settledPaperSignExams(state).find((e) => e.examKind === "midterm");
  assert.ok(exam, "应已结算期中");
  afterPublishOffice(state, exam);
  return state;
}

function findStudyHallSlot(state) {
  const slots = daySchedule(state.date, state) || [];
  return slots.find((s) => s.subject === "自习" && !s.isMath && !s.isTutoring) || null;
}

test("同一 seed + 日期 + 对应考试，建议发放名单确定可复现", () => {
  const a = toMonthlyOffice(20170901);
  const b = toMonthlyOffice(20170901);
  assert.equal(isPaperSignOpen(a), true, paperSignUnavailableReason(a));
  assert.equal(isPaperSignOpen(b), true, paperSignUnavailableReason(b));
  const sa = suggestPaperSignIssue(a);
  const sb = suggestPaperSignIssue(b);
  assert.ok(sa.length >= 1 && sa.length <= PAPER_SIGN_BATCH_MAX, `建议人数应为剩余或 ${PAPER_SIGN_BATCH_MIN}–${PAPER_SIGN_BATCH_MAX} 人，实际 ${sa.length}`);
  assert.ok(sa.length >= Math.min(PAPER_SIGN_BATCH_MIN, playerStudents(a).length));
  assert.deepEqual(
    sa.map((v) => ({ id: v.studentId, name: v.name, reason: v.reason, onLeave: v.onLeave })),
    sb.map((v) => ({ id: v.studentId, name: v.name, reason: v.reason, onLeave: v.onLeave })),
  );
  assert.ok(sa.every((v) => v.onLeave === false));
  const optsA = paperSignOptionsFor(a);
  const optsB = paperSignOptionsFor(b);
  assert.deepEqual(optsA.map((o) => ({ id: o.id, ids: o.studentIds })), optsB.map((o) => ({ id: o.id, ids: o.studentIds })));
  assert.ok(optsA.some((o) => o.id === "issue"));
  assert.equal(optsA.some((o) => o.id === "register"), false, "尚未发放时不应出现交回登记");
  const exam = currentPaperSignExam(a);
  assert.equal(exam.examKind, "monthly");
  const brief = composePaperSignBrief(a, exam);
  assert.ok(brief.shortPoints.includes(exam.examName));
  assert.match(brief.shortPoints, /不必|不强求|一批/);
  assert.deepEqual(suggestPaperSignIssue(goOffice(a, a.date)).map((v) => v.studentId), sa.map((v) => v.studentId));
});

test("仅在月考/期中/期末/模拟成绩公布后的办公室坐班可开；联考/会考/高考后不可当作签字场次；数学正课、辅导、晚自习、自习看班、考试日、活动日、周日、家长会当天、开学典礼或报到可玩日不可开", () => {
  assert.equal(isPaperSignExamKind("monthly"), true);
  assert.equal(isPaperSignExamKind("midterm"), true);
  assert.equal(isPaperSignExamKind("final"), true);
  assert.equal(isPaperSignExamKind("mock1"), true);
  assert.equal(isPaperSignExamKind("mock2"), true);
  assert.equal(isPaperSignExamKind("mock3"), true);
  assert.equal(isPaperSignExamKind("city"), false);
  assert.equal(isPaperSignExamKind("province"), false);
  assert.equal(isPaperSignExamKind("huikao"), false);
  assert.equal(isPaperSignExamKind("gaokao"), false);

  const early = createGame(20170901);
  goOffice(early, "2017-09-01");
  assert.equal(isOpeningDayPlayDate("2017-09-01"), true);
  assert.equal(isPaperSignOpen(early), false);
  assert.match(paperSignUnavailableReason(early), /开学典礼或报到|月考、期中、期末或模拟|联考、会考/);

  goOffice(early, "2017-09-04");
  assert.equal(isPaperSignOpen(early), false);
  assert.match(paperSignUnavailableReason(early), /月考、期中、期末或模拟|联考、会考/);

  const state = toMonthlyOffice();
  assert.equal(isPaperSignOpen(state), true, paperSignUnavailableReason(state));
  assert.equal(isPaperSignWindow(state), true);
  assert.equal(currentPaperSignExam(state).examKind, "monthly");
  assert.equal(isPaperSignTimeSlot(currentSlot(state), state.date), true);

  const writeDate = state.date;
  const mathSlot = (daySchedule(state.date, state) || []).find((s) => s.isMath && !s.isTutoring);
  assert.ok(mathSlot, "窗口日应有一节数学正课可用于核对");
  state.periodId = mathSlot.id;
  assert.equal(currentSlot(state).isMath, true);
  assert.equal(isPaperSignOpen(state), false);
  assert.match(paperSignUnavailableReason(state), /数学正课/);
  assert.equal(isPaperSignWindow(state), false);

  goOffice(state, writeDate);
  state.periodId = "evening-1";
  assert.ok(currentSlot(state)?.id === "evening-1" || /晚/.test(currentSlot(state)?.name || currentSlot(state)?.subject || ""));
  assert.equal(isPaperSignOpen(state), false);
  assert.match(paperSignUnavailableReason(state), /辅导时段|晚自习|办公室坐班/);
  assert.equal(isPaperSignWindow(state), false);

  state.periodId = "evening-2";
  assert.equal(isPaperSignOpen(state), false);
  assert.match(paperSignUnavailableReason(state), /晚自习|辅导时段|办公室坐班/);

  // 周一晚自习一是数学晚自习，明确按辅导时段拦住
  goOffice(state, "2017-10-23");
  state.periodId = "evening-1";
  assert.equal(currentSlot(state).isTutoring, true);
  assert.equal(isPaperSignOpen(state), false);
  assert.match(paperSignUnavailableReason(state), /辅导时段|晚自习/);

  goOffice(state, writeDate);
  state.periodId = "noon";
  assert.equal(isPaperSignOpen(state), false);
  assert.match(paperSignUnavailableReason(state), /办公室坐班/);

  goOffice(state, writeDate);
  const study = findStudyHallSlot(state);
  if (study) {
    state.periodId = study.id;
    assert.equal(isPaperSignOpen(state), false);
    assert.match(paperSignUnavailableReason(state), /自习看班|办公室坐班/);
    assert.equal(isPaperSignWindow(state), false);
  }

  goOffice(state, "2017-10-16");
  assert.ok(majorEventOn("2017-10-16"));
  assert.equal(isPaperSignOpen(state), false);
  assert.match(paperSignUnavailableReason(state), /考试/);

  goOffice(state, "2017-10-17");
  assert.equal(isPaperSignOpen(state), false);
  assert.match(paperSignUnavailableReason(state), /考试|公布/);

  const sports = SCHOOL_CALENDAR.find((e) => e.kind === "activity" && e.activityKind === "sports" && e.date.startsWith("2017"));
  assert.ok(sports);
  goOffice(state, sports.date);
  assert.ok(activityEventOn(state.date));
  assert.equal(isPaperSignOpen(state), false);
  assert.match(paperSignUnavailableReason(state), /活动|月考、期中、期末或模拟|窗口已经结束/);

  goOffice(state, "2017-10-21");
  assert.equal(weekday(state.date), 6);
  assert.equal(isPaperSignOpen(state), false);
  assert.match(paperSignUnavailableReason(state), /周六/);

  goOffice(state, "2017-10-22");
  assert.equal(weekday(state.date), 0);
  state.periodId = "rest";
  assert.equal(isPaperSignOpen(state), false);
  assert.match(paperSignUnavailableReason(state), /周日/);

  goOffice(early, "2018-02-22");
  assert.equal(isOpeningDayPlayDate("2018-02-22"), true);
  assert.equal(isPaperSignOpen(early), false);
  assert.match(paperSignUnavailableReason(early), /开学典礼或报到|月考、期中、期末或模拟|窗口已经结束/);

  const mid = toMidtermOffice();
  assert.equal(isPaperSignOpen(mid), true, paperSignUnavailableReason(mid));
  assert.equal(currentPaperSignExam(mid).examKind, "midterm");
  const parents = SCHOOL_CALENDAR.find((e) => e.kind === "parents" && e.date.startsWith("2017"));
  assert.ok(parents);
  goOffice(mid, parents.date);
  assert.equal(isPaperSignOpen(mid), false);
  assert.match(paperSignUnavailableReason(mid), /家长会/);

  // 联考本身不能当作签字场次
  const joint = createGame(20170901);
  skipUntil(joint, (s) => s.date === "2018-04-18" && listExamReports(s, { entryYear: 2017 }).some((r) => r.examKind === "city"), 40);
  goOffice(joint, "2018-04-20");
  assert.ok(listExamReports(joint, { entryYear: 2017 }).some((r) => r.examKind === "city"));
  const jointExam = currentPaperSignExam(joint);
  assert.notEqual(jointExam?.examKind, "city");
  assert.ok(!jointExam || ["monthly", "midterm", "final", "mock1", "mock2", "mock3"].includes(jointExam.examKind));

  // 会考、高考不能当作签字场次
  const later = createGame(20170901);
  skipUntil(later, (s) => listExamReports(s, { entryYear: 2017 }).some((r) => r.examKind === "huikao"), 200);
  const hk = listExamReports(later, { entryYear: 2017 }).find((r) => r.examKind === "huikao");
  if (hk) {
    afterPublishOffice(later, hk);
    const cur = currentPaperSignExam(later);
    assert.notEqual(cur?.examKind, "huikao");
    assert.ok(!cur || isPaperSignExamKind(cur.examKind));
  }
  skipUntil(later, (s) => listExamReports(s, { entryYear: 2017 }).some((r) => r.examKind === "gaokao"), 200);
  const gk = listExamReports(later, { entryYear: 2017 }).find((r) => r.examKind === "gaokao");
  if (gk) {
    goOffice(later, addDays(gk.date, 2));
    const cur = currentPaperSignExam(later);
    assert.notEqual(cur?.examKind, "gaokao");
    if (!cur) {
      assert.equal(isPaperSignOpen(later), false);
      assert.match(paperSignUnavailableReason(later), /联考、会考或高考|月考、期中、期末或模拟|窗口已经结束|分班|升学|考试/);
    }
  }

  // 高三一模公布后可以开
  const mock = createGame(20170901);
  skipUntil(mock, (s) => listExamReports(s, { entryYear: 2017 }).some((r) => r.examKind === "mock1"), 400);
  const mockExam = settledPaperSignExams(goOffice(mock, mock.date)).find((e) => e.examKind === "mock1")
    || listExamReports(mock, { entryYear: 2017 }).find((r) => r.examKind === "mock1");
  assert.ok(mockExam, "应已结算高三一模");
  afterPublishOffice(mock, mockExam);
  if (isPaperSignWindow(mock) || isPaperSignOpen(mock)) {
    assert.equal(currentPaperSignExam(mock)?.examKind, "mock1");
    assert.equal(isPaperSignOpen(mock), true, paperSignUnavailableReason(mock));
  } else {
    // 若落到考试日/活动日，再往后找一个可开办公室日
    afterPublishOffice(mock, mockExam);
    assert.equal(currentPaperSignExam(mock)?.examKind, "mock1");
    assert.equal(isPaperSignOpen(mock), true, paperSignUnavailableReason(mock));
  }
});

test("同一场考试每位学生最多发放一次、交回登记一次；每天一批人数有上限；请假不在校的不写入当面发放名单", () => {
  const state = toMonthlyOffice();
  const exam = currentPaperSignExam(state);
  const list = suggestPaperSignIssue(state);
  assert.ok(list.length >= 1);
  assert.ok(list.length <= PAPER_SIGN_BATCH_MAX);
  const r = handlePaperSign(state, "issue");
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.list.length, list.length);
  const firstId = list[0].studentId;
  const stu = playerStudents(state).find((s) => s.id === firstId);
  assert.equal(hasIssued(stu, exam), true);
  assert.equal(hasReturned(stu, exam), false);
  const again = handlePaperSign(state, "issue");
  assert.equal(again.ok, false);
  assert.match(again.reason, /每天最多一批|已经办理过一批/);
  assert.equal(ensurePaperSignState(state).todayAction, "issue");
  assert.equal(isPaperSignOpen(state), false);
  assert.equal(isPaperSignWindow(state), true, "今日办完后窗口日仍可查阅进度，不常驻到非窗口日");

  // 第二天可登记交回，不能对同一人再发放
  let d = addDays(state.date, 1);
  for (let i = 0; i < 8; i++) {
    const wd = weekday(d);
    if (wd >= 1 && wd <= 5 && !majorEventOn(d) && !activityEventOn(d) && !isOpeningDayPlayDate(d)) break;
    d = addDays(d, 1);
  }
  goOffice(state, d);
  assert.equal(isPaperSignOpen(state), true, paperSignUnavailableReason(state));
  const issuedAgain = suggestPaperSignIssue(state);
  assert.ok(!issuedAgain.some((v) => list.some((x) => x.studentId === v.studentId)), "已发放的人不应再出现在发放名单");
  const regList = suggestPaperSignRegister(state);
  assert.ok(regList.length >= 1);
  assert.ok(regList.every((v) => list.some((x) => x.studentId === v.studentId)));
  const reg = handlePaperSign(state, "register");
  assert.equal(reg.ok, true, reg.reason);
  assert.equal(hasReturned(playerStudents(state).find((s) => s.id === firstId), exam), true);
  const regAgain = handlePaperSign(state, "register");
  assert.equal(regAgain.ok, false);
  assert.match(regAgain.reason, /每天最多一批|已经办理过一批/);

  // 再下一天，已交回的人不能再登记
  let d2 = addDays(state.date, 1);
  for (let i = 0; i < 8; i++) {
    const wd = weekday(d2);
    if (wd >= 1 && wd <= 5 && !majorEventOn(d2) && !activityEventOn(d2) && !isOpeningDayPlayDate(d2)) break;
    d2 = addDays(d2, 1);
  }
  goOffice(state, d2);
  const regLeft = suggestPaperSignRegister(state);
  assert.ok(!regLeft.some((v) => v.studentId === firstId));

  // 请假不在校的不写入当面发放名单（按确定性假条查找自然请假日）
  const leaveState = toMonthlyOffice();
  let foundLeave = false;
  let issuedOnLeaveDay = null;
  let scan = leaveState.date;
  for (let i = 0; i < 20; i++) {
    goOffice(leaveState, scan);
    if (isPaperSignWindow(leaveState)) {
      const away = playerStudents(leaveState).filter((s) => leaveCovering(s, leaveState.date, leaveState.seed));
      const issueList = suggestPaperSignIssue(leaveState);
      if (away.length) {
        foundLeave = true;
        for (const s of away) {
          assert.ok(!issueList.some((v) => v.studentId === s.id), `${s.name} 请假仍出现在发放名单`);
        }
        if (isPaperSignOpen(leaveState) && issueList.length && !issuedOnLeaveDay) {
          issuedOnLeaveDay = handlePaperSign(leaveState, "issue");
          assert.equal(issuedOnLeaveDay.ok, true, issuedOnLeaveDay.reason);
          for (const s of away) {
            assert.ok(!issuedOnLeaveDay.list.some((v) => v.studentId === s.id));
            assert.equal(issuedOnLeaveDay.minutes.includes(s.name), false, `${s.name} 不应写入发放纪要`);
          }
          assert.match(issuedOnLeaveDay.minutes, /请假不在校/);
        }
      }
    }
    scan = addDays(scan, 1);
    if (scan >= "2017-11-15") break;
  }
  assert.equal(typeof leaveCovering, "function");
  assert.equal(typeof isDutyDay, "function");
  assert.ok(foundLeave, "月考窗口内应能找到请假不在校的学生，以便核对发放名单");

  // 每天一批人数上限：一次不会发完全班
  const cap = toMonthlyOffice();
  const all = playerStudents(cap);
  assert.ok(all.length > PAPER_SIGN_BATCH_MAX);
  const one = handlePaperSign(cap, "issue");
  assert.equal(one.ok, true, one.reason);
  assert.ok(one.list.length <= PAPER_SIGN_BATCH_MAX);
  assert.ok(one.list.length >= Math.min(PAPER_SIGN_BATCH_MIN, all.length));
  const issuedCount = all.filter((s) => hasIssued(s, currentPaperSignExam(cap))).length;
  assert.equal(issuedCount, one.list.length);
  assert.ok(issuedCount < all.length, "不要一次把全班都点完");
});

test("处理写入日志和档案近况，不改能力、分数、省控，也不改写学期评语或考试分数；文案区分任课老师试卷签字与班主任正式成绩单、家长会、家访", () => {
  const state = toMonthlyOffice();
  const exam = currentPaperSignExam(state);
  const beforeAbility = abilityMap(state);
  const beforePotential = potentialMap(state);
  const beforeExams = examTotals(state);
  const beforeComments = commentSnap(state);
  const officialBefore = officialProvincialPack(2017);
  const linesBefore = JSON.stringify(provincialLines(2017));
  const prepBefore = state.player.prep;
  const mathTeachBefore = Number(state.player.mathTeaching || 0);
  const relBefore = Object.fromEntries(playerStudents(state).map((s) => [s.id, s.relation || 0]));
  const issue = handlePaperSign(state, "issue");
  assert.equal(issue.ok, true, issue.reason);
  assert.ok(issue.text.includes("数学") || issue.minutes.includes("数学"));
  assert.ok(issue.text.includes("不是班主任发放") || issue.text.includes("正式成绩单"));
  assert.match(issue.text, /正式成绩单|通知书|操行评语/);
  assert.match(issue.text, /家长会|家访/);
  assert.ok(issue.text.includes("不是再写一遍数学学期评语") || PAPER_SIGN_SOURCE_NOTE.includes("不是再写一遍数学学期评语"));
  assert.ok(issue.text.includes("宁川中学") || PAPER_SIGN_SOURCE_NOTE.includes("宁川中学") || issue.text.includes("任课"));
  assert.doesNotMatch(issue.text, /你已经是班主任|你主持班会|改任班主任/);
  assert.match(issue.text, /不是电话家访|也不是电话家访或上门家访/);
  assert.match(issue.text, /上门家访|也不是家访/);
  assert.equal(state.player.role.includes("班主任"), false);
  assert.ok((state.log || []).some((l) => l.text === issue.text || (l.text || "").includes("试卷")));
  const pick = playerStudents(state).find((s) => s.id === issue.list[0].studentId);
  assert.ok(pick.lastPaperSign);
  assert.equal(pick.lastPaperSign.status, "issued");
  assert.match(pick.lastPaperSign.statusLine, /尚未交回|请家长签字/);
  const status = studentRecentStatus(pick, state);
  assert.match(status, /试卷签字|请家长签字|尚未交回/);
  assert.deepEqual(abilityMap(state), beforeAbility);
  assert.deepEqual(potentialMap(state), beforePotential);
  assert.deepEqual(examTotals(state), beforeExams);
  assert.deepEqual(commentSnap(state), beforeComments);
  assert.deepEqual(officialProvincialPack(2017), officialBefore);
  assert.equal(JSON.stringify(provincialLines(2017)), linesBefore);
  assert.equal(state.player.prep, prepBefore);
  assert.equal(Number(state.player.mathTeaching || 0), mathTeachBefore);
  assert.deepEqual(Object.fromEntries(playerStudents(state).map((s) => [s.id, s.relation || 0])), relBefore);

  let d = addDays(state.date, 1);
  for (let i = 0; i < 8; i++) {
    if (weekday(d) >= 1 && weekday(d) <= 5 && !majorEventOn(d) && !activityEventOn(d)) break;
    d = addDays(d, 1);
  }
  goOffice(state, d);
  const inform = handlePaperSign(state, "inform");
  assert.equal(inform.ok, true, inform.reason);
  assert.match(inform.text, /赵映秋|班主任/);
  assert.match(inform.text, /没有代替班主任发放正式成绩单|不代替班主任|没有改写成一次电话家访/);
  assert.doesNotMatch(inform.text, /你给.*家里打了电话|上门拜访/);
  assert.equal(hasReturned(playerStudents(state).find((s) => s.id === issue.list[0].studentId), exam), false);

  const internHost = hostClassMeeting(state);
  assert.equal(internHost.ok, false);
  assert.match(internHost.reason || internHost.text || "", /实习|班主任|主持/);

  // 选项文案三类都在
  assert.deepEqual(PAPER_SIGN_ACTIONS.map((a) => a.id), ["issue", "register", "inform"]);
});

test("存档往返后记录仍在", () => {
  const a = toMonthlyOffice();
  const r = handlePaperSign(a, "issue");
  assert.equal(r.ok, true, r.reason);
  const b = fromJSON(toJSON(a));
  assert.equal(b.date, a.date);
  assert.equal(b.paperSign.todayAction, "issue");
  assert.equal(b.paperSigns[0].minutes, a.paperSigns[0].minutes);
  assert.equal(b.paperSigns[0].examKind, "monthly");
  const stuA = playerStudents(a).find((s) => s.id === r.list[0].studentId);
  const stuB = playerStudents(b).find((s) => s.id === r.list[0].studentId);
  assert.equal(stuB.lastPaperSign.status, "issued");
  assert.equal(stuB.lastPaperSign.text, stuA.lastPaperSign.text);
  assert.ok((stuB.paperSigns || []).some((x) => x.status === "issued"));
  const again = handlePaperSign(b, "issue");
  assert.equal(again.ok, false);

  let d = addDays(b.date, 1);
  for (let i = 0; i < 8; i++) {
    if (weekday(d) >= 1 && weekday(d) <= 5 && !majorEventOn(d) && !activityEventOn(d)) break;
    d = addDays(d, 1);
  }
  goOffice(b, d);
  const reg = handlePaperSign(b, "register");
  assert.equal(reg.ok, true, reg.reason);
  const c = fromJSON(toJSON(b));
  const stuC = playerStudents(c).find((s) => s.id === r.list[0].studentId);
  assert.equal(hasReturned(stuC, currentPaperSignExam(c)), true);
  assert.equal(c.paperSigns[0].actionId, "register");
});

test("自动推进能越过未办理的签字，不卡死，也不自动代做", () => {
  const state = toMonthlyOffice();
  assert.equal(isPaperSignOpen(state), true, paperSignUnavailableReason(state));
  const remaining = playerStudents(state).filter((s) => !hasIssued(s, currentPaperSignExam(state)));
  assert.ok(remaining.length > PAPER_SIGN_BATCH_MAX, "本班不应一天办完");
  const startDate = state.date;
  const issuedBefore = remaining.length;
  const r = skipToNextStage(state);
  assert.equal(r.ok, true, r.reason);
  assert.ok(state.date > startDate, `应越过签字可办日继续推进，当前 ${state.date}`);
  const still = playerStudents(state).filter((s) => !hasIssued(s, settledPaperSignExams(state).find((e) => e.examKind === "monthly") || currentPaperSignExam(state) || { examId: "x", date: "2017-10-16" }));
  // 不应自动代做发放
  const autoIssued = (state.paperSigns || []).filter((x) => x.actionId === "issue" && x.date === startDate);
  assert.equal(autoIssued.length, 0, "自动推进不应代做试卷签字");
  assert.ok(majorEventOn(state.date) || (state.exams && Object.keys(state.exams).length), "应落到后续校历事件或已结算考试");

  const mid = toMonthlyOffice();
  skipUntil(mid, (s) => s.date >= "2017-11-15", 40);
  assert.ok(mid.date >= "2017-11-15", `应能推进到期中，当前 ${mid.date}`);
  const monthly = settledPaperSignExams(mid).find((e) => e.examKind === "monthly" && String(e.date).startsWith("2017-10"));
  if (monthly) {
    const issuedAfterSkip = playerStudents(mid).filter((s) => hasIssued(s, monthly));
    assert.equal(issuedAfterSkip.length, 0, "越过窗口时不应自动发放");
  }

  const day = toMonthlyOffice();
  const start = day.date;
  day.periodId = "noon";
  const stepped = advanceDay(day);
  assert.ok(stepped);
  assert.equal(day.date, addDays(start, 1));
});

test("办公室/日常教学在窗口有入口，非窗口日不常驻空面板，教室正课不插入", () => {
  const src = readFileSync(new URL("../js/ui/app.js", import.meta.url), "utf8");
  assert.match(src, /function paperSignPanelHtml\s*\(/);
  assert.match(src, /试卷签字/);
  assert.match(src, /data-paper-sign/);
  assert.match(src, /handlePaperSign/);
  assert.match(src, /isPaperSignWindow\(state\)/);
  const panelFn = src.slice(src.indexOf("function paperSignPanelHtml"), src.indexOf("function bindPaperSignActions"));
  assert.match(panelFn, /isPaperSignWindow\(state\)/);
  assert.match(panelFn, /return ""/);
  const officeFn = src.slice(src.indexOf("function officeCollabHtml"), src.indexOf("function bindOfficeActions"));
  assert.match(officeFn, /paperSignPanelHtml/);
  const teachFn = src.slice(src.indexOf("function viewTeach"), src.indexOf("function viewPlacement"));
  assert.match(teachFn, /officeCollabHtml\(\)/);
  const logFn = src.slice(src.indexOf("function viewLog"), src.indexOf("function viewSave"));
  assert.match(logFn, /试卷签字纪要|paperSigns/);
  const classFn = src.slice(src.indexOf("function viewClassroom"), src.indexOf("function viewRoster"));
  assert.doesNotMatch(classFn, /paperSignPanelHtml/);
  assert.match(src, /paperSigns|试卷签字/);

  const calSrc = readFileSync(new URL("../js/domain/calendar.js", import.meta.url), "utf8");
  assert.doesNotMatch(calSrc, /paperSign|试卷签字/);
  const commentsSrc = readFileSync(new URL("../js/domain/comments.js", import.meta.url), "utf8");
  assert.doesNotMatch(commentsSrc, /paperSign|试卷签字请家长/);
  const parentsSrc = readFileSync(new URL("../js/domain/parents.js", import.meta.url), "utf8");
  assert.doesNotMatch(parentsSrc, /paperSign/);
  const homeSrc = readFileSync(new URL("../js/domain/homeVisit.js", import.meta.url), "utf8");
  assert.doesNotMatch(homeSrc, /paperSign/);
});
