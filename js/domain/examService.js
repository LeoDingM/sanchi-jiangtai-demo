/** 组织一次考试：出分、文理分列排名、分数线、层次筛选、单科第一。 */
import { CUTOFF_FIRST_RANK, CUTOFF_SECOND_RANK } from "./config.js?v=t48u1";
import {
  attachStudentMeta, cutoffRanks, cutoffsFromRanked, gradeStudent, rankRows,
  scaleOf, subjectRanks, summarizeClass, subjectsFor,
} from "./scores.js?v=t48u1";
import { provincialLines } from "./jiangxi.js?v=t48u1";
import { attachJointExam, JOINT_SOURCE_NOTE } from "./jointExam.js?v=t48u1";
import { fallbackSchoolQuota, classProvincialCounts, provincialCompareYear } from "./schoolLines.js?v=t48u1";

export function studentTrackForExam(student, split) {
  if (!split || student.track === "mixed" || !student.track) return "mixed";
  return student.track === "wen" ? "wen" : "li";
}

export function runExam(cohort, exam, { grade, split, teachingBonusFor = () => 0, schoolQuota = null } = {}) {
  const scale = scaleOf(grade, exam.examKind);
  const rows = [];
  for (const s of cohort.students) {
    const bonus = teachingBonusFor(s);
    const sc = gradeStudent(s, { ...exam, grade }, scale, bonus);
    rows.push(attachStudentMeta(sc, s));
  }
  const regular = rows.filter((r) => !r.repeat);
  const repeaters = rows.filter((r) => r.repeat);
  // 高三（含高考校内对照）把补习班算进同一个校内名次池；高一高二本年级没有补习班，只在应届池里划线。
  // 名额仍按上一届高考本校省控实际人数（或兜底），理科二本取该池前 1000 名。
  const reallySplit = !!split;
  const includeRepeat = Number(grade) >= 3;
  const pool = includeRepeat ? rows : regular;
  const quota = schoolQuota?.li ? schoolQuota : fallbackSchoolQuota();

  const byTrack = { mixed: pool, li: pool.filter((r) => r.track === "li"), wen: pool.filter((r) => r.track === "wen") };
  const cut = { split: reallySplit, quota, includeRepeat };
  if (!reallySplit) {
    const ranked = rankRows(pool);
    const n = pool.length;
    const { firstN, secondN } = cutoffRanks(n, false, n, { track: "mixed", quotas: quota });
    cut.mixed = { ...cutoffsFromRanked(ranked, firstN, secondN), track: "mixed", firstN, secondN, count: n };
    applyLineFlags(ranked, cut.mixed);
    cut.ranked = { mixed: ranked };
  } else {
    cut.ranked = {};
    const totalN = pool.length;
    for (const track of ["li", "wen"]) {
      const list = byTrack[track];
      const ranked = rankRows(list);
      const { firstN, secondN } = cutoffRanks(totalN, true, list.length, { track, quotas: quota });
      const c = { ...cutoffsFromRanked(ranked, firstN, secondN), track, firstN, secondN, count: list.length };
      applyLineFlags(ranked, c);
      cut[track] = c;
      cut.ranked[track] = ranked;
    }
  }
  // 把上线标记写回全部行（含班级表和教务筛选所用的 rows）
  const schoolRank = new Map();
  for (const list of Object.values(cut.ranked || {})) {
    for (const row of list) schoolRank.set(row.studentId, row.rank);
  }
  for (const r of rows) {
    if (schoolRank.has(r.studentId)) r.rank = schoolRank.get(r.studentId);
  }
  for (const r of rows) {
    if (r.repeat) {
      const c = reallySplit ? (r.track === "wen" ? cut.wen : cut.li) : cut.mixed;
      r.line = c && r.total >= c.firstLine ? "一本" : c && r.total >= c.secondLine ? "二本" : "未达二本";
    } else if (!reallySplit) {
      r.line = r.total >= cut.mixed.firstLine ? "一本" : r.total >= cut.mixed.secondLine ? "二本" : "未达二本";
    } else {
      const c = r.track === "wen" ? cut.wen : cut.li;
      r.line = r.total >= c.firstLine ? "一本" : r.total >= c.secondLine ? "二本" : "未达二本";
    }
  }
  let huikao = null;
  let sourceNote = exam.sourceNote || null;
  if (exam.examKind === "huikao") {
    huikao = {
      standard: "校内：单科达到卷面满分的 60% 记为合格",
      officialLine: null,
      source: "未收录江西省教育考试院会考合格线，故不公布所谓省会考线。文理交叉科目尚未单独建模。",
    };
    sourceNote = sourceNote || exam.sourceNote || "会考为校内学业合格记载，日期为校历示意。";
    for (const r of rows) {
      const subs = subjectsFor(scale, r.track === "wen" ? "wen" : "li");
      const detail = {};
      let all = true;
      for (const sub of subs) {
        const ok = (r[sub.id] ?? 0) >= Math.round(sub.max * 0.6);
        detail[sub.id] = ok;
        if (!ok) all = false;
      }
      r.huikaoPass = all;
      r.huikaoSubjects = detail;
    }
  }
  let joint = null;
  if (exam.examKind === "city" || exam.examKind === "province") {
    joint = attachJointExam(rows, exam);
    sourceNote = JOINT_SOURCE_NOTE;
  }

  const scoreMap = Object.fromEntries(rows.map((r) => [r.studentId, r]));

  const classes = summarizeAllClasses(cohort, scoreMap, cut, reallySplit);
  const subjects = subjectsFor(scale, "li").concat(reallySplit ? [] : []);
  const subjectIds = [...new Set(rows.flatMap((r) => r.subjects || []))];
  const toppers = subjectToppers(rows, subjectIds, reallySplit);

  return {
    examId: exam.id,
    examName: exam.name,
    examKind: exam.examKind,
    date: exam.date,
    difficulty: exam.difficulty,
    dispersion: exam.dispersion,
    scale,
    grade,
    split: reallySplit,
    scoreMap,
    rows,
    cutoffs: cut,
    quota,
    huikao,
    sourceNote,
    joint,
    classes,
    subjectIds,
    toppers,
    repeaters: rankRows(repeaters),
  };
}

