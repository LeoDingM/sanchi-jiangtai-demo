/**
 * 数学试卷请家长签字：本校月考、期中、期末或模拟成绩公布后，
 * 任课数学老师在办公室坐班把数学卷或成绩告知条发给学生带回签字，并登记交回。
 * 名单和摘记由已公布成绩与已有作业/课堂事实用确定性 PRNG 生成，不用 LLM，
 * 不改能力、分数、排名、省控、校内线或备课充分度，也不改写已有评语或考试分数。
 * 玩家不是班主任，不能发放学校正式成绩单、通知书或操行评语表，也不能主持班会。
 * 这不是家长会当场面谈，也不是电话家访或上门家访，更不是再写一遍数学学期评语。
 */
import { hash01 } from "./prng.js?v=t69u1";
import { addDays, SCHOOL_CALENDAR, weekday } from "./calendar.js?v=t69u1";
import {
  activityEventOn, currentSlot, isEveningPeriodId, majorEventOn,
} from "./timetable.js?v=t69u1";
import { isOpenHomework, studentTeachingContext } from "./teaching.js?v=t69u1";
import { isParentsMeetingOpen } from "./parents.js?v=t69u1";
import { isOfficeSittingSlot } from "./homeVisit.js?v=t69u1";
import { isTeachersDayPlayDate } from "./teachersDay.js?v=t69u1";
import { isAwayFromClass, leaveCovering } from "./health.js?v=t69u1";
import { isOpeningDayPlayDate } from "./openingDay.js?v=t69u1";
import { isStudyHallSubject } from "./studyHall.js?v=t69u1";
import { playerClassStudents } from "./visits.js?v=t69u1";
import { HOMEROOM_NAME } from "./config.js?v=t69u1";
import { seatLabel } from "./school.js?v=t69u1";
import {
  currentQualityMeetExam, isQualityMeetExamKind, qualityMeetExamKey,
  qualityMeetPublishDate, qualityMeetWindowEnd, settledQualityMeetExams,
  examEventCovering,
} from "./qualityMeet.js?v=t69u1";

export const PAPER_SIGN_BATCH_MIN = 6;
export const PAPER_SIGN_BATCH_MAX = 10;
export const PAPER_SIGN_DAY_CAP = 1;

export const PAPER_SIGN_ACTIONS = [
  { id: "issue", label: "把数学试卷发给今日这几位同学带回，请家长签字" },
  { id: "register", label: "登记已经交回的签字条" },
  { id: "inform", label: "把仍未交回的情况转告班主任，请她帮忙提醒" },
];

export const PAPER_SIGN_SOURCE_NOTE = "这是本班任课（实习或正式）数学老师把已公布的本校考试数学卷或成绩告知条发给学生带回签字并登记交回，不是班主任发放学校正式成绩单、通知书或操行评语表，也不能主持班会。这不是家长会当场面谈，也不是电话家访或上门家访，更不是再写一遍数学学期评语。不会改分数、排名或省控。期末后到分班前窗口可能较短，不必强求全班办完。";

export const PAPER_SIGN_EXAM_KINDS = new Set(["monthly", "midterm", "final", "mock1", "mock2", "mock3"]);
export const PAPER_SIGN_BLOCKED_KINDS = new Set(["city", "province", "huikao", "gaokao"]);

export function isPaperSignExamKind(kind) {
  return PAPER_SIGN_EXAM_KINDS.has(kind) && isQualityMeetExamKind(kind);
}

export function paperSignExamKey(exam) {
  return qualityMeetExamKey(exam);
}

export function paperSignPublishDate(exam) {
  return qualityMeetPublishDate(exam);
}

export function paperSignWindowEnd(exam, state) {
  return qualityMeetWindowEnd(exam, state);
}

