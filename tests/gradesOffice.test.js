import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { generateCohort } from "../js/domain/school.js";
import { firstPlacement, rebuildClasses } from "../js/domain/placement.js";
import {
  runExam, classStandings, classCompareRows, filterClasses, filterRows,
  examReportKey, pickExamReport, officeBoard, sameDaySeniorReport,
} from "../js/domain/examService.js";
import { rankRows, compareScoreRows } from "../js/domain/scores.js";
import { createGame, skipToGaokaoOf, listExamReports } from "../js/domain/simulation.js";
import { officialSegmentRanks, officialProvincialPack, provincialLines } from "../js/domain/jiangxi.js";
import { describeOfficialProvincialLines, schoolCutoffView, classProvincialCounts } from "../js/domain/schoolLines.js";
import { drawLineChart, drawBarChart } from "../js/ui/charts.js";

const WEN_CLASSES = [1, 10, 11, 19, 20, 21, 22, 23, 24, 25, 26];

function placed(seed = 20170901) {
  let c = generateCohort(2017, seed, { alreadySplit: false });
  const pre = runExam(c, { id: "pre", name: "预", examKind: "final", difficulty: 1, dispersion: 1, date: "2018-01-16" }, { grade: 1, split: false });
  const p = firstPlacement(c.students, pre.scoreMap, { seed });
  return { ...c, students: p.students, classes: rebuildClasses(p.students), trackSplit: true };
}

function gaokaoOf(seed = 20170901) {
  return runExam(placed(seed), {
    id: "gaokao-2020", name: "2020年普通高考", examKind: "gaokao",
    difficulty: 1.003, dispersion: 1, date: "2020-06-07",
  }, { grade: 3, split: true });
}

test("档案页已导入 drawLineChart、drawBarChart，不再调用未导入的函数", () => {
  assert.equal(typeof drawLineChart, "function");
  assert.equal(typeof drawBarChart, "function");
  const src = readFileSync(new URL("../js/ui/app.js", import.meta.url), "utf8");
  assert.match(src, /import\s*\{[^}]*drawLineChart[^}]*drawBarChart[^}]*\}\s*from\s*["']\.\/charts\.js(?:\?[^"']*)?["']/);
  assert.doesNotMatch(src, /import\s*\{[^}]*drawScoreChart/);
  const body = src.replace(/import\s*\{[^}]*\}\s*from\s*["']\.\/charts\.js(?:\?[^"']*)?["'];/, "");
  assert.match(body, /drawLineChart\(/);
  assert.match(body, /drawBarChart\(/);
  const css = readFileSync(new URL("../css/style.css", import.meta.url), "utf8");
  assert.match(css, /\.chart-card canvas[^}]*height:\s*230px/);
  assert.match(src, /点击学生可看成绩和排名曲线/);
});

test("班名次按本班应届总分重排，同分规则与全校一致，不再拿校排序号冒充班排", () => {
  const rows = [
    { studentId: "c", name: "丙", classNo: 16, total: 400, math: 80, chinese: 80, repeat: false, track: "li" },
    { studentId: "b", name: "乙", classNo: 16, total: 534, math: 105, chinese: 106, rank: 446, repeat: false, track: "li" },
    { studentId: "a", name: "甲", classNo: 16, total: 534, math: 111, chinese: 85, rank: 443, repeat: false, track: "li" },
    { studentId: "r", name: "复读", classNo: 16, total: 600, math: 120, chinese: 120, rank: 20, repeat: true, track: "li" },
  ];
  const mine = classStandings(rows, 16);
  assert.equal(mine.map((r) => r.name).join(","), "甲,乙,丙");
  assert.equal(mine[0].classRank, 1);
  assert.equal(mine[0].gradeRank, 443);
  assert.equal(mine[1].classRank, 2);
  assert.equal(mine[1].total, 534);
  // 旧逻辑按校排（缺省当 0）排序，会把没校排的丙或校排更好但总分更低的人排到第一
  const old = rows.filter((r) => !r.repeat).sort((a, b) => (a.rank || 0) - (b.rank || 0) || b.total - a.total);
  assert.equal(old[0].name, "丙");
  const byTotalOnly = rows.filter((r) => !r.repeat && r.classNo === 16).sort((a, b) => b.total - a.total);
  assert.equal(byTotalOnly[0].name, "乙", "只按总分排时，同分会落到数组里先出现的乙");
  assert.deepEqual(mine.map((r) => r.studentId), rows.filter((r) => !r.repeat).sort(compareScoreRows).map((r) => r.studentId));
});

