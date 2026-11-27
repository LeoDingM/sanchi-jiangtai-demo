import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAlumniBoostBoard, outstandingAlumniAdmits, isOutstandingAdmission,
  isAlumniBoostWindow, alumniBoostAiPayload, validateAlumniBoostText,
  formatAlumniBoostLocal, ALUMNI_BOOST_TITLE,
} from "../js/domain/alumniBoost.js";
import { formatSchoolName } from "../js/domain/schoolNames.js";
import { requestAlumniBoostPolish } from "../js/domain/examAi.js";

function alum(partial) {
  const admission = {
    studentId: partial.studentId || "s1",
    name: partial.name || "甲",
    classNo: partial.classNo ?? 0,
    year: partial.year ?? 2019,
    university: partial.university,
    major: partial.major || "数学与应用数学",
    total: partial.total ?? 680,
    firstLine: partial.firstLine ?? 535,
    qingbei: !!partial.qingbei,
    destTier: partial.destTier,
    batch: partial.batch || "一批",
    supplement: !!partial.supplement,
    goodSecond: !!partial.goodSecond,
    abandoned: !!partial.abandoned,
    noOffer: !!partial.noOffer,
  };
  return { id: admission.studentId, name: admission.name, classNo: admission.classNo, graduatedYear: 2020, admission };
}

function stateWith(alumni, date = "2020-05-20", extra = {}) {
  return { date, seed: 7, alumni, admissions: extra.admissions || {} };
}

test("高考季且有清华等亮眼录取时出现学长学姐助力高考板块，语录含真实校名与标记", () => {
  const st = stateWith([
    alum({ studentId: "a1", name: "甲", university: "清华大学", qingbei: true, total: 688 }),
    alum({ studentId: "a2", name: "乙", university: "南昌大学", destTier: "u211", total: 580 }),
  ], "2020-05-20");
  assert.equal(isAlumniBoostWindow(st.date), true);
  const board = buildAlumniBoostBoard(st);
  assert.equal(board.visible, true);
  assert.equal(board.title, ALUMNI_BOOST_TITLE);
  assert.ok(board.quotes.some((q) => q.name === "甲" && q.university === "清华大学"));
  const text = board.localText;
  assert.match(text, /甲/);
  assert.match(text, /★清华大学/);
  assert.doesNotMatch(text, /▲清华大学|★▲/);
  assert.equal(formatSchoolName("清华大学"), "★清华大学");
});

test("没有亮眼录取时不出现板块，也不虚构清华或清北", () => {
  const st = stateWith([
    alum({ studentId: "b1", name: "丙", university: "南昌航空大学", destTier: "other", total: 540, firstLine: 535, batch: "二批" }),
    alum({ studentId: "b2", name: "丁", university: "江西师范大学", destTier: "other", total: 548, firstLine: 535 }),
    alum({ studentId: "b3", name: "戊", university: "未录取", noOffer: true, total: 300 }),
  ], "2020-05-20");
  const board = buildAlumniBoostBoard(st);
  assert.equal(board.visible, false);
  assert.equal(board.quotes.length, 0);
  assert.doesNotMatch(board.localText || board.reason, /清华|北京大学|清北|复旦/);
  assert.match(board.reason, /不编造|没有足够突出/);
  assert.equal(outstandingAlumniAdmits(st).length, 0);
});

test("一本补录或未录取不算突出，普通二本不会单独撑起板块", () => {
  const st = stateWith([
    alum({ studentId: "c1", name: "己", university: "南昌航空大学", supplement: true, batch: "一批", total: 530, firstLine: 535 }),
    alum({ studentId: "c2", name: "庚", university: "东华理工大学", goodSecond: true, total: 545, firstLine: 535 }),
  ], "2020-05-16");
  assert.equal(buildAlumniBoostBoard(st).visible, false);
  assert.equal(isOutstandingAdmission(st.alumni[0].admission), false);
});

test("不在高三备考或高考季时即使有清北也不展示板块", () => {
  const st = stateWith([
    alum({ studentId: "d1", name: "甲", university: "北京大学", qingbei: true, total: 670, year: 2019 }),
  ], "2019-11-12");
  const board = buildAlumniBoostBoard(st);
  assert.equal(board.windowOpen, false);
  assert.equal(board.visible, false);
  assert.ok(outstandingAlumniAdmits(st).length >= 1);
});

test("AI 失败或自动模式走本地事实语录，且不会在自动模式发起在线调用", async () => {
  const st = stateWith([
    alum({ studentId: "e1", name: "甲", university: "清华大学", qingbei: true, total: 690 }),
    alum({ studentId: "e2", name: "乙", university: "复旦大学", destTier: "u985", total: 660 }),
  ], "2020-06-01");
  const board = buildAlumniBoostBoard(st);
  assert.equal(board.visible, true);
  const auto = await requestAlumniBoostPolish(alumniBoostAiPayload(board), { autoMode: true });
  assert.equal(auto.ok, false);
  assert.equal(auto.fallback, true);
  assert.match(auto.reason, /自动模式/);
  const local = formatAlumniBoostLocal(board.quotes, { years: board.years });
  assert.match(local, /★清华大学/);
  assert.match(local, /★复旦大学/);
  assert.match(local, /甲/);
});

test("润色稿若虚构材料中没有的清华则校验失败并保持本地标记规则", () => {
  const st = stateWith([
    alum({ studentId: "f1", name: "乙", university: "南昌大学", destTier: "u211", total: 600, firstLine: 535, batch: "一批" }),
  ], "2020-05-20");
  const board = buildAlumniBoostBoard(st);
  assert.equal(board.visible, true);
  assert.match(board.localText, /▲南昌大学/);
  const bad = validateAlumniBoostText("祝贺甲考上清华大学，也祝乙进入北京大学。", board);
  assert.equal(bad.ok, false);
  const good = validateAlumniBoostText("乙被▲南昌大学录取，请学弟学妹稳住心态。", board);
  assert.equal(good.ok, true);
  const restored = validateAlumniBoostText("乙去了南昌大学，把该复习的做完。", board);
  assert.equal(restored.ok, true);
  assert.match(restored.text, /▲南昌大学/);
});
