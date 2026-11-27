import test from "node:test";
import assert from "node:assert/strict";
import {
  generateCohort, generateOpeningSchool, applyRepeaterSeating, placeGraduatingRepeaters,
  eraQuality,
} from "../js/domain/school.js";
import { firstPlacement, secondPlacement, rebuildClasses } from "../js/domain/placement.js";
import { runExam } from "../js/domain/examService.js";
import { examParams } from "../js/domain/calendar.js";
import { provincialPassCounts } from "../js/domain/schoolLines.js";
import { formatLastAdmissionLabel, packLastAdmission } from "../js/domain/admission.js";
import { formatLastGaokaoText } from "../js/domain/scores.js";
import { canInsertRepeat, missedProvincialFirst, admitCohort, isProvincialFirst, isProvincialSecond } from "../js/domain/admission.js";
import { createGame, skipToGaokaoOf, skipToNextCohort } from "../js/domain/simulation.js";
import {
  FIRST_PLACEMENT_TARGETS, REPEAT_WEN_NOS, REPEAT_LI_NOS, REPEAT_CLASS_SIZE,
  INSERT_REPEAT_CLASS_NOS, TIER,
} from "../js/domain/config.js";

const LI_SIZES = Object.fromEntries(FIRST_PLACEMENT_TARGETS.li.map((t) => [t.no, t.size]));
const TUTORING_NOS = [...REPEAT_WEN_NOS, ...REPEAT_LI_NOS];

function placed(seed, { entryYear = 2017, withRepeat = false } = {}) {
  let c = generateCohort(entryYear, seed, { alreadySplit: false, withRepeat });
  const pre = runExam(c, { id: "pre", name: "预", examKind: "final", difficulty: 1, dispersion: 1, date: `${entryYear + 1}-01-16` }, { grade: 1, split: false });
  c = { ...c, students: firstPlacement(c.students, pre.scoreMap, { seed }).students };
  c.classes = rebuildClasses(c.students);
  return { c, pre };
}

function regularLi(students) {
  return students.filter((s) => !s.repeat && s.track === "li" && s.tier !== "yiti" && s.classNo < 31);
}

function tutoringOf(students, track) {
  return students.filter((s) => s.repeat && s.classNo >= 31 && (track === "wen" ? s.track === "wen" : s.track === "li"));
}

function assertTutoringRankedByLastGaokao(students) {
  for (const no of TUTORING_NOS) {
    const list = students.filter((s) => s.classNo === no);
    assert.equal(list.length, REPEAT_CLASS_SIZE, `${no}班应有 70 人`);
    assert.ok(list.every((s) => s.repeat && s.tier === "fuzhuo"));
    const ordered = list.slice().sort((a, b) => a.seq - b.seq);
    assert.deepEqual(ordered.map((s) => s.seq), Array.from({ length: list.length }, (_, i) => i + 1));
    assert.ok(ordered.every((s) => s.lastGaokao && Number.isFinite(s.lastGaokao.total)));
    for (let i = 1; i < ordered.length; i++) {
      const prev = ordered[i - 1].lastGaokao.total;
      const cur = ordered[i].lastGaokao.total;
      assert.ok(prev >= cur, `${no}班座号应随上次高考总分从高到低，${ordered[i - 1].seq}号 ${prev} < ${i + 1}号 ${cur}`);
    }
  }
}

function assertInsertsBehindRegulars(students) {
  assert.equal(students.filter((s) => s.repeat && s.classNo === 1).length, 0, "1 班不做插班");
  for (const no of INSERT_REPEAT_CLASS_NOS) {
    const regulars = students.filter((s) => s.classNo === no && !s.repeat);
    const inserts = students.filter((s) => s.classNo === no && s.repeat);
    const seqs = regulars.map((s) => s.seq).sort((a, b) => a - b);
    if (regulars.length) {
      assert.deepEqual(seqs, Array.from({ length: regulars.length }, (_, i) => i + 1));
    }
    const insSeq = inserts.map((s) => s.seq).sort((a, b) => a - b);
    assert.deepEqual(insSeq, inserts.map((_, i) => regulars.length + i + 1), `${no}班插班座号应接在应届后面`);
    for (const s of inserts) {
      assert.equal(s.insertedRepeat, true);
      assert.equal(s.originClassNo, no);
      assert.ok(s.lastGaokao && s.lastGaokao.total < s.lastGaokao.firstLine, `${s.id} 插班生上次高考应未达省控一本`);
      if (no === 0) assert.equal(s.tier, "yunxiu_exp");
      else assert.equal(s.tier, "yunxiu_key");
    }
  }
}

