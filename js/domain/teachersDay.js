/**
 * 教师节：全国教师节 9 月 10 日已排入宁川中学校历。
 * 若适逢周六或周日，贺卡和办公室问候挪到相邻上课工作日；当天数学正课仍可上，不是全天停课活动。
 * 贺卡、问候和摘记由已有事实与确定性 PRNG 生成，不用 LLM，不改能力、分数、排名或省控。
 * 这不是某所实校或教育行政部门的表彰大会，也不套用某台晚会流程。
 */
import { clamp, hash01 } from "./prng.js?v=t67u1";
import { addDays, eventsOn, schoolYearOf, weekday, ymd, SCHOOL_CALENDAR } from "./calendar.js?v=t67u1";
import {
  activityEventOn, currentSlot, isEveningPeriodId, majorEventOn,
} from "./timetable.js?v=t67u1";
import { studentTeachingContext } from "./teaching.js?v=t67u1";
import { isParentsMeetingOpen } from "./parents.js?v=t67u1";
import { playerClassStudents } from "./visits.js?v=t67u1";
import { isOfficeSittingSlot } from "./homeVisit.js?v=t67u1";
import { isAwayFromClass, leaveCovering } from "./health.js?v=t67u1";
import { seatLabel } from "./school.js?v=t67u1";
import { classCommittee, committeeTitleOf } from "./classManage.js?v=t67u1";
import { HOMEROOM_NAME, MENTOR_NAME } from "./config.js?v=t67u1";
import { MATH_COLLEAGUES } from "./observe.js?v=t67u1";

export const TEACHERS_DAY_CARD_MIN = 3;
export const TEACHERS_DAY_CARD_MAX = 6;
export const TEACHERS_DAY_CARD_CAP = TEACHERS_DAY_CARD_MAX;

export const TEACHERS_DAY_SOURCE_NOTE = "这是宁川中学校内的教师节问候，日期按全国教师节 9 月 10 日排入校历；若适逢周末则在相邻工作日进行。不是某所实校或教育行政部门的表彰大会，也不套用某台晚会流程。";

export const CARD_REPLIES = [
  { id: "thanks", label: "致谢" },
  { id: "encourage", label: "鼓励" },
  { id: "remind", label: "提醒认真听课" },
];

export const COLLEAGUE_ACTIONS = [
  { id: "accept", label: "接受问候" },
  { id: "return", label: "回贺备课组老师" },
];

export function teachersDayNominalDate(schoolYear) {
  const sy = Number(schoolYear);
  if (!Number.isFinite(sy)) return "";
  return ymd(sy, 9, 10);
}

export function teachersDayEvent(schoolYear, calendar = SCHOOL_CALENDAR) {
  const date = teachersDayNominalDate(schoolYear);
  if (!date) return null;
  return (calendar || []).find((e) => e.id === `teacher-day-${schoolYear}` || (e.name === "教师节" && e.date === date)) || null;
}

function openingDayOn(date) {
  return (eventsOn(date) || []).some((e) => e.kind === "opening");
}

function parentsDayOn(date, state) {
  if (!date) return false;
  if (state && isParentsMeetingOpen(state) && state.date === date) return true;
  return majorEventOn(date)?.kind === "parents";
}

function examDayOn(date, slot) {
  if (!date) return false;
  const major = majorEventOn(date);
  if (major?.kind === "exam") return true;
  if (major?.kind === "placement1" || major?.kind === "placement2" || major?.kind === "admission" || major?.kind === "promote") return true;
  if (slot?.isExamDay && major?.kind !== "parents" && major?.kind !== "activity") return true;
  return false;
}

function activityDayOn(date, slot) {
  if (activityEventOn(date)) return true;
  return !!slot?.isActivityPeriod;
}

/** 考试日、学校活动日、开学典礼占满的日子，不能作为教师节可玩工作日。 */
export function isTeachersDayBlockedDate(date, slot = null) {
  if (!date) return true;
  if (openingDayOn(date)) return true;
  if (activityEventOn(date)) return true;
  const major = majorEventOn(date);
  if (major) return true;
  if (slot && (examDayOn(date, slot) || activityDayOn(date, slot))) return true;
  return false;
}

