import test from "node:test";
import assert from "node:assert/strict";
import { generateCohort, generateOpeningSchool } from "../js/domain/school.js";
import { firstPlacement, secondPlacement, rebuildClasses } from "../js/domain/placement.js";
import { runExam } from "../js/domain/examService.js";
import { provincialPassCounts } from "../js/domain/schoolLines.js";
import {
  FIRST_PLACEMENT_TARGETS, REPEAT_WEN_NOS, REPEAT_LI_NOS, REPEAT_CLASS_SIZE,
} from "../js/domain/config.js";

const LI_SIZES = Object.fromEntries(FIRST_PLACEMENT_TARGETS.li.map((t) => [t.no, t.size]));

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

test("高一高二不生成补习班，高三补习班为文科31–36、理科37–42，每班70人且序号按班从1计", () => {
  const g1 = generateCohort(2017, 7, { withRepeat: false });
  assert.equal(g1.students.filter((s) => s.repeat).length, 0);
  assert.ok(g1.students.every((s) => s.classNo <= 30));

  const g2 = generateCohort(2016, 7, { alreadySplit: true, withRepeat: false });
  assert.equal(g2.students.filter((s) => s.repeat).length, 0);
  assert.ok(g2.students.every((s) => s.classNo <= 30));

  const g3 = generateCohort(2015, 7, { alreadySplit: true, withRepeat: true });
  const rep = g3.students.filter((s) => s.repeat);
  assert.equal(rep.length, 840);
  assert.equal(rep.filter((s) => s.track === "wen").length, 420);
  assert.equal(rep.filter((s) => s.track === "li").length, 420);
  for (const no of REPEAT_WEN_NOS) {
    const list = rep.filter((s) => s.classNo === no);
    assert.equal(list.length, REPEAT_CLASS_SIZE, `${no}班应有 70 人`);
    assert.ok(list.every((s) => s.track === "wen" && s.tier === "fuzhuo"));
    assert.deepEqual(list.map((s) => s.seq).sort((a, b) => a - b), Array.from({ length: 70 }, (_, i) => i + 1));
  }
  for (const no of REPEAT_LI_NOS) {
    const list = rep.filter((s) => s.classNo === no);
    assert.equal(list.length, REPEAT_CLASS_SIZE, `${no}班应有 70 人`);
    assert.ok(list.every((s) => s.track === "li" && s.tier === "fuzhuo"));
    assert.deepEqual(list.map((s) => s.seq).sort((a, b) => a - b), Array.from({ length: 70 }, (_, i) => i + 1));
  }
  assert.deepEqual(REPEAT_WEN_NOS, [31, 32, 33, 34, 35, 36]);
  assert.deepEqual(REPEAT_LI_NOS, [37, 38, 39, 40, 41, 42]);
  const repeatClasses = g3.classes.filter((c) => c.repeat);
  assert.equal(repeatClasses.length, 12);
  assert.ok(repeatClasses.every((c) => String(c.name).includes("补习") && String(c.short).includes("补习")));
  assert.ok(repeatClasses.every((c) => !String(c.name).includes("复卓") && !String(c.short).includes("复卓")));
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
  const repLi = c.students.filter((s) => s.repeat && s.track === "li").length;
  const repWen = c.students.filter((s) => s.repeat && s.track === "wen").length;
  assert.equal(liN, 1276);
  assert.equal(repLi, 420);
  assert.equal(repWen, 420);

  const g2 = runExam(c, { id: "g2", name: "高二期末", examKind: "final", difficulty: 1, dispersion: 1, date: "2017-06-25" }, { grade: 2, split: true });
  assert.equal(g2.cutoffs.includeRepeat, false);
  assert.equal((g2.cutoffs.ranked.li || []).filter((r) => r.repeat).length, 0);
  assert.equal((g2.cutoffs.ranked.wen || []).filter((r) => r.repeat).length, 0);

  const gk = runExam(c, { id: "gk", name: "高考", examKind: "gaokao", difficulty: 1.003, dispersion: 1, date: "2018-06-07" }, { grade: 3, split: true });
  assert.equal(gk.cutoffs.includeRepeat, true);
  assert.equal((gk.cutoffs.ranked.li || []).filter((r) => r.repeat).length, 420);
  assert.equal((gk.cutoffs.ranked.wen || []).filter((r) => r.repeat).length, 420);
  assert.equal(gk.cutoffs.li.count, g2.cutoffs.li.count + 420);
  assert.equal(gk.cutoffs.wen.count, g2.cutoffs.wen.count + 420);
  assert.equal(gk.cutoffs.li.secondN, 1000);
  const pack = provincialPassCounts(c.students, gk.scoreMap, 2018);
  const regular = c.students.filter((s) => !s.repeat);
  assert.equal(pack.li.n + pack.wen.n, regular.length);
  assert.equal(pack.li.n, regular.filter((s) => s.track !== "wen").length);

  const opening = generateOpeningSchool(20170901, 2017);
  assert.equal(opening.cohorts[2017].students.filter((s) => s.repeat).length, 0);
  assert.equal(opening.cohorts[2016].students.filter((s) => s.repeat).length, 0);
  assert.equal(opening.cohorts[2015].students.filter((s) => s.repeat).length, 840);
});
