/**
 * 平时稳定靠前的学生突然大幅掉名次（或高考/模拟没上二本）时，
 * 为谈话整理「系统说明」和「学生自己阐述」。
 * 只根据已有考试与档案事实，不编造作弊或缺考，也不改分数、作弊发生率或省控。
 */
import { hash01 } from "./prng.js?v=t66u2";
import { subjectById } from "./config.js?v=t66u2";
import { formatDiscipline } from "./cheating.js?v=t66u2";
import { addDays } from "./calendar.js?v=t66u2";

export const SCORE_DROP_USUAL_TOP = 5;
export const SCORE_DROP_SOURCE_NOTE = "原因优先依据已有考试档案。没有作弊或缺考记录就不会那么写。依据分数结构作出的判断会标明是推测，不是已查实的处分。";

const HIGH_LINE_RE = /一本|特控|本科/;
const MISS_SECOND_RE = /未达二本|未上二本|未达本科|未上本科/;
const MOCK_OR_GAOKAO = new Set(["gaokao", "mock1", "mock2", "mock3"]);

function subjName(id) {
  return subjectById(id)?.name || id;
}

function median(nums) {
  const a = (nums || []).filter((n) => n != null).slice().sort((x, y) => x - y);
  if (!a.length) return null;
  const mid = Math.floor((a.length - 1) / 2);
  return a.length % 2 ? a[mid] : (a[mid] + a[mid + 1]) / 2;
}

function classRankOf(h) {
  return h?.classRank ?? h?.class?.rank ?? null;
}

function isRepeatRow(r) {
  return !!r?.repeat;
}

export function lineMissesSecond(line) {
  return MISS_SECOND_RE.test(String(line || ""));
}

export function lineIsComfortable(line) {
  return HIGH_LINE_RE.test(String(line || "")) && !lineMissesSecond(line);
}

export function cheatRecordOf(exam) {
  const ch = exam?.cheat || null;
  if (!ch) return { cheated: false, substantiated: false, reported: false, voided: false };
  const substantiated = !!(ch.substantiated || ch.voided || ch.status === "voided" || exam.scoreStatus === "voided-cheat");
  const reported = !!(ch.reported || ch.substantiated || ch.status === "pending" || ch.status === "voided" || ch.voided);
  return {
    cheated: !!ch.cheated,
    substantiated,
    reported: reported || !!ch.reported,
    voided: !!(ch.voided || ch.status === "voided" || exam.scoreStatus === "voided-cheat"),
    discipline: ch.discipline || exam.discipline || "",
    disciplineLabel: ch.disciplineLabel || (ch.discipline || exam.discipline ? formatDiscipline(ch.discipline || exam.discipline) : ""),
    rawTotal: ch.rawTotal ?? exam.rawTotal,
  };
}

export function absentSubjectsOf(exam) {
  const listed = new Set();
  const raw = exam?.absentSubjects ?? exam?.absent;
  if (Array.isArray(raw)) raw.forEach((id) => id && listed.add(id));
  else if (typeof raw === "string" && raw) listed.add(raw);
  if (/缺考|absent/.test(String(exam?.scoreStatus || ""))) {
    for (const id of exam.subjectIds || Object.keys(exam.subjects || {})) listed.add(id);
  }
  const subj = exam?.subjects || {};
  for (const [id, info] of Object.entries(subj)) {
    if (info?.absent || info?.scoreStatus === "absent") listed.add(id);
  }
  return [...listed].filter(Boolean);
}

function healthNearExam(student, examDate) {
  if (!student || !examDate) return null;
  const items = [];
  for (const log of student.healthLog || []) {
    const start = log.start || log.date;
    const until = log.until || log.date;
    if (!start) continue;
    if (log.kind === "返校") continue;
    items.push({ start, until, kind: log.kind, status: log.status, text: log.text });
  }
  if (student.lastLeave?.start) items.push(student.lastLeave);
  if (student.justReturned?.start || student.justReturned?.date) {
    const r = student.justReturned;
    items.push({ start: r.start || r.date, until: r.until || r.date, kind: r.kind, status: "返校" });
  }
  const windowStart = addDays(examDate, -3);
  const hit = items.find((ep) => {
    const start = ep.start;
    const until = ep.until || ep.start;
    if (!start) return false;
    const overlaps = start <= examDate && until >= examDate;
    const justBefore = until >= windowStart && until < examDate;
    const startsSoon = start <= examDate && start >= windowStart;
    return overlaps || justBefore || startsSoon;
  });
  if (!hit) return null;
  const sick = hit.status === "病假" || (hit.kind && hit.kind !== "事假" && hit.kind !== "返校");
  return { ...hit, sick: !!sick };
}

