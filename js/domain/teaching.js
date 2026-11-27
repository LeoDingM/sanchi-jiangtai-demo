/**
 * 日常教学：备课、上课、作业登记、课后面批。
 * 效果写入备课充分度与数学教学积累，并确定性影响任教班学生状态；不用 LLM 编课堂。
 */
import { clamp, hash01, rngFrom, round1 } from "./prng.js?v=t75u2";
import { seatLabel } from "./school.js?v=t75u2";
import { deskChatPairs, deskMateOf, missingDeskPairs, peerStatusLine } from "./peers.js?v=t75u2";
import { isAwayFromClass, classAbsences, healthStatusLine } from "./health.js?v=t75u2";
import { lessonPotentialNote } from "./potential.js?v=t75u2";

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
  let correction = "可归档";
  if (status === "缺交") correction = "待补交";
  else if (quality === "错题较多" || quality === "未订正") correction = "待面批";
  return {
    id: student.id,
    name: student.name,
    seq: student.seq,
    status,
    quality,
    score,
    flag: reaction.flag,
    reviewed: false,
    urged: false,
    correction,
  };
}

export function isOpenHomework(row) {
  if (!row) return false;
  return ["待补交", "已补交待面批", "待面批", "待订正", "已订正待复查"].includes(row.correction)
    || row.status === "缺交" || row.quality === "错题较多" || row.quality === "未订正";
}

export function allHomeworkRows(state) {
  const map = new Map();
  for (const r of state.homeworkOpen || []) map.set(`${r.id}|${r.date || ""}|${r.topic || ""}`, r);
  for (const r of state.homework?.rows || []) {
    const key = `${r.id}|${state.homework?.date || r.date || ""}|${state.homework?.topic || r.topic || ""}`;
    if (!r.date) r.date = state.homework?.date;
    if (!r.topic) r.topic = state.homework?.topic;
    map.set(key, r);
  }
  return [...map.values()];
}

export function homeworkWatchlist(homework, state = null) {
  const rows = state ? allHomeworkRows(state) : (homework?.rows || []);
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const k = `${r.id}|${r.date || ""}|${r.topic || ""}`;
    if (seen.has(k)) continue;
    if (isOpenHomework(r) || r.flag === "走神") {
      seen.add(k);
      out.push(r);
    }
  }
  return out;
}

export function studentTeachingContext(student, state) {
  if (!student) return null;
  const hw = allHomeworkRows(state).find((r) => r.id === student.id && isOpenHomework(r))
    || (state.homework?.rows || []).find((r) => r.id === student.id)
    || student.lastHomework
    || null;
  return {
    topic: state.homework?.topic || state.player.lastTaught?.topic || student.lastClassTopic || null,
    hw,
    quiz: student.lastQuiz || null,
    flag: student.lastClassFlag || null,
    roll: student.lastRollCall || null,
  };
}

export function rollCallStatusLine(roll) {
  if (!roll) return "";
  if (roll.text) return roll.text;
  const why = (roll.reasons || []).join("、") || "在点名名单上";
  const bits = [`${roll.date}晚自习点名：${why}`];
  if (roll.late) bits.push("应到后进门");
  if (roll.urged) bits.push("被催把缺交本子拿出来");
  return bits.join("，") + "。";
}

/** 档案「带班近况」：座位、点名、课堂与作业，供界面和测试共用。 */
export function studentRecentStatus(student, state, { placed = false } = {}) {
  if (!student) return "";
  const ctx = studentTeachingContext(student, state);
  const seat = seatLabel(student) + (placed ? "（分班后的新座次）" : "");
  const bits = [];
  if (ctx?.roll) bits.push(rollCallStatusLine(ctx.roll));
  if (ctx?.flag && ctx.topic) bits.push(`最近「${ctx.topic}」课堂上${ctx.flag}`);
  else if (ctx?.flag) bits.push(`最近课堂上${ctx.flag}`);
  if (ctx?.hw) {
    const corr = ctx.hw.correction ? `，${ctx.hw.correction}` : "";
    bits.push(ctx.hw.status === "缺交" || ctx.hw.correction === "待补交" ? "这趟作业缺交" : `作业${ctx.hw.quality}${ctx.hw.reviewed ? "（已面批）" : ""}${corr}`);
  }
  if (ctx?.quiz) bits.push(`随堂小测 ${ctx.quiz.score} 分`);
  if (student.lastParentMeeting) {
    bits.push(student.lastParentMeeting.statusLine || `${student.lastParentMeeting.date}家长会：数学老师与家长谈了近况`);
  }
  if (student.lastActivity) {
    bits.push(student.lastActivity.statusLine || `${student.lastActivity.date}学校活动：已记入本班近况`);
  }
  if (student.lastStudyHall) {
    bits.push(student.lastStudyHall.statusLine || `${student.lastStudyHall.date}自习看班：已记入本班近况`);
  }
  if (student.lastWeekendHomework) {
    bits.push(student.lastWeekendHomework.statusLine || `${student.lastWeekendHomework.date}周末作业：已记入本班近况`);
  }
  if (student.lastDutyWeek) {
    bits.push(student.lastDutyWeek.statusLine || `${student.lastDutyWeek.date}值周：已记入本班近况`);
  }
  if (student.lastVisit) {
    bits.push(student.lastVisit.statusLine || `${student.lastVisit.date}来访：已处理`);
  }
  if (student.lastHomeVisit) {
    bits.push(student.lastHomeVisit.statusLine || `${student.lastHomeVisit.date}${student.lastHomeVisit.kind === "door" ? "上门家访" : "电话家访"}：已与家长谈过`);
  }
  if (student.lastProctor) {
    bits.push(student.lastProctor.statusLine || `${student.lastProctor.date}监考：已记下该生考场情况`);
  }
  if (student.lastMarking) {
    bits.push(student.lastMarking.statusLine || `${student.lastMarking.date}阅卷：数学卷已看过摘记`);
  }
  if (student.lastCoaching) {
    const lab = student.lastCoaching.kind === "enrich" ? "培优" : "补差";
    bits.push(student.lastCoaching.statusLine || `${student.lastCoaching.date}${lab}：数学老师做了课余辅导`);
  }
  if (student.lastTermComment) {
    bits.push(student.lastTermComment.statusLine || `${student.lastTermComment.date}数学学期评语：已就「${student.lastTermComment.examName || "期中或期末"}」写入档案`);
  }
  if (student.lastPaperSign) {
    bits.push(student.lastPaperSign.statusLine || `${student.lastPaperSign.date}试卷签字：已就「${student.lastPaperSign.examName || "这场考试"}」记入档案近况`);
  }
  if (student.lastClassLate?.date) {
    bits.push(`${student.lastClassLate.date}正课迟到，上课铃后才进教室`);
  }
  if (state) {
    const health = healthStatusLine(student, state);
    if (health && health !== "近况平稳。") bits.push(health.replace(/。$/, ""));
  }
  const peerLine = peerStatusLine(student, classmatesOf(student, state));
  const body = !bits.length ? `${seat}。还没有本班课堂或作业记录。` : `${seat}。带班近况：` + bits.join("；") + "。";
  return peerLine ? `${body} ${peerLine}` : body;
}

