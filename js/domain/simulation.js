/** 游戏状态机：上课/考试/分班/高考录取/毕业升学与自动跳阶段。 */
import {
  PLAYER_CLASS_NO, PLAYER_DEFAULT_NAME, PLAYER_ROLE, START_DATE, GRADE_YEAR, HOMEROOM_NAME, MENTOR_NAME,
} from "./config.js";
import { addDays, cmpDate, formatDateCn, nextExamEvent, SCHOOL_CALENDAR, weekday, eventById, examParams } from "./calendar.js";
import { generateCohort, generateOpeningSchool, classStudents, currentGrade, seatLabel, seatOf, reseatClasses } from "./school.js";
import { firstPlacement, secondPlacement, rebuildClasses } from "./placement.js";
import { runExam } from "./examService.js";
import { provincialPassCounts, schoolQuotaFromPrior, fallbackSchoolQuota, examResultLogText } from "./schoolLines.js";
import { admitCohort } from "./admission.js";
import { rngFrom, clamp } from "./prng.js";
import { prepareLesson as prepareLessonCore, teachLesson, reviewHomework as reviewHomeworkCore, topicsForGrade, LESSON_STYLES, suggestedTopic, topicProgress, homeworkWatchlist, studentTeachingContext, collectHomeworkFollowups, urgeHomework as urgeHomeworkCore, checkCorrection as checkCorrectionCore, officeMarking as officeMarkingCore, consultHomeroom as consultHomeroomCore, consultMentor as consultMentorCore, tutorEvening as tutorEveningCore, raisedHands, homeroomEveningRoll as homeroomEveningRollCore, compileEveningRoll, studentRecentStatus, rollCallStatusLine } from "./teaching.js";
import { daySchedule, currentSlot, nextPeriodAfter, startPeriodId, pendingMajorEvent, majorEventOn, upcomingMath, upcomingTutoring, formatSlotLabel, isTutoringSlot } from "./timetable.js";
import { openParentsMeeting as openParentsMeetingCore, meetParent as meetParentCore, isParentsMeetingOpen, upcomingParentsMeeting, PARENT_TALK_CAP, PARENTS_SOURCE_NOTE } from "./parents.js";

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

/** 按同一套确定性规则结算某届高考应届省控上线人数，只保留统计，不把该届放入可玩年级。 */
export function simulatePriorGaokaoStats(seed, entryYear, gaokaoYear) {
  const c = generateCohort(entryYear, seed, { alreadySplit: false, quality: 0 });
  const pre = runExam(c, { id: `prior-final-${entryYear}`, name: "历史期末", examKind: "final", difficulty: 0.99, dispersion: 1.02, date: `${entryYear + 1}-01-16` }, { grade: 1, split: false });
  const p1 = firstPlacement(c.students, pre.scoreMap, { seed: seed + entryYear });
  c.students = p1.students;
  c.classes = rebuildClasses(c.students);
  c.trackSplit = true;
  const pre2 = runExam(c, { id: `prior-final2-${entryYear}`, name: "历史下学期期末", examKind: "final", difficulty: 1.0, dispersion: 1.0, date: `${entryYear + 1}-06-25` }, { grade: 1, split: true });
  const p2 = secondPlacement(c.students, pre2.scoreMap, { seed: seed + entryYear + 1 });
  c.students = p2.students;
  c.classes = rebuildClasses(c.students);
  const gkEv = { id: `gaokao-${gaokaoYear}`, name: `${gaokaoYear}年普通高考`, examKind: "gaokao", date: `${gaokaoYear}-06-07`, year: gaokaoYear };
  const params = examParams(gkEv);
  const gk = runExam(c, { ...gkEv, difficulty: params.difficulty, dispersion: params.dispersion }, { grade: 3, split: true });
  const counts = provincialPassCounts(c.students, gk.scoreMap, gaokaoYear);
  counts.entryYear = entryYear;
  counts.source = `${entryYear}级${gaokaoYear}年高考本校省控实际上线人数（应届，不含复读）。开局按同一套规则结算，只保留统计，该届不进入可玩年级。`;
  return counts;
}

