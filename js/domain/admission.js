/** 按江西公开投档线/位次将高考分数对应到真实大学，文理、年份、批次分开。 */
import { provincialLines, provincialRank, universities, uniTier, QINGBEI, gaokaoScheme, provincialEnrollmentBatch } from "./jiangxi.js?v=t66u2";
import { formatSchoolName } from "./schoolNames.js?v=t66u2";
import { INSERT_REPEAT_CLASS_NOS, TIER } from "./config.js?v=t66u2";
import { hash01 } from "./prng.js?v=t66u2";
import {
  recruitOutcome, recruitPolicy, isQingbeiName, meetsLineWithConcession,
  studentContestAwards,
} from "./contests.js?v=t66u2";

/** 校内规则示意：不是官方征集志愿名单，也不计入省控一本上线人数。 */
export const SUPPLEMENT_SOURCE = "校内规则示意：离一本省控线很近的二本可能被弱一本院校的冷门专业征集，不是官方征集志愿名单，也不计入省控一本上线人数。";

export const COLD_MAJORS = {
  li: ["采矿工程", "测绘工程", "农业资源与环境", "动物科学", "林学", "园艺"],
  wen: ["历史学", "哲学", "图书馆学", "档案学", "农林经济管理"],
};

/**
 * 只比一本省控高一点点的学生可能主动选二本里的好专业。
 * 南昌航空大学软件工程：2020 年江西理科在「二本软件」批次（院校代号 8227）招生，
 * 公开投档线 534、最低位次 44301（南昌航空大学分专业录取统计，精英高考网、91 高考网等转载）；
 * 与仓库 jiangxi2020.js 中该校普通二本理工 532、一批理工 552 不是同一计划。
 * 2018 年同口径二本软件投档 517（院校代号 8227）。非 2020 年按省控分差平移，不伪造当年完整投档表。
 */
export const NCHU_SOFTWARE_SOURCE = "2020年江西理科二本软件批次（院校代号8227）南昌航空大学软件工程，公开投档线534、最低位次44301；与该校普通二本理工532、一批理工552不是同一计划。来源：南昌航空大学分专业录取统计公开转载。非2020年按省控分差平移，不是当年完整投档表。";

export const GOOD_SECOND_PROGRAMS = [
  { name: "南昌航空大学", major: "软件工程", track: "li", batch: "二批", score: 534, rank: 44301, yearBase: 2020, source: NCHU_SOFTWARE_SOURCE, special: "nchu-software" },
  { name: "南京工程学院", major: "电气工程及其自动化", track: "li", batch: "二批", score: 544, rank: 38083, yearBase: 2020, source: "2020年江西公开二批投档（仓库 jiangxi2020.js）" },
  { name: "桂林电子科技大学", major: "计算机科学与技术", track: "li", batch: "二批", score: 539, rank: 40788, yearBase: 2020, source: "2020年江西公开二批投档（仓库 jiangxi2020.js）" },
  { name: "昆明理工大学", major: "计算机科学与技术", track: "li", batch: "二批", score: 537, rank: 42305, yearBase: 2020, source: "2020年江西公开二批投档（仓库 jiangxi2020.js）" },
  { name: "山东财经大学", major: "会计学", track: "li", batch: "二批", score: 541, rank: 39555, yearBase: 2020, source: "2020年江西公开二批投档（仓库 jiangxi2020.js）" },
  { name: "重庆工商大学", major: "财务管理", track: "li", batch: "二批", score: 538, rank: 41840, yearBase: 2020, source: "2020年江西公开二批投档（仓库 jiangxi2020.js）" },
  { name: "华东交通大学", major: "土木工程", track: "li", batch: "二批", score: 522, rank: 52743, yearBase: 2020, source: "2020年江西公开二批投档（仓库 jiangxi2020.js）" },
  { name: "河南科技大学", major: "汉语言文学", track: "wen", batch: "二批", score: 546, rank: 11059, yearBase: 2020, source: "2020年江西公开二批投档（仓库 jiangxi2020.js）" },
  { name: "吉首大学", major: "汉语言文学", track: "wen", batch: "二批", score: 545, rank: 11374, yearBase: 2020, source: "2020年江西公开二批投档（仓库 jiangxi2020.js）" },
  { name: "江西科技师范大学", major: "小学教育", track: "wen", batch: "二批", score: 538, rank: 14438, yearBase: 2020, source: "2020年江西公开二批投档（仓库 jiangxi2020.js）" },
  { name: "长沙学院", major: "汉语言文学", track: "wen", batch: "二批", score: 549, rank: 10039, yearBase: 2020, source: "2020年江西公开二批投档（仓库 jiangxi2020.js）" },
];