test("高一高二不生成补习班，高三补习班为文科31–36、理科37–42，每班70人且按上次高考总分排座", () => {
  const g1 = generateCohort(2017, 7, { withRepeat: false });
  assert.equal(g1.students.filter((s) => s.repeat).length, 0);
  assert.ok(g1.students.every((s) => s.classNo <= 30));

  const g2 = generateCohort(2016, 7, { alreadySplit: true, withRepeat: false });
  assert.equal(g2.students.filter((s) => s.repeat).length, 0);
  assert.ok(g2.students.every((s) => s.classNo <= 30));

  const g3 = generateCohort(2015, 7, { alreadySplit: true, withRepeat: true });
  const tutoring = g3.students.filter((s) => s.repeat && s.classNo >= 31);
  const inserts = g3.students.filter((s) => s.repeat && s.classNo < 31);
  assert.equal(tutoring.length, 840);
  assert.equal(tutoringOf(g3.students, "wen").length, 420);
  assert.equal(tutoringOf(g3.students, "li").length, 420);
  assert.ok(inserts.length >= 1, "开局应有少量 0/翠微插班");
  assert.ok(inserts.every((s) => INSERT_REPEAT_CLASS_NOS.includes(s.classNo) && s.track === "li"));
  assertTutoringRankedByLastGaokao(g3.students);
  assertInsertsBehindRegulars(g3.students);
  assert.deepEqual(REPEAT_WEN_NOS, [31, 32, 33, 34, 35, 36]);
  assert.deepEqual(REPEAT_LI_NOS, [37, 38, 39, 40, 41, 42]);
  const repeatClasses = g3.classes.filter((c) => c.repeat);
  assert.equal(repeatClasses.length, 12);
  assert.ok(repeatClasses.every((c) => String(c.name).includes("补习") && String(c.short).includes("补习")));
  assert.ok(repeatClasses.every((c) => !String(c.name).includes("复卓") && !String(c.short).includes("复卓")));
  assert.ok(g3.classes.filter((c) => INSERT_REPEAT_CLASS_NOS.includes(c.no)).every((c) => !c.repeat));
});

test("第一次分班后应届理科 19 班共 1276 人，16 班 74 人，班额与目标表一致", () => {
  const { c } = placed(7);
  const li = regularLi(c.students);
  assert.equal(li.length, 1276);
  const by = {};
  for (const s of li) by[s.classNo] = (by[s.classNo] || 0) + 1;
  assert.equal(Object.keys(by).length, 19);
  assert.equal(by[16], 74);
  for (const [no, size] of Object.entries(LI_SIZES)) {
    const n = Number(no);
    if (n >= 2 && n <= 4) {
      assert.ok(by[n] <= size && by[n] >= size - 6, `重点${n}班 ${by[n]} 应接近 ${size}`);
    } else {
      assert.equal(by[n], size, `${n}班应为 ${size}，实际 ${by[n]}`);
    }
  }
  const exam2 = runExam(c, { id: "f2", name: "下期末", examKind: "final", difficulty: 1, dispersion: 1, date: "2018-06-25" }, { grade: 1, split: true });
  const sec = secondPlacement(c.students, exam2.scoreMap, { seed: 14 });
  assert.equal(sec.students.filter((s) => s.classNo === 16).length, 74);
  assert.equal(regularLi(sec.students).length, 1276);
});

