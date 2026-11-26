import test from "node:test";
import assert from "node:assert/strict";
import { generateCohort } from "../js/domain/school.js";
import { firstPlacement, rebuildClasses } from "../js/domain/placement.js";
import { runExam } from "../js/domain/examService.js";
import { buildStudentExamSnapshot, studentExamHistory, rankInPool } from "../js/domain/studentHistory.js";
import { createGame, skipToNextStage, skipToGaokaoOf, skipToNextCohort, playerStudents, listExamReports } from "../js/domain/simulation.js";

test("班排、层次排、跨层次排、校排都由当次实考分计算", () => {
  const c = generateCohort(2017, 20170901);
  const report = runExam(c, {
    id: "m1", name: "第一次月考", examKind: "monthly",
    difficulty: 1.02, dispersion: 1, date: "2017-10-16",
  }, { grade: 1, split: false });
  const class16 = report.rows.filter((r) => r.classNo === 16 && !r.repeat)
    .sort((a, b) => b.total - a.total);
  const top = class16[0];
  const snap = buildStudentExamSnapshot(top.studentId, report);
  assert.equal(snap.total, top.total);
  assert.equal(snap.classRank, 1);
  assert.equal(snap.classN, class16.length);
  const higher = report.rows.filter((r) => !r.repeat && r.total > top.total).length;
  assert.equal(snap.schoolRank, higher + 1);
  assert.equal(snap.subjects.math.score, top.math);
  assert.ok(snap.subjects.math.school.rank >= 1);
  assert.ok(snap.cross.duxue.rank <= snap.cross.zhuoxing.rank, "放入笃学应更靠前");
  assert.ok(snap.cross.yunxiu_exp.rank >= snap.cross.zhuoxing.rank, "放入实验班应更靠后或持平");
  const again = buildStudentExamSnapshot(top.studentId, report);
  assert.deepEqual(again, snap);
});

test("rankInPool 为竞赛名次且分母含该生", () => {
  const rows = [
    { studentId: "a", total: 600 },
    { studentId: "b", total: 590 },
    { studentId: "c", total: 590 },
  ];
  const a = rankInPool(600, rows, "a");
  const b = rankInPool(590, rows, "b");
  const x = rankInPool(610, rows, "x");
  assert.equal(a.rank, 1); assert.equal(a.n, 3);
  assert.equal(b.rank, 2); assert.equal(b.n, 3);
  assert.equal(x.rank, 1); assert.equal(x.n, 4);
});

test("档案曲线使用历次真实考试，不另造统计", () => {
  const g = createGame(20170901);
  let exams = 0;
  for (let i = 0; i < 12; i++) {
    skipToNextStage(g);
    exams = listExamReports(g, { entryYear: 2017 }).length;
    if (exams >= 2) break;
  }
  assert.ok(exams >= 2, `应至少有两场考试，实际 ${exams}`);
  const sid = playerStudents(g)[0].id;
  const hist = studentExamHistory(g, sid);
  assert.ok(hist.length >= 2);
  const reports = listExamReports(g, { entryYear: 2017 });
  for (const h of hist) {
    const rep = reports.find((r) => r.examId === h.examId && r.date === h.date);
    const row = rep.rows.find((r) => r.studentId === sid);
    assert.equal(h.total, row.total);
    assert.equal(h.subjects.math.score, row.math);
  }
  const ranks = hist.map((h) => h.classRank);
  assert.ok(ranks.every((r) => r >= 1));
});

test("高考录取后一键可进入下一届，不会停在录取日", () => {
  const g = createGame(20170901);
  skipToGaokaoOf(g, 2017);
  assert.ok(g.admissions["2017|2020"]);
  const beforeYear = g.schoolYear;
  const beforeDate = g.date;
  skipToNextCohort(g);
  assert.ok(g.schoolYear > beforeYear, `学年应推进，原 ${beforeYear} 现 ${g.schoolYear}，日期 ${beforeDate}→${g.date}`);
  assert.ok(g.cohorts["2020"], "应有新高一 2020 级");
  assert.ok(g.cohorts["2018"] && g.cohorts["2019"], "原低年级应仍在校升级");
  assert.equal(g.player.cohortYear, 2020);
  assert.ok(playerStudents(g).length >= 60);
  assert.ok((g.alumni || []).length > 100);
  assert.ok(Object.values(g.cohorts).some((c) => c.students.some((s) => s.repeat || s.tier === "fuzhuo")));
});
