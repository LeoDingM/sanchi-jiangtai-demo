/**
 * 学科潜力：只描述能力距个人上限的余地，供档案、谈话和课堂纪要使用。
 * 不改写能力或潜力，也不参与计分公式。
 */
import { subjectById, SUBJECT_IDS } from "./config.js?v=t55u1";
import { hash01 } from "./prng.js?v=t55u1";

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

export function mathRoomLine(student) {
  const r = subjectRoom(student, "math");
  if (!r || r.room < LARGE_ROOM) return "";
  return `数学${roomLabel(r.room)}。`;
}

/** 档案用：能力分与余地标签并列，不把潜力数值摊成面板。 */
export function formatAbilityWithRoom(student) {
  if (!student?.ability) return "";
  const ids = SUBJECT_IDS.slice();
  if (student.ability.biology != null && !ids.includes("biology")) ids.push("biology");
  for (const id of Object.keys(student.ability)) {
    if (!ids.includes(id)) ids.push(id);
  }
  return ids.map((id) => {
    const r = subjectRoom(student, id);
    if (!r) return "";
    return `${r.name} ${Math.round(r.ability)}（${roomLabel(r.room)}）`;
  }).filter(Boolean).join("　");
}

/** 询问学习 / 鼓励时，仅在数学余地较大时追加一句。 */
export function talkMathRoomBit(student) {
  const r = subjectRoom(student, "math");
  if (!r || r.room < LARGE_ROOM) return "";
  if (r.room >= WIDE_ROOM) return "数学还有不小的上升空间，方法和习惯再稳一稳会更好";
  return "数学还有上升空间，方法和习惯再稳一稳会更好";
}

/**
 * 课堂纪要：按课题键从本班有较大数学余地的人里至多点出两名，确定性，不是每节都出现。
 */
export function lessonPotentialNote(students, key) {
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
  const label = chosen.some((x) => x.r.room >= WIDE_ROOM) ? "还有不小的上升空间" : "还有上升空间";
  return `${names}的数学${label}，这节把方法再讲扎实一些，别只停在会做例题。`;
}