test("高三/高考校内二本池含补习班，应届省控统计不含；高一高二不把补习班划进本年级", () => {
  const { c, pre } = placed(7, { entryYear: 2015, withRepeat: true });
  assert.equal(pre.cutoffs.includeRepeat, false);
  assert.ok(!(pre.cutoffs.ranked.mixed || []).some((r) => r.repeat));

  const liN = regularLi(c.students).length;
  const tutoringLi = tutoringOf(c.students, "li").length;
  const tutoringWen = tutoringOf(c.students, "wen").length;
  const insertLi = c.students.filter((s) => s.repeat && s.track === "li" && s.classNo < 31).length;
  const insertWen = c.students.filter((s) => s.repeat && s.track === "wen" && s.classNo < 31).length;
  assert.equal(liN, 1276);
  assert.equal(tutoringLi, 420);
  assert.equal(tutoringWen, 420);
  assert.equal(insertWen, 0);
  assert.ok(insertLi >= 1);

  const g2 = runExam(c, { id: "g2", name: "高二期末", examKind: "final", difficulty: 1, dispersion: 1, date: "2017-06-25" }, { grade: 2, split: true });
  assert.equal(g2.cutoffs.includeRepeat, false);
  assert.equal((g2.cutoffs.ranked.li || []).filter((r) => r.repeat).length, 0);
  assert.equal((g2.cutoffs.ranked.wen || []).filter((r) => r.repeat).length, 0);
  assert.ok(g2.cutoffs.li.count >= 1276 && g2.cutoffs.li.count <= 1330, `理科高二应届池应约 1276 人，实际 ${g2.cutoffs.li.count}`);
  const g2First = Math.round(g2.cutoffs.li.count * 520 / 1696);
  const g2Second = Math.round(g2.cutoffs.li.count * 1100 / 1696);
  assert.ok(Math.abs(g2.cutoffs.li.firstN - g2First) <= 20, `理科高二不得硬套 520，应约 ${g2First}，实际 ${g2.cutoffs.li.firstN}`);
  assert.ok(Math.abs(g2.cutoffs.li.secondN - g2Second) <= 40, `理科高二不得硬套 1100，应约 ${g2Second}，实际 ${g2.cutoffs.li.secondN}`);
  assert.notEqual(g2.cutoffs.li.firstN, 520);
  assert.notEqual(g2.cutoffs.li.secondN, 1100);
  assert.ok(g2.cutoffs.wen.secondN <= g2.cutoffs.wen.count, "高二文科二本不超过池规模");

  const gk = runExam(c, { id: "gk", name: "高考", examKind: "gaokao", difficulty: 1.003, dispersion: 1, date: "2018-06-07" }, { grade: 3, split: true });
  assert.equal(gk.cutoffs.includeRepeat, true);
  assert.equal((gk.cutoffs.ranked.li || []).filter((r) => r.repeat).length, 420 + insertLi);
  assert.equal((gk.cutoffs.ranked.wen || []).filter((r) => r.repeat).length, 420);
  assert.equal(gk.cutoffs.li.count, g2.cutoffs.li.count + 420 + insertLi);
  assert.equal(gk.cutoffs.wen.count, g2.cutoffs.wen.count + 420);
  assert.ok(gk.cutoffs.li.firstN >= 500 && gk.cutoffs.li.firstN <= 540, `高三理科一本约第 520 名，实际 ${gk.cutoffs.li.firstN}`);
  assert.ok(gk.cutoffs.li.secondN >= 1060 && gk.cutoffs.li.secondN <= 1140, `高三理科二本约第 1100 名，实际 ${gk.cutoffs.li.secondN}`);
  assert.ok(gk.cutoffs.wen.secondN <= gk.cutoffs.wen.count, "高三文科池不足时二本不超出池规模");
  const pack = provincialPassCounts(c.students, gk.scoreMap, 2018);
  const regular = c.students.filter((s) => !s.repeat);
  assert.equal(pack.li.n + pack.wen.n, regular.length);
  assert.equal(pack.li.n, regular.filter((s) => s.track !== "wen").length);

  const opening = generateOpeningSchool(20170901, 2017);
  assert.equal(opening.cohorts[2017].students.filter((s) => s.repeat).length, 0);
  assert.equal(opening.cohorts[2016].students.filter((s) => s.repeat).length, 0);
  assert.equal(opening.cohorts[2015].students.filter((s) => s.repeat && s.classNo >= 31).length, 840);
  assert.ok(opening.cohorts[2015].students.some((s) => s.repeat && INSERT_REPEAT_CLASS_NOS.includes(s.classNo)));
});

