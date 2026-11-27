/**
 * 展示用班排 / 同层次排 / 校排。只补展示，不改排名计算口径。
 * 校排、同层次排在分科后按该科类池，与 runExam 已有口径一致。
 */
import { rankRows } from "./scores.js?v=t65u1";

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

function rankOf(pool, studentId) {
  const ranked = rankRows(pool || []);
  const hit = ranked.find((r) => r.studentId === studentId);
  return { rank: hit?.rank ?? null, n: ranked.length };
}

/** 为展示行补齐 classRank / tierRank / schoolRank（及对应人数）。 */
export function decorateDisplayRanks(rows, allRows, { split, includeRepeat } = {}) {
  const source = allRows || rows || [];
  return (rows || []).map((r) => {
    const school = rankOf(schoolPool(source, r, { split, includeRepeat }), r.studentId);
    const classR = rankOf(classPool(source, r, { includeRepeat }), r.studentId);
    const tierR = rankOf(tierPool(source, r, { split, includeRepeat }), r.studentId);
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
