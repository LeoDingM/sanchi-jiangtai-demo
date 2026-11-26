/**
 * 考后 AI 分析：只根据已算好的成绩和排名写评语，不改分、不改排名、不上线人数。
 * API 密钥只放在独立的 localStorage 项里，与游戏存档 JSON 分开。
 */
import { subjectById, TIER } from "./config.js";
import { subjectRanks } from "./scores.js";
import {
  describeSchoolCutoff, describeClassProvincial, describeSchoolProvincial,
  describeZhuoxingPeers, classProvincialCounts, scaledTotal750, provincialCompareYear,
} from "./schoolLines.js";
import { provincialLines } from "./jiangxi.js";
import { buildStudentExamSnapshot, strongerTiers, tierName } from "./studentHistory.js";

export const AI_SETTINGS_KEY = "sanchi-jiangtai-ai-settings-v1";
export const AI_KEY_KEY = "sanchi-jiangtai-ai-key-v1";
export const GOD_SETTINGS_KEY = "sanchi-jiangtai-god-settings-v1";
export const DEFAULT_AI_BASE_URL = "https://api.deepseek.com";
export const DEFAULT_AI_MODEL = "deepseek-flash";

let storageOverride = null;

export function bindAiStorage(storage) {
  storageOverride = storage || null;
}

function storage() {
  if (storageOverride) return storageOverride;
  try {
    if (typeof localStorage !== "undefined" && localStorage) return localStorage;
  } catch { /* 无浏览器存储 */ }
  return null;
}

export function defaultAiSettings() {
  return { model: DEFAULT_AI_MODEL, baseUrl: DEFAULT_AI_BASE_URL, hasKey: false, apiKey: "" };
}

export function loadAiSettings() {
  const out = defaultAiSettings();
  const st = storage();
  if (!st) return out;
  try {
    const raw = st.getItem(AI_SETTINGS_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data.model) out.model = String(data.model).trim() || DEFAULT_AI_MODEL;
      if (data.baseUrl) out.baseUrl = String(data.baseUrl).trim() || DEFAULT_AI_BASE_URL;
    }
  } catch { /* 忽略损坏的设置 */ }
  try {
    const key = st.getItem(AI_KEY_KEY);
    if (key) {
      out.apiKey = String(key);
      out.hasKey = true;
    }
  } catch { /* 忽略 */ }
  return out;
}

export function saveAiSettings({ model, baseUrl, apiKey } = {}) {
  const st = storage();
  if (!st) return { ok: false, reason: "当前环境不能保存设置。" };
  const prev = loadAiSettings();
  const nextModel = (model != null ? String(model).trim() : prev.model) || DEFAULT_AI_MODEL;
  const nextBase = (baseUrl != null ? String(baseUrl).trim() : prev.baseUrl) || DEFAULT_AI_BASE_URL;
  st.setItem(AI_SETTINGS_KEY, JSON.stringify({ model: nextModel, baseUrl: nextBase }));
  if (apiKey != null) {
    const k = String(apiKey).trim();
    if (k) st.setItem(AI_KEY_KEY, k);
    else st.removeItem(AI_KEY_KEY);
  }
  return { ok: true, ...loadAiSettings() };
}

export function clearAiKey() {
  const st = storage();
  if (!st) return { ok: false, reason: "当前环境不能清除密钥。" };
  st.removeItem(AI_KEY_KEY);
  return { ok: true, ...loadAiSettings() };
}

export function defaultGodSettings() {
  return { actAsHomeroom: false };
}

export function loadGodSettings() {
  const out = defaultGodSettings();
  const st = storage();
  if (!st) return out;
  try {
    const raw = st.getItem(GOD_SETTINGS_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data.actAsHomeroom === true) out.actAsHomeroom = true;
    }
  } catch { /* 忽略损坏的设置 */ }
  return out;
}

export function saveGodSettings({ actAsHomeroom } = {}) {
  const st = storage();
  if (!st) return { ok: false, reason: "当前环境不能保存设置。" };
  const prev = loadGodSettings();
  const next = {
    actAsHomeroom: actAsHomeroom != null ? !!actAsHomeroom : !!prev.actAsHomeroom,
  };
  st.setItem(GOD_SETTINGS_KEY, JSON.stringify(next));
  return { ok: true, ...loadGodSettings() };
}

export function maskApiKey(key) {
  const k = String(key || "");
  if (!k) return "";
  if (k.length <= 8) return "•".repeat(Math.max(4, k.length));
  return `${k.slice(0, 3)}••••${k.slice(-4)}`;
}

export function playerSubjectId(player) {
  return player?.subjectId || player?.subject || "math";
}

const SUBJECT_FALLBACK = { biology: "生物" };

