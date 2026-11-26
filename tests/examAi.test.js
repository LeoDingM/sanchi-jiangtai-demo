import test from "node:test";
import assert from "node:assert/strict";
import { generateCohort } from "../js/domain/school.js";
import { firstPlacement, rebuildClasses } from "../js/domain/placement.js";
import { runExam } from "../js/domain/examService.js";
import { toJSON, fromJSON } from "../js/domain/save.js";
import {
  AI_SETTINGS_KEY, AI_KEY_KEY, GOD_SETTINGS_KEY, DEFAULT_AI_BASE_URL, DEFAULT_AI_MODEL,
  bindAiStorage, loadAiSettings, saveAiSettings, clearAiKey, maskApiKey,
  loadGodSettings, saveGodSettings, officialHomeroomName,
  playerSubjectId, playerSubjectName, isPlayerHomeroom, isActingHomeroom, analysisScope,
  chatCompletionsUrl, buildExamAnalysisPayload, buildAnalysisMessages,
  requestExamAnalysis, formatAiError, pickPreviousComparableReport,
} from "../js/domain/examAi.js";
import { buildStudentExamSnapshot } from "../js/domain/studentHistory.js";

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    _map: map,
  };
}

function placed(seed = 20170901) {
  let c = generateCohort(2017, seed);
  const pre = runExam(c, { id: "pre", name: "期末考试", examKind: "final", difficulty: 1, dispersion: 1, date: "2018-01-16" }, { grade: 1, split: false });
  c = { ...c, students: firstPlacement(c.students, pre.scoreMap, { seed }).students };
  c.classes = rebuildClasses(c.students);
  c.trackSplit = true;
  const mid = runExam(c, { id: "mid", name: "高二期中", examKind: "midterm", difficulty: 0.99, dispersion: 1.02, date: "2018-11-15" }, { grade: 2, split: true });
  const later = runExam(c, { id: "final2", name: "高二期末", examKind: "final", difficulty: 1, dispersion: 1, date: "2019-01-16" }, { grade: 2, split: true });
  return { c, pre, mid, later };
}

const player = { name: "林知秋", role: "数学实习教师", classNo: 16, subject: "math", homeroom: "赵映秋" };

test("密钥与模型存在独立设置里，不进入游戏存档 JSON", () => {
  const mem = memoryStorage();
  bindAiStorage(mem);
  const saved = saveAiSettings({ model: "deepseek-flash", baseUrl: DEFAULT_AI_BASE_URL, apiKey: "sk-test-not-a-real-key-aaaa" });
  assert.equal(saved.ok, true);
  assert.equal(loadAiSettings().apiKey, "sk-test-not-a-real-key-aaaa");
  assert.equal(loadAiSettings().model, DEFAULT_AI_MODEL);
  assert.equal(mem.getItem(AI_KEY_KEY), "sk-test-not-a-real-key-aaaa");
  assert.equal(JSON.parse(mem.getItem(AI_SETTINGS_KEY)).model, "deepseek-flash");
  assert.ok(!JSON.parse(mem.getItem(AI_SETTINGS_KEY)).apiKey, "设置摘要里不应再存一份密钥");

  const state = { date: "2017-09-01", player: { name: "林知秋" }, exams: {} };
  const json = toJSON(state);
  assert.ok(!json.includes("sk-test-not-a-real-key"));
  assert.ok(!json.includes("apiKey") || !fromJSON(json).player?.apiKey);
  const round = fromJSON(json);
  assert.equal(round.player.name, "林知秋");

  assert.equal(maskApiKey("sk-test-not-a-real-key-aaaa").includes("aaaa"), true);
  assert.ok(!maskApiKey("sk-test-not-a-real-key-aaaa").includes("not-a-real"));
  const cleared = clearAiKey();
  assert.equal(cleared.hasKey, false);
  assert.equal(loadAiSettings().apiKey, "");
  assert.equal(mem.getItem(AI_KEY_KEY), null);
  bindAiStorage(null);
});

