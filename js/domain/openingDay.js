/**
 * 开学日：校历每年秋季 9 月 1 日「N学年开学」、春季 2 月 22 日「下学期开学」已有 kind: "opening"。
 * 秋季做成开学典礼，春季做成报到（不是第二场全校典礼）。
 * 若适逢周六或周日，可玩窗口后移到之后最近的上课工作日，不前移到学期开始前。
 * 当天数学正课仍可上，不是全天停课活动，也不加入 MAJOR_KINDS。
 * 文案由已有本班/学校事实与确定性 PRNG 生成，不用 LLM，不改能力、分数、排名或省控。
 * 玩家以本班任课（实习或正式）数学老师身份随班参加，不是典礼主持人或班主任。
 */
import { hash01 } from "./prng.js?v=t65u1";
import {
  addDays, formatCohortGrade, SCHOOL_CALENDAR, weekday,
} from "./calendar.js?v=t65u1";
import { activityEventOn, currentSlot, isEveningPeriodId, majorEventOn } from "./timetable.js?v=t65u1";
import { isOfficeSittingSlot } from "./homeVisit.js?v=t65u1";
import { isAwayFromClass, leaveCovering } from "./health.js?v=t65u1";
import { playerClassStudents } from "./visits.js?v=t65u1";
import { HOMEROOM_NAME, PLAYER_CLASS_NO } from "./config.js?v=t65u1";

export const OPENING_DAY_SOURCE_NOTE = "这是宁川中学校内的开学安排，秋季开学日举行开学典礼，春季为报到；日期按校历每年 9 月 1 日、2 月 22 日排入，若适逢周末则在之后最近的上课工作日进行。不是某所实校或教育行政部门公告的日期。你以本班任课（实习或正式）数学老师身份随卓行班站队或到教室参加，不是典礼主持人或班主任。";

export const FALL_OPENING_ACTIONS = [
  { id: "stand", label: "随班站队听完" },
  { id: "note", label: "记下讲话里对本学年的要求" },
  { id: "count", label: "协助赵映秋清点本班到校" },
];

export const SPRING_OPENING_ACTIONS = [
  { id: "look", label: "到教室看返校情况" },
  { id: "count", label: "协助清点人数" },
  { id: "note", label: "记下本学期安排" },
];

export function isFallOpeningEvent(ev) {
  return !!(ev && ev.kind === "opening" && /学年开学$/.test(ev.name || "") && !/下学期/.test(ev.name || ""));
}

export function isSpringOpeningEvent(ev) {
  return !!(ev && ev.kind === "opening" && (/下学期/.test(ev.name || "") || String(ev.id || "").endsWith("-spring")));
}

export function openingEventKind(ev) {
  if (isFallOpeningEvent(ev)) return "ceremony";
  if (isSpringOpeningEvent(ev)) return "report";
  return "";
}

export function openingEventKindName(ev) {
  return openingEventKind(ev) === "ceremony" ? "开学典礼" : openingEventKind(ev) === "report" ? "报到" : "";
}

export function openingCalendarEvent(schoolYear, season = "fall", calendar = SCHOOL_CALENDAR) {
  const sy = Number(schoolYear);
  if (!Number.isFinite(sy)) return null;
  const id = season === "spring" ? `open-${sy}-spring` : `open-${sy}-fall`;
  return (calendar || []).find((e) => e.id === id) || null;
}

/**
 * 可玩日：开学日若是周一至周五，就在当天；若适逢周末，后移到之后最近的上课工作日，不前移。
 */
export function openingPlayDate(event) {
  if (!event?.date) return "";
  const nominal = event.date;
  const wd = weekday(nominal);
  if (wd >= 1 && wd <= 5) return nominal;
  let d = addDays(nominal, 1);
  for (let i = 0; i < 10; i++) {
    const w = weekday(d);
    if (w >= 1 && w <= 5) return d;
    d = addDays(d, 1);
  }
  return "";
}

export function openingPlayDateFor(schoolYear, season = "fall", calendar = SCHOOL_CALENDAR) {
  const ev = openingCalendarEvent(schoolYear, season, calendar);
  return ev ? openingPlayDate(ev) : "";
}

export function openingEventForPlayDate(date, calendar = SCHOOL_CALENDAR) {
  if (!date) return null;
  return (calendar || []).find((e) => e.kind === "opening" && openingPlayDate(e) === date) || null;
}

export function openingEventAround(date, calendar = SCHOOL_CALENDAR) {
  if (!date) return null;
  const all = (calendar || []).filter((e) => e.kind === "opening");
  const onPlay = all.find((e) => openingPlayDate(e) === date);
  if (onPlay) return onPlay;
  const onNominal = all.find((e) => e.date === date);
  if (onNominal) return onNominal;
  return all.find((e) => {
    const play = openingPlayDate(e);
    return play && e.date < date && date < play;
  }) || null;
}