export function playerSubjectName(player) {
  const id = playerSubjectId(player);
  return subjectById(id)?.name || SUBJECT_FALLBACK[id] || "数学";
}

/**
 * 是否以该班正式班主任身份看整体分析。
 * 只用任职字段判断，不用本班班主任姓名（player.homeroom 是赵映秋等人的名字）。
 * 以后若玩家接任班主任，设置 player.isHomeroom 或 player.homeroomOf = 班号即可。
 * 上帝模式不得写入这两个字段，也不应经过本函数判断。
 */
export function isPlayerHomeroom(player, classNo = player?.classNo) {
  if (!player || classNo == null) return false;
  if (player.homeroomOf != null) return Number(player.homeroomOf) === Number(classNo);
  return player.isHomeroom === true;
}

/**
 * 上帝模式叠加层：是否按本班班主任身份查看考后分析。
 * 只读独立设置，不读写 player.isHomeroom / homeroomOf，也不改变学校正式班主任（player.homeroom）。
 * 仅对本班（player.classNo）生效。settings 可显式传入，缺省则读本机设置，默认关闭。
 */
export function isActingHomeroom(player, classNo = player?.classNo, settings) {
  const conf = settings || loadGodSettings();
  if (!conf?.actAsHomeroom) return false;
  if (!player || classNo == null) return false;
  return Number(player.classNo) === Number(classNo);
}

export function analysisScope(player, classNo = player?.classNo, settings) {
  if (isPlayerHomeroom(player, classNo)) return "class";
  if (isActingHomeroom(player, classNo, settings)) return "class";
  return "subject";
}

export function officialHomeroomName(player) {
  return player?.homeroom || "赵映秋";
}

export function chatCompletionsUrl(baseUrl) {
  const b = String(baseUrl || DEFAULT_AI_BASE_URL).trim().replace(/\/+$/, "");
  if (!b) return `${DEFAULT_AI_BASE_URL}/chat/completions`;
  if (/\/chat\/completions$/i.test(b)) return b;
  return `${b}/chat/completions`;
}

function avg(nums) {
  if (!nums.length) return 0;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

function subjectLabel(id) {
  return subjectById(id)?.name || SUBJECT_FALLBACK[id] || id;
}

function cutoffOf(report, track) {
  if (!report?.cutoffs) return null;
  if (!report.split) return report.cutoffs.mixed || null;
  if (track === "wen") return report.cutoffs.wen || null;
  return report.cutoffs.li || null;
}

function rankBuckets(rows) {
  const buckets = [
    { label: "校排 1–100", min: 1, max: 100, n: 0 },
    { label: "校排 101–300", min: 101, max: 300, n: 0 },
    { label: "校排 301–500", min: 301, max: 500, n: 0 },
    { label: "校排 501–1000", min: 501, max: 1000, n: 0 },
    { label: "校排 1000 以后", min: 1001, max: 99999, n: 0 },
  ];
  for (const r of rows) {
    const rk = r.rank;
    if (rk == null) continue;
    const b = buckets.find((x) => rk >= x.min && rk <= x.max);
    if (b) b.n += 1;
  }
  return buckets;
}

export function canAnalyzeReport(report, classNo) {
  if (!report) return { ok: false, reason: "还没有这场考试的成绩。" };
  if (report.pruned && !(report.rows || []).length) {
    return { ok: false, reason: "这场考试的成绩明细已经精简，无法再生成分析。" };
  }
  const mine = (report.rows || []).filter((r) => r.classNo === classNo && !r.repeat);
  if (!mine.length) return { ok: false, reason: "这场考试里没有本班应届成绩。" };
  return { ok: true, rows: mine };
}

/** 本届已结算、日期早于本场的考试，不含当前场和空明细。 */
export function previousReportsFrom(list, report) {
  const date = report?.date;
  const examId = report?.examId;
  return (list || []).filter((r) => {
    if (!r || !r.date || !date) return false;
    if (r.date >= date) return false;
    if (r.examId && r.examId === examId && r.date === date) return false;
    if (r.pruned && !(r.rows || []).length) return false;
    if (!Array.isArray(r.rows) || !r.rows.length) return false;
    return true;
  });
}

export function pickPreviousComparableReport(report, previousReports) {
  const list = previousReportsFrom(previousReports, report)
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : String(a.examId || "").localeCompare(String(b.examId || ""))));
  return list[0] || null;
}

function reportMaxTotal(report) {
  if (report?.scale === "g1-950") return 950;
  const row = (report?.rows || []).find((r) => r.maxTotal);
  return row?.maxTotal || 750;
}

function sameScoreScale(a, b) {
  if (!a || !b) return false;
  return reportMaxTotal(a) === reportMaxTotal(b);
}