test("分析范围按当前任职判断，不写死永远只能看数学", () => {
  assert.equal(playerSubjectId(player), "math");
  assert.equal(playerSubjectName(player), "数学");
  assert.equal(isPlayerHomeroom(player, 16), false);
  assert.equal(analysisScope(player, 16), "subject");
  const home = { ...player, isHomeroom: true };
  assert.equal(isPlayerHomeroom(home, 16), true);
  assert.equal(analysisScope(home, 16), "class");
  const other = { ...player, isHomeroom: true, homeroomOf: 15 };
  assert.equal(isPlayerHomeroom(other, 16), false);
  assert.equal(isPlayerHomeroom(other, 15), true);
  assert.equal(playerSubjectName({ subject: "chinese" }), "语文");
});

test("任课老师只拿到本班单科事实，班主任拿到总分、划线和各科；数字与成绩表一致", () => {
  const { mid } = placed(20170901);
  const sub = buildExamAnalysisPayload(mid, { player, classNo: 16 });
  assert.equal(sub.ok, true);
  assert.equal(sub.scope, "subject");
  assert.ok(sub.fact.单科);
  assert.equal(sub.fact.单科.科目, "数学");
  assert.equal(sub.fact.教师身份.分析范围.includes("数学"), true);
  assert.ok(!sub.fact.各科均分);
  assert.ok(!sub.fact.本班学生总分);
  const mine = mid.rows.filter((r) => r.classNo === 16 && !r.repeat);
  const mathAvg = mine.reduce((a, r) => a + r.math, 0) / mine.length;
  assert.ok(Math.abs(sub.fact.单科.本班均分 - Math.round(mathAvg * 10) / 10) < 0.15);
  const top = [...mine].sort((a, b) => b.math - a.math)[0];
  assert.equal(sub.fact.本班该科成绩[0].姓名, top.name);
  assert.equal(sub.fact.本班该科成绩[0].分数, top.math);
  const firstRow = sub.fact.本班该科成绩[0];
  assert.ok("该科班排" in firstRow && "该科同层次排" in firstRow && "该科校排" in firstRow);
  assert.ok("总分班排" in firstRow && "总分同层次排" in firstRow && "总分校排" in firstRow);
  assert.equal(firstRow.该科跨层次排 != null, true);
  assert.equal(sub.fact.须知.includes("不得生成"), true);
  assert.equal(sub.fact.进退步对照.有上一场, false);
  assert.match(sub.fact.进退步对照.说明, /不要虚构进退步/);
  assert.equal(sub.fact.建议谈话.进步较大.length, 0);
  assert.equal(sub.fact.建议谈话.退步较大.length, 0);
  const blob = JSON.stringify(sub.fact);
  assert.ok(!blob.includes("各科均分") || !sub.fact.各科均分);
  assert.ok(!("语文" in (sub.fact.各科排名概要 || {})));

  const whole = buildExamAnalysisPayload(mid, { player: { ...player, isHomeroom: true }, classNo: 16 });
  assert.equal(whole.scope, "class");
  assert.ok(whole.fact.各科均分.数学);
  assert.ok(whole.fact.各科均分.语文);
  assert.ok(whole.fact.排名分布.length >= 4);
  assert.equal(whole.fact.本班学生总分.length, mine.length);
  assert.equal(whole.fact.本班总分.最高, Math.max(...mine.map((r) => r.total)));
  assert.equal(typeof whole.fact.对照省控.一本, "number");
  assert.equal(typeof whole.fact.本班校内上线.一本, "number");
  assert.ok(whole.fact.校内划线说明.includes("校内一本") || whole.fact.校内划线说明.includes("一本"));
  const hr = whole.fact.本班学生总分[0];
  assert.ok("班排" in hr && "同层次排" in hr && "校排" in hr && "跨层次排" in hr);
  assert.ok(whole.fact.各科排名概要.数学);
  assert.ok(Array.isArray(whole.fact.建议谈话.临近校内或省控线));
  assert.equal(whole.fact.进退步对照.有上一场, false);
});

