import test from "node:test";
import assert from "node:assert/strict";
import { formatGradeTerm, formatCohortGrade, termOf, eventById } from "../js/domain/calendar.js";
import { createGame, skipToNextStage, gradeOf, describePlayerStage, describeEventAudience, describeStageAdvance, describeAdmissionContext } from "../js/domain/simulation.js";

test("校历学期与年级标签：2018 年 6 月时玩家 2017 级仍是高一下，不是高考届", () => {
  assert.equal(termOf("2017-09-01"), "上");
  assert.equal(termOf("2018-01-16"), "上");
  assert.equal(termOf("2018-06-07"), "下");
  assert.equal(formatGradeTerm(1, "2018-06-07"), "高一下学期");
  assert.equal(formatCohortGrade(2017, "2018-06-07").term, "高一下学期");
  assert.equal(formatCohortGrade(2015, "2018-06-07").term, "高三下学期");
  assert.equal(formatCohortGrade(2017, "2020-06-07").term, "高三下学期");
  assert.equal(formatGradeTerm(4, "2020-08-20"), "已毕业");
});

test("推进到 2018 年高考时，提示要写明这是 2015 级的高考，玩家带的是高一", () => {
  const ev = eventById("gaokao-2018");
  assert.ok(ev);
  assert.match(describeEventAudience(ev), /2015级/);
  assert.match(describeEventAudience(ev), /高考/);
  const g = createGame(20170901);
  let guard = 0;
  while (g.date < "2018-06-07" && guard++ < 40) skipToNextStage(g);
  assert.equal(g.date, "2018-06-07");
  assert.equal(gradeOf(g.player.cohortYear, g.date), 1);
  const msg = describeStageAdvance(g, ev);
  assert.match(msg, /2015级/);
  assert.match(msg, /2017级/);
  assert.match(msg, /高一下/);
  assert.match(msg, /尚未高考/);
  assert.doesNotMatch(msg, /这就是你带的2017级的高考/);
});

test("录取说明要区分查看的届次和自己带的班", () => {
  const g = createGame(20170901);
  g.date = "2018-07-25";
  const pack = { year: 2018, entryYear: 2015, results: [] };
  const text = describeAdmissionContext(g, pack);
  assert.match(text, /2015级/);
  assert.match(text, /不是你当前带的2017级/);
  assert.match(text, /高一下/);
  assert.match(text, /尚未高考/);
  const mine = describeAdmissionContext({ ...g, date: "2020-07-25" }, { year: 2020, entryYear: 2017, results: [] });
  assert.match(mine, /你带的2017级/);
  assert.match(describePlayerStage(g, "2017-09-01"), /高一上学期/);
});
