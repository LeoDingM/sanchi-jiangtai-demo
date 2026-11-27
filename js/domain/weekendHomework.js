/**
 * 周末分层作业布置：办公室坐班时，任课数学老师按学情布置周末作业。
 * 名单由已有本班作业/课堂事实及确定性 PRNG 生成，不用 LLM，
 * 不改能力、分数、排名或省控，不能代替备课（prepareLesson）或上课后收的随堂作业，
 * 也不改写订正主流程。玩家不是班主任。
 */
import { hash01 } from "./prng.js?v=t66u2";
import { addDays, eventsOn, SCHOOL_CALENDAR, schoolYearOf, termOf, weekday } from "./calendar.js?v=t66u2";
import {
  activityEventOn, currentSlot, isEveningPeriodId, majorEventOn, weekStart,
} from "./timetable.js?v=t66u2";
import { isOpenHomework, studentTeachingContext, suggestedTopic, topicsForGrade } from "./teaching.js?v=t66u2";
import { isParentsMeetingOpen } from "./parents.js?v=t66u2";
import { isOfficeSittingSlot } from "./homeVisit.js?v=t66u2";
import { isAwayFromClass, leaveCovering } from "./health.js?v=t66u2";
import { isOpeningDayPlayDate, openingPlayDate } from "./openingDay.js?v=t66u2";
import { isStudyHallSubject } from "./studyHall.js?v=t66u2";
import { playerClassStudents } from "./visits.js?v=t66u2";

export const WEEKEND_HW_WEEK_CAP = 1;

export const WEEKEND_HW_ACTIONS = [
  { id: "layered", label: "按订正情况分层" },
  { id: "uniform", label: "全班统一一套巩固" },
  { id: "extend", label: "给学有余力的几人加一道拓展" },
];

export const WEEKEND_HW_SOURCE_NOTE = "这是任课（实习或正式）数学老师布置的周末数学作业，不是班主任给全班另发一套作业，也不能代替备课或上课后收的那份随堂作业。分层名单按已有作业和课堂事实确定，不会改分数、排名或省控，也不会把已有订正自动判完。";

export function weekWeekendHwKey(date) {
  return weekStart(date) || "";
}

export function termWeekendHwKey(date) {
  if (!date) return "";
  return `${schoolYearOf(date)}-${termOf(date)}`;
}

/** 即将到来的那个周末（本周周六）作为本周作业的周末标记。 */
export function weekendOfKey(date) {
  if (!date) return "";
  return addDays(weekStart(date), 5);
}

export function hasWeekendHwThisWeek(state, date = state?.date) {
  if (!state || !date) return false;
  const key = weekWeekendHwKey(date);
  if ((state.weekendHomeworks || []).some((r) => (r.weekKey || weekWeekendHwKey(r.date)) === key)) return true;
  const cur = state.weekendHomework;
  return !!(cur && cur.weekKey === key && cur.done);
}

export function latestWeekendHwThisWeek(state, date = state?.date) {
  if (!state || !date) return null;
  const key = weekWeekendHwKey(date);
  const hit = (state.weekendHomeworks || []).find((r) => (r.weekKey || weekWeekendHwKey(r.date)) === key);
  if (hit) return hit;
  const cur = state.weekendHomework;
  if (cur && cur.weekKey === key && cur.lastMinutes) return cur.lastMinutes;
  return null;
}

export function latestWeekendHwMinutes(state) {
  if (!state) return null;
  if (state.weekendHomework?.lastMinutes) return state.weekendHomework.lastMinutes;
  return (state.weekendHomeworks || [])[0] || null;
}

export function weekendHwFollowUp(state, date = state?.date) {
  if (!state || !date) return null;
  const rec = latestWeekendHwThisWeek(state, date);
  if (!rec?.followUp) return null;
  return rec.followUp;
}

