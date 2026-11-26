/**
 * 电话家访与周日上门家访：任课数学老师主动联系家长。
 * 建议名单由已有事实与确定性 PRNG 生成，不用 LLM，不改能力、分数或省控。
 * 这不是班主任走访全班，也不是某所实校或教育局规定的家访周。
 */
import { clamp, hash01 } from "./prng.js?v=t64u1";
import { parseYmd, schoolYearOf, termOf, weekday } from "./calendar.js?v=t64u1";
import {
  activityEventOn, currentSlot, daySchedule, isClassPeriodId, isEveningPeriodId, majorEventOn,
} from "./timetable.js?v=t64u1";
import { isOpenHomework, studentTeachingContext } from "./teaching.js?v=t64u1";
import { composeParentBrief, parentTalkPriority, isParentsMeetingOpen } from "./parents.js?v=t64u1";
import { playerClassStudents } from "./visits.js?v=t64u1";
import { classPeersOf } from "./peers.js?v=t64u1";
import { isAwayFromClass, leaveCovering } from "./health.js?v=t64u1";
import { seatLabel } from "./school.js?v=t64u1";

export const PHONE_DAY_CAP = 2;
export const PHONE_TERM_CAP = 30;
export const DOOR_DAY_CAP = 1;
export const DOOR_TERM_CAP = 4;
export const PHONE_SUGGEST_MIN = 3;
export const PHONE_SUGGEST_MAX = 6;
export const DOOR_SUGGEST_MIN = 3;
export const DOOR_SUGGEST_MAX = 4;

export const PHONE_ACTIONS = [
  { id: "watchHw", label: "说明近况并请家长盯作业" },
  { id: "goodFirst", label: "先报喜再提问题" },
  { id: "restFirst", label: "请家长先让学生休息" },
];

export const DOOR_ACTIONS = [
  { id: "sitTalk", label: "坐下来把近况说清楚" },
  { id: "encourage", label: "先肯定进步再提跟进" },
  { id: "restHome", label: "请家长先把作息稳住" },
];

export function termVisitKey(date) {
  if (!date) return "";
  return `${schoolYearOf(date)}-${termOf(date)}`;
}

export function parentCoopOf(student) {
  const n = Number(student?.parentCoop);
  return Number.isFinite(n) ? n : 50;
}

export function ensureHomeVisitState(state) {
  if (!state) return null;
  const key = termVisitKey(state.date);
  const cur = state.homeVisit;
  if (!cur || typeof cur !== "object") {
    state.homeVisit = { termKey: key, phoneCount: 0, doorCount: 0, phoneDate: null, phoneToday: 0, doorDate: null };
    return state.homeVisit;
  }
  if (cur.termKey !== key) {
    state.homeVisit = { termKey: key, phoneCount: 0, doorCount: 0, phoneDate: null, phoneToday: 0, doorDate: null };
    return state.homeVisit;
  }
  if (cur.phoneDate !== state.date) {
    cur.phoneToday = 0;
    cur.phoneDate = state.date;
  }
  return cur;
}

function daysBetween(a, b) {
  if (!a || !b) return 99;
  const pa = parseYmd(a);
  const pb = parseYmd(b);
  const da = Date.UTC(pa.y, pa.m - 1, pa.d);
  const db = Date.UTC(pb.y, pb.m - 1, pb.d);
  return Math.round((db - da) / 86400000);
}

function isSunday(date, slot) {
  if (date && weekday(date) === 0) return true;
  if (!slot) return false;
  return slot.id === "rest" || slot.kind === "rest";
}

function parentsDayOn(date, state) {
  if (!date) return false;
  if (state && isParentsMeetingOpen(state) && state.date === date) return true;
  const major = majorEventOn(date);
  return major?.kind === "parents";
}

function activityDayOn(date) {
  return !!activityEventOn(date);
}