function subjectEntries(exam) {
  const out = [];
  const subj = exam?.subjects || {};
  for (const [id, info] of Object.entries(subj)) {
    if (id === "lizong" || id === "wenzong") continue;
    const score = info && typeof info === "object" ? info.score : info;
    if (score == null) continue;
    const max = (info && typeof info === "object" && info.max) || (id === "chinese" || id === "math" || id === "english" ? 150 : 100);
    out.push({ id, name: subjName(id), score, max, classRank: info?.classRank ?? info?.class?.rank ?? null });
  }
  return out;
}

export function subjectCollapses(dropExam, priorExams) {
  const prior = priorExams || [];
  if (!prior.length) return [];
  const drops = [];
  for (const cur of subjectEntries(dropExam)) {
    const prevScores = prior.map((h) => {
      const info = h.subjects?.[cur.id];
      const score = info && typeof info === "object" ? info.score : info;
      return score;
    }).filter((n) => n != null);
    if (prevScores.length < 2) continue;
    const mid = median(prevScores);
    const threshold = Math.max(12, Math.round((cur.max || 100) * 0.18));
    if (mid - cur.score < threshold) continue;
    drops.push({
      id: cur.id,
      name: cur.name,
      score: cur.score,
      max: cur.max,
      usual: Math.round(mid),
      delta: Math.round(cur.score - mid),
    });
  }
  drops.sort((a, b) => a.delta - b.delta);
  return drops;
}

export function historyFromReports(reports, studentId) {
  const ordered = (reports || []).slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const out = [];
  for (const report of ordered) {
    const rows = report.rows || [];
    const me = rows.find((r) => r.studentId === studentId) || report.scoreMap?.[studentId];
    if (!me) continue;
    const classmates = rows.filter((r) => Number(r.classNo) === Number(me.classNo) && !isRepeatRow(r) === !isRepeatRow(me));
    const pool = classmates.length ? classmates : rows.filter((r) => Number(r.classNo) === Number(me.classNo));
    const sorted = pool.slice().sort((a, b) => (b.total ?? -1) - (a.total ?? -1) || String(a.studentId).localeCompare(String(b.studentId)));
    let rank = 1;
    let mine = null;
    for (let i = 0; i < sorted.length; i++) {
      if (i > 0 && (sorted[i].total ?? -1) < (sorted[i - 1].total ?? -1)) rank = i + 1;
      if (sorted[i].studentId === studentId) mine = { rank, n: sorted.length };
    }
    if (!mine) mine = { rank: null, n: pool.length };
    const subjectIds = me.subjects || report.subjectIds || [];
    const subjects = {};
    for (const id of subjectIds) {
      if (me[id] == null && !me.subjects?.[id]) continue;
      const score = me[id] ?? me.subjects?.[id]?.score;
      if (score == null) continue;
      subjects[id] = { score, max: id === "chinese" || id === "math" || id === "english" ? 150 : (id === "lizong" || id === "wenzong" ? 300 : 100) };
    }
    if (me.subjects && typeof me.subjects === "object" && !Array.isArray(me.subjects)) {
      Object.assign(subjects, me.subjects);
    }
    out.push({
      date: report.date,
      examId: report.examId || me.examId,
      examName: report.examName,
      examKind: report.examKind,
      classNo: me.classNo,
      total: me.total,
      maxTotal: me.maxTotal,
      line: me.line,
      classRank: mine.rank,
      classN: mine.n,
      subjects,
      subjectIds: Object.keys(subjects),
      cheat: me.cheat || null,
      scoreStatus: me.scoreStatus,
      rawTotal: me.rawTotal ?? me.cheat?.rawTotal,
      discipline: me.discipline,
      absentSubjects: me.absentSubjects || [],
    });
  }
  return out;
}