export function ensureWeekendHwState(state) {
  if (!state) return null;
  if (!Array.isArray(state.weekendHomeworks)) state.weekendHomeworks = [];
  const weekKey = weekWeekendHwKey(state.date);
  const termKey = termWeekendHwKey(state.date);
  const weekendKey = weekendOfKey(state.date);
  const done = hasWeekendHwThisWeek(state, state.date);
  const weekRec = latestWeekendHwThisWeek(state, state.date);
  const last = weekRec || latestWeekendHwMinutes(state);
  const cur = state.weekendHomework;
  if (!cur || typeof cur !== "object" || cur.weekKey !== weekKey) {
    state.weekendHomework = {
      weekKey,
      termKey,
      weekendKey,
      done,
      date: weekRec?.date || null,
      lastAction: weekRec?.actionId || null,
      lastMinutes: weekRec || (cur?.weekKey === weekKey ? last : null) || null,
      followUp: done ? (weekRec?.followUp || cur?.followUp || null) : null,
    };
    return state.weekendHomework;
  }
  cur.done = done || !!cur.done;
  cur.termKey = termKey;
  cur.weekendKey = weekendKey;
  if (weekRec && !cur.lastMinutes) cur.lastMinutes = weekRec;
  if (weekRec?.actionId && !cur.lastAction) cur.lastAction = weekRec.actionId;
  if (weekRec?.date && !cur.date) cur.date = weekRec.date;
  if (done && weekRec?.followUp && !cur.followUp) cur.followUp = weekRec.followUp;
  if (!done) cur.followUp = null;
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
 * 以及下学期期末之后到下一学年开学前，不要硬凑周末作业。
 */
export function isWeekendHwNoClassDate(date, calendar = SCHOOL_CALENDAR) {
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

function calendarBlockedReason(state, slot, date) {
  if (!state || !date) return "现在不能布置周末作业。";
  const s = slot && (state?.date === date) ? slot : null;
  if (isSaturday(date)) return "周末作业请在周五办公室坐班时布置，不要改到周六。";
  if (isSunday(date, s)) return "周日不开周末作业布置，周日仍留给上门家访。";
  if (parentsDayOn(date, state)) return "今天是家长会，周末作业请放到平时办公室坐班时再布置。";
  const blocked = blockedMajorKind(date);
  if (blocked === "exam" || examDayOn(date, s)) return "今天考试或学校有分班、升学安排，不能布置周末作业。";
  if (blocked === "activity" || activityDayOn(date, s)) return "今天是学校活动日，不能布置周末作业。";
  if (openingPlayOn(date)) return "今天是开学典礼或报到可玩日，周末作业不要硬凑在这一天。";
  if (isWeekendHwNoClassDate(date)) return "这周没有正常上课，不要硬凑周末作业。";
  return "";
}

/** 本周五优先；若周五被考试日/活动日/家长会/开学典礼或报到挡住，则提前到本周四。不改到周六日。 */
export function weekendHwWindowDate(date, state = null) {
  if (!date) return "";
  const mon = weekStart(date);
  if (!mon) return "";
  const thu = addDays(mon, 3);
  const fri = addDays(mon, 4);
  const usable = (d) => {
    if (!d || weekday(d) < 1 || weekday(d) > 5) return false;
    if (isWeekendHwNoClassDate(d)) return false;
    if (calendarBlockedReason(state || { date: d }, null, d)) return false;
    return true;
  };
  if (usable(fri)) return fri;
  if (usable(thu)) return thu;
  return "";
}

export function isWeekendHwWindowDate(date, state = null) {
  if (!date) return false;
  return weekendHwWindowDate(date, state) === date;
}

/** 仅办公室坐班（早读或非数学正课的白天坐班）。辅导、晚自习、自习看班不可开。 */
export function isWeekendHwTimeSlot(slot, date) {
  if (!slot || !date) return false;
  if (isSunday(date, slot) || isSaturday(date)) return false;
  if (slot.isTutoring || isEveningPeriodId(slot.id)) return false;
  if (isStudyHallSubject(slot)) return false;
  if (slot.isMath && !slot.isTutoring) return false;
  return isOfficeSittingSlot(slot, date);
}

function slotBlockedReason(state, slot, date) {
  const s = slot || currentSlot(state);
  if (s?.isMath && !s?.isTutoring) return "现在是数学正课，周末作业请放到办公室坐班时再布置。";
  if (s && (isEveningPeriodId(s.id) || s.isTutoring)) {
    return "周末作业要在办公室坐班时布置，不要在辅导时段整场占用，也不要在晚自习巡视时开。";
  }
  if (s && isStudyHallSubject(s)) return "现在是自习看班节，周末作业请放到办公室坐班时再布置。";
  if (!isWeekendHwTimeSlot(s, date)) return "周末作业要在办公室坐班时布置，早读或非数学正课的白天坐班都可以。";
  return "";
}

export function weekendHwUnavailableReason(state, slot = currentSlot(state), date = state?.date) {
  if (!state || !date) return "现在不能布置周末作业。";
  const cal = calendarBlockedReason(state, slot, date);
  if (cal) return cal;
  const win = weekendHwWindowDate(date, state);
  if (!win) return "本周没有可布置周末作业的办公室窗口。优先周五，若周五是考试日、活动日、家长会或开学典礼、报到，则提前到周四；不要改到周六日，也不要在开学事件周或无课周硬凑。";
  if (date !== win) {
    if (weekday(date) === 4 && win && weekday(win) === 5) {
      return "本周五可以布置，请放到周五办公室坐班时再布置，不要提前到周四。";
    }
    return `本周周末作业请放到${win}（${weekday(win) === 5 ? "周五" : "周四"}）办公室坐班时再布置。`;
  }
  const slotReason = slotBlockedReason(state, slot, date);
  if (slotReason) return slotReason;
  if (hasWeekendHwThisWeek(state, date)) {
    return "本周周末作业已经布置过一次，每周最多一次，请下周办公室坐班再布置。";
  }
  return "";
}

export function isWeekendHwOpen(state, slot = currentSlot(state), date = state?.date) {
  return !weekendHwUnavailableReason(state, slot, date);
}

/** 当日是本周窗口日且在办公室坐班（含已布置后查阅纪要），非窗口日不显示空面板。 */
export function isWeekendHwWindow(state, slot = currentSlot(state), date = state?.date) {
  if (!state || !date) return false;
  if (calendarBlockedReason(state, slot, date)) return false;
  if (weekendHwWindowDate(date, state) !== date) return false;
  const s = slot || currentSlot(state);
  if (s?.isMath && !s?.isTutoring) return false;
  if (s && (isEveningPeriodId(s.id) || s.isTutoring)) return false;
  if (s && isStudyHallSubject(s)) return false;
  return isWeekendHwTimeSlot(s, date);
}

function onLeave(student, state, date = state?.date) {
  if (!student || !state || !date) return false;
  if (leaveCovering(student, date, state.seed)) return true;
  if (date === state.date && isAwayFromClass(student, state)) return true;
  return false;
}

function playerGradeOn(state, date) {
  if (!state?.player?.cohortYear || !date) return 0;
  return schoolYearOf(date) - Number(state.player.cohortYear) + 1;
}

function weekTopic(state, date = state?.date) {
  const grade = playerGradeOn(state, date) || 1;
  const planTopic = state?.player?.lessonPlan?.topic || "";
  const suggest = suggestedTopic(state, grade);
  const lastTaught = state?.player?.lastTaught?.topic || (state?.player?.lessons || [])[0]?.topic || "";
  const catalog = topicsForGrade(grade) || [];
  return planTopic || suggest || lastTaught || catalog[0] || "本周数学";
}

function weaknessScore(student, state) {
  const ctx = studentTeachingContext(student, state);
  const hw = ctx?.hw;
  let p = 0;
  if (hw) {
    if (hw.status === "缺交" || hw.correction === "待补交") p += 8;
    if (hw.quality === "错题较多" || hw.quality === "未订正") p += 7;
    if (["待订正", "已订正待复查", "待面批", "已补交待面批"].includes(hw.correction)) p += 5;
    if (isOpenHomework(hw)) p += 2;
  }
  if (ctx?.flag === "走神") p += 3;
  if (ctx?.quiz && ctx.quiz.score != null && ctx.quiz.score < 60) p += 3;
  const math = Number(student.ability?.math ?? 50);
  p += (62 - math) / 20;
  return p;
}

function extensionScore(student, state, date) {
  if (onLeave(student, state, date)) return -1000;
  const ctx = studentTeachingContext(student, state);
  const hw = ctx?.hw;
  if (hw && (hw.status === "缺交" || hw.correction === "待补交")) return -80;
  let p = 0;
  const math = Number(student.ability?.math ?? 50);
  p += math / 10;
  if (ctx?.flag === "表现突出") p += 4;
  if (hw && hw.quality === "较好") p += 3;
  if (hw && (hw.quality === "错题较多" || hw.quality === "未订正")) p -= 3;
  if (ctx?.quiz && ctx.quiz.score != null && ctx.quiz.score >= 80) p += 2;
  return p;
}

function layerCount(seed, date, weekKey, tag, maxN) {
  const raw = 2 + Math.floor(hash01(seed, date || "", weekKey, tag, "weekend-hw-n") * 5);
  return Math.max(2, Math.min(8, raw, Math.max(2, maxN)));
}

function nameLine(people, limit = 8) {
  const names = (people || []).map((s) => s.name).filter(Boolean);
  if (!names.length) return "";
  const shown = names.slice(0, limit);
  return shown.join("、") + (names.length > limit ? "等" : "");
}

/**
 * 分层名单：基础、拓展各 2–8 人，其余巩固。请假不在校的学生不派拓展当面任务。
 * 两次开局同一 seed、同一周结果一致。
 */
export function composeWeekendHwLayers(state, date = state?.date) {
  if (!state || !date) return { foundation: [], extension: [], consolidateCount: 0, leaveSkipped: [], topic: "" };
  const weekKey = weekWeekendHwKey(date);
  const mates = playerClassStudents(state) || [];
  const leaveSkipped = mates.filter((s) => onLeave(s, state, date));
  const leaveIds = new Set(leaveSkipped.map((s) => s.id));
  const weakRank = mates.map((s) => ({
    student: s,
    score: weaknessScore(s, state),
    tie: hash01(state.seed, date, weekKey, s.id, "weekend-hw-weak"),
  })).sort((a, b) => (b.score - a.score) || (a.tie - b.tie) || String(a.student.id).localeCompare(String(b.student.id)));
  const extRank = mates.map((s) => ({
    student: s,
    score: extensionScore(s, state, date),
    tie: hash01(state.seed, date, weekKey, s.id, "weekend-hw-ext"),
  })).sort((a, b) => (b.score - a.score) || (a.tie - b.tie) || String(a.student.id).localeCompare(String(b.student.id)));

  const baseN = layerCount(state.seed, date, weekKey, "base", mates.length);
  const extN = layerCount(state.seed, date, weekKey, "ext", mates.length);
  const foundation = [];
  const used = new Set();
  for (const row of weakRank) {
    if (foundation.length >= baseN) break;
    foundation.push(row.student);
    used.add(row.student.id);
  }
  const extension = [];
  for (const row of extRank) {
    if (extension.length >= extN) break;
    if (used.has(row.student.id)) continue;
    if (leaveIds.has(row.student.id) || row.score < 0) continue;
    extension.push(row.student);
    used.add(row.student.id);
  }
  const consolidateCount = Math.max(0, mates.length - foundation.length - extension.length);
  return {
    foundation,
    extension,
    consolidateCount,
    leaveSkipped,
    classSize: mates.length,
    topic: weekTopic(state, date),
    weekKey,
    weekendKey: weekendOfKey(date),
    termKey: termWeekendHwKey(date),
  };
}

export function composeWeekendHwBrief(state, date = state?.date) {
  if (!state || !date) return null;
  const layers = composeWeekendHwLayers(state, date);
  const topic = layers.topic;
  const foundationLine = layers.foundation.length
    ? `基础（订正仍弱或课堂还不够稳）${nameLine(layers.foundation)}，共 ${layers.foundation.length} 人`
    : "基础层人数很少，先按巩固来";
  const extLine = layers.extension.length
    ? `拓展（学有余力）${nameLine(layers.extension)}，共 ${layers.extension.length} 人`
    : "这一周没有合适的人派拓展当面任务";
  const leaveLine = layers.leaveSkipped.length
    ? `请假不在校、不派拓展当面任务：${nameLine(layers.leaveSkipped)}。`
    : "";
  const preview = `本周末数学作业围绕「${topic}」。${foundationLine}；巩固：其余 ${layers.consolidateCount} 人；${extLine}。${leaveLine}`.trim();
  const shortPoints = preview;
  return {
    topic,
    preview,
    shortPoints,
    foundation: layers.foundation,
    extension: layers.extension,
    consolidateCount: layers.consolidateCount,
    leaveSkipped: layers.leaveSkipped,
    classSize: layers.classSize,
    foundationLine,
    extLine,
    leaveLine,
    weekKey: layers.weekKey,
    weekendKey: layers.weekendKey,
    termKey: layers.termKey,
    windowDate: weekendHwWindowDate(date, state),
  };
}

export function composeWeekendHwMinutes(state, actionId, brief = composeWeekendHwBrief(state)) {
  if (!state || !brief) return "";
  const topic = brief.topic || "本周数学";
  let playerBit = "";
  if (actionId === "layered") {
    playerBit = `你按订正情况分层布置了本周末「${topic}」作业：${brief.foundationLine}；多数同学做巩固；${brief.extLine}。`;
  } else if (actionId === "uniform") {
    playerBit = `你给全班统一布置了一套「${topic}」巩固作业，本周末不再另外分层，也不把学有余力的几人单独加码。`;
  } else if (actionId === "extend") {
    playerBit = brief.extension.length
      ? `你在全班做「${topic}」巩固的基础上，给学有余力的${nameLine(brief.extension)}加了一道拓展。${brief.leaveLine}`
      : `你本来想给学有余力的几人加一道「${topic}」拓展，但这一周没有合适的在校人选，只保留全班巩固。${brief.leaveLine}`;
  } else {
    return "";
  }
  return `你以卓行16班任课数学老师身份布置了本周末数学作业。${playerBit}${brief.leaveLine && actionId === "layered" ? brief.leaveLine : ""}这不是班主任在布置全班作业，也不能代替备课或上课后收的那份随堂作业。已留下「本周末有分层作业」的跟进标记，但不会把已有随堂作业自动判完，也不改备课充分度。${WEEKEND_HW_SOURCE_NOTE}`;
}

export function weekendHwOptionsFor(state, date = state?.date) {
  const brief = composeWeekendHwBrief(state, date);
  return WEEKEND_HW_ACTIONS.map((a) => ({
    id: a.id,
    label: a.label,
    text: composeWeekendHwMinutes(state, a.id, brief),
  }));
}

function assertAction(actionId) {
  return WEEKEND_HW_ACTIONS.find((a) => a.id === actionId) || null;
}

function layerOf(brief, studentId, actionId) {
  if (actionId === "uniform") return "巩固";
  if ((brief.extension || []).some((s) => s.id === studentId)) {
    return actionId === "layered" || actionId === "extend" ? "拓展" : "巩固";
  }
  if (actionId === "layered" && (brief.foundation || []).some((s) => s.id === studentId)) return "基础";
  return "巩固";
}

function recordStudent(state, student, actionId, brief, minutes) {
  const layer = layerOf(brief, student.id, actionId);
  const rec = {
    date: state.date,
    periodId: state.periodId,
    weekKey: brief.weekKey,
    actionId,
    layer,
    topic: brief.topic,
    text: `${state.date}周末数学作业：数学老师按「${brief.topic}」把你放在${layer}一层。这是任课老师布置的周末作业，不改分数，也不把已有订正自动判完。`,
    statusLine: `${state.date}周末作业：被安排${layer}（「${brief.topic}」）`,
    minutes,
    role: "任课数学老师",
  };
  student.lastWeekendHomework = rec;
  student.weekendHomeworkNotes = [rec, ...(student.weekendHomeworkNotes || [])].slice(0, 8);
  student.talks = [...(student.talks || []), {
    date: state.date,
    topic: "周末作业",
    text: rec.text,
    seat: student.seq != null ? student.seq : undefined,
  }];
  return rec;
}

function namedStudents(brief, actionId) {
  if (actionId === "uniform") return [...(brief.foundation || []), ...(brief.extension || [])];
  if (actionId === "extend") return [...(brief.extension || [])];
  const seen = new Set();
  const out = [];
  for (const s of [...(brief.foundation || []), ...(brief.extension || [])]) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    out.push(s);
  }
  return out;
}

/**
 * 布置本周一次周末数学作业。不改能力、分数、排名或省控，
 * 不自动完成备课，也不把随堂作业判成已改完。
 */
export function handleWeekendHomework(state, actionId) {
  if (!state) return { ok: false, reason: "现在不能布置周末作业。" };
  const blocked = weekendHwUnavailableReason(state);
  if (blocked) return { ok: false, reason: blocked };
  const action = assertAction(actionId);
  if (!action) return { ok: false, reason: "请从按订正情况分层、全班统一一套巩固、给学有余力的几人加一道拓展里选一种，不要另外发挥。" };
  if (hasWeekendHwThisWeek(state)) {
    return { ok: false, reason: "本周周末作业已经布置过一次，每周最多一次，请下周办公室坐班再布置。" };
  }
  const brief = composeWeekendHwBrief(state);
  const minutes = composeWeekendHwMinutes(state, action.id, brief);
  const followUp = {
    weekKey: brief.weekKey,
    weekendKey: brief.weekendKey,
    text: "本周末有分层作业",
    topic: brief.topic,
    actionId: action.id,
  };
  const rec = {
    date: state.date,
    periodId: state.periodId,
    weekKey: brief.weekKey,
    termKey: brief.termKey,
    weekendKey: brief.weekendKey,
    actionId: action.id,
    topic: brief.topic,
    foundationIds: (brief.foundation || []).map((s) => s.id),
    foundationNames: (brief.foundation || []).map((s) => s.name),
    extensionIds: (brief.extension || []).map((s) => s.id),
    extensionNames: (brief.extension || []).map((s) => s.name),
    consolidateCount: brief.consolidateCount,
    leaveIds: (brief.leaveSkipped || []).map((s) => s.id),
    shortPoints: brief.shortPoints,
    minutes,
    followUp,
    role: "任课数学老师",
  };
  const studentRecs = namedStudents(brief, action.id).map((s) => recordStudent(state, s, action.id, brief, minutes));
  const box = ensureWeekendHwState(state);
  box.weekKey = brief.weekKey;
  box.termKey = brief.termKey;
  box.weekendKey = brief.weekendKey;
  box.done = true;
  box.date = state.date;
  box.lastAction = action.id;
  box.lastMinutes = rec;
  box.followUp = followUp;
  state.weekendHomeworks = [rec, ...(state.weekendHomeworks || [])];
  const logText = `你在办公室布置了本周末数学作业（${action.label}）。${minutes}`;
  return { ok: true, text: logText, rec, actionId: action.id, minutes, studentRecs, followUp };
}
