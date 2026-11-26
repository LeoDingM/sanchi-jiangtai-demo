/**
 * 数学备课组校内集体备课：办公室坐班时，由备课组长主持，
 * 任课老师参加，对齐本周课题、例题口径和作业范围。
 * 议程和纪要由已有课题、课时与作业事实及确定性 PRNG 生成，不用 LLM，
 * 不改能力、分数、排名或省控，不能代替个人备课（prepareLesson）或上课，
 * 玩家也不是备课组长。
 */
import { hash01 } from "./prng.js?v=t63u1";
import { addDays, eventsOn, SCHOOL_CALENDAR, schoolYearOf, termOf, weekday } from "./calendar.js?v=t63u1";
import {
  activityEventOn, currentSlot, isEveningPeriodId, majorEventOn, weekStart,
} from "./timetable.js?v=t63u1";
import { allHomeworkRows, isOpenHomework, suggestedTopic, topicProgress, topicsForGrade } from "./teaching.js?v=t63u1";
import { isParentsMeetingOpen } from "./parents.js?v=t63u1";
import { isOfficeSittingSlot } from "./homeVisit.js?v=t63u1";
import { isTeachersDayPlayDate } from "./teachersDay.js?v=t63u1";
import { isQualityMeetOpen } from "./qualityMeet.js?v=t63u1";
import { MENTOR_NAME } from "./config.js?v=t63u1";

export const GROUP_PREP_WEEK_CAP = 1;
export const GROUP_PREP_TERM_CAP = 12;

export const GROUP_PREP_ACTIONS = [
  { id: "listen", label: "先听记录" },
  { id: "supplement", label: "补充本班学情" },
  { id: "confirm", label: "确认例题难度" },
];

export const GROUP_PREP_SOURCE_NOTE = "这是宁川中学数学备课组的校内集体备课，由备课组长主持，你以任课（实习或正式）数学老师身份参加，不是接任备课组长。集体备课只对齐本周课题、例题口径和作业范围，不能代替你自己备课或上课，也不是向师傅请教、质量分析会或听课。";

export const GROUP_PREP_COLLEAGUES = [
  { id: "fang", name: "方伯宁", title: "高一数学", grade: 1 },
  { id: "jiang", name: "江孟勤", title: "高二数学", grade: 2 },
  { id: "han", name: "韩承业", title: "高三数学", grade: 3 },
];

export function termGroupPrepKey(date) {
  if (!date) return "";
  return `${schoolYearOf(date)}-${termOf(date)}`;
}

export function weekGroupPrepKey(date) {
  return weekStart(date) || "";
}

function playerGradeOn(state, date) {
  if (!state?.player?.cohortYear || !date) return 0;
  return schoolYearOf(date) - Number(state.player.cohortYear) + 1;
}

export function groupPrepsThisTerm(state, date = state?.date) {
  if (!state || !date) return [];
  const key = termGroupPrepKey(date);
  return (state.groupPreps || []).filter((r) => (r.termKey || termGroupPrepKey(r.date)) === key);
}

export function hasGroupPrepThisWeek(state, date = state?.date) {
  if (!state || !date) return false;
  const key = weekGroupPrepKey(date);
  if ((state.groupPreps || []).some((r) => weekGroupPrepKey(r.date) === key)) return true;
  const cur = state.groupPrep;
  return !!(cur && cur.weekKey === key && cur.done);
}

export function latestGroupPrepThisWeek(state, date = state?.date) {
  if (!state || !date) return null;
  const key = weekGroupPrepKey(date);
  const hit = (state.groupPreps || []).find((r) => weekGroupPrepKey(r.date) === key);
  if (hit) return hit;
  const cur = state.groupPrep;
  if (cur && cur.weekKey === key && cur.lastMinutes) return cur.lastMinutes;
  return null;
}

export function latestGroupPrepMinutes(state) {
  if (!state) return null;
  if (state.groupPrep?.lastMinutes) return state.groupPrep.lastMinutes;
  return (state.groupPreps || [])[0] || null;
}