/** over = 总分 − 一本省控。仅 0–15 分有机会，越近越高。 */
export function goodSecondProgramProbability(over) {
  const g = Math.round(Number(over));
  if (g < 0 || g > 15) return 0;
  if (g <= 2) return 0.34;
  if (g <= 5) return 0.24;
  if (g <= 9) return 0.16;
  if (g <= 12) return 0.10;
  return 0.07;
}

export function goodSecondProgramPool(track, year, total) {
  return GOOD_SECOND_PROGRAMS
    .filter((p) => p.track === track)
    .map((p) => ({ ...p, adjScore: p.score + lineShift(year, track, "二批") }))
    .filter((p) => total >= p.adjScore)
    .sort((a, b) => b.adjScore - a.adjScore || String(a.name).localeCompare(String(b.name), "zh"));
}

function pickGoodSecondProgram(student, year, track, total) {
  const cand = goodSecondProgramPool(track, year, total);
  if (!cand.length) return null;
  let best = cand[0];
  let bestScore = -1;
  for (const p of cand) {
    let sc = hash01(student.id, year, "good-second", p.name, p.major);
    if (p.special === "nchu-software" && (student.majorPref === "理工" || student.majorPref === "综合")) sc += 0.18;
    if (student.majorPref === "财经" && /财经|商|会计|财务/.test(p.major + p.name)) sc += 0.12;
    if (student.majorPref === "师范" && /教育|师范/.test(p.major + p.name)) sc += 0.12;
    if (sc > bestScore) { best = p; bestScore = sc; }
  }
  return best;
}

export function isProvincialFirst(admission) {
  if (admission == null) return false;
  if (admission.total != null && admission.firstLine != null) {
    return Number(admission.total) >= Number(admission.firstLine);
  }
  if (admission.lineBand === "first") return true;
  if (admission.lineBatch === "一批" || admission.lineBatch === "特控") return true;
  // 轻量筛选行或旧存档缺省控字段时，不把「选二本好专业」的二批录取误计为一本上线。
  if (admission.firstLine == null && admission.lineBatch == null && admission.batch === "一批" && !admission.goodSecond && !admission.supplement) return true;
  return false;
}

export function isProvincialSecond(admission) {
  if (admission == null) return false;
  if (admission.total != null && admission.secondLine != null) {
    return Number(admission.total) >= Number(admission.secondLine);
  }
  if (admission.lineBand === "first" || admission.lineBand === "second") return true;
  if (["一批", "二批", "本科批", "特控"].includes(admission.lineBatch)) return true;
  if (admission.secondLine == null && admission.lineBatch == null && ["一批", "二批", "本科批"].includes(admission.batch)) return true;
  return false;
}

const REGULAR_MAJORS = {
  财经: ["金融学", "会计学", "财务管理", "国际经济与贸易"],
  师范: ["汉语言文学", "数学与应用数学", "英语", "小学教育"],
  理工: ["计算机科学与技术", "电气工程及其自动化", "机械设计制造及其自动化", "土木工程"],
  医学: ["临床医学", "护理学", "药学", "预防医学"],
  文史: ["汉语言文学", "新闻学", "汉语言"],
  法学: ["法学", "政治学与行政学", "社会学"],
  综合: ["经济学", "汉语言文学", "计算机科学与技术"],
};

