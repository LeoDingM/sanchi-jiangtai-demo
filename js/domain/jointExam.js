/**
 * 市联考 / 省联考的模拟考生池、划线与位次。
 * 分数线由当次模拟池实考分和位次算出，不手写；也不把模拟池伪装成
 * 江西省教育考试院正式公布的联考一分一段。
 */
import { JX_DATA } from "../data/jiangxi2020.js?v=t46u1";
import { clamp } from "./prng.js?v=t46u1";

const PIVOT = Math.round(0.62 * 750); // 与 scores.js 难度平移支点一致

/** 2020 一分一段在公开省控处的累计位次（理工 535/463，文史 547/488）。 */
const PROV_2020 = {
  li: { n: 206921, firstN: 43925, secondN: 103722, first: 535, second: 463 },
  wen: { n: 174366, firstN: 10974, secondN: 42296, first: 547, second: 488 },
};

/**
 * 地域规模（对标公开高考报名/统考与宁都上线量级，不是官方联考报名册）。
 * 市：赣州市 2020-07-02 新闻发布会，中国江西网 2020-07-03：报名 105435，
 *     高职单招 18129，实际参加统一高考 87306。
 * 县：宁都县 2019 年统计公报普通高中毕业生 5830 人；2020 年县政府工作报告
 *     一本上线 864、二本以上 2642。县考生总量取约 7200（毕业生加适量复读的模拟规模）。
 *     县一本/二本位次按该公开上线人数、再按省一分一段文理结构分摊。
 */
const CITY_N = 87306;
const COUNTY_N = 7200;
const COUNTY_FIRST = 864;
const COUNTY_SECOND = 2642;

const PROV_N = PROV_2020.li.n + PROV_2020.wen.n;
const CITY_LI_N = Math.round(CITY_N * PROV_2020.li.n / PROV_N);
const CITY_WEN_N = CITY_N - CITY_LI_N;
const COUNTY_LI_N = Math.round(COUNTY_N * PROV_2020.li.n / PROV_N);
const COUNTY_WEN_N = COUNTY_N - COUNTY_LI_N;
const PROV_FIRST_SUM = PROV_2020.li.firstN + PROV_2020.wen.firstN;
const PROV_SECOND_SUM = PROV_2020.li.secondN + PROV_2020.wen.secondN;

export const JOINT_POOL_META = {
  province: {
    li: { ...PROV_2020.li },
    wen: { ...PROV_2020.wen },
    source: "2020 年江西省教育考试院理工/文史一分一段累计人数，一本/二本对应公开省控分的位次。",
  },
  city: {
    n: CITY_N,
    li: {
      n: CITY_LI_N,
      firstN: Math.round(CITY_LI_N * PROV_2020.li.firstN / PROV_2020.li.n),
      secondN: Math.round(CITY_LI_N * PROV_2020.li.secondN / PROV_2020.li.n),
    },
    wen: {
      n: CITY_WEN_N,
      firstN: Math.round(CITY_WEN_N * PROV_2020.wen.firstN / PROV_2020.wen.n),
      secondN: Math.round(CITY_WEN_N * PROV_2020.wen.secondN / PROV_2020.wen.n),
    },
    source: "赣州市 2020 年实际参加统一高考 87306 人（市新闻发布会，中国江西网 2020-07-03）；文理人数与一本/二本位次按全省一分一段结构分摊，非正式公布的市联考报名或市线。",
    regionShift: -2,
  },
  county: {
    n: COUNTY_N,
    li: {
      n: COUNTY_LI_N,
      firstN: Math.round(COUNTY_FIRST * PROV_2020.li.firstN / PROV_FIRST_SUM),
      secondN: Math.round(COUNTY_SECOND * PROV_2020.li.secondN / PROV_SECOND_SUM),
    },
    wen: {
      n: COUNTY_WEN_N,
      firstN: COUNTY_FIRST - Math.round(COUNTY_FIRST * PROV_2020.li.firstN / PROV_FIRST_SUM),
      secondN: COUNTY_SECOND - Math.round(COUNTY_SECOND * PROV_2020.li.secondN / PROV_SECOND_SUM),
    },
    source: "县规模对标宁都县公开生态：2019 年统计公报普通高中毕业生 5830 人，2020 年县政府工作报告一本 864、二本以上 2642；考生总量按约 7200 的模拟规模，位次按该上线人数及全省文理结构分摊，非正式全县统考报名公布。",
    regionShift: -3,
  },
  regionShiftNote: "赣南市外部考生池相对全省一分一段形态作小幅下移（市 -2 分）。县外部池按公开县上线人数把一本以上、二本和线下三档缩放到插入本校后第 N 名仍贴近当次变换后的省控形态——因为宁川中学在模拟县内占比高，若不做这步，县线会被本校高分段顶高，分差也会偏离公开省控量级。本校当次实考分不平移，直接进入各层池。",
};

