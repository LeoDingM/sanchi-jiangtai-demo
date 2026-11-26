import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createGame, playerStudents, prepareLesson, teach, skipToNextStage, skipUntil,
  handleTermComment, suggestTermComments, composeTermComment, commentOptionsFor,
  isCommentOpen, isCommentWindow, commentUnavailableReason, currentCommentExam,
  ensureCommentState, hasTermComment, settledCommentExams, commentPublishDate,
  isCommentTimeSlot, currentSlot, majorEventOn, hostClassMeeting,
  COMMENT_DAY_CAP, COMMENT_BATCH_MIN, COMMENT_BATCH_MAX, COMMENT_TONES, COMMENT_SOURCE_NOTE,
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
  const pub = commentPublishDate(exam);
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

function toMidtermOffice(seed = 20170901) {
  const state = createGame(seed);
  settleUntil(state, "2017-11-15", "midterm");
  const exam = currentCommentExam(goOffice(state, "2017-11-20")) || settledCommentExams(state).find((e) => e.examKind === "midterm");
  assert.ok(exam, "应已结算期中");
  afterPublishOffice(state, exam);
  return state;
}

test("同一 seed + 学生 + 对应考试，建议评语确定可复现", () => {
  const a = toMidtermOffice(20170901);
  const b = toMidtermOffice(20170901);
  assert.equal(isCommentOpen(a), true, commentUnavailableReason(a));
  assert.equal(isCommentOpen(b), true, commentUnavailableReason(b));
  const sa = suggestTermComments(a);
  const sb = suggestTermComments(b);
  assert.ok(sa.length >= 1 && sa.length <= COMMENT_BATCH_MAX, `建议人数应为剩余或 ${COMMENT_BATCH_MIN}–${COMMENT_BATCH_MAX} 人，实际 ${sa.length}`);
  assert.ok(sa.length >= Math.min(COMMENT_BATCH_MIN, playerStudents(a).length));
  assert.deepEqual(
    sa.map((v) => ({ id: v.studentId, reason: v.reason, options: v.options.map((o) => ({ id: o.id, text: o.text })) })),
    sb.map((v) => ({ id: v.studentId, reason: v.reason, options: v.options.map((o) => ({ id: o.id, text: o.text })) })),
  );
  const exam = currentCommentExam(a);
  const stu = playerStudents(a).find((s) => s.id === sa[0].studentId);
  const tones = commentOptionsFor(a, stu, exam);
  assert.equal(tones.length, 3);
  assert.deepEqual(tones.map((t) => t.id), COMMENT_TONES.map((t) => t.id));
  for (const t of tones) {
    assert.equal(composeTermComment(a, stu, exam, t.id), t.text);
    assert.equal(composeTermComment(b, playerStudents(b).find((s) => s.id === stu.id), currentCommentExam(b), t.id), t.text);
    assert.ok(t.text.includes("数学"));
    assert.match(t.text, /学期|学段/);
    assert.ok(t.text.includes("不是班主任操行评语"));
    assert.ok(t.text.includes("不是考后 AI 分析") || t.text.includes("考后 AI"));
    assert.ok(t.text.includes("宁川中学") || COMMENT_SOURCE_NOTE.includes("宁川中学"));
  }
  assert.deepEqual(suggestTermComments(goOffice(a, a.date)).map((v) => v.studentId), sa.map((v) => v.studentId));
});