test("已达一本仍复读的原0/翠微进补习班，未达一本的插回原班且座号接应届", () => {
  assert.equal(missedProvincialFirst({ total: 534, firstLine: 535 }), true);
  assert.equal(missedProvincialFirst({ total: 535, firstLine: 535 }), false);
  assert.equal(canInsertRepeat({ classNo: 0 }, { repeatIntent: true, total: 500, firstLine: 535 }), true);
  assert.equal(canInsertRepeat({ classNo: 2 }, { repeatIntent: true, total: 560, firstLine: 535 }), false);
  assert.equal(canInsertRepeat({ classNo: 1 }, { repeatIntent: true, total: 500, firstLine: 518 }), false);
  assert.equal(canInsertRepeat({ classNo: 16 }, { repeatIntent: true, total: 500, firstLine: 535 }), false);
  assert.equal(canInsertRepeat({ classNo: 0 }, { repeatIntent: false, total: 500, firstLine: 535 }), false);

  const mk = (id, classNo, total, firstLine, track = "li") => ({
    id, classNo, originClassNo: classNo, track, repeat: true, name: id, ability: {},
    lastGaokao: { total, year: 2018, track, math: 80, chinese: 80, firstLine },
  });
  const staying = [
    mk("miss0", 0, 500, 535),
    mk("hit0", 0, 560, 535),
    mk("miss2", 2, 520, 535),
    mk("lingxiao", 5, 500, 535),
    mk("wen1", 1, 480, 518, "wen"),
  ];
  const ads = Object.fromEntries(staying.map((s) => [s.id, {
    studentId: s.id, total: s.lastGaokao.total, firstLine: s.lastGaokao.firstLine,
    repeatIntent: true, track: s.track, year: 2018,
  }]));
  const placedRep = placeGraduatingRepeaters(staying, ads);
  const byId = Object.fromEntries(placedRep.map((s) => [s.id, s]));
  assert.equal(byId.miss0.classNo, 0);
  assert.equal(byId.miss0.insertedRepeat, true);
  assert.equal(byId.miss0.tier, "yunxiu_exp");
  assert.ok(byId.hit0.classNo >= 31);
  assert.equal(byId.hit0.tier, "fuzhuo");
  assert.equal(byId.miss2.classNo, 2);
  assert.equal(byId.miss2.tier, "yunxiu_key");
  assert.ok(byId.lingxiao.classNo >= 31);
  assert.ok(byId.wen1.classNo >= 31 && REPEAT_WEN_NOS.includes(byId.wen1.classNo));

  const regulars = Array.from({ length: 36 }, (_, i) => ({
    id: `r${i + 1}`, classNo: 0, seq: i + 1, repeat: false, seat: { row: 1, col: 1 },
  }));
  const merged = applyRepeaterSeating([...regulars, byId.miss0]);
  assert.equal(merged.find((s) => s.id === "miss0").seq, 37);
});

test("新开档高三补习班按上次高考总分排座，插班规则在分班后仍成立", () => {
  const g = createGame(20170901);
  const sen = g.cohorts[2015];
  assertTutoringRankedByLastGaokao(sen.students);
  assertInsertsBehindRegulars(sen.students);
  assert.ok(sen.classes.filter((c) => c.repeat).every((c) => String(c.name).includes("补习") && !String(c.name).includes("复卓")));
});

test("晋升后新一届高三同样按上次高考总分排座，失常的原0/翠微插班", () => {
  const g = createGame(20170901);
  skipToGaokaoOf(g, 2015);
  skipToNextCohort(g);
  const sen = g.cohorts[2016];
  assert.ok(sen, "2016 级应成为新高三");
  const tutoring = sen.students.filter((s) => s.repeat && s.classNo >= 31);
  assert.ok(tutoring.length > 0, "晋升后应有补习班");
  for (const no of new Set(tutoring.map((s) => s.classNo))) {
    const ordered = tutoring.filter((s) => s.classNo === no).slice().sort((a, b) => a.seq - b.seq);
    assert.deepEqual(ordered.map((s) => s.seq), Array.from({ length: ordered.length }, (_, i) => i + 1));
    for (let i = 1; i < ordered.length; i++) {
      assert.ok((ordered[i - 1].lastGaokao?.total ?? -Infinity) >= (ordered[i].lastGaokao?.total ?? -Infinity));
    }
  }
  assert.equal(sen.students.filter((s) => s.repeat && s.classNo === 1).length, 0);
  const adm = g.admissions["2015|2018"];
  assert.ok(adm, "应有 2015 级录取");
  const byAdm = Object.fromEntries(adm.results.map((r) => [r.studentId, r]));
  for (const no of INSERT_REPEAT_CLASS_NOS) {
    const regulars = sen.students.filter((s) => s.classNo === no && !s.repeat);
    const inserts = sen.students.filter((s) => s.classNo === no && s.repeat);
    const insSeq = inserts.map((s) => s.seq).sort((a, b) => a - b);
    assert.deepEqual(insSeq, inserts.map((_, i) => regulars.length + i + 1));
    for (const s of inserts) {
      const a = byAdm[s.id];
      assert.ok(a && a.repeatIntent && a.total < a.firstLine, `${s.id} 插班须是未达一本且选择复读`);
      assert.equal(s.originClassNo, no);
    }
  }
  const reachedButRepeat = adm.results.filter((r) => r.repeatIntent && r.total >= r.firstLine);
  for (const r of reachedButRepeat) {
    const st = sen.students.find((s) => s.id === r.studentId);
    if (!st) continue;
    assert.ok(st.classNo >= 31, `已达一本仍复读的 ${r.studentId} 应进补习班，实际在 ${st.classNo} 班`);
  }
});

