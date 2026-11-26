/**
 * 校内一本/二本名额：按上一届高考本校省控实际上线人数滚动，
 * 不再把全校 400/1000 按文理人数分摊。复读不占应届名额。
 */
import { FALLBACK_SCHOOL_QUOTA } from "./config.js";
import { provincialLines, officialProvincialPack } from "./jiangxi.js";

function clampRank(want, n) {
  const cap = Math.max(1, n);
  return Math.max(1, Math.min(Math.round(Number(want) || 1), cap));
}

export function fallbackSchoolQuota() {
  return {
    li: { ...FALLBACK_SCHOOL_QUOTA.li },
    wen: { ...FALLBACK_SCHOOL_QUOTA.wen },
    mixed: { ...FALLBACK_SCHOOL_QUOTA.mixed },
    source: "无上一届高考数据时的近似兜底：理科一本约 450、二本取前 1000；文科一本约 60、二本约 250。这不是官方精确名额。",
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
    source: prior.source || `${prior.entryYear}级${prior.gaokaoYear}年高考本校省控实际上线人数（应届，不含复读）。`,
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

/** 算出本场应届一本/二本名额。理科二本固定取前 1000（不超过应届人数），不用上一届二本人数。 */
export function resolveSchoolQuota({ split, track, regularN, trackN, quotas } = {}) {
  const q = quotas?.li && quotas?.wen && quotas?.mixed ? quotas : fallbackSchoolQuota();
  if (!split) {
    const n = regularN;
    const firstN = clampRank(q.mixed.firstN, n);
    const secondN = Math.max(firstN, clampRank(q.mixed.secondN ?? 1000, n));
    return { firstN, secondN, track: "mixed" };
  }
  const n = trackN;
  if (track === "wen") {
    const firstN = clampRank(q.wen.firstN, n);
    const secondN = Math.max(firstN, clampRank(q.wen.secondN, n));
    return { firstN, secondN, track: "wen" };
  }
  const firstN = clampRank(q.li.firstN, n);
  const secondN = Math.max(firstN, clampRank(1000, n));
  return { firstN, secondN, track: "li" };
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

/** 应届生对照某年公开省控的实际上线人数。复读不计入。 */
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
  const row = (report.rows || []).find((r) => r.classNo === classNo && !r.repeat);
  return rowTrackForProvincial(row || {}, report.split);
}

export function classProvincialCounts(report, classNo) {
  const year = provincialCompareYear(report.date);
  const rows = (report.rows || []).filter((r) => !r.repeat && r.classNo === classNo);
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

export function describeSchoolCutoff(quota, split) {
  const q = quota?.li && quota?.wen && quota?.mixed ? quota : fallbackSchoolQuota();
  if (q.fallback) return q.source;
  const tag = `${q.priorEntryYear}级${q.priorYear}年高考`;
  if (!split) {
    return `分科前校内一本按上一届（${tag}）文理合计省控一本 ${q.mixed.firstN} 人，二本取全年级前 ${q.mixed.secondN} 名（应届，复读不占名额）`;
  }
  return `理科校内一本按上一届（${tag}）理科省控一本实际 ${q.li.firstN} 人，二本取理科前 ${q.li.secondN} 名；文科按同一届文科省控实际一本 ${q.wen.firstN} 人、二本累计 ${q.wen.secondN} 人。复读不占应届名额`;
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
  const cutExplain = describeSchoolCutoff(schoolQuota || report.quota, report.split);
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
  parts.push(describeSchoolCutoff(quota, report.split) + "。");
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
