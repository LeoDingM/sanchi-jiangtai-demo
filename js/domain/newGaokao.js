/**
 * 江西新高考（3+1+2）制度与再选等级赋分。
 * 官方时间表：赣府发〔2021〕20 号，从 2021 年秋季入学的高一年级实施，2024 年首考。
 * 2021–2023 年高考仍是旧文理分科，不得提前改成 3+1+2。
 * 2016–2020 结构与省控锁定，本文件不改那些数字。
 */
import { hash01, rngFrom, gauss, clamp } from "./prng.js?v=t66u2";

/** 江西新高考首考年份（2021 级高一，2024 年高考）。 */
export const JIANGXI_NEW_GAOKAO_FIRST_YEAR = 2024;
/** 首届新高考学生入学年份。 */
export const JIANGXI_NEW_GAOKAO_FIRST_ENTRY = 2021;

export const NEW_GAOKAO_SOURCE = "《江西省深化普通高考综合改革实施方案》（赣府发〔2021〕20号，2021-09-14印发）。从2021年秋季入学的高一年级开始实施，2024年首次落地新高考。来源：江西省人民政府；江西省教育厅/教育考试院《江西省2024年普通高考综合改革百问百答》；新华网2021-09-16、中国教育在线、人民网江西频道转载。";

export const ASSIGN_SOURCE = "省教育厅《关于我省普通高中学业水平选择性考试成绩计入高校招生录取总成绩有关事项的通知》（赣教规字〔2021〕17号）。再选科目思想政治、地理、化学、生物学按有效人数从高到低划 A、B、C、D、E（15%、35%、35%、13%、2%），赋分区间分别为 100–86、85–71、70–56、55–41、40–30 分，按等比例公式转换并四舍五入取整；转换基数为实际参加该再选科目并取得有效成绩的人数。首选物理/历史和语数外用原始分。游戏内转换基数为模拟的全省有效成绩样本加本校选考学生，不是当年官方原始分表。";

export const REELECTIVE_IDS = ["politics", "geography", "chemistry", "biology"];
export const FIRST_SUBJECTS = { physics: { id: "physics", name: "物理" }, history: { id: "history", name: "历史" } };
export const SUBJECT_NAMES = {
  chinese: "语文", math: "数学", english: "英语",
  physics: "物理", history: "历史",
  politics: "思想政治", geography: "地理", chemistry: "化学", biology: "生物学",
};

/** 官方再选等级比例与赋分区间。 */
export const ASSIGN_BANDS = [
  { grade: "A", ratio: 0.15, t1: 100, t2: 86 },
  { grade: "B", ratio: 0.35, t1: 85, t2: 71 },
  { grade: "C", ratio: 0.35, t1: 70, t2: 56 },
  { grade: "D", ratio: 0.13, t1: 55, t2: 41 },
  { grade: "E", ratio: 0.02, t1: 40, t2: 30 },
];

export function isNewGaokaoYear(year) {
  return Number(year) >= JIANGXI_NEW_GAOKAO_FIRST_YEAR;
}

export function cohortIsNewGaokao(entryYear) {
  return Number(entryYear) >= JIANGXI_NEW_GAOKAO_FIRST_ENTRY;
}

export function gaokaoYearOfEntry(entryYear) {
  return Number(entryYear) + 3;
}

/** 选科之后的考试才用 3+1+2 科目；高一未选科仍用全科卷，且 2021–2023 届高考仍用旧文理。 */
export function usesNewGaokaoSubjects(entryYear, { trackSplit = false, gaokaoYear = null } = {}) {
  if (gaokaoYear != null && !isNewGaokaoYear(gaokaoYear) && Number(gaokaoYear) > 0) return false;
  return cohortIsNewGaokao(entryYear) && !!trackSplit;
}

export function examUsesNewGaokaoSubjects(cohort, exam, { grade, split } = {}) {
  const entry = cohort?.entryYear ?? cohort?.students?.[0]?.entryYear;
  const gy = exam?.examKind === "gaokao"
    ? (exam.year || Number(String(exam.date || "").slice(0, 4)))
    : gaokaoYearOfEntry(entry);
  const splitNow = split != null ? !!split : !!cohort?.trackSplit;
  if (exam?.examKind === "gaokao") return isNewGaokaoYear(gy);
  if (Number(grade) < 2 && !splitNow) return false;
  return usesNewGaokaoSubjects(entry, { trackSplit: splitNow, gaokaoYear: gy });
}

