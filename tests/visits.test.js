import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createGame, playerStudents, advancePeriod, advanceDay, prepareLesson, teach,
  handleVisit, ensureVisits, visitsForSlot, isVisitWindow, planDayVisits, planDayVisitPeriods,
  studentRecentStatus, currentSlot, daySchedule, majorEventOn,
} from "../js/domain/simulation.js";
import { toJSON, fromJSON } from "../js/domain/save.js";
import { addDays, SCHOOL_CALENDAR, weekday } from "../js/domain/calendar.js";
import { isAwayFromClass, classAbsences, leaveCovering, isDutyDay } from "../js/domain/health.js";
import { activityEventOn } from "../js/domain/timetable.js";

function abilityMap(state) {
  const out = {};
  for (const s of playerStudents(state)) out[s.id] = { ...s.ability };
  return out;
}

function goToDate(state, date, max = 40) {
  for (let i = 0; i < max && state.date !== date; i++) {
    advanceDay(state);
    if (state.date > date) break;
  }
  return state.date === date;
}

function collectDayVisits(state, date) {
  const savedDate = state.date;
  const savedPeriod = state.periodId;
  const savedVisits = state.visits;
  state.date = date;
  const items = planDayVisits(state, date);
  state.date = savedDate;
  state.periodId = savedPeriod;
  state.visits = savedVisits;
  return items;
}

function findVisitDay(seed = 20170901, start = "2017-09-01", span = 21) {
  const state = createGame(seed);
  let date = start;
  for (let i = 0; i < span; i++) {
    const items = collectDayVisits(state, date);
    if (items.length) return { state, date, items };
    date = addDays(date, 1);
  }
  return null;
}

test("来访由日期+节次+种子确定，两次开局结果一致", () => {
  const hit = findVisitDay();
  assert.ok(hit, "开局后不久应能遇到学生来访");
  const a = createGame(20170901);
  const b = createGame(20170901);
  const pa = planDayVisits(a, hit.date);
  const pb = planDayVisits(b, hit.date);
  assert.deepEqual(
    pa.map((v) => ({ id: v.studentId, type: v.type, periodId: v.periodId, reason: v.reason })),
    pb.map((v) => ({ id: v.studentId, type: v.type, periodId: v.periodId, reason: v.reason })),
  );
  a.date = hit.date;
  a.periodId = pa[0].periodId;
  b.date = hit.date;
  b.periodId = pa[0].periodId;
  assert.deepEqual(
    visitsForSlot(a).map((v) => v.studentId),
    visitsForSlot(b).map((v) => v.studentId),
  );
});

test("请假不在校的学生不会来访", () => {
  const state = createGame(20170901);
  const cls = playerStudents(state);
  let date = state.date;
  let found = null;
  for (let i = 0; i < 30; i++) {
    if (isDutyDay(date)) {
      const away = cls.filter((s) => leaveCovering(s, date, state.seed));
      if (away.length) {
        found = { date, away };
        break;
      }
    }
    date = addDays(date, 1);
  }
  assert.ok(found, "应能找到有人请假的上课日");
  state.date = found.date;
  const items = planDayVisits(state, found.date);
  const awayIds = new Set(found.away.map((s) => s.id));
  for (const v of items) {
    assert.equal(awayIds.has(v.studentId), false, `${v.name} 请假不应来访`);
    const stu = cls.find((s) => s.id === v.studentId);
    assert.equal(isAwayFromClass(stu, state), false);
  }
});

test("一天最多两起来访，不会每节都出现", () => {
  const state = createGame(20170901);
  let date = "2017-09-01";
  let sawZero = false;
  let sawSome = false;
  let max = 0;
  for (let i = 0; i < 24; i++) {
    const items = collectDayVisits(state, date);
    const periods = planDayVisitPeriods(state, date);
    assert.ok(items.length <= 2, `${date} 来访超过 2 起`);
    assert.ok(periods.length <= 2);
    const eligible = daySchedule(date, state).filter((p) => isVisitWindow(p, date));
    if (eligible.length > 2) {
      assert.ok(periods.length < eligible.length, `${date} 不应每节都来访`);
    }
    if (items.length === 0) sawZero = true;
    if (items.length > 0) sawSome = true;
    max = Math.max(max, items.length);
    const ids = items.map((v) => v.studentId);
    assert.equal(new Set(ids).size, ids.length, "同一学生同一天不应重复来访");
    date = addDays(date, 1);
  }
  assert.ok(sawSome, "这几周里应有来访");
  assert.ok(sawZero, "这几周里应有没有来访的日子");
  assert.ok(max <= 2);
  assert.ok(max >= 1);
});

