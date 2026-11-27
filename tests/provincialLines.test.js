import test from "node:test";
import assert from "node:assert/strict";
import {
  provincialLines, officialProvincialPack, isOfficialProvincialYear,
  gaokaoScheme, simulateProvincialYear, LATEST_OFFICIAL_PROVINCIAL_YEAR,
  provincialFirstLabel, provincialSecondLabel, provincialEnrollmentBatch,
  PROVINCIAL, OFFICIAL_PROVINCIAL_AFTER_2020,
} from "../js/domain/jiangxi.js";
import { describeOfficialProvincialLines } from "../js/domain/schoolLines.js";

const LOCKED = {
  2016: { wen: { first: 523, second: 450, special: 150 }, li: { first: 529, second: 445, special: 150 } },
  2017: { wen: { first: 533, second: 458, special: 150 }, li: { first: 503, second: 422, special: 150 } },
  2018: { wen: { first: 568, second: 496, special: 160 }, li: { first: 527, second: 447, special: 160 } },
  2019: { wen: { first: 558, second: 502, special: 160 }, li: { first: 522, second: 449, special: 160 } },
  2020: { wen: { first: 547, second: 488, special: 150 }, li: { first: 535, second: 463, special: 150 } },
};

const OFFICIAL_LATER = {
  2021: { scheme: "wenli-batches", wen: { first: 559, second: 496, special: 150 }, li: { first: 519, second: 443, special: 150 } },
  2022: { scheme: "wenli-batches", wen: { first: 529, second: 472, special: 150 }, li: { first: 509, second: 440, special: 150 } },
  2023: { scheme: "wenli-batches", wen: { first: 533, second: 472, special: 200 }, li: { first: 518, second: 445, special: 200 } },
  2024: { scheme: "new-3+1+2", wen: { first: 532, second: 463, special: 270 }, li: { first: 520, second: 448, special: 240 } },
  2025: { scheme: "new-3+1+2", wen: { first: 539, second: 486, special: 290 }, li: { first: 505, second: 429, special: 240 } },
  2026: { scheme: "new-3+1+2", wen: { first: 535, second: 479, special: 220 }, li: { first: 505, second: 412, special: 200 } },
};

test("2016–2020 官方省控数字锁定，PROVINCIAL 仍只有这些年", () => {
  assert.deepEqual(Object.keys(PROVINCIAL).sort(), ["2016", "2017", "2018", "2019", "2020"]);
  for (const [year, t] of Object.entries(LOCKED)) {
    const y = Number(year);
    for (const track of ["wen", "li"]) {
      const got = provincialLines(y, track);
      assert.equal(got.first, t[track].first, `${y} ${track} first`);
      assert.equal(got.second, t[track].second, `${y} ${track} second`);
      assert.equal(got.special, t[track].special, `${y} ${track} special`);
      assert.equal(got, PROVINCIAL[y][track], "2016–2020 应返回原对象，避免改写锁定表");
    }
    const pack = officialProvincialPack(y);
    assert.equal(pack.year, y);
    assert.equal(pack.official, true);
    assert.equal(pack.simulated, false);
    assert.equal(pack.scheme, "wenli-batches");
    assert.equal(pack.li.first, t.li.first);
    assert.equal(pack.wen.second, t.wen.second);
  }
});

test("2021–2026 用已查到的官方省控，不再套用 2020 线，口径按批次改革区分", () => {
  for (const [year, t] of Object.entries(OFFICIAL_LATER)) {
    const y = Number(year);
    assert.equal(isOfficialProvincialYear(y), true);
    assert.equal(gaokaoScheme(y), t.scheme);
    for (const track of ["wen", "li"]) {
      const got = provincialLines(y, track);
      assert.equal(got.first, t[track].first, `${y} ${track} first`);
      assert.equal(got.second, t[track].second, `${y} ${track} second`);
      assert.equal(got.special, t[track].special, `${y} ${track} special`);
    }
    const pack = officialProvincialPack(y);
    assert.equal(pack.official, true);
    assert.equal(pack.simulated, false);
    assert.equal(pack.scheme, t.scheme);
    assert.equal(pack.year, y);
    assert.notEqual(pack.li.first, LOCKED[2020].li.first);
    assert.ok(pack.source && /教育考试院|教育厅/.test(pack.source), pack.source);
    const text = describeOfficialProvincialLines(y);
    assert.doesNotMatch(text, /模拟线/);
    if (t.scheme === "wenli-batches") {
      assert.match(text, /公开省控（国家线）/);
      assert.match(text, /理科一本/);
      assert.match(text, /文科一本/);
      assert.doesNotMatch(text, /特殊类型招生控制线/);
    } else {
      assert.match(text, /特殊类型招生控制线/);
      assert.match(text, /本科线/);
      assert.match(text, /物理科目组|历史科目组/);
      assert.doesNotMatch(text, /物理科目组一本|历史科目组一本|理科一本 \d|文科一本 \d/);
      assert.equal(provincialFirstLabel(y), "特殊类型招生控制线");
      assert.equal(provincialSecondLabel(y), "本科线");
      assert.equal(provincialEnrollmentBatch(y, "first"), "本科批");
      assert.equal(provincialEnrollmentBatch(y, "second"), "本科批");
    }
  }
  assert.equal(OFFICIAL_PROVINCIAL_AFTER_2020[2021].li.first, 519);
  assert.equal(LATEST_OFFICIAL_PROVINCIAL_YEAR, 2026);
});

