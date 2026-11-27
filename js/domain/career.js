/**
 * 任职说明：实习与第一次升学后的转正。不另开骨干/班主任/校长晋升。
 */
import { PLAYER_ROLE } from "./config.js?v=t69u1";

export const INTERN_ROLE = PLAYER_ROLE;
export const OFFICIAL_ROLE = "中学数学教师";
export const OFFICIAL_LOG_TEXT = "实习期满，你转正为正式数学教师。";

export function isOfficial(player) {
  return !!player?.official;
}

/** 顶栏职务：实习写明实习教师；转正后职务带「已转正」。 */
export function playerCareerLine(player) {
  if (!player) return INTERN_ROLE;
  if (player.official) return `${player.role || OFFICIAL_ROLE}（已转正）`;
  return player.role || INTERN_ROLE;
}

export function playerCareerStatus(player) {
  if (!player) return "实习教师，尚未转正";
  if (player.official) {
    const since = player.officialSince ? `${player.officialSince}已` : "已";
    return `${since}转正为正式数学教师`;
  }
  return "实习教师，尚未转正";
}

/** 设置页任职说明。 */
export function playerCareerBrief(player) {
  if (!player) return "";
  const classBit = player.classNo != null ? `卓行${player.classNo}班` : "本班";
  if (player.official) {
    const since = player.officialSince ? `${player.officialSince}，` : "";
    return `${since}实习期满，你已转正为正式数学教师（${player.role || OFFICIAL_ROLE}）。仍任教${classBit}数学，并不因此改任班主任或备课组长。班会仍由班主任主持。`;
  }
  return `你目前是数学实习教师（${player.role || INTERN_ROLE}）。实习期满、第一次升学年（进入高二）时会转正为正式数学教师。现在不能代替班主任主持班会。`;
}

export function officialLogCount(state) {
  return (state?.log || []).filter((l) => String(l.text || "").includes(OFFICIAL_LOG_TEXT)).length;
}
