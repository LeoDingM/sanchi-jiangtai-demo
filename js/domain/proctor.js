/**
 * 监考与阅卷：实习或正式数学老师按宁川中学校内考务安排值班、并在本校可改的数学卷上做摘记。
 * 考场安排、偶发情况和阅卷摘记用确定性 PRNG 从已有事实长出，不用 LLM，不改能力、分数、排名或省控。
 * 这不是某所实校或教育行政部门公告的考场编排、官方考务文件或真实考点。
 */
import { pick, rngFrom, shuffle } from "./prng.js?v=t60u1";
import { SCHOOL_CALENDAR, eventsOn, weekday } from "./calendar.js?v=t60u1";
import {
  activityEventOn, currentSlot, isEveningPeriodId, majorEventOn,
} from "./timetable.js?v=t60u1";
import { isOfficeSittingSlot } from "./homeVisit.js?v=t60u1";
import { isParentsMeetingOpen } from "./parents.js?v=t60u1";
import { playerClassStudents } from "./visits.js?v=t60u1";
import { seatLabel } from "./school.js?v=t60u1";

export const PROCTOR_SOURCE_NOTE = "这是宁川中学校内考务安排，不是某所实校或教育行政部门公告的考场编排，也不是官方考务文件或真实考点公告。";

export const GRADEABLE_EXAM_KINDS = ["monthly", "midterm", "final", "mock1", "mock2", "mock3"];
export const NON_SCHOOL_MARK_KINDS = ["city", "province", "huikao", "gaokao"];
export const PROCTOR_EXAM_KINDS = [
  "monthly", "midterm", "final", "city", "province", "mock1", "mock2", "mock3", "huikao", "gaokao",
];

export const PROCTOR_SESSION_CAP = 3;
export const MARK_DAY_CAP = 1;
export const MARK_PAPERS_MIN = 3;
export const MARK_PAPERS_MAX = 6;

export const PROCTOR_ACTIONS = [
  { id: "patrol", label: "巡考看纪律" },
  { id: "early", label: "处理提前交卷" },
  { id: "restroom", label: "准假上厕所" },
  { id: "fidget", label: "提醒轻微小动作" },
  { id: "collect", label: "收卷" },
];

const ROOM_NAMES = [
  "卓行15班考场",
  "卓行14班考场",
  "教学楼东侧第三考场",
  "教学楼西侧第二考场",
  "一楼阶梯教室临时考场",
  "凌霄7班考场",
];

const GRADEABLE_SET = new Set(GRADEABLE_EXAM_KINDS);
const NON_SCHOOL_SET = new Set(NON_SCHOOL_MARK_KINDS);

export function isSchoolGradeableKind(kind) {
  return GRADEABLE_SET.has(kind);
}

export function isNonSchoolMarkKind(kind) {
  return NON_SCHOOL_SET.has(kind);
}

export function examEventOn(date, calendar = SCHOOL_CALENDAR) {
  if (!date) return null;
  return (eventsOn(date, calendar) || []).find((e) => e.kind === "exam") || null;
}

export function isCalendarExamDay(date) {
  return !!examEventOn(date);
}

export function examSessionOf(periodId) {
  if (!periodId) return null;
  if (periodId === "morning-read" || periodId === "p1" || periodId === "p2" || periodId === "p3" || periodId === "p4") {
    return "morning";
  }
  if (periodId === "p5" || periodId === "p6" || periodId === "p7" || periodId === "p8") {
    return "afternoon";
  }
  return null;
}

export function sessionLabel(session) {
  if (session === "morning") return "上午";
  if (session === "afternoon") return "下午";
  return "";
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
  if (slot?.isActivityPeriod) return true;
  return !!activityEventOn(date);
}

export function ensureProctorState(state) {
  if (!state) return null;
  let cur = state.proctor;
  if (!cur || typeof cur !== "object") {
    cur = { sessions: {}, records: [], markings: [], markDate: null, markedExamIds: [] };
    state.proctor = cur;
    return cur;
  }
  if (!cur.sessions || typeof cur.sessions !== "object") cur.sessions = {};
  if (!Array.isArray(cur.records)) cur.records = [];
  if (!Array.isArray(cur.markings)) cur.markings = [];
  if (!Array.isArray(cur.markedExamIds)) cur.markedExamIds = [];
  return cur;
}

function sessionKey(date, examId, session) {
  return `${date || ""}|${examId || ""}|${session || ""}`;
}

