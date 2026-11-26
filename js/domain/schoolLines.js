/**
 * 校内一本/二本按该科类划线池约第 520、第 1100 名取分。
 * 高三池为应届与补习班同一池。应届省控上线人数仍只统应届，只作对照统计，不再当作校内划线名额。
 */
import { FALLBACK_SCHOOL_QUOTA, SCHOOL_LINE_FIRST_RANK, SCHOOL_LINE_SECOND_RANK } from "./config.js?v=t65u1";
import { provincialLines, officialProvincialPack } from "./jiangxi.js?v=t65u1";
import { hash01 } from "./prng.js?v=t65u1";

function clampRank(want, n) {
  const cap = Math.max(1, n);
  return Math.max(1, Math.min(Math.round(Number(want) || 1), cap));
}

export function fallbackSchoolQuota() {
  return {
    li: { ...FALLBACK_SCHOOL_QUOTA.li },
    wen: { ...FALLBACK_SCHOOL_QUOTA.wen },
    mixed: { ...FALLBACK_SCHOOL_QUOTA.mixed },
    source: "无上一届高考数据时，应届省控上线人数只用近似量级作历史统计，不是校内划线名额，也不是官方精确名额。",
    fallback: true,
  };
}

export function schoolQuotaFromPrior(prior) {
  if (!prior?.li || !prior?.wen) return fallbackSchoolQuota();
  const liFirst = Math.max(1, Number(prior.li.firstN) || 0);
  const wenFirst = Math.max(1, Number(prior.wen.firstN) || 0);
  const wenSecond = Math.max(wenFirst, Number(prior.wen.secondN) || 0);
  return {
    li: { firstN: liFirst, secondN: 1000 },
    wen: { firstN: wenFirst, secondN: wenSecond },
    mixed: { firstN: liFirst + wenFirst, secondN: 1000 },
    source: prior.source || `${prior.entryYear}级${prior.gaokaoYear}年高考本校省控实际上线人数。`,
    fallback: false,
    priorYear: prior.gaokaoYear,
    priorEntryYear: prior.entryYear,
    prior: {
      li: { ...prior.li },
      wen: { ...prior.wen },
      mixed: { ...(prior.mixed || {}) },
    },
  };
}

/** 一本目标约第 520 名、二本约第 1100 名。池不足时收束，绝不伪造人数。 */
const FIRST_RATE_CAP = 0.50;
const FIRST_RATE_REF = SCHOOL_LINE_FIRST_RANK / 1696;
const LATE_FRAC = 0.90;

function jitterAround(base, amplitude, salt) {
  if (salt == null || salt === "") return Math.round(base);
  const t = hash01(String(salt), "school-line", String(base)) * 2 - 1;
  return Math.round(base + t * amplitude);
}

export function adaptSchoolCutoffRanks(n, { salt } = {}) {
  const size = Math.max(0, Math.round(Number(n) || 0));
  if (size <= 0) return { firstN: 1, secondN: 1, poolN: 0, adapted: true };
  let firstWant = SCHOOL_LINE_FIRST_RANK;
  let secondWant = SCHOOL_LINE_SECOND_RANK;
  if (salt) {
    firstWant = Math.max(500, Math.min(540, jitterAround(SCHOOL_LINE_FIRST_RANK, 20, `${salt}|first`)));
    secondWant = Math.max(1060, Math.min(1140, jitterAround(SCHOOL_LINE_SECOND_RANK, 40, `${salt}|second`)));
  }
  let adapted = false;
  let firstN;
  let secondN;
  if (size >= secondWant && firstWant / size <= FIRST_RATE_CAP) {
    firstN = clampRank(firstWant, size);
    secondN = Math.max(firstN + 1, clampRank(secondWant, size));
  } else {
    adapted = true;
    if (size < firstWant || firstWant / size > FIRST_RATE_CAP) {
      firstN = clampRank(Math.round(size * FIRST_RATE_REF), size);
    } else {
      firstN = clampRank(firstWant, size);
    }
    if (size < secondWant) {
      const late = Math.round(size * LATE_FRAC);
      secondN = clampRank(Math.max(late, firstN + 1), size);
    } else {
      secondN = clampRank(secondWant, size);
    }
    if (secondN <= firstN) secondN = Math.min(size, firstN + 1);
  }
  return { firstN, secondN, poolN: size, adapted };
}

