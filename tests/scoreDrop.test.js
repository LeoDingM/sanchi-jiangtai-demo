import test from "node:test";
import assert from "node:assert/strict";
import {
  detectScoreDrop, explainScoreDrop, scoreDropAiPayload, validateScoreDropText,
} from "../js/domain/scoreDrop.js";
import { requestScoreDropPolish } from "../js/domain/examAi.js";

function exam(partial) {
  const classRank = partial.classRank;
  const subjects = partial.subjects || {
    chinese: { score: 110, max: 150 },
    math: { score: 125, max: 150 },
    english: { score: 118, max: 150 },
  };
  return {
    date: partial.date,
    examName: partial.examName || "月考",
    examKind: partial.examKind || "monthly",
    examId: partial.examId || partial.date,
    classNo: partial.classNo ?? 16,
    classRank,
    classN: partial.classN ?? 74,
    total: partial.total ?? 580,
    maxTotal: 750,
    line: partial.line || "一本",
    subjects,
    cheat: partial.cheat || null,
    scoreStatus: partial.scoreStatus || "",
    discipline: partial.discipline,
    absentSubjects: partial.absentSubjects || [],
  };
}

const usualFront = [
  exam({ date: "2018-10-20", examName: "高二第一次月考", classRank: 2, total: 612 }),
  exam({ date: "2018-11-15", examName: "期中考试", examKind: "midterm", classRank: 3, total: 605 }),
  exam({ date: "2018-12-18", examName: "高二第三次月考", classRank: 4, total: 598 }),
  exam({ date: "2019-01-20", examName: "期末考试", examKind: "final", classRank: 5, total: 601 }),
];

test("平时稳定前 5、突然掉到约 42 名时给出具体原因，并同时提供系统说明与学生阐述", () => {
  const dropExam = exam({
    date: "2019-03-15",
    examName: "高二下学期月考",
    classRank: 42,
    total: 468,
    line: "未达二本",
    subjects: {
      chinese: { score: 108, max: 150 },
      math: { score: 72, max: 150 },
      english: { score: 90, max: 150 },
    },
  });
  const hist = [...usualFront, dropExam];
  const detected = detectScoreDrop(hist);
  assert.equal(detected.dropped, true);
  assert.equal(detected.dropRank, 42);
  assert.ok(detected.usualRank <= 5);
  const expl = explainScoreDrop({ id: "s-jia", name: "甲", gender: "M", personality: "好强" }, hist, { seed: 3 });
  assert.equal(expl.dropped, true);
  assert.match(expl.systemText, /42/);
  assert.match(expl.systemText, /前 5|第 5|第 4|第 3/);
  assert.match(expl.studentText, /甲|老师/);
  assert.match(expl.localText, /系统说明/);
  assert.match(expl.localText, /学生自己阐述/);
  assert.match(expl.systemText, /数学/);
  assert.doesNotMatch(expl.systemText, /作弊已经查实|一直在作弊|之前都是作弊|认定作弊/);
  assert.doesNotMatch(expl.studentText, /我作弊|一直在作弊|之前都是作弊/);
  assert.equal(expl.hasCheatFact, false);
  assert.ok(expl.speculation);
  assert.match(expl.systemText, /推测/);
});

test("有缺考或生病记录时原因与事实一致，且不会改口成作弊", () => {
  const absentExam = exam({
    date: "2019-03-15",
    examName: "高二下学期月考",
    classRank: 42,
    total: 390,
    line: "未达二本",
    absentSubjects: ["english"],
    subjects: {
      chinese: { score: 108, max: 150 },
      math: { score: 120, max: 150 },
      english: { score: 0, max: 150, absent: true },
    },
  });
  const explAbsent = explainScoreDrop({ id: "s-yi", name: "乙", gender: "F" }, [...usualFront, absentExam], { seed: 1 });
  assert.equal(explAbsent.dropped, true);
  assert.equal(explAbsent.hasAbsentFact, true);
  assert.match(explAbsent.systemText, /英语/ );
  assert.match(explAbsent.systemText, /缺考/);
  assert.match(explAbsent.studentText, /英语/);
  assert.doesNotMatch(explAbsent.systemText, /作弊已经查实|一直在作弊|之前都是作弊|认定作弊/);
  assert.equal(explAbsent.hasCheatFact, false);

  const sickExam = exam({
    date: "2019-03-15",
    examName: "高二下学期月考",
    classRank: 40,
    total: 470,
    line: "未达二本",
  });
  const sick = {
    id: "s-bing",
    name: "丙",
    gender: "F",
    healthLog: [{ date: "2019-03-13", start: "2019-03-13", until: "2019-03-14", kind: "感冒", status: "病假", text: "感冒请假" }],
  };
  const explSick = explainScoreDrop(sick, [...usualFront, sickExam], { seed: 2 });
  assert.equal(explSick.hasHealthFact, true);
  assert.match(explSick.systemText, /病假|感冒|身体不适/);
  assert.match(explSick.studentText, /感冒|不舒服|病假/);
  assert.doesNotMatch(explSick.systemText, /作弊已经查实|缺考了|因缺考|英语缺考/);
});