export function formatElectives(electives) {
  if (!electives?.first) return "";
  const first = SUBJECT_NAMES[electives.first] || electives.first;
  const seconds = (electives.seconds || []).map((id) => SUBJECT_NAMES[id] || id);
  return `首选${first}，再选${seconds.join("、")}`;
}

export function defaultElectivesForTrack(track) {
  if (track === "wen") return { first: "history", seconds: ["politics", "geography"] };
  return { first: "physics", seconds: ["chemistry", "biology"] };
}

/**
 * 按能力与意向在 12 种 3+1+2 组合里选定首选+再选，可复现。
 * 不强制全班物化生或史政地，但能力倾向仍影响组合。
 */
export function pickElectives(student, seed = 1) {
  const ab = student?.ability || {};
  const placed = student.track === "wen" || student.track === "li";
  const pref = student.trackPref || student.track;
  let first;
  if (placed) {
    first = student.track === "wen" ? "history" : "physics";
  } else {
    const phys = Number(ab.physics ?? 50);
    const hist = Number(ab.history ?? 50);
    const lean = phys - hist + (hash01(student.id, seed, "first-lean") - 0.5) * 6;
    if (pref === "wen" && lean < 4) first = "history";
    else if (pref === "li" && lean > -4) first = "physics";
    else first = lean >= 0 ? "physics" : "history";
  }

  const cands = REELECTIVE_IDS.map((id) => ({
    id,
    score: Number(ab[id] ?? 50) + (hash01(student.id, seed, "sec", id) - 0.5) * 8
      + (first === "physics" && (id === "chemistry" || id === "biology") ? 3 : 0)
      + (first === "history" && (id === "politics" || id === "geography") ? 3 : 0),
  })).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const seconds = cands.slice(0, 2).map((x) => x.id).sort();
  return { first, seconds };
}

export function ensureStudentElectives(student, seed = 1) {
  if (!student) return student;
  if (student.electives?.first && Array.isArray(student.electives.seconds) && student.electives.seconds.length === 2) {
    student.track = student.electives.first === "history" ? "wen" : "li";
    return student;
  }
  const electives = pickElectives(student, seed);
  student.electives = electives;
  student.track = electives.first === "history" ? "wen" : "li";
  student.trackPref = student.trackPref || student.track;
  return student;
}

export function ensureCohortElectives(students, seed = 1) {
  for (const s of students || []) ensureStudentElectives(s, seed);
  return students;
}

export function newGaokaoSubjects(electives) {
  const el = electives?.first ? electives : defaultElectivesForTrack("li");
  const first = el.first === "history" ? { id: "history", name: "历史", max: 100, role: "first" } : { id: "physics", name: "物理", max: 100, role: "first" };
  const seconds = (el.seconds || []).slice(0, 2).map((id) => ({
    id,
    name: SUBJECT_NAMES[id] || id,
    max: 100,
    role: "second",
  }));
  return [
    { id: "chinese", name: "语文", max: 150, role: "core" },
    { id: "math", name: "数学", max: 150, role: "core" },
    { id: "english", name: "英语", max: 150, role: "core" },
    first,
    ...seconds,
  ];
}

export function isReelectiveId(id) {
  return REELECTIVE_IDS.includes(id);
}

