/**
 * 确定性考试计分、排名、分数线与班级汇总。
 * 分数只由学生个人成绩计算；禁止独立伪造统计，也不用 LLM 出分。
 */
import {
  SUBJECTS_G1, SUBJECT_IDS, SUBJECT_MAX, G1_TOTAL, CUTOFF_FIRST_RANK, CUTOFF_SECOND_RANK,
  LI_SUBJECTS, WEN_SUBJECTS, TIER, examById,
} from "./config.js?v=t55u1";
import { clamp, gauss, hash01, rngFrom, round1, round2 } from "./prng.js?v=t55u1";
import { resolveSchoolQuota } from "./schoolLines.js?v=t55u1";

export const SCALE_G1 = "g1-950";
export const SCALE_G2 = "g2-750";
export const SCALE_G3 = "g3-750";
export const SCALE_GAOKAO = "gaokao-750";

export function subjectsFor(scale, track = "mixed") {
  if (scale === SCALE_G1) return SUBJECTS_G1.map((s) => ({ ...s }));
  if (track === "wen") {
    return [
      { id: "chinese", name: "语文", max: 150 },
      { id: "math", name: "数学", max: 150 },
      { id: "english", name: "英语", max: 150 },
      { id: "politics", name: "政治", max: 100 },
      { id: "history", name: "历史", max: 100 },
      { id: "geography", name: "地理", max: 100 },
    ];
  }
  // 理科：高二起物化生各 100。高三/高考界面把三科合并为理综 300，与 2017—2020 江西高考结构一致。
  return [
    { id: "chinese", name: "语文", max: 150 },
    { id: "math", name: "数学", max: 150 },
    { id: "english", name: "英语", max: 150 },
    { id: "physics", name: "物理", max: 100 },
    { id: "chemistry", name: "化学", max: 100 },
    { id: "biology", name: "生物", max: 100 },
  ];
}

export const LI_COMP_SUBJECTS = [
  { id: "physics", name: "物理", short: "物" },
  { id: "chemistry", name: "化学", short: "化" },
  { id: "biology", name: "生物", short: "生" },
];
export const WEN_COMP_SUBJECTS = [
  { id: "politics", name: "政治", short: "政" },
  { id: "history", name: "历史", short: "史" },
  { id: "geography", name: "地理", short: "地" },
];

/** 高三平时考、模拟、联考、高考等（grade>=3 或对应卷面）按理综/文综展示。高一高二仍列单科。 */
export function usesComprehensive(scaleOrGrade) {
  if (scaleOrGrade == null) return false;
  if (typeof scaleOrGrade === "number") return scaleOrGrade >= 3;
  return scaleOrGrade === SCALE_G3 || scaleOrGrade === SCALE_GAOKAO;
}

export function comprehensiveMeta(track) {
  if (track === "wen") return { id: "wenzong", name: "文综", short: "文综", parts: WEN_COMP_SUBJECTS, max: 300 };
  return { id: "lizong", name: "理综", short: "理综", parts: LI_COMP_SUBJECTS, max: 300 };
}

export function comprehensiveScore(row, track) {
  if (!row) return null;
  if (track === "wen" && row.wenzong != null) return Number(row.wenzong);
  if (track !== "wen" && row.lizong != null) return Number(row.lizong);
  const parts = comprehensiveMeta(track).parts;
  let sum = 0;
  let any = false;
  for (const p of parts) {
    if (row[p.id] != null && Number.isFinite(Number(row[p.id]))) {
      sum += Number(row[p.id]);
      any = true;
    }
  }
  return any ? sum : null;
}

export function formatComprehensiveCell(row, track) {
  const meta = comprehensiveMeta(track);
  const score = comprehensiveScore(row, track);
  if (score == null) return "—";
  const bits = meta.parts
    .map((p) => (row[p.id] != null ? `${p.short} ${row[p.id]}` : null))
    .filter(Boolean);
  return bits.length ? `${score}（${bits.join(" ")}）` : String(score);
}

export function formatComprehensiveLabel(row, track) {
  const meta = comprehensiveMeta(track);
  const cell = formatComprehensiveCell(row, track);
  return cell === "—" ? cell : `${meta.name} ${cell}`;
}


const LAST_GAOKAO_SUBJECTS = ["chinese", "math", "english", "physics", "chemistry", "biology", "politics", "history", "geography"];

