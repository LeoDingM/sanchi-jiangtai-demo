/** 开档 / 读档流程：先画出加载框，再生成或读取，存档失败也不阻断进游戏。 */
export function yieldToPaint(yieldFn) {
  if (typeof yieldFn === "function") return yieldFn();
  return new Promise((resolve) => {
    const later = () => setTimeout(resolve, 50);
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => requestAnimationFrame(later));
    } else {
      later();
    }
  });
}

function report(paint, info) {
  if (typeof paint === "function") paint(info);
}

/**
 * 开始新学期：先报告进度并让出绘制，再生成全校名单、尝试写自动档，最后进入游戏。
 * persist 失败时仍返回 generated state，entered 为 true。
 */
export async function startNewGameSession({
  playerName,
  seed,
  typed = false,
  createGameAsync,
  saveAuto,
  paint,
  yieldFn,
} = {}) {
  if (typeof createGameAsync !== "function") {
    throw new Error("缺少 createGameAsync");
  }
  report(paint, { phase: "generate", label: "正在生成全校名单", progress: 6 });
  await yieldToPaint(yieldFn);
  const state = await createGameAsync(seed, playerName, {
    onProgress: (step) => report(paint, {
      phase: "generate",
      label: step.label || "正在生成全校名单",
      progress: step.progress,
    }),
    yieldFn,
  });
  report(paint, { phase: "save", label: "正在写入存档", progress: 96 });
  await yieldToPaint(yieldFn);
  let saved = { ok: false, reason: "自动档没有写上（写入失败）。游戏仍可继续，可稍后再试或下载存档文件。" };
  try {
    saved = typeof saveAuto === "function" ? (saveAuto(state) || saved) : { ok: true };
  } catch (err) {
    saved = { ok: false, reason: "自动档没有写上（写入失败）。游戏仍可继续，可稍后再试或下载存档文件。", error: err };
  }
  report(paint, { phase: "enter", label: "正在进入教室", progress: 100 });
  const seedToast = typed
    ? `已用世界编号 ${seed} 开局。`
    : `本局世界编号 ${seed}，下次开档会再换一套名单。`;
  const toast = saved?.ok ? seedToast : (saved?.reason || "自动档没有写上。游戏仍可继续。");
  return {
    ok: true,
    entered: true,
    saved: !!saved?.ok,
    saveResult: saved,
    state,
    toast,
  };
}

/** 继续存档：先画出加载框再读取。没有存档或读失败时不进入游戏。 */
export async function continueGameSession({
  loadAuto,
  paint,
  yieldFn,
} = {}) {
  report(paint, { phase: "load", label: "正在读取存档", progress: 20 });
  await yieldToPaint(yieldFn);
  let result = { ok: false, reason: "还没有自动存档", state: null };
  try {
    result = typeof loadAuto === "function" ? (loadAuto() || result) : result;
  } catch {
    result = { ok: false, reason: "存档损坏或读取失败。", state: null };
  }
  if (!result?.ok || !result.state) {
    return {
      ok: false,
      entered: false,
      reason: result?.reason || (result?.empty ? "还没有自动存档" : "存档损坏或读取失败。"),
      state: null,
    };
  }
  report(paint, { phase: "enter", label: "正在进入教室", progress: 100 });
  return { ok: true, entered: true, state: result.state };
}

/** 开档点击队列：记录意图、消费意图；已在跑则忽略重复开档。 */
export function emptyBootQueue() {
  return { pending: null, busy: false };
}

export function normalizeBootAction(action) {
  return action === "new" || action === "continue" ? action : null;
}

export function recordBootIntent(queue, action) {
  const q = queue || emptyBootQueue();
  const act = normalizeBootAction(action);
  if (!act) return { pending: q.pending || null, busy: !!q.busy };
  return { pending: { action: act }, busy: !!q.busy };
}

export function consumeBootIntent(queue) {
  const q = queue || emptyBootQueue();
  return {
    queue: { pending: null, busy: !!q.busy },
    intent: q.pending || null,
  };
}

/** 开始一次开档。已在跑时返回 null 并保持忙碌；否则消费 pending 或采用显式 action。 */
export function beginBoot(queue, action) {
  const q = queue || emptyBootQueue();
  if (q.busy) return { queue: { pending: q.pending || null, busy: true }, action: null };
  const act = normalizeBootAction(action) || q.pending?.action || null;
  if (!act) return { queue: { pending: q.pending || null, busy: false }, action: null };
  return { queue: { pending: null, busy: true }, action: act };
}

export function endBoot(queue) {
  const q = queue || emptyBootQueue();
  return { pending: q.pending || null, busy: false };
}

export function createBootQueue() {
  let queue = emptyBootQueue();
  return {
    get pending() { return queue.pending; },
    get busy() { return queue.busy; },
    record(action) {
      queue = recordBootIntent(queue, action);
      return queue.pending;
    },
    consume() {
      const r = consumeBootIntent(queue);
      queue = r.queue;
      return r.intent;
    },
    begin(action) {
      const r = beginBoot(queue, action);
      queue = r.queue;
      return r.action;
    },
    end() {
      queue = endBoot(queue);
    },
  };
}
