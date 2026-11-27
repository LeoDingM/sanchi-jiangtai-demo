/**
 * 任教班班级管理：班委、值日、班情摘要与班会旁听。
 * 玩家是数学实习教师，协助班主任，不能主持班会，也不能撤换班委。
 * 只为玩家任教班做完整生成，不为全校每班另开一套。
 */
import { HOMEROOM_NAME } from "./config.js?v=t75u2";
import { hash01 } from "./prng.js?v=t75u2";
import { addDays, formatDateCn, parseYmd, weekday, weekdayName } from "./calendar.js?v=t75u2";
import { currentSlot, daySchedule, weekDates, weekStart } from "./timetable.js?v=t75u2";
import { homeworkWatchlist } from "./teaching.js?v=t75u2";

export const COMMITTEE_ROLES = [
  { id: "study", title: "学习委员" },
  { id: "discipline", title: "纪律委员" },
  { id: "monitor", title: "班长" },
  { id: "labor", title: "劳动委员" },
];

export const DUTY_PER_DAY = 4;

const PERSONALITY_SCORE = {
  study: { 自律: 7, 沉稳: 6, 好强: 6, 细腻: 5, 寡言: 3, 内向: 3, 开朗: 2, 热心: 2, 倔强: 2, 敏感: 1, 活泼: 1, 懒散: -6 },
  discipline: { 自律: 10, 沉稳: 7, 倔强: 4, 好强: 3, 细腻: 2, 热心: 2, 寡言: 2, 开朗: 1, 内向: 1, 敏感: 0, 活泼: -1, 懒散: -8 },
  monitor: { 热心: 8, 沉稳: 8, 开朗: 7, 好强: 6, 自律: 5, 活泼: 4, 倔强: 3, 细腻: 2, 内向: 1, 敏感: 1, 寡言: 0, 懒散: -6 },
  labor: { 热心: 9, 活泼: 7, 开朗: 6, 自律: 4, 好强: 3, 沉稳: 3, 细腻: 2, 倔强: 1, 内向: 0, 敏感: 0, 寡言: 0, 懒散: -4 },
};

export function abilityMean(student) {
  const vals = Object.values(student?.ability || {}).map(Number).filter((n) => Number.isFinite(n));
  if (!vals.length) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function personalityBonus(roleId, student) {
  const table = PERSONALITY_SCORE[roleId] || {};
  return table[student?.personality] || 0;
}

function scoreForRole(roleId, student) {
  const p = personalityBonus(roleId, student);
  const mean = abilityMean(student);
  const stab = Number(student?.stability || 50);
  const energy = Number(student?.energy || 70);
  if (roleId === "study") return mean + p;
  if (roleId === "discipline") return stab + p;
  if (roleId === "monitor") return mean * 0.4 + stab * 0.4 + p;
  if (roleId === "labor") return energy * 0.3 + p;
  return p;
}

function pickBest(candidates, roleId, seed, classNo) {
  let best = null;
  let bestScore = -Infinity;
  let bestTie = 1;
  for (const s of candidates) {
    const sc = scoreForRole(roleId, s);
    const tie = hash01(seed, "committee", classNo, roleId, s.id);
    if (!best || sc > bestScore || (sc === bestScore && tie < bestTie)) {
      best = s;
      bestScore = sc;
      bestTie = tie;
    }
  }
  return best;
}

/** 按当前班名单与世界编号硬定班委，一人一职；名单变了就重算。 */
export function selectCommittee(students, seed = 1, classNo = 16) {
  const list = (students || []).slice();
  const taken = new Set();
  const roles = [];
  for (const role of COMMITTEE_ROLES) {
    const pool = list.filter((s) => !taken.has(s.id));
    if (!pool.length) break;
    const picked = pickBest(pool, role.id, seed, classNo);
    if (!picked) break;
    taken.add(picked.id);
    roles.push({ id: role.id, title: role.title, student: picked });
  }
  const byStudentId = {};
  for (const r of roles) byStudentId[r.student.id] = r.title;
  return { roles, byStudentId, classNo };
}

export function classCommittee(state, students) {
  const classNo = state?.player?.classNo;
  const seed = state?.seed ?? 1;
  return selectCommittee(students || [], seed, classNo);
}

export function committeeTitleOf(committee, studentId) {
  if (!committee || studentId == null) return "";
  return committee.byStudentId?.[studentId] || "";
}

function sortedBySeat(students) {
  return (students || []).slice().sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0) || String(a.id).localeCompare(String(b.id)));
}

