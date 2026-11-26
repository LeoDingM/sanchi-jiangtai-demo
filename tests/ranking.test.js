import test from "node:test";
import assert from "node:assert/strict";
import { generateCohort } from "../js/domain/school.js";
import { firstPlacement, rebuildClasses } from "../js/domain/placement.js";
import { runExam } from "../js/domain/examService.js";

function placed(seed = 1) {
  let c = generateCohort(2017, seed, { alreadySplit: false });
  const pre = runExam(c, { id: "pre", name: "预", examKind: "final", difficulty: 1, dispersion: 1, date: "2018-01-16" }, { grade: 1, split: false });
  const p = firstPlacement(c.students, pre.scoreMap, { seed });
  c = { ...c, students: p.students, classes: rebuildClasses(p.students) };
  return c;
}

test("班级汇总由个人成绩计算，一本线等于第 N 名分数", () => {
  const c = placed(11);
  const report = runExam(c, { id: "gk", name: "高考", examKind: "gaokao", difficulty: 1.003, dispersion: 1, date: "2020-06-07" }, { grade: 3, split: true });
  const li = report.cutoffs.li;
  const ranked = (report.rows || []).filter((r) => !r.repeat && r.track === "li").sort((a, b) => b.total - a.total);
  assert.equal(li.firstLine, ranked[li.firstN - 1].total);
  assert.equal(li.secondLine, ranked[li.secondN - 1].total);
  const cls = report.classes.find((x) => x.classNo === 16);
  const mine = report.rows.filter((r) => r.classNo === 16);
  const avg = mine.reduce((s, r) => s + r.total, 0) / mine.length;
  assert.ok(Math.abs(avg - cls.avg) < 0.05);
  assert.equal(cls.max, Math.max(...mine.map((r) => r.total)));
  assert.equal(cls.firstCount, mine.filter((r) => r.total >= (r.track === "wen" ? report.cutoffs.wen.firstLine : li.firstLine)).length);
});

test("层次不应大面积倒挂：云岫实验均分高于凌霄，凌霄高于卓行，卓行高于笃学", () => {
  const c = placed(11);
  const report = runExam(c, { id: "gk", name: "高考", examKind: "gaokao", difficulty: 1.003, dispersion: 1, date: "2020-06-07" }, { grade: 3, split: true });
  const avg = (tier) => {
    const rows = report.rows.filter((r) => r.tier === tier && !r.repeat);
    return rows.reduce((s, r) => s + r.total, 0) / rows.length;
  };
  assert.ok(avg("yunxiu_exp") > avg("lingxiao"));
  assert.ok(avg("lingxiao") > avg("zhuoxing"));
  assert.ok(avg("zhuoxing") > avg("duxue"));
});

test("0/1 班几乎全员校内一本，卓行不是只有一两个人上线", () => {
  const c = placed(11);
  const report = runExam(c, { id: "gk", name: "高考", examKind: "gaokao", difficulty: 1.003, dispersion: 1, date: "2020-06-07" }, { grade: 3, split: true });
  const of = (tier) => report.rows.filter((r) => r.tier === tier && !r.repeat);
  const exp = of("yunxiu_exp");
  const first = exp.filter((r) => r.line === "一本").length;
  assert.ok(first / exp.length >= 0.9);
  const zx = of("zhuoxing");
  assert.ok(zx.filter((r) => r.line === "一本").length >= 8, "卓行应有多名校内一本");
});