export const JOINT_SOURCE_NOTE = "按公开高考规模模拟的联考位次/划线，不是当年官方联考一分一段，也不是江西省教育考试院正式公布的联考分数线。分数线由本场模拟考生池的实考分和位次计算，并对标 2020 年一分一段在省控附近的位次量级；分差随本场难度波动，形态来自 2016–2020 江西公开高考。市规模对标赣州 2020 年统考 87306 人，县规模对标宁都公开毕业生与上线人数。";

function freqFromTable(table) {
  const cum = new Uint32Array(752);
  let j = 0;
  let lastCum = 0;
  for (let s = 750; s >= 0; s--) {
    if (j < table.length && table[j][0] === s) {
      lastCum = table[j][1];
      j++;
    }
    cum[s] = lastCum;
  }
  const freq = new Uint32Array(751);
  for (let s = 0; s <= 750; s++) freq[s] = cum[s] - (s < 750 ? cum[s + 1] : 0);
  return { freq, n: cum[0] };
}

const BASE_FREQ = {
  li: freqFromTable(JX_DATA.rankLi),
  wen: freqFromTable(JX_DATA.rankWen),
};

export function transformOfficialScore(score, difficulty = 1, dispersion = 1) {
  const y = PIVOT + (score - PIVOT) * dispersion + (difficulty - 1) * PIVOT;
  return clamp(Math.round(y), 0, 750);
}

function transformFreq(freq, difficulty, dispersion) {
  const out = new Uint32Array(751);
  for (let s = 0; s <= 750; s++) {
    if (!freq[s]) continue;
    out[transformOfficialScore(s, difficulty, dispersion)] += freq[s];
  }
  return out;
}

function scaleFreq(freq, targetN) {
  const out = new Uint32Array(751);
  if (targetN <= 0) return out;
  let n0 = 0;
  for (let s = 0; s <= 750; s++) n0 += freq[s];
  if (!n0) return out;
  const frac = [];
  let acc = 0;
  for (let s = 0; s <= 750; s++) {
    const v = freq[s] * targetN / n0;
    const f = Math.floor(v);
    out[s] = f;
    acc += f;
    frac.push({ s, rem: v - f });
  }
  frac.sort((a, b) => b.rem - a.rem || b.s - a.s);
  let left = targetN - acc;
  for (let i = 0; i < frac.length && left > 0; i++) {
    out[frac[i].s]++;
    left--;
  }
  return out;
}

function shiftFreq(freq, delta) {
  const out = new Uint32Array(751);
  for (let s = 0; s <= 750; s++) {
    if (!freq[s]) continue;
    out[clamp(s + delta, 0, 750)] += freq[s];
  }
  return out;
}

function addSchoolScores(freq, scores) {
  const out = freq.slice();
  for (const s of scores) out[clamp(Math.round(s), 0, 750)]++;
  return out;
}

function cumFromFreq(freq) {
  const cum = new Uint32Array(752);
  let c = 0;
  for (let s = 750; s >= 0; s--) {
    c += freq[s];
    cum[s] = c;
  }
  return cum;
}

function lineAtRank(freq, nth) {
  if (nth < 1) return 0;
  let c = 0;
  for (let s = 750; s >= 0; s--) {
    c += freq[s];
    if (c >= nth) return s;
  }
  return 0;
}

function rankOf(cum, score) {
  const s = clamp(Math.round(score), 0, 750);
  return cum[s] || 0; // 一分一段习惯：不低于该分的累计人数
}

function regionSize(baseN, schoolN) {
  return Math.max(baseN, schoolN + Math.max(80, Math.round(schoolN * 0.35)));
}

function packCut(freq, firstN, secondN, track, scope, source) {
  const n = cumFromFreq(freq)[0];
  const fN = clamp(firstN, 1, Math.max(1, n));
  const sN = clamp(secondN, fN, Math.max(1, n));
  const firstLine = lineAtRank(freq, fN);
  const secondLine = lineAtRank(freq, sN);
  return {
    scope,
    track,
    n,
    firstN: fN,
    secondN: sN,
    firstLine,
    secondLine,
    gap: firstLine - secondLine,
    source,
  };
}

function baseTransformed(track, difficulty, dispersion) {
  return transformFreq(BASE_FREQ[track].freq, difficulty, dispersion);
}

function bandSum(freq, lo, hi) {
  let n = 0;
  const a = Math.max(0, lo);
  const b = Math.min(750, hi);
  for (let s = a; s <= b; s++) n += freq[s];
  return n;
}

