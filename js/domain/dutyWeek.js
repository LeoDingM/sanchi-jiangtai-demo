/**
 * 值周与协助行政值班：任课数学老师按学期轮到的值周周，在办公室坐班时协助年级值周。
 * 名单和摘记由已有本班迟到/课堂纪律事实及确定性 PRNG 生成，不用 LLM，
 * 不改能力、分数、排名、省控或备课充分度，也不能代替上课、看班、点名或监考。
 * 玩家不是班主任，也不是值班领导；行政值班只能协助，不能主持或因此升职。
 */
import { hash01 } from "./prng.js?v=t75u2";
import { addDays, SCHOOL_CALENDAR, schoolYearOf, termOf, weekday } from "./calendar.js?v=t75u2";
import {
  activityEventOn, currentSlot, isEveningPeriodId, majorEventOn, weekStart,
} from "./timetable.js?v=t75u2";
import { isParentsMeetingOpen } from "./parents.js?v=t75u2";
import { isOfficeSittingSlot } from "./homeVisit.js?v=t75u2";
import { isAwayFromClass, leaveCovering } from "./health.js?v=t75u2";
import { isOpeningDayPlayDate, openingPlayDate } from "./openingDay.js?v=t75u2";
import { isStudyHallSubject } from "./studyHall.js?v=t75u2";
import { playerClassStudents } from "./visits.js?v=t75u2";
import { PLAYER_CLASS_NO } from "./config.js?v=t75u2";

export const DUTY_WEEKS_PER_TERM = 2;
export const DUTY_DAY_CAP = 1;
/** 第一周与第二周之间间隔的合格周数（第一周取开学典礼周之后的第 2 个合格周，即下标 1）。 */
export const DUTY_WEEK_STRIDE = 9;

export const DUTY_LEADER_NAME = "钟永泰";
export const DUTY_LEADER_TITLE = "年级值周组长";

export const DUTY_WEEK_ACTIONS = [
  { id: "gate", label: "到校门口协助清点迟到" },
  { id: "patrol", label: "课间到走廊巡视纪律" },
  { id: "minutes", label: "把值周见闻写成纪要交给值班领导" },
];

export const DUTY_WEEK_SOURCE_NOTE = "这是宁川中学校内安排的年级值周，由值班领导（年级值周组长）钟永泰带班；钟永泰是校内虚构人物，不是某所实校人名。你以本班任课（实习或正式）数学老师身份协助，不是班主任，也不是值班领导，不能主持行政值班，也不能因此升职。值周不能代替上课、看班、点名或监考，不会改分数、排名或省控，也不会改写已有的正课迟到或晚自习点名记录。";

export const DUTY_WEEK_MARK = "本周正在值周";

export function weekDutyKey(date) {
  return weekStart(date) || "";
}

export function termDutyKey(date) {
  if (!date) return "";
  return `${schoolYearOf(date)}-${termOf(date)}`;
}

export function hasDutyWeekToday(state, date = state?.date) {
  if (!state || !date) return false;
  if ((state.dutyWeeks || []).some((r) => r.date === date)) return true;
  const cur = state.dutyWeek;
  return !!(cur && cur.date === date && cur.doneToday);
}

export function latestDutyWeekToday(state, date = state?.date) {
  if (!state || !date) return null;
  const hit = (state.dutyWeeks || []).find((r) => r.date === date);
  if (hit) return hit;
  const cur = state.dutyWeek;
  if (cur && cur.date === date && cur.lastMinutes) return cur.lastMinutes;
  return null;
}

export function latestDutyWeekMinutes(state) {
  if (!state) return null;
  if (state.dutyWeek?.lastMinutes) return state.dutyWeek.lastMinutes;
  return (state.dutyWeeks || [])[0] || null;
}

export function dutyWeekFollowUp(state, date = state?.date) {
  if (!state || !date) return null;
  if (!isDutyWeek(date, state)) return null;
  const cur = state.dutyWeek;
  if (cur?.followUp) return cur.followUp;
  return { text: DUTY_WEEK_MARK, weekKey: weekDutyKey(date), termKey: termDutyKey(date) };
}

