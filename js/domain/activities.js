/** 学校活动：秋季运动会、迎新年（元旦）。
 * 日期是宁川中学校内安排，不是某所真实中学或教育行政部门的公告日期。
 */
import { clamp, pick, rngFrom, shuffle } from "./prng.js?v=t61u1";
import { formatCohortGrade } from "./calendar.js?v=t61u1";
import { seatLabel } from "./school.js?v=t61u1";

export const ACTIVITY_SOURCE_NOTE = "校内日期安排，按普通高中在第一次月考后举行秋季运动会、在第二次月考后举行迎新年（元旦）活动的惯例排入宁川中学校历，不是某所实校或教育行政部门公告的逐年日期。";

export const SPORTS_ACTION_CAP = {
  lead: 4,
  discipline: 1,
  record: 1,
};

export const NEWYEAR_ACTION_CAP = {
  attend: 1,
  watch: 1,
  log: 2,
};

const SPORTS_EVENTS = ["100米", "200米", "800米", "立定跳远", "铅球", "4×100米接力", "跳绳", "拔河"];
const SPORTS_PLACES = ["本年级小组第二", "本年级第四", "班级接力第三", "本组预赛第二"];
const SPORTS_INCIDENTS = ["起跑时蹭破了膝盖", "落地时扭了一下脚踝", "助威时喊得嗓子有些哑"];
const NEWYEAR_PROGRAMS = ["诗朗诵", "合唱", "小品", "乐器小品段", "诗句接龙"];
const NEWYEAR_DUTIES = ["门口迎宾值勤", "布置教室", "看管道具", "维持座次"];

export function isSchoolActivityOpen(state) {
  const a = state?.schoolActivity;
  return !!(a && a.opened && a.date === state.date);
}

export function upcomingSchoolActivity(state, calendar = []) {
  if (!state?.date) return null;
  if (isSchoolActivityOpen(state)) return state.schoolActivity;
  return (calendar || []).find((e) => e.kind === "activity" && e.date >= state.date) || null;
}

export function playerStageLine(state, date = state?.date) {
  const year = state?.player?.cohortYear;
  if (year == null || !date) return "";
  const { grade, term } = formatCohortGrade(year, date);
  if (grade >= 1 && grade <= 3) return `你带的${year}级现在是${term}`;
  if (grade > 3) return `你原先带的${year}级已经毕业`;
  return `你即将接带的${year}级${term}`;
}

function playerClassStudents(state) {
  const year = state.player?.cohortYear;
  const classNo = state.player?.classNo;
  const c = state.cohorts?.[year];
  return (c?.students || []).filter((s) => s.classNo === classNo);
}

function findStudent(state, studentId) {
  if (!studentId) return null;
  return playerClassStudents(state).find((s) => s.id === studentId)
    || Object.values(state.cohorts || {}).flatMap((c) => c.students || []).find((s) => s.id === studentId)
    || null;
}

function sourceNoteOf(ev, activity = null) {
  return ev?.sourceNote || activity?.sourceNote || ACTIVITY_SOURCE_NOTE;
}

function pushStudentNote(student, rec) {
  student.lastActivity = rec;
  student.activityNotes = [rec, ...(student.activityNotes || [])].slice(0, 8);
}

export function generateSportsRoster(state, ev) {
  const students = playerClassStudents(state).slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const rng = rngFrom(state.seed, ev.meetId || ev.id, "sports-roster");
  const shuffled = shuffle(rng, students);
  const n = Math.min(students.length, 8 + Math.floor(rng() * 5));
  let incidentsLeft = rng() < 0.7 ? 1 : rng() < 0.5 ? 2 : 0;
  return shuffled.slice(0, n).map((s) => {
    const eventName = pick(rng, SPORTS_EVENTS);
    const place = rng() < 0.3 ? pick(rng, SPORTS_PLACES) : null;
    let incident = null;
    if (incidentsLeft > 0 && rng() < 0.22) {
      incident = pick(rng, SPORTS_INCIDENTS);
      incidentsLeft -= 1;
    }
    return { id: s.id, name: s.name, eventName, place, incident };
  });
}

