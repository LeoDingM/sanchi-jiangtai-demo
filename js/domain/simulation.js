/** 游戏状态机：上课/考试/分班/高考录取/毕业升学与自动跳阶段。 */
import {
  PLAYER_CLASS_NO, PLAYER_DEFAULT_NAME, PLAYER_ROLE, START_DATE, GRADE_YEAR, HOMEROOM_NAME, MENTOR_NAME,
} from "./config.js";
import { addDays, cmpDate, formatDateCn, nextExamEvent, SCHOOL_CALENDAR, weekday, eventById } from "./calendar.js";
import { generateCohort, generateOpeningSchool, classStudents, currentGrade } from "./school.js";
import { firstPlacement, secondPlacement, rebuildClasses } from "./placement.js";
import { runExam } from "./examService.js";
import { admitCohort } from "./admission.js";
import { rngFrom, clamp } from "./prng.js";
import { prepareLesson as prepareLessonCore, teachLesson, reviewHomework as reviewHomeworkCore, topicsForGrade, LESSON_STYLES } from "./teaching.js";

export const SAVE_VERSION = 1;

function schoolYearFromDate(date) {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  return m >= 8 ? y : y - 1;
}

function gradeOf(entryYear, date) {
  return schoolYearFromDate(date) - entryYear + 1;
}

function clone(x) { return JSON.parse(JSON.stringify(x)); }

function snapshotPlayerClass(state) {
  const c = state.cohorts[state.player.cohortYear];
  return classStudents(c, state.player.classNo);
}

function bonusFor(state, student) {
  if (student.entryYear !== state.player.cohortYear || student.classNo !== state.player.classNo) return 0;
  return (state.player.mathTeaching || 0) * 0.35;
}

export function createGame(seed = 20170901, playerName = PLAYER_DEFAULT_NAME) {
  const opening = generateOpeningSchool(seed, GRADE_YEAR);
  const date = START_DATE;
  const cohorts = opening.cohorts;
  // 旧年级补做历史分班，使开学时高二高三已是文理分科编制
  for (const year of [GRADE_YEAR - 1, GRADE_YEAR - 2]) {
    const c = cohorts[year];
    const pre = runExam(c, { id: `hist-final-${year}`, name: "历史期末", examKind: "final", difficulty: 0.99, dispersion: 1.02, date: `${year + 1}-01-16` }, { grade: 1, split: false });
    const p1 = firstPlacement(c.students, pre.scoreMap, { seed: seed + year });
    c.students = p1.students;
    c.classes = rebuildClasses(c.students);
    c.trackSplit = true;
    const pre2 = runExam(c, { id: `hist-final2-${year}`, name: "历史下学期期末", examKind: "final", difficulty: 1.0, dispersion: 1.0, date: `${year + 1}-06-25` }, { grade: 1, split: true });
    const p2 = secondPlacement(c.students, pre2.scoreMap, { seed: seed + year + 1 });
    c.students = p2.students;
    c.classes = rebuildClasses(c.students);
    c.placed2 = true;
  }
  const state = {
    version: SAVE_VERSION,
    seed,
    date,
    periodId: "morning-read",
    schoolYear: schoolYearFromDate(date),
    player: {
      name: playerName,
      role: PLAYER_ROLE,
      careerYear: 0,
      official: false,
      cohortYear: GRADE_YEAR,
      classNo: PLAYER_CLASS_NO,
      prep: 0,
      lessons: [],
      lessonPlan: null,
      mathTeaching: 0.8,
      mentor: MENTOR_NAME,
      homeroom: HOMEROOM_NAME,
    },
    cohorts,
    exams: {}, // key: `${entryYear}|${examId}`
    admissions: {}, // key: `${entryYear}|${year}`
    alumni: [],
    honors: [],
    log: [{ date, text: `${playerName}到江西省宁川中学报到，担任${GRADE_YEAR}级卓行16班数学实习教师。班主任${HOMEROOM_NAME}，备课组长${MENTOR_NAME}。` }],
    talksToday: 0,
    flags: {},
  };
  return state;
}

export function getCohort(state, entryYear) {
  return state.cohorts[entryYear];
}

export function playerStudents(state) {
  return snapshotPlayerClass(state);
}

