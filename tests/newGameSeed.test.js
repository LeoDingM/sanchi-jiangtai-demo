import test from "node:test";
import assert from "node:assert/strict";
import { createGame, freshGameSeed, parseGameSeed } from "../js/domain/simulation.js";

test("freshGameSeed 每次开档给出不同的世界编号", () => {
  const seen = new Set(Array.from({ length: 24 }, () => freshGameSeed()));
  assert.ok(seen.size >= 22, `随机种子应几乎不重复，实际 ${[...seen].join(",")}`);
  for (const s of seen) {
    assert.ok(Number.isInteger(s) && s > 0 && s <= 0xffffffff, `非法种子 ${s}`);
    assert.notEqual(s, 20170901);
  }
});

test("parseGameSeed 只接受合法正整数", () => {
  assert.equal(parseGameSeed(""), null);
  assert.equal(parseGameSeed("   "), null);
  assert.equal(parseGameSeed("abc"), null);
  assert.equal(parseGameSeed("0"), null);
  assert.equal(parseGameSeed("-3"), null);
  assert.equal(parseGameSeed(" 20170901 "), 20170901);
  assert.equal(parseGameSeed("42"), 42);
});

test("同一世界编号生成相同名单，不同编号名单不同", () => {
  const a = createGame(42, "林知秋");
  const b = createGame(42, "林知秋");
  const c = createGame(99, "林知秋");
  const names = (g) => (g.cohorts[2017].students || []).map((s) => `${s.name}:${s.classNo}`).join(",");
  assert.equal(a.seed, 42);
  assert.equal(names(a), names(b));
  assert.notEqual(names(a), names(c));
});