export function isExamInPaperSignWindow(exam, date, state) {
  if (!exam || !date) return false;
  if (!isPaperSignExamKind(exam.examKind)) return false;
  const pub = paperSignPublishDate(exam);
  if (!pub || date < pub) return false;
  const end = paperSignWindowEnd(exam, state);
  if (end && date >= end) return false;
  return true;
}

export function settledPaperSignExams(state, date = state?.date) {
  return settledQualityMeetExams(state, date).filter((ex) => isPaperSignExamKind(ex.examKind));
}

export function currentPaperSignExam(state, date = state?.date) {
  if (!state || !date) return null;
  const cur = currentQualityMeetExam(state, date);
  if (cur && isPaperSignExamKind(cur.examKind) && isExamInPaperSignWindow(cur, date, state)) return cur;
  for (const ex of settledPaperSignExams(state, date)) {
    if (isExamInPaperSignWindow(ex, date, state)) return ex;
  }
  return null;
}

function sameExamRec(rec, exam) {
  if (!rec || !exam) return false;
  const key = paperSignExamKey(exam);
  if (rec.examKey && key && rec.examKey === key) return true;
  const id = exam.examId || exam.id;
  return rec.examId === id && rec.examDate === exam.date;
}

export function hasIssued(student, exam) {
  if (!student || !exam) return false;
  const recs = student.paperSigns || [];
  if (recs.some((r) => sameExamRec(r, exam) && (r.status === "issued" || r.status === "returned" || r.actionId === "issue" || r.actionId === "register"))) {
    return true;
  }
  const last = student.lastPaperSign;
  return !!(last && sameExamRec(last, exam) && (last.status === "issued" || last.status === "returned" || last.actionId === "issue" || last.actionId === "register"));
}

export function hasReturned(student, exam) {
  if (!student || !exam) return false;
  const recs = student.paperSigns || [];
  if (recs.some((r) => sameExamRec(r, exam) && (r.status === "returned" || r.actionId === "register"))) return true;
  const last = student.lastPaperSign;
  return !!(last && sameExamRec(last, exam) && (last.status === "returned" || last.actionId === "register"));
}

export function hasInformed(student, exam) {
  if (!student || !exam) return false;
  const recs = student.paperSigns || [];
  if (recs.some((r) => sameExamRec(r, exam) && (r.status === "informed" || r.actionId === "inform"))) return true;
  const last = student.lastPaperSign;
  return !!(last && sameExamRec(last, exam) && (last.status === "informed" || last.actionId === "inform"));
}

export function paperSignProgress(state, exam = currentPaperSignExam(state), date = state?.date) {
  const mates = playerClassStudents(state);
  const issued = mates.filter((s) => hasIssued(s, exam));
  const returned = mates.filter((s) => hasReturned(s, exam));
  const unissued = mates.filter((s) => !hasIssued(s, exam));
  const unissuedHere = unissued.filter((s) => !onLeave(s, state, date));
  const pendingReturn = issued.filter((s) => !hasReturned(s, exam));
  return {
    total: mates.length,
    issued: issued.length,
    returned: returned.length,
    unissued: unissued.length,
    unissuedHere: unissuedHere.length,
    pendingReturn: pendingReturn.length,
  };
}

export function latestPaperSignMinutes(state, exam) {
  if (!state) return null;
  if (exam) {
    const key = paperSignExamKey(exam);
    const hit = (state.paperSigns || []).find((r) => paperSignExamKey(r) === key || (r.examId === (exam.examId || exam.id) && r.examDate === exam.date));
    if (hit) return hit;
  }
  if (state.paperSign?.lastMinutes) return state.paperSign.lastMinutes;
  return (state.paperSigns || [])[0] || null;
}

