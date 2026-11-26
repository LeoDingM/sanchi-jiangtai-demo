/**
 * 任教班课表：一天里哪几节是数学课。编制为宁川中学示意课表，
 * 不照搬某所真实中学的作息；用确定性星期模板，不用随机排课。
 */
import { PERIODS } from "./config.js?v=t55u1";
import { addDays, weekday, weekdayName, eventsOn, SCHOOL_CALENDAR } from "./calendar.js?v=t55u1";

/** 周一至周五全天；周六只上到午休（上午课）；周日休息。 */
const WEEKDAY_PERIODS = {
  1: PERIODS.map((p) => p.id),
  2: PERIODS.map((p) => p.id),
  3: PERIODS.map((p) => p.id),
  4: PERIODS.map((p) => p.id),
  5: PERIODS.map((p) => p.id),
  6: PERIODS.filter((p) => ["morning-read", "p1", "p2", "p3", "p4", "noon"].includes(p.id)).map((p) => p.id),
  0: ["rest"],
};

/**
 * 普通班数学正课约 6 节（含周六上午一节）。周一晚自习一是数学晚自习，
 * 周二晚自习二是数学答疑，另算辅导时段，不按正课「上课」结算课题。
 * 早读以语文/英语为主，不把每天早读都算成数学课。
 */
const MATH_SLOTS = {
  1: ["p2"],
  2: ["p4"],
  3: ["p1"],
  4: ["p3"],
  5: ["p2"],
  6: ["p3"],
  0: [],
};

/** 数学晚自习 / 数学答疑，用于巡视、座位旁答疑和收订正。 */
const TUTOR_SLOTS = {
  1: ["evening-1"],
  2: ["evening-2"],
  3: [],
  4: [],
  5: [],
  6: [],
  0: [],
};

const SUBJECTS_MIXED = {
  1: { "morning-read": "语文早读", p1: "语文", p2: "数学", p3: "英语", p4: "物理", p5: "化学", p6: "历史", p7: "体育", p8: "政治", "evening-1": "数学晚自习", "evening-2": "英语晚自习" },
  2: { "morning-read": "英语早读", p1: "英语", p2: "语文", p3: "物理", p4: "数学", p5: "地理", p6: "化学", p7: "班会", p8: "历史", "evening-1": "语文晚自习", "evening-2": "数学答疑" },
  3: { "morning-read": "语文早读", p1: "数学", p2: "英语", p3: "化学", p4: "语文", p5: "物理", p6: "自习", p7: "政治", p8: "体育", "evening-1": "英语晚自习", "evening-2": "语文晚自习" },
  4: { "morning-read": "英语早读", p1: "物理", p2: "语文", p3: "数学", p4: "英语", p5: "历史", p6: "化学", p7: "地理", p8: "自习", "evening-1": "化学晚自习", "evening-2": "英语晚自习" },
  5: { "morning-read": "语文早读", p1: "英语", p2: "数学", p3: "语文", p4: "物理", p5: "化学", p6: "体育", p7: "政治", p8: "历史", "evening-1": "语文晚自习", "evening-2": "自习" },
  6: { "morning-read": "英语早读", p1: "语文", p2: "英语", p3: "数学", p4: "物理", noon: "午休（周六下午休息）" },
  0: { rest: "周日休息" },
};

const SUBJECTS_LI = {
  ...SUBJECTS_MIXED,
  2: { ...SUBJECTS_MIXED[2], p5: "生物", p8: "化学" },
  4: { ...SUBJECTS_MIXED[4], p5: "生物", p7: "英语" },
  5: { ...SUBJECTS_MIXED[5], p7: "生物", p8: "自习" },
};

const SUBJECTS_WEN = {
  ...SUBJECTS_MIXED,
  1: { ...SUBJECTS_MIXED[1], p4: "历史", p5: "地理" },
  2: { ...SUBJECTS_MIXED[2], p3: "政治", p6: "地理" },
  3: { ...SUBJECTS_MIXED[3], p3: "历史", p5: "地理" },
  4: { ...SUBJECTS_MIXED[4], p1: "政治", p6: "历史" },
  5: { ...SUBJECTS_MIXED[5], p4: "地理", p5: "历史" },
  6: { ...SUBJECTS_MIXED[6], p4: "政治" },
};

const MAJOR_KINDS = new Set(["exam", "placement1", "placement2", "admission", "promote", "parents"]);
const AFTERNOON_ACTIVITY_IDS = new Set(["p5", "p6", "p7", "p8", "evening-1", "evening-2"]);

/** 可调、可借的正课节次。早读、午休、晚自习不在此列。 */
export const CLASS_PERIOD_IDS = ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"];
const CLASS_PERIOD_SET = new Set(CLASS_PERIOD_IDS);