function bandCounts(n) {
  const raw = ASSIGN_BANDS.map((b) => b.ratio * n);
  const floors = raw.map((x) => Math.floor(x));
  let left = n - floors.reduce((s, v) => s + v, 0);
  const order = raw.map((x, i) => ({ i, frac: x - floors[i] })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  const counts = floors.slice();
  for (let k = 0; k < left; k++) counts[order[k % order.length].i] += 1;
  return counts;
}

/**
 * 按赣教规字〔2021〕17 号对一组有效原始分做等级赋分。
 * 返回与输入等长的 { raw, grade, assigned }。
 */
export function assignByOfficialRule(rawScores) {
  const n = rawScores.length;
  if (!n) return [];
  const ordered = rawScores.map((raw, i) => ({ i, raw: Number(raw) })).sort((a, b) => b.raw - a.raw || a.i - b.i);
  const counts = bandCounts(n);
  const gradeOf = new Array(n);
  let cursor = 0;
  for (let b = 0; b < ASSIGN_BANDS.length; b++) {
    const end = cursor + counts[b];
    for (let k = cursor; k < end && k < n; k++) gradeOf[ordered[k].i] = ASSIGN_BANDS[b].grade;
    cursor = end;
  }
  // 同一原始分不得跨等级，整档并入较高的一等。
  const byRaw = new Map();
  for (const row of ordered) {
    const g = gradeOf[row.i];
    if (!byRaw.has(row.raw)) byRaw.set(row.raw, new Set());
    byRaw.get(row.raw).add(g);
  }
  const gradeRank = Object.fromEntries(ASSIGN_BANDS.map((b, i) => [b.grade, i]));
  for (const row of ordered) {
    const set = byRaw.get(row.raw);
    if (set.size <= 1) continue;
    let best = "E";
    for (const g of set) if (gradeRank[g] < gradeRank[best]) best = g;
    gradeOf[row.i] = best;
  }
  const inGrade = {};
  for (const b of ASSIGN_BANDS) inGrade[b.grade] = [];
  for (const row of ordered) inGrade[gradeOf[row.i]].push(row.raw);
  const bounds = {};
  for (const b of ASSIGN_BANDS) {
    const list = inGrade[b.grade];
    if (!list.length) continue;
    bounds[b.grade] = { y1: Math.max(...list), y2: Math.min(...list), t1: b.t1, t2: b.t2 };
  }
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const raw = Number(rawScores[i]);
    const grade = gradeOf[i];
    const bd = bounds[grade];
    let assigned;
    if (!bd) assigned = 30;
    else if (bd.y1 === bd.y2) assigned = Math.round((bd.t1 + bd.t2) / 2);
    else if (raw === bd.y1) assigned = bd.t1;
    else if (raw === bd.y2) assigned = bd.t2;
    else {
      const x = ((raw - bd.y2) * bd.t1 + (bd.y1 - raw) * bd.t2) / (bd.y1 - bd.y2);
      assigned = Math.round(x);
    }
    assigned = clamp(assigned, 30, 100);
    out[i] = { raw, grade, assigned };
  }
  return out;
}

function syntheticProvincialRaws(subjectId, exam, n = 4000) {
  const difficulty = Number(exam?.difficulty) || 1;
  const rng = rngFrom("jx-assign-pool", exam?.date || "", exam?.id || exam?.examId || "", subjectId, difficulty);
  const mean = 58 + (1 - difficulty) * 8;
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(clamp(Math.round(mean + gauss(rng, 0, 16)), 12, 98));
  }
  return out;
}

/**
 * 对一场考试的再选科目按官方规则赋分。本校选考生与模拟全省样本一起作为转换基数。
 * 语数外和首选保持原始分。返回是否改写了分数。
 */
export function applyReelectiveAssign(rows, { exam, seed = 1 } = {}) {
  if (!rows?.length) return { changed: false, notes: [] };
  const notes = [];
  let changed = false;
  for (const id of REELECTIVE_IDS) {
    const takers = [];
    for (const row of rows) {
      if (!(row.subjects || []).includes(id)) continue;
      if (row[id] == null || !Number.isFinite(Number(row[id]))) continue;
      if (row[`${id}Raw`] == null) row[`${id}Raw`] = Number(row[id]);
      takers.push(row);
    }
    if (!takers.length) continue;
    const extra = syntheticProvincialRaws(id, exam, 4000);
    const pool = takers.map((r) => Number(r[`${id}Raw`])).concat(extra);
    const assigned = assignByOfficialRule(pool);
    for (let i = 0; i < takers.length; i++) {
      const rec = assigned[i];
      const row = takers[i];
      row[id] = rec.assigned;
      row.assign = row.assign || {};
      row.assign[id] = { raw: rec.raw, grade: rec.grade, assigned: rec.assigned, source: "赣教规字〔2021〕17号" };
      changed = true;
    }
    notes.push(`${SUBJECT_NAMES[id] || id}已按官方等级赋分规则转换（模拟全省有效成绩样本 ${extra.length} 人 + 本校 ${takers.length} 人）`);
  }
  if (changed) {
    for (const row of rows) {
      const subs = row.subjects || [];
      if (!subs.some((id) => isReelectiveId(id))) continue;
      let total = 0;
      for (const id of subs) total += Number(row[id] || 0);
      row.total = total;
      row.maxTotal = 750;
      row.assignedTotal = true;
    }
  }
  return { changed, notes };
}

export const ASSIGN_NOTE = `再选科目按${ASSIGN_SOURCE}`;

export function classTrackLabel(scheme, track) {
  if (scheme === "new-3+1+2") return track === "wen" ? "历史类" : track === "li" ? "物理类" : "未选科";
  return track === "wen" ? "文科" : track === "li" ? "理科" : "未分科";
}
