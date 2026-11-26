/** 学校、班级与学生生成。玩家任教 2017 级卓行 16 班（74 人）。 */
import {
  CLASS_BLUEPRINT, TIER, SUBJECT_IDS, PERSONALITIES, FAMILY_TYPES,
  PLAYER_CLASS_NO, GRADE_YEAR, LI_SUBJECTS, WEN_SUBJECTS,
  REPEAT_CLASS_SIZE, REPEAT_WEN_NOS, REPEAT_LI_NOS, INSERT_REPEAT_CLASS_NOS,
} from "./config.js?v=t53u1";
import { clamp, gauss, hash01, pick, rngFrom, shuffle } from "./prng.js?v=t53u1";
import { generateName } from "./names.js?v=t53u1";
import { gradeStudent, scaleOf, packLastGaokao } from "./scores.js?v=t53u1";
import { provincialLines } from "./jiangxi.js?v=t53u1";
import { admitStudent, canInsertRepeat, packLastAdmission } from "./admission.js?v=t53u1";
import { examParams } from "./calendar.js?v=t53u1";

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


/**
 * 理科卓行各班点出一名稳定高于省控一本的头部，避免整班都挤在线边几分、一次考试一起过或一起不过。
 * 只抬已在班内最靠前的人，不抬整班均值，也不给笃学留苗。
 */
export function ensureZhuoxingClassSpread(students, seed = "zx-spread") {
  if (!students?.length) return students;
  const rng = rngFrom(seed, "zhuoxing-spread");
  const groups = new Map();
  for (const s of students) {
    if (s.repeat || s.tier !== "zhuoxing") continue;
    if ((s.track || s.trackPref) === "wen") continue;
    const no = s.classNo;
    if (!groups.has(no)) groups.set(no, []);
    groups.get(no).push(s);
  }
  for (const list of groups.values()) {
    if (!list.length) continue;
    const ordered = list.slice().sort((a, b) => examAbilityMean(b) - examAbilityMean(a) || String(a.id).localeCompare(String(b.id)));
    const best = ordered[0];
    const cur = examAbilityMean(best);
    if (cur < 73.5) {
      const target = 74 + rng() * 3; // 74–77，对应高考约高出理科一本十余到二十多分
      shiftAbilityToward(best, Math.min(77.5, target), 82, 16);
    }
    if ((best.stability ?? 60) < 70) firmStability(best, 72, 84, rng);
  }
  return students;
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
  const ev = {
    id: `prior-gaokao-${year}`,
    name: "上次高考",
    examKind: "gaokao",
    date: `${year}-06-07`,
    grade: 3,
    year,
  };
  const params = examParams(ev);
  return { ...ev, difficulty: params.difficulty, dispersion: params.dispersion };
}

/** 为开局合成的复读生补上上次高考各科分数；必要时压到省控一本以下，表示发挥失常。 */
export function synthesizeLastGaokao(student, gaokaoYear, { forceMissFirst = false, rng = null } = {}) {
  const track = student.track === "wen" ? "wen" : "li";
  const lines = provincialLines(gaokaoYear, track) || provincialLines(2020, track);
  const sc = gradeStudent(student, lastGaokaoExam(gaokaoYear), scaleOf(3, "gaokao"), 0);
  let total = sc.total;
  if (forceMissFirst && lines && total >= lines.first) {
    const gap = rng ? 1 + Math.floor(rng() * 22) : 8;
    total = lines.first - gap;
  }
  return packLastGaokao({ ...sc, total }, {
    year: gaokaoYear,
    track,
    firstLine: lines?.first ?? null,
    secondLine: lines?.second ?? null,
  });
}

