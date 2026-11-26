import test from "node:test";
import assert from "node:assert/strict";
import { generateCohort, eraQuality } from "../js/domain/school.js";
import { firstPlacement, rebuildClasses } from "../js/domain/placement.js";
import { runExam } from "../js/domain/examService.js";
import { admitCohort } from "../js/domain/admission.js";
import { eventById } from "../js/domain/calendar.js";
import { createGame } from "../js/domain/simulation.js";
import { provincialLines } from "../js/domain/jiangxi.js";
import { compressLiHighTail } from "../js/domain/scores.js";

const SEEDS = [20170901, 7, 99, 2020, 42, 11];

function placedWithRepeat(entryYear, seed) {
  let c = generateCohort(entryYear, seed, { alreadySplit: false, withRepeat: true, quality: eraQuality(entryYear) });
  const pre = runExam(c, { id: "pre", name: "预", examKind: "final", difficulty: 1, dispersion: 1, date: `${entryYear + 1}-01-16` }, { grade: 1, split: false });
  const regular = c.students.filter((s) => !s.repeat);
  const reps = c.students.filter((s) => s.repeat);
  const p = firstPlacement(regular, pre.scoreMap, { seed });
  const students = [...p.students, ...reps];
  return { ...c, students, classes: rebuildClasses(students), trackSplit: true };
}

function statsOf(entryYear, gaokaoYear, seed) {
  const c = placedWithRepeat(entryYear, seed);
  const ev = eventById(`gaokao-${gaokaoYear}`);
  const gk = runExam(c, ev, { grade: 3, split: true });
  const ads = admitCohort(c.students, gk.scoreMap, gaokaoYear);
  const first = ads.filter((a) => a.batch === "一批").length;
  const second = ads.filter((a) => a.batch === "一批" || a.batch === "二批").length;
  const qb = ads.filter((a) => a.qingbei).length;
  const over600 = ads.filter((a) => a.total >= 600).length;
  const over660 = ads.filter((a) => a.total >= 660).length;
  const li = ads.filter((a) => a.track === "li").sort((a, b) => b.total - a.total);
  return { first, second, qb, over600, over660, liMax: li[0]?.total ?? 0, li2: li[1]?.total ?? 0, ads };
}

function collect(entryYear, gaokaoYear) {
  return SEEDS.map((seed) => ({ seed, ...statsOf(entryYear, gaokaoYear, seed) }));
}

test("理科高尾压缩：压住 710，且更高原分压完后不得被更低分反超", () => {
  const exam = { id: "t" };
  const a = compressLiHighTail(710, { id: "a" }, exam);
  const b = compressLiHighTail(696, { id: "b" }, exam);
  const c = compressLiHighTail(640, { id: "c" }, exam);
  assert.ok(a < 700, `710 不应再出现，压缩后 ${a}`);
  assert.ok(a <= 686, `好年份最高应落在 680 附近，实际 ${a}`);
  assert.ok(a > b, `压缩后 710 原分仍应高于 696，实际 ${a} vs ${b}`);
  assert.equal(c, 640);
  let prev = compressLiHighTail(720, { id: "x" }, exam);
  for (let s = 719; s >= 640; s--) {
    const v = compressLiHighTail(s, { id: "x" }, exam);
    assert.ok(v <= prev + 1, `压缩应近似单调，${s + 1}→${prev} 不应远低于 ${s}→${v}`);
    prev = Math.max(prev, v) >= v ? prev : v;
    prev = v <= prev ? v : prev; // keep going; allow jitter of same id to be deterministic
    prev = v;
  }
});

test("2018 届默认种子不再把 710 与 696 都写成省排 11，且一批不再贴近 2020", () => {
  const g = createGame(20170901);
  const ev = eventById("gaokao-2018");
  const gk = runExam(g.cohorts[2015], ev, { grade: 3, split: true });
  const ads = admitCohort(g.cohorts[2015].students, gk.scoreMap, 2018).slice().sort((a, b) => b.total - a.total);
  const top2 = ads.slice(0, 2);
  assert.ok(top2[0].total !== top2[1].total, "前两名通常不应同分");
  assert.notEqual(top2[0].provinceRank, top2[1].provinceRank, `${top2[0].total} 与 ${top2[1].total} 不得同位次`);
  assert.ok(top2[0].provinceRank < top2[1].provinceRank);
  assert.ok(top2[0].total < 700, `理科最高不应再出 710，实际 ${top2[0].total}`);
  const first = ads.filter((a) => a.batch === "一批").length;
  assert.ok(first >= 430 && first <= 620, `2018 一批应向喜报约 529 靠拢，不能再像 677 那样贴近 2020，实际 ${first}`);
});

