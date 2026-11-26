import test from "node:test";
import assert from "node:assert/strict";
import { createGame, prepareLesson, teach, reviewHomework, playerStudents, talkTo, suggestedTopic } from "../js/domain/simulation.js";

test("备课上课是完整循环：教案、课堂纪要、积累可复现，不是空按钮", () => {
  const a = createGame(20170901);
  const r1 = prepareLesson(a, { topic: "函数的单调性与最值", depth: 2, homework: "中" });
  assert.equal(a.player.prep, 1);
  assert.equal(a.player.lessonPlan.topic, "函数的单调性与最值");
  const before = a.player.mathTeaching;
  const first = playerStudents(a)[0];
  const t1 = teach(a, "提问互动", first.id);
  assert.ok(a.player.mathTeaching > before);
  assert.ok(t1.record.notes.length >= 3);
  assert.equal(t1.record.called.name, first.name);
  assert.equal(a.player.prep, 0);

  const b = createGame(20170901);
  prepareLesson(b, { topic: "函数的单调性与最值", depth: 2, homework: "中" });
  const t2 = teach(b, "提问互动", playerStudents(b)[0].id);
  assert.deepEqual(t1.record.notes, t2.record.notes);
  assert.equal(t1.record.called.ok, t2.record.called.ok);

  const rv = reviewHomework(a, first.id);
  assert.ok(rv.ok);
  const rv2 = reviewHomework(b, playerStudents(b)[0].id);
  assert.equal(rv.text, rv2.text);
});

test("课题按学期进度走，作业登记与谈话可复现，并能对上当堂情况", () => {
  const a = createGame(20170901);
  prepareLesson(a, { topic: "集合与逻辑用语", depth: 2, homework: "中" });
  const t1 = teach(a, "精讲例题");
  assert.equal(t1.homework.rows.length, playerStudents(a).length);
  const missing = t1.homework.rows.filter((r) => r.status === "缺交").length;
  assert.ok(missing < 15, "缺交应是少数");
  const first = playerStudents(a)[0];
  const row = t1.homework.rows.find((r) => r.id === first.id);
  assert.ok(row);
  const rv = reviewHomework(a, first.id);
  assert.ok(rv.ok);
  assert.ok(rv.text.includes(first.name));
  if (row.status === "缺交") assert.ok(rv.text.includes("没交"));
  const talk = talkTo(a, first.id, "询问学习");
  assert.ok(talk.ok);
  assert.ok(talk.text.includes(first.name));
  assert.ok(talk.text.includes("集合") || talk.text.includes("作业") || talk.text.includes("小测"));

  const b = createGame(20170901);
  prepareLesson(b, { topic: "集合与逻辑用语", depth: 2, homework: "中" });
  const t2 = teach(b, "精讲例题");
  assert.deepEqual(
    t2.homework.rows.map((r) => ({ id: r.id, status: r.status, quality: r.quality })),
    t1.homework.rows.map((r) => ({ id: r.id, status: r.status, quality: r.quality })),
  );
  assert.equal(reviewHomework(b, playerStudents(b)[0].id).text, rv.text);

  const next = suggestedTopic(a, 1);
  assert.ok(next && next !== "集合与逻辑用语");
});