test("考试日、学校活动日、周日、数学正课和晚自习不来访", () => {
  const state = createGame(20170901);

  state.date = "2017-10-16";
  state.periodId = "noon";
  assert.equal(isVisitWindow(currentSlot(state), state.date), false);
  assert.equal(visitsForSlot(state).length, 0);
  assert.ok(majorEventOn("2017-10-16"));

  const sports = SCHOOL_CALENDAR.find((e) => e.kind === "activity" && e.activityKind === "sports" && e.date.startsWith("2017"));
  assert.ok(sports, "应有 2017 年运动会");
  state.date = sports.date;
  state.periodId = "noon";
  assert.ok(activityEventOn(state.date));
  assert.equal(isVisitWindow(currentSlot(state), state.date), false);
  assert.equal(visitsForSlot(state).length, 0);

  const newyear = SCHOOL_CALENDAR.find((e) => e.kind === "activity" && e.activityKind === "newyear" && e.date.startsWith("2017"));
  assert.ok(newyear);
  state.date = newyear.date;
  state.periodId = "morning-read";
  assert.equal(visitsForSlot(state).length, 0);

  state.date = "2017-09-03";
  state.periodId = "rest";
  assert.equal(weekday(state.date), 0);
  assert.equal(isVisitWindow(currentSlot(state), state.date), false);
  assert.equal(visitsForSlot(state).length, 0);

  state.date = "2017-09-04"; // 周一，p2 是数学
  state.periodId = "p2";
  const mathSlot = currentSlot(state);
  assert.equal(mathSlot.isMath, true);
  assert.equal(isVisitWindow(mathSlot, state.date), false);
  assert.equal(visitsForSlot(state).length, 0);

  state.periodId = "evening-1";
  const evSlot = currentSlot(state);
  assert.ok(evSlot.id === "evening-1");
  assert.equal(isVisitWindow(evSlot, state.date), false);
  assert.equal(visitsForSlot(state).length, 0);
});

test("处理来访写入档案近况和学校日志，不改学科能力", () => {
  const hit = findVisitDay();
  assert.ok(hit);
  const state = createGame(20170901);
  assert.ok(goToDate(state, hit.date) || state.date === hit.date);
  const plan = planDayVisits(state, hit.date);
  assert.ok(plan.length);
  const target = plan[0];
  state.periodId = target.periodId;
  state.visits = null;
  ensureVisits(state);
  const before = abilityMap(state);
  const action = target.options[0].id;
  const r = handleVisit(state, target.studentId, action);
  assert.equal(r.ok, true);
  assert.ok(r.text && r.text.includes(target.name));
  const stu = playerStudents(state).find((s) => s.id === target.studentId);
  assert.ok(stu.lastVisit);
  assert.equal(stu.lastVisit.date, state.date);
  const status = studentRecentStatus(stu, state);
  assert.ok(status.includes("来访") || status.includes(stu.lastVisit.statusLine.split("：")[0]));
  assert.ok((state.log || []).some((l) => l.text === r.text || (l.text || "").includes(target.name)));
  assert.deepEqual(abilityMap(state), before);
  const again = handleVisit(state, target.studentId, action);
  assert.equal(again.ok, false);
  const item = state.visits.items.find((v) => v.studentId === target.studentId);
  assert.equal(item.handled, true);
  assert.ok(item.resolution);
});

test("存档往返后同一时段来访仍可复现", () => {
  const hit = findVisitDay();
  assert.ok(hit);
  const a = createGame(20170901);
  a.date = hit.date;
  a.periodId = hit.items[0].periodId;
  ensureVisits(a);
  const snap = a.visits.items.map((v) => ({ id: v.studentId, type: v.type, reason: v.reason, handled: v.handled }));
  const b = fromJSON(toJSON(a));
  assert.equal(b.date, a.date);
  assert.equal(b.periodId, a.periodId);
  ensureVisits(b);
  assert.deepEqual(
    b.visits.items.map((v) => ({ id: v.studentId, type: v.type, reason: v.reason, handled: v.handled })),
    snap,
  );
  if (snap.length) {
    const act = a.visits.items[0].options[0].id;
    const r1 = handleVisit(a, a.visits.items[0].studentId, act);
    const c = fromJSON(toJSON(a));
    ensureVisits(c);
    const item = c.visits.items.find((v) => v.studentId === a.visits.items[0].studentId);
    assert.equal(item.handled, true);
    assert.equal(item.resolution, r1.text);
    const again = handleVisit(c, item.studentId, act);
    assert.equal(again.ok, false);
  }
});

