/**
 * 听课与公开课：任课（实习或正式）数学老师的校内教研活动。
 * 听课笔记和公开课评语用确定性 PRNG 从已有事实长出，不用 LLM，不改能力、分数或省控。
 * 这不是接任备课组长，也不是某所实校或教育局公告的公开课周。
 */
import { pick, rngFrom } from "./prng.js?v=t69u1";
import { addDays, cmpDate, occupiedEventDates, schoolYearOf, termOf, weekday, ymd, SCHOOL_CALENDAR } from "./calendar.js?v=t69u1";
import {
  activityEventOn, currentSlot, daySchedule, isEveningPeriodId, majorEventOn, MATH_SLOTS,
} from "./timetable.js?v=t69u1";
import { isOfficeSittingSlot } from "./homeVisit.js?v=t69u1";
import { topicsForGrade } from "./teaching.js?v=t69u1";
import { MENTOR_NAME } from "./config.js?v=t69u1";

export const OBSERVE_DAY_CAP = 1;
export const OBSERVE_TERM_CAP = 8;

export const OPEN_CLASS_SOURCE_NOTE = "日期是宁川中学校内安排的组内公开课，按普通高中在第一次月考之后、期中之前（春季则在下学期月考之后、期中或市联考之前）安排公开课的惯例排入校历，不是某所实校或教育行政部门公告的公开课周。";

/** 校内虚构的数学组老师，不是某所实校教师名册。 */
export const MATH_COLLEAGUES = [
  { id: "mentor", title: "备课组长", classLabel: "数学组教研课", grade: 0 },
  { id: "fang", name: "方伯宁", title: "高一数学", classLabel: "卓行15班", grade: 1 },
  { id: "jiang", name: "江孟勤", title: "高二数学", classLabel: "凌霄8班", grade: 2 },
  { id: "han", name: "韩承业", title: "高三数学", classLabel: "云岫3班", grade: 3 },
];

export function termObserveKey(date) {
  if (!date) return "";
  return `${schoolYearOf(date)}-${termOf(date)}`;
}

export function ensureObserveState(state) {
  if (!state) return null;
  const key = termObserveKey(state.date);
  let cur = state.observe;
  if (!cur || typeof cur !== "object") {
    cur = { termKey: key, count: 0, date: null, records: [], last: null, openClassReviews: [] };
    state.observe = cur;
    return cur;
  }
  if (!Array.isArray(cur.records)) cur.records = [];
  if (!Array.isArray(cur.openClassReviews)) cur.openClassReviews = [];
  if (cur.termKey !== key) {
    cur.termKey = key;
    cur.count = 0;
    cur.date = null;
  }
  return cur;
}

function isSunday(date, slot) {
  if (date && weekday(date) === 0) return true;
  if (!slot) return false;
  return slot.id === "rest" || slot.kind === "rest";
}

function parentsDayOn(date) {
  if (!date) return false;
  const major = majorEventOn(date);
  return major?.kind === "parents";
}

function activityDayOn(date) {
  return !!activityEventOn(date);
}

function examOrStageDayOn(date, slot) {
  if (slot?.isExamDay && majorEventOn(date)?.kind !== "parents" && majorEventOn(date)?.kind !== "activity") return true;
  const major = majorEventOn(date);
  if (!major) return false;
  return major.kind === "exam" || major.kind === "placement1" || major.kind === "placement2"
    || major.kind === "admission" || major.kind === "promote";
}

export function observeUnavailableReason(state, slot = currentSlot(state), date = state?.date) {
  if (!state || !date) return "现在不能听课。";
  const s = slot || currentSlot(state);
  if (parentsDayOn(date)) return "今天是家长会，听课请放到平时办公室坐班时再去。";
  if (isSunday(date, s)) return "周日没有数学组的课可听，听课请放到平时办公室坐班时再去。";
  if (examOrStageDayOn(date, s)) return "今天考试或全校停课，不能去听课。";
  if (activityDayOn(date) || s?.isActivityPeriod) return "今天是学校活动日，不能去听课。";
  if (s?.isMath) return "现在是数学正课，听课请放到办公室坐班时再去。";
  if (s && (isEveningPeriodId(s.id) || s.isTutoring)) return "晚自习不宜去听别人的课。";
  if (!isOfficeSittingSlot(s, date) && s && (s.id === "noon" || s.kind === "break" || s.kind === "rest" || s.id === "rest")) {
    return "课间或午休不宜听课，请在早读或非数学正课的坐班时再去。";
  }
  if (!isOfficeSittingSlot(s, date)) return "听课要在办公室坐班时去，早读或非数学正课的坐班都可以。";
  const rec = ensureObserveState(state);
  if (rec.date === date) return "今天已经听过一节课，每天最多听一节。";
  if ((rec.count || 0) >= OBSERVE_TERM_CAP) return "这学期听课已经到了大约六到八节的上限，先把前面记下的消化掉，不要把组里的课都听一遍。";
  return "";
}