function rankChange(prev, cur) {
  if (prev == null || cur == null) return null;
  return { 上场: prev, 本场: cur, 变化: prev - cur };
}

function formatRankArrow(ch) {
  if (!ch) return "";
  const dir = ch.变化 > 0 ? "进步" : ch.变化 < 0 ? "退步" : "持平";
  return `${ch.上场}→${ch.本场}（${dir}${Math.abs(ch.变化)}）`;
}

function meanRank(snaps, key) {
  const vals = snaps.map((s) => s?.[key]).filter((n) => typeof n === "number");
  return vals.length ? avg(vals) : null;
}

function meanScore(rows, key) {
  const vals = rows.map((r) => r[key]).filter((n) => typeof n === "number");
  return vals.length ? avg(vals) : null;
}

function crossRanks(snap) {
  const out = [];
  for (const key of ["next", "top"]) {
    const c = snap.cross?.[key];
    if (!c || c.tier === snap.tier) continue;
    if (out.some((x) => x.层次代码 === c.tier)) continue;
    out.push({ 层次: c.name || tierName(c.tier), 层次代码: c.tier, 名次: c.rank, 池人数: c.n });
  }
  return out;
}

function subjectCrossRanks(snap, subjectId) {
  const sub = snap.subjects?.[subjectId];
  const out = [];
  const { next, top } = strongerTiers(snap.tier);
  for (const tid of [next, top]) {
    if (!tid || tid === snap.tier) continue;
    const c = sub?.cross?.[tid];
    if (!c) continue;
    if (out.some((x) => x.层次代码 === tid)) continue;
    out.push({ 层次: c.name || tierName(tid), 层次代码: tid, 名次: c.rank, 池人数: c.n });
  }
  return out;
}

function scoreDelta(curSnap, prevSnap, sameScale) {
  if (!prevSnap) return null;
  if (sameScale) {
    return { 可直接比分: true, 分数差: curSnap.total - prevSnap.total };
  }
  return {
    可直接比分: false,
    折合750分差: (curSnap.scaled750 ?? 0) - (prevSnap.scaled750 ?? 0),
    说明: "两场满分不同，不以原始分相减作为进退步，分数只附折合 750 分",
  };
}

function studentDelta(curSnap, prevSnap, sameScale, subjectId) {
  if (!curSnap || !prevSnap) return null;
  const d = {
    上一场: { 名称: prevSnap.examName, 日期: prevSnap.date, 满分: prevSnap.maxTotal },
    总分班排: rankChange(prevSnap.classRank, curSnap.classRank),
    总分同层次排: rankChange(prevSnap.tierRank, curSnap.tierRank),
    总分校排: rankChange(prevSnap.schoolRank, curSnap.schoolRank),
    分数: scoreDelta(curSnap, prevSnap, sameScale),
  };
  if (subjectId && curSnap.subjects?.[subjectId] && prevSnap.subjects?.[subjectId]) {
    const a = prevSnap.subjects[subjectId];
    const b = curSnap.subjects[subjectId];
    d.该科班排 = rankChange(a.classRank, b.classRank);
    d.该科同层次排 = rankChange(a.tierRank, b.tierRank);
    d.该科校排 = rankChange(a.schoolRank, b.schoolRank);
    d.该科分数差 = sameScale ? b.score - a.score : null;
  }
  return d;
}

function reasonFromDelta(d, { subjectFirst = false } = {}) {
  if (!d) return "";
  const bits = [];
  if (subjectFirst) {
    if (d.该科校排) bits.push(`该科校排 ${formatRankArrow(d.该科校排)}`);
    if (d.该科班排) bits.push(`该科班排 ${formatRankArrow(d.该科班排)}`);
    if (d.总分校排) bits.push(`总分校排 ${formatRankArrow(d.总分校排)}`);
  } else {
    if (d.总分校排) bits.push(`校排 ${formatRankArrow(d.总分校排)}`);
    if (d.总分班排) bits.push(`班排 ${formatRankArrow(d.总分班排)}`);
    if (d.总分同层次排) bits.push(`同层次排 ${formatRankArrow(d.总分同层次排)}`);
  }
  if (d.分数?.可直接比分) bits.push(`总分差 ${d.分数.分数差 > 0 ? "+" : ""}${d.分数.分数差}`);
  else if (d.分数 && d.分数.可直接比分 === false && d.分数.折合750分差 != null) {
    bits.push(`折合750分差 ${d.分数.折合750分差 > 0 ? "+" : ""}${d.分数.折合750分差}（制度不同）`);
  }
  return bits.join("，");
}

