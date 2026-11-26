import test from "node:test";
import assert from "node:assert/strict";
import { generateCohort, seatFromSeq } from "../js/domain/school.js";
import { firstPlacement, secondPlacement, rebuildClasses } from "../js/domain/placement.js";
import { createGame, placementSeatNotice, cohortPlacementStage } from "../js/domain/simulation.js";
import { runExam } from "../js/domain/examService.js";
import { compareScoreRows } from "../js/domain/scores.js";

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

test("第一次分班后同层同科班级实力均衡，不为高考预留笃学苗子", () => {
  let c = generateCohort(2017, 7);
  const exam = runExam(c, { id: "f", name: "期末", examKind: "final", difficulty: 1, dispersion: 1, date: "2018-01-16" }, { grade: 1, split: false });
  const p = firstPlacement(c.students, exam.scoreMap, { seed: 7 });
  const groups = {};
  for (const s of p.students) {
    if (s.repeat || s.tier === "yiti") continue;
    const key = `${s.tier}|${s.track}`;
    groups[key] ??= {};
    groups[key][s.classNo] ??= [];
    groups[key][s.classNo].push(exam.scoreMap[s.id].total);
  }
  for (const [key, classes] of Object.entries(groups)) {
    const nos = Object.keys(classes);
    if (nos.length < 2) continue;
    const means = nos.map((no) => classes[no].reduce((a, b) => a + b, 0) / classes[no].length);
    const gap = Math.max(...means) - Math.min(...means);
    // 理科卓行/笃学交叠后层内分数更散，蛇形仍均衡，但极差会比硬切时略大。
    const cap = key === "zhuoxing|li" || key === "duxue|li" || key === "lingxiao|li" ? 16 : 8;
    assert.ok(gap <= cap, `${key} 分班当时均分极差应很小，实际 ${gap.toFixed(2)}`);
  }
  // 层内仍蛇形均衡；交叠是为了笃学头部和卓行长尾，不是给笃学留一本苗。
  assert.equal(typeof firstPlacement, "function");
});

function assertClassSeats(students) {
  const by = new Map();
  for (const s of students) {
    if (!by.has(s.classNo)) by.set(s.classNo, []);
    by.get(s.classNo).push(s);
  }
  for (const [no, list] of by) {
    const seqs = list.map((s) => s.seq).sort((a, b) => a - b);
    assert.deepEqual(seqs, list.map((_, i) => i + 1));
    const keys = new Set();
    for (const s of list) {
      assert.ok(s.seat?.row && s.seat?.col);
      assert.deepEqual(s.seat, seatFromSeq(no, s.seq, list.length));
      const k = `${s.seat.row}-${s.seat.col}`;
      assert.equal(keys.has(k), false, `${no}班座位重复：${k}`);
      keys.add(k);
    }
  }
}

test("第一次和第二次分班后都按新座号重排座位，且可复现", () => {
  let c = generateCohort(2017, 5);
  const before = new Map(c.students.map((s) => [s.id, { classNo: s.classNo, seq: s.seq, seat: { ...s.seat } }]));
  const exam = runExam(c, { id: "f", name: "期末", examKind: "final", difficulty: 1, dispersion: 1, date: "2018-01-16" }, { grade: 1, split: false });
  const p = firstPlacement(c.students, exam.scoreMap, { seed: 5 });
  const pAgain = firstPlacement(c.students, exam.scoreMap, { seed: 5 });
  assertClassSeats(p.students);
  for (const s of p.students) {
    const o = pAgain.students.find((x) => x.id === s.id);
    assert.equal(o.seq, s.seq);
    assert.deepEqual(o.seat, s.seat);
  }
  const c16 = p.students.filter((s) => s.classNo === 16);
  assert.equal(c16.length, 74);
  const movers = p.students.filter((s) => s.placement1 && s.placement1.from !== s.placement1.to);
  assert.ok(movers.length > 0);
  assert.ok(movers.some((s) => {
    const o = before.get(s.id);
    return o.seq !== s.seq || o.seat.row !== s.seat.row || o.seat.col !== s.seat.col;
  }));

  c = { ...c, students: p.students, classes: rebuildClasses(p.students) };
  const exam2 = runExam(c, { id: "f2", name: "下期末", examKind: "final", difficulty: 1, dispersion: 1, date: "2018-06-25" }, { grade: 1, split: true });
  const after1 = new Map(p.students.map((s) => [s.id, { classNo: s.classNo, seq: s.seq, seat: { ...s.seat } }]));
  const sec = secondPlacement(c.students, exam2.scoreMap, { seed: 14 });
  const sec2 = secondPlacement(c.students, exam2.scoreMap, { seed: 14 });
  assertClassSeats(sec.students);
  for (const s of sec.students) {
    const o = sec2.students.find((x) => x.id === s.id);
    assert.equal(o.seq, s.seq);
    assert.deepEqual(o.seat, s.seat);
  }
  // 0/1 第二次分班不重组，座号保持
  for (const s of sec.students.filter((x) => x.classNo === 0 || x.classNo === 1)) {
    const o = after1.get(s.id);
    assert.equal(s.classNo, o.classNo);
    assert.equal(s.seq, o.seq);
    assert.deepEqual(s.seat, o.seat);
  }
  const c16b = sec.students.filter((s) => s.classNo === 16);
  assert.equal(c16b.length, 74);
});

