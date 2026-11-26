/** 按江西公开投档线/位次将高考分数对应到真实大学，文理、年份、批次分开。 */
import { provincialLines, provincialRank, universities, uniTier, QINGBEI } from "./jiangxi.js?v=t42u1";
import { INSERT_REPEAT_CLASS_NOS } from "./config.js?v=t42u1";
import { hash01 } from "./prng.js?v=t42u1";

/** 校内规则示意：不是官方征集志愿名单，也不计入省控一本上线人数。 */
export const SUPPLEMENT_SOURCE = "校内规则示意：离一本省控线很近的二本可能被弱一本院校的冷门专业征集，不是官方征集志愿名单，也不计入省控一本上线人数。";

export const COLD_MAJORS = {
  li: ["采矿工程", "测绘工程", "农业资源与环境", "动物科学", "林学", "园艺"],
  wen: ["历史学", "哲学", "图书馆学", "档案学", "农林经济管理"],
};

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

export function admitStudent(student, total, year) {
  const track = student.track === "wen" ? "wen" : "li";
  const lines = provincialLines(year, track) || provincialLines(2020, track);
  const rank = provincialRank(total, track, year);
  const pool = universities()
    .filter((u) => u.track === track)
    .map((u) => ({ ...u, adjScore: u.score + lineShift(year, track, u.batch) }))
    .filter((u) => total >= u.adjScore)
    .sort((a, b) => b.adjScore - a.adjScore || (a.rank ?? 9e9) - (b.rank ?? 9e9));

  let batch = "未达专科线";
  if (total >= lines.first) batch = "一批";
  else if (total >= lines.second) batch = "二批";
  else if (total >= (lines.special ?? 150)) batch = "专科";

  const eligible = pool.filter((u) => {
    if (batch === "一批") return true;
    if (batch === "二批") return u.batch !== "一批";
    if (batch === "专科") return u.batch === "专科";
    return false;
  });

  let picked = null;
  if (eligible.length) {
    const top = eligible.slice(0, 8);
    let best = top[0];
    let bestScore = categoryMatch(best, student.majorPref) + (hash01(student.id, year, "tie") * 0.01);
    for (const u of top) {
      const sc = categoryMatch(u, student.majorPref) + (hash01(student.id, year, u.name) * 0.05) - (top[0].adjScore - u.adjScore) * 0.02;
      if (sc > bestScore) { best = u; bestScore = sc; }
    }
    picked = best;
  }

  let supplement = false;
  const gapFirst = lines.first - total;
  if (batch === "二批") {
    const p = supplementProbability(gapFirst);
    if (p > 0 && hash01(student.id, year, "supplement") < p) {
      const uni = pickSupplementUniversity(student, year, track, lines.first);
      if (uni) {
        picked = uni;
        supplement = true;
      }
    }
  }

  const uniName = picked?.name || (batch === "未达专科线" ? "未录取" : "专科（未列入对照表的院校）");
  const tier = picked ? uniTier(picked.name) : "none";
  const major = supplement
    ? pickColdMajor(student, year, track)
    : (batch === "一批" || batch === "二批" ? pickRegularMajor(student, year) : "");
  return {
    studentId: student.id,
    name: student.name,
    classNo: student.classNo,
    track,
    total,
    provinceRank: rank,
    year,
    batch,
    university: uniName,
    major,
    supplement,
    uniScore: picked?.adjScore ?? null,
    uniRank: picked?.rank ?? null,
    uniYearBase: 2020,
    shifted: year !== 2020,
    category: picked?.category || "",
    destTier: tier,
    qingbei: !supplement && (QINGBEI.has(uniName) || /^清华大学$|^北京大学$/.test(uniName)),
    firstLine: lines.first,
    secondLine: lines.second,
    art: !!student.art,
    rankSource: year === 2020
      ? "2020年江西一分一段（公开）"
      : "非2020年：按当年与2020年一本省控分差平移后再查2020一分一段，非正式当年一分一段",
    uniSource: supplement
      ? SUPPLEMENT_SOURCE
      : year === 2020
        ? "2020年江西公开投档或录取最低分整理"
        : "院校线按当年省控相对2020年的分差平移2020投档结构，不是当年完整投档表",
    supplementSource: supplement ? SUPPLEMENT_SOURCE : "",
  };
}

export function formatAdmissionBatch(a) {
  if (!a) return "";
  if (a.supplement) return "二批（一本补录）";
  return a.batch || "";
}

export function formatAdmissionDest(a) {
  if (!a) return "";
  const bits = [a.university];
  if (a.major) bits.push(a.major);
  let s = bits.join(" · ");
  if (a.supplement) s += "（一本补录）";
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

export function admitCohort(students, scoreMap, year) {
  const results = [];
  for (const s of students) {
    const sc = scoreMap[s.id];
    if (!sc) continue;
    const adm = admitStudent(s, sc.total, year);
    adm.repeatIntent = willRepeat(s, adm, year);
    results.push(adm);
  }
  results.sort((a, b) => b.total - a.total);
  return results;
}
