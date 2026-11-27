/**
 * 学长学姐助力高考：根据已毕业届的真实录取，在下一届高考前展示语录。
 * 只使用档案里已有的录取结果，不虚构清北或其他名校。
 * 自动模式不生成、不发布、不操作本板块。AI 只润色已有事实，失败则用本地语录。
 */
import { hash01 } from "./prng.js?v=t74u2";
import { addDays, schoolYearOf, ymd, SCHOOL_CALENDAR } from "./calendar.js?v=t74u2";
import { formatSchoolName, schoolNameTier, is985Name, canonicalSchoolName } from "./schoolNames.js?v=t74u2";
import { isQingbeiName } from "./contests.js?v=t74u2";

export const ALUMNI_BOOST_TITLE = "学长学姐助力高考";
export const ALUMNI_BOOST_CAP = 12;
export const ALUMNI_BOOST_SOURCE_NOTE = "语录只根据已毕业届的真实录取整理，不虚构院校或姓名对应关系。985 校名前加★，非985的211前加▲。";

const TEMPLATES = [
  (e) => `已毕业的${e.name}考入${e.schoolLabel}${e.major ? "（" + e.major + "）" : ""}。把该复习的过一遍，心态稳住，高考同样能走出自己的路。`,
  (e) => `${e.name}被${e.schoolLabel}${e.major ? "（" + e.major + "）" : ""}录取。上一届已经证明，踏实迎考会有回响。祝福学弟学妹顺利发挥。`,
  (e) => `${e.year}年，${e.classNo}班的${e.name}走进了${e.schoolLabel}。现在轮到你们了：按计划做完该做的，别把精力耗在比较上。`,
  (e) => `学长学姐里，${e.name}最终去了${e.schoolLabel}。这份结果来自真实高考录取，不是喜报凑数。预祝本届考生沉着应考。`,
  (e) => `${e.name}的去向是${e.schoolLabel}${e.major ? " · " + e.major : ""}。临近高考，把会的做对、把步骤写清，比再慌一场更有用。`,
];

function genderTemplateIndex(name, seed, id) {
  const h = hash01(seed ?? 1, id || name, "alumni-boost-tpl");
  return Math.floor(h * TEMPLATES.length);
}

function admissionYearOf(a, alum) {
  return Number(a?.year || alum?.graduatedYear || alum?.admission?.year || 0) || 0;
}

function admissionNameOf(a, alum) {
  return a?.university || a?.dest || alum?.admission?.university || "";
}

export function isAlumniBoostPlaceholder(name) {
  const n = String(name || "").trim();
  return !n || /未录取|未达专科|^专科|暂缺|^无$/.test(n);
}

/**
 * 较突出的录取：清北、985，或该校相对出色的 211（明显高于一本/特控，或位次很靠前）。
 * 一本补录、主动选二本、专科和未录取都不算。
 */
export function isOutstandingAdmission(admission, alum = null) {
  if (!admission && !alum?.admission) return false;
  const a = admission || alum.admission;
  if (a.abandoned || a.noOffer || a.repeatIntent) return false;
  if (a.supplement || a.goodSecond) return false;
  if (isAlumniBoostPlaceholder(admissionNameOf(a, alum))) return false;
  const uni = admissionNameOf(a, alum);
  if (isAlumniBoostPlaceholder(uni)) return false;
  if (a.qingbei || isQingbeiName(uni) || is985Name(uni)) return true;
  if (schoolNameTier(uni) !== "u211") return false;
  const total = a.total;
  const first = a.firstLine;
  if (total != null && first != null && Number(total) >= Number(first) + 30) return true;
  if (a.provinceRank != null && Number(a.provinceRank) <= 8000) return true;
  if (a.schoolRank != null && Number(a.schoolRank) <= 20) return true;
  if (a.destTier === "u211" && (a.batch === "一批" || a.lineBand === "first" || a.lineBatch === "一批")) return true;
  return false;
}

function outstandingRank(entry) {
  const uni = entry.university;
  if (entry.qingbei || isQingbeiName(uni)) return 0;
  if (is985Name(uni)) return 1;
  return 2;
}

function fromAdmissionRow(a, alum = null) {
  const uni = admissionNameOf(a, alum);
  return {
    studentId: a.studentId || alum?.id || "",
    name: a.name || alum?.name || "",
    classNo: a.classNo ?? alum?.classNo ?? "",
    year: admissionYearOf(a, alum),
    university: uni,
    schoolLabel: formatSchoolName(uni),
    mark: formatSchoolName(uni).startsWith("★") ? "★" : (formatSchoolName(uni).startsWith("▲") ? "▲" : ""),
    major: a.major || "",
    total: a.total,
    firstLine: a.firstLine,
    provinceRank: a.provinceRank,
    schoolRank: a.schoolRank,
    qingbei: !!(a.qingbei || isQingbeiName(uni)),
    destTier: a.destTier || schoolNameTier(uni),
    batch: a.batch || "",
  };
}