export function ensurePaperSignState(state) {
  if (!state) return null;
  if (!Array.isArray(state.paperSigns)) state.paperSigns = [];
  const exam = currentPaperSignExam(state);
  const key = paperSignExamKey(exam);
  const last = latestPaperSignMinutes(state, exam);
  const cur = state.paperSign;
  if (!cur || typeof cur !== "object") {
    state.paperSign = { examKey: key, date: null, todayAction: null, todayIds: [], lastAction: last?.actionId || null, lastMinutes: last || null };
    return state.paperSign;
  }
  if (cur.examKey !== key) {
    state.paperSign = { examKey: key, date: null, todayAction: null, todayIds: [], lastAction: last?.actionId || null, lastMinutes: last || null };
    return state.paperSign;
  }
  if (cur.date !== state.date) {
    cur.todayAction = null;
    cur.todayIds = [];
    cur.date = state.date;
  }
  if (last && !cur.lastMinutes) cur.lastMinutes = last;
  if (last?.actionId && !cur.lastAction) cur.lastAction = last.actionId;
  return cur;
}

function isSunday(date, slot) {
  if (date && weekday(date) === 0) return true;
  if (!slot) return false;
  return slot.id === "rest" || slot.kind === "rest";
}

function isSaturday(date) {
  return !!date && weekday(date) === 6;
}

function parentsDayOn(date, state) {
  if (!date) return false;
  if (state && isParentsMeetingOpen(state) && state.date === date) return true;
  return majorEventOn(date)?.kind === "parents";
}

function activityDayOn(date, slot) {
  if (activityEventOn(date)) return true;
  return !!slot?.isActivityPeriod;
}

function examDayOn(date, slot) {
  if (examEventCovering(date)) return true;
  if (slot?.isExamDay && majorEventOn(date)?.kind !== "parents" && majorEventOn(date)?.kind !== "activity") return true;
  const major = majorEventOn(date);
  return major?.kind === "exam";
}

function blockedMajorKind(date) {
  const major = majorEventOn(date);
  if (!major) return null;
  if (major.kind === "parents") return "parents";
  if (major.kind === "exam") return "exam";
  if (major.kind === "activity") return "activity";
  if (major.kind === "placement1" || major.kind === "placement2" || major.kind === "admission" || major.kind === "promote") return "exam";
  return null;
}

function calendarBlockedReason(state, slot, date) {
  if (!state || !date) return "现在不能办理试卷签字。";
  const s = slot || currentSlot(state);
  if (isTeachersDayPlayDate(date)) return "今天是校内教师节问候窗口，试卷签字请放到平时办公室坐班时再办。";
  if (isOpeningDayPlayDate(date)) return "今天是开学典礼或报到可玩日，试卷签字不要硬凑在这一天。";
  if (parentsDayOn(date, state)) return "今天是家长会，试卷签字请放到平时办公室坐班时再办。";
  const blocked = blockedMajorKind(date);
  if (blocked === "exam" || examDayOn(date, s)) return "今天考试或学校有分班、升学安排，不办理试卷签字。";
  if (blocked === "activity" || activityDayOn(date, s)) return "今天是学校活动日，不办理试卷签字。";
  if (isSaturday(date)) return "试卷签字请放到平时办公室坐班时办理，不要改到周六。";
  if (isSunday(date, s)) return "周日不办理试卷签字。请放到平时办公室坐班。";
  return "";
}

/** 仅办公室坐班（早读或非数学正课的白天坐班）。辅导、晚自习、自习看班不可开。 */
export function isPaperSignTimeSlot(slot, date) {
  if (!slot || !date) return false;
  if (isSunday(date, slot) || isSaturday(date)) return false;
  if (slot.isTutoring || isEveningPeriodId(slot.id)) return false;
  if (isStudyHallSubject(slot)) return false;
  if (slot.isMath && !slot.isTutoring) return false;
  return isOfficeSittingSlot(slot, date);
}