export function isTeachersDaySchoolWorkday(date) {
  if (!date) return false;
  const wd = weekday(date);
  if (wd < 1 || wd > 5) return false;
  return !isTeachersDayBlockedDate(date);
}

function nearestSchoolWorkday(preferred, nominal) {
  if (isTeachersDaySchoolWorkday(preferred)) return preferred;
  for (let i = 1; i <= 10; i++) {
    const after = addDays(preferred, i);
    const before = addDays(preferred, -i);
    if (isTeachersDaySchoolWorkday(after)) return after;
    if (isTeachersDaySchoolWorkday(before) && before !== nominal) return before;
    if (isTeachersDaySchoolWorkday(before)) return before;
  }
  return "";
}

/**
 * 该学年贺卡和办公室问候的可玩日。
 * 9 月 10 日若是周一至周五且不是考试/活动/开学典礼占满日，就在当天；
 * 若适逢周日，优先下周一；若适逢周六，优先上周五；校历名称日期仍为 9 月 10 日。
 */
export function teachersDayPlayDate(schoolYear) {
  const nominal = teachersDayNominalDate(schoolYear);
  if (!nominal) return "";
  const wd = weekday(nominal);
  if (wd >= 1 && wd <= 5) {
    return isTeachersDaySchoolWorkday(nominal) ? nominal : "";
  }
  const preferred = wd === 0 ? addDays(nominal, 1) : addDays(nominal, -1);
  return nearestSchoolWorkday(preferred, nominal);
}

export function isTeachersDayPlayDate(date) {
  if (!date) return false;
  const play = teachersDayPlayDate(schoolYearOf(date));
  return !!play && play === date;
}

export function teachersDayYearKey(date) {
  if (!date) return "";
  return String(schoolYearOf(date));
}

export function ensureTeachersDayState(state) {
  if (!state) return null;
  const key = teachersDayYearKey(state.date);
  const play = teachersDayPlayDate(schoolYearOf(state.date));
  const cur = state.teachersDay;
  if (!cur || typeof cur !== "object" || cur.yearKey !== key) {
    state.teachersDay = {
      yearKey: key,
      playDate: play || null,
      date: null,
      plannedIds: [],
      cardIds: [],
      colleagueDone: false,
      lastReply: null,
      lastColleague: null,
    };
    return state.teachersDay;
  }
  if (play && cur.playDate !== play) cur.playDate = play;
  return cur;
}

function isSunday(date, slot) {
  if (date && weekday(date) === 0) return true;
  if (!slot) return false;
  return slot.id === "rest" || slot.kind === "rest";
}

/** 办公室坐班（早读或非数学正课的白天坐班）。不占用辅导时段，也不打断数学正课。 */
export function isTeachersDayTimeSlot(slot, date) {
  if (!slot || !date) return false;
  if (isSunday(date, slot)) return false;
  if (slot.isMath && !slot.isTutoring) return false;
  if (slot.isTutoring || isEveningPeriodId(slot.id)) return false;
  return isOfficeSittingSlot(slot, date);
}

function dateBlockedReason(state, slot, date) {
  if (!state || !date) return "现在不能做教师节问候。";
  if (openingDayOn(date)) return "今天是开学典礼，教师节问候请放到校内安排的问候日再做。";
  if (parentsDayOn(date, state)) return "今天是家长会，教师节问候请放到平时办公室坐班时再做。";
  if (examDayOn(date, slot) || majorEventOn(date)?.kind === "exam") return "今天考试，不做教师节问候。";
  if (activityDayOn(date, slot)) return "今天是学校活动日，不做教师节问候。";
  const major = majorEventOn(date);
  if (major) return "今天学校另有安排，不做教师节问候。";
  return "";
}

