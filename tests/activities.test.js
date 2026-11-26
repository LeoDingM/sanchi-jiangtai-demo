import test from "node:test";
import assert from "node:assert/strict";
import { buildCalendar, weekday } from "../js/domain/calendar.js";
import { daySchedule, majorEventOn } from "../js/domain/timetable.js";
import { canAlterSlot } from "../js/domain/tiaoke.js";
import { toJSON, fromJSON } from "../js/domain/save.js";
import {
  createGame, teach, skipUntil, skipToNextStage, playerStudents, studentRecentStatus,
  isSchoolActivityOpen, doActivityAction, advanceDay, canAlterSlot as canAlterFromSim,
} from "../js/domain/simulation.js";

const OFFICIAL_RE = /教育考试院|投档|全市冠军|全省冠军|省运动会金牌/;

function calendarWindow(from = 2017, to = 2022) {
  return buildCalendar(from, to);
}

test("秋季运动会和迎新年每年都出现在校历，并落在月考与期中/期末之间", () => {
  const ev = calendarWindow();
  const years = [2017, 2018, 2019, 2020];
  for (const sy of years) {
    const sports = ev.filter((e) => e.meetId === `sports-${sy}`).sort((a, b) => a.date.localeCompare(b.date));
    const ny = ev.find((e) => e.id === `newyear-${sy}`);
    assert.equal(sports.length, 2, `${sy}学年应有两天运动会`);
    assert.ok(ny, `${sy}学年应有迎新年`);
    assert.equal(sports[0].off, "full");
    assert.equal(sports[1].off, "full");
    assert.equal(ny.off, "afternoon");
    assert.ok(sports[0].date > `${sy}-10-16` && sports[0].date < `${sy}-11-15`, `运动会应在第一次月考后、期中前，实际 ${sports[0].date}`);
    assert.ok(sports[1].date > sports[0].date);
    assert.ok(sports[1].date < `${sy}-11-15`);
    const monthly2 = ev.find((e) => e.id === `exam-${sy}-第二次月考`);
    const final = ev.find((e) => e.id === `exam-${sy}-期末考试`);
    assert.ok(monthly2 && final);
    assert.ok(ny.date > monthly2.date && ny.date < final.date, `迎新年应在第二次月考后、期末前，实际 ${ny.date}`);
    for (const a of [...sports, ny]) {
      assert.ok(a.sourceNote && a.sourceNote.includes("校内日期安排"), a.sourceNote);
      assert.ok(a.sourceNote.includes("不是某所实校"));
      assert.ok(!OFFICIAL_RE.test(a.sourceNote));
    }
  }
  const s17 = ev.filter((e) => e.meetId === "sports-2017").map((e) => e.date);
  assert.deepEqual(s17, ["2017-10-26", "2017-10-27"]);
  const ny17 = ev.find((e) => e.id === "newyear-2017");
  assert.equal(ny17.date, "2018-01-01");
  assert.equal(weekday("2018-01-01"), 1);
  const mid = ev.find((e) => e.kind === "exam" && e.name === "期中考试" && e.date.startsWith("2017-11"));
  assert.equal(mid.date, "2017-11-15");
});

test("运动会日不能上课也不能调课", () => {
  const s = createGame(20170901);
  s.date = "2017-10-26";
  s.periodId = "morning-read";
  assert.ok(majorEventOn("2017-10-26"));
  const sched = daySchedule("2017-10-26", s);
  assert.ok(sched.filter((p) => p.kind !== "break" && p.kind !== "rest").every((p) => p.isExamDay && p.subject.includes("停课") && p.subject.includes("运动会")));
  assert.ok(!sched.some((p) => p.isMath));
  const blocked = teach(s, "精讲例题");
  assert.equal(blocked.ok, false);
  assert.ok(blocked.reason.includes("停课") || blocked.reason.includes("运动会"));
  const alter = canAlterSlot("2017-10-26", "p2");
  assert.equal(alter.ok, false);
  assert.ok(alter.reason.includes("停课"));
  assert.equal(canAlterSlot("2017-10-27", "p1").ok, false);
});

test("迎新年当天后半段是活动时段，上午仍可排课，活动时段不能调课", () => {
  const s = createGame(20170901);
  const sched = daySchedule("2018-01-01", s);
  const morning = sched.filter((p) => ["p1", "p2", "p3", "p4"].includes(p.id));
  const later = sched.filter((p) => ["p5", "p6", "p7", "p8", "evening-1", "evening-2"].includes(p.id));
  assert.ok(morning.length >= 4);
  assert.ok(morning.every((p) => !p.isExamDay && !p.isActivityPeriod));
  assert.ok(morning.some((p) => p.isMath));
  assert.ok(later.every((p) => p.isActivityPeriod && p.subject.includes("活动") && p.subject.includes("迎新年")));
  assert.ok(!later.some((p) => p.isMath || p.isTutoring));
  assert.equal(canAlterSlot("2018-01-01", "p2").ok, true);
  const aft = canAlterSlot("2018-01-01", "p5");
  assert.equal(aft.ok, false);
  assert.ok(aft.reason.includes("活动时段") || aft.reason.includes("迎新年"));
  assert.equal(canAlterFromSim("2018-01-01", "evening-1").ok, false);
});

function playToSports(seed = 20170901) {
  const s = createGame(seed);
  skipUntil(s, (st) => isSchoolActivityOpen(st) && st.schoolActivity?.activityKind === "sports", 20);
  assert.ok(isSchoolActivityOpen(s), `应推进到运动会当天，当前 ${s.date}`);
  return s;
}

