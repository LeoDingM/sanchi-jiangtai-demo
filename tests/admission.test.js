import test from "node:test";
import assert from "node:assert/strict";
import { generateCohort } from "../js/domain/school.js";
import { firstPlacement, rebuildClasses } from "../js/domain/placement.js";
import { runExam } from "../js/domain/examService.js";
import {
  admitCohort, admitStudent, willRepeat, missedProvincialFirst, canInsertRepeat,
  supplementProbability, COLD_MAJORS, SUPPLEMENT_SOURCE, formatAdmissionBatch, formatAdmissionDest,
  supplementUniversityPool,
} from "../js/domain/admission.js";
import { provincialLines, universities, uniTier, UNI_985, UNI_211 } from "../js/domain/jiangxi.js";

function stub(id, extra = {}) {
  return {
    id,
    name: "测" + id,
    track: "li",
    majorPref: "财经",
    personality: "随和",
    classNo: 16,
    family: { type: "务农" },
    ...extra,
  };
}

test("2020 年录取：达线才进对应批次，清北必须达到公开投档线", () => {
  let c = generateCohort(2017, 20170901);
  const pre = runExam(c, { id: "pre", name: "预", examKind: "final", difficulty: 1, dispersion: 1, date: "2018-01-16" }, { grade: 1, split: false });
  c = { ...c, students: firstPlacement(c.students, pre.scoreMap, { seed: 20170901 }).students, classes: null };
  c.classes = rebuildClasses(c.students);
  const gk = runExam(c, { id: "gk", name: "高考", examKind: "gaokao", difficulty: 1.003, dispersion: 1, date: "2020-06-07" }, { grade: 3, split: true });
  const ads = admitCohort(c.students.filter((s) => !s.repeat), gk.scoreMap, 2020);
  const linesLi = provincialLines(2020, "li");
  const linesWen = provincialLines(2020, "wen");
  const suppByClass = {};
  for (const a of ads) {
    const L = a.track === "wen" ? linesWen : linesLi;
    if (a.batch === "一批") {
      assert.ok(a.total >= L.first, `${a.name} ${a.total} < ${L.first}`);
      assert.ok(!a.supplement, `达一本线的 ${a.name} 不应标补录`);
    }
    if (a.batch === "二批") assert.ok(a.total >= L.second && a.total < L.first);
    if (a.supplement) {
      assert.equal(a.batch, "二批");
      assert.ok(a.total < L.first);
      suppByClass[a.classNo] = (suppByClass[a.classNo] || 0) + 1;
    }
    if (a.qingbei) {
      const need = a.track === "wen" ? 644 : 686;
      assert.ok(a.total >= need, `清北 ${a.name} ${a.total} 未达 ${need}`);
      assert.match(a.university, /清华大学|北京大学/);
      assert.ok(!a.supplement);
    }
  }
  const qb = ads.filter((a) => a.qingbei);
  assert.ok(qb.length <= 4, `清北人数应稀缺，实际 ${qb.length}`);
  const zxNos = new Set(c.students.filter((s) => s.tier === "zhuoxing").map((s) => s.classNo));
  for (const no of zxNos) {
    const n = suppByClass[no] || 0;
    assert.ok(n <= 8, `卓行${no}班一本补录不应大批出现，实际 ${n}`);
  }
});

test("达一本线仍是一批，不标补录；清北仍须达公开投档线", () => {
  const year = 2020;
  const firstLi = provincialLines(year, "li").first;
  const onLine = admitStudent(stub("on-line-li"), firstLi, year);
  assert.equal(onLine.batch, "一批");
  assert.ok(!onLine.supplement);
  assert.ok(onLine.major);
  assert.ok(["金融学", "会计学", "财务管理", "国际经济与贸易"].includes(onLine.major), `达线一批应给更合理专业，实际 ${onLine.major}`);
  const above = admitStudent(stub("above-li"), firstLi + 20, year);
  assert.equal(above.batch, "一批");
  assert.ok(!above.supplement);

  const qbScore = 686;
  const qb = admitStudent(stub("qingbei-try", { majorPref: "理工" }), qbScore, year);
  if (qb.qingbei) {
    assert.ok(qb.total >= 686);
    assert.match(qb.university, /清华大学|北京大学/);
    assert.ok(!qb.supplement);
  }
  const almostQb = admitStudent(stub("almost-qb"), 685, year);
  assert.ok(!almostQb.qingbei);
  assert.doesNotMatch(almostQb.university || "", /清华大学|北京大学/);
});