export function isObserveOpen(state, slot = currentSlot(state), date = state?.date) {
  return !observeUnavailableReason(state, slot, date);
}

function colleagueOf(state, teacherId) {
  const row = MATH_COLLEAGUES.find((t) => t.id === teacherId) || MATH_COLLEAGUES[0];
  const mentorName = state?.player?.mentor || MENTOR_NAME;
  if (row.id === "mentor") return { ...row, name: mentorName };
  return { ...row };
}

function teacherGrade(state, row) {
  if (row.grade > 0) return row.grade;
  const entry = state?.player?.cohortYear;
  if (!entry || !state?.date) return 1;
  const g = schoolYearOf(state.date) - Number(entry) + 1;
  return g < 1 ? 1 : (g > 3 ? 3 : g);
}

function observeSeedParts(state, teacherId, date, periodId) {
  return [state?.seed ?? 0, date || state?.date, periodId || state?.periodId, teacherId, "observe"];
}

export function composeObserveNote(state, teacherId, date = state?.date, periodId = state?.periodId) {
  const row = colleagueOf(state, teacherId);
  if (!row || !date) return null;
  const rng = rngFrom(...observeSeedParts(state, row.id, date, periodId));
  const grade = teacherGrade(state, row);
  const topic = pick(rng, topicsForGrade(grade));
  const notes = [
    "课堂节奏稳，定义写在黑板左侧，例题没有一上来就上综合。",
    "先让中等生板演再讲变式，后面几排也照顾到了。",
    "易混点反复强调，板书层次清楚，收尾留了两分钟让学生自己说步骤。",
    "作业只留了一道稍难点的，收本时点了两名没写完的。",
    "提问覆盖面比较开，不总盯着前排，变式跟得上也及时收住。",
    "把基本方法和易错步写在一角，课堂不赶，例题讲完还留了练习。",
  ];
  const note = pick(rng, notes);
  const secondPool = [
    "你记下这一处，回头备自己的课时可以对一对。",
    "你觉得这一步比自己平时讲得更清楚，准备写进听课笔记。",
    "小组里有人走神，老师用提问把人拉了回来，这点也可以学。",
  ];
  const second = pick(rng, secondPool);
  const text = `你去听了${row.title}${row.name}在${row.classLabel}的「${topic}」。记下：${note}${second}这是校内听课，不是市级评比。`;
  return {
    teacherId: row.id,
    teacherName: row.name,
    title: row.title,
    classLabel: row.classLabel,
    topic,
    notes: `${note}${second}`,
    text,
    date,
    periodId,
  };
}

export function observeChoices(state) {
  return MATH_COLLEAGUES.map((row) => {
    const info = composeObserveNote(state, row.id);
    const who = colleagueOf(state, row.id);
    const reason = info
      ? `听听${who.title}怎么处理「${info.topic}」`
      : `去听${who.title}${who.name}的一节课`;
    return {
      id: who.id,
      name: who.name,
      title: who.title,
      classLabel: who.classLabel,
      topic: info?.topic || "",
      reason,
    };
  });
}

export function observeLesson(state, teacherId) {
  if (!state) return { ok: false, reason: "现在不能听课。" };
  const blocked = observeUnavailableReason(state);
  if (blocked) return { ok: false, reason: blocked };
  const row = MATH_COLLEAGUES.find((t) => t.id === teacherId);
  if (!row) return { ok: false, reason: "请从数学组老师里选一位去听课，不要另外发挥。" };
  const rec = ensureObserveState(state);
  const note = composeObserveNote(state, teacherId, state.date, state.periodId);
  const item = {
    date: state.date,
    periodId: state.periodId,
    termKey: rec.termKey,
    teacherId: note.teacherId,
    teacherName: note.teacherName,
    title: note.title,
    classLabel: note.classLabel,
    topic: note.topic,
    notes: note.notes,
    text: note.text,
    hooked: false,
  };
  rec.date = state.date;
  rec.count = (rec.count || 0) + 1;
  rec.last = item;
  rec.records = [item, ...(rec.records || [])].slice(0, 24);
  return { ok: true, text: note.text, rec: item, teacher: colleagueOf(state, teacherId) };
}