function applyLineFlags(ranked, c) {
  for (const r of ranked) {
    r.line = r.total >= c.firstLine ? "一本" : r.total >= c.secondLine ? "二本" : "未达二本";
    r.trackRank = r.rank;
  }
}

function lineOf(row, cut, split) {
  if (!split) return cut.mixed;
  return row.track === "wen" ? cut.wen : cut.li;
}

export function summarizeAllClasses(cohort, scoreMap, cut, split) {
  const out = [];
  for (const cls of cohort.classes) {
    const sts = cohort.students.filter((s) => s.classNo === cls.no);
    if (!sts.length) continue;
    const sample = scoreMap[sts[0].id];
    const track = split ? (sts[0].track === "wen" ? "wen" : "li") : "mixed";
    const lines = split ? cut[track] : cut.mixed;
    const sum = summarizeClass(sts, scoreMap, lines);
    out.push({
      classNo: cls.no,
      name: cls.name,
      tier: cls.tier || sts[0].tier,
      track: split ? track : "mixed",
      repeat: !!cls.repeat || (sts.length > 0 && sts.every((s) => s.repeat)),
      ...sum,
    });
  }
  out.sort((a, b) => b.avg - a.avg || a.classNo - b.classNo);
  out.forEach((c, i) => { c.classRank = i + 1; });
  return out;
}

export function subjectToppers(rows, subjectIds, split) {
  const regular = rows.filter((r) => !r.repeat);
  const scopes = { all: regular };
  if (split) {
    scopes.li = regular.filter((r) => r.track === "li");
    scopes.wen = regular.filter((r) => r.track === "wen");
  }
  const tiers = ["yunxiu_exp", "yunxiu_key", "lingxiao", "zhuoxing", "duxue", "yiti", "fuzhuo"];
  for (const t of tiers) {
    scopes[t] = t === "fuzhuo" ? rows.filter((r) => r.tier === t) : regular.filter((r) => r.tier === t);
  }
  const out = {};
  for (const [scope, list] of Object.entries(scopes)) {
    out[scope] = {};
    for (const sid of subjectIds) {
      const sr = subjectRanks(list, sid);
      out[scope][sid] = sr[0] || null;
    }
  }
  return out;
}