test("远低于一本线（低 15 分以上）绝不补录一本", () => {
  const year = 2020;
  for (const track of ["li", "wen"]) {
    const first = provincialLines(year, track).first;
    for (const gap of [15, 16, 20, 30, 40]) {
      for (let i = 0; i < 80; i++) {
        const a = admitStudent(stub(`far-${track}-${gap}-${i}`, { track }), first - gap, year);
        assert.ok(!a.supplement, `${track} 低${gap}分 id=${i} 不应补录`);
        assert.notEqual(a.batch, "一批");
        if (a.university && !/未录取|专科/.test(a.university)) {
          const same = universities().filter((x) => x.name === a.university && x.track === track);
          const viaSecond = same.some((x) => x.batch !== "一批" && a.total >= x.score + (year === 2020 ? 0 : 0));
          const onlyFirst = same.length && same.every((x) => x.batch === "一批");
          assert.ok(!onlyFirst, `${a.university} 若只有一批条目，远低于一本线不应录到`);
          if (a.uniScore != null) assert.ok(a.uniScore < first, `投档线 ${a.uniScore} 不应按一本补录`);
          void viaSecond;
        }
      }
    }
  }
  assert.equal(supplementProbability(0), 0);
  assert.equal(supplementProbability(11), 0);
  assert.equal(supplementProbability(15), 0);
  assert.ok(supplementProbability(1) >= 0.25 && supplementProbability(1) <= 0.30);
  assert.ok(supplementProbability(5) >= 0.13 && supplementProbability(5) <= 0.17);
  assert.ok(supplementProbability(8) >= 0.05 && supplementProbability(8) <= 0.08);
});

test("离一本线很近的二本可能补录弱一本冷门专业，批次仍为二批，结果稳定", () => {
  const year = 2020;
  const firstLi = provincialLines(year, "li").first;
  const hits = [];
  for (let i = 0; i < 400; i++) {
    const s = stub(`sup-li-${i}`, { track: "li", majorPref: "财经" });
    const a = admitStudent(s, firstLi - 2, year);
    if (a.supplement) hits.push({ s, a });
  }
  assert.ok(hits.length >= 5, `理科差 2 分应有人补录，实际 ${hits.length}/400`);
  assert.ok(hits.length <= 200, `补录概率应克制，实际 ${hits.length}/400`);

  const coldLi = new Set(COLD_MAJORS.li);
  for (const { s, a } of hits) {
    assert.equal(a.batch, "二批");
    assert.equal(a.supplement, true);
    assert.ok(a.total < firstLi);
    assert.ok(missedProvincialFirst(a));
    assert.equal(uniTier(a.university), "other");
    assert.ok(!UNI_985.has(a.university) && !UNI_211.has(a.university));
    const u = universities().find((x) => x.name === a.university && x.track === "li");
    assert.ok(u, `补录院校应在对照表中：${a.university}`);
    assert.equal(u.batch, "一批");
    assert.ok(coldLi.has(a.major), `补录专业应是冷门，实际 ${a.major}`);
    assert.notEqual(a.major, "金融学");
    assert.ok(!/金融|会计|临床|法学/.test(a.major));
    assert.match(a.uniSource, /校内规则示意/);
    assert.equal(a.supplementSource, SUPPLEMENT_SOURCE);
    assert.match(formatAdmissionBatch(a), /一本补录/);
    assert.match(formatAdmissionDest(a), /一本补录/);
    assert.match(formatAdmissionDest(a), new RegExp(a.major));

    const again = admitStudent(s, firstLi - 2, year);
    assert.equal(again.university, a.university);
    assert.equal(again.major, a.major);
    assert.equal(again.supplement, true);
    assert.equal(again.batch, "二批");
  }

  const wenFirst = provincialLines(year, "wen").first;
  const wenHits = [];
  for (let i = 0; i < 400; i++) {
    const s = stub(`sup-wen-${i}`, { track: "wen", majorPref: "法学" });
    const a = admitStudent(s, wenFirst - 1, year);
    if (a.supplement) wenHits.push(a);
  }
  assert.ok(wenHits.length >= 3, `文科差 1 分应有人补录，实际 ${wenHits.length}/400`);
  const coldWen = new Set(COLD_MAJORS.wen);
  for (const a of wenHits) {
    assert.equal(a.batch, "二批");
    assert.equal(a.supplement, true);
    assert.equal(uniTier(a.university), "other");
    assert.ok(!UNI_211.has(a.university));
    const u = universities().find((x) => x.name === a.university && x.track === "wen");
    assert.equal(u.batch, "一批");
    assert.ok(coldWen.has(a.major));
    assert.notEqual(a.major, "法学");
  }

  const poolLi = supplementUniversityPool("li", 2020, firstLi);
  const names = poolLi.map((u) => u.name);
  assert.ok(names.includes("南昌工程学院") || names.includes("景德镇陶瓷大学") || names.includes("东华理工大学") || names.includes("江西理工大学"));
  assert.ok(names.some((n) => /井冈山大学|景德镇陶瓷|南昌工程|东华理工|江西理工/.test(n)));
  assert.ok(poolLi.every((u) => u.batch === "一批" && uniTier(u.name) === "other"));
});