function sessionBox(state, date, examId, session) {
  const rec = ensureProctorState(state);
  const key = sessionKey(date, examId, session);
  if (!rec.sessions[key]) rec.sessions[key] = { actions: [], collected: false };
  const box = rec.sessions[key];
  if (!Array.isArray(box.actions)) box.actions = [];
  return box;
}

export function proctorAssignment(state, date = state?.date, ev = examEventOn(date)) {
  if (!state || !date || !ev) return null;
  const rng = rngFrom(state.seed, ev.id, date, "proctor-room");
  const room = pick(rng, ROOM_NAMES);
  return {
    date,
    examId: ev.id,
    examName: ev.name,
    examKind: ev.examKind,
    room,
    note: PROCTOR_SOURCE_NOTE,
  };
}

function classStudents(state) {
  return playerClassStudents(state) || [];
}

function pickClassStudent(state, ev, date, session, salt) {
  const cls = classStudents(state);
  if (!cls.length) return null;
  const rng = rngFrom(state.seed, ev?.id, date, session, salt);
  if (rng() >= 0.42) return null;
  return pick(rng, cls);
}

function incidentKindsForSession(state, ev, date, session) {
  const rng = rngFrom(state.seed, ev?.id, date, session, "proctor-incidents");
  const pool = shuffle(rng, ["early", "restroom", "fidget"]);
  const n = 1 + (rng() < 0.55 ? 1 : 0);
  return pool.slice(0, n);
}

export function proctorChoices(state, slot = currentSlot(state), date = state?.date) {
  const ev = examEventOn(date);
  const session = examSessionOf(slot?.id);
  if (!ev || !session) return [];
  const box = sessionBox(state, date, ev.id, session);
  const done = new Set(box.actions || []);
  if (box.collected || done.size >= PROCTOR_SESSION_CAP) return [];
  const incidents = incidentKindsForSession(state, ev, date, session);
  const ids = ["patrol", ...incidents, "collect"];
  const out = [];
  for (const id of ids) {
    if (done.has(id)) continue;
    if (id === "collect" && box.collected) continue;
    const meta = PROCTOR_ACTIONS.find((a) => a.id === id);
    if (meta) out.push({ ...meta });
  }
  return out;
}

export function proctorUnavailableReason(state, slot = currentSlot(state), date = state?.date) {
  if (!state || !date) return "现在不能监考。";
  const s = slot || currentSlot(state);
  if (parentsDayOn(date, state)) return "今天是家长会，监考请放到校历上的考试日。";
  if (activityDayOn(date, s)) return "今天是学校活动日，没有监考安排。";
  if (isSunday(date, s)) return "今天休息，没有监考安排。";
  const ev = examEventOn(date);
  if (!ev) return "今天不是校历上的考试日，没有监考安排。";
  const session = examSessionOf(s?.id);
  if (!session) {
    if (s?.id === "noon" || s?.kind === "break") return "现在是午休，下午再进考场。";
    if (isEveningPeriodId(s?.id) || s?.isTutoring) return "白天考场已经结束，晚自习仍停课，没有晚场监考。";
    return "现在不是白天考场时段。";
  }
  const box = sessionBox(state, date, ev.id, session);
  if (box.collected) return `${sessionLabel(session)}这场已经收卷，本场值班到此为止。`;
  if ((box.actions || []).length >= PROCTOR_SESSION_CAP) return `${sessionLabel(session)}这场已经处理过几次了，同一场不要反复折腾。`;
  return "";
}

export function isProctorOpen(state, slot = currentSlot(state), date = state?.date) {
  return !proctorUnavailableReason(state, slot, date);
}

function composeProctorText(state, ev, assignment, session, actionId, student) {
  const when = `今日${sessionLabel(session)}`;
  const room = assignment.room;
  const name = student ? `本班${student.name}` : "一名考生";
  const seat = student ? `（${seatLabel(student)}）` : "";
  const tail = `按宁川中学校内考务安排值班，不当场拆封试卷，不改分数。${PROCTOR_SOURCE_NOTE}`;
  if (actionId === "patrol") {
    return `${when}按校内考务安排，在${room}巡考看纪律。考场秩序尚可，未把小动作写成违纪升级。${tail}`;
  }
  if (actionId === "early") {
    return `${when}在${room}值班。${name}${seat}提前交卷，已按规定验卷收好，并让其安静坐在原位。${tail}`;
  }
  if (actionId === "restroom") {
    return `${when}在${room}值班。${name}${seat}请假上厕所，已登记时间放行，回来后核对准考证。这是校内考场常规处理。${tail}`;
  }
  if (actionId === "fidget") {
    return `${when}巡考至${room}，见${name}${seat}有转笔、侧目一类轻微小动作，已走近轻声提醒，考场随即恢复安静。不作违纪升级处理。${tail}`;
  }
  if (actionId === "collect") {
    return `${when}${ev.name}结束，已在${room}按校内考务安排清点试卷、密封装袋，交到年级指定处。试卷不在考场拆封，分数仍按既有出分流程结算。${tail}`;
  }
  return `${when}在${room}按校内考务安排处理了考场情况。${tail}`;
}