function slotBlockedReason(state, slot, date) {
  const s = slot || currentSlot(state);
  if (s?.isMath && !s?.isTutoring) return "现在是数学正课，试卷签字请放到办公室坐班时再办理。";
  if (s && (isEveningPeriodId(s.id) || s.isTutoring)) {
    return "试卷签字要在办公室坐班时办理，不要在辅导时段整场占用，也不要在晚自习巡视时开。";
  }
  if (s && isStudyHallSubject(s)) return "现在是自习看班节，试卷签字请放到办公室坐班时再办理。";
  if (!isPaperSignTimeSlot(s, date)) return "试卷签字要在办公室坐班时办理，早读或非数学正课的白天坐班都可以。";
  return "";
}

function examWindowReason(state, date = state?.date) {
  const exam = currentPaperSignExam(state, date);
  if (exam) return "";
  const settled = settledPaperSignExams(state, date);
  const latest = settled[0];
  if (!latest) {
    return "眼下没有已公布的本校月考、期中、期末或模拟成绩，不能办理数学试卷签字。联考、会考或高考后不开放这项安排。";
  }
  const pub = paperSignPublishDate(latest);
  if (pub && date < pub) return `「${latest.examName}」的成绩还要等公布，公布后再到办公室坐班办理数学试卷签字。`;
  return "这场本校考试的试卷签字窗口已经结束。下一场同类校内考试、下学期开学、分班或毕业升学之后，要等下一次本校月考、期中、期末或模拟成绩公布再办。联考、会考或高考后不开放这项安排。";
}

function todayAlreadyDone(state) {
  const rec = ensurePaperSignState(state);
  return !!(rec && rec.date === state.date && rec.todayAction);
}

export function paperSignUnavailableReason(state, slot = currentSlot(state), date = state?.date) {
  const blocked = calendarBlockedReason(state, slot, date);
  if (blocked) return blocked;
  const examReason = examWindowReason(state, date);
  if (examReason) return examReason;
  const slotReason = slotBlockedReason(state, slot, date);
  if (slotReason) return slotReason;
  const exam = currentPaperSignExam(state, date);
  const prog = paperSignProgress(state, exam, date);
  if (exam && prog.total && prog.returned >= prog.total) {
    return `本班这场「${exam.examName}」的数学试卷签字已经办完（已发放并交回登记）。`;
  }
  if (exam && prog.unissuedHere === 0 && prog.pendingReturn === 0) {
    if (prog.unissued > 0) {
      return `剩余未发放的同学请假不在校，不要写成当面发给本人。已发放的也已交回或还没有可登记、可转告的名单。期末后到分班前窗口可能较短，不必强求全班办完。`;
    }
    return `本班这场「${exam.examName}」眼下没有可发放、可登记或需转告班主任的名单。`;
  }
  if (todayAlreadyDone(state)) {
    return `今天已经办理过一批试卷签字，每天最多一批，约 ${PAPER_SIGN_BATCH_MIN}–${PAPER_SIGN_BATCH_MAX} 人，其余的明天再办。期末后到分班前窗口可能较短，不必强求全班办完。`;
  }
  return "";
}

export function isPaperSignOpen(state, slot = currentSlot(state), date = state?.date) {
  return !paperSignUnavailableReason(state, slot, date);
}

/** 当日仍在对应考试的办公室坐班窗口（含今日已办完后查阅进度），且不是考试日/活动日/周日/家长会/开学典礼或报到。 */
export function isPaperSignWindow(state, slot = currentSlot(state), date = state?.date) {
  if (!state || !date) return false;
  if (calendarBlockedReason(state, slot, date)) return false;
  if (!currentPaperSignExam(state, date)) return false;
  const s = slot || currentSlot(state);
  if (s?.isMath && !s?.isTutoring) return false;
  if (s && (isEveningPeriodId(s.id) || s.isTutoring)) return false;
  if (s && isStudyHallSubject(s)) return false;
  return isPaperSignTimeSlot(s, date);
}

function onLeave(student, state, date = state?.date) {
  if (!student || !state || !date) return false;
  if (leaveCovering(student, date, state.seed)) return true;
  if (date === state.date && isAwayFromClass(student, state)) return true;
  return false;
}