const PROFILE_SEEDS = [20170901, 7, 99, 2020, 42, 11];

function pctile(arr, p) {
  if (!arr.length) return null;
  const a = arr.slice().sort((x, y) => x - y);
  const i = (a.length - 1) * p;
  const lo = Math.floor(i), hi = Math.ceil(i);
  if (lo === hi) return a[lo];
  return a[lo] + (a[hi] - a[lo]) * (i - lo);
}

function meanOf(arr) {
  return arr.reduce((s, x) => s + x, 0) / arr.length;
}

function tutoringGaokao(entryYear, seed) {
  const c = generateCohort(entryYear, seed, {
    alreadySplit: true, withRepeat: true, quality: eraQuality(entryYear),
  });
  const year = entryYear + 3;
  const ev = { id: `gaokao-${year}`, name: `${year}年普通高考`, examKind: "gaokao", date: `${year}-06-07`, year };
  const params = examParams(ev);
  const gk = runExam(c, { ...ev, difficulty: params.difficulty, dispersion: params.dispersion }, { grade: 3, split: true });
  const ads = admitCohort(c.students, gk.scoreMap, year);
  const byId = Object.fromEntries(c.students.map((s) => [s.id, s]));
  const pack = (nos, track) => {
    const rows = nos.map((no) => {
      const list = ads.filter((a) => byId[a.studentId]?.repeat && byId[a.studentId]?.classNo === no);
      const totals = list.map((a) => a.total);
      const lasts = list.map((a) => Number(byId[a.studentId]?.lastGaokao?.total)).filter(Number.isFinite);
      return {
        no,
        n: list.length,
        first: list.filter((a) => isProvincialFirst(a)).length,
        second: list.filter((a) => isProvincialSecond(a)).length,
        avg: meanOf(totals),
        med: pctile(totals, 0.5),
        p10: pctile(totals, 0.1),
        min: Math.min(...totals),
        max: Math.max(...totals),
        lastAvg: lasts.length ? meanOf(lasts) : null,
        lastMed: lasts.length ? pctile(lasts, 0.5) : null,
        lastP10: lasts.length ? pctile(lasts, 0.1) : null,
        lastMin: lasts.length ? Math.min(...lasts) : null,
      };
    });
    const tops = ads.filter((a) => {
      const s = byId[a.studentId];
      return s?.repeat && s.classNo >= 31 && (track === "wen" ? s.track === "wen" : s.track === "li");
    }).sort((a, b) => b.total - a.total);
    const best = rows.slice().sort((a, b) => b.first - a.first || b.second - a.second || a.no - b.no)[0];
    return { rows, tops, best, firstSum: rows.reduce((s, r) => s + r.first, 0) };
  };
  return { year, li: pack(REPEAT_LI_NOS, "li"), wen: pack(REPEAT_WEN_NOS, "wen") };
}

test("补习班层次用于生成能力，主体略强于普通卓行、远低于凌霄，分布须够宽以留下低分尾巴", () => {
  assert.equal(TIER.fuzhuo.name, "补习班");
  assert.ok(TIER.fuzhuo.abilityMean > TIER.zhuoxing.abilityMean);
  assert.ok(TIER.fuzhuo.abilityMean < TIER.lingxiao.abilityMean - 8);
  // 旧断言要求补习班 abilitySd 小于卓行（当时只有 4.8），会把最低分抬到 390–410、平均抬到 480 附近。
  // 按 2020 最好理科复读班量级，平均在二本线附近但有很长低分尾巴，标准差必须加宽；一本高尾仍单独点出。
  assert.ok(TIER.fuzhuo.abilitySd >= 8, `补习班能力分布要够宽才能出现长低分尾巴，实际 ${TIER.fuzhuo.abilitySd}`);
  assert.ok(TIER.fuzhuo.abilitySd <= 13, `补习班也不应宽到凌霄/重点上沿，实际 ${TIER.fuzhuo.abilitySd}`);
});

