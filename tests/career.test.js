import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createGame, skipToNextSchoolYear, playerStudents } from "../js/domain/simulation.js";
import { provincialLines } from "../js/domain/jiangxi.js";
import {
  playerCareerLine, playerCareerStatus, playerCareerBrief, officialLogCount,
  INTERN_ROLE, OFFICIAL_ROLE, OFFICIAL_LOG_TEXT,
} from "../js/domain/career.js";

test("默认种子第一次升学/下一学年时恰好转正一次，职务与日志一致", () => {
  const g = createGame(20170901);
  assert.equal(g.player.official, false);
  assert.equal(g.player.role, INTERN_ROLE);
  assert.equal(playerCareerLine(g.player), INTERN_ROLE);
  assert.match(playerCareerStatus(g.player), /实习教师/);
  assert.match(playerCareerBrief(g.player), /实习教师/);
  assert.equal(officialLogCount(g), 0);
  const r = skipToNextSchoolYear(g);
  assert.equal(r.ok, true);
  assert.equal(g.date, "2018-09-01");
  assert.equal(r.becameOfficial, true);
  assert.match(r.message, new RegExp(OFFICIAL_LOG_TEXT.replace(/[。]/g, "。")));
  assert.match(r.message, /2018学年开学/);
  assert.equal(g.player.official, true);
  assert.equal(g.player.role, OFFICIAL_ROLE);
  assert.equal(g.player.officialSince, "2018-08-20");
  assert.equal(playerCareerLine(g.player), `${OFFICIAL_ROLE}（已转正）`);
  assert.match(playerCareerStatus(g.player), /已转正/);
  assert.match(playerCareerBrief(g.player), /正式数学教师/);
  assert.equal(officialLogCount(g), 1);
  assert.equal(g.officialNotice?.text, OFFICIAL_LOG_TEXT);
  assert.ok(!g.officialNotice?.dismissed);

  const r2 = skipToNextSchoolYear(g);
  assert.equal(r2.ok, true);
  assert.equal(g.date, "2019-09-01");
  assert.equal(r2.becameOfficial, false);
  assert.ok(!String(r2.message || "").includes(OFFICIAL_LOG_TEXT));
  assert.equal(g.player.official, true);
  assert.equal(g.player.role, OFFICIAL_ROLE);
  assert.equal(officialLogCount(g), 1);
});

test("任职说明函数不改写卓行能力均值，也不改写公开省控", () => {
  const g = createGame(20170901);
  const cls = playerStudents(g);
  const mean = cls.reduce((n, s) => n + (s.ability.math || 0), 0) / cls.length;
  const snap = cls.map((s) => s.ability.math);
  playerCareerLine(g.player);
  playerCareerStatus(g.player);
  playerCareerBrief(g.player);
  officialLogCount(g);
  assert.deepEqual(playerStudents(g).map((s) => s.ability.math), snap);
  const mean2 = playerStudents(g).reduce((n, s) => n + (s.ability.math || 0), 0) / cls.length;
  assert.equal(mean2, mean);
  assert.equal(provincialLines(2020, "li").first, 535);
  assert.equal(provincialLines(2018, "li").first, 527);
});

test("设置页与顶栏有任职说明和转正提示位", () => {
  const app = readFileSync(new URL("../js/ui/app.js", import.meta.url), "utf8");
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(app, /playerCareerBrief/);
  assert.match(app, /任职说明/);
  assert.match(app, /OFFICIAL_LOG_TEXT|实习期满，你转正为正式数学教师/);
  assert.match(app, /official-notice/);
  assert.match(html, /id="careerline"/);
  assert.match(html, /id="official-notice"/);
});