export function isClassPeriodId(periodId) {
  return CLASS_PERIOD_SET.has(periodId);
}

/** 本周周一（周日算在刚刚结束的这一周里）。 */
export function weekStart(date) {
  if (!date) return date;
  const wd = weekday(date);
  const back = wd === 0 ? 6 : wd - 1;
  return addDays(date, -back);
}

export function weekDates(date) {
  const mon = weekStart(date);
  return Array.from({ length: 7 }, (_, i) => addDays(mon, i));
}

export function overridesOf(state) {
  return Array.isArray(state?.timetableOverrides) ? state.timetableOverrides : [];
}

/** 同一节若写过多次覆盖，以最后一条为准。 */
export function overrideFor(state, date, periodId) {
  const list = overridesOf(state);
  for (let i = list.length - 1; i >= 0; i--) {
    const o = list[i];
    if (o && o.date === date && o.periodId === periodId) return o;
  }
  return null;
}

export function templateSubject(date, periodId, state = null) {
  const wd = weekday(date);
  const track = playerTrackOf(state);
  const table = subjectTable(track)[wd] || subjectTable(track)[1];
  return table[periodId] || null;
}

export function periodsForWeekday(wd) {
  const ids = WEEKDAY_PERIODS[wd] || WEEKDAY_PERIODS[1];
  return ids.map((id) => {
    if (id === "rest") return { id: "rest", name: "周日休息", short: "休息", kind: "rest", clock: "" };
    return PERIODS.find((p) => p.id === id) || { id, name: id, short: id, kind: "class", clock: "" };
  });
}

export function isMathPeriodId(wd, periodId) {
  return (MATH_SLOTS[wd] || []).includes(periodId);
}

export function isTutoringPeriodId(wd, periodId) {
  return (TUTOR_SLOTS[wd] || []).includes(periodId);
}

export function isEveningPeriodId(periodId) {
  return periodId === "evening-1" || periodId === "evening-2";
}

function subjectTable(track) {
  if (track === "wen") return SUBJECTS_WEN;
  if (track === "li") return SUBJECTS_LI;
  return SUBJECTS_MIXED;
}

export function playerTrackOf(state) {
  if (!state?.player) return "mixed";
  const c = state.cohorts?.[state.player.cohortYear];
  const s = c?.students?.find((x) => x.classNo === state.player.classNo && !x.repeat);
  if (s?.track === "wen") return "wen";
  if (s?.track === "li") return "li";
  return "mixed";
}

export function activityEventOn(date) {
  return (eventsOn(date, SCHOOL_CALENDAR) || []).find((e) => e.kind === "activity") || null;
}

/** 全日停课的大事：考试、分班、录取、升学、家长会，以及全日停课的学校活动（如运动会）。 */
export function majorEventOn(date) {
  const evs = eventsOn(date, SCHOOL_CALENDAR) || [];
  return evs.find((e) => {
    if (e.kind === "activity") return e.off === "full";
    return MAJOR_KINDS.has(e.kind);
  }) || null;
}

export function isAfternoonActivityPeriodId(periodId) {
  return AFTERNOON_ACTIVITY_IDS.has(periodId);
}

/** 该节是否被学校活动占用（运动会全日，迎新年为下午和晚自习）。 */
export function periodIsActivity(ev, periodId, periodKind = "class") {
  if (!ev || ev.kind !== "activity") return false;
  if (ev.off === "full") return periodKind !== "break" && periodKind !== "rest";
  if (ev.off === "afternoon") return isAfternoonActivityPeriodId(periodId);
  return false;
}

export function pendingMajorEvent(state, date = state?.date) {
  const ev = majorEventOn(date);
  if (!ev) return null;
  if (state?.flags?.[`done-${ev.id}`]) return null;
  return ev;
}

export function daySchedule(date, state = null) {
  const wd = weekday(date);
  const track = playerTrackOf(state);
  const table = subjectTable(track)[wd] || subjectTable(track)[1];
  const major = majorEventOn(date);
  const activity = activityEventOn(date);
  const periods = periodsForWeekday(wd);
  return periods.map((p) => {
    const activitySlot = !major && periodIsActivity(activity, p.id, p.kind);
    const blocked = !!major || activitySlot;
    const evName = major?.name || (activitySlot ? activity.name : null);
    let subject;
    if (major) {
      subject = (p.kind === "break" || p.kind === "rest" ? (table[p.id] || p.name) : `停课 · ${major.name}`);
    } else if (activitySlot) {
      subject = (p.kind === "break" || p.kind === "rest" ? (table[p.id] || p.name) : `活动 · ${activity.name}`);
    } else {
      subject = table[p.id] || p.name;
    }
    let isMath = !blocked && isMathPeriodId(wd, p.id);
    const isTutoring = !blocked && isTutoringPeriodId(wd, p.id);
    const ov = !blocked && overrideFor(state, date, p.id);
    if (ov) {
      if (ov.subject) subject = ov.subject;
      isMath = ov.isMath != null ? !!ov.isMath : subject === "数学";
    }
    return {
      ...p,
      weekday: wd,
      weekdayName: weekdayName(date),
      subject,
      isMath,
      isTutoring,
      isExamDay: !!major,
      isActivityPeriod: !!blocked && !!(major?.kind === "activity" || activitySlot),
      eventName: evName,
      override: ov || null,
    };
  });
}

