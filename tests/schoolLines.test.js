import test from "node:test";
import assert from "node:assert/strict";
import { generateCohort } from "../js/domain/school.js";
import { firstPlacement, secondPlacement, rebuildClasses } from "../js/domain/placement.js";
import { runExam } from "../js/domain/examService.js";
import { cutoffRanks } from "../js/domain/scores.js";
import { createGame, skipToGaokaoOf, simulatePriorGaokaoStats, currentSchoolQuota } from "../js/domain/simulation.js";
import {
  resolveSchoolQuota, fallbackSchoolQuota, schoolQuotaFromPrior,
  provincialPassCounts, examResultLogText, adaptSchoolCutoffRanks, describeSchoolCutoff,
} from "../js/domain/schoolLines.js";
import { SCHOOL_LINE_FIRST_RANK, SCHOOL_LINE_SECOND_RANK } from "../js/domain/config.js";

test("校内一本/二本按约第 520、第 1100 名取分，不再按上一届省控人数或 400 分摊", () => {
  const li = resolveSchoolQuota({ split: true, track: "li", regularN: 2000, trackN: 1696 });
  const mixed = resolveSchoolQuota({ split: false, track: "mixed", regularN: 2000, trackN: 2000 });
  assert.equal(li.firstN, 520);
  assert.equal(li.secondN, 1100);
  assert.equal(mixed.firstN, 520);
  assert.equal(mixed.secondN, 1100);
  const oldShare = Math.round(400 * 1267 / 2000);
  assert.notEqual(li.firstN, oldShare);

  const li2 = cutoffRanks(1980, true, 1696, { track: "li" });
  const mix2 = cutoffRanks(1980, false, 1980, { track: "mixed" });
  assert.equal(li2.firstN, 520);
  assert.equal(li2.secondN, 1100);
  assert.equal(mix2.firstN, 520);
  assert.equal(mix2.secondN, 1100);

  const g2li = resolveSchoolQuota({ split: true, track: "li", regularN: 2000, trackN: 1276 });
  assert.equal(g2li.firstN, 520);
  assert.equal(g2li.secondN, 1100);

  const smallLi = resolveSchoolQuota({ split: true, track: "li", regularN: 900, trackN: 800 });
  assert.ok(smallLi.secondN <= 800, "二本不超过该划线池人数");
  assert.ok(smallLi.firstN < 520, "池明显小于 1100 且一本占比过高时不应硬套 520");
  assert.ok(smallLi.secondN < 1100);
});

test("文科池不足 1100 时二本不超出池规模，一本不肿胀", () => {
  const wenG2 = adaptSchoolCutoffRanks(720);
  assert.ok(wenG2.secondN <= 720, "不得伪造人数");
  assert.ok(wenG2.adapted);
  assert.ok(wenG2.firstN < 520, "文科 720 人池硬套 520 会肿胀");
  assert.ok(wenG2.firstN / 720 <= 0.40, `一本应靠前且占比受限，实际 ${wenG2.firstN}`);
  assert.ok(wenG2.secondN >= Math.round(720 * 0.8), `二本应靠后，实际 ${wenG2.secondN}`);

  const wenTiny = adaptSchoolCutoffRanks(400);
  assert.ok(wenTiny.secondN <= 400);
  assert.ok(wenTiny.firstN < 400 && wenTiny.firstN < 200, "400 人池不应几乎全员一本");

  const wenG3 = adaptSchoolCutoffRanks(1140);
  assert.equal(wenG3.firstN, 520);
  assert.equal(wenG3.secondN, 1100);
  assert.ok(wenG3.secondN <= 1140);
});

