/** 存档 / 读档。浏览器走 localStorage，Node 测试走纯 JSON。 */
import { SAVE_VERSION } from "./simulation.js?v=t70u1";
import { ensureStatePeers } from "./peers.js?v=t70u1";
import { syncStateHealth } from "./health.js?v=t70u1";

export const STORAGE_KEY = "sanchi-jiangtai-v1";
export const SLOT_KEYS = [0, 1, 2].map((i) => `${STORAGE_KEY}-slot-${i}`);
export const AUTO_KEY = `${STORAGE_KEY}-auto`;

function examsForSave(exams) {
  const out = {};
  for (const [k, ex] of Object.entries(exams || {})) {
    if (!ex || typeof ex !== "object") { out[k] = ex; continue; }
    const cut = ex.cutoffs ? { ...ex.cutoffs, ranked: undefined } : ex.cutoffs;
    const { scoreMap, ...rest } = ex;
    out[k] = { ...rest, cutoffs: cut };
  }
  return out;
}

export function toJSON(state) {
  const payload = { v: SAVE_VERSION, savedAt: new Date().toISOString(), state };
  if (state && state.exams) payload.state = { ...state, exams: examsForSave(state.exams) };
  return JSON.stringify(payload);
}

export function fromJSON(text) {
  const data = typeof text === "string" ? JSON.parse(text) : text;
  if (!data || !data.state) throw new Error("存档损坏：没有游戏状态");
  if (data.v && data.v > SAVE_VERSION) throw new Error("存档版本过新，当前程序无法读取");
  const state = ensureStatePeers(data.state);
  return syncStateHealth(state);
}

export function hasLocalStorage() {
  try { return typeof localStorage !== "undefined" && localStorage != null; } catch { return false; }
}

export function defaultStorage() {
  return hasLocalStorage() ? localStorage : null;
}

function slotKey(slot = "auto") {
  return slot === "auto" ? AUTO_KEY : SLOT_KEYS[slot] || SLOT_KEYS[0];
}

export function isQuotaError(err) {
  if (!err) return false;
  const name = err.name || "";
  const code = err.code;
  const msg = String(err.message || err);
  return name === "QuotaExceededError"
    || name === "NS_ERROR_DOM_QUOTA_REACHED"
    || code === 22
    || code === 1014
    || /quota/i.test(msg);
}

/** 写入失败时的中文说明：空间不足或一般写入失败。 */
export function writeFailureReason(err) {
  if (isQuotaError(err)) {
    return "本机存档空间不足，自动档没有写上。游戏仍可继续，请稍后清理后再保存，或下载存档文件。";
  }
  return "自动档没有写上（写入失败）。游戏仍可继续，可稍后再试或下载存档文件。";
}

export function saveSlot(state, slot = "auto", storage) {
  const store = storage === undefined ? defaultStorage() : storage;
  if (!store) return { ok: false, reason: "当前环境不能写入浏览器存档。" };
  const key = slotKey(slot);
  let json;
  try {
    json = toJSON(state);
  } catch {
    return { ok: false, reason: "存档无法生成，这次没有写入。", key };
  }
  try {
    store.setItem(key, json);
    return { ok: true, key };
  } catch (err) {
    return { ok: false, reason: writeFailureReason(err), key };
  }
}

export function loadSlotResult(slot = "auto", storage) {
  const store = storage === undefined ? defaultStorage() : storage;
  const key = slotKey(slot);
  if (!store) return { ok: false, empty: true, reason: "当前环境不能读取浏览器存档。", state: null, key };
  try {
    const raw = store.getItem(key);
    if (!raw) return { ok: false, empty: true, reason: "还没有自动存档", state: null, key };
    return { ok: true, state: fromJSON(raw), key };
  } catch {
    return { ok: false, empty: false, reason: "存档损坏或读取失败。", state: null, key };
  }
}

export function loadSlot(slot = "auto", storage) {
  return loadSlotResult(slot, storage).state;
}

export function listSlots(storage) {
  const store = storage === undefined ? defaultStorage() : storage;
  if (!store) return [];
  return ["auto", 0, 1, 2].map((slot) => {
    const key = slotKey(slot);
    let raw;
    try {
      raw = store.getItem(key);
    } catch {
      return { slot, empty: false, broken: true };
    }
    if (!raw) return { slot, empty: true };
    try {
      const data = JSON.parse(raw);
      return { slot, empty: false, savedAt: data.savedAt, date: data.state?.date, player: data.state?.player?.name };
    } catch {
      return { slot, empty: false, broken: true };
    }
  });
}