function usualFromPrior(prior) {
  const ranks = prior.map(classRankOf).filter((n) => n != null);
  const usualRank = median(ranks);
  const frontCount = ranks.filter((n) => n <= SCORE_DROP_USUAL_TOP).length;
  const lines = prior.map((h) => h.line).filter(Boolean);
  return {
    exams: prior,
    usualRank,
    frontCount,
    ranks,
    usuallyFront: ranks.length >= 2 && usualRank != null && usualRank <= SCORE_DROP_USUAL_TOP && frontCount >= 2,
    usuallyClearedSecond: lines.length >= 2 && lines.filter(lineIsComfortable).length >= Math.ceil(lines.length * 0.6),
  };
}

export function isSharpClassDrop(usualRank, dropRank, classN) {
  if (usualRank == null || dropRank == null) return false;
  const n = classN || 70;
  const far = dropRank >= Math.min(18, Math.max(12, Math.round(n * 0.25)));
  const delta = dropRank - usualRank;
  return far && delta >= 12;
}

export function detectScoreDrop(history, { lookBack = 2 } = {}) {
  const hist = (history || []).filter(Boolean).slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (hist.length < 3) return { dropped: false, reason: "可对照的考试次数不够。" };
  const start = Math.max(0, hist.length - lookBack);
  for (let i = hist.length - 1; i >= start; i--) {
    const exam = hist[i];
    const prior = hist.slice(Math.max(0, i - 5), i).filter((h) => h.classNo == null || exam.classNo == null || Number(h.classNo) === Number(exam.classNo));
    const used = prior.length >= 2 ? prior : hist.slice(0, i);
    if (used.length < 2) continue;
    const usual = usualFromPrior(used);
    if (!usual.usuallyFront) continue;
    const dropRank = classRankOf(exam);
    const sharp = isSharpClassDrop(usual.usualRank, dropRank, exam.classN || usual.exams[0]?.classN);
    const missSecond = MOCK_OR_GAOKAO.has(exam.examKind) && lineMissesSecond(exam.line) && (usual.usuallyClearedSecond || usual.usuallyFront);
    if (!sharp && !missSecond) continue;
    return {
      dropped: true,
      exam,
      index: i,
      usual,
      dropRank,
      usualRank: usual.usualRank,
      sharp,
      missSecond,
    };
  }
  return { dropped: false, reason: "近几次没有「平时稳定前 5、突然大幅掉名次或高考/模拟未达二本」的情况。" };
}

function pronoun(student) {
  return student?.gender === "F" ? "她" : "他";
}

