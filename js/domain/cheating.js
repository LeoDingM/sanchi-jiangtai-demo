/**
 * 校本考试中的偶发作弊、同学举报与查实后的校内处分。
 * 用确定性 PRNG 可复现；不能把单科异常优异都判成作弊。
 * 未查实不出公告、不写入履历已确认处分。高考/会考/官方联考不做校内处分文件。
 * 查实后取消该次作弊所得分数并重算名次，不改省控或校内线口径。
 */
import { hash01 } from "./prng.js?v=t71u1";
import { addDays } from "./calendar.js?v=t71u1";

/** 只对校本考试建模校内处分；高考、会考、市/省联考不伪造考试院文件。 */
export const SCHOOL_CHEAT_KINDS = new Set(["monthly", "midterm", "final", "mock1", "mock2", "mock3"]);

export const DISCIPLINE_LABELS = {
  warning: "警告",
  seriousWarning: "严重警告",
  demerit: "记过",
  majorDemerit: "记大过",
};

export function isSchoolExamKind(examKind) {
  return SCHOOL_CHEAT_KINDS.has(examKind);
}

function abilityMean(student) {
  const vals = Object.values(student?.ability || {}).map(Number).filter((n) => Number.isFinite(n));
  if (!vals.length) return 60;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export function disciplineForBoost(boost, maxTotal) {
  const scaled = (Number(boost) || 0) * (750 / Math.max(100, Number(maxTotal) || 750));
  if (scaled >= 40) return "majorDemerit";
  if (scaled >= 30) return "demerit";
  if (scaled >= 22) return "seriousWarning";
  return "warning";
}

export function formatDiscipline(id) {
  return DISCIPLINE_LABELS[id] || "警告";
}

/**
 * 是否在该场校本考试中作弊。少见；实验班与头牌更少。
 * 返回 null 表示未作弊。
 */
export function cheatAttempt(student, exam, seed = 1) {
  if (!student || !isSchoolExamKind(exam?.examKind)) return null;
  const h = hash01(seed, student.id, student.name || "", exam.id || exam.examId || "", exam.date || "", "cheat-try");
  let p = 0.0085;
  if ((student.stress ?? 40) >= 72) p += 0.005;
  if (abilityMean(student) < 56) p += 0.003;
  if ((student.stability ?? 60) < 40) p += 0.002;
  if (student.tier === "yunxiu_exp") p *= 0.28;
  else if (student.tier === "yunxiu_key") p *= 0.55;
  if (h >= p) return null;
  const spread = hash01(seed, student.id, exam.id || "", "cheat-boost");
  const maxTotal = exam.maxTotal || 750;
  const boost = Math.max(14, Math.round((16 + spread * 26) * (maxTotal / 750)));
  return { cheated: true, boost, raw: true };
}

/**
 * 作弊之后是否被同学举报、学校是否查实。
 * 不是每次作弊都会被举报，也不是每次举报都能查实。
 */
export function investigateCheat(student, exam, attempt, seed = 1) {
  if (!attempt?.cheated) return { reported: false, substantiated: false };
  const reportH = hash01(seed, student.id, exam.id || exam.examId || "", exam.date || "", "cheat-report");
  const reported = reportH < 0.48;
  if (!reported) {
    return { reported: false, substantiated: false, status: "unreported" };
  }
  const proveH = hash01(seed, student.id, exam.id || exam.examId || "", "cheat-prove");
  const substantiated = proveH < 0.58;
  if (!substantiated) {
    return { reported: true, substantiated: false, status: "unsubstantiated" };
  }
  const delay = 3 + Math.floor(hash01(seed, student.id, exam.id || "", "cheat-delay") * 5);
  const noticeDate = exam.date ? addDays(exam.date, delay) : null;
  const discipline = disciplineForBoost(attempt.boost, exam.maxTotal || attempt.maxTotal || 750);
  return {
    reported: true,
    substantiated: true,
    status: "pending",
    discipline,
    disciplineLabel: formatDiscipline(discipline),
    noticeDate,
    delayDays: delay,
  };
}

export function applyBoostToRow(row, boost, student, exam, seed) {
  const subjects = (row.subjects || []).filter((id) => typeof row[id] === "number");
  const maxTotal = row.maxTotal || subjects.reduce((s, id) => s + (row[id] || 0), 0) || 750;
  const raw = {
    total: row.total,
    subjects: Object.fromEntries(subjects.map((id) => [id, row[id]])),
  };
  const pickN = subjects.length >= 2 && hash01(seed, student.id, exam.id || "", "cheat-subs") < 0.65 ? 2 : 1;
  const ordered = subjects.slice().sort((a, b) => (
    hash01(seed, student.id, a, "cheat-sub") - hash01(seed, student.id, b, "cheat-sub")
  ));
  const chosen = ordered.slice(0, Math.max(1, pickN));
  let left = boost;
  const boosted = { ...raw.subjects };
  chosen.forEach((id, i) => {
    const remain = chosen.length - i;
    const give = i === chosen.length - 1 ? left : Math.round(left / remain);
    const capGuess = id === "chinese" || id === "math" || id === "english" ? 150
      : (id === "lizong" || id === "wenzong" ? 300 : 100);
    const next = Math.min(capGuess, (boosted[id] || 0) + give);
    const used = next - (boosted[id] || 0);
    boosted[id] = next;
    left -= used;
  });
  if (left > 0 && subjects.length) {
    const id = subjects[0];
    const capGuess = id === "chinese" || id === "math" || id === "english" ? 150 : 100;
    boosted[id] = Math.min(capGuess, (boosted[id] || 0) + left);
  }
  const total = subjects.reduce((s, id) => s + (boosted[id] ?? row[id] ?? 0), 0);
  const actualBoost = total - raw.total;
  return {
    ...row,
    ...boosted,
    total,
    cheat: {
      cheated: true,
      boost: actualBoost,
      rawTotal: raw.total,
      rawSubjects: raw.subjects,
      status: "pending",
    },
  };
}

export function restoreCheatedRow(row) {
  if (!row?.cheat?.cheated || row.cheat.rawTotal == null) return row;
  const rawSub = row.cheat.rawSubjects || {};
  const next = { ...row, total: row.cheat.rawTotal };
  for (const [id, v] of Object.entries(rawSub)) next[id] = v;
  next.cheat = {
    ...row.cheat,
    status: "voided",
    voided: true,
    voidedTotal: row.total,
  };
  next.scoreStatus = "voided-cheat";
  return next;
}

export function composeDisciplineNotice(caseRow, exam, student) {
  const name = student?.name || caseRow.name || "该生";
  const classNo = student?.classNo ?? caseRow.classNo;
  const examName = exam?.examName || caseRow.examName || "校本考试";
  const date = exam?.date || caseRow.examDate || "";
  const label = caseRow.disciplineLabel || formatDiscipline(caseRow.discipline);
  const body = `兹查明，${classNo}班学生${name}在${date}「${examName}」中作弊。经学校查实，给予${label}处分，该次靠作弊所得成绩予以取消并重算名次。特此公告。`;
  return {
    id: `${exam?.examId || caseRow.examId}|${student?.id || caseRow.studentId}|notice`,
    date: caseRow.noticeDate || date,
    examDate: date,
    examId: exam?.examId || caseRow.examId,
    examName,
    examKind: exam?.examKind || caseRow.examKind,
    studentId: student?.id || caseRow.studentId,
    name,
    classNo,
    discipline: caseRow.discipline,
    disciplineLabel: label,
    title: "校内处分公告",
    body,
    source: "宁川中学教务处校内公告，不是省教育考试院文件。",
  };
}

export function resumeDisciplineLine(notice) {
  if (!notice) return "";
  return `${notice.examDate || notice.date}「${notice.examName}」因作弊查实，给予${notice.disciplineLabel || "处分"}，该次成绩已取消。`;
}
