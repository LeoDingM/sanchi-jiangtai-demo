/**
 * 备课组质量分析会：本校月考、期中、期末或模拟成绩公布后，
 * 任课老师在办公室坐班参加数学备课组的校内分析会。
 * 发言要点和会议纪要由已结算事实与确定性 PRNG 生成，不用 LLM，
 * 不改能力、分数、排名或省控，也不生成或改写成绩图、考后 AI。
 * 由备课组长主持，玩家以任课（实习或正式）数学老师身份参加，不是接任备课组长。
 */
import { hash01 } from "./prng.js?v=t74u2";
import { addDays, SCHOOL_CALENDAR, schoolYearOf, weekday } from "./calendar.js?v=t74u2";
import {
  activityEventOn, currentSlot, isEveningPeriodId, majorEventOn,
} from "./timetable.js?v=t74u2";
import { allHomeworkRows, topicsForGrade } from "./teaching.js?v=t74u2";
import { isParentsMeetingOpen } from "./parents.js?v=t74u2";
import { isOfficeSittingSlot } from "./homeVisit.js?v=t74u2";
import { isTeachersDayPlayDate } from "./teachersDay.js?v=t74u2";
import { MENTOR_NAME } from "./config.js?v=t74u2";

export const QUALITY_MEET_ACTIONS = [
  { id: "listen", label: "先听记录" },
  { id: "supplement", label: "结合本班作业情况补充" },
  { id: "askMentor", label: "会后向师傅请教一句" },
];

export const QUALITY_MEET_SOURCE_NOTE = "这是宁川中学数学备课组的校内质量分析会，由备课组长主持，你以任课（实习或正式）数学老师身份参加，不是接任备课组长，也不是成绩页上的考后 AI 分析。会议纪要只作组内记录，不改分数，也不替代阅卷或数学学期评语。";

export const QUALITY_MEET_EXAM_KINDS = new Set(["monthly", "midterm", "final", "mock1", "mock2", "mock3"]);
export const QUALITY_MEET_BLOCKED_KINDS = new Set(["city", "province", "huikao", "gaokao"]);

export const QUALITY_MEET_COLLEAGUES = [
  { id: "fang", name: "方伯宁", title: "高一数学", grade: 1 },
  { id: "jiang", name: "江孟勤", title: "高二数学", grade: 2 },
  { id: "han", name: "韩承业", title: "高三数学", grade: 3 },
];

export function isQualityMeetExamKind(kind) {
  return QUALITY_MEET_EXAM_KINDS.has(kind);
}

