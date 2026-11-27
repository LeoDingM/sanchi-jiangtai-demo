/**
 * 校本考试中的偶发作弊、同学举报与查实后的校内处分。
 * 用确定性 PRNG 可复现；不能把单科异常优异都判成作弊。
 * 未查实不出公告、不写入履历已确认处分。高考/会考/官方联考不做校内处分文件。
 * 查实后取消该次作弊所得分数并重算名次，不改省控或校内线口径。
 */
import { hash01 } from "./prng.js?v=t74u2";
import { addDays } from "./calendar.js?v=t74u2";

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
    tier: student?.tier || caseRow.tier || "",
    track: student?.track || student?.trackPref || caseRow.track || "",
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

/** 按时间倒序列出查实后的校内处分公告；未查实的不在此列。 */
export function sortDisciplineNotices(notices) {
  return (notices || []).slice().sort((a, b) => {
    const dd = String(b.date || b.examDate || "").localeCompare(String(a.date || a.examDate || ""));
    if (dd) return dd;
    const ed = String(b.examDate || "").localeCompare(String(a.examDate || ""));
    if (ed) return ed;
    return String(a.id || "").localeCompare(String(b.id || ""));
  });
}

export function noticesForExam(notices, exam) {
  if (!exam) return [];
  const examId = exam.examId || exam.id;
  const date = exam.date || exam.examDate;
  return sortDisciplineNotices(notices).filter((n) => {
    if (examId && n.examId && n.examId === examId) return true;
    if (examId && n.id && String(n.id).startsWith(String(examId) + "|")) return true;
    if (!examId && date && n.examDate === date && (n.examName === exam.examName || n.examKind === exam.examKind)) return true;
    return false;
  });
}

/**
 * 教务处 / 成绩 / 日志用的处分公告栏数据。
 * 校本考试若本场无查实公告，也要给出清楚说明，避免以为功能不存在。
 * 未查实举报不得进入 current / history。
 */
export function formatDisciplineBoard(notices, exam = null) {
  const history = sortDisciplineNotices(notices);
  const current = exam ? noticesForExam(history, exam) : [];
  const schoolExam = exam ? isSchoolExamKind(exam.examKind) : false;
  let currentNote = "";
  if (exam && !schoolExam) currentNote = "高考、会考或官方联考不做校内处分文件。";
  else if (exam && schoolExam && !current.length) currentNote = "本次校本考试无查实作弊公告";
  return {
    title: "校内处分公告",
    current,
    history,
    currentNote,
    emptyAll: !history.length,
    schoolExam,
    examName: exam?.examName || "",
    examDate: exam?.date || exam?.examDate || "",
  };
}


const TIER_FILTER_ORDER = ["yunxiu_exp", "yunxiu_key", "lingxiao", "zhuoxing", "duxue", "yiti", "fuzhuo"];

export function disciplineNoticeExamKey(notice) {
  if (!notice) return "";
  if (notice.examId) return String(notice.examId);
  return [notice.examDate || notice.date || "", notice.examName || ""].join("|");
}

export function enrichDisciplineNotice(notice, student = null) {
  if (!notice) return notice;
  const classNo = notice.classNo ?? student?.classNo;
  const tier = notice.tier || student?.tier || "";
  const trackRaw = notice.track || student?.track || student?.trackPref || "";
  const track = trackRaw === "wen" || trackRaw === "li" ? trackRaw : (trackRaw ? "mixed" : "");
  return {
    ...notice,
    classNo,
    tier,
    track,
    name: notice.name || student?.name || "",
  };
}

export function filterDisciplineNotices(notices, filters = {}) {
  const exam = filters.examId ?? filters.exam ?? "all";
  const tier = filters.tier ?? "all";
  const classNo = filters.classNo ?? "all";
  const track = filters.track ?? "all";
  const isAll = (v) => v == null || v === "" || v === "all";
  return sortDisciplineNotices(notices).filter((n) => {
    if (!isAll(exam) && disciplineNoticeExamKey(n) !== String(exam) && String(n.examId || "") !== String(exam)) return false;
    if (!isAll(tier) && String(n.tier || "") !== String(tier)) return false;
    if (!isAll(classNo) && Number(n.classNo) !== Number(classNo)) return false;
    if (!isAll(track)) {
      const t = n.track === "wen" || n.track === "li" ? n.track : (n.track ? "mixed" : "");
      if (t !== String(track)) return false;
    }
    return true;
  });
}

export function disciplineNoticeFilterOptions(notices) {
  const examSeen = new Set();
  const exams = [];
  const tierSeen = new Set();
  const classSeen = new Set();
  const classes = [];
  const trackSeen = new Set();
  for (const n of sortDisciplineNotices(notices)) {
    const key = disciplineNoticeExamKey(n);
    if (key && !examSeen.has(key)) {
      examSeen.add(key);
      const date = n.examDate || n.date || "";
      const name = n.examName || "考试";
      exams.push({ value: key, label: date ? `${date}「${name}」` : `「${name}」` });
    }
    if (n.tier) tierSeen.add(n.tier);
    if (n.classNo != null && n.classNo !== "") {
      const no = Number(n.classNo);
      if (Number.isFinite(no) && !classSeen.has(no)) {
        classSeen.add(no);
        classes.push(no);
      }
    }
    const t = n.track === "wen" || n.track === "li" ? n.track : (n.track ? "mixed" : "");
    if (t) trackSeen.add(t);
  }
  classes.sort((a, b) => a - b);
  const tiers = TIER_FILTER_ORDER.filter((id) => tierSeen.has(id)).concat(
    [...tierSeen].filter((id) => !TIER_FILTER_ORDER.includes(id)),
  );
  const tracks = ["li", "wen", "mixed"].filter((id) => trackSeen.has(id));
  return { exams, tiers, classes, tracks };
}

export function disciplineBoardButtonLabel(count) {
  const n = Math.max(0, Number(count) || 0);
  return n > 0 ? `校内处分公告（${n}）` : "校内处分公告";
}

export function filtersAreActive(filters = {}) {
  const keys = ["examId", "exam", "tier", "classNo", "track"];
  return keys.some((k) => {
    const v = filters[k];
    return v != null && v !== "" && v !== "all";
  });
}

/**
 * 弹层空状态说明。未查实的本来就不在 notices 里。
 * 有筛选且无结果，或完全没有查实公告时：当前范围无查实作弊公告。
 * 打开某场校本考试且该场没有查实公告时：本次校本考试无查实作弊公告。
 */
export function disciplineBoardEmptyNote({ exam = null, filters = {}, currentCount = 0, filteredCount = 0, totalCount = 0 } = {}) {
  if (filteredCount > 0) return "";
  if (filtersAreActive(filters)) return "当前范围无查实作弊公告";
  if (exam && !isSchoolExamKind(exam.examKind)) return "高考、会考或官方联考不做校内处分文件。";
  if (exam && isSchoolExamKind(exam.examKind) && currentCount === 0) return "本次校本考试无查实作弊公告";
  if (!totalCount) return "当前范围无查实作弊公告";
  return "当前范围无查实作弊公告";
}
