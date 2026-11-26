import test from "node:test";
import assert from "node:assert/strict";
import { generateCohort } from "../js/domain/school.js";
import { firstPlacement, rebuildClasses } from "../js/domain/placement.js";
import { runExam } from "../js/domain/examService.js";
import {
  admitCohort, admitStudent, willRepeat, missedProvincialFirst, canInsertRepeat,
  supplementProbability, COLD_MAJORS, SUPPLEMENT_SOURCE, formatAdmissionBatch, formatAdmissionDest,
  supplementUniversityPool, formatLastAdmissionLabel, packLastAdmission,
  enrichAdmissionResults, studentsForAdmissionYear, admissionClassOptions,
  filterAdmissionResults, admissionCountKpis, resolveAdmissionStudentTier,
  ADMISSION_TIER_FILTERS, ADMISSION_TRACK_FILTERS, ADMISSION_TABLE_LIMIT,
} from "../js/domain/admission.js";
import { readFileSync } from "node:fs";
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

test("补习档案录取院校：有院校则写出名称，放弃或未考上为无，旧存档缺字段为暂缺", () => {
  assert.equal(formatLastAdmissionLabel(null), "暂缺");
  assert.equal(formatLastAdmissionLabel(undefined), "暂缺");
  assert.equal(formatLastAdmissionLabel({ university: "未录取", noOffer: true }), "无");
  assert.equal(formatLastAdmissionLabel({ university: "某省属大学", abandoned: true }), "无");
  assert.equal(formatLastAdmissionLabel({ university: "某省属大学", repeatIntent: true }), "无");
  assert.equal(formatLastAdmissionLabel({ university: "某省属大学", abandoned: false, noOffer: false }), "某省属大学");
  const packed = packLastAdmission({
    university: "未录取", batch: "未达专科线", total: 200, year: 2019, track: "li",
  }, { abandoned: true });
  assert.equal(packed.noOffer, true);
  assert.equal(formatLastAdmissionLabel(packed), "无");
});

function admRow(extra = {}) {
  return {
    studentId: "s1",
    name: "张三",
    classNo: 16,
    track: "li",
    total: 520,
    batch: "二批",
    university: "某省属大学",
    major: "金融学",
    qingbei: false,
    supplement: false,
    destTier: "other",
    ...extra,
  };
}

test("新录取结果写入学生层次，destTier 仍是院校档次", () => {
  const a = admitStudent(stub("tier-write", { tier: "zhuoxing", classNo: 16 }), 535, 2020);
  assert.equal(a.tier, "zhuoxing");
  assert.ok(a.destTier);
  assert.notEqual(a.tier, a.destTier);
  const bare = admitStudent(stub("no-tier-field", { classNo: 16 }), 535, 2020);
  assert.equal(bare.tier, undefined);
  assert.ok(bare.destTier);
});

