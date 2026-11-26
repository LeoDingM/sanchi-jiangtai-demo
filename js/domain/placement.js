/**
 * 两次分班，不得混为一谈。
 * 第一次：高一上期末后，文理分科 + 凌霄及以下梯队晋级淘汰；0/1 不参与普通淘汰，2—4 保持顶尖梯队。
 * 第二次：高一下期末后，不再分文理、不跨梯队，只在同科类同梯队内部均衡重组。
 */
import { FIRST_PLACEMENT_TARGETS, CLASS_BLUEPRINT } from "./config.js?v=t43u1";
import { compareScoreRows } from "./scores.js?v=t43u1";
import { rngFrom, shuffle } from "./prng.js?v=t43u1";
import { reseatClasses, syncSeatsToSeq, seatFromSeq, applyRepeaterSeating } from "./school.js?v=t43u1";

export function firstPlacement(students, scoreMap, { overrides = {}, seed = 1 } = {}) {
  const movable = [];
  const lockedExp = { li: [], wen: [] };
  const lockedKeyLi = [];
  const yiti = [];
  const unknown = [];

  for (const s of students) {
    if (s.repeat) continue;
    const pref = overrides[s.id] || s.trackPref || "li";
    const track = pref === "wen" ? "wen" : "li";
    const row = { student: s, track, total: scoreMap[s.id]?.total ?? 0, math: scoreMap[s.id]?.math ?? 0, chinese: scoreMap[s.id]?.chinese ?? 0, studentId: s.id };
    const origin = s.originClassNo ?? s.classNo;
    if (s.art || s.tier === "yiti" || origin === 30) {
      yiti.push(row);
      continue;
    }
    if (origin === 0 || origin === 1) {
      lockedExp[track].push(row);
      continue;
    }
    if (origin >= 2 && origin <= 4) {
      if (track === "li") lockedKeyLi.push(row);
      else movable.push(row); // 原云岫重点选文科：进入文科凌霄前列，不进 1 班
      continue;
    }
    movable.push(row);
  }

  const assign = [];
  const note = [];

  // 0 班、1 班：仅在实验班内部按目标班额对齐文理，不从外梯队补入
  const expRows = [...lockedExp.li, ...lockedExp.wen];
  const expLiTarget = (FIRST_PLACEMENT_TARGETS.li.find((t) => t.locked === "exp") || { size: 36 }).size;
  alignTracksToCount(expRows, expLiTarget);
  lockedExp.li = expRows.filter((r) => r.track === "li");
  lockedExp.wen = expRows.filter((r) => r.track === "wen");
  lockedExp.li.sort(compareScoreRows);
  lockedExp.wen.sort(compareScoreRows);
  for (const r of lockedExp.li) assign.push({ id: r.student.id, classNo: 0, track: "li", tier: "yunxiu_exp", name: "云岫0班" });
  for (const r of lockedExp.wen) assign.push({ id: r.student.id, classNo: 1, track: "wen", tier: "yunxiu_exp", name: "云岫1班" });

  // 2—4：理科重点内部按成绩分班，保持顶尖梯队
  lockedKeyLi.sort(compareScoreRows);
  const keyTargets = FIRST_PLACEMENT_TARGETS.li.filter((t) => t.locked === "key");
  fillTiersByRankThenBalance(lockedKeyLi, keyTargets, assign, "li", seed);

  // 原 2—4 选文的学生：插入文科可流动队列的最前（凌霄文科优先）
  const wenFromKey = movable.filter((r) => (r.student.originClassNo ?? r.student.classNo) >= 2 && (r.student.originClassNo ?? r.student.classNo) <= 4 && r.track === "wen");
  const rest = movable.filter((r) => !wenFromKey.includes(r));
  const liTargets = FIRST_PLACEMENT_TARGETS.li.filter((t) => !t.locked);
  const wenTargets = FIRST_PLACEMENT_TARGETS.wen.filter((t) => !t.locked);
  // 按目标班额对齐科类人数：重点转文造成的理科空缺，从可流动队列补入理科，使应届理科合计仍为 1276。
  const keyShort = Math.max(0, keyTargets.reduce((s, t) => s + t.size, 0) - lockedKeyLi.length);
  alignTracksToCount(rest, liTargets.reduce((s, t) => s + t.size, 0) + keyShort);
  const byTrack = { li: rest.filter((r) => r.track === "li"), wen: [...wenFromKey, ...rest.filter((r) => r.track === "wen")] };
  byTrack.li.sort(compareScoreRows);
  byTrack.wen.sort(compareScoreRows);

  // 按期末实考分划入梯队，再在同一层次内蛇形分班，只保证分班当时同层各班均衡。
  // 不做交界抖动，也不把人预留到笃学去照顾三年后的高考。
  fillTiersByRankThenBalance(byTrack.li, liTargets, assign, "li", seed);
  fillTiersByRankThenBalance(byTrack.wen, wenTargets, assign, "wen", seed);

  for (const r of yiti) assign.push({ id: r.student.id, classNo: 30, track: r.track, tier: "yiti", name: "艺体30班" });

  const mapped = new Map(assign.map((a) => [a.id, a]));
  const next = students.map((s) => {
    if (s.repeat) return { ...s };
    const a = mapped.get(s.id);
    if (!a) return { ...s, track: s.trackPref };
    return {
      ...s,
      classNo: a.classNo,
      track: a.track,
      tier: a.tier,
      className: a.name,
      placement1: { from: s.classNo, to: a.classNo, track: a.track },
    };
  });
  // 只重排应届座号，避免把补习班按分排好的座次、以及 0/2/3/4 插班生冲掉。
  const regulars = next.filter((s) => !s.repeat);
  const repeaters = next.filter((s) => s.repeat);
  return { students: [...reseatClasses(regulars, { seed, tag: "place1-seats" }), ...repeaters], assignments: assign, type: "first" };
}



