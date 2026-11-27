/**
 * 学生个人履历：职务、比赛、所处水平、单科异常优异、近几次发挥。
 * 只组织已有事实，不编造奖项、职务、分数或排名。老师默认看不到潜力。
 */
import { selectClassOffices, officeTitlesOf } from "./classManage.js?v=t74u2";
import { studentContestAwards, awardsByLevel, formatAward, recruitPolicy, recruitOutcome } from "./contests.js?v=t74u2";
import { studentExamHistory, buildStudentExamSnapshot, tierName } from "./studentHistory.js?v=t74u2";
import { formatRankTriple } from "./displayRanks.js?v=t74u2";
import { subjectById } from "./config.js?v=t74u2";

function classmatesOf(state, student) {
  if (!state || !student) return [];
  for (const c of Object.values(state.cohorts || {})) {
    if ((c.students || []).some((x) => x.id === student.id)) {
      return (c.students || []).filter((x) => Number(x.classNo) === Number(student.classNo));
    }
  }
  return [];
}

export function studentOffices(state, student) {
  if (!student) return { titles: [], committee: "", reps: "" };
  const mates = classmatesOf(state, student);
  const offices = selectClassOffices(mates, state?.seed ?? 1, student.classNo);
  const titles = officeTitlesOf(offices, student.id);
  return {
    titles,
    committee: offices.committee?.byStudentId?.[student.id] || "",
    reps: offices.reps?.byStudentId?.[student.id] || "",
    line: titles.length ? titles.join("、") : "无班委或课代表职务",
  };
}

export function studentAwardsFact(student, { date, seed } = {}) {
  const awards = studentContestAwards(student, { date, seed });
  const by = awardsByLevel(awards);
  return {
    awards,
    byLevel: by,
    lines: {
      校内: by.校内.map(formatAward),
      市级: by.市级.map(formatAward),
      省级: by.省级.map(formatAward),
      国家级: by.国家级.map(formatAward),
    },
  };
}

function levelPhrase(rank, n, kind) {
  if (rank == null || !n) return `${kind}位置暂时不明`;
  const pct = rank / n;
  if (rank === 1) return `在${kind}是第 1 名`;
  if (pct <= 0.05 || rank <= 3) return `在${kind}名列前茅（第 ${rank}/${n} 名）`;
  if (pct <= 0.2) return `在${kind}处于上游（第 ${rank}/${n} 名）`;
  if (pct <= 0.5) return `在${kind}处于中上游（第 ${rank}/${n} 名）`;
  if (pct <= 0.75) return `在${kind}处于中游（第 ${rank}/${n} 名）`;
  return `在${kind}还比较靠后（第 ${rank}/${n} 名）`;
}

export function standingLines(snapshot) {
  if (!snapshot) return { class: "", school: "", tiers: [], text: "还没有可对照的考试。" };
  const classLine = levelPhrase(snapshot.classRank, snapshot.classN, "班级");
  const schoolLine = levelPhrase(snapshot.schoolRank, snapshot.schoolN, "学校该科类");
  const tierLine = levelPhrase(snapshot.tierRank, snapshot.tierN, `${tierName(snapshot.tier)}层次`);
  const tiers = [];
  for (const [tid, info] of Object.entries(snapshot.cross || {})) {
    if (!info || info.rank == null) continue;
    const rel = tid === snapshot.tier
      ? `本层${tierName(tid)}第 ${info.rank}/${info.n} 名`
      : `若放入${tierName(tid)}约为第 ${info.rank}/${info.n} 名`;
    tiers.push({ tier: tid, name: info.name || tierName(tid), rank: info.rank, n: info.n, line: rel });
  }
  return {
    class: classLine,
    school: schoolLine,
    tier: tierLine,
    ranks: formatRankTriple(snapshot),
    tiers,
    text: `${classLine}；${tierLine}；${schoolLine}。`,
  };
}

