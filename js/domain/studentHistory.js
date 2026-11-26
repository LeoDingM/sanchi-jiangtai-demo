/** 从各次真实考试成绩汇总一名学生的分数与排名轨迹。不另造统计。 */
import { TIER } from "./config.js?v=t44u1";
import { listExamReports } from "./simulation.js?v=t44u1";
import { subjectsFor } from "./scores.js?v=t44u1";

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

function packRank(score, rows, studentId, key) {
  const r = rankInPool(score, rows, studentId, key);
  return { rank: r.rank, n: r.n, inserted: !!r.inserted };
}

/** 单场快照：总分、单科和各类排名都由该次 rows 现算。 */
export function buildStudentExamSnapshot(studentId, report) {
  if (!report) return null;
  const all = report.rows || [];
  const me = all.find((r) => r.studentId === studentId);
  if (!me) return null;
  const classRows = poolRows(report, { classNo: me.classNo });
  const tierRows = poolRows(report, { tier: me.tier, track: me.track });
  const schoolRows = poolRows(report, { track: me.track });
  const gradeRows = poolRows(report, {});
  const gradeR = packRank(me.total, gradeRows, studentId, "total");
  const classR = packRank(me.total, classRows, studentId, "total");
  const tierR = packRank(me.total, tierRows, studentId, "total");
  const schoolR = packRank(me.total, schoolRows, studentId, "total");
  const { next, top } = strongerTiers(me.tier);
  const cross = {};
  for (const tid of TIER_ORDER) {
    const rows = poolRows(report, { tier: tid, track: me.track });
    const packed = { tier: tid, name: tierName(tid), ...packRank(me.total, rows, studentId, "total") };
    cross[tid] = packed;
    if (tid === next) cross.next = packed;
    if (tid === top && top !== me.tier) cross.top = packed;
  }
  if (next && !cross.next) {
    const rows = poolRows(report, { tier: next, track: me.track });
    cross.next = { tier: next, name: tierName(next), ...packRank(me.total, rows, studentId, "total") };
  }
  if (top && top !== me.tier && !cross.top) {
    const rows = poolRows(report, { tier: top, track: me.track });
    cross.top = { tier: top, name: tierName(top), ...packRank(me.total, rows, studentId, "total") };
  }
  const subjects = {};
  for (const sid of me.subjects || []) {
    if (me[sid] == null) continue;
    const c = packRank(me[sid], classRows, studentId, sid);
    const t = packRank(me[sid], tierRows, studentId, sid);
    const sch = packRank(me[sid], schoolRows, studentId, sid);
    const gradeS = packRank(me[sid], gradeRows, studentId, sid);
    const subCross = {};
    for (const tid of TIER_ORDER) {
      const prow = poolRows(report, { tier: tid, track: me.track });
      if (!prow.length && tid !== me.tier) continue;
      subCross[tid] = { tier: tid, name: tierName(tid), ...packRank(me[sid], prow, studentId, sid) };
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
  const subjectIds = (me.subjects || []).filter((id) => subjects[id]);
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
