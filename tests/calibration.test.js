import test from "node:test";
import assert from "node:assert/strict";
import { generateCohort } from "../js/domain/school.js";
import { firstPlacement, rebuildClasses } from "../js/domain/placement.js";
import { runExam } from "../js/domain/examService.js";
import { admitCohort, isProvincialFirst, isProvincialSecond } from "../js/domain/admission.js";

const SEEDS = [20170901, 7, 99, 2020, 42, 11];

function placed(seed) {
  let c = generateCohort(2017, seed);
  const pre = runExam(c, { id: "pre", name: "预", examKind: "final", difficulty: 1, dispersion: 1, date: "2018-01-16" }, { grade: 1, split: false });
  c = { ...c, students: firstPlacement(c.students, pre.scoreMap, { seed }).students };
  c.classes = rebuildClasses(c.students);
  return c;
}

function median(arr) {
  const b = arr.slice().sort((a, c) => a - c);
  return b[Math.floor((b.length - 1) / 2)];
}

test("多种子高考抽查：平行班按省控标定，笃学允许 0 一本，清北稀缺，层次不倒挂", () => {
  const lines = [];
  const liMedians = [];
  const liMaxima = [];
  let sawLuckyFirst = false;
  let sawZeroDuxueFirst = false;
  for (const seed of SEEDS) {
    const c = placed(seed);
    const gk = runExam(c, { id: "gk", name: "高考", examKind: "gaokao", difficulty: 1.003, dispersion: 1, date: "2020-06-07" }, { grade: 3, split: true });
    const ads = admitCohort(c.students.filter((s) => !s.repeat), gk.scoreMap, 2020);
    const byTier = {};
    const liZx = {};
    const class16 = { n: 0, first: 0, second: 0 };
    for (const a of ads) {
      const s = c.students.find((x) => x.id === a.studentId);
      const t = s?.tier || "other";
      byTier[t] ??= { n: 0, first: 0, second: 0, sum: 0 };
      byTier[t].n++;
      byTier[t].sum += a.total;
      if (isProvincialFirst(a)) byTier[t].first++;
      if (isProvincialSecond(a)) byTier[t].second++;
      if (s?.tier === "zhuoxing" && s.track !== "wen") {
        liZx[s.classNo] ??= { n: 0, first: 0, second: 0 };
        liZx[s.classNo].n++;
        if (isProvincialFirst(a)) liZx[s.classNo].first++;
        if (isProvincialSecond(a)) liZx[s.classNo].second++;
      }
      if (s?.classNo === 16) {
        class16.n++;
        if (isProvincialFirst(a)) class16.first++;
        if (isProvincialSecond(a)) class16.second++;
      }
    }
    const qb = ads.filter((a) => a.qingbei).length;
    const first = ads.filter((a) => isProvincialFirst(a)).length;
    const dx = byTier.duxue || { n: 0, first: 0, second: 0 };
    const avg = (t) => byTier[t].sum / byTier[t].n;
    assert.ok(avg("yunxiu_exp") > avg("lingxiao"), `种子${seed} 实验应高于凌霄`);
    assert.ok(avg("lingxiao") > avg("zhuoxing"), `种子${seed} 凌霄应高于卓行`);
    assert.ok(avg("zhuoxing") > avg("duxue"), `种子${seed} 卓行应高于笃学`);
    assert.ok(qb <= 5, `种子${seed} 清北应稀缺，实际 ${qb}`);
    assert.ok(first >= 450 && first <= 850, `种子${seed} 应届一本 ${first} 应接近赣南重点中学量级`);

    const liClasses = Object.values(liZx);
    assert.ok(liClasses.length >= 6, `种子${seed} 应有理科卓行班`);
    const liFirsts = liClasses.map((x) => x.first);
    const liSeconds = liClasses.map((x) => x.second);
    const midF = median(liFirsts);
    const midS = median(liSeconds);
    const maxF = Math.max(...liFirsts);
    const maxS = Math.max(...liSeconds);
    liMedians.push(midF);
    liMaxima.push(maxF);
    if (maxF >= 6) sawLuckyFirst = true;
    // 高考按省控：一般约 3 个一本，5 个算成功，好运 7–8；不把 5 或 7 当均值。
    assert.ok(midF >= 1 && midF <= 6, `种子${seed} 理科卓行一本中位应约 3，实际 ${midF}（${liFirsts.sort((a, b) => a - b).join(",")}）`);
    assert.ok(maxF <= 9, `种子${seed} 理科卓行单班一本不应明显超过好运 7–8，实际最大 ${maxF}`);
    assert.ok(midS < 45, `种子${seed} 理科卓行二本累计中位应明显低于 45，实际 ${midS}（${liSeconds.sort((a, b) => a - b).join(",")}）`);
    assert.ok(maxS <= 52, `种子${seed} 理科卓行二本累计 45 已是佼佼者，最大不应失控，实际 ${maxS}`);
    for (const cl of liClasses) {
      assert.ok(cl.n >= 70 && cl.n <= 76, `种子${seed} 理科卓行班额应约 70–75，实际 ${cl.n}`);
    }
    assert.equal(class16.n, 74, `种子${seed} 16 班应为 74 人`);
    assert.ok(class16.first <= 9, `种子${seed} 16 班省控一本 ${class16.first}`);
    assert.ok(class16.second <= 52, `种子${seed} 16 班省控二本累计 ${class16.second}`);
    // 笃学允许 0 一本，不做留苗兜底；也不再要求整层二本过半。
    if (dx.first === 0) sawZeroDuxueFirst = true;
    assert.ok(dx.first <= 4, `种子${seed} 笃学不应靠兜底堆出一本，实际 ${dx.first}`);
    lines.push(`seed ${seed}: 一本${first} 清北${qb} 16班一本${class16.first}/二本${class16.second} 理卓行中位一本${midF}最大${maxF} 二本中位${midS} 笃学一本${dx.first}`);
  }
  assert.ok(sawZeroDuxueFirst, `笃学必须允许 0 一本（不再兜底）。${lines.join("；")}`);
  assert.ok(median(liMedians) >= 2 && median(liMedians) <= 5, `多种子理科卓行一本中位应靠近 3，实际 ${liMedians.join(",")}`);
  assert.ok(sawLuckyFirst || Math.max(...liMaxima) >= 5, `好运年份应能见到偏强或 7–8 的尾巴，最大 ${liMaxima.join(",")}`);
});