test("缺年不再把 2020 官方线当成该年官方省控；未公布年份为可复现模拟线", () => {
  const missing = officialProvincialPack(2027);
  assert.equal(missing.year, 2027);
  assert.equal(missing.official, false);
  assert.equal(missing.simulated, true);
  assert.equal(missing.scheme, "new-3+1+2");
  assert.match(missing.sourceNote, /模拟线，非正式官方省控/);
  assert.match(describeOfficialProvincialLines(2027), /模拟线，非正式官方省控/);
  assert.notEqual(missing.li.first, provincialLines(2020, "li").first);
  assert.notEqual(missing.li.second, provincialLines(2020, "li").second);
  assert.equal(isOfficialProvincialYear(2027), false);
  assert.equal(isOfficialProvincialYear(2020), true);
});

test("模拟省控可复现，随年份和难度变化，且落在合理区间", () => {
  const a = simulateProvincialYear(2027, { seed: 7, difficulty: 1 });
  const b = simulateProvincialYear(2027, { seed: 7, difficulty: 1 });
  assert.deepEqual(a, b);
  assert.deepEqual(officialProvincialPack(2028, { seed: 11, difficulty: 1.02 }), officialProvincialPack(2028, { seed: 11, difficulty: 1.02 }));

  const y27 = officialProvincialPack(2027, { seed: 1, difficulty: 1 });
  const y28 = officialProvincialPack(2028, { seed: 1, difficulty: 1 });
  const y29 = officialProvincialPack(2029, { seed: 1, difficulty: 1 });
  const firsts = [y27, y28, y29].map((p) => `${p.li.first}/${p.li.second}/${p.wen.first}/${p.wen.second}`);
  assert.ok(new Set(firsts).size >= 2, `相邻模拟年不应几乎相同：${firsts.join("；")}`);
  assert.notDeepEqual(
    { li: y27.li.first, wen: y27.wen.first },
    { li: y28.li.first, wen: y28.wen.first },
  );

  const easy = officialProvincialPack(2027, { seed: 3, difficulty: 0.94 });
  const hard = officialProvincialPack(2027, { seed: 3, difficulty: 1.08 });
  assert.ok(easy.li.first > hard.li.first || easy.wen.first > hard.wen.first || easy.li.second > hard.li.second,
    `更难的试卷应趋向更低的模拟线：易 ${easy.li.first}/${easy.wen.first} 难 ${hard.li.first}/${hard.wen.first}`);

  for (const pack of [y27, y28, y29, easy, hard]) {
    assert.ok(pack.li.first >= 490 && pack.li.first <= 540, `物理特控 ${pack.li.first}`);
    assert.ok(pack.li.second >= 395 && pack.li.second <= 465, `物理本科 ${pack.li.second}`);
    assert.ok(pack.wen.first >= 515 && pack.wen.first <= 560, `历史特控 ${pack.wen.first}`);
    assert.ok(pack.wen.second >= 440 && pack.wen.second <= 510, `历史本科 ${pack.wen.second}`);
    assert.ok(pack.li.first - pack.li.second >= 70 && pack.li.first - pack.li.second <= 110);
    assert.ok(pack.wen.first - pack.wen.second >= 45 && pack.wen.first - pack.wen.second <= 85);
    assert.ok(pack.li.special < pack.li.second - 70);
    assert.ok(pack.wen.special < pack.wen.second - 70);
    assert.match(describeOfficialProvincialLines(pack.year, ["li", "wen"], { seed: 1, difficulty: 1 }), /模拟线，非正式官方省控/);
    assert.doesNotMatch(describeOfficialProvincialLines(pack.year), /理科一本|文科一本/);
  }
});
