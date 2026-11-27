/**
 * 年级会与教职工大会：任课数学老师在办公室坐班参加，不是主持人，
 * 也不是年级主任或校领导。发言要点和纪要从已有校历与本班已有事实
 * 用确定性 PRNG 生成，不用 LLM，不改能力、分数、排名、省控或备课充分度。
 * 不能代替备课、上课、阅卷或班会，也不能做成第二场备课组质量分析会。
 */
import { hash01 } from "./prng.js?v=t68u1";
import { addDays, SCHOOL_CALENDAR, formatCohortGrade, schoolYearOf, termOf, weekday } from "./calendar.js?v=t68u1";
import {
  activityEventOn, currentSlot, isEveningPeriodId, majorEventOn,
} from "./timetable.js?v=t68u1";
import { isParentsMeetingOpen } from "./parents.js?v=t68u1";
import { isOfficeSittingSlot } from "./homeVisit.js?v=t68u1";
import { isTeachersDayPlayDate } from "./teachersDay.js?v=t68u1";
import { isAwayFromClass, leaveCovering } from "./health.js?v=t68u1";
import {
  isOpeningDayPlayDate, openingCalendarEvent, openingPlayDate,
} from "./openingDay.js?v=t68u1";
import { isStudyHallSubject } from "./studyHall.js?v=t68u1";
import { playerClassStudents } from "./visits.js?v=t68u1";
import { HOMEROOM_NAME, MENTOR_NAME, PLAYER_CLASS_NO } from "./config.js?v=t68u1";
import {
  currentQualityMeetExam, isQualityMeetExamKind, qualityMeetExamKey,
  qualityMeetPublishDate, qualityMeetWindowEnd, settledQualityMeetExams,
} from "./qualityMeet.js?v=t68u1";

export const FACULTY_MEET_ACTIONS = [
  { id: "listen", label: "到场听完" },
  { id: "notes", label: "记下讲话里对本学期的校内要求" },
  { id: "askMentor", label: "会后向师傅确认一句" },
];

export const GRADE_MEET_ACTIONS = [
  { id: "listen", label: "到场听完" },
  { id: "notes", label: "记下本年级本阶段要求" },
  { id: "askMentor", label: "会后向师傅确认一句" },
];

export const FACULTY_HOST_TITLE = "校领导";
export const GRADE_DIRECTOR_NAME = "赖厚安";
export const GRADE_DIRECTOR_TITLE = "年级主任";

export const FACULTY_MEET_SOURCE_NOTE = "这是宁川中学全校教职工大会，由校领导主持。你以本班任课（实习或正式）数学老师身份到场听会，不是主持人，也不是校领导，不能因此主持班会或升职。大会不能代替备课、上课、阅卷或班会，也不会改分数、排名或省控，更不是备课组质量分析会。";

export const GRADE_MEET_SOURCE_NOTE = "这是宁川中学校内安排的年级会，由年级主任赖厚安主持；赖厚安是校内虚构人物，不是某所实校人名。你以本班任课（实习或正式）数学老师身份到场听会，不是主持人，也不是年级主任，不能因此主持班会或升职。年级会谈的是作息、纪律和下阶段安排，可以提到各科按已公布成绩跟上复习，但不宣读或改写分数、均分、排名或省控，也不是备课组质量分析会。";

export const GRADE_MEET_EXAM_KINDS = new Set(["monthly", "midterm", "final", "mock1", "mock2", "mock3"]);
export const GRADE_MEET_BLOCKED_KINDS = new Set(["city", "province", "huikao", "gaokao"]);

export function isGradeMeetExamKind(kind) {
  return GRADE_MEET_EXAM_KINDS.has(kind) && isQualityMeetExamKind(kind);
}

export function gradeMeetExamKey(exam) {
  return qualityMeetExamKey(exam);
}

export function gradeMeetPublishDate(exam) {
  return qualityMeetPublishDate(exam);
}

export function gradeMeetWindowEnd(exam, state) {
  return qualityMeetWindowEnd(exam, state);
}

export function settledGradeMeetExams(state, date = state?.date) {
  return settledQualityMeetExams(state, date);
}

export function currentGradeMeetExam(state, date = state?.date) {
  return currentQualityMeetExam(state, date);
}

export function facultyMeetKey(event) {
  return event?.id || "";
}

