/** 科目、分值、班级编制与考试规则。与《项目总控-V1.1》冲突时以总控为准。 */

export const GAME_TITLE = "三尺讲台";
export const SCHOOL_NAME = "江西省宁川中学";
export const GRADE_YEAR = 2017;
export const START_DATE = "2017-09-01";
export const PLAYER_CLASS_NO = 16;
export const PLAYER_DEFAULT_NAME = "林知秋";
export const PLAYER_ROLE = "数学实习教师";
export const MENTOR_NAME = "陈正衡";
export const HOMEROOM_NAME = "赵映秋";

/** 高一上：8 门课，总分 950，不含生物。 */
export const SUBJECTS_G1 = [
  { id: "chinese", name: "语文", max: 150 },
  { id: "math", name: "数学", max: 150 },
  { id: "english", name: "英语", max: 150 },
  { id: "physics", name: "物理", max: 100 },
  { id: "chemistry", name: "化学", max: 100 },
  { id: "geography", name: "地理", max: 100 },
  { id: "history", name: "历史", max: 100 },
  { id: "politics", name: "政治", max: 100 },
];

export const SUBJECT_IDS = SUBJECTS_G1.map((s) => s.id);
export const SUBJECT_MAX = Object.fromEntries(SUBJECTS_G1.map((s) => [s.id, s.max]));
export const G1_TOTAL = 950;
export const BIOLOGY_STARTS = "高二";

/** 高三传统高考（规则备查，MVP 不考）。 */
export const GAOKAO_LI = { chinese: 150, math: 150, english: 150, physics: 100, chemistry: 100, biology: 100, total: 750 };
export const GAOKAO_WEN = { chinese: 150, math: 150, english: 150, politics: 100, history: 100, geography: 100, total: 750 };

/** 旧全校 400/1000 分摊名额，仅作文档对照，不再用于校内划线。 */
export const CUTOFF_FIRST_RANK = 400;
export const CUTOFF_SECOND_RANK = 1000;

/** 高三校内一本/二本硬口径名次：该科类应届与补习班同一池约第 520、第 1100 名（允许小幅波动）。高一高二按 520/1696、1100/1696 折算到应届池。 */
export const SCHOOL_LINE_FIRST_RANK = 520;
export const SCHOOL_LINE_SECOND_RANK = 1100;

/**
 * 应届省控上线人数在无上一届数据时的近似量级，只作历史统计兜底，不再作为校内划线名额。
 */
export const FALLBACK_SCHOOL_QUOTA = {
  li: { firstN: 520, secondN: 1100 },
  wen: { firstN: 520, secondN: 1100 },
  mixed: { firstN: 520, secondN: 1100 },
};

/** 高三补习班：文科 31–36、理科 37–42，每班 70 人。只在 withRepeat 的高三届生成，不要在高一高二出现。 */
export const REPEAT_CLASS_SIZE = 70;
export const REPEAT_WEN_NOS = [31, 32, 33, 34, 35, 36];
export const REPEAT_LI_NOS = [37, 38, 39, 40, 41, 42];

/** 发挥失常且选择复读时，可插回本届对应班级：0 班与云岫重点（翠微）2–4 班。文科 1 班不做插班。 */
export const INSERT_REPEAT_CLASS_NOS = [0, 2, 3, 4];


export const LI_SUBJECTS = ["physics", "chemistry", "math"];
export const WEN_SUBJECTS = ["politics", "history", "geography"];

export const TIER = {
  // 按 2016 级高二理科期中联考成绩表量级加大交叠：卓行上沿与凌霄下沿、笃学上沿与卓行下沿、重点班左尾可掉出校内一本。
  // 不抬卓行整体均值，以免高考省控一本/二本膨胀；也不给笃学做一本留苗。
  yunxiu_exp: { id: "yunxiu_exp", name: "云岫实验", rank: 0, abilityMean: 86, abilitySd: 5, potMean: 94, potSd: 3 },
  yunxiu_key: { id: "yunxiu_key", name: "云岫重点", rank: 1, abilityMean: 78, abilitySd: 7.2, potMean: 88, potSd: 5 },
  lingxiao: { id: "lingxiao", name: "凌霄", rank: 2, abilityMean: 68, abilitySd: 7.8, potMean: 80, potSd: 5.5 },
  zhuoxing: { id: "zhuoxing", name: "卓行", rank: 3, abilityMean: 52, abilitySd: 10.5, potMean: 74, potSd: 7 },
  duxue: { id: "duxue", name: "笃学", rank: 4, abilityMean: 45.5, abilitySd: 12.5, potMean: 67, potSd: 8.5 },
  yiti: { id: "yiti", name: "艺体", rank: 5, abilityMean: 42, abilitySd: 12, potMean: 60, potSd: 8 },
  // 补习班：主体略强于普通卓行、远低于凌霄。高尾单独点出；标准差加宽是为了给理科长低分尾巴留空间，
  // 不再把整班压成 470–480 的窄峰。一本人数仍靠画像控制，不按重点/凌霄生成。
  fuzhuo: { id: "fuzhuo", name: "补习班", rank: 6, abilityMean: 53, abilitySd: 9.2, potMean: 72, potSd: 7 },
};

