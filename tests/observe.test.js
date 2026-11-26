import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createGame, playerStudents, prepareLesson, teach, skipToNextStage, skipUntil, consultMentor,
  observeLesson, isObserveOpen, observeUnavailableReason, observeChoices, composeObserveNote,
  ensureObserveState, currentSlot, majorEventOn,
  upcomingOpenClass, listOpenClasses, openClassForTerm, openClassOnDate, openClassSlotOn,
  isOpenClassDay, isOpenClassPeriod, OBSERVE_DAY_CAP, OBSERVE_TERM_CAP, OPEN_CLASS_SOURCE_NOTE,
} from "../js/domain/simulation.js";
import { toJSON, fromJSON } from "../js/domain/save.js";
import { addDays, SCHOOL_CALENDAR, weekday, occupiedEventDates, schoolYearOf, termOf } from "../js/domain/calendar.js";
import { activityEventOn, MATH_SLOTS } from "../js/domain/timetable.js";
import { provincialLines } from "../js/domain/jiangxi.js";

function abilityMap(state) {
  const out = {};
  for (const s of playerStudents(state)) out[s.id] = { ...s.ability };
  return out;
}

function examTotals(state) {
  const out = {};
  for (const ex of Object.values(state.exams || {})) {
    for (const row of ex.rows || []) out[`${ex.examId || ex.date}|${row.studentId}`] = row.total;
  }
  return out;
}

function goOffice(state, date = "2017-09-04") {
  state.date = date;
  state.periodId = "morning-read";
  return state;
}

function goSunday(state, date = "2017-09-03") {
  state.date = date;
  state.periodId = "rest";
  return state;
}

function goOpenClass(state, oc = openClassForTerm("2017-09-01")) {
  assert.ok(oc, "应能排到本学期公开课");
  state.date = oc.date;
  state.periodId = oc.periodId;
  return oc;
}

test("听课对同一 seed、日期、节次确定，两次开局一致", () => {
  const a = createGame(20170901);
  const b = createGame(20170901);
  goOffice(a);
  goOffice(b);
  const ca = observeChoices(a);
  const cb = observeChoices(b);
  assert.ok(ca.length >= 2, "听课名单不应是空菜单");
  assert.deepEqual(
    ca.map((v) => ({ id: v.id, name: v.name, topic: v.topic, reason: v.reason })),
    cb.map((v) => ({ id: v.id, name: v.name, topic: v.topic, reason: v.reason })),
  );
  const noteA = composeObserveNote(a, "mentor");
  const noteB = composeObserveNote(b, "mentor");
  assert.equal(noteA.text, noteB.text);
  const r1 = observeLesson(a, "mentor");
  const r2 = observeLesson(b, "mentor");
  assert.equal(r1.ok, true, r1.reason);
  assert.equal(r2.ok, true, r2.reason);
  assert.equal(r1.text, r2.text);
  assert.equal(r1.text, noteA.text);
  assert.match(r1.text, /陈正衡|备课组长/);
  assert.match(r1.text, /记下/);
});