/** 请教备课组长时，若本学期刚听过课，提一句；不改请教规则和每日上限。 */
export function mentorObserveHook(state) {
  const rec = ensureObserveState(state);
  const last = rec.last;
  if (!last || last.hooked) return "";
  if (last.termKey !== rec.termKey) return "";
  last.hooked = true;
  const mentor = state.player?.mentor || MENTOR_NAME;
  return `你顺便提了日前听的${last.teacherName}的「${last.topic}」，${mentor}点了点头，说可以把听课笔记写进下次教案里。`;
}

function eventEndDate(ev) {
  const days = Number(ev?.days) > 0 ? Number(ev.days) : 1;
  return addDays(ev.date, days - 1);
}

function fallOpenWindow(sy) {
  const monthly = SCHOOL_CALENDAR.find((e) => e.id === `exam-${sy}-第一次月考`);
  const midterm = SCHOOL_CALENDAR.find((e) => e.id === `exam-${sy}-期中考试`);
  if (!monthly || !midterm) return null;
  return { start: addDays(eventEndDate(monthly), 1), end: addDays(midterm.date, -1), preferred: ymd(sy, 10, 24) };
}

function springOpenWindow(sy) {
  const monthly = SCHOOL_CALENDAR.find((e) => e.id === `exam-${sy}-spring-monthly1`);
  const city = SCHOOL_CALENDAR.find((e) => e.id === `exam-${sy}-city`);
  const mid = SCHOOL_CALENDAR.find((e) => e.id === `exam-${sy}-spring-mid`);
  if (!monthly) return null;
  const bounds = [city, mid].filter(Boolean).map((e) => e.date).sort();
  const end = bounds.length ? addDays(bounds[0], -1) : addDays(ymd(sy + 1, 4, 24), -1);
  return { start: addDays(eventEndDate(monthly), 1), end, preferred: ymd(sy + 1, 4, 3) };
}

const OPEN_BLOCK_KINDS = new Set(["exam", "placement1", "placement2", "admission", "promote", "parents", "activity", "opening", "school"]);

function blockedOpenDates() {
  const occupied = occupiedEventDates(SCHOOL_CALENDAR.filter((e) => OPEN_BLOCK_KINDS.has(e.kind)));
  for (const e of SCHOOL_CALENDAR) {
    if (e.kind === "activity") occupied.add(e.date);
  }
  return occupied;
}

function pickDateInWindow(win, occupied) {
  if (!win) return null;
  const ok = (d) => {
    if (!d || cmpDate(d, win.start) < 0 || cmpDate(d, win.end) > 0) return false;
    if (occupied.has(d)) return false;
    if (activityEventOn(d) || majorEventOn(d)) return false;
    const wd = weekday(d);
    if (wd === 0) return false;
    const slots = MATH_SLOTS[wd] || [];
    return slots.length > 0;
  };
  const pref = win.preferred && ok(win.preferred) ? win.preferred : null;
  if (pref) return pref;
  if (win.preferred) {
    for (let d = win.preferred; cmpDate(d, win.end) <= 0; d = addDays(d, 1)) {
      if (ok(d)) return d;
    }
    for (let d = addDays(win.preferred, -1); cmpDate(d, win.start) >= 0; d = addDays(d, -1)) {
      if (ok(d)) return d;
    }
  }
  for (let d = win.start; cmpDate(d, win.end) <= 0; d = addDays(d, 1)) {
    if (ok(d)) return d;
  }
  return null;
}

function periodForDate(date) {
  const slots = MATH_SLOTS[weekday(date)] || [];
  return slots[0] || "p2";
}

function makeOpenClass(sy, term, date) {
  if (!date) return null;
  const wd = weekday(date);
  const periodId = periodForDate(date);
  return {
    id: `openclass-${sy}-${term === "上" ? "fall" : "spring"}`,
    date,
    periodId,
    weekday: wd,
    term,
    schoolYear: sy,
    termKey: `${sy}-${term}`,
    name: term === "上" ? "秋季数学组公开课" : "春季数学组公开课",
    kind: "openClass",
    sourceNote: OPEN_CLASS_SOURCE_NOTE,
  };
}

let OPEN_CLASS_LIST = null;