test("仅期中/期末成绩公布后的办公室坐班可写；数学正课、考试日、活动日、周日、家长会当天、月考/联考/会考/模拟/高考后不可当作学期评语来写", () => {
  const early = createGame(20170901);
  goOffice(early, "2017-09-04");
  assert.equal(isCommentOpen(early), false);
  assert.match(commentUnavailableReason(early), /期中或期末|月考、联考/);

  settleUntil(early, "2017-10-16", "monthly");
  afterPublishOffice(early, { date: "2017-10-16", examId: listExamReports(early, { entryYear: 2017 }).find((r) => r.examKind === "monthly")?.examId, examKind: "monthly" });
  // 月考成绩公布后仍不可当作学期评语来写
  const monthlyOffice = "2017-10-18";
  goOffice(early, monthlyOffice);
  assert.ok(listExamReports(early, { entryYear: 2017 }).some((r) => r.examKind === "monthly"));
  assert.equal(isCommentOpen(early), false, "月考后不应开放学期评语");
  assert.match(commentUnavailableReason(early), /期中或期末|月考、联考/);
  assert.equal(currentCommentExam(early), null);

  const state = toMidtermOffice();
  assert.equal(isCommentOpen(state), true, commentUnavailableReason(state));
  assert.equal(isCommentWindow(state), true);
  assert.equal(currentCommentExam(state).examKind, "midterm");
  assert.equal(isCommentTimeSlot(currentSlot(state), state.date), true);

  const writeDate = state.date;
  state.periodId = "p2";
  const mathSlot = currentSlot(state);
  if (mathSlot?.isMath) {
    assert.equal(isCommentOpen(state), false);
    assert.match(commentUnavailableReason(state), /数学正课/);
  } else {
    // 若当天第二节不是数学，改到周六上午数学课再验。
    goOffice(state, "2017-11-18");
    state.periodId = "p3";
    assert.equal(currentSlot(state).isMath, true);
    assert.equal(isCommentOpen(state), false);
    assert.match(commentUnavailableReason(state), /数学正课/);
  }

  goOffice(state, writeDate);
  state.periodId = "evening-1";
  assert.equal(currentSlot(state).isTutoring, true);
  assert.equal(isCommentOpen(state), false);
  assert.match(commentUnavailableReason(state), /辅导时段|晚自习/);

  state.periodId = "evening-2";
  assert.equal(isCommentOpen(state), false);
  assert.match(commentUnavailableReason(state), /晚自习|辅导时段|办公室坐班/);

  goOffice(state, writeDate);
  state.periodId = "noon";
  assert.equal(isCommentOpen(state), false);
  assert.match(commentUnavailableReason(state), /办公室坐班/);

  goOffice(state, "2017-11-15");
  assert.ok(majorEventOn("2017-11-15"));
  assert.equal(isCommentOpen(state), false);
  assert.match(commentUnavailableReason(state), /考试/);

  goOffice(state, "2017-11-16");
  assert.equal(isCommentOpen(state), false);
  assert.match(commentUnavailableReason(state), /考试|公布/);

  goOffice(state, "2017-11-17");
  assert.equal(isCommentOpen(state), false);
  assert.match(commentUnavailableReason(state), /考试|公布/);

  const sports = SCHOOL_CALENDAR.find((e) => e.kind === "activity" && e.activityKind === "sports" && e.date.startsWith("2017"));
  assert.ok(sports);
  goOffice(state, sports.date);
  assert.ok(activityEventOn(state.date));
  assert.equal(isCommentOpen(state), false);
  assert.match(commentUnavailableReason(state), /活动|期中或期末/);

  const newyear = SCHOOL_CALENDAR.find((e) => e.kind === "activity" && e.activityKind === "newyear" && weekday(e.date) !== 0 && e.date >= "2017-11-18" && e.date <= "2018-01-15")
    || SCHOOL_CALENDAR.find((e) => e.kind === "activity" && e.activityKind === "newyear" && weekday(e.date) !== 0);
  assert.ok(newyear);
  goOffice(state, newyear.date);
  assert.equal(isCommentOpen(state), false);
  assert.match(commentUnavailableReason(state), /活动/);

  goOffice(state, "2017-11-19");
  assert.equal(weekday(state.date), 0);
  state.periodId = "rest";
  assert.equal(isCommentOpen(state), false);
  assert.match(commentUnavailableReason(state), /周日/);

  const parents = SCHOOL_CALENDAR.find((e) => e.kind === "parents" && e.date.startsWith("2017"));
  assert.ok(parents);
  goOffice(state, parents.date);
  assert.equal(isCommentOpen(state), false);
  assert.match(commentUnavailableReason(state), /家长会/);

  // 第二次月考日不可写；月考过后窗口仍对应期中，不能按月考来写。
  goOffice(state, "2017-12-14");
  assert.equal(isCommentOpen(state), false);
  assert.match(commentUnavailableReason(state), /考试/);
  const afterMonthly = createGame(20170901);
  settleUntil(afterMonthly, "2017-12-14", "monthly");
  goOffice(afterMonthly, "2017-12-18");
  assert.ok(listExamReports(afterMonthly, { entryYear: 2017 }).some((r) => r.examKind === "monthly"));
  assert.equal(isCommentOpen(afterMonthly), true, commentUnavailableReason(afterMonthly));
  assert.equal(currentCommentExam(afterMonthly).examKind, "midterm");

  // 联考后不能把联考当作学期评语；此时期中窗口已在分班/开学时关闭，期末尚未公布。
  const joint = createGame(20170901);
  skipUntil(joint, (s) => s.date === "2018-04-18" && listExamReports(s, { entryYear: 2017 }).some((r) => r.examKind === "city"), 40);
  goOffice(joint, "2018-04-20");
  assert.ok(listExamReports(joint, { entryYear: 2017 }).some((r) => r.examKind === "city"));
  const jointExam = currentCommentExam(joint);
  assert.ok(!jointExam || jointExam.examKind === "midterm" || jointExam.examKind === "final");
  assert.notEqual(jointExam?.examKind, "city");
  if (!jointExam) {
    assert.equal(isCommentOpen(joint), false);
    assert.match(commentUnavailableReason(joint), /期中或期末|月考、联考/);
  }

  // 下学期期中公布后可写；模拟、会考、高考本身不能当作学期评语。
  const spring = createGame(20170901);
  skipUntil(spring, (s) => s.date === "2018-04-24" && listExamReports(s, { entryYear: 2017 }).some((r) => r.examKind === "midterm" && String(r.date).startsWith("2018")), 50);
  const springExam = settledCommentExams(spring).find((e) => e.examKind === "midterm" && e.date.startsWith("2018"));
  assert.ok(springExam, "应已结算下学期期中");
  afterPublishOffice(spring, springExam);
  assert.equal(isCommentOpen(spring), true, commentUnavailableReason(spring));
  assert.equal(currentCommentExam(spring).examKind, "midterm");

  const mock = SCHOOL_CALENDAR.find((e) => e.examKind === "mock1" && e.date.startsWith("2018"));
  assert.ok(mock);
  goOffice(spring, mock.date);
  assert.equal(isCommentOpen(spring), false);
  assert.match(commentUnavailableReason(spring), /考试/);
  goOffice(spring, addDays(mock.date, 3));
  if (isCommentOpen(spring)) {
    assert.equal(currentCommentExam(spring).examKind, "midterm");
    assert.notEqual(currentCommentExam(spring).examKind, "mock1");
  }

  const huikao = SCHOOL_CALENDAR.find((e) => e.examKind === "huikao" && e.date.startsWith("2018"));
  const gk = SCHOOL_CALENDAR.find((e) => e.examKind === "gaokao" && e.date.startsWith("2018"));
  assert.ok(huikao && gk);
  goOffice(spring, huikao.date);
  assert.equal(isCommentOpen(spring), false);
  goOffice(spring, gk.date);
  assert.equal(isCommentOpen(spring), false);
  assert.ok(!currentCommentExam(spring) || currentCommentExam(spring).examKind !== "gaokao");
  assert.ok(!currentCommentExam(spring) || currentCommentExam(spring).examKind !== "huikao");
});

