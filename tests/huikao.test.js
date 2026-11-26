import test from "node:test";
import assert from "node:assert/strict";
import { generateCohort } from "../js/domain/school.js";
import { firstPlacement, rebuildClasses } from "../js/domain/placement.js";
import { runExam } from "../js/domain/examService.js";

test("高二会考只做校内合格记载，不编造省会考线或全省池", () => {
  let c = generateCohort(2017, 7);
  const pre = runExam(c, { id: "pre", name: "预", examKind: "final", difficulty: 1, dispersion: 1, date: "2018-01-16" }, { grade: 1, split: false });
  c = { ...c, students: firstPlacement(c.students, pre.scoreMap, { seed: 7 }).students };
  c.classes = rebuildClasses(c.students);
  const r = runExam(c, {
    id: "hk", name: "高二年级学业水平考试（会考）", examKind: "huikao",
    difficulty: 1, dispersion: 1, date: "2019-06-18",
    sourceNote: "校历示意日期",
  }, { grade: 2, split: true });
  assert.ok(r.huikao);
  assert.equal(r.huikao.officialLine, null);
  assert.ok(r.huikao.source.includes("未收录"));
  const n = r.rows.filter((x) => !x.repeat).length;
  const pass = r.rows.filter((x) => !x.repeat && x.huikaoPass).length;
  assert.ok(n > 0 && pass >= 0 && pass <= n);
  assert.ok(r.rows.some((x) => x.huikaoSubjects && Object.keys(x.huikaoSubjects).length >= 6));
});