function classmatesOf(student, state) {
  if (!student || !state?.cohorts) return [];
  const year = student.entryYear ?? state.player?.cohortYear;
  const c = state.cohorts[year];
  if (!c?.students) return [];
  return c.students.filter((x) => x.classNo === student.classNo);
}

/** 正课迟到，与晚自习点名名单分开，不写入 eveningLatecomers。 */
export function classLatecomers(state, students) {
  if (!state || !students?.length) return [];
  const out = [];
  for (const s of students) {
    if (isAwayFromClass(s, state)) continue;
    if (hash01(s.id, state.date, state.periodId, "class-late") < 0.04) out.push(s);
  }
  return out;
}

/** 实习老师偶发走错教室。按 seed+日期+节次确定，不是每节都发生。 */
export function wrongClassroomThisPeriod(state) {
  if (!state?.date) return false;
  return hash01(state.seed, state.date, state.periodId, "wrong-room") < 0.07;
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
    if (isAwayFromClass(s, state)) {
      s.lastClassFlag = "请假";
      s.lastClassTopic = plan.topic;
      s.lastClassDate = state.date;
      return { id: s.id, name: s.name, flag: "请假" };
    }
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

  const present = students.filter((s) => !isAwayFromClass(s, state));
  const chatPairs = deskChatPairs(present, key);
  for (const { a, b } of chatPairs) {
    const recs = [reactions.find((r) => r.id === a.id), reactions.find((r) => r.id === b.id)];
    if (recs.some((r) => r?.flag === "表现突出")) continue;
    for (const [stu, rec] of [[a, recs[0]], [b, recs[1]]]) {
      if (!rec || rec.flag === "走神") continue;
      rec.flag = "走神";
      stu.lastClassFlag = "走神";
      stu.energy = clamp((stu.energy || 70) - 1, 20, 98);
      stu.mood = clamp((stu.mood || 60) - 1, 0, 100);
    }
  }

  let called = null;
  if (callId) {
    const s = students.find((x) => x.id === callId);
    if (s && isAwayFromClass(s, state)) {
      called = { id: s.id, name: s.name, ok: false, absent: true, text: `${s.name}今天请假，这节不在教室，你改点了别人。` };
    } else if (s) {
      s.relation = clamp((s.relation || 0) + 2, 0, 100);
      s.ability.math = clamp((s.ability.math || 50) + 0.08, 0, 99);
      const ok = hash01(s.id, key, "call") + prep * 0.08 > 0.48;
      called = { id: s.id, name: s.name, ok, text: ok ? `${s.name}把这道题讲清楚了。` : `${s.name}这回没答完整，你在黑板上补了关键步。` };
    }
  }

  let quiz = null;
  if (style === "随堂小测") {
    quiz = students.filter((s) => !isAwayFromClass(s, state)).map((s) => {
      const score = quizScore(s, key, prep, plan.depth);
      s.lastQuiz = { date: state.date, topic: plan.topic, score };
      return { id: s.id, name: s.name, score };
    }).sort((a, b) => b.score - a.score);
  }

  const hwRows = students.map((s, i) => {
    if (isAwayFromClass(s, state)) {
      const row = {
        id: s.id, name: s.name, seq: s.seq, status: "请假", quality: "请假", score: null,
        flag: "请假", reviewed: true, urged: false, correction: "已闭环",
        date: state.date, topic: plan.topic,
      };
      s.lastHomework = { ...row, load: plan.homework };
      return row;
    }
    const row = homeworkRow(s, key, plan.homework, reactions[i], prep, plan.depth);
    row.date = state.date;
    row.topic = plan.topic;
    s.lastHomework = { ...row, date: state.date, topic: plan.topic, load: plan.homework };
    return row;
  }).sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  const prevOpen = allHomeworkRows(state).filter((r) => isOpenHomework(r) && !(r.date === state.date && r.topic === plan.topic));
  state.homeworkOpen = prevOpen;
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
  const chatting = chatPairs.filter(({ a, b }) => {
    const fa = reactions.find((r) => r.id === a.id)?.flag;
    const fb = reactions.find((r) => r.id === b.id)?.flag;
    return fa === "走神" && fb === "走神";
  });
  if (chatting.length) {
    const { a, b, friends } = chatting[0];
    notes.push(`${a.name}和同桌${b.name}${friends ? "本来就比较要好，" : ""}这节交头接耳，两人都有些走神。`);
  }
  const missDesks = missingDeskPairs(missing, present);
  if (missDesks.length) {
    const { a, b } = missDesks[0];
    notes.push(`同桌的${a.name}和${b.name}这次作业都没交，你记下回头一起催。`);
  }
  const away = classAbsences(students, state);
  if (away.length) {
    notes.push(`${away.slice(0, 4).map((x) => x.name).join("、")}${away.length > 4 ? "等" : ""}今天请假，座位空着，这趟作业先不布置。`);
  }
  const potNote = lessonPotentialNote(present, key);
  if (potNote) notes.push(potNote);
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

  const lateList = classLatecomers(state, students);
  for (const s of lateList) {
    s.lastClassLate = { date: state.date, periodId: state.periodId, text: `${state.date}正课迟到，上课铃后才进教室` };
  }
  if (lateList.length) {
    notes.push(`上课铃后，${lateList.slice(0, 3).map((x) => x.name).join("、")}${lateList.length > 3 ? "等" : ""}才进门，你让他们先坐到座位上。`);
  }
  const wrongRoom = wrongClassroomThisPeriod(state);
  if (wrongRoom) {
    notes.push("你先走到别的班门口，看了门牌才发现不是卓行16班，赶紧转回来。这节稍微晚了几分钟，课讲得紧了一些。");
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
    latecomers: lateList.map((s) => ({ id: s.id, name: s.name })),
    wrongClassroom: wrongRoom,
  };
  state.player.lessons = [record, ...(state.player.lessons || [])].slice(0, 24);
  state.player.lastTaught = record;
  const taught = state.player.taughtTopics || [];
  if (!taught.some((t) => t.grade === grade && t.topic === plan.topic)) {
    state.player.taughtTopics = [...taught, { grade, topic: plan.topic, date: state.date }].slice(-40);
  }
  const lateNote = lateList.length ? `上课铃后有人迟到。` : "";
  const wrongNote = wrongRoom ? "你这节先走错了教室，回来后课讲得紧了一些。" : "";
  const text = `你给卓行${state.player.classNo}班上了「${plan.topic}」（${conf.label}${prep ? "，有备课" : "，备课不足"}）。${wrongNote}${lateNote}数学教学积累到${state.player.mathTeaching.toFixed(1)}。`;
  return { ok: true, teaching: state.player.mathTeaching, record, homework: state.homework, text };
}