function windowBlockedReason(state, slot, date) {
  if (!state || !date) return "现在不能做教师节问候。";
  const s = slot || currentSlot(state);
  const dateBlock = dateBlockedReason(state, s, date);
  if (dateBlock) return dateBlock;
  if (!isTeachersDayPlayDate(date)) {
    const sy = schoolYearOf(date);
    const nominal = teachersDayNominalDate(sy);
    const play = teachersDayPlayDate(sy);
    if (date === nominal && play && play !== nominal) {
      const when = weekday(nominal) === 0 ? "周日" : "周六";
      return `今年 9 月 10 日教师节适逢${when}，贺卡和办公室问候改在相邻上课工作日（${play}）进行。${TEACHERS_DAY_SOURCE_NOTE}`;
    }
    if (play && date < play) {
      return `本校教师节问候还没到可做的日子，请等到 ${play}。${TEACHERS_DAY_SOURCE_NOTE}`;
    }
    if (play && date > play) {
      return `今年宁川中学校内的教师节问候窗口已经过了。${TEACHERS_DAY_SOURCE_NOTE}`;
    }
    return `今天不是宁川中学校内的教师节问候日。${TEACHERS_DAY_SOURCE_NOTE}`;
  }
  if (s?.isMath && !s?.isTutoring) return "现在是数学正课，教师节问候请放到办公室坐班时再做，不要打断上课。";
  if (s && (isEveningPeriodId(s.id) || s.isTutoring)) return "教师节问候不要占用辅导时段整场，也不要在晚自习巡视时做，请放到办公室坐班或教室里简短收下贺卡。";
  if (!isTeachersDayTimeSlot(s, date)) return "教师节问候要在办公室坐班时做，早读或非数学正课的白天坐班都可以；教室里也可以简短收下本班贺卡或花。";
  return "";
}

function remainingCardIds(state) {
  const box = ensureTeachersDayState(state);
  const done = new Set(box.cardIds || []);
  return (box.plannedIds || []).filter((id) => !done.has(id));
}

export function teachersDayUnavailableReason(state, slot = currentSlot(state), date = state?.date) {
  const blocked = windowBlockedReason(state, slot, date);
  if (blocked) return blocked;
  const box = ensureTeachersDayState(state);
  const cardsLeft = remainingCardIds(state).length;
  const needPlan = !(box.plannedIds || []).length;
  if (!needPlan && cardsLeft <= 0 && box.colleagueDone) {
    return "今天的贺卡和办公室问候已经处理完了。每年只有这一次窗口。";
  }
  return "";
}

export function isTeachersDayWindow(state, slot = currentSlot(state), date = state?.date) {
  return !windowBlockedReason(state, slot, date);
}

export function isTeachersDayOpen(state, slot = currentSlot(state), date = state?.date) {
  return !teachersDayUnavailableReason(state, slot, date);
}

function onLeave(student, state, date = state?.date) {
  if (!student || !state || !date) return false;
  if (date === state.date && isAwayFromClass(student, state)) return true;
  return !!leaveCovering(student, date, state.seed);
}

export function hasTeachersDayCard(student, yearKey) {
  if (!student || !yearKey) return false;
  if (student.lastTeachersDay && String(student.lastTeachersDay.yearKey) === String(yearKey)) return true;
  return (student.teachersDayNotes || []).some((r) => String(r.yearKey) === String(yearKey));
}

function findClassStudent(state, studentId) {
  return playerClassStudents(state).find((s) => s.id === studentId) || null;
}

function factBundle(student, state) {
  const ctx = studentTeachingContext(student, state) || {};
  const committee = committeeTitleOf(classCommittee(state, playerClassStudents(state)), student.id) || "";
  const hw = ctx.hw || student.lastHomework || null;
  const missing = !!(hw && (hw.status === "缺交" || hw.correction === "待补交"));
  const corr = !!(hw && (hw.correction === "待订正" || hw.quality === "错题较多" || hw.quality === "未订正"));
  return {
    personality: student.personality || "",
    committee,
    flag: ctx.flag || student.lastClassFlag || "",
    topic: ctx.topic || student.lastClassTopic || "",
    hw,
    missing,
    corr,
    quiz: ctx.quiz || student.lastQuiz || null,
    relation: student.relation || 0,
  };
}