export function lineShift(year, track, batch) {
  if (year === 2020) return 0;
  const y = provincialLines(year, track);
  const b = provincialLines(2020, track);
  if (!y || !b) return 0;
  if (batch === "一批") return y.first - b.first;
  if (batch === "二批") return y.second - b.second;
  return 0;
}

function categoryMatch(uni, pref) {
  const c = uni.category || "";
  const n = uni.name || "";
  if (!pref) return 0;
  if (pref === "财经" && (c === "财经" || /财经|工商|金融|审计|经贸/.test(n))) return 2;
  if (pref === "师范" && (c === "师范" || /师范|教育/.test(n))) return 2;
  if (pref === "理工" && (c === "理工" || /工业|航空|科技|交通|理工|矿业|地质|石油/.test(n))) return 2;
  if (pref === "医学" && /医科|医学|药科|中医药/.test(n)) return 2;
  if (pref === "文史" && /文史|语言|民族|社会/.test(n)) return 2;
  if (pref === "法学" && /政法|法学/.test(n)) return 2;
  if (pref === "综合" && c === "综合") return 1;
  return 0;
}

function pickFrom(list, studentId, year, tag) {
  if (!list.length) return "";
  const i = Math.floor(hash01(studentId, year, tag) * list.length) % list.length;
  return list[i];
}

function pickRegularMajor(student, year) {
  const pool = REGULAR_MAJORS[student.majorPref] || REGULAR_MAJORS["综合"];
  return pickFrom(pool, student.id, year, "major");
}

function coldMajorPool(track, pref) {
  let pool = (track === "wen" ? COLD_MAJORS.wen : COLD_MAJORS.li).slice();
  // 补录专业尽量不要贴合热门意向
  if (pref === "文史") pool = pool.filter((m) => m !== "历史学");
  if (pref === "财经") pool = pool.filter((m) => m !== "农林经济管理");
  if (!pool.length) pool = (track === "wen" ? COLD_MAJORS.wen : COLD_MAJORS.li).slice();
  return pool;
}

function pickColdMajor(student, year, track) {
  return pickFrom(coldMajorPool(track, student.majorPref), student.id, year, "cold-major");
}

/** gap = 一本省控 − 总分。仅 1–10 分有机会，越近越高，超出为 0。 */
export function supplementProbability(gap) {
  const g = Math.round(Number(gap));
  if (g < 1 || g > 10) return 0;
  if (g === 1) return 0.30;
  if (g === 2) return 0.28;
  if (g === 3) return 0.25;
  if (g === 4) return 0.17;
  if (g === 5) return 0.15;
  if (g === 6) return 0.13;
  if (g === 7) return 0.08;
  if (g === 8) return 0.07;
  if (g === 9) return 0.06;
  return 0.05;
}

function isCooperativeUni(name) {
  return /诺丁汉|利物浦|肯恩|西交利物浦/.test(name || "");
}

/** 一批且非 211/985 的弱一本，优先投档线靠近该年一本省控的院校。 */
export function supplementUniversityPool(track, year, firstLine) {
  const pool = universities()
    .filter((u) => u.track === track && u.batch === "一批" && uniTier(u.name) === "other" && !isCooperativeUni(u.name))
    .map((u) => ({ ...u, adjScore: u.score + lineShift(year, track, u.batch) }))
    .sort((a, b) => Math.abs(a.adjScore - firstLine) - Math.abs(b.adjScore - firstLine) || a.adjScore - b.adjScore || a.name.localeCompare(b.name, "zh"));
  return pool.slice(0, 10);
}