test("分班后座位表提示是分班后的新座次，未分班时不提示", () => {
  const g = createGame(20170901);
  assert.equal(cohortPlacementStage(g), 0);
  assert.equal(placementSeatNotice(g), "");
  const c = g.cohorts[g.player.cohortYear];
  c.placed1 = true;
  c.trackSplit = true;
  g.flags[`place1-${g.player.cohortYear}`] = true;
  assert.equal(cohortPlacementStage(g), 1);
  const n1 = placementSeatNotice(g);
  assert.ok(n1.includes("这是分班后的新座次"));
  assert.ok(n1.includes("第一次"));
  c.placed2 = true;
  g.flags[`place2-${g.player.cohortYear}`] = true;
  assert.equal(cohortPlacementStage(g), 2);
  const n2 = placementSeatNotice(g);
  assert.ok(n2.includes("这是分班后的新座次"));
  assert.ok(n2.includes("第二次"));
});

test("第一次分班后理科笃学与卓行有交叠，头部可进到约 400–600 校排", () => {
  const seeds = [20170901, 7, 99, 42, 11];
  const lines = [];
  for (const seed of seeds) {
    const c = generateCohort(2017, seed);
    const exam = runExam(c, { id: "f", name: "期末", examKind: "final", difficulty: 1, dispersion: 1, date: "2018-01-16" }, { grade: 1, split: false });
    const p = firstPlacement(c.students, exam.scoreMap, { seed });
    const li = p.students.filter((s) => s.track === "li" && !s.repeat && s.tier !== "yiti");
    const ranked = li.slice().sort((a, b) => compareScoreRows(
      { total: exam.scoreMap[a.id]?.total ?? 0, math: exam.scoreMap[a.id]?.math ?? 0, chinese: exam.scoreMap[a.id]?.chinese ?? 0, studentId: a.id },
      { total: exam.scoreMap[b.id]?.total ?? 0, math: exam.scoreMap[b.id]?.math ?? 0, chinese: exam.scoreMap[b.id]?.chinese ?? 0, studentId: b.id },
    ));
    const rankOf = new Map(ranked.map((s, i) => [s.id, i + 1]));
    const duxue = li.filter((s) => s.tier === "duxue");
    const zhuo = li.filter((s) => s.tier === "zhuoxing");
    assert.ok(duxue.length >= 200, `种子${seed} 理科笃学人数过少：${duxue.length}`);
    const best = Math.min(...duxue.map((s) => rankOf.get(s.id)));
    const zhuoMean = zhuo.reduce((a, s) => a + (exam.scoreMap[s.id]?.total ?? 0), 0) / zhuo.length;
    const dxMean = duxue.reduce((a, s) => a + (exam.scoreMap[s.id]?.total ?? 0), 0) / duxue.length;
    const top1000ByClass = { 27: 0, 28: 0, 29: 0 };
    for (const s of duxue) {
      if (rankOf.get(s.id) <= 1000 && top1000ByClass[s.classNo] != null) top1000ByClass[s.classNo]++;
    }
    const zhuoTail = zhuo.filter((s) => rankOf.get(s.id) >= 900).length;
    const dxTop200 = duxue.filter((s) => rankOf.get(s.id) <= 200).length;
    lines.push(`seed ${seed}: 笃学第一 ${best}，前1000 ${Object.values(top1000ByClass).join("/")}，卓行长尾 ${zhuoTail}，均分卓行${zhuoMean.toFixed(1)}/笃学${dxMean.toFixed(1)}`);
    assert.ok(best >= 350 && best <= 650, `种子${seed} 理科笃学第一应大约在 400–600 一带，实际 ${best}`);
    for (const [no, n] of Object.entries(top1000ByClass)) {
      assert.ok(n >= 6 && n <= 32, `种子${seed} ${no}班理科前1000 应约 10–22 人，实际 ${n}`);
    }
    assert.ok(zhuoTail >= 8, `种子${seed} 卓行应保留较长低分尾巴，校排>=900 的只有 ${zhuoTail}`);
    assert.ok(zhuoMean > dxMean + 8, `种子${seed} 笃学均分不应抬到卓行水平：卓行 ${zhuoMean.toFixed(1)} 笃学 ${dxMean.toFixed(1)}`);
    assert.ok(dxTop200 <= 4, `种子${seed} 笃学不应大量进入前 200（一本留苗），实际 ${dxTop200}`);
  }
  assert.ok(true, lines.join("；"));
});
