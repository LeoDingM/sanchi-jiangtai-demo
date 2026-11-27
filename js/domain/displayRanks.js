/**
 * 展示用班排 / 同层次排 / 校排。只补展示，不改排名计算口径。
 * 校排、同层次排在分科后按该科类池，与 runExam 已有口径一致。
 *
 * decorateDisplayRanks 按池建立一次名次索引再回填，避免对每个学生重复全表排序。
 */
import { rankRows } from "./scores.js?v=t74u2";

function schoolPool(rows, row, { split, includeRepeat } = {}) {
  return (rows || []).filter((r) => {
    if (!includeRepeat && r.repeat) return false;
    if (split && row.track && r.track && r.track !== row.track) return false;
    return true;
  });
}

function tierPool(rows, row, { split, includeRepeat } = {}) {
  return schoolPool(rows, row, { split, includeRepeat }).filter((r) => r.tier === row.tier);
}

function classPool(rows, row, { includeRepeat } = {}) {
  return (rows || []).filter((r) => {
    if (!includeRepeat && r.repeat) return false;
    if (Number(r.classNo) !== Number(row.classNo)) return false;
    return true;
  });
}

function indexPool(pool, rankRowsFn) {
  const ranked = rankRowsFn(pool || []);
  const map = new Map();
  for (const r of ranked) {
    if (!map.has(r.studentId)) map.set(r.studentId, r.rank);
  }
  return { map, n: ranked.length };
}

function rankFromIndex(index, studentId) {
  if (!index) return { rank: null, n: 0 };
  const rank = index.map.has(studentId) ? index.map.get(studentId) : null;
  return { rank, n: index.n };
}

/** 为展示行补齐 classRank / tierRank / schoolRank（及对应人数）。 */
export function decorateDisplayRanks(rows, allRows, { split, includeRepeat, rankRows: rankRowsFn } = {}) {
  const source = allRows || rows || [];
  const list = rows || [];
  const rankFn = rankRowsFn || rankRows;
  const schoolIdx = new Map();
  const tierIdx = new Map();
  const classIdx = new Map();

  const schoolKey = (row) => `${includeRepeat ? 1 : 0}|${split && row.track ? row.track : ""}`;
  const tierKey = (row) => `${schoolKey(row)}|${row.tier || ""}`;
  const classKey = (row) => `${includeRepeat ? 1 : 0}|${row.classNo}`;

  const getSchool = (row) => {
    const k = schoolKey(row);
    if (!schoolIdx.has(k)) schoolIdx.set(k, indexPool(schoolPool(source, row, { split, includeRepeat }), rankFn));
    return schoolIdx.get(k);
  };
  const getTier = (row) => {
    const k = tierKey(row);
    if (!tierIdx.has(k)) tierIdx.set(k, indexPool(tierPool(source, row, { split, includeRepeat }), rankFn));
    return tierIdx.get(k);
  };
  const getClass = (row) => {
    const k = classKey(row);
    if (!classIdx.has(k)) classIdx.set(k, indexPool(classPool(source, row, { includeRepeat }), rankFn));
    return classIdx.get(k);
  };

  return list.map((r) => {
    const school = rankFromIndex(getSchool(r), r.studentId);
    const classR = rankFromIndex(getClass(r), r.studentId);
    const tierR = rankFromIndex(getTier(r), r.studentId);
    return {
      ...r,
      classRank: classR.rank,
      classN: classR.n,
      tierRank: tierR.rank,
      tierN: tierR.n,
      schoolRank: school.rank,
      schoolN: school.n,
    };
  });
}

export function formatRankTriple(r) {
  if (!r) return "班排 —　同层次排 —　校排 —";
  const one = (label, rank, n) => (rank != null ? `${label} ${rank}${n ? "/" + n : ""}` : `${label} —`);
  return [one("班排", r.classRank, r.classN), one("同层次排", r.tierRank, r.tierN), one("校排", r.schoolRank, r.schoolN)].join("　");
}

export function reportRankOpts(report) {
  return {
    split: !!report?.split,
    includeRepeat: Number(report?.grade) >= 3 || !!report?.cutoffs?.includeRepeat,
  };
}

/** 侧栏课表是否需要随主界面一起刷新。日期、课时或日志未变时切页不必重画。 */
export function agendaStateKey(state) {
  if (!state) return "";
  const log0 = state.log?.[0];
  return [
    state.date || "",
    state.periodId || "",
    state.player?.cohortYear ?? "",
    state.player?.classNo ?? "",
    log0?.date || "",
    log0?.text || "",
    state.talksToday || 0,
    state.talksThisPeriod || 0,
  ].join("|");
}

export function shouldRefreshAgenda(prevKey, nextKey) {
  return prevKey !== nextKey;
}