function pickSupplementUniversity(student, year, track, firstLine) {
  const cand = supplementUniversityPool(track, year, firstLine);
  if (!cand.length) return null;
  let best = cand[0];
  let bestScore = -1;
  for (const u of cand) {
    const sc = hash01(student.id, year, "supplement-uni", u.name);
    if (sc > bestScore) {
      best = u;
      bestScore = sc;
    }
  }
  if (uniTier(best.name) !== "other" || best.batch !== "一批") return null;
  return best;
}

export function admitStudent(student, total, year, ctx = {}) {
  const track = student.track === "wen" ? "wen" : "li";
  const lineOpts = { seed: ctx.seed, difficulty: ctx.difficulty };
  const lines = provincialLines(year, track, lineOpts);
  const rank = provincialRank(total, track, year, lineOpts);
  const pool = universities()
    .filter((u) => u.track === track)
    .map((u) => ({ ...u, adjScore: u.score + lineShift(year, track, u.batch) }))
    .sort((a, b) => b.adjScore - a.adjScore || (a.rank ?? 9e9) - (b.rank ?? 9e9));

  // 省控批次按总分对照当年省控，与录取院校批次分开。
  // 新高考年份：过特控或过本科线在录取显示上都是本科批；内部 band 仍区分能否对照 2020 一批/二批院校池。
  const scheme = gaokaoScheme(year);
  let lineBand = "none";
  if (total >= lines.first) lineBand = "first";
  else if (total >= lines.second) lineBand = "second";
  else if (total >= (lines.special ?? 150)) lineBand = "special";
  const lineBatch = provincialEnrollmentBatch(year, lineBand);

  const recruit = ctx.recruit || recruitOutcome(student, total, year, {
    seed: ctx.seed ?? 1,
    date: ctx.date || `${year}-06-07`,
    trackRank: ctx.trackRank,
    trackN: ctx.trackN,
    schoolRank: ctx.schoolRank,
    awards: ctx.awards,
  });

  const reachable = (u) => {
    if (total >= u.adjScore) return true;
    if (recruit?.passed && recruit.university === u.name) {
      return meetsLineWithConcession(total, u.adjScore, recruit);
    }
    return false;
  };

  let batch = lineBatch;
  const eligible = pool.filter((u) => {
    if (!reachable(u)) return false;
    if (lineBand === "first") return u.batch === "一批" || (recruit?.passed && recruit.university === u.name);
    if (lineBand === "second") return u.batch !== "一批" || (recruit?.passed && recruit.university === u.name);
    if (lineBand === "special") return u.batch === "专科";
    return false;
  });

  let picked = null;
  if (eligible.length) {
    const top = eligible.slice(0, 8);
    // 通过自招/强基且分数对照优惠后够线时，敢于冲该校，不挤出名单。
    if (recruit?.passed && recruit.university) {
      const target = eligible.find((u) => u.name === recruit.university);
      if (target && !top.includes(target)) top[top.length - 1] = target;
    }
    let best = top[0];
    let bestScore = categoryMatch(best, student.majorPref) + (hash01(student.id, year, "tie") * 0.01);
    for (const u of top) {
      let sc = categoryMatch(u, student.majorPref) + (hash01(student.id, year, u.name) * 0.05) - (top[0].adjScore - u.adjScore) * 0.02;
      if (recruit?.passed && u.name === recruit.university) sc += 2.5;
      if (sc > bestScore) { best = u; bestScore = sc; }
    }
    picked = best;
  }

  let supplement = false;
  let goodSecond = false;
  let goodSecondSource = "";
  const gapFirst = lines.first - total;
  if (scheme === "wenli-batches" && lineBand === "second") {
    const p = supplementProbability(gapFirst);
    if (p > 0 && hash01(student.id, year, "supplement") < p) {
      const uni = pickSupplementUniversity(student, year, track, lines.first);
      if (uni) {
        picked = uni;
        supplement = true;
      }
    }
  }

  // 刚过一本线：有合理概率选二本好专业，录取批次为二批，省控上线仍按总分计。
  if (!supplement && scheme === "wenli-batches" && lineBand === "first") {
    const over = total - lines.first;
    const p = goodSecondProgramProbability(over);
    const blocked = recruit?.passed && picked && recruit.university === picked.name;
    if (p > 0 && !blocked && hash01(student.id, year, "good-second-choice") < p) {
      const prog = pickGoodSecondProgram(student, year, track, total);
      if (prog) {
        picked = { name: prog.name, adjScore: prog.adjScore, rank: prog.rank, batch: "二批", category: "理工", major: prog.major, source: prog.source, special: prog.special };
        goodSecond = true;
        goodSecondSource = prog.source || "";
        batch = "二批";
      }
    }
  }

  if (goodSecond || supplement) batch = "二批";
  else if (picked && recruit?.passed && recruit.university === picked.name && picked.batch === "一批") {
    batch = scheme === "new-3+1+2" ? "本科批" : "一批";
  } else batch = lineBatch;

  const usedConcession = !!(recruit?.passed && picked && recruit.university === picked.name && total < (picked.adjScore ?? 0));
  const uniName = picked?.name || (lineBatch === "未达专科线" ? "未录取" : "专科（未列入对照表的院校）");
  const tier = picked ? uniTier(picked.name) : "none";
  const major = supplement
    ? pickColdMajor(student, year, track)
    : (goodSecond && picked?.major)
      ? picked.major
      : (lineBand === "first" || lineBand === "second" || batch === "一批" || batch === "二批" || batch === "本科批" ? pickRegularMajor(student, year) : "");
  const qingbei = !supplement && !goodSecond && (QINGBEI.has(uniName) || isQingbeiName(uniName));
  return {
    studentId: student.id,
    name: student.name,
    classNo: student.classNo,
    track,
    total,
    provinceRank: rank,
    year,
    batch,
    lineBatch,
    university: uniName,
    major,
    supplement,
    goodSecond,
    goodSecondSource,
    uniScore: picked?.adjScore ?? null,
    uniRank: picked?.rank ?? null,
    uniYearBase: 2020,
    shifted: year !== 2020,
    category: picked?.category || "",
    destTier: tier,
    tier: (student.tier && student.tier in TIER) ? student.tier : undefined,
    qingbei,
    firstLine: lines.first,
    secondLine: lines.second,
    art: !!student.art,
    classRank: ctx.classRank ?? null,
    tierRank: ctx.tierRank ?? null,
    schoolRank: ctx.schoolRank ?? ctx.trackRank ?? null,
    recruitPolicy: recruit?.policy?.id || recruitPolicy(year).id,
    recruitLabel: recruit?.passed ? recruit.policy.label : "",
    recruitPassed: !!recruit?.passed && !!(qingbei || (recruit.university && recruit.university === uniName)),
    recruitUniversity: recruit?.university || "",
    recruitConcession: usedConcession ? recruit.concession : (recruit?.passed && recruit.university === uniName ? recruit.concession : 0),
    recruitEligible: !!recruit?.eligible,
    usedConcession,
    lineBand,
    scheme,
    rankSource: year === 2020
      ? "2020年江西一分一段（公开）"
      : (scheme === "new-3+1+2"
        ? "非2020年：按当年与2020年特殊类型招生控制线（或模拟特控）分差平移后再查2020一分一段，非正式当年一分一段"
        : "非2020年：按当年与2020年一本省控分差平移后再查2020一分一段，非正式当年一分一段"),
    uniSource: supplement
      ? SUPPLEMENT_SOURCE
      : goodSecond
        ? (goodSecondSource || "二本好专业：按公开投档对照，批次为二批")
        : year === 2020
          ? "2020年江西公开投档或录取最低分整理"
          : "院校线按当年省控相对2020年的分差平移2020投档结构，不是当年完整投档表",
    supplementSource: supplement ? SUPPLEMENT_SOURCE : "",
  };
}

