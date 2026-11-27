/**
 * 本班课表的调课 / 借课。只改玩家看到、用来「下一节」「上课」的那张课表，
 * 不排全校各班。覆盖按日期生效，不改星期模板。
 */
import { hash01, rngFrom } from "./prng.js?v=t66u1";
import { addDays, weekday, weekdayName, formatDateCn, parseYmd, SCHOOL_CALENDAR } from "./calendar.js?v=t66u1";
import { HOMEROOM_NAME } from "./config.js?v=t66u1";
import {
  daySchedule, weekStart, weekDates, isClassPeriodId, overridesOf, majorEventOn,
  activityEventOn, periodIsActivity, periodsForWeekday,
} from "./timetable.js?v=t66u1";

/** 虚构的本班任课老师，不是某所实校教师名册。 */
export const SUBJECT_TEACHERS = {
  语文: "周文静",
  英语: "何佩兰",
  物理: "马振川",
  化学: "吴启明",
  生物: "孙晓荷",
  历史: "钱立言",
  地理: "冯秋实",
  政治: "梁正德",
  体育: "郭大力",
  自习: "年级值班老师",
};

const EXAM_NEAR_DAYS = 7;
const EXAM_NEAR_KINDS = new Set(["monthly", "midterm", "final"]);

export function teacherOf(subject, state = null) {
  if (subject === "班会") return state?.player?.homeroom || HOMEROOM_NAME;
  if (subject === "数学") return state?.player?.name ? `${state.player.name}（数学）` : "数学老师";
  return SUBJECT_TEACHERS[subject] || `${subject}老师`;
}

export function isBorrowSource(subject) {
  return subject === "自习" || subject === "体育";
}

export function ensureTiaokeState(state) {
  if (!state) return state;
  if (!Array.isArray(state.timetableOverrides)) state.timetableOverrides = [];
  if (!state.timetableInbox || typeof state.timetableInbox !== "object") state.timetableInbox = {};
  return state;
}

export function shortSlotLabel(date, periodId, subject = "") {
  const { m, d } = parseYmd(date);
  const p = periodsForWeekday(weekday(date)).find((x) => x.id === periodId);
  const name = p?.name || periodId;
  const sub = subject ? `「${subject}」` : "";
  return `${m}月${d}日周${weekdayName(date)}${name}${sub}`;
}

export function canAlterSlot(date, periodId) {
  if (!date || !periodId) return { ok: false, reason: "先指定要改的日期和节次。" };
  if (periodId === "morning-read") {
    return { ok: false, reason: "早读仍是语文或英语，不能改成数学正课，也不能拿来上课结算课题。" };
  }
  if (periodId === "noon") return { ok: false, reason: "午休不能调课或借课。" };
  if (periodId === "rest") return { ok: false, reason: "周日休息，不能调课或借课。" };
  if (periodId === "evening-1" || periodId === "evening-2") {
    return { ok: false, reason: "晚自习和答疑仍是辅导时段，不能靠借课变成正课课题。" };
  }
  if (!isClassPeriodId(periodId)) return { ok: false, reason: "只能调或借第1到第8节正课。" };
  const major = majorEventOn(date);
  if (major) return { ok: false, reason: `${formatDateCn(date)}是${major.name}，全日停课，不能调课或借课。` };
  const activity = activityEventOn(date);
  if (activity && periodIsActivity(activity, periodId, "class")) {
    return { ok: false, reason: `${formatDateCn(date)}是${activity.name}活动时段，不能调课或借课。` };
  }
  if (weekday(date) === 0) return { ok: false, reason: "周日休息，不能调课或借课。" };
  const periods = periodsForWeekday(weekday(date));
  if (!periods.some((p) => p.id === periodId)) return { ok: false, reason: "那天没有这一节正课。" };
  return { ok: true };
}

function slotOn(state, date, periodId) {
  return daySchedule(date, state).find((p) => p.id === periodId) || null;
}

function upsertOverride(state, ov) {
  const list = state.timetableOverrides;
  const idx = list.findIndex((x) => x.date === ov.date && x.periodId === ov.periodId);
  if (idx >= 0) list[idx] = ov;
  else list.push(ov);
}

function weekOverrides(state, date) {
  const start = weekStart(date);
  const end = addDays(start, 6);
  return overridesOf(state).filter((o) => o.date >= start && o.date <= end);
}

