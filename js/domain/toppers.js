/**
 * 同层次第一、各班第一解析：用已有考试成绩算分差、名次进退和稳定性，不改分数或划线。
 */
import { rankRows } from "./scores.js?v=t66u2";
import { tierName } from "./studentHistory.js?v=t66u2";

function examLabel(r) {
  return `${r.date || ""} ${r.examName || r.name || ""}`.trim();
}

function poolOf(report, { tier, track, classNo, includeRepeat } = {}) {
  return (report?.rows || []).filter((r) => {
    if (!includeRepeat && r.repeat) return false;
    if (tier && r.tier !== tier) return false;
    if (classNo != null && Number(r.classNo) !== Number(classNo)) return false;
    if (report.split && track && track !== "all" && r.track !== track) return false;
    return true;
  });
}

function firstOf(rows) {
  const ranked = rankRows(rows || []);
  return ranked[0] || null;
}

function seriesForPosition(reports, pickFirst) {
  const points = [];
  let prev = null;
  for (const rep of reports || []) {
    const first = pickFirst(rep);
    if (!first) continue;
    const total = first.total;
    const pt = {
      date: rep.date,
      examId: rep.examId,
      examName: rep.examName,
      examKind: rep.examKind,
      label: examLabel(rep),
      studentId: first.studentId,
      name: first.name,
      classNo: first.classNo,
      tier: first.tier,
      track: first.track,
      total,
      schoolRank: first.rank ?? first.schoolRank ?? null,
    };
    if (prev) {
      pt.scoreDelta = Math.round((total - prev.total) * 10) / 10;
      pt.samePerson = prev.studentId === first.studentId;
    } else {
      pt.scoreDelta = null;
      pt.samePerson = true;
    }
    points.push(pt);
    prev = pt;
  }
  const unique = new Set(points.map((p) => p.studentId));
  const hold = points.length <= 1 ? 1 : points.filter((p) => p.samePerson).length / points.length;
  return {
    points,
    uniqueHolders: unique.size,
    stability: Math.round(hold * 100) / 100,
    oftenChanges: unique.size >= 3 || (points.length >= 4 && hold < 0.6),
  };
}

export function sameTierFirstSeries(reports, { tier, track } = {}) {
  const list = (reports || []).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const series = seriesForPosition(list, (rep) => {
    const tr = rep.split ? (track === "wen" || track === "li" ? track : null) : null;
    return firstOf(poolOf(rep, { tier, track: tr }));
  });
  return {
    kind: "sameTier",
    tier,
    tierName: tierName(tier),
    track: track || "all",
    ...series,
  };
}

export function classFirstSeries(reports, classNo, { track } = {}) {
  const list = (reports || []).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const series = seriesForPosition(list, (rep) => {
    const tr = rep.split ? (track === "wen" || track === "li" ? track : null) : null;
    return firstOf(poolOf(rep, { classNo, track: tr }));
  });
  return {
    kind: "class",
    classNo: Number(classNo),
    track: track || "all",
    ...series,
  };
}

/** 本年级（分科后按文理池）各班本场第一，并带上该班历次第一的分差与是否经常换人。 */
export function classFirstBoard(report, reports, { track } = {}) {
  const includeRepeat = Number(report?.grade) >= 3;
  const rows = poolOf(report, { track: report?.split ? track : null, includeRepeat });
  const byClass = new Map();
  for (const r of rows) {
    const no = r.classNo;
    if (!byClass.has(no)) byClass.set(no, []);
    byClass.get(no).push(r);
  }
  const nos = [...byClass.keys()].sort((a, b) => Number(a) - Number(b));
  const hist = (reports || []).filter((e) => e && (report?.entryYear == null || e.entryYear == null || Number(e.entryYear) === Number(report.entryYear)));
  return nos.map((no) => {
    const first = firstOf(byClass.get(no));
    const histSeries = classFirstSeries(hist, no, { track });
    const latest = histSeries.points[histSeries.points.length - 1] || null;
    return {
      classNo: no,
      tier: first?.tier,
      tierName: tierName(first?.tier),
      track: first?.track,
      first,
      name: first?.name || "—",
      studentId: first?.studentId,
      total: first?.total,
      schoolRank: first?.rank ?? first?.schoolRank ?? null,
      scoreDelta: latest?.scoreDelta ?? null,
      uniqueHolders: histSeries.uniqueHolders,
      stability: histSeries.stability,
      oftenChanges: histSeries.oftenChanges,
      series: histSeries,
    };
  });
}

export function sameTierFirstBoard(report, reports, { track } = {}) {
  const includeRepeat = Number(report?.grade) >= 3;
  const rows = poolOf(report, { track: report?.split ? track : null, includeRepeat });
  const tiers = [];
  const seen = new Set();
  for (const r of rows) {
    if (!r.tier || seen.has(r.tier)) continue;
    seen.add(r.tier);
    tiers.push(r.tier);
  }
  const order = ["yunxiu_exp", "yunxiu_key", "lingxiao", "zhuoxing", "duxue", "yiti", "fuzhuo"];
  tiers.sort((a, b) => (order.indexOf(a) < 0 ? 99 : order.indexOf(a)) - (order.indexOf(b) < 0 ? 99 : order.indexOf(b)));
  const hist = (reports || []).filter((e) => e && (report?.entryYear == null || e.entryYear == null || Number(e.entryYear) === Number(report.entryYear)));
  return tiers.map((tier) => {
    const first = firstOf(poolOf(report, { tier, track: report?.split ? track : null, includeRepeat }));
    const histSeries = sameTierFirstSeries(hist, { tier, track });
    const latest = histSeries.points[histSeries.points.length - 1] || null;
    return {
      tier,
      tierName: tierName(tier),
      first,
      name: first?.name || "—",
      classNo: first?.classNo,
      studentId: first?.studentId,
      total: first?.total,
      schoolRank: first?.rank ?? first?.schoolRank ?? null,
      scoreDelta: latest?.scoreDelta ?? null,
      uniqueHolders: histSeries.uniqueHolders,
      stability: histSeries.stability,
      oftenChanges: histSeries.oftenChanges,
      series: histSeries,
    };
  });
}

export function formatStability(s) {
  if (!s) return "尚不足一场，无法看稳定性。";
  const ch = s.oftenChanges ? "第一名经常换人" : (s.uniqueHolders <= 2 ? "第一名比较稳定" : "第一名有过更替");
  return `历次共 ${s.points.length} 场、${s.uniqueHolders} 人拿过第一，${ch}。`;
}