/** 算出本场一本/二本名额。按该科类划线池约第 520、第 1100 名；池不足则收束。高三池含补习班。 */
export function resolveSchoolQuota({ split, track, regularN, trackN, salt } = {}) {
  const n = split ? (trackN ?? regularN) : (regularN ?? trackN);
  const kind = split ? (track === "wen" ? "wen" : "li") : "mixed";
  const ranks = adaptSchoolCutoffRanks(n, { salt: salt ? `${salt}|${kind}` : "" });
  return {
    firstN: ranks.firstN,
    secondN: ranks.secondN,
    track: kind,
    adapted: ranks.adapted,
    poolN: ranks.poolN,
  };
}

export function rowTrackForProvincial(row, split) {
  if (split && row.track && row.track !== "mixed") return row.track === "wen" ? "wen" : "li";
  const pref = row.trackPref || row.track;
  if (pref === "wen") return "wen";
  if (pref === "li") return "li";
  return "li";
}

function emptyCounts(year) {
  return {
    gaokaoYear: year,
    li: { firstN: 0, secondN: 0, n: 0 },
    wen: { firstN: 0, secondN: 0, n: 0 },
    mixed: { firstN: 0, secondN: 0, n: 0 },
  };
}

function addPass(pack, track, total, year) {
  const lines = provincialLines(year, track) || provincialLines(2020, track);
  const b = pack[track];
  b.n++;
  if (total >= lines.first) b.firstN++;
  if (total >= lines.second) b.secondN++;
}

function finishMixed(pack) {
  pack.mixed = {
    firstN: pack.li.firstN + pack.wen.firstN,
    secondN: pack.li.secondN + pack.wen.secondN,
    n: pack.li.n + pack.wen.n,
  };
  return pack;
}

/** 滚动校内线名额用的应届上线人数。补习班另在教务处榜单里计省控上线，不进这个名额。 */
export function provincialPassCounts(students, scoreMap, year) {
  const pack = emptyCounts(year);
  for (const s of students) {
    if (s.repeat) continue;
    const sc = scoreMap[s.id];
    if (!sc) continue;
    const track = s.track === "wen" ? "wen" : "li";
    addPass(pack, track, sc.total, year);
  }
  return finishMixed(pack);
}

export function scaledTotal750(row) {
  const max = row.maxTotal || 750;
  if (!max || max === 750) return row.total;
  return Math.round((row.total / max) * 750);
}

export function provincialPassCountsFromRows(rows, year, split) {
  const pack = emptyCounts(year);
  for (const r of rows || []) {
    if (r.repeat) continue;
    const track = rowTrackForProvincial(r, split);
    addPass(pack, track, scaledTotal750(r), year);
  }
  return finishMixed(pack);
}

/** 用已公布的最近一年省控：6 月及以后用当年，否则用上一年。 */
export function provincialCompareYear(date) {
  if (!date) return 2020;
  const y = Number(String(date).slice(0, 4));
  const m = Number(String(date).slice(5, 7));
  if (!y) return 2020;
  return m >= 6 ? y : y - 1;
}

export function isG1Scale(report) {
  if (report?.scale === "g1-950") return true;
  return (report?.rows || []).some((r) => r.maxTotal === 950);
}

function classTrackOf(report, classNo) {
  const cls = (report.classes || []).find((c) => c.classNo === classNo);
  if (cls?.track && cls.track !== "mixed") return cls.track;
  const row = (report.rows || []).find((r) => r.classNo === classNo);
  return rowTrackForProvincial(row || {}, report.split);
}

export function classProvincialCounts(report, classNo) {
  const year = provincialCompareYear(report.date);
  const rows = (report.rows || []).filter((r) => r.classNo === classNo);
  const pack = provincialPassCountsFromRows(rows, year, report.split);
  const track = classTrackOf(report, classNo);
  const bucket = report.split ? pack[track] : pack.mixed;
  return { year, track, n: rows.length, scaled: isG1Scale(report), pack, firstN: bucket.firstN, secondN: bucket.secondN };
}

export function zhuoxingPeerStats(report) {
  const classes = (report.classes || []).filter((c) => c.tier === "zhuoxing" && !c.repeat);
  return classes.map((c) => {
    const prov = classProvincialCounts(report, c.classNo);
    return {
      classNo: c.classNo,
      track: c.track || prov.track || "mixed",
      n: c.count,
      schoolFirst: c.firstCount,
      schoolSecond: c.secondCount,
      provFirst: prov.firstN,
      provSecond: prov.secondN,
    };
  });
}