function statusLineForProctor(date, actionId, examName) {
  if (actionId === "early") return `${date}监考：该生在「${examName}」考场提前交卷，已按规定收好`;
  if (actionId === "restroom") return `${date}监考：该生在「${examName}」考场请假上厕所，已登记放行`;
  if (actionId === "fidget") return `${date}监考：该生在「${examName}」考场有轻微小动作，已提醒`;
  if (actionId === "collect") return `${date}监考：该生参加「${examName}」，试卷已按校内安排收齐`;
  return `${date}监考：该生在「${examName}」考场，值班时已记下`;
}

function recordStudentProctor(student, date, actionId, examName, text) {
  if (!student) return null;
  const rec = {
    date,
    actionId,
    examName,
    text,
    statusLine: statusLineForProctor(date, actionId, examName),
  };
  student.lastProctor = rec;
  student.proctorNotes = [rec, ...(student.proctorNotes || [])].slice(0, 6);
  return rec;
}

/** 考试日白天考场值班。写入日志材料，不改能力、分数或省控。 */
export function doProctorAction(state, actionId, slot = currentSlot(state), date = state?.date) {
  if (!state) return { ok: false, reason: "现在不能监考。" };
  const blocked = proctorUnavailableReason(state, slot, date);
  if (blocked) return { ok: false, reason: blocked };
  const ev = examEventOn(date);
  const session = examSessionOf((slot || currentSlot(state))?.id);
  const assignment = proctorAssignment(state, date, ev);
  const choices = proctorChoices(state, slot, date);
  const action = choices.find((a) => a.id === actionId) || PROCTOR_ACTIONS.find((a) => a.id === actionId);
  if (!action || !choices.some((a) => a.id === actionId)) {
    return { ok: false, reason: "请从本场可做的几项里选一项，不要另外发挥。" };
  }
  const student = (actionId === "early" || actionId === "restroom" || actionId === "fidget")
    ? pickClassStudent(state, ev, date, session, actionId)
    : null;
  const text = composeProctorText(state, ev, assignment, session, actionId, student);
  const box = sessionBox(state, date, ev.id, session);
  box.actions = [...(box.actions || []), actionId];
  if (actionId === "collect") box.collected = true;
  if (student) recordStudentProctor(student, date, actionId, ev.name, text);
  const rec = {
    date,
    examId: ev.id,
    examName: ev.name,
    session,
    actionId,
    room: assignment.room,
    studentId: student?.id || null,
    text,
  };
  const st = ensureProctorState(state);
  st.records = [rec, ...(st.records || [])].slice(0, 40);
  return { ok: true, text, rec, student, assignment, session };
}

function reportKeyOf(entryYear, examId) {
  return `${entryYear}|${examId}`;
}

export function playerCohortReports(state) {
  const year = state?.player?.cohortYear;
  const out = [];
  for (const [k, ex] of Object.entries(state?.exams || {})) {
    const [y, id] = String(k).split("|");
    if (Number(y) !== Number(year)) continue;
    if (!ex) continue;
    out.push({ ...ex, examId: ex.examId || id, _key: k });
  }
  out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return out;
}

export function examIsSettled(state, examId, entryYear = state?.player?.cohortYear) {
  if (!state || !examId) return false;
  const key = reportKeyOf(entryYear, examId);
  if (state.exams?.[key]) return true;
  return Object.values(state.exams || {}).some((ex) => ex && ex.examId === examId && Number(ex.entryYear) === Number(entryYear));
}

export function examAlreadyMarked(state, examId) {
  const rec = ensureProctorState(state);
  if ((rec.markedExamIds || []).includes(examId)) return true;
  return (rec.markings || []).some((m) => m.examId === examId);
}