export function listOpenClasses(fromYear = 2015, toYear = 2030) {
  if (fromYear === 2015 && toYear === 2030 && OPEN_CLASS_LIST) return OPEN_CLASS_LIST;
  const occupied = blockedOpenDates();
  const out = [];
  for (let sy = fromYear; sy < toYear; sy++) {
    const fall = pickDateInWindow(fallOpenWindow(sy), occupied);
    const spring = pickDateInWindow(springOpenWindow(sy), occupied);
    const fe = makeOpenClass(sy, "上", fall);
    const se = makeOpenClass(sy, "下", spring);
    if (fe) out.push(fe);
    if (se) out.push(se);
  }
  out.sort((a, b) => cmpDate(a.date, b.date) || a.id.localeCompare(b.id));
  if (fromYear === 2015 && toYear === 2030) OPEN_CLASS_LIST = out;
  return out;
}

export function openClassForTerm(date, list = listOpenClasses()) {
  if (!date) return null;
  const key = termObserveKey(date);
  return list.find((e) => e.termKey === key) || null;
}

export function upcomingOpenClass(date, list = listOpenClasses()) {
  if (!date) return null;
  return list.find((e) => cmpDate(e.date, date) >= 0) || null;
}

export function upcomingOpenClasses(date, n = 6, list = listOpenClasses()) {
  if (!date) return [];
  return list.filter((e) => cmpDate(e.date, date) >= 0).slice(0, n);
}

export function openClassOnDate(date, list = listOpenClasses()) {
  if (!date) return null;
  return list.find((e) => e.date === date) || null;
}

export function openClassSlotOn(date, state = null, list = listOpenClasses()) {
  const planned = openClassOnDate(date, list);
  if (!planned) return null;
  const sched = daySchedule(date, state);
  const plannedSlot = sched.find((p) => p.id === planned.periodId);
  if (plannedSlot?.isMath) return { ...planned, periodId: plannedSlot.id, slot: plannedSlot };
  const math = sched.find((p) => p.isMath);
  if (math) return { ...planned, periodId: math.id, slot: math };
  return { ...planned, slot: plannedSlot || null };
}

export function isOpenClassDay(date) {
  return !!openClassOnDate(date);
}

export function isOpenClassPeriod(state, date = state?.date, periodId = state?.periodId) {
  const slot = openClassSlotOn(date, state);
  return !!slot && slot.periodId === periodId;
}

export function latestOpenClassReview(state) {
  const rec = state?.observe;
  const list = rec?.openClassReviews || [];
  return list[0] || null;
}

export function openClassReviewFor(state, date = state?.date) {
  const rec = state?.observe;
  return (rec?.openClassReviews || []).find((r) => r.date === date) || null;
}

function composeOpenClassReview(state, teachResult, oc) {
  const record = teachResult?.record || state.player?.lastTaught || {};
  const prep = record.prepUsed != null ? record.prepUsed : 0;
  const topic = record.topic || state.player?.lessonPlan?.topic || "本节数学课";
  const mentor = state.player?.mentor || MENTOR_NAME;
  let judgment;
  if (prep >= 2) judgment = `教案准备充分，课题「${topic}」层次清楚，例题和变式接得上。`;
  else if (prep >= 1) judgment = `「${topic}」基本讲下来了，教案有准备，个别衔接还可以再收一收。`;
  else judgment = `这节「${topic}」还能上下来，但备课不够充分，例题衔接偏紧，评语只能写得谨慎一些。`;
  const sleepyNote = (record.notes || []).find((n) => String(n).includes("走神"));
  const fact = sleepyNote ? "课堂上也看到有人走神，课后可以再盯一盯。" : "课堂上大多数人还能跟上节奏。";
  const text = `${mentor}等组内老师听完课后写下校内评语：${judgment}${fact}这是组内听课意见，不是市级评比或官方奖项。日期按宁川中学校内安排。`;
  return {
    date: oc.date,
    periodId: oc.periodId,
    termKey: oc.termKey,
    topic,
    prep,
    text,
    name: oc.name,
  };
}

/** 上完公开课后写评语。不改上课数值，不改学生能力或分数。若这节不是公开课或已写过，则什么也不做。 */
export function concludeOpenClass(state, teachResult = null) {
  if (!state?.date) return null;
  const periodId = teachResult?.periodId || state.periodId;
  const oc = openClassSlotOn(state.date, state);
  if (!oc || oc.periodId !== periodId) return null;
  const rec = ensureObserveState(state);
  if ((rec.openClassReviews || []).some((r) => r.date === oc.date && r.periodId === oc.periodId)) return null;
  const review = composeOpenClassReview(state, teachResult, oc);
  rec.openClassReviews = [review, ...(rec.openClassReviews || [])].slice(0, 12);
  return review;
}

