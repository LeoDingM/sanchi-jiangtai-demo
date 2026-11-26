import test from "node:test";
import assert from "node:assert/strict";
import { generateCohort } from "../js/domain/school.js";
import { firstPlacement, secondPlacement, rebuildClasses } from "../js/domain/placement.js";
import { runExam } from "../js/domain/examService.js";
import { cutoffRanks } from "../js/domain/scores.js";
import { createGame, skipToGaokaoOf, simulatePriorGaokaoStats, currentSchoolQuota } from "../js/domain/simulation.js";
import {
  resolveSchoolQuota, fallbackSchoolQuota, schoolQuotaFromPrior,
  provincialPassCounts, examResultLogText,
} from "../js/domain/schoolLines.js";
import { FALLBACK_SCHOOL_QUOTA } from "../js/domain/config.js";

test("分科后可按科类传入不同 firstN/secondN，不再按 400 分摊", () => {
  const fb = fallbackSchoolQuota();
  const li = resolveSchoolQuota({ split: true, track: "li", regularN: 2000, trackN: 1267, quotas: fb });
  const wen = resolveSchoolQuota({ split: true, track: "wen", regularN: 2000, trackN: 733, quotas: fb });
  const mixed = resolveSchoolQuota({ split: false, track: "mixed", regularN: 2000, trackN: 2000, quotas: fb });
  assert.equal(li.firstN, 450);
  assert.equal(li.secondN, 1000);
  assert.equal(wen.firstN, 60);
  assert.equal(wen.secondN, 250);
  assert.ok(wen.secondN < 1000, "文科二本绝不能写成 1000");
  assert.equal(mixed.firstN, 510);
  assert.equal(mixed.secondN, 1000);
  // 旧的分摊算法会得到约 253/632
  const oldShare = Math.round(400 * 1267 / 2000);
  assert.notEqual(li.firstN, oldShare);

  const prior = schoolQuotaFromPrior({
    entryYear: 2014, gaokaoYear: 2017,
    li: { firstN: 472, secondN: 801, n: 1260 },
    wen: { firstN: 71, secondN: 246, n: 720 },
    mixed: { firstN: 543, secondN: 1047, n: 1980 },
  });
  const li2 = cutoffRanks(1980, true, 1260, { track: "li", quotas: prior });
  const wen2 = cutoffRanks(1980, true, 720, { track: "wen", quotas: prior });
  const mix2 = cutoffRanks(1980, false, 1980, { track: "mixed", quotas: prior });
  assert.equal(li2.firstN, 472);
  assert.equal(li2.secondN, 1000, "理科二本取前 1000，不用上一届二本人数");
  assert.equal(wen2.firstN, 71);
  assert.equal(wen2.secondN, 246);
  assert.equal(mix2.firstN, 543);
  assert.equal(mix2.secondN, 1000);
  const smallLi = resolveSchoolQuota({ split: true, track: "li", regularN: 900, trackN: 800, quotas: prior });
  assert.equal(smallLi.secondN, 800, "理科二本不超过应届人数");
});

test("复读不计入上一届省控上线人数，也不占应届校内名额", () => {
  const students = [
    { id: "a", track: "li", repeat: false },
    { id: "b", track: "li", repeat: false },
    { id: "r", track: "li", repeat: true },
    { id: "c", track: "wen", repeat: false },
  ];
  const scoreMap = {
    a: { total: 600 },
    b: { total: 400 },
    r: { total: 700 },
    c: { total: 600 },
  };
  const pack = provincialPassCounts(students, scoreMap, 2020);
  assert.equal(pack.li.n, 2);
  assert.equal(pack.wen.n, 1);
  assert.ok(pack.li.firstN <= 2);
  // 复读 700 分不应计入应届
  const withRepeat = provincialPassCounts(students.filter((s) => s.id !== "r"), scoreMap, 2020);
  assert.equal(pack.li.firstN, withRepeat.li.firstN);
  assert.equal(pack.li.n, withRepeat.li.n);
});