/**
 * 从 alumni 与历年 admissions 收集已毕业届的真实录取，按学生去重。
 * 只看高考年份早于「本窗口对应的高考年」的记录，不用在读届更不编造。
 */
export function collectAlumniAdmissions(state, { asOfDate } = {}) {
  const date = asOfDate || state?.date || "";
  const sy = date ? schoolYearOf(date) : 0;
  const currentGaokaoYear = sy ? sy + 1 : 0;
  const byId = new Map();
  const consider = (row, alum) => {
    if (!row) return;
    const year = admissionYearOf(row, alum);
    if (currentGaokaoYear && year && year >= currentGaokaoYear) return;
    const id = String(row.studentId || alum?.id || "");
    const rec = fromAdmissionRow(row, alum);
    if (!rec.university || !rec.name) return;
    const key = id || `${rec.name}|${rec.year}|${rec.university}`;
    if (!byId.has(key)) byId.set(key, rec);
  };
  for (const alum of state?.alumni || []) {
    if (alum?.admission) consider(alum.admission, alum);
  }
  for (const pack of Object.values(state?.admissions || {})) {
    const year = Number(pack?.year || 0);
    if (currentGaokaoYear && year && year >= currentGaokaoYear) continue;
    for (const a of pack?.results || []) consider(a, null);
  }
  return [...byId.values()];
}

export function outstandingAlumniAdmits(state, { asOfDate, cap = ALUMNI_BOOST_CAP } = {}) {
  const all = collectAlumniAdmissions(state, { asOfDate }).filter((e) => isOutstandingAdmission(e));
  all.sort((a, b) => outstandingRank(a) - outstandingRank(b)
    || (Number(b.total) || 0) - (Number(a.total) || 0)
    || String(a.studentId).localeCompare(String(b.studentId))
    || String(a.name).localeCompare(String(b.name)));
  return all.slice(0, cap);
}

export function alumniBoostRange(date, calendar = SCHOOL_CALENDAR) {
  if (!date) return null;
  const sy = schoolYearOf(date);
  const y2 = sy + 1;
  const evs = (calendar || []).filter((e) => e.year === sy || e.year === y2 || e.date?.startsWith(String(y2)));
  const mock1 = evs.find((e) => e.examKind === "mock1" && e.date?.startsWith(String(y2)))
    || evs.find((e) => e.id === `exam-${sy}-mock1`);
  const gk = evs.find((e) => e.examKind === "gaokao" && (e.year === y2 || e.date?.startsWith(String(y2))))
    || evs.find((e) => e.id === `gaokao-${y2}`);
  const start = mock1?.date || ymd(y2, 5, 8);
  const gkStart = gk?.date || ymd(y2, 6, 7);
  const end = addDays(gkStart, Math.max(0, (gk?.days || 3) - 1));
  return { start, end, schoolYear: sy, gaokaoYear: y2 };
}

export function isAlumniBoostWindow(date, calendar = SCHOOL_CALENDAR) {
  const r = alumniBoostRange(date, calendar);
  if (!r) return false;
  return date >= r.start && date <= r.end;
}

export function localAlumniBoostQuote(entry, { seed = 1 } = {}) {
  const i = genderTemplateIndex(entry.name, seed, entry.studentId);
  return TEMPLATES[i](entry);
}

export function buildAlumniBoostBoard(state, { asOfDate, cap = ALUMNI_BOOST_CAP } = {}) {
  const date = asOfDate || state?.date || "";
  const windowOpen = isAlumniBoostWindow(date);
  const entries = outstandingAlumniAdmits(state, { asOfDate: date, cap });
  const quotes = entries.map((e) => ({
    studentId: e.studentId,
    name: e.name,
    university: e.university,
    schoolLabel: e.schoolLabel,
    major: e.major,
    year: e.year,
    classNo: e.classNo,
    qingbei: e.qingbei,
    text: localAlumniBoostQuote(e, { seed: state?.seed ?? 1 }),
  }));
  const visible = windowOpen && quotes.length > 0;
  const years = [...new Set(quotes.map((q) => q.year).filter(Boolean))].sort((a, b) => b - a);
  return {
    title: ALUMNI_BOOST_TITLE,
    visible,
    windowOpen,
    reason: !windowOpen ? "不在高三备考或高考季，本板块不展示。" : (quotes.length ? "" : "上一届及已毕业届没有足够突出的录取，不编造名校语录。"),
    quotes,
    entries,
    years,
    sourceNote: ALUMNI_BOOST_SOURCE_NOTE,
    localText: formatAlumniBoostLocal(quotes, { years }),
  };
}

