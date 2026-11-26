import test from "node:test";
import assert from "node:assert/strict";
import { generateCohort } from "../js/domain/school.js";
import { firstPlacement, secondPlacement, rebuildClasses } from "../js/domain/placement.js";
import { runExam } from "../js/domain/examService.js";
import { provincialLines } from "../js/domain/jiangxi.js";

const SEEDS = [20170901, 7, 99, 42];

function placed(seed) {
  let c = generateCohort(2017, seed);
  const pre = runExam(c, { id: "pre", name: "预", examKind: "final", difficulty: 1, dispersion: 1, date: "2018-01-16" }, { grade: 1, split: false });
  c = { ...c, students: firstPlacement(c.students, pre.scoreMap, { seed }).students };
  c.classes = rebuildClasses(c.students);
  const pre2 = runExam(c, { id: "pre2", name: "下学期期末", examKind: "final", difficulty: 1, dispersion: 1, date: "2018-06-25" }, { grade: 1, split: true });
  c = { ...c, students: secondPlacement(c.students, pre2.scoreMap, { seed: seed + 1 }).students };
  c.classes = rebuildClasses(c.students);
  return c;
}

function gapsOf(rows, line) {
  return rows.slice().sort((a, b) => b.total - a.total).map((r) => r.total - line);
}

test("理科卓行16班高考相对省控一本有明显班内分差：有人稳定高出一线，多数在线下，不是整班贴线", () => {
  const line = provincialLines(2020, "li").first;
  const lines = [];
  let sawZeroDuxue = false;
  for (const seed of SEEDS) {
    const c = placed(seed);
    const gk = runExam(c, { id: "gk", name: "高考", examKind: "gaokao", difficulty: 1.003, dispersion: 1, date: "2020-06-07" }, { grade: 3, split: true });
    const cls = (gk.rows || []).filter((r) => r.classNo === 16 && !r.repeat && r.track !== "wen");
    assert.equal(cls.length, 74, `种子${seed} 16 班应为 74 人`);
    const gaps = gapsOf(cls, line);
    const firstN = gaps.filter((g) => g >= 0).length;
    const clearlyAbove = gaps.filter((g) => g >= 15).length;
    const clearlyBelow = gaps.filter((g) => g <= -15).length;
    const near = gaps.filter((g) => Math.abs(g) <= 8).length;
    lines.push(`seed ${seed}: first ${firstN} max ${gaps[0]} p3 ${gaps[2]} med ${gaps[Math.floor((gaps.length - 1) / 2)]} min ${gaps[gaps.length - 1]} above15 ${clearlyAbove} near8 ${near}`);
    assert.ok(clearlyAbove >= 1, `种子${seed} 16 班应有人明显高出省控一本至少 15 分，最高只高 ${gaps[0]} 分`);
    assert.ok(gaps[0] >= 15 && gaps[0] <= 80, `种子${seed} 头部应明显高于线，但不应冲到清北量级，实际 ${gaps[0]}`);
    assert.ok(gaps[Math.floor((gaps.length - 1) / 2)] <= -30, `种子${seed} 中位应明显在线下，实际 ${gaps[Math.floor((gaps.length - 1) / 2)]}`);
    assert.ok(clearlyBelow >= 40, `种子${seed} 多数人应明显在线下，实际 ${clearlyBelow}`);
    assert.ok(near <= 12, `种子${seed} 不应整班挤在一本线上下 8 分，贴线 ${near} 人`);
    assert.ok(firstN >= 1 && firstN <= 9, `种子${seed} 16 班省控一本 ${firstN} 仍须落在标定范围`);
    const mid = runExam(c, { id: "mid", name: "期中", examKind: "midterm", difficulty: 1.01, dispersion: 1, date: "2019-11-15" }, { grade: 3, split: true });
    const monthly = runExam(c, { id: "m5", name: "高三月考", examKind: "monthly", difficulty: 1.01, dispersion: 1, date: "2019-10-16" }, { grade: 3, split: true });
    const absD = [];
    let highStableFlip = 0, highStableN = 0, nearFlip = 0, nearN = 0;
    for (const r of cls) {
      const m = mid.scoreMap[r.studentId];
      const mo = monthly.scoreMap[r.studentId];
      if (m) absD.push(Math.abs((m.total ?? 0) - r.total));
      if (mo) absD.push(Math.abs((mo.total ?? 0) - r.total));
      const stu = c.students.find((s) => s.id === r.studentId);
      const stable = (stu?.stability ?? 60) >= 70;
      const midPass = m && m.total >= line;
      const gkPass = r.total >= line;
      if (r.total >= line + 15 && stable) {
        highStableN += 1;
        if (m && midPass !== gkPass) highStableFlip += 1;
      }
      if (Math.abs(r.total - line) <= 10) {
        nearN += 1;
        if (m && midPass !== gkPass) nearFlip += 1;
      }
    }
    const meanAbs = absD.reduce((s, x) => s + x, 0) / absD.length;
    assert.ok(meanAbs >= 6, `种子${seed} 平时考与高考应有可见起伏，均差 ${meanAbs.toFixed(1)}`);
    assert.ok(highStableN >= 1, `种子${seed} 应有稳定且明显高于线的学生`);
    assert.ok(highStableFlip === 0, `种子${seed} 稳定且明显高于线的学生不应在期中/高考间翻面，实际 ${highStableFlip}/${highStableN}`);
    const dxFirst = (gk.rows || []).filter((r) => r.tier === "duxue" && !r.repeat && r.track !== "wen" && r.total >= line).length;
    if (dxFirst === 0) sawZeroDuxue = true;
    assert.ok(dxFirst <= 4, `种子${seed} 笃学不应留一本苗，实际 ${dxFirst}`);
  }
  assert.ok(sawZeroDuxue, `笃学须仍允许 0 一本。${lines.join("；")}`);
});

test("理科卓行各班分班后都有一名能力明显靠前的学生，笃学不被抬头部", () => {
  for (const seed of SEEDS) {
    const c = placed(seed);
    const zx = c.students.filter((s) => s.tier === "zhuoxing" && s.track === "li" && !s.repeat);
    const nos = [...new Set(zx.map((s) => s.classNo))];
    assert.ok(nos.length >= 6);
    for (const no of nos) {
      const list = zx.filter((s) => s.classNo === no);
      const means = list.map((s) => {
        const a = s.ability || {};
        const ids = ["chinese", "math", "english", "physics", "chemistry", "biology"];
        return ids.reduce((sum, id) => sum + Number(a[id] || 0), 0) / ids.length;
      });
      assert.ok(Math.max(...means) >= 73, `种子${seed} ${no}班卓行头部能力应明显靠前，实际 ${Math.max(...means).toFixed(1)}`);
    }
    const dx = c.students.filter((s) => s.tier === "duxue" && s.track === "li" && !s.repeat);
    const dxMax = Math.max(...dx.map((s) => {
      const a = s.ability || {};
      const ids = ["chinese", "math", "english", "physics", "chemistry", "biology"];
      return ids.reduce((sum, id) => sum + Number(a[id] || 0), 0) / ids.length;
    }));
    assert.ok(dxMax < 78, `种子${seed} 笃学不应被抬出一本头部，最高能力 ${dxMax.toFixed(1)}`);
  }
});