function reviewText(student, row, topic) {
  if (!row) {
    const weak = hash01(student.id, student.lastHomework?.date || topic, "review") > 0.55;
    return weak
      ? `你把${student.name}叫到办公桌前，把这道题的关键步重新走了一遍。`
      : `你看了${student.name}的作业，订正了几处书写，肯定了思路。`;
  }
  if (row.status === "缺交" || row.correction === "待补交") return `你问了${student.name}为什么「${topic}」这趟作业没交，约好补上后再来面批，并叮嘱别再空本子。`;
  if (row.correction === "已补交待面批") return `你收下${student.name}补交的「${topic}」作业，当面看了错题，让回去订正后再送复查。`;
  if (row.quality === "错题较多") return `你把${student.name}叫到办公桌前，对着「${topic}」本子把错题的关键步重新走了一遍，让订正后再送来复查。`;
  if (row.quality === "未订正") return `你看了${student.name}的「${topic}」作业，督促把错题订正完整再交回来。`;
  if (row.quality === "较好") return `你看了${student.name}的「${topic}」作业，书写和思路都清楚，只点了一处可以写得更简的步骤。`;
  if (row.status === "迟交") return `你收下${student.name}迟交的「${topic}」作业，提醒下次按时交，并订正了两处计算。`;
  return `你看了${student.name}的「${topic}」作业，订正了几处书写，肯定了思路。`;
}

/** 课后当面批改一名学生的作业。 */
export function reviewHomework(state, student, topic = "面批作业") {
  if (!student) return { ok: false, reason: "找不到这名学生" };
  if (isAwayFromClass(student, state)) return { ok: false, reason: `${student.name}今天请假，没有本子可面批，返校后再看。` };
  if ((state.reviewsToday || 0) >= 6) return { ok: false, reason: "今天面批已经不少，其余的改到办公桌上去看。" };
  const row = allHomeworkRows(state).find((r) => r.id === student.id && isOpenHomework(r))
    || (state.homework?.rows || []).find((r) => r.id === student.id)
    || student.lastHomework
    || null;
  const hwTopic = row?.topic || state.homework?.topic || student.lastHomework?.topic || topic;
  const text = reviewText(student, row, hwTopic);
  const weak = !row || row.status === "缺交" || row.quality === "错题较多" || row.quality === "未订正";
  student.relation = clamp((student.relation || 0) + 2, 0, 100);
  student.ability.math = clamp((student.ability.math || 50) + (weak ? 0.12 : 0.06), 0, 99);
  student.stress = clamp((student.stress || 40) - 2, 0, 95);
  if (row) {
    row.reviewed = true;
    if (row.correction === "待补交") row.urged = true;
    else if (row.correction === "已补交待面批" || row.correction === "待面批" || row.quality === "错题较多" || row.quality === "未订正") {
      row.correction = "待订正";
    } else if (row.status !== "缺交") {
      row.correction = "已闭环";
    }
    if (student.lastHomework && student.lastHomework.id === row.id) {
      student.lastHomework.reviewed = true;
      student.lastHomework.correction = row.correction;
      student.lastHomework.urged = row.urged;
    }
  }
  state.reviewsToday = (state.reviewsToday || 0) + 1;
  student.talks = [...(student.talks || []), { date: state.date, topic, text }];
  return { ok: true, text, student, homework: row };
}


