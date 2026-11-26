/** 学校、班级与学生生成。玩家任教 2017 级卓行 16 班（74 人）。 */
import {
  CLASS_BLUEPRINT, TIER, SUBJECT_IDS, PERSONALITIES, FAMILY_TYPES,
  PLAYER_CLASS_NO, GRADE_YEAR, LI_SUBJECTS, WEN_SUBJECTS,
  REPEAT_CLASS_SIZE, REPEAT_WEN_NOS, REPEAT_LI_NOS, INSERT_REPEAT_CLASS_NOS,
} from "./config.js";
import { clamp, gauss, hash01, pick, rngFrom, shuffle } from "./prng.js";
import { generateName } from "./names.js";
import { gradeStudent, scaleOf } from "./scores.js";
import { provincialLines } from "./jiangxi.js";
import { canInsertRepeat } from "./admission.js";

export const ALL_SUBJECTS = [...SUBJECT_IDS, "biology"];

export function classNameOf(no, blueprint = CLASS_BLUEPRINT) {
  return (blueprint.find((c) => c.no === no) || { name: `${no}班` }).name;
}

export function tierOfClass(no) {
  return (CLASS_BLUEPRINT.find((c) => c.no === no) || { tier: "zhuoxing" }).tier;
}

export function tierGroup(tier) {
  if (tier === "yunxiu_exp") return "yunxiu_exp";
  if (tier === "yunxiu_key") return "yunxiu_key";
  if (tier === "lingxiao") return "lingxiao";
  if (tier === "zhuoxing") return "zhuoxing";
  if (tier === "duxue") return "duxue";
  if (tier === "yiti") return "yiti";
  if (tier === "fuzhuo" || String(tier).startsWith("fu")) return "fuzhuo";
  return tier;
}

export function currentGrade(entryYear, schoolYear) {
  return schoolYear - entryYear + 1;
}

/**
 * 入学年对应的时代实力修正。对标宁都中学 2017–2020 喜报数量级：
 * 这几年学校明显变强。2017 级（2020 年高考）为当前基准 0，不改现行平行班高考省控标定。
 * 只用于已有公开喜报对照的年份，不编造 2021 以后的精确官方人数。
 */
export function eraQuality(entryYear) {
  const y = Number(entryYear);
  if (y <= 2014) return -3.1;
  if (y === 2015) return -2.5;
  if (y === 2016) return -0.4;
  return 0;
}

function paintAbilities(rng, mean, sd, hint) {
  const ability = {};
  const potential = {};
  const base = clamp(gauss(rng, mean, sd), 18, 99);
  for (const id of ALL_SUBJECTS) {
    let offset = gauss(rng, 0, 5.5);
    if (hint === "li") {
      if (["physics", "chemistry", "math", "biology"].includes(id)) offset += 4.2;
      if (["history", "politics", "geography"].includes(id)) offset -= 4.8;
    } else if (hint === "wen") {
      if (["history", "politics", "geography", "chinese"].includes(id)) offset += 4.2;
      if (["physics", "chemistry", "biology"].includes(id)) offset -= 4.8;
    }
    let a;
    if (id === "chinese" || id === "english") {
      // 语文、英语各层分差收窄，平行班也可以单科冒尖。上层少拉、下层多拉，以免重点/凌霄语英被削掉后高考一本整体下滑。
      const pull = base >= 80 ? 0.08 : base >= 66 ? 0.16 : 0.3;
      const langMean = (1 - pull) * (base + offset) + pull * 58;
      a = clamp(langMean + gauss(rng, 0, 8), 16, 99);
    } else {
      a = clamp(base + offset, 16, 99);
    }
    ability[id] = round1(a);
    potential[id] = round1(clamp(a + 4 + rng() * 10, a, 99.5));
  }
  // 平行班语英被拉高后，从该生计分科目里扣回等量，避免高考二本被整体抬过线。
  if (base < 58) {
    const lift = (ability.chinese + ability.english) / 2 - base;
    if (lift > 0) {
      const others = hint === "wen"
        ? ["math", "politics", "history", "geography"]
        : ["math", "physics", "chemistry", "biology"];
      const take = (lift * 2) / others.length;
      for (const id of others) {
        const v = clamp(ability[id] - take, 16, 99);
        const room = Math.max(0, potential[id] - ability[id]);
        ability[id] = round1(v);
        potential[id] = round1(clamp(v + room, v, 99.5));
      }
    }
  }
  return { ability, potential, base };
}

function round1(n) { return Math.round(n * 10) / 10; }

