/**
 * 同伴关系：同桌按当前座位现算，同班要好与轻微别扭用种子确定、互相指向。
 * 分班后只保留仍在同班的关系并补缺。不改学科能力均值，不用真实姓名。
 */
import { hash01 } from "./prng.js?v=t55u1";
import { columnsForClass, seatOf } from "./school.js?v=t55u1";

/** 从左起两两同桌：1-2、3-4、5-6；奇数列多出的末座没有同桌。 */
export function deskPairCol(col, cols) {
  const c = Number(col);
  const n = Number(cols);
  if (!c || !n) return null;
  if (c % 2 === 1) return c + 1 <= n ? c + 1 : null;
  return c - 1 >= 1 ? c - 1 : null;
}

export function deskMateOf(student, classmates = []) {
  if (!student || !classmates.length) return null;
  const size = classmates.length;
  const seat = seatOf(student, size);
  const mateCol = deskPairCol(seat.col, columnsForClass(student.classNo, size));
  if (!mateCol) return null;
  return classmates.find((s) => {
    if (!s || s.id === student.id || s.classNo !== student.classNo) return false;
    const other = seatOf(s, size);
    return other.row === seat.row && other.col === mateCol;
  }) || null;
}

function preferScore(a, b, seed, tag) {
  let score = hash01(a.id, b.id, seed, tag, "pref") * 0.4;
  if (a.gender === b.gender) score += 2;
  if (a.personality && a.personality === b.personality) score += 1;
  const sa = seatOf(a, 0);
  const sb = seatOf(b, 0);
  if (sa.row === sb.row) score += 3;
  else if (Math.abs((sa.row || 0) - (sb.row || 0)) === 1) score += 1;
  if (Math.abs((sa.col || 0) - (sb.col || 0)) <= 1) score += 1;
  const cols = columnsForClass(a.classNo, 0);
  if (sa.row === sb.row && deskPairCol(sa.col, cols) === sb.col) score += 1.5;
  return score;
}

function wantedFriendCount(student, seed, tag) {
  return hash01(student.id, seed, tag, "want") < 0.42 ? 2 : 1;
}

function assignForClass(members, seed, tag) {
  const list = (members || []).slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const byId = new Map(list.map((s) => [s.id, s]));
  const friends = new Map(list.map((s) => [s.id, []]));

  const addPair = (a, b) => {
    if (!a || !b || a === b) return;
    if (!friends.get(a).includes(b)) friends.get(a).push(b);
    if (!friends.get(b).includes(a)) friends.get(b).push(a);
  };

  for (const s of list) {
    for (const id of s.peers?.friendIds || []) {
      if (byId.has(id) && id !== s.id) addPair(s.id, id);
    }
  }

  for (const s of list) {
    const need = wantedFriendCount(s, seed, tag) - friends.get(s.id).length;
    if (need <= 0) continue;
    const candidates = list.filter((o) => o.id !== s.id && !friends.get(s.id).includes(o.id) && friends.get(o.id).length < 2);
    candidates.sort((a, b) => {
      const d = preferScore(s, b, seed, tag) - preferScore(s, a, seed, tag);
      return d || String(a.id).localeCompare(String(b.id));
    });
    for (const o of candidates.slice(0, need)) addPair(s.id, o.id);
  }

  const tense = new Map(list.map((s) => [s.id, null]));
  const takeTense = (a, b) => {
    if (!a || !b || a === b) return false;
    if (friends.get(a).includes(b)) return false;
    if (tense.get(a) || tense.get(b)) return false;
    tense.set(a, b);
    tense.set(b, a);
    return true;
  };
  for (const s of list) {
    const id = s.peers?.tenseId;
    if (id && byId.has(id)) takeTense(s.id, id);
  }
  const targetPairs = Math.max(1, Math.round(list.length / 24));
  let have = 0;
  const seen = new Set();
  for (const s of list) {
    const t = tense.get(s.id);
    if (t && !seen.has(s.id) && !seen.has(t)) {
      seen.add(s.id);
      seen.add(t);
      have += 1;
    }
  }
  if (have < targetPairs) {
    const candidates = [];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (friends.get(a.id).includes(b.id)) continue;
        const mate = deskMateOf(a, list);
        if (mate && mate.id === b.id) continue;
        candidates.push([a, b, hash01(a.id, b.id, seed, tag, "tense")]);
      }
    }
    candidates.sort((x, y) => y[2] - x[2] || String(x[0].id).localeCompare(String(y[0].id)));
    for (const [a, b] of candidates) {
      if (have >= targetPairs) break;
      if (takeTense(a.id, b.id)) have += 1;
    }
  }

  const out = new Map();
  for (const s of list) {
    out.set(s.id, {
      friendIds: friends.get(s.id).slice().sort(),
      tenseId: tense.get(s.id) || null,
    });
  }
  return out;
}

