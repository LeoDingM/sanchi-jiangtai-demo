/**
 * 学科潜力：内部计分、选人仍可用。教师默认视图不得显示潜力数值或余地标签，
 * 谈话和课堂纪要也不使用「潜力」「接近潜力」这类词。上帝模式可显示并标明。
 * 不改写能力或潜力，也不参与计分公式。
 */
import { subjectById, SUBJECT_IDS } from "./config.js?v=t65u1";
import { hash01 } from "./prng.js?v=t65u1";

const SUBJECT_NAMES = {
  chinese: "语文",
  math: "数学",
  english: "英语",
  physics: "物理",
  chemistry: "化学",
  geography: "地理",
  history: "历史",
  politics: "政治",
  biology: "生物",
};

/** 谈话和课堂纪要只在余地确实较大时提起，避免全班同一句。 */
export const LARGE_ROOM = 11;
export const WIDE_ROOM = 12;

export function subjectName(id) {
  return SUBJECT_NAMES[id] || subjectById(id)?.name || id;
}

export function subjectRoom(student, subjectId = "math") {
  if (!student) return null;
  const ability = Number(student.ability?.[subjectId]);
  if (!Number.isFinite(ability)) return null;
  const rawP = Number(student.potential?.[subjectId]);
  const potential = Number.isFinite(rawP) ? rawP : ability;
  const room = Math.max(0, Math.round((potential - ability) * 10) / 10);
  return { id: subjectId, name: subjectName(subjectId), ability, potential, room };
}

export function roomBand(room) {
  const n = Number(room) || 0;
  if (n >= WIDE_ROOM) return "wide";
  if (n >= LARGE_ROOM) return "open";
  if (n >= 6) return "slim";
  return "near";
}

export function roomLabel(room) {
  const band = roomBand(room);
  if (band === "wide") return "还有不小的上升空间";
  if (band === "open") return "还有上升空间";
  if (band === "slim") return "还有一点空间";
  return "接近潜力";
}

export function hasLargeRoom(student, subjectId = "math") {
  const r = subjectRoom(student, subjectId);
  return !!(r && r.room >= LARGE_ROOM);
}

export function mathRoomLine(student, { revealPotential = false } = {}) {
  if (!revealPotential) return "";
  const r = subjectRoom(student, "math");
  if (!r || r.room < LARGE_ROOM) return "";
  return `【上帝模式可见】数学${roomLabel(r.room)}（潜力 ${r.potential}，余地 ${r.room}）。`;
}

/** 档案用。默认只写能力分；revealPotential 时并列余地标签与潜力数值，并应由界面标明上帝模式。 */
export function formatAbilityWithRoom(student, { revealPotential = false } = {}) {
  if (!student?.ability) return "";
  const ids = SUBJECT_IDS.slice();
  if (student.ability.biology != null && !ids.includes("biology")) ids.push("biology");
  for (const id of Object.keys(student.ability)) {
    if (!ids.includes(id)) ids.push(id);
  }
  return ids.map((id) => {
    const r = subjectRoom(student, id);
    if (!r) return "";
    if (!revealPotential) return `${r.name} ${Math.round(r.ability)}`;
    return `${r.name} ${Math.round(r.ability)}（${roomLabel(r.room)}，潜力 ${r.potential}）`;
  }).filter(Boolean).join("　");
}

/**
 * 询问学习 / 鼓励时的附加句。教师可见稿不得出现「潜力」「接近潜力」或余地标签。
 * 内部仍用潜力判断是否点到该生，但对外只给可观察的方法提醒。
 */
export function talkMathRoomBit(student, { revealPotential = false } = {}) {
  const r = subjectRoom(student, "math");
  if (!r || r.room < LARGE_ROOM) return "";
  if (revealPotential) {
    return r.room >= WIDE_ROOM
      ? `【上帝模式可见】数学${roomLabel(r.room)}（潜力 ${r.potential}）`
      : `【上帝模式可见】数学${roomLabel(r.room)}（潜力 ${r.potential}）`;
  }
  return "";
}

/**
 * 课堂纪要：按课题键从本班有较大数学余地的人里至多点出两名，确定性，不是每节都出现。
 */
export function lessonPotentialNote(students, key, { revealPotential = false } = {}) {
  const picks = [];
  for (const s of students || []) {
    const r = subjectRoom(s, "math");
    if (!r || r.room < LARGE_ROOM) continue;
    if (hash01(s.id, key, "pot-note") >= 0.4) continue;
    picks.push({ s, r });
  }
  picks.sort((a, b) => b.r.room - a.r.room || String(a.s.id).localeCompare(String(b.s.id)));
  const chosen = picks.slice(0, 2);
  if (!chosen.length) return "";
  const names = chosen.map((x) => x.s.name).join("、");
  if (revealPotential) {
    const label = chosen.some((x) => x.r.room >= WIDE_ROOM) ? "还有不小的上升空间" : "还有上升空间";
    return `【上帝模式可见】${names}的数学${label}，这节把方法再讲扎实一些，别只停在会做例题。`;
  }
  // 内部仍按潜力选人，教师纪要只写可观察的讲法提醒，不出现潜力或余地标签。
  return `${names}这节把方法再讲扎实一些，别只停在会做例题。`;
}