test("复读不计入应届省控上线人数", () => {
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
  // 2017 年喜报一本 462 为文理合计，口径或含复读；应届理科一本应更低，约 300–450。
  assert.ok(prior.li.firstN >= 300 && prior.li.firstN <= 480, `2017 年应届理科一本应低于文理合计喜报 462 的量级，实际 ${prior.li.firstN}`);
  assert.ok(prior.wen.firstN >= 20 && prior.wen.firstN <= 120, `文科一本兜底量级，实际 ${prior.wen.firstN}`);
  assert.ok(prior.wen.secondN >= 150 && prior.wen.secondN <= 400, `文科二本不应是 1000，实际 ${prior.wen.secondN}`);
  const q = currentSchoolQuota(state);
  assert.equal(q.li.firstN, prior.li.firstN, "应届省控统计仍按上一届滚动，但不用于校内划线");
  assert.equal(q.wen.firstN, prior.wen.firstN);
  assert.equal(q.wen.secondN, prior.wen.secondN);
  assert.equal(q.mixed.firstN, prior.li.firstN + prior.wen.firstN);
  const log = state.log.map((l) => l.text).join("\n");
  assert.match(log, /2014级2017年高考/);
  assert.match(log, /理科一本/);
  assert.match(log, /第 520/);
  assert.doesNotMatch(log, /约 460|前 1000 名|前1000名/);

  let c = generateCohort(2017, 20170901);
  const pre = runExam(c, { id: "pre", name: "期末考试", examKind: "final", difficulty: 1, dispersion: 1, date: "2018-01-16" }, { grade: 1, split: false });
  assert.ok(pre.cutoffs.mixed.firstN >= 500 && pre.cutoffs.mixed.firstN <= 540, `高一分科前一本约第 520 名，实际 ${pre.cutoffs.mixed.firstN}`);
  assert.ok(pre.cutoffs.mixed.secondN >= 1060 && pre.cutoffs.mixed.secondN <= 1140, `高一分科前二本约第 1100 名，实际 ${pre.cutoffs.mixed.secondN}`);
  c = { ...c, students: firstPlacement(c.students, pre.scoreMap, { seed: 20170901 }).students };
  c.classes = rebuildClasses(c.students);
  const mid = runExam(c, { id: "f2", name: "下学期期末", examKind: "final", difficulty: 1, dispersion: 1, date: "2018-06-25" }, { grade: 1, split: true });
  assert.ok(mid.cutoffs.li.firstN >= 500 && mid.cutoffs.li.firstN <= 540);
  assert.ok(mid.cutoffs.li.secondN === Math.min(mid.cutoffs.li.secondN, mid.cutoffs.li.count));
  assert.ok(mid.cutoffs.wen.secondN <= mid.cutoffs.wen.count, "文科二本不超出池规模");
  assert.ok(mid.cutoffs.wen.secondN < 1100 || mid.cutoffs.wen.count >= 1100);

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
  assert.equal(after.li.firstN, last.li.firstN, "滚动的是应届省控统计，不是校内划线名额");
  // 2018 年喜报一本约 529 为文理合计（口径或含复读），应届理科一本会更低。
  assert.ok(after.li.firstN >= 300 && after.li.firstN <= 520, `滚动后应届理科一本应向 2018 年喜报合计约 529 的结构靠拢，实际 ${after.li.firstN}`);
  assert.ok(state.schoolLineHistory.length >= 2, "高考后应追加一届统计");
  assert.ok(before.priorYear === 2017 && after.priorYear === 2018, "应届省控统计应改用刚结束的 2018 年高考人数");
  assert.ok(after.wen.secondN < 1100);
});

test("校内线目标名次是约第 520、第 1100 名，说明不再用旧口径", () => {
  assert.equal(SCHOOL_LINE_FIRST_RANK, 520);
  assert.equal(SCHOOL_LINE_SECOND_RANK, 1100);
  const text = describeSchoolCutoff({ li: { firstN: 518, secondN: 1092 }, wen: { firstN: 520, secondN: 1100 } }, true, { includeRepeat: true });
  assert.match(text, /第 520/);
  assert.match(text, /第 1100/);
  assert.match(text, /应届与补习班同一池/);
  assert.doesNotMatch(text, /约 460|前 1000 名|上一届.*省控一本/);
  const fb = fallbackSchoolQuota();
  assert.ok(fb.fallback);
  assert.match(fb.source, /不是官方精确名额|不是校内划线名额/);
});

test("高三理科校内一本约第 500-540 名、二本约 1060-1140 名", () => {
  const c = generateCohort(2015, 20170901, { alreadySplit: true, withRepeat: true });
  const gk = runExam(c, { id: "gk", name: "高考", examKind: "gaokao", difficulty: 1.003, dispersion: 1, date: "2018-06-07" }, { grade: 3, split: true });
  assert.ok(gk.cutoffs.li.count >= 1500 && gk.cutoffs.includeRepeat, `高三理科池应含应届加补习班，实际 ${gk.cutoffs.li.count}`);
  assert.ok(gk.cutoffs.li.firstN >= 500 && gk.cutoffs.li.firstN <= 540, `理科一本名次 ${gk.cutoffs.li.firstN}`);
  assert.ok(gk.cutoffs.li.secondN >= 1060 && gk.cutoffs.li.secondN <= 1140, `理科二本名次 ${gk.cutoffs.li.secondN}`);
  assert.ok(gk.cutoffs.wen.secondN <= gk.cutoffs.wen.count);
  if (gk.cutoffs.wen.count < 1100) {
    assert.ok(gk.cutoffs.wen.secondN <= gk.cutoffs.wen.count, "文科池不足时二本不超出池规模");
  }
});