/** 先按成绩切梯队，再在同一层次的班级里蛇形均衡。 */
function fillTiersByRankThenBalance(ranked, targets, assign, track, seed) {
  if (!targets.length) return;
  const groups = [];
  for (const t of targets) {
    const last = groups[groups.length - 1];
    if (last && last.tier === t.tier) last.list.push(t);
    else groups.push({ tier: t.tier, list: [t] });
  }
  let i = 0;
  for (let g = 0; g < groups.length; g++) {
    const isLast = g === groups.length - 1;
    const n = groups[g].list.reduce((s, t) => s + t.size, 0);
    const take = isLast ? ranked.slice(i) : ranked.slice(i, i + n);
    i += take.length;
    snakeIntoClasses(take, groups[g].list, assign, track, seed);
  }
}

function trackLean(row) {
  const a = row.student?.ability || {};
  const li = ((a.physics || 0) + (a.chemistry || 0) + (a.math || 0)) / 3;
  const wen = ((a.politics || 0) + (a.history || 0) + (a.geography || 0)) / 3;
  return li - wen;
}

/** 把最靠近文理交界的学生调到缺额一侧，使该队列人数对上目标班额。 */
function alignTracksToCount(rows, needLi) {
  const n = Math.max(0, Math.min(needLi, rows.length));
  const liN = rows.filter((r) => r.track === "li").length;
  if (liN === n) return;
  const byId = (a, b) => String(a.studentId).localeCompare(String(b.studentId));
  if (liN > n) {
    // 多出来的理转文：先转更偏文、总分较低的，避免把高分理科生抽走。
    const move = rows.filter((r) => r.track === "li").sort((a, b) => trackLean(a) - trackLean(b) || (a.total ?? 0) - (b.total ?? 0) || byId(a, b));
    for (let i = 0; i < liN - n; i++) move[i].track = "wen";
  } else {
    // 补入理科时优先总分较低的学生，让他们落在笃学，以免把高分文科生送进凌霄/卓行抬高省控标定。
    const move = rows.filter((r) => r.track === "wen").sort((a, b) => (a.total ?? 0) - (b.total ?? 0) || trackLean(b) - trackLean(a) || byId(b, a));
    for (let i = 0; i < n - liN; i++) move[i].track = "li";
  }
}

function snakeIndex(cycle, i) {
  const row = Math.floor(i / cycle);
  return row % 2 === 0 ? i % cycle : cycle - 1 - (i % cycle);
}

/** 按目标班额蛇形分班：各班按满员比例同步填充，保证人数精确且同层均分接近；满员的班不再接收。 */
function snakeByCaps(ranked, caps) {
  const n = caps.length;
  const buckets = caps.map(() => []);
  if (!n) return buckets;
  let snakeAt = 0;
  for (const r of ranked) {
    let best = -1;
    let bestRatio = Infinity;
    const seen = new Set();
    for (let t = 0; t < n * 2 && seen.size < n; t++) {
      const k = snakeIndex(n, snakeAt + t);
      if (seen.has(k)) continue;
      seen.add(k);
      if (buckets[k].length >= caps[k]) continue;
      const ratio = caps[k] ? buckets[k].length / caps[k] : Infinity;
      if (ratio < bestRatio - 1e-12) {
        bestRatio = ratio;
        best = k;
      }
    }
    if (best < 0) {
      const k = buckets.findIndex((b, i) => b.length < caps[i]);
      if (k >= 0) buckets[k].push(r);
      else buckets[n - 1].push(r);
    } else {
      buckets[best].push(r);
    }
    snakeAt++;
  }
  return buckets;
}