/** 为某一届各班补全或刷新同伴关系。已有且仍同班的关系会保留。 */
export function ensureCohortPeers(cohort, seed, tag = "peers") {
  if (!cohort?.students?.length) return cohort;
  const groups = new Map();
  for (const s of cohort.students) {
    if (!groups.has(s.classNo)) groups.set(s.classNo, []);
    groups.get(s.classNo).push(s);
  }
  const mapped = new Map();
  for (const [no, members] of groups) {
    const assigned = assignForClass(members, seed, `${tag}-${cohort.entryYear ?? ""}-${no}`);
    for (const s of members) mapped.set(s.id, { ...s, peers: assigned.get(s.id) || { friendIds: [], tenseId: null } });
  }
  cohort.students = cohort.students.map((s) => mapped.get(s.id) || s);
  return cohort;
}

export function ensureStatePeers(state) {
  if (!state?.cohorts) return state;
  for (const c of Object.values(state.cohorts)) ensureCohortPeers(c, state.seed, "peers");
  return state;
}

export function classPeersOf(student, classmates = []) {
  const peers = student?.peers || { friendIds: [], tenseId: null };
  const byId = new Map((classmates || []).map((s) => [s.id, s]));
  const deskMate = deskMateOf(student, classmates);
  const friends = (peers.friendIds || []).map((id) => byId.get(id)).filter(Boolean);
  const tense = peers.tenseId ? (byId.get(peers.tenseId) || null) : null;
  return { deskMate, friends, tense };
}

export function peerStatusLine(student, classmates = []) {
  if (!student) return "";
  const { deskMate, friends, tense } = classPeersOf(student, classmates);
  const bits = [];
  if (deskMate) bits.push(`同桌是${deskMate.name}`);
  else bits.push("这排边上没有同桌");
  if (friends.length) bits.push(`和${friends.map((f) => f.name).join("、")}比较要好`);
  if (tense) bits.push(`最近和${tense.name}有些别扭`);
  return bits.join("，") + "。";
}

export function areFriends(a, b) {
  if (!a || !b) return false;
  return (a.peers?.friendIds || []).includes(b.id) || (b.peers?.friendIds || []).includes(a.id);
}

/** 同桌这节交头接耳、两边都记为走神的配对（确定性，少数）。 */
export function deskChatPairs(students, examKey) {
  const pairs = [];
  const seen = new Set();
  for (const s of students || []) {
    if (seen.has(s.id)) continue;
    const mate = deskMateOf(s, students);
    if (!mate || seen.has(mate.id)) continue;
    seen.add(s.id);
    seen.add(mate.id);
    const close = areFriends(s, mate);
    const chance = close ? 0.22 : 0.10;
    if (hash01(s.id, mate.id, examKey, "desk-chat") < chance) {
      pairs.push({ a: s, b: mate, friends: close });
    }
  }
  return pairs;
}

export function missingDeskPairs(missingRows, students) {
  const miss = new Set((missingRows || []).map((r) => r.id));
  const pairs = [];
  const seen = new Set();
  for (const s of students || []) {
    if (!miss.has(s.id) || seen.has(s.id)) continue;
    const mate = deskMateOf(s, students);
    if (!mate || !miss.has(mate.id) || seen.has(mate.id)) continue;
    seen.add(s.id);
    seen.add(mate.id);
    pairs.push({ a: s, b: mate });
  }
  return pairs;
}
