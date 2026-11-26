import test from "node:test";
import assert from "node:assert/strict";
import { createGame, playerStudents, talkTo, prepareLesson, teach, consultHomeroom } from "../js/domain/simulation.js";
import { columnsForClass, seatOf } from "../js/domain/school.js";
import { toJSON, fromJSON } from "../js/domain/save.js";
import {
  deskMateOf, deskPairCol, ensureCohortPeers, ensureStatePeers,
  deskChatPairs, missingDeskPairs, classPeersOf, peerStatusLine,
} from "../js/domain/peers.js";

function friendMap(state) {
  const out = {};
  for (const c of Object.values(state.cohorts || {})) {
    for (const s of c.students || []) {
      out[s.id] = {
        classNo: s.classNo,
        friendIds: [...(s.peers?.friendIds || [])].sort(),
        tenseId: s.peers?.tenseId || null,
      };
    }
  }
  return out;
}

function abilityMap(state) {
  const out = {};
  for (const c of Object.values(state.cohorts || {})) {
    for (const s of c.students || []) out[s.id] = { ...s.ability };
  }
  return out;
}

test("默认种子下同伴关系互相指向、同班，同桌按座位成对，且不改学科能力", () => {
  const a = createGame(20170901);
  const b = createGame(20170901);
  assert.deepEqual(friendMap(a), friendMap(b));

  const beforeAbility = abilityMap(a);
  const cls = playerStudents(a);
  assert.ok(cls.length >= 70);
  const cols = columnsForClass(a.player.classNo, cls.length);
  assert.equal(cols, 7);

  let withFriends = 0;
  for (const s of cls) {
    const ids = s.peers?.friendIds || [];
    assert.ok(ids.length <= 2);
    if (ids.length) withFriends += 1;
    for (const id of ids) {
      const other = cls.find((x) => x.id === id);
      assert.ok(other, `${s.name}的要好同学应在本班`);
      assert.ok((other.peers?.friendIds || []).includes(s.id), "要好应互相指向");
    }
    if (s.peers?.tenseId) {
      const t = cls.find((x) => x.id === s.peers.tenseId);
      assert.ok(t);
      assert.equal(t.peers?.tenseId, s.id);
      assert.ok(!(s.peers.friendIds || []).includes(t.id));
    }
    const seat = seatOf(s, cls.length);
    const mate = deskMateOf(s, cls);
    const mc = deskPairCol(seat.col, cols);
    if (!mc) assert.equal(mate, null);
    else {
      assert.ok(mate);
      const ms = seatOf(mate, cls.length);
      assert.equal(ms.row, seat.row);
      assert.equal(ms.col, mc);
      assert.equal(deskMateOf(mate, cls)?.id, s.id);
    }
    const line = peerStatusLine(s, cls);
    assert.ok(line.includes("同桌") || line.includes("没有同桌"));
  }
  assert.ok(withFriends >= cls.length * 0.7, "大多数人应有要好的同学");
  const tensePairs = new Set();
  for (const s of cls) {
    if (s.peers?.tenseId) tensePairs.add([s.id, s.peers.tenseId].sort().join("|"));
  }
  assert.ok(tensePairs.size >= 1 && tensePairs.size <= 6);

  ensureStatePeers(a);
  assert.deepEqual(abilityMap(a), beforeAbility);
  assert.deepEqual(friendMap(a), friendMap(b));
});

test("分班后只保留仍在同班的要好同学，并按新班补缺", () => {
  const s = createGame(20170901);
  const cls = playerStudents(s);
  const one = cls.find((x) => (x.peers?.friendIds || []).length);
  assert.ok(one);
  const fid = one.peers.friendIds[0];
  const other = s.cohorts[s.player.cohortYear].students.find((x) => x.id === fid);
  assert.ok(other);
  other.classNo = 20;
  ensureCohortPeers(s.cohorts[s.player.cohortYear], s.seed, "peers");
  const again = s.cohorts[s.player.cohortYear].students.find((x) => x.id === one.id);
  assert.ok(!(again.peers.friendIds || []).includes(fid));
  for (const id of again.peers.friendIds || []) {
    const pal = s.cohorts[s.player.cohortYear].students.find((x) => x.id === id);
    assert.equal(pal.classNo, again.classNo);
  }
});

test("旧存档读入时会补全同伴关系，结果与同一种子开局一致", () => {
  const s = createGame(20170901);
  const raw = JSON.parse(toJSON(s));
  for (const c of Object.values(raw.state.cohorts)) {
    for (const stu of c.students) delete stu.peers;
  }
  const loaded = fromJSON(raw);
  assert.deepEqual(friendMap(loaded), friendMap(s));
});

test("谈心会问起同桌或要好的同学，上课纪要可记下同桌交头接耳", () => {
  const s = createGame(20170901);
  const cls = playerStudents(s);
  const withDesk = cls.find((x) => deskMateOf(x, cls));
  assert.ok(withDesk);
  const talk = talkTo(s, withDesk.id, "谈心");
  assert.ok(talk.ok);
  const mate = deskMateOf(withDesk, cls);
  assert.ok(talk.text.includes("同桌") || talk.text.includes(mate.name));

  const t = createGame(20170901);
  prepareLesson(t, { topic: "集合与逻辑用语", depth: 2, homework: "中" });
  const lesson = teach(t, "精讲例题");
  assert.ok(lesson.ok);
  const notes = (lesson.record?.notes || []).join("\n");
  let sawChat = notes.includes("交头接耳");
  if (!sawChat) {
    let found = null;
    const people = playerStudents(t);
    for (let i = 0; i < 80; i++) {
      const pairs = deskChatPairs(people, `probe-${i}`);
      if (pairs.length) { found = pairs; break; }
    }
    assert.ok(found, "同桌交头接耳应能在部分课上出现");
  }

  const row = t.homework?.rows || [];
  const miss = row.filter((r) => r.status === "缺交");
  const desks = missingDeskPairs(miss, playerStudents(t));
  if (desks.length) {
    assert.ok(notes.includes("都没交") || notes.includes("同桌的"));
  }

  const brief = consultHomeroom(t, withDesk.id);
  assert.ok(brief.ok);
  assert.ok(brief.text.includes("同桌"));
});

test("同伴关系不改变卓行班数学能力均值（只补关系，不改能力）", () => {
  const s = createGame(20170901);
  const cls = playerStudents(s);
  const mean = cls.reduce((n, x) => n + (x.ability.math || 0), 0) / cls.length;
  const snapshot = cls.map((x) => x.ability.math);
  ensureStatePeers(s);
  const again = playerStudents(s);
  assert.deepEqual(again.map((x) => x.ability.math), snapshot);
  const mean2 = again.reduce((n, x) => n + (x.ability.math || 0), 0) / again.length;
  assert.equal(mean2, mean);
});