function nearLineItems(report, mine, snaps, track) {
  const cut = cutoffOf(report, track);
  const year = provincialCompareYear(report.date);
  const lines = provincialLines(year, track === "wen" ? "wen" : "li");
  const maxT = reportMaxTotal(report);
  const schoolMargin = maxT >= 900 ? 16 : 12;
  const provMargin = 12;
  const out = [];
  for (const r of mine) {
    const snap = snaps.get(r.studentId);
    if (!snap) continue;
    const reasons = [];
    if (cut?.firstLine != null) {
      const gap = r.total - cut.firstLine;
      if (Math.abs(gap) <= schoolMargin) {
        reasons.push(`总分 ${r.total}，校内一本线 ${cut.firstLine}，${gap >= 0 ? "高出" : "差"} ${Math.abs(gap)} 分`);
      }
    }
    if (cut?.secondLine != null) {
      const gap = r.total - cut.secondLine;
      if (Math.abs(gap) <= schoolMargin) {
        reasons.push(`总分 ${r.total}，校内二本线 ${cut.secondLine}，${gap >= 0 ? "高出" : "差"} ${Math.abs(gap)} 分`);
      }
    }
    if (cut?.firstN != null && snap.schoolRank != null && Math.abs(snap.schoolRank - cut.firstN) <= 8) {
      reasons.push(`校排 ${snap.schoolRank}，临近校内一本名额第 ${cut.firstN} 名`);
    }
    if (cut?.secondN != null && snap.schoolRank != null && Math.abs(snap.schoolRank - cut.secondN) <= 8) {
      reasons.push(`校排 ${snap.schoolRank}，临近校内二本名额第 ${cut.secondN} 名`);
    }
    const s750 = scaledTotal750(r);
    if (lines?.first != null && Math.abs(s750 - lines.first) <= provMargin) {
      const gap = s750 - lines.first;
      reasons.push(`折合750分 ${s750}，对照省控一本 ${lines.first}，${gap >= 0 ? "高出" : "差"} ${Math.abs(gap)} 分`);
    }
    if (lines?.second != null && Math.abs(s750 - lines.second) <= provMargin) {
      const gap = s750 - lines.second;
      reasons.push(`折合750分 ${s750}，对照省控二本 ${lines.second}，${gap >= 0 ? "高出" : "差"} ${Math.abs(gap)} 分`);
    }
    if (reasons.length) {
      out.push({ 姓名: r.name, 学生: r.studentId, 原因: reasons.join("；"), 总分: r.total, 校排: snap.schoolRank });
    }
  }
  out.sort((a, b) => (a.校排 ?? 9999) - (b.校排 ?? 9999));
  return out.slice(0, 5);
}

function pickTalkLists(mine, deltas, snaps, { subjectFirst, report, track }) {
  const rows = mine.map((r) => ({
    姓名: r.name,
    学生: r.studentId,
    delta: deltas.get(r.studentId) || null,
    snap: snaps.get(r.studentId),
  })).filter((x) => x.snap);

  const schoolKey = subjectFirst ? "该科校排" : "总分校排";
  const classKey = subjectFirst ? "该科班排" : "总分班排";
  const metric = (row) => row.delta?.[schoolKey]?.变化 ?? 0;
  const classMetric = (row) => row.delta?.[classKey]?.变化 ?? 0;

  const withPrev = rows.filter((x) => x.delta);
  const improved = withPrev
    .filter((x) => metric(x) >= 15 || classMetric(x) >= 5)
    .sort((a, b) => metric(b) - metric(a) || classMetric(b) - classMetric(a))
    .slice(0, 5)
    .map((x) => ({ 姓名: x.姓名, 原因: reasonFromDelta(x.delta, { subjectFirst }) }));
  const slipped = withPrev
    .filter((x) => metric(x) <= -15 || classMetric(x) <= -5)
    .sort((a, b) => metric(a) - metric(b) || classMetric(a) - classMetric(b))
    .slice(0, 5)
    .map((x) => ({ 姓名: x.姓名, 原因: reasonFromDelta(x.delta, { subjectFirst }) }));
  const volatile = withPrev
    .filter((x) => Math.abs(metric(x)) >= 25 || Math.abs(classMetric(x)) >= 8)
    .sort((a, b) => Math.abs(metric(b)) - Math.abs(metric(a)))
    .slice(0, 5)
    .map((x) => ({ 姓名: x.姓名, 原因: reasonFromDelta(x.delta, { subjectFirst }) }));
  const near = nearLineItems(report, mine, snaps, track);
  return {
    进步较大: improved,
    退步较大: slipped,
    临近校内或省控线: near.map((x) => ({ 姓名: x.姓名, 原因: x.原因 })),
    排名波动较大: volatile,
  };
}

