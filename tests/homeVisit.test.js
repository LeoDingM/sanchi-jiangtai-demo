import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createGame, playerStudents, prepareLesson, teach, skipToNextStage, skipUntil,
  handlePhoneVisit, handleDoorVisit, suggestPhoneVisits, suggestDoorVisits,
  isPhoneVisitOpen, isDoorVisitOpen, phoneVisitUnavailableReason, doorVisitUnavailableReason,
  ensureHomeVisitState, studentRecentStatus, currentSlot, daySchedule, majorEventOn,
  PHONE_DAY_CAP, PHONE_TERM_CAP, DOOR_DAY_CAP, DOOR_TERM_CAP, advanceDay,
} from "../js/domain/simulation.js";
import { toJSON, fromJSON } from "../js/domain/save.js";
import { addDays, SCHOOL_CALENDAR, weekday } from "../js/domain/calendar.js";
import { activityEventOn } from "../js/domain/timetable.js";
import { leaveCovering, isDutyDay } from "../js/domain/health.js";

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

test("建议名单对同一 seed 与日期确定，两次开局一致", () => {
  const a = createGame(20170901);
  const b = createGame(20170901);
  prepareLesson(a, { topic: "集合与逻辑用语", depth: 2, homework: "中" });
  teach(a, "精讲例题");
  prepareLesson(b, { topic: "集合与逻辑用语", depth: 2, homework: "中" });
  teach(b, "精讲例题");
  goOffice(a);
  goOffice(b);
  const pa = suggestPhoneVisits(a);
  const pb = suggestPhoneVisits(b);
  assert.ok(pa.length >= 3 && pa.length <= 6, `电话建议应为 3–6 人，实际 ${pa.length}`);
  assert.deepEqual(
    pa.map((v) => ({ id: v.studentId, reason: v.reason })),
    pb.map((v) => ({ id: v.studentId, reason: v.reason })),
  );
  goSunday(a);
  goSunday(b);
  const da = suggestDoorVisits(a);
  const db = suggestDoorVisits(b);
  assert.ok(da.length >= 3 && da.length <= 4, `上门建议应为 3–4 人，实际 ${da.length}`);
  assert.deepEqual(
    da.map((v) => ({ id: v.studentId, reason: v.reason })),
    db.map((v) => ({ id: v.studentId, reason: v.reason })),
  );
  // 同一天再取一次仍稳定
  assert.deepEqual(suggestPhoneVisits(goOffice(a)).map((v) => v.studentId), pa.map((v) => v.studentId));
});

test("电话家访在数学正课、晚自习、考试日、活动日、周日、家长会当天不可用", () => {
  const state = createGame(20170901);

  goOffice(state, "2017-09-04");
  assert.equal(isPhoneVisitOpen(state), true, phoneVisitUnavailableReason(state));

  state.periodId = "p2";
  const mathSlot = currentSlot(state);
  assert.equal(mathSlot.isMath, true);
  assert.equal(isPhoneVisitOpen(state), false);
  assert.match(phoneVisitUnavailableReason(state), /数学正课/);

  state.periodId = "evening-1";
  assert.equal(isPhoneVisitOpen(state), false);
  assert.match(phoneVisitUnavailableReason(state), /晚自习/);

  state.date = "2017-10-16";
  state.periodId = "morning-read";
  assert.ok(majorEventOn("2017-10-16"));
  assert.equal(isPhoneVisitOpen(state), false);
  assert.match(phoneVisitUnavailableReason(state), /考试/);

  const sports = SCHOOL_CALENDAR.find((e) => e.kind === "activity" && e.activityKind === "sports" && e.date.startsWith("2017"));
  assert.ok(sports, "应有 2017 年运动会");
  state.date = sports.date;
  state.periodId = "morning-read";
  assert.ok(activityEventOn(state.date));
  assert.equal(isPhoneVisitOpen(state), false);
  assert.match(phoneVisitUnavailableReason(state), /活动/);

  const newyear = SCHOOL_CALENDAR.find((e) => e.kind === "activity" && e.activityKind === "newyear" && e.date.startsWith("2017"));
  assert.ok(newyear);
  state.date = newyear.date;
  state.periodId = "morning-read";
  assert.equal(isPhoneVisitOpen(state), false);

  goSunday(state, "2017-09-03");
  assert.equal(weekday(state.date), 0);
  assert.equal(isPhoneVisitOpen(state), false);
  assert.match(phoneVisitUnavailableReason(state), /周日/);

  const parents = SCHOOL_CALENDAR.find((e) => e.kind === "parents" && e.date.startsWith("2017"));
  assert.ok(parents);
  state.date = parents.date;
  state.periodId = "morning-read";
  assert.equal(isPhoneVisitOpen(state), false);
  assert.match(phoneVisitUnavailableReason(state), /见面谈了/);
});