test("录取去向可按班级、层次、文理筛选，并可与搜索组合", () => {
  const rows = [
    admRow({ studentId: "a", name: "甲", classNo: 16, track: "li", tier: "zhuoxing", batch: "一批", qingbei: true, university: "清华大学", major: "数学与应用数学", total: 690 }),
    admRow({ studentId: "b", name: "乙", classNo: 16, track: "li", tier: "zhuoxing", batch: "一批", university: "南昌大学", major: "会计学", total: 560 }),
    admRow({ studentId: "c", name: "丙", classNo: 12, track: "li", tier: "zhuoxing", batch: "二批", university: "江西师范大学", major: "汉语言文学", total: 500 }),
    admRow({ studentId: "d", name: "丁", classNo: 10, track: "wen", tier: "lingxiao", batch: "一批", university: "南京大学", major: "历史学", total: 600 }),
    admRow({ studentId: "e", name: "戊", classNo: 37, track: "li", tier: "fuzhuo", batch: "二批", supplement: true, university: "南昌工程学院", major: "采矿工程", total: 528 }),
    admRow({ studentId: "f", name: "己", classNo: 1, track: "wen", tier: "yunxiu_exp", batch: "一批", university: "复旦大学", major: "新闻学", total: 640 }),
  ];
  const only16 = filterAdmissionResults(rows, { classNo: 16 });
  assert.deepEqual(only16.map((r) => r.name), ["甲", "乙"]);
  const zx = filterAdmissionResults(rows, { tier: "zhuoxing" });
  assert.deepEqual(zx.map((r) => r.name), ["甲", "乙", "丙"]);
  const wen = filterAdmissionResults(rows, { track: "wen" });
  assert.deepEqual(wen.map((r) => r.name), ["丁", "己"]);
  const liZx = filterAdmissionResults(rows, { tier: "zhuoxing", track: "li" });
  assert.deepEqual(liZx.map((r) => r.name), ["甲", "乙", "丙"]);
  const searchUni = filterAdmissionResults(rows, { query: "南昌" });
  assert.deepEqual(searchUni.map((r) => r.name), ["乙", "戊"]);
  const combo = filterAdmissionResults(rows, { classNo: 16, tier: "zhuoxing", track: "li", query: "清华" });
  assert.deepEqual(combo.map((r) => r.name), ["甲"]);
  const supp = filterAdmissionResults(rows, { query: "一本补录" });
  assert.deepEqual(supp.map((r) => r.name), ["戊"]);
  const empty = filterAdmissionResults(rows, { classNo: 99, query: "清华" });
  assert.equal(empty.length, 0);
  const all = filterAdmissionResults(rows, { classNo: "all", tier: "all", track: "all", query: "" });
  assert.equal(all.length, 6);
  assert.deepEqual(admissionClassOptions(rows), [1, 10, 12, 16, 37]);
  const kpi16 = admissionCountKpis(only16);
  assert.equal(kpi16.qingbei, 1);
  assert.equal(kpi16.first, 2);
  assert.equal(kpi16.published, 2);
  const kpiAll = admissionCountKpis(rows);
  assert.equal(kpiAll.qingbei, 1);
  assert.equal(kpiAll.first, 4);
  assert.equal(kpiAll.supplement, 1);
  assert.equal(kpiAll.second, 6);
  assert.equal(kpiAll.published, 6);
});

test("destTier 不能误当学生层次；旧存档缺 tier 时按 studentId 从该届名单补全", () => {
  const stale = [
    admRow({ studentId: "zx-1", name: "庚", classNo: 16, track: "li", destTier: "u985", university: "武汉大学" }),
    admRow({ studentId: "lx-1", name: "辛", classNo: 8, track: "li", destTier: "other", university: "东华理工大学" }),
    admRow({ studentId: "missing", name: "壬", classNo: 20, track: "li", destTier: "qingbei", university: "某校" }),
  ];
  // 旧行没有 tier 字段；destTier 即使碰巧像层次也不能用来筛
  assert.equal(stale[0].tier, undefined);
  const wronglyByDest = filterAdmissionResults(stale, { tier: "u985" });
  assert.equal(wronglyByDest.length, 0, "院校档次 u985 不应当成学生层次");
  const wronglyQingbeiTier = filterAdmissionResults(stale, { tier: "qingbei" });
  assert.equal(wronglyQingbeiTier.length, 0);
  assert.equal(resolveAdmissionStudentTier(stale[0], []), undefined);
  assert.equal(resolveAdmissionStudentTier({ destTier: "zhuoxing", studentId: "x" }, []), undefined, "即便 destTier 写成学生层次名也不能用");

  const students = [
    { id: "zx-1", name: "庚", tier: "zhuoxing", classNo: 16, entryYear: 2017 },
    { id: "lx-1", name: "辛", tier: "lingxiao", classNo: 8, entryYear: 2017 },
  ];
  const filled = enrichAdmissionResults(stale, students);
  assert.equal(filled[0].tier, "zhuoxing");
  assert.equal(filled[0].destTier, "u985", "补层次时不得改动 destTier");
  assert.equal(filled[1].tier, "lingxiao");
  assert.equal(filled[2].tier, undefined, "名单里没有的人不要编造层次");
  assert.equal(stale[0].tier, undefined, "不要改写原存档对象");
  const zx = filterAdmissionResults(filled, { tier: "zhuoxing" });
  assert.deepEqual(zx.map((r) => r.name), ["庚"]);

  const state = {
    cohorts: {
      2017: { students: students },
    },
    alumni: [{ id: "alum-1", entryYear: 2016, tier: "duxue" }],
  };
  const found = studentsForAdmissionYear(state, 2017);
  assert.equal(found.length, 2);
  assert.ok(found.every((s) => s.entryYear === 2017 || !s.entryYear || students.some((x) => x.id === s.id)));
  // 毕业后该届 cohort 已删除，只从校友补
  const after = studentsForAdmissionYear({
    cohorts: { 2020: { students: [{ id: "fresh", entryYear: 2020, tier: "zhuoxing" }] } },
    alumni: [
      { id: "zx-1", entryYear: 2017, tier: "zhuoxing" },
      { id: "other", entryYear: 2016, tier: "lingxiao" },
    ],
  }, 2017);
  assert.deepEqual(after.map((s) => s.id), ["zx-1"]);
  const filledAlum = enrichAdmissionResults(stale, after);
  assert.equal(filledAlum[0].tier, "zhuoxing");
});