export function generateNewYearRoster(state, ev) {
  const students = playerClassStudents(state).slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const rng = rngFrom(state.seed, ev.id, ev.date, "newyear-roster");
  const shuffled = shuffle(rng, students);
  const nProg = Math.min(students.length, 4 + Math.floor(rng() * 3));
  const nDuty = Math.min(students.length - nProg, 2 + Math.floor(rng() * 2));
  const roster = [];
  for (let i = 0; i < nProg; i++) {
    const s = shuffled[i];
    roster.push({ id: s.id, name: s.name, role: "节目", program: pick(rng, NEWYEAR_PROGRAMS), duty: null });
  }
  for (let i = 0; i < nDuty; i++) {
    const s = shuffled[nProg + i];
    if (!s) break;
    roster.push({ id: s.id, name: s.name, role: "值勤", program: null, duty: pick(rng, NEWYEAR_DUTIES) });
  }
  return roster;
}

function sportsOpenRec(row, ev, date) {
  const bits = [`参加${row.eventName}`];
  if (row.place) bits.push(row.place);
  if (row.incident) bits.push(row.incident);
  const detail = bits.join("，");
  return {
    date,
    activityId: ev.meetId || ev.id,
    eventId: ev.id,
    kind: "sports",
    action: "roster",
    eventName: row.eventName,
    place: row.place || null,
    incident: row.incident || null,
    text: `${date}秋季运动会，${row.name}${detail}。这是宁川中学校内运动会记载，不是全市或全省官方成绩。`,
    statusLine: `${date}秋季运动会：${detail}。`,
  };
}

function newyearOpenRec(row, ev, date) {
  const detail = row.role === "值勤" ? row.duty : `参加${row.program}`;
  return {
    date,
    activityId: ev.id,
    eventId: ev.id,
    kind: "newyear",
    action: "roster",
    role: row.role,
    program: row.program || null,
    duty: row.duty || null,
    text: `${date}迎新年活动，${row.name}${detail}。这是宁川中学校内联欢记载，不套用某台晚会的现成流程。`,
    statusLine: `${date}迎新年活动：${detail}。`,
  };
}

function writeRosterNotes(state, ev, roster) {
  const date = ev.date || state.date;
  for (const row of roster) {
    const s = findStudent(state, row.id);
    if (!s) continue;
    if (s.lastActivity?.activityId === (ev.meetId || ev.id) && s.lastActivity?.action === "roster") continue;
    const rec = ev.activityKind === "newyear" ? newyearOpenRec(row, ev, date) : sportsOpenRec(row, ev, date);
    pushStudentNote(s, rec);
  }
}

function rosterSummary(activity) {
  const rows = activity?.roster || [];
  if (activity?.activityKind === "newyear") {
    const prog = rows.filter((r) => r.role === "节目").map((r) => `${r.name}的${r.program}`);
    const duty = rows.filter((r) => r.role === "值勤").map((r) => `${r.name}${r.duty}`);
    const bits = [];
    if (prog.length) bits.push(`节目有${prog.join("、")}`);
    if (duty.length) bits.push(`值勤有${duty.join("、")}`);
    return bits.join("；") || "本班有少量节目和值勤";
  }
  return rows.map((r) => {
    const extra = [r.place, r.incident].filter(Boolean).join("，");
    return `${r.name}参加${r.eventName}${extra ? "（" + extra + "）" : ""}`;
  }).join("、") || "本班有少量同学参赛";
}

