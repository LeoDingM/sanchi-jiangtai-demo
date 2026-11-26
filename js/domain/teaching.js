/**
 * 日常教学：备课、上课、作业登记、课后面批。
 * 效果写入备课充分度与数学教学积累，并确定性影响任教班学生状态；不用 LLM 编课堂。
 */
import { clamp, hash01, rngFrom, round1 } from "./prng.js";

export const LESSON_TOPICS = {
  1: [
    "集合与逻辑用语", "函数的概念与图像", "函数的单调性与最值", "指数函数与对数函数",
    "三角函数的图像", "三角恒等变换", "平面向量", "数列的通项与求和",
  ],
  2: [
    "立体几何中的空间关系", "直线与圆", "圆锥曲线初步", "导数的概念与运算",
    "导数与函数性质", "排列组合", "概率初步", "二项式定理",
  ],
  3: [
    "函数与导数综合", "解析几何综合", "立体几何与空间向量", "数列与不等式",
    "概率统计与计数", "选填压轴技巧", "解答题规范表达", "模拟卷讲评",
  ],
};

export const LESSON_STYLES = {
  精讲例题: { gain: 0.13, label: "精讲例题", note: "把例题讲透，再跟进变式。" },
  讲练结合: { gain: 0.12, label: "讲练结合", note: "讲一段练一段，当堂看掌握。" },
  提问互动: { gain: 0.09, label: "提问互动", note: "多叫人上黑板，课堂更活，进度稍慢。" },
  随堂小测: { gain: 0.11, label: "随堂小测", note: "用短测检查上周内容，再针对讲评。" },
  讲评作业: { gain: 0.1, label: "讲评作业", note: "挑典型错误讲评，订正落实。" },
  讲评试卷: { gain: 0.1, label: "讲评试卷", note: "对照最近一次考试的数学卷，只讲班里真实出现的问题。" },
};

export const HOMEWORK_LOAD = {
  轻: { label: "少量精练", stress: -1, energy: 1 },
  中: { label: "常规作业", stress: 1, energy: 0 },
  重: { label: "加量训练", stress: 3, energy: -2 },
};

export function topicsForGrade(grade) {
  return LESSON_TOPICS[grade] || LESSON_TOPICS[1];
}

export function suggestedTopic(state, grade = 1) {
  const list = topicsForGrade(grade);
  const taught = new Set((state.player.taughtTopics || []).filter((t) => t.grade === grade).map((t) => t.topic));
  return list.find((t) => !taught.has(t)) || list[(state.player.lessons?.length || 0) % list.length];
}

export function topicProgress(state, grade = 1) {
  const list = topicsForGrade(grade);
  const taught = new Set((state.player.taughtTopics || []).filter((t) => t.grade === grade).map((t) => t.topic));
  return { done: list.filter((t) => taught.has(t)).length, total: list.length, next: suggestedTopic(state, grade) };
}

function pickTopic(state, grade) {
  return suggestedTopic(state, grade);
}

export function defaultPlan(state, grade = 1) {
  return {
    topic: pickTopic(state, grade),
    depth: 2,
    homework: "中",
    goals: "",
  };
}

function planText(topic, depth, homework) {
  const depthNote = depth >= 3 ? "准备了基础例题、中档变式和一道综合题。" : depth >= 2 ? "准备了典型例题和一道变式。" : "先把定义和基本例题讲清楚。";
  const hw = HOMEWORK_LOAD[homework] || HOMEWORK_LOAD.中;
  return {
    goals: `让学生掌握「${topic}」的基本方法，能独立完成同类型习题。`,
    examples: depthNote,
    homeworkNote: `课后作业按「${hw.label}」布置。`,
  };
}

/** 备课：填写课题、例题深度和作业量，提升备课充分度。 */
export function prepareLesson(state, opts = {}, grade = 1) {
  const topic = opts.topic || pickTopic(state, grade);
  const depth = clamp(opts.depth ?? 2, 1, 3);
  const homework = HOMEWORK_LOAD[opts.homework] ? opts.homework : "中";
  const text = planText(topic, depth, homework);
  const bump = depth >= 3 ? 2 : 1;
  state.player.prep = Math.min(3, (state.player.prep || 0) + bump);
  state.player.lessonPlan = {
    date: state.date,
    topic,
    depth,
    homework,
    ...text,
    prepAfter: state.player.prep,
  };
  const log = `你备了「${topic}」（例题深度${depth}，作业${HOMEWORK_LOAD[homework].label}）。备课充分度现为${state.player.prep}。`;
  return { ok: true, prep: state.player.prep, plan: state.player.lessonPlan, text: log };
}

