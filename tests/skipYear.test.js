import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createGame, skipToNextStage, skipToGaokaoOf, skipToNextCohort, skipToNextSchoolYear,
  skipToNextSchoolYearAsync, planSkipToNextSchoolYear, gradeOf, describePlayerStage,
} from "../js/domain/simulation.js";

test("默认种子从 2017 年 9 月高一开局，下一学年停在高二开学且二次分班已做完", () => {
  const g = createGame(20170901);
  assert.equal(g.date, "2017-09-01");
  assert.equal(g.player.cohortYear, 2017);
  assert.equal(gradeOf(g.player.cohortYear, g.date), 1);

  const r = skipToNextSchoolYear(g);
  assert.equal(r.ok, true);
  assert.equal(g.date, "2018-09-01");
  assert.equal(r.event?.name, "2018学年开学");
  assert.equal(r.event?.date, "2018-09-01");
  assert.equal(gradeOf(g.player.cohortYear, g.date), 2);
  assert.match(r.message, /2018学年开学/);
  assert.match(describePlayerStage(g), /高二上/);
  assert.equal(g.player.cohortYear, 2017);
  const c = g.cohorts[2017];
  assert.equal(!!c.trackSplit, true, "第一次分班应已结算");
  assert.equal(!!c.placed2, true, "第二次分班应已结算");
  assert.equal(!!g.flags["place1-2017"] || !!c.placed1, true);
  assert.equal(!!g.flags["place2-2017"] || !!c.placed2, true);
  assert.ok(!/第一次月考/.test(r.event?.name || ""), "不应飞到该学年第一次月考");
});

test("再按一次到高三开学；高三时再按不应升到高四或误跳到下一届", () => {
  const g = createGame(20170901);
  const a = skipToNextSchoolYear(g);
  assert.equal(a.ok, true);
  assert.equal(g.date, "2018-09-01");
  assert.equal(gradeOf(g.player.cohortYear, g.date), 2);

  const b = skipToNextSchoolYear(g);
  assert.equal(b.ok, true);
  assert.equal(g.date, "2019-09-01");
  assert.equal(b.event?.name, "2019学年开学");
  assert.equal(gradeOf(g.player.cohortYear, g.date), 3);
  assert.match(describePlayerStage(g), /高三上/);
  assert.equal(g.player.cohortYear, 2017);
  assert.ok(!g.cohorts[2020] || g.player.cohortYear !== 2020);

  const before = { date: g.date, cohort: g.player.cohortYear, schoolYear: g.schoolYear };
  const plan = planSkipToNextSchoolYear(g);
  assert.equal(plan.ok, false);
  assert.match(plan.reason, /已经是高三/);
  assert.match(plan.reason, /跳到本届高考录取/);
  const c = skipToNextSchoolYear(g);
  assert.equal(c.ok, false);
  assert.match(c.reason, /已经是高三/);
  assert.equal(g.date, before.date);
  assert.equal(g.player.cohortYear, before.cohort);
  assert.equal(gradeOf(g.player.cohortYear, g.date), 3);
  assert.ok(g.player.cohortYear !== 2020);
  assert.ok(!Object.keys(g.admissions || {}).some((k) => k.startsWith("2017|")) || g.date === "2019-09-01");
});

test("下一学年不会改掉 skipToNextStage / 跳到高考录取 / 再进下一届 的既有语义", () => {
  const a = createGame(20170901);
  const ev = skipToNextStage(a);
  assert.equal(ev.ok, true);
  assert.ok(a.date > "2017-09-01");
  assert.ok(a.date < "2018-09-01", "单步下一阶段不应直接跳到下一学年开学");
  assert.equal(gradeOf(a.player.cohortYear, a.date), 1);

  const b = createGame(20170901);
  skipToGaokaoOf(b, 2017);
  assert.ok(b.admissions["2017|2020"]);
  assert.equal(b.player.cohortYear, 2017);

  const beforeYear = b.schoolYear;
  skipToNextCohort(b);
  assert.ok(b.schoolYear > beforeYear);
  assert.equal(b.player.cohortYear, 2020);
  assert.ok(b.cohorts["2020"]);
});

test("异步下一学年同样停在开学日，并可在各步之间让出", async () => {
  const g = createGame(20170901);
  let yields = 0;
  const r = await skipToNextSchoolYearAsync(g, {
    yieldFn: async () => { yields += 1; },
    onProgress: () => {},
  });
  assert.equal(r.ok, true);
  assert.equal(g.date, "2018-09-01");
  assert.equal(gradeOf(g.player.cohortYear, g.date), 2);
  assert.ok(yields >= 1, "应在各次 skipToNextStage 之间让出");
  assert.ok(!!g.cohorts[2017].placed2);
});

test("自动模式与顶栏应有下一学年按钮，且不把下一届入学改名", () => {
  const app = readFileSync(new URL("../js/ui/app.js", import.meta.url), "utf8");
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /下一学年/);
  assert.match(app, /下一学年/);
  assert.match(app, /skipToNextSchoolYearAsync|skipToNextSchoolYear/);
  assert.match(app, /再推进到下一届入学/);
  assert.doesNotMatch(app, /id="n3">下一学年/);
  assert.match(app, /showLoading\(/);
});