export function weekBorrowCounts(state, date) {
  const list = weekOverrides(state, date);
  // 对调会产生两条记录，借入/借出各一条；按类型计数即可。
  const inRows = list.filter((o) => o.type === "borrow-in");
  const outRows = list.filter((o) => o.type === "borrow-out");
  return {
    in: inRows.length,
    out: outRows.length,
    peIn: inRows.filter((o) => o.fromSubject === "体育").length,
    inDates: inRows.map((o) => o.date),
  };
}

function borrowedPeRecently(state, date) {
  const thisWeek = weekBorrowCounts(state, date).peIn > 0;
  const prevWeek = weekBorrowCounts(state, addDays(weekStart(date), -1)).peIn > 0;
  return thisWeek || prevWeek;
}

/**
 * 对调本班两节正课。通常一节是数学、一节是其他科目，两节都改，日志写清跟谁调。
 */
export function swapPeriods(state, a, b) {
  ensureTiaokeState(state);
  if (!a?.date || !a?.periodId || !b?.date || !b?.periodId) {
    return { ok: false, reason: "对调需要指定两节正课的日期和节次。" };
  }
  if (a.date === b.date && a.periodId === b.periodId) {
    return { ok: false, reason: "对调要选两节不同的课。" };
  }
  const ca = canAlterSlot(a.date, a.periodId);
  if (!ca.ok) return ca;
  const cb = canAlterSlot(b.date, b.periodId);
  if (!cb.ok) return cb;
  const sa = slotOn(state, a.date, a.periodId);
  const sb = slotOn(state, b.date, b.periodId);
  if (!sa || !sb) return { ok: false, reason: "这两节里有一节当天没有排课。" };
  const mathA = !!sa.isMath;
  const mathB = !!sb.isMath;
  if (mathA === mathB) {
    return { ok: false, reason: mathA ? "这两节都是数学课，对调没有意义。" : "对调需要其中一节是本班数学正课。" };
  }
  const math = mathA ? { date: a.date, periodId: a.periodId, slot: sa } : { date: b.date, periodId: b.periodId, slot: sb };
  const other = mathA ? { date: b.date, periodId: b.periodId, slot: sb } : { date: a.date, periodId: a.periodId, slot: sa };
  const peerSubject = other.slot.subject;
  const peer = teacherOf(peerSubject, state);
  const peerLabel = peer.includes("老师") || peerSubject === "班会" ? (peerSubject === "班会" ? `班主任${peer}` : peer) : `${peerSubject}老师${peer}`;
  upsertOverride(state, {
    date: math.date,
    periodId: math.periodId,
    subject: peerSubject,
    isMath: false,
    type: "swap",
    peer,
    peerSubject,
    pairDate: other.date,
    pairPeriodId: other.periodId,
  });
  upsertOverride(state, {
    date: other.date,
    periodId: other.periodId,
    subject: "数学",
    isMath: true,
    type: "swap",
    peer,
    peerSubject,
    pairDate: math.date,
    pairPeriodId: math.periodId,
  });
  const text = `你跟${peerLabel}对调了本班课表：把${shortSlotLabel(math.date, math.periodId, "数学")}和${shortSlotLabel(other.date, other.periodId, peerSubject)}对调。两节都已改在本班课表上，只是这几日有效，不是改星期模板。`;
  return { ok: true, text, peer, peerSubject, math, other };
}

/**
 * 把本班某一节自习或体育临时改成数学正课。按日期生效。
 */
export function borrowIn(state, date, periodId) {
  ensureTiaokeState(state);
  const gate = canAlterSlot(date, periodId);
  if (!gate.ok) return gate;
  const slot = slotOn(state, date, periodId);
  if (!slot) return { ok: false, reason: "那天没有这一节正课。" };
  if (slot.isMath) return { ok: false, reason: "这一节已经是数学正课，不必再借。" };
  if (!isBorrowSource(slot.subject)) {
    return { ok: false, reason: "只能把本班的自习或体育临时借来上数学，其他正课请用对调。" };
  }
  const counts = weekBorrowCounts(state, date);
  if (counts.in >= 1) return { ok: false, reason: "这一周已经额外借入过一节数学正课，先不要再借。" };
  if (counts.inDates.includes(date)) return { ok: false, reason: "同一天不要再堆一节新借入的数学课。" };
  if (slot.subject === "体育" && borrowedPeRecently(state, date)) {
    return { ok: false, reason: "最近刚临时占用过体育课，这次先别再借体育，改约自习或过一周再说。" };
  }
  const fromSubject = slot.subject;
  const peer = teacherOf(fromSubject, state);
  upsertOverride(state, {
    date,
    periodId,
    subject: "数学",
    isMath: true,
    type: "borrow-in",
    fromSubject,
    peer,
  });
  const label = shortSlotLabel(date, periodId, fromSubject);
  const text = fromSubject === "体育"
    ? `你临时占用了${label}上数学，跟体育老师${peer}说好这节先借用，下回再补回去。只是这天有效，不是改课表模板。`
    : `你借入了${label}，改上数学正课。跟${peer}打过招呼，只是这天临时改，不是改课表模板。`;
  return { ok: true, text, date, periodId, fromSubject, peer };
}