export function addLog(state, text, date = state.date) {
  state.log.unshift({ date, text });
  if (state.log.length > 400) state.log.length = 400;
}

function compactReport(report, entryYear) {
  const rows = report.rows.map((r) => ({
    studentId: r.studentId, name: r.name, classNo: r.classNo, tier: r.tier,
    track: r.track, repeat: !!r.repeat, total: r.total, maxTotal: r.maxTotal,
    scale: r.scale, subjects: r.subjects, line: r.line, rank: r.rank,
    ...Object.fromEntries((r.subjects || []).map((id) => [id, r[id]])),
  }));
  const cut = { ...report.cutoffs, ranked: undefined };
  return {
    examId: report.examId, examName: report.examName, examKind: report.examKind,
    date: report.date, difficulty: report.difficulty, dispersion: report.dispersion,
    scale: report.scale, grade: report.grade, split: report.split, entryYear,
    rows, classes: report.classes, subjectIds: report.subjectIds, toppers: report.toppers,
    cutoffs: cut,
  };
}

export function hydrateReport(report) {
  if (!report) return report;
  if (!report.scoreMap) report.scoreMap = Object.fromEntries((report.rows || []).map((r) => [r.studentId, r]));
  if (report.cutoffs && !report.cutoffs.ranked) {
    const regular = (report.rows || []).filter((r) => !r.repeat);
    if (report.split) {
      report.cutoffs.ranked = {
        li: regular.filter((r) => r.track === "li").sort((a, b) => b.total - a.total),
        wen: regular.filter((r) => r.track === "wen").sort((a, b) => b.total - a.total),
      };
    } else {
      report.cutoffs.ranked = { mixed: regular.slice().sort((a, b) => b.total - a.total) };
    }
  }
  return report;
}

function storeExam(state, entryYear, report) {
  const key = `${entryYear}|${report.examId}`;
  state.exams[key] = compactReport(report, entryYear);
  const keepKinds = new Set(["gaokao", "final", "midterm", "province", "mock1", "mock2", "mock3"]);
  const keys = Object.keys(state.exams).sort((a, b) => (state.exams[a].date < state.exams[b].date ? 1 : -1));
  const recent = keys.slice(0, 24);
  for (const k of keys) {
    if (recent.includes(k)) continue;
    const [y, ] = k.split("|");
    const ex = state.exams[k];
    if (keepKinds.has(ex.examKind) || Number(y) === state.player.cohortYear) continue;
    // 旧的月考只保留班级汇总和分数线，减小存档
    ex.rows = [];
    ex.pruned = true;
  }
  return hydrateReport(state.exams[key]);
}

export function examKeys(state) {
  return Object.keys(state.exams);
}

