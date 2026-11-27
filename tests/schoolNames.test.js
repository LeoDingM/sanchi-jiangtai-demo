import test from "node:test";
import assert from "node:assert/strict";
import {
  OFFICIAL_985, OFFICIAL_211, OFFICIAL_985_COUNT, OFFICIAL_211_COUNT,
  formatSchoolName, universityMark, schoolNameTier, canonicalSchoolName,
  is985Name, is211Name, stripSchoolNameMarks,
} from "../js/domain/schoolNames.js";
import { uniTier, UNI_985, UNI_211 } from "../js/domain/jiangxi.js";
import { formatAdmissionDest, formatLastAdmissionLabel } from "../js/domain/admission.js";

test("官方名单恰好 39 所 985、112 所 211，且 985 全部含于 211", () => {
  assert.equal(OFFICIAL_985_COUNT, 39);
  assert.equal(OFFICIAL_211_COUNT, 112);
  assert.equal(new Set(OFFICIAL_985).size, 39);
  assert.equal(new Set(OFFICIAL_211).size, 112);
  for (const n of OFFICIAL_985) assert.ok(OFFICIAL_211.includes(n), n);
});

test("985 前缀是 ★ 而不是 ▲，清北亦只加 ★", () => {
  for (const n of ["清华大学", "北京大学", "清华", "北京大学医学部", "国防科技大学", "复旦大学"]) {
    assert.equal(universityMark(n), "★");
    assert.equal(formatSchoolName(n), "★" + n);
    assert.ok(!formatSchoolName(n).includes("▲"));
    assert.ok(is985Name(n));
    assert.ok(is211Name(n));
  }
  assert.equal(uniTier("清华大学"), "qingbei");
  assert.equal(uniTier("浙江大学"), "u985");
});

test("非 985 的 211 前缀是 ▲，如南昌大学", () => {
  for (const n of ["南昌大学", "北京交通大学", "中国石油大学(华东)", "华北电力大学"]) {
    assert.equal(universityMark(n), "▲");
    assert.equal(formatSchoolName(n), "▲" + n);
    assert.equal(schoolNameTier(n), "u211");
    assert.ok(!is985Name(n));
    assert.ok(is211Name(n));
  }
});

test("普通院校无前缀：南昌航空大学不是 211，深圳大学、中南民族大学不因双一流加标记", () => {
  for (const n of ["南昌航空大学", "深圳大学", "中南民族大学", "南方科技大学", "江西师范大学", "东华理工大学"]) {
    assert.equal(formatSchoolName(n), n);
    assert.equal(universityMark(n), "");
    assert.equal(schoolNameTier(n), "other");
    assert.equal(uniTier(n), "other");
    assert.ok(!UNI_985.has(n) && !is985Name(n));
    assert.ok(!is211Name(n));
  }
});

test("重复调用 formatSchoolName 不堆前缀", () => {
  const once = formatSchoolName("清华大学");
  assert.equal(once, "★清华大学");
  assert.equal(formatSchoolName(once), once);
  assert.equal(formatSchoolName("★★清华大学"), "★清华大学");
  assert.equal(formatSchoolName("▲南昌大学"), "▲南昌大学");
  assert.equal(formatSchoolName(formatSchoolName("南昌大学")), "▲南昌大学");
  assert.equal(stripSchoolNameMarks("★▲清华大学"), "清华大学");
});

test("校区、医学部和独立学院匹配规则", () => {
  assert.equal(formatSchoolName("哈尔滨工业大学(深圳)"), "★哈尔滨工业大学(深圳)");
  assert.equal(canonicalSchoolName("哈尔滨工业大学(深圳)"), "哈尔滨工业大学");
  assert.equal(formatSchoolName("中国人民大学(苏州校区)"), "★中国人民大学(苏州校区)");
  assert.equal(formatSchoolName("南昌大学共青学院"), "南昌大学共青学院");
  assert.equal(formatSchoolName("东南大学成贤学院"), "东南大学成贤学院");
  assert.equal(formatSchoolName("合肥工业大学宣城校区"), "▲合肥工业大学宣城校区");
  assert.equal(formatSchoolName("北京师范大学-"), "北京师范大学-");
  assert.equal(formatSchoolName("未录取"), "未录取");
  assert.equal(formatSchoolName("专科（未列入对照表的院校）"), "专科（未列入对照表的院校）");
  assert.equal(formatSchoolName("无"), "无");
  assert.equal(formatSchoolName("暂缺"), "暂缺");
});

test("录取去向与补习班档案院校名走统一格式化", () => {
  const dest = formatAdmissionDest({
    university: "清华大学",
    major: "计算机科学与技术",
    recruitPassed: true,
    recruitPolicy: "qj",
  });
  assert.match(dest, /★清华大学/);
  assert.doesNotMatch(dest, /▲清华大学|★▲|▲★/);
  assert.match(dest, /计算机科学与技术/);
  const nchu = formatAdmissionDest({ university: "南昌航空大学", major: "软件工程", goodSecond: true });
  assert.match(nchu, /^南昌航空大学/);
  assert.doesNotMatch(nchu, /[★▲]/);
  const nd = formatLastAdmissionLabel({ university: "南昌大学", major: "会计学" });
  assert.equal(nd, "▲南昌大学");
  assert.equal(formatLastAdmissionLabel(null), "暂缺");
  assert.equal(formatLastAdmissionLabel({ abandoned: true, university: "清华大学" }), "无");
});