test("多种子高考抽查：2017–2020 一本、600+、660+、最高分、清北向公开喜报靠拢", () => {
  const official = {
    2017: { first: 462, over600: null, over660: null, liMax: null, qb: null },
    2018: { first: 529, over600: null, over660: null, liMax: null, qb: 3 },
    2019: { first: 562, over600: 90, over660: null, liMax: 674, qb: 1 },
    2020: { first: 676, over600: 160, over660: 7, liMax: 675, qb: 3 },
  };
  const rows = {
    2017: collect(2014, 2017),
    2018: collect(2015, 2018),
    2019: collect(2016, 2019),
    2020: collect(2017, 2020),
  };
  const line = (year) => rows[year].map((r) => `s${r.seed}:一批${r.first} 600+${r.over600} 660+${r.over660} 理最高${r.liMax} 清北${r.qb}`).join("；");

  for (const year of [2017, 2018, 2019, 2020]) {
    for (const r of rows[year]) {
      assert.ok(r.liMax < 700, `${year} 种子${r.seed} 不应再出 710，最高 ${r.liMax}`);
      assert.ok(r.qb <= 3, `${year} 种子${r.seed} 清北应稀缺，实际 ${r.qb}`);
    }
  }

  // 2018 不能再贴近 2020
  const first18 = rows[2018].map((r) => r.first);
  const first20 = rows[2020].map((r) => r.first);
  const mid = (arr) => arr.slice().sort((a, b) => a - b)[Math.floor((arr.length - 1) / 2)];
  assert.ok(mid(first18) <= mid(first20) - 80, `2018 一本中位 ${mid(first18)} 应明显低于 2020 的 ${mid(first20)}。${line(2018)} ｜ ${line(2020)}`);

  for (const r of rows[2018]) {
    assert.ok(r.first >= 430 && r.first <= 620, `2018 一批向约 529 靠拢，实际 ${r.first}。${line(2018)}`);
    assert.ok(r.over600 <= 95, `2018 无公开 600+ 人数，在扩大补习班编制后仍应靠近但不超过喜报 2019 的 90 量级，实际 ${r.over600}。${line(2018)}`);
  }
  assert.ok(mid(rows[2018].map((x) => x.over600)) < mid(rows[2019].map((x) => x.over600)), `2018 的 600+ 中位应低于 2019。${line(2018)} ｜ ${line(2019)}`);
  for (const r of rows[2017]) {
    assert.ok(r.first >= 360 && r.first <= 630, `2017 一批向约 462 靠拢，实际 ${r.first}。${line(2017)}`);
    assert.ok(r.over600 < Math.min(...rows[2019].map((x) => x.over600)), `2017 的 600+ 应低于 2019，实际 ${r.over600} vs 2019 ${line(2019)}。${line(2017)}`);
    assert.ok(r.over600 <= 75, `2017 无公开 600+ 人数，应明显低于 90，实际 ${r.over600}`);
  }
  for (const r of rows[2019]) {
    assert.ok(r.first >= 470 && r.first <= 740, `2019 一批向 562 靠拢，实际 ${r.first}。${line(2019)}`);
    assert.ok(r.over600 >= 55 && r.over600 <= 125, `2019 年 600+ 向 90 靠拢，实际 ${r.over600}。${line(2019)}`);
    assert.ok(r.over660 <= 8, `2019 年 660+ 只应是几个，实际 ${r.over660}`);
    assert.ok(r.liMax >= 650 && r.liMax <= 686, `2019 理最高向 674 靠拢，实际 ${r.liMax}`);
  }
  for (const r of rows[2020]) {
    assert.ok(r.first >= 580 && r.first <= 780, `2020 一批向 676 靠拢，实际 ${r.first}。${line(2020)}`);
    assert.ok(r.over600 >= 110 && r.over600 <= 210, `2020 年 600+ 向 160 靠拢，实际 ${r.over600}。${line(2020)}`);
    assert.ok(r.over660 >= 1 && r.over660 <= 12, `2020 年 660+ 对标 7，实际 ${r.over660}。${line(2020)}`);
    assert.ok(r.liMax >= 658 && r.liMax <= 688, `2020 理最高向 675 靠拢且不出 710，实际 ${r.liMax}`);
  }
  assert.equal(provincialLines(2018, "li").first, 527);
  assert.equal(provincialLines(2020, "li").first, 535);
});