export function isOpeningDayPlayDate(date, calendar = SCHOOL_CALENDAR) {
  return !!openingEventForPlayDate(date, calendar);
}

export function hasOpeningDayRecord(state, event) {
  const key = event?.id;
  if (!state || !key) return false;
  if ((state.openingDays || []).some((r) => r.eventId === key)) return true;
  const cur = state.openingDay;
  return !!(cur && cur.eventId === key && cur.done);
}

export function latestOpeningDayMinutes(state, event) {
  if (!state) return null;
  const key = event?.id;
  if (key) {
    const hit = (state.openingDays || []).find((r) => r.eventId === key);
    if (hit) return hit;
    const cur = state.openingDay;
    if (cur && cur.eventId === key && cur.lastMinutes) return cur.lastMinutes;
  }
  if (state.openingDay?.lastMinutes) return state.openingDay.lastMinutes;
  return (state.openingDays || [])[0] || null;
}

export function ensureOpeningDayState(state) {
  if (!state) return null;
  if (!Array.isArray(state.openingDays)) state.openingDays = [];
  const ev = openingEventForPlayDate(state.date) || openingEventAround(state.date);
  const eventId = ev?.id || null;
  const play = ev ? openingPlayDate(ev) : null;
  const kind = ev ? openingEventKind(ev) : "";
  const done = ev ? hasOpeningDayRecord(state, ev) : false;
  const rec = ev ? latestOpeningDayMinutes(state, ev) : latestOpeningDayMinutes(state);
  const cur = state.openingDay;
  if (!cur || typeof cur !== "object" || (eventId && cur.eventId !== eventId)) {
    state.openingDay = {
      eventId,
      playDate: play,
      kind,
      done,
      date: rec?.date || null,
      lastAction: rec?.actionId || null,
      lastMinutes: rec || null,
    };
    return state.openingDay;
  }
  if (play && cur.playDate !== play) cur.playDate = play;
  if (kind) cur.kind = kind;
  cur.done = done || !!cur.done;
  if (rec && !cur.lastMinutes) cur.lastMinutes = rec;
  if (rec?.actionId && !cur.lastAction) cur.lastAction = rec.actionId;
  if (rec?.date && !cur.date) cur.date = rec.date;
  return cur;
}

function isSunday(date, slot) {
  if (date && weekday(date) === 0) return true;
  if (!slot) return false;
  return slot.id === "rest" || slot.kind === "rest";
}

/** 办公室坐班（早读或非数学正课的白天坐班）。不占用辅导时段，也不打断数学正课。 */
export function isOpeningDayTimeSlot(slot, date) {
  if (!slot || !date) return false;
  if (isSunday(date, slot)) return false;
  if (slot.isMath && !slot.isTutoring) return false;
  if (slot.isTutoring || isEveningPeriodId(slot.id)) return false;
  return isOfficeSittingSlot(slot, date);
}

function windowBlockedReason(state, slot, date) {
  if (!state || !date) return "现在不能参加开学典礼或报到。";
  const s = slot || currentSlot(state);
  const nearby = openingEventAround(date);
  const play = nearby ? openingPlayDate(nearby) : "";
  const nominal = nearby?.date || "";
  const kindName = nearby ? openingEventKindName(nearby) : "开学典礼或报到";
  if (!isOpeningDayPlayDate(date)) {
    if (nearby && date === nominal && play && play !== nominal) {
      const when = weekday(nominal) === 0 ? "周日" : "周六";
      const cal = isFallOpeningEvent(nearby) ? "9 月 1 日" : "2 月 22 日";
      return `今年校历上的${cal}${nearby.name}适逢${when}，${kindName}改在之后最近的上课工作日（${play}）进行。${OPENING_DAY_SOURCE_NOTE}`;
    }
    if (nearby && play && date < play && date >= nominal) {
      return `本校${kindName}还没到可做的日子，请等到 ${play}。${OPENING_DAY_SOURCE_NOTE}`;
    }
    if (nearby && play && date > play) {
      return `这次宁川中学校内的${kindName}窗口已经过了。${OPENING_DAY_SOURCE_NOTE}`;
    }
    return `今天不是宁川中学校内的开学典礼或报到日。${OPENING_DAY_SOURCE_NOTE}`;
  }
  const major = majorEventOn(date);
  if (major?.kind === "exam") return "今天考试，开学典礼或报到请按校内安排的可玩日再参加。";
  if (major?.kind === "activity" || activityEventOn(date) || s?.isActivityPeriod) {
    return "今天是学校活动日，开学典礼或报到请按校内安排的可玩日再参加。";
  }
  if (s?.isMath && !s?.isTutoring) return `现在是数学正课，${kindName}请放到办公室坐班时再参加，不要打断上课。`;
  if (s && (isEveningPeriodId(s.id) || s.isTutoring)) {
    return `${kindName}不要占用辅导时段整场，也不要在晚自习巡视时做，请放到办公室坐班时参加。`;
  }
  if (!isOpeningDayTimeSlot(s, date)) return `${kindName}要在办公室坐班时参加，早读或非数学正课的白天坐班都可以。`;
  return "";
}

