import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { generateCohort, eraQuality } from "../js/domain/school.js";
import { firstPlacement, rebuildClasses } from "../js/domain/placement.js";
import { runExam } from "../js/domain/examService.js";
import { subjectsFor, usesComprehensive, displayScoreColumns } from "../js/domain/scores.js";
import { eventById } from "../js/domain/calendar.js";
import {
  isNewGaokaoYear, cohortIsNewGaokao, examUsesNewGaokaoSubjects,
} from "../js/domain/newGaokao.js";
import { provincialLines, officialProvincialPack, gaokaoScheme } from "../js/domain/jiangxi.js";
import { admitCohort } from "../js/domain/admission.js";

const SEEDS = [20170901, 7, 99, 2020, 42, 11];

test("游戏内关闭 3+1+2：2024 及以后仍用旧文理高考与模拟一本/二本", () => {
  assert.equal(isNewGaokaoYear(2023), false);
  assert.equal(isNewGaokaoYear(2024), false);
  assert.equal(isNewGaokaoYear(2026), false);
  assert.equal(cohortIsNewGaokao(2020), false);
  assert.equal(cohortIsNewGaokao(2021), false);
  assert.equal(gaokaoScheme(2021), "wenli-batches");
  assert.equal(gaokaoScheme(2023), "wenli-batches");
  assert.equal(gaokaoScheme(2024), "wenli-batches");
  // 2021–2023 官方线仍是文理一批/二批。
  assert.equal(provincialLines(2023, "li").first, 518);
  assert.equal(provincialLines(2023, "li").second, 445);
  const y23 = officialProvincialPack(2023);
  assert.equal(y23.scheme, "wenli-batches");
  assert.equal(y23.official, true);
  assert.equal(y23.firstLabel, "一本");
  const y24 = officialProvincialPack(2024, { seed: 1, difficulty: 1 });
  assert.equal(y24.scheme, "wenli-batches");
  assert.equal(y24.official, false);
  assert.equal(y24.simulated, true);
  assert.equal(y24.firstLabel, "一本");
  assert.equal(y24.secondLabel, "二本");
  assert.match(y24.sourceNote, /模拟线，非正式官方省控/);
  assert.doesNotMatch(y24.sourceNote, /特殊类型|科目组|赋分|本科批次/);
});

test("2020 年旧高考结构不变：高三仍用理综/文综，不是 3+1+2", () => {
  const c = generateCohort(2017, 20170901, { alreadySplit: true, withRepeat: false });
  assert.equal(examUsesNewGaokaoSubjects(c, { examKind: "gaokao", date: "2020-06-07", year: 2020 }, { grade: 3, split: true }), false);
  const gk = runExam(c, { id: "gk", name: "高考", examKind: "gaokao", difficulty: 1, dispersion: 1, date: "2020-06-07", year: 2020 }, { grade: 3, split: true, seed: 20170901 });
  assert.equal(gk.scheme, "wenli-batches");
  const li = gk.rows.find((r) => r.track === "li");
  const wen = gk.rows.find((r) => r.track === "wen");
  assert.ok(li.subjects.includes("physics") && li.subjects.includes("chemistry") && li.subjects.includes("biology"));
  assert.ok(wen.subjects.includes("politics") && wen.subjects.includes("history") && wen.subjects.includes("geography"));
  assert.ok(usesComprehensive(gk.scale, { scheme: gk.scheme }));
  const cols = displayScoreColumns(gk.scale, "li", gk.subjectIds, { scheme: gk.scheme });
  assert.ok(cols.some((c) => c.id === "lizong"));
  assert.ok(!cols.some((c) => c.id === "biology" && c.kind === "assigned"));
});

test("2024 年高考仍用旧文理+文综理综，不启用选课赋分", () => {
  const c = generateCohort(2021, 20210901, { alreadySplit: false });
  const pre = runExam(c, { id: "final1", name: "期末", examKind: "final", difficulty: 1, dispersion: 1, date: "2022-01-16" }, { grade: 1, split: false, seed: 7 });
  const p = firstPlacement(c.students, pre.scoreMap, { seed: 7 });
  c.students = p.students;
  c.trackSplit = true;
  for (const s of c.students) {
    assert.ok(s.track === "li" || s.track === "wen");
  }
  assert.equal(examUsesNewGaokaoSubjects(c, { examKind: "gaokao", date: "2024-06-07", year: 2024 }, { grade: 3, split: true }), false);
  const gk = runExam(c, { id: "gk", name: "高考", examKind: "gaokao", difficulty: 1, dispersion: 1, date: "2024-06-07", year: 2024 }, { grade: 3, split: true, seed: 7 });
  assert.equal(gk.scheme, "wenli-batches");
  assert.ok(gk.assignNote == null);
  const li = gk.rows.find((r) => r.track === "li");
  const wen = gk.rows.find((r) => r.track === "wen");
  assert.ok(li.subjects.includes("physics") && li.subjects.includes("chemistry") && li.subjects.includes("biology"));
  assert.ok(wen.subjects.includes("politics") && wen.subjects.includes("history") && wen.subjects.includes("geography"));
  assert.ok(usesComprehensive(gk.scale, { scheme: gk.scheme }));
  const cols = displayScoreColumns(gk.scale, "li", gk.subjectIds, { scheme: gk.scheme });
  assert.ok(cols.some((c) => c.id === "lizong"));
  assert.ok(!cols.some((c) => c.kind === "assigned"));
  assert.equal(gk.rows.some((r) => r.assign && Object.keys(r.assign).length), false);
  // 即便有人误传 3+1+2 方案，科目表函数仍可被调用；游戏内高考不得走这条展示。
  assert.equal(gk.scheme === "new-3+1+2", false);
  void subjectsFor;
});