test("请求走 OpenAI 兼容 chat/completions，缺密钥或失败时给出中文提示，测试不打真实接口", async () => {
  assert.equal(chatCompletionsUrl(DEFAULT_AI_BASE_URL), "https://api.deepseek.com/chat/completions");
  assert.equal(chatCompletionsUrl("https://api.deepseek.com/v1"), "https://api.deepseek.com/v1/chat/completions");

  const { mid } = placed(7);
  const payload = buildExamAnalysisPayload(mid, { player, classNo: 16 });
  const messages = buildAnalysisMessages(payload);
  assert.equal(messages[0].role, "system");
  assert.ok(messages[0].content.includes("不得生成"));
  assert.ok(messages[0].content.includes("数学"));
  assert.ok(messages[1].content.includes(payload.fact.考试.名称));

  const noKey = await requestExamAnalysis(payload, { settings: { apiKey: "", model: DEFAULT_AI_MODEL, baseUrl: DEFAULT_AI_BASE_URL }, fetchImpl: async () => { throw new Error("should not fetch"); } });
  assert.equal(noKey.ok, false);
  assert.match(noKey.reason, /密钥/);

  let seen;
  const fetchOk = async (url, init) => {
    seen = { url, init };
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ choices: [{ message: { content: "本班数学均分偏低，建议先盯错题订正。" } }] }),
    };
  };
  const ok = await requestExamAnalysis(payload, {
    settings: { apiKey: "sk-demo-fake", model: "deepseek-flash", baseUrl: DEFAULT_AI_BASE_URL },
    fetchImpl: fetchOk,
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.text.includes("数学均分"), true);
  assert.equal(seen.url, "https://api.deepseek.com/chat/completions");
  assert.equal(seen.init.method, "POST");
  assert.equal(seen.init.headers.Authorization, "Bearer sk-demo-fake");
  const body = JSON.parse(seen.init.body);
  assert.equal(body.model, "deepseek-flash");
  assert.equal(body.messages.length, 2);
  assert.ok(body.messages[1].content.includes("不得生成") || body.messages[0].content.includes("不得生成"));
  assert.ok(body.messages[0].content.includes("进退步") || body.messages[1].content.includes("进退步"));
  assert.ok(body.max_tokens >= 2000 && body.max_tokens <= 2500);

  const unauthorized = await requestExamAnalysis(payload, {
    settings: { apiKey: "sk-demo-fake", model: "deepseek-flash", baseUrl: DEFAULT_AI_BASE_URL },
    fetchImpl: async () => ({ ok: false, status: 401, text: async () => JSON.stringify({ error: { message: "invalid api key" } }) }),
  });
  assert.equal(unauthorized.ok, false);
  assert.match(unauthorized.reason, /密钥/);

  const quota = await requestExamAnalysis(payload, {
    settings: { apiKey: "sk-demo-fake", model: "deepseek-flash", baseUrl: DEFAULT_AI_BASE_URL },
    fetchImpl: async () => ({ ok: false, status: 429, text: async () => JSON.stringify({ error: { message: "insufficient quota" } }) }),
  });
  assert.equal(quota.ok, false);
  assert.match(quota.reason, /额度/);

  const net = await requestExamAnalysis(payload, {
    settings: { apiKey: "sk-demo-fake", model: "deepseek-flash", baseUrl: DEFAULT_AI_BASE_URL },
    fetchImpl: async () => { throw new TypeError("Failed to fetch"); },
  });
  assert.equal(net.ok, false);
  assert.match(net.reason, /网络|接口地址/);

  assert.match(formatAiError(null, 500, ""), /暂时不可用/);
});