/**
 * 自 2017-01-02（周一）起的上课日序号：周一到周六计一天，周日不算。
 * 同一天、同一份座次名单结果稳定；相邻上课日按座号顺序往后轮。
 */
export function schoolDayIndex(date) {
  if (!date) return null;
  const { y, m, d } = parseYmd(date);
  const origin = Date.UTC(2017, 0, 2);
  const t = Date.UTC(y, m - 1, d);
  const days = Math.round((t - origin) / 86400000);
  const rem = ((days % 7) + 7) % 7;
  if (rem === 6) return null;
  const weeks = Math.floor(days / 7);
  return weeks * 6 + rem;
}

export function dutyStudents(students, date) {
  const list = sortedBySeat(students);
  const idx = schoolDayIndex(date);
  if (idx == null || !list.length) return [];
  const start = ((idx * DUTY_PER_DAY) % list.length + list.length) % list.length;
  const n = Math.min(DUTY_PER_DAY, list.length);
  const out = [];
  for (let i = 0; i < n; i++) out.push(list[(start + i) % list.length]);
  return out;
}

export function formatStudentShort(student) {
  if (!student) return "";
  return student.seq != null ? `${student.seq}号 ${student.name}` : (student.name || "");
}

export function weekDuty(students, date) {
  const start = weekStart(date);
  return weekDates(date).map((d) => {
    const wd = weekday(d);
    return {
      date: d,
      weekday: wd,
      weekdayName: weekdayName(d),
      rest: wd === 0,
      isToday: d === date,
      weekStart: start,
      students: wd === 0 ? [] : dutyStudents(students, d),
    };
  });
}

function watchRows(state) {
  return homeworkWatchlist(state.homework, state);
}

function briefFacts(state, students) {
  const list = students || [];
  const watch = watchRows(state);
  const missing = watch.filter((r) => r.status === "缺交" || r.correction === "待补交");
  const follow = watch.filter((r) => !(r.status === "缺交" || r.correction === "待补交"));
  const sleepy = list.filter((s) => s.lastClassFlag === "走神");
  const late = list.filter((s) => s.lastClassLate?.date);
  return { watch, missing, follow, sleepy, late };
}

/** 本班近况：只用已有的迟到、缺交/待跟进、走神记录，不另造指标。 */
export function classBrief(state, students) {
  const home = state?.player?.homeroom || HOMEROOM_NAME;
  const { missing, follow, sleepy, late } = briefFacts(state, students);
  const bits = [];
  const names = (arr, key = "name") => {
    const list = arr.map((x) => x[key] || x.name).filter(Boolean);
    return `${list.slice(0, 3).join("、")}${list.length > 3 ? "等" : ""}`;
  };
  if (late.length) bits.push(`正课迟到有${names(late)}${late.length}人`);
  if (missing.length) bits.push(`作业缺交${missing.length}人（${names(missing)}）`);
  if (follow.length) bits.push(`作业待跟进${follow.length}人（${names(follow)}）`);
  if (sleepy.length) bits.push(`最近课堂上走神的有${names(sleepy)}`);
  if (!bits.length) {
    return {
      text: `眼下没有特别要盯的迟到、缺交或走神记录。可与班主任${home}对一下班情。`,
      facts: { missing, follow, sleepy, late },
      empty: true,
    };
  }
  return {
    text: `本班近况：${bits.join("；")}。可向班主任${home}通报，请她晚自习先看这些人。`,
    facts: { missing, follow, sleepy, late },
    empty: false,
  };
}

export function isHomeroomMeetingSlot(state) {
  const slot = currentSlot(state);
  if (!slot || slot.isExamDay || slot.isActivityPeriod) return false;
  return slot.subject === "班会";
}

export function meetingKey(state) {
  if (!state?.date) return "";
  return `${state.date}|${state.periodId || ""}`;
}

export function hasAttendedMeeting(state, key = meetingKey(state)) {
  if (!key) return false;
  if (state.classMeetingAttendedKey === key) return true;
  return (state.classMeetings || []).some((m) => `${m.date}|${m.periodId}` === key);
}