export function explainScoreDrop(student, history, { seed = 1 } = {}) {
  const detected = detectScoreDrop(history);
  if (!detected.dropped) {
    return { dropped: false, reason: detected.reason, systemText: "", studentText: "", localText: "", facts: [] };
  }
  const exam = detected.exam;
  const usual = detected.usual;
  const p = pronoun(student);
  const name = student?.name || "该生";
  const examLabel = `${exam.date || ""}「${exam.examName || "这次考试"}」`.trim();
  const usualBit = `近 ${usual.ranks.length} 次班排中位是第 ${Math.round(usual.usualRank)} 名，其中 ${usual.frontCount} 次在前 ${SCORE_DROP_USUAL_TOP}`;
  const dropBit = detected.dropRank != null
    ? `这次班排第 ${detected.dropRank}${exam.classN ? "/" + exam.classN : ""} 名`
    : "这次班排名次明显后退";
  const lineBit = detected.missSecond ? `，且${exam.line || "未达二本"}` : (exam.line ? `，校内对照为${exam.line}` : "");

  const facts = [];
  const cheat = cheatRecordOf(exam);
  const earlierCheats = usual.exams.map((h) => ({ exam: h, rec: cheatRecordOf(h) })).filter((x) => x.rec.substantiated);
  const absent = absentSubjectsOf(exam);
  const health = healthNearExam(student, exam.date);
  const collapses = subjectCollapses(exam, usual.exams);

  if (cheat.substantiated || cheat.voided) {
    const disc = cheat.disciplineLabel ? `，处分是${cheat.disciplineLabel}` : "";
    facts.push({
      id: "cheat-voided",
      kind: "fact",
      system: `${examLabel}作弊已经查实，靠作弊所得成绩已取消并重算名次${disc}。这是档案里的处分记录，不是推测。`,
      student: `我知道「${exam.examName}」那次成绩被取消了，名次也是按取消以后的分数排的。`,
    });
  } else if (cheat.reported && !cheat.substantiated) {
    facts.push({
      id: "cheat-unproven",
      kind: "fact",
      system: `${examLabel}有过作弊举报，但档案显示尚未查实或未能认定。不能据此说${p}作弊，掉名次还要看其他已有事实。`,
      student: `有人说过那次考试的事，但学校并没有认定我作弊，我也只能按自己的卷面成绩来谈这次发挥。`,
    });
  }
  if (earlierCheats.length && !(cheat.substantiated || cheat.voided)) {
    const names = earlierCheats.map((x) => `「${x.exam.examName}」`).join("、");
    facts.push({
      id: "cheat-earlier",
      kind: "fact",
      system: `更早的${names}有过已查实的作弊并取消成绩。只有这些场次可以这么说，不能把后来没有记录的考试也写成「一直在作弊」。`,
      student: `以前确有考试被认定作弊、成绩取消。这件事已经记在档案里，和这次发挥要分开看。`,
    });
  } else if (earlierCheats.length && (cheat.substantiated || cheat.voided)) {
    const names = earlierCheats.map((x) => `「${x.exam.examName}」`).join("、");
    facts.push({
      id: "cheat-pattern-recorded",
      kind: "fact",
      system: `除了这场，更早的${names}也有过已查实的作弊记录。`,
      student: `以前也有过被认定作弊、成绩取消的记录。`,
    });
  }

  if (absent.length) {
    const labs = absent.map(subjName).join("、");
    facts.push({
      id: "absent",
      kind: "fact",
      system: `${examLabel}档案记有${labs}缺考或未计有效成绩，因此总分和班排会明显落后。`,
      student: `「${exam.examName}」我有${labs}没有记下有效成绩，等于缺了这门，总分就被拉开了。`,
    });
  }

  if (health) {
    const label = health.status === "事假"
      ? "事假"
      : (health.kind ? `病假（${health.kind}）` : "病假");
    const when = health.start && health.until && health.start !== health.until
      ? `${health.start}至${health.until}`
      : (health.start || health.until || "考前");
    if (health.sick || health.status === "病假") {
      facts.push({
        id: "illness",
        kind: "fact",
        system: `考前档案有${label}记录（${when}）。考试日校历仍要求到校应考，但可以说明${p}当时身体不适、可能没有发挥好。`,
        student: `那几天我请了${label}，身子还不舒服就进了考场，「${exam.examName}」没有发挥好。`,
      });
    } else {
      facts.push({
        id: "leave",
        kind: "fact",
        system: `考前档案有${label}记录（${when}），不是病假处分，但备考状态可能受影响。`,
        student: `考前我请过${label}，回来以后状态不太稳，这场就掉下来了。`,
      });
    }
  }

  if (collapses.length) {
    const bits = collapses.slice(0, 3).map((c) => `${c.name} ${c.score} 分（平时大约 ${c.usual} 分）`);
    facts.push({
      id: "collapse",
      kind: collapses.length && (cheat.voided || absent.length || health) ? "fact" : "score",
      system: `${examLabel}单科明显低于${p}自己近几次的水平：${bits.join("；")}。这是对照已有分数看出的，不是单科异常优异，也不能据此写成作弊。`,
      student: `这次主要是${collapses.map((c) => c.name).join("、")}没考好，比我平时差一截。`,
    });
  }

  const hasHardFact = facts.some((f) => ["cheat-voided", "absent", "illness", "leave", "cheat-pattern-recorded"].includes(f.id));
  let speculation = false;
  if (!hasHardFact && !facts.some((f) => f.id === "collapse" || f.id === "cheat-unproven")) {
    speculation = true;
    facts.push({
      id: "speculation",
      kind: "speculation",
      system: `档案里没有查实的作弊、缺考或考前病假/事假记录。根据分数结构，更像是这场发挥失常或整体下滑。这是依据成绩作的推测，不是已查实的记过，绝不能写成作弊。`,
      student: `这次「${exam.examName}」我没考好，可能是状态不对、发挥失常。我没有缺考，也没有别的处分可以讲。`,
    });
  } else if (!hasHardFact && facts.some((f) => f.id === "collapse")) {
    speculation = true;
    const collapse = facts.find((f) => f.id === "collapse");
    collapse.kind = "speculation";
    collapse.system += " 档案没有查实的作弊或缺考，上述单科下滑只是依据成绩作的推测。";
  }

  const head = `${name}平时${usualBit}，${dropBit}${lineBit}。`;
  const systemText = [head, ...facts.map((f) => f.system), SCORE_DROP_SOURCE_NOTE].join("");
  const tone = hash01(seed, student?.id || name, exam.examId || exam.date, "drop-talk") < 0.5 ? 0 : 1;
  const opening = tone
    ? `老师，${examLabel}我自己也知道掉得很厉害。`
    : `老师，这次${dropBit}，我来说一下原因。`;
  const studentText = [opening, ...facts.map((f) => f.student)].join("");

  return {
    dropped: true,
    title: "这次掉分的可能原因",
    exam,
    usual,
    dropRank: detected.dropRank,
    usualRank: usual.usualRank,
    sharp: detected.sharp,
    missSecond: detected.missSecond,
    facts,
    speculation,
    hasCheatFact: facts.some((f) => f.id === "cheat-voided" || f.id === "cheat-pattern-recorded" || f.id === "cheat-earlier"),
    hasUnprovenReport: facts.some((f) => f.id === "cheat-unproven"),
    hasAbsentFact: facts.some((f) => f.id === "absent"),
    hasHealthFact: facts.some((f) => f.id === "illness" || f.id === "leave"),
    systemText,
    studentText,
    localText: `【系统说明】\n${systemText}\n\n【学生自己阐述】\n${studentText}`,
    talkAppendix: `关于${examLabel}的掉分：${facts[0]?.system || systemText}`,
    sourceNote: SCORE_DROP_SOURCE_NOTE,
  };
}