function pickTrack(rng, hint, ability) {
  const li = (ability.physics + ability.chemistry + ability.math) / 3;
  const wen = (ability.politics + ability.history + ability.geography) / 3;
  const gap = li - wen;
  if (hint === "li" && gap > -2) return "li";
  if (hint === "wen" && gap < 2) return "wen";
  if (gap > 3.5) return "li";
  if (gap < -3.5) return "wen";
  return rng() < 0.62 ? (hint === "wen" ? "wen" : "li") : (hint === "wen" ? "li" : "wen");
}

export function makeStudent({ rng, usedNames, entryYear, classNo, seq, tier, hint, repeat = false, quality = 0 }) {
  const id = `${entryYear}-${classNo}-${String(seq).padStart(2, "0")}${repeat ? "R" : ""}`;
  const gender = rng() < 0.48 ? "F" : "M";
  const name = generateName(rng, usedNames, gender);
  const tp = TIER[tier] || TIER.zhuoxing;
  let mean = tp.abilityMean + quality;
  // 云岫实验班每班至多一两位特别突出的苗子，而不是全班拉满。不给笃学做一本兜底。
  if (tier === "yunxiu_exp" && hint === "li" && seq <= 2 && rng() < 0.7) mean += 7 + rng() * 5;
  // 少数人的头尾交叠，不抬整层均值：卓行上沿可摸到校排 130–180，笃学上沿可到 400–560，重点左尾可掉出校内一本。
  if (tier === "zhuoxing" && rng() < 0.04) mean += 6 + rng() * 5;
  if (tier === "duxue" && rng() < 0.035) mean += 14 + rng() * 7;
  if (tier === "yunxiu_key" && rng() < 0.08) mean -= 6 + rng() * 4;
  const { ability, potential, base } = paintAbilities(rng, mean, tp.abilitySd, hint);
  const trackPref = pickTrack(rng, hint, ability);
  const family = pick(rng, FAMILY_TYPES);
  const personality = pick(rng, PERSONALITIES);
  const stability = clamp(38 + base * 0.45 + gauss(rng, 0, 6) + (tier === "yunxiu_exp" ? 8 : 0), 28, 97);
  const seat = seatFromSeq(classNo, seq, 0);
  return {
    id, name, gender, entryYear, classNo, seq,
    originClassNo: classNo,
    tier, track: "mixed", trackPref,
    ability, potential, stability: round1(stability),
    personality,
    family: { type: family.type, note: family.note },
    mood: clamp(Math.round(58 + gauss(rng, 0, 10)), 25, 95),
    stress: clamp(Math.round(38 + gauss(rng, 0, 10)), 8, 90),
    energy: clamp(Math.round(76 + gauss(rng, 0, 8)), 35, 98),
    relation: 0,
    talks: [],
    seat,
    art: tier === "yiti",
    repeat,
    majorPref: pick(rng, hint === "wen"
      ? ["师范", "文史", "财经", "综合", "法学"]
      : ["理工", "综合", "财经", "医学", "师范"]),
  };
}

export function generateCohort(entryYear, seed, { quality = 0, alreadySplit = false, withRepeat = false } = {}) {
  const rng = rngFrom(seed, "cohort", entryYear, quality);
  const usedNames = new Set();
  const students = [];
  const classes = [];
  for (const bp of CLASS_BLUEPRINT) {
    if (bp.no >= 31) continue; // 补习班只在 withRepeat 的高三届另外生成
    const list = [];
    for (let seq = 1; seq <= bp.size; seq++) {
      const st = makeStudent({
        rng, usedNames, entryYear, classNo: bp.no, seq,
        tier: bp.tier, hint: bp.trackHint, quality,
      });
      if (alreadySplit) st.track = st.trackPref;
      list.push(st);
      students.push(st);
    }
    classes.push({ no: bp.no, name: bp.name, short: bp.short, tier: bp.tier, size: list.length, studentIds: list.map((s) => s.id) });
  }
  if (withRepeat) {
    const repeatStudents = generateRepeaters(entryYear, seed, usedNames, quality, { regulars: students });
    students.push(...repeatStudents);
    for (const st of repeatStudents) {
      let cls = classes.find((c) => c.no === st.classNo);
      if (!cls) {
        const bp = CLASS_BLUEPRINT.find((c) => c.no === st.classNo);
        cls = { no: st.classNo, name: bp?.name || `补习${st.classNo}班`, short: bp?.short || "补习班", tier: "fuzhuo", size: 0, studentIds: [], repeat: true };
        classes.push(cls);
      }
      cls.studentIds.push(st.id);
      cls.size = cls.studentIds.length;
    }
    return { entryYear, students: applyRepeaterSeating(students), classes };
  }
  return { entryYear, students, classes };
}

