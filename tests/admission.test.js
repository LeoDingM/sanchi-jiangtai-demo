import test from "node:test";
import assert from "node:assert/strict";
import { generateCohort } from "../js/domain/school.js";
import { firstPlacement, rebuildClasses } from "../js/domain/placement.js";
import { runExam } from "../js/domain/examService.js";
import { admitCohort } from "../js/domain/admission.js";
import { provincialLines } from "../js/domain/jiangxi.js";

test("2020 年录取：达线才进对应批次，清北必须达到公开投档线", () => {
  let c = generateCohort(2017, 20170901);
  const pre = runExam(c, { id: "pre", name: "预", examKind: "final", difficulty: 1, dispersion: 1, date: "2018-01-16" }, { grade: 1, split: false });
  c = { ...c, students: firstPlacement(c.students, pre.scoreMap, { seed: 20170901 }).students, classes: null };
  c.classes = rebuildClasses(c.students);
  const gk = runExam(c, { id: "gk", name: "高考", examKind: "gaokao", difficulty: 1.003, dispersion: 1, date: "2020-06-07" }, { grade: 3, split: true });
  const ads = admitCohort(c.students.filter((s) => !s.repeat), gk.scoreMap, 2020);
  const linesLi = provincialLines(2020, "li");
  const linesWen = provincialLines(2020, "wen");
  for (const a of ads) {
    const L = a.track === "wen" ? linesWen : linesLi;
    if (a.batch === "一批") assert.ok(a.total >= L.first, `${a.name} ${a.total} < ${L.first}`);
    if (a.batch === "二批") assert.ok(a.total >= L.second && a.total < L.first);
    if (a.qingbei) {
      const need = a.track === "wen" ? 644 : 686;
      assert.ok(a.total >= need, `清北 ${a.name} ${a.total} 未达 ${need}`);
      assert.match(a.university, /清华大学|北京大学/);
    }
  }
  const qb = ads.filter((a) => a.qingbei);
  assert.ok(qb.length <= 4, `清北人数应稀缺，实际 ${qb.length}`);
});
