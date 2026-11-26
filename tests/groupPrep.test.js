import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createGame, playerStudents, prepareLesson, teach, skipToNextStage, skipUntil,
  handleGroupPrep, composeGroupPrepBrief, groupPrepOptionsFor, composeGroupPrepMinutes,
  isGroupPrepOpen, isGroupPrepWindow, groupPrepUnavailableReason,
  ensureGroupPrepState, hasGroupPrepThisWeek, groupPrepsThisTerm, latestGroupPrepThisWeek,
  isGroupPrepTimeSlot, weekGroupPrepKey, termGroupPrepKey, groupPrepColleagues,
  groupPrepAlignNote, GROUP_PREP_ACTIONS, GROUP_PREP_SOURCE_NOTE,
  GROUP_PREP_WEEK_CAP, GROUP_PREP_TERM_CAP,
  handleQualityMeet, isQualityMeetOpen, currentQualityMeetExam, qualityMeetPublishDate,
  settledQualityMeetExams, currentSlot, majorEventOn, hostClassMeeting, consultMentor,
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

function firstOfficeAfterOpening(seed = 20170901) {
  const state = createGame(seed);
  goOffice(state, "2017-09-04");
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

describe("集体备课", { concurrency: 1 }, () => {
test("同一 seed + 日期，议程和纪要确定可复现", () => {
  const a = firstOfficeAfterOpening(20170901);
  const b = firstOfficeAfterOpening(20170901);
  assert.equal(isGroupPrepOpen(a), true, groupPrepUnavailableReason(a));
  assert.equal(isGroupPrepOpen(b), true, groupPrepUnavailableReason(b));
  const ba = composeGroupPrepBrief(a);
  const bb = composeGroupPrepBrief(b);
  assert.ok(ba && bb);
  assert.deepEqual(
    { points: ba.points, shortPoints: ba.shortPoints, topic: ba.topic, exampleLine: ba.exampleLine, colleagues: ba.colleagues.map((c) => c.id) },
    { points: bb.points, shortPoints: bb.shortPoints, topic: bb.topic, exampleLine: bb.exampleLine, colleagues: bb.colleagues.map((c) => c.id) },
  );
  const oa = groupPrepOptionsFor(a);
  const ob = groupPrepOptionsFor(b);
  assert.equal(oa.length, 3);
  assert.deepEqual(oa.map((o) => ({ id: o.id, text: o.text })), ob.map((o) => ({ id: o.id, text: o.text })));
  assert.deepEqual(oa.map((o) => o.id), GROUP_PREP_ACTIONS.map((x) => x.id));
  for (const o of oa) {
    assert.equal(composeGroupPrepMinutes(a, o.id, ba), o.text);
    assert.ok(o.text.includes("数学备课组"));
    assert.ok(o.text.includes("集体备课"));
    assert.ok(o.text.includes("不是接任备课组长"));
    assert.ok(o.text.includes("不能代替") || o.text.includes("自己备课"));
    assert.ok(o.text.includes("向师傅请教") || GROUP_PREP_SOURCE_NOTE.includes("向师傅请教"));
    assert.ok(o.text.includes("质量分析会") || GROUP_PREP_SOURCE_NOTE.includes("质量分析会"));
    assert.ok(o.text.includes("听课") || GROUP_PREP_SOURCE_NOTE.includes("听课"));
    assert.ok(o.text.includes("宁川中学"));
    assert.ok(o.text.includes(ba.topic));
    assert.doesNotMatch(o.text, /你主持了这次集体备课|你作为备课组长|你是教研组长|全校进度表已经下达|官方教研文件/);
  }
  assert.ok(ba.topic);
  assert.ok(ba.shortPoints.includes(ba.topic));
  assert.ok(ba.exampleLine);
  assert.ok(groupPrepColleagues(a).length >= 1);
  assert.ok(groupPrepColleagues(a).length <= 2);
  assert.equal(GROUP_PREP_WEEK_CAP, 1);
  assert.equal(GROUP_PREP_TERM_CAP, 12);
});

test("仅办公室坐班可开；数学正课、考试日、活动日、周日、家长会当天、开学典礼、教师节不可开", () => {
  const state = createGame(20170901);
  goOffice(state, "2017-09-01");
  assert.equal(isGroupPrepOpen(state), false);
  assert.match(groupPrepUnavailableReason(state), /开学典礼|报到/);

  goOffice(state, "2017-09-04");
  assert.equal(isGroupPrepOpen(state), true, groupPrepUnavailableReason(state));
  assert.equal(isGroupPrepWindow(state), true);
  assert.equal(isGroupPrepTimeSlot(currentSlot(state), state.date), true);

  const openDate = state.date;
  state.periodId = "p2";
  const mathSlot = currentSlot(state);
  if (mathSlot?.isMath) {
    assert.equal(isGroupPrepOpen(state), false);
    assert.match(groupPrepUnavailableReason(state), /数学正课/);
    assert.equal(isGroupPrepWindow(state), false);
  } else {
    goOffice(state, "2017-09-06");
    state.periodId = "p1";
    if (currentSlot(state)?.isMath) {
      assert.equal(isGroupPrepOpen(state), false);
      assert.match(groupPrepUnavailableReason(state), /数学正课/);
    }
  }

  goOffice(state, "2017-09-04");
  state.periodId = "evening-1";
  assert.equal(currentSlot(state).isTutoring, true);
  assert.equal(isGroupPrepOpen(state), false);
  assert.match(groupPrepUnavailableReason(state), /辅导时段|晚自习/);

  state.periodId = "evening-2";
  assert.equal(isGroupPrepOpen(state), false);
  assert.match(groupPrepUnavailableReason(state), /晚自习|辅导时段|办公室坐班/);

  goOffice(state, openDate);
  state.periodId = "noon";
  assert.equal(isGroupPrepOpen(state), false);
  assert.match(groupPrepUnavailableReason(state), /办公室坐班/);

  goOffice(state, "2017-09-11");
  assert.equal(isGroupPrepOpen(state), false);
  assert.match(groupPrepUnavailableReason(state), /教师节/);

  goOffice(state, "2017-10-16");
  assert.ok(majorEventOn("2017-10-16"));
  assert.equal(isGroupPrepOpen(state), false);
  assert.match(groupPrepUnavailableReason(state), /考试/);

  const sports = SCHOOL_CALENDAR.find((e) => e.kind === "activity" && e.activityKind === "sports" && e.date.startsWith("2017"));
  assert.ok(sports);
  goOffice(state, sports.date);
  assert.ok(activityEventOn(state.date));
  assert.equal(isGroupPrepOpen(state), false);
  assert.match(groupPrepUnavailableReason(state), /活动/);

  goOffice(state, "2017-09-10");
  assert.equal(weekday(state.date), 0);
  state.periodId = "rest";
  assert.equal(isGroupPrepOpen(state), false);
  assert.match(groupPrepUnavailableReason(state), /周日/);

  const parents = SCHOOL_CALENDAR.find((e) => e.kind === "parents" && e.date.startsWith("2017"));
  assert.ok(parents);
  goOffice(state, parents.date);
  assert.equal(isGroupPrepOpen(state), false);
  assert.match(groupPrepUnavailableReason(state), /家长会/);
});

test("每周上限和每学期上限生效；同一周不能开第二次", () => {
  const state = firstOfficeAfterOpening();
  const r = handleGroupPrep(state, "listen");
  assert.equal(r.ok, true, r.reason);
  assert.equal(hasGroupPrepThisWeek(state), true);
  assert.equal(GROUP_PREP_WEEK_CAP, 1);
  const again = handleGroupPrep(state, "supplement");
  assert.equal(again.ok, false);
  assert.match(again.reason, /本周|每周最多|已经参加/);
  assert.equal(isGroupPrepOpen(state), false);
  assert.match(groupPrepUnavailableReason(state), /本周|每周最多|已经参加/);
  assert.equal(isGroupPrepWindow(state), true);

  goOffice(state, "2017-09-05");
  assert.equal(weekGroupPrepKey("2017-09-05"), weekGroupPrepKey("2017-09-04"));
  assert.equal(isGroupPrepOpen(state), false);
  assert.match(groupPrepUnavailableReason(state), /本周|每周最多/);

  goOffice(state, "2017-09-12");
  assert.notEqual(weekGroupPrepKey("2017-09-12"), weekGroupPrepKey("2017-09-04"));
  assert.equal(isGroupPrepOpen(state), true, groupPrepUnavailableReason(state));
  const r2 = handleGroupPrep(state, "confirm");
  assert.equal(r2.ok, true, r2.reason);

  const later = firstOfficeAfterOpening();
  goOffice(later, "2017-10-09");
  later.groupPreps = Array.from({ length: GROUP_PREP_TERM_CAP }, (_, i) => ({
    date: addDays("2017-08-14", i * 7),
    termKey: termGroupPrepKey("2017-10-09"),
    weekKey: weekGroupPrepKey(addDays("2017-08-14", i * 7)),
    actionId: "listen",
    minutes: "占位纪要",
  }));
  ensureGroupPrepState(later);
  assert.equal(groupPrepsThisTerm(later).length, GROUP_PREP_TERM_CAP);
  assert.equal(isGroupPrepOpen(later), false, "学期上限应生效");
  assert.match(groupPrepUnavailableReason(later), /这学期|12 次|已经参加过/);
});

test("写入日志和纪要，不改能力、分数、省控；不自动完成个人备课，上数学课前仍须按现有规则备课", () => {
  const state = firstOfficeAfterOpening();
  const beforeAbility = abilityMap(state);
  const beforePotential = potentialMap(state);
  const beforeExams = examTotals(state);
  const officialBefore = officialProvincialPack(2017);
  const linesBefore = JSON.stringify(provincialLines(2017));
  const mentorBefore = state.mentorConsultedOn;
  const roleBefore = state.player.role;
  const prepBefore = state.player.prep;
  const planBefore = state.player.lessonPlan;
  const r = handleGroupPrep(state, "confirm");
  assert.equal(r.ok, true, r.reason);
  assert.ok(r.text.includes("集体备课"));
  assert.ok(r.text.includes("不是接任备课组长"));
  assert.ok(r.text.includes("不能代替") || r.minutes.includes("不能代替") || r.minutes.includes("自己备课"));
  assert.ok(r.minutes.includes("宁川中学数学备课组"));
  assert.ok((r.rec.hostTitle || "").includes("备课组长"));
  assert.equal(r.rec.role, "任课数学老师");
  assert.equal(r.rec.host, state.player.mentor);
  assert.doesNotMatch(r.text, /你主持了这次会|你作为备课组长|改任备课组长|你是教研组长/);
  assert.ok((state.log || []).some((l) => l.text === r.text || (l.text || "").includes("集体备课")));
  assert.ok((state.groupPreps || []).some((m) => m.minutes === r.minutes));
  assert.equal(ensureGroupPrepState(state).done, true);
  assert.equal(state.mentorConsultedOn, mentorBefore);
  assert.equal(state.player.role, roleBefore);
  assert.equal(String(state.player.role || "").includes("备课组长"), false);
  assert.equal(String(state.player.role || "").includes("教研组长"), false);
  assert.equal(state.player.prep, prepBefore);
  assert.equal(state.player.lessonPlan, planBefore);
  assert.deepEqual(abilityMap(state), beforeAbility);
  assert.deepEqual(potentialMap(state), beforePotential);
  assert.deepEqual(examTotals(state), beforeExams);
  assert.deepEqual(officialProvincialPack(2017), officialBefore);
  assert.equal(JSON.stringify(provincialLines(2017)), linesBefore);

  const taught = teach(state, "精讲例题");
  assert.equal(taught.ok, true, taught.reason);
  assert.ok((taught.text || "").includes("备课不足") || (taught.record?.notes || []).join("").includes("备课不足"));
  assert.equal(state.player.prep, 0);

  const prep = prepareLesson(state, { topic: "集合与逻辑用语", depth: 2, homework: "中" });
  assert.equal(prep.ok, true);
  assert.ok(prep.groupPrepAligned);
  assert.ok((prep.text || "").includes("集体备课不能代替个人备课"));
  assert.equal(state.player.lessonPlan.topic, "集合与逻辑用语");
  assert.ok(state.player.prep > 0);
  assert.ok((state.player.lessonPlan.examples || "").includes("集体备课") || state.player.lessonPlan.groupPrepNote);
  assert.ok(groupPrepAlignNote(state));

  const consult = consultMentor(state);
  assert.ok(consult.ok === true || consult.ok === false);
  if (consult.ok === false) {
    assert.doesNotMatch(consult.reason || "", /集体备课已经占用|请教次数已/);
  }

  const internHost = hostClassMeeting(state);
  assert.equal(internHost.ok, false);
  assert.match(internHost.reason || internHost.text || "", /实习|班主任|主持/);
});

test("质量分析会正在开时不可开集体备课；会后仍可参加", () => {
  const state = createGame(20170901);
  settleUntil(state, "2017-10-16", "monthly");
  const exam = currentQualityMeetExam(goOffice(state, "2017-10-18"))
    || settledQualityMeetExams(state).find((e) => e.examKind === "monthly");
  assert.ok(exam, "应已结算第一次月考");
  afterPublishOffice(state, exam);
  assert.equal(isQualityMeetOpen(state), true);
  assert.equal(isGroupPrepOpen(state), false);
  assert.match(groupPrepUnavailableReason(state), /质量分析会/);
  const blocked = handleGroupPrep(state, "listen");
  assert.equal(blocked.ok, false);
  const meet = handleQualityMeet(state, "listen");
  assert.equal(meet.ok, true, meet.reason);
  assert.equal(isQualityMeetOpen(state), false);
  assert.equal(isGroupPrepOpen(state), true, groupPrepUnavailableReason(state));
  const r = handleGroupPrep(state, "listen");
  assert.equal(r.ok, true, r.reason);
});

test("存档往返后纪要仍在", () => {
  const a = firstOfficeAfterOpening();
  const r = handleGroupPrep(a, "supplement");
  assert.equal(r.ok, true, r.reason);
  const b = fromJSON(toJSON(a));
  assert.equal(b.date, a.date);
  assert.equal(b.groupPrep.done, true);
  assert.equal(b.groupPrep.lastAction, "supplement");
  assert.equal(b.groupPreps[0].minutes, a.groupPreps[0].minutes);
  assert.equal(b.groupPreps[0].topic, a.groupPreps[0].topic);
  assert.equal(hasGroupPrepThisWeek(b), true);
  const again = handleGroupPrep(b, "listen");
  assert.equal(again.ok, false);
});

test("自动推进能越过未参加的集体备课，不卡死", () => {
  const state = firstOfficeAfterOpening();
  assert.equal(isGroupPrepOpen(state), true, groupPrepUnavailableReason(state));
  const start = state.date;
  state.periodId = "noon";
  const stepped = advanceDay(state);
  assert.ok(stepped);
  assert.equal(state.date, addDays(start, 1));

  goOffice(state, start);
  assert.equal(isGroupPrepOpen(state), true, groupPrepUnavailableReason(state));
  const r = skipToNextStage(state);
  assert.equal(r.ok, true, r.reason);
  assert.ok(state.date > start, `应越过未参加的集体备课继续推进，当前 ${state.date}`);
  assert.equal(hasGroupPrepThisWeek(state, start), false);

  skipUntil(state, (s) => s.date >= "2017-11-15", 40);
  assert.ok(state.date >= "2017-11-15", `应能推进到期中，当前 ${state.date}`);
});

test("办公室和日常教学界面有集体备课入口，学校日志能看到纪要；教室正课不插入该面板", () => {
  const src = readFileSync(new URL("../js/ui/app.js", import.meta.url), "utf8");
  assert.match(src, /function groupPrepPanelHtml\s*\(/);
  assert.match(src, /集体备课/);
  assert.match(src, /data-group-prep/);
  assert.match(src, /handleGroupPrep/);
  const officeFn = src.slice(src.indexOf("function officeCollabHtml"), src.indexOf("function bindOfficeActions"));
  assert.match(officeFn, /groupPrepPanelHtml/);
  const teachFn = src.slice(src.indexOf("function viewTeach"), src.indexOf("function viewPlacement"));
  assert.match(teachFn, /officeCollabHtml\(\)/);
  const logFn = src.slice(src.indexOf("function viewLog"), src.indexOf("function viewSave"));
  assert.match(logFn, /集体备课|groupPreps/);
  const classFn = src.slice(src.indexOf("function viewClassroom"), src.indexOf("function viewRoster"));
  assert.doesNotMatch(classFn, /groupPrepPanelHtml/);
});
});