/** 把外部考生池按「一本以上 / 一本线下到二本 / 二本以下」三档缩放到目标人数，使插入本校后第 N 名仍贴近公开省控形态。 */
function reshapeExternal(freq, schoolScores, firstN, secondN, L1, L2) {
  const total = bandSum(freq, 0, 750);
  if (total <= 0) return freq;
  const hiL = Math.max(L1, L2);
  const loL = Math.min(L1, L2);
  let schoolHi = 0, schoolMid = 0;
  for (const raw of schoolScores) {
    const s = Math.round(raw);
    if (s >= hiL) schoolHi++;
    else if (s >= loL) schoolMid++;
  }
  const wantHi = Math.max(0, firstN - schoolHi);
  const wantMid = Math.max(0, secondN - firstN - schoolMid);
  const wantLo = Math.max(0, total - wantHi - wantMid);
  const srcHi = scaleFreq(sliceFreq(freq, hiL, 750), wantHi);
  const srcMid = scaleFreq(sliceFreq(freq, loL, hiL - 1), wantMid);
  const srcLo = scaleFreq(sliceFreq(freq, 0, loL - 1), wantLo);
  const out = new Uint32Array(751);
  for (let s = 0; s <= 750; s++) out[s] = srcHi[s] + srcMid[s] + srcLo[s];
  return out;
}

function sliceFreq(freq, lo, hi) {
  const out = new Uint32Array(751);
  const a = Math.max(0, lo);
  const b = Math.min(750, hi);
  for (let s = a; s <= b; s++) out[s] = freq[s];
  return out;
}

function buildLayer(track, difficulty, dispersion, schoolScores, meta, { shift = 0, reshape = false, targetFirst = null, targetSecond = null } = {}) {
  const schoolN = schoolScores.length;
  const n = regionSize(meta.n, schoolN);
  const external = Math.max(0, n - schoolN);
  const firstN = Math.min(meta.firstN, n);
  const secondN = Math.min(Math.max(meta.secondN, firstN), n);
  const base = baseTransformed(track, difficulty, dispersion);
  let ext = shiftFreq(scaleFreq(base, external), shift);
  if (reshape && targetFirst != null && targetSecond != null) {
    ext = reshapeExternal(ext, schoolScores, firstN, secondN, targetFirst, targetSecond);
  }
  const freq = addSchoolScores(ext, schoolScores);
  const cut = packCut(freq, firstN, secondN, track, meta.scope, meta.source);
  if (shift) cut.regionShift = shift;
  if (reshape) cut.reshaped = true;
  return { freq, cum: cumFromFreq(freq), cut };
}

/**
 * 为市联考/省联考的本校考生写入市/县（及省）位次，并返回各层划线。
 * 校内线仍由 examService 按上一届高考省控实际人数单独计算，不用来冒充市线或省线。
 */
export function attachJointExam(rows, exam) {
  const kind = exam.examKind;
  if (kind !== "city" && kind !== "province") return null;
  const difficulty = exam.difficulty ?? 1;
  const dispersion = exam.dispersion ?? 1;
  const byTrack = { li: [], wen: [] };
  for (const r of rows) {
    const tr = r.track === "wen" ? "wen" : "li";
    byTrack[tr].push(r);
  }
  const joint = {
    kind,
    sourceNote: JOINT_SOURCE_NOTE,
    meta: JOINT_POOL_META,
    province: {},
    city: {},
    county: {},
  };

  for (const track of ["li", "wen"]) {
    const schoolScores = byTrack[track].map((r) => r.total);
    const cityMeta = { ...JOINT_POOL_META.city[track], scope: "city", source: JOINT_POOL_META.city.source };
    const countyMeta = { ...JOINT_POOL_META.county[track], scope: "county", source: JOINT_POOL_META.county.source };
    const official = PROV_2020[track];
    const targetFirst = transformOfficialScore(official.first, difficulty, dispersion);
    const targetSecond = transformOfficialScore(official.second, difficulty, dispersion);
    let prov = null;
    if (kind === "province") {
      const provMeta = { ...JOINT_POOL_META.province[track], scope: "province", source: JOINT_POOL_META.province.source };
      prov = buildLayer(track, difficulty, dispersion, schoolScores, provMeta, { shift: 0 });
      joint.province[track] = prov.cut;
    }
    const city = buildLayer(track, difficulty, dispersion, schoolScores, cityMeta, { shift: JOINT_POOL_META.city.regionShift });
    const county = buildLayer(track, difficulty, dispersion, schoolScores, countyMeta, {
      shift: JOINT_POOL_META.county.regionShift,
      reshape: true,
      targetFirst,
      targetSecond,
    });
    joint.city[track] = city.cut;
    joint.county[track] = county.cut;
    for (const r of byTrack[track]) {
      r.cityRank = rankOf(city.cum, r.total);
      r.countyRank = rankOf(county.cum, r.total);
      r.cityN = city.cut.n;
      r.countyN = county.cut.n;
      r.jointLine = {
        city: r.total >= city.cut.firstLine ? "一本" : r.total >= city.cut.secondLine ? "二本" : "未达二本",
        county: r.total >= county.cut.firstLine ? "一本" : r.total >= county.cut.secondLine ? "二本" : "未达二本",
      };
      if (prov) {
        r.provinceRank = rankOf(prov.cum, r.total);
        r.provinceN = prov.cut.n;
        r.jointLine.province = r.total >= prov.cut.firstLine ? "一本" : r.total >= prov.cut.secondLine ? "二本" : "未达二本";
      }
    }
  }
  return joint;
}

export function isJointExamKind(kind) {
  return kind === "city" || kind === "province";
}
