/** 组织一次考试：出分、文理分列排名、分数线、层次筛选、单科第一。 */
import { CUTOFF_FIRST_RANK, CUTOFF_SECOND_RANK } from "./config.js?v=t66u2";
import {
  attachStudentMeta, cutoffRanks, cutoffsFromRanked, gradeStudent, rankRows,
  scaleOf, subjectRanks, summarizeClass, subjectsFor, applyTrackTotalCompression,
} from "./scores.js?v=t66u2";
import { provincialLines } from "./jiangxi.js?v=t66u2";
import { attachJointExam, JOINT_SOURCE_NOTE } from "./jointExam.js?v=t66u2";
import { fallbackSchoolQuota, classProvincialCounts, provincialCompareYear } from "./schoolLines.js?v=t66u2";
import { decorateDisplayRanks, reportRankOpts } from "./displayRanks.js?v=t66u2";
import {
  examUsesNewGaokaoSubjects, ensureStudentElectives, applyReelectiveAssign,
  ASSIGN_NOTE, classTrackLabel,
} from "./newGaokao.js?v=t66u2";
import {
  cheatAttempt, investigateCheat, applyBoostToRow, restoreCheatedRow,
  composeDisciplineNotice, resumeDisciplineLine, isSchoolExamKind,
} from "./cheating.js?v=t66u2";

export function studentTrackForExam(student, split) {
  if (!split || student.track === "mixed" || !student.track) return "mixed";
  return student.track === "wen" ? "wen" : "li";
}

