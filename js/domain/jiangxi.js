/** 江西公开分数线与一分一段查询。 */
import { JX_DATA } from "../data/jiangxi2020.js?v=t73u2";
import { hash01 } from "./prng.js?v=t73u2";
import { UNI_985 as OFFICIAL_UNI_985, UNI_211 as OFFICIAL_UNI_211, schoolNameTier } from "./schoolNames.js?v=t73u2";
export { formatSchoolName, universityMark, schoolNameTier, is985Name, is211Name, OFFICIAL_985, OFFICIAL_211, OFFICIAL_985_COUNT, OFFICIAL_211_COUNT, SCHOOL_NAME_SOURCE } from "./schoolNames.js?v=t73u2";

export const PROVINCIAL = JX_DATA.provincial;
export const JX_SOURCE_NOTES = JX_DATA.sourceNotes;

/**
 * 2021–2023 已公布的官方文理省控。单独收录，不改动 PROVINCIAL 里锁定的 2016–2020 数字。
 * 游戏内 2024 及以后不采用 3+1+2 特控/本科线，也不把那些公布分包装成旧一本/二本；
 * 改按 2020 一分一段一本/二本对应省排卡模拟线（非正式官方省控）。
 */
export const LATEST_OFFICIAL_PROVINCIAL_YEAR = 2023;
export const OFFICIAL_PROVINCIAL_AFTER_2020 = {
  2021: {
    official: true,
    scheme: "wenli-batches",
    source: "江西省教育考试院，大江网2021-06-23报道、中新网转江西省教育考试院消息",
    published: "2021-06-23",
    wen: { first: 559, second: 496, special: 150 },
    li: { first: 519, second: 443, special: 150 },
  },
  2022: {
    official: true,
    scheme: "wenli-batches",
    source: "江西省教育考试院/省教育厅新闻发布会2022-06-23，江西日报、中新网江西及江西警察学院招生网转载",
    published: "2022-06-23",
    wen: { first: 529, second: 472, special: 150 },
    li: { first: 509, second: 440, special: 150 },
  },
  2023: {
    official: true,
    scheme: "wenli-batches",
    source: "省教育厅新闻发布会2023-06-23，江西省教育考试院发布；省教育厅、教育在线转载",
    published: "2023-06-23",
    wen: { first: 533, second: 472, special: 200 },
    li: { first: 518, second: 445, special: 200 },
  },
};

export function isOfficialProvincialYear(year) {
  const y = Number(year);
  return !!(PROVINCIAL[y] || PROVINCIAL[year] || OFFICIAL_PROVINCIAL_AFTER_2020[y] || OFFICIAL_PROVINCIAL_AFTER_2020[year]);
}

export function gaokaoScheme(year) {
  void year;
  // 各年份一律旧文理一批/二批，不启用 3+1+2 科目组或合并本科批。
  return "wenli-batches";
}

export function provincialTrackLabel(year, track) {
  void year;
  return track === "wen" ? "文科" : "理科";
}

export function provincialFirstLabel(year) {
  void year;
  return "一本";
}

export function provincialSecondLabel(year) {
  void year;
  return "二本";
}

/** 过线对照用的短标签（人数统计、成绩格）。 */
export function provincialFirstShortLabel(year) {
  void year;
  return "一本";
}

export function provincialSecondShortLabel(year) {
  void year;
  return "二本";
}

/**
 * 录取显示批次。游戏内各年都按一批/二批，不写成合并本科批。
 * band 为 first / second / special / none。
 */
export function provincialEnrollmentBatch(year, band) {
  void year;
  if (band === "special") return "专科";
  if (band === "none" || !band) return "未达专科线";
  return band === "first" ? "一批" : "二批";
}

function cloneLines(src) {
  return { first: src.first, second: src.second, special: src.special };
}

