/** 江西公开分数线与一分一段查询。 */
import { JX_DATA } from "../data/jiangxi2020.js";

export const PROVINCIAL = JX_DATA.provincial;
export const JX_SOURCE_NOTES = JX_DATA.sourceNotes;

export function provincialLines(year, track) {
  const y = PROVINCIAL[year] || PROVINCIAL[2020];
  return y[track];
}

/** 用 2020 一分一段查位次；其他年份先按一本线分差平移到 2020 分。 */
export function provincialRank(score, track, year = 2020) {
  const table = track === "wen" ? JX_DATA.rankWen : JX_DATA.rankLi;
  let s = Math.round(Number(score));
  if (year !== 2020) {
    const src = provincialLines(year, track);
    const base = provincialLines(2020, track);
    s = Math.round(s - (src.first - base.first));
  }
  let last = table[table.length - 1][1];
  for (const [pt, cum] of table) {
    if (pt <= s) return cum;
    last = cum;
  }
  return last;
}

export function universities() {
  return JX_DATA.universities;
}

export const QINGBEI = new Set(["清华大学", "北京大学", "北京大学医学部"]);

export const UNI_985 = new Set([
  "清华大学","北京大学","北京大学医学部","复旦大学","复旦大学医学院","上海交通大学","上海交通大学医学院",
  "浙江大学","中国科学技术大学","南京大学","中国人民大学","南开大学","哈尔滨工业大学","哈尔滨工业大学(深圳)",
  "哈尔滨工业大学(威海)","西安交通大学","北京航空航天大学","北京理工大学","西北工业大学","天津大学",
  "东南大学","武汉大学","华中科技大学","中山大学","华南理工大学","四川大学","电子科技大学","重庆大学",
  "吉林大学","山东大学","山东大学威海分校","厦门大学","湖南大学","中南大学","大连理工大学","大连理工大学(盘锦校区)",
  "北京师范大学","北京师范大学(珠海校区)","同济大学","华东师范大学","中国农业大学","中国海洋大学",
  "兰州大学","东北大学","东北大学秦皇岛分校","西北农林科技大学","中央民族大学","国防科技大学"
]);

export const UNI_211 = new Set([
  ...UNI_985,
  "北京邮电大学","北京交通大学","北京科技大学","北京化工大学","北京工业大学","华北电力大学(北京)","华北电力大学(保定)",
  "中国地质大学(武汉)","中国地质大学(北京)","中国石油大学(北京)","中国矿业大学","中国矿业大学(北京)",
  "河海大学","南京航空航天大学","南京理工大学","南京师范大学","南京农业大学","苏州大学","合肥工业大学",
  "华东理工大学","东华大学","上海大学","上海财经大学","中央财经大学","对外经济贸易大学","中南财经政法大学",
  "西南财经大学","西安电子科技大学","长安大学","西北大学","陕西师范大学","武汉理工大学","华中师范大学",
  "华中农业大学","中南民族大学","湖南师范大学","暨南大学","华南师范大学","深圳大学",
  "西南大学","西南交通大学","四川农业大学","电子科技大学(沙河校区)","云南大学","广西大学","贵州大学",
  "海南大学","新疆大学","石河子大学","宁夏大学","青海大学","西藏大学","内蒙古大学","延边大学",
  "郑州大学","南昌大学","安徽大学","福州大学","太原理工大学","河北工业大学","辽宁大学",
  "东北师范大学","哈尔滨工程大学","江南大学","中国传媒大学","北京外国语大学","上海外国语大学",
  "中央音乐学院","北京体育大学","中国政法大学","华北电力大学"
]);

export function uniTier(name) {
  const base = name.replace(/[（(].*$/, "");
  if (QINGBEI.has(name) || QINGBEI.has(base)) return "qingbei";
  if (UNI_985.has(name) || UNI_985.has(base)) return "u985";
  if (UNI_211.has(name) || UNI_211.has(base)) return "u211";
  return "other";
}

export function gapOfficial(year, track) {
  const L = provincialLines(year, track);
  return L.first - L.second;
}