export function formatAdmissionBatch(a) {
  if (!a) return "";
  if (a.supplement) return "二批（一本补录）";
  if (a.goodSecond) return "二批（选二本好专业）";
  if (a.usedConcession && a.recruitPolicy === "qj") return `${a.batch || "一批"}（强基计划）`;
  if (a.usedConcession && a.recruitPolicy === "zz") return `${a.batch || "一批"}（自主招生优惠）`;
  if (a.recruitPassed && a.recruitPolicy === "qj") return `${a.batch || "一批"}（强基计划）`;
  if (a.recruitPassed && a.recruitPolicy === "zz") return `${a.batch || "一批"}（自主招生）`;
  return a.batch || "";
}

export function formatAdmissionDest(a) {
  if (!a) return "";
  const bits = [formatSchoolName(a.university)];
  if (a.major) bits.push(a.major);
  let s = bits.join(" · ");
  if (a.supplement) s += "（一本补录）";
  if (a.goodSecond) s += "（选二本好专业）";
  if (a.usedConcession) {
    const lab = a.recruitPolicy === "qj" ? "强基计划降分录取" : "自主招生优惠 / 降分录取";
    s += `（${lab} ${a.recruitConcession} 分，高考总分 ${a.total} 未改写）`;
  } else if (a.recruitPassed) {
    s += a.recruitPolicy === "qj" ? "（强基计划）" : "（自主招生）";
  }
  if (a.shifted) s += "（按省控平移）";
  if (a.art) s += "（文化课对照，无术科分）";
  return s;
}