function examRowOf(exam, student) {
  if (!exam || !student) return null;
  return (exam.rows || []).find((r) => r.studentId === student.id) || null;
}

function previousSettledExam(state, exam, date = state?.date) {
  if (!state || !exam) return null;
  const year = state.player?.cohortYear;
  const list = [];
  for (const [k, ex] of Object.entries(state.exams || {})) {
    const [y, id] = String(k).split("|");
    if (Number(y) !== Number(year)) continue;
    if (!ex || ex.pruned) continue;
    if (!ex.date || ex.date >= exam.date) continue;
    if (date && ex.date > date) continue;
    list.push({ ...ex, examId: ex.examId || id, entryYear: ex.entryYear ?? Number(y), _key: k });
  }
  list.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return list[0] || null;
}

function classSwingCuts(exam, prev, state) {
  if (!exam || !prev) return null;
  const deltas = [];
  for (const s of playerClassStudents(state)) {
    const a = examRowOf(exam, s)?.math;
    const b = examRowOf(prev, s)?.math;
    if (a == null || b == null) continue;
    deltas.push(Math.abs(a - b));
  }
  if (!deltas.length) return null;
  deltas.sort((a, b) => a - b);
  const third = deltas[Math.floor((deltas.length * 2) / 3)] ?? 10;
  return { high: Math.max(10, third) };
}

function factBundle(student, state, exam, date = state?.date) {
  const ctx = studentTeachingContext(student, state);
  const hw = ctx?.hw;
  const row = examRowOf(exam, student);
  const leave = onLeave(student, state, date);
  const missing = !!(hw && (isOpenHomework(hw) || hw.correction === "待补交" || hw.status === "缺交"));
  const corr = !!(hw && (hw.correction === "待订正" || hw.correction === "已订正待复查" || hw.quality === "错题较多" || hw.quality === "未订正"));
  const flag = ctx?.flag || student.lastClassFlag || "";
  const quiz = ctx?.quiz || student.lastQuiz || null;
  const lowQuiz = !!(quiz && Number(quiz.score) < 60);
  const prev = previousSettledExam(state, exam, date);
  const prevMath = prev ? examRowOf(prev, student)?.math : null;
  const math = row?.math;
  const delta = (math != null && prevMath != null) ? math - prevMath : 0;
  const cuts = classSwingCuts(exam, prev, state);
  const swing = !!(cuts && math != null && prevMath != null && Math.abs(delta) >= cuts.high);
  return {
    hw, missing, corr, row, math, leave, flag, quiz, lowQuiz, prev, prevMath, delta, swing,
    examName: exam?.examName || "这场考试",
    examKind: exam?.examKind,
    watch: flag === "走神" || lowQuiz,
  };
}

function suggestReason(facts, actionId) {
  if (actionId === "register") return "已经把数学卷带回请家长签字，可以登记交回";
  if (actionId === "inform") return "签字条尚未交回，可请班主任帮忙提醒";
  if (facts.corr || facts.missing) return "订正还未完，建议先把数学卷发给本人带回签字";
  if (facts.watch) return "课堂上还需盯一盯，建议先把数学卷发给本人带回签字";
  if (facts.swing) return `这场「${facts.examName}」数学波动较大，建议先把试卷发给本人带回签字`;
  return `结合这场「${facts.examName}」的已公布成绩，把数学卷或成绩告知条发给本人带回签字`;
}

function suggestScore(facts) {
  let p = 0;
  if (facts.missing) p += 6;
  if (facts.corr) p += 6;
  if (facts.watch) p += 5;
  if (facts.swing) p += 5;
  if (facts.row?.line === "未达二本") p += 2;
  return p;
}

function takeBatch(list) {
  if (!list.length) return [];
  if (list.length <= PAPER_SIGN_BATCH_MAX) return list;
  return list.slice(0, PAPER_SIGN_BATCH_MAX);
}