export function attachSynthesizedLastAdmission(student, lastGaokao, { abandoned = true } = {}) {
  if (!student || !lastGaokao) return student;
  const adm = admitStudent(student, lastGaokao.total, lastGaokao.year);
  student.lastAdmission = packLastAdmission(adm, { abandoned });
  return student;
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

function evenShare(total, parts) {
  const n = Math.max(0, parts);
  if (n <= 0) return [];
  const base = Math.floor(total / n);
  let rem = total - base * n;
  return Array.from({ length: n }, () => {
    const v = base + (rem > 0 ? 1 : 0);
    if (rem > 0) rem -= 1;
    return v;
  });
}

function fitQuotas(desired, seats) {
  const q = desired.map((v, i) => Math.max(0, Math.min(Math.max(0, v), seats[i] || 0)));
  let unplaced = 0;
  for (let i = 0; i < desired.length; i++) {
    const want = Math.max(0, desired[i] || 0);
    unplaced += want - q[i];
  }
  for (let i = 0; i < q.length && unplaced > 0; i++) {
    const room = (seats[i] || 0) - q[i];
    if (room <= 0) continue;
    const take = Math.min(room, unplaced);
    q[i] += take;
    unplaced -= take;
  }
  return q;
}

/** 把二本以下再分成「刚掉线」和长低分尾巴，避免最低分全被最弱班收走。 */
function splitLowTail(rest, secondLine) {
  const cut = secondLine != null ? secondLine - 80 : null;
  if (cut != null) {
    const upper = [];
    const tail = [];
    for (const s of rest) {
      if ((s.lastGaokao?.total ?? -Infinity) < cut) tail.push(s);
      else upper.push(s);
    }
    return { upper, tail };
  }
  const nTail = Math.round(rest.length * 0.18);
  const splitAt = Math.max(0, rest.length - nTail);
  return { upper: rest.slice(0, splitAt), tail: rest.slice(splitAt) };
}

function argmaxQuota(left) {
  let best = -1;
  for (let i = 0; i < left.length; i++) {
    if (left[i] <= 0) continue;
    if (best < 0 || left[i] > left[best]) best = i;
  }
  return best;
}

function fillByQuota(buckets, list, quotas, cap, pickIdx) {
  const left = quotas.slice();
  for (let i = 0; i < list.length; i++) {
    let idx = pickIdx ? pickIdx(i, left) : -1;
    if (idx == null || idx < 0 || left[idx] <= 0) idx = argmaxQuota(left);
    if (idx < 0) {
      idx = buckets.findIndex((b) => b.length < cap);
      if (idx < 0) idx = 0;
    }
    buckets[idx].push(list[i]);
    if (left[idx] > 0) left[idx] -= 1;
  }
}

/**
 * 把补习生分到文/理科各班：按上次高考位次分带，不按某年省控绝对人数（开局合成分与当年线可能错位）。
 * 最好的一班拿更多一本，但尖子不全塞进 37/31；第一进最好的班，第二、第三尽量进其他班。
 * 最好班不是清一色尖子班：二本以上约按 70 人里 40% 掉线来留位子，并分到一部分长低分尾巴。
 */
function distributeToTutoringClasses(sorted, nos, rng) {
  if (!sorted.length) return [];
  const nClasses = nos.length;
  const cap = REPEAT_CLASS_SIZE;
  const bestIdx = Math.floor(rng() * nClasses);
  const year = sorted.find((s) => s.lastGaokao?.year != null)?.lastGaokao.year;
  const track = sorted.find((s) => s.lastGaokao?.track)?.lastGaokao.track
    || (sorted[0].track === "wen" ? "wen" : "li");
  const lines = year ? provincialLines(year, track) : null;
  const firstLine = lines?.first ?? sorted.find((s) => s.lastGaokao?.firstLine != null)?.lastGaokao.firstLine;
  const secondLine = lines?.second;
  let firstBand, secondBand, rest;
  if (firstLine != null && secondLine != null) {
    firstBand = sorted.filter((s) => (s.lastGaokao?.total ?? -Infinity) >= firstLine);
    secondBand = sorted.filter((s) => {
      const t = s.lastGaokao?.total ?? -Infinity;
      return t >= secondLine && t < firstLine;
    });
    rest = sorted.filter((s) => (s.lastGaokao?.total ?? -Infinity) < secondLine);
  } else {
    const n = sorted.length;
    const nFirst = Math.min(n, Math.max(n >= 12 ? 3 : (n > 0 ? 1 : 0), Math.round(n * 33 / 420)));
    const nAboveSecond = Math.min(n, Math.max(nFirst, Math.round(n * 237 / 420)));
    firstBand = sorted.slice(0, nFirst);
    secondBand = sorted.slice(nFirst, nAboveSecond);
    rest = sorted.slice(nAboveSecond);
  }
  const nFirst = firstBand.length;
  const nSecond = secondBand.length;

  const qFirst = Array(nClasses).fill(0);
  const qSecond = Array(nClasses).fill(0);
  const qRest = Array(nClasses).fill(0);
  let bestFirst = 0;
  if (nFirst > 0) {
    const raw = Math.round(nFirst * 8 / 33);
    bestFirst = clamp(raw, Math.min(6, nFirst), Math.min(9, nFirst));
    if (nFirst >= nClasses && nFirst - bestFirst < nClasses - 1) bestFirst = nFirst - (nClasses - 1);
    bestFirst = clamp(bestFirst, 1, Math.min(cap, nFirst));
  }
  qFirst[bestIdx] = bestFirst;
  evenShare(nFirst - bestFirst, nClasses - 1).forEach((v, i) => {
    qFirst[i < bestIdx ? i : i + 1] = v;
  });

  // 70 人编制下若仍按 47 人上二本去塞，最好班平均会被抬离二本线；约 44 人上线、近四成掉线更接近真实量级。
  const bestAboveTarget = 44;
  const bestSecond = Math.min(nSecond, Math.max(0, bestAboveTarget - bestFirst), cap - qFirst[bestIdx]);
  qSecond[bestIdx] = bestSecond;
  evenShare(nSecond - bestSecond, nClasses - 1).forEach((v, i) => {
    qSecond[i < bestIdx ? i : i + 1] = v;
  });
  for (let i = 0; i < nClasses; i++) {
    const overflow = qFirst[i] + qSecond[i] - cap;
    if (overflow <= 0) continue;
    qSecond[i] -= overflow;
    let left = overflow;
    for (let j = 0; j < nClasses && left > 0; j++) {
      if (j === i) continue;
      const room = cap - qFirst[j] - qSecond[j];
      if (room <= 0) continue;
      const take = Math.min(room, left);
      qSecond[j] += take;
      left -= take;
    }
  }

  const seats = qFirst.map((f, i) => cap - f - qSecond[i]);
  const { upper, tail } = splitLowTail(rest, secondLine);
  const seatSum = seats.reduce((a, b) => a + b, 0);
  const qTail = Array(nClasses).fill(0);
  const nTail = Math.min(tail.length, seatSum);
  if (nTail > 0) {
    const bestTail = Math.min(
      seats[bestIdx],
      nTail,
      Math.max(5, Math.round(nTail * 0.12)),
      10,
    );
    const desiredTail = Array(nClasses).fill(0);
    desiredTail[bestIdx] = bestTail;
    evenShare(nTail - bestTail, nClasses - 1).forEach((v, i) => {
      desiredTail[i < bestIdx ? i : i + 1] = v;
    });
    fitQuotas(desiredTail, seats).forEach((v, i) => { qTail[i] = v; });
  }
  const seatsAfterTail = seats.map((s, i) => Math.max(0, s - qTail[i]));
  const nUpper = upper.length;
  const upperSeatSum = seatsAfterTail.reduce((a, b) => a + b, 0);
  if (nUpper >= upperSeatSum) {
    seatsAfterTail.forEach((v, i) => { qRest[i] = v; });
  } else {
    const desiredUpper = evenShare(nUpper, nClasses);
    fitQuotas(desiredUpper, seatsAfterTail).forEach((v, i) => { qRest[i] = v; });
  }

  const buckets = Array.from({ length: nClasses }, () => []);
  const otherFirst = shuffle(rng, qFirst.map((n, j) => j).filter((j) => j !== bestIdx && qFirst[j] > 0));
  fillByQuota(buckets, firstBand, qFirst, cap, (i, left) => {
    if (i === 0 && left[bestIdx] > 0) return bestIdx;
    // 第二、第三及随后几名较稳的一本先各进其他班，避免有的班只分到擦线生、今年一本掉光。
    if (i >= 1 && i <= otherFirst.length) {
      const dest = otherFirst[i - 1];
      if (dest != null && left[dest] > 0) return dest;
    }
    // 最好班再拿够较稳的一本额度，避免只剩擦线的人、今年最高分掉到 550 出头。
    if (left[bestIdx] > 0) return bestIdx;
    return -1;
  });
  const nearCut = firstLine != null ? firstLine - 18 : null;
  let highSecond, midSecond;
  if (nearCut != null) {
    highSecond = secondBand.filter((s) => (s.lastGaokao?.total ?? -Infinity) >= nearCut);
    midSecond = secondBand.filter((s) => (s.lastGaokao?.total ?? -Infinity) < nearCut);
  } else {
    const nHigh = Math.round(secondBand.length * 0.25);
    highSecond = secondBand.slice(0, nHigh);
    midSecond = secondBand.slice(nHigh);
  }
  const qHigh = Array(nClasses).fill(0);
  const qMid = Array(nClasses).fill(0);
  fitQuotas(evenShare(highSecond.length, nClasses), qSecond).forEach((v, i) => { qHigh[i] = v; });
  const seatsForMid = qSecond.map((q, i) => q - qHigh[i]);
  const desiredMid = Array(nClasses).fill(0);
  desiredMid[bestIdx] = Math.min(seatsForMid[bestIdx], midSecond.length);
  evenShare(Math.max(0, midSecond.length - desiredMid[bestIdx]), Math.max(1, nClasses - 1)).forEach((v, i) => {
    desiredMid[i < bestIdx ? i : i + 1] = v;
  });
  fitQuotas(desiredMid, seatsForMid).forEach((v, i) => { qMid[i] = v; });
  fillByQuota(buckets, highSecond, qHigh, cap);
  fillByQuota(buckets, midSecond, qMid, cap);
  fillByQuota(buckets, upper, qRest, cap);
  fillByQuota(buckets, tail, qTail, cap);
  const assigned = new Set(buckets.flat().map((s) => s.id));
  for (const s of sorted) {
    if (assigned.has(s.id)) continue;
    let idx = buckets.findIndex((b) => b.length < cap);
    if (idx < 0) idx = nClasses - 1;
    buckets[idx].push(s);
  }

  const out = [];
  buckets.forEach((list, i) => {
    for (const s of list) out.push({ ...s, classNo: nos[i], tier: "fuzhuo" });
  });
  return out;
}

function assignTutoringClasses(students, seedKey = "tutoring") {
  const out = [];
  const plans = [
    { track: "wen", nos: REPEAT_WEN_NOS },
    { track: "li", nos: REPEAT_LI_NOS },
  ];
  for (const p of plans) {
    const arr = students.filter((s) => p.track === "wen" ? s.track === "wen" : s.track !== "wen")
      .slice()
      .sort(compareLastGaokao);
    const rng = rngFrom(seedKey, "assign-tutoring", p.track, arr.map((s) => s.id).join(","));
    distributeToTutoringClasses(arr, p.nos, rng).forEach((s) => out.push(s));
  }
  return applyRepeaterSeating(out);
}

/** 毕业留下的复读生：失常的原 0/翠微插回对应班，其余编入补习班并按上次高考分排座。 */
export function placeGraduatingRepeaters(staying, admissionById = {}, seedKey = "promote-repeat") {
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
  return [...assignTutoringClasses(tutoring, seedKey), ...inserts];
}

function examAbilityIds(track) {
  return track === "wen"
    ? ["chinese", "math", "english", "politics", "history", "geography"]
    : ["chinese", "math", "english", "physics", "chemistry", "biology"];
}

function shiftAbilityToward(st, targetBase, cap = 99, floor = 16) {
  const ids = examAbilityIds(st.track);
  const have = ids.filter((id) => st.ability?.[id] != null);
  if (!have.length) return st;
  const cur = have.reduce((sum, id) => sum + Number(st.ability[id] || 0), 0) / have.length;
  const shift = targetBase - cur;
  const allIds = new Set([...Object.keys(st.ability || {}), ...have]);
  const lo = Math.max(0, floor);
  for (const id of allIds) {
    const a = clamp((st.ability[id] || 0) + shift, lo, Math.min(99, cap));
    st.ability[id] = round1(a);
    const pot = clamp((st.potential?.[id] || a) + shift, a, 99.5);
    st.potential[id] = round1(pot);
  }
  return st;
}

function examAbilityMean(st) {
  const ids = examAbilityIds(st.track);
  const have = ids.filter((id) => st.ability?.[id] != null);
  if (!have.length) return 0;
  return have.reduce((sum, id) => sum + Number(st.ability[id] || 0), 0) / have.length;
}

function firmStability(st, lo, hi, rng) {
  const v = lo + rng() * Math.max(0, hi - lo);
  st.stability = round1(clamp(Math.max(st.stability || 0, v), lo, 97));
}

function takeUnique(list, n, rng, used) {
  const pool = shuffle(rng, list.filter((s) => !used.has(s.id)));
  const out = pool.slice(0, Math.min(n, pool.length));
  out.forEach((s) => used.add(s.id));
  return out;
}

/** 给补习班点出一本带、薄薄高尾，以及理科长低分尾巴。理科压在厦大/矿大/南大量级，文科顶端可到人大/厦大，不年年剧本化。 */
function plantTutoringProfile(students, rng) {
  const used = new Set();
  const li = students.filter((s) => s.track !== "wen");
  const wen = students.filter((s) => s.track === "wen");

  const liTops = [
    93.8 + rng() * 0.9, // 约 630–640：按计分锚点约 94 能力才到这档，高稳定以免个别场次冲到 655
    85.4 + rng() * 1.2, // 约 590–610，矿大量级
    79.8 + rng() * 2.0, // 约 555–590，南大量级
  ];
  if (rng() < 0.35) liTops.push(76.8 + rng() * 1.8);
  takeUnique(li, liTops.length, rng, used).forEach((s, i) => {
    shiftAbilityToward(s, liTops[i], i === 0 ? 95.0 : (i === 1 ? 87.6 : 84.2));
    firmStability(s, 88, 96, rng);
  });
  // 其余一本来自稍稳的过线带，避免整班二十多个一本，也避免弱班只有擦线生。
  const nLiFirst = Math.min(30, Math.max(0, li.length - used.size));
  takeUnique(li, nLiFirst, rng, used).forEach((s) => {
    shiftAbilityToward(s, 68.2 + rng() * 3.6, 75);
    firmStability(s, 74, 86, rng);
  });

  // 长低分尾巴：310–379 一带有多人，并有极少数 150–300 的特别低分。分班时最好班也会分到一部分。
  if (li.length >= 80) {
    const nMidLow = Math.min(56, Math.max(0, li.length - used.size));
    takeUnique(li, nMidLow, rng, used).forEach((s) => shiftAbilityToward(s, 30 + rng() * 9, 42, 16));
    const nFloor = Math.min(rng() < 0.5 ? 8 : 10, Math.max(0, li.length - used.size));
    takeUnique(li, nFloor, rng, used).forEach((s, i) => {
      const target = i === 0 ? 4 + rng() * 8 : 12 + rng() * 16;
      shiftAbilityToward(s, target, 28, 3);
    });
  }
  // 加宽标准差后，未点名的理科生若随机摸到一本，拉回二本附近，避免一本膨胀。
  for (const s of li) {
    if (used.has(s.id)) continue;
    if (examAbilityMean(s) > 63.5) shiftAbilityToward(s, 55 + rng() * 6, 63);
  }

  const wenFirst = rng() < 0.58 ? 96.0 + rng() * 2.2 : 91.0 + rng() * 3.0;
  const wenSecond = rng() < 0.55 ? 92.0 + rng() * 2.2 : 87.0 + rng() * 3.0;
  takeUnique(wen, 2, rng, used).forEach((s, i) => shiftAbilityToward(s, i === 0 ? wenFirst : wenSecond, i === 0 ? 99 : 96));
  const nWenFirst = Math.min(10, Math.max(0, wen.length - used.size));
  takeUnique(wen, nWenFirst, rng, used).forEach((s) => shiftAbilityToward(s, 70 + rng() * 4, 78));
  // 文科只作轻度保护，免得加宽补习班标准差后一本膨胀；顶端仍由上面两点出。
  for (const s of wen) {
    if (used.has(s.id)) continue;
    if (examAbilityMean(s) > 66) shiftAbilityToward(s, 58 + rng() * 6, 66);
  }
}

/** 高三复读生：能力按补习班层次生成，主体略强于普通卓行、远低于凌霄，并带长低分尾巴，不是按重点/凌霄再改标签。 */
export function generateRepeaters(forSeniorEntryYear, seed, usedNames, quality = 0, { regulars = [] } = {}) {
  // 高三补习班：文科 31–36、理科 37–42，每班 70 人。先按补习班画像生成再分班，班内按上次高考总分排座。
  const rng = rngFrom(seed, "repeaters", forSeniorEntryYear);
  const students = [];
  const gaokaoYear = priorGaokaoYear(forSeniorEntryYear);
  const plan = [
    ...REPEAT_WEN_NOS.map((no) => ({ no, track: "wen", size: REPEAT_CLASS_SIZE, hint: "wen" })),
    ...REPEAT_LI_NOS.map((no) => ({ no, track: "li", size: REPEAT_CLASS_SIZE, hint: "li" })),
  ];
  let seqCounter = 1;
  for (const p of plan) {
    for (let i = 0; i < p.size; i++) {
      // 来源多数仍是卓行/笃学，少数凌霄、极少数重点；只作档案来历，不决定能力。
      const roll = rng();
      const originTier = roll < 0.04 ? "yunxiu_key" : roll < 0.20 ? "lingxiao" : roll < 0.72 ? "zhuoxing" : "duxue";
      const st = makeStudent({
        rng, usedNames, entryYear: forSeniorEntryYear - 1,
        classNo: p.no, seq: seqCounter, tier: "fuzhuo", hint: p.hint, repeat: true,
        quality: quality * 0.2,
      });
      seqCounter += 1;
      st.track = p.track;
      st.tier = "fuzhuo";
      st.originTier = originTier;
      st.insertedRepeat = false;
      students.push(st);
    }
  }
  plantTutoringProfile(students, rng);
  for (const st of students) {
    st.lastGaokao = synthesizeLastGaokao(st, gaokaoYear);
    attachSynthesizedLastAdmission(st, st.lastGaokao, { abandoned: true });
  }
  const assigned = assignTutoringClasses(students, [seed, "repeat-assign", forSeniorEntryYear].join("|"));

  const insertRng = rngFrom(seed, "repeat-inserts", forSeniorEntryYear);
  const inserts = [];
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
      attachSynthesizedLastAdmission(st, st.lastGaokao, { abandoned: true });
      inserts.push(st);
    }
  }
  return applyRepeaterSeating(assigned.concat(inserts).concat(regulars)).filter((s) => s.repeat);
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