/**
 * 2017 级高一上预分班。尚未正式文理分科，但入学成绩已分梯队。
 * 玩家任教卓行 16 班（74 人普通班，总控普通班编制 65–75），不选云岫 0/1（0 班 36 人、1 班 32 人）。
 */
export const CLASS_BLUEPRINT = [
  { no: 0, name: "云岫0班", short: "云岫理科实验班", tier: "yunxiu_exp", trackHint: "li", size: 36 },
  { no: 1, name: "云岫1班", short: "云岫文科实验班", tier: "yunxiu_exp", trackHint: "wen", size: 32 },
  { no: 2, name: "云岫2班", short: "云岫理科重点班", tier: "yunxiu_key", trackHint: "li", size: 54 },
  { no: 3, name: "云岫3班", short: "云岫理科重点班", tier: "yunxiu_key", trackHint: "li", size: 51 },
  { no: 4, name: "云岫4班", short: "云岫理科重点班", tier: "yunxiu_key", trackHint: "li", size: 50 },
  { no: 5, name: "凌霄5班", short: "凌霄班", tier: "lingxiao", trackHint: "li", size: 73 },
  { no: 6, name: "凌霄6班", short: "凌霄班", tier: "lingxiao", trackHint: "li", size: 72 },
  { no: 7, name: "凌霄7班", short: "凌霄班", tier: "lingxiao", trackHint: "li", size: 72 },
  { no: 8, name: "凌霄8班", short: "凌霄班", tier: "lingxiao", trackHint: "li", size: 74 },
  { no: 9, name: "凌霄9班", short: "凌霄班", tier: "lingxiao", trackHint: "li", size: 70 },
  { no: 10, name: "凌霄10班", short: "凌霄班", tier: "lingxiao", trackHint: "wen", size: 60 },
  { no: 11, name: "凌霄11班", short: "凌霄班", tier: "lingxiao", trackHint: "wen", size: 60 },
  { no: 12, name: "卓行12班", short: "卓行班", tier: "zhuoxing", trackHint: "mixed", size: 70 },
  { no: 13, name: "卓行13班", short: "卓行班", tier: "zhuoxing", trackHint: "mixed", size: 71 },
  { no: 14, name: "卓行14班", short: "卓行班", tier: "zhuoxing", trackHint: "mixed", size: 72 },
  { no: 15, name: "卓行15班", short: "卓行班", tier: "zhuoxing", trackHint: "mixed", size: 72 },
  { no: 16, name: "卓行16班", short: "卓行班", tier: "zhuoxing", trackHint: "mixed", size: 74, player: true },
  { no: 17, name: "卓行17班", short: "卓行班", tier: "zhuoxing", trackHint: "mixed", size: 75 },
  { no: 18, name: "卓行18班", short: "卓行班", tier: "zhuoxing", trackHint: "mixed", size: 72 },
  { no: 19, name: "卓行19班", short: "卓行班", tier: "zhuoxing", trackHint: "mixed", size: 73 },
  { no: 20, name: "卓行20班", short: "卓行班", tier: "zhuoxing", trackHint: "mixed", size: 73 },
  { no: 21, name: "卓行21班", short: "卓行班", tier: "zhuoxing", trackHint: "mixed", size: 73 },
  { no: 22, name: "卓行22班", short: "卓行班", tier: "zhuoxing", trackHint: "mixed", size: 73 },
  { no: 23, name: "卓行23班", short: "卓行班", tier: "zhuoxing", trackHint: "mixed", size: 73 },
  { no: 24, name: "笃学24班", short: "笃学班", tier: "duxue", trackHint: "mixed", size: 73 },
  { no: 25, name: "笃学25班", short: "笃学班", tier: "duxue", trackHint: "mixed", size: 73 },
  { no: 26, name: "笃学26班", short: "笃学班", tier: "duxue", trackHint: "mixed", size: 73 },
  { no: 27, name: "笃学27班", short: "笃学班", tier: "duxue", trackHint: "mixed", size: 69 },
  { no: 28, name: "笃学28班", short: "笃学班", tier: "duxue", trackHint: "mixed", size: 73 },
  { no: 29, name: "笃学29班", short: "笃学班", tier: "duxue", trackHint: "mixed", size: 76 },
  { no: 30, name: "艺体30班", short: "艺体班", tier: "yiti", trackHint: "mixed", size: 50 },
  { no: 31, name: "补习31班", short: "文科补习班", tier: "fuzhuo", trackHint: "wen", size: 70, repeat: true },
  { no: 32, name: "补习32班", short: "文科补习班", tier: "fuzhuo", trackHint: "wen", size: 70, repeat: true },
  { no: 33, name: "补习33班", short: "文科补习班", tier: "fuzhuo", trackHint: "wen", size: 70, repeat: true },
  { no: 34, name: "补习34班", short: "文科补习班", tier: "fuzhuo", trackHint: "wen", size: 70, repeat: true },
  { no: 35, name: "补习35班", short: "文科补习班", tier: "fuzhuo", trackHint: "wen", size: 70, repeat: true },
  { no: 36, name: "补习36班", short: "文科补习班", tier: "fuzhuo", trackHint: "wen", size: 70, repeat: true },
  { no: 37, name: "补习37班", short: "理科补习班", tier: "fuzhuo", trackHint: "li", size: 70, repeat: true },
  { no: 38, name: "补习38班", short: "理科补习班", tier: "fuzhuo", trackHint: "li", size: 70, repeat: true },
  { no: 39, name: "补习39班", short: "理科补习班", tier: "fuzhuo", trackHint: "li", size: 70, repeat: true },
  { no: 40, name: "补习40班", short: "理科补习班", tier: "fuzhuo", trackHint: "li", size: 70, repeat: true },
  { no: 41, name: "补习41班", short: "理科补习班", tier: "fuzhuo", trackHint: "li", size: 70, repeat: true },
  { no: 42, name: "补习42班", short: "理科补习班", tier: "fuzhuo", trackHint: "li", size: 70, repeat: true },
];