function packSuggestion(x, exam, actionId) {
  return {
    studentId: x.student.id,
    name: x.student.name,
    seat: seatLabel(x.student),
    reason: suggestReason(x.facts, actionId),
    onLeave: x.facts.leave,
    examId: exam.examId,
    examName: exam.examName,
    examKind: exam.examKind,
    actionId,
  };
}

/**
 * 今日建议当面发放的名单：尚未发放、且当天不在请假的本班学生，
 * 优先订正未完、课堂需盯或本场波动较大的人，每批约 6–10 人。
 */
export function suggestPaperSignIssue(state, date = state?.date, periodId = state?.periodId) {
  const exam = currentPaperSignExam(state, date);
  if (!exam) return [];
  const mates = playerClassStudents(state).filter((s) => !hasIssued(s, exam) && !onLeave(s, state, date));
  const scored = mates.map((s) => {
    const facts = factBundle(s, state, exam, date);
    const score = suggestScore(facts);
    const tie = hash01(state.seed, date, periodId || "", s.id, paperSignExamKey(exam), "paper-sign-issue");
    return { student: s, score, tie, facts };
  });
  scored.sort((a, b) => (b.score - a.score) || (a.tie - b.tie) || String(a.student.id).localeCompare(String(b.student.id)));
  return takeBatch(scored).map((x) => packSuggestion(x, exam, "issue"));
}

/** 已发放、尚未交回登记的学生，每批约 6–10 人。请假不在校的仍可登记交回。 */
export function suggestPaperSignRegister(state, date = state?.date, periodId = state?.periodId) {
  const exam = currentPaperSignExam(state, date);
  if (!exam) return [];
  const mates = playerClassStudents(state).filter((s) => hasIssued(s, exam) && !hasReturned(s, exam));
  const scored = mates.map((s) => {
    const facts = factBundle(s, state, exam, date);
    const issuedAt = (s.paperSigns || []).find((r) => sameExamRec(r, exam) && (r.status === "issued" || r.actionId === "issue"));
    const score = suggestScore(facts);
    const tie = hash01(state.seed, date, periodId || "", s.id, paperSignExamKey(exam), "paper-sign-register");
    return { student: s, score, tie, facts, issuedAt: issuedAt?.date || "" };
  });
  scored.sort((a, b) => (a.issuedAt < b.issuedAt ? -1 : a.issuedAt > b.issuedAt ? 1 : 0) || (b.score - a.score) || (a.tie - b.tie) || String(a.student.id).localeCompare(String(b.student.id)));
  return takeBatch(scored).map((x) => packSuggestion(x, exam, "register"));
}

/** 已发放、尚未交回的情况，可转告班主任帮忙提醒。不是电话家访，也不代发正式成绩单。 */
export function suggestPaperSignInform(state, date = state?.date, periodId = state?.periodId) {
  const exam = currentPaperSignExam(state, date);
  if (!exam) return [];
  const mates = playerClassStudents(state).filter((s) => hasIssued(s, exam) && !hasReturned(s, exam));
  const scored = mates.map((s) => {
    const facts = factBundle(s, state, exam, date);
    const score = suggestScore(facts) + (hasInformed(s, exam) ? 0 : 2);
    const tie = hash01(state.seed, date, periodId || "", s.id, paperSignExamKey(exam), "paper-sign-inform");
    return { student: s, score, tie, facts };
  });
  scored.sort((a, b) => (b.score - a.score) || (a.tie - b.tie) || String(a.student.id).localeCompare(String(b.student.id)));
  return takeBatch(scored).map((x) => packSuggestion(x, exam, "inform"));
}

export function paperSignOptionsFor(state) {
  const issue = suggestPaperSignIssue(state);
  const register = suggestPaperSignRegister(state);
  const inform = suggestPaperSignInform(state);
  const out = [];
  for (const act of PAPER_SIGN_ACTIONS) {
    const list = act.id === "issue" ? issue : act.id === "register" ? register : inform;
    if (!list.length) continue;
    out.push({
      id: act.id,
      label: act.label,
      names: list.map((v) => v.name),
      studentIds: list.map((v) => v.studentId),
      list,
    });
  }
  return out;
}

