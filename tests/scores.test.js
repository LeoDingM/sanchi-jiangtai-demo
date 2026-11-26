import test from "node:test";
import assert from "node:assert/strict";
import { SUBJECTS_G1, G1_TOTAL } from "../js/domain/config.js";
import { expectedPct, gradeStudent, scaleOf, subjectsFor, SCALE_G1, SCALE_GAOKAO } from "../js/domain/scores.js";

test("高一是 950 分制，8 门课且不含生物", () => {
  assert.equal(G1_TOTAL, 950);
  assert.equal(SUBJECTS_G1.length, 8);
  assert.ok(!SUBJECTS_G1.some((s) => s.id === "biology"));
  assert.equal(SUBJECTS_G1.reduce((a, s) => a + s.max, 0), 950);
  const sub = subjectsFor(SCALE_G1);
  assert.ok(!sub.some((s) => s.id === "biology"));
});

test("高三/高考理科为 750，理综 110/100/90，文科政史地各 100", () => {
  const li = subjectsFor(SCALE_GAOKAO, "li");
  const wen = subjectsFor(SCALE_GAOKAO, "wen");
  assert.equal(li.find((s) => s.id === "physics").max, 110);
  assert.equal(li.find((s) => s.id === "chemistry").max, 100);
  assert.equal(li.find((s) => s.id === "biology").max, 90);
  assert.equal(li.reduce((a, s) => a + s.max, 0), 750);
  assert.deepEqual(wen.filter((s) => ["politics", "history", "geography"].includes(s.id)).map((s) => s.max), [100, 100, 100]);
  assert.equal(wen.reduce((a, s) => a + s.max, 0), 750);
});

test("单科与总分不会越界，且同一输入分数完全相同", () => {
  const stu = {
    id: "2017-16-01", stability: 80, energy: 70, stress: 40,
    ability: Object.fromEntries(["chinese","math","english","physics","chemistry","geography","history","politics","biology"].map((k) => [k, 70])),
    potential: Object.fromEntries(["chinese","math","english","physics","chemistry","geography","history","politics","biology"].map((k) => [k, 80])),
    track: "li",
  };
  const exam = { id: "t", difficulty: 1, dispersion: 1 };
  const a = gradeStudent(stu, exam, SCALE_G1, 0);
  const b = gradeStudent(stu, exam, SCALE_G1, 0);
  assert.deepEqual(a, b);
  assert.ok(a.total <= 950 && a.total >= 0);
  for (const s of SUBJECTS_G1) {
    assert.ok(a[s.id] >= 0 && a[s.id] <= s.max, s.id);
  }
  assert.equal(a.biology, undefined);
});

test("能力曲线单调，顶端不到满分扎堆", () => {
  assert.ok(expectedPct(44) < expectedPct(56));
  assert.ok(expectedPct(56) < expectedPct(86));
  assert.ok(expectedPct(99) < 0.92);
  assert.ok(expectedPct(86) < 0.81);
});