export function runExam(cohort, exam, { grade, split, teachingBonusFor = () => 0, schoolQuota = null, seed = 1 } = {}) {
  const scale = scaleOf(grade, exam.examKind);
  const reallySplitHint = split != null ? !!split : !!cohort.trackSplit;
  const newScheme = examUsesNewGaokaoSubjects(cohort, exam, { grade, split: reallySplitHint });
  const scheme = newScheme ? "new-3+1+2" : "wenli-batches";
  const rows = [];
  for (const s of cohort.students) {
    if (newScheme) ensureStudentElectives(s, seed);
    const bonus = teachingBonusFor(s);
    const sc = gradeStudent(s, { ...exam, grade, scheme }, scale, bonus);
    rows.push(attachStudentMeta(sc, s));
  }
  let assignNote = null;
  if (newScheme && scale !== "g1-950") {
    const assigned = applyReelectiveAssign(rows, { exam, seed });
    if (assigned.changed) {
      assignNote = ASSIGN_NOTE;
      const byId = new Map((cohort.students || []).map((s) => [s.id, s]));
      for (const row of rows) {
        const s = byId.get(row.studentId);
        row.total = applyTrackTotalCompression(row.total, s || row, { ...exam, grade }, scale, row.track);
      }
    }
  }
  const regular = rows.filter((r) => !r.repeat);
  const repeaters = rows.filter((r) => r.repeat);
  // 高三（含高考校内对照）把补习班算进同一个校内名次池；高一高二不把补习班划进本年级。
  // 只有高三按该池约第 520、第 1100 名取分；高一高二按 520/1696、1100/1696 折算到应届池。
  const reallySplit = !!split;
  const includeRepeat = Number(grade) >= 3;
  const pool = includeRepeat ? rows : regular;
  const quota = schoolQuota?.li ? schoolQuota : fallbackSchoolQuota();
  const salt = [exam.date, exam.id, exam.examKind, grade].filter(Boolean).join("|");

  const byTrack = { mixed: pool, li: pool.filter((r) => r.track === "li"), wen: pool.filter((r) => r.track === "wen") };
  const cut = { split: reallySplit, quota, includeRepeat };
  if (!reallySplit) {
    const ranked = rankRows(pool);
    const n = pool.length;
    const { firstN, secondN } = cutoffRanks(n, false, n, { track: "mixed", salt, senior: includeRepeat, includeRepeat });
    cut.mixed = { ...cutoffsFromRanked(ranked, firstN, secondN), track: "mixed", firstN, secondN, count: n };
    applyLineFlags(ranked, cut.mixed);
    cut.ranked = { mixed: ranked };
  } else {
    cut.ranked = {};
    const totalN = pool.length;
    for (const track of ["li", "wen"]) {
      const list = byTrack[track];
      const ranked = rankRows(list);
      const { firstN, secondN } = cutoffRanks(totalN, true, list.length, { track, salt, senior: includeRepeat, includeRepeat });
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
      const subs = subjectsFor(scale, r.track === "wen" ? "wen" : "li", { scheme, electives: r.electives });
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
  const subjects = subjectsFor(scale, "li", { scheme }).concat(reallySplit ? [] : []);
  const subjectIds = [...new Set(rows.flatMap((r) => r.subjects || []))];
  const toppers = subjectToppers(rows, subjectIds, reallySplit);
  if (assignNote) sourceNote = sourceNote ? `${sourceNote} ${assignNote}` : assignNote;

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
    scheme,
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
    assignNote,
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

/** 本班应届按当次总分重排（同分并列规则与全校 rankRows 一致），并补齐班排/同层次排/校排展示。 */
export function classStandings(rows, classNo, report) {
  const list = (rows || []).filter((r) => r.classNo === classNo && !r.repeat);
  const opts = report ? reportRankOpts(report) : {
    split: list.some((r) => r.track === "wen" || r.track === "li"),
    includeRepeat: false,
  };
  const decorated = decorateDisplayRanks(list, rows, opts);
  return decorated
    .slice()
    .sort((a, b) => (a.classRank ?? 9e9) - (b.classRank ?? 9e9) || String(a.studentId).localeCompare(String(b.studentId)))
    .map((r) => {
      const school = typeof r.rank === "number" ? r.rank : r.schoolRank;
      return { ...r, rank: r.classRank, gradeRank: school };
    });
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
  const allowRepeat = includeRepeat !== false || tier === "fuzhuo" || report?.grade >= 3;
  return filterClasses(report?.classes || [], { tier, track, repeat: allowRepeat ? undefined : false }).map((c) => {
    const prov = classProvincialCounts(report, c.classNo);
    return { ...c, provYear: year, provFirst: prov.firstN, provSecond: prov.secondN };
  });
}

/** 同日高三场次（补习班在这一场）。用于教务处把复读班列入当前榜单。 */
export function sameDaySeniorReport(reports, live) {
  const list = reports || [];
  if (!live) return null;
  const hasRepeat = (e) => (e?.rows || []).some((r) => r.repeat) || (e?.classes || []).some((c) => c.repeat || c.tier === "fuzhuo");
  if (Number(live.grade) >= 3 && hasRepeat(live)) return null;
  const sameId = list.find((e) => e !== live && e.date === live.date && e.examId === live.examId && Number(e.grade) >= 3 && hasRepeat(e));
  if (sameId) return sameId;
  return list.find((e) => e !== live && e.date === live.date && Number(e.grade) >= 3 && hasRepeat(e)) || null;
}

function repeaterOnly(report) {
  if (!report) return { rows: [], classes: [] };
  const classes = (report.classes || []).filter((c) => c.repeat || c.tier === "fuzhuo");
  const classNos = new Set(classes.map((c) => c.classNo));
  const rows = (report.rows || []).filter((r) => r.repeat || r.tier === "fuzhuo" || classNos.has(r.classNo));
  return { rows, classes };
}

/** 当前场次应届（及本场已有复读）加上同日高三补习班，供教务处榜单使用。 */
export function officeBoard(report, reports, { tier, track } = {}) {
  const senior = sameDaySeniorReport(reports, report);
  const extra = senior ? repeaterOnly(senior) : { rows: [], classes: [] };
  const merged = {
    ...report,
    rows: [...(report?.rows || []), ...extra.rows],
    classes: [...(report?.classes || []), ...extra.classes],
  };
  const wantTier = tier && tier !== "all" ? tier : null;
  const wantTrack = track && track !== "all" && track !== "mixed" ? track : null;
  const rows = rankRows(filterRows(merged.rows, { tier: wantTier, track: wantTrack }));
  const classTable = classCompareRows(merged, { tier: wantTier || "all", track: wantTrack || "all", includeRepeat: true });
  return { merged, rows, classTable, senior, addedRepeat: extra.classes.length };
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


/**
 * 在行总分被更正后（例如作弊成绩取消）按原口径重算名次、校内线和班级汇总。
 * 不改变 520/1100 划线规则或官方省控。
 */
export function recomputeExamDerived(report) {
  if (!report?.rows?.length) return report;
  const rows = report.rows;
  const reallySplit = !!report.split;
  const includeRepeat = Number(report.grade) >= 3 || !!report.cutoffs?.includeRepeat;
  const pool = includeRepeat ? rows : rows.filter((r) => !r.repeat);
  const quota = report.quota || null;
  const salt = [report.date, report.examId, report.examKind, report.grade].filter(Boolean).join("|");
  const cut = { split: reallySplit, quota, includeRepeat, ranked: {} };
  if (!reallySplit) {
    const ranked = rankRows(pool);
    const n = pool.length;
    const { firstN, secondN } = cutoffRanks(n, false, n, { track: "mixed", salt, senior: includeRepeat, includeRepeat });
    cut.mixed = { ...cutoffsFromRanked(ranked, firstN, secondN), track: "mixed", firstN, secondN, count: n };
    applyLineFlags(ranked, cut.mixed);
    cut.ranked = { mixed: ranked };
  } else {
    const totalN = pool.length;
    for (const track of ["li", "wen"]) {
      const list = pool.filter((r) => r.track === track);
      const ranked = rankRows(list);
      const { firstN, secondN } = cutoffRanks(totalN, true, list.length, { track, salt, senior: includeRepeat, includeRepeat });
      const c = { ...cutoffsFromRanked(ranked, firstN, secondN), track, firstN, secondN, count: list.length };
      applyLineFlags(ranked, c);
      cut[track] = c;
      cut.ranked[track] = ranked;
    }
  }
  const schoolRank = new Map();
  for (const list of Object.values(cut.ranked || {})) {
    for (const row of list) schoolRank.set(row.studentId, row.rank);
  }
  for (const r of rows) {
    if (schoolRank.has(r.studentId)) r.rank = schoolRank.get(r.studentId);
  }
  for (const r of rows) {
    if (r.cheat?.voided || r.cheat?.status === "voided") r.scoreStatus = "voided-cheat";
    const c = reallySplit ? (r.track === "wen" ? cut.wen : cut.li) : cut.mixed;
    r.line = c && r.total >= c.firstLine ? "一本" : c && r.total >= c.secondLine ? "二本" : "未达二本";
  }
  report.cutoffs = cut;
  report.scoreMap = Object.fromEntries(rows.map((r) => [r.studentId, r]));
  const classesMeta = report.classes || [];
  const fakeCohort = {
    classes: classesMeta.length
      ? classesMeta
      : [...new Set(rows.map((r) => r.classNo))].map((no) => {
        const sample = rows.find((r) => r.classNo === no);
        return { no, name: `${no}班`, tier: sample?.tier, repeat: !!sample?.repeat };
      }),
    students: rows.map((r) => ({
      id: r.studentId,
      classNo: r.classNo,
      tier: r.tier,
      track: r.track,
      repeat: !!r.repeat,
    })),
  };
  report.classes = summarizeAllClasses(fakeCohort, report.scoreMap, cut, reallySplit);
  const subjectIds = report.subjectIds || [...new Set(rows.flatMap((r) => r.subjects || []))];
  report.subjectIds = subjectIds;
  report.toppers = subjectToppers(rows, subjectIds, reallySplit);
  report.repeaters = rankRows(rows.filter((r) => r.repeat));
  return report;
}


export function applyExamIntegrity(report, students, { seed = 1 } = {}) {
  if (!isSchoolExamKind(report?.examKind)) return report;
  if (report.integrityApplied) return report;
  const byId = new Map((students || []).map((s) => [s.id, s]));
  let changed = false;
  report.rows = (report.rows || []).map((row) => {
    const s = byId.get(row.studentId);
    if (!s || row.cheat) return row;
    const attempt = cheatAttempt(s, report, seed);
    if (!attempt) return row;
    changed = true;
    const boosted = applyBoostToRow(row, attempt.boost, s, report, seed);
    const verdict = investigateCheat(s, report, { ...attempt, boost: boosted.cheat?.boost ?? attempt.boost, maxTotal: row.maxTotal }, seed);
    boosted.cheat = { ...(boosted.cheat || {}), ...verdict };
    return boosted;
  });
  if (changed) recomputeExamDerived(report);
  report.integrityApplied = true;
  return report;
}

export function resolveExamIntegrity(report, { today, students, notices, force = false } = {}) {
  const outNotices = notices || [];
  if (!report?.rows) return { report, notices: outNotices, changed: false };
  const byId = new Map((students || []).map((s) => [s.id, s]));
  let changed = false;
  report.rows = report.rows.map((row) => {
    const ch = row.cheat;
    if (!ch?.cheated || !ch.substantiated || ch.voided || ch.status === "voided") return row;
    if (!force && ch.noticeDate && today && String(today) < String(ch.noticeDate)) return row;
    changed = true;
    const restored = restoreCheatedRow(row);
    const s = byId.get(row.studentId);
    const notice = composeDisciplineNotice({
      ...restored.cheat,
      name: row.name,
      classNo: row.classNo,
      studentId: row.studentId,
      examId: report.examId,
      examName: report.examName,
      examKind: report.examKind,
      examDate: report.date,
    }, report, s);
    if (!outNotices.some((n) => n.id === notice.id)) outNotices.push(notice);
    if (s) {
      s.disciplines = s.disciplines || [];
      if (!s.disciplines.some((d) => d.id === notice.id)) {
        s.disciplines.push({
          id: notice.id,
          date: notice.date,
          examDate: notice.examDate,
          examName: notice.examName,
          examKind: notice.examKind,
          discipline: notice.discipline,
          disciplineLabel: notice.disciplineLabel,
          text: resumeDisciplineLine(notice),
        });
      }
    }
    return restored;
  });
  if (changed) recomputeExamDerived(report);
  return { report, notices: outNotices, changed };
}