function syncStudentHomework(state, row) {
  const c = state.cohorts?.[state.player?.cohortYear];
  const s = c?.students?.find((x) => x.id === row.id);
  if (s && s.lastHomework && s.lastHomework.id === row.id && s.lastHomework.topic === row.topic) {
    Object.assign(s.lastHomework, row);
  }
}

/** 随课时推进：缺交的可能补交，已面批的可能交来订正本。 */
export function collectHomeworkFollowups(state, reason = "period") {
  const rows = allHomeworkRows(state);
  const updates = [];
  for (const row of rows) {
    const keySeed = `${row.id}|${row.date}|${row.topic}|${state.date}|${state.periodId}|${reason}`;
    if (row.correction === "待补交") {
      const p = 0.4 + (row.urged ? 0.28 : 0);
      if (hash01(keySeed, "makeup") < p) {
        row.status = "迟交";
        row.quality = hash01(keySeed, "makeup-q") < 0.55 ? "错题较多" : "一般";
        row.score = clamp(Math.round(40 + hash01(keySeed, "makeup-s") * 40), 20, 90);
        row.correction = "已补交待面批";
        updates.push({ id: row.id, name: row.name, change: "补交" });
      }
    } else if (row.correction === "待订正") {
      const p = 0.5 + (row.reviewed ? 0.2 : 0);
      if (hash01(keySeed, "corr") < p) {
        row.correction = "已订正待复查";
        updates.push({ id: row.id, name: row.name, change: "交订正" });
      }
    }
    syncStudentHomework(state, row);
  }
  return updates;
}

/** 催交缺交作业，提高下一节补交的可能。 */
export function urgeHomework(state, student) {
  if (!student) return { ok: false, reason: "找不到这名学生" };
  if (isAwayFromClass(student, state)) return { ok: false, reason: `${student.name}今天请假，先不催作业。` };
  const row = allHomeworkRows(state).find((r) => r.id === student.id && r.correction === "待补交");
  if (!row) return { ok: false, reason: `${student.name}目前没有待补交的作业。` };
  row.urged = true;
  syncStudentHomework(state, row);
  const text = `你催了${student.name}把「${row.topic}」作业补上，让下一节课前放到办公桌上。`;
  student.talks = [...(student.talks || []), { date: state.date, topic: "催交作业", text }];
  return { ok: true, text, homework: row };
}

/** 复查已经交回的订正本。 */
export function checkCorrection(state, student) {
  if (!student) return { ok: false, reason: "找不到这名学生" };
  if ((state.reviewsToday || 0) >= 6) return { ok: false, reason: "今天面批和复查已经不少，其余的放到办公室再看。" };
  const row = allHomeworkRows(state).find((r) => r.id === student.id && r.correction === "已订正待复查")
    || allHomeworkRows(state).find((r) => r.id === student.id && r.correction === "待订正");
  if (!row) return { ok: false, reason: `${student.name}还没有交来待复查的订正。` };
  if (row.correction === "待订正") return { ok: false, reason: `${student.name}的「${row.topic}」订正还没交回来。` };
  state.reviewsToday = (state.reviewsToday || 0) + 1;
  const pass = hash01(student.id, row.date, row.topic, state.date, "recheck") < 0.82;
  let text;
  if (pass) {
    row.correction = "已闭环";
    row.quality = "较好";
    student.ability.math = clamp((student.ability.math || 50) + 0.06, 0, 99);
    student.relation = clamp((student.relation || 0) + 1, 0, 100);
    text = `你复查了${student.name}「${row.topic}」的订正，关键步已经写对，这本可以合上了。`;
  } else {
    row.correction = "待订正";
    text = `你复查了${student.name}「${row.topic}」的订正，还有两处没改对，让拿回去再改一次。`;
  }
  syncStudentHomework(state, row);
  student.talks = [...(student.talks || []), { date: state.date, topic: "复查订正", text }];
  return { ok: true, text, passed: pass, homework: row };
}

/** 坐班批改已交未面批的作业（不是叫到面前），一次处理多本。 */
export function officeMarking(state, students) {
  if (state.officeMarkedOn === state.date) return { ok: false, reason: "今天已经在办公室集中改过一轮，剩下的明天再清。" };
  const rows = allHomeworkRows(state).filter((r) => r.correction === "待面批" || r.correction === "已补交待面批" || (r.status !== "缺交" && !r.reviewed && r.correction !== "已闭环" && r.correction !== "待补交"));
  if (!rows.length) return { ok: false, reason: "桌上没有待改的作业。缺交的要先催到，订正本要用复查。" };
  const pri = (r) => (r.correction === "已补交待面批" ? 0 : (r.quality === "错题较多" || r.quality === "未订正") ? 1 : 2);
  rows.sort((a, b) => pri(a) - pri(b) || (a.seq ?? 0) - (b.seq ?? 0));
  const batch = rows.slice(0, 10);
  const weak = [];
  for (const row of batch) {
    row.reviewed = true;
    if (row.quality === "错题较多" || row.quality === "未订正" || row.correction === "已补交待面批") {
      row.correction = "待订正";
      weak.push(row.name);
    } else {
      row.correction = "已闭环";
    }
    syncStudentHomework(state, row);
  }
  state.officeMarkedOn = state.date;
  const text = `你在办公室改了 ${batch.length} 本「${batch[0].topic}」作业` + (weak.length ? `，给${weak.slice(0, 4).join("、")}${weak.length > 4 ? "等" : ""}夹了订正条子。` : "，这几本大体清楚，先收起来。");
  return { ok: true, text, marked: batch.length, weak: weak.length };
}

