import test from "node:test";
import assert from "node:assert/strict";
import { weekday, buildCalendar } from "../js/domain/calendar.js";
import { HOMEROOM_NAME } from "../js/domain/config.js";
import {
  createGame, prepareLesson, teach, meetParent, playerStudents, skipUntil,
  isParentsMeetingOpen, studentRecentStatus, PARENT_TALK_CAP,
} from "../js/domain/simulation.js";

test("校历在期中后和春季开学后安排家长会，并注明是校内日期而非实校公告", () => {
  const ev = buildCalendar(2017, 2021);
  const falls = ev.filter((e) => e.kind === "parents" && String(e.id).startsWith("parents-fall"));
  const springs = ev.filter((e) => e.kind === "parents" && String(e.id).startsWith("parents-spring"));
  assert.ok(falls.length >= 3, "每年秋季应有家长会");
  assert.ok(springs.length >= 3, "每年春季应有家长会");
  const fall17 = ev.find((e) => e.id === "parents-fall-2017");
  assert.ok(fall17);
  assert.equal(fall17.date, "2017-11-25");
  assert.equal(weekday(fall17.date), 6);
  assert.ok(fall17.date > "2017-11-17", "应排在期中考试之后");
  assert.ok(fall17.sourceNote && fall17.sourceNote.includes("校内日期安排"));
  assert.ok(fall17.sourceNote.includes("不是某所实校"));
  assert.ok(!/教育考试院|投档|会考合格线/.test(fall17.sourceNote));
  const spring = ev.find((e) => e.id === "parents-spring-2017");
  assert.ok(spring);
  assert.equal(spring.date, "2018-03-10");
  assert.ok(spring.date > "2018-02-22");
  assert.equal(weekday(spring.date), 6);
  assert.equal(spring.sourceNote, fall17.sourceNote);
});

function playToMeeting(seed = 20170901) {
  const s = createGame(seed);
  prepareLesson(s, { topic: "集合与逻辑用语", depth: 2, homework: "中" });
  const taught = teach(s, "精讲例题");
  assert.equal(taught.ok, true);
  skipUntil(s, (st) => isParentsMeetingOpen(st), 40);
  assert.ok(isParentsMeetingOpen(s), `应推进到家长会当天，当前 ${s.date}`);
  return s;
}

test("家长会由班主任主持，任课老师面谈写入档案近况和日志，且可复现", () => {
  function once() {
    const s = playToMeeting(20170901);
    assert.equal(s.parentsMeeting.host, HOMEROOM_NAME);
    assert.ok(s.parentsMeeting.role.includes("任课"));
    const stu = playerStudents(s).find((x) => x.lastClassFlag) || playerStudents(s)[0];
    const r = meetParent(s, stu.id);
    assert.equal(r.ok, true, r.reason);
    assert.ok(r.text.includes(HOMEROOM_NAME) && r.text.includes("主持"));
    assert.ok(r.text.includes("数学任课老师"));
    assert.ok(r.text.includes(stu.name));
    assert.ok(r.text.includes("考试方面"));
    assert.ok(r.text.includes("作业方面"));
    assert.ok(r.text.includes("课堂方面"));
    assert.equal(stu.lastParentMeeting.date, s.date);
    assert.equal(stu.parentMeetings[0].meetingId, s.parentsMeeting.id);
    const status = studentRecentStatus(stu, s);
    assert.ok(status.includes("家长会"), status);
    assert.ok((s.log || []).some((l) => l.text.includes("家长会") && l.text.includes(stu.name)));
    const again = meetParent(s, stu.id);
    assert.equal(again.ok, false);
    return { text: r.text, date: s.date, status, id: stu.id };
  }
  const a = once();
  const b = once();
  assert.equal(a.text, b.text);
  assert.equal(a.date, b.date);
  assert.equal(a.status, b.status);
  assert.equal(a.id, b.id);
});

test("不是家长会日不能面谈，一场最多谈固定人数，且只谈本班", () => {
  const s = createGame(20170901);
  const stu = playerStudents(s)[0];
  const early = meetParent(s, stu.id);
  assert.equal(early.ok, false);
  skipUntil(s, (st) => isParentsMeetingOpen(st), 40);
  const cls = playerStudents(s);
  assert.ok(cls.length > PARENT_TALK_CAP);
  for (let i = 0; i < PARENT_TALK_CAP; i++) {
    const r = meetParent(s, cls[i].id);
    assert.equal(r.ok, true, r.reason || cls[i].name);
  }
  const over = meetParent(s, cls[PARENT_TALK_CAP].id);
  assert.equal(over.ok, false);
  assert.match(over.reason, /已经单独谈了/);
  const other = s.cohorts[s.player.cohortYear].students.find((x) => x.classNo !== s.player.classNo && !x.repeat);
  assert.ok(other);
  const r2 = meetParent(s, other.id);
  assert.equal(r2.ok, false);
  assert.match(r2.reason, /本班/);
});
