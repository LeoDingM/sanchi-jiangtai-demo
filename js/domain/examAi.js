/**
 * 考后 AI 分析：只根据已算好的成绩和排名写评语，不改分、不改排名、不上线人数。
 * API 密钥只放在独立的 localStorage 项里，与游戏存档 JSON 分开。
 */
import { subjectById, TIER } from "./config.js";
import { subjectRanks } from "./scores.js";
import {
  describeSchoolCutoff, describeClassProvincial, describeSchoolProvincial,
  describeZhuoxingPeers, classProvincialCounts,
} from "./schoolLines.js";

export const AI_SETTINGS_KEY = "sanchi-jiangtai-ai-settings-v1";
export const AI_KEY_KEY = "sanchi-jiangtai-ai-key-v1";
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
 * 是否以该班班主任身份看整体分析。
 * 用任职字段判断，不用本班班主任姓名（player.homeroom 是赵映秋等人的名字）。
 * 以后若玩家接任班主任，设置 player.isHomeroom 或 player.homeroomOf = 班号即可。
 */
export function isPlayerHomeroom(player, classNo = player?.classNo) {
  if (!player || classNo == null) return false;
  if (player.homeroomOf != null) return Number(player.homeroomOf) === Number(classNo);
  return player.isHomeroom === true;
}

export function analysisScope(player, classNo = player?.classNo) {
  return isPlayerHomeroom(player, classNo) ? "class" : "subject";
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

/**
 * 把已经算好的成绩、排名、划线整理成给模型的事实稿。数字全部来自报告，分析时不得改写。
 */
export function buildExamAnalysisPayload(report, { player, classNo } = {}) {
  const clsNo = classNo ?? player?.classNo;
  const check = canAnalyzeReport(report, clsNo);
  if (!check.ok) return { ok: false, reason: check.reason };
  const mine = check.rows;
  const scope = analysisScope(player, clsNo);
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

  const fact = {
    须知: "下列数字已由游戏结算完成。分析评语必须使用这些数字，不得生成、改写或估算分数、排名、上线人数。",
    考试: {
      名称: report.examName,
      日期: report.date,
      种类: report.examKind,
      年级: report.grade,
      难度: report.difficulty,
      离散: report.dispersion,
      已分科: !!report.split,
    },
    班级: {
      班号: clsNo,
      层次: TIER[tier]?.name || tier || "",
      层次代码: tier || "",
      科类: track === "wen" ? "文科" : track === "li" ? "理科" : "未分科",
      应届人数: mine.length,
    },
    教师身份: {
      职务: isPlayerHomeroom(player, clsNo) ? "本班班主任" : "单科任课老师",
      任教科目: subjectName,
      分析范围: scope === "class" ? "全班整体（总分、均分、校内线、对照省控、排名分布及所有单科）" : `仅本班${subjectName}单科`,
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

  if (scope === "class") {
    fact.排名分布 = rankBuckets(mine).map((b) => ({ 分段: b.label, 人数: b.n }));
    fact.各科均分 = {};
    const ids = [...new Set(mine.flatMap((r) => r.subjects || []))];
    for (const id of ids) {
      const classAvg = avg(mine.map((r) => r[id]).filter((n) => typeof n === "number"));
      const schoolAvg = avg(schoolRows.map((r) => r[id]).filter((n) => typeof n === "number"));
      const tierAvg = avg(tierRows.map((r) => r[id]).filter((n) => typeof n === "number"));
      const ranked = subjectRanks(schoolRows, id);
      const best = ranked.find((x) => x.classNo === clsNo);
      fact.各科均分[subjectLabel(id)] = {
        本班均分: classAvg,
        同层次均分: tierAvg,
        年级均分: schoolAvg,
        本班最高: best ? { 姓名: best.name, 分数: best.score, 校排: best.subjectRank } : null,
      };
    }
    fact.本班学生总分 = mine
      .slice()
      .sort((a, b) => (a.rank || 9999) - (b.rank || 9999) || b.total - a.total)
      .map((r, i) => ({
        班排: i + 1,
        姓名: r.name,
        总分: r.total,
        校排: r.rank ?? null,
        校内上线: r.line || "",
      }));
  } else {
    const scores = mine.map((r) => r[subjectId]).filter((n) => typeof n === "number");
    if (!scores.length) {
      return { ok: false, reason: `这场考试没有本班${subjectName}成绩。` };
    }
    const ranked = subjectRanks(schoolRows, subjectId);
    const byId = new Map(ranked.map((x) => [x.studentId, x]));
    const classAvg = avg(scores);
    fact.单科 = {
      科目: subjectName,
      本班均分: classAvg,
      本班最高: Math.max(...scores),
      本班最低: Math.min(...scores),
      同层次均分: avg(tierRows.map((r) => r[subjectId]).filter((n) => typeof n === "number")),
      年级均分: avg(schoolRows.map((r) => r[subjectId]).filter((n) => typeof n === "number")),
    };
    fact.本班该科成绩 = mine
      .slice()
      .sort((a, b) => (b[subjectId] ?? -1) - (a[subjectId] ?? -1) || b.total - a.total)
      .map((r, i) => ({
        班排: i + 1,
        姓名: r.name,
        分数: r[subjectId],
        该科校排: byId.get(r.studentId)?.subjectRank ?? null,
        总分: r.total,
        总分校排: r.rank ?? null,
      }));
  }

  if (report.examKind === "huikao" && report.huikao) {
    fact.会考 = {
      说明: report.huikao.source || report.sourceNote || "",
      本班校内合格: mine.filter((r) => r.huikaoPass).length,
      本班人数: mine.length,
    };
  }

  return { ok: true, scope, subjectId, subjectName, classNo: clsNo, fact };
}

export function buildAnalysisMessages(payload) {
  const fact = payload.fact;
  const scopeHint = payload.scope === "class"
    ? "读者是该班班主任，请写全班整体：总分与均分、校内线与对照省控、排名分布，以及各科薄弱点和下一步安排。"
    : `读者是该班${payload.subjectName}任课老师（不是班主任），只分析本班${payload.subjectName}，不要展开其他科目或全班总分策略，除非为了对照该科。`;
  const system = [
    "你是高中教师的考后分析助手，写给老师看，不是写给学生或家长的通知。",
    "必须严格使用用户消息里已经算好的数字，不得生成、改写、估算或纠正任何分数、排名、上线人数、均分或划线。",
    "若某项数字材料里没有，就写「材料未给出」，不要自行补数。",
    "分析要结合班级层次（如卓行普通班、凌霄、云岫重点等）和当次考试的难度、校内划线、对照省控。",
    "文字简洁、可执行：指出问题、点出该盯的人（用材料中的姓名），给出下一阶段课、作业或辅导的具体抓手。不要空话套话，不要客套开场。",
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
        max_tokens: 1200,
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