/** 向班主任通报本班需要盯的人，或单独通报一名学生。 */
export function consultHomeroom(state, students, student = null) {
  const home = state.player.homeroom || "班主任";
  if (student) {
    if ((state.homeroomTalksToday || 0) >= 3) return { ok: false, reason: "今天已经麻烦班主任不少回了，其余的明天再通报。" };
    const row = allHomeworkRows(state).find((r) => r.id === student.id && isOpenHomework(r));
    const flag = student.lastClassFlag;
    let issue = "最近的学习状态";
    if (isAwayFromClass(student, state)) {
      const kind = student.health?.kind;
      issue = student.health?.status === "事假" ? "今天请事假" : `今天请病假${kind ? "（" + kind + "）" : ""}`;
    } else if (row?.correction === "待补交") issue = `「${row.topic}」作业缺交`;
    else if (row) issue = `「${row.topic}」作业还要盯（${row.correction}）`;
    else if (flag === "走神") issue = "这堂课有些走神";
    student.homeroomWatch = true;
    student.stress = clamp((student.stress || 40) - 1, 0, 95);
    state.homeroomTalksToday = (state.homeroomTalksToday || 0) + 1;
    const mate = deskMateOf(student, students);
    let peerBit = "";
    if (mate) {
      const mateRow = allHomeworkRows(state).find((r) => r.id === mate.id && isOpenHomework(r));
      if (mateRow || mate.lastClassFlag === "走神") {
        peerBit = `你也提到同桌${mate.name}最近${mateRow ? "作业也要盯" : "课堂上也有些走神"}。`;
      } else {
        peerBit = `同桌是${mate.name}。`;
      }
    }
    const text = `你把${student.name}${issue}的情况告诉了班主任${home}。${peerBit}她记下了，晚自习会先看这名学生，也让你把订正落实到位。`;
    student.talks = [...(student.talks || []), { date: state.date, topic: "通报班主任", text }];
    return { ok: true, text };
  }
  if (state.homeroomBriefedOn === state.date) return { ok: false, reason: "今天已经和班主任对过一次班情。" };
  const watch = homeworkWatchlist(state.homework, state);
  const names = [...new Set(watch.map((r) => r.name))];
  const away = classAbsences(students, state);
  const absBit = away.length
    ? `${away.slice(0, 4).map((x) => x.name).join("、")}${away.length > 4 ? "等" : ""}今天请假，假条她已经登记了。`
    : "";
  state.homeroomBriefedOn = state.date;
  for (const s of students) {
    if (watch.some((r) => r.id === s.id)) s.homeroomWatch = true;
  }
  const isEve = String(state.periodId || "").startsWith("evening");
  const text = names.length
    ? (isEve
      ? `你把${names.slice(0, 5).join("、")}${names.length > 5 ? "等" : ""}的缺交或课堂情况告诉了班主任${home}。${absBit}她把人写进今晚的点名名单，过一会点名时先叫。`
      : `你把${names.slice(0, 5).join("、")}${names.length > 5 ? "等" : ""}的缺交或课堂情况告诉了班主任${home}。${absBit}她记下了，晚自习点名会先点这几个人。`)
    : (absBit
      ? `你和班主任${home}对了一下班里近况。${absBit}她嘱咐把作业订正按名单落实。`
      : `你和班主任${home}对了一下班里近况。眼下没有特别要盯的人，她嘱咐把作业订正按名单落实。`);
  if (isEve && names.length) {
    const slotKey = `${state.date}|${state.periodId}`;
    const prev = state.eveningRoll?.slotKey === slotKey ? (state.eveningRoll.items || []) : [];
    const extra = compileEveningRoll(state, students);
    const byId = new Map(prev.map((x) => [x.id, { ...x, reasons: [...(x.reasons || [])] }]));
    for (const it of extra) {
      if (!byId.has(it.id)) byId.set(it.id, it);
      else for (const r of it.reasons) if (!byId.get(it.id).reasons.includes(r)) byId.get(it.id).reasons.push(r);
    }
    state.eveningRoll = {
      slotKey,
      date: state.date,
      periodId: state.periodId,
      items: [...byId.values()],
      handed: true,
      called: state.eveningRoll?.slotKey === slotKey && state.eveningRoll?.called,
      patrolled: state.eveningRoll?.patrolled || false,
    };
  }
  return { ok: true, text, names };
}

/** 向备课组长请教当前课题，换来可执行的建议和一点备课充分度。 */
export function consultMentor(state, grade = 1) {
  if (state.mentorConsultedOn === state.date) return { ok: false, reason: "今天已经向备课组长请教过一次，先把教案落下去。" };
  const mentor = state.player.mentor || "备课组长";
  const topic = state.player.lessonPlan?.topic || suggestedTopic(state, grade);
  state.mentorConsultedOn = state.date;
  state.player.prep = Math.min(3, (state.player.prep || 0) + 1);
  const hints = [
    `把基本定义和易混点写在黑板左侧，例题不要一上来就上综合。`,
    `先让中等生板演再讲变式，避免只盯着前面几排。`,
    `作业里只保留一道稍难点的，错题明天必须订正到位。`,
  ];
  const hint = hints[Math.floor(hash01(state.seed, state.date, topic, "mentor") * hints.length)];
  const text = `${mentor}看了你准备的「${topic}」，提醒：${hint}备课充分度现为${state.player.prep}。`;
  return { ok: true, text, prep: state.player.prep, topic };
}