test("任教班第一与教务处同层次同班第一为同一人、同一分数", () => {
  const report = gaokaoOf(1);
  for (const classNo of [12, 16, 17, 18]) {
    const classFirst = classStandings(report.rows, classNo)[0];
    const office = rankRows(filterRows(report.rows, { tier: "zhuoxing", track: "li", repeat: false }))
      .filter((r) => r.classNo === classNo);
    assert.equal(office[0].studentId, classFirst.studentId, `${classNo}班第一应对齐`);
    assert.equal(office[0].total, classFirst.total);
    assert.equal(office[0].name, classFirst.name);
  }
});

test("默认种子推进到 2017 级 2020 高考后，任教班与教务处同层次卓行理科第一一致", () => {
  const g = createGame(20170901, "林知秋");
  skipToGaokaoOf(g, 2017);
  const report = listExamReports(g, { entryYear: 2017 }).find((r) => r.examKind === "gaokao");
  assert.ok(report);
  const classNo = g.player.classNo;
  const classFirst = classStandings(report.rows, classNo)[0];
  const office = rankRows(filterRows(report.rows, { tier: "zhuoxing", track: "li", repeat: false }))
    .filter((r) => r.classNo === classNo);
  assert.equal(office[0].studentId, classFirst.studentId);
  assert.equal(office[0].total, classFirst.total);
  const later = listExamReports(g);
  const picked = pickExamReport(later, examReportKey(report), { preferEntryYear: 2017 });
  assert.equal(picked.examKind, "gaokao");
  assert.equal(picked.entryYear, 2017);
  const loose = pickExamReport(later, `${report.date}|${report.examId}`, { preferEntryYear: 2017 });
  assert.equal(loose.examKind, "gaokao");
  assert.notEqual(later[0].examKind, "gaokao", "录取日后最近一场不应是高考，旧查找会落到别的年级");
});

test("筛理科时各班对照不含文科班", () => {
  const report = gaokaoOf(20170901);
  report.entryYear = 2017;
  const li = classCompareRows(report, { track: "li" });
  const nos = li.map((c) => c.classNo);
  for (const no of WEN_CLASSES) {
    assert.ok(!nos.includes(no), `理科对照不应出现 ${no} 班`);
  }
  assert.ok(nos.includes(12), "12 班卓行理科应保留");
  assert.ok(nos.includes(16));
  const wen = filterClasses(report.classes, { track: "wen", repeat: false }).map((c) => c.classNo);
  for (const no of WEN_CLASSES) assert.ok(wen.includes(no), `文科对照应有 ${no} 班`);
  const rows = filterRows(report.rows, { track: "li", repeat: false });
  assert.ok(rows.every((r) => r.track === "li"));
  assert.ok(rows.every((r) => r.track && r.track !== "mixed"));
});

test("高考主口径展示公开省控（2020 带一分一段位次），校内线标题带校内二字", () => {
  const lines = {
    2016: { wen: [523, 450], li: [529, 445] },
    2017: { wen: [533, 458], li: [503, 422] },
    2018: { wen: [568, 496], li: [527, 447] },
    2019: { wen: [558, 502], li: [522, 449] },
    2020: { wen: [547, 488], li: [535, 463] },
  };
  for (const [year, t] of Object.entries(lines)) {
    assert.equal(provincialLines(Number(year), "wen").first, t.wen[0]);
    assert.equal(provincialLines(Number(year), "wen").second, t.wen[1]);
    assert.equal(provincialLines(Number(year), "li").first, t.li[0]);
    assert.equal(provincialLines(Number(year), "li").second, t.li[1]);
    assert.equal(provincialLines(Number(year), "li").first - provincialLines(Number(year), "li").second, t.li[0] - t.li[1]);
  }
  const y20 = officialProvincialPack(2020);
  assert.equal(y20.li.ranks.firstN, 43925);
  assert.equal(y20.li.ranks.secondN, 103722);
  assert.equal(y20.wen.ranks.firstN, 10974);
  assert.equal(y20.wen.ranks.secondN, 42296);
  assert.equal(y20.li.gap, 72);
  const text = describeOfficialProvincialLines(2020);
  assert.match(text, /公开省控（国家线）/);
  assert.match(text, /理科一本 535/);
  assert.match(text, /二本 463/);
  assert.match(text, /全省前 43925/);
  assert.match(text, /全省前 103722/);
  assert.match(text, /江西省教育考试院/);
  assert.match(text, /一分一段/);
  const y18 = officialProvincialPack(2018);
  assert.equal(y18.li.first, 527);
  assert.equal(y18.li.second, 447);
  assert.equal(y18.li.ranks, null);
  assert.equal(officialSegmentRanks(2018, "li"), null);
  assert.doesNotMatch(describeOfficialProvincialLines(2018), /全省前/);
  const report = gaokaoOf(20170901);
  const school = schoolCutoffView(report, "li");
  assert.match(school.firstTitle, /校内/);
  assert.match(school.secondTitle, /校内/);
  const cls = classProvincialCounts(report, 16);
  const schoolRow = report.classes.find((c) => c.classNo === 16);
  assert.ok(cls.secondN < schoolRow.secondCount, "省控二本应明显少于校内二本，主口径应是前者");
  assert.ok(schoolRow.secondCount >= 50, "校内二本人数多是现行名额规则的自然结果，不能靠改线做小");
});

