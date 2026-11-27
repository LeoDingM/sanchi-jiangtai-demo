/**
 * 学生近几次成绩与全班成绩的分析材料、本地文案和图表数据。
 * 只根据档案里的真实分数、排名和已记录事实；图表坐标也只由此计算，不让 AI 编造。
 * 潜力默认不对教师展示，也不写入分析正文（上帝模式除外且须标明）。
 */
import { subjectById } from "./config.js?v=t74u2";
import { cheatRecordOf, absentSubjectsOf } from "./scoreDrop.js?v=t74u2";

export const SCORE_TREND_LIMIT = 5;
export const SCORE_TREND_SOURCE_NOTE = "图表按档案里的真实分数和排名绘制。文字只解释这些已有数据；没有查实记录就不会写成作弊、缺考或处分。推测会标明不是已查实。";

function subjName(id) {
  return subjectById(id)?.name || id;
}

function shortLabel(examName, date) {
  const d = String(date || "").slice(2).replace(/-/g, ".");
  const n = String(examName || "").replace(/普通/, "").replace(/考试/, "");
  return (d ? `${d} ${n}` : n).trim() || "考试";
}

function median(nums) {
  const a = (nums || []).filter((n) => n != null && Number.isFinite(n)).slice().sort((x, y) => x - y);
  if (!a.length) return null;
  const mid = Math.floor((a.length - 1) / 2);
  return a.length % 2 ? a[mid] : (a[mid] + a[mid + 1]) / 2;
}

