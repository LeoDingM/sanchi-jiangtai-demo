import test from "node:test";
import assert from "node:assert/strict";
import { createGame, skipToNextStage, playerStudents, teach } from "../js/domain/simulation.js";
import { toJSON, fromJSON } from "../js/domain/save.js";
import { CLASS_BLUEPRINT, PLAYER_CLASS_NO } from "../js/domain/config.js";

const PLAYER_CLASS_SIZE = CLASS_BLUEPRINT.find((c) => c.no === PLAYER_CLASS_NO).size;

test("存档读档往返后日期、学生和后续考试仍一致", () => {
  const a = createGame(20170901, "林知秋");
  teach(a, "精讲例题");
  skipToNextStage(a);
  const json = toJSON(a);
  const b = fromJSON(json);
  assert.equal(b.date, a.date);
  assert.equal(playerStudents(b).length, PLAYER_CLASS_SIZE);
  assert.equal(PLAYER_CLASS_SIZE, 74);
  assert.equal(playerStudents(b)[0].name, playerStudents(a)[0].name);
  assert.equal(Object.keys(b.exams).length, Object.keys(a.exams).length);
  const key = Object.keys(a.exams)[0];
  const sa = a.exams[key].rows[0];
  const sb = b.exams[key].rows[0];
  assert.equal(sb.total, sa.total);
});