/** 第一次分班后的目标班额（文理分科 + 梯队）。第二次分班不得使用此表。 */
export const FIRST_PLACEMENT_TARGETS = {
  li: [
    { no: 0, name: "云岫0班", short: "云岫理科实验班", tier: "yunxiu_exp", size: 36, locked: "exp" },
    { no: 2, name: "云岫2班", short: "云岫理科重点班", tier: "yunxiu_key", size: 54, locked: "key" },
    { no: 3, name: "云岫3班", short: "云岫理科重点班", tier: "yunxiu_key", size: 51, locked: "key" },
    { no: 4, name: "云岫4班", short: "云岫理科重点班", tier: "yunxiu_key", size: 50, locked: "key" },
    { no: 5, name: "凌霄5班", short: "凌霄班", tier: "lingxiao", size: 73 },
    { no: 6, name: "凌霄6班", short: "凌霄班", tier: "lingxiao", size: 72 },
    { no: 7, name: "凌霄7班", short: "凌霄班", tier: "lingxiao", size: 72 },
    { no: 8, name: "凌霄8班", short: "凌霄班", tier: "lingxiao", size: 74 },
    { no: 9, name: "凌霄9班", short: "凌霄班", tier: "lingxiao", size: 70 },
    { no: 12, name: "卓行12班", short: "卓行班", tier: "zhuoxing", size: 70 },
    { no: 13, name: "卓行13班", short: "卓行班", tier: "zhuoxing", size: 71 },
    { no: 14, name: "卓行14班", short: "卓行班", tier: "zhuoxing", size: 72 },
    { no: 15, name: "卓行15班", short: "卓行班", tier: "zhuoxing", size: 72 },
    { no: 16, name: "卓行16班", short: "卓行班", tier: "zhuoxing", size: 74 },
    { no: 17, name: "卓行17班", short: "卓行班", tier: "zhuoxing", size: 75 },
    { no: 18, name: "卓行18班", short: "卓行班", tier: "zhuoxing", size: 72 },
    { no: 27, name: "笃学27班", short: "笃学班", tier: "duxue", size: 69 },
    { no: 28, name: "笃学28班", short: "笃学班", tier: "duxue", size: 73 },
    { no: 29, name: "笃学29班", short: "笃学班", tier: "duxue", size: 76 },
  ],
  wen: [
    { no: 1, name: "云岫1班", short: "云岫文科实验班", tier: "yunxiu_exp", size: 32, locked: "exp" },
    { no: 10, name: "凌霄10班", short: "凌霄班", tier: "lingxiao", size: 60 },
    { no: 11, name: "凌霄11班", short: "凌霄班", tier: "lingxiao", size: 60 },
    { no: 19, name: "卓行19班", short: "卓行班", tier: "zhuoxing", size: 73 },
    { no: 20, name: "卓行20班", short: "卓行班", tier: "zhuoxing", size: 73 },
    { no: 21, name: "卓行21班", short: "卓行班", tier: "zhuoxing", size: 73 },
    { no: 22, name: "卓行22班", short: "卓行班", tier: "zhuoxing", size: 73 },
    { no: 23, name: "卓行23班", short: "卓行班", tier: "zhuoxing", size: 73 },
    { no: 24, name: "笃学24班", short: "笃学班", tier: "duxue", size: 73 },
    { no: 25, name: "笃学25班", short: "笃学班", tier: "duxue", size: 73 },
    { no: 26, name: "笃学26班", short: "笃学班", tier: "duxue", size: 73 },
  ],
  yiti: [{ no: 30, name: "艺体30班", short: "艺体班", tier: "yiti", size: 50, locked: "yiti" }],
};

