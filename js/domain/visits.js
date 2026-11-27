/**
 * 课间 / 午休 / 办公室坐班时，本班学生来找实习数学老师。
 * 由日期、节次和种子确定性生成，不用 LLM 编文本。
 * 不改学科能力、分数生成、省控或校内线。
 */
import { clamp, hash01 } from "./prng.js?v=t73u2";
import { weekday } from "./calendar.js?v=t73u2";
import { HOMEROOM_NAME } from "./config.js?v=t73u2";
import {
  currentSlot, daySchedule, isClassPeriodId, isEveningPeriodId,
  majorEventOn, activityEventOn,
} from "./timetable.js?v=t73u2";
import { isAwayFromClass } from "./health.js?v=t73u2";
import { dutyStudents } from "./classManage.js?v=t73u2";
import { allHomeworkRows, isOpenHomework, suggestedTopic, topicsForGrade } from "./teaching.js?v=t73u2";
import { classPeersOf } from "./peers.js?v=t73u2";

export const VISIT_TYPES = ["question", "homework", "peer", "duty", "leave"];

function schoolYearFromDate(date) {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  return m >= 8 ? y : y - 1;
}

function gradeOf(entryYear, date) {
  return schoolYearFromDate(date) - entryYear + 1;
}

export function playerClassStudents(state) {
  const year = state?.player?.cohortYear;
  const no = state?.player?.classNo;
  const c = state?.cohorts?.[year];
  if (!c?.students) return [];
  return c.students.filter((s) => s.classNo === no);
}

export function visitKey(date, periodId) {
  return `${date || ""}|${periodId || ""}`;
}

function isSundaySlot(slot, date) {
  if (weekday(date) === 0) return true;
  if (!slot) return false;
  return slot.id === "rest" || slot.kind === "rest";
}

function isActivityDay(date) {
  return !!activityEventOn(date);
}

function isBlockedMajorDay(date, slot) {
  if (slot?.isExamDay) return true;
  return !!majorEventOn(date);
}

/**
 * 可来访时段：课间、午休或办公室坐班。
 * 排除数学正课、晚自习、考试日、学校活动日、周日休息。
 */
export function isVisitWindow(slot, date) {
  if (!slot || !date) return false;
  if (isSundaySlot(slot, date)) return false;
  if (isBlockedMajorDay(date, slot)) return false;
  if (isActivityDay(date)) return false;
  if (slot.isMath) return false;
  if (isEveningPeriodId(slot.id) || slot.isTutoring) return false;
  if (slot.id === "noon" || slot.kind === "break") return true;
  if (slot.id === "morning-read") return true;
  if (isClassPeriodId(slot.id)) return true;
  return false;
}

export function visitPlaceLabel(slot) {
  if (!slot) return "这个时段";
  if (slot.id === "noon" || slot.kind === "break") return "午休";
  if (slot.id === "morning-read") return "早读坐班";
  return "课间";
}

export function eligibleVisitSlots(date, state) {
  if (!date) return [];
  return daySchedule(date, state).filter((p) => isVisitWindow(p, date));
}

function dailyVisitCount(seed, date) {
  const h = hash01(seed, date, "visit-count");
  if (h < 0.30) return 0;
  if (h < 0.75) return 1;
  return 2;
}

