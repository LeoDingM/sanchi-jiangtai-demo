/**
 * 课表里普通「自习」节次的看班：任课数学老师进卓行 16 班教室，
 * 巡视纪律、答一道作业问询，或记下交头接耳、走神的人。
 * 文案由本班已有事实与确定性 PRNG 生成，不用 LLM，
 * 不改能力、分数、排名或省控，不能代替备课或上课，
 * 也不能改成主持班会或数学晚自习答疑/点名。
 * 未看班的自习不挡住自动推进或「下一节」。
 */
import { clamp, hash01 } from "./prng.js?v=t74u2";
import { addDays, SCHOOL_CALENDAR, weekday } from "./calendar.js?v=t74u2";
import {
  activityEventOn, currentSlot, formatSlotLabel, majorEventOn,
} from "./timetable.js?v=t74u2";
import { allHomeworkRows, isOpenHomework, suggestedTopic } from "./teaching.js?v=t74u2";
import { isParentsMeetingOpen } from "./parents.js?v=t74u2";
import { isAwayFromClass } from "./health.js?v=t74u2";
import { playerClassStudents } from "./visits.js?v=t74u2";
import { deskChatPairs, deskMateOf } from "./peers.js?v=t74u2";
import { seatLabel } from "./school.js?v=t74u2";
import { HOMEROOM_NAME, PLAYER_CLASS_NO } from "./config.js?v=t74u2";

export const STUDY_HALL_ACTIONS = [
  { id: "patrol", label: "巡视纪律" },
  { id: "answer", label: "答一道作业问询" },
  { id: "note", label: "记下交头接耳或走神的人" },
];

export const STUDY_HALL_SOURCE_NOTE = "这是宁川中学课表里的普通自习课看班，你以本班任课（实习或正式）数学老师身份进卓行16班教室看班，不是班主任，也不能主持班会。不是数学晚自习或数学答疑，也不算学校活动停课。同一节只能看班一次，未看班也不挡住下一节或自动推进。";

export function studyHallSlotKey(date, periodId) {
  if (!date || !periodId) return "";
  return `${date}|${periodId}`;
}

export function recordSlotKey(rec) {
  if (!rec) return "";
  return rec.slotKey || studyHallSlotKey(rec.date, rec.periodId);
}

export function hasStudyHallThisSlot(state, date = state?.date, periodId = state?.periodId) {
  const key = studyHallSlotKey(date, periodId);
  if (!key) return false;
  if ((state.studyHalls || []).some((r) => recordSlotKey(r) === key)) return true;
  const cur = state.studyHall;
  return !!(cur && (cur.slotKey === key || (cur.date === date && cur.periodId === periodId)) && (cur.done || cur.lastMinutes));
}

export function latestStudyHallThisSlot(state, date = state?.date, periodId = state?.periodId) {
  const key = studyHallSlotKey(date, periodId);
  if (!key) return null;
  const hit = (state.studyHalls || []).find((r) => recordSlotKey(r) === key);
  if (hit) return hit;
  const cur = state.studyHall;
  if (cur && (cur.slotKey === key || (cur.date === date && cur.periodId === periodId)) && cur.lastMinutes) {
    return cur.lastMinutes;
  }
  return null;
}

export function latestStudyHallMinutes(state) {
  if (!state) return null;
  if (state.studyHall?.lastMinutes) return state.studyHall.lastMinutes;
  return (state.studyHalls || [])[0] || null;
}