test("上门家访只在周日且有名额时可用，学期上限生效", () => {
  const state = createGame(20170901);
  prepareLesson(state, { topic: "集合与逻辑用语", depth: 2, homework: "中" });
  teach(state, "精讲例题");

  goOffice(state, "2017-09-04");
  assert.equal(isDoorVisitOpen(state), false);
  assert.match(doorVisitUnavailableReason(state), /周日/);

  const sundays = [];
  let d = "2017-09-03";
  while (sundays.length < 5) {
    if (weekday(d) === 0 && !majorEventOn(d) && !activityEventOn(d)) sundays.push(d);
    d = addDays(d, 1);
  }

  const used = new Set();
  for (let i = 0; i < DOOR_TERM_CAP; i++) {
    goSunday(state, sundays[i]);
    assert.equal(isDoorVisitOpen(state), true, `${sundays[i]} ${doorVisitUnavailableReason(state)}`);
    const list = suggestDoorVisits(state).filter((v) => !used.has(v.studentId));
    assert.ok(list.length, `${sundays[i]} 应有建议对象`);
    const target = list[0];
    const r = handleDoorVisit(state, target.studentId, "sitTalk");
    assert.equal(r.ok, true, r.reason);
    used.add(target.studentId);
    assert.equal(isDoorVisitOpen(state), false, "当天已走访一户后应不可再用");
    assert.match(doorVisitUnavailableReason(state), /一户|今天已经/);
  }

  goSunday(state, sundays[DOOR_TERM_CAP]);
  assert.equal(isDoorVisitOpen(state), false);
  assert.match(doorVisitUnavailableReason(state), /上限|三四户/);
  const over = handleDoorVisit(state, suggestDoorVisits(state)[0].studentId, "sitTalk");
  assert.equal(over.ok, false);
});

test("处理写入日志和档案近况，不改能力或分数；请假在家可以打电话", () => {
  const state = createGame(20170901);
  prepareLesson(state, { topic: "集合与逻辑用语", depth: 2, homework: "中" });
  teach(state, "精讲例题");
  goOffice(state, "2017-09-04");
  const list = suggestPhoneVisits(state);
  assert.ok(list.length);
  const target = list[0];
  const beforeAbility = abilityMap(state);
  const beforeExams = examTotals(state);
  const stu = playerStudents(state).find((s) => s.id === target.studentId);
  const rel0 = stu.relation || 0;
  const coop0 = stu.parentCoop;
  const r = handlePhoneVisit(state, target.studentId, "watchHw");
  assert.equal(r.ok, true, r.reason);
  assert.ok(r.text.includes(target.name));
  assert.ok(r.text.includes("数学任课老师"));
  assert.ok(!r.text.includes("主持家长会"));
  assert.equal(stu.lastHomeVisit.date, state.date);
  assert.equal(stu.lastHomeVisit.kind, "phone");
  const status = studentRecentStatus(stu, state);
  assert.ok(status.includes("电话家访") || status.includes(stu.lastHomeVisit.statusLine.split("：")[0]), status);
  assert.ok((state.log || []).some((l) => l.text === r.text || (l.text || "").includes(target.name)));
  assert.deepEqual(abilityMap(state), beforeAbility);
  assert.deepEqual(examTotals(state), beforeExams);
  assert.ok((stu.relation || 0) >= rel0);
  if (coop0 != null) assert.ok(stu.parentCoop !== undefined);
  else assert.ok(stu.parentCoop > 0);
  const again = handlePhoneVisit(state, target.studentId, "watchHw");
  assert.equal(again.ok, false);

  // 当天第二通可以打给另一人，第三通不行
  const second = list.find((v) => v.studentId !== target.studentId);
  assert.ok(second);
  const r2 = handlePhoneVisit(state, second.studentId, "goodFirst");
  assert.equal(r2.ok, true, r2.reason);
  assert.equal(PHONE_DAY_CAP, 2);
  const third = list.find((v) => v.studentId !== target.studentId && v.studentId !== second.studentId) || suggestPhoneVisits(state)[0];
  const r3 = handlePhoneVisit(state, third.studentId, "restFirst");
  assert.equal(r3.ok, false);
  assert.match(phoneVisitUnavailableReason(state), /通/);

  // 请假在家可以打电话
  const cls = playerStudents(state);
  let leaveDate = "2017-09-04";
  let away = [];
  for (let i = 0; i < 30; i++) {
    if (isDutyDay(leaveDate) && weekday(leaveDate) !== 0) {
      away = cls.filter((s) => leaveCovering(s, leaveDate, state.seed));
      if (away.length) break;
    }
    leaveDate = addDays(leaveDate, 1);
  }
  assert.ok(away.length, "应能找到请假在家的学生");
  goOffice(state, leaveDate);
  // 若当天名额已用完，跳到下一个坐班日再打
  if (!isPhoneVisitOpen(state)) {
    leaveDate = addDays(leaveDate, 1);
    while (weekday(leaveDate) === 0) leaveDate = addDays(leaveDate, 1);
    goOffice(state, leaveDate);
    away = cls.filter((s) => leaveCovering(s, leaveDate, state.seed));
  }
  if (away.length && isPhoneVisitOpen(state)) {
    const ab2 = abilityMap(state);
    const leaveStu = away[0];
    const rl = handlePhoneVisit(state, leaveStu.id, "restFirst");
    assert.equal(rl.ok, true, rl.reason);
    assert.ok(rl.text.includes(leaveStu.name));
    assert.deepEqual(abilityMap(state), ab2);
  }

  // 学期电话上限
  goOffice(state, "2017-09-11");
  ensureHomeVisitState(state);
  state.homeVisit.phoneCount = PHONE_TERM_CAP;
  assert.equal(isPhoneVisitOpen(state), false);
  assert.match(phoneVisitUnavailableReason(state), /这学期/);
});