/** 本班已结算、尚未阅过、且由本校老师阅的最近一场。 */
export function pendingGradeableExam(state) {
  if (!state) return null;
  const reports = playerCohortReports(state).filter((ex) => isSchoolGradeableKind(ex.examKind) && !ex.pruned);
  for (const ex of reports) {
    const id = ex.examId;
    if (!id) continue;
    if (!examAlreadyMarked(state, id)) return ex;
  }
  return null;
}

export function latestPlayerExam(state) {
  return playerCohortReports(state)[0] || null;
}

function isAfternoonOfficeSlot(slot) {
  if (!slot) return false;
  return slot.id === "p5" || slot.id === "p6" || slot.id === "p7" || slot.id === "p8";
}

export function markingUnavailableReason(state, slot = currentSlot(state), date = state?.date) {
  if (!state || !date) return "现在不能阅卷。";
  const s = slot || currentSlot(state);
  if (parentsDayOn(date, state)) return "今天是家长会，阅卷请放到平时办公室坐班时再做。";
  if (activityDayOn(date, s)) return "今天是学校活动日，阅卷请放到平时办公室坐班时再做。";
  if (isSunday(date, s)) return "今天休息，阅卷请放到办公室坐班时再做。";
  if (s?.isMath) return "现在是数学正课，阅卷请放到办公室坐班时再做。";
  if (s && (isEveningPeriodId(s.id) || s.isTutoring)) return "晚自习不宜拆开本班试卷。";
  if (!isOfficeSittingSlot(s, date)) return "阅本班数学卷要在办公室坐班时做，早读或非数学正课的白天坐班都可以。";
  const pending = pendingGradeableExam(state);
  const latest = latestPlayerExam(state);
  if (!pending) {
    if (latest && isNonSchoolMarkKind(latest.examKind)) {
      return `这场「${latest.examName}」的卷子不在本校改。市联考、省联考、会考和高考都不由本校老师拆封阅卷，成绩仍按既有出分流程结算。`;
    }
    if (latest && isSchoolGradeableKind(latest.examKind) && examAlreadyMarked(state, latest.examId)) {
      return `「${latest.examName}」这轮本班数学卷已经看过了，每场考试最多阅一轮。`;
    }
    return "还没有已结算、可由本校老师改的本班数学卷。";
  }
  const rec = ensureProctorState(state);
  if (rec.markDate === date) return "今天已经阅过一轮本班数学卷，其余的明天再看。";
  const examDay = examEventOn(date);
  if (examDay && pending.examId === examDay.id && !isAfternoonOfficeSlot(s)) {
    return "这场考试要等成绩结算之后，当天下午办公室或翌日坐班再阅本班数学卷。";
  }
  if (examDay && pending.examId !== examDay.id && !isAfternoonOfficeSlot(s)) {
    return "今天是考试日，上午先按校内考务安排监考，阅卷请放到当天下午办公室或以后坐班再做。";
  }
  if (examDay && pending.date === date && !examIsSettled(state, pending.examId) && !isAfternoonOfficeSlot(s)) {
    return "这场考试要等成绩结算之后，再阅本班数学卷。";
  }
  if (pending.date === date && !examIsSettled(state, pending.examId)) {
    return "这场考试要等成绩结算之后，再阅本班数学卷。";
  }
  return "";
}

export function isMarkingOpen(state, slot = currentSlot(state), date = state?.date) {
  return !markingUnavailableReason(state, slot, date);
}

function classRowsFor(report, classNo) {
  const rows = (report?.rows || []).filter((r) => Number(r.classNo) === Number(classNo) && !r.repeat);
  return rows.length ? rows : (report?.rows || []).filter((r) => Number(r.classNo) === Number(classNo));
}

function mathOf(row) {
  const n = Number(row?.math);
  return Number.isFinite(n) ? n : 0;
}

function composePaperNote(row, avg, rng) {
  const math = mathOf(row);
  const max = Number(row.scale === "g1" ? 150 : (row.maxMath || 150)) || 150;
  const ratio = max ? math / max : 0;
  if (math >= avg + 10 || ratio >= 0.85) {
    return pick(rng, [
      "题做得很稳，卷面也干净，和已经出的成绩方向一致。",
      "前面选择填空很稳，后面大题也收得住。",
      "思路清楚，这张数学卷看得比较放心。",
    ]);
  }
  if (math >= avg - 6 || ratio >= 0.68) {
    return pick(rng, [
      "选择填空大体稳住了，有一题订正过仍失分。",
      "中档题做得还行，后面有一问没收干净。",
      "基本题能跟上，个别变式还差一口气。",
    ]);
  }
  return pick(rng, [
    "基础题也有失分，卷面偏慌，和已经出的成绩方向一致。",
    "前面就有不该丢的分，后面大题几乎没打开。",
    "这张卷子看得有些散，订正过的题这次仍没拿住。",
  ]);
}