/** 打开当天学校活动，生成本班少量事件并写入档案近况。同一场可复开，不重复写档。 */
export function openSchoolActivity(state, ev) {
  if (!ev || ev.kind !== "activity") return { ok: false, reason: "这不是学校活动。" };
  const meetId = ev.meetId || ev.id;
  const date = ev.date || state.date;
  const note = sourceNoteOf(ev);
  const you = playerStageLine(state, date);
  const existing = state.schoolActivity;
  if (existing?.meetId === meetId && existing.opened) {
    if (existing.date === date && existing.id === ev.id) {
      const hint = ev.activityKind === "newyear"
        ? "你仍可参加、看班或写日志。"
        : "你仍可带队、看纪律或记录本班参赛情况。";
      return { ok: true, already: true, text: `这场${ev.name}已经开始了。${hint}`, activity: existing };
    }
    state.schoolActivity = {
      ...existing,
      id: ev.id,
      date,
      name: ev.name,
      dayIndex: ev.dayIndex || existing.dayIndex,
      sourceNote: existing.sourceNote || note,
    };
    state.flags[`activity-${ev.id}`] = true;
    const text = `${ev.name}继续进行（${date}）。这是宁川中学的学校活动。${you}。${note}`;
    return { ok: true, continued: true, text, activity: state.schoolActivity };
  }

  const roster = ev.activityKind === "newyear"
    ? generateNewYearRoster(state, ev)
    : generateSportsRoster(state, ev);
  writeRosterNotes(state, ev, roster);
  state.schoolActivity = {
    id: ev.id,
    meetId,
    date,
    name: ev.name,
    activityKind: ev.activityKind,
    off: ev.off || (ev.activityKind === "newyear" ? "afternoon" : "full"),
    dayIndex: ev.dayIndex || 1,
    sourceNote: note,
    opened: true,
    roster,
    actions: [],
  };
  state.flags[`activity-${ev.id}`] = true;
  state.flags[`activity-${meetId}`] = true;
  const summary = rosterSummary(state.schoolActivity);
  const text = ev.activityKind === "newyear"
    ? `今天是宁川中学${ev.name}（${date}），这是学校活动，后半段为活动时段，不与正课搅在一起。${you}。本班${summary}。${note}`
    : `今天是宁川中学${ev.name}（${date}），这是学校活动，全日停课。${you}。本班参赛情况：${summary}。名次只是校内占位，不是全市或全省官方成绩。${note}`;
  return { ok: true, text, activity: state.schoolActivity };
}

function actionCount(activity, action, date = null) {
  return (activity.actions || []).filter((a) => a.action === action && (date == null || a.date === date)).length;
}

function capOf(activity, action) {
  const table = activity.activityKind === "newyear" ? NEWYEAR_ACTION_CAP : SPORTS_ACTION_CAP;
  return table[action] ?? 1;
}

function pickRosterStudent(activity, student, usedIds) {
  if (student) {
    const row = (activity.roster || []).find((r) => r.id === student.id);
    return { student, row: row || null };
  }
  const row = (activity.roster || []).find((r) => !usedIds.has(r.id));
  return { student: null, row: row || (activity.roster || [])[0] || null };
}

function ledIds(activity) {
  return new Set((activity.actions || []).filter((a) => a.action === "lead").map((a) => a.studentId));
}

