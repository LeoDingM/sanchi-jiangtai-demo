/**
 * 家长会：班主任主持，玩家以本班数学任课老师身份与家长面谈。
 * 只谈近期考试、作业订正和课堂表现；不改能力分布，也不编造校外公告日期。
 */
import { clamp } from "./prng.js?v=t53u1";
import { isOpenHomework, studentTeachingContext } from "./teaching.js?v=t53u1";
import { seatLabel } from "./school.js?v=t53u1";

export const PARENT_TALK_CAP = 6;

export const PARENTS_SOURCE_NOTE = "校内日期安排，按普通高中在学期开学后或期中后召开家长会的惯例排入校历，不是某所实校或教育行政部门公告的逐年日期。";

export function isParentsMeetingOpen(state) {
  const m = state?.parentsMeeting;
  return !!(m && m.opened && m.date === state.date);
}

export function upcomingParentsMeeting(state, calendar = []) {
  if (!state?.date) return null;
  if (isParentsMeetingOpen(state)) return state.parentsMeeting;
  return (calendar || []).find((e) => e.kind === "parents" && e.date >= state.date) || null;
}

export function parentMeetingStatusLine(rec) {
  if (!rec) return "";
  if (rec.statusLine) return rec.statusLine;
  return `${rec.date}家长会：数学老师与家长谈了该生近期考试、作业和课堂表现。`;
}

function latestExamRow(state, student) {
  const year = student.entryYear ?? state.player?.cohortYear;
  const list = Object.values(state.exams || {})
    .filter((e) => (e.entryYear == null || Number(e.entryYear) === Number(year)) && e.examKind !== "huikao" && (e.rows || []).length)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  for (const rep of list) {
    const row = (rep.rows || []).find((r) => r.studentId === student.id);
    if (row) {
      return {
        examName: rep.examName,
        examKind: rep.examKind,
        date: rep.date,
        total: row.total,
        maxTotal: row.maxTotal,
        rank: row.rank,
        math: row.math,
        line: row.line,
      };
    }
  }
  return null;
}

function examBit(exam) {
  if (!exam) return "眼下还没有可对照的本班考试成绩";
  const bits = [`${exam.date}「${exam.examName}」总分 ${exam.total} 分`];
  if (exam.rank) bits.push(`校排第 ${exam.rank} 名`);
  if (exam.math != null && exam.math !== "") bits.push(`数学 ${exam.math} 分`);
  if (exam.line) bits.push(`校内上线 ${exam.line}`);
  return bits.join("，");
}

function homeworkBit(hw) {
  if (!hw) return "最近没有登记在案的数学作业";
  const topic = hw.topic ? `「${hw.topic}」` : "最近一次";
  if (hw.status === "缺交" || hw.correction === "待补交") return `${topic}作业还缺交，请家长督促补上`;
  if (hw.correction === "已补交待面批") return `${topic}作业已补交，还等面批`;
  if (hw.correction === "待订正") return `${topic}作业${hw.quality || ""}，还要订正`;
  if (hw.correction === "已订正待复查") return `${topic}作业已经订正，等老师复查`;
  if (hw.correction === "已闭环" || hw.reviewed) return `${topic}作业${hw.quality || ""}，已经面批闭环`;
  return `${topic}作业${hw.quality || "已收"}`;
}

function classBit(student, ctx) {
  const topic = ctx?.topic || student.lastClassTopic;
  const flag = ctx?.flag || student.lastClassFlag;
  const quiz = ctx?.quiz || student.lastQuiz;
  const bits = [];
  if (flag && topic) bits.push(`最近「${topic}」课堂上${flag}`);
  else if (flag) bits.push(`最近课堂上${flag}`);
  else if (topic) bits.push(`最近在上「${topic}」`);
  else bits.push("还没有单独记下的课堂表现");
  if (quiz) bits.push(`随堂小测 ${quiz.score} 分`);
  return bits.join("，");
}

export function composeParentBrief(student, state) {
  const ctx = studentTeachingContext(student, state);
  const exam = latestExamRow(state, student);
  return {
    exam,
    homework: ctx?.hw || null,
    classroom: { topic: ctx?.topic || student.lastClassTopic || null, flag: ctx?.flag || student.lastClassFlag || null, quiz: ctx?.quiz || student.lastQuiz || null },
    examText: examBit(exam),
    homeworkText: homeworkBit(ctx?.hw),
    classText: classBit(student, ctx),
  };
}