export function isTutoringClass(no) {
  return REPEAT_WEN_NOS.includes(Number(no)) || REPEAT_LI_NOS.includes(Number(no));
}

export function compareLastGaokao(a, b) {
  const ta = a?.lastGaokao?.total ?? -Infinity;
  const tb = b?.lastGaokao?.total ?? -Infinity;
  if (tb !== ta) return tb - ta;
  const ma = a?.lastGaokao?.math ?? 0;
  const mb = b?.lastGaokao?.math ?? 0;
  if (mb !== ma) return mb - ma;
  const ca = a?.lastGaokao?.chinese ?? 0;
  const cb = b?.lastGaokao?.chinese ?? 0;
  if (cb !== ca) return cb - ca;
  return String(a?.id || "").localeCompare(String(b?.id || ""));
}

function priorGaokaoYear(forSeniorEntryYear) {
  // 插班/补习生来自上一届：入学年 forSeniorEntryYear-1，高考在入学后第三年。
  return Number(forSeniorEntryYear) + 2;
}

function lastGaokaoExam(year) {
  return {
    id: `prior-gaokao-${year}`,
    name: "上次高考",
    examKind: "gaokao",
    difficulty: 1.003,
    dispersion: 1,
    date: `${year}-06-07`,
    grade: 3,
    year,
  };
}

/** 为开局合成的复读生补上上次高考总分；必要时压到省控一本以下，表示发挥失常。 */
export function synthesizeLastGaokao(student, gaokaoYear, { forceMissFirst = false, rng = null } = {}) {
  const track = student.track === "wen" ? "wen" : "li";
  const lines = provincialLines(gaokaoYear, track) || provincialLines(2020, track);
  const sc = gradeStudent(student, lastGaokaoExam(gaokaoYear), scaleOf(3, "gaokao"), 0);
  let total = sc.total;
  if (forceMissFirst && lines && total >= lines.first) {
    const gap = rng ? 1 + Math.floor(rng() * 22) : 8;
    total = lines.first - gap;
  }
  return {
    total,
    year: gaokaoYear,
    track,
    math: sc.math ?? 0,
    chinese: sc.chinese ?? 0,
    firstLine: lines?.first ?? null,
  };
}

function rollInsertCount(rng, n, rate, cap) {
  let k = 0;
  for (let i = 0; i < n; i++) if (rng() < rate) k += 1;
  return Math.min(k, cap);
}

const INSERT_PLAN = [
  { no: 0, tier: "yunxiu_exp", hint: "li", track: "li", sizeHint: 36, rate: 0.04, cap: 3 },
  { no: 2, tier: "yunxiu_key", hint: "li", track: "li", sizeHint: 54, rate: 0.035, cap: 5 },
  { no: 3, tier: "yunxiu_key", hint: "li", track: "li", sizeHint: 51, rate: 0.035, cap: 5 },
  { no: 4, tier: "yunxiu_key", hint: "li", track: "li", sizeHint: 50, rate: 0.035, cap: 5 },
];

/** 补习班按上次高考总分从高到低排座，1 号最高。0/2/3/4 的插班生座号接在应届后面。 */
export function applyRepeaterSeating(students) {
  const groups = new Map();
  for (const s of students) {
    if (!groups.has(s.classNo)) groups.set(s.classNo, []);
    groups.get(s.classNo).push(s);
  }
  const byId = new Map();
  for (const [no, list] of groups) {
    const tutoring = isTutoringClass(no) || (list.length > 0 && list.every((s) => s.repeat));
    if (tutoring) {
      numberClassSeats(list.slice().sort(compareLastGaokao)).forEach((s) => byId.set(s.id, s));
      continue;
    }
    if (!list.some((s) => s.repeat)) continue;
    const regulars = list.filter((s) => !s.repeat);
    const inserts = list.filter((s) => s.repeat).slice().sort(compareLastGaokao);
    const size = list.length;
    const seqs = regulars.map((s) => s.seq);
    const regOk = regulars.length > 0
      && new Set(seqs).size === regulars.length
      && seqs.every((n) => n >= 1 && n <= regulars.length);
    const seatedReg = regOk
      ? regulars.map((s) => ({ ...s, seat: seatFromSeq(no, s.seq, size) }))
      : regulars.slice().sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0) || String(a.id).localeCompare(String(b.id)))
        .map((s, i) => {
          const seq = i + 1;
          return { ...s, seq, seat: seatFromSeq(no, seq, size) };
        });
    seatedReg.forEach((s) => byId.set(s.id, s));
    const start = seatedReg.length;
    inserts.forEach((s, i) => {
      const seq = start + i + 1;
      byId.set(s.id, { ...s, seq, seat: seatFromSeq(no, seq, size) });
    });
  }
  return students.map((s) => byId.get(s.id) || s);
}