test("补习班分班不把尖子全部塞进37班，第一进最好的班，第二第三进其他班", () => {
  const mk = (id, track, total, firstLine) => ({
    id, classNo: 16, track, repeat: true, name: id, ability: {},
    lastGaokao: { total, year: 2020, track, math: 80, chinese: 80, firstLine },
  });
  const staying = [];
  for (let i = 0; i < 33; i++) staying.push(mk(`f${i}`, "li", 600 - i, 535));
  for (let i = 0; i < 50; i++) staying.push(mk(`s${i}`, "li", 530 - i, 535));
  for (let i = 0; i < 37; i++) staying.push(mk(`r${i}`, "li", 450 - i, 535));
  for (let i = 0; i < 20; i++) staying.push(mk(`w${i}`, "wen", 580 - i, 547));
  const ads = Object.fromEntries(staying.map((s) => [s.id, {
    studentId: s.id, total: s.lastGaokao.total, firstLine: s.lastGaokao.firstLine,
    repeatIntent: true, track: s.track, year: 2020,
  }]));
  const bestNos = new Set();
  for (const key of ["assign-a", "assign-b", "assign-c", "assign-d", "assign-e", "assign-f"]) {
    const placed = placeGraduatingRepeaters(staying, ads, key);
    const li = placed.filter((s) => s.track === "li" && s.classNo >= 31);
    assert.equal(li.length, 120);
    const ordered = li.slice().sort((a, b) => b.lastGaokao.total - a.lastGaokao.total);
    const byClass = {};
    for (const s of li) {
      byClass[s.classNo] ??= { first: 0, second: 0 };
      if (s.lastGaokao.total >= 535) byClass[s.classNo].first += 1;
      if (s.lastGaokao.total >= 463) byClass[s.classNo].second += 1;
    }
    const bestNo = Number(Object.entries(byClass).sort((a, b) => b[1].first - a[1].first || b[1].second - a[1].second || Number(a[0]) - Number(b[0]))[0][0]);
    bestNos.add(bestNo);
    assert.equal(ordered[0].classNo, bestNo, "上次高考第一应在最好的补习班");
    assert.notEqual(ordered[1].classNo, bestNo, "第二不应与第一同班");
    assert.notEqual(ordered[2].classNo, bestNo, "第三不应与第一同班");
    assert.notEqual(ordered[1].classNo, ordered[2].classNo, "第二、第三尽量分在不同班");
    assert.ok(byClass[bestNo].first >= 6 && byClass[bestNo].first <= 10, `最好的班一本 ${byClass[bestNo].first}`);
    for (const [no, row] of Object.entries(byClass)) {
      if (Number(no) === bestNo) continue;
      assert.ok(row.first < byClass[bestNo].first, `${no}班一本 ${row.first} 应少于最好的 ${bestNo} 班 ${byClass[bestNo].first}`);
      assert.ok(row.first <= 7, `其余班一本不应到十几二十，${no}班 ${row.first}`);
    }
  }
  assert.ok(bestNos.size >= 2, `最好的班号应随种子变化，实际 ${[...bestNos].join(",")}`);
  assert.ok(!(bestNos.size === 1 && bestNos.has(37)), "37 班不应永远断层第一");
});

