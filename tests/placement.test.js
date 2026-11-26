import test from "node:test";
import assert from "node:assert/strict";
import { generateCohort } from "../js/domain/school.js";
import { firstPlacement, secondPlacement, rebuildClasses } from "../js/domain/placement.js";
import { runExam } from "../js/domain/examService.js";

test("第一次分班：文理分科 + 梯队调整；0/1 不按普通淘汰踢出实验班", () => {
  let c = generateCohort(2017, 5);
  const exam = runExam(c, { id: "f", name: "期末", examKind: "final", difficulty: 1, dispersion: 1, date: "2018-01-16" }, { grade: 1, split: false });
  const origin0 = new Set(c.students.filter((s) => s.classNo === 0).map((s) => s.id));
  const p = firstPlacement(c.students, exam.scoreMap, { seed: 5 });
  const next0 = p.students.filter((s) => s.classNo === 0);
  const next1 = p.students.filter((s) => s.classNo === 1);
  assert.ok(next0.every((s) => s.track === "li"));
  assert.ok(next1.every((s) => s.track === "wen"));
  // 原 0 班选理的人仍在 0 班，不会掉到卓行
  for (const s of p.students) {
    if (origin0.has(s.id) && s.track === "li") assert.equal(s.classNo, 0);
    if (origin0.has(s.id) && s.track === "wen") assert.equal(s.classNo, 1);
  }
  assert.ok(p.students.some((s) => s.classNo === 16 && s.track === "li"));
  assert.equal(p.type, "first");
});

test("第二次分班只在同科类同梯队内重组，不重新分文理、不跨梯队", () => {
  let c = generateCohort(2017, 5);
  const e1 = runExam(c, { id: "f", name: "期末", examKind: "final", difficulty: 1, dispersion: 1, date: "2018-01-16" }, { grade: 1, split: false });
  const p1 = firstPlacement(c.students, e1.scoreMap, { seed: 5 });
  c = { ...c, students: p1.students, classes: rebuildClasses(p1.students) };
  const e2 = runExam(c, { id: "f2", name: "下期末", examKind: "final", difficulty: 1.02, dispersion: 1.05, date: "2018-06-25" }, { grade: 1, split: true });
  const before = Object.fromEntries(c.students.map((s) => [s.id, { track: s.track, tier: s.tier, classNo: s.classNo }]));
  const p2 = secondPlacement(c.students, e2.scoreMap, { seed: 9 });
  assert.equal(p2.type, "second");
  for (const s of p2.students) {
    const b = before[s.id];
    if (!b) continue;
    if (s.repeat) continue;
    assert.equal(s.track, b.track, "不得再分文理");
    if (b.classNo === 0 || b.classNo === 1) assert.equal(s.classNo, b.classNo, "0/1 保持稳定");
    else if (b.tier !== "yiti") assert.equal(s.tier, b.tier, "不跨梯队");
  }
});