test("已补录上一本时多数就读，未达省控一本仍算 missedProvincialFirst", () => {
  const year = 2020;
  const first = provincialLines(year, "li").first;
  let supp = null;
  let student = null;
  for (let i = 0; i < 400; i++) {
    const s = stub(`rep-sup-${i}`, { personality: "随和", family: { type: "务农" }, classNo: 2 });
    const a = admitStudent(s, first - 3, year);
    if (a.supplement) {
      supp = a;
      student = s;
      break;
    }
  }
  assert.ok(supp, "应能找到一名补录生");
  assert.equal(willRepeat(student, supp, year), false, "性格随和的补录生应多数就读");
  assert.equal(missedProvincialFirst(supp), true);
  const insertAdm = { ...supp, repeatIntent: true };
  assert.equal(canInsertRepeat({ ...student, classNo: 2 }, insertAdm), true, "未达省控一本仍可按插班规则判断");
  assert.equal(canInsertRepeat({ ...student, classNo: 1 }, insertAdm), false, "1 班不做插班");

  const closeNoSuppIds = [];
  for (let i = 0; i < 200; i++) {
    const s = stub(`rep-close-${i}`, { personality: "好强", family: { type: "教师" } });
    const a = admitStudent(s, first - 3, year);
    if (!a.supplement) closeNoSuppIds.push({ s, a });
  }
  assert.ok(closeNoSuppIds.length, "差几分未补录的人应存在");
  assert.equal(willRepeat(closeNoSuppIds[0].s, closeNoSuppIds[0].a, year), true, "差几分没补录且好强有支持的人复读倾向仍高");

  let ambitiousSuppRepeat = 0;
  let ambitiousSuppN = 0;
  for (let i = 0; i < 400; i++) {
    const s = stub(`rep-amb-${i}`, { personality: "好强", family: { type: "教师" } });
    const a = admitStudent(s, first - 2, year);
    if (!a.supplement) continue;
    ambitiousSuppN += 1;
    if (willRepeat(s, a, year)) ambitiousSuppRepeat += 1;
  }
  assert.ok(ambitiousSuppN >= 10, `应有足够的好强补录样本，实际 ${ambitiousSuppN}`);
  const rate = ambitiousSuppRepeat / ambitiousSuppN;
  assert.ok(rate <= 0.25, `补录后好强复读率应明显降低，实际 ${ambitiousSuppRepeat}/${ambitiousSuppN}`);
});