export function ensureStudyHallState(state) {
  if (!state) return null;
  if (!Array.isArray(state.studyHalls)) state.studyHalls = [];
  const key = studyHallSlotKey(state.date, state.periodId);
  const slotRec = latestStudyHallThisSlot(state);
  const last = slotRec || latestStudyHallMinutes(state);
  const done = hasStudyHallThisSlot(state);
  const cur = state.studyHall;
  if (!cur || typeof cur !== "object") {
    state.studyHall = {
      slotKey: key,
      date: slotRec?.date || null,
      periodId: slotRec?.periodId || null,
      done,
      lastAction: slotRec?.actionId || null,
      lastMinutes: slotRec || null,
    };
    return state.studyHall;
  }
  if (cur.slotKey !== key) {
    state.studyHall = {
      slotKey: key,
      date: slotRec?.date || cur.date || null,
      periodId: slotRec?.periodId || (slotRec ? cur.periodId : state.periodId),
      done,
      lastAction: slotRec?.actionId || cur.lastAction || null,
      lastMinutes: slotRec || last || cur.lastMinutes || null,
    };
    return state.studyHall;
  }
  cur.done = done || !!cur.done;
  if (slotRec && !cur.lastMinutes) cur.lastMinutes = slotRec;
  if (slotRec?.actionId && !cur.lastAction) cur.lastAction = slotRec.actionId;
  if (slotRec?.date && !cur.date) cur.date = slotRec.date;
  if (slotRec?.periodId && !cur.periodId) cur.periodId = slotRec.periodId;
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
  const major = majorEventOn(date);
  if (major?.kind === "exam") return true;
  if (major?.kind === "placement1" || major?.kind === "placement2" || major?.kind === "admission" || major?.kind === "promote") return true;
  if (slot?.isExamDay && major?.kind !== "parents" && major?.kind !== "activity") return true;
  return false;
}

function activityPeriodOn(date, slot) {
  if (slot?.isActivityPeriod) return true;
  const major = majorEventOn(date);
  if (major?.kind === "activity") return true;
  const activity = activityEventOn(date);
  if (!activity) return false;
  if (activity.off === "full") return true;
  return false;
}

/** 以当前课表这一节的实际科目为准：必须是「自习」，且不是数学正课或数学辅导。 */
export function isStudyHallSubject(slot) {
  if (!slot) return false;
  if (slot.isMath || slot.isTutoring) return false;
  return slot.subject === "自习";
}

export function isStudyHallTimeSlot(slot, date) {
  if (!slot || !date) return false;
  if (isSunday(date, slot)) return false;
  if (slot.isExamDay && majorEventOn(date)?.kind !== "parents" && !slot.isActivityPeriod) return false;
  if (slot.isActivityPeriod) return false;
  return isStudyHallSubject(slot);
}

function calendarBlockedReason(state, slot, date) {
  if (!state || !date) return "现在不能看自习。";
  const s = slot || currentSlot(state);
  if (parentsDayOn(date, state)) return "今天是家长会，不能进教室看自习。";
  if (examDayOn(date, s)) return "今天考试或学校有分班、升学安排，不开自习看班。";
  if (activityPeriodOn(date, s) || s?.isActivityPeriod) return "这节被学校活动占用，不能按普通自习看班。";
  if (isSunday(date, s)) return "周日没有自习看班。";
  return "";
}

function slotBlockedReason(state, slot, date) {
  const cal = calendarBlockedReason(state, slot, date);
  if (cal) return cal;
  const s = slot || currentSlot(state);
  if (s?.isMath) return "现在是数学正课，请按上课处理，不能看班。";
  if (s?.isTutoring) return "现在是数学晚自习或数学答疑，请按原来的答疑与点名处理，不能改成自习看班。";
  if (!isStudyHallSubject(s)) return "现在不是自习课，不能看班。等到课表里科目为「自习」的那一节再进教室。";
  return "";
}

export function studyHallUnavailableReason(state, slot = currentSlot(state), date = state?.date) {
  const blocked = slotBlockedReason(state, slot, date);
  if (blocked) return blocked;
  if (hasStudyHallThisSlot(state, date, slot?.id || state?.periodId)) {
    return "这节自习已经看过班了，同一节只能看班一次。";
  }
  return "";
}

export function isStudyHallOpen(state, slot = currentSlot(state), date = state?.date) {
  return !studyHallUnavailableReason(state, slot, date);
}