function nameList(list) {
  return list.map((v) => v.name).join("、");
}

export function composePaperSignBrief(state, exam = currentPaperSignExam(state)) {
  if (!state || !exam) return null;
  const prog = paperSignProgress(state, exam);
  const issue = suggestPaperSignIssue(state);
  const register = suggestPaperSignRegister(state);
  const inform = suggestPaperSignInform(state);
  const preview = issue.length
    ? `今日建议发放：${nameList(issue)}。`
    : (register.length ? `今日可登记交回：${nameList(register)}。` : (inform.length ? `今日可转告班主任未交回：${nameList(inform)}。` : "今日暂无建议当面发放的名单。"));
  const shortPoints = `「${exam.examName}」已发放 ${prog.issued} 人、已交回 ${prog.returned} 人，全班 ${prog.total} 人。每天一批约 ${PAPER_SIGN_BATCH_MIN}–${PAPER_SIGN_BATCH_MAX} 人，不必一次点完全班，也不必强求全班办完。${preview}`;
  return { examName: exam.examName, examKind: exam.examKind, preview, shortPoints, progress: prog };
}

export function composePaperSignMinutes(state, actionId, list, exam) {
  const act = PAPER_SIGN_ACTIONS.find((a) => a.id === actionId);
  const names = nameList(list);
  const examName = exam?.examName || "这场考试";
  if (actionId === "issue") {
    return `你以本班任课（实习或正式）数学老师身份，把已公布的「${examName}」数学试卷（或成绩告知条）发给今日这几位同学带回，请家长签字：${names}。请假不在校的同学没有写成当面发给本人。这不是班主任发放的学校正式成绩单、通知书或操行评语表，也不能主持班会。这不是家长会，也不是家访，更不是再写一遍数学学期评语。${PAPER_SIGN_SOURCE_NOTE}`;
  }
  if (actionId === "register") {
    return `你登记了已经交回的「${examName}」数学试卷签字条：${names}。家长已在数学卷或成绩告知条上签字。这不是班主任发放的正式成绩单或通知书，也不是家长会或家访。${PAPER_SIGN_SOURCE_NOTE}`;
  }
  if (actionId === "inform") {
    return `你把「${examName}」数学试卷仍未交回的情况转告班主任${HOMEROOM_NAME}，请她帮忙提醒：${names}。你没有代替班主任发放正式成绩单、通知书或操行评语表，也没有改写成一次电话家访或上门家访。${PAPER_SIGN_SOURCE_NOTE}`;
  }
  return `${act?.label || "办理试卷签字"}：${names}。${PAPER_SIGN_SOURCE_NOTE}`;
}

function studentNoteText(student, exam, actionId) {
  const examName = exam?.examName || "这场考试";
  if (actionId === "issue") return `已把「${examName}」数学卷或成绩告知条带回请家长签字，尚未交回`;
  if (actionId === "register") return `已交回「${examName}」家长签字`;
  return `「${examName}」签字条尚未交回，已请班主任${HOMEROOM_NAME}帮忙提醒`;
}

function recordStudent(state, student, exam, actionId) {
  const status = actionId === "issue" ? "issued" : actionId === "register" ? "returned" : "informed";
  const text = studentNoteText(student, exam, actionId);
  const statusLine = `${state.date}试卷签字：${text}`;
  const rec = {
    date: state.date,
    periodId: state.periodId,
    examId: exam.examId || exam.id,
    examName: exam.examName,
    examKind: exam.examKind,
    examDate: exam.date,
    examKey: paperSignExamKey(exam),
    actionId,
    status,
    statusLine,
    text,
    role: "数学任课老师",
    seat: seatLabel(student),
  };
  student.lastPaperSign = rec;
  student.paperSigns = [rec, ...(student.paperSigns || [])].slice(0, 12);
  return rec;
}