function studentReact(student, examKey, style, prep, depth) {
  const h = hash01(student.id, examKey, style, "class");
  const focus = clamp((student.energy ?? 70) / 100 * 0.6 + (100 - (student.stress ?? 40)) / 100 * 0.4 + (h - 0.5) * 0.2, 0.05, 0.98);
  const good = focus + prep * 0.06 + depth * 0.03;
  let flag = "跟上";
  if (good < 0.38) flag = "走神";
  else if (good > 0.78) flag = "表现突出";
  else if (h > 0.82 && style === "提问互动") flag = "被提问";
  return { focus: round1(focus), flag };
}

function quizScore(student, examKey, prep, depth) {
  const rng = rngFrom(student.id, examKey, "quiz");
  const base = (student.ability?.math ?? 50) * 0.7 + 20;
  const jitter = (rng() - 0.5) * 18;
  const bonus = prep * 3 + depth * 2;
  return clamp(Math.round(base + jitter + bonus), 15, 100);
}

function homeworkRow(student, key, load, reaction, prep, depth) {
  const h = hash01(student.id, key, "hw");
  const tired = Math.max(0, (70 - (student.energy ?? 70)) / 100);
  const press = Math.max(0, ((student.stress ?? 40) - 50) / 80);
  let status = "交齐";
  if (h < 0.03 + tired * 0.08 + (load === "重" ? 0.03 : 0)) status = "缺交";
  else if (h < 0.08 + tired * 0.06 + press * 0.04) status = "迟交";
  const qh = hash01(student.id, key, "hwq");
  const skill = clamp(((student.ability?.math ?? 50) / 100) + prep * 0.04 + depth * 0.02, 0, 1.2);
  let quality = "一般";
  if (status === "缺交") quality = "未交";
  else if (qh + skill > 1.2) quality = "较好";
  else if (qh + skill < 0.58 || reaction.flag === "走神") quality = "错题较多";
  else if (qh > 0.8) quality = "未订正";
  const score = status === "缺交" ? 0 : clamp(Math.round(38 + skill * 48 + (qh - 0.5) * 16), 18, 100);
  return {
    id: student.id,
    name: student.name,
    seq: student.seq,
    status,
    quality,
    score,
    flag: reaction.flag,
    reviewed: false,
  };
}

export function homeworkWatchlist(homework) {
  return (homework?.rows || []).filter((r) => r.status === "缺交" || r.quality === "错题较多" || r.quality === "未订正" || r.flag === "走神");
}

export function studentTeachingContext(student, state) {
  if (!student) return null;
  const hw = (state.homework?.rows || []).find((r) => r.id === student.id) || student.lastHomework || null;
  return {
    topic: state.homework?.topic || state.player.lastTaught?.topic || student.lastClassTopic || null,
    hw,
    quiz: student.lastQuiz || null,
    flag: student.lastClassFlag || null,
  };
}