export function filterRows(rows, { track, tier, classNo, repeat } = {}) {
  return rows.filter((r) => {
    if (track && track !== "all" && track !== "mixed" && r.track !== track) return false;
    if (tier && tier !== "all" && r.tier !== tier) return false;
    if (classNo != null && r.classNo !== classNo) return false;
    if (repeat === false && r.repeat) return false;
    if (repeat === true && !r.repeat) return false;
    return true;
  });
}

export function sameTierCompare(report, tier) {
  const allowRepeat = tier === "fuzhuo" || report?.grade >= 3;
  const classes = filterClasses(report.classes || [], { tier, repeat: allowRepeat ? undefined : false });
  const rows = report.rows.filter((r) => r.tier === tier && (allowRepeat || !r.repeat));
  return { classes, rows: rankRows(rows) };
}

/** 本班应届按当次总分重排（同分并列规则与全校 rankRows 一致）。 */
export function classStandings(rows, classNo) {
  const list = (rows || []).filter((r) => r.classNo === classNo && !r.repeat);
  const gradeRank = new Map(list.map((r) => [r.studentId, r.rank]));
  return rankRows(list).map((r) => ({
    ...r,
    classRank: r.rank,
    gradeRank: gradeRank.has(r.studentId) ? gradeRank.get(r.studentId) : r.rank,
  }));
}

export function filterClasses(classes, { track, tier, repeat } = {}) {
  return (classes || []).filter((c) => {
    if (repeat === false && c.repeat) return false;
    if (repeat === true && !c.repeat) return false;
    if (tier && tier !== "all" && c.tier !== tier) return false;
    if (track && track !== "all" && track !== "mixed" && c.track !== track) return false;
    return true;
  });
}

export function classCompareRows(report, { tier, track, includeRepeat } = {}) {
  const year = provincialCompareYear(report?.date);
  const allowRepeat = includeRepeat || tier === "fuzhuo" || report?.grade >= 3;
  return filterClasses(report?.classes || [], { tier, track, repeat: allowRepeat ? undefined : false }).map((c) => {
    const prov = classProvincialCounts(report, c.classNo);
    return { ...c, provYear: year, provFirst: prov.firstN, provSecond: prov.secondN };
  });
}

export function examReportKey(report) {
  if (!report) return "";
  return `${report.date}|${report.examId}|${report.entryYear ?? ""}|${report.grade ?? ""}`;
}

/** 按场次键查找报告；键不完整时优先同一届，避免教务处落到其他年级的最近一场。 */
export function pickExamReport(list, pick, { preferEntryYear } = {}) {
  const reports = list || [];
  if (pick) {
    const exact = reports.find((e) => examReportKey(e) === pick);
    if (exact) return exact;
    const [date, examId, entryYear, grade] = String(pick).split("|");
    const match = reports.find((e) => {
      if (e.date !== date || e.examId !== examId) return false;
      if (entryYear && String(e.entryYear) !== String(entryYear)) return false;
      if (grade && String(e.grade) !== String(grade)) return false;
      return true;
    });
    if (match) return match;
    if (preferEntryYear != null) {
      const sameCohort = reports.find((e) => e.date === date && e.examId === examId && Number(e.entryYear) === Number(preferEntryYear));
      if (sameCohort) return sameCohort;
    }
    const byDateId = reports.find((e) => e.date === date && e.examId === examId);
    if (byDateId) return byDateId;
  }
  if (preferEntryYear != null) {
    const same = reports.find((e) => Number(e.entryYear) === Number(preferEntryYear));
    if (same) return same;
  }
  return reports[0] || null;
}

export { CUTOFF_FIRST_RANK, CUTOFF_SECOND_RANK, provincialLines };