function clampScore(n, lo, hi) {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

/**
 * 尚未采用官方文理省控的年份（含游戏内的 2024 及以后）：
 * 按 2020 一分一段一本/二本对应省排卡线，并结合 2016–2023 公开一本/二本波动和当次难度生成模拟省控。
 * 标明「模拟线，非正式官方省控」，不把 3+1+2 特控/本科线写成旧一本/二本。
 */
export function simulateProvincialYear(year, opts = {}) {
  const y = Number(year) || 0;
  const seed = opts.seed ?? 0;
  const difficulty = Number(opts.difficulty);
  const diff = Number.isFinite(difficulty) && difficulty > 0 ? difficulty : 1;
  const yearsAhead = y - LATEST_OFFICIAL_PROVINCIAL_YEAR;
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const slope = (a) => (a[a.length - 1] - a[0]) / Math.max(1, a.length - 1);
  const diffAdj = (1 - diff) * 80;
  const wave = (tag, spread) => (hash01("jx-prov-sim", y, tag) - 0.5) * spread;
  const jitter = (tag, spread) => (hash01("jx-prov-seed", y, tag, seed) - 0.5) * spread;
  const project = (recent, tag, lo, hi, spread = 22) => {
    const m = mean(recent);
    const last = recent[recent.length - 1];
    const raw = m + 0.2 * (last - m) + 0.15 * slope(recent) * yearsAhead + diffAdj + wave(tag, spread) + jitter(tag, 8);
    return clampScore(raw, lo, hi);
  };
  const anchor = PROVINCIAL[2020];
  const liGap = anchor.li.first - anchor.li.second;
  const wenGap = anchor.wen.first - anchor.wen.second;
  // 2016–2023 公开一本，分数可随年波动；二本按 2020 一本/二本省排分差卡住，使上线按同一套省排判定。
  const liFirst = project([529, 503, 527, 522, 535, 519, 509, 518], "li-1", 495, 555);
  const wenFirst = project([523, 533, 568, 558, 547, 559, 529, 533], "wen-1", 515, 575, 18);
  const liSecond = liFirst - liGap;
  const wenSecond = wenFirst - wenGap;
  let liSpecial = project([150, 150, 160, 160, 150, 150, 150, 200], "li-sp", 140, 220, 20);
  let wenSpecial = project([150, 150, 160, 160, 150, 150, 150, 200], "wen-sp", 140, 220, 20);
  if (liSpecial > liSecond - 80) liSpecial = clampScore(liSecond - 80, 140, 220);
  if (wenSpecial > wenSecond - 80) wenSpecial = clampScore(wenSecond - 80, 140, 220);
  return {
    official: false,
    simulated: true,
    scheme: "wenli-batches",
    source: "模拟线，非正式官方省控。按2020年江西一分一段理科一本、文科一本及对应二本的省排卡线，并结合2016–2023公开一本/二本波动及当次高考试卷难度生成，可复现，不是省教育考试院公布数字。",
    wen: { first: wenFirst, second: wenSecond, special: wenSpecial },
    li: { first: liFirst, second: liSecond, special: liSpecial },
  };
}

export function provincialYearRecord(year, opts = {}) {
  const y = Number(year);
  const locked = PROVINCIAL[y] || PROVINCIAL[year];
  if (locked) {
    return {
      official: true,
      simulated: false,
      scheme: "wenli-batches",
      source: locked.source || JX_SOURCE_NOTES.provincialLines,
      wen: cloneLines(locked.wen),
      li: cloneLines(locked.li),
    };
  }
  const later = OFFICIAL_PROVINCIAL_AFTER_2020[y] || OFFICIAL_PROVINCIAL_AFTER_2020[year];
  if (later) {
    return {
      official: true,
      simulated: false,
      scheme: later.scheme,
      source: later.source,
      published: later.published,
      wen: cloneLines(later.wen),
      li: cloneLines(later.li),
    };
  }
  return simulateProvincialYear(Number.isFinite(y) ? y : 0, opts);
}

/**
 * 返回当年文理省控。2016–2020 仍返回 PROVINCIAL 原对象，数字锁定。
 * 缺年不再静默套用 2020 官方线；2021–2023 用已公布文理省控，2024 及以后给出按省排卡定的模拟线。
 */
export function provincialLines(year, track, opts = {}) {
  const tr = track === "wen" ? "wen" : "li";
  const locked = PROVINCIAL[year] || PROVINCIAL[Number(year)];
  if (locked) return locked[tr];
  const rec = provincialYearRecord(year, opts);
  return rec[tr];
}

function officialNon2020SourceNote(year) {
  const y = Number(year);
  if (y >= 2021) {
    return "分数线来自江西省教育考试院公开省控线。当年仍为文史/理工一批、二批。当年完整一分一段未收入，这里不把平移到 2020 表的估算位次写成官方位次。";
  }
  return "分数线来自江西省教育考试院公开省控线。2017–2019 年完整一分一段未收入，这里不把平移到 2020 表的估算位次写成官方位次。";
}

export function officialProvincialPack(year, opts = {}) {
  const y = Number(year);
  const rec = provincialYearRecord(y, opts);
  const displayYear = Number.isFinite(y) && y > 0 ? y : LATEST_OFFICIAL_PROVINCIAL_YEAR;
  const wen = rec.wen;
  const li = rec.li;
  const official = !!rec.official;
  const simulated = !!rec.simulated;
  const scheme = rec.scheme || gaokaoScheme(displayYear);
  const sourceNote = official
    ? (displayYear === 2020
      ? "分数线和位次来自江西省教育考试院公开分数线及2020年一分一段累计人数。"
      : officialNon2020SourceNote(displayYear))
    : "模拟线，非正式官方省控。按2020年江西一分一段理科一本、文科一本及对应二本的省排卡线，并结合2016–2023公开一本/二本波动和当次高考试卷难度生成，可复现；不是省教育考试院公布的分数线。不伪造当年完整投档表，院校线仍按省控分差平移2020投档结构。";
  const packYear = official || simulated ? displayYear : displayYear;
  return {
    year: packYear,
    official,
    simulated,
    scheme,
    firstLabel: provincialFirstLabel(packYear),
    secondLabel: provincialSecondLabel(packYear),
    firstShort: provincialFirstShortLabel(packYear),
    secondShort: provincialSecondShortLabel(packYear),
    trackLabel: {
      wen: provincialTrackLabel(packYear, "wen"),
      li: provincialTrackLabel(packYear, "li"),
    },
    simulatedNote: simulated ? "模拟线，非正式官方省控" : "",
    wen: { first: wen.first, second: wen.second, special: wen.special, gap: wen.first - wen.second, ranks: officialSegmentRanks(packYear, "wen") },
    li: { first: li.first, second: li.second, special: li.special, gap: li.first - li.second, ranks: officialSegmentRanks(packYear, "li") },
    source: rec.source || JX_SOURCE_NOTES.provincialLines,
    rankSource: packYear === 2020 ? JX_SOURCE_NOTES.rankTables : null,
    sourceNote,
  };
}

/**
 * 一分一段表顶端：跳过与下一档累计人数相同、却跨过缺失分数的封顶行。
 * 例如理工 [[750,11],[695,11],...] 里 750 不是逐分解析行，最高实际公布分是 695。
 */
export function officialRankTableTop(table) {
  let i = 0;
  while (i + 1 < table.length && table[i][1] === table[i + 1][1] && table[i][0] > table[i + 1][0] + 1) {
    i += 1;
  }
  return { score: table[i][0], rank: table[i][1], index: i };
}

/** 表内最高实际公布分以上的稀尾推算：更高分更好，未真正同分不并列。不伪造官方分数行。 */
export function extrapolateRankAboveOfficial(score, maxOfficialScore, rankAtOfficial) {
  const s = Math.round(Number(score));
  if (s <= maxOfficialScore) return rankAtOfficial;
  return Math.max(1, rankAtOfficial - (s - maxOfficialScore));
}

/** 用 2020 一分一段查位次；其他年份先按当年一本线与 2020 一本线的分差平移到 2020 分。 */
export function provincialRank(score, track, year = 2020, opts = {}) {
  const table = track === "wen" ? JX_DATA.rankWen : JX_DATA.rankLi;
  let s = Math.round(Number(score));
  if (year !== 2020) {
    const src = provincialLines(year, track, opts);
    const base = provincialLines(2020, track);
    s = Math.round(s - (src.first - base.first));
  }
  const top = officialRankTableTop(table);
  if (s > top.score) return extrapolateRankAboveOfficial(s, top.score, top.rank);
  let last = table[table.length - 1][1];
  for (const [pt, cum] of table) {
    if (pt <= s) return cum;
    last = cum;
  }
  return last;
}

/** 仅 2020 年返回考试院一分一段累计位次；其他年份不把平移估算写成官方位次。 */
export function officialSegmentRanks(year, track) {
  if (Number(year) !== 2020) return null;
  const lines = provincialLines(2020, track);
  if (!lines) return null;
  return {
    firstN: provincialRank(lines.first, track, 2020),
    secondN: provincialRank(lines.second, track, 2020),
  };
}

export function universities() {
  return JX_DATA.universities;
}

export const QINGBEI = new Set(["清华大学", "北京大学", "北京大学医学部"]);

export const UNI_985 = OFFICIAL_UNI_985;
export const UNI_211 = OFFICIAL_UNI_211;

export function uniTier(name) {
  if (!name) return "other";
  const tier = schoolNameTier(name);
  if (tier === "u985") {
    const bare = String(name).replace(/^[★▲]+/, "").trim();
    const base = bare.replace(/[（(].*$/, "");
    if (QINGBEI.has(bare) || QINGBEI.has(base) || /^清华大学$|^北京大学$|^北京大学医学部$|^清华$|^北大$/.test(bare) || /^清华大学$|^北京大学$/.test(base)) {
      return "qingbei";
    }
    return "u985";
  }
  if (tier === "u211") return "u211";
  return "other";
}

export function gapOfficial(year, track) {
  const L = provincialLines(year, track);
  return L.first - L.second;
}
