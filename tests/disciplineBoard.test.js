import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  formatDisciplineBoard,
  enrichDisciplineNotice,
  filterDisciplineNotices,
  disciplineNoticeFilterOptions,
  disciplineBoardButtonLabel,
  disciplineBoardEmptyNote,
  filtersAreActive,
} from "../js/domain/cheating.js";

function notice(partial) {
  return {
    id: `${partial.examId}|${partial.studentId}|notice`,
    title: "校内处分公告",
    date: partial.date || partial.examDate,
    source: "宁川中学教务处校内公告，不是省教育考试院文件。",
    ...partial,
  };
}

const notices = [
  notice({
    examId: "m1", examName: "月考", examKind: "monthly", examDate: "2017-10-15", date: "2017-10-20",
    studentId: "s1", name: "甲", classNo: 16, tier: "zhuoxing", track: "li",
    body: "兹查明，16班学生甲作弊。",
  }),
  notice({
    examId: "m1", examName: "月考", examKind: "monthly", examDate: "2017-10-15", date: "2017-10-20",
    studentId: "s2", name: "乙", classNo: 1, tier: "yunxiu_exp", track: "wen",
    body: "兹查明，1班学生乙作弊。",
  }),
  notice({
    examId: "mid", examName: "期中考试", examKind: "midterm", examDate: "2017-11-15", date: "2017-11-18",
    studentId: "s3", name: "丙", classNo: 16, tier: "zhuoxing", track: "li",
    body: "兹查明，16班学生丙作弊。",
  }),
  notice({
    examId: "fin", examName: "期末考试", examKind: "final", examDate: "2018-01-16", date: "2018-01-20",
    studentId: "s4", name: "丁", classNo: 5, tier: "lingxiao", track: "li",
    body: "兹查明，5班学生丁作弊。",
  }),
];

test("处分公告按钮有条数，零条时按钮文案仍在", () => {
  assert.equal(disciplineBoardButtonLabel(12), "校内处分公告（12）");
  assert.equal(disciplineBoardButtonLabel(0), "校内处分公告");
  assert.equal(disciplineBoardButtonLabel(1), "校内处分公告（1）");
});

test("筛选按考试、层级、班级、文理工作正确，未写入的举报本来就不在列中", () => {
  const byExam = filterDisciplineNotices(notices, { examId: "m1" });
  assert.equal(byExam.length, 2);
  assert.ok(byExam.every((n) => n.examId === "m1"));
  assert.deepEqual(byExam.map((n) => n.name).sort(), ["乙", "甲"]);

  const byTier = filterDisciplineNotices(notices, { tier: "zhuoxing" });
  assert.equal(byTier.length, 2);
  assert.ok(byTier.every((n) => n.tier === "zhuoxing"));

  const byClass = filterDisciplineNotices(notices, { classNo: 16 });
  assert.equal(byClass.length, 2);
  assert.ok(byClass.every((n) => Number(n.classNo) === 16));

  const byWen = filterDisciplineNotices(notices, { track: "wen" });
  assert.equal(byWen.length, 1);
  assert.equal(byWen[0].name, "乙");

  const byLi = filterDisciplineNotices(notices, { track: "li" });
  assert.equal(byLi.length, 3);

  const combo = filterDisciplineNotices(notices, { examId: "m1", classNo: 16, track: "li", tier: "zhuoxing" });
  assert.equal(combo.length, 1);
  assert.equal(combo[0].name, "甲");

  const miss = filterDisciplineNotices(notices, { examId: "m1", track: "wen", classNo: 16 });
  assert.equal(miss.length, 0);

  const opts = disciplineNoticeFilterOptions(notices);
  assert.ok(opts.exams.some((e) => e.value === "m1"));
  assert.ok(opts.exams.some((e) => e.label.includes("期中考试")));
  assert.deepEqual(opts.tiers, ["yunxiu_exp", "lingxiao", "zhuoxing"]);
  assert.deepEqual(opts.classes, [1, 5, 16]);
  assert.deepEqual(opts.tracks, ["li", "wen"]);
});