export function upcomingClassMeeting(state) {
  if (!state?.date) return null;
  if (isHomeroomMeetingSlot(state)) {
    return { date: state.date, slot: currentSlot(state), sameDay: true };
  }
  let d = state.date;
  for (let i = 0; i < 21; i++) {
    const periods = daySchedule(d, state);
    const startIdx = d === state.date ? periods.findIndex((p) => p.id === state.periodId) : -1;
    const later = periods.slice(startIdx + 1).find((p) => p.subject === "班会" && !p.isExamDay && !p.isActivityPeriod);
    if (later) return { date: d, slot: later, sameDay: d === state.date };
    d = addDays(d, 1);
  }
  return null;
}

function meetingTheme(state, facts) {
  const { m, d } = parseYmd(state.date);
  if (m === 9 && d <= 20) return "开学常规与值日安排";
  if (facts.missing.length || facts.follow.length) return "作业订正与课堂纪律";
  if (facts.sleepy.length || facts.late.length) return "课堂状态与出勤";
  if (m === 1 || m === 6) return "学期收心与作息";
  if (m === 11 || m === 4) return "近阶段学习安排";
  return "本周班级常规";
}

function meetingMinutes(state, students, { assist = false } = {}) {
  const home = state.player?.homeroom || HOMEROOM_NAME;
  const facts = briefFacts(state, students);
  const theme = meetingTheme(state, facts);
  const duty = dutyStudents(students, state.date);
  const dutyLine = duty.length
    ? `今日值日是${duty.map(formatStudentShort).join("、")}。`
    : "今日按座号轮到的值日生已记在值日表上。";
  let factLine = "她提醒大家按课表作息，把本周值日和课堂纪律落实到位。";
  if (facts.missing.length) {
    factLine = `她点到最近作业缺交的${facts.missing.slice(0, 3).map((r) => r.name).join("、")}${facts.missing.length > 3 ? "等" : ""}，要求把本子补上。`;
  } else if (facts.follow.length) {
    factLine = `她提醒作业还待跟进的同学把订正做完，不要只把本子交上去。`;
  } else if (facts.sleepy.length) {
    factLine = `她提到最近课堂上走神的${facts.sleepy.slice(0, 3).map((s) => s.name).join("、")}${facts.sleepy.length > 3 ? "等" : ""}，请各自收一收状态。`;
  } else if (facts.late.length) {
    factLine = `她提醒近段正课迟到的同学提前进教室，不要等上课铃后再到。`;
  }
  const slot = currentSlot(state);
  const slotBit = slot?.name || "班会课";
  const roleLine = assist
    ? `你协助班主任整理了值日名单和要点，班会仍由她主持。`
    : `你在后排旁听，没有代替她主持。`;
  const text = `${formatDateCn(state.date)}${slotBit}，班主任${home}主持本班班会，主题是「${theme}」。${dutyLine}${factLine}${roleLine}`;
  return { theme, text, host: home };
}

/** 仅当前时段确实是本班班会时，可旁听或协助一次；不能主持。 */
export function attendClassMeeting(state, students, { assist = false } = {}) {
  if (!isHomeroomMeetingSlot(state)) {
    return { ok: false, reason: "现在不是班会课，要等到班会课再旁听或协助班主任。" };
  }
  const key = meetingKey(state);
  if (hasAttendedMeeting(state, key)) {
    return { ok: false, reason: "这节班会已经旁听过了，不必再点一次。" };
  }
  const rec = meetingMinutes(state, students || [], { assist });
  const slot = currentSlot(state);
  state.classMeetings = [...(state.classMeetings || []), {
    date: state.date,
    periodId: state.periodId,
    subject: slot?.subject || "班会",
    theme: rec.theme,
    mode: assist ? "assist" : "attend",
    host: rec.host,
    minutes: rec.text,
  }];
  state.classMeetingAttendedKey = key;
  return { ok: true, text: rec.text, theme: rec.theme, minutes: rec.text, host: rec.host, mode: assist ? "assist" : "attend" };
}

export function hostClassMeeting(state) {
  const home = state?.player?.homeroom || HOMEROOM_NAME;
  return { ok: false, reason: `班会由班主任${home}主持，实习教师不能推开她去主持班会。` };
}

