import test from "node:test";
import assert from "node:assert/strict";
import { createGame, prepareLesson, teach, reviewHomework, playerStudents } from "../js/domain/simulation.js";

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