function midRange(arr) {
  if (!arr.length) return { min: 0, max: 0, mid: 0 };
  const b = arr.slice().sort((a, c) => a - c);
  return { min: b[0], max: b[b.length - 1], mid: b[Math.floor((b.length - 1) / 2)] };
}

export function describeZhuoxingPeers(report, classNo) {
  const all = zhuoxingPeerStats(report);
  const me = all.find((c) => c.classNo === classNo);
  const track = me?.track || classTrackOf(report, classNo);
  const peers = all.filter((c) => !report.split || c.track === track);
  if (!peers.length) return "";
  const sF = midRange(peers.map((c) => c.schoolFirst));
  const pF = midRange(peers.map((c) => c.provFirst));
  const sS = midRange(peers.map((c) => c.schoolSecond));
  const pS = midRange(peers.map((c) => c.provSecond));
  const label = track === "wen" ? "卓行文科" : track === "li" ? "卓行理科" : "卓行";
  if (report.examKind === "gaokao") {
    const mine = me
      ? `任教班省控一本 ${me.provFirst} 人、省控二本累计 ${me.provSecond} 人；校内一本 ${me.schoolFirst} 人、校内二本累计 ${me.schoolSecond} 人`
      : "";
    return `${label}各班省控一本 ${pF.min}–${pF.max} 人（中位 ${pF.mid}），省控二本累计 ${pS.min}–${pS.max} 人（中位 ${pS.mid}）；校内一本 ${sF.min}–${sF.max} 人（中位 ${sF.mid}），校内二本累计 ${sS.min}–${sS.max} 人（中位 ${sS.mid}）。${mine}。`;
  }
  const mine = me
    ? `任教班校内一本 ${me.schoolFirst} 人、二本累计 ${me.schoolSecond} 人；对照省控一本 ${me.provFirst} 人、二本累计 ${me.provSecond} 人`
    : "";
  return `${label}各班校内一本 ${sF.min}–${sF.max} 人（中位 ${sF.mid}），二本累计 ${sS.min}–${sS.max} 人（中位 ${sS.mid}）；对照省控一本 ${pF.min}–${pF.max} 人（中位 ${pF.mid}），二本累计 ${pS.min}–${pS.max} 人（中位 ${pS.mid}）。${mine}。`;
}

/** 高考主卡片用的公开省控（国家线）说明。非 2020 年不含估算位次。 */
export function describeOfficialProvincialLines(year, tracks = ["li", "wen"]) {
  const pack = officialProvincialPack(year);
  const bits = (tracks.length ? tracks : ["li", "wen"]).map((tr) => {
    const t = tr === "wen" ? pack.wen : pack.li;
    const label = tr === "wen" ? "文科" : "理科";
    const ranks = t.ranks ? `，一本全省前 ${t.ranks.firstN} 名、二本全省前 ${t.ranks.secondN} 名` : "";
    return `${label}一本 ${t.first}、二本 ${t.second}，分差 ${t.gap}${ranks}`;
  });
  return `${pack.year}年公开省控（国家线）：${bits.join("；")}。${pack.sourceNote}`;
}

export function schoolCutoffView(report, track = "li") {
  const cut = report?.split ? (track === "wen" ? report.cutoffs?.wen : report.cutoffs?.li) : report?.cutoffs?.mixed;
  if (!cut) return null;
  const label = report.split ? (track === "wen" ? "文科" : "理科") : "";
  return {
    track: report.split ? (track === "wen" ? "wen" : "li") : "mixed",
    label,
    firstLine: cut.firstLine,
    firstN: cut.firstN,
    secondLine: cut.secondLine,
    secondN: cut.secondN,
    gap: (cut.firstLine ?? 0) - (cut.secondLine ?? 0),
    firstTitle: `校内${label}一本线（第${cut.firstN}名）`,
    secondTitle: `校内${label}二本线（第${cut.secondN}名）`,
  };
}