function assignTutoringClasses(students) {
  const out = [];
  const plans = [
    { track: "wen", nos: REPEAT_WEN_NOS },
    { track: "li", nos: REPEAT_LI_NOS },
  ];
  for (const p of plans) {
    const arr = students.filter((s) => p.track === "wen" ? s.track === "wen" : s.track !== "wen")
      .slice()
      .sort(compareLastGaokao);
    arr.forEach((s, i) => {
      const idx = Math.min(p.nos.length - 1, Math.floor(i / REPEAT_CLASS_SIZE));
      out.push({ ...s, classNo: p.nos[idx], tier: "fuzhuo" });
    });
  }
  return applyRepeaterSeating(out);
}

/** 毕业留下的复读生：失常的原 0/翠微插回对应班，其余编入补习班并按上次高考分排座。 */
export function placeGraduatingRepeaters(staying, admissionById = {}) {
  const inserts = [];
  const tutoring = [];
  for (const s of staying) {
    const a = admissionById[s.id];
    if (canInsertRepeat(s, a)) {
      const destTier = Number(s.classNo) === 0 ? "yunxiu_exp" : "yunxiu_key";
      inserts.push({ ...s, classNo: s.classNo, tier: destTier, insertedRepeat: true });
    } else {
      tutoring.push({ ...s, tier: "fuzhuo", insertedRepeat: false });
    }
  }
  return [...assignTutoringClasses(tutoring), ...inserts];
}

/** 高三复读生：能力略高于原梯队均值，但仍是重点中学复读画像，不是人人清北。 */
export function generateRepeaters(forSeniorEntryYear, seed, usedNames, quality = 0, { regulars = [] } = {}) {
  // 高三补习班：文科 31–36、理科 37–42，每班 70 人。班内序号按上次高考总分降序，最高为 1 号。
  const rng = rngFrom(seed, "repeaters", forSeniorEntryYear);
  const students = [];
  const gaokaoYear = priorGaokaoYear(forSeniorEntryYear);
  const plan = [
    ...REPEAT_WEN_NOS.map((no) => ({ no, track: "wen", size: REPEAT_CLASS_SIZE, hint: "wen" })),
    ...REPEAT_LI_NOS.map((no) => ({ no, track: "li", size: REPEAT_CLASS_SIZE, hint: "li" })),
  ];
  for (const p of plan) {
    for (let seq = 1; seq <= p.size; seq++) {
      // 补习生来源多数为原卓行/凌霄/笃学，少数原重点；能力略高于原梯队，但不是人人清北。
      const roll = rng();
      const tierSrc = roll < 0.08 ? "yunxiu_key" : roll < 0.38 ? "lingxiao" : roll < 0.82 ? "zhuoxing" : "duxue";
      const st = makeStudent({
        rng, usedNames, entryYear: forSeniorEntryYear - 1,
        classNo: p.no, seq, tier: tierSrc, hint: p.hint, repeat: true,
        quality: quality + 0.8,
      });
      st.track = p.track;
      st.tier = "fuzhuo";
      st.originTier = tierSrc;
      st.insertedRepeat = false;
      st.lastGaokao = synthesizeLastGaokao(st, gaokaoYear);
      students.push(st);
    }
  }
  const insertRng = rngFrom(seed, "repeat-inserts", forSeniorEntryYear);
  for (const p of INSERT_PLAN) {
    const regularCount = regulars.filter((s) => s.classNo === p.no).length || p.sizeHint;
    const n = rollInsertCount(insertRng, regularCount, p.rate, p.cap);
    for (let i = 0; i < n; i++) {
      const st = makeStudent({
        rng: insertRng, usedNames, entryYear: forSeniorEntryYear - 1,
        classNo: p.no, seq: regularCount + i + 1, tier: p.tier, hint: p.hint, repeat: true,
        quality,
      });
      st.track = p.track;
      st.tier = p.tier;
      st.originClassNo = p.no;
      st.originTier = p.tier;
      st.insertedRepeat = true;
      st.lastGaokao = synthesizeLastGaokao(st, gaokaoYear, { forceMissFirst: true, rng: insertRng });
      students.push(st);
    }
  }
  return applyRepeaterSeating(students.concat(regulars)).filter((s) => s.repeat);
}