export function listExamReports(state, { entryYear, examId } = {}) {
  return Object.entries(state.exams)
    .filter(([k]) => {
      const [y, id] = k.split("|");
      if (entryYear != null && Number(y) !== Number(entryYear)) return false;
      if (examId && id !== examId) return false;
      return true;
    })
    .map(([, v]) => hydrateReport(v))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function runScheduledExam(state, ev) {
  const reports = [];
  const years = ev.grades
    ? ev.grades.map((g) => schoolYearFromDate(ev.date) - g + 1)
    : Object.keys(state.cohorts).map(Number);
  const uniqueYears = [...new Set(years)].filter((y) => state.cohorts[y]);
  for (const entryYear of uniqueYears) {
    const c = state.cohorts[entryYear];
    const grade = gradeOf(entryYear, ev.date);
    if (grade < 1 || grade > 3) continue;
    if (ev.grades && !ev.grades.includes(grade)) continue;
    const report = runExam(c, ev, {
      grade,
      split: !!c.trackSplit,
      teachingBonusFor: (s) => bonusFor(state, s),
    });
    storeExam(state, entryYear, report);
    reports.push({ entryYear, grade, report });
    if (entryYear === state.player.cohortYear) {
      const cls = report.classes.find((x) => x.classNo === state.player.classNo);
      if (cls) addLog(state, `${ev.name}结束。任教班均分${cls.avg}，最高${cls.max}，一本上线（校内线）${cls.firstCount}人，二本累计${cls.secondCount}人。`);
    }
  }
  state.flags.lastExamId = ev.id;
  return reports;
}

export function doFirstPlacement(state, entryYear, overrides = {}) {
  const c = state.cohorts[entryYear];
  if (!c || c.trackSplit) return { ok: false, reason: "已经分过第一次班" };
  const finals = listExamReports(state, { entryYear }).filter((r) => r.examKind === "final" || r.examName.includes("期末"));
  const report = finals[0] || listExamReports(state, { entryYear })[0];
  if (!report) return { ok: false, reason: "还没有期末成绩，无法分班" };
  const p = firstPlacement(c.students, report.scoreMap, { overrides, seed: state.seed + entryYear });
  c.students = p.students;
  c.classes = rebuildClasses(c.students);
  c.trackSplit = true;
  const stay = p.assignments.filter((a) => {
    const s = report.scoreMap[a.id];
    return s && s.classNo === a.classNo;
  }).length;
  addLog(state, `${entryYear}级完成第一次分班：文理分科并按期末成绩调整梯队。云岫0/1班不参与普通淘汰，2—4班保持顶尖梯队。`);
  state.flags[`place1-${entryYear}`] = true;
  c.placed1 = true;
  return { ok: true, placement: p };
}

export function doSecondPlacement(state, entryYear) {
  const c = state.cohorts[entryYear];
  if (!c || !c.trackSplit) return { ok: false, reason: "尚未完成第一次分班" };
  if (c.placed2) return { ok: false, reason: "已经做过第二次分班" };
  const finals = listExamReports(state, { entryYear }).filter((r) => r.examKind === "final");
  const report = finals[0] || listExamReports(state, { entryYear })[0];
  if (!report) return { ok: false, reason: "缺少期末成绩" };
  const p = secondPlacement(c.students, report.scoreMap, { seed: state.seed + entryYear + 9 });
  c.students = p.students;
  c.classes = rebuildClasses(c.students);
  c.placed2 = true;
  addLog(state, `${entryYear}级完成第二次分班：不再分文理、不跨梯队，只在同科类同层次内部均衡重组。0/1班保持稳定。`);
  state.flags[`place2-${entryYear}`] = true;
  return { ok: true, placement: p };
}

export function doAdmission(state, ev) {
  const entryYear = ev.cohortYear;
  const c = state.cohorts[entryYear];
  if (!c) return { ok: false, reason: "找不到该届学生" };
  const gk = listExamReports(state, { entryYear }).find((r) => r.examKind === "gaokao");
  if (!gk) return { ok: false, reason: "还没有高考成绩" };
  const year = ev.year || Number(ev.date.slice(0, 4));
  const seniors = c.students.filter((s) => gradeOf(s.entryYear, ev.date) >= 3 || s.repeat);
  // 应届 + 复读都参加录取
  const results = admitCohort(c.students, gk.scoreMap, year);
  const key = `${entryYear}|${year}`;
  state.admissions[key] = { year, entryYear, results, date: ev.date };
  const qb = results.filter((r) => r.qingbei);
  const first = results.filter((r) => r.batch === "一批").length;
  addLog(state, `${year}年高考录取公布。本届（含复读）一批${first}人，清北${qb.length}人。去向按江西公开投档线对照，不以喜报凑数。`);
  state.flags[`admit-${entryYear}-${year}`] = true;
  return { ok: true, results, qingbei: qb.length, first };
}

export function doPromote(state, ev) {
  const graduatedCohort = ev.graduatedCohort;
  const newEntry = ev.newEntryYear;
  const admitKey = Object.keys(state.admissions).find((k) => k.startsWith(`${graduatedCohort}|`));
  const adm = admitKey ? state.admissions[admitKey] : null;
  const c = state.cohorts[graduatedCohort];
  if (c && adm) {
    const byId = Object.fromEntries(adm.results.map((r) => [r.studentId, r]));
    const staying = [];
    for (const s of c.students) {
      const a = byId[s.id];
      if (a && a.repeatIntent && !s.repeat) {
        staying.push({
          ...s,
          repeat: true,
          tier: "fuzhuo",
          originClassNo: s.classNo,
          // 复读一年能力微增，但压力上升
          ability: Object.fromEntries(Object.entries(s.ability).map(([k, v]) => [k, clamp(v + 1.6, 0, 99)])),
          stress: clamp((s.stress || 40) + 8, 0, 95),
        });
      } else {
        state.alumni.push({
          ...s,
          graduatedYear: ev.newEntryYear,
          admission: a || null,
        });
      }
    }
    // 把复读生编入复卓班
    const wenNos = [31, 32, 33, 34];
    const liNos = [35, 36, 37, 38, 39, 40];
    let wi = 0, li = 0;
    const wen = staying.filter((s) => s.track === "wen");
    const liS = staying.filter((s) => s.track !== "wen");
    const assignNos = (arr, nos) => {
      const per = Math.max(50, Math.ceil(arr.length / nos.length) || 50);
      arr.forEach((s, i) => { s.classNo = nos[Math.min(nos.length - 1, Math.floor(i / per))]; });
    };
    assignNos(wen, wenNos);
    assignNos(liS, liNos);
    delete state.cohorts[graduatedCohort];
    // 复读生挂到“下一届高三”所属：他们与新高三同一学年上课，单独保留在 repeatPool 直到合并
    state.pendingRepeat = staying;
  } else if (c) {
    delete state.cohorts[graduatedCohort];
  }

  // 升年级只是时间推进，cohort 仍以入学年索引
  const quality = (rngFrom(state.seed, "intake", newEntry)() - 0.5) * 2.4;
  const freshman = generateCohort(newEntry, state.seed, { alreadySplit: false, quality });
  state.cohorts[newEntry] = freshman;

  // 合并复读进当前新高三对应的上一届？高三 = newEntry-2 学年的入学年
  const seniorYear = newEntry - 2;
  if (state.pendingRepeat?.length && state.cohorts[seniorYear]) {
    const sen = state.cohorts[seniorYear];
    sen.students = sen.students.concat(state.pendingRepeat);
    sen.classes = rebuildClasses(sen.students);
    state.pendingRepeat = [];
  }

  // 玩家：若原任教届已毕业，接新高一 16 班；否则继续跟班升级
  if (state.player.cohortYear === graduatedCohort) {
    state.player.cohortYear = newEntry;
    state.player.classNo = PLAYER_CLASS_NO;
    addLog(state, `${graduatedCohort}级毕业离校。你转任${newEntry}级卓行16班数学教师。新高一按入学成绩进入各层次班，学校档案与历届去向保留。`);
  } else {
    addLog(state, `新学年开始：${newEntry}级高一入学，各年级依次升等。${graduatedCohort}级已离校或进入复卓班。`);
  }
  state.player.careerYear += 1;
  if (!state.player.official && state.player.careerYear >= 1) {
    state.player.official = true;
    state.player.role = "中学数学教师";
    addLog(state, "实习期满，你转正为正式数学教师。");
  }
  state.player.prep = 1;
  state.schoolYear = newEntry;
  state.flags[`promoted-${newEntry}`] = true;
  return { ok: true, newEntry };
}

export function applyEvent(state, ev) {
  if (ev.kind === "exam") return { type: "exam", reports: runScheduledExam(state, ev) };
  if (ev.kind === "placement1") return { type: "placement1", ...doFirstPlacement(state, ev.grades ? schoolYearFromDate(ev.date) : state.player.cohortYear) };
  if (ev.kind === "placement2") return { type: "placement2", ...doSecondPlacement(state, ev.grades ? schoolYearFromDate(ev.date) : state.player.cohortYear) };
  if (ev.kind === "admission") return { type: "admission", ...doAdmission(state, ev) };
  if (ev.kind === "promote") return { type: "promote", ...doPromote(state, ev) };
  return { type: ev.kind, ok: true };
}

/** 一键跳到下一个考试/分班/录取/升学事件，并结算该事件。 */
export function skipToNextStage(state) {
  const ev = nextExamEvent(state.date, SCHOOL_CALENDAR);
  if (!ev) return { ok: false, reason: "校历已无后续事件" };
  state.date = ev.date;
  state.periodId = "morning-read";
  state.talksToday = 0;
  state.reviewsToday = 0;
  const result = applyEvent(state, ev);
  return { ok: true, event: ev, result };
}

/** 连续跳过，直到某届高考录取完成，或指定停止条件。 */
export function skipUntil(state, pred, maxSteps = 80) {
  const steps = [];
  for (let i = 0; i < maxSteps; i++) {
    if (pred(state)) break;
    const r = skipToNextStage(state);
    if (!r.ok) break;
    steps.push(r);
  }
  return steps;
}

export function skipToGaokaoOf(state, entryYear) {
  return skipUntil(state, (s) => {
    return Object.keys(s.admissions).some((k) => k.startsWith(`${entryYear}|`));
  }, 90);
}

export function skipToNextCohort(state) {
  // 以学年推进为准，而不是“已经升过某届”的旧标记。
  // 否则高考录取日 schoolYear 仍是上一学年、promoted 标记早已为真，会立刻停住。
  const beforeSchoolYear = state.schoolYear;
  return skipUntil(state, (s) => s.schoolYear > beforeSchoolYear && s.cohorts[s.schoolYear], 90);
}

export function advanceDay(state) {
  const evs = SCHOOL_CALENDAR.filter((e) => e.date === state.date && !state.flags[`done-${e.id}`]);
  // 若当天有未处理的关键事件，先处理再过天
  const major = evs.find((e) => ["exam", "placement1", "placement2", "admission", "promote"].includes(e.kind));
  if (major) {
    state.flags[`done-${major.id}`] = true;
    return applyEvent(state, major);
  }
  state.date = addDays(state.date, 1);
  state.periodId = "morning-read";
  state.talksToday = 0;
  state.reviewsToday = 0;
  const incoming = SCHOOL_CALENDAR.filter((e) => e.date === state.date);
  return { type: "day", date: state.date, events: incoming };
}

export function prepareLesson(state, opts = {}) {
  const grade = gradeOf(state.player.cohortYear, state.date);
  const r = prepareLessonCore(state, opts, grade);
  addLog(state, r.text);
  return r;
}

export function teach(state, style = "精讲例题", callId = null) {
  const grade = gradeOf(state.player.cohortYear, state.date);
  const cls = snapshotPlayerClass(state);
  const r = teachLesson(state, cls, { style, callId, grade });
  addLog(state, r.text);
  return r;
}

export function reviewHomework(state, studentId) {
  const c = state.cohorts[state.player.cohortYear];
  const s = c?.students.find((x) => x.id === studentId);
  const r = reviewHomeworkCore(state, s);
  if (r.ok) addLog(state, r.text);
  return r;
}

export { topicsForGrade, LESSON_STYLES };

export function talkTo(state, studentId, topic = "鼓励") {
  const c = state.cohorts[state.player.cohortYear];
  const s = c.students.find((x) => x.id === studentId);
  if (!s) return { ok: false, reason: "找不到这名学生" };
  if (state.talksToday >= 5) return { ok: false, reason: "今天谈话已经不少，改日再谈。" };
  const table = {
    鼓励: { relation: 2, mood: 4, stress: -2, text: (n) => `你鼓励${n}再坚持一阵，注意方法，别只盯着一次分数。` },
    询问学习: { relation: 1, mood: 1, stress: 0, text: (n) => `你和${n}对了一下近期作业，记下了薄弱科目。` },
    关注状态: { relation: 2, mood: 2, stress: -4, text: (n) => `你关心${n}最近的休息和心情，提醒劳逸结合。` },
    谈心: { relation: 3, mood: 3, stress: -3, text: (n) => `你和${n}谈了家里和将来的打算，师生关系近了一些。` },
  };
  const a = table[topic] || table.鼓励;
  s.relation = clamp((s.relation || 0) + a.relation, 0, 100);
  s.mood = clamp((s.mood || 60) + a.mood, 0, 100);
  s.stress = clamp((s.stress || 40) + a.stress, 0, 100);
  const text = a.text(s.name);
  s.talks = [...(s.talks || []), { date: state.date, topic, text }];
  state.talksToday += 1;
  addLog(state, text);
  return { ok: true, student: s, text };
}

export function setPlacementPref(state, studentId, track) {
  const c = state.cohorts[state.player.cohortYear];
  const s = c.students.find((x) => x.id === studentId);
  if (!s) return { ok: false };
  s.trackPref = track === "wen" ? "wen" : "li";
  return { ok: true };
}

export { formatDateCn, SCHOOL_CALENDAR, gradeOf, schoolYearFromDate };