/** 晚自习尚未回到座位的人（确定性、少数，不是正式考勤册）。 */
export function eveningLatecomers(state, students) {
  const out = [];
  for (const s of students || []) {
    if (isAwayFromClass(s, state)) continue;
    if (hash01(s.id, state.date, state.periodId, "late") < 0.045) out.push(s);
    if (out.length >= 3) break;
  }
  return out;
}

/** 汇总晚自习点名名单：晚归、举手、缺交/订正、白天已通报的人。 */
export function compileEveningRoll(state, students) {
  const list = students || [];
  const byId = new Map();
  const add = (s, reason) => {
    if (!s) return;
    if (!byId.has(s.id)) byId.set(s.id, { id: s.id, name: s.name, seat: seatLabel(s), reasons: [] });
    const it = byId.get(s.id);
    if (reason && !it.reasons.includes(reason)) it.reasons.push(reason);
  };
  for (const s of eveningLatecomers(state, list)) add(s, "还没回到座位");
  for (const s of raisedHands(state, list)) add(s, "举手");
  for (const r of homeworkWatchlist(state.homework, state)) {
    const s = list.find((x) => x.id === r.id);
    if (isAwayFromClass(s, state)) continue;
    add(s, r.correction === "待补交" || r.status === "缺交" ? "作业缺交" : "订正未了");
  }
  for (const s of list) {
    if (isAwayFromClass(s, state)) continue;
    if ((s.energy ?? 70) < 50 || s.lastClassFlag === "走神") add(s, "状态不佳");
    if (s.homeroomWatch) add(s, "白天已通报");
  }
  return [...byId.values()];
}

export const TUTOR_MODES = ["巡视", "答疑", "小组", "收订正"];

function pronoun(student) {
  return student?.gender === "F" ? "她" : "他";
}

/** 晚自习/答疑时可能举手的人：优先未了作业和课堂上走神的。 */
export function raisedHands(state, students) {
  const out = [];
  for (const s of students || []) {
    if (isAwayFromClass(s, state)) continue;
    const ctx = studentTeachingContext(s, state);
    const hw = ctx?.hw;
    const open = isOpenHomework(hw);
    const p = hash01(s.id, state.date, state.periodId, "hand");
    let raise = false;
    if (open && (hw.correction === "待订正" || hw.quality === "错题较多" || hw.quality === "未订正") && p < 0.62) raise = true;
    else if (open && (hw.correction === "待补交" || hw.status === "缺交") && p < 0.25) raise = true;
    else if (ctx?.flag === "走神" && p < 0.32) raise = true;
    else if ((s.energy ?? 70) < 48 && p < 0.18) raise = true;
    else if (p < 0.06) raise = true;
    if (raise) out.push(s);
  }
  return out.slice(0, 8);
}

function resetTutorFlagsIfNeeded(state, slotKey) {
  if (state.tutorSlotKey !== slotKey) {
    state.tutorSlotKey = slotKey;
    state.tutorAnswers = 0;
    state.eveningPatrolledKey = null;
    state.eveningCollectedKey = null;
    state.eveningGroupKey = null;
  }
}

/**
 * 数学晚自习或数学答疑：巡视、到座位旁答疑、小组讲题、沿过道收订正。
 * 不新开课题，也不占用正课「上课」。
 */