test("两场同分制考试时，进退步数字与 snapshot 一致；跨学段不以原始分相减", () => {
  const { mid, later, pre } = placed(20170901);
  const reports = [pre, mid, later];
  assert.equal(pickPreviousComparableReport(later, reports).examId, "mid");
  const sub = buildExamAnalysisPayload(later, { player, classNo: 16, previousReports: reports });
  assert.equal(sub.ok, true);
  assert.equal(sub.fact.进退步对照.有上一场, true);
  assert.equal(sub.fact.进退步对照.制度相同, true);
  assert.equal(sub.fact.进退步对照.上一场.日期, mid.date);
  const mine = later.rows.filter((r) => r.classNo === 16 && !r.repeat);
  const sample = mine[3];
  const cur = buildStudentExamSnapshot(sample.studentId, later);
  const prev = buildStudentExamSnapshot(sample.studentId, mid);
  const row = sub.fact.本班该科成绩.find((x) => x.姓名 === sample.name);
  assert.ok(row);
  assert.equal(row.该科班排, cur.subjects.math.classRank);
  assert.equal(row.该科同层次排, cur.subjects.math.tierRank);
  assert.equal(row.该科校排, cur.subjects.math.schoolRank);
  assert.equal(row.总分班排, cur.classRank);
  assert.equal(row.总分同层次排, cur.tierRank);
  assert.equal(row.总分校排, cur.schoolRank);
  assert.equal(row.较上场.该科班排.上场, prev.subjects.math.classRank);
  assert.equal(row.较上场.该科班排.本场, cur.subjects.math.classRank);
  assert.equal(row.较上场.该科班排.变化, prev.subjects.math.classRank - cur.subjects.math.classRank);
  assert.equal(row.较上场.总分校排.变化, prev.schoolRank - cur.schoolRank);
  assert.equal(row.较上场.分数.可直接比分, true);
  assert.equal(row.较上场.分数.分数差, cur.total - prev.total);
  assert.equal(row.较上场.该科分数差, cur.subjects.math.score - prev.subjects.math.score);

  // 跨学段：高一 950 vs 高二 750，不以原始分直接相减
  const across = buildExamAnalysisPayload(mid, { player, classNo: 16, previousReports: [pre, mid] });
  assert.equal(across.fact.进退步对照.有上一场, true);
  assert.equal(across.fact.进退步对照.制度相同, false);
  assert.match(across.fact.进退步对照.说明, /原始分|折合 750|制度/);
  const person = mid.rows.find((r) => r.classNo === 16 && !r.repeat);
  const midSnap = buildStudentExamSnapshot(person.studentId, mid);
  const preSnap = buildStudentExamSnapshot(person.studentId, pre);
  const arow = across.fact.本班该科成绩.find((x) => x.姓名 === person.name);
  assert.equal(arow.较上场.分数.可直接比分, false);
  assert.equal(arow.较上场.该科分数差, null);
  assert.equal(arow.较上场.分数.折合750分差, midSnap.scaled750 - preSnap.scaled750);
  assert.ok(across.fact.班级对比摘要.较上场.说明.includes("750"));
  const rawGap = midSnap.total - preSnap.total;
  assert.notEqual(arow.较上场.分数.折合750分差, rawGap);
});

test("班主任事实含总分班/层/校排和谈话候选，名单中的人与进退步或临界清单一致", () => {
  const { mid, later } = placed(7);
  const homePlayer = { ...player, isHomeroom: true };
  const whole = buildExamAnalysisPayload(later, { player: homePlayer, classNo: 16, previousReports: [mid, later] });
  assert.equal(whole.scope, "class");
  const row = whole.fact.本班学生总分[0];
  assert.ok(row.班排 >= 1 && row.同层次排 >= 1 && row.校排 >= 1);
  assert.ok(Array.isArray(row.跨层次排));
  assert.ok(row.较上场.校排.变化 === (row.较上场.校排.上场 - row.较上场.校排.本场));
  const lists = whole.fact.建议谈话;
  const names = new Set(whole.fact.本班学生总分.map((x) => x.姓名));
  const allTalk = [...lists.进步较大, ...lists.退步较大, ...lists.临近校内或省控线, ...lists.排名波动较大];
  assert.ok(allTalk.length >= 1, "应能给出至少一名建议谈话对象");
  assert.ok(allTalk.length <= 20, "谈话名单应克制，不能把全班都塞进去");
  for (const item of allTalk) {
    assert.ok(names.has(item.姓名), `${item.姓名} 应是本班学生`);
    assert.ok(item.原因 && item.原因.length > 0);
  }
  const byName = new Map(whole.fact.本班学生总分.map((x) => [x.姓名, x]));
  for (const item of lists.进步较大) {
    const r = byName.get(item.姓名);
    assert.ok(r.较上场.校排.变化 >= 15 || r.较上场.班排.变化 >= 5, `${item.姓名} 应在进步清单的数字条件内`);
    assert.ok(item.原因.includes("→"));
  }
  for (const item of lists.退步较大) {
    const r = byName.get(item.姓名);
    assert.ok(r.较上场.校排.变化 <= -15 || r.较上场.班排.变化 <= -5, `${item.姓名} 应在退步清单的数字条件内`);
  }
  const msgs = buildAnalysisMessages(whole);
  assert.ok(msgs[0].content.includes("班主任"));
  assert.ok(msgs[0].content.includes("不得编造") || msgs[0].content.includes("不要虚构"));
});

