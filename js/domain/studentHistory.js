/** 从各次真实考试成绩汇总一名学生的分数与排名轨迹。不另造统计。 */
import { TIER } from "./config.js?v=t66u2";
import { listExamReports } from "./simulation.js?v=t66u2";
import { subjectsFor, usesComprehensive, comprehensiveMeta, comprehensiveScore } from "./scores.js?v=t66u2";

export const TIER_ORDER = ["yunxiu_exp", "yunxiu_key", "lingxiao", "zhuoxing", "duxue", "yiti", "fuzhuo"];

export function tierName(id) {
  return TIER[id]?.name || (id === "fuzhuo" ? "补习班" : id || "—");
}

export const tierLabel = tierName;

/** 比当前层次更强的「次强」和「顶尖」层次。 */
export function strongerTiers(tierId) {
  const ids = TIER_ORDER.filter((t) => t !== "fuzhuo" && t !== "yiti");
  const i = ids.indexOf(tierId);
  if (i < 0) return { next: ids[ids.length - 2] || null, top: ids[0] };
  return { next: i > 0 ? ids[i - 1] : null, top: ids[0] };
}

/**
 * 竞赛名次。若 studentId 不在池中，按 score 插入后再排名。
 * @returns {{ rank: number, n: number, inserted?: boolean }}
 */
export function rankInPool(score, rows, studentId, key = "total") {
  const list = (rows || []).map((r) => ({ ...r }));
  const has = studentId != null && list.some((r) => r.studentId === studentId);
  if (studentId != null && !has) list.push({ studentId, [key]: score });
  list.sort((a, b) => (b[key] ?? -1) - (a[key] ?? -1) || String(a.studentId).localeCompare(String(b.studentId)));
  let rank = 1;
  for (let i = 0; i < list.length; i++) {
    if (i > 0 && (list[i][key] ?? -1) < (list[i - 1][key] ?? -1)) rank = i + 1;
    if (studentId != null ? list[i].studentId === studentId : list[i][key] === score) {
      return { rank, n: list.length };
    }
  }
  return { rank: list.length, n: list.length, inserted: !has };
}

export function findStudentInState(state, id) {
  if (!state || id == null) return null;
  for (const c of Object.values(state.cohorts || {})) {
    const s = (c.students || []).find((x) => x.id === id);
    if (s) return s;
  }
  const alum = (state.alumni || []).find((x) => x.id === id);
  return alum || null;
}

function poolRows(report, { tier, track, classNo } = {}) {
  return (report.rows || []).filter((r) => {
    if (r.repeat) return false;
    if (tier && r.tier !== tier) return false;
    if (classNo != null && r.classNo !== classNo) return false;
    if (report.split && track && r.track !== track) return false;
    return true;
  });
}

const POOL_CACHE = new WeakMap();
const RANK_CACHE = new WeakMap();

function cachedPool(report, filt) {
  let by = POOL_CACHE.get(report);
  if (!by) {
    by = new Map();
    POOL_CACHE.set(report, by);
  }
  const k = `${filt.tier || ""}|${report.split && filt.track ? filt.track : ""}|${filt.classNo ?? ""}`;
  if (!by.has(k)) by.set(k, poolRows(report, filt));
  return by.get(k);
}

function buildRankIndex(rows, key) {
  const sorted = (rows || []).slice().sort((a, b) => (b[key] ?? -1) - (a[key] ?? -1) || String(a.studentId).localeCompare(String(b.studentId)));
  const map = new Map();
  let rank = 1;
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && (sorted[i][key] ?? -1) < (sorted[i - 1][key] ?? -1)) rank = i + 1;
    map.set(sorted[i].studentId, { rank, n: sorted.length, inserted: false });
  }
  return { map, sorted, n: sorted.length, key };
}

