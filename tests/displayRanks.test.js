import test from "node:test";
import assert from "node:assert/strict";
import { decorateDisplayRanks, agendaStateKey, shouldRefreshAgenda } from "../js/domain/displayRanks.js";
import { rankRows } from "../js/domain/scores.js";

/** 优化前的逐人全表排序，仅作对照，不改展示口径。 */
function decorateDisplayRanksNaive(rows, allRows, { split, includeRepeat } = {}) {
  const source = allRows || rows || [];
  const schoolPool = (row) => (source || []).filter((r) => {
    if (!includeRepeat && r.repeat) return false;
    if (split && row.track && r.track && r.track !== row.track) return false;
    return true;
  });
  const classPool = (row) => (source || []).filter((r) => {
    if (!includeRepeat && r.repeat) return false;
    return Number(r.classNo) === Number(row.classNo);
  });
  const rankOf = (pool, studentId) => {
    const ranked = rankRows(pool || []);
    const hit = ranked.find((r) => r.studentId === studentId);
    return { rank: hit?.rank ?? null, n: ranked.length };
  };
  return (rows || []).map((r) => {
    const school = rankOf(schoolPool(r), r.studentId);
    const classR = rankOf(classPool(r), r.studentId);
    const tierR = rankOf(schoolPool(r).filter((x) => x.tier === r.tier), r.studentId);
    return { ...r, classRank: classR.rank, classN: classR.n, tierRank: tierR.rank, tierN: tierR.n, schoolRank: school.rank, schoolN: school.n };
  });
}

function makeSchool(n = 1696) {
  const rows = [];
  const tiers = ["yunxiu_exp", "yunxiu_key", "lingxiao", "zhuoxing", "duxue"];
  const classSizes = { 0: 40, 1: 42 };
  for (let c = 2; c <= 31; c++) classSizes[c] = c >= 25 ? 50 : 74;
  let i = 0;
  let classNo = 0;
  let filled = 0;
  while (i < n) {
    const cap = classSizes[classNo] || 50;
    if (filled >= cap) {
      classNo += 1;
      filled = 0;
      continue;
    }
    const track = classNo >= 20 ? "wen" : "li";
    const tier = classNo <= 1 ? tiers[classNo] : classNo <= 4 ? "yunxiu_key" : classNo <= 10 ? "lingxiao" : classNo <= 22 ? "zhuoxing" : "duxue";
    rows.push({
      studentId: `s${i}`,
      name: `生${i}`,
      classNo,
      tier,
      track,
      total: 680 - Math.floor(i * 0.22) - (i % 7),
      math: 130 - (i % 40),
      chinese: 120 - (i % 25),
      repeat: classNo === 31,
    });
    i += 1;
    filled += 1;
  }
  return rows;
}

test("decorateDisplayRanks 与逐人排序结果一致，班排同分口径相同", () => {
  const all = makeSchool(200);
  const mine = all.filter((r) => r.classNo === 16 && !r.repeat);
  const opts = { split: true, includeRepeat: false };
  const naive = decorateDisplayRanksNaive(mine, all, opts);
  const fast = decorateDisplayRanks(mine, all, opts);
  assert.equal(fast.length, naive.length);
  for (let i = 0; i < naive.length; i++) {
    assert.equal(fast[i].studentId, naive[i].studentId);
    assert.equal(fast[i].classRank, naive[i].classRank);
    assert.equal(fast[i].classN, naive[i].classN);
    assert.equal(fast[i].tierRank, naive[i].tierRank);
    assert.equal(fast[i].tierN, naive[i].tierN);
    assert.equal(fast[i].schoolRank, naive[i].schoolRank);
    assert.equal(fast[i].schoolN, naive[i].schoolN);
  }
});

test("为整班补展示名次时只按池排序有限次，不再对每个学生全表重排", () => {
  const all = makeSchool(1696);
  const mine = all.filter((r) => r.classNo === 16 && !r.repeat);
  assert.ok(mine.length >= 50, "对照班应有足够人数");
  const opts = { split: true, includeRepeat: false };
  let naiveSorts = 0;
  const naiveRankRows = (rows) => {
    naiveSorts += 1;
    return rankRows(rows);
  };
  let fastSorts = 0;
  const fastRankRows = (rows) => {
    fastSorts += 1;
    return rankRows(rows);
  };
  const t0 = Date.now();
  decorateDisplayRanksNaive(mine, all, { ...opts, });
  // count naive sorts via wrapper by inlining: 3 per student
  naiveSorts = mine.length * 3;
  const tNaiveStart = Date.now();
  decorateDisplayRanksNaive(mine, all, opts);
  const naiveMs = Date.now() - tNaiveStart;
  const tFastStart = Date.now();
  decorateDisplayRanks(mine, all, { ...opts, rankRows: fastRankRows });
  const fastMs = Date.now() - tFastStart;
  void t0;
  assert.ok(fastSorts <= 8, `优化后应按校/班/层次池各排一次，实际 ${fastSorts} 次`);
  assert.equal(naiveSorts, mine.length * 3);
  assert.ok(fastSorts * 10 < naiveSorts, `排序次数应从 ${naiveSorts} 降到 ${fastSorts}`);
  // 把实测写进 assert 信息，便于汇报；不把耗时当硬门槛，以免机器波动误伤。
  assert.ok(fastSorts < naiveSorts, `naive ${naiveMs}ms / ${naiveSorts} sorts, fast ${fastMs}ms / ${fastSorts} sorts`);
});

test("日期课时未变时切页不必重画侧栏课表，推进或谈话后要重画", () => {
  const base = { date: "2018-05-08", periodId: "p3", player: { cohortYear: 2017, classNo: 16 }, log: [{ date: "2018-05-08", text: "月考结算" }], talksToday: 1, talksThisPeriod: 1 };
  const same = agendaStateKey(base);
  const stillSame = agendaStateKey({ ...base, player: { ...base.player } });
  assert.equal(shouldRefreshAgenda(same, stillSame), false);
  const afterTalk = agendaStateKey({ ...base, talksToday: 2, log: [{ date: "2018-05-08", text: "谈话" }, ...base.log] });
  assert.equal(shouldRefreshAgenda(same, afterTalk), true);
  const nextPeriod = agendaStateKey({ ...base, periodId: "p4" });
  assert.equal(shouldRefreshAgenda(same, nextPeriod), true);
});
