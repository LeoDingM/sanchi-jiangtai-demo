/**
 * 校内竞赛窗口、奖项与自主招生/强基计划。
 * 奖项与头牌资格用确定性 PRNG，可复现；不改当次考试分数、省排或省控。
 * 2018/2019 高考走自主招生，2020 起走强基计划（2017 级高考在 2020，不得再叫自招）。
 * 通过后是降分录取，优惠只用于对照投档线，不写进高考总分。
 */
import { hash01 } from "./prng.js?v=t75u2";
import { QINGBEI } from "./jiangxi.js?v=t75u2";
import { formatSchoolName } from "./schoolNames.js?v=t75u2";

export const CONTEST_SUBJECTS = [
  { id: "math", name: "数学竞赛", tracks: ["li", "wen", "mixed"] },
  { id: "physics", name: "物理竞赛", tracks: ["li", "mixed"] },
  { id: "chemistry", name: "化学竞赛", tracks: ["li", "mixed"] },
  { id: "biology", name: "生物竞赛", tracks: ["li"] },
  { id: "chinese", name: "语文竞赛", tracks: ["li", "wen", "mixed"] },
  { id: "english", name: "英语竞赛", tracks: ["li", "wen", "mixed"] },
];

export const CONTEST_LEVELS = ["校内", "市级", "省级", "国家级"];

/** 校内安排的竞赛窗口，不是某年官方公告日期。日期随入学年滚动。 */
export function contestWindows(entryYear) {
  const y = Number(entryYear) || 2017;
  return [
    { id: "g1-school", date: `${y}-11-12`, grade: 1, maxLevel: "校内", label: "校内学科竞赛周" },
    { id: "g1-city", date: `${y + 1}-03-18`, grade: 1, maxLevel: "市级", label: "市级学科竞赛窗口" },
    { id: "g2-prov", date: `${y + 1}-11-10`, grade: 2, maxLevel: "省级", label: "省级学科竞赛窗口" },
    { id: "g2-nat", date: `${y + 2}-03-16`, grade: 2, maxLevel: "国家级", label: "全国学科竞赛窗口" },
  ];
}

export function windowsPassed(entryYear, date) {
  return contestWindows(entryYear).filter((w) => !date || String(date) >= w.date);
}

function subjectAbility(student, subjectId) {
  const a = Number(student?.ability?.[subjectId]);
  return Number.isFinite(a) ? a : 0;
}

function trackOf(student) {
  if (student?.track === "wen" || student?.trackPref === "wen") return "wen";
  if (student?.track === "li" || student?.trackPref === "li") return "li";
  return student?.track || "mixed";
}

function saltOf(student, extra) {
  return hash01(student?.id || "x", student?.name || "", extra);
}

/**
 * 一名学生在给定日期前已获得的竞赛奖。不是人人都有省级/国家级。
 * 头牌与学科能力突出者更常见；普通学生多为校内或没有。
 */
