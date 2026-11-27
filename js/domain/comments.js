/**
 * 数学学期/学段评语：本校期中或期末成绩公布后，任课老师在办公室坐班为本班写评语。
 * 评语正文由已有事实与确定性 PRNG 生成，不用 LLM，不改能力、分数、排名或省控。
 * 这不是班主任操行评语，也不是考后 AI 分析。日期按宁川中学校内安排。
 */
import { clamp, hash01 } from "./prng.js?v=t65u1";
import { addDays, SCHOOL_CALENDAR, schoolYearOf, weekday } from "./calendar.js?v=t65u1";
import {
  activityEventOn, currentSlot, isEveningPeriodId, majorEventOn,
} from "./timetable.js?v=t65u1";
import { isOpenHomework, studentTeachingContext } from "./teaching.js?v=t65u1";
import { composeParentBrief, isParentsMeetingOpen } from "./parents.js?v=t65u1";
import { playerClassStudents } from "./visits.js?v=t65u1";
import { isOfficeSittingSlot } from "./homeVisit.js?v=t65u1";
import { leaveCovering } from "./health.js?v=t65u1";
import { seatLabel } from "./school.js?v=t65u1";

export const COMMENT_BATCH_MIN = 6;
export const COMMENT_BATCH_MAX = 10;
export const COMMENT_DAY_CAP = COMMENT_BATCH_MAX;

export const COMMENT_TONES = [
  { id: "factual", label: "如实" },
  { id: "encourage", label: "鼓励" },
  { id: "remind", label: "提醒" },
];

export const COMMENT_SOURCE_NOTE = "这是数学任课老师的学期/学段评语，按宁川中学校内安排写入档案，不是班主任操行评语，也不是考后 AI 分析。";

export const COMMENT_EXAM_KINDS = new Set(["midterm", "final"]);

export function isCommentExamKind(kind) {
  return COMMENT_EXAM_KINDS.has(kind);
}

export function examCommentKey(exam) {
  if (!exam) return "";
  const year = exam.entryYear ?? "";
  const id = exam.examId || exam.id || "";
  return `${year}|${id}|${exam.date || ""}`;
}

export function calendarExamEvent(exam) {
  if (!exam) return null;
  const id = exam.examId || exam.id;
  if (id) {
    const byId = SCHOOL_CALENDAR.find((e) => e.id === id);
    if (byId) return byId;
  }
  if (!exam.date) return null;
  return SCHOOL_CALENDAR.find((e) => e.kind === "exam" && e.date === exam.date && e.examKind === exam.examKind) || null;
}

export function examSpanLastDay(exam) {
  if (!exam?.date) return "";
  const ev = calendarExamEvent(exam);
  const days = Number(ev?.days) > 0 ? Number(ev.days) : 1;
  return addDays(exam.date, days - 1);
}

/** 成绩公布日：该场考试占用的最后一天之后。 */
export function commentPublishDate(exam) {
  const last = examSpanLastDay(exam);
  return last ? addDays(last, 1) : "";
}

function playerGradeOn(state, date) {
  if (!state?.player?.cohortYear || !date) return 0;
  return schoolYearOf(date) - Number(state.player.cohortYear) + 1;
}

function eventAppliesToPlayer(ev, state) {
  if (!ev || !state?.player) return false;
  const grade = playerGradeOn(state, ev.date);
  if (grade < 1 || grade > 3) return false;
  if (Array.isArray(ev.grades) && ev.grades.length && !ev.grades.includes(grade)) return false;
  return true;
}

/** 该场评语窗口的关闭日（不含当天）：下学期开学、分班、毕业升学或下一场期中/期末。 */
export function commentWindowEnd(exam, state) {
  const last = examSpanLastDay(exam);
  if (!last) return "";
  const closers = SCHOOL_CALENDAR.filter((e) => {
    if (!e?.date || e.date <= last) return false;
    if (e.kind === "opening" || e.kind === "placement1" || e.kind === "placement2" || e.kind === "promote") return true;
    if (e.kind === "exam" && isCommentExamKind(e.examKind) && eventAppliesToPlayer(e, state)) return true;
    return false;
  }).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return closers[0]?.date || "";
}

export function isExamInCommentWindow(exam, date, state) {
  if (!exam || !date) return false;
  const pub = commentPublishDate(exam);
  if (!pub || date < pub) return false;
  const end = commentWindowEnd(exam, state);
  if (end && date >= end) return false;
  return true;
}