/** 当前节确是可看的自习（含已看过后查阅纪要），考试日、活动占用节、周日、家长会不显示。 */
export function isStudyHallWindow(state, slot = currentSlot(state), date = state?.date) {
  if (!state || !date) return false;
  if (calendarBlockedReason(state, slot, date)) return false;
  const s = slot || currentSlot(state);
  if (s?.isMath || s?.isTutoring) return false;
  return isStudyHallSubject(s);
}

function pickPhrase(seed, date, periodId, key, phrases) {
  const idx = Math.floor(hash01(seed, date || "", periodId || "", key, "zixi") * phrases.length) % phrases.length;
  return phrases[idx];
}

function classLabelOf(state) {
  return `卓行${state?.player?.classNo || PLAYER_CLASS_NO}班`;
}

function presentStudents(state) {
  return playerClassStudents(state)
    .filter((s) => s && !isAwayFromClass(s, state))
    .slice()
    .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0) || String(a.id).localeCompare(String(b.id)));
}

function pickStudent(list, seed, date, periodId, key) {
  if (!list.length) return null;
  const idx = Math.floor(hash01(seed, date || "", periodId || "", key, "zixi-stu") * list.length) % list.length;
  return list[idx];
}

function homeworkFacts(state, students) {
  const ids = new Set(students.map((s) => s.id));
  const rows = (allHomeworkRows(state) || []).filter((r) => ids.has(r.id) && isOpenHomework(r));
  const topics = [...new Set(rows.map((r) => r.topic).filter(Boolean))];
  return {
    rows,
    topics,
    topic: topics[0] || suggestedTopic(state) || state?.player?.lastTaught?.topic || state?.homework?.topic || "最近的数学作业",
    piled: rows.length > 0,
  };
}

function chatFacts(state, students, date, periodId) {
  const pairs = deskChatPairs(students, `${date}|${periodId}|zixi`).slice(0, 2);
  if (pairs.length) {
    return {
      kind: "chat",
      people: pairs.flatMap((p) => [p.a, p.b]).filter(Boolean),
      pairs,
    };
  }
  const flagged = students.filter((s) => s.lastClassFlag === "走神" || (s.energy ?? 70) < 50);
  const pool = flagged.length >= 1 ? flagged : students;
  const first = pickStudent(pool, state.seed, date, periodId, "sleepy-1");
  if (!first) return { kind: "quiet", people: [], pairs: [] };
  const rest = pool.filter((s) => s.id !== first.id);
  const second = rest.length && hash01(state.seed, date, periodId, "sleepy-2", "zixi") < 0.45
    ? pickStudent(rest, state.seed, date, periodId, "sleepy-2")
    : null;
  const people = second ? [first, second] : [first];
  return { kind: "distract", people, pairs: [] };
}