test("存档往返后家访记录仍在", () => {
  const a = createGame(20170901);
  prepareLesson(a, { topic: "集合与逻辑用语", depth: 2, homework: "中" });
  teach(a, "精讲例题");
  goOffice(a, "2017-09-04");
  const target = suggestPhoneVisits(a)[0];
  const r = handlePhoneVisit(a, target.studentId, "goodFirst");
  assert.equal(r.ok, true, r.reason);
  goSunday(a, "2017-09-10");
  const door = suggestDoorVisits(a)[0];
  const d = handleDoorVisit(a, door.studentId, "encourage");
  assert.equal(d.ok, true, d.reason);
  const b = fromJSON(toJSON(a));
  assert.equal(b.date, a.date);
  const stuA = playerStudents(a).find((s) => s.id === target.studentId);
  const stuB = playerStudents(b).find((s) => s.id === target.studentId);
  assert.equal(stuB.lastHomeVisit.kind, "phone");
  assert.equal(stuB.lastHomeVisit.text, stuA.lastHomeVisit.text);
  assert.ok((stuB.homeVisits || []).some((x) => x.kind === "phone"));
  const doorA = playerStudents(a).find((s) => s.id === door.studentId);
  const doorB = playerStudents(b).find((s) => s.id === door.studentId);
  assert.equal(doorB.lastHomeVisit.kind, "door");
  assert.equal(doorB.lastHomeVisit.text, doorA.lastHomeVisit.text);
  assert.equal(b.homeVisit.phoneCount, a.homeVisit.phoneCount);
  assert.equal(b.homeVisit.doorCount, a.homeVisit.doorCount);
  const again = handleDoorVisit(b, door.studentId, "encourage");
  assert.equal(again.ok, false);
});

test("自动推进能越过带家访名额的周日到达考试或期末", () => {
  const state = createGame(20170901);
  goSunday(state, "2017-09-03");
  assert.equal(isDoorVisitOpen(state), true, doorVisitUnavailableReason(state));
  const r = skipToNextStage(state);
  assert.equal(r.ok, true, r.reason);
  assert.ok(state.date >= "2017-10-16", `应越过周日到达第一次月考或更后，当前 ${state.date}`);
  assert.ok(majorEventOn(state.date) || (state.exams && Object.keys(state.exams).length), "应落到考试或已结算考试");

  const mid = createGame(20170901);
  goSunday(mid, "2017-09-03");
  assert.equal(isDoorVisitOpen(mid), true);
  skipUntil(mid, (s) => s.date >= "2018-01-16", 40);
  assert.ok(mid.date >= "2018-01-16", `应能推进到期末，当前 ${mid.date}`);

  // 按天下一天也不应卡在有名额的周日
  const day = createGame(20170901);
  day.date = "2017-09-02";
  day.periodId = "noon";
  const stepped = advanceDay(day);
  assert.ok(stepped);
  assert.equal(day.date, "2017-09-03");
  assert.equal(isDoorVisitOpen(day), true);
  const next = advanceDay(day);
  assert.ok(next);
  assert.equal(day.date, "2017-09-04");
});

test("办公室、教室、班级管理和档案界面有电话与上门家访入口", () => {
  const src = readFileSync(new URL("../js/ui/app.js", import.meta.url), "utf8");
  assert.match(src, /function phoneVisitPanelHtml\s*\(/);
  assert.match(src, /function doorVisitPanelHtml\s*\(/);
  assert.match(src, /电话家访/);
  assert.match(src, /上门家访/);
  assert.match(src, /data-phone-visit/);
  assert.match(src, /data-phone-act/);
  assert.match(src, /data-door-visit/);
  assert.match(src, /data-door-act/);
  assert.match(src, /handlePhoneVisit/);
  assert.match(src, /handleDoorVisit/);
  assert.match(src, /家访记录/);
  const officeFn = src.slice(src.indexOf("function officeCollabHtml"), src.indexOf("function bindOfficeActions"));
  assert.match(officeFn, /phoneVisitPanelHtml\(\)/);
  const classFn = src.slice(src.indexOf("function viewClassroom"), src.indexOf("function viewRoster"));
  assert.match(classFn, /doorVisitPanelHtml\(\)/);
  const manageFn = src.slice(src.indexOf("function viewClassManage"), src.indexOf("function viewTeach"));
  assert.match(manageFn, /doorVisitPanelHtml/);
  const teachFn = src.slice(src.indexOf("function viewTeach"), src.indexOf("function viewPlacement"));
  assert.match(teachFn, /doorVisitPanelHtml\(\)/);
  assert.match(teachFn, /officeCollabHtml\(\)/);
});
