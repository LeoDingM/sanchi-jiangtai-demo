/**
 * 培优补差：本班数学任课老师的课余辅导。
 * 建议名单和辅导摘记由已有事实与确定性 PRNG 生成，不用 LLM，不改能力、分数或省控。
 * 这不是补习班或校外培训，日期按宁川中学校内安排。
 */
import { clamp, hash01 } from "./prng.js?v=t66u2";
import { schoolYearOf, termOf, weekday } from "./calendar.js?v=t66u2";
import {
  activityEventOn, currentSlot, isEveningPeriodId, majorEventOn,
} from "./timetable.js?v=t66u2";
import { allHomeworkRows, isOpenHomework, studentTeachingContext } from "./teaching.js?v=t66u2";
import { composeParentBrief, isParentsMeetingOpen } from "./parents.js?v=t66u2";
import { playerClassStudents } from "./visits.js?v=t66u2";
import { isOfficeSittingSlot } from "./homeVisit.js?v=t66u2";
import { isAwayFromClass, leaveCovering } from "./health.js?v=t66u2";
import { hasLargeRoom, subjectRoom, WIDE_ROOM } from "./potential.js?v=t66u2";
import { seatLabel } from "./school.js?v=t66u2";

export const COACH_DAY_CAP = 1;
export const COACH_TERM_CAP = 18;
export const COACH_SESSION_MIN = 2;
export const COACH_SESSION_MAX = 4;

export const COACH_ACTIONS = [
  { id: "fixErrors", label: "盯错题" },
  { id: "clearHw", label: "先把作业清掉" },
  { id: "extend", label: "讲一道拓展题" },
];

export const COACH_SOURCE_NOTE = "这是本班数学任课老师的课余辅导，不是补习班或校外培训。日期按宁川中学校内安排。";

export function termCoachKey(date) {
  if (!date) return "";
  return `${schoolYearOf(date)}-${termOf(date)}`;
}

export function kindLabel(kind) {
  return kind === "enrich" ? "培优" : "补差";
}

export function ensureCoachingState(state) {
  if (!state) return null;
  const key = termCoachKey(state.date);
  const cur = state.coaching;
  if (!cur || typeof cur !== "object") {
    state.coaching = { termKey: key, count: 0, date: null, kind: null };
    return state.coaching;
  }
  if (cur.termKey !== key) {
    state.coaching = { termKey: key, count: 0, date: null, kind: null };
    return state.coaching;
  }
  return cur;
}

