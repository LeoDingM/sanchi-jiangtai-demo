import test from "node:test";
import assert from "node:assert/strict";
import { buildCalendar } from "../js/domain/calendar.js";
import { generateCohort } from "../js/domain/school.js";
import { firstPlacement, rebuildClasses } from "../js/domain/placement.js";
import { runExam } from "../js/domain/examService.js";
import { provincialLines, gapOfficial } from "../js/domain/jiangxi.js";

test("校历从 2017 年 9 月起，含月考/期中/期末/联考/模拟/高考与两次分班、升学", () => {
  const ev = buildCalendar(2017, 2021);
  assert.ok(ev[0].date >= "2017-09-01");
  const kinds = new Set(ev.map((e) => e.kind + ":" + (e.examKind || "")));
  for (const k of ["exam:monthly", "exam:midterm", "exam:final", "exam:city", "exam:province", "exam:mock1", "exam:gaokao", "placement1:", "placement2:", "admission:", "promote:"]) {
    assert.ok([...ev.map((e) => e.kind + ":" + (e.examKind || ""))].some((x) => x.startsWith(k.replace(/:$/, "")) || x === k || x.startsWith(k.slice(0, -1))), k);
  }
  assert.ok(ev.some((e) => e.kind === "placement1"));
  assert.ok(ev.some((e) => e.kind === "placement2"));
  assert.ok(ev.some((e) => e.examKind === "gaokao" && e.date.startsWith("2020-06")));
  const hk = ev.find((e) => e.examKind === "huikao" && e.date.startsWith("2018-06"));
  assert.ok(hk, "高二应有学业水平考试（会考）薄层");
  assert.deepEqual(hk.grades, [2]);
  assert.ok(hk.sourceNote && hk.sourceNote.includes("校内"));
});

test("不同场次难度不同，一本/二本线随难度明显波动，分差为数十分而非几分", () => {
  let c = generateCohort(2017, 3);
  const pre = runExam(c, { id: "pre", name: "预", examKind: "final", difficulty: 1, dispersion: 1, date: "2018-01-16" }, { grade: 1, split: false });
  const p = firstPlacement(c.students, pre.scoreMap, { seed: 3 });
  c = { ...c, students: p.students, classes: rebuildClasses(p.students) };
  const exams = buildCalendar(2019, 2021).filter((e) => e.examKind && e.grades?.includes(3) && e.examKind !== "quiz").slice(0, 8);
  const liGaps = [], wenGaps = [], firsts = [], tops = [], topIds = [];
  for (const e of exams) {
    const r = runExam(c, e, { grade: 3, split: true });
    const li = r.cutoffs.li, wen = r.cutoffs.wen;
    liGaps.push(li.firstLine - li.secondLine);
    wenGaps.push(wen.firstLine - wen.secondLine);
    firsts.push(li.firstLine);
    tops.push(li.topGap);
    topIds.push(li.topId);
  }
  const uniqDiff = new Set(exams.map((e) => e.difficulty.toFixed(3)));
  assert.ok(uniqDiff.size >= 4, "难度应随场次变化");
  assert.ok(Math.max(...firsts) - Math.min(...firsts) >= 15, `一本线应随难度明显波动，实际 ${Math.min(...firsts)}–${Math.max(...firsts)}`);
  // 校内线按上一届名额（测试无数据时用兜底：理科一本 450、二本前 1000）从当次排序得出。
  // 名额从原分摊后的约第 253/632 名改为第 450/1000 名后，理科校内分差覆盖的能力段更宽，常见一百二十来分，仍须是数十分而非几分，并随难度波动。
  // 公开省控分差（理 72–84，文 56–75）仍由下一项测试锁定，不在这里改计分曲线。
  assert.ok(liGaps.every((g) => g >= 90 && g <= 150), `理科校内分差应为数十分，实际 ${Math.min(...liGaps)}–${Math.max(...liGaps)}（${liGaps.join(",")}）`);
  assert.ok(Math.max(...liGaps) - Math.min(...liGaps) >= 10, `理科分差应随难度波动，实际 ${Math.min(...liGaps)}–${Math.max(...liGaps)}`);
  assert.ok(wenGaps.every((g) => g >= 45 && g <= 110), `文科校内分差应为数十分，实际 ${Math.min(...wenGaps)}–${Math.max(...wenGaps)}（${wenGaps.join(",")}）`);
  assert.ok(Math.max(...wenGaps) >= 56, `文科分差应能达到省控下沿量级，最大仅 ${Math.max(...wenGaps)}`);
  assert.ok(Math.max(...tops) - Math.min(...tops) >= 4, "第一第二名分差应有弹性");
  assert.ok(new Set(topIds).size >= 2, "第一名不应场场都是同一人");
});

test("2016—2020 江西公开一本/二本线分差作为对标，不得改写公开数字", () => {
  const expect = {
    2016: { wen: [523, 450, 73], li: [529, 445, 84] },
    2017: { wen: [533, 458, 75], li: [503, 422, 81] },
    2018: { wen: [568, 496, 72], li: [527, 447, 80] },
    2019: { wen: [558, 502, 56], li: [522, 449, 73] },
    2020: { wen: [547, 488, 59], li: [535, 463, 72] },
  };
  for (const [year, tracks] of Object.entries(expect)) {
    for (const track of ["wen", "li"]) {
      const [first, second, gap] = tracks[track];
      const L = provincialLines(Number(year), track);
      assert.equal(L.first, first, `${year} ${track} 一本`);
      assert.equal(L.second, second, `${year} ${track} 二本`);
      assert.equal(gapOfficial(Number(year), track), gap);
    }
  }
});