function classCompareSummary({ mine, prevMine, report, prev, snaps, prevSnaps, sameScale, subjectId, subjectName, schoolRows, tierRows }) {
  const curAvg = Math.round((mine.reduce((a, r) => a + r.total, 0) / mine.length) * 100) / 100;
  const curMeanSchool = meanRank([...snaps.values()], "schoolRank");
  const curMeanTier = meanRank([...snaps.values()], "tierRank");
  const tierAvg = meanScore(tierRows, "total");
  const out = {
    本场总分均分: curAvg,
    本场均校排: curMeanSchool,
    本场均同层次排: curMeanTier,
    同层次均分: tierAvg,
    本班均分减同层次: tierAvg != null ? Math.round((curAvg - tierAvg) * 100) / 100 : null,
  };
  if (subjectId) {
    out[`本场${subjectName}均分`] = meanScore(mine, subjectId);
    out[`同层次${subjectName}均分`] = meanScore(tierRows, subjectId);
    const subRanks = [...snaps.values()].map((s) => s.subjects?.[subjectId]?.schoolRank).filter((n) => typeof n === "number");
    out[`本场${subjectName}均校排`] = subRanks.length ? avg(subRanks) : null;
  }
  if (!prev || !prevMine?.length) {
    out.上一场 = null;
    out.说明 = "没有可对比的先前成绩，班级对比只给本场与同层次。";
    return out;
  }
  out.上一场 = {
    名称: prev.examName,
    日期: prev.date,
    满分: reportMaxTotal(prev),
    总分均分: Math.round((prevMine.reduce((a, r) => a + r.total, 0) / prevMine.length) * 100) / 100,
    均校排: meanRank([...prevSnaps.values()], "schoolRank"),
  };
  out.较上场 = {
    均校排变化: (out.上一场.均校排 != null && curMeanSchool != null)
      ? Math.round((out.上一场.均校排 - curMeanSchool) * 10) / 10
      : null,
  };
  if (sameScale) {
    out.较上场.总分均分差 = Math.round((curAvg - out.上一场.总分均分) * 100) / 100;
  } else {
    const cur750 = avg(mine.map((r) => scaledTotal750(r)));
    const prev750 = avg(prevMine.map((r) => scaledTotal750(r)));
    out.较上场.折合750均分差 = Math.round((cur750 - prev750) * 10) / 10;
    out.较上场.说明 = "两场满分不同，均分进退步用折合 750 分，不以原始分相减。";
  }
  if (subjectId && sameScale) {
    const curS = meanScore(mine, subjectId);
    const prevS = meanScore(prevMine, subjectId);
    if (curS != null && prevS != null) out.较上场[`${subjectName}均分差`] = Math.round((curS - prevS) * 10) / 10;
  }
  if (subjectId) {
    const prevSub = [...prevSnaps.values()].map((s) => s.subjects?.[subjectId]?.schoolRank).filter((n) => typeof n === "number");
    const curSub = [...snaps.values()].map((s) => s.subjects?.[subjectId]?.schoolRank).filter((n) => typeof n === "number");
    if (prevSub.length && curSub.length) {
      out.较上场[`${subjectName}均校排变化`] = Math.round((avg(prevSub) - avg(curSub)) * 10) / 10;
    }
  }
  return out;
}

/**
 * 把已经算好的成绩、排名、划线、进退步整理成给模型的事实稿。数字全部来自报告，分析时不得改写。
 * previousReports / reports：本届已结算考试，函数会排除当前场和未结算/已精简空场。
 */