function isSunday(date, slot) {
  if (date && weekday(date) === 0) return true;
  if (!slot) return false;
  return slot.id === "rest" || slot.kind === "rest";
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

/** 辅导时段，或办公室坐班（早读、非数学正课的白天坐班）。 */
export function isCoachingTimeSlot(slot, date) {
  if (!slot || !date) return false;
  if (isSunday(date, slot)) return false;
  if (slot.isTutoring) return true;
  return isOfficeSittingSlot(slot, date);
}

function windowBlockedReason(state, slot, date) {
  if (!state || !date) return "现在不能做培优补差。";
  const s = slot || currentSlot(state);
  if (parentsDayOn(date, state)) return "今天是家长会，培优补差请放到平时辅导时段或办公室坐班再做。";
  if (isSunday(date, s)) return "周日不做培优补差。这是课余辅导，请放到平时辅导时段或办公室坐班。";
  const blocked = blockedMajorKind(date);
  if (blocked === "exam" || examDayOn(date, s)) return "今天考试，不做培优补差。";
  if (blocked === "activity" || activityDayOn(date, s)) return "今天是学校活动日，不做培优补差。";
  if (s?.isMath && !s?.isTutoring) return "现在是数学正课，培优补差请放到辅导时段或办公室坐班时再做。";
  if (s && isEveningPeriodId(s.id) && !s.isTutoring) return "现在是普通晚自习巡视，不是辅导时段，不宜留下几个人做培优补差。";
  if (!isCoachingTimeSlot(s, date)) return "培优补差要在辅导时段或办公室坐班时做，早读或非数学正课的白天坐班都可以。";
  return "";
}

export function coachingUnavailableReason(state, slot = currentSlot(state), date = state?.date) {
  const blocked = windowBlockedReason(state, slot, date);
  if (blocked) return blocked;
  const rec = ensureCoachingState(state);
  if (rec.date === date) return "今天已经做过一场培优补差，每天最多一场。";
  if ((rec.count || 0) >= COACH_TERM_CAP) return "这学期课余辅导已经到了大约十六到二十场的上限，先把前面带过的人跟进到位，不要把整班都拉来。";
  return "";
}

export function isCoachingOpen(state, slot = currentSlot(state), date = state?.date) {
  return !coachingUnavailableReason(state, slot, date);
}

export function isCoachingWindow(state, slot = currentSlot(state), date = state?.date) {
  return !windowBlockedReason(state, slot, date);
}

function onLeave(student, state, date = state?.date) {
  if (!student || !state || !date) return false;
  if (date === state.date && isAwayFromClass(student, state)) return true;
  return !!leaveCovering(student, date, state.seed);
}

function latestExamOf(student, state) {
  const year = student.entryYear ?? state.player?.cohortYear;
  const list = Object.values(state.exams || {})
    .filter((e) => (e.entryYear == null || Number(e.entryYear) === Number(year)) && e.examKind !== "huikao" && (e.rows || []).length)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  for (const rep of list) {
    const row = (rep.rows || []).find((r) => r.studentId === student.id);
    if (row) {
      return {
        examName: rep.examName,
        examKind: rep.examKind,
        date: rep.date,
        total: row.total,
        math: row.math,
        line: row.line,
        maxTotal: row.maxTotal,
      };
    }
  }
  return null;
}

function classMathCut(state) {
  const mates = playerClassStudents(state);
  const maths = [];
  for (const s of mates) {
    const ex = latestExamOf(s, state);
    if (ex?.math != null) maths.push(ex.math);
  }
  if (maths.length < 8) return null;
  maths.sort((a, b) => a - b);
  return {
    low: maths[Math.floor(maths.length / 3)],
    mid: maths[Math.floor(maths.length / 2)],
  };
}

function factBundle(student, state, date = state?.date) {
  const ctx = studentTeachingContext(student, state);
  const brief = composeParentBrief(student, state);
  const hw = ctx?.hw || brief.homework;
  const exam = brief.exam || latestExamOf(student, state);
  const leave = onLeave(student, state, date);
  const missing = !!(hw && (isOpenHomework(hw) || hw.correction === "待补交" || hw.status === "缺交"));
  const corr = !!(hw && (hw.correction === "待订正" || hw.correction === "已订正待复查" || hw.quality === "错题较多" || hw.quality === "未订正"));
  const weakLine = exam?.line === "未达二本" || exam?.line === "二本";
  const veryWeak = exam?.line === "未达二本";
  const cuts = classMathCut(state);
  const weakMath = !!(exam && (veryWeak || weakLine || (cuts && exam.math != null && exam.math <= cuts.low)));
  const quiz = ctx?.quiz || student.lastQuiz;
  const lowQuiz = !!(quiz && quiz.score != null && (quiz.score < 60 || (cuts && quiz.score <= 70 && weakMath)));
  const flag = ctx?.flag || student.lastClassFlag || null;
  const room = subjectRoom(student, "math");
  const largeRoom = hasLargeRoom(student, "math");
  const wideRoom = !!(room && room.room >= WIDE_ROOM);
  const slimRoom = !!(room && room.room >= 6);
  const decentLine = exam && exam.line && exam.line !== "未达二本" && exam.line !== "二本";
  const decentMath = !!(exam && cuts && exam.math != null && exam.math >= cuts.mid) || decentLine;
  const unstable = !!(lowQuiz || (hw && (hw.quality === "一般" || hw.quality === "未订正" || corr)) || flag === "走神");
  const decentUnstable = !!(!veryWeak && !missing && (decentMath || (!exam && (student.ability?.math || 0) >= 55)) && unstable);
  return {
    ctx, brief, hw, exam, leave, missing, corr, weakLine, veryWeak, weakMath,
    lowQuiz, flag, largeRoom, wideRoom, slimRoom, decentUnstable, room,
  };
}

function remedialReason(facts) {
  if (facts.missing) return "最近数学作业还缺交或没补上，适合留下补差";
  if (facts.corr) return "订正和错题还比较吃力，适合留下把作业清一清";
  if (facts.veryWeak || facts.weakMath) return "刚考的数学还偏弱，适合留下补一补";
  if (facts.flag === "走神") return "课堂上有些跟不上，适合留下补差";
  if (facts.lowQuiz) return "随堂小测还不够稳，适合留下盯一盯";
  return "最近数学还需要补一补";
}

function enrichReason(facts) {
  if (facts.wideRoom) return "数学余地较大，适合留下讲一道拓展题";
  if (facts.largeRoom && facts.decentUnstable) return "数学有余地，但成绩还不够稳，适合留下培优";
  if (facts.largeRoom) return "数学余地较大，适合留下培优";
  if (facts.decentUnstable) return "成绩尚可但还不够稳，适合留下把方法再讲扎实";
  if (facts.slimRoom) return "数学还有一点空间，适合留下拓一拓";
  return "数学还有可挖的地方，适合留下培优";
}

function remedialScore(student, state, date) {
  if (onLeave(student, state, date)) return -1000;
  const facts = factBundle(student, state, date);
  let p = 0;
  if (facts.missing) p += 6;
  if (facts.corr) p += 5;
  if (facts.veryWeak) p += 5;
  else if (facts.weakMath) p += 4;
  if (facts.flag === "走神") p += 3;
  if (facts.lowQuiz) p += 3;
  return p;
}

function enrichScore(student, state, date) {
  if (onLeave(student, state, date)) return -1000;
  const facts = factBundle(student, state, date);
  if (facts.missing || facts.veryWeak) return -100;
  let p = 0;
  if (facts.wideRoom) p += 8;
  else if (facts.largeRoom) p += 6;
  else if (facts.slimRoom) p += 2;
  if (facts.decentUnstable) p += 4;
  return p;
}

function rankKind(state, kind, date, periodId) {
  const classmates = playerClassStudents(state);
  const tag = kind === "enrich" ? "enrich-suggest" : "remedial-suggest";
  const scored = classmates.map((s) => {
    const score = kind === "enrich" ? enrichScore(s, state, date) : remedialScore(s, state, date);
    const tie = hash01(state.seed, date, periodId || "", s.id, tag);
    return { student: s, score, tie };
  });
  scored.sort((a, b) => (b.score - a.score) || (a.tie - b.tie) || String(a.student.id).localeCompare(String(b.student.id)));
  return scored;
}

function assignLists(state, date, periodId) {
  const rem = rankKind(state, "remedial", date, periodId);
  const enr = rankKind(state, "enrich", date, periodId);
  const remMap = new Map(rem.map((x) => [x.student.id, x]));
  const enrMap = new Map(enr.map((x) => [x.student.id, x]));
  const remList = [];
  const enrList = [];
  const ids = new Set([...remMap.keys(), ...enrMap.keys()]);
  for (const id of ids) {
    const r = remMap.get(id);
    const e = enrMap.get(id);
    const rs = r?.score ?? -1000;
    const es = e?.score ?? -1000;
    if (rs < 0 && es < 0) continue;
    if (es > rs && es > 0) enrList.push(e);
    else if (rs > 0) remList.push(r);
    else if (es > 0) enrList.push(e);
  }
  remList.sort((a, b) => (b.score - a.score) || (a.tie - b.tie) || String(a.student.id).localeCompare(String(b.student.id)));
  enrList.sort((a, b) => (b.score - a.score) || (a.tie - b.tie) || String(a.student.id).localeCompare(String(b.student.id)));
  return { remList, enrList };
}

function takeSession(list) {
  const usable = list.filter((x) => x.score > 0);
  if (usable.length < COACH_SESSION_MIN) return [];
  const n = Math.min(COACH_SESSION_MAX, usable.length);
  return usable.slice(0, n);
}

function toSuggestion(state, row, kind, date) {
  const s = row.student;
  const facts = factBundle(s, state, date);
  return {
    studentId: s.id,
    name: s.name,
    seq: s.seq,
    kind,
    score: row.score,
    reason: kind === "enrich" ? enrichReason(facts) : remedialReason(facts),
    options: COACH_ACTIONS.slice(),
    onLeave: false,
    seat: seatLabel(s),
  };
}

function withDate(state, date, fn) {
  if (!state || !date) return fn();
  const saved = state.date;
  if (date !== saved) state.date = date;
  try {
    return fn();
  } finally {
    if (date !== saved) state.date = saved;
  }
}

/** 同一 seed、日期、节次下名单稳定。请假不在校的学生不列入。 */
export function suggestRemedial(state, date = state?.date, periodId = state?.periodId) {
  if (!state || !date) return [];
  return withDate(state, date, () => {
    const { remList } = assignLists(state, date, periodId);
    return takeSession(remList).map((row) => toSuggestion(state, row, "remedial", date));
  });
}

export function suggestEnrichment(state, date = state?.date, periodId = state?.periodId) {
  if (!state || !date) return [];
  return withDate(state, date, () => {
    const { enrList } = assignLists(state, date, periodId);
    return takeSession(enrList).map((row) => toSuggestion(state, row, "enrich", date));
  });
}

export function suggestCoaching(state, date = state?.date, periodId = state?.periodId) {
  return {
    remedial: suggestRemedial(state, date, periodId),
    enrich: suggestEnrichment(state, date, periodId),
  };
}

function findClassStudent(state, studentId) {
  return playerClassStudents(state).find((s) => s.id === studentId) || null;
}

function assertAction(actionId) {
  return COACH_ACTIONS.find((o) => o.id === actionId) || null;
}

function assertKind(kind) {
  if (kind === "remedial" || kind === "enrich") return kind;
  if (kind === "补差") return "remedial";
  if (kind === "培优") return "enrich";
  return null;
}

function actionLine(actionId, names) {
  const who = names.join("、");
  if (actionId === "fixErrors") return `你盯着这几个人把错题重新走了一遍，让${who}先把关键步写对。`;
  if (actionId === "clearHw") return `你先带着这几个人把还欠着的作业和订正清掉，${who}当场把该补的补上。`;
  if (actionId === "extend") return `你给这几个人讲了一道拓展题，让${who}把方法再往前走一步。`;
  return `你把这几个人留下来做了课余辅导。`;
}

function composeSessionText(state, kind, actionId, students) {
  const label = kindLabel(kind);
  const names = students.map((s) => `${s.name}（${seatLabel(s)}）`);
  const act = actionLine(actionId, students.map((s) => s.name));
  const slot = currentSlot(state);
  const when = slot?.isTutoring ? "你利用辅导时段" : "你利用办公室坐班";
  return `${when}，把${names.join("、")}留下来做了一场本班数学${label}。${act}${COACH_SOURCE_NOTE}`;
}

function statusLineFor(date, kind, actionId) {
  const label = kindLabel(kind);
  if (actionId === "fixErrors") return `${date}${label}：数学老师盯了错题`;
  if (actionId === "clearHw") return `${date}${label}：数学老师带着把作业清掉`;
  if (actionId === "extend") return `${date}${label}：数学老师讲了一道拓展题`;
  return `${date}${label}：数学老师做了课余辅导`;
}

function studentBit(student, actionId, kind) {
  const label = kindLabel(kind);
  if (actionId === "fixErrors") return `你把${student.name}留下来做${label}，对着错题把关键步重新走了一遍。`;
  if (actionId === "clearHw") return `你把${student.name}留下来做${label}，先把还欠着的作业和订正清掉。`;
  if (actionId === "extend") return `你把${student.name}留下来做${label}，讲了一道拓展题，把方法再往前推了一步。`;
  return `你把${student.name}留下来做了${label}。`;
}

function touchHomework(state, student, actionId) {
  const rows = allHomeworkRows(state).filter((r) => r.id === student.id);
  const row = rows.find((r) => isOpenHomework(r)) || rows[0];
  if (!row) return;
  if (actionId === "fixErrors") {
    if (row.correction === "待订正" || row.quality === "错题较多" || row.quality === "未订正") {
      row.correction = "已订正待复查";
    }
  } else if (actionId === "clearHw") {
    if (row.correction === "待补交" || row.status === "缺交") {
      row.status = "已交";
      row.urged = true;
      row.correction = "已补交待面批";
    } else if (row.correction === "待订正" || row.quality === "错题较多" || row.quality === "未订正") {
      row.correction = "已订正待复查";
    }
  }
  if (student.lastHomework && (!student.lastHomework.topic || student.lastHomework.topic === row.topic)) {
    student.lastHomework.correction = row.correction;
    student.lastHomework.status = row.status;
  }
}

function applyCoachEffects(student, actionId) {
  let rel = 1;
  let stress = 0;
  if (actionId === "fixErrors") { rel = 1; stress = 0; }
  else if (actionId === "clearHw") { rel = 1; stress = 0; }
  else if (actionId === "extend") { rel = 2; stress = -1; }
  student.relation = clamp((student.relation || 0) + rel, 0, 100);
  student.stress = clamp((student.stress || 40) + stress, 0, 95);
}

function recordStudent(state, student, kind, actionId, sessionText) {
  const bit = studentBit(student, actionId, kind);
  const rec = {
    date: state.date,
    periodId: state.periodId,
    kind,
    actionId,
    text: `${bit}${COACH_SOURCE_NOTE}`,
    sessionText,
    statusLine: statusLineFor(state.date, kind, actionId),
    role: "数学任课老师",
  };
  student.lastCoaching = rec;
  student.coachings = [rec, ...(student.coachings || [])].slice(0, 8);
  student.talks = [...(student.talks || []), {
    date: state.date,
    topic: kindLabel(kind),
    text: rec.text,
    seat: seatLabel(student),
  }];
  applyCoachEffects(student, actionId);
  touchHomework(state, student, actionId);
  return rec;
}

/**
 * 从建议名单确认 2–4 人后开一场。不改能力、分数或省控。
 * studentIds 缺省时使用该场建议名单。
 */
export function handleCoaching(state, kind, studentIds, actionId) {
  if (!state) return { ok: false, reason: "现在不能做培优补差。" };
  const blocked = coachingUnavailableReason(state);
  if (blocked) return { ok: false, reason: blocked };
  const k = assertKind(kind);
  if (!k) return { ok: false, reason: "请先确认是补差还是培优。" };
  const action = assertAction(actionId);
  if (!action) return { ok: false, reason: "请从这几个简短办法里选一个，不要另外发挥。" };
  const suggested = k === "enrich" ? suggestEnrichment(state) : suggestRemedial(state);
  const suggestIds = new Set(suggested.map((v) => v.studentId));
  let ids = Array.isArray(studentIds) && studentIds.length ? [...new Set(studentIds)] : suggested.map((v) => v.studentId);
  if (ids.length < COACH_SESSION_MIN || ids.length > COACH_SESSION_MAX) {
    return { ok: false, reason: `每场只留下 ${COACH_SESSION_MIN}–${COACH_SESSION_MAX} 人，不要把整班拉来。` };
  }
  const students = [];
  for (const id of ids) {
    if (!suggestIds.has(id)) return { ok: false, reason: "请从建议名单里确认要留下的人，再开场。" };
    const student = findClassStudent(state, id);
    if (!student) return { ok: false, reason: "请从建议名单里确认要留下的本班学生，再开场。" };
    if (onLeave(student, state)) return { ok: false, reason: `${student.name}今天请假不在校，不能列入当场。` };
    students.push(student);
  }
  if (students.length < COACH_SESSION_MIN) {
    return { ok: false, reason: `每场至少留下 ${COACH_SESSION_MIN} 人。` };
  }
  const text = composeSessionText(state, k, actionId, students);
  const recs = students.map((s) => recordStudent(state, s, k, actionId, text));
  const box = ensureCoachingState(state);
  box.date = state.date;
  box.kind = k;
  box.count = (box.count || 0) + 1;
  box.lastAction = actionId;
  box.lastIds = students.map((s) => s.id);
  return { ok: true, text, recs, students, kind: k, actionId };
}