function cachedIndex(report, rows, key) {
  let byRows = RANK_CACHE.get(report);
  if (!byRows) {
    byRows = new WeakMap();
    RANK_CACHE.set(report, byRows);
  }
  let byKey = byRows.get(rows);
  if (!byKey) {
    byKey = new Map();
    byRows.set(rows, byKey);
  }
  if (!byKey.has(key)) byKey.set(key, buildRankIndex(rows, key));
  return byKey.get(key);
}

function insertRank(index, score, _studentId) {
  const sc = score ?? -1;
  const key = index.key;
  const sorted = index.sorted;
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const ms = sorted[mid][key] ?? -1;
    if (ms > sc) lo = mid + 1;
    else hi = mid;
  }
  return { rank: lo + 1, n: sorted.length + 1, inserted: true };
}

function packRank(score, rows, studentId, key, report) {
  if (report && rows) {
    const index = cachedIndex(report, rows, key);
    const hit = studentId != null ? index.map.get(studentId) : null;
    if (hit) return { rank: hit.rank, n: hit.n, inserted: false };
    if (studentId != null) {
      const ins = insertRank(index, score, studentId);
      // rankInPool 在插入后命中循环时不带 inserted，保持同样的标志以免快照字段分叉。
      return { rank: ins.rank, n: ins.n, inserted: false };
    }
  }
  const r = rankInPool(score, rows, studentId, key);
  return { rank: r.rank, n: r.n, inserted: !!r.inserted };
}