export function describeSchoolCutoff(cutOrQuota, split, opts = {}) {
  const pool = opts.includeRepeat
    ? "高三校内名次按应届与补习班同一池划"
    : "校内名次按本场考生排序";
  const cut = opts.cutoffs || cutOrQuota || {};
  const mixed = opts.mixed || cut.mixed;
  const li = opts.li || cut.li;
  const wen = opts.wen || cut.wen;
  if (!split) {
    const firstN = mixed?.firstN ?? opts.firstN ?? SCHOOL_LINE_FIRST_RANK;
    const secondN = mixed?.secondN ?? opts.secondN ?? SCHOOL_LINE_SECOND_RANK;
    return `分科前校内一本取该年级划线池第 ${firstN} 名，二本取第 ${secondN} 名（目标约全校第 520、第 1100 名，池人数不足时按池内规模收束；${pool}），只作对照，不是国家线`;
  }
  const lf = li?.firstN ?? opts.firstN ?? SCHOOL_LINE_FIRST_RANK;
  const ls = li?.secondN ?? opts.secondN ?? SCHOOL_LINE_SECOND_RANK;
  const wf = wen?.firstN;
  const ws = wen?.secondN;
  const wenPart = (wf != null && ws != null)
    ? `；文科第 ${wf}、第 ${ws} 名`
    : "；文科同样按该科类池约第 520、第 1100 名，池不足时二本取靠后名次、一本取靠前名次且不超出池规模";
  return `校内一本、二本按该科类划线池约第 520、第 1100 名取分（本场理科第 ${lf}、第 ${ls} 名${wenPart}；${pool}），只作对照，不是国家线`;
}

export function provincialCompareNote(report) {
  const year = provincialCompareYear(report.date);
  if (report.examKind === "gaokao") return `对照${year}年公开省控（高考 750 分制）`;
  if (isG1Scale(report)) return `对照${year}年省控（高一卷面按 950 分折合 750 分比较，受当次难度影响会晃）`;
  return `对照${year}年省控（卷面折合 750 分比较，受当次难度影响会晃）`;
}

export function describeClassProvincial(report, classNo) {
  const note = provincialCompareNote(report);
  const p = classProvincialCounts(report, classNo);
  return `${note}：一本 ${p.firstN} 人、二本累计 ${p.secondN} 人`;
}

export function describeSchoolProvincial(report) {
  const year = provincialCompareYear(report.date);
  const pack = provincialPassCountsFromRows(report.rows, year, report.split);
  const note = provincialCompareNote(report);
  if (!report.split) {
    return `${note}：全校应届一本 ${pack.mixed.firstN} 人、二本累计 ${pack.mixed.secondN} 人（按学生科类意向分别对照文理省控后合计）`;
  }
  return `${note}：全校应届理科一本 ${pack.li.firstN} 人、二本累计 ${pack.li.secondN} 人；文科一本 ${pack.wen.firstN} 人、二本累计 ${pack.wen.secondN} 人`;
}

/** 考试日志：同时写校内线、对照省控、卓行同层次对比。 */
export function examResultLogText(report, { classSummary, classNo, schoolQuota } = {}) {
  const cls = classSummary;
  const cutExplain = describeSchoolCutoff(report.cutoffs || schoolQuota || report.quota, report.split, { includeRepeat: report.grade >= 3 || report.cutoffs?.includeRepeat, cutoffs: report.cutoffs });
  const prov = describeClassProvincial(report, classNo);
  const peers = describeZhuoxingPeers(report, classNo);
  const head = `${report.examName}结束。任教班均分${cls.avg}，最高${cls.max}。`;
  const school = `校内线一本${cls.firstCount}人、二本累计${cls.secondCount}人（${cutExplain}）。`;
  const peer = peers ? `同层次平行班对比：${peers}` : "";
  return `${head}${school}${prov}。${peer}`.trim();
}

export function examLineNoticeText(report, schoolQuota) {
  const quota = schoolQuota || report.quota;
  const cut = report.split ? report.cutoffs?.li : report.cutoffs?.mixed;
  const cutW = report.split ? report.cutoffs?.wen : null;
  const parts = [];
  parts.push(describeSchoolCutoff(report.cutoffs || quota, report.split, { includeRepeat: report.grade >= 3 || report.cutoffs?.includeRepeat, cutoffs: report.cutoffs }) + "。");
  if (cut) {
    parts.push(`本场校内线${report.split ? "理科" : ""}一本 ${cut.firstLine}（第${cut.firstN}名），二本 ${cut.secondLine}（第${cut.secondN}名），分差 ${cut.firstLine - cut.secondLine}。`);
  }
  if (cutW) {
    parts.push(`文科校内一本 ${cutW.firstLine}（第${cutW.firstN}名），二本 ${cutW.secondLine}（第${cutW.secondN}名），分差 ${cutW.firstLine - cutW.secondLine}。`);
  }
  parts.push(describeSchoolProvincial(report) + "。");
  const peers = describeZhuoxingPeers(report, report.classes?.find((c) => c.tier === "zhuoxing" && !c.repeat)?.classNo);
  if (peers) parts.push(`同层次平行班对比：${peers}`);
  return parts.join("");
}