export function qualityMeetExamKey(exam) {
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
export function qualityMeetPublishDate(exam) {
  const last = examSpanLastDay(exam);
  return last ? addDays(last, 1) : "";
}

function playerGradeOn(state, date) {
  if (!state?.player?.cohortYear || !date) return 0;
  return schoolYearOf(date) - Number(state.player.cohortYear) + 1;
}

function eventAppliesToPlayer(ev, state) {
  if (!ev || !state?.player) return false;
  if (ev.cohortYear != null && Number(ev.cohortYear) !== Number(state.player.cohortYear)) return false;
  const grade = playerGradeOn(state, ev.date);
  if (grade < 1 || grade > 3) return false;
  if (Array.isArray(ev.grades) && ev.grades.length && !ev.grades.includes(grade)) return false;
  return true;
}

/** 该场分析会窗口的关闭日（不含当天）：下一场同类校内考试、下学期开学、分班或毕业升学。 */
export function qualityMeetWindowEnd(exam, state) {
  const last = examSpanLastDay(exam);
  if (!last) return "";
  const closers = SCHOOL_CALENDAR.filter((e) => {
    if (!e?.date || e.date <= last) return false;
    if (e.kind === "opening" || e.kind === "placement1" || e.kind === "placement2" || e.kind === "promote") return true;
    if (e.kind === "admission" && eventAppliesToPlayer(e, state)) return true;
    if (e.kind === "exam" && isQualityMeetExamKind(e.examKind) && eventAppliesToPlayer(e, state)) return true;
    return false;
  }).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return closers[0]?.date || "";
}

export function isExamInQualityMeetWindow(exam, date, state) {
  if (!exam || !date) return false;
  const pub = qualityMeetPublishDate(exam);
  if (!pub || date < pub) return false;
  const end = qualityMeetWindowEnd(exam, state);
  if (end && date >= end) return false;
  return true;
}

export function settledQualityMeetExams(state, date = state?.date) {
  const year = state?.player?.cohortYear;
  const out = [];
  for (const [k, ex] of Object.entries(state?.exams || {})) {
    const [y, id] = String(k).split("|");
    if (Number(y) !== Number(year)) continue;
    if (!ex || ex.pruned) continue;
    if (!isQualityMeetExamKind(ex.examKind)) continue;
    if (date && ex.date && ex.date > date) continue;
    out.push({ ...ex, examId: ex.examId || id, entryYear: ex.entryYear ?? Number(y), _key: k });
  }
  out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return out;
}

export function currentQualityMeetExam(state, date = state?.date) {
  if (!state || !date) return null;
  for (const ex of settledQualityMeetExams(state, date)) {
    if (isExamInQualityMeetWindow(ex, date, state)) return ex;
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

export function hasQualityMeet(state, exam) {
  if (!state || !exam) return false;
  const key = qualityMeetExamKey(exam);
  if ((state.qualityMeetings || []).some((r) => qualityMeetExamKey(r) === key || (r.examId === (exam.examId || exam.id) && r.examDate === exam.date))) {
    return true;
  }
  const cur = state.qualityMeet;
  return !!(cur && cur.examKey === key && cur.done);
}

export function latestQualityMeetMinutes(state, exam) {
  if (!state) return null;
  if (exam) {
    const key = qualityMeetExamKey(exam);
    const hit = (state.qualityMeetings || []).find((r) => qualityMeetExamKey(r) === key || (r.examId === (exam.examId || exam.id) && r.examDate === exam.date));
    if (hit) return hit;
  }
  if (state.qualityMeet?.lastMinutes) return state.qualityMeet.lastMinutes;
  return (state.qualityMeetings || [])[0] || null;
}

export function ensureQualityMeetState(state) {
  if (!state) return null;
  if (!Array.isArray(state.qualityMeetings)) state.qualityMeetings = [];
  const exam = currentQualityMeetExam(state);
  const key = qualityMeetExamKey(exam);
  const cur = state.qualityMeet;
  const done = hasQualityMeet(state, exam);
  const last = latestQualityMeetMinutes(state, exam);
  if (!cur || typeof cur !== "object") {
    state.qualityMeet = { examKey: key, done, date: last?.date || null, lastAction: last?.actionId || null, lastMinutes: last || null };
    return state.qualityMeet;
  }
  if (cur.examKey !== key) {
    state.qualityMeet = { examKey: key, done, date: last?.date || null, lastAction: last?.actionId || null, lastMinutes: last || null };
    return state.qualityMeet;
  }
  cur.done = done || !!cur.done;
  if (last && !cur.lastMinutes) cur.lastMinutes = last;
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

/** 仅办公室坐班（早读或非数学正课的白天坐班）。辅导时段、晚自习巡视不可开。 */
export function isQualityMeetTimeSlot(slot, date) {
  if (!slot || !date) return false;
  if (isSunday(date, slot)) return false;
  if (slot.isTutoring || isEveningPeriodId(slot.id)) return false;
  return isOfficeSittingSlot(slot, date);
}

function calendarBlockedReason(state, slot, date) {
  if (!state || !date) return "现在不能参加备课组质量分析会。";
  const s = slot || currentSlot(state);
  if (isTeachersDayPlayDate(date)) return "今天是校内教师节问候窗口，备课组质量分析会请放到平时办公室坐班时再开。";
  if (parentsDayOn(date, state)) return "今天是家长会，备课组质量分析会请放到平时办公室坐班时再开。";
  const blocked = blockedMajorKind(date);
  if (blocked === "exam" || examDayOn(date, s)) return "今天考试或学校有分班、升学安排，不开备课组质量分析会。";
  if (blocked === "activity" || activityDayOn(date, s)) return "今天是学校活动日，不开备课组质量分析会。";
  if (isSunday(date, s)) return "周日不开备课组质量分析会。请放到平时办公室坐班。";
  return "";
}

function slotBlockedReason(state, slot, date) {
  const cal = calendarBlockedReason(state, slot, date);
  if (cal) return cal;
  const s = slot || currentSlot(state);
  if (s?.isMath && !s?.isTutoring) return "现在是数学正课，备课组质量分析会请放到办公室坐班时再参加。";
  if (s && (isEveningPeriodId(s.id) || s.isTutoring)) {
    return "质量分析会要在办公室坐班时开，不要在辅导时段整场参加，也不要在晚自习巡视时开。";
  }
  if (!isQualityMeetTimeSlot(s, date)) return "备课组质量分析会要在办公室坐班时参加，早读或非数学正课的白天坐班都可以。";
  return "";
}

function examWindowReason(state, date = state?.date) {
  const exam = currentQualityMeetExam(state, date);
  if (exam) return "";
  const settled = settledQualityMeetExams(state, date);
  const latest = settled[0];
  if (!latest) {
    return "眼下没有已公布的本校月考、期中、期末或模拟成绩，不能开备课组质量分析会。联考、会考、高考后不另开这类校内分析会。";
  }
  const pub = qualityMeetPublishDate(latest);
  if (pub && date < pub) return `「${latest.examName}」的成绩还要等公布，公布后再到办公室坐班参加备课组质量分析会。`;
  return "这场校内考试的质量分析会窗口已经结束。下一场月考、期中、期末或模拟，以及下学期开学、分班或毕业升学之后，要等下一次本校月考、期中、期末或模拟成绩公布再开。联考、会考、高考后不另开这类校内分析会。";
}

export function qualityMeetUnavailableReason(state, slot = currentSlot(state), date = state?.date) {
  const blocked = slotBlockedReason(state, slot, date);
  if (blocked) return blocked;
  const examReason = examWindowReason(state, date);
  if (examReason) return examReason;
  const exam = currentQualityMeetExam(state, date);
  if (exam && hasQualityMeet(state, exam)) {
    return `本场「${exam.examName}」的备课组质量分析会已经开过，全组只开一次，你已经参加过了。`;
  }
  return "";
}

export function isQualityMeetOpen(state, slot = currentSlot(state), date = state?.date) {
  return !qualityMeetUnavailableReason(state, slot, date);
}

/** 当日仍在对应考试的可开窗口（含已参加后查阅纪要），且不是考试日/活动日/周日/家长会/教师节。 */
export function isQualityMeetWindow(state, slot = currentSlot(state), date = state?.date) {
  return !calendarBlockedReason(state, slot, date) && !!currentQualityMeetExam(state, date);
}

function round1(n) {
  if (n == null || Number.isNaN(Number(n))) return null;
  return Math.round(Number(n) * 10) / 10;
}

function classMathFacts(exam, state) {
  const classNo = state?.player?.classNo;
  const cls = (exam?.classes || []).find((c) => c.classNo === classNo) || null;
  const className = cls?.name || "本班";
  let classMath = cls?.subjectAvgs?.math;
  const classRows = (exam?.rows || []).filter((r) => r.classNo === classNo && r.math != null);
  if (classMath == null && classRows.length) {
    classMath = classRows.reduce((a, r) => a + r.math, 0) / classRows.length;
  }
  let gradeMath = null;
  const gradeRows = (exam?.rows || []).filter((r) => !r.repeat && r.math != null);
  if (gradeRows.length) {
    gradeMath = gradeRows.reduce((a, r) => a + r.math, 0) / gradeRows.length;
  } else {
    const classes = (exam?.classes || []).filter((c) => !c.repeat && c.subjectAvgs?.math != null);
    const n = classes.reduce((a, c) => a + (c.count || 0), 0);
    if (n) gradeMath = classes.reduce((a, c) => a + (c.subjectAvgs.math * (c.count || 0)), 0) / n;
  }
  let tierMath = null;
  if (cls?.tier) {
    const peers = (exam?.classes || []).filter((c) => !c.repeat && c.tier === cls.tier && c.subjectAvgs?.math != null);
    const n = peers.reduce((a, c) => a + (c.count || 0), 0);
    if (n) tierMath = peers.reduce((a, c) => a + (c.subjectAvgs.math * (c.count || 0)), 0) / n;
  }
  return {
    className,
    classMath: round1(classMath),
    gradeMath: round1(gradeMath),
    tierMath: round1(tierMath),
  };
}

function previousQualityExam(state, exam) {
  if (!exam) return null;
  return settledQualityMeetExams(state, exam.date).find((ex) => {
    if ((ex.examId || ex.id) === (exam.examId || exam.id) && ex.date === exam.date) return false;
    return ex.date && exam.date && ex.date < exam.date;
  }) || null;
}

function deltaClause(curr, prev) {
  if (curr == null || prev == null) return "";
  const d = round1(curr - prev);
  if (d == null || d === 0) return "，与上一场已公布的本校同类考试持平";
  if (d > 0) return `，较上一场已公布的本校同类考试上升 ${d} 分`;
  return `，较上一场已公布的本校同类考试回落 ${Math.abs(d)} 分`;
}

function pickPhrase(seed, exam, key, phrases) {
  const idx = Math.floor(hash01(seed, exam?.examId || exam?.id || "", exam?.date || "", key, "quality-meet") * phrases.length) % phrases.length;
  return phrases[idx];
}

export function typicalErrorTopics(state, exam, date = state?.date) {
  const counts = new Map();
  const classNo = state?.player?.classNo;
  for (const row of allHomeworkRows(state) || []) {
    if (!row?.topic) continue;
    if (classNo != null && row.classNo != null && row.classNo !== classNo) continue;
    if (row.quality === "错题较多" || row.quality === "未订正" || row.correction === "待订正" || row.correction === "待面批") {
      counts.set(row.topic, (counts.get(row.topic) || 0) + 1);
    }
  }
  const scored = [...counts.entries()].map(([topic, n]) => ({
    topic,
    n,
    tie: hash01(state?.seed, exam?.examId || "", exam?.date || "", topic, "qm-topic"),
  }));
  scored.sort((a, b) => (b.n - a.n) || (a.tie - b.tie) || a.topic.localeCompare(b.topic, "zh"));
  if (scored.length >= 2) return scored.slice(0, 2).map((x) => x.topic);
  if (scored.length === 1) {
    const extra = fallbackTopics(state, exam, date).filter((t) => t !== scored[0].topic)[0];
    return extra ? [scored[0].topic, extra] : [scored[0].topic];
  }
  return fallbackTopics(state, exam, date).slice(0, 2);
}

function fallbackTopics(state, exam, date) {
  const lessons = (state?.player?.lessons || []).map((l) => l.topic).filter(Boolean);
  const uniqueLessons = [...new Set(lessons)];
  const grade = playerGradeOn(state, date || exam?.date) || exam?.grade || 1;
  const catalog = topicsForGrade(grade) || [];
  const pool = [...uniqueLessons, ...catalog].filter(Boolean);
  const seen = new Set();
  const out = [];
  for (const topic of pool) {
    if (seen.has(topic)) continue;
    seen.add(topic);
    out.push({ topic, tie: hash01(state?.seed, exam?.examId || "", exam?.date || "", topic, "qm-fallback") });
  }
  out.sort((a, b) => (a.tie - b.tie) || a.topic.localeCompare(b.topic, "zh"));
  if (out.length) return out.map((x) => x.topic);
  return ["函数与图像", "计算与式子变形"];
}

export function qualityMeetColleagues(state, exam, date = state?.date) {
  const grade = playerGradeOn(state, date || exam?.date) || exam?.grade || 1;
  const preferred = QUALITY_MEET_COLLEAGUES.find((c) => c.grade === grade) || QUALITY_MEET_COLLEAGUES[0];
  const rest = QUALITY_MEET_COLLEAGUES.filter((c) => c.id !== preferred.id)
    .map((c) => ({ c, tie: hash01(state?.seed, exam?.examId || "", exam?.date || "", c.id, "qm-col") }))
    .sort((a, b) => a.tie - b.tie);
  const extra = hash01(state?.seed, exam?.examId || "", exam?.date || "", "qm-col-n") < 0.55;
  return extra && rest[0] ? [preferred, rest[0].c] : [preferred];
}

function compareClause(facts) {
  const bits = [];
  if (facts.classMath != null) bits.push(`本班「${facts.className}」数学均分 ${facts.classMath} 分`);
  else bits.push("本班这场数学成绩已经记入档案");
  if (facts.gradeMath != null) bits.push(`组内口径对照的本年级数学均分是 ${facts.gradeMath} 分`);
  return bits.join("，");
}

export function composeQualityMeetBrief(state, exam, date = state?.date) {
  if (!state || !exam) return null;
  const facts = classMathFacts(exam, state);
  const prev = previousQualityExam(state, exam);
  const prevFacts = prev ? classMathFacts(prev, state) : null;
  const delta = prevFacts ? deltaClause(facts.classMath, prevFacts.classMath) : "";
  const topics = typicalErrorTopics(state, exam, date);
  const topicLine = topics.length ? topics.join("、") : "近期作业订正";
  const colleagues = qualityMeetColleagues(state, exam, date);
  const mentor = state.player?.mentor || MENTOR_NAME;
  const avgBit = compareClause(facts) + delta;
  const leader = pickPhrase(state.seed, exam, "leader", [
    `${mentor}先通报了本年级这场「${exam.examName}」的数学均分和典型问题，强调只对照已经公布的成绩，不要另做一套未公布的全校排名表。`,
    `${mentor}主持会议，把这场「${exam.examName}」已公布的数学均分和作业里常见的错题方向跟组里对了一遍。`,
    `${mentor}作为备课组长先讲了这场「${exam.examName}」的组内口径，要求各班对照已公布均分抓订正，不改分数、也不另排名。`,
  ]);
  const colleagueLine = colleagues.map((c) => `${c.name}（${c.title}）`).join("、")
    + pickPhrase(state.seed, exam, "col-speak", [
      "也结合所带班级谈了计算失误和概念判断这两类常见问题。",
      "补充了作业订正还不够扎实的情况。",
      "顺着组长的口径，提醒把错题本落到实处。",
    ]);
  const points = [
    `对应已公布的「${exam.examName}」。${avgBit}。`,
    `典型错题方向：${topicLine}。`,
    `${leader}${colleagueLine}`,
  ];
  const shortPoints = `「${exam.examName}」${facts.classMath != null ? `本班数学均分 ${facts.classMath} 分` : "本班数学成绩已公布"}${delta}。典型错题方向：${topicLine}。${mentor}主持，${colleagues.map((c) => c.name).join("、")}到会。`;
  return {
    examId: exam.examId || exam.id,
    examName: exam.examName,
    examKind: exam.examKind,
    examDate: exam.date,
    examKey: qualityMeetExamKey(exam),
    classMath: facts.classMath,
    gradeMath: facts.gradeMath,
    delta: prevFacts && facts.classMath != null && prevFacts.classMath != null ? round1(facts.classMath - prevFacts.classMath) : null,
    topics,
    topicLine,
    leader,
    colleagueLine,
    colleagues,
    mentor,
    points,
    shortPoints,
    avgBit,
  };
}

export function composeQualityMeetMinutes(state, exam, actionId, brief = composeQualityMeetBrief(state, exam)) {
  if (!state || !exam || !brief) return "";
  const action = QUALITY_MEET_ACTIONS.find((a) => a.id === actionId);
  const playerBit = actionId === "supplement"
    ? `你结合本班作业情况作了补充，说明「${brief.topicLine}」这类错题还需要再落实订正。`
    : actionId === "askMentor"
      ? `会后你向${brief.mentor}请教了一句本班均分对照组内口径该怎么跟进订正。这不是日常向师傅请教课题，也不占用当天请教次数。`
      : "你先听记录，把组长通报的均分、进退和典型错题方向记进纪要，会上没有另外发言。";
  return `宁川中学数学备课组就已公布的「${exam.examName}」召开校内质量分析会，由备课组长${brief.mentor}主持。${brief.points.join("")}${playerBit}${QUALITY_MEET_SOURCE_NOTE}`;
}

export function qualityMeetOptionsFor(state, exam) {
  const brief = composeQualityMeetBrief(state, exam);
  return QUALITY_MEET_ACTIONS.map((a) => ({
    id: a.id,
    label: a.label,
    text: composeQualityMeetMinutes(state, exam, a.id, brief),
  }));
}

function assertAction(actionId) {
  return QUALITY_MEET_ACTIONS.find((a) => a.id === actionId) || null;
}

/**
 * 参加一场对应已公布校内考试的备课组质量分析会。不改能力、分数、排名或省控，
 * 不调用考后 AI，也不占用向师傅请教的每日次数。
 */
export function handleQualityMeet(state, actionId) {
  if (!state) return { ok: false, reason: "现在不能参加备课组质量分析会。" };
  const blocked = qualityMeetUnavailableReason(state);
  if (blocked) return { ok: false, reason: blocked };
  const exam = currentQualityMeetExam(state);
  if (!exam) return { ok: false, reason: "眼下没有已公布的本校月考、期中、期末或模拟成绩，不能开备课组质量分析会。" };
  const action = assertAction(actionId);
  if (!action) return { ok: false, reason: "请从先听记录、结合本班作业情况补充、会后向师傅请教一句这几种方式里选一种，不要另外发挥。" };
  if (hasQualityMeet(state, exam)) {
    return { ok: false, reason: `本场「${exam.examName}」的备课组质量分析会已经开过，全组只开一次，你已经参加过了。` };
  }
  const brief = composeQualityMeetBrief(state, exam);
  const minutes = composeQualityMeetMinutes(state, exam, action.id, brief);
  const rec = {
    date: state.date,
    periodId: state.periodId,
    examId: exam.examId,
    examName: exam.examName,
    examKind: exam.examKind,
    examDate: exam.date,
    entryYear: exam.entryYear,
    actionId: action.id,
    attendees: [brief.mentor, ...brief.colleagues.map((c) => c.name)],
    points: brief.points,
    shortPoints: brief.shortPoints,
    minutes,
    role: "任课数学老师",
    host: brief.mentor,
    hostTitle: "备课组长",
  };
  const box = ensureQualityMeetState(state);
  box.examKey = qualityMeetExamKey(exam);
  box.done = true;
  box.date = state.date;
  box.lastAction = action.id;
  box.lastMinutes = rec;
  state.qualityMeetings = [rec, ...(state.qualityMeetings || [])].slice(0, 12);
  const logText = `你在办公室参加了宁川中学数学备课组就「${exam.examName}」召开的校内质量分析会（${action.label}）。${minutes}`;
  return { ok: true, text: logText, rec, exam, actionId: action.id, minutes };
}
