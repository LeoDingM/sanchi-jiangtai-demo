import test from "node:test";
import assert from "node:assert/strict";
import { weekday } from "../js/domain/calendar.js";
import { daySchedule, weekMathCount, currentSlot, isTutoringSlot } from "../js/domain/timetable.js";
import { seatLabel } from "../js/domain/school.js";
import {
  createGame, prepareLesson, teach, talkTo, tutorEvening, reviewHomework,
  urgeHomework, playerStudents, periodTalkScene, advancePeriod, homeroomEveningRoll,
} from "../js/domain/simulation.js";

test("周一晚自习和周二答疑是辅导时段，不占用数学正课课题", () => {
  assert.ok(weekMathCount() >= 6 && weekMathCount() <= 7);
  const monEve = daySchedule("2017-09-04").find((p) => p.id === "evening-1");
  assert.equal(weekday("2017-09-04"), 1);
  assert.ok(monEve.isTutoring);
  assert.ok(!monEve.isMath);
  assert.ok(monEve.subject.includes("数学晚自习"));
  const tueEve = daySchedule("2017-09-05").find((p) => p.id === "evening-2");
  assert.ok(tueEve.isTutoring);
  assert.ok(!tueEve.isMath);
  assert.ok(tueEve.subject.includes("数学答疑"));
  const monClass = daySchedule("2017-09-04").find((p) => p.id === "p2");
  assert.ok(monClass.isMath);
  assert.ok(!monClass.isTutoring);
});

test("谈话带出当前课时和座位，本时段次数有上限；晚自习可巡视答疑收订正且可复现", () => {
  function play() {
    const s = createGame(20170901);
    prepareLesson(s, { topic: "集合与逻辑用语", depth: 2, homework: "中" });
    const t = teach(s, "精讲例题");
    assert.equal(t.ok, true);
    // 下课后落到第3节语文，谈话应写明课时和座位
    assert.equal(s.periodId, "p3");
    const first = playerStudents(s)[0];
    const talk = talkTo(s, first.id, "询问学习");
    assert.equal(talk.ok, true);
    assert.ok(talk.text.includes(first.name));
    assert.ok(talk.text.includes(seatLabel(first)));
    assert.ok(talk.text.includes("语文") || talk.text.includes("第3节"));
    assert.ok(talk.text.includes("集合") || talk.text.includes("作业") || talk.text.includes("小测"));
    const scene = periodTalkScene(s);
    assert.equal(scene.kind, "otherclass");
    assert.equal(scene.cap, 2);
    // 非晚自习不能答疑
    const tooEarly = tutorEvening(s, "巡视");
    assert.equal(tooEarly.ok, false);
    assert.ok(tooEarly.reason.includes("还不是") || tooEarly.reason.includes("答疑"));

    const miss = s.homework.rows.find((r) => r.correction === "待补交");
    const weak = s.homework.rows.find((r) => r.quality === "错题较多" || r.quality === "未订正");
    if (miss) urgeHomework(s, miss.id);
    if (weak) reviewHomework(s, weak.id);

    s.date = "2017-09-04";
    s.periodId = "evening-1";
    s.talksThisPeriod = 0;
    s.tutorAnswers = 0;
    s.tutorSlotKey = null;
    assert.ok(isTutoringSlot(currentSlot(s)));
    const patrol = tutorEvening(s, "巡视");
    assert.equal(patrol.ok, true);
    assert.ok(patrol.text.includes("晚自习") || patrol.text.includes("走"));
    const patrol2 = tutorEvening(s, "巡视");
    assert.equal(patrol2.ok, false);
    const collect = tutorEvening(s, "收订正");
    if (weak) assert.equal(collect.ok, true, collect.reason);
    else assert.ok(collect.ok === true || (collect.reason && collect.reason.includes("订正")));
    const ans = tutorEvening(s, "答疑", (weak || miss || first).id);
    assert.equal(ans.ok, true);
    assert.ok(ans.text.includes("第") && ans.text.includes("排"));
    const group = tutorEvening(s, "小组");
    assert.ok(group.ok === true || (group.reason && group.reason.includes("没有")));
    return {
      talk: talk.text,
      patrol: patrol.text,
      ans: ans.text,
      group: group.ok ? group.text : group.reason,
      collect: collect.ok ? collect.text : collect.reason,
    };
  }
  const a = play();
  const b = play();
  assert.deepEqual(a, b);
});

test("本时段谈话次数用尽后须等下一节", () => {
  const s = createGame(20170901);
  s.periodId = "p3";
  const sts = playerStudents(s);
  const r1 = talkTo(s, sts[0].id, "鼓励");
  const r2 = talkTo(s, sts[1].id, "鼓励");
  const r3 = talkTo(s, sts[2].id, "鼓励");
  assert.equal(r1.ok, true);
  assert.equal(r2.ok, true);
  assert.equal(r3.ok, false);
  assert.ok(r3.reason.includes("这个时段"));
  assert.ok(r1.text.includes(seatLabel(sts[0])));
  const moved = advancePeriod(s);
  assert.equal(moved.ok, true);
  const r4 = talkTo(s, sts[2].id, "鼓励");
  assert.equal(r4.ok, true);
});

test("晚自习巡视把名单交给班主任，点名按名单执行且可复现", () => {
  function play() {
    const s = createGame(20170901);
    prepareLesson(s, { topic: "集合与逻辑用语", depth: 2, homework: "中" });
    teach(s, "精讲例题");
    const miss = s.homework.rows.find((r) => r.correction === "待补交");
    const weak = s.homework.rows.find((r) => r.quality === "错题较多" || r.quality === "未订正");
    if (miss) urgeHomework(s, miss.id);
    if (weak) reviewHomework(s, weak.id);
    const early = homeroomEveningRoll(s);
    assert.equal(early.ok, false);
    s.date = "2017-09-04";
    s.periodId = "evening-1";
    s.tutorSlotKey = null;
    const patrol = tutorEvening(s, "巡视");
    assert.equal(patrol.ok, true);
    assert.ok(patrol.roll?.length > 0);
    assert.ok(patrol.text.includes("点名名单") && patrol.text.includes("赵映秋"));
    assert.equal(s.eveningRoll.handed, true);
    const roll = homeroomEveningRoll(s);
    assert.equal(roll.ok, true);
    assert.ok(roll.text.includes("点名"));
    assert.ok(roll.text.includes("赵映秋"));
    assert.ok(roll.text.includes("按你交的名单"));
    assert.equal(s.eveningRoll.called, true);
    const again = homeroomEveningRoll(s);
    assert.equal(again.ok, false);
    return { patrol: patrol.text, roll: roll.text, n: patrol.roll.length };
  }
  const a = play();
  const b = play();
  assert.deepEqual(a, b);
});