export function packLastGaokao(scoreRow, { year, track, firstLine = null, secondLine = null } = {}) {
  const row = scoreRow || {};
  const kind = track === "wen" ? "wen" : "li";
  const out = {
    total: row.total,
    year,
    track: kind,
    scale: row.scale || SCALE_GAOKAO,
    firstLine,
    secondLine,
  };
  for (const id of LAST_GAOKAO_SUBJECTS) {
    if (row[id] != null) out[id] = row[id];
  }
  if (kind === "wen") out.wenzong = comprehensiveScore(out, "wen");
  else out.lizong = comprehensiveScore(out, "li");
  return out;
}

export function formatLastGaokaoText(lastGaokao) {
  if (!lastGaokao || lastGaokao.total == null) return "暂缺";
  const year = lastGaokao.year ? `${lastGaokao.year}年` : "";
  const track = lastGaokao.track === "wen" ? "wen" : "li";
  const parts = [`${year}总分 ${lastGaokao.total}`.trim()];
  const core = [];
  if (lastGaokao.chinese != null) core.push(`语文 ${lastGaokao.chinese}`);
  if (lastGaokao.math != null) core.push(`数学 ${lastGaokao.math}`);
  if (lastGaokao.english != null) core.push(`英语 ${lastGaokao.english}`);
  const comp = formatComprehensiveLabel(lastGaokao, track);
  if (core.length) parts.push(core.join("　"));
  if (comp && comp !== "—") parts.push(comp);
  return parts.join("　");
}

export function displayScoreColumns(scale, track, subjectIds) {
  const ids = subjectIds
    || subjectsFor(scale, track === "wen" ? "wen" : track === "li" ? "li" : "mixed").map((s) => s.id);
  if (!usesComprehensive(scale)) {
    return ids.filter((id) => id !== "lizong" && id !== "wenzong").map((id) => ({
      id, name: (id === "biology" ? "生物" : null) || ({
        chinese: "语文", math: "数学", english: "英语", physics: "物理", chemistry: "化学",
        geography: "地理", history: "历史", politics: "政治",
      }[id] || id), kind: "subject",
    }));
  }
  const nameOf = (id) => ({ chinese: "语文", math: "数学", english: "英语" }[id] || id);
  const cols = [];
  for (const id of ["chinese", "math", "english"]) {
    if (ids.includes(id) || ids.length === 0) cols.push({ id, name: nameOf(id), kind: "subject" });
  }
  if (track === "wen") cols.push({ id: "wenzong", name: "文综", kind: "comp", track: "wen" });
  else if (track === "li") cols.push({ id: "lizong", name: "理综", kind: "comp", track: "li" });
  else {
    cols.push({ id: "lizong", name: "理综", kind: "comp", track: "li" });
    cols.push({ id: "wenzong", name: "文综", kind: "comp", track: "wen" });
  }
  return cols;
}

export function displayScoreCell(row, col) {
  if (!col) return "—";
  if (col.kind === "comp") {
    const rowTrack = row?.track === "wen" ? "wen" : (row?.track === "li" ? "li" : null);
    if (rowTrack && rowTrack !== col.track) return "—";
    if (!rowTrack) {
      const score = comprehensiveScore(row, col.track);
      if (score == null) return "—";
    }
    return formatComprehensiveCell(row, col.track);
  }
  const v = row?.[col.id];
  return v == null || v === "" ? "—" : v;
}

export function formatToppersLine(toppers, subjectIds, scale, rows, track = "all") {
  const set = toppers || {};
  if (!usesComprehensive(scale)) {
    return (subjectIds || []).map((id) => {
      const t = set[id];
      const nm = ({
        chinese: "语文", math: "数学", english: "英语", physics: "物理", chemistry: "化学",
        biology: "生物", geography: "地理", history: "历史", politics: "政治",
      })[id] || id;
      return t ? `${nm}第一：${t.name}（${t.score}）` : "";
    }).filter(Boolean).join("　");
  }
  const parts = [];
  for (const id of ["chinese", "math", "english"]) {
    const t = set[id];
    const nm = { chinese: "语文", math: "数学", english: "英语" }[id];
    if (t) parts.push(`${nm}第一：${t.name}（${t.score}）`);
  }
  const tracks = track === "wen" ? ["wen"] : track === "li" ? ["li"] : ["li", "wen"];
  for (const tr of tracks) {
    const meta = comprehensiveMeta(tr);
    const pool = (rows || []).filter((r) => (tr === "wen" ? r.track === "wen" : r.track !== "wen"));
    const ranked = pool.slice().sort((a, b) => (comprehensiveScore(b, tr) ?? -1) - (comprehensiveScore(a, tr) ?? -1)
      || (b.total ?? 0) - (a.total ?? 0)
      || String(a.studentId || a.id || "").localeCompare(String(b.studentId || b.id || "")));
    const top = ranked[0];
    if (!top || comprehensiveScore(top, tr) == null) continue;
    const subBits = meta.parts.map((p) => {
      const st = (set[p.id] && (!set[p.id].track || set[p.id].track === tr || (tr === "li" ? set[p.id].track !== "wen" : set[p.id].track === "wen")))
        ? set[p.id]
        : null;
      const list = pool.slice().sort((a, b) => (b[p.id] ?? -1) - (a[p.id] ?? -1) || String(a.studentId || "").localeCompare(String(b.studentId || "")));
      const hit = st || (list[0] ? { name: list[0].name, score: list[0][p.id] } : null);
      return hit && hit.score != null ? `${p.short}第一：${hit.name} ${hit.score}` : null;
    }).filter(Boolean);
    parts.push(`${meta.name}第一：${top.name}（${formatComprehensiveCell(top, tr)}${subBits.length ? "；" + subBits.join("，") : ""}）`);
  }
  return parts.join("　");
}