function mean(nums) {
  const a = (nums || []).filter((n) => n != null && Number.isFinite(n));
  if (!a.length) return null;
  return a.reduce((s, n) => s + n, 0) / a.length;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function examFacts(exam) {
  const cheat = cheatRecordOf(exam);
  const absent = absentSubjectsOf(exam);
  return {
    cheatedSubstantiated: !!(cheat.substantiated || cheat.voided),
    cheatedUnproven: !!(cheat.reported && !cheat.substantiated && !cheat.voided),
    voided: !!cheat.voided,
    disciplineLabel: cheat.disciplineLabel || "",
    absentSubjects: absent.map(subjName),
    scoreStatus: exam?.scoreStatus || "",
  };
}

function subjectRows(exam) {
  const out = [];
  const subj = exam?.subjects || {};
  const ids = exam?.subjectIds || Object.keys(subj);
  for (const id of ids) {
    if (id === "lizong" || id === "wenzong") continue;
    const info = subj[id];
    const score = info && typeof info === "object" ? info.score : info;
    if (score == null || !Number.isFinite(Number(score))) continue;
    const max = (info && typeof info === "object" && info.max)
      || (id === "chinese" || id === "math" || id === "english" ? 150 : 100);
    const rate = max ? Math.round((Number(score) / max) * 1000) / 10 : null;
    out.push({
      id,
      name: subjName(id),
      score: Number(score),
      max,
      rate,
      classRank: info?.classRank ?? info?.class?.rank ?? null,
    });
  }
  return out;
}

function packStudentExam(h) {
  const facts = examFacts(h);
  const subjects = subjectRows(h);
  return {
    date: h.date,
    examId: h.examId,
    examName: h.examName,
    examKind: h.examKind,
    label: shortLabel(h.examName, h.date),
    total: h.total,
    maxTotal: h.maxTotal || 750,
    scaled750: h.scaled750 ?? (h.maxTotal ? Math.round((h.total / h.maxTotal) * 750) : h.total),
    line: h.line || "",
    classRank: h.classRank ?? h.class?.rank ?? null,
    classN: h.classN ?? h.class?.n ?? null,
    schoolRank: h.schoolRank ?? h.school?.rank ?? null,
    schoolN: h.schoolN ?? h.school?.n ?? null,
    subjects,
    ...facts,
  };
}

export function buildStudentScoreTrendFacts(student, history, { revealPotential = false } = {}) {
  const all = (history || []).filter(Boolean).slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const used = all.slice(-SCORE_TREND_LIMIT);
  if (!used.length) {
    return { ok: false, reason: "还没有可分析的考试记录。", scope: "student", examCount: 0, exams: [] };
  }
  const exams = used.map(packStudentExam);
  const totals = exams.map((e) => e.scaled750).filter((n) => n != null);
  const classRanks = exams.map((e) => e.classRank).filter((n) => n != null);
  const schoolRanks = exams.map((e) => e.schoolRank).filter((n) => n != null);
  return {
    ok: true,
    scope: "student",
    name: student?.name || "该生",
    studentId: student?.id,
    classNo: student?.classNo,
    examCount: exams.length,
    examCountNote: exams.length < SCORE_TREND_LIMIT
      ? `目前只有 ${exams.length} 次可对照的考试，按已有场次分析，没有另外编出场次。`
      : `按近 ${SCORE_TREND_LIMIT} 次考试分析。`,
    exams,
    totals,
    totalDelta: totals.length >= 2 ? round1(totals[totals.length - 1] - totals[0]) : null,
    usualTotal: median(totals.slice(0, -1).length ? totals.slice(0, -1) : totals),
    latestTotal: totals.length ? totals[totals.length - 1] : null,
    classRanks,
    schoolRanks,
    classDelta: classRanks.length >= 2 ? classRanks[classRanks.length - 1] - classRanks[0] : null,
    schoolDelta: schoolRanks.length >= 2 ? schoolRanks[schoolRanks.length - 1] - schoolRanks[0] : null,
    revealPotential: !!revealPotential,
    sourceNote: SCORE_TREND_SOURCE_NOTE,
  };
}

function subjectSwing(exams) {
  if (!exams || exams.length < 2) return [];
  const latest = exams[exams.length - 1];
  const prior = exams.slice(0, -1);
  const out = [];
  for (const cur of latest.subjects || []) {
    const prev = prior.map((e) => (e.subjects || []).find((x) => x.id === cur.id)?.score).filter((n) => n != null);
    if (!prev.length) continue;
    const mid = median(prev);
    const delta = round1(cur.score - mid);
    if (Math.abs(delta) >= Math.max(8, Math.round((cur.max || 100) * 0.12))) {
      out.push({ name: cur.name, score: cur.score, usual: Math.round(mid), delta });
    }
  }
  out.sort((a, b) => a.delta - b.delta);
  return out;
}

export function formatLocalStudentScoreTrend(facts) {
  if (!facts?.ok) return facts?.reason || "还没有可分析的考试记录。";
  const lines = [];
  lines.push("【波动判断】");
  lines.push(`- ${facts.examCountNote}`);
  const bits = (facts.exams || []).map((e) => {
    const ranks = [];
    if (e.classRank != null) ranks.push(`班排第 ${e.classRank}${e.classN ? "/" + e.classN : ""} 名`);
    if (e.schoolRank != null) ranks.push(`校排第 ${e.schoolRank}${e.schoolN ? "/" + e.schoolN : ""} 名`);
    return `「${e.examName}」${e.total} 分${ranks.length ? "，" + ranks.join("，") : ""}`;
  });
  if (bits.length) lines.push(`- 各场成绩：${bits.join("；")}。`);
  if (facts.totalDelta != null) {
    const dir = facts.totalDelta > 6 ? "总体在往上走" : facts.totalDelta < -6 ? "总体在往下走" : "总分大体还算平稳";
    lines.push(`- 折合 750 分从 ${facts.exams[0].scaled750} 分到最近一场 ${facts.latestTotal} 分，${dir}（差值 ${facts.totalDelta > 0 ? "+" : ""}${facts.totalDelta} 分）。`);
  }
  if (facts.schoolDelta != null) {
    lines.push(`- 校排从第 ${facts.schoolRanks[0]} 名到最近第 ${facts.schoolRanks[facts.schoolRanks.length - 1]} 名，名次变化 ${facts.schoolDelta > 0 ? "后退 " + facts.schoolDelta : "前进 " + Math.abs(facts.schoolDelta)} 名（名次数字变大是退步）。`);
  }
  if (facts.classDelta != null) {
    lines.push(`- 班排从第 ${facts.classRanks[0]} 名到最近第 ${facts.classRanks[facts.classRanks.length - 1]} 名，名次变化 ${facts.classDelta > 0 ? "后退 " + facts.classDelta : "前进 " + Math.abs(facts.classDelta)} 名。`);
  }

  lines.push("【可能原因】");
  const recorded = [];
  for (const e of facts.exams || []) {
    if (e.cheatedSubstantiated) recorded.push(`「${e.examName}」作弊已经查实${e.disciplineLabel ? "，处分是" + e.disciplineLabel : ""}，该次成绩已取消`);
    else if (e.cheatedUnproven) recorded.push(`「${e.examName}」有过作弊举报，但档案显示尚未查实，不能据此说是处分`);
    if (e.absentSubjects?.length) recorded.push(`「${e.examName}」档案记有${e.absentSubjects.join("、")}缺考或未计有效成绩`);
  }
  if (recorded.length) recorded.forEach((t) => lines.push(`- ${t}。`));
  const swings = subjectSwing(facts.exams);
  if (swings.length) {
    const down = swings.filter((x) => x.delta < 0).slice(0, 3);
    const up = swings.filter((x) => x.delta > 0).slice(0, 2);
    if (down.length) lines.push(`- 对照自己近几次，${down.map((x) => `${x.name}这次 ${x.score} 分（平时大约 ${x.usual} 分）`).join("；")}。这是按已有分数看出的，不是已查实的处分。`);
    if (up.length) lines.push(`- 同时也有科目比平时好：${up.map((x) => `${x.name} ${x.score} 分（平时大约 ${x.usual} 分）`).join("；")}。`);
  }
  if (!recorded.length && !swings.length) {
    lines.push("- 档案里没有查实的作弊、缺考或处分记录。从分数看，更像是发挥起伏或整体状态变化。这是推测，不是已查实的记过。");
  }

  lines.push("【建议】");
  if (swings.some((x) => x.delta < 0)) {
    lines.push(`- 先对着掉得比较多的科目把错题和方法补上，下一场先求稳住，再谈往上冲。`);
  } else if ((facts.totalDelta || 0) < -6 || (facts.schoolDelta || 0) >= 40) {
    lines.push("- 先把最近一场卷子和作业对一下，看是那几题没把握，还是整体练得不够。");
  } else if ((facts.totalDelta || 0) > 6) {
    lines.push("- 这几次在往上走，保持现有节奏，把还不稳的科目再练熟。");
  } else {
    lines.push("- 起伏不大，按平时计划抓薄弱科和订正即可，不必先下重结论。");
  }

  lines.push("【评价】");
  const latest = facts.exams[facts.exams.length - 1];
  const rankBit = latest.schoolRank != null ? `最近一场校排第 ${latest.schoolRank} 名` : (latest.classRank != null ? `最近一场班排第 ${latest.classRank} 名` : "最近一场");
  if ((facts.schoolDelta || 0) >= 300) lines.push(`- ${rankBit}，校排退步很大，值得专门谈一次，但原因仍只看档案事实，不要先写成处分。`);
  else if ((facts.totalDelta || 0) < -12 || (facts.classDelta || 0) >= 8) lines.push(`- ${rankBit}，掉得比较明显，建议关注一下状态和学习方法。`);
  else if ((facts.totalDelta || 0) > 8) lines.push(`- ${rankBit}，近几次有进步，可以把做对的方法固定下来。`);
  else lines.push(`- ${rankBit}，整体还算平稳，按已有数据继续观察即可。`);

  if (facts.revealPotential) lines.push("- （上帝模式：潜力只作教师对照，不是已公布成绩，也没有写进上面的分数。）");
  lines.push(SCORE_TREND_SOURCE_NOTE);
  lines.push("以上为本地分析。");
  return lines.join("\n");
}

export function studentScoreTrendChartModel(facts) {
  const exams = facts?.exams || [];
  const labels = exams.map((e) => e.label);
  return {
    labels,
    total: {
      labels,
      series: [{ name: "折合 750 分", values: exams.map((e) => e.scaled750), color: "#3d5c6b" }],
      yLabel: "分",
    },
    ranks: {
      labels,
      series: [
        { name: "班排", values: exams.map((e) => e.classRank), color: "#c45c4a" },
        { name: "校排", values: exams.map((e) => e.schoolRank), color: "#3d5c6b" },
      ],
      yInvert: true,
      yLabel: "名次",
    },
    subjects: (() => {
      const latest = exams[exams.length - 1];
      const rows = latest?.subjects || [];
      return {
        labels: rows.map((s) => s.name),
        values: rows.map((s) => s.rate),
        yLabel: "得分率 %",
        title: latest ? `「${latest.examName}」各科得分率` : "各科得分率",
      };
    })(),
  };
}

function classRowsOf(report, classNo) {
  return (report?.rows || []).filter((r) => Number(r.classNo) === Number(classNo) && !r.repeat);
}

function classSummary(report, classNo) {
  const rows = classRowsOf(report, classNo);
  const totals = rows.map((r) => r.total).filter((n) => n != null);
  const maxTotal = rows[0]?.maxTotal || report.maxTotal || 750;
  const scaled = totals.map((t) => (maxTotal ? Math.round((t / maxTotal) * 750) : t));
  const ranks = rows.map((r) => r.schoolRank ?? r.rank ?? r.gradeRank).filter((n) => n != null);
  const first = rows.filter((r) => r.line && /一本|特控/.test(r.line) && !/未达|未上/.test(r.line)).length;
  const second = rows.filter((r) => r.line && /一本|特控|二本|本科/.test(r.line) && !/未达|未上/.test(r.line)).length;
  const none = rows.length - second;
  const bands = [
    { label: "校内一本", count: first },
    { label: "校内二本累计", count: second },
    { label: "未达二本", count: Math.max(0, none) },
  ];
  const scoreBands = [
    { label: "650 以上", count: scaled.filter((n) => n >= 650).length },
    { label: "600–649", count: scaled.filter((n) => n >= 600 && n < 650).length },
    { label: "550–599", count: scaled.filter((n) => n >= 550 && n < 600).length },
    { label: "500–549", count: scaled.filter((n) => n >= 500 && n < 550).length },
    { label: "500 以下", count: scaled.filter((n) => n < 500).length },
  ];
  const substantiated = rows.filter((r) => r.cheat?.substantiated || r.cheat?.voided || r.scoreStatus === "voided-cheat").length;
  const unproven = rows.filter((r) => (r.cheat?.reported || r.cheat?.status === "unsubstantiated") && !r.cheat?.substantiated && !r.cheat?.voided).length;
  return {
    date: report.date,
    examId: report.examId,
    examName: report.examName,
    examKind: report.examKind,
    label: shortLabel(report.examName, report.date),
    n: rows.length,
    avg: scaled.length ? Math.round(mean(scaled)) : null,
    avgRaw: totals.length ? Math.round(mean(totals)) : null,
    avgSchoolRank: ranks.length ? Math.round(mean(ranks)) : null,
    first,
    second,
    none: Math.max(0, none),
    bands,
    scoreBands,
    substantiatedCheats: substantiated,
    unprovenReports: unproven,
    lineSample: rows.find((r) => r.line)?.line || "",
  };
}

export function buildClassScoreTrendFacts(reports, { classNo, className = "", revealPotential = false } = {}) {
  const all = (reports || []).filter((r) => r && classRowsOf(r, classNo).length)
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const used = all.slice(-SCORE_TREND_LIMIT);
  if (!used.length) {
    return { ok: false, reason: "还没有可分析的本班考试记录。", scope: "class", examCount: 0, exams: [] };
  }
  const exams = used.map((r) => classSummary(r, classNo));
  const avgs = exams.map((e) => e.avg).filter((n) => n != null);
  return {
    ok: true,
    scope: "class",
    classNo,
    className: className || `${classNo}班`,
    examCount: exams.length,
    examCountNote: exams.length < SCORE_TREND_LIMIT
      ? `目前只有 ${exams.length} 次可对照的本班考试，按已有场次分析，没有另外编出场次。`
      : `按近 ${SCORE_TREND_LIMIT} 次本班考试分析。`,
    exams,
    avgDelta: avgs.length >= 2 ? avgs[avgs.length - 1] - avgs[0] : null,
    revealPotential: !!revealPotential,
    sourceNote: SCORE_TREND_SOURCE_NOTE,
  };
}

export function formatLocalClassScoreTrend(facts) {
  if (!facts?.ok) return facts?.reason || "还没有可分析的本班考试记录。";
  const lines = [];
  lines.push("【波动判断】");
  lines.push(`- ${facts.examCountNote}`);
  const bits = (facts.exams || []).map((e) => {
    const rank = e.avgSchoolRank != null ? `，均校排第 ${e.avgSchoolRank} 名` : "";
    const line = e.n ? `，校内一本 ${e.first} 人、二本累计 ${e.second} 人` : "";
    return `「${e.examName}」均分（折合 750）约 ${e.avg ?? "—"} 分${rank}${line}`;
  });
  if (bits.length) lines.push(`- 各场整体情况：${bits.join("；")}。`);
  if (facts.avgDelta != null) {
    const dir = facts.avgDelta > 4 ? "班级均分在往上走" : facts.avgDelta < -4 ? "班级均分在往下走" : "班级均分大体平稳";
    lines.push(`- 从第一场到最近一场，均分变化 ${facts.avgDelta > 0 ? "+" : ""}${facts.avgDelta} 分，${dir}。`);
  }
  const latest = facts.exams[facts.exams.length - 1];
  if (latest?.scoreBands?.length) {
    lines.push(`- 最近一场分数段（折合 750）：${latest.scoreBands.map((b) => `${b.label} ${b.count} 人`).join("，")}。`);
  }

  lines.push("【可能原因】");
  const rec = [];
  for (const e of facts.exams || []) {
    if (e.substantiatedCheats) rec.push(`「${e.examName}」有 ${e.substantiatedCheats} 人作弊已查实并取消成绩`);
    if (e.unprovenReports) rec.push(`「${e.examName}」有 ${e.unprovenReports} 人被举报但尚未查实，不能写成处分`);
  }
  if (rec.length) rec.forEach((t) => lines.push(`- ${t}。`));
  else lines.push("- 就已有档案看，没有需要写进处分的全班性事件。均分和上线人数的起伏，更像是发挥和学情变化。这是推测，不是已查实的记过。");

  lines.push("【建议】");
  if ((facts.avgDelta || 0) < -6) lines.push("- 先看最近一场掉得比较集中的科目和后段人数，从订正和课堂落实抓起，不要先把问题写成纪律处分。");
  else if ((facts.avgDelta || 0) > 4) lines.push("- 这几次整体在往上，把有效的练习节奏保持住，再帮还在线边的人盯错题。");
  else lines.push("- 整体起伏不大，按原计划抓薄弱科目和作业订正即可。");

  lines.push("【评价】");
  if (latest) lines.push(`- 最近一场「${latest.examName}」应届 ${latest.n} 人，均分约 ${latest.avg ?? "—"} 分，校内一本 ${latest.first} 人、二本累计 ${latest.second} 人。以上只根据已有成绩统计。`);
  if (facts.revealPotential) lines.push("- （上帝模式：潜力只作教师对照，不是已公布成绩。）");
  lines.push(SCORE_TREND_SOURCE_NOTE);
  lines.push("以上为本地分析。");
  return lines.join("\n");
}

export function classScoreTrendChartModel(facts) {
  const exams = facts?.exams || [];
  const labels = exams.map((e) => e.label);
  const latest = exams[exams.length - 1];
  return {
    labels,
    avg: {
      labels,
      series: [{ name: "班级均分（折合 750）", values: exams.map((e) => e.avg), color: "#3d6b5a" }],
      yLabel: "分",
    },
    ranks: {
      labels,
      series: [{ name: "班级均校排", values: exams.map((e) => e.avgSchoolRank), color: "#3d5c6b" }],
      yInvert: true,
      yLabel: "名次",
    },
    lines: {
      labels,
      series: [
        { name: "校内一本人数", values: exams.map((e) => e.first), color: "#3d6b5a" },
        { name: "校内二本累计", values: exams.map((e) => e.second), color: "#c45c4a" },
      ],
      yLabel: "人",
    },
    bands: latest ? {
      labels: (latest.scoreBands || []).map((b) => b.label),
      values: (latest.scoreBands || []).map((b) => b.count),
      title: latest ? `「${latest.examName}」分数段人数` : "分数段人数",
      yLabel: "人",
    } : { labels: [], values: [] },
  };
}

export function studentScoreTrendAiPayload(facts) {
  if (!facts?.ok) return { ok: false, reason: facts?.reason || "没有可分析的成绩。" };
  return {
    ok: true,
    说明: "用简明、易懂的中文写波动判断、可能原因、建议和评价，分点短句。只根据下列已有分数、排名和档案事实。不得编造分数、排名、作弊、缺考、疾病或处分。推测须标明不是已查实。不要写潜力（除非材料允许并标明上帝模式）。不要编造图表坐标或人数。不要写 markdown。只输出 JSON：{\"分析\":\"文本\"}。",
    须知: SCORE_TREND_SOURCE_NOTE,
    学生: facts.name,
    班级: facts.classNo,
    场次说明: facts.examCountNote,
    考试: (facts.exams || []).map((e) => ({
      日期: e.date,
      名称: e.examName,
      总分: e.total,
      折合750: e.scaled750,
      班排: e.classRank,
      班人数: e.classN,
      校排: e.schoolRank,
      校人数: e.schoolN,
      校内对照: e.line,
      各科: (e.subjects || []).map((s) => ({ 科目: s.name, 分数: s.score, 满分: s.max, 得分率: s.rate })),
      已查实作弊: e.cheatedSubstantiated,
      未查实举报: e.cheatedUnproven,
      成绩取消: e.voided,
      处分: e.disciplineLabel,
      缺考科目: e.absentSubjects,
    })),
    允许写潜力: !!facts.revealPotential,
    图表已按真实数据另画: true,
  };
}

export function classScoreTrendAiPayload(facts) {
  if (!facts?.ok) return { ok: false, reason: facts?.reason || "没有可分析的本班成绩。" };
  return {
    ok: true,
    说明: "用简明、易懂的中文写全班近几次考试的波动判断、可能原因、建议和评价，分点短句。只根据下列已有统计。不得编造分数、人数、作弊、缺考或处分。未查实举不得写成处分。推测须标明。不要写潜力（除非材料允许）。不要编造图表坐标。不要写 markdown。只输出 JSON：{\"分析\":\"文本\"}。",
    须知: SCORE_TREND_SOURCE_NOTE,
    班级: facts.className || facts.classNo,
    场次说明: facts.examCountNote,
    考试: (facts.exams || []).map((e) => ({
      日期: e.date,
      名称: e.examName,
      人数: e.n,
      均分折合750: e.avg,
      均校排: e.avgSchoolRank,
      校内一本: e.first,
      校内二本累计: e.second,
      未达二本: e.none,
      分数段: e.scoreBands,
      已查实作弊人数: e.substantiatedCheats,
      未查实举报人数: e.unprovenReports,
    })),
    允许写潜力: !!facts.revealPotential,
    图表已按真实数据另画: true,
  };
}

export function validateScoreTrendText(text, facts) {
  const raw = String(text || "").trim();
  if (!raw) return { ok: false, reason: "空文案。" };
  if (!facts?.ok) return { ok: false, reason: "没有对照事实。" };
  const exams = facts.exams || [];
  const hasCheatFact = exams.some((e) => e.cheatedSubstantiated || e.substantiatedCheats);
  const hasUnproven = exams.some((e) => e.cheatedUnproven || e.unprovenReports);
  const hasAbsent = exams.some((e) => (e.absentSubjects || []).length);
  if (!hasCheatFact && /作弊|偷看作弊|夹带|代考|记过|记大过|警告处分/.test(raw) && !hasUnproven) {
    return { ok: false, reason: "润色稿编造了档案中没有的作弊或处分，已改用本地分析。" };
  }
  if (!hasCheatFact && hasUnproven && /已查实作弊|认定作弊|给予.*处分/.test(raw) && !/未查实|尚未查实|不能据此|不能写成/.test(raw)) {
    return { ok: false, reason: "润色稿把未查实举报道成了处分，已改用本地分析。" };
  }
  if (!hasAbsent && /缺考/.test(raw)) {
    return { ok: false, reason: "润色稿编造了档案中没有的缺考，已改用本地分析。" };
  }
  if (!facts.revealPotential && /潜力数值|接近潜力|潜力还剩/.test(raw)) {
    return { ok: false, reason: "润色稿写了默认不应对教师展示的潜力，已改用本地分析。" };
  }
  return { ok: true, text: raw };
}