export function tutorEvening(state, students, { mode = "巡视", studentId = null, slot = null } = {}) {
  const slotKey = `${state.date}|${state.periodId}`;
  resetTutorFlagsIfNeeded(state, slotKey);
  const when = slot?.subject || "晚自习";
  const list = students || [];

  if (mode === "巡视") {
    if (state.eveningPatrolledKey === slotKey) return { ok: false, reason: "这节晚自习已经巡视过一轮，接下来到座位上答疑、收订正，或请班主任按名单点名。" };
    state.eveningPatrolledKey = slotKey;
    const away = classAbsences(list, state);
    const sleepy = list.filter((s) => !isAwayFromClass(s, state) && ((s.energy ?? 70) < 50 || s.lastClassFlag === "走神"));
    for (const s of sleepy.slice(0, 3)) {
      s.energy = clamp((s.energy || 70) + 2, 20, 98);
      s.stress = clamp((s.stress || 40) - 1, 0, 95);
    }
    const items = compileEveningRoll(state, list);
    const late = items.filter((x) => x.reasons.includes("还没回到座位"));
    const shots = items.slice(0, 5);
    const leaveNote = away.length
      ? `${away.slice(0, 3).map((x) => x.name).join("、")}${away.length > 3 ? "等" : ""}今天请假，座位空着。`
      : "";
    const detail = shots.length
      ? shots.map((x) => `${x.seat}${x.name}（${x.reasons.join("、")}）`).join("；") + (items.length > 5 ? `。此外还有 ${items.length - 5} 人要盯` : "") + "。"
      : "教室里比较安静，没有特别要停下的座位。";
    const home = state.player?.homeroom || "班主任";
    const handoff = items.length
      ? `你把 ${items.length} 人的点名名单递给班主任${home}，让她晚自习点名时先点这几个人。`
      : `你跟班主任${home}说了声，这节可以按常规点名。`;
    const existing = (state.eveningRoll?.slotKey === slotKey && !state.eveningRoll?.called) ? state.eveningRoll : null;
    state.eveningRoll = {
      slotKey,
      date: state.date,
      periodId: state.periodId,
      items,
      handed: true,
      called: existing?.called || false,
      patrolled: true,
    };
    const text = `${when}，你从第1排慢慢走到后排。${leaveNote}${detail}${handoff}`;
    return { ok: true, mode, text, noticed: shots, roll: items, late: late.length };
  }

  if (mode === "收订正") {
    if (state.eveningCollectedKey === slotKey) return { ok: false, reason: "这节已经收过一轮订正，剩下的本子下一节再催。" };
    const rows = allHomeworkRows(state).filter((r) => r.correction === "待订正");
    if (!rows.length) return { ok: false, reason: "眼下没有待交回的订正本。可以先答疑，或等面批后再收。" };
    state.eveningCollectedKey = slotKey;
    const taken = [];
    for (const row of rows) {
      const p = hash01(row.id, row.date, row.topic, state.date, state.periodId, "evening-collect");
      if (p < 0.78) {
        row.correction = "已订正待复查";
        syncStudentHomework(state, row);
        taken.push(row);
      }
    }
    const text = taken.length
      ? `${when}你沿过道收订正本，${taken.slice(0, 4).map((r) => r.name).join("、")}${taken.length > 4 ? "等" : ""}把本子交了上来，等你复查。`
      : `${when}你沿过道问了一圈，订正本还没写完，只好让他们这节课内送过来。`;
    return { ok: true, mode, text, taken: taken.length };
  }

  if (mode === "小组") {
    if (state.eveningGroupKey === slotKey) return { ok: false, reason: "这节已经做过一次小组答疑，其余人到座位上单独问。" };
    const hands = raisedHands(state, list);
    const watchIds = new Set(homeworkWatchlist(state.homework, state).map((r) => r.id));
    const picks = [];
    const seen = new Set();
    for (const s of [...hands, ...list.filter((x) => watchIds.has(x.id))]) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      picks.push(s);
      if (picks.length >= 3) break;
    }
    if (picks[0]) {
      const related = [];
      const mate0 = deskMateOf(picks[0], list);
      if (mate0) related.push(mate0);
      for (const id of picks[0].peers?.friendIds || []) {
        const f = list.find((x) => x.id === id);
        if (f) related.push(f);
      }
      for (const o of related) {
        if (picks.length >= 3) break;
        if (seen.has(o.id)) continue;
        if (!watchIds.has(o.id) && !hands.some((h) => h.id === o.id)) continue;
        seen.add(o.id);
        picks.push(o);
      }
    }
    if (!picks.length) return { ok: false, reason: "这节没有明显要凑在一起讲的人，改到座位上个别答疑。" };
    state.eveningGroupKey = slotKey;
    const topics = [...new Set(picks.map((s) => studentTeachingContext(s, state)?.topic || state.homework?.topic || state.player.lastTaught?.topic).filter(Boolean))];
    const topic = topics[0] || "最近的练习";
    for (const s of picks) {
      s.relation = clamp((s.relation || 0) + 1, 0, 100);
      s.ability.math = clamp((s.ability.math || 50) + 0.07, 0, 99);
      s.energy = clamp((s.energy || 70) - 1, 20, 98);
      const row = allHomeworkRows(state).find((r) => r.id === s.id && (r.correction === "待订正" || r.correction === "待面批" || r.quality === "错题较多"));
      if (row && row.correction === "待订正" && hash01(s.id, slotKey, "group-fix") < 0.55) {
        row.correction = "已订正待复查";
        syncStudentHomework(state, row);
      }
    }
    let together = "";
    if (picks.length >= 2) {
      const mate = deskMateOf(picks[0], list);
      if (mate && picks.some((p) => p.id === mate.id)) together = `其中${picks[0].name}和同桌${mate.name}坐一块问。`;
    }
    const text = `${when}你把${picks.map((s) => s.name).join("、")}叫到后面空位，就「${topic}」里卡住的几步一起讲了十来分钟。${together}${picks.map((s) => seatLabel(s)).join("、")}这几处回去还得自己再写一遍。`;
    return { ok: true, mode, text, students: picks.map((s) => s.id) };
  }

  // 答疑（默认到座位旁给一个人讲）
  if ((state.tutorAnswers || 0) >= 4) return { ok: false, reason: "这节已经单独讲了好几个人，其余的改到下一节或让他们先写着。" };
  let student = list.find((s) => s.id === studentId) || null;
  if (!student) {
    const hands = raisedHands(state, list);
    student = hands[0] || list.find((s) => homeworkWatchlist(state.homework, state).some((r) => r.id === s.id)) || null;
  }
  if (!student) return { ok: false, reason: "先点一个座位，再走到那一排去答疑。" };
  if (isAwayFromClass(student, state)) return { ok: false, reason: `${student.name}今天请假，座位空着，改到其他人那里答疑。` };
  const ctx = studentTeachingContext(student, state);
  const hw = ctx?.hw;
  const topic = ctx?.topic || hw?.topic || state.homework?.topic || "最近的练习";
  const seat = seatLabel(student);
  const ta = pronoun(student);
  state.tutorAnswers = (state.tutorAnswers || 0) + 1;
  student.relation = clamp((student.relation || 0) + 2, 0, 100);
  student.ability.math = clamp((student.ability.math || 50) + 0.1, 0, 99);
  student.stress = clamp((student.stress || 40) - 1, 0, 95);
  let text;
  let helped = null;
  if (hw?.correction === "待补交" || hw?.status === "缺交") {
    hw.urged = true;
    text = `你在${seat}停下，问${student.name}「${topic}」的本子在哪里。${ta}说还没写完，你让这节课内先补出来再举手。`;
    helped = "催交";
  } else if (hw?.correction === "已订正待复查") {
    text = `你在${seat}看了${student.name}「${topic}」刚交来的订正，让${ta}先放在桌上，回头按复查来收。`;
    helped = "待复查";
  } else if (hw && (hw.correction === "待订正" || hw.quality === "错题较多" || hw.quality === "未订正")) {
    const done = hash01(student.id, slotKey, "seat-tutor") < 0.7;
    if (done) {
      hw.correction = "已订正待复查";
      helped = "订正交回";
      text = `你蹲在${seat}旁边，把「${topic}」里卡住的那一步给${student.name}重新走了一遍。${ta}把订正写完，本子先放在桌上等复查。`;
    } else {
      helped = "讲题";
      text = `你蹲在${seat}旁边，给${student.name}讲「${topic}」里卡住的那一步，让${ta}先自己再写一遍，写完举手。`;
    }
    syncStudentHomework(state, hw);
  } else if (ctx?.flag === "走神") {
    student.energy = clamp((student.energy || 70) + 2, 20, 98);
    text = `你在${seat}停下，提醒${student.name}这堂课走神的地方晚上要补一补，又把「${topic}」里一个易错点随手写在${ta}本子上。`;
    helped = "提醒";
  } else {
    text = `你在${seat}给${student.name}答了一道「${topic}」的问疑，${ta}点了点头，接着自己往下做。`;
    helped = "问疑";
  }
  student.talks = [...(student.talks || []), { date: state.date, topic: "晚自习答疑", text, periodId: state.periodId }];
  return { ok: true, mode: "答疑", text, student, helped };
}