export function generateOpeningSchool(seed, playerEntryYear = GRADE_YEAR) {
  // 开学时：高一=playerEntryYear，高二=year-1（已分科+二次分班），高三=year-2（含补习班）
  const cohorts = {};
  cohorts[playerEntryYear] = generateCohort(playerEntryYear, seed, { alreadySplit: false, withRepeat: false, quality: eraQuality(playerEntryYear) });
  cohorts[playerEntryYear - 1] = generateCohort(playerEntryYear - 1, seed, { alreadySplit: true, withRepeat: false, quality: eraQuality(playerEntryYear - 1) });
  cohorts[playerEntryYear - 2] = generateCohort(playerEntryYear - 2, seed, { alreadySplit: true, withRepeat: true, quality: eraQuality(playerEntryYear - 2) });
  // 高二、高三已分科的班级编号按第一次分班目标靠拢：此处先保留预分班编号，
  // 由 simulation 在开局对旧年级补做分班，保证层次与科类正确。
  return {
    seed,
    playerEntryYear,
    cohorts,
  };
}

export function studentsOfCohort(cohort) {
  return cohort.students;
}


export function columnsForClass(classNo, classSize = 0) {
  return (classNo === 0 || classNo === 1 || (classSize && classSize <= 35)) ? 6 : 7;
}

export function seatFromSeq(classNo, seq, classSize = 0) {
  const cols = columnsForClass(classNo, classSize);
  const idx = Math.max(0, (seq || 1) - 1);
  return { row: Math.floor(idx / cols) + 1, col: (idx % cols) + 1 };
}

export function seatOf(student, classSize = 0) {
  if (student?.seat?.row && student?.seat?.col) return student.seat;
  return seatFromSeq(student?.classNo, student?.seq, classSize);
}

export function seatLabel(student, classSize = 0) {
  const s = seatOf(student, classSize);
  return `第${s.row}排第${s.col}座`;
}

/** 按当前名单顺序写入连续座号与座位坐标。 */
export function numberClassSeats(members) {
  const size = members.length;
  return members.map((s, i) => {
    const seq = i + 1;
    return { ...s, seq, seat: seatFromSeq(s.classNo, seq, size) };
  });
}

/**
 * 按班级重排座号。给 seed 则用确定性洗牌作为新座次；
 * 不给 seed 则保留原名单顺序，只把座号写成 1..n 并同步座位坐标。
 */
export function reseatClasses(students, { seed = null, tag = "reseat", classNos = null } = {}) {
  const allow = classNos ? new Set(classNos) : null;
  const groups = new Map();
  for (const s of students) {
    if (allow && !allow.has(s.classNo)) continue;
    if (!groups.has(s.classNo)) groups.set(s.classNo, []);
    groups.get(s.classNo).push(s);
  }
  const byId = new Map();
  for (const [no, list] of groups) {
    const ordered = seed != null ? shuffle(rngFrom(seed, tag, no), list) : list.slice();
    numberClassSeats(ordered).forEach((s) => byId.set(s.id, s));
  }
  return students.map((s) => byId.get(s.id) || s);
}

/** 座号已齐时只按座号回写坐标；座号有缺口或重复则按原座号/学号排后重编。 */
export function syncSeatsToSeq(students, { classNos = null } = {}) {
  const allow = classNos ? new Set(classNos) : null;
  const groups = new Map();
  for (const s of students) {
    if (allow && !allow.has(s.classNo)) continue;
    if (!groups.has(s.classNo)) groups.set(s.classNo, []);
    groups.get(s.classNo).push(s);
  }
  const byId = new Map();
  for (const [, list] of groups) {
    const size = list.length;
    const seqs = list.map((s) => s.seq);
    const ok = new Set(seqs).size === size && seqs.every((n) => n >= 1 && n <= size);
    if (ok) {
      for (const s of list) byId.set(s.id, { ...s, seat: seatFromSeq(s.classNo, s.seq, size) });
    } else {
      const ordered = list.slice().sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0) || String(a.id).localeCompare(String(b.id)));
      numberClassSeats(ordered).forEach((s) => byId.set(s.id, s));
    }
  }
  return students.map((s) => byId.get(s.id) || s);
}

export function classStudents(cohort, classNo) {
  return cohort.students.filter((s) => s.classNo === classNo);
}

export function playerClassStudents(cohort, classNo = PLAYER_CLASS_NO) {
  return classStudents(cohort, classNo);
}