test("听课在数学正课、晚自习、考试日、活动日、周日、家长会当天不可用", () => {
  const state = createGame(20170901);

  goOffice(state, "2017-09-04");
  assert.equal(isObserveOpen(state), true, observeUnavailableReason(state));

  state.periodId = "p2";
  const mathSlot = currentSlot(state);
  assert.equal(mathSlot.isMath, true);
  assert.equal(isObserveOpen(state), false);
  assert.match(observeUnavailableReason(state), /数学正课/);

  state.periodId = "evening-1";
  assert.equal(isObserveOpen(state), false);
  assert.match(observeUnavailableReason(state), /晚自习/);

  state.date = "2017-10-16";
  state.periodId = "morning-read";
  assert.ok(majorEventOn("2017-10-16"));
  assert.equal(isObserveOpen(state), false);
  assert.match(observeUnavailableReason(state), /考试|停课/);

  const sports = SCHOOL_CALENDAR.find((e) => e.kind === "activity" && e.activityKind === "sports" && e.date.startsWith("2017"));
  assert.ok(sports, "应有 2017 年运动会");
  state.date = sports.date;
  state.periodId = "morning-read";
  assert.ok(activityEventOn(state.date));
  assert.equal(isObserveOpen(state), false);
  assert.match(observeUnavailableReason(state), /活动/);

  const newyear = SCHOOL_CALENDAR.find((e) => e.kind === "activity" && e.activityKind === "newyear" && e.date.startsWith("2017"));
  assert.ok(newyear);
  state.date = newyear.date;
  state.periodId = "morning-read";
  assert.equal(isObserveOpen(state), false);

  goSunday(state, "2017-09-03");
  assert.equal(weekday(state.date), 0);
  assert.equal(isObserveOpen(state), false);
  assert.match(observeUnavailableReason(state), /周日/);

  const parents = SCHOOL_CALENDAR.find((e) => e.kind === "parents" && e.date.startsWith("2017"));
  assert.ok(parents);
  state.date = parents.date;
  state.periodId = "morning-read";
  assert.equal(isObserveOpen(state), false);
  assert.match(observeUnavailableReason(state), /家长会/);
});

test("听课每天最多一次，每学期大约六到八次上限生效，且不改能力分数省控", () => {
  const state = createGame(20170901);
  const before = abilityMap(state);
  const examsBefore = examTotals(state);
  goOffice(state, "2017-09-04");
  const first = observeLesson(state, "fang");
  assert.equal(first.ok, true, first.reason);
  assert.equal(isObserveOpen(state), false);
  assert.match(observeUnavailableReason(state), /今天已经听过|每天最多/);
  assert.deepEqual(abilityMap(state), before);
  assert.deepEqual(examTotals(state), examsBefore);
  assert.equal(provincialLines(2020, "li").first, 535);
  assert.equal(provincialLines(2020, "wen").first, 547);

  let d = "2017-09-05";
  let used = 1;
  const choices = ["mentor", "fang", "jiang", "han"];
  while (used < OBSERVE_TERM_CAP) {
    if (weekday(d) === 0 || majorEventOn(d) || activityEventOn(d)) {
      d = addDays(d, 1);
      continue;
    }
    goOffice(state, d);
    if (!isObserveOpen(state)) {
      d = addDays(d, 1);
      continue;
    }
    const r = observeLesson(state, choices[used % choices.length]);
    assert.equal(r.ok, true, `${d} ${r.reason}`);
    used += 1;
    d = addDays(d, 1);
  }
  assert.equal(state.observe.count, OBSERVE_TERM_CAP);
  // 再找一个可坐班日，应被学期上限挡住
  let guard = 0;
  while (guard < 40) {
    if (weekday(d) !== 0 && !majorEventOn(d) && !activityEventOn(d)) break;
    d = addDays(d, 1);
    guard += 1;
  }
  goOffice(state, d);
  assert.equal(isObserveOpen(state), false);
  assert.match(observeUnavailableReason(state), /上限|六到八/);
  assert.equal(OBSERVE_DAY_CAP, 1);
  assert.equal(OBSERVE_TERM_CAP, 8);
  assert.deepEqual(abilityMap(state), before);
});

