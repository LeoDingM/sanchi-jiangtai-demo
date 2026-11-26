/** 按江西公开投档线/位次将高考分数对应到真实大学，文理、年份、批次分开。 */
import { provincialLines, provincialRank, universities, uniTier, QINGBEI } from "./jiangxi.js?v=t41u1";
import { INSERT_REPEAT_CLASS_NOS } from "./config.js?v=t41u1";
import { hash01 } from "./prng.js?v=t41u1";

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

  const uniName = picked?.name || (batch === "未达专科线" ? "未录取" : "专科（未列入对照表的院校）");
  const tier = picked ? uniTier(picked.name) : "none";
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
    uniScore: picked?.adjScore ?? null,
    uniRank: picked?.rank ?? null,
    uniYearBase: 2020,
    shifted: year !== 2020,
    category: picked?.category || "",
    destTier: tier,
    qingbei: QINGBEI.has(uniName) || /^清华大学$|^北京大学$/.test(uniName),
    firstLine: lines.first,
    secondLine: lines.second,
    art: !!student.art,
    rankSource: year === 2020
      ? "2020年江西一分一段（公开）"
      : "非2020年：按当年与2020年一本省控分差平移后再查2020一分一段，非正式当年一分一段",
    uniSource: year === 2020
      ? "2020年江西公开投档或录取最低分整理"
      : "院校线按当年省控相对2020年的分差平移2020投档结构，不是当年完整投档表",
  };
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
  const gapFirst = admission.firstLine - admission.total;
  const personality = student.personality || "";
  const ambitious = /好强|自律|倔强/.test(personality);
  const family = student.family?.type || "";
  const support = /教师|经商|机关/.test(family);
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