export function composeStudyHallBrief(state, date = state?.date, periodId = state?.periodId) {
  if (!state || !date) return null;
  const slot = currentSlot({ ...state, date, periodId: periodId || state.periodId });
  const students = presentStudents({ ...state, date, periodId: periodId || state.periodId });
  const home = state.player?.homeroom || HOMEROOM_NAME;
  const cls = classLabelOf(state);
  const label = slot ? formatSlotLabel(slot) : `${date}自习`;
  const hw = homeworkFacts(state, students);
  const chat = chatFacts(state, students, date, periodId || state.periodId);
  const mood = pickPhrase(state.seed, date, periodId || state.periodId, "mood", [
    "大多数人在写作业，教室里没有大声喧哗。",
    "前排比较安静，后排有人偶尔抬头对一下题。",
    "整体还能坐下写，只有两三处座位在低声说话。",
  ]);
  const askPool = hw.rows.length
    ? students.filter((s) => hw.rows.some((r) => r.id === s.id))
    : students;
  const askStudent = pickStudent(askPool, state.seed, date, periodId || state.periodId, "ask");
  const restful = students.filter((s) => !chat.people.some((p) => p.id === s.id) && s.id !== askStudent?.id);
  const quiet = pickStudent(restful.length ? restful : students, state.seed, date, periodId || state.periodId, "quiet");
  const names = (list) => list.map((s) => `${s.name}（${seatLabel(s)}）`).join("、");
  const chatLine = chat.kind === "chat" && chat.pairs.length
    ? chat.pairs.map((p) => {
      const bond = p.friends ? "本来就比较要好，" : "";
      return `${p.a.name}和同桌${p.b.name}${bond}这节交头接耳`;
    }).join("；") + "。"
    : (chat.people.length ? `${names(chat.people)}这节有些走神，目光没有一直落在本子上。` : "没有明显交头接耳或走神的人。");
  const askLine = askStudent
    ? `${askStudent.name}（${seatLabel(askStudent)}）就「${hw.topic}」问了一道作业题。`
    : "这节没有人专门过来问作业。";
  const shortPoints = `${cls}${label}自习。${mood}${hw.piled ? `作业订正还堆着 ${hw.rows.length} 本。` : "眼前没有堆着的作业问询。"}${chat.people.length ? chatLine : "纪律大体平稳。"}`;
  return {
    date,
    periodId: slot?.id || periodId || state.periodId,
    slotLabel: label,
    subject: slot?.subject || "自习",
    classLabel: cls,
    home,
    mood,
    homework: hw,
    askStudent,
    askLine,
    chat,
    chatLine,
    quiet,
    shortPoints,
    presentCount: students.length,
  };
}

export function composeStudyHallMinutes(state, actionId, brief = composeStudyHallBrief(state)) {
  if (!state || !brief) return "";
  const playerBit = actionId === "answer"
    ? (brief.askStudent
      ? `你在座位旁答了${brief.askStudent.name}关于「${brief.homework.topic}」的一道问询，提醒把订正落实，没有另开一节正课，也没有把作业判成已经改完。`
      : "你准备答一道作业问询，但这节没有人专门举手来问，你把可能要盯的作业范围记进纪要。")
    : actionId === "note"
      ? `你记下了交头接耳或走神的人：${brief.chatLine}这些只写入看班纪要和相关学生档案近况，不改分数，也不算主持班会。`
      : `你在教室里巡视纪律。${brief.mood}${brief.quiet ? `${brief.quiet.name}这一带比较安定。` : ""}你只看本班自习秩序，并不主持班会。`;
  return `你以任课数学老师身份进了宁川中学${brief.classLabel}教室看自习（${brief.slotLabel}）。班主任${brief.home}没有把这节交给你主持。${brief.shortPoints}${playerBit}${STUDY_HALL_SOURCE_NOTE}`;
}

export function studyHallOptionsFor(state, date = state?.date) {
  const brief = composeStudyHallBrief(state, date);
  return STUDY_HALL_ACTIONS.map((a) => ({
    id: a.id,
    label: a.label,
    text: composeStudyHallMinutes(state, a.id, brief),
  }));
}

function assertAction(actionId) {
  return STUDY_HALL_ACTIONS.find((a) => a.id === actionId) || null;
}

function findHomeworkRow(state, studentId) {
  if (!studentId) return null;
  return (allHomeworkRows(state) || []).find((r) => r.id === studentId && isOpenHomework(r)) || null;
}

function writeStudentNote(student, rec) {
  if (!student) return;
  student.lastStudyHall = rec;
  student.studyHallNotes = [rec, ...(student.studyHallNotes || [])].slice(0, 8);
}

function studentRec(brief, actionId, student, extra) {
  return {
    date: brief.date,
    periodId: brief.periodId,
    slotKey: studyHallSlotKey(brief.date, brief.periodId),
    actionId,
    studentId: student.id,
    name: student.name,
    text: extra.text,
    statusLine: extra.statusLine,
  };
}

