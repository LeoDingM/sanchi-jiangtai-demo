import test from "node:test";
import assert from "node:assert/strict";
import { generateCohort } from "../js/domain/school.js";
import { firstPlacement, rebuildClasses } from "../js/domain/placement.js";
import { runExam } from "../js/domain/examService.js";
import { admitCohort } from "../js/domain/admission.js";

const SEEDS = [20170901, 7, 99, 2020, 42, 11, 13, 88, 1001, 314, 2024, 55];

function placed(seed) {
  let c = generateCohort(2017, seed);
  const pre = runExam(c, { id: "pre", name: "预", examKind: "final", difficulty: 1, dispersion: 1, date: "2018-01-16" }, { grade: 1, split: false });
  c = { ...c, students: firstPlacement(c.students, pre.scoreMap, { seed }).students };
  c.classes = rebuildClasses(c.students);
  return c;
}

function classFirsts(rows, classNo) {
  const mine = rows.filter((r) => !r.repeat && Number(r.classNo) === Number(classNo));
  if (!mine.length) return null;
  return mine.slice().sort((a, b) => b.total - a.total || String(a.studentId).localeCompare(String(b.studentId)))[0];
}

test("多种子：全校第一通常出自 0 班，0 班第一显著高于重点/凌霄第一，前十统治全校前列，文科清北稀缺但可见", () => {
  let schoolFirstFrom0 = 0;
  let firstBeatsKeyLx = 0;
  const top20Shares = [];
  let wenQingbeiYears = 0;
  let maxWenQingbei = 0;
  let maxClass0Qingbei = 0;
  const notes = [];

  for (const seed of SEEDS) {
    const c = placed(seed);
    const gk = runExam(c, {
      id: "gk", name: "高考", examKind: "gaokao", difficulty: 1.003, dispersion: 1, date: "2020-06-07",
    }, { grade: 3, split: true });
    const liRows = (gk.rows || []).filter((r) => !r.repeat && r.track !== "wen");
    const ranked = liRows.slice().sort((a, b) => b.total - a.total || (b.math ?? 0) - (a.math ?? 0) || String(a.studentId).localeCompare(String(b.studentId)));
    const first = ranked[0];
    if (first && Number(first.classNo) === 0) schoolFirstFrom0 += 1;

    const c0 = classFirsts(liRows, 0);
    const keyFirsts = [2, 3, 4].map((no) => classFirsts(liRows, no)).filter(Boolean);
    const lxNos = [...new Set(liRows.filter((r) => r.tier === "lingxiao").map((r) => r.classNo))];
    const lxFirsts = lxNos.map((no) => classFirsts(liRows, no)).filter(Boolean);
    const bestKey = keyFirsts.length ? Math.max(...keyFirsts.map((r) => r.total)) : 0;
    const bestLx = lxFirsts.length ? Math.max(...lxFirsts.map((r) => r.total)) : 0;
    if (c0 && c0.total > bestKey && c0.total > bestLx) firstBeatsKeyLx += 1;

    const top20 = ranked.slice(0, 20);
    const share = top20.filter((r) => Number(r.classNo) === 0).length;
    top20Shares.push(share);

    const ads = admitCohort(c.students.filter((s) => !s.repeat), gk.scoreMap, 2020, { seed, date: "2020-06-07" });
    const byId = new Map(c.students.map((s) => [s.id, s]));
    const qb = ads.filter((a) => a.qingbei);
    const class0Qb = qb.filter((a) => Number(a.classNo) === 0).length;
    const wenQb = qb.filter((a) => {
      const s = byId.get(a.studentId);
      return a.track === "wen" || s?.track === "wen";
    }).length;
    maxClass0Qingbei = Math.max(maxClass0Qingbei, class0Qb);
    maxWenQingbei = Math.max(maxWenQingbei, wenQb);
    if (wenQb > 0) wenQingbeiYears += 1;
    notes.push(`seed ${seed}: first=${first?.classNo}班 ${first?.total}，0班第一 ${c0?.total} vs 重点${bestKey} 凌霄${bestLx}，前20里0班 ${share}，清北 0班${class0Qb} 文科${wenQb}`);

    assert.ok(class0Qb <= 3, `种子${seed} 0 班清北应不超过 3，实际 ${class0Qb}`);
    assert.ok(wenQb <= 2, `种子${seed} 文科清北应不超过 2，实际 ${wenQb}`);
  }

  const midShare = top20Shares.slice().sort((a, b) => a - b)[Math.floor((top20Shares.length - 1) / 2)];
  assert.ok(schoolFirstFrom0 >= 10, `12 个种子里理科全校第一应由 0 班拿下大多数，实际 ${schoolFirstFrom0}/12。${notes.join(" | ")}`);
  assert.ok(firstBeatsKeyLx >= 10, `0 班第一应显著高于同届重点各班第一和凌霄各班第一，实际 ${firstBeatsKeyLx}/12。${notes.join(" | ")}`);
  assert.ok(midShare >= 8, `全校理科前 20 里 0 班应占很大一块，中位 ${midShare}，各种子 ${top20Shares.join(",")}`);
  assert.ok(wenQingbeiYears >= 3, `12 个种子里应至少有若干档出现文科清北，实际 ${wenQingbeiYears} 档，单档最多 ${maxWenQingbei}。${notes.join(" | ")}`);
  assert.ok(maxClass0Qingbei <= 3, `0 班清北帽被突破，最大 ${maxClass0Qingbei}`);
});