test("enrich 可从学生档案补层级和文理，缺档案时仍可按公告已有字段筛", () => {
  const raw = notice({
    examId: "m2", examName: "月考", examKind: "monthly", examDate: "2017-12-15", date: "2017-12-18",
    studentId: "s5", name: "戊", classNo: 2, body: "兹查明，2班学生戊作弊。",
  });
  const filled = enrichDisciplineNotice(raw, { id: "s5", classNo: 2, tier: "yunxiu_key", track: "li", name: "戊" });
  assert.equal(filled.tier, "yunxiu_key");
  assert.equal(filled.track, "li");
  const hit = filterDisciplineNotices([filled], { tier: "yunxiu_key", track: "li", classNo: 2 });
  assert.equal(hit.length, 1);
});

test("无查实或筛空时给出本次/当前范围说明，不把未查实写进列表", () => {
  const emptyExam = formatDisciplineBoard([], { examId: "m2", examName: "期中考试", examKind: "midterm", date: "2017-11-15" });
  assert.equal(emptyExam.currentNote, "本次校本考试无查实作弊公告");
  assert.equal(emptyExam.current.length, 0);

  assert.equal(disciplineBoardEmptyNote({
    exam: { examKind: "midterm" }, filters: {}, currentCount: 0, filteredCount: 0, totalCount: 0,
  }), "本次校本考试无查实作弊公告");

  assert.equal(disciplineBoardEmptyNote({
    exam: { examKind: "midterm" }, filters: { examId: "m1" }, currentCount: 0, filteredCount: 0, totalCount: 4,
  }), "当前范围无查实作弊公告");

  assert.equal(disciplineBoardEmptyNote({
    exam: { examKind: "gaokao" }, filters: {}, currentCount: 0, filteredCount: 0, totalCount: 4,
  }), "高考、会考或官方联考不做校内处分文件。");

  assert.equal(disciplineBoardEmptyNote({
    exam: null, filters: {}, currentCount: 0, filteredCount: 0, totalCount: 0,
  }), "当前范围无查实作弊公告");

  assert.equal(disciplineBoardEmptyNote({
    exam: { examKind: "monthly" }, filters: {}, currentCount: 1, filteredCount: 2, totalCount: 4,
  }), "");

  assert.equal(filtersAreActive({ examId: "all", tier: "all" }), false);
  assert.equal(filtersAreActive({ examId: "m1" }), true);
});

function functionSource(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) return "";
  const next = src.indexOf("\nfunction ", start + 1);
  return next < 0 ? src.slice(start) : src.slice(start, next);
}

test("成绩、教务处、日志默认只放公告按钮，点开后同一套筛选弹层，不内嵌长列表", () => {
  const app = readFileSync(new URL("../js/ui/app.js", import.meta.url), "utf8");
  const entry = functionSource(app, "disciplineBoardHtml");
  assert.match(entry, /data-open-discipline/);
  assert.match(entry, /disciplineBoardButtonLabel/);
  assert.doesNotMatch(entry, /历史查实公告/);
  assert.doesNotMatch(entry, /discipline-item/);
  assert.doesNotMatch(entry, /x\.body/);

  const dropEntry = functionSource(app, "scoreDropBoardHtml");
  assert.match(dropEntry, /data-open-score-drop/);
  assert.doesNotMatch(dropEntry, /data-open-drop/);
  assert.doesNotMatch(dropEntry, /下列学生相对平时出现大幅退步/);

  assert.match(app, /function openDisciplineDialog/);
  assert.match(app, /disc-filter-exam/);
  assert.match(app, /disc-filter-tier/);
  assert.match(app, /disc-filter-class/);
  assert.match(app, /disc-filter-track/);
  assert.match(app, /当前范围无查实作弊公告|disciplineBoardEmptyNote/);
  assert.match(app, /function openScoreDropDialog/);

  const grades = functionSource(app, "viewGrades");
  const office = functionSource(app, "viewOffice");
  const log = functionSource(app, "viewLog");
  for (const [name, src] of [["viewGrades", grades], ["viewOffice", office], ["viewLog", log]]) {
    assert.match(src, /disciplineBoardHtml/, `${name} 应使用同一套按钮入口`);
    assert.doesNotMatch(src, /formatDisciplineBoard\(/, `${name} 不应再直接把长列表写进页面`);
  }
  assert.match(log, /bindBoardDialogs/);
  assert.match(app, /function bindBoardDialogs/);
});
