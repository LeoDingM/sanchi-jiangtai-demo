import test from "node:test";
import assert from "node:assert/strict";
import { createGame, playerStudents, prepareLesson, teach, talkTo } from "../js/domain/simulation.js";
import { provincialLines } from "../js/domain/jiangxi.js";
import {
  subjectRoom, roomLabel, hasLargeRoom, formatAbilityWithRoom,
  talkMathRoomBit, lessonPotentialNote, mathRoomLine, LARGE_ROOM,
} from "../js/domain/potential.js";

function mathMeans(students) {
  return students.map((s) => s.ability.math);
}

test("默认种子下潜力描述可复现，且不改写能力", () => {
  const a = createGame(20170901);
  const b = createGame(20170901);
  const clsA = playerStudents(a);
  const clsB = playerStudents(b);
  assert.deepEqual(
    clsA.map((s) => formatAbilityWithRoom(s)),
    clsB.map((s) => formatAbilityWithRoom(s)),
  );
  const snapshot = mathMeans(clsA);
  formatAbilityWithRoom(clsA[0]);
  talkMathRoomBit(clsA[0]);
  lessonPotentialNote(clsA, "probe-key");
  mathRoomLine(clsA[0]);
  assert.deepEqual(mathMeans(playerStudents(a)), snapshot);
  const rooms = clsA.map((s) => subjectRoom(s, "math"));
  assert.ok(rooms.every((r) => r && r.room >= 0));
  assert.ok(rooms.some((r) => r.room >= LARGE_ROOM));
  assert.ok(rooms.some((r) => r.room < LARGE_ROOM));
  assert.match(formatAbilityWithRoom(clsA[0]), /数学 \d+/);
  assert.doesNotMatch(formatAbilityWithRoom(clsA[0]), /潜力|上升空间|接近潜力|余地/);
  assert.match(formatAbilityWithRoom(clsA[0], { revealPotential: true }), /数学 \d+（.+）/);
  assert.match(formatAbilityWithRoom(clsA[0], { revealPotential: true }), /接近潜力|上升空间|一点空间/);
  assert.match(formatAbilityWithRoom(clsA[0], { revealPotential: true }), /潜力/);
});

test("谈话只在数学余地较大时内部选人，教师可见稿不出现潜力或余地标签", () => {
  const s = createGame(20170901);
  prepareLesson(s, { topic: "集合与逻辑用语", depth: 2, homework: "中" });
  teach(s, "精讲例题");
  const cls = playerStudents(s);
  const large = cls.find((x) => hasLargeRoom(x, "math"));
  const tight = cls.find((x) => subjectRoom(x, "math").room < 6);
  assert.ok(large && tight);
  assert.equal(talkMathRoomBit(large), "");
  assert.equal(talkMathRoomBit(tight), "");
  assert.match(talkMathRoomBit(large, { revealPotential: true }), /上帝模式可见/);
  assert.match(talkMathRoomBit(large, { revealPotential: true }), /潜力/);
  assert.equal(talkMathRoomBit(tight, { revealPotential: true }), "");
  assert.equal(mathRoomLine(tight), "");
  assert.match(mathRoomLine(large, { revealPotential: true }) || "x", /上帝模式可见|x/);

  const talkL = talkTo(s, large.id, "询问学习");
  assert.ok(talkL.ok);
  assert.doesNotMatch(talkL.text, /潜力|上升空间|接近潜力|余地标签/);
  s.talksThisPeriod = 0;
  s.talksToday = 0;
  const talkT = talkTo(s, tight.id, "询问学习");
  assert.ok(talkT.ok);
  assert.doesNotMatch(talkT.text, /潜力|上升空间/);

  s.talksThisPeriod = 0;
  s.talksToday = 0;
  const encTarget = cls.find((x) => hasLargeRoom(x, "math") && x.lastClassFlag !== "表现突出") || large;
  const enc = talkTo(s, encTarget.id, "鼓励");
  assert.ok(enc.ok);
  assert.doesNotMatch(enc.text, /潜力|上升空间|接近潜力/);
});

test("课堂纪要可点出有较大数学余地的人，且同一种子同课题可复现", () => {
  function play() {
    const g = createGame(20170901);
    prepareLesson(g, { topic: "集合与逻辑用语", depth: 2, homework: "中" });
    return teach(g, "精讲例题");
  }
  const t1 = play();
  const t2 = play();
  assert.deepEqual(t1.record.notes, t2.record.notes);
  assert.ok(t1.record.notes.some((n) => /把方法再讲扎实一些/.test(n)), t1.record.notes.join("\n"));
  assert.ok(t1.record.notes.every((n) => !/潜力|上升空间|接近潜力/.test(n)), t1.record.notes.join("\n"));
});

test("潜力描述不改变卓行班数学能力均值，也不改写公开省控", () => {
  const s = createGame(20170901);
  const cls = playerStudents(s);
  const mean = cls.reduce((n, x) => n + (x.ability.math || 0), 0) / cls.length;
  const snapshot = cls.map((x) => ({ math: x.ability.math, pot: x.potential.math }));
  for (const x of cls) {
    roomLabel(subjectRoom(x, "math").room);
    hasLargeRoom(x, "math");
    formatAbilityWithRoom(x);
  }
  const again = playerStudents(s);
  assert.deepEqual(again.map((x) => ({ math: x.ability.math, pot: x.potential.math })), snapshot);
  const mean2 = again.reduce((n, x) => n + (x.ability.math || 0), 0) / again.length;
  assert.equal(mean2, mean);
  assert.equal(provincialLines(2020, "li").first, 535);
  assert.equal(provincialLines(2018, "li").first, 527);
});