/**
 * 单科异常优异：该科名次明显好于自己平时该科，或冲到很前列。
 * 不把正常发挥都标成异常。
 */
export function outstandingSubjectMoments(history) {
  const hist = history || [];
  const out = [];
  const subjIds = new Set();
  for (const h of hist) {
    for (const id of Object.keys(h.subjects || {})) subjIds.add(id);
  }
  for (const sid of subjIds) {
    const series = hist.map((h) => {
      const s = h.subjects?.[sid];
      if (!s || s.classRank == null) return null;
      return { h, s, schoolRank: s.schoolRank ?? s.school?.rank, classRank: s.classRank, tierRank: s.tierRank };
    }).filter(Boolean);
    if (series.length < 2) continue;
    const ranks = series.map((x) => x.schoolRank).filter((n) => n != null);
    if (ranks.length < 2) continue;
    const sorted = ranks.slice().sort((a, b) => a - b);
    const mid = sorted[Math.floor(sorted.length / 2)];
    for (const x of series) {
      if (x.schoolRank == null) continue;
      const farBetter = mid - x.schoolRank >= 40 || (mid >= 8 && x.schoolRank <= Math.max(3, Math.round(mid * 0.35)));
      const veryFront = x.schoolRank <= 5 || (x.classRank === 1 && x.schoolRank <= 30);
      if (!farBetter && !veryFront) continue;
      if (x.schoolRank > mid - 15 && !veryFront) continue;
      const name = subjectById(sid)?.name || x.s.name || sid;
      out.push({
        date: x.h.date,
        examName: x.h.examName,
        subjectId: sid,
        subject: name,
        score: x.s.score,
        classRank: x.classRank,
        tierRank: x.tierRank,
        schoolRank: x.schoolRank,
        classN: x.s.class?.n ?? x.h.classN,
        tierN: x.s.tier?.n ?? x.h.tierN,
        schoolN: x.s.school?.n ?? x.h.schoolN,
        text: `${x.h.date} ${x.h.examName}的${name}发挥突出，当时班排 ${x.classRank ?? "—"}、同层次排 ${x.tierRank ?? "—"}、校排 ${x.schoolRank ?? "—"}。`,
      });
    }
  }
  out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return out.slice(0, 6);
}

export function recentExamReview(history, n = 4) {
  const hist = (history || []).slice(-n);
  return hist.map((h) => ({
    date: h.date,
    examName: h.examName,
    total: h.total,
    scaled750: h.scaled750,
    line: h.line,
    classRank: h.classRank,
    classN: h.classN,
    tierRank: h.tierRank,
    tierN: h.tierN,
    schoolRank: h.schoolRank,
    schoolN: h.schoolN,
    ranks: formatRankTriple(h),
    text: `${h.date} ${h.examName}总分 ${h.total}，${formatRankTriple(h)}${h.line ? "，" + h.line : ""}。`,
  }));
}