function assertAction(actionId) {
  return PAPER_SIGN_ACTIONS.find((a) => a.id === actionId) || null;
}

function listForAction(state, actionId) {
  if (actionId === "issue") return suggestPaperSignIssue(state);
  if (actionId === "register") return suggestPaperSignRegister(state);
  if (actionId === "inform") return suggestPaperSignInform(state);
  return [];
}

/**
 * 按今日建议名单办理一批试卷签字。不改能力、分数、排名、省控或备课充分度，
 * 也不改写已有评语或考试分数。每天最多一批。
 */
export function handlePaperSign(state, actionId) {
  if (!state) return { ok: false, reason: "现在不能办理试卷签字。" };
  const blocked = paperSignUnavailableReason(state);
  if (blocked) return { ok: false, reason: blocked };
  const exam = currentPaperSignExam(state);
  if (!exam) return { ok: false, reason: "眼下没有已公布的本校月考、期中、期末或模拟成绩，不能办理数学试卷签字。" };
  const act = assertAction(actionId);
  if (!act) return { ok: false, reason: "请从发放试卷、登记交回、转告班主任这几项里选一种，不要另外发挥。" };
  const list = listForAction(state, actionId);
  if (!list.length) {
    if (actionId === "issue") return { ok: false, reason: "今日没有可当面发放的名单。请假不在校的不要写成当面发给本人。" };
    if (actionId === "register") return { ok: false, reason: "眼下没有已经交回、尚待登记的签字条。" };
    return { ok: false, reason: "眼下没有仍未交回、需要转告班主任的名单。" };
  }
  if (actionId === "issue") {
    for (const v of list) {
      const stu = playerClassStudents(state).find((s) => s.id === v.studentId);
      if (stu && hasIssued(stu, exam)) {
        return { ok: false, reason: `${stu.name}这场「${exam.examName}」的数学试卷已经发放过，同一场不能重复发放。` };
      }
      if (stu && onLeave(stu, state)) {
        return { ok: false, reason: `${stu.name}请假不在校，不要写成当面发给本人。` };
      }
    }
  }
  if (actionId === "register") {
    for (const v of list) {
      const stu = playerClassStudents(state).find((s) => s.id === v.studentId);
      if (stu && hasReturned(stu, exam)) {
        return { ok: false, reason: `${stu.name}这场「${exam.examName}」的签字条已经登记交回，同一场不能重复登记。` };
      }
      if (stu && !hasIssued(stu, exam)) {
        return { ok: false, reason: `${stu.name}这场「${exam.examName}」的试卷还没有发放，不能先登记交回。` };
      }
    }
  }
  const minutes = composePaperSignMinutes(state, actionId, list, exam);
  const studentRecs = [];
  for (const v of list) {
    const stu = playerClassStudents(state).find((s) => s.id === v.studentId);
    if (!stu) continue;
    studentRecs.push(recordStudent(state, stu, exam, actionId));
  }
  const rec = {
    date: state.date,
    periodId: state.periodId,
    examId: exam.examId || exam.id,
    examName: exam.examName,
    examKind: exam.examKind,
    examDate: exam.date,
    examKey: paperSignExamKey(exam),
    actionId,
    studentIds: list.map((v) => v.studentId),
    names: list.map((v) => v.name),
    minutes,
    topic: exam.examName,
  };
  state.paperSigns = [rec, ...(state.paperSigns || [])].slice(0, 40);
  const box = ensurePaperSignState(state);
  box.date = state.date;
  box.examKey = paperSignExamKey(exam);
  box.todayAction = actionId;
  box.todayIds = list.map((v) => v.studentId);
  box.lastAction = actionId;
  box.lastMinutes = rec;
  const logText = minutes;
  return { ok: true, text: logText, rec, exam, actionId, list, studentRecs, minutes };
}