export function studentContestAwards(student, { date = "2099-12-31", seed = 1 } = {}) {
  if (!student) return [];
  const track = trackOf(student);
  const passed = windowsPassed(student.entryYear, date);
  if (!passed.length) return [];
  const awards = [];
  for (const sub of CONTEST_SUBJECTS) {
    if (sub.id === "biology" && !(student.ability && student.ability.biology != null) && !passed.some((w) => w.grade >= 2)) continue;
    if (sub.tracks && track !== "mixed" && !sub.tracks.includes(track) && !sub.tracks.includes("mixed")) continue;
    const ab = subjectAbility(student, sub.id === "biology" ? "chemistry" : sub.id);
    const base = ab + (student.tier === "yunxiu_exp" ? 4 : student.tier === "yunxiu_key" ? 1.5 : 0);
    for (const win of passed) {
      if (sub.id === "biology" && win.grade < 2) continue;
      const h = hash01(seed, student.id, student.name, sub.id, win.id, "enter");
      let enterP = 0.04;
      if (base >= 92) enterP = 0.85;
      else if (base >= 88) enterP = 0.62;
      else if (base >= 82) enterP = 0.32;
      else if (base >= 74) enterP = 0.12;
      else if (base >= 66) enterP = 0.06;
      if (win.maxLevel === "校内") enterP = Math.min(0.95, enterP + 0.25);
      if (win.maxLevel === "国家级") enterP *= 0.55;
      if (h >= enterP) continue;
      const roll = hash01(seed, student.id, student.name, sub.id, win.id, "award");
      let level = "校内";
      let place = "三等奖";
      if (win.maxLevel === "校内") {
        level = "校内";
        place = roll < 0.22 ? "一等奖" : roll < 0.55 ? "二等奖" : "三等奖";
      } else if (win.maxLevel === "市级") {
        if (base < 78 && roll > 0.55) continue;
        level = roll < 0.18 + Math.max(0, base - 86) * 0.03 ? "市级" : "校内";
        place = roll < 0.2 ? "一等奖" : roll < 0.5 ? "二等奖" : "三等奖";
      } else if (win.maxLevel === "省级") {
        if (base < 84) {
          if (roll > 0.35) continue;
          level = "市级";
        } else if (roll < 0.10 + Math.max(0, base - 90) * 0.04) level = "省级";
        else if (roll < 0.45) level = "市级";
        else level = "校内";
        place = roll < 0.16 ? "一等奖" : roll < 0.48 ? "二等奖" : "三等奖";
      } else {
        if (base < 90) {
          if (roll > 0.28) continue;
          level = roll < 0.4 ? "省级" : "市级";
        } else if (roll < 0.06 + Math.max(0, base - 94) * 0.03) level = "国家级";
        else if (roll < 0.32) level = "省级";
        else if (roll < 0.62) level = "市级";
        else continue;
        place = roll < 0.14 ? "一等奖" : roll < 0.45 ? "二等奖" : "三等奖";
      }
      awards.push({
        subjectId: sub.id,
        subject: sub.name,
        level,
        place,
        date: win.date,
        windowId: win.id,
        windowLabel: win.label,
      });
    }
  }
  awards.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) || a.subject.localeCompare(b.subject, "zh"));
  return awards;
}

export function awardsByLevel(awards) {
  const groups = { 校内: [], 市级: [], 省级: [], 国家级: [] };
  for (const a of awards || []) {
    (groups[a.level] || groups.校内).push(a);
  }
  return groups;
}

export function bestAwardScore(awards) {
  let best = 0;
  for (const a of awards || []) {
    let n = 0;
    if (a.level === "国家级") n = a.place === "一等奖" ? 14 : a.place === "二等奖" ? 11 : 8;
    else if (a.level === "省级") n = a.place === "一等奖" ? 8 : a.place === "二等奖" ? 5 : 3;
    else if (a.level === "市级") n = a.place === "一等奖" ? 2 : 1;
    if (n > best) best = n;
  }
  return best;
}

export function formatAward(a) {
  if (!a) return "";
  return `${a.level}${a.subject}${a.place}`;
}

/** 高考年份对应的特殊招生政策。2020 年起自主招生取消，改为强基计划。 */
export function recruitPolicy(gaokaoYear) {
  const y = Number(gaokaoYear);
  if (y && y <= 2019) {
    return {
      id: "zz",
      short: "自主招生",
      name: "高校自主招生",
      label: "自主招生优惠 / 降分录取",
      note: "通过后按优惠分对照投档线降分录取，不把优惠写入高考总分，也不改省排一分一段。",
    };
  }
  return {
    id: "qj",
    short: "强基计划",
    name: "强基计划",
    label: "强基计划综合录取（不改写高考总分）",
    note: "2020 年起自主招生已取消，改为强基计划。以高考成绩为主，竞赛金银等可增加入围或破格胜算；优惠只用于对照投档线，不写入高考总分，也不改省排。",
  };
}

export function isQingbeiName(name) {
  const n = String(name || "").replace(/^[★▲]+/, "").trim();
  return QINGBEI.has(n) || /^(清华大学|北京大学|北京大学医学部|清华|北大)$/.test(n);
}

export function qingbeiLine(track) {
  return track === "wen" ? 644 : 686;
}

/**
 * 头牌：该科类全校前几名。没有名次时不把普通考生当成头牌。
 */
export function isSchoolHead(trackRank, trackN, track = "li") {
  if (trackRank == null || !Number.isFinite(Number(trackRank))) return false;
  const n = Number(trackN) || 0;
  const r = Number(trackRank);
  if (track === "wen") return r <= 4;
  if (r <= 5) return true;
  if (r <= 8 && n >= 200) return true;
  return false;
}