export function currentSchoolQuota(state) {
  const hist = state?.schoolLineHistory;
  if (hist?.length) return schoolQuotaFromPrior(hist[hist.length - 1]);
  return fallbackSchoolQuota();
}

export function recordPriorGaokaoCounts(state, counts) {
  if (!counts) return currentSchoolQuota(state);
  state.schoolLineHistory = [...(state.schoolLineHistory || []), counts];
  return schoolQuotaFromPrior(counts);
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
    schoolLineHistory: [],
  };
  const prior = simulatePriorGaokaoStats(seed, GRADE_YEAR - 3, GRADE_YEAR);
  state.schoolLineHistory = [prior];
  addLog(state, `校内划线按上一届高考本校省控实际上线人数滚动。开局已结算${prior.entryYear}级${prior.gaokaoYear}年高考应届上线：理科一本${prior.li.firstN}人、二本累计${prior.li.secondN}人；文科一本${prior.wen.firstN}人、二本累计${prior.wen.secondN}人。该届只保留统计，不进入可玩年级。无上一届数据时才用约理科一本450、文科一本60/二本250的兜底，不是官方精确名额。`, date);
  return state;
}

export function getCohort(state, entryYear) {
  return state.cohorts[entryYear];
}

export function playerStudents(state) {
  return snapshotPlayerClass(state);
}

/** 0 尚未分班，1 第一次分班后，2 第二次分班后。只看玩家任教届。 */
export function cohortPlacementStage(state) {
  const year = state.player?.cohortYear;
  const c = state.cohorts?.[year];
  if (!c) return 0;
  if (c.placed2 || state.flags?.[`place2-${year}`]) return 2;
  if (c.trackSplit || c.placed1 || state.flags?.[`place1-${year}`]) return 1;
  return 0;
}

/** 座位表提示。未分班时为空；分班后必含「这是分班后的新座次」。 */
export function placementSeatNotice(state) {
  const stage = cohortPlacementStage(state);
  if (stage === 2) return "这是分班后的新座次。座号已按高一下学期第二次分班后的新编制重排。";
  if (stage === 1) return "这是分班后的新座次。座号已按高一上学期第一次分班后的新编制重排。";
  return "";
}

export function addLog(state, text, date = state.date) {
  state.log.unshift({ date, text });
  if (state.log.length > 400) state.log.length = 400;
}