test("上帝模式只叠加分析范围，不改写正式任职，也不进入存档", () => {
  const mem = memoryStorage();
  bindAiStorage(mem);

  assert.equal(loadGodSettings().actAsHomeroom, false);
  assert.equal(isPlayerHomeroom(player, 16), false);
  assert.equal(isActingHomeroom(player, 16), false);
  assert.equal(analysisScope(player, 16), "subject");
  assert.equal(officialHomeroomName(player), "赵映秋");

  const { mid } = placed(20170901);
  const off = buildExamAnalysisPayload(mid, { player, classNo: 16 });
  assert.equal(off.ok, true);
  assert.equal(off.scope, "subject");
  assert.ok(off.fact.单科);
  assert.ok(!off.fact.各科均分);
  assert.ok(!off.fact.本班学生总分);
  assert.equal(off.fact.教师身份.职务, "单科任课老师");

  const saved = saveGodSettings({ actAsHomeroom: true });
  assert.equal(saved.ok, true);
  assert.equal(loadGodSettings().actAsHomeroom, true);
  assert.equal(JSON.parse(mem.getItem(GOD_SETTINGS_KEY)).actAsHomeroom, true);
  assert.equal(isPlayerHomeroom(player, 16), false);
  assert.equal(player.isHomeroom, undefined);
  assert.equal(player.homeroomOf, undefined);
  assert.equal(isActingHomeroom(player, 16), true);
  assert.equal(isActingHomeroom(player, 15), false, "上帝模式只对本班生效");
  assert.equal(analysisScope(player, 16), "class");
  assert.equal(analysisScope(player, 15), "subject");

  const on = buildExamAnalysisPayload(mid, { player, classNo: 16 });
  assert.equal(on.ok, true);
  assert.equal(on.scope, "class");
  assert.ok(on.fact.各科均分.数学);
  assert.ok(on.fact.各科均分.语文);
  assert.ok(on.fact.本班学生总分.length >= 1);
  assert.ok("班排" in on.fact.本班学生总分[0] && "校排" in on.fact.本班学生总分[0]);
  assert.equal(typeof on.fact.对照省控.一本, "number");
  assert.equal(typeof on.fact.本班校内上线.一本, "number");
  assert.equal(on.fact.教师身份.职务, "本班班主任（上帝模式查看）");
  assert.equal(on.fact.教师身份.学校正式班主任, "赵映秋");
  assert.equal(player.isHomeroom, undefined);
  assert.equal(player.homeroomOf, undefined);
  assert.equal(player.homeroom, "赵映秋");

  saveAiSettings({ model: DEFAULT_AI_MODEL, baseUrl: DEFAULT_AI_BASE_URL, apiKey: "sk-test-god-mode-key" });
  const state = { date: "2017-09-01", player: { ...player }, exams: {} };
  const json = toJSON(state);
  assert.ok(!json.includes("sk-test-god-mode-key"));
  assert.ok(!json.includes("actAsHomeroom"));
  assert.ok(!json.includes("isActingHomeroom"));
  const round = fromJSON(json);
  assert.equal(round.player.isHomeroom, undefined);
  assert.equal(round.player.homeroomOf, undefined);
  assert.equal(round.player.homeroom, "赵映秋");
  assert.ok(!("apiKey" in (round.player || {})));

  const closed = saveGodSettings({ actAsHomeroom: false });
  assert.equal(closed.actAsHomeroom, false);
  assert.equal(isActingHomeroom(player, 16), false);
  assert.equal(isPlayerHomeroom(player, 16), false);
  assert.equal(analysisScope(player, 16), "subject");
  const back = buildExamAnalysisPayload(mid, { player, classNo: 16 });
  assert.equal(back.scope, "subject");
  assert.ok(!back.fact.各科均分);
  assert.ok(!back.fact.本班学生总分);
  assert.equal(back.fact.教师身份.职务, "单科任课老师");

  const home = { ...player, isHomeroom: true };
  assert.equal(isPlayerHomeroom(home, 16), true);
  assert.equal(isActingHomeroom(home, 16), false);
  assert.equal(analysisScope(home, 16), "class");
  const official = buildExamAnalysisPayload(mid, { player: home, classNo: 16 });
  assert.equal(official.scope, "class");
  assert.ok(official.fact.各科均分.语文);
  assert.equal(official.fact.教师身份.职务, "本班班主任");
  assert.ok(!String(official.fact.教师身份.职务).includes("上帝模式"));
  assert.ok(!official.fact.教师身份.学校正式班主任);

  bindAiStorage(null);
});