export function ensureDutyWeekState(state) {
  if (!state) return null;
  if (!Array.isArray(state.dutyWeeks)) state.dutyWeeks = [];
  const weekKey = weekDutyKey(state.date);
  const termKey = termDutyKey(state.date);
  const onDuty = isDutyWeek(state.date, state);
  const doneToday = hasDutyWeekToday(state, state.date);
  const todayRec = latestDutyWeekToday(state, state.date);
  const last = todayRec || latestDutyWeekMinutes(state);
  const cur = state.dutyWeek;
  if (!cur || typeof cur !== "object" || cur.weekKey !== weekKey) {
    state.dutyWeek = {
      weekKey,
      termKey,
      onDuty,
      doneToday,
      date: doneToday ? state.date : (cur?.date || null),
      lastAction: todayRec?.actionId || null,
      lastMinutes: todayRec || null,
      followUp: onDuty ? { text: DUTY_WEEK_MARK, weekKey, termKey } : null,
    };
  } else {
    cur.weekKey = weekKey;
    cur.termKey = termKey;
    cur.onDuty = onDuty;
    cur.doneToday = doneToday;
    if (todayRec && !cur.lastMinutes) cur.lastMinutes = todayRec;
    if (todayRec?.actionId && !cur.lastAction) cur.lastAction = todayRec.actionId;
    if (doneToday) cur.date = state.date;
    cur.followUp = onDuty ? (cur.followUp || { text: DUTY_WEEK_MARK, weekKey, termKey }) : null;
    if (onDuty && cur.followUp && !cur.followUp.text) cur.followUp.text = DUTY_WEEK_MARK;
  }
  if (last && !state.dutyWeek.lastMinutes && weekDutyKey(last.date) === weekKey) {
    state.dutyWeek.lastMinutes = last;
  }
  return state.dutyWeek;
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

function examEventCovering(date, calendar = SCHOOL_CALENDAR) {
  if (!date) return null;
  return calendar.find((e) => {
    if (e.kind !== "exam") return false;
    const days = Number(e.days) > 0 ? Number(e.days) : 1;
    const last = addDays(e.date, days - 1);
    return e.date <= date && date <= last;
  }) || null;
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

function openingPlayOn(date) {
  return isOpeningDayPlayDate(date);
}

function lastDayOfEvent(ev) {
  const days = Number(ev?.days) > 0 ? Number(ev.days) : 1;
  return ev?.date ? addDays(ev.date, days - 1) : "";
}

/**
 * 无课周：学期开学可玩日之前、期末考试结束后到下学期开学前、
 * 以及下学期期末之后到下一学年开学前，不要硬凑值周。
 */
export function isDutyWeekNoClassDate(date, calendar = SCHOOL_CALENDAR) {
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

function termDayRange(date, calendar = SCHOOL_CALENDAR) {
  const sy = schoolYearOf(date);
  const term = termOf(date);
  const cal = calendar || SCHOOL_CALENDAR;
  const fallOpenEv = cal.find((e) => e.id === `open-${sy}-fall`);
  const springOpenEv = cal.find((e) => e.id === `open-${sy}-spring`);
  const fallOpen = (fallOpenEv && openingPlayDate(fallOpenEv)) || fallOpenEv?.date || `${sy}-09-01`;
  const springOpen = (springOpenEv && openingPlayDate(springOpenEv)) || springOpenEv?.date || `${sy + 1}-02-22`;
  const fallFinal = cal.find((e) => e.id === `exam-${sy}-期末考试`);
  const summerFinal = cal.find((e) => e.id === `exam-${sy}-summer-final`);
  const fallEnd = fallFinal ? lastDayOfEvent(fallFinal) : `${sy + 1}-01-18`;
  const springEnd = summerFinal ? lastDayOfEvent(summerFinal) : `${sy + 1}-06-25`;
  if (term === "下") return { start: springOpen, end: springEnd, openPlay: springOpen };
  return { start: fallOpen, end: fallEnd, openPlay: fallOpen };
}

function calendarBlockedReason(state, slot, date) {
  if (!state || !date) return "现在不能做值周。";
  const s = slot && (state?.date === date) ? slot : null;
  if (isSaturday(date)) return "值周不要改到周六，周日仍留给上门家访。";
  if (isSunday(date, s)) return "周日不开值周，周日仍留给上门家访。";
  if (parentsDayOn(date, state)) return "今天是家长会，值周请放到值周周内平时办公室坐班时再做。";
  const blocked = blockedMajorKind(date);
  if (blocked === "exam" || examDayOn(date, s)) return "今天考试或学校有分班、升学安排，不能做值周。";
  if (blocked === "activity" || activityDayOn(date, s)) return "今天是学校活动日，不能做值周。";
  if (openingPlayOn(date)) return "今天是开学典礼或报到可玩日，值周不要硬凑在这一天。";
  if (isDutyWeekNoClassDate(date)) return "这周没有正常上课，不要硬凑值周。";
  return "";
}

function dateUsableForDuty(date, state = null) {
  if (!date || weekday(date) < 1 || weekday(date) > 5) return false;
  if (isDutyWeekNoClassDate(date)) return false;
  if (calendarBlockedReason(state || { date }, null, date)) return false;
  return true;
}

/**
 * 本学期合格值周周（周一日期）。
 * 从已有校历推：跳过开学典礼/报到所在周，只收正式上课之后、有至少一天可坐班的周；
 * 寒暑假、无课周不硬凑。每学期取约两周：第 2 个合格周，以及再隔 DUTY_WEEK_STRIDE 个合格周的那一周。
 */
export function candidateDutyWeekStarts(date, state = null, calendar = SCHOOL_CALENDAR) {
  if (!date) return [];
  const { end, openPlay } = termDayRange(date, calendar);
  const openWeek = weekStart(openPlay);
  if (!openWeek) return [];
  const weeks = [];
  let mon = addDays(openWeek, 7);
  while (mon && mon <= end) {
    const days = [0, 1, 2, 3, 4].map((i) => addDays(mon, i));
    if (days.some((d) => dateUsableForDuty(d, state))) weeks.push(mon);
    mon = addDays(mon, 7);
  }
  return weeks;
}

export function dutyWeekStartsOfTerm(date, state = null, calendar = SCHOOL_CALENDAR) {
  const weeks = candidateDutyWeekStarts(date, state, calendar);
  if (!weeks.length) return [];
  const first = weeks.length >= 2 ? 1 : 0;
  const picked = [weeks[first]];
  if (picked.length >= DUTY_WEEKS_PER_TERM) return picked.slice(0, DUTY_WEEKS_PER_TERM);
  let second = first + DUTY_WEEK_STRIDE;
  if (second >= weeks.length) second = weeks.length - 1;
  if (second !== first && weeks[second]) picked.push(weeks[second]);
  return picked.slice(0, DUTY_WEEKS_PER_TERM);
}

export function isDutyWeek(date, state = null) {
  if (!date) return false;
  const key = weekDutyKey(date);
  if (!key) return false;
  return dutyWeekStartsOfTerm(date, state).includes(key);
}

export function firstDutyWeekStart(date, state = null) {
  return dutyWeekStartsOfTerm(date, state)[0] || "";
}

/** 值周周内每个未被挡住的工作日都可开，不要改到周六日。 */
export function isDutyWeekWindowDate(date, state = null) {
  if (!date) return false;
  if (!isDutyWeek(date, state)) return false;
  return dateUsableForDuty(date, state);
}

/** 仅办公室坐班（早读或非数学正课的白天坐班）。辅导、晚自习、自习看班不可开。 */
export function isDutyWeekTimeSlot(slot, date) {
  if (!slot || !date) return false;
  if (isSunday(date, slot) || isSaturday(date)) return false;
  if (slot.isTutoring || isEveningPeriodId(slot.id)) return false;
  if (isStudyHallSubject(slot)) return false;
  if (slot.isMath && !slot.isTutoring) return false;
  return isOfficeSittingSlot(slot, date);
}

function slotBlockedReason(state, slot, date) {
  const s = slot || currentSlot(state);
  if (s?.isMath && !s?.isTutoring) return "现在是数学正课，值周请放到办公室坐班时再做。";
  if (s && (isEveningPeriodId(s.id) || s.isTutoring)) {
    return "值周要在办公室坐班时做，不要在辅导时段整场占用，也不要在晚自习巡视时开。";
  }
  if (s && isStudyHallSubject(s)) return "现在是自习看班节，值周请放到办公室坐班时再做。";
  if (!isDutyWeekTimeSlot(s, date)) return "值周要在办公室坐班时做，早读或非数学正课的白天坐班都可以。";
  return "";
}

export function dutyWeekUnavailableReason(state, slot = currentSlot(state), date = state?.date) {
  if (!state || !date) return "现在不能做值周。";
  const cal = calendarBlockedReason(state, slot, date);
  if (cal) return cal;
  if (!isDutyWeek(date, state)) {
    const weeks = dutyWeekStartsOfTerm(date, state);
    if (!weeks.length) return "本学期没有可安排的值周周。开学典礼周、寒暑假和无课周不要硬凑。";
    return `本学期值周按校内轮值安排在指定的值周周，每学期约 ${DUTY_WEEKS_PER_TERM} 周。现在不是值周周，请等到值周周的办公室坐班再协助。`;
  }
  if (!isDutyWeekWindowDate(date, state)) {
    return "今天不是本值周周可开的办公室窗口，请放到本周其他未被考试、活动、家长会或开学安排挡住的工作日再做。";
  }
  const slotReason = slotBlockedReason(state, slot, date);
  if (slotReason) return slotReason;
  if (hasDutyWeekToday(state, date)) {
    return "今天的值周已经做过一次，值周周内每个可开工作日最多一次，请明天办公室坐班再协助。";
  }
  return "";
}

export function isDutyWeekOpen(state, slot = currentSlot(state), date = state?.date) {
  return !dutyWeekUnavailableReason(state, slot, date);
}

/** 当日是值周周窗口日且在办公室坐班（含已做过当日值周后查阅纪要），非窗口日不显示空面板。 */
export function isDutyWeekWindow(state, slot = currentSlot(state), date = state?.date) {
  if (!state || !date) return false;
  if (calendarBlockedReason(state, slot, date)) return false;
  if (!isDutyWeekWindowDate(date, state)) return false;
  const s = slot || currentSlot(state);
  if (s?.isMath && !s?.isTutoring) return false;
  if (s && (isEveningPeriodId(s.id) || s.isTutoring)) return false;
  if (s && isStudyHallSubject(s)) return false;
  return isDutyWeekTimeSlot(s, date);
}

function onLeave(student, state, date = state?.date) {
  if (!student || !state || !date) return false;
  if (leaveCovering(student, date, state.seed)) return true;
  if (date === state.date && isAwayFromClass(student, state)) return true;
  return false;
}

function classLabel(state) {
  const no = state?.player?.classNo ?? PLAYER_CLASS_NO;
  return `卓行${no}班`;
}

function nameLine(people, limit = 6) {
  const names = (people || []).map((s) => s.name).filter(Boolean);
  if (!names.length) return "";
  const shown = names.slice(0, limit);
  return shown.join("、") + (names.length > limit ? "等" : "");
}

function gateScore(student) {
  let p = 0;
  if (student.lastClassLate?.date) p += 12;
  return p;
}

function patrolScore(student) {
  let p = 0;
  if (student.lastClassFlag === "走神") p += 12;
  if ((student.energy ?? 70) < 50) p += 2;
  return p;
}

function pickNamed(state, date, weekKey, tag, students, scoreFn, minN = 2, maxN = 4) {
  const present = (students || []).filter((s) => !onLeave(s, state, date));
  if (!present.length) return [];
  const ranked = present.map((s) => ({
    student: s,
    score: scoreFn(s),
    tie: hash01(state.seed, date, weekKey, s.id, tag, "duty-week"),
  })).sort((a, b) => (b.score - a.score) || (a.tie - b.tie) || String(a.student.id).localeCompare(String(b.student.id)));
  const span = Math.max(0, maxN - minN);
  const raw = minN + Math.floor(hash01(state.seed, date, weekKey, tag, "duty-week-n") * (span + 1));
  const n = Math.max(1, Math.min(maxN, raw, present.length, 5));
  return ranked.slice(0, n).map((r) => r.student);
}

export function composeDutyWeekBrief(state, date = state?.date) {
  if (!state || !date) return null;
  const weekKey = weekDutyKey(date);
  const termKey = termDutyKey(date);
  const mates = playerClassStudents(state) || [];
  const leaveSkipped = mates.filter((s) => onLeave(s, state, date));
  const latePrior = mates.filter((s) => s.lastClassLate?.date && !onLeave(s, state, date));
  const flagPrior = mates.filter((s) => s.lastClassFlag === "走神" && !onLeave(s, state, date));
  const gate = pickNamed(state, date, weekKey, "gate", mates, gateScore);
  const patrol = pickNamed(state, date, weekKey, "patrol", mates, patrolScore);
  const leaveLine = leaveSkipped.length
    ? `请假不在校、不记在门口看见的名单里：${nameLine(leaveSkipped)}。`
    : "";
  const gateLine = gate.length
    ? `门口见到本班${nameLine(gate)}共 ${gate.length} 人偏晚到或需要提醒按时进校`
    : "门口没有要把本班请假不在校的人写成看见，眼下也没有要登记的迟到";
  const patrolLine = patrol.length
    ? `走廊巡视时记下喧哗或追逐的${nameLine(patrol)}共 ${patrol.length} 人，只记这几人，不把全班点一遍`
    : "走廊巡视时本班这一带大体平稳，没有要把全班都写进去";
  const preview = `本周是年级值周周，由值班领导（${DUTY_LEADER_TITLE}）${DUTY_LEADER_NAME}带班，你以${classLabel(state)}任课数学老师身份协助。今日：${gateLine}；${patrolLine}。${leaveLine}`.trim();
  return {
    preview,
    shortPoints: preview,
    gate,
    patrol,
    leaveSkipped,
    latePrior,
    flagPrior,
    leaveLine,
    gateLine,
    patrolLine,
    weekKey,
    termKey,
    classLabel: classLabel(state),
    leaderName: DUTY_LEADER_NAME,
    leaderTitle: DUTY_LEADER_TITLE,
    onDuty: true,
    followUp: { text: DUTY_WEEK_MARK, weekKey, termKey },
  };
}

export function composeDutyWeekMinutes(state, actionId, brief = composeDutyWeekBrief(state)) {
  if (!state || !brief) return "";
  const cls = brief.classLabel || classLabel(state);
  const leader = `值班领导（${brief.leaderTitle || DUTY_LEADER_TITLE}）${brief.leaderName || DUTY_LEADER_NAME}`;
  let playerBit = "";
  if (actionId === "gate") {
    playerBit = `你到校门口或教学楼门口协助清点迟到。${brief.gateLine}。${brief.leaveLine}这是按已有正课迟到和出勤事实加确定性规则看到的当日几人，不是重算或改写上课迟到记录。`;
  } else if (actionId === "patrol") {
    playerBit = `你在课间到走廊巡视纪律。${brief.patrolLine}。你只协助看秩序，不代班主任训话，也不主持班会。`;
  } else if (actionId === "minutes") {
    playerBit = `你把今日值周见闻写成纪要交给${leader}：${brief.gateLine}；${brief.patrolLine}。${brief.leaveLine}你顺带协助${leader}做了行政值班交接，把纪要交给他留守或交接给下一班。你没有主持行政值班，职务也没有变化。`;
  } else {
    return "";
  }
  return `你以${cls}任课数学老师身份协助年级值周。${playerBit}你不是班主任，也不是值班领导，不能因此升职。已留下「${DUTY_WEEK_MARK}」的标记，但不改能力、分数或备课充分度。${DUTY_WEEK_SOURCE_NOTE}`;
}

export function dutyWeekOptionsFor(state, date = state?.date) {
  const brief = composeDutyWeekBrief(state, date);
  return DUTY_WEEK_ACTIONS.map((a) => ({
    id: a.id,
    label: a.label,
    text: composeDutyWeekMinutes(state, a.id, brief),
  }));
}

function assertAction(actionId) {
  return DUTY_WEEK_ACTIONS.find((a) => a.id === actionId) || null;
}

function namedStudents(brief, actionId) {
  if (actionId === "gate") return [...(brief.gate || [])];
  if (actionId === "patrol") return [...(brief.patrol || [])];
  const seen = new Set();
  const out = [];
  for (const s of [...(brief.gate || []), ...(brief.patrol || [])]) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    out.push(s);
  }
  return out;
}

function recordStudent(state, student, actionId, brief, minutes) {
  let what = "值周时被数学老师记下近况";
  if (actionId === "gate") what = "值周时在校门口被协助清点，记到偏晚到或需要提醒按时进校";
  else if (actionId === "patrol") what = "值周时在走廊巡视中被记下喧哗或追逐";
  else if (actionId === "minutes") what = "值周纪要里写到了当日门口或走廊见闻";
  const rec = {
    date: state.date,
    periodId: state.periodId,
    weekKey: brief.weekKey,
    actionId,
    text: `${state.date}年级值周：任课数学老师协助值周，${what}。这不是班主任处理，也不改分数，不改写已有正课迟到记录。`,
    statusLine: `${state.date}值周：${what}`,
    minutes,
    role: "任课数学老师",
  };
  student.lastDutyWeek = rec;
  student.dutyWeekNotes = [rec, ...(student.dutyWeekNotes || [])].slice(0, 8);
  return rec;
}

/**
 * 值周周窗口内做一次协助。不改能力、分数、排名、省控或备课充分度，
 * 不改写正课迟到生成或晚自习点名，也不能主持行政值班。
 */
export function handleDutyWeek(state, actionId) {
  if (!state) return { ok: false, reason: "现在不能做值周。" };
  const blocked = dutyWeekUnavailableReason(state);
  if (blocked) return { ok: false, reason: blocked };
  const action = assertAction(actionId);
  if (!action) return { ok: false, reason: "请从到校门口协助清点迟到、课间到走廊巡视纪律、把值周见闻写成纪要交给值班领导里选一种，不要另外发挥。" };
  if (hasDutyWeekToday(state)) {
    return { ok: false, reason: "今天的值周已经做过一次，值周周内每个可开工作日最多一次，请明天办公室坐班再协助。" };
  }
  const brief = composeDutyWeekBrief(state);
  const minutes = composeDutyWeekMinutes(state, action.id, brief);
  const followUp = {
    weekKey: brief.weekKey,
    termKey: brief.termKey,
    text: DUTY_WEEK_MARK,
  };
  const rec = {
    date: state.date,
    periodId: state.periodId,
    weekKey: brief.weekKey,
    termKey: brief.termKey,
    actionId: action.id,
    gateIds: (brief.gate || []).map((s) => s.id),
    gateNames: (brief.gate || []).map((s) => s.name),
    patrolIds: (brief.patrol || []).map((s) => s.id),
    patrolNames: (brief.patrol || []).map((s) => s.name),
    leaveIds: (brief.leaveSkipped || []).map((s) => s.id),
    shortPoints: brief.shortPoints,
    minutes,
    followUp,
    role: "任课数学老师",
    leaderName: DUTY_LEADER_NAME,
    leaderTitle: DUTY_LEADER_TITLE,
  };
  const studentRecs = namedStudents(brief, action.id).map((s) => recordStudent(state, s, action.id, brief, minutes));
  const box = ensureDutyWeekState(state);
  box.weekKey = brief.weekKey;
  box.termKey = brief.termKey;
  box.onDuty = true;
  box.doneToday = true;
  box.date = state.date;
  box.lastAction = action.id;
  box.lastMinutes = rec;
  box.followUp = followUp;
  state.dutyWeeks = [rec, ...(state.dutyWeeks || [])];
  const logText = `你协助年级值周（${action.label}）。${minutes}`;
  return { ok: true, text: logText, rec, actionId: action.id, minutes, studentRecs, followUp };
}