function compactReport(report, entryYear) {
  const rows = report.rows.map((r) => ({
    studentId: r.studentId, name: r.name, classNo: r.classNo, tier: r.tier,
    track: r.track, trackPref: r.trackPref, repeat: !!r.repeat, total: r.total, maxTotal: r.maxTotal,
    scale: r.scale, subjects: r.subjects, line: r.line, rank: r.rank,
    ...Object.fromEntries((r.subjects || []).map((id) => [id, r[id]])),
    huikaoPass: r.huikaoPass, huikaoSubjects: r.huikaoSubjects,
    cityRank: r.cityRank, countyRank: r.countyRank, provinceRank: r.provinceRank,
    cityN: r.cityN, countyN: r.countyN, provinceN: r.provinceN, jointLine: r.jointLine,
  }));
  const cut = { ...report.cutoffs, ranked: undefined };
  return {
    examId: report.examId, examName: report.examName, examKind: report.examKind,
    date: report.date, difficulty: report.difficulty, dispersion: report.dispersion,
    scale: report.scale, grade: report.grade, split: report.split, entryYear,
    rows, classes: report.classes, subjectIds: report.subjectIds, toppers: report.toppers,
    cutoffs: cut, quota: report.quota || null, huikao: report.huikao || null, sourceNote: report.sourceNote || null, joint: report.joint || null,
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
  const keepKinds = new Set(["gaokao", "final", "midterm", "province", "city", "huikao", "mock1", "mock2", "mock3"]);
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
      schoolQuota: currentSchoolQuota(state),
    });
    storeExam(state, entryYear, report);
    reports.push({ entryYear, grade, report });
    if (ev.examKind === "gaokao") {
      const year = ev.year || Number(String(ev.date).slice(0, 4));
      const counts = provincialPassCounts(c.students, report.scoreMap, year);
      counts.entryYear = entryYear;
      counts.source = `${entryYear}级${year}年高考本校省控实际上线人数（应届，不含复读）。`;
      recordPriorGaokaoCounts(state, counts);
    }
    if (entryYear === state.player.cohortYear) {
      const cls = report.classes.find((x) => x.classNo === state.player.classNo);
      if (cls) addLog(state, examResultLogText(report, { classSummary: cls, classNo: state.player.classNo, schoolQuota: report.quota || currentSchoolQuota(state) }));
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
    staying.splice(0, staying.length, ...reseatClasses(staying, { seed: state.seed + newEntry, tag: "repeat-seats" }));
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
    const repeatNos = [...new Set(state.pendingRepeat.map((x) => x.classNo))];
    sen.students = sen.students.concat(state.pendingRepeat);
    sen.students = reseatClasses(sen.students, { seed: state.seed + newEntry, tag: "repeat-merge-seats", classNos: repeatNos });
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

export function doParentsMeeting(state, ev) {
  const r = openParentsMeetingCore(state, ev);
  if (r.ok && r.text && !r.already) addLog(state, r.text);
  state.flags[`parents-${ev.id}`] = true;
  return r;
}

export function meetParent(state, studentId) {
  const cls = snapshotPlayerClass(state);
  const s = cls.find((x) => x.id === studentId) || null;
  const r = meetParentCore(state, s);
  if (r.ok) addLog(state, r.text);
  return r;
}

export function applyEvent(state, ev) {
  if (ev.kind === "exam") return { type: "exam", reports: runScheduledExam(state, ev) };
  if (ev.kind === "placement1") return { type: "placement1", ...doFirstPlacement(state, ev.grades ? schoolYearFromDate(ev.date) : state.player.cohortYear) };
  if (ev.kind === "placement2") return { type: "placement2", ...doSecondPlacement(state, ev.grades ? schoolYearFromDate(ev.date) : state.player.cohortYear) };
  if (ev.kind === "admission") return { type: "admission", ...doAdmission(state, ev) };
  if (ev.kind === "promote") return { type: "promote", ...doPromote(state, ev) };
  if (ev.kind === "parents") return { type: "parents", ...doParentsMeeting(state, ev) };
  return { type: ev.kind, ok: true };
}

/** 一键跳到下一个考试/分班/录取/升学事件，并结算该事件。 */
export function skipToNextStage(state) {
  const ev = nextExamEvent(state.date, SCHOOL_CALENDAR);
  if (!ev) return { ok: false, reason: "校历已无后续事件" };
  state.date = ev.date;
  state.periodId = startPeriodId(ev.date, state);
  state.talksToday = 0;
  state.reviewsToday = 0;
  state.talksThisPeriod = 0;
  state.tutorAnswers = 0;
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
  const major = evs.find((e) => ["exam", "placement1", "placement2", "admission", "promote", "parents"].includes(e.kind));
  if (major) {
    state.flags[`done-${major.id}`] = true;
    return applyEvent(state, major);
  }
  state.date = addDays(state.date, 1);
  state.periodId = startPeriodId(state.date, state);
  state.talksToday = 0;
  state.reviewsToday = 0;
  const updates = collectHomeworkFollowups(state, "day");
  const incoming = SCHOOL_CALENDAR.filter((e) => e.date === state.date);
  const slot = currentSlot(state);
  return { type: "day", date: state.date, events: incoming, updates, slot, text: `到了${formatDateCn(state.date)}${slot ? " " + formatSlotLabel(slot) : ""}。` };
}

function resetDailyCounters(state) {
  state.talksToday = 0;
  state.reviewsToday = 0;
  resetPeriodCounters(state);
}

function resetPeriodCounters(state) {
  state.talksThisPeriod = 0;
  state.tutorAnswers = 0;
  state.tutorSlotKey = `${state.date}|${state.periodId}`;
}

/** 按课表走到下一节（周日直接跨到周一早读）。考试/分班日若尚未结算，先结算再停在当天。 */
export function advancePeriod(state) {
  const pending = pendingMajorEvent(state);
  if (pending) {
    state.flags[`done-${pending.id}`] = true;
    const result = applyEvent(state, pending);
    return { type: pending.kind, settled: true, ok: true, event: pending, result, text: `今日${pending.name}，先在这一节把这场结算了。` };
  }
  const n = nextPeriodAfter(state);
  if (!n) return { type: "period", ok: false, reason: "课表已经走到尽头" };
  const rolledDay = n.rolledDay || n.date !== state.date;
  state.date = n.date;
  state.periodId = n.slot.id;
  if (rolledDay) resetDailyCounters(state);
  else resetPeriodCounters(state);
  const updates = collectHomeworkFollowups(state, "period");
  const slot = currentSlot(state);
  const follow = updates.length
    ? `作业跟进：${updates.slice(0, 3).map((u) => u.name + u.change).join("、")}${updates.length > 3 ? "等" : ""}。`
    : "";
  const text = rolledDay
    ? `到了${formatDateCn(state.date)} ${formatSlotLabel(slot)}。${follow}`
    : `到了${formatSlotLabel(slot)}。${follow}`;
  return { type: "period", ok: true, rolledDay, slot, updates, text, events: SCHOOL_CALENDAR.filter((e) => e.date === state.date) };
}

function jumpToNextMathSameDay(state) {
  const cur = currentSlot(state);
  if (cur?.isMath && state.taughtPeriodKey !== `${state.date}|${cur.id}`) return { ok: true, jumped: false };
  const later = upcomingMath(state, { sameDay: true, skipTaught: true });
  if (!later) {
    const nxt = upcomingMath(state, { sameDay: false, skipTaught: true });
    const hint = nxt ? `下一节数学在${nxt.date} ${nxt.slot.name}${nxt.slot.clock ? " " + nxt.slot.clock : ""}。请用「下一节」或「下一天」走到那时再进教室。` : "最近没有可上的数学课。";
    const major = majorEventOn(state.date);
    if (cur?.id === "rest" || cur?.kind === "rest") return { ok: false, reason: `今日休息。${hint}` };
    if (major) return { ok: false, reason: `今日${major.name}，停课。${hint}` };
    return { ok: false, reason: `今天的数学课已经上完。${hint}` };
  }
  let guard = 0;
  while (state.periodId !== later.slot.id && guard++ < 16) {
    const r = advancePeriod(state);
    if (r.settled) return { ok: false, reason: r.text };
    if (!r.ok || r.rolledDay) break;
  }
  const cur2 = currentSlot(state);
  if (cur2?.isMath && state.taughtPeriodKey !== `${state.date}|${cur2.id}`) return { ok: true, jumped: true };
  return { ok: false, reason: "没有排到本节数学课。" };
}

export function prepareLesson(state, opts = {}) {
  const grade = gradeOf(state.player.cohortYear, state.date);
  const r = prepareLessonCore(state, opts, grade);
  addLog(state, r.text);
  return r;
}

export function teach(state, style = "精讲例题", callId = null) {
  const pending = pendingMajorEvent(state);
  if (pending) return { ok: false, reason: `今日${pending.name}，停课，请先用「下一天」或「下一节」结算。` };
  const major = majorEventOn(state.date);
  if (major) return { ok: false, reason: `今日${major.name}，全天停课，改在办公室处理作业，或用「下一节」走到下一天。` };
  const land = jumpToNextMathSameDay(state);
  if (!land.ok) return { ok: false, reason: land.reason, text: land.reason };
  const grade = gradeOf(state.player.cohortYear, state.date);
  const cls = snapshotPlayerClass(state);
  const lastExam = listExamReports(state, { entryYear: state.player.cohortYear })[0] || null;
  const r = teachLesson(state, cls, { style, callId, grade, lastExam });
  r.periodId = state.periodId;
  r.slot = currentSlot(state);
  state.taughtPeriodKey = `${state.date}|${state.periodId}`;
  const after = nextPeriodAfter(state);
  if (after && after.date === state.date) {
    const moved = advancePeriod(state);
    if (moved.ok && !moved.settled) r.text = `${r.text} 下课，现在是${formatSlotLabel(moved.slot)}。`;
  }
  addLog(state, r.text);
  return r;
}

export function urgeHomework(state, studentId) {
  const c = state.cohorts[state.player.cohortYear];
  const s = c?.students.find((x) => x.id === studentId);
  const r = urgeHomeworkCore(state, s);
  if (r.ok) addLog(state, r.text);
  return r;
}

export function checkCorrection(state, studentId) {
  const c = state.cohorts[state.player.cohortYear];
  const s = c?.students.find((x) => x.id === studentId);
  const r = checkCorrectionCore(state, s);
  if (r.ok) addLog(state, r.text);
  return r;
}

export function officeMarking(state) {
  const cls = snapshotPlayerClass(state);
  const r = officeMarkingCore(state, cls);
  if (r.ok) addLog(state, r.text);
  return r;
}

export function consultHomeroom(state, studentId = null) {
  const cls = snapshotPlayerClass(state);
  const s = studentId ? cls.find((x) => x.id === studentId) || state.cohorts[state.player.cohortYear]?.students.find((x) => x.id === studentId) : null;
  const r = consultHomeroomCore(state, cls, s || null);
  if (r.ok) addLog(state, r.text);
  return r;
}

export function consultMentor(state) {
  const grade = gradeOf(state.player.cohortYear, state.date);
  const r = consultMentorCore(state, grade);
  if (r.ok) addLog(state, r.text);
  return r;
}

export function reviewHomework(state, studentId) {
  const c = state.cohorts[state.player.cohortYear];
  const s = c?.students.find((x) => x.id === studentId);
  const r = reviewHomeworkCore(state, s);
  if (r.ok) addLog(state, r.text);
  return r;
}

export { topicsForGrade, LESSON_STYLES, suggestedTopic, topicProgress, homeworkWatchlist, studentTeachingContext, daySchedule, currentSlot, formatSlotLabel, upcomingMath, upcomingTutoring, majorEventOn, pendingMajorEvent, isTutoringSlot, raisedHands, seatLabel, seatOf, compileEveningRoll, studentRecentStatus, rollCallStatusLine, isParentsMeetingOpen, upcomingParentsMeeting, PARENT_TALK_CAP, PARENTS_SOURCE_NOTE };

function latestMathExam(state, studentId) {
  const reports = listExamReports(state, { entryYear: state.player.cohortYear });
  for (const r of reports) {
    if (r.pruned) continue;
    const row = r.scoreMap?.[studentId] || (r.rows || []).find((x) => x.studentId === studentId);
    if (row && row.math != null) {
      return { examName: r.examName, date: r.date, math: row.math, total: row.total, rank: row.rank, line: row.line };
    }
  }
  return null;
}

function talkText(topic, s, ctx, exam) {
  const n = s.name;
  if (topic === "询问学习") {
    const bits = [];
    if (ctx?.hw) {
      if (ctx.hw.status === "缺交") bits.push(`「${ctx.topic}」这趟作业还没交`);
      else if (ctx.hw.quality === "错题较多") bits.push(`「${ctx.topic}」作业错题还比较多`);
      else if (ctx.hw.quality === "未订正") bits.push(`「${ctx.topic}」错题还没订正好`);
      else if (ctx.topic) bits.push(`对了一下「${ctx.topic}」作业`);
    } else if (ctx?.topic) bits.push(`问起最近「${ctx.topic}」的掌握`);
    if (ctx?.quiz) bits.push(`上次小测 ${ctx.quiz.score} 分`);
    if (exam) bits.push(`最近「${exam.examName}」数学 ${exam.math} 分`);
    if (!bits.length) return `你和${n}对了一下近期作业，记下了薄弱科目。`;
    return `你和${n}${bits[0].startsWith("对了") ? bits[0] : "谈了" + bits[0]}` + (bits.length > 1 ? `，也提到${bits.slice(1).join("，")}。` : "，并嘱咐把漏洞补上。");
  }
  if (topic === "鼓励") {
    if (exam?.line === "一本") return `你鼓励${n}稳住「${exam.examName}」已经摸到的一本线，注意方法，别只盯着一次分数。`;
    if (ctx?.flag === "表现突出") return `你鼓励${n}把这堂课的状态保持下去，注意方法，别只盯着一次分数。`;
    if (ctx?.hw?.quality === "错题较多" || ctx?.quiz) return `你鼓励${n}再坚持一阵，作业和小测里的漏洞可以慢慢补，别只盯着一次分数。`;
    return `你鼓励${n}再坚持一阵，注意方法，别只盯着一次分数。`;
  }
  if (topic === "关注状态") {
    if (ctx?.flag === "走神") return `你提起${n}这堂课有些走神，关心最近休息和心情，提醒劳逸结合。`;
    if ((s.energy ?? 70) < 50 || (s.stress ?? 40) > 70) return `你看${n}最近精力或压力不太对，关心休息和心情，提醒劳逸结合。`;
    return `你关心${n}最近的休息和心情，提醒劳逸结合。`;
  }
  if (ctx?.topic) return `你和${n}谈了家里和将来的打算，也顺口问起「${ctx.topic}」跟得是否吃力，师生关系近了一些。`;
  return `你和${n}谈了家里和将来的打算，师生关系近了一些。`;
}

export function periodTalkScene(state) {
  const slot = currentSlot(state);
  if (!slot) return { kind: "day", cap: 5, label: "" };
  if (slot.isExamDay) return { kind: "exam", cap: 2, label: `今日${slot.eventName || "停课"}` };
  if (slot.id === "rest" || slot.kind === "rest") return { kind: "rest", cap: 3, label: "周日休息" };
  if (slot.kind === "break" || slot.id === "noon") return { kind: "break", cap: 3, label: slot.name };
  if (isTutoringSlot(slot)) return { kind: "tutoring", cap: 4, label: slot.subject || "晚自习" };
  if (slot.isMath) return { kind: "math", cap: 2, label: "数学课" };
  if (slot.id === "morning-read") return { kind: "read", cap: 2, label: slot.subject || "早读" };
  return { kind: "otherclass", cap: 2, label: `${slot.name}「${slot.subject || ""}」` };
}

function talkSceneStamp(state, student) {
  const slot = currentSlot(state);
  const seat = seatLabel(student);
  const scene = periodTalkScene(state);
  if (scene.kind === "tutoring") return `${scene.label}，${seat}。`;
  if (scene.kind === "math") return `数学课，${seat}。`;
  if (scene.kind === "exam") return `${scene.label}。`;
  if (scene.kind === "rest") return `周日休息。`;
  if (scene.kind === "break") return `${scene.label}，${seat}。`;
  if (scene.kind === "read") return `${scene.label}，${seat}。`;
  if (scene.kind === "otherclass") return `${scene.label}，${seat}。`;
  return seat ? `${seat}。` : "";
}

export function talkTo(state, studentId, topic = "鼓励") {
  const c = state.cohorts[state.player.cohortYear];
  const s = c.students.find((x) => x.id === studentId);
  if (!s) return { ok: false, reason: "找不到这名学生" };
  const scene = periodTalkScene(state);
  if (state.talksToday >= 5) return { ok: false, reason: "今天谈话已经不少，改日再谈。" };
  if ((state.talksThisPeriod || 0) >= scene.cap) {
    return { ok: false, reason: `这个时段谈话已经不少（最多 ${scene.cap} 人次），下一节再谈。` };
  }
  const table = {
    鼓励: { relation: 2, mood: 4, stress: -2 },
    询问学习: { relation: 1, mood: 1, stress: 0 },
    关注状态: { relation: 2, mood: 2, stress: -4 },
    谈心: { relation: 3, mood: 3, stress: -3 },
  };
  const a = table[topic] || table.鼓励;
  s.relation = clamp((s.relation || 0) + a.relation, 0, 100);
  s.mood = clamp((s.mood || 60) + a.mood, 0, 100);
  s.stress = clamp((s.stress || 40) + a.stress, 0, 100);
  const ctx = studentTeachingContext(s, state);
  const exam = latestMathExam(state, s.id);
  const body = talkText(topic, s, ctx, exam);
  const stamp = talkSceneStamp(state, s);
  const text = stamp ? `${stamp}${body}` : body;
  s.talks = [...(s.talks || []), { date: state.date, topic, text, periodId: state.periodId, seat: seatLabel(s) }];
  state.talksToday += 1;
  state.talksThisPeriod = (state.talksThisPeriod || 0) + 1;
  addLog(state, text);
  return { ok: true, student: s, text, scene, seat: seatLabel(s) };
}

export function tutorEvening(state, mode = "巡视", studentId = null) {
  const slot = currentSlot(state);
  const pending = pendingMajorEvent(state);
  if (pending) return { ok: false, reason: `今日${pending.name}，停课，晚自习和答疑也先不上。` };
  if (slot?.isExamDay) return { ok: false, reason: `今日${slot.eventName}，全天停课，没有晚自习答疑。` };
  if (!isTutoringSlot(slot)) {
    const nxt = upcomingTutoring(state);
    const hint = nxt
      ? `下一节可答疑的是${nxt.sameDay ? "" : nxt.date + " "}${formatSlotLabel(nxt.slot)}。请用「下一节」走到那时。`
      : "这几天没有排数学晚自习或数学答疑。";
    return { ok: false, reason: `现在是${slot ? formatSlotLabel(slot) : "未排课"}，还不是数学晚自习或答疑。${hint}` };
  }
  const cls = snapshotPlayerClass(state);
  const r = tutorEveningCore(state, cls, { mode, studentId, slot });
  if (r.ok) addLog(state, r.text);
  return r;
}

export function homeroomEveningRoll(state) {
  const slot = currentSlot(state);
  const pending = pendingMajorEvent(state);
  if (pending) return { ok: false, reason: `今日${pending.name}，停课，晚自习点名也先不做。` };
  if (slot?.isExamDay) return { ok: false, reason: `今日${slot.eventName}，全天停课，没有晚自习点名。` };
  if (!isTutoringSlot(slot)) {
    const nxt = upcomingTutoring(state);
    const hint = nxt
      ? `下一节可点名的是${nxt.sameDay ? "" : nxt.date + " "}${formatSlotLabel(nxt.slot)}。请用「下一节」走到那时。`
      : "这几天没有排数学晚自习或数学答疑。";
    return { ok: false, reason: `现在是${slot ? formatSlotLabel(slot) : "未排课"}，还不是晚自习。${hint}` };
  }
  const cls = snapshotPlayerClass(state);
  const r = homeroomEveningRollCore(state, cls);
  if (r.ok) addLog(state, r.text);
  return r;
}

export function setPlacementPref(state, studentId, track) {
  const c = state.cohorts[state.player.cohortYear];
  const s = c.students.find((x) => x.id === studentId);
  if (!s) return { ok: false };
  s.trackPref = track === "wen" ? "wen" : "li";
  return { ok: true };
}

export { formatDateCn, SCHOOL_CALENDAR, gradeOf, schoolYearFromDate };