function pickQingbeiUniversity(student, year, track, seed) {
  const h = hash01(seed, student.id, student.name, year, "qb-uni");
  if (track === "wen") return h < 0.62 ? "北京大学" : "清华大学";
  if (h < 0.48) return "清华大学";
  if (h < 0.90) return "北京大学";
  return "北京大学医学部";
}

/**
 * 计算自主招生/强基结果。不改分数。
 * ctx.trackRank / ctx.trackN 为该科类校排（高考或已有场次）。
 */
export function recruitOutcome(student, total, year, ctx = {}) {
  const policy = recruitPolicy(year);
  const track = student?.track === "wen" ? "wen" : "li";
  const awards = ctx.awards || studentContestAwards(student, { date: ctx.date || `${year}-06-07`, seed: ctx.seed ?? 1 });
  const awardScore = bestAwardScore(awards);
  const trackRank = ctx.trackRank;
  const head = isSchoolHead(trackRank, ctx.trackN, track) || (track !== "wen" && ctx.schoolRank != null && Number(ctx.schoolRank) <= 6);
  const strongAward = awardScore >= 5;
  const eligible = !!(head || strongAward);
  const empty = {
    policy,
    eligible: false,
    applied: false,
    passed: false,
    university: "",
    concession: 0,
    awardScore,
    awards,
    head,
    reason: eligible ? "" : "不具备头牌或竞赛省级以上奖项的特殊招生资格。",
  };
  if (!eligible) return empty;

  const applyH = hash01(ctx.seed ?? 1, student.id, student.name, year, policy.id, "apply");
  let applyP = head ? 0.82 : 0.35;
  if (awardScore >= 8) applyP = Math.min(0.95, applyP + 0.12);
  if (student.personality && /好强|自律/.test(student.personality)) applyP = Math.min(0.96, applyP + 0.06);
  const applied = applyH < applyP;
  if (!applied) {
    return { ...empty, eligible: true, reason: `具备${policy.short}资格，但未申请。` };
  }

  let passP = 0.12;
  if (trackRank != null) {
    if (trackRank === 1) passP = 0.88;
    else if (trackRank === 2) passP = 0.78;
    else if (trackRank === 3) passP = 0.64;
    else if (trackRank === 4) passP = 0.42;
    else if (trackRank <= 6) passP = 0.28;
    else if (trackRank <= 8) passP = 0.16;
  } else if (head) passP = 0.4;
  if (track === "wen") {
    if (trackRank != null && trackRank > 3) passP *= 0.35;
    else passP *= 0.55;
  }
  passP += Math.min(0.12, awardScore * 0.01);
  if (policy.id === "qj") passP *= 0.92;
  passP = Math.max(0.04, Math.min(0.93, passP));
  const passH = hash01(ctx.seed ?? 1, student.id, student.name, year, policy.id, "pass");
  const passed = passH < passP;
  const university = pickQingbeiUniversity(student, year, track, ctx.seed ?? 1);
  if (!passed) {
    return {
      ...empty,
      eligible: true,
      applied: true,
      passed: false,
      university,
      reason: `已申请${policy.short}（意向 ${formatSchoolName(university)}），未通过。`,
    };
  }

  let concession = policy.id === "qj" ? 12 : 14;
  if (trackRank === 1) concession += 6;
  else if (trackRank === 2) concession += 4;
  else if (trackRank === 3) concession += 2;
  concession += Math.min(6, awardScore);
  const cap = track === "wen" ? (policy.id === "qj" ? 16 : 18) : (policy.id === "qj" ? 22 : 24);
  concession = Math.min(concession, cap);
  concession = Math.max(8, Math.round(concession));

  return {
    policy,
    eligible: true,
    applied: true,
    passed: true,
    university,
    concession,
    awardScore,
    awards,
    head,
    reason: `通过${policy.short}，可对${formatSchoolName(university)}按 ${concession} 分对照投档线降分录取；高考总分与省排不变。`,
  };
}

export function effectiveAdmitScore(total, outcome) {
  if (!outcome?.passed) return Number(total);
  return Number(total) + Number(outcome.concession || 0);
}

export function meetsLineWithConcession(total, line, outcome) {
  if (total == null || line == null) return false;
  if (Number(total) >= Number(line)) return true;
  if (!outcome?.passed) return false;
  return Number(total) >= Number(line) - Number(outcome.concession || 0);
}