export function borrowOut(state, date, periodId, { peerSubject = "自习", peer = null } = {}) {
  ensureTiaokeState(state);
  const gate = canAlterSlot(date, periodId);
  if (!gate.ok) return gate;
  const slot = slotOn(state, date, periodId);
  if (!slot) return { ok: false, reason: "那天没有这一节正课。" };
  if (!slot.isMath) return { ok: false, reason: "这一节现在不是数学正课，对方借不走。" };
  const counts = weekBorrowCounts(state, date);
  if (counts.out >= 1) return { ok: false, reason: "这一周已经被借走一节数学课，不能再借出。" };
  const toSubject = peerSubject || "自习";
  const who = peer || teacherOf(toSubject, state);
  upsertOverride(state, {
    date,
    periodId,
    subject: toSubject,
    isMath: false,
    type: "borrow-out",
    peer: who,
    peerSubject: toSubject,
  });
  const text = `${who}临时借走了${shortSlotLabel(date, periodId, "数学")}，这节改上${toSubject}。只是这天有效，不是永久改模板。你这节不能再按数学正课上课结算课题。`;
  return { ok: true, text, date, periodId, peerSubject: toSubject, peer: who };
}

function daysBetween(a, b) {
  const pa = parseYmd(a);
  const pb = parseYmd(b);
  const da = Date.UTC(pa.y, pa.m - 1, pa.d);
  const db = Date.UTC(pb.y, pb.m - 1, pb.d);
  return Math.round((db - da) / 86400000);
}

export function daysToNextExam(date) {
  let best = null;
  for (const e of SCHOOL_CALENDAR) {
    if (e.kind !== "exam" || !EXAM_NEAR_KINDS.has(e.examKind)) continue;
    if (e.date < date) continue;
    const days = daysBetween(date, e.date);
    if (best == null || days < best) best = days;
  }
  return best;
}

function mathSlotsFrom(state, fromDate, untilDate) {
  const out = [];
  let d = fromDate;
  while (d <= untilDate) {
    if (!majorEventOn(d) && weekday(d) !== 0) {
      for (const p of daySchedule(d, state)) {
        if (p.isMath && isClassPeriodId(p.id)) out.push({ date: d, periodId: p.id, subject: p.subject });
      }
    }
    d = addDays(d, 1);
  }
  return out;
}

function peerSlotsFrom(state, fromDate, untilDate, math) {
  const bySubject = new Map();
  let d = fromDate;
  while (d <= untilDate) {
    if (!majorEventOn(d) && weekday(d) !== 0) {
      for (const p of daySchedule(d, state)) {
        if (!isClassPeriodId(p.id) || p.isMath) continue;
        if (d === math.date && p.id === math.periodId) continue;
        const list = bySubject.get(p.subject) || [];
        list.push({ date: d, periodId: p.id, subject: p.subject });
        bySubject.set(p.subject, list);
      }
    }
    d = addDays(d, 1);
  }
  return bySubject;
}