/** 请班主任按巡视或通报留下的名单做晚自习点名。 */
export function homeroomEveningRoll(state, students) {
  const home = state.player.homeroom || "班主任";
  const list = students || [];
  const slotKey = `${state.date}|${state.periodId}`;
  if (state.eveningRoll?.called && state.eveningRoll.slotKey === slotKey) {
    return { ok: false, reason: "这节晚自习班主任已经点过名了。" };
  }
  const items = (state.eveningRoll?.slotKey === slotKey && state.eveningRoll.items?.length)
    ? state.eveningRoll.items
    : compileEveningRoll(state, list);
  const lateIds = new Set(items.filter((x) => x.reasons.includes("还没回到座位")).map((x) => x.id));
  const missIds = new Set(items.filter((x) => x.reasons.includes("作业缺交")).map((x) => x.id));
  for (const s of list) {
    const item = items.find((x) => x.id === s.id);
    if (!item) continue;
    s.homeroomWatch = true;
    const late = lateIds.has(s.id);
    const urged = missIds.has(s.id);
    s.stress = clamp((s.stress || 40) + (late ? 1 : 0) - 1, 0, 95);
    if (late) s.energy = clamp((s.energy || 70) + 3, 20, 98);
    const reasons = item.reasons || [];
    const why = reasons.join("、") || "在点名名单上";
    const parts = [`${state.date}晚自习，班主任${home}点到${s.name}（${seatLabel(s)}）：${why}`];
    if (late) parts.push("应到后从门口进教室");
    if (urged) parts.push("被催把缺交的本子拿出来");
    const rec = {
      date: state.date,
      periodId: state.periodId,
      reasons,
      late,
      urged,
      homeroom: home,
      seat: seatLabel(s),
      text: parts.join("，") + "。",
    };
    s.lastRollCall = rec;
    s.rollCalls = [rec, ...(s.rollCalls || [])].slice(0, 8);
    s.talks = [...(s.talks || []), { date: state.date, topic: "晚自习点名", text: rec.text, periodId: state.periodId, seat: rec.seat }];
  }
  for (const row of allHomeworkRows(state)) {
    if (missIds.has(row.id) && row.correction === "待补交") {
      row.urged = true;
      syncStudentHomework(state, row);
    }
  }
  const usedPatrol = state.eveningRoll?.slotKey === slotKey && state.eveningRoll?.handed;
  state.eveningRoll = {
    slotKey,
    date: state.date,
    periodId: state.periodId,
    items,
    handed: true,
    called: true,
    patrolled: state.eveningRoll?.slotKey === slotKey && !!state.eveningRoll?.patrolled,
  };
  let text;
  if (!items.length) {
    text = `班主任${home}晚自习点了全班人数，人都在座位上，没有要单独留下的。`;
  } else {
    const late = items.filter((x) => x.reasons.includes("还没回到座位"));
    const miss = items.filter((x) => x.reasons.includes("作业缺交"));
    const parts = [`班主任${home}${usedPatrol ? "按你交的名单" : "按需要盯的人"}点名：${items.slice(0, 5).map((x) => x.name).join("、")}${items.length > 5 ? "等" + items.length + "人" : ""}。`];
    if (late.length) parts.push(`还没回座位的${late.map((x) => x.name).join("、")}应了到，从门口走进来。`);
    if (miss.length) parts.push(`她让${miss.slice(0, 3).map((x) => x.name).join("、")}${miss.length > 3 ? "等" : ""}把缺交的本子先拿出来。`);
    if (items.some((x) => x.reasons.includes("白天已通报"))) parts.push("白天通报过的人今晚也点到了。");
    text = parts.join("");
  }
  return { ok: true, text, items, called: items.length };
}