test("同一学生同一场考试不能重复写；每天批次上限生效；请假生仍可写", () => {
  const state = toMidtermOffice();
  const exam = currentCommentExam(state);
  const list = suggestTermComments(state);
  assert.ok(list.length >= 1);
  assert.ok(list.length <= COMMENT_DAY_CAP);
  const first = list[0];
  const r = handleTermComment(state, first.studentId, "factual");
  assert.equal(r.ok, true, r.reason);
  const again = handleTermComment(state, first.studentId, "encourage");
  assert.equal(again.ok, false);
  assert.match(again.reason, /已经写过|不能重复/);
  assert.equal(hasTermComment(playerStudents(state).find((s) => s.id === first.studentId), exam), true);

  // 写满当天批次
  const capState = toMidtermOffice();
  for (let i = 0; i < COMMENT_DAY_CAP + 2; i++) {
    const sug = suggestTermComments(capState);
    if (!sug.length) break;
    const rec = handleTermComment(capState, sug[0].studentId, "factual");
    if (i < COMMENT_DAY_CAP) assert.equal(rec.ok, true, rec.reason);
    else {
      assert.equal(rec.ok, false);
      assert.match(commentUnavailableReason(capState), /每天最多一批|已经写过一批/);
      break;
    }
  }
  assert.equal(ensureCommentState(capState).todayCount, COMMENT_DAY_CAP);
  assert.equal(isCommentOpen(capState), false);
  assert.match(commentUnavailableReason(capState), /每天最多一批|已经写过一批/);

  const nextDay = addDays(capState.date, 1);
  goOffice(capState, weekday(nextDay) === 0 ? addDays(nextDay, 1) : nextDay);
  if (majorEventOn(capState.date) || activityEventOn(capState.date)) {
    goOffice(capState, addDays(capState.date, 2));
  }
  if (isCommentOpen(capState)) {
    const nxt = suggestTermComments(capState);
    assert.ok(nxt.length);
    assert.ok(!nxt.some((v) => v.studentId === first.studentId) || !hasTermComment(playerStudents(capState).find((s) => s.id === nxt[0].studentId), currentCommentExam(capState)) === false);
    const more = handleTermComment(capState, nxt[0].studentId, "remind");
    assert.equal(more.ok, true, more.reason);
  }

  const leaveState = toMidtermOffice();
  const cls = playerStudents(leaveState);
  // 建议名单允许包含请假生
  const any = suggestTermComments(leaveState);
  assert.ok(any.length);
  // 即使把某人标成请假，只要在建议名单里仍可写。
  const target = playerStudents(leaveState).find((s) => s.id === any[0].studentId);
  const leaveOk = handleTermComment(leaveState, target.id, "factual");
  assert.equal(leaveOk.ok, true, leaveOk.reason);
});

