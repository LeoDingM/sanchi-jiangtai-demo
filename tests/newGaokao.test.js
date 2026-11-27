import test from "node:test";
import assert from "node:assert/strict";
import { generateCohort } from "../js/domain/school.js";
import { firstPlacement } from "../js/domain/placement.js";
import { runExam } from "../js/domain/examService.js";
import { subjectsFor, usesComprehensive, displayScoreColumns } from "../js/domain/scores.js";
import {
  JIANGXI_NEW_GAOKAO_FIRST_YEAR, JIANGXI_NEW_GAOKAO_FIRST_ENTRY,
  isNewGaokaoYear, cohortIsNewGaokao, assignByOfficialRule,
  pickElectives, examUsesNewGaokaoSubjects, NEW_GAOKAO_SOURCE, ASSIGN_SOURCE,
  ensureCohortElectives,
} from "../js/domain/newGaokao.js";
import { provincialLines, officialProvincialPack, gaokaoScheme } from "../js/domain/jiangxi.js";

test("江西新高考官方时间表：2024 年首考，2021–2023 仍为旧文理高考", () => {
  assert.equal(JIANGXI_NEW_GAOKAO_FIRST_YEAR, 2024);
  assert.equal(JIANGXI_NEW_GAOKAO_FIRST_ENTRY, 2021);
  assert.equal(isNewGaokaoYear(2023), false);
  assert.equal(isNewGaokaoYear(2024), true);
  assert.equal(cohortIsNewGaokao(2020), false);
  assert.equal(cohortIsNewGaokao(2021), true);
  assert.equal(gaokaoScheme(2021), "wenli-batches");
  assert.equal(gaokaoScheme(2023), "wenli-batches");
  assert.equal(gaokaoScheme(2024), "new-3+1+2");
  assert.match(NEW_GAOKAO_SOURCE, /赣府发〔2021〕20号/);
  assert.match(NEW_GAOKAO_SOURCE, /2024/);
  // 2021–2023 官方线仍是文理一批/二批，不得提前改成特控/本科线口径。
  assert.equal(provincialLines(2023, "li").first, 518);
  assert.equal(provincialLines(2023, "li").second, 445);
  const y23 = officialProvincialPack(2023);
  assert.equal(y23.scheme, "wenli-batches");
  assert.equal(y23.official, true);
  assert.equal(y23.firstLabel, "一本");
  const y24 = officialProvincialPack(2024);
  assert.equal(y24.scheme, "new-3+1+2");
  assert.equal(y24.firstLabel, "特殊类型招生控制线");
  assert.equal(y24.li.first, 520);
  assert.equal(y24.li.second, 448);
});

