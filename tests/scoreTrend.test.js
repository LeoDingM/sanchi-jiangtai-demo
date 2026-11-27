import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildStudentScoreTrendFacts, formatLocalStudentScoreTrend, studentScoreTrendChartModel,
  studentScoreTrendAiPayload, validateScoreTrendText,
  buildClassScoreTrendFacts, formatLocalClassScoreTrend, classScoreTrendChartModel,
  classScoreTrendAiPayload,
} from "../js/domain/scoreTrend.js";
import { requestStudentScoreTrend, requestClassScoreTrend } from "../js/domain/examAi.js";
import { formatDisciplineBoard } from "../js/domain/cheating.js";

function exam(partial) {
  return {
    date: partial.date,
    examName: partial.examName || "月考",
    examKind: partial.examKind || "monthly",
    examId: partial.examId || partial.date,
    classNo: partial.classNo ?? 16,
    classRank: partial.classRank ?? 10,
    classN: 74,
    schoolRank: partial.schoolRank ?? 200,
    schoolN: 1696,
    total: partial.total ?? 540,
    maxTotal: 750,
    scaled750: partial.total ?? 540,
    line: partial.line || "二本",
    subjects: partial.subjects || {
      chinese: { score: 100, max: 150 },
      math: { score: 110, max: 150 },
      english: { score: 108, max: 150 },
    },
    cheat: partial.cheat || null,
    scoreStatus: partial.scoreStatus || "",
    absentSubjects: partial.absentSubjects || [],
  };
}

const five = [
  exam({ date: "2018-10-20", examName: "第一次月考", classRank: 8, schoolRank: 120, total: 560 }),
  exam({ date: "2018-11-15", examName: "期中考试", classRank: 9, schoolRank: 130, total: 552 }),
  exam({ date: "2018-12-18", examName: "第三次月考", classRank: 11, schoolRank: 150, total: 540 }),
  exam({ date: "2019-01-20", examName: "期末考试", classRank: 12, schoolRank: 170, total: 528 }),
  exam({ date: "2019-03-15", examName: "下学期月考", classRank: 18, schoolRank: 260, total: 500, subjects: {
    chinese: { score: 96, max: 150 },
    math: { score: 80, max: 150 },
    english: { score: 100, max: 150 },
  } }),
];

test("学生近 5 次分析材料含总分、各科、班排校排和已有事实，不足 5 次写明场次", () => {
  const facts = buildStudentScoreTrendFacts({ id: "s-jia", name: "甲", classNo: 16 }, five);
  assert.equal(facts.ok, true);
  assert.equal(facts.examCount, 5);
  assert.equal(facts.exams[0].total, 560);
  assert.equal(facts.exams[0].classRank, 8);
  assert.equal(facts.exams[0].schoolRank, 120);
  assert.ok(facts.exams[4].subjects.some((s) => s.name === "数学" && s.score === 80));
  const model = studentScoreTrendChartModel(facts);
  assert.deepEqual(model.total.series[0].values, [560, 552, 540, 528, 500]);
  assert.deepEqual(model.ranks.series.find((s) => s.name === "校排").values, [120, 130, 150, 170, 260]);
  const text = formatLocalStudentScoreTrend(facts);
  assert.match(text, /波动判断/);
  assert.match(text, /建议/);
  assert.match(text, /评价/);
  assert.match(text, /本地分析/);
  assert.doesNotMatch(text, /作弊已经查实/);

  const three = buildStudentScoreTrendFacts({ id: "s-yi", name: "乙", classNo: 16 }, five.slice(0, 3));
  assert.equal(three.examCount, 3);
  assert.match(three.examCountNote, /目前只有 3 次/);
  assert.match(formatLocalStudentScoreTrend(three), /目前只有 3 次/);
  assert.doesNotMatch(formatLocalStudentScoreTrend(three), /虚构场次|编造一场/);
});

test("无密钥或自动模式走本地回退；未查实举报不能写成处分", async () => {
  const hist = [
    ...five.slice(0, 4),
    exam({
      date: "2019-03-15", examName: "下学期月考", classRank: 18, schoolRank: 260, total: 500,
      cheat: { cheated: true, reported: true, substantiated: false, status: "unsubstantiated" },
    }),
  ];
  const facts = buildStudentScoreTrendFacts({ id: "s-bing", name: "丙", classNo: 16 }, hist);
  assert.equal(facts.exams[4].cheatedUnproven, true);
  assert.equal(facts.exams[4].cheatedSubstantiated, false);
  const local = formatLocalStudentScoreTrend(facts);
  assert.match(local, /尚未查实|未查实/);
  assert.doesNotMatch(local, /给予.*处分|作弊已经查实/);
  const forged = validateScoreTrendText("该生这次因作弊被给予记过处分。", facts);
  assert.equal(forged.ok, false);

  const payload = studentScoreTrendAiPayload(facts);
  const auto = await requestStudentScoreTrend(payload, { autoMode: true, fetchImpl: async () => { throw new Error("should not fetch"); } });
  assert.equal(auto.ok, false);
  assert.equal(auto.fallback, true);
  assert.match(auto.reason, /自动模式/);

  const noKey = await requestStudentScoreTrend(payload, { settings: { apiKey: "", hasKey: false }, fetchImpl: async () => { throw new Error("should not fetch"); } });
  assert.equal(noKey.ok, false);
  assert.match(noKey.reason, /密钥/);
});