export function settledCommentExams(state, date = state?.date) {
  const year = state?.player?.cohortYear;
  const out = [];
  for (const [k, ex] of Object.entries(state?.exams || {})) {
    const [y, id] = String(k).split("|");
    if (Number(y) !== Number(year)) continue;
    if (!ex || ex.pruned) continue;
    if (!isCommentExamKind(ex.examKind)) continue;
    if (date && ex.date && ex.date > date) continue;
    out.push({ ...ex, examId: ex.examId || id, entryYear: ex.entryYear ?? Number(y), _key: k });
  }
  out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return out;
}

export function currentCommentExam(state, date = state?.date) {
  if (!state || !date) return null;
  for (const ex of settledCommentExams(state, date)) {
    if (isExamInCommentWindow(ex, date, state)) return ex;
  }
  return null;
}

export function examEventCovering(date, calendar = SCHOOL_CALENDAR) {
  if (!date) return null;
  return calendar.find((e) => {
    if (e.kind !== "exam") return false;
    const days = Number(e.days) > 0 ? Number(e.days) : 1;
    const last = addDays(e.date, days - 1);
    return e.date <= date && date <= last;
  }) || null;
}

export function hasTermComment(student, exam) {
  if (!student || !exam) return false;
  const id = exam.examId || exam.id;
  const date = exam.date;
  const recs = student.termComments || [];
  if (recs.some((r) => r.examId === id && r.examDate === date)) return true;
  const last = student.lastTermComment;
  return !!(last && last.examId === id && last.examDate === date);
}

export function ensureCommentState(state) {
  if (!state) return null;
  const exam = currentCommentExam(state);
  const key = examCommentKey(exam);
  const cur = state.termComments;
  if (!cur || typeof cur !== "object") {
    state.termComments = { examKey: key, date: null, todayCount: 0, lastIds: [] };
    return state.termComments;
  }
  if (cur.examKey !== key) {
    state.termComments = { examKey: key, date: null, todayCount: 0, lastIds: [] };
    return state.termComments;
  }
  if (cur.date !== state.date) {
    cur.todayCount = 0;
    cur.lastIds = [];
    cur.date = state.date;
  }
  return cur;
}