export function missedProvincialFirst(admission) {
  if (admission == null || admission.total == null || admission.firstLine == null) return false;
  return Number(admission.total) < Number(admission.firstLine);
}

/** 原 0 班或翠微（2/3/4）应届，高考未达官方省控一本且选择复读，可插回本届对应班级。已达一本仍复读的人进补习班。不做 1 班插班。 */
export function canInsertRepeat(student, admission) {
  if (!student) return false;
  if (!admission?.repeatIntent) return false;
  // 按毕业时班级判断（晋升流程里会先把 repeat 标上，再分到插班或补习班）。
  if (!INSERT_REPEAT_CLASS_NOS.includes(Number(student.classNo))) return false;
  return missedProvincialFirst(admission);
}

export function willRepeat(student, admission, year) {
  if (student.repeat) return false;
  if (student.art) return hash01(student.id, year, "repeat-art") < 0.04;
  const personality = student.personality || "";
  const ambitious = /好强|自律|倔强/.test(personality);
  const family = student.family?.type || "";
  const support = /教师|经商|机关/.test(family);
  if (admission?.supplement) {
    // 已补录上一本，多数就读；好强且不满意冷门专业的人仍可复读，但远低于差几分没补录。
    if (ambitious && hash01(student.id, year, "repeat-supplement") < 0.10) return true;
    return false;
  }
  const gapFirst = admission.firstLine - admission.total;
  if (gapFirst > 0 && gapFirst <= 22 && (ambitious || support || hash01(student.id, year, "repeat-close") < 0.45)) return true;
  if (gapFirst > 22 && gapFirst <= 40 && ambitious && support && hash01(student.id, year, "repeat-mid") < 0.18) return true;
  if (admission.batch === "一批" && admission.destTier === "other" && ambitious && hash01(student.id, year, "repeat-985") < 0.06) return true;
  return false;
}