export function buildExamAnalysisPayload(report, { player, classNo, previousReports, reports, godSettings } = {}) {
  const clsNo = classNo ?? player?.classNo;
  const check = canAnalyzeReport(report, clsNo);
  if (!check.ok) return { ok: false, reason: check.reason };
  const mine = check.rows;
  const scope = analysisScope(player, clsNo, godSettings);
  const officialHome = isPlayerHomeroom(player, clsNo);
  const actingHome = isActingHomeroom(player, clsNo, godSettings);
  const subjectId = playerSubjectId(player);
  const subjectName = playerSubjectName(player);
  const tier = mine[0]?.tier;
  const track = mine[0]?.track || (report.split ? "li" : "mixed");
  const cut = cutoffOf(report, track);
  const totals = mine.map((r) => r.total);
  const classSummary = {
    avg: Math.round((totals.reduce((a, b) => a + b, 0) / totals.length) * 100) / 100,
    max: Math.max(...totals),
    min: Math.min(...totals),
    firstCount: cut ? mine.filter((r) => r.total >= cut.firstLine).length : 0,
    secondCount: cut ? mine.filter((r) => r.total >= cut.secondLine).length : 0,
  };
  const schoolRows = (report.rows || []).filter((r) => !r.repeat && (!report.split || r.track === track));
  const tierRows = schoolRows.filter((r) => r.tier === tier);
  const prov = classProvincialCounts(report, clsNo);
  const schoolLine = cut ? {
    firstLine: cut.firstLine,
    secondLine: cut.secondLine,
    firstN: cut.firstN,
    secondN: cut.secondN,
  } : null;

  const priorList = previousReports || reports || [];
  const prev = pickPreviousComparableReport(report, priorList);
  const sameScale = prev ? sameScoreScale(report, prev) : false;
  const snaps = new Map();
  for (const r of mine) {
    const snap = buildStudentExamSnapshot(r.studentId, report);
    if (snap) snaps.set(r.studentId, snap);
  }
  const prevMine = prev ? (prev.rows || []).filter((r) => r.classNo === clsNo && !r.repeat) : [];
  const prevSnaps = new Map();
  const deltas = new Map();
  if (prev) {
    for (const r of mine) {
      const cur = snaps.get(r.studentId);
      const pre = buildStudentExamSnapshot(r.studentId, prev);
      if (pre) prevSnaps.set(r.studentId, pre);
      if (cur && pre) deltas.set(r.studentId, studentDelta(cur, pre, sameScale, subjectId));
    }
  }

  const fact = {
    须知: "下列数字已由游戏结算完成，包括排名和与上一场的进退步。分析评语必须使用这些数字，不得生成、改写或估算分数、排名、上线人数或进退步。",
    考试: {
      名称: report.examName,
      日期: report.date,
      种类: report.examKind,
      年级: report.grade,
      难度: report.difficulty,
      离散: report.dispersion,
      已分科: !!report.split,
      满分: reportMaxTotal(report),
    },
    班级: {
      班号: clsNo,
      层次: TIER[tier]?.name || tier || "",
      层次代码: tier || "",
      科类: track === "wen" ? "文科" : track === "li" ? "理科" : "未分科",
      应届人数: mine.length,
    },
    教师身份: {
      职务: officialHome
        ? "本班班主任"
        : actingHome
          ? "本班班主任（上帝模式查看）"
          : "单科任课老师",
      任教科目: subjectName,
      分析范围: scope === "class"
        ? "全班整体（总分、均分、校内线、对照省控、班/层/校排与跨层次排、各科概要、进退步及建议谈话对象）"
        : `以本班${subjectName}单科为主，整体总分排名只作背景，含进退步和建议谈话对象`,
      ...(actingHome && !officialHome ? {
        学校正式班主任: officialHomeroomName(player),
        说明: "上帝模式只改变分析查看范围，不表示已接任班主任。",
      } : {}),
    },
    校内划线说明: describeSchoolCutoff(report.quota, report.split),
    校内线: schoolLine,
    本班校内上线: cut ? { 一本: classSummary.firstCount, 二本累计: classSummary.secondCount } : null,
    对照省控说明: describeClassProvincial(report, clsNo),
    对照省控: { 年份: prov.year, 一本: prov.firstN, 二本累计: prov.secondN },
    全校对照省控说明: describeSchoolProvincial(report),
    同层次对照: describeZhuoxingPeers(report, clsNo) || "",
    本班总分: {
      均分: classSummary.avg,
      最高: classSummary.max,
      最低: classSummary.min,
    },
  };

  if (prev) {
    fact.进退步对照 = {
      有上一场: true,
      上一场: { 名称: prev.examName, 日期: prev.date, 种类: prev.examKind, 年级: prev.grade, 满分: reportMaxTotal(prev) },
      制度相同: sameScale,
      说明: sameScale
        ? "与上一场满分相同，分数差与排名变化均可对照。名次变小为进步。"
        : "与上一场满分不同（如高一 950 与高二/高三 750），进退步以排名变化为主；分数只附折合 750 分，不要把原始分直接相减当成进退步。名次变小为进步。",
    };
  } else {
    fact.进退步对照 = {
      有上一场: false,
      上一场: null,
      说明: "这是本届已结算成绩中可对比的第一场，或没有更早的已结算考试，材料里没有先前对比，不要虚构进退步。",
    };
  }

  fact.班级对比摘要 = classCompareSummary({
    mine, prevMine, report, prev, snaps, prevSnaps, sameScale,
    subjectId: scope === "subject" ? subjectId : null,
    subjectName, schoolRows, tierRows,
  });

  if (scope === "class") {
    fact.排名分布 = rankBuckets(mine).map((b) => ({ 分段: b.label, 人数: b.n }));
    fact.各科均分 = {};
    fact.各科排名概要 = {};
    const ids = [...new Set(mine.flatMap((r) => r.subjects || []))];
    for (const id of ids) {
      const classAvg = avg(mine.map((r) => r[id]).filter((n) => typeof n === "number"));
      const schoolAvg = avg(schoolRows.map((r) => r[id]).filter((n) => typeof n === "number"));
      const tierAvg = avg(tierRows.map((r) => r[id]).filter((n) => typeof n === "number"));
      const ranked = subjectRanks(schoolRows, id);
      const classSub = ranked.filter((x) => x.classNo === clsNo).sort((a, b) => a.subjectRank - b.subjectRank);
      const best = classSub[0] || ranked.find((x) => x.classNo === clsNo);
      const worst = classSub[classSub.length - 1];
      const label = subjectLabel(id);
      fact.各科均分[label] = {
        本班均分: classAvg,
        同层次均分: tierAvg,
        年级均分: schoolAvg,
        本班最高: best ? { 姓名: best.name, 分数: best.score, 校排: best.subjectRank } : null,
      };
      fact.各科排名概要[label] = {
        本班均分: classAvg,
        同层次均分: tierAvg,
        年级均分: schoolAvg,
        最高: best ? { 姓名: best.name, 分数: best.score, 该科校排: best.subjectRank } : null,
        最低: worst ? { 姓名: worst.name, 分数: worst.score, 该科校排: worst.subjectRank } : null,
      };
    }
    fact.本班学生总分 = mine
      .slice()
      .sort((a, b) => {
        const sa = snaps.get(a.studentId)?.classRank ?? a.rank ?? 9999;
        const sb = snaps.get(b.studentId)?.classRank ?? b.rank ?? 9999;
        return sa - sb || b.total - a.total;
      })
      .map((r) => {
        const snap = snaps.get(r.studentId);
        const row = {
          班排: snap?.classRank ?? null,
          姓名: r.name,
          总分: r.total,
          同层次排: snap?.tierRank ?? null,
          校排: snap?.schoolRank ?? r.rank ?? null,
          跨层次排: snap ? crossRanks(snap) : [],
          校内上线: r.line || "",
        };
        const d = deltas.get(r.studentId);
        if (d) {
          row.较上场 = {
            班排: d.总分班排,
            同层次排: d.总分同层次排,
            校排: d.总分校排,
            分数: d.分数,
          };
        }
        return row;
      });
  } else {
    const scores = mine.map((r) => r[subjectId]).filter((n) => typeof n === "number");
    if (!scores.length) {
      return { ok: false, reason: `这场考试没有本班${subjectName}成绩。` };
    }
    fact.单科 = {
      科目: subjectName,
      本班均分: avg(scores),
      本班最高: Math.max(...scores),
      本班最低: Math.min(...scores),
      同层次均分: avg(tierRows.map((r) => r[subjectId]).filter((n) => typeof n === "number")),
      年级均分: avg(schoolRows.map((r) => r[subjectId]).filter((n) => typeof n === "number")),
    };
    fact.本班该科成绩 = mine
      .slice()
      .sort((a, b) => (b[subjectId] ?? -1) - (a[subjectId] ?? -1) || b.total - a.total)
      .map((r, i) => {
        const snap = snaps.get(r.studentId);
        const sub = snap?.subjects?.[subjectId];
        const row = {
          班排: sub?.classRank ?? i + 1,
          姓名: r.name,
          分数: r[subjectId],
          该科班排: sub?.classRank ?? null,
          该科同层次排: sub?.tierRank ?? null,
          该科校排: sub?.schoolRank ?? null,
          该科跨层次排: snap ? subjectCrossRanks(snap, subjectId) : [],
          总分: r.total,
          总分班排: snap?.classRank ?? null,
          总分同层次排: snap?.tierRank ?? null,
          总分校排: snap?.schoolRank ?? r.rank ?? null,
        };
        const d = deltas.get(r.studentId);
        if (d) {
          row.较上场 = {
            该科班排: d.该科班排,
            该科同层次排: d.该科同层次排,
            该科校排: d.该科校排,
            该科分数差: d.该科分数差,
            总分班排: d.总分班排,
            总分同层次排: d.总分同层次排,
            总分校排: d.总分校排,
            分数: d.分数,
          };
        }
        return row;
      });
  }

  fact.建议谈话 = pickTalkLists(mine, deltas, snaps, { subjectFirst: scope === "subject", report, track });

  if (report.examKind === "huikao" && report.huikao) {
    fact.会考 = {
      说明: report.huikao.source || report.sourceNote || "",
      本班校内合格: mine.filter((r) => r.huikaoPass).length,
      本班人数: mine.length,
    };
  }

  return { ok: true, scope, subjectId, subjectName, classNo: clsNo, fact, previousExam: prev ? { examId: prev.examId, date: prev.date } : null };
}