test("有查实作弊记录时可以说取消成绩；没有作弊记录绝不编造作弊", () => {
  const voidExam = exam({
    date: "2019-03-15",
    examName: "高二下学期月考",
    classRank: 42,
    total: 430,
    line: "未达二本",
    scoreStatus: "voided-cheat",
    discipline: "warning",
    cheat: { cheated: true, substantiated: true, voided: true, status: "voided", discipline: "warning", rawTotal: 610 },
  });
  const expl = explainScoreDrop({ id: "s-ding", name: "丁" }, [...usualFront, voidExam], { seed: 4 });
  assert.equal(expl.hasCheatFact, true);
  assert.match(expl.systemText, /查实/);
  assert.match(expl.systemText, /取消/);
  assert.doesNotMatch(expl.systemText, /依据成绩作的推测.*作弊已经查实/);

  const clean = explainScoreDrop({ id: "s-jia", name: "甲" }, [
    ...usualFront,
    exam({ date: "2019-03-15", examName: "高二下学期月考", classRank: 42, total: 468, line: "未达二本" }),
  ], { seed: 5 });
  assert.equal(clean.hasCheatFact, false);
  assert.doesNotMatch(clean.systemText, /作弊已经查实|一直在作弊|之前都是作弊|认定作弊/);
  assert.doesNotMatch(clean.studentText, /我作弊|一直在作弊|之前都是作弊/);
  assert.match(clean.systemText, /没有查实的作弊|绝不能写成作弊|不会那么写/);
  const forged = validateScoreDropText("这次掉分是因为该生一直作弊，而且数学缺考。", clean);
  assert.equal(forged.ok, false);
});

test("平时不是前 5 的正常起伏不会当成突然掉榜", () => {
  const hist = [
    exam({ date: "2018-10-20", classRank: 18, total: 520, line: "二本" }),
    exam({ date: "2018-11-15", classRank: 22, total: 510, line: "二本" }),
    exam({ date: "2018-12-18", classRank: 16, total: 525, line: "二本" }),
    exam({ date: "2019-03-15", classRank: 28, total: 500, line: "二本" }),
  ];
  assert.equal(detectScoreDrop(hist).dropped, false);
  assert.equal(explainScoreDrop({ id: "s-wu", name: "戊" }, hist).dropped, false);
});

test("平时靠前而高考或模拟未达二本也会触发说明", () => {
  const hist = [
    ...usualFront,
    exam({ date: "2019-05-08", examName: "高三一模", examKind: "mock1", classRank: 8, total: 430, line: "未达二本" }),
  ];
  const detected = detectScoreDrop(hist);
  assert.equal(detected.dropped, true);
  assert.equal(detected.missSecond, true);
  const expl = explainScoreDrop({ id: "s-ji", name: "己" }, hist, { seed: 6 });
  assert.match(expl.systemText, /未达二本/);
});

test("AI 失败或自动模式走本地文案，且自动模式不发起在线调用", async () => {
  const hist = [
    ...usualFront,
    exam({ date: "2019-03-15", examName: "高二下学期月考", classRank: 42, total: 468, line: "未达二本" }),
  ];
  const expl = explainScoreDrop({ id: "s-jia", name: "甲" }, hist, { seed: 7 });
  const auto = await requestScoreDropPolish(scoreDropAiPayload(expl), { autoMode: true });
  assert.equal(auto.ok, false);
  assert.equal(auto.fallback, true);
  assert.match(auto.reason, /自动模式/);
  assert.match(expl.localText, /系统说明/);
  assert.match(expl.localText, /学生自己阐述/);
  const noKey = await requestScoreDropPolish(scoreDropAiPayload(expl), { settings: { apiKey: "", hasKey: false } });
  assert.equal(noKey.ok, false);
});
