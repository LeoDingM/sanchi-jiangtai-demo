import test from "node:test";
import assert from "node:assert/strict";
import {
  generateCohort, generateOpeningSchool, applyRepeaterSeating, placeGraduatingRepeaters,
} from "../js/domain/school.js";
import { firstPlacement, secondPlacement, rebuildClasses } from "../js/domain/placement.js";
import { runExam } from "../js/domain/examService.js";
import { provincialPassCounts } from "../js/domain/schoolLines.js";
import { canInsertRepeat, missedProvincialFirst } from "../js/domain/admission.js";
import { createGame, skipToGaokaoOf, skipToNextCohort } from "../js/domain/simulation.js";
import {
  FIRST_PLACEMENT_TARGETS, REPEAT_WEN_NOS, REPEAT_LI_NOS, REPEAT_CLASS_SIZE,
  INSERT_REPEAT_CLASS_NOS,
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

  const gk = runExam(c, { id: "gk", name: "高考", examKind: "gaokao", difficulty: 1.003, dispersion: 1, date: "2018-06-07" }, { grade: 3, split: true });
  assert.equal(gk.cutoffs.includeRepeat, true);
  assert.equal((gk.cutoffs.ranked.li || []).filter((r) => r.repeat).length, 420 + insertLi);
  assert.equal((gk.cutoffs.ranked.wen || []).filter((r) => r.repeat).length, 420);
  assert.equal(gk.cutoffs.li.count, g2.cutoffs.li.count + 420 + insertLi);
  assert.equal(gk.cutoffs.wen.count, g2.cutoffs.wen.count + 420);
  assert.equal(gk.cutoffs.li.secondN, 1000);
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