test("运动会带队、看纪律、记录本班可复现，并写入档案近况和日志", () => {
  function once() {
    const s = playToSports(20170901);
    assert.equal(s.date, "2017-10-26");
    assert.ok((s.schoolActivity.roster || []).length >= 8);
    const stu = playerStudents(s).find((x) => (s.schoolActivity.roster || []).some((r) => r.id === x.id));
    assert.ok(stu);
    assert.ok(stu.lastActivity, "开场时应把参赛情况写入档案");
    const status = studentRecentStatus(stu, s);
    assert.ok(status.includes("运动会"), status);
    const lead = doActivityAction(s, "lead", stu.id);
    assert.equal(lead.ok, true, lead.reason);
    assert.ok(lead.text.includes(stu.name));
    assert.ok(lead.text.includes("校内"));
    assert.ok(!OFFICIAL_RE.test(lead.text));
    const disc = doActivityAction(s, "discipline");
    assert.equal(disc.ok, true, disc.reason);
    const rec = doActivityAction(s, "record");
    assert.equal(rec.ok, true, rec.reason);
    assert.ok(rec.text.includes("校内"));
    const again = doActivityAction(s, "record");
    assert.equal(again.ok, false);
    assert.ok((s.log || []).some((l) => l.text.includes("运动会") && l.text.includes("校内")));
    return { date: s.date, lead: lead.text, disc: disc.text, rec: rec.text, status, id: stu.id };
  }
  const a = once();
  const b = once();
  assert.deepEqual(a, b);
});

test("迎新年可参加、看班、写日志，存档往返后活动记录仍在", () => {
  const s = createGame(20170901);
  skipUntil(s, (st) => isSchoolActivityOpen(st) && st.schoolActivity?.activityKind === "newyear", 30);
  assert.ok(isSchoolActivityOpen(s), `应推进到迎新年，当前 ${s.date}`);
  assert.equal(s.date, "2018-01-01");
  const attend = doActivityAction(s, "attend");
  assert.equal(attend.ok, true, attend.reason);
  const watch = doActivityAction(s, "watch");
  assert.equal(watch.ok, true, watch.reason);
  const log = doActivityAction(s, "log");
  assert.equal(log.ok, true, log.reason);
  assert.ok(attend.text.includes("校内") || attend.text.includes("迎新年"));
  assert.ok(!OFFICIAL_RE.test(attend.text + watch.text + log.text));
  const named = playerStudents(s).find((x) => (x.activityNotes || []).length);
  assert.ok(named);
  const json = toJSON(s);
  const b = fromJSON(json);
  assert.equal(b.date, s.date);
  assert.equal(b.schoolActivity.name, s.schoolActivity.name);
  assert.deepEqual(b.schoolActivity.roster, s.schoolActivity.roster);
  const stuA = playerStudents(s).find((x) => x.id === named.id);
  const stuB = playerStudents(b).find((x) => x.id === named.id);
  assert.deepEqual(stuB.activityNotes, stuA.activityNotes);
  assert.equal(stuB.lastActivity.text, stuA.lastActivity.text);
  assert.ok((b.log || []).some((l) => l.text.includes("迎新年") && (l.text.includes("校内") || l.text.includes("学校活动"))));
  const again = doActivityAction(b, "attend");
  assert.equal(again.ok, false);
});

test("自动推进能越过活动日到达期末，文案写明是校内安排的学校活动", () => {
  const s = createGame(20170901);
  const steps = [];
  for (let i = 0; i < 20; i++) {
    const r = skipToNextStage(s);
    assert.equal(r.ok, true, r.reason);
    steps.push(r);
    if (s.date >= "2018-01-16") break;
  }
  assert.equal(s.date, "2018-01-16");
  const sports = steps.filter((r) => r.event?.activityKind === "sports");
  const ny = steps.find((r) => r.event?.activityKind === "newyear");
  assert.equal(sports.length, 2);
  assert.ok(ny, "应经过迎新年");
  assert.ok(sports.every((r) => r.message.includes("学校活动") && r.message.includes("2017级") && r.message.includes("高一上")));
  assert.ok(ny.message.includes("学校活动") && ny.message.includes("迎新年"));
  assert.ok((s.log || []).some((l) => l.text.includes("运动会") && l.text.includes("校内日期安排")));
  assert.ok((s.log || []).some((l) => l.text.includes("迎新年") && l.text.includes("校内日期安排")));
  assert.ok(!(s.log || []).some((l) => OFFICIAL_RE.test(l.text) && (l.text.includes("运动会") || l.text.includes("迎新年"))));
  // 下一天走过运动会后不应卡死
  const g = createGame(20170901);
  g.date = "2017-10-25";
  g.periodId = "evening-2";
  const first = advanceDay(g);
  assert.equal(g.date, "2017-10-26");
  // 当天先结算运动会
  const settle = advanceDay(g);
  assert.equal(settle.type, "activity");
  assert.equal(g.date, "2017-10-26");
  const leave = advanceDay(g);
  assert.equal(g.date, "2017-10-27");
  const settle2 = advanceDay(g);
  assert.equal(settle2.type, "activity");
  const after = advanceDay(g);
  assert.ok(g.date > "2017-10-27");
  assert.equal(after.type, "day");
  assert.ok(teach(g, "精讲例题").ok !== undefined);
});