function giftKind(state, student, date = state?.date) {
  return hash01(state.seed, date, student.id, "td-gift") < 0.28 ? "flower" : "card";
}

function giftLabel(kind) {
  return kind === "flower" ? "一束花" : "一张贺卡";
}

function suggestReason(facts, kind) {
  const gift = giftLabel(kind);
  if (facts.committee) return `本班${facts.committee}送来${gift}`;
  if (facts.flag === "走神" || facts.missing || facts.corr) return `送来${gift}，顺口也想提一句近况`;
  if (facts.flag) return `课堂上较活跃，送来${gift}`;
  if ((facts.relation || 0) >= 8) return `平日走动较多，送来${gift}`;
  return `本班学生送来教师节${kind === "flower" ? "花" : "贺卡"}`;
}

function cardMessage(state, student, facts, kind, date = state?.date) {
  const gift = giftLabel(kind);
  const rng = hash01(state.seed, date, student.id, "td-msg");
  const bits = [];
  if (facts.committee) bits.push(`以${facts.committee}的身份代表同学向你问候`);
  if (facts.topic) bits.push(`还提到最近「${facts.topic}」听得还跟得上`);
  else if (facts.personality) bits.push(`贺卡上写着几句开学报到以来的话，口气像平时的${facts.personality}`);
  else bits.push("写了几句开学以来的问候");
  if (facts.missing) bits.push("作业还欠着，想先把花送到再说");
  else if (facts.corr) bits.push("订正还没清完，但还是先送来了");
  else if (facts.flag === "走神") bits.push("课堂上常走神，这次倒是把东西送到了");
  const extra = bits[Math.floor(rng * bits.length) % bits.length] || bits[0];
  return `${student.name}送来${gift}，${extra}。`;
}

function replyLine(student, kind, replyId) {
  const gift = giftLabel(kind);
  if (replyId === "encourage") return `你收下${student.name}的${gift}，鼓励这学期把数学跟稳。`;
  if (replyId === "remind") return `你收下${student.name}的${gift}，也提醒上课还是要认真听。`;
  return `你收下${student.name}的${gift}，向${student.name}致谢。`;
}

export function cardOptionsFor(state, student) {
  const kind = student ? giftKind(state, student) : "card";
  const facts = student ? factBundle(student, state) : {};
  const msg = student ? cardMessage(state, student, facts, kind) : "";
  return CARD_REPLIES.map((t) => ({
    id: t.id,
    label: t.label,
    text: student ? replyLine(student, kind, t.id) : "",
    gift: kind,
    message: msg,
  }));
}

function suggestScore(student, state, date) {
  const facts = factBundle(student, state);
  let score = 1;
  if (facts.committee) score += 4;
  if ((facts.relation || 0) >= 6) score += 2;
  if (facts.flag && facts.flag !== "走神") score += 1;
  if (facts.flag === "走神" || facts.missing || facts.corr) score += 2;
  const tie = hash01(state.seed, date, student.id, "td-suggest");
  return { score, tie, facts };
}

function planCardIds(state, date = state?.date, periodId = state?.periodId) {
  const box = ensureTeachersDayState(state);
  if ((box.plannedIds || []).length) return box.plannedIds;
  const yearKey = teachersDayYearKey(date);
  const mates = playerClassStudents(state).filter((s) => !onLeave(s, state, date) && !hasTeachersDayCard(s, yearKey));
  const scored = mates.map((s) => {
    const pack = suggestScore(s, state, date);
    const slotTie = hash01(state.seed, date, periodId || "", s.id, "td-slot");
    return { student: s, score: pack.score, tie: pack.tie, slotTie, facts: pack.facts };
  });
  scored.sort((a, b) => (b.score - a.score) || (a.tie - b.tie) || (a.slotTie - b.slotTie) || String(a.student.id).localeCompare(String(b.student.id)));
  let n = TEACHERS_DAY_CARD_MIN + Math.floor(hash01(state.seed, date, "td-count") * (TEACHERS_DAY_CARD_MAX - TEACHERS_DAY_CARD_MIN + 1));
  n = Math.max(TEACHERS_DAY_CARD_MIN, Math.min(TEACHERS_DAY_CARD_MAX, n, scored.length));
  box.plannedIds = scored.slice(0, n).map((x) => x.student.id);
  return box.plannedIds;
}