function isSunday(date, slot) {
  if (date && weekday(date) === 0) return true;
  if (!slot) return false;
  return slot.id === "rest" || slot.kind === "rest";
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

/** 仅办公室坐班（早读或非数学正课的白天坐班）。辅导时段、晚自习巡视不可写。 */
export function isCommentTimeSlot(slot, date) {
  if (!slot || !date) return false;
  if (isSunday(date, slot)) return false;
  if (slot.isTutoring || isEveningPeriodId(slot.id)) return false;
  return isOfficeSittingSlot(slot, date);
}

function windowBlockedReason(state, slot, date) {
  if (!state || !date) return "现在不能写数学学期评语。";
  const s = slot || currentSlot(state);
  if (parentsDayOn(date, state)) return "今天是家长会，数学学期评语请放到平时办公室坐班时再写。";
  const blocked = blockedMajorKind(date);
  if (blocked === "exam" || examDayOn(date, s)) return "今天考试或学校有分班、升学安排，不写数学学期评语。";
  if (blocked === "activity" || activityDayOn(date, s)) return "今天是学校活动日，不写数学学期评语。";
  if (isSunday(date, s)) return "周日不写数学学期评语。这是档案工作，请放到平时办公室坐班。";
  if (s?.isMath && !s?.isTutoring) return "现在是数学正课，学期评语请放到办公室坐班时再写。";
  if (s && (isEveningPeriodId(s.id) || s.isTutoring)) {
    return "学期评语要在办公室坐班时写，不要在辅导时段整场开写，也不要在晚自习巡视时写。";
  }
  if (!isCommentTimeSlot(s, date)) return "数学学期评语要在办公室坐班时写，早读或非数学正课的白天坐班都可以。";
  return "";
}

function examWindowReason(state, date = state?.date) {
  const exam = currentCommentExam(state, date);
  if (exam) return "";
  const settled = settledCommentExams(state, date);
  const latest = settled[0];
  if (!latest) {
    return "眼下没有已公布的本校期中或期末成绩，不能写数学学期评语。月考、联考、会考、模拟或高考后不写这类评语。";
  }
  const pub = commentPublishDate(latest);
  if (pub && date < pub) return `「${latest.examName}」的成绩还要等公布，公布后再到办公室坐班写数学学期评语。`;
  return "这场期中或期末的评语窗口已经结束。下学期开学、分班、毕业升学或下一场期中/期末之后，要等下一次本校期中或期末成绩公布再写。月考、联考、会考、模拟或高考后不写这类评语。";
}

export function commentUnavailableReason(state, slot = currentSlot(state), date = state?.date) {
  const blocked = windowBlockedReason(state, slot, date);
  if (blocked) return blocked;
  const examReason = examWindowReason(state, date);
  if (examReason) return examReason;
  const exam = currentCommentExam(state, date);
  const mates = playerClassStudents(state);
  if (exam && mates.length && mates.every((s) => hasTermComment(s, exam))) {
    return `本班这场「${exam.examName}」的数学学期评语已经写完。`;
  }
  const rec = ensureCommentState(state);
  if ((rec.todayCount || 0) >= COMMENT_DAY_CAP) {
    return `今天已经写过一批数学学期评语，每天最多一批，约 ${COMMENT_BATCH_MIN}–${COMMENT_BATCH_MAX} 人，其余的明天再写。`;
  }
  return "";
}

export function isCommentOpen(state, slot = currentSlot(state), date = state?.date) {
  return !commentUnavailableReason(state, slot, date);
}

export function isCommentWindow(state, slot = currentSlot(state), date = state?.date) {
  return !windowBlockedReason(state, slot, date) && !!currentCommentExam(state, date);
}

function findClassStudent(state, id) {
  return playerClassStudents(state).find((s) => s.id === id) || null;
}

function onLeave(student, state, date = state?.date) {
  if (!student || !state || !date) return false;
  return !!leaveCovering(student, date, state.seed);
}

function examRowOf(exam, student) {
  if (!exam || !student) return null;
  return (exam.rows || []).find((r) => r.studentId === student.id) || null;
}

function classMathCuts(exam, state) {
  const mates = playerClassStudents(state);
  const maths = [];
  for (const s of mates) {
    const row = examRowOf(exam, s);
    if (row?.math != null) maths.push(row.math);
  }
  if (!maths.length) return null;
  maths.sort((a, b) => a - b);
  return {
    low: maths[Math.floor(maths.length / 3)],
    mid: maths[Math.floor(maths.length / 2)],
    high: maths[Math.floor((maths.length * 2) / 3)],
  };
}

function factBundle(student, state, exam, date = state?.date) {
  const ctx = studentTeachingContext(student, state);
  const brief = composeParentBrief(student, state);
  const hw = ctx?.hw || brief.homework;
  const row = examRowOf(exam, student);
  const leave = onLeave(student, state, date);
  const missing = !!(hw && (isOpenHomework(hw) || hw.correction === "待补交" || hw.status === "缺交"));
  const corr = !!(hw && (hw.correction === "待订正" || hw.correction === "已订正待复查" || hw.quality === "错题较多" || hw.quality === "未订正"));
  const cuts = classMathCuts(exam, state);
  const math = row?.math;
  const weakMath = !!(row && (row.line === "未达二本" || (cuts && math != null && math <= cuts.low)));
  const strongMath = !!(row && cuts && math != null && math >= cuts.high);
  const midMath = !!(row && !weakMath && !strongMath);
  const flag = ctx?.flag || brief.classroom?.flag || student.lastClassFlag || "";
  const quiz = ctx?.quiz || brief.classroom?.quiz || student.lastQuiz || null;
  const lowQuiz = !!(quiz && Number(quiz.score) < 60);
  const coaching = student.lastCoaching || null;
  const homeVisit = student.lastHomeVisit || null;
  return {
    hw, missing, corr, row, math, line: row?.line || "", total: row?.total,
    weakMath, strongMath, midMath, flag, quiz, lowQuiz, leave, coaching, homeVisit,
    examName: exam?.examName || (exam?.examKind === "final" ? "期末考试" : "期中考试"),
    examKind: exam?.examKind,
  };
}

function suggestReason(facts) {
  if (facts.missing) return "作业还缺交或没补上，建议先写评语跟进";
  if (facts.corr) return "订正和错题还比较吃力，建议先写评语";
  if (facts.weakMath) return `这次「${facts.examName}」数学还偏弱，建议先写评语`;
  if (facts.flag === "走神") return "课堂上有些跟不上，建议先写评语";
  if (facts.lowQuiz) return "随堂小测还不够稳，建议先写评语";
  if (facts.coaching) return "最近做过课余辅导，建议结合近况写评语";
  if (facts.homeVisit) return "最近联系过家长，建议结合近况写评语";
  if (facts.strongMath) return `这次「${facts.examName}」数学表现较好，可以写入学段评语`;
  return `结合这次「${facts.examName}」的数学成绩和日常表现写评语`;
}

function suggestScore(student, state, exam, date) {
  const facts = factBundle(student, state, exam, date);
  let p = 0;
  if (facts.missing) p += 6;
  if (facts.corr) p += 5;
  if (facts.weakMath) p += 5;
  else if (facts.row?.line === "二本") p += 2;
  else if (facts.strongMath) p += 1;
  if (facts.flag === "走神") p += 3;
  if (facts.lowQuiz) p += 3;
  if (facts.coaching) p += 2;
  if (facts.homeVisit) p += 1;
  return p;
}

function pickPhrase(seed, studentId, exam, tone, key, phrases) {
  const idx = Math.floor(hash01(seed, studentId, exam.examId || exam.id || "", exam.date || "", tone, key, "term-comment") * phrases.length) % phrases.length;
  return phrases[idx];
}

function hwClause(facts) {
  if (facts.missing) return "最近数学作业还有缺交或未补上的情况";
  if (facts.corr) return "作业订正和错题整理还需要再抓紧";
  if (facts.hw?.quality) return `平时作业${facts.hw.quality}`;
  return "平时作业大体能跟上进度";
}

function classClause(facts) {
  if (facts.flag === "走神") return "课堂上偶尔走神，跟课还不够稳";
  if (facts.flag) return `课堂上${facts.flag}`;
  if (facts.lowQuiz) return "随堂小测还不够稳";
  return "课堂上能够跟着进度走";
}

function examClause(facts) {
  if (facts.math != null) {
    const line = facts.line ? `，总评还在「${facts.line}」附近` : "";
    return `这次「${facts.examName}」数学 ${facts.math} 分${line}`;
  }
  return `这次「${facts.examName}」的数学成绩已记入档案`;
}

function extraClause(facts) {
  const bits = [];
  if (facts.coaching) {
    bits.push(facts.coaching.kind === "enrich" ? "近期参加过课余培优" : "近期接受过课余补差");
  }
  if (facts.homeVisit) bits.push("老师已就近况与家长沟通过");
  return bits.join("，");
}

export function composeTermComment(state, student, exam, toneId) {
  const tone = COMMENT_TONES.find((t) => t.id === toneId);
  if (!state || !student || !exam || !tone) return "";
  const facts = factBundle(student, state, exam);
  const seed = state.seed;
  const id = student.id;
  const examBit = examClause(facts);
  const classBit = classClause(facts);
  const hwBit = hwClause(facts);
  const extra = extraClause(facts);
  const extraBit = extra ? extra + "。" : "";
  let body = "";
  if (tone.id === "factual") {
    const open = pickPhrase(seed, id, exam, tone.id, "open", [
      `${student.name}本学段数学学习情况如下。`,
      `就${student.name}本学段的数学表现，作如下如实记录。`,
      `${student.name}本学段数学课业表现可以这样概括。`,
    ]);
    body = `${open}${examBit}。${classBit}，${hwBit}。${extraBit}`;
  } else if (tone.id === "encourage") {
    const open = pickPhrase(seed, id, exam, tone.id, "open", [
      `${student.name}在数学学习上仍有可取之处，值得继续坚持。`,
      `${student.name}对待数学并不松劲，把已有的习惯稳住，后面还有空间。`,
      `${student.name}本学段数学学习有值得肯定的地方。`,
    ]);
    const close = pickPhrase(seed, id, exam, tone.id, "close", [
      "希望继续认真订正、跟上课堂，把方法做扎实。",
      "只要把作业和课堂再落实一些，数学还能再往前走。",
      "请保持现在的态度，把基础题做稳，再逐步提高。",
    ]);
    body = `${open}${examBit}。${classBit}，${hwBit}。${extraBit}${close}`;
  } else {
    const open = pickPhrase(seed, id, exam, tone.id, "open", [
      `${student.name}本学段数学还需要提醒跟上。`,
      `就${student.name}目前的数学情况，有几点需要特别注意。`,
      `${student.name}在数学上还有明显该抓紧的地方。`,
    ]);
    const close = pickPhrase(seed, id, exam, tone.id, "close", [
      "请在下阶段把课堂听讲和作业订正放在前面，先把基础打牢。",
      "建议先把缺漏和错题清掉，不要只看一次分数。",
      "下阶段请盯紧作业和课堂，避免把问题拖到下次考试。",
    ]);
    body = `${open}${examBit}。${classBit}，${hwBit}。${extraBit}${close}`;
  }
  return `${body}${COMMENT_SOURCE_NOTE}`;
}

export function commentOptionsFor(state, student, exam) {
  return COMMENT_TONES.map((t) => ({
    id: t.id,
    label: t.label,
    text: composeTermComment(state, student, exam, t.id),
  }));
}

function takeBatch(list) {
  if (!list.length) return [];
  if (list.length <= COMMENT_BATCH_MAX) return list;
  return list.slice(0, COMMENT_BATCH_MAX);
}

/**
 * 建议本批 6–10 人（不足 6 人则列出剩余未写的人），按作业、课堂近况和这场数学成绩排序。
 * 请假不在校的学生仍可写，因为评语是档案工作。
 */
export function suggestTermComments(state, date = state?.date, periodId = state?.periodId) {
  const exam = currentCommentExam(state, date);
  if (!exam) return [];
  const mates = playerClassStudents(state).filter((s) => !hasTermComment(s, exam));
  const scored = mates.map((s) => {
    const facts = factBundle(s, state, exam, date);
    const score = suggestScore(s, state, exam, date);
    const tie = hash01(state.seed, date, periodId || "", s.id, "comment-suggest");
    return { student: s, score, tie, facts };
  });
  scored.sort((a, b) => (b.score - a.score) || (a.tie - b.tie) || String(a.student.id).localeCompare(String(b.student.id)));
  return takeBatch(scored).map((x) => ({
    studentId: x.student.id,
    name: x.student.name,
    reason: suggestReason(x.facts),
    onLeave: x.facts.leave,
    examId: exam.examId,
    examName: exam.examName,
    examKind: exam.examKind,
    options: commentOptionsFor(state, x.student, exam),
  }));
}

function assertTone(toneId) {
  return COMMENT_TONES.find((t) => t.id === toneId) || null;
}

function applyCommentEffects(student, toneId) {
  let rel = 1;
  if (toneId === "encourage") rel = 2;
  else if (toneId === "remind") rel = 1;
  else rel = 1;
  student.relation = clamp((student.relation || 0) + rel, 0, 100);
}

function recordStudent(state, student, exam, tone, text) {
  const rec = {
    date: state.date,
    periodId: state.periodId,
    examId: exam.examId,
    examName: exam.examName,
    examKind: exam.examKind,
    examDate: exam.date,
    tone: tone.id,
    text,
    statusLine: `${state.date}数学学期评语：已就「${exam.examName}」写入档案`,
    role: "数学任课老师",
  };
  student.lastTermComment = rec;
  student.termComments = [rec, ...(student.termComments || [])].slice(0, 8);
  student.talks = [...(student.talks || []), {
    date: state.date,
    topic: "数学学期评语",
    text,
    seat: seatLabel(student),
  }];
  applyCommentEffects(student, tone.id);
  return rec;
}

/**
 * 为建议名单中的一名本班学生确认一种措辞并写入档案。不改能力、分数或省控。
 * 请假不在校的学生仍可写。
 */
export function handleTermComment(state, studentId, toneId) {
  if (!state) return { ok: false, reason: "现在不能写数学学期评语。" };
  const blocked = commentUnavailableReason(state);
  if (blocked) return { ok: false, reason: blocked };
  const exam = currentCommentExam(state);
  if (!exam) return { ok: false, reason: "眼下没有已公布的本校期中或期末成绩，不能写数学学期评语。" };
  const tone = assertTone(toneId);
  if (!tone) return { ok: false, reason: "请从如实、鼓励、提醒这几种措辞里选一种，不要另外发挥。" };
  const student = findClassStudent(state, studentId);
  if (!student) return { ok: false, reason: "请从建议名单里确认要写评语的本班学生。" };
  if (hasTermComment(student, exam)) {
    return { ok: false, reason: `${student.name}这场「${exam.examName}」的数学学期评语已经写过了，同一场不能重复写。` };
  }
  const suggested = suggestTermComments(state);
  if (!suggested.some((v) => v.studentId === studentId)) {
    return { ok: false, reason: "请从建议名单里确认要写评语的人。" };
  }
  const text = composeTermComment(state, student, exam, tone.id);
  const rec = recordStudent(state, student, exam, tone, text);
  const box = ensureCommentState(state);
  box.date = state.date;
  box.todayCount = (box.todayCount || 0) + 1;
  box.lastIds = [...(box.lastIds || []), student.id];
  box.lastTone = tone.id;
  box.lastExamId = exam.examId;
  const logText = `你在办公室为${student.name}写了「${exam.examName}」的数学学期评语（${tone.label}）：${text}`;
  return { ok: true, text: logText, rec, student, exam, toneId: tone.id };
}