test("2021 级生成与 2021 年高考都不改成新高考科目；2021 官方一本锁定", () => {
  const a = generateCohort(2021, 11, { alreadySplit: true });
  const b = generateCohort(2021, 11, { alreadySplit: true });
  assert.deepEqual(a.students.map((s) => s.id), b.students.map((s) => s.id));
  const mid = runExam(a, { id: "gk", name: "高考", examKind: "gaokao", difficulty: 1, dispersion: 1, date: "2024-06-07", year: 2024 }, { grade: 3, split: true, seed: 11 });
  assert.equal(mid.scheme, "wenli-batches");
  assert.ok(mid.rows.some((r) => r.subjects.includes("physics") && r.subjects.includes("chemistry") && r.subjects.includes("biology")));
  const oldC = generateCohort(2018, 11, { alreadySplit: true });
  const mid21 = runExam(oldC, { id: "gk", name: "高考", examKind: "gaokao", difficulty: 1, dispersion: 1, date: "2021-06-07", year: 2021 }, { grade: 3, split: true, seed: 11 });
  assert.equal(mid21.scheme, "wenli-batches");
  assert.equal(provincialLines(2021, "li").first, 519);
});

function placedWithRepeat(entryYear, seed) {
  let c = generateCohort(entryYear, seed, { alreadySplit: false, withRepeat: true, quality: eraQuality(entryYear) });
  const pre = runExam(c, { id: "pre", name: "预", examKind: "final", difficulty: 1, dispersion: 1, date: `${entryYear + 1}-01-16` }, { grade: 1, split: false });
  const regular = c.students.filter((s) => !s.repeat);
  const reps = c.students.filter((s) => s.repeat);
  const p = firstPlacement(regular, pre.scoreMap, { seed });
  const students = [...p.students, ...reps];
  return { ...c, students, classes: rebuildClasses(students), trackSplit: true };
}

test("2024 届清北保持稀缺：全校常见很少几个，幸运年份也远到不了 15，0 班仍克制", () => {
  const rows = [];
  for (const seed of SEEDS) {
    const c = placedWithRepeat(2021, seed);
    const ev = eventById("gaokao-2024") || { id: "gaokao-2024", name: "2024年普通高考", examKind: "gaokao", date: "2024-06-07", year: 2024 };
    const gk = runExam(c, ev, { grade: 3, split: true });
    assert.equal(gk.scheme, "wenli-batches");
    const ads = admitCohort(c.students, gk.scoreMap, 2024);
    const byId = Object.fromEntries(c.students.map((s) => [s.id, s]));
    const qb = ads.filter((a) => a.qingbei);
    const qb0 = qb.filter((a) => Number(byId[a.studentId]?.classNo) === 0 && !byId[a.studentId]?.repeat).length;
    const qb1 = qb.filter((a) => Number(byId[a.studentId]?.classNo) === 1 && !byId[a.studentId]?.repeat).length;
    rows.push({ seed, n: qb.length, qb0, qb1 });
    assert.ok(qb.length <= 8, `种子${seed} 全校清北应稀缺，实际 ${qb.length}`);
    assert.ok(qb0 <= 3, `种子${seed} 0 班清北应克制，实际 ${qb0}`);
    assert.ok(qb1 <= 2, `种子${seed} 文科实验清北不应成批，实际 ${qb1}`);
  }
  const mid = rows.map((r) => r.n).sort((a, b) => a - b)[Math.floor((rows.length - 1) / 2)];
  assert.ok(mid <= 6, `2024 清北中位应是很少几个，实际 ${mid}（${rows.map((r) => `s${r.seed}:${r.n}`).join("，")}）`);
  assert.ok(Math.max(...rows.map((r) => r.n)) < 15, `幸运年份也远到不了 15，实际 ${rows.map((r) => `s${r.seed}:${r.n}`).join("，")}`);
});

test("界面与分班说明不再出现新高考、赋分、科目组或特控线说法", () => {
  const app = readFileSync(new URL("../js/ui/app.js", import.meta.url), "utf8");
  const sim = readFileSync(new URL("../js/domain/simulation.js", import.meta.url), "utf8");
  for (const [name, text] of [["app.js", app], ["simulation.js", sim]]) {
    assert.doesNotMatch(text, /特殊类型招生控制线/);
    assert.doesNotMatch(text, /物理科目组|历史科目组/);
    assert.doesNotMatch(text, /补录（不适用）/);
    assert.doesNotMatch(text, /按江西新高考 3\+1\+2/);
    assert.doesNotMatch(text, /一本与二本合并为本科批次/);
    void name;
  }
});