/**
 * 建议当场 3–6 名在校本班学生。请假不在校的不出现在送礼名单里。
 * 同一学年名单按种子和日期确定，处理过的人会从名单里去掉。
 */
export function suggestTeachersDayCards(state, date = state?.date, periodId = state?.periodId) {
  if (!state || !date || !isTeachersDayPlayDate(date)) return [];
  const yearKey = teachersDayYearKey(date);
  const planned = planCardIds(state, date, periodId);
  const done = new Set((state.teachersDay?.cardIds || []));
  const out = [];
  for (const id of planned) {
    if (done.has(id)) continue;
    const student = findClassStudent(state, id);
    if (!student) continue;
    if (onLeave(student, state, date)) continue;
    if (hasTeachersDayCard(student, yearKey)) continue;
    const facts = factBundle(student, state);
    const kind = giftKind(state, student, date);
    out.push({
      studentId: student.id,
      name: student.name,
      seat: seatLabel(student),
      gift: kind,
      giftLabel: giftLabel(kind),
      reason: suggestReason(facts, kind),
      message: cardMessage(state, student, facts, kind, date),
      onLeave: false,
      options: cardOptionsFor(state, student),
    });
  }
  return out;
}

function colleaguePool(state) {
  const mentor = state?.player?.mentor || MENTOR_NAME;
  const homeroom = state?.player?.homeroom || HOMEROOM_NAME;
  const rows = [
    { id: "mentor", name: mentor, title: "备课组长" },
    { id: "homeroom", name: homeroom, title: "班主任" },
  ];
  for (const row of MATH_COLLEAGUES) {
    if (row.id === "mentor") continue;
    rows.push({ id: row.id, name: row.name, title: row.title || "数学组老师" });
  }
  return rows;
}

export function teachersDayColleague(state, date = state?.date) {
  if (!state || !date) return null;
  const pool = colleaguePool(state);
  const idx = Math.floor(hash01(state.seed, date, "td-colleague") * pool.length) % pool.length;
  const row = pool[idx] || pool[0];
  return {
    id: row.id,
    name: row.name,
    title: row.title,
    reason: `${row.title}${row.name}在办公室向你致以教师节问候`,
    options: COLLEAGUE_ACTIONS.map((a) => ({ id: a.id, label: a.label })),
  };
}

function colleagueLog(state, actionId, person) {
  const who = `${person.title}${person.name}`;
  if (actionId === "return") {
    return `你在办公室回贺了备课组老师，也向${who}致以教师节问候。${TEACHERS_DAY_SOURCE_NOTE}`;
  }
  return `你在办公室接受了${who}的教师节问候。${TEACHERS_DAY_SOURCE_NOTE}`;
}

function assertReply(replyId) {
  return CARD_REPLIES.find((t) => t.id === replyId) || null;
}

function assertColleagueAction(actionId) {
  return COLLEAGUE_ACTIONS.find((t) => t.id === actionId) || null;
}

function applyCardEffects(student, replyId) {
  let rel = 1;
  if (replyId === "encourage") rel = 2;
  else if (replyId === "remind") rel = 1;
  else rel = 1;
  student.relation = clamp((student.relation || 0) + rel, 0, 100);
}

function recordStudent(state, student, kind, reply, message) {
  const yearKey = teachersDayYearKey(state.date);
  const replyText = replyLine(student, kind, reply.id);
  const rec = {
    date: state.date,
    periodId: state.periodId,
    yearKey,
    gift: kind,
    reply: reply.id,
    message,
    text: `${message}${replyText}`,
    statusLine: `${state.date}教师节：已收下本班${giftLabel(kind)}并回应`,
    role: "数学任课老师",
  };
  student.lastTeachersDay = rec;
  student.teachersDayNotes = [rec, ...(student.teachersDayNotes || [])].slice(0, 8);
  student.talks = [...(student.talks || []), {
    date: state.date,
    topic: "教师节",
    text: rec.text,
    seat: seatLabel(student),
  }];
  applyCardEffects(student, reply.id);
  return rec;
}