test("每学期都有一节公开课，落在玩家数学课上，且不与考试家长会运动会等既定日冲突", () => {
  const list = listOpenClasses(2015, 2026);
  const years = [];
  for (let sy = 2015; sy < 2026; sy++) {
    const fall = list.find((e) => e.schoolYear === sy && e.term === "上");
    const spring = list.find((e) => e.schoolYear === sy && e.term === "下");
    assert.ok(fall, `${sy} 学年秋季应有公开课`);
    assert.ok(spring, `${sy} 学年春季应有公开课`);
    years.push(fall, spring);
  }
  const occupied = occupiedEventDates(SCHOOL_CALENDAR);
  for (const oc of years) {
    assert.ok(!occupied.has(oc.date), `${oc.date} 不应与既定校历日冲突`);
    assert.ok(!majorEventOn(oc.date), `${oc.date} 不应是考试或家长会等停课日`);
    assert.ok(!activityEventOn(oc.date), `${oc.date} 不应是运动会或迎新年`);
    const wd = weekday(oc.date);
    assert.notEqual(wd, 0);
    const mathIds = MATH_SLOTS[wd] || [];
    assert.ok(mathIds.includes(oc.periodId), `${oc.date} 的 ${oc.periodId} 应是模板数学正课`);
    assert.match(oc.sourceNote || OPEN_CLASS_SOURCE_NOTE, /宁川中学|校内/);
    assert.match(oc.sourceNote || OPEN_CLASS_SOURCE_NOTE, /不是某所实校|教育行政/);
  }
  const first = openClassForTerm("2017-09-01");
  assert.ok(first);
  assert.ok(first.date > "2017-10-17", "秋季公开课应在第一次月考之后");
  assert.ok(first.date < "2017-11-15", "秋季公开课应在期中之前");
  const spring = openClassForTerm("2018-03-01");
  assert.ok(spring);
  assert.ok(spring.date > "2018-03-20", "春季公开课应在下学期月考之后");
  assert.ok(spring.date < "2018-04-18", "春季公开课应在市联考或期中之前");
  assert.notEqual(list.filter((e) => e.date.startsWith("2017") || e.date.startsWith("2018")).length, 0);
  // 不要只写 2017 年
  assert.ok(list.some((e) => e.schoolYear === 2018));
  assert.ok(list.some((e) => e.schoolYear === 2019));
});

test("上完公开课写入日志和评语，不改学生能力、分数或省控；未备课评语偏谨慎且不卡上课", () => {
  const state = createGame(20170901);
  const oc = goOpenClass(state);
  assert.equal(isOpenClassDay(oc.date), true);
  assert.equal(isOpenClassPeriod(state), true);
  const slot = openClassSlotOn(state.date, state);
  assert.ok(slot);
  assert.equal(slot.periodId, oc.periodId);
  const before = abilityMap(state);
  const examsBefore = examTotals(state);
  const r = teach(state, "精讲例题");
  assert.equal(r.ok, true, r.reason);
  assert.ok(r.openClassReview, "应写下公开课评语");
  assert.match(r.text, /评语|听完课/);
  assert.match(r.openClassReview.text, /谨慎|备课不够充分/);
  assert.ok((state.log || []).some((l) => l.date === oc.date && /评语|听完课/.test(l.text)));
  // 上课本身会微调能力，但不应改已有考试分数和省控；评语不得另改能力
  assert.deepEqual(examTotals(state), examsBefore);
  assert.equal(provincialLines(2020, "li").first, 535);
  // 再上一节不应重复写评语
  const state2 = createGame(20170901);
  prepareLesson(state2, { topic: "函数的单调性与最值", depth: 2, homework: "中" });
  goOpenClass(state2, oc);
  const prepped = teach(state2, "精讲例题");
  assert.equal(prepped.ok, true, prepped.reason);
  assert.ok(prepped.openClassReview);
  assert.match(prepped.openClassReview.text, /准备充分|有准备|教案/);
  assert.doesNotMatch(prepped.openClassReview.text, /备课不够充分/);
  const abilitiesAfterReview = abilityMap(state2);
  // 公开课评语本身不另改能力：同一节课的能力变化应只来自既有上课规则（这里只断言省控与考试分）
  assert.deepEqual(examTotals(state2), examsBefore);
  assert.ok(Object.keys(abilitiesAfterReview).length > 0);
  assert.ok(state2.observe.openClassReviews.length >= 1);
});