export function termOpeningEvent(date, calendar = SCHOOL_CALENDAR) {
  if (!date) return null;
  const season = termOf(date) === "下" ? "spring" : "fall";
  return openingCalendarEvent(schoolYearOf(date), season, calendar);
}

function lastDayOfEvent(ev) {
  const days = Number(ev?.days) > 0 ? Number(ev.days) : 1;
  return ev?.date ? addDays(ev.date, days - 1) : "";
}

/**
 * 无课周：学期开学可玩日之前、期末考试结束后到下学期开学前、
 * 以及下学期期末之后到下一学年开学前，不要硬凑大会。
 */
export function isStaffMeetNoClassDate(date, calendar = SCHOOL_CALENDAR) {
  if (!date) return true;
  const sy = schoolYearOf(date);
  const cal = calendar || SCHOOL_CALENDAR;
  const fallOpenEv = cal.find((e) => e.id === `open-${sy}-fall`);
  const springOpenEv = cal.find((e) => e.id === `open-${sy}-spring`);
  const nextFallEv = cal.find((e) => e.id === `open-${sy + 1}-fall`);
  const fallOpen = (fallOpenEv && openingPlayDate(fallOpenEv)) || fallOpenEv?.date || `${sy}-09-01`;
  const springOpen = (springOpenEv && openingPlayDate(springOpenEv)) || springOpenEv?.date || `${sy + 1}-02-22`;
  const nextFall = (nextFallEv && openingPlayDate(nextFallEv)) || nextFallEv?.date || `${sy + 1}-09-01`;
  const fallFinal = cal.find((e) => e.id === `exam-${sy}-期末考试`);
  const summerFinal = cal.find((e) => e.id === `exam-${sy}-summer-final`);
  const fallEnd = fallFinal ? lastDayOfEvent(fallFinal) : `${sy + 1}-01-18`;
  const springEnd = summerFinal ? lastDayOfEvent(summerFinal) : `${sy + 1}-06-25`;
  if (date < fallOpen) return true;
  if (date > fallEnd && date < springOpen) return true;
  if (date > springEnd && date < nextFall) return true;
  return false;
}