export function parentTalkPriority(student, state) {
  if (student.lastParentMeeting?.date === state.date) return -1;
  const ctx = studentTeachingContext(student, state);
  const exam = latestExamRow(state, student);
  let p = 0;
  if (ctx?.hw && (isOpenHomework(ctx.hw) || ctx.hw.correction === "待补交" || ctx.hw.status === "缺交")) p += 4;
  if (ctx?.hw && (ctx.hw.correction === "待订正" || ctx.hw.quality === "错题较多")) p += 3;
  if (ctx?.flag === "走神") p += 2;
  if (exam?.line === "未达二本") p += 2;
  if (exam?.line === "二本") p += 1;
  return p;
}

/** 打开当天家长会：班主任主持，玩家以任课老师身份参加。 */
export function openParentsMeeting(state, ev) {
  const home = state.player?.homeroom || "班主任";
  const year = state.player?.cohortYear;
  const classNo = state.player?.classNo;
  if (state.parentsMeeting?.id === ev.id && state.parentsMeeting.opened && state.parentsMeeting.date === state.date) {
    return { ok: true, already: true, text: `这场${ev.name}已经开始了。由班主任${home}主持，你仍可作为数学老师和本班家长面谈。` };
  }
  state.parentsMeeting = {
    id: ev.id,
    date: ev.date || state.date,
    name: ev.name,
    sourceNote: ev.sourceNote || PARENTS_SOURCE_NOTE,
    host: home,
    role: "数学任课老师",
    opened: true,
    talks: [],
  };
  state.parentTalksThisMeeting = 0;
  const text = `${ev.name}开始。由班主任${home}主持，你作为${year}级卓行${classNo}班数学任课老师参加，可与本班家长面谈该生近期考试、作业订正和课堂表现。${ev.sourceNote || PARENTS_SOURCE_NOTE}`;
  return { ok: true, text, meeting: state.parentsMeeting };
}

/** 与本班一名学生的家长面谈。结果写入档案近况，文本由已有记录确定性生成。 */
export function meetParent(state, student) {
  if (!student) return { ok: false, reason: "先点一名本班学生，再和家长面谈。" };
  if (state.player && student.classNo !== state.player.classNo) {
    return { ok: false, reason: "这场家长会你只和本班学生的家长面谈。" };
  }
  if (!isParentsMeetingOpen(state)) {
    return { ok: false, reason: "今天不是家长会。等校历上的家长会那天，由班主任主持，你再作为数学老师面谈。" };
  }
  if (student.lastParentMeeting?.date === state.date && student.lastParentMeeting?.meetingId === state.parentsMeeting.id) {
    return { ok: false, reason: `这场已经和${student.name}的家长谈过了。` };
  }
  if ((state.parentTalksThisMeeting || 0) >= PARENT_TALK_CAP) {
    return { ok: false, reason: `这场家长会你已经单独谈了 ${PARENT_TALK_CAP} 位家长，其余的请班主任${state.player?.homeroom || "班主任"}转告，或等下一场。` };
  }
  const home = state.player?.homeroom || "班主任";
  const meeting = state.parentsMeeting;
  const brief = composeParentBrief(student, state);
  const seat = seatLabel(student);
  const text = `${meeting.name}由班主任${home}主持。你作为数学任课老师，在教室一侧和${student.name}（${seat}）的家长谈了近况：考试方面，${brief.examText}；作业方面，${brief.homeworkText}；课堂方面，${brief.classText}。家长听完后说回去会盯一盯。`;
  const statusLine = `${state.date}家长会：数学老师与家长谈了${brief.exam ? `「${brief.exam.examName}」` : "近期考试"}、作业订正和课堂表现。`;
  const rec = {
    date: state.date,
    meetingId: meeting.id,
    meetingName: meeting.name,
    host: home,
    role: "数学任课老师",
    examName: brief.exam?.examName || null,
    examRank: brief.exam?.rank || null,
    homework: brief.homeworkText,
    classroom: brief.classText,
    seat,
    text,
    statusLine,
  };
  student.lastParentMeeting = rec;
  student.parentMeetings = [rec, ...(student.parentMeetings || [])].slice(0, 8);
  student.talks = [...(student.talks || []), { date: state.date, topic: "家长会", text, seat }];
  student.relation = clamp((student.relation || 0) + 1, 0, 100);
  student.stress = clamp((student.stress || 40) - 1, 0, 95);
  state.parentTalksThisMeeting = (state.parentTalksThisMeeting || 0) + 1;
  meeting.talks = [...(meeting.talks || []), { id: student.id, name: student.name }];
  return { ok: true, text, rec, student };
}