export function admitCohort(students, scoreMap, year, opts = {}) {
  const list = (students || []).filter((s) => scoreMap?.[s.id]);
  const byTrack = { li: [], wen: [] };
  for (const s of list) {
    const tr = s.track === "wen" ? "wen" : "li";
    byTrack[tr].push({ s, total: scoreMap[s.id].total });
  }
  const rankMaps = {};
  for (const tr of ["li", "wen"]) {
    const arr = byTrack[tr].slice().sort((a, b) => b.total - a.total || String(a.s.id).localeCompare(String(b.s.id)));
    const map = new Map();
    let rank = 1;
    for (let i = 0; i < arr.length; i++) {
      if (i > 0 && arr[i].total < arr[i - 1].total) rank = i + 1;
      map.set(arr[i].s.id, { trackRank: rank, trackN: arr.length, schoolRank: rank });
    }
    rankMaps[tr] = map;
  }
  const classCount = {};
  const results = [];
  const seed = opts.seed ?? 1;
  // 按总分从高到低录取，便于控制 0 班清北单班上限。
  const ordered = list.slice().sort((a, b) => (scoreMap[b.id].total - scoreMap[a.id].total) || String(a.id).localeCompare(String(b.id)));
  for (const s of ordered) {
    const sc = scoreMap[s.id];
    const tr = s.track === "wen" ? "wen" : "li";
    const rk = rankMaps[tr].get(s.id) || {};
    const awards = studentContestAwards(s, { date: opts.date || `${year}-06-07`, seed });
    const ctx = {
      seed,
      date: opts.date || `${year}-06-07`,
      awards,
      trackRank: rk.trackRank,
      trackN: rk.trackN,
      schoolRank: rk.schoolRank,
      classRank: sc.classRank,
      tierRank: sc.tierRank,
      difficulty: opts.difficulty,
    };
    let adm = admitStudent(s, sc.total, year, ctx);
    if (adm.qingbei) {
      const no = Number(s.classNo);
      const already = classCount[no] || 0;
      const rawLine = tr === "wen" ? 644 : 686;
      if (already >= 5 && (adm.usedConcession || sc.total < rawLine)) {
        adm = admitStudent(s, sc.total, year, {
          ...ctx,
          recruit: { policy: recruitPolicy(year), eligible: true, applied: true, passed: false, university: "", concession: 0 },
        });
      }
    }
    if (adm.qingbei) classCount[Number(s.classNo)] = (classCount[Number(s.classNo)] || 0) + 1;
    adm.repeatIntent = willRepeat(s, adm, year);
    results.push(adm);
  }
  results.sort((a, b) => b.total - a.total);
  return results;
}

export function hasAdmissionOffer(admission) {
  if (!admission) return false;
  const name = admission.university || admission.dest || "";
  if (!name) return false;
  if (/未录取|未达专科/.test(name)) return false;
  return true;
}

/** 补习班档案用的录取院校：放弃录取或未考上为「无」；旧存档缺字段为「暂缺」。 */
export function formatLastAdmissionLabel(lastAdmission) {
  if (lastAdmission == null) return "暂缺";
  if (lastAdmission.abandoned || lastAdmission.repeatIntent || lastAdmission.noOffer) return "无";
  if (!hasAdmissionOffer(lastAdmission)) return "无";
  return formatSchoolName(lastAdmission.university || lastAdmission.dest);
}

export function packLastAdmission(admission, { abandoned = false } = {}) {
  if (!admission) return null;
  const noOffer = !hasAdmissionOffer(admission);
  return {
    university: admission.university || "",
    major: admission.major || "",
    batch: admission.batch || "",
    total: admission.total,
    year: admission.year,
    track: admission.track,
    supplement: !!admission.supplement,
    abandoned: !noOffer && !!(abandoned || admission.repeatIntent),
    noOffer,
    repeatIntent: !!admission.repeatIntent,
  };
}

/** 学生层次（班级梯队），与院校档次 destTier 不是同一字段。 */
export const STUDENT_TIER_IDS = ["yunxiu_exp", "yunxiu_key", "lingxiao", "zhuoxing", "duxue", "yiti", "fuzhuo"];