test("录取去向页有班级、层次、科类筛选，人数 KPI 随筛选更新，公开省控不随筛选改", () => {
  const src = readFileSync(new URL("../js/ui/app.js", import.meta.url), "utf8");
  const fn = src.match(/function viewAdmission\(host\) \{[\s\S]*?\n\}\n\nfunction viewAuto/);
  assert.ok(fn, "找不到 viewAdmission");
  const body = fn[0];
  assert.match(body, /<label>班级 <select id="adm-class">/);
  assert.match(body, /全部班级/);
  assert.match(body, /<label>层次 <select id="adm-tier">/);
  assert.match(body, /<label>科类 <select id="adm-track">/);
  assert.match(body, /ADMISSION_TIER_FILTERS/);
  assert.match(body, /ADMISSION_TRACK_FILTERS/);
  assert.match(body, /placeholder="搜索姓名、大学或专业"/);
  assert.match(body, /class="filters"/);
  assert.match(body, /filterAdmissionResults/);
  assert.match(body, /admissionCountKpis/);
  assert.match(body, /enrichAdmissionResults/);
  assert.match(body, /studentsForAdmissionYear/);
  assert.match(body, /adm-official-kpi/);
  assert.match(body, /adm-count-kpi/);
  assert.match(body, /没有符合当前筛选的录取记录/);
  assert.match(body, /其余 \$\{rest\} 人未列出/);
  assert.match(body, /不随筛选变化/);
  assert.doesNotMatch(body, /destTier === |destTier == /);
  assert.equal(ADMISSION_TABLE_LIMIT, 250);
  assert.deepEqual(ADMISSION_TIER_FILTERS.map((x) => x[0]), ["all", "yunxiu_exp", "yunxiu_key", "lingxiao", "zhuoxing", "duxue", "yiti", "fuzhuo"]);
  assert.deepEqual(ADMISSION_TRACK_FILTERS.map((x) => x[0]), ["all", "li", "wen"]);
  assert.match(ADMISSION_TIER_FILTERS.map((x) => x[1]).join(","), /云岫实验 0\/1/);
  assert.match(ADMISSION_TIER_FILTERS.map((x) => x[1]).join(","), /云岫重点 2—4/);
  // 教务处层次口径应一致
  const office = src.match(/function viewOffice\(host\) \{[\s\S]*?const tiers = (\[[\s\S]*?\]);/);
  assert.ok(office);
  assert.match(office[1], /全部层次/);
  assert.match(office[1], /yunxiu_exp/);
  assert.match(office[1], /fuzhuo/);
});