/** 当天计划来访的节次（0–2 节，不覆盖每一节）。 */
export function planDayVisitPeriods(state, date = state?.date) {
  if (!state || !date) return [];
  const slots = eligibleVisitSlots(date, state);
  if (!slots.length) return [];
  const n = Math.min(2, dailyVisitCount(state.seed, date), slots.length);
  if (n === 0) return [];
  const scored = slots.map((p) => ({
    id: p.id,
    h: hash01(state.seed, date, p.id, "visit-slot"),
  }));
  scored.sort((a, b) => a.h - b.h || String(a.id).localeCompare(String(b.id)));
  const order = daySchedule(date, state).map((p) => p.id);
  return scored.slice(0, n).map((x) => x.id).sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

function currentTopic(state, student = null) {
  const fromHw = state?.homework?.topic;
  const fromPlan = state?.player?.lessonPlan?.topic;
  const fromTaught = state?.player?.lastTaught?.topic;
  const fromStu = student?.lastClassTopic;
  if (fromHw) return fromHw;
  if (fromTaught) return fromTaught;
  if (fromPlan) return fromPlan;
  if (fromStu) return fromStu;
  const year = state?.player?.cohortYear;
  const grade = year && state?.date ? gradeOf(year, state.date) : 1;
  return suggestedTopic(state, grade) || topicsForGrade(grade)[0] || "最近在学的内容";
}

function openHomeworkOf(state, studentId) {
  return allHomeworkRows(state).find((r) => r.id === studentId && isOpenHomework(r)) || null;
}

function isHomeworkPending(row) {
  if (!row) return false;
  return row.status === "缺交" || row.correction === "待补交"
    || row.correction === "待订正" || row.quality === "未订正"
    || row.correction === "已订正待复查" || row.quality === "错题较多";
}

function eligibleTypes(state, student, classmates, dutyIds) {
  const types = ["question"];
  if (isHomeworkPending(openHomeworkOf(state, student.id))) types.push("homework");
  const peers = classPeersOf(student, classmates);
  if (peers.tense || peers.deskMate || (peers.friends || []).length) types.push("peer");
  if (dutyIds.has(student.id)) types.push("duty");
  if (student.justReturned?.date) types.push("leave");
  return types;
}

function pickType(state, student, date, periodId, classmates, dutyIds) {
  const types = eligibleTypes(state, student, classmates, dutyIds);
  if (types.length === 1) return types[0];
  const special = types.filter((t) => t !== "question");
  const prefer = hash01(state.seed, date, periodId, student.id, "visit-type-prefer");
  const pool = special.length && prefer < 0.72 ? special : types;
  const pick = hash01(state.seed, date, periodId, student.id, "visit-type");
  return pool[Math.floor(pick * pool.length) % pool.length];
}

function peerNameOf(student, classmates, typeHint) {
  const peers = classPeersOf(student, classmates);
  if (peers.tense) return { name: peers.tense.name, kind: "tense" };
  if (typeHint === "desk" && peers.deskMate) return { name: peers.deskMate.name, kind: "desk" };
  if (peers.deskMate && hash01(student.id, peers.deskMate.id, "visit-peer") < 0.55) {
    return { name: peers.deskMate.name, kind: "desk" };
  }
  if (peers.friends[0]) return { name: peers.friends[0].name, kind: "friend" };
  if (peers.deskMate) return { name: peers.deskMate.name, kind: "desk" };
  return null;
}

function buildVisit(state, student, date, periodId, classmates, dutyIds) {
  const type = pickType(state, student, date, periodId, classmates, dutyIds);
  const topic = currentTopic(state, student);
  const peer = type === "peer" ? peerNameOf(student, classmates) : null;
  const hw = type === "homework" ? openHomeworkOf(state, student.id) : null;
  let reason = `来问一道「${topic}」里的题`;
  let prompt = `${student.name}在${visitPlaceLabel(daySchedule(date, state).find((p) => p.id === periodId) || currentSlot(state))}找到你，想请教「${topic}」里的一道题。`;
  let options = [
    { id: "answer", label: "解答" },
    { id: "note", label: "记下" },
    { id: "later", label: "下节课统一讲" },
  ];
  if (type === "homework") {
    const missing = hw && (hw.status === "缺交" || hw.correction === "待补交");
    const corr = hw && (hw.correction === "待订正" || hw.quality === "未订正" || hw.correction === "已订正待复查");
    reason = missing
      ? `「${hw.topic || topic}」作业没交，来解释`
      : (corr ? `「${hw.topic || topic}」订正还没完成，来说明` : `来说明「${hw?.topic || topic}」作业的事`);
    prompt = `${student.name}来找你，${reason}。`;
    options = [
      { id: "accept", label: missing ? "记下并让补交" : "记下并嘱咐订正" },
      { id: "note", label: "记下" },
      { id: "sendHomeroom", label: "让他自己先去找班主任" },
    ];
  } else if (type === "peer") {
    const other = peer?.name || "同学";
    const kind = peer?.kind;
    reason = kind === "tense"
      ? `和${other}有些别扭，想跟老师说一声`
      : (kind === "desk" ? `同桌${other}闹别扭，想跟老师说一声` : `和${other}闹别扭，想跟老师说一声`);
    prompt = `${student.name}来找你，${reason}。`;
    options = [
      { id: "mediate", label: "劝一劝" },
      { id: "note", label: "记下" },
      { id: "sendHomeroom", label: "让他自己先去找班主任" },
    ];
  } else if (type === "duty") {
    reason = "今天轮到值日，来问值日的事";
    prompt = `${student.name}今天轮到值日，课间来跟你说一声值日上的事。`;
    options = [
      { id: "advise", label: "嘱咐按值日表做好" },
      { id: "note", label: "记下" },
      { id: "sendHomeroom", label: "让他自己先去找班主任" },
    ];
  } else if (type === "leave") {
    const back = student.justReturned;
    reason = back?.kind
      ? `刚结束${back.kind}返校，来跟老师说一声`
      : "刚结束请假返校，来跟老师说一声";
    prompt = `${student.name}${reason}。`;
    options = [
      { id: "care", label: "关心一下" },
      { id: "note", label: "记下" },
      { id: "sendHomeroom", label: "让他自己先去找班主任" },
    ];
  }
  return {
    studentId: student.id,
    name: student.name,
    seq: student.seq,
    date,
    periodId,
    type,
    topic,
    peerName: peer?.name || null,
    reason,
    prompt,
    options,
    handled: false,
    actionId: null,
    resolution: null,
  };
}

function pickVisitor(state, date, periodId, used, classmates) {
  const pool = classmates.filter((s) => !used.has(s.id) && !isAwayFromClass(s, { ...state, date }));
  if (!pool.length) return null;
  let best = null;
  let bestH = 2;
  for (const s of pool) {
    const h = hash01(state.seed, date, periodId, s.id, "visitor");
    if (!best || h < bestH || (h === bestH && String(s.id).localeCompare(String(best.id)) < 0)) {
      best = s;
      bestH = h;
    }
  }
  return best;
}

/**
 * 纯函数：按日期+节次+种子生成当天来访计划。
 * 一天 0–2 起，同一学生同一天不会出现两次；请假不在校的学生不会入列。
 */
export function planDayVisits(state, date = state?.date) {
  if (!state || !date) return [];
  const periods = planDayVisitPeriods(state, date);
  if (!periods.length) return [];
  const classmates = playerClassStudents(state);
  const dutyIds = new Set(dutyStudents(classmates, date).map((s) => s.id));
  const used = new Set();
  const out = [];
  for (const periodId of periods) {
    const student = pickVisitor(state, date, periodId, used, classmates);
    if (!student) continue;
    used.add(student.id);
    out.push(buildVisit(state, student, date, periodId, classmates, dutyIds));
  }
  return out;
}

export function visitsForSlot(state, date = state?.date, periodId = state?.periodId) {
  if (!state || !date || !periodId) return [];
  const slot = daySchedule(date, state).find((p) => p.id === periodId) || null;
  if (!isVisitWindow(slot, date)) return [];
  return planDayVisits(state, date).filter((v) => v.periodId === periodId);
}

export function ensureVisits(state) {
  if (!state?.date || !state.periodId) return null;
  const key = visitKey(state.date, state.periodId);
  if (state.visits?.key === key && Array.isArray(state.visits.items)) return state.visits;
  const items = visitsForSlot(state);
  state.visits = { key, date: state.date, periodId: state.periodId, items };
  return state.visits;
}

export function currentVisitItems(state) {
  return ensureVisits(state)?.items || [];
}

export function visitArriveLine(state) {
  const items = (state.visits?.items || []).filter((v) => !v.handled);
  if (!items.length) return "";
  const where = visitPlaceLabel(currentSlot(state));
  const bits = items.map((v) => `${v.name}${v.reason}`);
  return `${where}来访：${bits.join("；")}。`;
}

function applyHomeworkAction(state, student, actionId) {
  if (actionId !== "accept") return;
  const row = openHomeworkOf(state, student.id);
  if (!row) return;
  if (row.status === "缺交" || row.correction === "待补交") {
    row.status = "迟交";
    row.correction = "已补交待面批";
    if (row.quality === "未交") row.quality = "一般";
  } else if (row.correction === "待订正" || row.quality === "未订正") {
    row.correction = "已订正待复查";
  }
}

function resolutionText(item, student, actionId, homeroom) {
  const n = student.name;
  const topic = item.topic;
  const peer = item.peerName;
  const home = homeroom || HOMEROOM_NAME;
  if (item.type === "question") {
    if (actionId === "answer") return `你给${n}讲清了这道「${topic}」的题，嘱咐回去再做一道同类题。`;
    if (actionId === "later") return `你记下${n}问的「${topic}」的题，告诉他下节课一起讲。`;
    return `你记下了${n}来问「${topic}」的事，稍后在作业里再看一眼。`;
  }
  if (item.type === "homework") {
    if (actionId === "accept") {
      return item.reason.includes("没交")
        ? `你听了${n}的解释，让他把「${topic}」作业补交上来，先记在本子上。`
        : `你听了${n}的说明，嘱咐把「${topic}」的订正做完再交回来。`;
    }
    if (actionId === "sendHomeroom") return `你让${n}先去找班主任${home}说明作业的事，自己这边也记了一笔。`;
    return `你记下了${n}来说明「${topic}」作业的事，先不急着下结论。`;
  }
  if (item.type === "peer") {
    const other = peer || "同学";
    if (actionId === "mediate") return `你劝了劝${n}，让他和${other}先冷静一下，有事好好说，不要在教室里拌下去。`;
    if (actionId === "sendHomeroom") return `你让${n}先去找班主任${home}说一声和${other}的事，自己也记在班情里。`;
    return `你记下了${n}和${other}闹别扭的事，先观察一阵。`;
  }
  if (item.type === "duty") {
    if (actionId === "advise") return `你嘱咐${n}按今天的值日表把事情做完，有拿不准的再问劳动委员或班主任。`;
    if (actionId === "sendHomeroom") return `你让${n}先去找班主任${home}问值日的事，自己也记了一笔。`;
    return `你记下了${n}来问值日的事。`;
  }
  if (item.type === "leave") {
    if (actionId === "care") return `你关心了刚返校的${n}，让他先把身体养好，课跟得上再加量。`;
    if (actionId === "sendHomeroom") return `你让${n}把返校的事再跟班主任${home}说一声，假条本就由她登记。`;
    return `你记下了${n}刚返校来说明的事。`;
  }
  return `你处理了${n}的来访。`;
}

function statusLineFor(item, actionId) {
  const when = `${item.date}${visitPlaceLabel({ id: item.periodId, kind: item.periodId === "noon" ? "break" : "class" })}来访`;
  if (item.type === "question") return `${when}：来问「${item.topic}」的题，已${actionId === "answer" ? "解答" : "记下"}`;
  if (item.type === "homework") return `${when}：来说明作业，已处理`;
  if (item.type === "peer") return `${when}：来谈和${item.peerName || "同学"}的别扭，已处理`;
  if (item.type === "duty") return `${when}：来问值日的事，已处理`;
  if (item.type === "leave") return `${when}：刚返校来说明，已处理`;
  return `${when}：已处理`;
}

function applyMoodRelation(student, item, actionId) {
  let rel = 0;
  let mood = 0;
  let stress = 0;
  if (actionId === "answer" || actionId === "mediate" || actionId === "care" || actionId === "accept" || actionId === "advise") {
    rel = 2;
    mood = actionId === "mediate" || actionId === "care" ? 3 : 1;
    stress = actionId === "care" || actionId === "mediate" ? -2 : 0;
  } else if (actionId === "note" || actionId === "later") {
    rel = 1;
  } else if (actionId === "sendHomeroom") {
    rel = 0;
  }
  student.relation = clamp((student.relation || 0) + rel, 0, 100);
  student.mood = clamp((student.mood || 60) + mood, 0, 100);
  student.stress = clamp((student.stress || 40) + stress, 0, 100);
}

/** 处理一趟来访：写入该生近况，作业状态可小幅变动，不改能力。 */
export function handleVisit(state, studentId, actionId) {
  if (!state) return { ok: false, reason: "没有可处理的来访。" };
  ensureVisits(state);
  const item = (state.visits?.items || []).find((v) => v.studentId === studentId);
  if (!item) return { ok: false, reason: "这节没有这名学生来访。" };
  if (item.handled) return { ok: false, reason: "这趟来访已经处理过了。" };
  const action = (item.options || []).find((o) => o.id === actionId);
  if (!action) return { ok: false, reason: "这个处理对不上这趟来访。" };
  const classmates = playerClassStudents(state);
  const student = classmates.find((s) => s.id === studentId)
    || Object.values(state.cohorts || {}).flatMap((c) => c.students || []).find((s) => s.id === studentId);
  if (!student) return { ok: false, reason: "找不到这名学生" };
  if (item.type === "homework") applyHomeworkAction(state, student, actionId);
  applyMoodRelation(student, item, actionId);
  const home = state.player?.homeroom || HOMEROOM_NAME;
  const text = resolutionText(item, student, actionId, home);
  const statusLine = statusLineFor(item, actionId);
  item.handled = true;
  item.actionId = actionId;
  item.resolution = text;
  student.lastVisit = {
    date: state.date,
    periodId: state.periodId,
    type: item.type,
    actionId,
    text,
    statusLine,
  };
  student.visits = [...(student.visits || []), {
    date: state.date,
    periodId: state.periodId,
    type: item.type,
    actionId,
    text,
    reason: item.reason,
  }].slice(-8);
  return { ok: true, text, student, visit: item, statusLine };
}