export function ensureGroupPrepState(state) {
  if (!state) return null;
  if (!Array.isArray(state.groupPreps)) state.groupPreps = [];
  const weekKey = weekGroupPrepKey(state.date);
  const termKey = termGroupPrepKey(state.date);
  const done = hasGroupPrepThisWeek(state, state.date);
  const weekRec = latestGroupPrepThisWeek(state, state.date);
  const last = weekRec || latestGroupPrepMinutes(state);
  const count = groupPrepsThisTerm(state).length;
  const cur = state.groupPrep;
  if (!cur || typeof cur !== "object") {
    state.groupPrep = {
      weekKey, termKey, done, count,
      date: weekRec?.date || null,
      lastAction: weekRec?.actionId || null,
      lastMinutes: weekRec || null,
    };
    return state.groupPrep;
  }
  if (cur.weekKey !== weekKey || cur.termKey !== termKey) {
    state.groupPrep = {
      weekKey, termKey, done, count,
      date: weekRec?.date || null,
      lastAction: weekRec?.actionId || null,
      lastMinutes: weekRec || last || null,
    };
    return state.groupPrep;
  }
  cur.done = done || !!cur.done;
  cur.count = count;
  cur.termKey = termKey;
  if (weekRec && !cur.lastMinutes) cur.lastMinutes = weekRec;
  if (weekRec?.actionId && !cur.lastAction) cur.lastAction = weekRec.actionId;
  if (weekRec?.date && !cur.date) cur.date = weekRec.date;
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

function openingOrReportDay(date) {
  if (!date) return false;
  return (eventsOn(date, SCHOOL_CALENDAR) || []).some((e) => e.kind === "opening");
}

/** 仅办公室坐班（早读或非数学正课的白天坐班）。辅导时段、晚自习巡视不可开。 */
export function isGroupPrepTimeSlot(slot, date) {
  if (!slot || !date) return false;
  if (isSunday(date, slot)) return false;
  if (slot.isTutoring || isEveningPeriodId(slot.id)) return false;
  return isOfficeSittingSlot(slot, date);
}

function calendarBlockedReason(state, slot, date) {
  if (!state || !date) return "现在不能参加集体备课。";
  const s = slot || currentSlot(state);
  if (isTeachersDayPlayDate(date)) return "今天是校内教师节问候窗口，集体备课请放到平时办公室坐班时再参加。";
  if (parentsDayOn(date, state)) return "今天是家长会，集体备课请放到平时办公室坐班时再参加。";
  const blocked = blockedMajorKind(date);
  if (blocked === "exam" || examDayOn(date, s)) return "今天考试或学校有分班、升学安排，不开集体备课。";
  if (blocked === "activity" || activityDayOn(date, s)) return "今天是学校活动日，不开集体备课。";
  if (isSunday(date, s)) return "周日不开集体备课。请放到平时办公室坐班。";
  if (openingOrReportDay(date)) return "今天是开学典礼或报到日，集体备课放到正式上课后的办公室坐班再参加。";
  return "";
}

function slotBlockedReason(state, slot, date) {
  const cal = calendarBlockedReason(state, slot, date);
  if (cal) return cal;
  const s = slot || currentSlot(state);
  if (s?.isMath && !s?.isTutoring) return "现在是数学正课，集体备课请放到办公室坐班时再参加。";
  if (s && (isEveningPeriodId(s.id) || s.isTutoring)) {
    return "集体备课要在办公室坐班时开，不要在辅导时段整场参加，也不要在晚自习巡视时开。";
  }
  if (!isGroupPrepTimeSlot(s, date)) return "集体备课要在办公室坐班时参加，早读或非数学正课的白天坐班都可以。";
  return "";
}

export function groupPrepUnavailableReason(state, slot = currentSlot(state), date = state?.date) {
  const blocked = slotBlockedReason(state, slot, date);
  if (blocked) return blocked;
  if (isQualityMeetOpen(state, slot, date)) {
    return "备课组质量分析会正在开，集体备课请会后再参加。";
  }
  if (hasGroupPrepThisWeek(state, date)) {
    return "本周集体备课已经参加过一次，每周最多一次，请下周办公室坐班再参加。";
  }
  if (groupPrepsThisTerm(state, date).length >= GROUP_PREP_TERM_CAP) {
    return `这学期集体备课已经参加过 ${GROUP_PREP_TERM_CAP} 次，先按前面记下的口径自己备课，不要把组会开成例行签到。`;
  }
  return "";
}

export function isGroupPrepOpen(state, slot = currentSlot(state), date = state?.date) {
  return !groupPrepUnavailableReason(state, slot, date);
}

/** 当日可在办公室查阅或参加（含本周已参加后查阅纪要），且不是考试日/活动日/周日/家长会/教师节/开学典礼。 */
export function isGroupPrepWindow(state, slot = currentSlot(state), date = state?.date) {
  if (!state || !date) return false;
  if (calendarBlockedReason(state, slot, date)) return false;
  const s = slot || currentSlot(state);
  if (s?.isMath && !s?.isTutoring) return false;
  if (s && (isEveningPeriodId(s.id) || s.isTutoring)) return false;
  return isGroupPrepTimeSlot(s, date);
}

function pickPhrase(seed, date, key, phrases) {
  const idx = Math.floor(hash01(seed, date || "", key, "group-prep") * phrases.length) % phrases.length;
  return phrases[idx];
}

export function groupPrepColleagues(state, date = state?.date) {
  const grade = playerGradeOn(state, date) || 1;
  const preferred = GROUP_PREP_COLLEAGUES.find((c) => c.grade === grade) || GROUP_PREP_COLLEAGUES[0];
  const rest = GROUP_PREP_COLLEAGUES.filter((c) => c.id !== preferred.id)
    .map((c) => ({ c, tie: hash01(state?.seed, date || "", c.id, "gp-col") }))
    .sort((a, b) => a.tie - b.tie);
  const extra = hash01(state?.seed, date || "", "gp-col-n") < 0.55;
  return extra && rest[0] ? [preferred, rest[0].c] : [preferred];
}

function weekTopicFacts(state, date = state?.date) {
  const grade = playerGradeOn(state, date) || 1;
  const planTopic = state?.player?.lessonPlan?.topic || "";
  const suggest = suggestedTopic(state, grade);
  const lastTaught = state?.player?.lastTaught?.topic || (state?.player?.lessons || [])[0]?.topic || "";
  const catalog = topicsForGrade(grade) || [];
  const topic = planTopic || suggest || lastTaught || catalog[0] || "本周数学课";
  const prog = topicProgress(state, grade);
  let pace = "本班按现有课时推进，这周先把课题和例题对齐。";
  if (prog?.total) {
    if (prog.done >= Math.ceil(prog.total * 0.6)) {
      pace = `本班这学期已上 ${prog.done}/${prog.total} 个课题，这周重点对齐后面的例题和作业范围。`;
    } else if (prog.done <= 1) {
      pace = `本班这学期刚开了 ${prog.done}/${prog.total} 个课题，这周要对齐「${topic}」的起点和例题。`;
    } else {
      pace = `本班这学期已上 ${prog.done}/${prog.total} 个课题，这周重点对齐「${topic}」。`;
    }
  }
  return { topic, suggest, planTopic, lastTaught, prog, pace, grade };
}

function homeworkFacts(state) {
  const rows = allHomeworkRows(state) || [];
  const open = rows.filter((r) => isOpenHomework(r) || r.quality === "错题较多" || r.quality === "未订正" || r.correction === "待订正" || r.correction === "待面批");
  const topics = [...new Set(open.map((r) => r.topic).filter(Boolean))];
  if (!open.length) {
    return { piled: false, count: 0, topicLine: "", line: "本班眼下没有堆着的作业订正，会上主要对齐例题和作业范围。" };
  }
  const topicBit = topics.length ? `（「${topics.slice(0, 2).join("、")}」）` : "";
  return {
    piled: true,
    count: open.length,
    topicLine: topics.slice(0, 2).join("、"),
    line: `本班还有 ${open.length} 本作业订正未了${topicBit}，会上提醒先把订正落实，再按统一范围布置新作业。`,
  };
}

function exampleLineFor(state, topic, date = state?.date) {
  return pickPhrase(state?.seed, date, `ex-${topic}`, [
    `「${topic}」先讲基本例题再跟一道中档变式，综合题不放在第一道`,
    `「${topic}」例题口径按中档为主，变式控制在一题，作业范围与例题同型`,
    `「${topic}」先把定义和基本方法讲清楚，再对一道典型例题，不另加超纲题`,
  ]);
}

export function composeGroupPrepBrief(state, date = state?.date) {
  if (!state || !date) return null;
  const topics = weekTopicFacts(state, date);
  const hw = homeworkFacts(state);
  const colleagues = groupPrepColleagues(state, date);
  const mentor = state.player?.mentor || MENTOR_NAME;
  const exampleLine = exampleLineFor(state, topics.topic, date);
  const leader = pickPhrase(state.seed, date, "leader", [
    `${mentor}先对照本周要上的「${topics.topic}」，把例题难度和作业范围跟组里对了一遍，强调各班回去仍要自己备课，不要把集体备课当成已经写完教案。`,
    `${mentor}主持集体备课，围绕本周课题「${topics.topic}」对齐例题口径，并提醒作业范围跟例题同型，不另发一套未有的全校进度表。`,
    `${mentor}作为备课组长先讲了本周「${topics.topic}」的例题安排，要求按统一口径选例题，各班仍按自己的教案上课。`,
  ]);
  const colleagueLine = colleagues.map((c) => `${c.name}（${c.title}）`).join("、")
    + pickPhrase(state.seed, date, "col-speak", [
      "也结合所带班级谈了这周进度和例题深浅。",
      "补充了作业范围不宜再加码的看法。",
      "顺着组长的口径，提醒先落实订正再布置新作业。",
    ]);
  const points = [
    `本周课题「${topics.topic}」。${topics.pace}`,
    hw.line,
    `统一例题口径：${exampleLine}。`,
    `${leader}${colleagueLine}`,
  ];
  const shortPoints = `本周课题「${topics.topic}」。${topics.pace}${hw.piled ? `作业订正还堆着 ${hw.count} 本。` : "作业订正没有堆着。"}${mentor}主持，${colleagues.map((c) => c.name).join("、")}到会。例题口径：${exampleLine}。`;
  return {
    topic: topics.topic,
    pace: topics.pace,
    homework: hw,
    exampleLine,
    leader,
    colleagueLine,
    colleagues,
    mentor,
    points,
    shortPoints,
    weekKey: weekGroupPrepKey(date),
    termKey: termGroupPrepKey(date),
  };
}

export function composeGroupPrepMinutes(state, actionId, brief = composeGroupPrepBrief(state)) {
  if (!state || !brief) return "";
  const playerBit = actionId === "supplement"
    ? `你补充了本班学情，说明「${brief.topic}」这周的进度和作业订正情况，供组里对齐时参考。`
    : actionId === "confirm"
      ? `你确认了这周「${brief.topic}」的例题难度，按组里记下的口径回去自己备课，不把集体备课当成已经写完教案。`
      : "你先听记录，把本周课题、例题口径和作业范围记进纪要，会上没有另外发言。";
  return `宁川中学数学备课组召开校内集体备课，由备课组长${brief.mentor}主持。${brief.points.join("")}${playerBit}${GROUP_PREP_SOURCE_NOTE}`;
}

export function groupPrepOptionsFor(state, date = state?.date) {
  const brief = composeGroupPrepBrief(state, date);
  return GROUP_PREP_ACTIONS.map((a) => ({
    id: a.id,
    label: a.label,
    text: composeGroupPrepMinutes(state, a.id, brief),
  }));
}

function assertAction(actionId) {
  return GROUP_PREP_ACTIONS.find((a) => a.id === actionId) || null;
}

/** 参加当周一次集体备课留下的例题口径提示。不自动完成备课，也不改备课充分度。 */
export function groupPrepAlignNote(state, date = state?.date) {
  const rec = latestGroupPrepThisWeek(state, date);
  if (!rec) return "";
  return "对照本周集体备课记下的例题口径，你仍按自己的教案把这节课备完了。集体备课不能代替个人备课。";
}

export function applyGroupPrepAlign(state, result, date = state?.date) {
  if (!result?.ok) return result;
  const note = groupPrepAlignNote(state, date);
  if (!note) return result;
  result.text = `${result.text}${note}`;
  result.groupPrepAligned = true;
  const rec = latestGroupPrepThisWeek(state, date);
  if (result.plan) {
    result.plan.groupPrepNote = rec?.exampleLine || rec?.shortPoints || "";
    if (result.plan.examples && !String(result.plan.examples).includes("集体备课")) {
      result.plan.examples = `${result.plan.examples}本周集体备课已对齐例题口径，仍须自己写完教案。`;
    }
  }
  return result;
}

/**
 * 参加本周一次数学备课组校内集体备课。不改能力、分数、排名或省控，
 * 不自动完成个人备课，也不占用向师傅请教的每日次数。
 */
export function handleGroupPrep(state, actionId) {
  if (!state) return { ok: false, reason: "现在不能参加集体备课。" };
  const blocked = groupPrepUnavailableReason(state);
  if (blocked) return { ok: false, reason: blocked };
  const action = assertAction(actionId);
  if (!action) return { ok: false, reason: "请从先听记录、补充本班学情、确认例题难度这几种方式里选一种，不要另外发挥。" };
  if (hasGroupPrepThisWeek(state)) {
    return { ok: false, reason: "本周集体备课已经参加过一次，每周最多一次，请下周办公室坐班再参加。" };
  }
  const brief = composeGroupPrepBrief(state);
  const minutes = composeGroupPrepMinutes(state, action.id, brief);
  const rec = {
    date: state.date,
    periodId: state.periodId,
    weekKey: brief.weekKey,
    termKey: brief.termKey,
    actionId: action.id,
    topic: brief.topic,
    exampleLine: brief.exampleLine,
    attendees: [brief.mentor, ...brief.colleagues.map((c) => c.name)],
    points: brief.points,
    shortPoints: brief.shortPoints,
    minutes,
    role: "任课数学老师",
    host: brief.mentor,
    hostTitle: "备课组长",
  };
  const box = ensureGroupPrepState(state);
  box.weekKey = brief.weekKey;
  box.termKey = brief.termKey;
  box.done = true;
  box.date = state.date;
  box.lastAction = action.id;
  box.lastMinutes = rec;
  state.groupPreps = [rec, ...(state.groupPreps || [])];
  box.count = groupPrepsThisTerm(state).length;
  const logText = `你在办公室参加了宁川中学数学备课组的校内集体备课（${action.label}）。${minutes}`;
  return { ok: true, text: logText, rec, actionId: action.id, minutes };
}