function examDayOn(date, slot) {
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

/** 办公室坐班：早读，或非数学正课的白天坐班。课间、午休不算打电话时段。 */
export function isOfficeSittingSlot(slot, date) {
  if (!slot || !date) return false;
  if (isSunday(date, slot)) return false;
  if (slot.isMath) return false;
  if (isEveningPeriodId(slot.id) || slot.isTutoring) return false;
  if (slot.id === "noon" || slot.kind === "break" || slot.kind === "rest" || slot.id === "rest") return false;
  if (slot.id === "morning-read") return true;
  if (isClassPeriodId(slot.id)) return true;
  return false;
}

export function phoneVisitUnavailableReason(state, slot = currentSlot(state), date = state?.date) {
  if (!state || !date) return "现在不能打电话。";
  const s = slot || currentSlot(state);
  if (parentsDayOn(date, state)) return "今天已经见面谈了，电话家访请放到平时办公室坐班时再打。";
  if (isSunday(date, s)) return "周日不宜打电话，若还要联系家长，请做上门家访。";
  const blocked = blockedMajorKind(date);
  if (blocked === "exam" || examDayOn(date, s)) return "今天考试，不打电话。";
  if (blocked === "activity" || activityDayOn(date) || s?.isActivityPeriod) return "今天是学校活动日，不打电话。";
  if (s?.isMath) return "现在是数学正课，电话家访请放到办公室坐班时再打。";
  if (s && (isEveningPeriodId(s.id) || s.isTutoring)) return "晚自习不宜给家长打电话。";
  if (!isOfficeSittingSlot(s, date)) return "电话家访要在办公室坐班时打，早读或非数学正课的坐班都可以。";
  const rec = ensureHomeVisitState(state);
  if ((rec.phoneToday || 0) >= PHONE_DAY_CAP) return `今天已经打过 ${PHONE_DAY_CAP} 通电话家访，其余的明天再联系。`;
  if ((rec.phoneCount || 0) >= PHONE_TERM_CAP) return "这学期电话家访已经不少了，先把前面谈过的跟进到位，不要把全班都打一遍。";
  return "";
}

export function isPhoneVisitOpen(state, slot = currentSlot(state), date = state?.date) {
  return !phoneVisitUnavailableReason(state, slot, date);
}

export function doorVisitUnavailableReason(state, slot = currentSlot(state), date = state?.date) {
  if (!state || !date) return "现在不能上门家访。";
  const s = slot || currentSlot(state);
  if (!isSunday(date, s)) return "上门家访只在周日进行，而且是任课数学老师就这一户走访，不是班主任访遍全班。";
  if (parentsDayOn(date, state)) return "今天已经见面谈了，上门家访请改日再去。";
  const blocked = blockedMajorKind(date);
  if (blocked === "exam" || examDayOn(date, s)) return "今天考试，不宜上门家访。";
  if (blocked === "activity" || activityDayOn(date)) return "今天是学校活动日，不宜上门家访。";
  const rec = ensureHomeVisitState(state);
  if (rec.doorDate === date) return "今天已经走访过一户，周日每天最多去一户。";
  if ((rec.doorCount || 0) >= DOOR_TERM_CAP) return "这学期上门家访已经到了大约三四户的上限，先不添新的。这不是教育局规定的家访周，只是任课老师抽空去几户。";
  return "";
}

export function isDoorVisitOpen(state, slot = currentSlot(state), date = state?.date) {
  return !doorVisitUnavailableReason(state, slot, date);
}

function talkedAtMeetingToday(student, date) {
  return student?.lastParentMeeting?.date === date;
}

function homeVisitedOn(student, date, kind = null) {
  const recs = student?.homeVisits || [];
  return recs.some((r) => r.date === date && (!kind || r.kind === kind))
    || (student?.lastHomeVisit?.date === date && (!kind || student.lastHomeVisit.kind === kind));
}

function doorVisitedThisTerm(student, date) {
  const key = termVisitKey(date);
  const recs = student?.homeVisits || [];
  if (student?.lastHomeVisit?.kind === "door" && termVisitKey(student.lastHomeVisit.date) === key) return true;
  return recs.some((r) => r.kind === "door" && termVisitKey(r.date) === key);
}

function phonedThisTerm(student, date) {
  const key = termVisitKey(date);
  const recs = student?.homeVisits || [];
  if (student?.lastHomeVisit?.kind === "phone" && termVisitKey(student.lastHomeVisit.date) === key) return true;
  return recs.some((r) => r.kind === "phone" && termVisitKey(r.date) === key);
}

function classmatesOf(state, student) {
  return playerClassStudents(state).filter((s) => !student || s.classNo === student.classNo);
}

function factBundle(student, state) {
  const ctx = studentTeachingContext(student, state);
  const brief = composeParentBrief(student, state);
  const hw = ctx?.hw || brief.homework;
  const peers = classPeersOf(student, classmatesOf(state, student));
  const onLeave = !!(state && isAwayFromClass(student, state));
  const leave = onLeave || !!(state && leaveCovering(student, state.date, state.seed));
  const returned = student.justReturned?.date && daysBetween(student.justReturned.date, state.date) <= 3;
  const visitDays = student.lastVisit?.date ? daysBetween(student.lastVisit.date, state.date) : 99;
  const recentVisit = visitDays >= 0 && visitDays <= 3;
  const missing = !!(hw && (isOpenHomework(hw) || hw.correction === "待补交" || hw.status === "缺交"));
  const corr = !!(hw && (hw.correction === "待订正" || hw.correction === "已订正待复查" || hw.quality === "错题较多" || hw.quality === "未订正"));
  const weakExam = brief.exam?.line === "未达二本" || brief.exam?.line === "二本";
  const veryWeak = brief.exam?.line === "未达二本";
  return {
    ctx, brief, hw, peers, leave, returned, recentVisit, missing, corr, weakExam, veryWeak,
    flag: ctx?.flag || student.lastClassFlag || null,
    tense: peers.tense || null,
  };
}

function phoneReason(facts, student) {
  if (facts.missing) return "最近作业还缺交，需要跟家里说一声";
  if (facts.corr) return "订正还没跟上，想请家长盯一盯";
  if (facts.leave) return "这几天请假在家，打电话问一声近况";
  if (facts.returned) return "刚结束请假，想跟家长对一下在校情况";
  if (facts.recentVisit) return "刚来找过老师，想把这件事跟到家里";
  if (facts.tense) return `最近和${facts.tense.name}有些别扭，需要跟家长通气`;
  if (facts.veryWeak) return "最近考试还没达线，需要跟家长说明";
  if (facts.weakExam) return "最近考试还比较吃力，想跟家长通报一声";
  if (facts.flag === "走神") return "课堂上有些走神，请家长一起留意作息";
  return "例行向家长通报一下数学近况";
}

function doorReason(facts, student) {
  if (facts.missing || facts.corr) return "作业和订正需要到家里坐一坐，把近况说清楚";
  if (facts.veryWeak || facts.weakExam) return "考试近况需要到家里当面谈一谈";
  if (facts.leave || facts.returned) return "最近请假，适合上门看一眼在家的情况";
  if (facts.tense) return `和同学有些别扭，想到家里把情况说开`;
  if (facts.flag === "走神") return "课堂状态需要到家里坐一坐，请家长一起盯作息";
  if (facts.recentVisit) return "刚来找过老师，需要到家里把跟进说清楚";
  return "长期想跟家里坐一坐，通报一下数学近况";
}

function phoneScore(student, state) {
  if (talkedAtMeetingToday(student, state.date)) return -100;
  if (homeVisitedOn(student, state.date, "phone")) return -100;
  const facts = factBundle(student, state);
  let p = parentTalkPriority(student, state);
  if (p < 0) p = 0;
  if (facts.missing) p += 2;
  if (facts.leave) p += 4;
  if (facts.returned) p += 3;
  if (facts.tense) p += 3;
  if (facts.recentVisit) p += 2;
  if (facts.veryWeak) p += 1;
  return p;
}

function doorScore(student, state) {
  if (doorVisitedThisTerm(student, state.date)) return -100;
  if (talkedAtMeetingToday(student, state.date)) return -100;
  const facts = factBundle(student, state);
  let p = parentTalkPriority(student, state);
  if (p < 0) p = 0;
  if (facts.missing) p += 5;
  if (facts.corr) p += 3;
  if (facts.veryWeak) p += 3;
  if (facts.weakExam) p += 1;
  if (facts.flag === "走神") p += 2;
  if (student.lastClassLate?.date) p += 1;
  if (phonedThisTerm(student, state.date) && (facts.missing || facts.corr || facts.veryWeak)) p += 2;
  if (facts.leave || facts.returned) p += 2;
  return p;
}

function rankStudents(state, kind, date = state?.date) {
  const classmates = playerClassStudents(state);
  const tag = kind === "door" ? "door-suggest" : "phone-suggest";
  const scored = classmates.map((s) => {
    const score = kind === "door" ? doorScore(s, state) : phoneScore(s, state);
    const tie = hash01(state.seed, date, s.id, tag);
    return { student: s, score, tie };
  });
  scored.sort((a, b) => (b.score - a.score) || (a.tie - b.tie) || String(a.student.id).localeCompare(String(b.student.id)));
  return scored;
}

function takeSuggestions(ranked, minN, maxN) {
  const usable = ranked.filter((x) => x.score >= 0);
  const strong = usable.filter((x) => x.score > 0);
  let n = strong.length;
  if (n < minN) n = Math.min(minN, usable.length);
  if (n > maxN) n = maxN;
  if (n < minN) n = Math.min(minN, usable.length);
  return usable.slice(0, n);
}

function toSuggestion(state, row, kind) {
  const s = row.student;
  const facts = factBundle(s, state);
  return {
    studentId: s.id,
    name: s.name,
    seq: s.seq,
    kind,
    score: row.score,
    reason: kind === "door" ? doorReason(facts, s) : phoneReason(facts, s),
    options: kind === "door" ? DOOR_ACTIONS.slice() : PHONE_ACTIONS.slice(),
    onLeave: !!facts.leave,
  };
}

/** 同一天、同一种子、同一事实下名单稳定。 */
export function suggestPhoneVisits(state, date = state?.date) {
  if (!state || !date) return [];
  const saved = state.date;
  if (date !== state.date) state.date = date;
  const ranked = rankStudents(state, "phone", date);
  const picked = takeSuggestions(ranked, PHONE_SUGGEST_MIN, PHONE_SUGGEST_MAX);
  const out = picked.map((row) => toSuggestion(state, row, "phone"));
  if (date !== saved) state.date = saved;
  return out;
}

export function suggestDoorVisits(state, date = state?.date) {
  if (!state || !date) return [];
  const saved = state.date;
  if (date !== state.date) state.date = date;
  const ranked = rankStudents(state, "door", date);
  const picked = takeSuggestions(ranked, DOOR_SUGGEST_MIN, DOOR_SUGGEST_MAX);
  const out = picked.map((row) => toSuggestion(state, row, "door"));
  if (date !== saved) state.date = saved;
  return out;
}

function findClassStudent(state, studentId) {
  return playerClassStudents(state).find((s) => s.id === studentId) || null;
}

function applyVisitEffects(student, actionId, kind) {
  let rel = 1, coop = 1, stress = -1;
  if (actionId === "watchHw" || actionId === "sitTalk") {
    rel = 1; coop = 2; stress = 0;
  } else if (actionId === "goodFirst" || actionId === "encourage") {
    rel = 2; coop = 1; stress = -1;
  } else if (actionId === "restFirst" || actionId === "restHome") {
    rel = 1; coop = 1; stress = -2;
  }
  if (kind === "door") {
    rel += 1;
    coop += 1;
  }
  student.relation = clamp((student.relation || 0) + rel, 0, 100);
  student.parentCoop = clamp(parentCoopOf(student) + coop, 0, 100);
  student.stress = clamp((student.stress || 40) + stress, 0, 95);
}

function actionLine(actionId, name) {
  if (actionId === "watchHw") return `你把近况说清楚，请家长这几天盯一盯${name}的作业和订正。`;
  if (actionId === "goodFirst") return `你先说了${name}近来做得好的地方，再把还要跟上的问题说清楚。`;
  if (actionId === "restFirst") return `你请家长先让${name}把休息和作息稳住，功课先不加压。`;
  if (actionId === "sitTalk") return `你在家里坐下来，把近况说清楚，请家长一起盯作业和订正。`;
  if (actionId === "encourage") return `你先肯定了${name}的进步，再把还需要跟上的地方说开。`;
  if (actionId === "restHome") return `你请家长先把${name}的身体和作息稳住，这几天功课先不加压。`;
  return `你把近况跟家长说了。`;
}

function composeVisitText(state, student, actionId, kind) {
  const brief = composeParentBrief(student, state);
  const seat = seatLabel(student);
  const act = actionLine(actionId, student.name);
  if (kind === "phone") {
    return `你利用办公室坐班，给${student.name}（${seat}）家里打了电话。你作为数学任课老师说明了近况：考试方面，${brief.examText}；作业方面，${brief.homeworkText}；课堂方面，${brief.classText}。${act}这不是班主任对全班的家访，只是任课老师就这一名学生通气。`;
  }
  return `周日你作为卓行${state.player?.classNo || 16}班数学任课老师，上门拜访了${student.name}（${seat}）家里。你谈了近况：考试方面，${brief.examText}；作业方面，${brief.homeworkText}；课堂方面，${brief.classText}。${act}这是任课数学老师就这一户的家访，不是班主任走访全班，也不是教育局规定的家访周。日期按宁川中学校内安排。`;
}

function statusLineFor(date, kind, actionId) {
  const verb = kind === "door" ? "上门家访" : "电话家访";
  if (actionId === "watchHw" || actionId === "sitTalk") return `${date}${verb}：数学老师与家长谈了近况，并请家长盯作业`;
  if (actionId === "goodFirst" || actionId === "encourage") return `${date}${verb}：数学老师先报了喜，再把还要跟上的问题说了`;
  if (actionId === "restFirst" || actionId === "restHome") return `${date}${verb}：数学老师请家长先让学生把休息稳住`;
  return `${date}${verb}：数学老师与家长谈了近况`;
}

function recordVisit(state, student, actionId, kind, text) {
  const rec = {
    date: state.date,
    kind,
    actionId,
    text,
    statusLine: statusLineFor(state.date, kind, actionId),
    role: "数学任课老师",
  };
  student.lastHomeVisit = rec;
  student.homeVisits = [rec, ...(student.homeVisits || [])].slice(0, 8);
  student.talks = [...(student.talks || []), { date: state.date, topic: kind === "door" ? "上门家访" : "电话家访", text, seat: seatLabel(student) }];
  applyVisitEffects(student, actionId, kind);
  const box = ensureHomeVisitState(state);
  if (kind === "phone") {
    box.phoneDate = state.date;
    box.phoneToday = (box.phoneToday || 0) + 1;
    box.phoneCount = (box.phoneCount || 0) + 1;
  } else {
    box.doorDate = state.date;
    box.doorCount = (box.doorCount || 0) + 1;
  }
  return rec;
}

function assertAction(kind, actionId) {
  const list = kind === "door" ? DOOR_ACTIONS : PHONE_ACTIONS;
  return list.find((o) => o.id === actionId) || null;
}

/** 办公室坐班时打电话：写入档案近况和日志材料，不改能力或分数。 */
export function handlePhoneVisit(state, studentId, actionId) {
  if (!state) return { ok: false, reason: "现在不能打电话。" };
  const blocked = phoneVisitUnavailableReason(state);
  if (blocked) return { ok: false, reason: blocked };
  const student = findClassStudent(state, studentId);
  if (!student) return { ok: false, reason: "先从建议名单里选一名本班学生，再打电话。" };
  if (talkedAtMeetingToday(student, state.date)) {
    return { ok: false, reason: "今天已经见面谈了，不必再给同一人打电话。" };
  }
  if (homeVisitedOn(student, state.date, "phone")) {
    return { ok: false, reason: `今天已经和${student.name}家里通过电话了。` };
  }
  const action = assertAction("phone", actionId);
  if (!action) return { ok: false, reason: "请从这几个简短办法里选一个，不要另外发挥。" };
  const text = composeVisitText(state, student, actionId, "phone");
  const rec = recordVisit(state, student, actionId, "phone", text);
  return { ok: true, text, rec, student, kind: "phone" };
}

/** 周日上门家访：每天一户，每学期大约三四户。 */
export function handleDoorVisit(state, studentId, actionId) {
  if (!state) return { ok: false, reason: "现在不能上门家访。" };
  const blocked = doorVisitUnavailableReason(state);
  if (blocked) return { ok: false, reason: blocked };
  const student = findClassStudent(state, studentId);
  if (!student) return { ok: false, reason: "先从建议名单里选一户本班学生，再上门。" };
  if (doorVisitedThisTerm(student, state.date) && student.lastHomeVisit?.kind === "door") {
    return { ok: false, reason: `这学期已经去过${student.name}家里，先把其他还需要走访的户看一看。` };
  }
  const action = assertAction("door", actionId);
  if (!action) return { ok: false, reason: "请从这几个简短办法里选一个，不要另外发挥。" };
  const text = composeVisitText(state, student, actionId, "door");
  const rec = recordVisit(state, student, actionId, "door", text);
  return { ok: true, text, rec, student, kind: "door" };
}