test("开局理科补习班一本/二本与高尾按 2020 年量级，文科顶端可强、其余一般，多种子抽查", () => {
  const bestNos = [];
  const gaps = [];
  const liFirsts = [];
  const top1Scores = [];
  let sawXiamenBand = false;
  let sawWenTop = false;
  let sawWenOrdinary = false;
  const lines = [];
  const checkYear = (entryYear, label) => {
    for (const seed of PROFILE_SEEDS) {
      const { year, li, wen } = tutoringGaokao(entryYear, seed);
      const firsts = li.rows.map((r) => r.first);
      const maxF = Math.max(...firsts);
      const minF = Math.min(...firsts);
      assert.ok(li.rows.every((r) => r.n === REPEAT_CLASS_SIZE));
      assert.ok(maxF >= 6 && maxF <= 12, `${label} 种子${seed} 最好的理科补习班一本应约 8 个，实际 ${maxF}（${firsts.join(",")}）`);
      assert.ok(minF >= 1 && minF <= 7, `${label} 种子${seed} 其余理科补习班应有少数一本，实际最少 ${minF}`);
      gaps.push(maxF - minF);
      for (const r of li.rows) {
        if (r.no !== li.best.no) {
          assert.ok(r.first <= 8, `${label} 种子${seed} ${r.no}班一本 ${r.first} 不应到十几二十`);
          assert.ok(r.first <= maxF, `${label} 种子${seed} ${r.no}班一本不应超过最好的班`);
        }
      }
      assert.ok(li.best.second >= 32 && li.best.second <= 47, `${label} 种子${seed} 最好的班二本以上应约 38–47（70 人编制不按 47/78 去死守；物化生改各 100 后允许略低），实际 ${li.best.no}班 ${li.best.second}`);
      const below = li.best.n - li.best.second;
      assert.ok(below >= 23 && below <= 40, `${label} 种子${seed} 最好的班约四成在二本以下，实际未上本科 ${below}`);
      assert.ok(li.best.avg >= 445 && li.best.avg <= 475, `${label} 种子${seed} 最好的理科补习班平均应约 460（二本线附近），实际 ${li.best.no}班 ${li.best.avg.toFixed(1)}`);
      if (year === 2020) {
        assert.ok(li.best.med >= 455 && li.best.med <= 485, `${label} 种子${seed} 最好的班中位数应约 470 多分（二本线附近），实际 ${li.best.med.toFixed(1)}`);
      } else {
        // 2018 等年份试卷年因子略低，中位数可低于 2020 的 470 多分，但仍应落在二本线附近以上。
        assert.ok(li.best.med >= 440 && li.best.med <= 485, `${label} 种子${seed} 最好的班中位数过低或过高，实际 ${li.best.med.toFixed(1)}`);
      }
      assert.ok(li.best.p10 >= 360 && li.best.p10 <= 400, `${label} 种子${seed} 最好的班 p10 应约 360–400，实际 ${li.best.p10.toFixed(1)}`);
      assert.ok(li.best.min < 360, `${label} 种子${seed} 最好的班最低分应明显低于 360，以保留长低分尾巴，实际 ${li.best.min}`);
      const otherAvgs = li.rows.filter((r) => r.no !== li.best.no).map((r) => r.avg);
      assert.ok(li.best.avg > meanOf(otherAvgs), `${label} 种子${seed} 其余理科补习班平均应低于最好班 ${li.best.avg.toFixed(1)}，实际 ${otherAvgs.map((v) => v.toFixed(1)).join(",")}`);
      const avgSpread = Math.max(...li.rows.map((r) => r.avg)) - Math.min(...li.rows.map((r) => r.avg));
      assert.ok(avgSpread >= 6.5, `${label} 种子${seed} 六个理科补习班平均不应挤在一起，分差 ${avgSpread.toFixed(1)}`);
      // 开局「上次高考」也要有低分尾巴，不能只压本届、上次平均仍虚高。
      assert.ok(li.best.lastAvg != null && li.best.lastAvg <= 470, `${label} 种子${seed} 最好班上次高考平均不应仍虚高到 480 附近，实际 ${li.best.lastAvg.toFixed(1)}`);
      assert.ok(li.best.lastMin < 360 || li.best.lastP10 <= 410, `${label} 种子${seed} 上次高考也应有低分尾巴，最低 ${li.best.lastMin} p10 ${li.best.lastP10?.toFixed(1)}`);
      assert.ok(li.firstSum >= 22 && li.firstSum <= 45, `${label} 种子${seed} 理科补习班合计一本应约 33，实际 ${li.firstSum}`);
      const t1 = li.tops[0], t2 = li.tops[1], t3 = li.tops[2];
      assert.ok(t1 && t2 && t3);
      assert.ok(t1.total >= 610 && t1.total < 655, `${label} 种子${seed} 理科第一应在 630–640 量级且不到 660，实际 ${t1.total} ${t1.university}`);
      assert.ok(t1.total < 660, `${label} 种子${seed} 理科补习班第一不应常到 660+，实际 ${t1.total}`);
      assert.ok(t2.total >= 575 && t2.total <= 615, `${label} 种子${seed} 理科第二应在 590–610 上下，实际 ${t2.total} ${t2.university}`);
      assert.ok(t3.total >= 555 && t3.total <= 605, `${label} 种子${seed} 理科第三应在 555–590 上下，实际 ${t3.total} ${t3.university}`);
      if (t1.total >= 625 && t1.total <= 645) sawXiamenBand = true;
      bestNos.push(li.best.no);
      liFirsts.push(maxF);
      top1Scores.push(t1.total);
      assert.ok(wen.firstSum <= 20, `${label} 种子${seed} 文科补习班一本不应膨胀，实际 ${wen.firstSum}`);
      assert.ok(wen.rows.every((r) => r.first <= 8), `${label} 种子${seed} 文科单班一本 ${wen.rows.map((r) => r.first).join(",")}`);
      const w1 = wen.tops[0], w3 = wen.tops[2];
      assert.ok(w1.total >= 600, `${label} 种子${seed} 文科第一应能到较强顶端，实际 ${w1.total} ${w1.university}`);
      if (w1.total >= 620) sawWenTop = true;
      if (w3 && w3.total <= w1.total - 20) sawWenOrdinary = true;
      lines.push(`${label}s${seed}@${year} 理${li.rows.map((r) => `${r.no}:${r.first}/${r.second}`).join(",")} 合计${li.firstSum} 前三 ${t1.total}/${t2.total}/${t3.total} 文一本${wen.firstSum} 文前 ${w1.total}`);
    }
  };
  checkYear(2015, "开局2018");
  checkYear(2017, "2020附近");
  assert.ok(new Set(bestNos).size >= 3, `最好的理科补习班不应年年都是 37，实际 ${bestNos.join(",")}。${lines.join("；")}`);
  assert.ok(gaps.filter((g) => g >= 2).length >= Math.ceil(gaps.length / 2), `多数抽查应有一班明显更强，分差 ${gaps.join(",")}。${lines.join("；")}`);
  assert.ok(sawXiamenBand, `应见到理科第一落在 630–640 量级。${lines.join("；")}`);
  assert.ok(sawWenTop, `文科顶端有的年份应到人大/厦大量级。${lines.join("；")}`);
  assert.ok(sawWenOrdinary, `多数年份文科第三应明显低于顶端（其余一般般）。${lines.join("；")}`);
  assert.ok(Math.max(...top1Scores) < 660, `理科补习班第一不应冲到 660+，最高 ${Math.max(...top1Scores)}`);
});