export function markingPapers(state, report = pendingGradeableExam(state)) {
  if (!state || !report) return [];
  const classNo = state.player?.classNo;
  const rows = classRowsFor(report, classNo);
  if (!rows.length) return [];
  const avg = rows.reduce((s, r) => s + mathOf(r), 0) / rows.length;
  const rng = rngFrom(state.seed, report.examId, report.date, "mark-papers");
  const sorted = rows.slice().sort((a, b) => mathOf(b) - mathOf(a));
  const high = sorted[0];
  const low = sorted[sorted.length - 1];
  const mid = sorted[Math.floor(sorted.length / 2)];
  const rest = shuffle(rng, sorted.filter((r) => r !== high && r !== low && r !== mid));
  const want = Math.min(rows.length, MARK_PAPERS_MIN + (rng() < 0.5 ? 1 : 0) + (rng() < 0.35 ? 1 : 0));
  const cap = Math.min(MARK_PAPERS_MAX, rows.length, Math.max(MARK_PAPERS_MIN, want));
  const picked = [];
  for (const r of [high, mid, low, ...rest]) {
    if (!r) continue;
    if (picked.some((x) => x.studentId === r.studentId)) continue;
    picked.push(r);
    if (picked.length >= cap) break;
  }
  const noteRng = rngFrom(state.seed, report.examId, report.date, "mark-notes");
  return picked.map((row) => {
    const student = classStudents(state).find((s) => s.id === row.studentId) || null;
    return {
      studentId: row.studentId,
      name: row.name || student?.name || "",
      seat: student ? seatLabel(student) : "",
      math: mathOf(row),
      total: row.total,
      note: composePaperNote(row, avg, noteRng),
    };
  });
}

function statusLineForMarking(date, examName, note) {
  const short = String(note || "").replace(/。$/, "");
  return `${date}阅卷：「${examName}」数学卷摘记，${short}`;
}

/** 办公室坐班阅本班少量数学卷。只写摘记，绝不改分数、排名或省控。 */
export function markClassPapers(state, slot = currentSlot(state), date = state?.date) {
  if (!state) return { ok: false, reason: "现在不能阅卷。" };
  const blocked = markingUnavailableReason(state, slot, date);
  if (blocked) return { ok: false, reason: blocked };
  const report = pendingGradeableExam(state);
  if (!report) return { ok: false, reason: "还没有可阅的本班数学卷。" };
  const papers = markingPapers(state, report);
  if (papers.length < Math.min(MARK_PAPERS_MIN, classRowsFor(report, state.player?.classNo).length || papers.length)) {
    return { ok: false, reason: "本班这场试卷还不够做一轮摘记。" };
  }
  if (!papers.length) return { ok: false, reason: "本班这场没有可看的数学卷。" };
  const names = papers.map((p) => p.name).join("、");
  const bits = papers.map((p) => `${p.name}${p.seat ? "（" + p.seat + "）" : ""}：${p.note}`).join("");
  const text = `你利用办公室坐班，按宁川中学校内安排阅了本班「${report.examName}」的 ${papers.length} 份数学卷：${names}。${bits}摘记只对照已经出的成绩方向，不改分数、不改排名、也不动省控或校内线。这不是官方阅卷组，只是任课老师看本班卷。`;
  const rec = {
    date,
    examId: report.examId,
    examName: report.examName,
    examKind: report.examKind,
    papers,
    text,
  };
  const st = ensureProctorState(state);
  st.markings = [rec, ...(st.markings || [])].slice(0, 20);
  st.markedExamIds = [...new Set([report.examId, ...(st.markedExamIds || [])])];
  st.markDate = date;
  const byId = new Map(classStudents(state).map((s) => [s.id, s]));
  for (const p of papers) {
    const student = byId.get(p.studentId);
    if (!student) continue;
    const note = {
      date,
      examId: report.examId,
      examName: report.examName,
      note: p.note,
      statusLine: statusLineForMarking(date, report.examName, p.note),
    };
    student.lastMarking = note;
    student.markingNotes = [note, ...(student.markingNotes || [])].slice(0, 6);
  }
  return { ok: true, text, rec, papers, report };
}