/** 上课：按教案和课型生成课堂纪要，并登记作业、微调班级状态与教学积累。 */
export function teachLesson(state, students, { style = "精讲例题", callId = null, grade = 1, lastExam = null } = {}) {
  const prep = state.player.prep || 0;
  const plan = state.player.lessonPlan || { topic: pickTopic(state, grade), depth: 1, homework: "中", goals: "按进度推进。" };
  const conf = LESSON_STYLES[style] || LESSON_STYLES.精讲例题;
  const quality = prep >= 2 ? 1.15 : prep >= 1 ? 0.95 : 0.62;
  const gain = conf.gain * quality * (0.85 + plan.depth * 0.08);
  state.player.mathTeaching = clamp((state.player.mathTeaching || 0) + gain, 0, 12);
  if (prep > 0) state.player.prep = Math.max(0, prep - 1);

  const key = `${state.date}|${plan.topic}|${style}|${state.player.lessons?.length || 0}`;
  const hw = HOMEWORK_LOAD[plan.homework] || HOMEWORK_LOAD.中;
  const reactions = students.map((s) => {
    const r = studentReact(s, key, style, prep, plan.depth);
    s.stress = clamp((s.stress || 40) + hw.stress + (prep ? 0 : 1), 0, 95);
    s.energy = clamp((s.energy || 70) + hw.energy + (r.flag === "走神" ? -1 : 0), 20, 98);
    if (r.flag === "表现突出") {
      s.mood = clamp((s.mood || 60) + 2, 0, 100);
      s.relation = clamp((s.relation || 0) + 1, 0, 100);
      s.ability.math = clamp((s.ability.math || 50) + 0.05, 0, 99);
    }
    if (r.flag === "走神") s.mood = clamp((s.mood || 60) - 1, 0, 100);
    s.lastClassFlag = r.flag;
    s.lastClassTopic = plan.topic;
    s.lastClassDate = state.date;
    return { id: s.id, name: s.name, flag: r.flag };
  });

  let called = null;
  if (callId) {
    const s = students.find((x) => x.id === callId);
    if (s) {
      s.relation = clamp((s.relation || 0) + 2, 0, 100);
      s.ability.math = clamp((s.ability.math || 50) + 0.08, 0, 99);
      const ok = hash01(s.id, key, "call") + prep * 0.08 > 0.48;
      called = { id: s.id, name: s.name, ok, text: ok ? `${s.name}把这道题讲清楚了。` : `${s.name}这回没答完整，你在黑板上补了关键步。` };
    }
  }

  let quiz = null;
  if (style === "随堂小测") {
    quiz = students.map((s) => {
      const score = quizScore(s, key, prep, plan.depth);
      s.lastQuiz = { date: state.date, topic: plan.topic, score };
      return { id: s.id, name: s.name, score };
    }).sort((a, b) => b.score - a.score);
  }

  const hwRows = students.map((s, i) => {
    const row = homeworkRow(s, key, plan.homework, reactions[i], prep, plan.depth);
    s.lastHomework = { ...row, date: state.date, topic: plan.topic, load: plan.homework };
    return row;
  }).sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  state.homework = {
    date: state.date,
    topic: plan.topic,
    load: plan.homework,
    style,
    rows: hwRows,
  };

  const sleepy = reactions.filter((r) => r.flag === "走神");
  const shine = reactions.filter((r) => r.flag === "表现突出");
  const missing = hwRows.filter((r) => r.status === "缺交");
  const weakHw = hwRows.filter((r) => r.quality === "错题较多" || r.quality === "未订正");
  const notes = [
    `课题「${plan.topic}」，课型：${conf.label}。${prep ? "有备课，讲得比较顺。" : "备课不足，课堂有些散。"}`,
    called ? called.text : conf.note,
    shine.length ? `这堂课较投入的有${shine.slice(0, 3).map((x) => x.name).join("、")}${shine.length > 3 ? "等" : ""}。` : "全班中规中矩，没有特别冒尖的表现。",
    sleepy.length ? `${sleepy.slice(0, 3).map((x) => x.name).join("、")}有些走神，下节课要盯一盯。` : "大多数人还能跟上节奏。",
    plan.homeworkNote + (missing.length ? ` 收上来后，${missing.slice(0, 3).map((x) => x.name).join("、")}${missing.length > 3 ? "等" : ""}这次没交。` : " 作业基本都交齐了。"),
  ];
  if (weakHw.length) {
    notes.push(`订正或错题需要盯的有${weakHw.slice(0, 4).map((x) => x.name).join("、")}${weakHw.length > 4 ? "等" : ""}，适合课后面批。`);
  }
  if (quiz) {
    const avg = Math.round(quiz.reduce((s, x) => s + x.score, 0) / quiz.length);
    const low = quiz.slice().sort((a, b) => a.score - b.score).slice(0, 3);
    notes.push(`随堂小测均分 ${avg}，最高 ${quiz[0].score}（${quiz[0].name}）；偏低的有${low.map((x) => `${x.name}${x.score}`).join("、")}。`);
  }
  if (style === "讲评试卷" && lastExam) {
    const mine = (lastExam.rows || []).filter((r) => students.some((s) => s.id === r.studentId));
    if (mine.length) {
      const mathAvg = Math.round(mine.reduce((s, r) => s + (r.math ?? 0), 0) / mine.length);
      const low = mine.slice().sort((a, b) => (a.math ?? 0) - (b.math ?? 0)).slice(0, 3);
      notes.push(`对照「${lastExam.examName}」数学，任教班均分 ${mathAvg}。你重点讲了${low.map((x) => x.name).join("、")}这几位卷面上比较吃力的地方。`);
    }
  } else if (style === "讲评作业" && weakHw.length) {
    notes.push(`讲评时把「${plan.topic}」里错得集中的几步重新板书，点了${weakHw.slice(0, 3).map((x) => x.name).join("、")}的本子。`);
  }

  const record = {
    date: state.date,
    topic: plan.topic,
    style,
    depth: plan.depth,
    homework: plan.homework,
    prepUsed: prep,
    teaching: round1(state.player.mathTeaching),
    notes,
    called,
    quizAvg: quiz ? Math.round(quiz.reduce((s, x) => s + x.score, 0) / quiz.length) : null,
    quiz: quiz ? quiz.slice(0, 12) : null,
    quizAll: quiz || null,
    homeworkMissing: missing.length,
    homeworkWeak: weakHw.length,
  };
  state.player.lessons = [record, ...(state.player.lessons || [])].slice(0, 24);
  state.player.lastTaught = record;
  const taught = state.player.taughtTopics || [];
  if (!taught.some((t) => t.grade === grade && t.topic === plan.topic)) {
    state.player.taughtTopics = [...taught, { grade, topic: plan.topic, date: state.date }].slice(-40);
  }
  const text = `你给卓行${state.player.classNo}班上了「${plan.topic}」（${conf.label}${prep ? "，有备课" : "，备课不足"}）。数学教学积累到${state.player.mathTeaching.toFixed(1)}。`;
  return { ok: true, teaching: state.player.mathTeaching, record, homework: state.homework, text };
}