/** 课代表：按本班课表科目各设一名，不与班委兼职，也不给每人一个职务。 */
export const SUBJECT_REP_DEFS = [
  { id: "rep-chinese", title: "语文课代表", subjectId: "chinese" },
  { id: "rep-math", title: "数学课代表", subjectId: "math" },
  { id: "rep-english", title: "英语课代表", subjectId: "english" },
  { id: "rep-physics", title: "物理课代表", subjectId: "physics" },
  { id: "rep-chemistry", title: "化学课代表", subjectId: "chemistry" },
  { id: "rep-biology", title: "生物课代表", subjectId: "biology" },
  { id: "rep-history", title: "历史课代表", subjectId: "history" },
  { id: "rep-politics", title: "政治课代表", subjectId: "politics" },
  { id: "rep-geography", title: "地理课代表", subjectId: "geography" },
];

export function repSubjectsForClass(students) {
  const list = students || [];
  const tracks = new Set(list.map((s) => s.track || s.trackPref || "mixed"));
  const splitLi = tracks.size === 1 && tracks.has("li");
  const splitWen = tracks.size === 1 && tracks.has("wen");
  const hasBio = list.some((s) => s.ability && s.ability.biology != null);
  if (splitLi) return ["chinese", "math", "english", "physics", "chemistry"].concat(hasBio ? ["biology"] : []);
  if (splitWen) return ["chinese", "math", "english", "politics", "history", "geography"];
  return ["chinese", "math", "english", "physics", "chemistry", "politics", "history", "geography"];
}

function subjectAbilityOf(student, subjectId) {
  const v = Number(student?.ability?.[subjectId]);
  return Number.isFinite(v) ? v : 0;
}

export function selectSubjectReps(students, seed = 1, classNo = 16, { excludeIds } = {}) {
  const list = (students || []).slice();
  const taken = new Set(excludeIds || []);
  const roles = [];
  for (const sid of repSubjectsForClass(list)) {
    const def = SUBJECT_REP_DEFS.find((d) => d.subjectId === sid);
    if (!def) continue;
    const pool = list.filter((s) => !taken.has(s.id));
    if (!pool.length) break;
    let best = null;
    let bestScore = -Infinity;
    let bestTie = 1;
    for (const s of pool) {
      const sc = subjectAbilityOf(s, sid) * 1.2 + (Number(s.stability) || 0) * 0.15 + (PERSONALITY_SCORE.study[s.personality] || 0) * 0.3;
      const tie = hash01(seed, "subj-rep", classNo, sid, s.id);
      if (!best || sc > bestScore || (sc === bestScore && tie < bestTie)) {
        best = s;
        bestScore = sc;
        bestTie = tie;
      }
    }
    if (!best) break;
    taken.add(best.id);
    roles.push({ id: def.id, title: def.title, subjectId: sid, student: best });
  }
  const byStudentId = {};
  for (const r of roles) byStudentId[r.student.id] = r.title;
  return { roles, byStudentId, classNo };
}

/** 班委 + 课代表。分班后按新名单重算，实习老师不能任命。 */
export function selectClassOffices(students, seed = 1, classNo = 16) {
  const committee = selectCommittee(students, seed, classNo);
  const reps = selectSubjectReps(students, seed, classNo, { excludeIds: Object.keys(committee.byStudentId || {}) });
  const titlesByStudentId = { ...committee.byStudentId };
  for (const [id, title] of Object.entries(reps.byStudentId || {})) {
    titlesByStudentId[id] = titlesByStudentId[id] ? `${titlesByStudentId[id]}、${title}` : title;
  }
  return { committee, reps, titlesByStudentId, classNo };
}

export function officeTitlesOf(offices, studentId) {
  if (!offices || studentId == null) return [];
  const c = offices.committee?.byStudentId?.[studentId];
  const r = offices.reps?.byStudentId?.[studentId];
  return [c, r].filter(Boolean);
}

export function classOfficesFor(state, classNo, students) {
  const no = classNo != null ? Number(classNo) : Number(state?.player?.classNo);
  const seed = state?.seed ?? 1;
  return selectClassOffices(students || [], seed, no);
}