test("推进下一节或下一天会生成或刷新当前时段来访", () => {
  const state = createGame(20170901);
  let found = null;
  for (let i = 0; i < 80 && !found; i++) {
    const r = advancePeriod(state);
    if (!r.ok) break;
    const items = state.visits?.items || [];
    if (state.visits?.key === `${state.date}|${state.periodId}` && items.length) {
      found = { date: state.date, periodId: state.periodId, items: items.map((v) => v.studentId) };
    }
  }
  assert.ok(found, "连续推进课时应能遇到来访");
  assert.equal(state.visits.key, `${found.date}|${found.periodId}`);

  const day = createGame(20170901);
  let dayHit = null;
  for (let i = 0; i < 16 && !dayHit; i++) {
    advanceDay(day);
    ensureVisits(day);
    if ((day.visits?.items || []).length) dayHit = day.visits;
  }
  // 即使开局几天没有来访，当前时段的 visits 对象也应已刷新
  ensureVisits(day);
  assert.equal(day.visits?.key, `${day.date}|${day.periodId}`);
});

test("上课后的作业事实可以长出作业类来访，处理可小幅改作业状态且不改能力", () => {
  const state = createGame(20170901);
  prepareLesson(state, { topic: "集合与逻辑用语", depth: 2, homework: "中" });
  teach(state, "精讲例题");
  const missing = (state.homework?.rows || []).filter((r) => r.status === "缺交" || r.correction === "待补交");
  let date = state.date;
  let hit = null;
  for (let i = 0; i < 18 && !hit; i++) {
    const items = planDayVisits(state, date);
    const hw = items.find((v) => v.type === "homework");
    if (hw) hit = { date, visit: hw };
    date = addDays(date, 1);
  }
  if (!hit && !missing.length) {
    assert.ok(true, "本局没有缺交，不强制作业类来访");
    return;
  }
  if (hit) {
    state.date = hit.date;
    state.periodId = hit.visit.periodId;
    state.visits = null;
    ensureVisits(state);
    const before = abilityMap(state);
    const rowBefore = (state.homework?.rows || []).find((r) => r.id === hit.visit.studentId);
    const r = handleVisit(state, hit.visit.studentId, "accept");
    assert.equal(r.ok, true);
    assert.deepEqual(abilityMap(state), before);
    if (rowBefore && (rowBefore.status === "缺交" || rowBefore.correction === "待补交" || rowBefore.correction === "已补交待面批")) {
      const row = (state.homework?.rows || []).find((x) => x.id === hit.visit.studentId);
      if (row && hit.visit.reason.includes("没交")) {
        assert.notEqual(row.status, "缺交");
      }
    }
  }
});

test("教室座位和日常教学/办公室界面有来访入口", () => {
  const src = readFileSync(new URL("../js/ui/app.js", import.meta.url), "utf8");
  assert.match(src, /function visitPanelHtml\s*\(/);
  assert.match(src, /学生来访/);
  assert.match(src, /data-visit/);
  assert.match(src, /data-visit-act/);
  assert.match(src, /handleVisit/);
  const classFn = src.slice(src.indexOf("function viewClassroom"), src.indexOf("function viewRoster"));
  assert.match(classFn, /visitPanelHtml\(\)/);
  assert.match(classFn, /bindVisitActions/);
  const officeFn = src.slice(src.indexOf("function officeCollabHtml"), src.indexOf("function bindOfficeActions"));
  assert.match(officeFn, /visitPanelHtml\(\)/);
  assert.match(src, /function viewTeach\s*\(/);
  const teachFn = src.slice(src.indexOf("function viewTeach"), src.indexOf("function viewClassManage") > src.indexOf("function viewTeach") ? src.indexOf("function viewClassManage") : src.length);
  assert.match(teachFn, /officeCollabHtml\(\)/);
});
