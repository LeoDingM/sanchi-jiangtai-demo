import test from "node:test";
import assert from "node:assert/strict";
import { createGame, playerStudents, prepareLesson, teach, talkTo, consultHomeroom, advanceDay, classLatecomers } from "../js/domain/simulation.js";
import { toJSON, fromJSON } from "../js/domain/save.js";
import { addDays } from "../js/domain/calendar.js";
import {
  leaveCovering, isDutyDay, isAwayFromClass, syncStateHealth, classAbsences, healthStatusLine,
} from "../js/domain/health.js";

function abilityMap(state) {
  const out = {};
  for (const c of Object.values(state.cohorts || {})) {
    for (const s of c.students || []) out[s.id] = { ...s.ability };
  }
  return out;
}

function findDutyAbsence(students, seed, start, span = 24) {
  let date = start;
  for (let i = 0; i < span; i++) {
    if (isDutyDay(date)) {
      const away = students.filter((s) => leaveCovering(s, date, seed) && isDutyDay(date));
      if (away.length) return { date, away };
    }
    date = addDays(date, 1);
  }
  return null;
}

function goTo(state, date, max = 30) {
  for (let i = 0; i < max && state.date !== date; i++) {
    const r = advanceDay(state);
    if (r?.settled || r?.type === "exam") {
      // 若被考试等大事拦住，再推一天
      if (state.date >= date) break;
    }
  }
  return state.date === date;
}

test("出勤日与停课日判定：周日和考试（含跨天）不到课请假，开学日仍算出勤", () => {
  assert.equal(isDutyDay("2017-09-01"), true);
  assert.equal(isDutyDay("2017-09-03"), false);
  assert.equal(isDutyDay("2017-10-16"), false);
  assert.equal(isDutyDay("2017-10-17"), false);
  assert.equal(isDutyDay("2017-09-04"), true);
});

test("默认种子下请假可复现、只影响出勤，不改学科能力；考试日仍到校", () => {
  const a = createGame(20170901);
  const b = createGame(20170901);
  const clsA = playerStudents(a);
  const hit = findDutyAbsence(clsA, a.seed, a.date);
  assert.ok(hit, "开局后不久应能遇到请病假或事假的学生");
  const idsA = hit.away.map((s) => s.id).sort();
  const idsB = playerStudents(b).filter((s) => leaveCovering(s, hit.date, b.seed) && isDutyDay(hit.date)).map((s) => s.id).sort();
  assert.deepEqual(idsA, idsB);

  const before = abilityMap(a);
  syncStateHealth(a);
  assert.deepEqual(abilityMap(a), before);

  a.date = "2017-10-16";
  syncStateHealth(a);
  for (const s of playerStudents(a)) {
    assert.equal(isAwayFromClass(s, a), false);
  }
});

test("上课时请假学生座位空着，作业记请假而非缺交，也不记正课迟到", () => {
  const s = createGame(20170901);
  const hit = findDutyAbsence(playerStudents(s), s.seed, s.date);
  assert.ok(hit);
  assert.ok(goTo(s, hit.date), `应能走到 ${hit.date}`);
  syncStateHealth(s);
  const away = classAbsences(playerStudents(s), s);
  assert.ok(away.length >= 1);
  const target = away[0];
  assert.ok(healthStatusLine(target, s).includes("不在教室") || healthStatusLine(target, s).includes("请假"));

  prepareLesson(s, { topic: "集合与逻辑用语", depth: 2, homework: "中" });
  const lesson = teach(s, "精讲例题");
  assert.equal(lesson.ok, true);
  const notes = (lesson.record?.notes || []).join("\n");
  assert.ok(notes.includes("请假"), notes);
  const row = lesson.homework.rows.find((r) => r.id === target.id);
  assert.ok(row);
  assert.equal(row.status, "请假");
  assert.equal(row.correction, "已闭环");
  assert.notEqual(row.status, "缺交");
  const late = classLatecomers(s, playerStudents(s));
  assert.ok(!late.some((x) => x.id === target.id));

  const talkFail = talkTo(s, target.id, "谈心");
  assert.equal(talkFail.ok, false);
  assert.ok(talkFail.reason.includes("请假") || talkFail.reason.includes("不在"));

  s.talksThisPeriod = 0;
  s.talksToday = 0;
  const care = talkTo(s, target.id, "关注状态");
  assert.equal(care.ok, true);
  assert.ok(care.text.includes("假") || care.text.includes("休息"));

  const brief = consultHomeroom(s);
  assert.ok(brief.ok || (brief.reason && brief.reason.includes("对过")));
  if (brief.ok) assert.ok(brief.text.includes("请假") || brief.text.includes("假条"));
});

test("旧存档读入会按当天补全请假状态，两次读档一致", () => {
  const s = createGame(20170901);
  const hit = findDutyAbsence(playerStudents(s), s.seed, s.date);
  assert.ok(goTo(s, hit.date));
  const raw = JSON.parse(toJSON(s));
  for (const c of Object.values(raw.state.cohorts)) {
    for (const stu of c.students) {
      delete stu.health;
      delete stu.healthLog;
      delete stu.justReturned;
    }
  }
  const loaded = fromJSON(raw);
  const away = classAbsences(playerStudents(loaded), loaded).map((x) => x.id).sort();
  const again = classAbsences(playerStudents(s), s).map((x) => x.id).sort();
  assert.deepEqual(away, again);
  assert.ok(away.length >= 1);
});

test("请假同步不改变卓行班数学能力均值", () => {
  const s = createGame(20170901);
  const cls = playerStudents(s);
  const snapshot = cls.map((x) => x.ability.math);
  const mean = snapshot.reduce((n, v) => n + v, 0) / snapshot.length;
  syncStateHealth(s);
  const again = playerStudents(s);
  assert.deepEqual(again.map((x) => x.ability.math), snapshot);
  const mean2 = again.reduce((n, x) => n + (x.ability.math || 0), 0) / again.length;
  assert.equal(mean2, mean);
});
