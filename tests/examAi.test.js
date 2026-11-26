import test from "node:test";
import assert from "node:assert/strict";
import { generateCohort } from "../js/domain/school.js";
import { firstPlacement, rebuildClasses } from "../js/domain/placement.js";
import { runExam } from "../js/domain/examService.js";
import { toJSON, fromJSON } from "../js/domain/save.js";
import {
  AI_SETTINGS_KEY, AI_KEY_KEY, DEFAULT_AI_BASE_URL, DEFAULT_AI_MODEL,
  bindAiStorage, loadAiSettings, saveAiSettings, clearAiKey, maskApiKey,
  playerSubjectId, playerSubjectName, isPlayerHomeroom, analysisScope,
  chatCompletionsUrl, buildExamAnalysisPayload, buildAnalysisMessages,
  requestExamAnalysis, formatAiError,
} from "../js/domain/examAi.js";

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
  return { c, mid };
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
  assert.equal(sub.fact.须知.includes("不得生成"), true);

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