function reviewText(student, row, topic) {
  if (!row) {
    const weak = hash01(student.id, student.lastHomework?.date || topic, "review") > 0.55;
    return weak
      ? `你把${student.name}叫到办公桌前，把这道题的关键步重新走了一遍。`
      : `你看了${student.name}的作业，订正了几处书写，肯定了思路。`;
  }
  if (row.status === "缺交") return `你问了${student.name}为什么「${topic}」这趟作业没交，约好明天补上，并叮嘱别再空本子。`;
  if (row.quality === "错题较多") return `你把${student.name}叫到办公桌前，对着「${topic}」本子把错题的关键步重新走了一遍。`;
  if (row.quality === "未订正") return `你看了${student.name}的「${topic}」作业，督促把错题订正完整再交回来。`;
  if (row.quality === "较好") return `你看了${student.name}的「${topic}」作业，书写和思路都清楚，只点了一处可以写得更简的步骤。`;
  if (row.status === "迟交") return `你收下${student.name}迟交的「${topic}」作业，提醒下次按时交，并订正了两处计算。`;
  return `你看了${student.name}的「${topic}」作业，订正了几处书写，肯定了思路。`;
}

/** 课后当面批改一名学生的作业。 */
export function reviewHomework(state, student, topic = "面批作业") {
  if (!student) return { ok: false, reason: "找不到这名学生" };
  if ((state.reviewsToday || 0) >= 6) return { ok: false, reason: "今天面批已经不少，其余的改到办公桌上去看。" };
  const row = (state.homework?.rows || []).find((r) => r.id === student.id) || student.lastHomework || null;
  const hwTopic = state.homework?.topic || student.lastHomework?.topic || topic;
  const text = reviewText(student, row, hwTopic);
  const weak = !row || row.status === "缺交" || row.quality === "错题较多" || row.quality === "未订正";
  student.relation = clamp((student.relation || 0) + 2, 0, 100);
  student.ability.math = clamp((student.ability.math || 50) + (weak ? 0.12 : 0.06), 0, 99);
  student.stress = clamp((student.stress || 40) - 2, 0, 95);
  if (row) {
    row.reviewed = true;
    if (student.lastHomework && student.lastHomework.id === row.id) student.lastHomework.reviewed = true;
  }
  state.reviewsToday = (state.reviewsToday || 0) + 1;
  student.talks = [...(student.talks || []), { date: state.date, topic, text }];
  return { ok: true, text, student, homework: row };
}