test("等级赋分遵循赣教规字〔2021〕17号比例、区间和例题公式", () => {
  // 官方例：原始 75，B 等原始区间 82–61，赋分区间 85–71，结果约 80。
  const raws = [];
  for (let i = 0; i < 15; i++) raws.push(90); // A
  for (let i = 0; i < 20; i++) raws.push(82);
  raws.push(75);
  for (let i = 0; i < 14; i++) raws.push(61);
  for (let i = 0; i < 35; i++) raws.push(50); // C
  for (let i = 0; i < 13; i++) raws.push(40); // D
  for (let i = 0; i < 2; i++) raws.push(20); // E
  assert.equal(raws.length, 100);
  const out = assignByOfficialRule(raws);
  const hit = out[raws.indexOf(75)];
  assert.equal(hit.grade, "B");
  assert.equal(hit.assigned, 80);
  assert.ok(out.every((x) => x.assigned >= 30 && x.assigned <= 100));
  assert.match(ASSIGN_SOURCE, /赣教规字〔2021〕17号/);
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

test("2024 年起新高考：选科 3+1+2，不再出现理综文综或旧文理一本二本制度", () => {
  const c = generateCohort(2021, 20210901, { alreadySplit: false });
  const pre = runExam(c, { id: "final1", name: "期末", examKind: "final", difficulty: 1, dispersion: 1, date: "2022-01-16" }, { grade: 1, split: false, seed: 7 });
  const p = firstPlacement(c.students, pre.scoreMap, { seed: 7 });
  c.students = p.students;
  c.trackSplit = true;
  for (const s of c.students) {
    assert.ok(s.track === "li" || s.track === "wen");
  }
  // 选科在分班后写入
  ensureCohortElectives(c.students, 7);
  const combos = new Set(c.students.map((s) => `${s.electives.first}+${(s.electives.seconds || []).slice().sort().join("/")}`));
  assert.ok(combos.size >= 4, `选科组合应多于文理两种，实际 ${combos.size}：${[...combos].join("，")}`);
  for (const s of c.students) {
    assert.equal(s.electives.seconds.length, 2);
    assert.equal(s.electives.first === "history" ? "wen" : "li", s.track);
  }

  const gk = runExam(c, { id: "gk", name: "高考", examKind: "gaokao", difficulty: 1, dispersion: 1, date: "2024-06-07", year: 2024 }, { grade: 3, split: true, seed: 7 });
  assert.equal(gk.scheme, "new-3+1+2");
  assert.ok(gk.assignNote);
  assert.match(gk.assignNote, /赣教规字〔2021〕17号/);
  assert.ok(gk.rows.every((r) => r.maxTotal === 750));
  assert.ok(gk.rows.every((r) => r.subjects.length === 6));
  assert.ok(gk.rows.every((r) => r.subjects.includes("chinese") && r.subjects.includes("math") && r.subjects.includes("english")));
  assert.ok(gk.rows.every((r) => r.subjects.includes("physics") || r.subjects.includes("history")));
  assert.ok(gk.rows.every((r) => !r.subjects.includes("lizong") && !r.subjects.includes("wenzong")));
  assert.equal(gk.rows.some((r) => r.lizong != null || r.wenzong != null), false);
  const cols = displayScoreColumns(gk.scale, "li", gk.subjectIds, { scheme: gk.scheme });
  assert.ok(!cols.some((c) => c.id === "lizong" || c.id === "wenzong"));
  assert.ok(cols.some((c) => c.kind === "assigned"));
  const assignedIds = ["chemistry", "biology", "politics", "geography"];
  const someAssigned = gk.rows.filter((r) => assignedIds.some((id) => r.assign?.[id]));
  assert.ok(someAssigned.length > 100);
  for (const r of someAssigned) {
    for (const id of assignedIds) {
      if (!r.assign?.[id]) continue;
      assert.ok(r.assign[id].assigned >= 30 && r.assign[id].assigned <= 100);
      assert.equal(r[id], r.assign[id].assigned);
      assert.ok(r[`${id}Raw`] != null);
    }
  }
  assert.equal(officialProvincialPack(2024).li.first, 520);
  assert.equal(subjectsFor("gaokao-750", "li", { scheme: "new-3+1+2", electives: { first: "physics", seconds: ["chemistry", "biology"] } }).some((s) => s.id === "lizong"), false);
});

test("选科可复现；旧届生成不会被提前改成新高考科目", () => {
  const a = generateCohort(2021, 11, { alreadySplit: true });
  const b = generateCohort(2021, 11, { alreadySplit: true });
  assert.deepEqual(
    a.students.map((s) => [s.id, s.electives]),
    b.students.map((s) => [s.id, s.electives]),
  );
  const oldC = generateCohort(2018, 11, { alreadySplit: true });
  const mid = runExam(oldC, { id: "gk", name: "高考", examKind: "gaokao", difficulty: 1, dispersion: 1, date: "2021-06-07", year: 2021 }, { grade: 3, split: true, seed: 11 });
  assert.equal(mid.scheme, "wenli-batches");
  assert.ok(mid.rows.some((r) => r.subjects.includes("physics") && r.subjects.includes("chemistry") && r.subjects.includes("biology")));
  assert.equal(provincialLines(2021, "li").first, 519);
});