test("教务处榜单把同日高三补习班并入高二场次，高三各班对照也含补习班", () => {
  const sophomore = {
    date: "2019-11-15", examId: "midterm", examName: "期中考试", grade: 2, entryYear: 2018, split: true,
    rows: [
      { studentId: "a", name: "甲", classNo: 16, tier: "zhuoxing", track: "li", total: 500, math: 100, chinese: 100, repeat: false },
    ],
    classes: [
      { classNo: 16, name: "卓行16班", tier: "zhuoxing", track: "li", count: 1, avg: 500, max: 500, firstCount: 0, secondCount: 1, firstRate: 0, repeat: false },
    ],
  };
  const senior = {
    date: "2019-11-15", examId: "midterm", examName: "期中考试", grade: 3, entryYear: 2017, split: true,
    rows: [
      { studentId: "c", name: "丙", classNo: 16, tier: "zhuoxing", track: "li", total: 530, math: 110, chinese: 110, repeat: false },
      { studentId: "b", name: "乙", classNo: 37, tier: "fuzhuo", track: "li", total: 520, math: 110, chinese: 100, repeat: true },
    ],
    classes: [
      { classNo: 16, name: "卓行16班", tier: "zhuoxing", track: "li", count: 1, avg: 530, max: 530, firstCount: 1, secondCount: 1, firstRate: 100, repeat: false },
      { classNo: 37, name: "补习37班", tier: "fuzhuo", track: "li", count: 1, avg: 520, max: 520, firstCount: 0, secondCount: 1, firstRate: 0, repeat: true },
    ],
  };
  const reports = [sophomore, senior];
  const found = sameDaySeniorReport(reports, sophomore);
  assert.equal(found, senior);
  const board = officeBoard(sophomore, reports, { tier: "all", track: "li" });
  assert.ok(board.addedRepeat >= 1);
  assert.ok(board.classTable.some((c) => c.classNo === 37 && c.tier === "fuzhuo"));
  assert.ok(board.classTable.some((c) => c.classNo === 16));
  assert.equal(board.classTable.filter((c) => c.classNo === 16).length, 1, "只并入补习班，不把高三应届班混进高二对照");
  assert.ok(board.rows.some((r) => r.studentId === "b"));
  assert.ok(board.rows.some((r) => r.studentId === "a"));
  const onlyFuzhuo = officeBoard(sophomore, reports, { tier: "fuzhuo", track: "li" });
  assert.ok(onlyFuzhuo.rows.length >= 1 && onlyFuzhuo.rows.every((r) => r.tier === "fuzhuo" || r.repeat));
  const seniorBoard = officeBoard(senior, reports, { tier: "all", track: "li" });
  assert.equal(seniorBoard.addedRepeat, 0);
  assert.ok(seniorBoard.classTable.some((c) => c.classNo === 37));
});

test("教务处和校内线说明不再写不含补习班或只在应届池", () => {
  const files = [
    new URL("../js/ui/app.js", import.meta.url),
    new URL("../js/domain/schoolLines.js", import.meta.url),
    new URL("../js/domain/simulation.js", import.meta.url),
    new URL("../js/domain/examService.js", import.meta.url),
  ];
  for (const url of files) {
    const src = readFileSync(url, "utf8");
    assert.doesNotMatch(src, /不含复读|尚无补习班|只在应届池/);
  }
});
