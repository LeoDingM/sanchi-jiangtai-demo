/**
 * 日常教学：备课、上课、课后面批。效果写入备课充分度与数学教学积累，
 * 并确定性影响任教班学生状态；不用 LLM 编课堂。
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
};

export const HOMEWORK_LOAD = {
  轻: { label: "少量精练", stress: -1, energy: 1 },
  中: { label: "常规作业", stress: 1, energy: 0 },
  重: { label: "加量训练", stress: 3, energy: -2 },
};

export function topicsForGrade(grade) {
  return LESSON_TOPICS[grade] || LESSON_TOPICS[1];
}

function pickTopic(state, grade) {
  const list = topicsForGrade(grade);
  const i = Math.floor(hash01(state.seed, state.date, "topic", state.player.lessons?.length || 0) * list.length);
  return list[i];
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

/** 上课：按教案和课型生成课堂纪要，并微调班级状态与教学积累。 */
export function teachLesson(state, students, { style = "精讲例题", callId = null, grade = 1 } = {}) {
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
    quiz = students.map((s) => ({ id: s.id, name: s.name, score: quizScore(s, key, prep, plan.depth) }))
      .sort((a, b) => b.score - a.score);
  }

  const sleepy = reactions.filter((r) => r.flag === "走神");
  const shine = reactions.filter((r) => r.flag === "表现突出");
  const notes = [
    `课题「${plan.topic}」，课型：${conf.label}。${prep ? "有备课，讲得比较顺。" : "备课不足，课堂有些散。"}`,
    called ? called.text : conf.note,
    shine.length ? `这堂课较投入的有${shine.slice(0, 3).map((x) => x.name).join("、")}${shine.length > 3 ? "等" : ""}。` : "全班中规中矩，没有特别冒尖的表现。",
    sleepy.length ? `${sleepy.slice(0, 3).map((x) => x.name).join("、")}有些走神，下节课要盯一盯。` : "大多数人还能跟上节奏。",
    plan.homeworkNote,
  ];
  if (quiz) {
    const avg = Math.round(quiz.reduce((s, x) => s + x.score, 0) / quiz.length);
    notes.push(`随堂小测均分 ${avg}，最高 ${quiz[0].score}（${quiz[0].name}）。`);
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
  };
  state.player.lessons = [record, ...(state.player.lessons || [])].slice(0, 24);
  state.player.lastTaught = record;
  const text = `你给卓行${state.player.classNo}班上了「${plan.topic}」（${conf.label}${prep ? "，有备课" : "，备课不足"}）。数学教学积累到${state.player.mathTeaching.toFixed(1)}。`;
  return { ok: true, teaching: state.player.mathTeaching, record, text };
}

/** 课后当面批改一名学生的作业。 */
export function reviewHomework(state, student, topic = "面批作业") {
  if (!student) return { ok: false, reason: "找不到这名学生" };
  if ((state.reviewsToday || 0) >= 6) return { ok: false, reason: "今天面批已经不少，其余的改到办公桌上去看。" };
  const weak = hash01(student.id, state.date, "review") > 0.55;
  student.relation = clamp((student.relation || 0) + 2, 0, 100);
  student.ability.math = clamp((student.ability.math || 50) + (weak ? 0.12 : 0.06), 0, 99);
  student.stress = clamp((student.stress || 40) - 2, 0, 95);
  state.reviewsToday = (state.reviewsToday || 0) + 1;
  const text = weak
    ? `你把${student.name}叫到办公桌前，把这道题的关键步重新走了一遍。`
    : `你看了${student.name}的作业，订正了几处书写，肯定了思路。`;
  student.talks = [...(student.talks || []), { date: state.date, topic, text }];
  return { ok: true, text, student };
}
