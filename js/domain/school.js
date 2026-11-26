/** 学校、班级与学生生成。玩家任教 2017 级卓行 16 班（70 人）。 */
import {
  CLASS_BLUEPRINT, TIER, SUBJECT_IDS, PERSONALITIES, FAMILY_TYPES,
  PLAYER_CLASS_NO, GRADE_YEAR, LI_SUBJECTS, WEN_SUBJECTS,
} from "./config.js";
import { clamp, gauss, hash01, pick, rngFrom, shuffle } from "./prng.js";
import { generateName } from "./names.js";

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
    const a = clamp(base + offset, 16, 99);
    ability[id] = round1(a);
    potential[id] = round1(clamp(a + 4 + rng() * 10, a, 99.5));
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
  // 笃学作为重点中学底部班，保留少量前部苗子，避免整层没有一本。
  if (tier === "duxue" && rng() < 0.13) mean += 10 + rng() * 8;
  const { ability, potential, base } = paintAbilities(rng, mean, tp.abilitySd, hint);
  const trackPref = pickTrack(rng, hint, ability);
  const family = pick(rng, FAMILY_TYPES);
  const personality = pick(rng, PERSONALITIES);
  const stability = clamp(38 + base * 0.45 + gauss(rng, 0, 6) + (tier === "yunxiu_exp" ? 8 : 0), 28, 97);
  const seatsPerRow = classNo === 0 || classNo === 1 ? 6 : 7;
  const seatIndex = seq - 1;
  const seat = { row: Math.floor(seatIndex / seatsPerRow) + 1, col: (seatIndex % seatsPerRow) + 1 };
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
    if (bp.no >= 31) continue; // 复卓另外生成
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
    const repeatStudents = generateRepeaters(entryYear, seed, usedNames, quality);
    students.push(...repeatStudents);
    for (const st of repeatStudents) {
      let cls = classes.find((c) => c.no === st.classNo);
      if (!cls) {
        cls = { no: st.classNo, name: `复卓${st.classNo}班`, short: "复卓班", tier: "fuzhuo", size: 0, studentIds: [], repeat: true };
        classes.push(cls);
      }
      cls.studentIds.push(st.id);
      cls.size = cls.studentIds.length;
    }
  }
  return { entryYear, students, classes };
}

/** 高三复读生：能力略高于原梯队均值，但仍是重点中学复读画像，不是人人清北。 */
export function generateRepeaters(forSeniorEntryYear, seed, usedNames, quality = 0) {
  // 2015 级在 2017-2018 学年读高三时，复读生主要来自上一届
  const rng = rngFrom(seed, "repeaters", forSeniorEntryYear);
  const students = [];
  const wenClasses = [31, 32, 33, 34];
  const liClasses = [35, 36, 37, 38, 39, 40];
  const wenSize = 58, liSize = 58;
  let seqW = 1, seqL = 1;
  const plan = [
    ...wenClasses.map((no) => ({ no, track: "wen", size: wenSize, hint: "wen" })),
    ...liClasses.map((no) => ({ no, track: "li", size: liSize, hint: "li" })),
  ];
  for (const p of plan) {
    for (let i = 0; i < p.size; i++) {
      // 复读生多数来自原卓行/凌霄/笃学，少数原云岫
      const roll = rng();
      const tierSrc = roll < 0.08 ? "yunxiu_key" : roll < 0.38 ? "lingxiao" : roll < 0.82 ? "zhuoxing" : "duxue";
      const classNo = p.no;
      const seq = p.track === "wen" ? seqW++ : seqL++;
      const st = makeStudent({
        rng, usedNames, entryYear: forSeniorEntryYear - 1,
        classNo, seq, tier: tierSrc, hint: p.hint, repeat: true,
        quality: quality + 2.2,
      });
      st.track = p.track;
      st.tier = "fuzhuo";
      st.originTier = tierSrc;
      students.push(st);
    }
  }
  return students;
}

export function generateOpeningSchool(seed, playerEntryYear = GRADE_YEAR) {
  // 开学时：高一=playerEntryYear，高二=year-1（已分科+二次分班），高三=year-2（含复卓）
  const cohorts = {};
  cohorts[playerEntryYear] = generateCohort(playerEntryYear, seed, { alreadySplit: false, withRepeat: false });
  cohorts[playerEntryYear - 1] = generateCohort(playerEntryYear - 1, seed, { alreadySplit: true, withRepeat: false, quality: -0.4 });
  cohorts[playerEntryYear - 2] = generateCohort(playerEntryYear - 2, seed, { alreadySplit: true, withRepeat: true, quality: 0.2 });
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

export function classStudents(cohort, classNo) {
  return cohort.students.filter((s) => s.classNo === classNo);
}

export function playerClassStudents(cohort, classNo = PLAYER_CLASS_NO) {
  return classStudents(cohort, classNo);
}
