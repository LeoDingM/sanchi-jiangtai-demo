import test from "node:test";
import assert from "node:assert/strict";
import { buildCalendar } from "../js/domain/calendar.js";
import { generateCohort } from "../js/domain/school.js";
import { firstPlacement, rebuildClasses } from "../js/domain/placement.js";
import { runExam } from "../js/domain/examService.js";

test("校历从 2017 年 9 月起，含月考/期中/期末/联考/模拟/高考与两次分班、升学", () => {
  const ev = buildCalendar(2017, 2021);
  assert.ok(ev[0].date >= "2017-09-01");
  const kinds = new Set(ev.map((e) => e.kind + ":" + (e.examKind || "")));
  for (const k of ["exam:monthly", "exam:midterm", "exam:final", "exam:city", "exam:province", "exam:mock1", "exam:gaokao", "placement1:", "placement2:", "admission:", "promote:"]) {
    assert.ok([...ev.map((e) => e.kind + ":" + (e.examKind || ""))].some((x) => x.startsWith(k.replace(/:$/, "")) || x === k || x.startsWith(k.slice(0, -1))), k);
  }
  assert.ok(ev.some((e) => e.kind === "placement1"));
  assert.ok(ev.some((e) => e.kind === "placement2"));
  assert.ok(ev.some((e) => e.examKind === "gaokao" && e.date.startsWith("2020-06")));
});

test("不同场次难度不同，一本/二本线随难度明显波动，分差为数十分而非几分", () => {
  let c = generateCohort(2017, 3);
  const pre = runExam(c, { id: "pre", name: "预", examKind: "final", difficulty: 1, dispersion: 1, date: "2018-01-16" }, { grade: 1, split: false });
  const p = firstPlacement(c.students, pre.scoreMap, { seed: 3 });
  c = { ...c, students: p.students, classes: rebuildClasses(p.students) };
  const exams = buildCalendar(2019, 2021).filter((e) => e.examKind && e.grades?.includes(3) && e.examKind !== "quiz").slice(0, 8);
  const gaps = [], firsts = [], tops = [], topIds = [];
  for (const e of exams) {
    const r = runExam(c, e, { grade: 3, split: true });
    const cut = r.cutoffs.li;
    gaps.push(cut.firstLine - cut.secondLine);
    firsts.push(cut.firstLine);
    tops.push(cut.topGap);
    topIds.push(cut.topId);
  }
  const uniqDiff = new Set(exams.map((e) => e.difficulty.toFixed(3)));
  assert.ok(uniqDiff.size >= 4, "难度应随场次变化");
  assert.ok(Math.max(...firsts) - Math.min(...firsts) >= 15, `一本线应随难度明显波动，实际 ${Math.min(...firsts)}–${Math.max(...firsts)}`);
  assert.ok(Math.min(...gaps) >= 25, `一本二本分差过小 ${Math.min(...gaps)}`);
  assert.ok(Math.max(...gaps) >= 40);
  assert.ok(Math.max(...tops) - Math.min(...tops) >= 4, "第一第二名分差应有弹性");
  assert.ok(new Set(topIds).size >= 2, "第一名不应场场都是同一人");
});
