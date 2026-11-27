import test from "node:test";
import assert from "node:assert/strict";
import { createGame, runScheduledExam, playerStudents } from "../js/domain/simulation.js";
import { runExam, applyExamIntegrity, resolveExamIntegrity, recomputeExamDerived } from "../js/domain/examService.js";
import {
  cheatAttempt, investigateCheat, applyBoostToRow, restoreCheatedRow,
  composeDisciplineNotice, resumeDisciplineLine, isSchoolExamKind, formatDiscipline,
} from "../js/domain/cheating.js";

test("高考会考和官方联考不做校内作弊处分，校本考试才会进入模型", () => {
  assert.equal(isSchoolExamKind("gaokao"), false);
  assert.equal(isSchoolExamKind("huikao"), false);
  assert.equal(isSchoolExamKind("city"), false);
  assert.equal(isSchoolExamKind("province"), false);
  assert.equal(isSchoolExamKind("monthly"), true);
  assert.equal(isSchoolExamKind("midterm"), true);
  assert.equal(isSchoolExamKind("final"), true);
  const s = { id: "x", name: "甲", ability: { math: 80 }, stress: 80, stability: 30, tier: "duxue" };
  assert.equal(cheatAttempt(s, { id: "gk", examKind: "gaokao", date: "2020-06-07" }, 1), null);
});

test("作弊少见、可复现；未查实不出公告，查实后取消作弊分并记处分", () => {
  const exam = { id: "m1", examId: "m1", examName: "三月月考", examKind: "monthly", date: "2018-03-12", maxTotal: 750 };
  const students = [];
  for (let i = 0; i < 200; i++) {
    students.push({
      id: `s${i}`, name: `生${i}`, classNo: 16, tier: "zhuoxing",
      ability: { math: 50 + (i % 20) }, stress: 40 + (i % 40), stability: 35 + (i % 30),
    });
  }
  const attempts = students.map((s) => cheatAttempt(s, exam, 99)).filter(Boolean);
  assert.ok(attempts.length >= 1 && attempts.length <= 12, `200 人应偶发而不是成批，实际 ${attempts.length}`);
  assert.deepEqual(
    students.map((s) => cheatAttempt(s, exam, 99)?.boost || 0),
    students.map((s) => cheatAttempt(s, exam, 99)?.boost || 0),
  );

  const cheater = students.find((s) => cheatAttempt(s, exam, 99));
  const attempt = cheatAttempt(cheater, exam, 99);
  const row = {
    studentId: cheater.id, name: cheater.name, classNo: 16, track: "li",
    total: 500, math: 90, chinese: 100, english: 100, lizong: 210,
    subjects: ["math", "chinese", "english", "lizong"], maxTotal: 750, rank: 3,
  };
  const boosted = applyBoostToRow(row, attempt.boost, cheater, exam, 99);
  assert.ok(boosted.total > row.total);
  assert.equal(boosted.cheat.rawTotal, 500);
  const verdict = investigateCheat(cheater, exam, attempt, 99);
  if (!verdict.substantiated) {
    assert.ok(verdict.status === "unreported" || verdict.status === "unsubstantiated");
    // 未查实：不得出公告、不得把处分写进履历用语。
    assert.doesNotMatch(JSON.stringify(verdict), /警告|记过/);
  } else {
    const notice = composeDisciplineNotice({ ...verdict, name: cheater.name, classNo: 16, studentId: cheater.id }, exam, cheater);
    assert.match(notice.body, /宁川中学|教务处|该生|警告|记过|处分/);
    assert.match(notice.source, /宁川中学教务处/);
    assert.doesNotMatch(notice.body, /省教育考试院处分/);
    const restored = restoreCheatedRow({ ...boosted, cheat: { ...boosted.cheat, ...verdict } });
    assert.equal(restored.total, 500);
    assert.equal(restored.cheat.voided, true);
    assert.equal(restored.scoreStatus, "voided-cheat");
    assert.match(resumeDisciplineLine(notice), /作弊查实/);
    assert.match(formatDiscipline(verdict.discipline), /警告|记过/);
  }
});

test("applyExamIntegrity 不改高考，校本查实后重排且假高分不再留在榜上", () => {
  const game = createGame(20170901);
  const c = game.cohorts[game.player.cohortYear];
  const ev = { id: "monthly-1", name: "月考", examKind: "monthly", difficulty: 1, dispersion: 1, date: "2017-10-15" };
  const raw = runExam(c, ev, { grade: 1, split: false });
  const before = Object.fromEntries(raw.rows.map((r) => [r.studentId, r.total]));
  const after = applyExamIntegrity(raw, c.students, { seed: 20170901 });
  assert.equal(after.integrityApplied, true);
  applyExamIntegrity(after, c.students, { seed: 20170901 });
  assert.deepEqual(Object.fromEntries(after.rows.map((r) => [r.studentId, r.total])), Object.fromEntries(after.rows.map((r) => [r.studentId, r.total])));

  const gk = runExam(c, { id: "gk", name: "高考", examKind: "gaokao", difficulty: 1, dispersion: 1, date: "2020-06-07" }, { grade: 3, split: true });
  const gk2 = applyExamIntegrity(gk, c.students, { seed: 1 });
  assert.equal(gk2.rows.some((r) => r.cheat), false);

  const pending = (after.rows || []).filter((r) => r.cheat?.substantiated && !r.cheat.voided);
  if (pending.length) {
    const inflated = pending.map((r) => r.total);
    const res = resolveExamIntegrity(after, { today: "2018-01-01", students: c.students, notices: [], force: true });
    assert.ok(res.changed);
    for (let i = 0; i < pending.length; i++) {
      const row = res.report.rows.find((r) => r.studentId === pending[i].studentId);
      assert.ok(row.total <= inflated[i]);
      assert.equal(row.cheat.voided, true);
    }
    const tops = res.report.rows.slice().sort((a, b) => b.total - a.total);
    assert.ok(tops.every((r) => r.scoreStatus !== "voided-cheat" || r.total === r.cheat.rawTotal));
    assert.ok(res.notices.length >= 1);
    assert.match(res.notices[0].body, /教务处|处分/);
  }
  assert.ok(typeof before === "object");
});