export const ADMISSION_TIER_FILTERS = [
  ["all", "全部层次"],
  ["yunxiu_exp", "云岫实验 0/1"],
  ["yunxiu_key", "云岫重点 2—4"],
  ["lingxiao", "凌霄"],
  ["zhuoxing", "卓行"],
  ["duxue", "笃学"],
  ["yiti", "艺体"],
  ["fuzhuo", "补习班"],
];

export const ADMISSION_TRACK_FILTERS = [
  ["all", "文理全部"],
  ["li", "理科"],
  ["wen", "文科"],
];

export const ADMISSION_TABLE_LIMIT = 250;

export function isStudentTier(tier) {
  return STUDENT_TIER_IDS.includes(tier);
}

/** 从该届 cohort / 校友名单按 studentId 取学生层次。绝不把 destTier 当学生层次。 */
export function studentsForAdmissionYear(state, entryYear) {
  const list = [];
  const seen = new Set();
  const add = (s) => {
    if (!s || s.id == null || seen.has(s.id)) return;
    seen.add(s.id);
    list.push(s);
  };
  const cohort = state?.cohorts?.[entryYear];
  for (const s of cohort?.students || []) add(s);
  for (const s of state?.alumni || []) {
    if (s.entryYear === entryYear) add(s);
  }
  return list;
}

function studentMapById(students) {
  const byId = new Map();
  for (const s of students || []) {
    if (s?.id != null && !byId.has(s.id)) byId.set(s.id, s);
  }
  return byId;
}

export function resolveAdmissionStudentTier(row, students = []) {
  if (isStudentTier(row?.tier)) return row.tier;
  const byId = students instanceof Map ? students : studentMapById(students);
  const s = row?.studentId != null ? byId.get(row.studentId) : null;
  if (isStudentTier(s?.tier)) return s.tier;
  return undefined;
}

/** 为缺 tier 的旧录取行补上学生层次；已有合法层次的行保持原对象，不改 destTier。 */
export function enrichAdmissionResults(results, students) {
  const byId = studentMapById(students);
  return (results || []).map((a) => {
    if (isStudentTier(a.tier)) return a;
    const tier = resolveAdmissionStudentTier(a, byId);
    return tier ? { ...a, tier } : a;
  });
}

export function admissionClassOptions(results) {
  const nos = [...new Set((results || []).map((a) => a.classNo).filter((n) => n != null && n !== ""))];
  nos.sort((a, b) => Number(a) - Number(b));
  return nos;
}

export function filterAdmissionResults(results, { classNo = "all", tier = "all", track = "all", query = "" } = {}) {
  const q = String(query || "").trim();
  const wantClass = classNo != null && classNo !== "" && classNo !== "all" ? Number(classNo) : null;
  return (results || []).filter((a) => {
    if (wantClass != null && Number(a.classNo) !== wantClass) return false;
    if (tier && tier !== "all" && a.tier !== tier) return false;
    if (track && track !== "all" && a.track !== track) return false;
    if (q) {
      const hit = (a.name || "").includes(q)
        || (a.university || "").includes(q)
        || (a.major || "").includes(q)
        || (a.supplement && "一本补录".includes(q))
        || (a.goodSecond && ("二本好专业".includes(q) || "选二本".includes(q)))
        || (a.recruitPassed && (a.recruitPolicy === "qj" ? "强基计划" : "自主招生").includes(q))
        || (a.recruitPassed && "强基".includes(q))
        || (a.recruitPassed && "自招".includes(q));
      if (!hit) return false;
    }
    return true;
  });
}

export function admissionCountKpis(results) {
  const list = results || [];
  return {
    qingbei: list.filter((x) => x.qingbei).length,
    first: list.filter((x) => isProvincialFirst(x)).length,
    supplement: list.filter((x) => x.supplement).length,
    second: list.filter((x) => isProvincialSecond(x)).length,
    recruit: list.filter((x) => x.recruitPassed).length,
    goodSecond: list.filter((x) => x.goodSecond).length,
    published: list.length,
  };
}
