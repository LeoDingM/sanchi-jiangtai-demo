import test from "node:test";
import assert from "node:assert/strict";
import { HOMEROOM_NAME } from "../js/domain/config.js";
import {
  dutyStudents, schoolDayIndex, abilityMean, DUTY_PER_DAY,
  isHomeroomMeetingSlot, classCommittee, classBrief,
} from "../js/domain/classManage.js";
import { currentSlot } from "../js/domain/timetable.js";
import {
  createGame, playerStudents, attendClassMeeting, hostClassMeeting,
  playerClassCommittee, prepareLesson, teach,
} from "../js/domain/simulation.js";

const SEED = 20170901;

function roleMap(committee) {
  return Object.fromEntries(committee.roles.map((r) => [r.id, r.student]));
}

test("班委按学生特质硬定，一人一职，同一局稳定，名单变了会重算", () => {
  const a = createGame(SEED);
  const b = createGame(SEED);
  const sa = playerStudents(a);
  const c1 = classCommittee(a, sa);
  const c2 = classCommittee(b, playerStudents(b));
  assert.equal(c1.roles.length, 4);
  const titles = c1.roles.map((r) => r.title).sort();
  assert.deepEqual(titles, ["劳动委员", "学习委员", "班长", "纪律委员"].sort());
  const ids = c1.roles.map((r) => r.student.id);
  assert.equal(new Set(ids).size, 4, "一人一职");
  assert.deepEqual(ids, c2.roles.map((r) => r.student.id));

  const map = roleMap(c1);
  const studyMean = abilityMean(map.study);
  const better = sa.filter((s) => abilityMean(s) > studyMean).length;
  assert.ok(better <= sa.length * 0.25, `学习委员应偏学业较好，比其更高的有 ${better} 人`);
  assert.notEqual(map.discipline.personality, "懒散");
  const stabMedian = sa.map((s) => s.stability || 0).sort((x, y) => x - y)[Math.floor(sa.length / 2)];
  assert.ok(
    map.discipline.personality === "自律"
      || map.discipline.personality === "沉稳"
      || (map.discipline.stability || 0) >= stabMedian,
    `纪律委员应偏自律或稳定，实际 ${map.discipline.name} ${map.discipline.personality} 稳定 ${map.discipline.stability}`,
  );

  const beforeStudy = map.study.id;
  const cohort = a.cohorts[a.player.cohortYear];
  const leaving = cohort.students.find((s) => s.id === beforeStudy);
  const incoming = cohort.students.find((s) => s.classNo !== a.player.classNo);
  assert.ok(leaving && incoming);
  leaving.classNo = incoming.classNo;
  incoming.classNo = a.player.classNo;
  incoming.seq = leaving.seq;
  const after = playerClassCommittee(a);
  assert.equal(after.roles.length, 4);
  assert.equal(new Set(after.roles.map((r) => r.student.id)).size, 4);
  assert.ok(after.roles.every((r) => r.student.classNo === a.player.classNo));
  assert.ok(!after.roles.some((r) => r.student.id === beforeStudy), "人员变化后应重算，离开的学习委员不再任职");
});

test("值日按座号随日期轮换，同一天同一份名单结果稳定", () => {
  const s = createGame(SEED);
  const sts = playerStudents(s);
  const d1 = "2017-09-01";
  const d2 = "2017-09-04";
  const a = dutyStudents(sts, d1);
  const b = dutyStudents(sts, d1);
  assert.equal(a.length, DUTY_PER_DAY);
  assert.deepEqual(a.map((x) => x.id), b.map((x) => x.id));
  const c = dutyStudents(sts, d2);
  assert.equal(c.length, DUTY_PER_DAY);
  assert.notDeepEqual(a.map((x) => x.id), c.map((x) => x.id));

  const ordered = sts.slice().sort((x, y) => x.seq - y.seq);
  const idx = schoolDayIndex(d1);
  const start = (idx * DUTY_PER_DAY) % ordered.length;
  assert.deepEqual(a.map((x) => x.id), [0, 1, 2, 3].map((i) => ordered[(start + i) % ordered.length].id));
  assert.deepEqual(dutyStudents(sts, "2017-09-03"), []);
  const again = createGame(SEED);
  assert.deepEqual(dutyStudents(playerStudents(again), d1).map((x) => x.id), a.map((x) => x.id));
});

test("非班会时段不能旁听，班会时段可旁听一次并写入纪要，不能替代班主任主持", () => {
  const s = createGame(SEED);
  assert.equal(s.date, "2017-09-01");
  assert.equal(isHomeroomMeetingSlot(s), false);
  const blocked = attendClassMeeting(s);
  assert.equal(blocked.ok, false);
  assert.ok(blocked.reason.includes("要等到班会课"));

  const hostNow = hostClassMeeting(s);
  assert.equal(hostNow.ok, false);
  assert.ok(hostNow.reason.includes(HOMEROOM_NAME));
  assert.ok(hostNow.reason.includes("主持"));

  s.date = "2017-09-05";
  s.periodId = "p7";
  const slot = currentSlot(s);
  assert.equal(slot.subject, "班会");
  assert.equal(isHomeroomMeetingSlot(s), true);

  const first = attendClassMeeting(s);
  assert.equal(first.ok, true, first.reason);
  assert.ok(first.text.includes(HOMEROOM_NAME) && first.text.includes("主持"));
  assert.ok(first.theme);
  assert.ok((s.classMeetings || []).length === 1);
  assert.equal(s.classMeetings[0].minutes, first.text);
  assert.ok(s.log.some((l) => l.text === first.text));
  assert.ok(!first.text.includes("教育考试院") && !first.text.includes("投档"));

  const second = attendClassMeeting(s);
  assert.equal(second.ok, false);
  assert.ok(second.reason.includes("已经旁听") || second.reason.includes("不必再点"));

  const assist = attendClassMeeting(s, { assist: true });
  assert.equal(assist.ok, false);

  const hostBusy = hostClassMeeting(s);
  assert.equal(hostBusy.ok, false);
  assert.ok(hostBusy.reason.includes("不能") && hostBusy.reason.includes(HOMEROOM_NAME));

  const t = createGame(SEED);
  prepareLesson(t, { topic: "集合与逻辑用语", depth: 2, homework: "中" });
  teach(t, "精讲例题");
  t.date = "2017-09-05";
  t.periodId = "p7";
  const withHw = attendClassMeeting(t, { assist: true });
  assert.equal(withHw.ok, true, withHw.reason);
  assert.ok(withHw.text.includes("协助") && withHw.text.includes("主持"));
  const brief = classBrief(t, playerStudents(t));
  assert.ok(brief.text);
});