test("全班分析材料按真实成绩统计均分和分数段，图表人数与材料一致", () => {
  const mk = (date, name, avgs) => ({
    date, examName: name, examId: date, examKind: "monthly", maxTotal: 750,
    rows: avgs.map((total, i) => ({
      studentId: `s${i}`, name: `生${i}`, classNo: 16, repeat: false, total, maxTotal: 750,
      schoolRank: 80 + i, line: total >= 560 ? "一本" : total >= 500 ? "二本" : "未达二本",
    })),
  });
  const reports = [
    mk("2018-10-20", "第一次月考", [600, 540, 480, 430]),
    mk("2018-11-15", "期中考试", [590, 530, 470, 420]),
  ];
  const facts = buildClassScoreTrendFacts(reports, { classNo: 16, className: "卓行16班" });
  assert.equal(facts.ok, true);
  assert.equal(facts.examCount, 2);
  assert.match(facts.examCountNote, /目前只有 2 次/);
  assert.equal(facts.exams[0].n, 4);
  assert.equal(facts.exams[0].first, 1);
  assert.equal(facts.exams[0].second, 2);
  const model = classScoreTrendChartModel(facts);
  assert.deepEqual(model.avg.series[0].values, facts.exams.map((e) => e.avg));
  assert.equal(model.bands.values.reduce((s, n) => s + n, 0), 4);
  const text = formatLocalClassScoreTrend(facts);
  assert.match(text, /波动判断/);
  assert.match(text, /本地分析/);
  const autoCls = classScoreTrendAiPayload(facts);
  assert.equal(autoCls.ok, true);
});

test("全班 AI 请求在自动模式和缺密钥时不发起调用", async () => {
  const facts = buildClassScoreTrendFacts([], { classNo: 16 });
  const r = await requestClassScoreTrend(classScoreTrendAiPayload(facts), { autoMode: true, fetchImpl: async () => { throw new Error("no"); } });
  assert.equal(r.ok, false);
  assert.equal(r.fallback, true);
});

test("处分公告栏：查实才上榜，本场无查实时有清楚说明，未查实不上公告", () => {
  const notices = [
    { id: "m1|s1|notice", date: "2017-10-20", examDate: "2017-10-15", examId: "m1", examName: "月考", examKind: "monthly", title: "校内处分公告", body: "兹查明，16班学生甲作弊。", source: "宁川中学教务处校内公告，不是省教育考试院文件。" },
  ];
  const empty = formatDisciplineBoard([], { examId: "m2", examName: "期中考试", examKind: "midterm", date: "2017-11-15" });
  assert.equal(empty.title, "校内处分公告");
  assert.equal(empty.currentNote, "本次校本考试无查实作弊公告");
  assert.equal(empty.current.length, 0);

  const withCur = formatDisciplineBoard(notices, { examId: "m1", examName: "月考", examKind: "monthly", date: "2017-10-15" });
  assert.equal(withCur.current.length, 1);
  assert.equal(withCur.currentNote, "");
  assert.match(withCur.current[0].body, /甲/);

  const gk = formatDisciplineBoard(notices, { examId: "gk", examName: "高考", examKind: "gaokao", date: "2020-06-07" });
  assert.match(gk.currentNote, /不做校内处分文件/);
  assert.equal(gk.current.length, 0);
});

test("成绩、教务处、日志和档案里能找到处分公告、掉分入口和近 5 次 / 全班分析", () => {
  const app = readFileSync(new URL("../js/ui/app.js", import.meta.url), "utf8");
  assert.match(app, /校内处分公告/);
  const cheat = readFileSync(new URL("../js/domain/cheating.js", import.meta.url), "utf8");
  assert.match(cheat, /本次校本考试无查实作弊公告/);
  assert.match(app, /board\.currentNote/);
  assert.match(app, /查看掉分原因/);
  assert.match(app, /AI 分析近 5 次成绩/);
  assert.match(app, /全班成绩 AI 分析/);
  assert.match(app, /disciplineBoardHtml/);
  assert.match(app, /scoreDropBoardHtml/);
  assert.match(app, /studentScoreTrendPanelHtml/);
  assert.match(app, /classScoreTrendPanelHtml/);
  const room = readFileSync(new URL("../js/ui/classroom.js", import.meta.url), "utf8");
  assert.match(room, /mk\.scoreDrop/);
});
