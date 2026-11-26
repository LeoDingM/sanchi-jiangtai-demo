import test from "node:test";
import assert from "node:assert/strict";
import { createGame, skipToGaokaoOf, skipToNextStage, playerStudents } from "../js/domain/simulation.js";
import { CLASS_BLUEPRINT, PLAYER_CLASS_NO } from "../js/domain/config.js";

const PLAYER_CLASS_SIZE = CLASS_BLUEPRINT.find((c) => c.no === PLAYER_CLASS_NO).size;

test("可从 2017 年 9 月自动推进到 2017 级高考录取，再升入下一届", async () => {
  const g = createGame(20170901);
  assert.equal(g.date, "2017-09-01");
  assert.equal(playerStudents(g).length, PLAYER_CLASS_SIZE);
  assert.equal(PLAYER_CLASS_SIZE, 74);
  assert.equal(g.player.classNo, 16);
  skipToGaokaoOf(g, 2017);
  assert.ok(g.admissions["2017|2020"], "应有 2020 年对 2017 级的录取");
  assert.ok(g.flags["place1-2017"], "应完成第一次分班");
  const adm = g.admissions["2017|2020"];
  assert.ok(adm.results.length > 1000);
  const first = adm.results.filter((x) => x.batch === "一批").length;
  const second = adm.results.filter((x) => x.batch === "一批" || x.batch === "二批").length;
  assert.ok(first >= 350 && first <= 900, `一批人数 ${first} 应接近赣南重点中学量级`);
  assert.ok(second >= 1000, `二本累计 ${second}`);
  const before = g.player.cohortYear;
  // 再跳升学
  let guard = 0;
  while (g.player.cohortYear === before && guard++ < 8) skipToNextStage(g);
  assert.ok(g.player.cohortYear !== before || Object.keys(g.cohorts).includes("2020") || g.alumni.length > 0);
  // 毕业后应仍有在校学生
  const years = Object.keys(g.cohorts);
  assert.ok(years.length >= 2, `升学后仍应有多个年级，实际 ${years}`);
  assert.ok(playerStudents(g).length >= 60);
  assert.ok(g.alumni.length > 100);
  assert.ok(g.player.official);
});
