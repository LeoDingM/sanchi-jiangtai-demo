import test from "node:test";
import assert from "node:assert/strict";
import { generateCohort } from "../js/domain/school.js";
import { firstPlacement, rebuildClasses } from "../js/domain/placement.js";
import { runExam } from "../js/domain/examService.js";
import { admitCohort } from "../js/domain/admission.js";

const SEEDS = [20170901, 7, 99, 2020, 42, 11];

function placed(seed) {
  let c = generateCohort(2017, seed);
  const pre = runExam(c, { id: "pre", name: "预", examKind: "final", difficulty: 1, dispersion: 1, date: "2018-01-16" }, { grade: 1, split: false });
  c = { ...c, students: firstPlacement(c.students, pre.scoreMap, { seed }).students };
  c.classes = rebuildClasses(c.students);
  return c;
}

test("多种子高考抽查：笃学多数年份有省控一本，清北稀缺，层次不倒挂", () => {
  let zeroDuxueFirst = 0;
  const lines = [];
  for (const seed of SEEDS) {
    const c = placed(seed);
    const gk = runExam(c, { id: "gk", name: "高考", examKind: "gaokao", difficulty: 1.003, dispersion: 1, date: "2020-06-07" }, { grade: 3, split: true });
    const ads = admitCohort(c.students.filter((s) => !s.repeat), gk.scoreMap, 2020);
    const byTier = {};
    for (const a of ads) {
      const s = c.students.find((x) => x.id === a.studentId);
      const t = s?.tier || "other";
      byTier[t] ??= { n: 0, first: 0, second: 0, sum: 0 };
      byTier[t].n++;
      byTier[t].sum += a.total;
      if (a.batch === "一批") byTier[t].first++;
      if (a.batch === "一批" || a.batch === "二批") byTier[t].second++;
    }
    const qb = ads.filter((a) => a.qingbei).length;
    const first = ads.filter((a) => a.batch === "一批").length;
    const dx = byTier.duxue || { n: 0, first: 0, second: 0 };
    const zx = byTier.zhuoxing || { n: 0, first: 0, second: 0 };
    const avg = (t) => byTier[t].sum / byTier[t].n;
    assert.ok(avg("yunxiu_exp") > avg("lingxiao"), `种子${seed} 实验应高于凌霄`);
    assert.ok(avg("lingxiao") > avg("zhuoxing"), `种子${seed} 凌霄应高于卓行`);
    assert.ok(avg("zhuoxing") > avg("duxue"), `种子${seed} 卓行应高于笃学`);
    assert.ok(qb <= 3, `种子${seed} 清北应稀缺，实际 ${qb}`);
    assert.ok(first >= 500 && first <= 850, `种子${seed} 应届一本 ${first} 应接近赣南重点中学量级`);
    assert.ok(zx.first >= 20, `种子${seed} 卓行应有一定数量省控一本，实际 ${zx.first}`);
    assert.ok(zx.second / zx.n >= 0.6, `种子${seed} 卓行应整体达二本，实际 ${zx.second}/${zx.n}`);
    assert.ok(dx.second >= 50, `种子${seed} 笃学应有相当数量二本，实际 ${dx.second}`);
    if (dx.first === 0) zeroDuxueFirst++;
    lines.push(`seed ${seed}: 一本${first} 清北${qb} 卓行一本${zx.first} 笃学一本${dx.first} 笃学二本${dx.second}`);
  }
  assert.ok(zeroDuxueFirst <= 1, `多数种子年笃学应有省控一本。${lines.join("；")}`);
});