test("处理写入档案和日志，不改能力、分数或省控；文案区分任课评语与班主任操行评语、考后 AI", () => {
  const state = toMidtermOffice();
  const list = suggestTermComments(state);
  const pick = list[0];
  const beforeAbility = abilityMap(state);
  const beforePotential = potentialMap(state);
  const beforeExams = examTotals(state);
  const officialBefore = officialProvincialPack(2017);
  const linesBefore = JSON.stringify(provincialLines(2017));
  const stu0 = playerStudents(state).find((s) => s.id === pick.studentId);
  const rel0 = stu0.relation || 0;
  const r = handleTermComment(state, pick.studentId, "encourage");
  assert.equal(r.ok, true, r.reason);
  assert.ok(r.text.includes("数学学期评语") || r.text.includes("学段评语"));
  assert.ok(r.text.includes("不是班主任操行评语"));
  assert.ok(r.text.includes("不是考后 AI 分析") || r.text.includes("考后 AI"));
  assert.ok(r.text.includes("宁川中学") || COMMENT_SOURCE_NOTE.includes("宁川中学"));
  assert.ok(r.text.includes(pick.name));
  const stu = playerStudents(state).find((s) => s.id === pick.studentId);
  assert.equal(stu.lastTermComment.examKind, "midterm");
  assert.equal(stu.lastTermComment.tone, "encourage");
  assert.ok((stu.termComments || []).some((x) => x.examId === currentCommentExam(state).examId));
  assert.ok((stu.relation || 0) >= rel0);
  assert.ok((state.log || []).some((l) => l.text === r.text || (l.text || "").includes("数学学期评语")));
  assert.doesNotMatch(r.text, /你已经是班主任|你主持班会|改任班主任/);
  assert.equal(state.player.role.includes("班主任"), false);
  assert.deepEqual(abilityMap(state), beforeAbility);
  assert.deepEqual(potentialMap(state), beforePotential);
  assert.deepEqual(examTotals(state), beforeExams);
  assert.deepEqual(officialProvincialPack(2017), officialBefore);
  assert.equal(JSON.stringify(provincialLines(2017)), linesBefore);

  const internHost = hostClassMeeting(state);
  assert.equal(internHost.ok, false);
  assert.match(internHost.reason || internHost.text || "", /实习|班主任|主持/);
});