test("开局补习班档案有上次高考各科与录取结果，放弃或未考上显示无；应届生没有空的上次高考", () => {
  const c = generateCohort(2015, 20170901, { alreadySplit: true, withRepeat: true });
  const repeats = c.students.filter((s) => s.repeat);
  const regulars = c.students.filter((s) => !s.repeat);
  assert.ok(repeats.length >= 800);
  for (const s of repeats) {
    assert.ok(s.lastGaokao && Number.isFinite(s.lastGaokao.total), `${s.id} 应有上次高考总分`);
    const text = formatLastGaokaoText(s.lastGaokao);
    assert.match(text, /总分/);
    if (s.track === "li") {
      assert.ok(s.lastGaokao.physics != null && s.lastGaokao.chemistry != null && s.lastGaokao.biology != null);
      assert.match(text, /理综/);
    } else {
      assert.ok(s.lastGaokao.politics != null && s.lastGaokao.history != null && s.lastGaokao.geography != null);
      assert.match(text, /文综/);
    }
    assert.ok(s.lastAdmission, `${s.id} 应有上次录取结果`);
    const dest = formatLastAdmissionLabel(s.lastAdmission);
    assert.ok(dest === "无" || dest === "暂缺" || (dest && dest !== "无"), `录取展示应为院校或无，实际 ${dest}`);
    if (s.lastAdmission.abandoned || s.lastAdmission.noOffer) assert.equal(dest, "无");
  }
  assert.ok(regulars.every((s) => !s.lastGaokao && !s.lastAdmission), "正常应届生不应带上次高考或录取字段");
  assert.equal(formatLastAdmissionLabel(null), "暂缺");
});