function applyEffects(state, action, brief) {
  const touched = [];
  if (action.id === "answer" && brief.askStudent) {
    const student = playerClassStudents(state).find((s) => s.id === brief.askStudent.id) || brief.askStudent;
    student.relation = clamp((student.relation || 0) + 1, 0, 100);
    const row = findHomeworkRow(state, student.id);
    if (row) row.studyHallAsked = true;
    const rec = studentRec(brief, action.id, student, {
      text: `${brief.date}自习课，数学老师在座位旁答了${student.name}关于「${brief.homework.topic}」的问询，提醒把订正落实。`,
      statusLine: `${brief.date}自习看班：就作业「${brief.homework.topic}」问了一句`,
    });
    writeStudentNote(student, rec);
    touched.push(student);
  }
  if (action.id === "note") {
    for (const s of brief.chat.people) {
      const student = playerClassStudents(state).find((x) => x.id === s.id) || s;
      const mate = deskMateOf(student, playerClassStudents(state));
      const chatting = brief.chat.kind === "chat" && mate && brief.chat.people.some((p) => p.id === mate.id);
      const rec = studentRec(brief, action.id, student, {
        text: chatting
          ? `${brief.date}自习课，${student.name}与同桌${mate.name}交头接耳，数学老师已记下，未改分数。`
          : `${brief.date}自习课，${student.name}有些走神，数学老师已记下，未改分数。`,
        statusLine: chatting
          ? `${brief.date}自习看班：与同桌交头接耳，已记下`
          : `${brief.date}自习看班：有些走神，已记下`,
      });
      writeStudentNote(student, rec);
      touched.push(student);
    }
  }
  if (action.id === "patrol" && brief.quiet) {
    const student = playerClassStudents(state).find((s) => s.id === brief.quiet.id) || brief.quiet;
    const rec = studentRec(brief, action.id, student, {
      text: `${brief.date}自习课，数学老师巡视纪律时看到${student.name}这一带比较安定。`,
      statusLine: `${brief.date}自习看班：数学老师巡视时看到纪律尚可`,
    });
    writeStudentNote(student, rec);
    touched.push(student);
  }
  return touched;
}

/**
 * 在当前自习节看班一次。不改能力、分数、排名或省控，
 * 不自动完成个人备课或上课，也不改写晚自习答疑与点名。
 */
export function handleStudyHall(state, actionId) {
  if (!state) return { ok: false, reason: "现在不能看自习。" };
  const blocked = studyHallUnavailableReason(state);
  if (blocked) return { ok: false, reason: blocked };
  const action = assertAction(actionId);
  if (!action) {
    return { ok: false, reason: "请从巡视纪律、答一道作业问询、记下交头接耳或走神的人这几种方式里选一种，不要另外发挥。" };
  }
  if (hasStudyHallThisSlot(state)) {
    return { ok: false, reason: "这节自习已经看过班了，同一节只能看班一次。" };
  }
  const brief = composeStudyHallBrief(state);
  const minutes = composeStudyHallMinutes(state, action.id, brief);
  const rec = {
    date: state.date,
    periodId: state.periodId,
    slotKey: studyHallSlotKey(state.date, state.periodId),
    actionId: action.id,
    actionLabel: action.label,
    slotLabel: brief.slotLabel,
    classLabel: brief.classLabel,
    shortPoints: brief.shortPoints,
    minutes,
    role: "任课数学老师",
    homeroom: brief.home,
    studentIds: [],
    askedTopic: action.id === "answer" ? brief.homework.topic : null,
  };
  const touched = applyEffects(state, action, brief);
  rec.studentIds = touched.map((s) => s.id);
  const box = ensureStudyHallState(state);
  box.slotKey = rec.slotKey;
  box.done = true;
  box.date = state.date;
  box.periodId = state.periodId;
  box.lastAction = action.id;
  box.lastMinutes = rec;
  state.studyHalls = [rec, ...(state.studyHalls || [])];
  const logText = `你以任课数学老师身份进了${brief.classLabel}教室看自习（${action.label}）。班主任${brief.home}在编，你不是班主任，也不能主持班会。${minutes}`;
  return { ok: true, text: logText, rec, actionId: action.id, minutes };
}
