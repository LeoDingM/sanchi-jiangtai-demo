/** 事件驱动校历：2017 年起可多年循环，考试难度按场次与年份变化。 */
import { hash01, clamp } from "./prng.js?v=t68u1";
import { WEEKDAY_NAMES, PERIODS } from "./config.js?v=t68u1";

const WEEKDAY = { 0: "日", 1: "一", 2: "二", 3: "三", 4: "四", 5: "五", 6: "六" };

export function pad2(n) { return String(n).padStart(2, "0"); }

export function ymd(y, m, d) { return `${y}-${pad2(m)}-${pad2(d)}`; }

export function parseYmd(s) {
  const [y, m, d] = s.split("-").map(Number);
  return { y, m, d };
}

export function addDays(s, n) {
  const { y, m, d } = parseYmd(s);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return ymd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function weekday(s) {
  const { y, m, d } = parseYmd(s);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function weekdayName(s) {
  return WEEKDAY[weekday(s)] || WEEKDAY_NAMES[weekday(s)];
}

/** 从某日起（含当天）第一个指定星期几。dow：0 日 … 6 六。 */
export function firstWeekdayOnOrAfter(date, dow) {
  let d = date;
  for (let i = 0; i < 7; i++) {
    if (weekday(d) === dow) return d;
    d = addDays(d, 1);
  }
  return d;
}

export const PARENTS_SOURCE_NOTE = "校内日期安排，按普通高中在学期开学后或期中后召开家长会的惯例排入校历，不是某所实校或教育行政部门公告的逐年日期。";

export const ACTIVITY_SOURCE_NOTE = "校内日期安排，按普通高中在第一次月考后举行秋季运动会、在第二次月考后举行迎新年（元旦）活动的惯例排入宁川中学校历，不是某所实校或教育行政部门公告的逐年日期。";

export const STAGE_KINDS = ["exam", "placement1", "placement2", "admission", "promote", "parents", "activity"];

export function cmpDate(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

export function formatDateCn(s) {
  const { y, m, d } = parseYmd(s);
  return `${y}年${m}月${d}日 星期${weekdayName(s)}`;
}

export function schoolYearOf(date) {
  const { y, m } = parseYmd(date);
  return m >= 8 ? y : y - 1;
}

/** 2–7 月为下学期，8–1 月为上学期。 */
export function termOf(date) {
  const { m } = parseYmd(date);
  return m >= 2 && m <= 7 ? "下" : "上";
}

const GRADE_CN = ["一", "二", "三"];

/** grade 为相对入学年的年级：1 高一 … 3 高三；超出则说明尚未入学或已毕业。 */
export function formatGradeTerm(grade, date) {
  const g = Number(grade);
  if (g < 1) return "尚未入学";
  if (g > 3) return "已毕业";
  return `高${GRADE_CN[g - 1]}${termOf(date)}学期`;
}

export function formatCohortGrade(entryYear, date) {
  const sy = schoolYearOf(date);
  const grade = sy - Number(entryYear) + 1;
  return { grade, term: formatGradeTerm(grade, date), schoolYear: sy };
}

/** 理科一本线相对 2020 年 535 的比例，用于该学年试卷总体难度。 */
export const YEAR_LINE_FACTOR = {
  2016: 529 / 535,
  2017: 503 / 535,
  2018: 527 / 535,
  2019: 522 / 535,
  2020: 1,
  2021: 519 / 535,
  2022: 509 / 535,
  2023: 518 / 535,
};

export function yearFactor(year) {
  if (YEAR_LINE_FACTOR[year] != null) return YEAR_LINE_FACTOR[year];
  // 未知年份：在 0.95–1.03 间做确定性轻微波动，不编造精确省控线
  return clamp(0.96 + hash01("year-factor", year) * 0.06, 0.93, 1.05);
}

/**
 * 场次基础难度（1=对准 2020 高考量级）。小于 1 题更难、原始分更低。
 * 再乘学年因子，并加场次抖动，避免每次考试分数线接近。
 */
const KIND_DIFF = {
  monthly: 1.0,
  midterm: 0.99,
  final: 0.97,
  city: 0.995,
  province: 0.98,
  mock1: 0.99,
  mock2: 0.96,
  mock3: 1.01,
  gaokao: 1.0,
  quiz: 1.02,
  huikao: 1.0,
};

const KIND_DISP = {
  monthly: 1.0,
  midterm: 1.02,
  final: 1.04,
  city: 1.01,
  province: 1.06,
  mock1: 1.03,
  mock2: 1.08,
  mock3: 0.98,
  gaokao: 1.0,
  quiz: 0.95,
  huikao: 1.0,
};

export function examParams(exam) {
  const kind = exam.examKind || exam.kind;
  const base = KIND_DIFF[kind] ?? 1;
  const yearF = yearFactor(exam.year || parseYmd(exam.date).y);
  const isGaokao = kind === "gaokao";
  const jitter = isGaokao
    ? 0.995 + hash01("exam-diff", exam.id) * 0.01
    : 0.95 + hash01("exam-diff", exam.id) * 0.12; // 非高考场次 0.95–1.07
  const difficulty = clamp(base * yearF * jitter, 0.88, 1.12);
  // 高考离散只做很小抖动，避免某年偶发把 600+/660+ 拉成另一量级；非高考场次仍拉开分数线。
  const dispJ = isGaokao
    ? 0.99 + hash01("exam-disp", exam.id) * 0.02 // 0.99–1.01
    : 0.9 + hash01("exam-disp", exam.id) * 0.28; // 0.90–1.18
  const dispersion = isGaokao
    ? clamp((KIND_DISP[kind] ?? 1) * dispJ, 0.98, 1.02)
    : clamp((KIND_DISP[kind] ?? 1) * dispJ, 0.94, 1.12);
  return { difficulty, dispersion };
}

function ev(partial) {
  return { grades: [1, 2, 3], ...partial };
}


const BLOCKING_KINDS = new Set(["exam", "placement1", "placement2", "admission", "promote", "parents", "opening", "school", "activity"]);

/** 已有考试/分班/家长会等占用的日期（考试按 days 占用后续几天）。 */
export function occupiedEventDates(events) {
  const set = new Set();
  for (const e of events) {
    if (!BLOCKING_KINDS.has(e.kind)) continue;
    const days = Number(e.days) > 0 ? Number(e.days) : 1;
    for (let i = 0; i < days; i++) set.add(addDays(e.date, i));
  }
  return set;
}

/** 第一次月考之后、期中之前的连续两天。优先 10 月 26–27 日；撞日则后移，不改考试日期。 */
export function pickSportsMeetDates(sy, occupied = new Set()) {
  const windowStart = addDays(ymd(sy, 10, 16), 2);
  const windowEnd = addDays(ymd(sy, 11, 15), -1);
  const pref = [ymd(sy, 10, 26), ymd(sy, 10, 27)];
  const free = (d) => d >= windowStart && d <= windowEnd && !occupied.has(d);
  if (free(pref[0]) && free(pref[1])) return pref;
  for (let d = windowStart; cmpDate(d, windowEnd) <= 0; d = addDays(d, 1)) {
    const d2 = addDays(d, 1);
    if (cmpDate(d2, windowEnd) > 0) break;
    if (free(d) && free(d2)) return [d, d2];
  }
  return pref;
}

/** 第二次月考之后、期末之前的一天。优先元旦（若为工作日），否则新年前最近的工作日。 */
export function pickNewYearDate(sy, occupied = new Set()) {
  const windowStart = addDays(ymd(sy, 12, 14), 2);
  const windowEnd = addDays(ymd(sy + 1, 1, 16), -1);
  const tryDate = (d) => d >= windowStart && d <= windowEnd && !occupied.has(d);
  const isWeekday = (d) => { const w = weekday(d); return w >= 1 && w <= 5; };
  const jan1 = ymd(sy + 1, 1, 1);
  const dec31 = ymd(sy, 12, 31);
  if (tryDate(jan1) && isWeekday(jan1)) return jan1;
  if (tryDate(dec31) && isWeekday(dec31)) return dec31;
  if (tryDate(jan1)) return jan1;
  if (tryDate(dec31)) return dec31;
  for (let i = 0; i <= 20; i++) {
    for (const d of [addDays(jan1, -i), addDays(jan1, i)]) {
      if (tryDate(d) && isWeekday(d)) return d;
    }
  }
  for (let d = windowStart; cmpDate(d, windowEnd) <= 0; d = addDays(d, 1)) {
    if (tryDate(d)) return d;
  }
  return jan1;
}

/** 生成从 fromYear 年秋季到 toYear 年夏季（不含）的校历事件。 */
export function buildCalendar(fromYear = 2017, toYear = 2030) {
  const events = [];
  for (let sy = fromYear; sy < toYear; sy++) {
    const y2 = sy + 1;
    const gaokaoCohort = sy - 2; // 2017学年高考的是 2015 级
    events.push(ev({ id: `open-${sy}-fall`, date: ymd(sy, 9, 1), name: `${sy}学年开学`, kind: "opening", grades: [1, 2, 3] }));
    if (sy === fromYear) {
      events.push(ev({ id: `meet-${sy}`, date: ymd(sy, 9, 4), name: "正式上课", kind: "school" }));
    }
    events.push(ev({ id: `teacher-day-${sy}`, date: ymd(sy, 9, 10), name: "教师节", kind: "special" }));

    const examsFall = [
      { mon: 10, day: 16, examKind: "monthly", name: "第一次月考" },
      { mon: 11, day: 15, examKind: "midterm", name: "期中考试" },
      { mon: 12, day: 14, examKind: "monthly", name: "第二次月考" },
      { mon: 1, day: 16, examKind: "final", name: "期末考试", year: y2 },
    ];
    for (const e of examsFall) {
      const year = e.year || sy;
      const date = ymd(year, e.mon, e.day);
      events.push(ev({
        id: `exam-${sy}-${e.name}`,
        date, name: e.name, kind: "exam", examKind: e.examKind, year: sy,
        days: e.examKind === "final" || e.examKind === "midterm" ? 3 : 2,
      }));
    }
    events.push(ev({
      id: `place1-${sy}`,
      date: ymd(y2, 1, 20),
      name: "第一次分班（文理分科+梯队）",
      kind: "placement1",
      grades: [1],
    }));

    events.push(ev({ id: `open-${sy}-spring`, date: ymd(y2, 2, 22), name: "下学期开学", kind: "opening" }));
    const fallParents = firstWeekdayOnOrAfter(addDays(ymd(sy, 11, 15), 7), 6);
    events.push(ev({
      id: `parents-fall-${sy}`,
      date: fallParents,
      name: "秋季期中后家长会",
      kind: "parents",
      grades: [1, 2, 3],
      sourceNote: PARENTS_SOURCE_NOTE,
    }));
    const springParents = firstWeekdayOnOrAfter(addDays(ymd(y2, 2, 22), 14), 6);
    events.push(ev({
      id: `parents-spring-${sy}`,
      date: springParents,
      name: "春季学期家长会",
      kind: "parents",
      grades: [1, 2, 3],
      sourceNote: PARENTS_SOURCE_NOTE,
    }));
    events.push(ev({
      id: `exam-${sy}-spring-monthly1`, date: ymd(y2, 3, 20), name: "下学期月考", kind: "exam", examKind: "monthly", year: sy,
    }));
    events.push(ev({
      id: `exam-${sy}-city`, date: ymd(y2, 4, 18), name: "市联考", kind: "exam", examKind: "city", year: sy, grades: [2, 3],
    }));
    events.push(ev({
      id: `exam-${sy}-spring-mid`, date: ymd(y2, 4, 24), name: "下学期期中", kind: "exam", examKind: "midterm", year: sy, grades: [1],
    }));
    events.push(ev({
      id: `exam-${sy}-mock1`, date: ymd(y2, 5, 8), name: "高三一模", kind: "exam", examKind: "mock1", year: sy, grades: [3],
    }));
    events.push(ev({
      id: `exam-${sy}-province`, date: ymd(y2, 5, 20), name: "省联考", kind: "exam", examKind: "province", year: sy, grades: [2, 3],
    }));
    events.push(ev({
      id: `exam-${sy}-mock2`, date: ymd(y2, 5, 26), name: "高三二模", kind: "exam", examKind: "mock2", year: sy, grades: [3],
    }));
    events.push(ev({
      id: `exam-${sy}-mock3`, date: ymd(y2, 6, 1), name: "高三三模", kind: "exam", examKind: "mock3", year: sy, grades: [3],
    }));
    events.push(ev({
      id: `gaokao-${y2}`, date: ymd(y2, 6, 7), name: `${y2}年普通高考`, kind: "exam", examKind: "gaokao",
      year: y2, grades: [3], cohortYear: gaokaoCohort, days: 3,
    }));
    events.push(ev({
      id: `exam-${sy}-huikao`, date: ymd(y2, 6, 18), name: "高二年级学业水平考试（会考）",
      kind: "exam", examKind: "huikao", year: sy, grades: [2],
      sourceNote: "校历示意日期，未按某年省教育考试院公告逐条核对。成绩按校内学业合格记载，不使用未收录的省会考合格线。",
    }));
    events.push(ev({
      id: `exam-${sy}-summer-final`, date: ymd(y2, 6, 25), name: "下学期期末", kind: "exam", examKind: "final", year: sy, grades: [1, 2],
    }));
    events.push(ev({
      id: `place2-${sy}`, date: ymd(y2, 7, 2), name: "第二次分班（同层均衡重组）", kind: "placement2", grades: [1],
    }));
    events.push(ev({
      id: `admit-${y2}`, date: ymd(y2, 7, 25), name: `${y2}年高考录取公布`, kind: "admission", cohortYear: gaokaoCohort, grades: [3],
    }));
    events.push(ev({
      id: `promote-${y2}`, date: ymd(y2, 8, 20), name: "毕业离校、升年级、新高一入学", kind: "promote",
      newEntryYear: y2, graduatedCohort: gaokaoCohort,
    }));

    const occupied = occupiedEventDates(events);
    const [sp1, sp2] = pickSportsMeetDates(sy, occupied);
    events.push(ev({
      id: `sports-${sy}-d1`,
      date: sp1,
      name: "秋季运动会",
      kind: "activity",
      activityKind: "sports",
      off: "full",
      dayIndex: 1,
      meetId: `sports-${sy}`,
      sourceNote: ACTIVITY_SOURCE_NOTE,
      grades: [1, 2, 3],
    }));
    events.push(ev({
      id: `sports-${sy}-d2`,
      date: sp2,
      name: "秋季运动会（第二天）",
      kind: "activity",
      activityKind: "sports",
      off: "full",
      dayIndex: 2,
      meetId: `sports-${sy}`,
      sourceNote: ACTIVITY_SOURCE_NOTE,
      grades: [1, 2, 3],
    }));
    occupied.add(sp1);
    occupied.add(sp2);
    const newyearDate = pickNewYearDate(sy, occupied);
    events.push(ev({
      id: `newyear-${sy}`,
      date: newyearDate,
      name: "迎新年活动",
      kind: "activity",
      activityKind: "newyear",
      off: "afternoon",
      sourceNote: ACTIVITY_SOURCE_NOTE,
      grades: [1, 2, 3],
    }));
  }
  events.sort((a, b) => cmpDate(a.date, b.date) || a.id.localeCompare(b.id));
  return events.map((e) => {
    if (e.kind === "exam") {
      const p = examParams(e);
      return { ...e, difficulty: p.difficulty, dispersion: p.dispersion };
    }
    return e;
  });
}

export const SCHOOL_CALENDAR = buildCalendar(2015, 2030);

export function eventsOn(date, calendar = SCHOOL_CALENDAR) {
  return calendar.filter((e) => e.date === date);
}

export function nextEvent(date, calendar = SCHOOL_CALENDAR) {
  return calendar.find((e) => e.date > date) || null;
}

export function nextExamEvent(date, calendar = SCHOOL_CALENDAR) {
  return calendar.find((e) => e.date > date && STAGE_KINDS.includes(e.kind)) || null;
}

export function eventById(id, calendar = SCHOOL_CALENDAR) {
  return calendar.find((e) => e.id === id) || null;
}

export { PERIODS };