export function buildAnalysisMessages(payload) {
  const fact = payload.fact;
  const scopeHint = payload.scope === "class"
    ? "读者是该班班主任，请写全班整体考后总结：总分与均分、校内线与对照省控、班/层/校排和跨层次对比、排名分布、各科概要，并用材料里已经列好的建议谈话名单指出该谈的人。"
    : `读者是该班${payload.subjectName}任课老师（不是班主任），分析仍以本班${payload.subjectName}为主；整体总分排名只作背景，不要展开其他科目成绩表。用已算好的该科与总分进退步、建议谈话名单帮老师找谈话对象并写小结。`;
  const system = [
    "你是高中教师的考后分析助手，写给老师看，不是写给学生或家长的通知。",
    "必须严格使用用户消息里已经算好的数字，包括排名、进退步和建议谈话原因，不得生成、改写、估算或纠正任何分数、排名、上线人数、均分、划线或进退步。",
    "不得编造材料里没有的进步、退步或人名。若材料写明没有先前对比，不要虚构进退步。若某项数字材料里没有，就写「材料未给出」，不要自行补数。",
    "分析要结合班级层次（如卓行普通班、凌霄、云岫重点等）和当次考试的难度、校内划线、对照省控。",
    "请根据已算好的排名和进退步帮老师确定谈话对象并写考后总结：指出问题、点出该盯的人（用材料中的姓名和原因数字），给出下一阶段课、作业或辅导的具体抓手。不要空话套话，不要客套开场。",
    "用简体中文，分段宜短，可用条目。不要输出 JSON，不要重复粘贴整张成绩表。",
    scopeHint,
  ].join("");
  const user = `请根据下面这份已结算的考试材料写评语。\n\n${JSON.stringify(fact, null, 2)}`;
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

export function formatAiError(err, status, bodyText) {
  if (err && (err.name === "AbortError" || err.code === "ABORT_ERR")) return "已取消分析。";
  const msg = String(err?.message || err || "");
  if (msg === "NO_KEY") return "还没有填写 API 密钥。请到「设置」里填写后，再生成考后分析。";
  if (msg === "EMPTY") return "分析服务没有返回内容。";
  if (status === 401 || status === 403) return "API 密钥无效或已失效，请到设置里检查后重试。";
  if (status === 402 || status === 429) return "额度不足或请求过于频繁，请稍后再试或检查账户额度。";
  let parsed = null;
  try { parsed = bodyText ? JSON.parse(bodyText) : null; } catch { /* 非 JSON */ }
  const apiMsg = String(parsed?.error?.message || parsed?.message || "");
  const low = (apiMsg + " " + msg).toLowerCase();
  if (/quota|insufficient|balance|额度|余额|billing/.test(low)) {
    return "额度不足或请求过于频繁，请稍后再试或检查账户额度。";
  }
  if (/unauthorized|invalid api key|incorrect api key|authentication/.test(low) || status === 401) {
    return "API 密钥无效或已失效，请到设置里检查后重试。";
  }
  if (status >= 500) return "分析服务暂时不可用，请稍后再试。";
  if (/failed to fetch|networkerror|load failed|econnrefused|enotfound|fetch/.test(low)) {
    return "无法连接到分析服务，请检查网络或接口地址。";
  }
  if (status) return `分析请求失败（${status}）${apiMsg ? "：" + apiMsg : "。请稍后再试。"}`;
  if (/failed to fetch|network|econn|enotfound/i.test(msg)) return "无法连接到分析服务，请检查网络或接口地址。";
  return "分析请求失败，请稍后再试。";
}

export async function requestExamAnalysis(payload, { fetchImpl, settings, signal } = {}) {
  if (!payload?.ok) return { ok: false, reason: payload?.reason || "没有可分析的成绩。" };
  const conf = settings || loadAiSettings();
  const apiKey = String(conf.apiKey || "").trim();
  if (!apiKey) return { ok: false, reason: formatAiError(new Error("NO_KEY")) };
  const model = (conf.model || DEFAULT_AI_MODEL).trim() || DEFAULT_AI_MODEL;
  const url = chatCompletionsUrl(conf.baseUrl);
  const messages = buildAnalysisMessages(payload);
  const fetchFn = fetchImpl || (typeof fetch === "function" ? fetch : null);
  if (!fetchFn) return { ok: false, reason: "当前环境无法发起网络请求。" };
  let res;
  try {
    res = await fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.3,
        max_tokens: 2200,

      }),
      signal,
    });
  } catch (err) {
    return { ok: false, reason: formatAiError(err) };
  }
  const text = await res.text().catch(() => "");
  if (!res.ok) return { ok: false, reason: formatAiError(null, res.status, text) };
  let data;
  try { data = JSON.parse(text); } catch {
    return { ok: false, reason: formatAiError(new Error("EMPTY")) };
  }
  const content = String(data?.choices?.[0]?.message?.content || "").trim();
  if (!content) return { ok: false, reason: formatAiError(new Error("EMPTY")) };
  return { ok: true, text: content, model };
}
