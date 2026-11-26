import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyBootQueue,
  recordBootIntent,
  consumeBootIntent,
  beginBoot,
  endBoot,
  createBootQueue,
  startNewGameSession,
} from "../js/domain/bootFlow.js";

test("记录开档意图后可以消费，消费后队列为空", () => {
  let q = emptyBootQueue();
  q = recordBootIntent(q, "new");
  assert.deepEqual(q.pending, { action: "new" });
  assert.equal(q.busy, false);
  const once = consumeBootIntent(q);
  assert.deepEqual(once.intent, { action: "new" });
  assert.equal(once.queue.pending, null);
  const twice = consumeBootIntent(once.queue);
  assert.equal(twice.intent, null);
});

test("无效意图不会写入队列，continue 也可记录", () => {
  let q = recordBootIntent(emptyBootQueue(), "reset");
  assert.equal(q.pending, null);
  q = recordBootIntent(q, "continue");
  assert.deepEqual(q.pending, { action: "continue" });
});

test("模块未就绪时先记录意图，就绪后 begin 消费并开档，不会跑两遍", () => {
  const q = createBootQueue();
  q.record("new");
  assert.deepEqual(q.pending, { action: "new" });
  const first = q.begin();
  assert.equal(first, "new");
  assert.equal(q.pending, null);
  assert.equal(q.busy, true);
  assert.equal(q.begin("new"), null, "同一次点击或重复调用应被忽略");
  assert.equal(q.begin("continue"), null);
  q.end();
  assert.equal(q.busy, false);
  assert.equal(q.begin("new"), "new");
});

test("已就绪时直接 begin，同时存在的 pending 会被消费以免再跑一遍", () => {
  const q = createBootQueue();
  q.record("new");
  assert.equal(q.begin("new"), "new");
  assert.equal(q.pending, null);
  assert.equal(q.begin(), null);
  q.end();
  q.record("continue");
  assert.equal(q.begin("continue"), "continue");
  assert.equal(q.pending, null);
});

test("忙碌时 begin 返回空，结束后才能再次开档", () => {
  let q = emptyBootQueue();
  const first = beginBoot(q, "new");
  assert.equal(first.action, "new");
  assert.equal(first.queue.busy, true);
  const dup = beginBoot(first.queue, "new");
  assert.equal(dup.action, null);
  assert.equal(dup.queue.busy, true);
  const after = beginBoot(endBoot(first.queue), "continue");
  assert.equal(after.action, "continue");
});

test("与会话流程一起：重复 begin 只会真正生成一次", async () => {
  const q = createBootQueue();
  let created = 0;
  const fakeState = { seed: 20170901, date: "2017-09-01" };
  async function once() {
    const started = q.begin("new");
    if (!started) return null;
    try {
      return await startNewGameSession({
        playerName: "林知秋",
        seed: 20170901,
        typed: true,
        createGameAsync: async () => {
          created += 1;
          return fakeState;
        },
        saveAuto: () => ({ ok: true }),
        paint: () => {},
        yieldFn: async () => {},
      });
    } finally {
      q.end();
    }
  }
  q.record("new");
  const a = once();
  const b = once();
  const [ra, rb] = await Promise.all([a, b]);
  const started = [ra, rb].filter(Boolean);
  assert.equal(started.length, 1);
  assert.equal(created, 1);
  assert.equal(started[0].entered, true);
  assert.equal(started[0].state, fakeState);
});
