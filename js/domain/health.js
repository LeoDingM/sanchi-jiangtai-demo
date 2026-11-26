/**
 * 健康心理：按种子确定的短期病假/事假。只影响日常出勤与作业，
 * 不编造严重病症，也不改学科能力。考试、分班、家长会和全日活动日仍到校。
 */
import { hash01, clamp } from "./prng.js?v=t51u1";
import { addDays, weekday, SCHOOL_CALENDAR } from "./calendar.js?v=t51u1";

const LEAVE_CHANCE = 0.008;
const MAX_LEAVE_DAYS = 2;

const NO_CLASS_DATES = (() => {
  const set = new Set();
  for (const e of SCHOOL_CALENDAR) {
    const block = e.kind === "exam"
      || (e.kind === "activity" && e.off === "full")
      || e.kind === "placement1" || e.kind === "placement2"
      || e.kind === "admission" || e.kind === "promote" || e.kind === "parents";
    if (!block) continue;
    const days = Number(e.days) > 0 ? Number(e.days) : 1;
    for (let i = 0; i < days; i++) set.add(addDays(e.date, i));
  }
  return set;
})();

/** 当天有正课或晚自习，需要点名出勤。周日、考试和全日停课日除外。 */
export function isDutyDay(date) {
  if (!date) return false;
  if (weekday(date) === 0) return false;
  return !NO_CLASS_DATES.has(date);
}

export function leaveStartingOn(student, date, seed) {
  if (!student || !date) return null;
  if (weekday(date) === 0) return null;
  if (NO_CLASS_DATES.has(date)) return null;
  if (hash01(student.id, date, seed, "leave-start") >= LEAVE_CHANCE) return null;
  const days = hash01(student.id, date, seed, "leave-dur") < 0.64 ? 1 : 2;
  const kh = hash01(student.id, date, seed, "leave-kind");
  const kind = kh < 0.65 ? "感冒" : kh < 0.87 ? "肠胃不适" : "事假";
  const status = kind === "事假" ? "事假" : "病假";
  return { start: date, until: addDays(date, days - 1), kind, status, days };
}

export function leaveCovering(student, date, seed) {
  if (!student || !date) return null;
  for (let i = 0; i < MAX_LEAVE_DAYS; i++) {
    const start = addDays(date, -i);
    const ep = leaveStartingOn(student, start, seed);
    if (ep && ep.start <= date && ep.until >= date) return ep;
  }
  return null;
}

export function isAwayFromClass(student, state) {
  if (!student || !state?.date) return false;
  if (!isDutyDay(state.date)) return false;
  const st = student.health;
  if (st && (st.status === "病假" || st.status === "事假") && st.start && st.until && st.start <= state.date && st.until >= state.date) {
    return true;
  }
  return !!leaveCovering(student, state.date, state.seed);
}

function leaveLabel(ep) {
  if (!ep) return "请假";
  if (ep.status === "事假") return "事假";
  return ep.kind ? `病假（${ep.kind}）` : "病假";
}

export function healthStatusLine(student, state) {
  if (!student) return "";
  const date = state?.date;
  const ep = (student.health && student.health.start && student.health.until && date
    && student.health.start <= date && student.health.until >= date)
    ? student.health
    : (date ? leaveCovering(student, date, state?.seed) : null);
  if (ep && date) {
    const label = leaveLabel(ep);
    if (isDutyDay(date)) return `今天请${label}，不在教室。假条已由班主任登记。`;
    if (weekday(date) === 0) return `本在请${label}，周日在家休息。`;
    return `本在请${label}，今日仍到校。`;
  }
  const back = student.justReturned;
  if (back?.date && date && back.date <= date && addDays(back.date, 2) >= date) {
    return `${back.date}刚结束${back.kind || "请假"}返校，还要再养一养。`;
  }
  return "近况平稳。";
}

export function classAbsences(students, state) {
  return (students || []).filter((s) => isAwayFromClass(s, state));
}

function applyLeaveStart(student, ep, date) {
  const sick = ep.status === "病假";
  student.energy = clamp((student.energy || 70) + (sick ? -8 : -2), 15, 98);
  student.mood = clamp((student.mood || 60) + (sick ? -5 : -1), 0, 100);
  if (sick) student.stress = clamp((student.stress || 40) + 2, 0, 95);
  const text = `${ep.start}起请${leaveLabel(ep)}，至${ep.until}。假条已由班主任登记。`;
  student.healthLog = [{ date: ep.start, kind: ep.kind, status: ep.status, until: ep.until, text }, ...(student.healthLog || [])].slice(0, 8);
  student.lastLeave = { ...ep, text };
  student.justReturned = null;
}

function applyReturn(student, prev, date) {
  student.energy = clamp((student.energy || 70) + 5, 20, 98);
  student.mood = clamp((student.mood || 60) + 2, 0, 100);
  const text = `${date}返校，${prev.kind || "请假"}已结束，还要再养一养。`;
  student.healthLog = [{ date, kind: "返校", status: "在校", text }, ...(student.healthLog || [])].slice(0, 8);
  student.justReturned = { date, kind: prev.kind, start: prev.start, until: prev.until };
}

export function syncStudentHealth(student, date, seed) {
  if (!student || !date) return student;
  const ep = leaveCovering(student, date, seed);
  const key = ep ? `${ep.start}|${ep.until}` : null;
  const prev = student.health || { status: "在校" };
  if (ep) {
    if (prev.appliedKey !== key) applyLeaveStart(student, ep, date);
    student.health = {
      status: ep.status,
      kind: ep.kind,
      start: ep.start,
      until: ep.until,
      appliedKey: key,
    };
  } else {
    const ended = (prev.status === "病假" || prev.status === "事假") && prev.until && prev.until < date;
    if (ended && prev.returnedKey !== prev.appliedKey) {
      applyReturn(student, prev, date);
      student.health = { status: "在校", kind: null, start: null, until: null, appliedKey: null, returnedKey: prev.appliedKey };
    } else if (!student.health || student.health.status !== "在校") {
      student.health = {
        status: "在校",
        kind: null,
        start: null,
        until: null,
        appliedKey: null,
        returnedKey: prev.returnedKey || null,
      };
    }
    if (student.justReturned?.date && addDays(student.justReturned.date, 3) < date) {
      student.justReturned = null;
    }
  }
  return student;
}

export function syncStateHealth(state) {
  if (!state?.date || !state.cohorts) return state;
  for (const c of Object.values(state.cohorts)) {
    for (const s of c.students || []) syncStudentHealth(s, state.date, state.seed);
  }
  return state;
}

export function absenceLogLine(absences, homeroom = "班主任") {
  if (!absences?.length) return "";
  const bits = absences.slice(0, 4).map((s) => `${s.name}请${leaveLabel(s.health || s)}`);
  return `${homeroom}说，${bits.join("、")}${absences.length > 4 ? "等" : ""}今天不在教室。`;
}