test("存档往返后评语仍在", () => {
  const a = toMidtermOffice();
  const list = suggestTermComments(a);
  const r = handleTermComment(a, list[0].studentId, "factual");
  assert.equal(r.ok, true, r.reason);
  const r2 = handleTermComment(a, list[1] ? list[1].studentId : list[0].studentId, "remind");
  if (list[1]) assert.equal(r2.ok, true, r2.reason);
  const b = fromJSON(toJSON(a));
  assert.equal(b.date, a.date);
  assert.equal(b.termComments.todayCount, a.termComments.todayCount);
  const stuA = playerStudents(a).find((s) => s.id === list[0].studentId);
  const stuB = playerStudents(b).find((s) => s.id === list[0].studentId);
  assert.equal(stuB.lastTermComment.tone, "factual");
  assert.equal(stuB.lastTermComment.text, stuA.lastTermComment.text);
  assert.ok((stuB.termComments || []).some((x) => x.tone === "factual"));
  const again = handleTermComment(b, list[0].studentId, "encourage");
  assert.equal(again.ok, false);
});

test("自动推进能越过未写完评语的日子，不卡死", () => {
  const state = toMidtermOffice();
  assert.equal(isCommentOpen(state), true, commentUnavailableReason(state));
  const remaining = playerStudents(state).filter((s) => !hasTermComment(s, currentCommentExam(state)));
  assert.ok(remaining.length > COMMENT_DAY_CAP, "本班不应一天写完");
  const startDate = state.date;
  const r = skipToNextStage(state);
  assert.equal(r.ok, true, r.reason);
  assert.ok(state.date > startDate, `应越过评语可写日继续推进，当前 ${state.date}`);
  assert.ok(majorEventOn(state.date) || (state.exams && Object.keys(state.exams).length), "应落到后续校历事件或已结算考试");

  const mid = toMidtermOffice();
  skipUntil(mid, (s) => s.date >= "2018-01-16", 40);
  assert.ok(mid.date >= "2018-01-16", `应能推进到期末，当前 ${mid.date}`);

  const day = toMidtermOffice();
  const start = day.date;
  day.periodId = "noon";
  const stepped = advanceDay(day);
  assert.ok(stepped);
  assert.equal(day.date, addDays(start, 1));
});

test("办公室和日常教学界面有数学学期评语入口，档案能看到记录", () => {
  const src = readFileSync(new URL("../js/ui/app.js", import.meta.url), "utf8");
  assert.match(src, /function commentPanelHtml\s*\(/);
  assert.match(src, /数学学期评语/);
  assert.match(src, /data-term-comment/);
  assert.match(src, /data-comment-tone/);
  assert.match(src, /handleTermComment/);
  const officeFn = src.slice(src.indexOf("function officeCollabHtml"), src.indexOf("function bindOfficeActions"));
  assert.match(officeFn, /commentPanelHtml/);
  const teachFn = src.slice(src.indexOf("function viewTeach"), src.indexOf("function viewPlacement"));
  assert.match(teachFn, /officeCollabHtml\(\)/);
  assert.match(src, /数学学期评语记录|数学学期评语/);
  const classFn = src.slice(src.indexOf("function viewClassroom"), src.indexOf("function viewRoster"));
  assert.doesNotMatch(classFn, /commentPanelHtml/);
});
