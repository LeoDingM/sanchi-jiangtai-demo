import test from "node:test";
import assert from "node:assert/strict";
import { provincialRank, provincialLines, officialRankTableTop, extrapolateRankAboveOfficial } from "../js/domain/jiangxi.js";
import { JX_DATA } from "../js/data/jiangxi2020.js";

test("2020 理工一分一段：695 与 750 封顶行不再把更高分全部记成 11", () => {
  const top = officialRankTableTop(JX_DATA.rankLi);
  assert.equal(top.score, 695);
  assert.equal(top.rank, 11);
  assert.equal(provincialRank(695, "li", 2020), 11);
  assert.equal(provincialRank(694, "li", 2020), 17);
  const r710 = provincialRank(710, "li", 2020);
  const r696 = provincialRank(696, "li", 2020);
  assert.notEqual(r710, r696, "710 与 696 不得同位次");
  assert.ok(r710 < r696, `710 应更靠前，实际 ${r710} vs ${r696}`);
  assert.ok(r696 < 11, `696 应优于官方 695 的 11 名，实际 ${r696}`);
  assert.equal(provincialRank(695, "li", 2020), provincialRank(695, "li", 2020));
});

test("2018 按省控平移后，710 与 696 位次仍须拉开且 710 更靠前", () => {
  const r710 = provincialRank(710, "li", 2018);
  const r696 = provincialRank(696, "li", 2018);
  assert.notEqual(r710, r696);
  assert.ok(r710 < r696, `2018 年 710 应更靠前，实际 ${r710} vs ${r696}`);
  const r709 = provincialRank(709, "li", 2018);
  const r710b = provincialRank(710, "li", 2018);
  assert.ok(r710b <= r709, "更高分不得更靠后");
});

test("同分可并列，位次随分数单调，不改官方省控数字", () => {
  assert.equal(provincialLines(2018, "li").first, 527);
  assert.equal(provincialLines(2020, "li").first, 535);
  const scores = [];
  for (let s = 680; s <= 720; s++) scores.push(s);
  for (const year of [2018, 2020]) {
    const ranks = scores.map((s) => provincialRank(s, "li", year));
    for (let i = 1; i < scores.length; i++) {
      assert.ok(ranks[i] <= ranks[i - 1], `${year} ${scores[i]} 的位次 ${ranks[i]} 不应差于更低的 ${scores[i - 1]}（${ranks[i - 1]}）`);
    }
    assert.equal(provincialRank(700, "li", year), provincialRank(700, "li", year));
  }
  const a = extrapolateRankAboveOfficial(700, 695, 11);
  const b = extrapolateRankAboveOfficial(700, 695, 11);
  assert.equal(a, b);
});

test("文史表最高实际分以上同样拉开，不把所有更高分记成同一名次", () => {
  const top = officialRankTableTop(JX_DATA.rankWen);
  assert.equal(top.score, 651);
  const r660 = provincialRank(660, "wen", 2020);
  const r651 = provincialRank(651, "wen", 2020);
  assert.equal(r651, 10);
  assert.ok(r660 < r651, `660 应优于 651 的 10 名，实际 ${r660}`);
});