export function weekSchedule(date, state = null) {
  return weekDates(date).map((d) => ({
    date: d,
    weekday: weekday(d),
    weekdayName: weekdayName(d),
    periods: daySchedule(d, state),
  }));
}

export function startPeriodId(date, state = null) {
  const sched = daySchedule(date, state);
  return (sched.find((p) => p.id !== "rest") || sched[0])?.id || "morning-read";
}

export function currentSlot(state) {
  if (!state?.date) return null;
  const sched = daySchedule(state.date, state);
  return sched.find((p) => p.id === state.periodId) || sched[0] || null;
}

export function nextPeriodAfter(state) {
  const sched = daySchedule(state.date, state);
  const idx = sched.findIndex((p) => p.id === state.periodId);
  if (idx >= 0 && idx < sched.length - 1) {
    const slot = sched[idx + 1];
    if (slot.id !== "rest") return { date: state.date, slot, rolledDay: false };
  }
  let d = addDays(state.date, 1);
  for (let i = 0; i < 10; i++) {
    const s = daySchedule(d, state);
    const first = s.find((p) => p.id !== "rest");
    if (first) return { date: d, slot: first, rolledDay: true };
    d = addDays(d, 1);
  }
  return null;
}

/** 本节或之后最近的一节数学课。sameDay 只看当天。 */
export function upcomingMath(state, { sameDay = false, skipTaught = true } = {}) {
  if (!state?.date) return null;
  const skipKey = skipTaught ? state.taughtPeriodKey : null;
  const cur = currentSlot(state);
  if (cur?.isMath && `${state.date}|${cur.id}` !== skipKey) {
    return { date: state.date, slot: cur, sameDay: true };
  }
  const later = nextMathOnDay(state.date, state, state.periodId, skipKey);
  if (later) return { date: state.date, slot: later, sameDay: true };
  if (sameDay) return null;
  let d = addDays(state.date, 1);
  for (let i = 0; i < 14; i++) {
    const slot = nextMathOnDay(d, state, null, null);
    if (slot) return { date: d, slot, sameDay: false };
    d = addDays(d, 1);
  }
  return null;
}

function nextMathOnDay(date, state, afterPeriodId, skipKey) {
  const sched = daySchedule(date, state);
  const idx = afterPeriodId ? sched.findIndex((p) => p.id === afterPeriodId) : -1;
  return sched.slice(idx + 1).find((p) => p.isMath && `${date}|${p.id}` !== skipKey) || null;
}

export function upcomingTutoring(state, { sameDay = false } = {}) {
  if (!state?.date) return null;
  const cur = currentSlot(state);
  if (cur?.isTutoring) return { date: state.date, slot: cur, sameDay: true };
  const later = nextTutorOnDay(state.date, state, state.periodId);
  if (later) return { date: state.date, slot: later, sameDay: true };
  if (sameDay) return null;
  let d = addDays(state.date, 1);
  for (let i = 0; i < 14; i++) {
    const slot = nextTutorOnDay(d, state, null);
    if (slot) return { date: d, slot, sameDay: false };
    d = addDays(d, 1);
  }
  return null;
}

function nextTutorOnDay(date, state, afterPeriodId) {
  const sched = daySchedule(date, state);
  const idx = afterPeriodId ? sched.findIndex((p) => p.id === afterPeriodId) : -1;
  return sched.slice(idx + 1).find((p) => p.isTutoring) || null;
}

export function isTutoringSlot(slot) {
  return !!slot?.isTutoring;
}

export function formatSlotLabel(slot) {
  if (!slot) return "";
  const time = slot.clock ? ` ${slot.clock}` : "";
  return `${slot.name}${time} ${slot.subject || ""}`.trim();
}

/** 不传日期时仍返回星期模板上的数学正课数；传入日期和存档后，按该周实际课表（含调借）计算。 */
export function weekMathCount(date, state) {
  if (!date) {
    return Object.values(MATH_SLOTS).reduce((n, arr) => n + arr.length, 0);
  }
  return weekDates(date).reduce((n, d) => n + daySchedule(d, state).filter((p) => p.isMath).length, 0);
}

export { PERIODS, MATH_SLOTS, TUTOR_SLOTS };