/** 活动当天的可玩操作：运动会可带队、看纪律、记录本班；迎新年可参加、看班、写日志。 */
export function doActivityAction(state, action, studentId = null) {
  if (!isSchoolActivityOpen(state)) {
    return { ok: false, reason: "今天不是学校活动日，或这场活动还没开始。等校历上的运动会或迎新年那天再操作。" };
  }
  const activity = state.schoolActivity;
  const student = findStudent(state, studentId);
  if (studentId && !student) return { ok: false, reason: "找不到这名学生。" };
  if (student && state.player && student.classNo !== state.player.classNo) {
    return { ok: false, reason: "这场学校活动你只记录本班学生。" };
  }

  const kind = activity.activityKind;
  const allowed = kind === "newyear" ? ["attend", "watch", "log"] : ["lead", "discipline", "record"];
  if (!allowed.includes(action)) {
    return { ok: false, reason: kind === "newyear" ? "迎新年活动可以参加、看班或写日志。" : "运动会可以带队、看纪律或记录本班参赛情况。" };
  }

  const cap = capOf(activity, action);
  const used = action === "discipline"
    ? actionCount(activity, action, state.date)
    : actionCount(activity, action);
  if (used >= cap) {
    if (action === "discipline") return { ok: false, reason: "今天已经看过一遍纪律了，其余交给班主任。" };
    if (action === "record") return { ok: false, reason: "本班参赛情况已经记过一笔了。" };
    if (action === "attend") return { ok: false, reason: "这场迎新年活动你已经参加过了。" };
    if (action === "watch") return { ok: false, reason: "这场已经看过班了。" };
    if (action === "log") return { ok: false, reason: "这场日志已经写过了。" };
    return { ok: false, reason: "这项已经做过了。" };
  }

  const note = sourceNoteOf(null, activity);
  const you = playerStageLine(state, state.date);
  const date = state.date;
  const classNo = state.player?.classNo ?? 16;
  let text = "";
  let rec = null;
  let target = student;

  if (action === "lead") {
    const usedLead = ledIds(activity);
    if (student && usedLead.has(student.id)) {
      return { ok: false, reason: `这场已经带${student.name}检录过了。` };
    }
    const picked = pickRosterStudent(activity, student, usedLead);
    const row = picked.row;
    target = student || findStudent(state, row?.id) || null;
    if (!target || !row) return { ok: false, reason: "本班这场没有可带队的参赛同学了。" };
    const placeBit = row.place ? `该生后来在校内预赛里拿到${row.place}。` : "该生完成后回到班级座位休息。";
    const incBit = row.incident ? `${target.name}${row.incident}，你帮着找校医看了看，没有大碍。` : "";
    text = `你作为卓行${classNo}班实习数学老师，带着${target.name}（${seatLabel(target)}）到${row.eventName}检录。${placeBit}${incBit}这是宁川中学校内运动会，不是某所实校的公告赛程，也不是全市或全省官方成绩。${you}。`;
    rec = {
      date,
      activityId: activity.meetId,
      eventId: activity.id,
      kind: "sports",
      action: "lead",
      eventName: row.eventName,
      place: row.place || null,
      incident: row.incident || null,
      text,
      statusLine: `${date}秋季运动会：数学老师带队参加${row.eventName}。`,
    };
    target.relation = clamp((target.relation || 0) + 1, 0, 100);
  } else if (action === "discipline") {
    const rng = rngFrom(state.seed, activity.meetId, date, "discipline", actionCount(activity, "discipline"));
    const rows = shuffle(rng, activity.roster || []).slice(0, 2);
    const names = rows.map((r) => r.name).join("、") || "几名同学";
    const beat = pick(rng, [
      `${names}离开座位去买水，你把人喊了回来`,
      `${names}助威声音偏大，你提醒不要起哄`,
      `${names}检录后没有立刻归队，你在场地边清了一次点`,
    ]);
    text = `你在看台和检录处看本班纪律。${beat}。班级座位基本整齐。这是宁川中学校内安排的运动会，不是某所实校公告。${you}。`;
    if (rows[0]) {
      target = findStudent(state, rows[0].id);
      if (target) {
        rec = {
          date,
          activityId: activity.meetId,
          eventId: activity.id,
          kind: "sports",
          action: "discipline",
          text,
          statusLine: `${date}秋季运动会：被老师看过一遍纪律。`,
        };
      }
    }
  } else if (action === "record") {
    const summary = rosterSummary(activity);
    text = `你把本班参赛情况记进了手册：${summary}。名次只是校内占位，不是全市或全省官方成绩。${note}${you}。`;
  } else if (action === "attend") {
    const summary = rosterSummary(activity);
    text = `你参加了${activity.name}。${summary}。你在场看着本班节目和值勤，没有套用某台晚会的现成流程。${note}${you}。`;
  } else if (action === "watch") {
    const duty = (activity.roster || []).filter((r) => r.role === "值勤");
    const dutyBit = duty.length
      ? duty.map((r) => `${r.name}在${r.duty}`).join("、")
      : "门口有本班同学值勤";
    text = `你在活动时段看班。${dutyBit}，教室里行李放得整齐。这是宁川中学校内迎新年安排，不是某所实校晚会流程。${you}。`;
    if (duty[0]) {
      target = findStudent(state, duty[0].id);
      if (target) {
        rec = {
          date,
          activityId: activity.id,
          eventId: activity.id,
          kind: "newyear",
          action: "watch",
          text,
          statusLine: `${date}迎新年活动：老师看班时记了值勤。`,
        };
      }
    }
  } else if (action === "log") {
    const usedLog = new Set((activity.actions || []).filter((a) => a.action === "log").map((a) => a.studentId));
    const picked = pickRosterStudent(activity, student, usedLog);
    const row = picked.row;
    target = student || findStudent(state, row?.id) || null;
    const detail = !row ? "本班有少量节目和值勤"
      : row.role === "值勤" ? `${row.name}负责${row.duty}` : `${row.name}的${row.program}`;
    text = `你写下当天日志：${activity.name}是宁川中学校内安排（${date}），${you}。本班记下了${detail}。不套用某台晚会的现成流程。${note}`;
    if (target && row) {
      rec = {
        date,
        activityId: activity.id,
        eventId: activity.id,
        kind: "newyear",
        action: "log",
        text,
        statusLine: `${date}迎新年活动：写入了老师日志。`,
      };
    }
  }

  if (rec && target) pushStudentNote(target, rec);
  activity.actions = [...(activity.actions || []), {
    action,
    date,
    studentId: target?.id || studentId || null,
    name: target?.name || null,
  }];
  return { ok: true, text, rec, student: target || null, activity };
}
