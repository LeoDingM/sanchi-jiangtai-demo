/** 存档 / 读档。浏览器走 localStorage，Node 测试走纯 JSON。 */
import { SAVE_VERSION } from "./simulation.js";

export const STORAGE_KEY = "sanchi-jiangtai-v1";
export const SLOT_KEYS = [0, 1, 2].map((i) => `${STORAGE_KEY}-slot-${i}`);
export const AUTO_KEY = `${STORAGE_KEY}-auto`;

export function toJSON(state) {
  return JSON.stringify({ v: SAVE_VERSION, savedAt: new Date().toISOString(), state });
}

export function fromJSON(text) {
  const data = typeof text === "string" ? JSON.parse(text) : text;
  if (!data || !data.state) throw new Error("存档损坏：没有游戏状态");
  if (data.v && data.v > SAVE_VERSION) throw new Error("存档版本过新，当前程序无法读取");
  return data.state;
}

export function hasLocalStorage() {
  try { return typeof localStorage !== "undefined" && localStorage != null; } catch { return false; }
}

export function saveSlot(state, slot = "auto") {
  if (!hasLocalStorage()) return { ok: false, reason: "无 localStorage" };
  const key = slot === "auto" ? AUTO_KEY : SLOT_KEYS[slot] || SLOT_KEYS[0];
  localStorage.setItem(key, toJSON(state));
  return { ok: true, key };
}

export function loadSlot(slot = "auto") {
  if (!hasLocalStorage()) return null;
  const key = slot === "auto" ? AUTO_KEY : SLOT_KEYS[slot] || SLOT_KEYS[0];
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  return fromJSON(raw);
}

export function listSlots() {
  if (!hasLocalStorage()) return [];
  return ["auto", 0, 1, 2].map((slot) => {
    const key = slot === "auto" ? AUTO_KEY : SLOT_KEYS[slot];
    const raw = localStorage.getItem(key);
    if (!raw) return { slot, empty: true };
    try {
      const data = JSON.parse(raw);
      return { slot, empty: false, savedAt: data.savedAt, date: data.state?.date, player: data.state?.player?.name };
    } catch {
      return { slot, empty: false, broken: true };
    }
  });
}