/**
 * 收下建议名单中一名本班学生的贺卡或花，并写一句简短回应。
 * 不改能力、分数、排名或省控。请假不在校的学生不能列入当场。
 */
export function handleTeachersDayCard(state, studentId, replyId) {
  if (!state) return { ok: false, reason: "现在不能做教师节问候。" };
  const blocked = teachersDayUnavailableReason(state);
  if (blocked && !isTeachersDayWindow(state)) return { ok: false, reason: blocked };
  if (!isTeachersDayPlayDate(state.date)) {
    return { ok: false, reason: teachersDayUnavailableReason(state) || "今天不是宁川中学校内的教师节问候日。" };
  }
  if (!isTeachersDayTimeSlot(currentSlot(state), state.date)) {
    return { ok: false, reason: teachersDayUnavailableReason(state) || "请在办公室坐班时再做。" };
  }
  const reply = assertReply(replyId);
  if (!reply) return { ok: false, reason: "请从致谢、鼓励、提醒认真听课这几种回应里选一句，不要另外发挥。" };
  const student = findClassStudent(state, studentId);
  if (!student) return { ok: false, reason: "请从建议名单里确认要收下贺卡或花的本班学生。" };
  if (onLeave(student, state)) return { ok: false, reason: `${student.name}今天请假不在校，不要出现在当场送礼名单里。` };
  const yearKey = teachersDayYearKey(state.date);
  if (hasTeachersDayCard(student, yearKey)) {
    return { ok: false, reason: `${student.name}今年的教师节贺卡已经收下过了，同一窗口不要重复处理。` };
  }
  const suggested = suggestTeachersDayCards(state);
  if (!suggested.some((v) => v.studentId === studentId)) {
    return { ok: false, reason: "请从建议名单里确认要收下贺卡或花的人。" };
  }
  const box = ensureTeachersDayState(state);
  if ((box.cardIds || []).length >= TEACHERS_DAY_CARD_CAP) {
    return { ok: false, reason: "今天已经收过一批本班贺卡，每年只有这一次窗口。" };
  }
  const kind = giftKind(state, student);
  const facts = factBundle(student, state);
  const message = cardMessage(state, student, facts, kind);
  const rec = recordStudent(state, student, kind, reply, message);
  box.date = state.date;
  box.cardIds = [...(box.cardIds || []), student.id];
  box.lastReply = reply.id;
  const logText = `${replyLine(student, kind, reply.id)}${message}${TEACHERS_DAY_SOURCE_NOTE}`;
  return { ok: true, text: logText, rec, student, replyId: reply.id, gift: kind };
}

/**
 * 在办公室接受同事问候，或回贺备课组老师。每年窗口一次。
 */
export function handleTeachersDayColleague(state, actionId) {
  if (!state) return { ok: false, reason: "现在不能做教师节问候。" };
  if (!isTeachersDayWindow(state)) {
    return { ok: false, reason: teachersDayUnavailableReason(state) || "现在不能做办公室问候。" };
  }
  const box = ensureTeachersDayState(state);
  if (box.colleagueDone) return { ok: false, reason: "今年办公室同事问候已经做过了，每年只有这一次窗口。" };
  const action = assertColleagueAction(actionId);
  if (!action) return { ok: false, reason: "请选择接受问候，或回贺备课组老师，不要另外发挥。" };
  const person = teachersDayColleague(state);
  const text = colleagueLog(state, action.id, person);
  box.date = state.date;
  box.colleagueDone = true;
  box.lastColleague = action.id;
  box.lastColleagueId = person.id;
  return { ok: true, text, person, actionId: action.id };
}