export function scoreDropAiPayload(expl) {
  if (!expl?.dropped) return { ok: false, reason: "近几次没有需要解释的大幅掉分。" };
  return {
    ok: true,
    说明: "把下列系统说明和学生阐述润色成通顺的两段话，分别标明「系统说明」和「学生自己阐述」。必须保留已有事实，不得编造作弊、缺考、处分、病假或分数排名，不得把推测写成已查实。不要写 markdown。只输出 JSON：{\"说明\":\"文本\"}。",
    须知: SCORE_DROP_SOURCE_NOTE,
    系统说明: expl.systemText,
    学生自己阐述: expl.studentText,
    已有事实类型: expl.facts.map((f) => f.id),
    允许提到作弊: !!expl.hasCheatFact,
    允许提到缺考: !!expl.hasAbsentFact,
    允许提到病假或身体不适: !!expl.hasHealthFact,
    含未查实举报: !!expl.hasUnprovenReport,
    推测须标明: !!expl.speculation,
  };
}

export function validateScoreDropText(text, expl) {
  const raw = String(text || "").trim();
  if (!raw) return { ok: false, reason: "空文案。" };
  if (!expl?.dropped) return { ok: false, reason: "没有对照事实。" };
  if (!expl.hasCheatFact && /作弊|偷看作弊|夹带|代考/.test(raw) && !expl.hasUnprovenReport) {
    return { ok: false, reason: "润色稿编造了档案中没有的作弊，已改用本地说明。" };
  }
  if (!expl.hasCheatFact && expl.hasUnprovenReport && /已查实作弊|认定作弊|取消成绩.*作弊/.test(raw) && !/未查实|未能认定|不能据此/.test(raw)) {
    return { ok: false, reason: "润色稿把未查实举报写成了已认定作弊，已改用本地说明。" };
  }
  if (!expl.hasAbsentFact && /缺考/.test(raw)) {
    return { ok: false, reason: "润色稿编造了档案中没有的缺考，已改用本地说明。" };
  }
  if (!expl.hasHealthFact && /病假|请假|生病|感冒|肠胃/.test(raw) && !/没有.*病假|没有.*请假|未另记/.test(expl.systemText || "")) {
    // allow mentioning 身体状态 as speculation only if the source text already framed it? otherwise reject invented leave
    if (/请了病假|请病假|请了假|因病缺/.test(raw)) {
      return { ok: false, reason: "润色稿编造了档案中没有的病假，已改用本地说明。" };
    }
  }
  return { ok: true, text: raw };
}

export function shouldShowScoreDrop(expl) {
  return !!expl?.dropped;
}