export function formatAlumniBoostLocal(quotes, { years } = {}) {
  if (!quotes?.length) return "";
  const head = years?.length
    ? `根据${years.join("、")}年毕业届的真实录取整理：`
    : "根据已毕业届的真实录取整理：";
  return [head, ...quotes.map((q) => q.text || localAlumniBoostQuote(q))].join("\n");
}

export function alumniBoostAiPayload(board) {
  if (!board?.quotes?.length) return { ok: false, reason: "没有可润色的真实录取语录。" };
  return {
    ok: true,
    说明: "把下列已有事实语录润色成通顺的加油短文或条目。必须保留学生姓名与录取院校的对应关系，不得增删或替换院校，不得编造清北或其他名校，不得改层次标记（★表示985，▲表示非985的211）。不要写潜力、分数名次以外的新奖项。不要写 markdown。只输出 JSON：{\"语录\":\"文本\"}。",
    板块: ALUMNI_BOOST_TITLE,
    出处: ALUMNI_BOOST_SOURCE_NOTE,
    年份: board.years,
    语录: board.quotes.map((q) => ({
      姓名: q.name,
      院校: q.schoolLabel,
      院校原名: q.university,
      专业: q.major || "",
      高考年: q.year,
      班级: q.classNo,
      本地语录: q.text,
    })),
    禁止编造的院校若未出现在材料中则不得写出: "未在材料中出现的清华大学、北京大学或其他985/211。",
  };
}

/** 若润色稿编造了材料里没有的 985/211，或改掉了姓名与院校对应，则判失败并走本地兜底。 */
export function validateAlumniBoostText(text, board) {
  const raw = String(text || "").trim();
  if (!raw) return { ok: false, reason: "空文案。" };
  const entries = board?.entries || board?.quotes || [];
  if (!entries.length) return { ok: false, reason: "没有对照事实。" };
  const allowedCanon = new Set(entries.map((e) => canonicalSchoolName(e.university || e.schoolLabel)).filter(Boolean));
  const allowedNames = new Set(entries.map((e) => e.name).filter(Boolean));
  // 材料中未出现的 985 不得被写进文案（防虚构清华等）。
  const eliteMentions = [
    "清华大学", "北京大学", "清北", "复旦大学", "上海交通大学", "浙江大学",
    "中国科学技术大学", "南京大学", "中国人民大学", "国防科技大学", "国防科学技术大学",
  ];
  for (const word of eliteMentions) {
    if (!raw.includes(word) && !(word === "清北" && (raw.includes("清华") || raw.includes("北大")))) continue;
    const ok = entries.some((e) => {
      const uni = e.university || "";
      const label = e.schoolLabel || formatSchoolName(uni);
      if (word === "清北") return e.qingbei || isQingbeiName(uni);
      if (word === "清华大学" || word === "清华") return /清华/.test(uni) || /清华/.test(label);
      if (word === "北京大学" || word === "北大") return /北京大学|北大/.test(uni) || /北京大学|北大/.test(label);
      return uni.includes(word) || label.includes(word) || canonicalSchoolName(uni) === word;
    });
    if (!ok) return { ok: false, reason: "润色稿出现了材料中没有的名校，已改用本地语录。" };
  }
  const named = [...allowedNames].filter((n) => raw.includes(n));
  if (!named.length) return { ok: false, reason: "润色稿未保留学长学姐姓名，已改用本地语录。" };
  // 文中出现的已格式化校名应能对上某条事实
  const marked = raw.match(/[★▲][^\s，。；、（(·]+/g) || [];
  for (const token of marked) {
    const canon = canonicalSchoolName(token);
    if (canon && !allowedCanon.has(canon)) {
      return { ok: false, reason: "润色稿中的院校标记与档案不符，已改用本地语录。" };
    }
  }
  return { ok: true, text: restoreAlumniBoostMarks(raw, entries) };
}

/** 若模型丢掉 ★▲，按档案把校名标记补回，不改事实。 */
export function restoreAlumniBoostMarks(text, entries) {
  let out = String(text || "");
  const list = [...(entries || [])].sort((a, b) => String(b.university || "").length - String(a.university || "").length);
  for (const e of list) {
    const uni = e.university;
    if (!uni) continue;
    const labeled = e.schoolLabel || formatSchoolName(uni);
    if (labeled === uni) continue;
    const re = new RegExp(`(?<![★▲])${escapeReg(uni)}`, "g");
    out = out.replace(re, labeled);
  }
  return out;
}

function escapeReg(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function shouldShowAlumniBoostBoard(state, { asOfDate } = {}) {
  return !!buildAlumniBoostBoard(state, { asOfDate }).visible;
}
