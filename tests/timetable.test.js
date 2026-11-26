import test from "node:test";
import assert from "node:assert/strict";
import { weekday, weekdayName } from "../js/domain/calendar.js";
import { daySchedule, weekMathCount, isMathPeriodId, periodsForWeekday, upcomingMath, currentSlot } from "../js/domain/timetable.js";
import {
  createGame, prepareLesson, teach, advancePeriod, advanceDay, skipToNextStage,
  consultMentor, officeMarking, consultHomeroom, urgeHomework, checkCorrection,
  reviewHomework, playerStudents,
} from "../js/domain/simulation.js";

test("课表按星期推进：周六上午、周日休息，周课时约 6–7 节，考试日停课", () => {
  assert.equal(weekday("2017-09-01"), 5);
  assert.equal(weekdayName("2017-09-01"), "五");
  assert.ok(weekMathCount() >= 6 && weekMathCount() <= 7);
  assert.equal(isMathPeriodId(5, "p2"), true);
  const fri = daySchedule("2017-09-01");
  assert.ok(fri.some((p) => p.id === "p2" && p.isMath && p.subject.includes("数学")));
  assert.ok(fri.some((p) => p.id === "evening-2"));

  const sat = daySchedule("2017-09-02");
  assert.equal(weekday("2017-09-02"), 6);
  assert.ok(sat.every((p) => !["p5", "p6", "p7", "p8", "evening-1", "evening-2"].includes(p.id)));
  assert.ok(sat.some((p) => p.id === "p3" && p.isMath));
  assert.ok(sat.some((p) => p.id === "noon"));

  const sun = daySchedule("2017-09-03");
  assert.deepEqual(sun.map((p) => p.id), ["rest"]);
  assert.ok(!sun.some((p) => p.isMath));

  const exam = daySchedule("2017-10-16");
  assert.ok(exam.filter((p) => p.kind !== "break" && p.kind !== "rest").every((p) => p.isExamDay && p.subject.includes("停课")));
  assert.ok(!exam.some((p) => p.isMath));
});

test("下一节按校历走课表，周日跨到周一，上课只在数学课进行", () => {
  const a = createGame(20170901);
  assert.equal(a.date, "2017-09-01");
  assert.equal(a.periodId, "morning-read");
  const r1 = advancePeriod(a);
  assert.equal(r1.ok, true);
  assert.equal(a.periodId, "p1");
  assert.equal(r1.rolledDay, false);
  const r2 = advancePeriod(a);
  assert.equal(a.periodId, "p2");
  assert.ok(currentSlot(a).isMath);

  // 从周五晚自习二走到周六早读
  a.periodId = "evening-2";
  const sat = advancePeriod(a);
  assert.equal(sat.rolledDay, true);
  assert.equal(a.date, "2017-09-02");
  assert.equal(a.periodId, "morning-read");

  a.periodId = "noon";
  const mon = advancePeriod(a);
  assert.equal(mon.rolledDay, true);
  assert.equal(a.date, "2017-09-04"); // 周日休息，直接跨到周一
  assert.equal(a.periodId, "morning-read");
  assert.equal(weekday(a.date), 1);

  const b = createGame(20170901);
  b.date = "2017-10-16";
  b.periodId = "morning-read";
  const blocked = teach(b, "精讲例题");
  assert.equal(blocked.ok, false);
  assert.ok(blocked.reason.includes("停课"));
});

test("作业订正从缺交/错题跟到补交、面批、复查，办公室协同不是空操作，且可复现", () => {
  function runOnce() {
    const s = createGame(20170901);
    prepareLesson(s, { topic: "集合与逻辑用语", depth: 2, homework: "中" });
    const t = teach(s, "精讲例题");
    assert.equal(t.ok, true);
    const miss = s.homework.rows.find((r) => r.correction === "待补交");
    const weak = s.homework.rows.find((r) => r.quality === "错题较多" || r.quality === "未订正");
    assert.ok(miss, "应有缺交可跟踪");
    assert.ok(weak, "应有错题可跟踪");
    const urge = urgeHomework(s, miss.id);
    assert.equal(urge.ok, true);
    const rv = reviewHomework(s, weak.id);
    assert.equal(rv.ok, true);
    assert.equal(weak.correction, "待订正");
    let steps = 0;
    while (steps < 40 && (miss.correction === "待补交" || weak.correction === "待订正")) {
      advancePeriod(s);
      steps++;
    }
    assert.equal(miss.correction, "已补交待面批");
    assert.equal(weak.correction, "已订正待复查");
    const chk = checkCorrection(s, weak.id);
    assert.equal(chk.ok, true);
    assert.ok(chk.passed === true || chk.passed === false);
    const after = weak.correction;
    assert.ok(after === "已闭环" || after === "待订正");
    const rv2 = reviewHomework(s, miss.id);
    assert.equal(rv2.ok, true);
    assert.equal(miss.correction, "待订正");
    const m1 = consultMentor(s);
    assert.equal(m1.ok, true);
    assert.ok(s.player.prep >= 1);
    const m2 = consultMentor(s);
    assert.equal(m2.ok, false);
    const home = consultHomeroom(s);
    assert.equal(home.ok, true);
    assert.ok(home.text.includes("赵映秋"));
    return {
      missId: miss.id,
      weakId: weak.id,
      urge: urge.text,
      review: rv.text,
      check: chk.text,
      mentor: m1.text,
      home: home.text,
      after,
      steps,
    };
  }
  const a = runOnce();
  const b = runOnce();
  assert.deepEqual(a, b);

  const c = createGame(20170901);
  prepareLesson(c, { topic: "集合与逻辑用语", depth: 2, homework: "中" });
  teach(c, "精讲例题");
  const mark = officeMarking(c);
  assert.equal(mark.ok, true);
  assert.ok(mark.marked >= 1);
  assert.ok(mark.text.includes("办公室"));
  const mark2 = officeMarking(c);
  assert.equal(mark2.ok, false);
});