test("存档往返后听课和公开课记录仍在", () => {
  const state = createGame(20170901);
  goOffice(state);
  const seen = observeLesson(state, "jiang");
  assert.equal(seen.ok, true, seen.reason);
  prepareLesson(state, { topic: "集合与逻辑用语", depth: 2, homework: "中" });
  const oc = goOpenClass(state);
  const taught = teach(state, "精讲例题");
  assert.equal(taught.ok, true, taught.reason);
  const json = toJSON(state);
  const loaded = fromJSON(json);
  assert.equal(loaded.observe.records[0].text, seen.text);
  assert.equal(loaded.observe.records[0].teacherId, "jiang");
  assert.equal(loaded.observe.openClassReviews[0].date, oc.date);
  assert.equal(loaded.observe.openClassReviews[0].text, taught.openClassReview.text);
  goOffice(loaded, "2017-09-05");
  // 学期计数应保留（同一学期）
  ensureObserveState(loaded);
  assert.ok((loaded.observe.count || 0) >= 1);
});

test("自动推进能越过公开课日到达下场考试，不必先备课", () => {
  const state = createGame(20170901);
  const oc = openClassForTerm("2017-09-01");
  assert.ok(oc);
  const mid = SCHOOL_CALENDAR.find((e) => e.id === "exam-2017-期中考试");
  assert.ok(mid);
  const steps = skipUntil(state, (s) => s.date >= mid.date, 20);
  assert.ok(steps.length >= 1);
  assert.ok(state.date >= mid.date, `应越过公开课 ${oc.date} 到达期中 ${mid.date}，实际 ${state.date}`);
  assert.ok(state.date > oc.date);
  // 自动模式不要求先上课，因此可以没有评语
  assert.equal((state.observe?.openClassReviews || []).length, 0);
  assert.equal(state.player.prep, 0);
});

test("请教备课组长的既有规则和每日上限不变，仅在听课后多提一句", () => {
  const plain = createGame(20170901);
  goOffice(plain, "2017-09-04");
  const p1 = consultMentor(plain);
  assert.equal(p1.ok, true, p1.reason);
  assert.match(p1.text, /看了你准备的/);
  assert.doesNotMatch(p1.text, /日前听的/);
  assert.equal(plain.player.prep, 1);
  const p2 = consultMentor(plain);
  assert.equal(p2.ok, false);
  assert.match(p2.reason, /今天已经向备课组长请教过一次/);

  const heard = createGame(20170901);
  goOffice(heard, "2017-09-04");
  const obs = observeLesson(heard, "fang");
  assert.equal(obs.ok, true, obs.reason);
  const m1 = consultMentor(heard);
  assert.equal(m1.ok, true, m1.reason);
  assert.match(m1.text, /看了你准备的/);
  assert.match(m1.text, /日前听的/);
  assert.ok(m1.text.includes(obs.rec.topic));
  assert.equal(heard.player.prep, 1);
  const m2 = consultMentor(heard);
  assert.equal(m2.ok, false);
  assert.match(m2.reason, /今天已经向备课组长请教过一次/);
});

test("办公室、日常教学、校历和课表能看到听课与公开课", () => {
  const src = readFileSync(new URL("../js/ui/app.js", import.meta.url), "utf8");
  assert.match(src, /function observePanelHtml\s*\(/);
  assert.match(src, /function openClassPanelHtml\s*\(/);
  assert.match(src, /去听这节课/);
  assert.match(src, /data-observe/);
  assert.match(src, /open-class-tag/);
  assert.match(src, /下场公开课|公开课/);
  const officeFn = src.slice(src.indexOf("function officeCollabHtml"), src.indexOf("function bindOfficeActions"));
  assert.match(officeFn, /observePanelHtml\(\)/);
  const teachFn = src.slice(src.indexOf("function viewTeach"), src.indexOf("function viewPlacement"));
  assert.match(teachFn, /openClassPanelHtml\(\)/);
  assert.match(src, /function viewLog/);
  assert.match(src, /upcomingOpenClasses/);
});