function pickFrom(rng, arr) {
  if (!arr?.length) return null;
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

/**
 * 按存档 seed + 日期生成当天可能出现的对方请求，不写入存档。
 * 月考/期中/期末前若干天更常出现；不是每天都有，更不是每节课都有。
 */
export function computeIncomingRequest(state, date) {
  if (!state || !date) return null;
  if (majorEventOn(date) || weekday(date) === 0) return null;
  const h = hash01(state.seed, date, "tiaoke-request");
  const days = daysToNextExam(date);
  const near = days != null && days > 0 && days <= EXAM_NEAR_DAYS;
  const p = near ? 0.40 : 0.14;
  if (h >= p) return null;
  const weekEnd = addDays(weekStart(date), 6);
  const maths = mathSlotsFrom(state, date, weekEnd);
  if (!maths.length) return null;
  const rng = rngFrom(state.seed, date, "tiaoke-detail");
  const counts = weekBorrowCounts(state, date);
  let type = rng() < 0.55 ? "borrow-out" : "swap";
  if (type === "borrow-out" && counts.out >= 1) type = "swap";
  const math = pickFrom(rng, maths);
  if (!math) return null;
  if (type === "borrow-out") {
    const subjects = ["语文", "英语", "物理", "化学", "自习"];
    const peerSubject = pickFrom(rng, subjects);
    const peer = teacherOf(peerSubject, state);
    const why = near
      ? `临近考试，${peer}想借一节数学课给学生补漏洞。`
      : `${peer}这周有事，想临时借走一节数学课。`;
    return {
      id: `${date}|${math.periodId}|borrow-out`,
      date,
      status: "pending",
      type: "borrow-out",
      mathDate: math.date,
      mathPeriodId: math.periodId,
      peerSubject,
      peer,
      why,
    };
  }
  const peerMap = peerSlotsFrom(state, weekStart(date), weekEnd, math);
  const subjects = [...peerMap.keys()].filter((s) => s && s !== "数学");
  const peerSubject = pickFrom(rng, subjects);
  const other = peerSubject ? pickFrom(rng, peerMap.get(peerSubject)) : null;
  if (!other) return null;
  const peer = teacherOf(other.subject, state);
  const why = near
    ? `临近考试，${peer}想跟你对调一节，好把他们的课挪到一起讲。`
    : `${peer}想跟你对调一节本班的课。`;
  return {
    id: `${date}|${math.periodId}|${other.date}|${other.periodId}|swap`,
    date,
    status: "pending",
    type: "swap",
    mathDate: math.date,
    mathPeriodId: math.periodId,
    otherDate: other.date,
    otherPeriodId: other.periodId,
    peerSubject: other.subject,
    peer,
    why,
  };
}

/** 第一次查看时把当天请求写入存档，避免课表改动后请求内容跟着变。自动推进不必调用。 */
export function ensureIncomingRequest(state, date = state?.date) {
  ensureTiaokeState(state);
  if (!date) return null;
  if (state.timetableInbox[date]) return state.timetableInbox[date];
  const req = computeIncomingRequest(state, date);
  if (!req) return null;
  state.timetableInbox[date] = req;
  return req;
}

export function pendingTimetableRequest(state, date = state?.date) {
  if (!state || !date) return null;
  const stored = state.timetableInbox?.[date];
  if (stored) return stored.status === "pending" ? stored : null;
  return computeIncomingRequest(state, date);
}

export function respondTimetableRequest(state, accept, date = state?.date) {
  ensureTiaokeState(state);
  const req = state.timetableInbox[date] || computeIncomingRequest(state, date);
  if (!req || req.status !== "pending") {
    return { ok: false, reason: "眼下没有待处理的调课或借课请求。" };
  }
  state.timetableInbox[date] = req;
  if (!accept) {
    req.status = "rejected";
    const text = req.type === "borrow-out"
      ? `你谢绝了${req.peer}借用${shortSlotLabel(req.mathDate, req.mathPeriodId, "数学")}的请求，这节仍按原课表上数学。`
      : `你谢绝了与${req.peer}对调课表的请求，两边都仍按原课表上。`;
    return { ok: true, accepted: false, text };
  }
  if (req.type === "borrow-out") {
    const r = borrowOut(state, req.mathDate, req.mathPeriodId, { peerSubject: req.peerSubject, peer: req.peer });
    if (!r.ok) return r;
    req.status = "accepted";
    return { ok: true, accepted: true, text: r.text, request: req };
  }
  const r = swapPeriods(
    state,
    { date: req.mathDate, periodId: req.mathPeriodId },
    { date: req.otherDate, periodId: req.otherPeriodId },
  );
  if (!r.ok) return r;
  req.status = "accepted";
  return { ok: true, accepted: true, text: r.text, request: req };
}

export function weekTiaokeSummary(state, date = state?.date) {
  if (!date) return "";
  const c = weekBorrowCounts(state, date);
  return `本周额外借入 ${c.in}/1 节，被借走 ${c.out}/1 节。`;
}