/** 单场快照：总分、单科和各类排名都由该次 rows 现算。 */
export function buildStudentExamSnapshot(studentId, report) {
  if (!report) return null;
  const all = report.rows || [];
  const me = all.find((r) => r.studentId === studentId);
  if (!me) return null;
  const classRows = cachedPool(report, { classNo: me.classNo });
  const tierRows = cachedPool(report, { tier: me.tier, track: me.track });
  const schoolRows = cachedPool(report, { track: me.track });
  const gradeRows = cachedPool(report, {});
  const gradeR = packRank(me.total, gradeRows, studentId, "total", report);
  const classR = packRank(me.total, classRows, studentId, "total", report);
  const tierR = packRank(me.total, tierRows, studentId, "total", report);
  const schoolR = packRank(me.total, schoolRows, studentId, "total", report);
  const { next, top } = strongerTiers(me.tier);
  const cross = {};
  for (const tid of TIER_ORDER) {
    const rows = cachedPool(report, { tier: tid, track: me.track });
    const packed = { tier: tid, name: tierName(tid), ...packRank(me.total, rows, studentId, "total", report) };
    cross[tid] = packed;
    if (tid === next) cross.next = packed;
    if (tid === top && top !== me.tier) cross.top = packed;
  }
  if (next && !cross.next) {
    const rows = cachedPool(report, { tier: next, track: me.track });
    cross.next = { tier: next, name: tierName(next), ...packRank(me.total, rows, studentId, "total", report) };
  }
  if (top && top !== me.tier && !cross.top) {
    const rows = cachedPool(report, { tier: top, track: me.track });
    cross.top = { tier: top, name: tierName(top), ...packRank(me.total, rows, studentId, "total", report) };
  }
  const subjects = {};
  for (const sid of me.subjects || []) {
    if (me[sid] == null) continue;
    const c = packRank(me[sid], classRows, studentId, sid, report);
    const t = packRank(me[sid], tierRows, studentId, sid, report);
    const sch = packRank(me[sid], schoolRows, studentId, sid, report);
    const gradeS = packRank(me[sid], gradeRows, studentId, sid, report);
    const subCross = {};
    for (const tid of TIER_ORDER) {
      const prow = cachedPool(report, { tier: tid, track: me.track });
      if (!prow.length && tid !== me.tier) continue;
      subCross[tid] = { tier: tid, name: tierName(tid), ...packRank(me[sid], prow, studentId, sid, report) };
    }
    const list = subjectsFor(report.scale, report.split ? (me.track === "wen" ? "wen" : "li") : "mixed");
    const max = list.find((s) => s.id === sid)?.max || 100;
    subjects[sid] = {
      score: me[sid],
      max,
      classRank: c.rank,
      tierRank: t.rank,
      schoolRank: sch.rank,
      class: c,
      tier: t,
      school: sch,
      grade: gradeS,
      cross: subCross,
    };
  }
  const maxTotal = me.maxTotal || (report.scale === "g1-950" ? 950 : 750);
  let subjectIds = (me.subjects || []).filter((id) => subjects[id]);
  if (usesComprehensive(report.scale || report.grade) && me.track && me.track !== "mixed") {
    const meta = comprehensiveMeta(me.track === "wen" ? "wen" : "li");
    const score = comprehensiveScore(me, me.track === "wen" ? "wen" : "li");
    if (score != null) {
      const partIds = meta.parts.map((p) => p.id);
      const packCompRank = (keyRows) => packRank(score, keyRows.map((r) => ({
        ...r,
        [meta.id]: comprehensiveScore(r, me.track === "wen" ? "wen" : "li"),
      })), studentId, meta.id, report);
      const c = packCompRank(classRows);
      const ti = packCompRank(tierRows);
      const sch = packCompRank(schoolRows);
      const gradeS = packCompRank(gradeRows);
      const subCross = {};
      for (const tid of TIER_ORDER) {
        const prow = cachedPool(report, { tier: tid, track: me.track });
        if (!prow.length && tid !== me.tier) continue;
        subCross[tid] = { tier: tid, name: tierName(tid), ...packCompRank(prow) };
      }
      subjects[meta.id] = {
        score,
        max: meta.max,
        classRank: c.rank,
        tierRank: ti.rank,
        schoolRank: sch.rank,
        class: c,
        tier: ti,
        school: sch,
        grade: gradeS,
        cross: subCross,
        parts: Object.fromEntries(partIds.filter((id) => me[id] != null).map((id) => [id, me[id]])),
      };
      const core = ["chinese", "math", "english"].filter((id) => subjects[id]);
      subjectIds = [...core, meta.id];
    }
  }
  return {
    date: report.date,
    examId: report.examId,
    examName: report.examName,
    examKind: report.examKind,
    grade: report.grade,
    difficulty: report.difficulty,
    scale: report.scale,
    split: !!report.split,
    maxTotal,
    total: me.total,
    pct: maxTotal ? me.total / maxTotal : 0,
    scaled750: maxTotal ? Math.round((me.total / maxTotal) * 750) : me.total,
    line: me.line,
    classNo: me.classNo,
    tier: me.tier,
    track: me.track,
    classRank: classR.rank,
    classN: classR.n,
    tierRank: tierR.rank,
    tierN: tierR.n,
    schoolRank: schoolR.rank,
    schoolN: schoolR.n,
    gradeRank: gradeR.rank,
    gradeN: gradeR.n,
    class: classR,
    sameTier: tierR,
    school: schoolR,
    cross,
    subjects,
    subjectIds,
    cheat: me.cheat || null,
    scoreStatus: me.scoreStatus || "",
    rawTotal: me.rawTotal ?? me.cheat?.rawTotal,
    discipline: me.discipline || me.cheat?.discipline || "",
    absentSubjects: me.absentSubjects || [],
  };
}

/**
 * @param {object[]|object} reportsOrState listExamReports 的结果，或整个游戏状态
 * @param {string} studentId
 */
export function studentExamHistory(reportsOrState, studentId) {
  let reports;
  if (Array.isArray(reportsOrState)) reports = reportsOrState;
  else {
    const stu = findStudentInState(reportsOrState, studentId);
    reports = listExamReports(reportsOrState, stu?.entryYear != null ? { entryYear: stu.entryYear } : {});
  }
  const ordered = (reports || []).slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return ordered.map((rep) => buildStudentExamSnapshot(studentId, rep)).filter(Boolean);
}