export function scaleTotal(scale) {
  return scale === SCALE_G1 ? G1_TOTAL : 750;
}

export function scaleOf(grade, examKind) {
  if (examKind === "gaokao") return SCALE_GAOKAO;
  if (grade >= 3) return SCALE_G3;
  if (grade >= 2) return SCALE_G2;
  return SCALE_G1;
}

/** 能力 → 期望得分率（难度=1、发挥=0）。按 750 分高考画像标定后再用于各卷满分。 */
export function expectedPct(ability) {
  const a = clamp(ability, 0, 100);
  // 锚点按 750 分制。加陡的是校内第 400 与第 1000 名实际所在的中上段
  // （约能力 64–76，对应理科这两条线），使分差接近江西 2016—2020 省控
  // （理 72–84，文 56–75）。顶端仍压住，避免清北人数爆掉。
  // 中上段（64–76）保持校内第400/1000名分差；中低段下调，
  // 使卓行平行班高考省控一本典型约 3 人、二本累计明显低于 45。
  // 44→412，55→445，60→471，64→524，76→563，86→603，99→687。
  const pts = [
    [0, 0.20], [30, 0.47], [44, 0.550], [50, 0.575], [56, 0.600], [60, 0.628],
    [64, 0.698], [76, 0.750], [86, 0.804], [92, 0.822],
    [96, 0.865], [98, 0.895], [99, 0.916], [100, 0.930],
  ];
  for (let i = 1; i < pts.length; i++) {
    if (a <= pts[i][0]) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      const t = (a - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }
  return pts[pts.length - 1][1];
}

/**
 * 理科高尾压缩：压住 710 这类头顶，并给 655 以上加一点确定性抖动以拉开拥挤。
 * 640 分以下不动，以免改动一本/二本省控标定和 600 分上下的主体。
 * 好年份校最高落在大约 670 几到 680 出头，允许极稀的尾巴摸到清北线附近，但不出现 710。
 */
export function compressLiHighTail(total, student, exam) {
  const t = Number(total);
  if (!(t >= 640)) return Math.round(t);
  let out = t;
  if (t <= 658) {
    out = t;
  } else if (t <= 678) {
    out = 658 + (t - 658) * 0.70; // 678 → 672
  } else if (t <= 700) {
    out = 672 + (t - 678) * 0.36; // 696 → 678.5，700 → 680
  } else {
    out = 680 + (t - 700) * 0.12; // 710 → 681.2
  }
  const span = Math.min(7, Math.max(0, t - 655) * 0.28);
  const jig = (hash01(student?.id || "x", exam?.id || "exam", "li-tail") - 0.5) * span;
  return Math.round(out + jig);
}

function formSigma(stability) {
  // 稳定者约 ±0.7%；中等约 ±1.8%；不稳定可到 ±2.6%（相对满分）
  const s = clamp(stability ?? 60, 10, 99);
  return 0.028 - (s / 100) * 0.021;
}

/**
 * 单科原始分。form / paperFit / condition 均为种子决定的发挥项。
 */
export function scoreSubject({ max, ability, potential, teaching = 0, difficulty, dispersion, form, fit, condition }) {
  const a = clamp(ability + teaching * 0.3 + (potential - ability) * 0.05, 0, 100);
  let pct = expectedPct(a);
  const pivot = 0.62; // 接近二本附近，拉开一本/二本分差
  pct = pivot + (pct - pivot) * dispersion;
  // 难度以整体平移为主，避免难卷把第400/1000名分差按比例压到四十来分。
  pct = pct + (difficulty - 1) * pivot;
  pct += form + fit + condition;
  pct = clamp(pct, 0.04, 0.97);
  return clamp(Math.round(pct * max), 0, max);
}

export function studentFormBundle(student, examId, difficultyKey = "", examKind = "") {
  const stab = student.stability ?? 60;
  const sig = formSigma(stab);
  const rng = rngFrom(student.id, examId, "form", difficultyKey);
  let form = gauss(rng, 0, sig);
  // 偶发大波动（约 4% 场次对某生）：顶尖稳定者几乎不中，中上层更可能爆冷或超常
  const outlierP = 0.02 + (1 - stab / 100) * 0.06;
  if (hash01(student.id, examId, "outlier") < outlierP) {
    const dir = hash01(student.id, examId, "outlier-dir") < 0.48 ? -1 : 1;
    form += dir * (0.02 + rng() * 0.045);
  }
  // 平时月考/模拟/联考发挥波动略大于高考，让同一学生各次成绩有可见起伏。
  // 不改高考，也不改用于分班的期末，以免省控标定和梯队交叠漂移。
  if (examKind === "midterm") form *= 1.32;
  else if (examKind === "monthly" || examKind === "mock1" || examKind === "mock2" || examKind === "city" || examKind === "province") form *= 1.18;
  const fit = (hash01(student.id, examId, "fit") - 0.5) * 0.02 * (1.15 - stab / 200);
  const cond = ((student.energy ?? 70) - 70) * 0.00012 - ((student.stress ?? 40) - 40) * 0.00014;
  return { form, fit, condition: cond };
}

export function gradeStudent(student, exam, scale, teachingBonus = 0) {
  const track = student.track === "wen" ? "wen" : student.track === "li" ? "li" : "li";
  const subjects = subjectsFor(scale, scale === SCALE_G1 ? "mixed" : track);
  const difficulty = exam.difficulty ?? 1;
  const dispersion = exam.dispersion ?? 1;
  const bundle = studentFormBundle(student, exam.id, `${difficulty}|${dispersion}`, exam.examKind);
  const scores = {};
  let total = 0;
  for (const sub of subjects) {
    const teach = sub.id === "math" ? teachingBonus : 0;
    const subForm = bundle.form + (hash01(student.id, exam.id, sub.id, "sform") - 0.5) * 0.008;
    const years = Math.max(0, (exam.growthYears ?? exam.grade ?? 1) - 1);
    const rawA = student.ability[sub.id] ?? student.ability.math;
    const rawP = student.potential[sub.id] ?? student.potential.math;
    const room = Math.max(0, rawP - rawA);
    // 低分段进步空间大，顶尖接近潜力则几乎不涨，避免高三把清北人数抬爆。
    const gScale = rawA >= 84 ? 0.10 : rawA >= 74 ? 0.20 : rawA >= 62 ? 0.25 : 0.35;
    const grown = rawA + years * Math.min(5.2, room * 0.28) * gScale;
    const v = scoreSubject({
      max: sub.max,
      ability: grown,
      potential: rawP,
      teaching: teach,
      difficulty,
      dispersion,
      form: subForm,
      fit: bundle.fit,
      condition: bundle.condition,
    });
    scores[sub.id] = v;
    total += v;
  }
  if (scale === SCALE_G1 && scores.biology != null) {
    throw new Error("高一试卷不应出现生物");
  }
  const maxTotal = subjects.reduce((s, x) => s + x.max, 0);
  // 文科校内一本常落在卓行上段，与理科共用 60–64 陡坡后分差易偏宽。
  // 500–580 略压、580–618 收回，与高尾清北压缩在 618 处连续衔接。
  // 2020 江西文科 650 分以上全省仅约 12 人，644 分约全省第 24 名。
  if ((scale === SCALE_GAOKAO || scale === SCALE_G3 || scale === SCALE_G2) && track === "wen" && total > 500) {
    if (total <= 580) {
      total = Math.round(500 + (total - 500) * 0.70);
    } else if (total <= 618) {
      // 580 → 556，再线性回到 618，保证单调且与高尾相接。
      total = Math.round(556 + (total - 580) * (62 / 38));
    } else {
      total = Math.round(618 + (total - 618) * 0.36);
    }
  }
  if ((scale === SCALE_GAOKAO || scale === SCALE_G3 || scale === SCALE_G2) && track === "li") {
    total = compressLiHighTail(total, student, exam);
  }
  return { ...scores, total, maxTotal, scale, subjects: subjects.map((s) => s.id) };
}

export function compareScoreRows(a, b) {
  if (b.total !== a.total) return b.total - a.total;
  const mathA = a.math ?? 0, mathB = b.math ?? 0;
  if (mathB !== mathA) return mathB - mathA;
  const chA = a.chinese ?? 0, chB = b.chinese ?? 0;
  if (chB !== chA) return chB - chA;
  return String(a.studentId).localeCompare(String(b.studentId));
}

export function rankRows(rows) {
  const sorted = rows.slice().sort(compareScoreRows);
  let last = null, lastRank = 0;
  return sorted.map((r, i) => {
    const rank = last && r.total === last.total && r.math === last.math && r.chinese === last.chinese ? lastRank : i + 1;
    last = r;
    lastRank = rank;
    return { ...r, rank };
  });
}

export function subjectRanks(rows, subjectId) {
  const sorted = rows.slice().sort((a, b) => {
    const d = (b[subjectId] ?? -1) - (a[subjectId] ?? -1);
    if (d) return d;
    if (b.total !== a.total) return b.total - a.total;
    return String(a.studentId).localeCompare(String(b.studentId));
  });
  return sorted.map((r, i) => ({ studentId: r.studentId, score: r[subjectId], subjectRank: i + 1, classNo: r.classNo, name: r.name, total: r.total }));
}

/**
 * 校内一本/二本名额：该科类划线池约第 520、第 1100 名取分。
 * 高三池为应届加补习班；池人数不足 1100 时二本取靠后名次且不超过池规模，
 * 不足 520 或一本占比过高时一本取靠前名次，避免文科池被撑得像理科。
 * 第四个参数可以是 { track, salt }。
 */
export function cutoffRanks(n, split, trackSize, firstOrOpts, secondTarget) {
  const opts = firstOrOpts && typeof firstOrOpts === "object" ? firstOrOpts : {};
  return resolveSchoolQuota({
    split: !!split,
    track: opts.track || (split ? "li" : "mixed"),
    regularN: n,
    trackN: trackSize ?? n,
    salt: opts.salt,
  });
}

export function cutoffsFromRanked(ranked, firstN, secondN) {
  const f = ranked[Math.min(firstN, ranked.length) - 1];
  const s = ranked[Math.min(secondN, ranked.length) - 1];
  return {
    firstLine: f ? f.total : 0,
    secondLine: s ? s.total : 0,
    firstN: Math.min(firstN, ranked.length),
    secondN: Math.min(secondN, ranked.length),
    firstStudentId: f?.studentId,
    secondStudentId: s?.studentId,
    top: ranked[0]?.total ?? 0,
    second: ranked[1]?.total ?? 0,
    topGap: (ranked[0]?.total ?? 0) - (ranked[1]?.total ?? 0),
    topId: ranked[0]?.studentId,
    secondId: ranked[1]?.studentId,
  };
}

export function summarizeClass(students, scoreMap, lines) {
  const rows = students.map((s) => {
    const sc = scoreMap[s.id];
    if (!sc) throw new Error(`缺学生成绩 ${s.id}`);
    return sc;
  });
  const n = rows.length;
  if (!n) {
    return { count: 0, avg: 0, max: 0, min: 0, subjectAvgs: {}, firstCount: 0, secondCount: 0, firstRate: 0, secondRate: 0 };
  }
  const totals = rows.map((r) => r.total);
  const avg = totals.reduce((a, b) => a + b, 0) / n;
  const subjectAvgs = {};
  const ids = rows[0].subjects || Object.keys(rows[0]).filter((k) => !["total", "maxTotal", "scale", "subjects", "studentId", "name", "classNo", "rank"].includes(k));
  for (const id of ids) {
    if (typeof rows[0][id] !== "number") continue;
    subjectAvgs[id] = round1(rows.reduce((a, r) => a + r[id], 0) / n);
  }
  const firstCount = lines ? rows.filter((r) => r.total >= lines.firstLine).length : 0;
  const secondCount = lines ? rows.filter((r) => r.total >= lines.secondLine).length : 0;
  return {
    count: n,
    avg: round2(avg),
    max: Math.max(...totals),
    min: Math.min(...totals),
    subjectAvgs,
    firstCount,
    secondCount,
    firstRate: round2((firstCount / n) * 100),
    secondRate: round2((secondCount / n) * 100),
  };
}

export function attachStudentMeta(row, student) {
  return {
    ...row,
    studentId: student.id,
    name: student.name,
    classNo: student.classNo,
    tier: student.tier,
    track: student.track,
    trackPref: student.trackPref || student.track,
    repeat: !!student.repeat,
    entryYear: student.entryYear,
    gender: student.gender,
  };
}

export { CUTOFF_FIRST_RANK, CUTOFF_SECOND_RANK, G1_TOTAL, SUBJECTS_G1 };