export function openingDayUnavailableReason(state, slot = currentSlot(state), date = state?.date) {
  const blocked = windowBlockedReason(state, slot, date);
  if (blocked) return blocked;
  const ev = openingEventForPlayDate(date);
  if (ev && hasOpeningDayRecord(state, ev)) {
    const kindName = openingEventKindName(ev);
    return `这次${kindName}已经参加过了。每个开学事件只能参加一次。`;
  }
  return "";
}

export function isOpeningDayWindow(state, slot = currentSlot(state), date = state?.date) {
  return !windowBlockedReason(state, slot, date);
}

export function isOpeningDayOpen(state, slot = currentSlot(state), date = state?.date) {
  return !openingDayUnavailableReason(state, slot, date);
}

function classLabel(state) {
  const no = state?.player?.classNo ?? PLAYER_CLASS_NO;
  return `卓行${no}班`;
}

function playerRoleBit(state) {
  return state?.player?.official ? "正式数学教师" : "数学实习教师";
}

function homeroomName(state) {
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

function pickPhrase(seed, date, key, phrases) {
  const idx = Math.floor(hash01(seed, date || "", key, "opening-day") * phrases.length) % phrases.length;
  return phrases[idx];
}

function actionsFor(ev) {
  return openingEventKind(ev) === "report" ? SPRING_OPENING_ACTIONS : FALL_OPENING_ACTIONS;
}

export function composeOpeningDayBrief(state, event, date = state?.date) {
  const ev = event || openingEventForPlayDate(date) || openingEventAround(date);
  if (!state || !ev) return null;
  const play = openingPlayDate(ev);
  const when = date || play || ev.date;
  const kind = openingEventKind(ev);
  const kindName = openingEventKindName(ev);
  const home = homeroomName(state);
  const cls = classLabel(state);
  const role = playerRoleBit(state);
  const stage = formatCohortGrade(state.player?.cohortYear, when);
  const att = attendanceFacts(state, when);
  const awayBit = att.awayCount
    ? `请假未到 ${att.awayCount} 人${att.awayNames.length ? `（${att.awayNames.join("、")}${att.awayCount > att.awayNames.length ? "等" : ""}）` : ""}`
    : "本班应到学生均已到校";
  const yearReq = pickPhrase(state.seed, when, `${ev.id}-req`, [
    `讲话要求本学年按时到校、遵守校纪，${stage.term || "本学年"}先把学习节奏稳住，作业订正要落实到人`,
    `校领导强调本学年要跟紧各科进度，课堂常规和作业订正都要抓到位，各班按宁川中学校内安排推进`,
    `讲话提到本学年以校内安排推进教学，请各班任课老师随班到场，把出勤和日常学习要求传达到位`,
  ]);
  const termPlan = pickPhrase(state.seed, when, `${ev.id}-plan`, [
    `${home}说明本学期按宁川中学校历推进日常教学和考试，具体日期以校内公布为准，先把返校秩序安定下来`,
    `本学期先安定返校秩序，再按校内安排跟上各科进度，作业和出勤仍由班主任和任课老师分头落实`,
    `${home}布置本学期安排：按宁川中学校历上课、考试，不另发一套校外公告日期，先清点到校再进入常规`,
  ]);
  const attendLine = `${cls}应到 ${att.total} 人，实到 ${att.present} 人，${awayBit}。`;
  const scene = kind === "ceremony"
    ? `全校集合举行开学典礼，由校领导主持。你作为${cls}的${role}随班站队，班主任${home}在场。你不是典礼主持人，也不是班主任。`
    : `这是下学期报到，不是第二场全校典礼。你作为${cls}的${role}到教室看返校情况，班主任${home}在场布置本学期安排。`;
  const shortPoints = kind === "ceremony"
    ? `${scene}${attendLine}对本学年的要求：${yearReq}。`
    : `${scene}${attendLine}${termPlan}。`;
  const points = kind === "ceremony"
    ? [scene, attendLine, `对本学年的要求：${yearReq}。`]
    : [scene, attendLine, termPlan.endsWith("。") ? termPlan : `${termPlan}。`];
  return {
    event: ev,
    eventId: ev.id,
    calendarDate: ev.date,
    playDate: play,
    kind,
    kindName,
    name: ev.name,
    home,
    classLabel: cls,
    role,
    stage,
    attendance: att,
    yearReq,
    termPlan,
    attendLine,
    scene,
    points,
    shortPoints,
  };
}

export function composeOpeningDayMinutes(state, actionId, brief = composeOpeningDayBrief(state)) {
  if (!state || !brief) return "";
  const home = brief.home;
  let playerBit;
  if (brief.kind === "ceremony") {
    if (actionId === "note") {
      playerBit = `你记下了讲话里对本学年的要求：${brief.yearReq}。`;
    } else if (actionId === "count") {
      playerBit = `你协助班主任${home}清点本班到校。${brief.attendLine}`;
    } else {
      playerBit = "你随班站队听完开学典礼，会上没有另外发言。";
    }
  } else if (actionId === "count") {
    playerBit = `你协助清点本班人数。${brief.attendLine}`;
  } else if (actionId === "note") {
    playerBit = `你记下了本学期安排：${brief.termPlan}。`;
  } else {
    playerBit = "你到教室看了本班返校情况，把到校秩序记进纪要。";
  }
  return `宁川中学按校内安排进行${brief.kindName}（校历日期 ${brief.calendarDate}${brief.playDate && brief.playDate !== brief.calendarDate ? `，可玩日 ${brief.playDate}` : ""}）。${brief.points.join("")}${playerBit}${OPENING_DAY_SOURCE_NOTE}`;
}

export function openingDayOptionsFor(state, date = state?.date) {
  const ev = openingEventForPlayDate(date) || openingEventAround(date);
  const brief = composeOpeningDayBrief(state, ev, date);
  return actionsFor(ev).map((a) => ({
    id: a.id,
    label: a.label,
    text: composeOpeningDayMinutes(state, a.id, brief),
  }));
}

function assertAction(ev, actionId) {
  return actionsFor(ev).find((a) => a.id === actionId) || null;
}

/**
 * 参加本场开学典礼或报到。不改能力、分数、排名或省控，
 * 不自动完成个人备课，也不改上课判定。
 */
export function handleOpeningDay(state, actionId) {
  if (!state) return { ok: false, reason: "现在不能参加开学典礼或报到。" };
  const blocked = openingDayUnavailableReason(state);
  if (blocked) return { ok: false, reason: blocked };
  const ev = openingEventForPlayDate(state.date);
  if (!ev) return { ok: false, reason: "今天不是宁川中学校内的开学典礼或报到日。" };
  const action = assertAction(ev, actionId);
  if (!action) {
    const labels = actionsFor(ev).map((a) => a.label).join("、");
    return { ok: false, reason: `请从${labels}这几种方式里选一种，不要另外发挥。` };
  }
  if (hasOpeningDayRecord(state, ev)) {
    return { ok: false, reason: `这次${openingEventKindName(ev)}已经参加过了。每个开学事件只能参加一次。` };
  }
  const brief = composeOpeningDayBrief(state, ev, state.date);
  const minutes = composeOpeningDayMinutes(state, action.id, brief);
  const rec = {
    date: state.date,
    periodId: state.periodId,
    eventId: ev.id,
    calendarDate: ev.date,
    playDate: brief.playDate,
    kind: brief.kind,
    kindName: brief.kindName,
    name: ev.name,
    actionId: action.id,
    actionLabel: action.label,
    attendance: brief.attendance,
    yearReq: brief.yearReq,
    termPlan: brief.termPlan,
    shortPoints: brief.shortPoints,
    classNote: `${state.date}${brief.kindName}：${brief.classLabel}已参加，班主任${brief.home}在场。`,
    minutes,
    role: "任课数学老师",
    host: brief.kind === "ceremony" ? "校领导" : brief.home,
    homeroom: brief.home,
  };
  const box = ensureOpeningDayState(state);
  box.eventId = ev.id;
  box.playDate = brief.playDate;
  box.kind = brief.kind;
  box.done = true;
  box.date = state.date;
  box.lastAction = action.id;
  box.lastMinutes = rec;
  state.openingDays = [rec, ...(state.openingDays || [])];
  const logLead = brief.kind === "ceremony"
    ? `你随${brief.classLabel}参加了宁川中学校内开学典礼（${action.label}）。班主任${brief.home}在场，典礼由校领导主持，你不是主持人，也不是班主任。`
    : `你参加了宁川中学校内报到（${action.label}）。这不是第二场全校典礼。班主任${brief.home}在场。`;
  const logText = `${logLead}${minutes}`;
  return { ok: true, text: logText, rec, actionId: action.id, minutes };
}

