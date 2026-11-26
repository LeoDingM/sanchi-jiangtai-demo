import test from "node:test";
import assert from "node:assert/strict";
import { generateCohort } from "../js/domain/school.js";
import { firstPlacement, rebuildClasses } from "../js/domain/placement.js";
import { runExam } from "../js/domain/examService.js";
import { JOINT_SOURCE_NOTE, JOINT_POOL_META } from "../js/domain/jointExam.js";

function placed(seed) {
  let c = generateCohort(2017, seed);
  const pre = runExam(c, { id: "pre", name: "预", examKind: "final", difficulty: 1, dispersion: 1, date: "2018-01-16" }, { grade: 1, split: false });
  c = { ...c, students: firstPlacement(c.students, pre.scoreMap, { seed }).students };
  c.classes = rebuildClasses(c.students);
  return c;
}

function runJoint(seed, kind, difficulty, dispersion) {
  const c = placed(seed);
  return runExam(c, {
    id: `${kind}-${seed}`,
    name: kind === "city" ? "市联考" : "省联考",
    examKind: kind,
    difficulty,
    dispersion,
    date: kind === "city" ? "2020-04-18" : "2020-05-20",
  }, { grade: 3, split: true });
}

test("市联考划市/县线并给出市排县排校排，不用校内第400/1000名冒充", () => {
  const r = runJoint(7, "city", 1.0, 1.0);
  assert.equal(r.sourceNote, JOINT_SOURCE_NOTE);
  assert.ok(r.joint?.city?.li && r.joint?.county?.li && r.joint?.city?.wen && r.joint?.county?.wen);
  assert.equal(r.joint.province?.li, undefined);
  const schoolLi = r.cutoffs.li;
  assert.ok(r.joint.city.li.firstN > 1000, "市一本对应位次应远大于校内第400名量级");
  assert.notEqual(r.joint.city.li.firstLine, schoolLi.firstLine);
  assert.ok(r.joint.city.li.n + r.joint.city.wen.n >= 80000);
  assert.ok(r.joint.county.li.n + r.joint.county.wen.n >= 7000);
  const li = r.rows.filter((x) => !x.repeat && x.track === "li");
  assert.ok(li.every((x) => x.cityRank >= 1 && x.countyRank >= 1 && x.rank >= 1));
  assert.ok(li.every((x) => x.cityRank >= x.countyRank));
  assert.ok(li.every((x) => !x.provinceRank));
  assert.ok(li.some((x) => x.jointLine?.city));
  assert.ok(li.every((x) => x.rank >= 1), "校排应写回考生行");
  assert.ok(Math.abs(r.joint.city.li.firstLine - 535) <= 12);
  assert.ok(r.joint.county.li.gap >= 62 && r.joint.county.li.gap <= 95);

  const a = runJoint(7, "city", 1.0, 1.0);
  assert.equal(a.joint.city.li.firstLine, r.joint.city.li.firstLine);
  assert.equal(a.rows[0].cityRank, r.rows[0].cityRank);
});

test("省联考划省/市/县线并给出省排市排校排，分差接近公开省控量级", () => {
  const r = runJoint(7, "province", 1.0, 1.0);
  assert.ok(r.sourceNote.includes("不是当年官方联考一分一段"));
  const pLi = r.joint.province.li;
  const pWen = r.joint.province.wen;
  assert.equal(pLi.firstN, JOINT_POOL_META.province.li.firstN);
  assert.equal(pLi.secondN, JOINT_POOL_META.province.li.secondN);
  assert.ok(pLi.gap >= 62 && pLi.gap <= 95, `理科省模拟分差应接近 72–84，实际 ${pLi.gap}`);
  assert.ok(pWen.gap >= 45 && pWen.gap <= 90, `文科省模拟分差应接近 56–75，实际 ${pWen.gap}`);
  assert.ok(r.joint.city.li && r.joint.county.li);
  const li = r.rows.filter((x) => !x.repeat && x.track === "li");
  assert.ok(li.every((x) => x.provinceRank >= 1 && x.cityRank >= 1 && x.rank >= 1));
  assert.ok(li.every((x) => x.provinceRank >= x.cityRank && x.cityRank >= x.countyRank));
  assert.notEqual(pLi.firstN, r.cutoffs.li.firstN, "省联考一本名额应来自省模拟池，不是校内线名额");
  // 模拟池划出的分数线可能碰巧与校内一本线相同，不能靠分值是否相等来判断来源。
});

test("联考分数线随难度波动，由模拟池位次算出而不是手写", () => {
  const easy = runJoint(3, "province", 1.05, 1.0);
  const hard = runJoint(3, "province", 0.95, 1.0);
  assert.ok(easy.joint.province.li.firstLine > hard.joint.province.li.firstLine);
  assert.ok(easy.joint.city.li.firstLine > hard.joint.city.li.firstLine);
  const mid = runJoint(3, "province", 1.0, 1.0);
  // 难度=1、离散=1 时应接近 2020 公开省控（理 535/463，文 547/488）
  assert.ok(Math.abs(mid.joint.province.li.firstLine - 535) <= 8, `理一本 ${mid.joint.province.li.firstLine}`);
  assert.ok(Math.abs(mid.joint.province.li.secondLine - 463) <= 8, `理二本 ${mid.joint.province.li.secondLine}`);
});