export function buildStudentResume(state, student, { date, revealPotential = false } = {}) {
  if (!student) return { ok: false, reason: "没有这名学生。" };
  const when = date || state?.date || "2099-12-31";
  const offices = studentOffices(state, student);
  const awardFact = studentAwardsFact(student, { date: when, seed: state?.seed ?? 1 });
  const history = studentExamHistory(state, student.id);
  const latest = history[history.length - 1] || null;
  const standing = standingLines(latest);
  const outstanding = outstandingSubjectMoments(history);
  const recent = recentExamReview(history, 5);
  const year = when.slice(0, 4);
  const gkYear = student.entryYear ? Number(student.entryYear) + 3 : Number(year);
  const recruit = recruitOutcome(student, latest?.total, gkYear, {
    seed: state?.seed ?? 1,
    date: when,
    awards: awardFact.awards,
    trackRank: latest?.schoolRank,
    trackN: latest?.schoolN,
    schoolRank: latest?.schoolRank,
  });
  const facts = {
    name: student.name,
    classNo: student.classNo,
    tier: student.tier,
    tierName: tierName(student.tier),
    track: student.track,
    personality: student.personality || "",
    titles: offices.titles,
    officeLine: offices.line,
    awards: awardFact.awards,
    awardLines: awardFact.lines,
    standing,
    outstanding,
    recent,
    latest,
    history,
    recruit: {
      policy: recruit.policy,
      eligible: recruit.eligible,
      applied: recruit.applied,
      passed: recruit.passed,
      university: recruit.university,
      concession: recruit.concession,
      reason: recruit.reason,
    },
    disciplines: (student.disciplines || []).filter((d) => d && (d.text || d.disciplineLabel || d.discipline)),
  };
  facts.disciplineLines = facts.disciplines.map((d) => d.text || `${d.examDate || d.date || ""}「${d.examName || "校本考试"}」因作弊查实，给予${d.disciplineLabel || "处分"}，该次成绩已取消。`.trim());
  return { ok: true, facts, localText: formatResumeLocal(facts, { revealPotential }), revealPotential: !!revealPotential };
}

export function formatResumeLocal(facts, { revealPotential = false } = {}) {
  if (!facts) return "还没有履历材料。";
  const lines = [];
  lines.push(`${facts.name}，${facts.classNo}班，${facts.tierName || ""}。职务：${facts.officeLine}。`);
  const aw = facts.awardLines || {};
  const awardBits = [];
  for (const lv of ["国家级", "省级", "市级", "校内"]) {
    if (aw[lv]?.length) awardBits.push(`${lv}：${aw[lv].join("、")}`);
  }
  lines.push(awardBits.length ? `比赛：${awardBits.join("；")}。` : "比赛：目前没有登记在册的校市省国家级奖项。");
  if (facts.standing?.text) lines.push(`所处水平：${facts.standing.text}`);
  if (facts.outstanding?.length) {
    lines.push(`单科异常优异：${facts.outstanding.map((x) => x.text).join(" ")}`);
  } else {
    lines.push("单科异常优异：近几次没有明显冲到前列、又远好于自己平时的单科。");
  }
  if (facts.recent?.length) {
    lines.push(`近几次考试：${facts.recent.map((x) => x.text).join(" ")}`);
  } else {
    lines.push("近几次考试：还没有可回顾的实考记录。");
  }
  if (facts.disciplineLines?.length) lines.push(`已查实处分：${facts.disciplineLines.join(" ")}`);
  else lines.push("已查实处分：档案里没有已查实的校内作弊处分。");
  if (facts.recruit?.eligible) lines.push(facts.recruit.reason);
  if (revealPotential) lines.push("（以上为写实履历。潜力数值仅在上帝模式另外标明，不写入本段。）");
  return lines.join("\n");
}

/** 给 AI 润色用的事实清单。不得要求模型编造。 */
export function resumeAiPayload(facts, { revealPotential = false } = {}) {
  if (!facts) return { ok: false, reason: "没有履历事实。" };
  return {
    ok: true,
    说明: "只允许组织下列已有事实，写成通顺的履历短文。不得编造奖项、职务、分数或排名，不得改写任何数字。老师默认不应看到潜力。",
    姓名: facts.name,
    班级: facts.classNo,
    层次: facts.tierName,
    职务: facts.titles,
    比赛: facts.awardLines,
    所处水平: facts.standing?.text,
    班排同层次排校排: facts.standing?.ranks,
    各层次对照: (facts.standing?.tiers || []).map((t) => t.line),
    单科异常优异: (facts.outstanding || []).map((x) => x.text),
    近几次考试: (facts.recent || []).map((x) => x.text),
    已查实处分: facts.disciplineLines || [],
    特殊招生: facts.recruit?.reason || "",
    禁止: revealPotential ? [] : ["潜力", "接近潜力", "潜力数值"],
  };
}

export { formatAward, officeTitlesOf };