function examEventCovering(date, calendar = SCHOOL_CALENDAR) {
  if (!date) return null;
  return calendar.find((e) => {
    if (e.kind !== "exam") return false;
    const days = Number(e.days) > 0 ? Number(e.days) : 1;
    const last = addDays(e.date, days - 1);
    return e.date <= date && date <= last;
  }) || null;
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

function dateBlockedForWindow(date, calendar = SCHOOL_CALENDAR) {
  if (!date || weekday(date) < 1 || weekday(date) > 5) return true;
  if (isOpeningDayPlayDate(date, calendar)) return true;
  if (isTeachersDayPlayDate(date)) return true;
  if (isStaffMeetNoClassDate(date, calendar)) return true;
  if (parentsDayOn(date)) return true;
  if (blockedMajorKind(date)) return true;
  if (examEventCovering(date, calendar)) return true;
  if (activityEventOn(date)) return true;
  return false;
}

/**
 * 教职工大会日期：开学典礼/报到可玩日之后最近的上课工作日。
 * 不要开在典礼或报到当天，也不要提前到开学前，不要改到周六日。
 */
export function facultyMeetDateForOpening(event, calendar = SCHOOL_CALENDAR) {
  const play = openingPlayDate(event);
  if (!play) return "";
  let d = addDays(play, 1);
  for (let i = 0; i < 21; i++) {
    if (!dateBlockedForWindow(d, calendar)) return d;
    d = addDays(d, 1);
  }
  return "";
}

export function facultyMeetDateOfTerm(date, calendar = SCHOOL_CALENDAR) {
  const ev = termOpeningEvent(date, calendar);
  return ev ? facultyMeetDateForOpening(ev, calendar) : "";
}

export function facultyMeetOpeningEvent(date, calendar = SCHOOL_CALENDAR) {
  if (!date) return null;
  return (calendar || []).find((e) => e.kind === "opening" && facultyMeetDateForOpening(e, calendar) === date) || null;
}

export function isFacultyMeetDate(date, calendar = SCHOOL_CALENDAR) {
  return !!facultyMeetOpeningEvent(date, calendar);
}

export function hasFacultyMeet(state, event) {
  if (!state || !event) return false;
  const key = facultyMeetKey(event);
  if ((state.facultyMeetings || []).some((r) => r.eventId === key || facultyMeetKey(r) === key)) return true;
  const cur = state.facultyMeet;
  return !!(cur && cur.eventId === key && cur.done);
}

export function latestFacultyMeetMinutes(state, event) {
  if (!state) return null;
  if (event) {
    const key = facultyMeetKey(event);
    const hit = (state.facultyMeetings || []).find((r) => r.eventId === key || facultyMeetKey(r) === key);
    if (hit) return hit;
  }
  if (state.facultyMeet?.lastMinutes) return state.facultyMeet.lastMinutes;
  return (state.facultyMeetings || [])[0] || null;
}

export function ensureFacultyMeetState(state) {
  if (!state) return null;
  if (!Array.isArray(state.facultyMeetings)) state.facultyMeetings = [];
  const ev = facultyMeetOpeningEvent(state.date);
  const key = facultyMeetKey(ev);
  const done = hasFacultyMeet(state, ev);
  const last = latestFacultyMeetMinutes(state, ev);
  const cur = state.facultyMeet;
  if (!cur || typeof cur !== "object" || cur.eventId !== key) {
    state.facultyMeet = { eventId: key, done, date: last?.date || null, lastAction: last?.actionId || null, lastMinutes: last || null };
    return state.facultyMeet;
  }
  cur.done = done || !!cur.done;
  if (last && !cur.lastMinutes) cur.lastMinutes = last;
  return cur;
}

export function hasGradeMeet(state, exam) {
  if (!state || !exam) return false;
  const key = gradeMeetExamKey(exam);
  if ((state.gradeMeetings || []).some((r) => gradeMeetExamKey(r) === key || (r.examId === (exam.examId || exam.id) && r.examDate === exam.date))) {
    return true;
  }
  const cur = state.gradeMeet;
  return !!(cur && cur.examKey === key && cur.done);
}

export function latestGradeMeetMinutes(state, exam) {
  if (!state) return null;
  if (exam) {
    const key = gradeMeetExamKey(exam);
    const hit = (state.gradeMeetings || []).find((r) => gradeMeetExamKey(r) === key || (r.examId === (exam.examId || exam.id) && r.examDate === exam.date));
    if (hit) return hit;
  }
  if (state.gradeMeet?.lastMinutes) return state.gradeMeet.lastMinutes;
  return (state.gradeMeetings || [])[0] || null;
}

export function ensureGradeMeetState(state) {
  if (!state) return null;
  if (!Array.isArray(state.gradeMeetings)) state.gradeMeetings = [];
  const exam = currentGradeMeetExam(state);
  const key = gradeMeetExamKey(exam);
  const cur = state.gradeMeet;
  const done = hasGradeMeet(state, exam);
  const last = latestGradeMeetMinutes(state, exam);
  if (!cur || typeof cur !== "object" || cur.examKey !== key) {
    state.gradeMeet = { examKey: key, done, date: last?.date || null, lastAction: last?.actionId || null, lastMinutes: last || null };
    return state.gradeMeet;
  }
  cur.done = done || !!cur.done;
  if (last && !cur.lastMinutes) cur.lastMinutes = last;
  return cur;
}

function calendarBlockedReason(state, slot, date, label) {
  if (!state || !date) return `现在不能参加${label}。`;
  const s = slot && (state?.date === date) ? slot : (slot || null);
  if (isSaturday(date)) return `${label}不要改到周六，请放到平时办公室坐班时再参加。`;
  if (isSunday(date, s)) return `周日不开${label}。请放到平时办公室坐班。`;
  if (isTeachersDayPlayDate(date)) return `今天是校内教师节问候窗口，${label}请放到平时办公室坐班时再开。`;
  if (parentsDayOn(date, state)) return `今天是家长会，${label}请放到平时办公室坐班时再开。`;
  const blocked = blockedMajorKind(date);
  if (blocked === "exam" || examDayOn(date, s)) return `今天考试或学校有分班、升学安排，不开${label}。`;
  if (blocked === "activity" || activityDayOn(date, s)) return `今天是学校活动日，不开${label}。`;
  if (isOpeningDayPlayDate(date)) return `今天是开学典礼或报到可玩日，${label}不要开在这一天。`;
  return "";
}

/** 仅办公室坐班（早读或非数学正课的白天坐班）。辅导、晚自习、自习看班不可开。 */
export function isStaffMeetTimeSlot(slot, date) {
  if (!slot || !date) return false;
  if (isSunday(date, slot) || isSaturday(date)) return false;
  if (slot.isTutoring || isEveningPeriodId(slot.id)) return false;
  if (isStudyHallSubject(slot)) return false;
  return isOfficeSittingSlot(slot, date);
}

export function isFacultyMeetTimeSlot(slot, date) {
  return isStaffMeetTimeSlot(slot, date);
}

export function isGradeMeetTimeSlot(slot, date) {
  return isStaffMeetTimeSlot(slot, date);
}

function slotBlockedReason(state, slot, date, label) {
  const cal = calendarBlockedReason(state, slot, date, label);
  if (cal) return cal;
  const s = slot || currentSlot(state);
  if (s?.isMath && !s?.isTutoring) return `现在是数学正课，${label}请放到办公室坐班时再参加。`;
  if (s && (isEveningPeriodId(s.id) || s.isTutoring)) {
    return `${label}要在办公室坐班时开，不要在辅导时段整场参加，也不要在晚自习巡视时开。`;
  }
  if (s && isStudyHallSubject(s)) return `现在是自习看班节，${label}请放到办公室坐班时再参加。`;
  if (!isStaffMeetTimeSlot(s, date)) return `${label}要在办公室坐班时参加，早读或非数学正课的白天坐班都可以。`;
  return "";
}

function facultyWindowReason(state, date = state?.date) {
  const ev = facultyMeetOpeningEvent(date);
  if (ev) return "";
  if (isStaffMeetNoClassDate(date)) return "寒暑假或没有正常上课的日子，不要硬凑教职工大会。";
  const meetDate = facultyMeetDateOfTerm(date);
  if (meetDate && date < meetDate) {
    return `本学期教职工大会安排在开学典礼或报到可玩日之后的上课工作日（${meetDate}），今天还没到。不要开在典礼或报到当天，也不要提前到开学前。`;
  }
  if (meetDate && date > meetDate) {
    return "本学期这场教职工大会的窗口已经过了。每一次开学最多一次，不要另开，也不要改到周六日。";
  }
  return "眼下没有可参加的教职工大会。每一次开学（秋、春）最多一次，不要在寒暑假硬凑。";
}

function gradeExamWindowReason(state, date = state?.date) {
  const exam = currentGradeMeetExam(state, date);
  if (exam) return "";
  const settled = settledGradeMeetExams(state, date);
  const latest = settled[0];
  if (!latest) {
    return "眼下没有已公布的本校月考、期中、期末或模拟成绩，不能开年级会。联考、会考、高考后不另开这类年级会。";
  }
  const pub = gradeMeetPublishDate(latest);
  if (pub && date < pub) return `「${latest.examName}」的成绩还要等公布，公布后再到办公室坐班参加年级会。`;
  return "这场校内考试的年级会窗口已经结束。下一场月考、期中、期末或模拟，以及下学期开学、分班或毕业升学之后，要等下一次本校月考、期中、期末或模拟成绩公布再开。联考、会考、高考后不另开这类年级会。";
}

export function facultyMeetUnavailableReason(state, slot = currentSlot(state), date = state?.date) {
  const blocked = slotBlockedReason(state, slot, date, "教职工大会");
  if (blocked) return blocked;
  const windowReason = facultyWindowReason(state, date);
  if (windowReason) return windowReason;
  const ev = facultyMeetOpeningEvent(date);
  if (ev && hasFacultyMeet(state, ev)) {
    return "本学期这场教职工大会已经参加过了。每一次开学最多一次。";
  }
  return "";
}

export function gradeMeetUnavailableReason(state, slot = currentSlot(state), date = state?.date) {
  const blocked = slotBlockedReason(state, slot, date, "年级会");
  if (blocked) return blocked;
  const examReason = gradeExamWindowReason(state, date);
  if (examReason) return examReason;
  const exam = currentGradeMeetExam(state, date);
  if (exam && hasGradeMeet(state, exam)) {
    return `本场「${exam.examName}」的年级会已经开过，每一场对应考试只开一次，你已经参加过了。`;
  }
  return "";
}

export function isFacultyMeetOpen(state, slot = currentSlot(state), date = state?.date) {
  return !facultyMeetUnavailableReason(state, slot, date);
}

export function isGradeMeetOpen(state, slot = currentSlot(state), date = state?.date) {
  return !gradeMeetUnavailableReason(state, slot, date);
}

/** 当日仍是教职工大会窗口（含已参加后查阅纪要），且不是考试日/活动日/周日/家长会/开学可玩日/教师节。 */
export function isFacultyMeetWindow(state, slot = currentSlot(state), date = state?.date) {
  return !calendarBlockedReason(state, slot, date, "教职工大会") && !!facultyMeetOpeningEvent(date);
}

/** 当日仍在对应考试的年级会可开窗口（含已参加后查阅纪要）。 */
export function isGradeMeetWindow(state, slot = currentSlot(state), date = state?.date) {
  return !calendarBlockedReason(state, slot, date, "年级会") && !!currentGradeMeetExam(state, date);
}

function classLabel(state) {
  const no = state?.player?.classNo ?? PLAYER_CLASS_NO;
  return `卓行${no}班`;
}

function playerRoleBit(state) {
  return state?.player?.official ? "正式数学教师" : "数学实习教师";
}

function mentorNameOf(state) {
  return state?.player?.mentor || MENTOR_NAME;
}

function homeroomNameOf(state) {
  return state?.player?.homeroom || HOMEROOM_NAME;
}

function attendanceFacts(state, date = state?.date) {
  const students = playerClassStudents(state) || [];
  const total = students.length;
  const away = students.filter((s) => {
    if (date === state?.date && isAwayFromClass(s, state)) return true;
    return !!leaveCovering(s, date, state?.seed);
  });
  return {
    total,
    present: Math.max(0, total - away.length),
    awayCount: away.length,
    awayNames: away.slice(0, 3).map((s) => s.name),
  };
}

function pickPhrase(seed, date, key, salt, phrases) {
  const idx = Math.floor(hash01(seed, date || "", key, salt) * phrases.length) % phrases.length;
  return phrases[idx];
}

function upcomingSchoolItems(afterDate, untilDate, calendar = SCHOOL_CALENDAR) {
  if (!afterDate) return [];
  return (calendar || []).filter((e) => {
    if (!e?.date || e.date <= afterDate) return false;
    if (untilDate && e.date >= untilDate) return false;
    return e.kind === "exam" || e.kind === "activity" || e.kind === "parents" || e.kind === "opening"
      || e.kind === "placement1" || e.kind === "placement2" || e.kind === "special";
  }).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

function termCloseDate(date, calendar = SCHOOL_CALENDAR) {
  const sy = schoolYearOf(date);
  const cal = calendar || SCHOOL_CALENDAR;
  if (termOf(date) === "下") {
    const springOpen = cal.find((e) => e.id === `open-${sy + 1}-fall`);
    return springOpen?.date || `${sy + 1}-09-01`;
  }
  const spring = cal.find((e) => e.id === `open-${sy}-spring`);
  return spring?.date || `${sy + 1}-02-22`;
}

function formatUpcomingLine(items, limit = 3) {
  const cut = (items || []).slice(0, limit);
  if (!cut.length) return "本阶段后续安排以宁川中学校内公布为准";
  return cut.map((e) => `${e.date}「${e.name}」`).join("、");
}

export function composeFacultyMeetBrief(state, event, date = state?.date) {
  const ev = event || facultyMeetOpeningEvent(date) || termOpeningEvent(date);
  if (!state || !ev) return null;
  const meetDate = facultyMeetDateForOpening(ev) || date;
  const when = date || meetDate;
  const play = openingPlayDate(ev);
  const role = playerRoleBit(state);
  const cls = classLabel(state);
  const home = homeroomNameOf(state);
  const mentor = mentorNameOf(state);
  const stage = formatCohortGrade(state.player?.cohortYear, when);
  const att = attendanceFacts(state, when);
  const upcoming = upcomingSchoolItems(when, termCloseDate(when));
  const upcomingLine = formatUpcomingLine(upcoming);
  const seasonName = ev.id && ev.id.includes("spring") ? "本学期报到之后" : "开学典礼之后";
  const req = pickPhrase(state.seed, when, ev.id || meetDate, "faculty-req", [
    `校领导要求本学期按时到校、遵守校纪，课堂常规和作业订正都要落到实处，各班按宁川中学校内安排推进日常教学`,
    `讲话强调${stage.term || "本学期"}先把教学节奏稳住，出勤、课堂纪律和作业跟进都要到位，不要另搞一套校外公告日期`,
    `校领导布置本学期校内要求：跟紧各科进度，把常规管理和教学安排落到任课老师和班主任分工里`,
  ]);
  const arrange = pickPhrase(state.seed, when, ev.id || meetDate, "faculty-arr", [
    `随后对照校历说明了下阶段安排，近期主要有：${upcomingLine}。具体日期以校内公布为准。`,
    `讲话里点到了本学期后续的校内安排（${upcomingLine}），要求各教研组和年级按已公布校历执行。`,
    `校领导提醒各学科组按校历推进，不要把教职工大会开成备课组质量分析会，也不要在会上改分数。近期安排包括${upcomingLine}。`,
  ]);
  const scene = `${seasonName}召开全校教职工大会，由校领导主持。你作为${cls}的${role}到场听会，不是主持人，也不是校领导。班主任${home}也在场。`;
  const attendBit = att.awayCount
    ? `${cls}今日请假 ${att.awayCount} 人${att.awayNames.length ? `（${att.awayNames.join("、")}${att.awayCount > att.awayNames.length ? "等" : ""}）` : ""}，其余应到教师按校内安排到会。`
    : `${cls}按校内安排到会，本班应到学生均已到校。`;
  const points = [scene, attendBit, `对本学期的校内要求：${req}。`, arrange];
  const shortPoints = `${scene}${attendBit}对本学期的校内要求：${req}。近期安排：${upcomingLine}。`;
  return {
    event: ev,
    eventId: ev.id,
    calendarDate: ev.date,
    playDate: play,
    meetDate,
    kindName: "教职工大会",
    hostTitle: FACULTY_HOST_TITLE,
    role,
    classLabel: cls,
    home,
    mentor,
    stage,
    attendance: att,
    upcoming,
    upcomingLine,
    req,
    arrange,
    scene,
    points,
    shortPoints,
  };
}

export function composeFacultyMeetMinutes(state, actionId, brief = composeFacultyMeetBrief(state)) {
  if (!state || !brief) return "";
  const mentor = brief.mentor;
  let playerBit;
  if (actionId === "notes") {
    playerBit = `你记下了讲话里对本学期的校内要求：${brief.req}。`;
  } else if (actionId === "askMentor") {
    playerBit = `会后你向${mentor}确认了一句本学期校内要求该怎么落实。这不是日常向师傅请教课题，也不占用当天请教次数。`;
  } else {
    playerBit = "你到场听完，会上没有另外发言，把校领导的布置记进纪要。";
  }
  return `宁川中学召开教职工大会，由校领导主持。${brief.points.join("")}${playerBit}${FACULTY_MEET_SOURCE_NOTE}`;
}

export function facultyMeetOptionsFor(state, event, date = state?.date) {
  const brief = composeFacultyMeetBrief(state, event, date);
  return FACULTY_MEET_ACTIONS.map((a) => ({
    id: a.id,
    label: a.label,
    text: composeFacultyMeetMinutes(state, a.id, brief),
  }));
}

export function composeGradeMeetBrief(state, exam, date = state?.date) {
  if (!state || !exam) return null;
  const when = date || state.date;
  const role = playerRoleBit(state);
  const cls = classLabel(state);
  const home = homeroomNameOf(state);
  const mentor = mentorNameOf(state);
  const stage = formatCohortGrade(state.player?.cohortYear, when);
  const att = attendanceFacts(state, when);
  const end = gradeMeetWindowEnd(exam, state);
  const upcoming = upcomingSchoolItems(when, end || termCloseDate(when));
  const upcomingLine = formatUpcomingLine(upcoming);
  const director = GRADE_DIRECTOR_NAME;
  const schedule = pickPhrase(state.seed, exam.date || when, exam.examId || exam.id || "", "grade-sched", [
    `${director}对照校历布置了下阶段作息：早读、课间和晚自习都要按年级规定执行，不要把时间挪到周末另开大会。近期安排包括${upcomingLine}。`,
    `${director}讲了本阶段作息和值日安排，要求各班把迟到、课间纪律和晚自习秩序盯到位，后续安排以校内公布为准（${upcomingLine}）。`,
    `${director}说明下阶段仍按宁川中学校历上课、考试，作息不变，近期主要有${upcomingLine}。`,
  ]);
  const discipline = pickPhrase(state.seed, exam.date || when, exam.examId || exam.id || "", "grade-disc", [
    `纪律方面，年级要求各班抓好到校出勤和课堂常规，任课老师发现迟到或课间问题及时向班主任通气，不要代替班主任主持班会。`,
    `年级强调走廊纪律和晚自习安静自习，任课老师协助提醒即可，不能主持行政值班，也不能改任年级主任。`,
    `纪律要求仍按校内规定执行：不迟到、课间不喧哗，各班把常规落到实处。`,
  ]);
  const review = pickPhrase(state.seed, exam.date || when, exam.examId || exam.id || "", "grade-rev", [
    `下阶段安排上，${director}提到各科按已公布的「${exam.examName}」成绩跟上复习，会上不宣读分数、均分或排名，也不另做一套省控对照。`,
    `${director}提醒各学科按已经公布的「${exam.examName}」把复习跟上去，年级会不代替备课组质量分析会，也不改写成绩。`,
    `谈到下阶段教学，只要求各科按已公布的「${exam.examName}」跟上复习进度，不在会上读分数，也不开成第二场质量分析会。`,
  ]);
  const scene = `「${exam.examName}」成绩公布后，本年级召开年级会，由年级主任${director}主持。你作为${cls}的${role}到场听会，不是主持人，也不是年级主任。班主任${home}在场。`;
  const attendBit = att.awayCount
    ? `${cls}今日请假 ${att.awayCount} 人${att.awayNames.length ? `（${att.awayNames.join("、")}）` : ""}。`
    : `${cls}按校内安排到会。`;
  const stageBit = `${stage.term || "本学期"}本阶段以作息、纪律和下阶段安排为主。`;
  const points = [scene, attendBit, stageBit, schedule, discipline, review];
  const shortPoints = `${scene}${attendBit}${schedule}${discipline}${review}`;
  return {
    examId: exam.examId || exam.id,
    examName: exam.examName,
    examKind: exam.examKind,
    examDate: exam.date,
    examKey: gradeMeetExamKey(exam),
    kindName: "年级会",
    hostName: director,
    hostTitle: GRADE_DIRECTOR_TITLE,
    role,
    classLabel: cls,
    home,
    mentor,
    stage,
    attendance: att,
    upcoming,
    upcomingLine,
    schedule,
    discipline,
    review,
    scene,
    points,
    shortPoints,
  };
}

export function composeGradeMeetMinutes(state, exam, actionId, brief = composeGradeMeetBrief(state, exam)) {
  if (!state || !exam || !brief) return "";
  const mentor = brief.mentor;
  let playerBit;
  if (actionId === "notes") {
    playerBit = `你记下了本年级本阶段要求：${brief.schedule}${brief.discipline}`;
  } else if (actionId === "askMentor") {
    playerBit = `会后你向${mentor}确认了一句本年级本阶段要求该怎么落实。这不是日常向师傅请教课题，也不占用当天请教次数。`;
  } else {
    playerBit = "你到场听完，会上没有另外发言，把年级主任布置的作息、纪律和下阶段安排记进纪要。";
  }
  return `宁川中学召开年级会，由年级主任${brief.hostName}主持。${brief.points.join("")}${playerBit}${GRADE_MEET_SOURCE_NOTE}`;
}

export function gradeMeetOptionsFor(state, exam) {
  const brief = composeGradeMeetBrief(state, exam);
  return GRADE_MEET_ACTIONS.map((a) => ({
    id: a.id,
    label: a.label,
    text: composeGradeMeetMinutes(state, exam, a.id, brief),
  }));
}

function assertFacultyAction(actionId) {
  return FACULTY_MEET_ACTIONS.find((a) => a.id === actionId) || null;
}

function assertGradeAction(actionId) {
  return GRADE_MEET_ACTIONS.find((a) => a.id === actionId) || null;
}

/**
 * 参加本学期教职工大会。不改能力、分数、排名、省控或备课充分度，
 * 也不占用向师傅请教的每日次数。
 */
export function handleFacultyMeet(state, actionId) {
  if (!state) return { ok: false, reason: "现在不能参加教职工大会。" };
  const blocked = facultyMeetUnavailableReason(state);
  if (blocked) return { ok: false, reason: blocked };
  const ev = facultyMeetOpeningEvent(state.date);
  if (!ev) return { ok: false, reason: "眼下没有可参加的教职工大会。" };
  const action = assertFacultyAction(actionId);
  if (!action) return { ok: false, reason: "请从到场听完、记下讲话里对本学期的校内要求、会后向师傅确认一句里选一种，不要另外发挥。" };
  if (hasFacultyMeet(state, ev)) {
    return { ok: false, reason: "本学期这场教职工大会已经参加过了。每一次开学最多一次。" };
  }
  const brief = composeFacultyMeetBrief(state, ev);
  const minutes = composeFacultyMeetMinutes(state, action.id, brief);
  const rec = {
    date: state.date,
    periodId: state.periodId,
    eventId: ev.id,
    openingDate: ev.date,
    playDate: brief.playDate,
    meetDate: brief.meetDate,
    kind: "faculty",
    kindName: "教职工大会",
    actionId: action.id,
    points: brief.points,
    shortPoints: brief.shortPoints,
    minutes,
    role: "任课数学老师",
    hostTitle: FACULTY_HOST_TITLE,
  };
  const box = ensureFacultyMeetState(state);
  box.eventId = ev.id;
  box.done = true;
  box.date = state.date;
  box.lastAction = action.id;
  box.lastMinutes = rec;
  state.facultyMeetings = [rec, ...(state.facultyMeetings || [])].slice(0, 12);
  const logText = `你在办公室参加了宁川中学教职工大会（${action.label}）。${minutes}`;
  return { ok: true, text: logText, rec, event: ev, actionId: action.id, minutes };
}

/**
 * 参加一场对应已公布校内考试的年级会。不改能力、分数、排名、省控或备课充分度，
 * 不宣读均分，也不占用向师傅请教的每日次数，更不改写备课组质量分析会记录。
 */
export function handleGradeMeet(state, actionId) {
  if (!state) return { ok: false, reason: "现在不能参加年级会。" };
  const blocked = gradeMeetUnavailableReason(state);
  if (blocked) return { ok: false, reason: blocked };
  const exam = currentGradeMeetExam(state);
  if (!exam) return { ok: false, reason: "眼下没有已公布的本校月考、期中、期末或模拟成绩，不能开年级会。" };
  const action = assertGradeAction(actionId);
  if (!action) return { ok: false, reason: "请从到场听完、记下本年级本阶段要求、会后向师傅确认一句里选一种，不要另外发挥。" };
  if (hasGradeMeet(state, exam)) {
    return { ok: false, reason: `本场「${exam.examName}」的年级会已经开过，每一场对应考试只开一次，你已经参加过了。` };
  }
  const brief = composeGradeMeetBrief(state, exam);
  const minutes = composeGradeMeetMinutes(state, exam, action.id, brief);
  const rec = {
    date: state.date,
    periodId: state.periodId,
    examId: exam.examId,
    examName: exam.examName,
    examKind: exam.examKind,
    examDate: exam.date,
    entryYear: exam.entryYear,
    examKey: gradeMeetExamKey(exam),
    kind: "grade",
    kindName: "年级会",
    actionId: action.id,
    points: brief.points,
    shortPoints: brief.shortPoints,
    minutes,
    role: "任课数学老师",
    host: brief.hostName,
    hostTitle: GRADE_DIRECTOR_TITLE,
  };
  const box = ensureGradeMeetState(state);
  box.examKey = gradeMeetExamKey(exam);
  box.done = true;
  box.date = state.date;
  box.lastAction = action.id;
  box.lastMinutes = rec;
  state.gradeMeetings = [rec, ...(state.gradeMeetings || [])].slice(0, 12);
  const logText = `你在办公室参加了宁川中学年级会（${action.label}）。${minutes}`;
  return { ok: true, text: logText, rec, exam, actionId: action.id, minutes };
}