function snakeIntoClasses(ranked, classTargets, assign, track, seed) {
  if (!classTargets.length) return;
  const buckets = snakeByCaps(ranked, classTargets.map((t) => t.size));
  buckets.forEach((seats, idx) => {
    const t = classTargets[idx];
    const ordered = shuffle(rngFrom(seed, "place-seats", track, t.no), seats);
    for (const r of ordered) {
      assign.push({ id: r.student.id, classNo: t.no, track, tier: t.tier, name: t.name });
    }
  });
}


/** 第二次分班：同科类同梯队内按成绩蛇形均衡，0/1 不动，2—4 只在重点班内部均衡。 */
export function secondPlacement(students, scoreMap, { seed = 1 } = {}) {
  const groups = new Map();
  const kept = [];
  for (const s of students) {
    if (s.repeat || s.tier === "yiti" || s.classNo === 0 || s.classNo === 1) {
      kept.push({ ...s, placement2: s.placement2 || { unchanged: true } });
      continue;
    }
    const key = `${s.track}|${s.tier}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }
  const next = [...kept];
  for (const [key, list] of groups) {
    const classNos = [...new Set(list.map((s) => s.classNo))].sort((a, b) => a - b);
    const ranked = list.slice().sort((a, b) => compareScoreRows(
      { total: scoreMap[a.id]?.total ?? 0, math: scoreMap[a.id]?.math ?? 0, chinese: scoreMap[a.id]?.chinese ?? 0, studentId: a.id },
      { total: scoreMap[b.id]?.total ?? 0, math: scoreMap[b.id]?.math ?? 0, chinese: scoreMap[b.id]?.chinese ?? 0, studentId: b.id },
    ));
    // 蛇形分到原有班级编号，不跨梯队，并保持第一次分班后的各班班额。
    const caps = classNos.map((no) => list.filter((s) => s.classNo === no).length);
    const rawBuckets = snakeByCaps(ranked, caps);
    const buckets = Object.fromEntries(classNos.map((no, i) => [no, rawBuckets[i]]));
    for (const no of classNos) {
      const rng = rngFrom(seed, "place2", key, no);
      const seats = shuffle(rng, buckets[no]);
      seats.forEach((s, idx) => {
        const seq = idx + 1;
        next.push({
          ...s,
          classNo: no,
          seq,
          seat: seatFromSeq(no, seq, seats.length),
          placement2: { from: s.classNo, to: no, track: s.track, tier: s.tier },
        });
      });
    }
  }
  // 0/1、艺体、复读未参与重组：不打乱座次，只按已有座号同步坐标（缺座号则补编）。
  const keptIds = new Set(kept.map((s) => s.id));
  const keptNos = [...new Set(kept.map((s) => s.classNo))];
  const reshuffled = next.filter((s) => !keptIds.has(s.id));
  const syncedKept = syncSeatsToSeq(next.filter((s) => keptIds.has(s.id)), { classNos: keptNos });
  const merged = [...syncedKept, ...reshuffled];
  return { students: merged.some((s) => s.repeat) ? applyRepeaterSeating(merged) : merged, type: "second" };
}

export function rebuildClasses(students) {
  const map = new Map();
  for (const s of students) {
    if (!map.has(s.classNo)) {
      const bp = CLASS_BLUEPRINT.find((c) => c.no === s.classNo) || FIRST_PLACEMENT_TARGETS.li.find((c) => c.no === s.classNo) || FIRST_PLACEMENT_TARGETS.wen.find((c) => c.no === s.classNo);
      map.set(s.classNo, {
        no: s.classNo,
        name: bp?.name || `${s.classNo}班`,
        short: bp?.short || "",
        tier: s.tier,
        studentIds: [],
        size: 0,
        // 只把整班补习班标成复读班；0/2/3/4 有插班生时仍是原层次班。
        repeat: !!(bp?.repeat || s.classNo >= 31),
      });
    }
    const c = map.get(s.classNo);
    c.studentIds.push(s.id);
    c.size++;
  }
  return [...map.values()].sort((a, b) => a.no - b.no);
}