export const EXAMS = [
  { id: "monthly1", name: "第一次月考", kind: "月考", dates: ["2017-10-12", "2017-10-13", "2017-10-14"], difficulty: 0.98 },
  { id: "midterm", name: "期中考试", kind: "期中", dates: ["2017-11-15", "2017-11-16", "2017-11-17"], difficulty: 1.02 },
  { id: "monthly2", name: "第二次月考", kind: "月考", dates: ["2017-12-14", "2017-12-15", "2017-12-16"], difficulty: 1.0 },
  { id: "final", name: "期末考试", kind: "期末", dates: ["2018-01-15", "2018-01-16", "2018-01-17"], difficulty: 1.05 },
];

/** 三天八科的场次安排。 */
export const EXAM_SESSIONS = [
  { dayOffset: 0, half: "morning", subjects: ["chinese"], label: "语文" },
  { dayOffset: 0, half: "afternoon", subjects: ["math"], label: "数学" },
  { dayOffset: 1, half: "morning", subjects: ["english"], label: "英语" },
  { dayOffset: 1, half: "afternoon", subjects: ["physics", "chemistry"], label: "物理、化学" },
  { dayOffset: 2, half: "morning", subjects: ["history", "politics"], label: "历史、政治" },
  { dayOffset: 2, half: "afternoon", subjects: ["geography"], label: "地理" },
];

export const PERIODS = [
  { id: "morning-read", name: "早读", short: "早读", kind: "self", clock: "06:40" },
  { id: "p1", name: "第1节", short: "1节", kind: "class", clock: "07:50" },
  { id: "p2", name: "第2节", short: "2节", kind: "class", clock: "08:40" },
  { id: "p3", name: "第3节", short: "3节", kind: "class", clock: "09:40" },
  { id: "p4", name: "第4节", short: "4节", kind: "class", clock: "10:30" },
  { id: "noon", name: "午休", short: "午休", kind: "break", clock: "12:00" },
  { id: "p5", name: "第5节", short: "5节", kind: "class", clock: "14:00" },
  { id: "p6", name: "第6节", short: "6节", kind: "class", clock: "14:50" },
  { id: "p7", name: "第7节", short: "7节", kind: "class", clock: "15:50" },
  { id: "p8", name: "第8节", short: "8节", kind: "class", clock: "16:40" },
  { id: "evening-1", name: "晚自习一", short: "晚一", kind: "self", clock: "19:00" },
  { id: "evening-2", name: "晚自习二", short: "晚二", kind: "self", clock: "20:10" },
];

export const WEEKDAY_NAMES = ["日", "一", "二", "三", "四", "五", "六"];

export const PERSONALITIES = ["沉稳", "开朗", "好强", "内向", "敏感", "自律", "懒散", "热心", "倔强", "细腻", "活泼", "寡言"];

export const FAMILY_TYPES = [
  { type: "务农", note: "家里在乡下种地，逢学期开学由亲人送来。" },
  { type: "外出务工", note: "父母在沿海打工，平时住校，假期才团圆。" },
  { type: "教师子女", note: "家里有人从教，对成绩和规矩都更敏感。" },
  { type: "经商", note: "家里做些小生意，经济上宽裕一些。" },
  { type: "单亲", note: "由父亲或母亲一方抚养，性格更早熟。" },
  { type: "机关职员", note: "父母在县城单位上班，周末常回家。" },
  { type: "手艺人家", note: "家里开店或做手艺，孩子偶尔要帮忙。" },
];

export function blueprintByNo(no) {
  return CLASS_BLUEPRINT.find((c) => c.no === no);
}

export function examById(id) {
  return EXAMS.find((e) => e.id === id);
}

export function examByDate(date) {
  return EXAMS.find((e) => e.dates.includes(date));
}

export function subjectById(id) {
  if (id === "lizong") return { id: "lizong", name: "理综", max: 300 };
  if (id === "wenzong") return { id: "wenzong", name: "文综", max: 300 };
  if (id === "biology") return { id: "biology", name: "生物", max: 100 };
  return SUBJECTS_G1.find((s) => s.id === id);
}