test("开局补上 2014 级 2017 年高考统计，不进入可玩年级，且可写入考试日志", () => {
  const state = createGame(20170901, "林知秋");
  assert.ok(!state.cohorts[2014], "2014 级不应进入可玩年级");
  assert.ok(state.cohorts[2015] && state.cohorts[2016] && state.cohorts[2017]);
  const prior = state.schoolLineHistory?.[0];
  assert.ok(prior, "开局应有上一届统计");
  assert.equal(prior.entryYear, 2014);
  assert.equal(prior.gaokaoYear, 2017);
  assert.ok(prior.li.firstN >= 400 && prior.li.firstN <= 550, `理科一本名额应接近上一届省控一本，实际 ${prior.li.firstN}`);
  assert.ok(prior.wen.firstN >= 20 && prior.wen.firstN <= 120, `文科一本兜底量级，实际 ${prior.wen.firstN}`);
  assert.ok(prior.wen.secondN >= 150 && prior.wen.secondN <= 400, `文科二本不应是 1000，实际 ${prior.wen.secondN}`);
  const q = currentSchoolQuota(state);
  assert.equal(q.li.firstN, prior.li.firstN);
  assert.equal(q.li.secondN, 1000);
  assert.equal(q.wen.firstN, prior.wen.firstN);
  assert.equal(q.wen.secondN, prior.wen.secondN);
  assert.equal(q.mixed.firstN, prior.li.firstN + prior.wen.firstN);
  const log = state.log.map((l) => l.text).join("\n");
  assert.match(log, /2014级2017年高考/);
  assert.match(log, /理科一本/);

  let c = generateCohort(2017, 20170901);
  const pre = runExam(c, { id: "pre", name: "期末考试", examKind: "final", difficulty: 1, dispersion: 1, date: "2018-01-16" }, { grade: 1, split: false, schoolQuota: q });
  assert.equal(pre.cutoffs.mixed.firstN, q.mixed.firstN);
  assert.equal(pre.cutoffs.mixed.secondN, 1000);
  c = { ...c, students: firstPlacement(c.students, pre.scoreMap, { seed: 20170901 }).students };
  c.classes = rebuildClasses(c.students);
  const mid = runExam(c, { id: "f2", name: "下学期期末", examKind: "final", difficulty: 1, dispersion: 1, date: "2018-06-25" }, { grade: 1, split: true, schoolQuota: q });
  assert.equal(mid.cutoffs.li.firstN, q.li.firstN);
  assert.equal(mid.cutoffs.li.secondN, Math.min(1000, mid.cutoffs.li.count));
  assert.equal(mid.cutoffs.wen.firstN, q.wen.firstN);
  assert.equal(mid.cutoffs.wen.secondN, Math.min(q.wen.secondN, mid.cutoffs.wen.count));
  assert.ok(mid.cutoffs.wen.secondN < 1000);

  const cls = mid.classes.find((x) => x.classNo === 16);
  const text = examResultLogText(mid, { classSummary: cls, classNo: 16, schoolQuota: q });
  assert.match(text, /校内线一本/);
  assert.match(text, /对照2018年省控/);
  assert.match(text, /950/);
  assert.match(text, /卓行/);
});

test("2015 级 2018 年高考之后，校内线改用刚结束那届实际人数", () => {
  const state = createGame(20170901, "林知秋");
  const before = currentSchoolQuota(state);
  skipToGaokaoOf(state, 2015);
  const after = currentSchoolQuota(state);
  const last = state.schoolLineHistory[state.schoolLineHistory.length - 1];
  assert.equal(last.entryYear, 2015);
  assert.equal(last.gaokaoYear, 2018);
  assert.equal(after.li.firstN, last.li.firstN);
  assert.ok(after.li.firstN >= 400 && after.li.firstN <= 550, `滚动后理科一本 ${after.li.firstN}`);
  assert.ok(state.schoolLineHistory.length >= 2, "高考后应追加一届统计");
  assert.ok(before.priorYear === 2017 && after.priorYear === 2018, "应改用刚结束的 2018 年高考人数");
  assert.equal(after.li.secondN, 1000);
  assert.ok(after.wen.secondN < 1000);
});

test("兜底名额是近似值而不是精确官方名额", () => {
  assert.equal(FALLBACK_SCHOOL_QUOTA.li.firstN, 450);
  assert.equal(FALLBACK_SCHOOL_QUOTA.li.secondN, 1000);
  assert.ok(FALLBACK_SCHOOL_QUOTA.wen.firstN >= 40 && FALLBACK_SCHOOL_QUOTA.wen.firstN <= 90);
  assert.ok(FALLBACK_SCHOOL_QUOTA.wen.secondN >= 200 && FALLBACK_SCHOOL_QUOTA.wen.secondN <= 300);
  const fb = fallbackSchoolQuota();
  assert.ok(fb.fallback);
  assert.match(fb.source, /不是官方精确名额/);
});
