import {
  createGame, playerStudents, skipToNextStage, skipToGaokaoOf, skipToNextCohort,
  advanceDay, prepareLesson, teach, talkTo, reviewHomework, listExamReports, formatDateCn,
  applyEvent, SCHOOL_CALENDAR, gradeOf, topicsForGrade, LESSON_STYLES,
  suggestedTopic, topicProgress, homeworkWatchlist, studentTeachingContext,
} from "../domain/simulation.js";
import { saveSlot, loadSlot, listSlots, toJSON, fromJSON } from "../domain/save.js";
import { subjectById, SUBJECTS_G1 } from "../domain/config.js";
import { filterRows, sameTierCompare } from "../domain/examService.js";
import { hydrateReport } from "../domain/simulation.js";
import { renderSeating } from "./classroom.js";
import { provincialLines } from "../domain/jiangxi.js";
import { studentExamHistory, tierName, findStudentInState } from "../domain/studentHistory.js";
import { drawScoreChart, drawRankChart } from "./charts.js";

let state = null;
let view = "classroom";
let selectedId = null;
let examPick = "";
let subjectPick = "math";
let toastTimer = 0;

const $ = (s) => document.querySelector(s);

function toast(msg) {
  let el = document.querySelector(".toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 2800);
}

function persist() {
  if (state) saveSlot(state, "auto");
}

export function boot() {
  $("#btn-new").onclick = () => {
    const name = $("#pname").value.trim() || "林知秋";
    state = createGame(20170901, name);
    selectedId = playerStudents(state)[0]?.id;
    persist();
    showMain();
  };
  $("#btn-cont").onclick = () => {
    const s = loadSlot("auto");
    if (!s) { toast("还没有自动存档"); return; }
    state = s;
    selectedId = playerStudents(state)[0]?.id;
    showMain();
  };
  document.querySelectorAll("#sidenav [data-view]").forEach((btn) => {
    btn.onclick = () => { view = btn.dataset.view; render(); };
  });
  document.querySelectorAll("[data-act]").forEach((btn) => {
    btn.onclick = () => handleAct(btn.dataset.act);
  });
}

function showMain() {
  $("#boot").classList.add("hidden");
  $("#main").classList.remove("hidden");
  render();
}

function handleAct(act) {
  if (!state) return;
  if (act === "prep") { const r = prepareLesson(state); toast(r.text || "备课完成"); }
  if (act === "teach") { const r = teach(state, "精讲例题", selectedId); toast(r.text || "已上完一节数学课"); }
  if (act === "nextday") {
    const r = advanceDay(state);
    if (r.type && r.type !== "day") toast(`结算：${r.type}`);
  }
  if (act === "skip") {
    const r = skipToNextStage(state);
    toast(r.ok ? `已推进到 ${r.event.name}` : (r.reason || "无法推进"));
  }
  persist();
  render();
}

function render() {
  if (!state) return;
  $("#clock").textContent = formatDateCn(state.date);
  $("#roleline").textContent = `${state.player.role} ${state.player.name} · ${state.player.cohortYear}级卓行${state.player.classNo}班 数学`;
  document.querySelectorAll("#sidenav [data-view]").forEach((b) => b.classList.toggle("on", b.dataset.view === view));
  const host = $("#view");
  const map = { classroom: viewClassroom, roster: viewRoster, profile: viewProfile, teach: viewTeach, placement: viewPlacement, grades: viewGrades, office: viewOffice, admission: viewAdmission, auto: viewAuto, log: viewLog, save: viewSave };
  host.innerHTML = "";
  (map[view] || viewClassroom)(host);
  renderAgenda();
}

function clsStudents() { return playerStudents(state); }


function teachingStatus(s) {
  const ctx = studentTeachingContext(s, state);
  if (!ctx || (!ctx.flag && !ctx.hw && !ctx.quiz)) return "还没有本班课堂或作业记录。";
  const bits = [];
  if (ctx.flag && ctx.topic) bits.push(`最近「${ctx.topic}」课堂上${ctx.flag}`);
  else if (ctx.flag) bits.push(`最近课堂上${ctx.flag}`);
  if (ctx.hw) bits.push(ctx.hw.status === "缺交" ? "这趟作业缺交" : `作业${ctx.hw.quality}${ctx.hw.reviewed ? "（已面批）" : ""}`);
  if (ctx.quiz) bits.push(`随堂小测 ${ctx.quiz.score} 分`);
  return "带班近况：" + bits.join("；") + "。";
}

function examSourceNotice(report) {
  if (!report) return "";
  if (report.examKind === "huikao") {
    return report.sourceNote || "此为高二学业水平考试的校内合格记载：单科达到卷面满分 60% 记为合格。日期为校历示意，未按某年省教育考试院公告逐条核对；未收录公开会考合格线，不以校内一本/二本线作为本场主要结果。文理交叉科目尚未单独建模。";
  }
  if (report.examKind === "city" || report.examKind === "province") {
    return report.sourceNote || "市/省联考目前只在宁川中学校内考生中计分排名。没有可靠的全市或全省样本前，不生成虚构考生池，也不展示虚构的市位次或省位次。";
  }
  return report.sourceNote || "";
}

function viewClassroom(host) {
  host.innerHTML = `<h3>教室座位表</h3><p class="notice">点击头像查看档案并谈话。任教班为 2017 年起的卓行16班，约 73 人，不是云岫 0/1 的 30—35 人编制。</p><canvas id="classroom"></canvas>`;
  const c = host.querySelector("#classroom");
  renderSeating(c, clsStudents(), selectedId, (id) => { selectedId = id; view = "profile"; render(); });
}

function viewRoster(host) {
  const sts = clsStudents().slice().sort((a, b) => a.seq - b.seq);
  host.innerHTML = `<h3>学生名册 · ${sts.length}人</h3>
    <table><thead><tr><th>座号</th><th>姓名</th><th>性别</th><th>性格</th><th>家庭</th><th>文理意向</th><th>师生关系</th></tr></thead>
    <tbody>${sts.map((s) => `<tr data-id="${s.id}" class="${s.id===selectedId?"me":""}"><td>${s.seq}</td><td>${s.name}</td><td>${s.gender==="F"?"女":"男"}</td><td>${s.personality}</td><td>${s.family.type}</td><td>${s.trackPref==="wen"?"文":"理"}</td><td>${s.relation||0}</td></tr>`).join("")}</tbody></table>`;
  host.querySelectorAll("tr[data-id]").forEach((tr) => tr.onclick = () => { selectedId = tr.dataset.id; view = "profile"; render(); });
}

function fmtRank(rank, n) {
  if (rank == null || n == null) return "—";
  return `${rank}/${n}`;
}

function findStudent(id) {
  return findStudentInState(state, id) || clsStudents().find((x) => x.id === id) || null;
}

function viewProfile(host) {
  const roster = clsStudents();
  const s = findStudent(selectedId) || roster[0];
  if (!s) { host.innerHTML = "<p>没有学生</p>"; return; }
  selectedId = s.id;
  const hist = studentExamHistory(state, s.id);
  const latest = hist[hist.length - 1];
  if (latest && !latest.subjects[subjectPick]) {
    subjectPick = latest.subjectIds[0] || "math";
  }
  const ab = Object.entries(s.ability || {}).map(([k, v]) => `${(subjectById(k)?.name) || k} ${Number(v).toFixed(0)}`).join("　");
  const inRoster = roster.some((x) => x.id === s.id);
  const opts = roster.map((x) => `<option value="${x.id}" ${x.id === s.id ? "selected" : ""}>${x.seq ? x.seq + "号 " : ""}${x.name}</option>`).join("")
    + (inRoster ? "" : `<option value="${s.id}" selected>${s.name}（其他班级）</option>`);
  const subjIds = latest?.subjectIds || Object.keys(latest?.subjects || { math: 1 });
  const subjBtns = subjIds.map((id) => {
    const nm = (subjectById(id) || { name: id }).name;
    return `<button type="button" class="${id === subjectPick ? "on" : ""}" data-subj="${id}">${nm}</button>`;
  }).join("");
  const tiersPresent = TIER_ORDER.filter((t) => hist.some((h) => h.cross[t]));
  const examRows = hist.slice().reverse().map((h) => {
    const crossCells = tiersPresent.map((t) => {
      const c = h.cross[t];
      return `<td>${c ? fmtRank(c.rank, c.n) : "—"}</td>`;
    }).join("");
    const schoolLabel = h.split ? `${h.track === "wen" ? "文" : "理"}科校排` : "校排";
    return `<tr>
      <td>${h.date}<br/><span class="muted">${h.examName}</span></td>
      <td>${(h.difficulty || 1).toFixed(3)}</td>
      <td>${h.total}<span class="muted">/${h.maxTotal}</span></td>
      <td>${fmtRank(h.classRank, h.classN)}</td>
      <td>${fmtRank(h.tierRank, h.tierN)}</td>
      <td>${fmtRank(h.schoolRank, h.schoolN)}<br/><span class="muted">${schoolLabel}</span></td>
      <td>${fmtRank(h.gradeRank, h.gradeN)}</td>
      ${crossCells}
      <td>${h.line || ""}</td>
    </tr>`;
  }).join("");
  const subjRows = hist.slice().reverse().map((h) => {
    const sub = h.subjects[subjectPick];
    if (!sub) return "";
    const crossCells = tiersPresent.map((t) => {
      const c = sub.cross[t];
      return `<td>${c ? fmtRank(c.rank, c.n) : "—"}</td>`;
    }).join("");
    return `<tr>
      <td>${h.date}<br/><span class="muted">${h.examName}</span></td>
      <td>${sub.score}<span class="muted">/${sub.max}</span></td>
      <td>${fmtRank(sub.class.rank, sub.class.n)}</td>
      <td>${fmtRank(sub.tier.rank, sub.tier.n)}</td>
      <td>${fmtRank(sub.school.rank, sub.school.n)}</td>
      <td>${fmtRank(sub.grade.rank, sub.grade.n)}</td>
      ${crossCells}
    </tr>`;
  }).join("");
  const crossHead = tiersPresent.map((t) => `<th>在${tierLabel(t)}相当于</th>`).join("");
  const family = s.family ? `${s.family.type}。${s.family.note || ""}` : "—";
  const trackLabel = s.trackPref === "wen" || s.track === "wen" ? "文科" : (s.trackPref === "li" || s.track === "li" ? "理科" : "—");

  host.innerHTML = `<div class="profile-head">
      <h3>${s.name} · 档案</h3>
      <label class="notice">查看学生 <select id="stsel">${opts}</select></label>
    </div>
    <div class="profile-grid">
      <div class="paper">
        <p><b>学号</b> ${s.id}　<b>性别</b> ${s.gender==="F"?"女":"男"}　<b>性格</b> ${s.personality || "—"}　<b>班级</b> ${tierLabel(s.tier)}${s.classNo ?? ""}班</p>
        <p><b>家庭</b> ${family}</p>
        <p><b>文理意向</b> ${trackLabel}　<b>专业倾向</b> ${s.majorPref||"—"}</p>
        <p><b>心情</b> ${s.mood ?? "—"}　<b>压力</b> ${s.stress ?? "—"}　<b>精力</b> ${s.energy ?? "—"}　<b>师生关系</b> ${s.relation||0}</p>
        <p class="muted">${teachingStatus(s)}</p>
        <p class="muted">学科能力（潜能为个人上限，不是当场分数）</p>
        <p>${ab || "—"}</p>
      </div>
      <div class="paper">
        <p>谈话（本时段最多 5 人次）</p>
        <div class="row-actions">
          ${["鼓励","询问学习","关注状态","谈心"].map((t)=>`<button type="button" data-talk="${t}">${t}</button>`).join("")}
        </div>
        <div>${(s.talks||[]).slice(-6).reverse().map((t)=>`<p class="muted">${t.date}　${t.topic}：${t.text}</p>`).join("") || "<p class='muted'>还没有谈话记录。</p>"}</div>
      </div>
    </div>
    <h3>成绩与排名走势</h3>
    <p class="notice">下列曲线和表格均由该生各次实考总分、单科分在当次学生池中重算，不另造统计。高一为 950 分制，图中另给出折合 750 分，便于和高二、高三对照。名次越小越靠前；跨层次是把该生成绩放入其他层次（云岫实验、云岫重点、凌霄、卓行、笃学、艺体、复卓等）学生池后的名次。</p>
    ${hist.length ? `
    <div class="charts">
      <div class="chart-card">
        <h4>总分走势（折合 750 分）</h4>
        <canvas id="ch-total"></canvas>
      </div>
      <div class="chart-card">
        <h4>班排 / 同层次排 / 校排（名次在上为靠前）</h4>
        <canvas id="ch-ranks"></canvas>
      </div>
      <div class="chart-card">
        <h4>跨层次对比（名次百分位，越小越靠前）</h4>
        <canvas id="ch-cross"></canvas>
      </div>
      ${latest ? `<div class="chart-card">
        <h4>最近一场跨层次对照 · ${latest.date} ${latest.examName}（总分 ${latest.total}）</h4>
        <canvas id="ch-crossbar"></canvas>
      </div>` : ""}
    </div>
    <div class="scroll-table paper">
      <table>
        <thead><tr>
          <th>考试</th><th>难度</th><th>总分</th><th>班排</th><th>同层次排</th><th>校排</th><th>全年级排</th>
          ${crossHead}<th>上线</th>
        </tr></thead>
        <tbody>${examRows}</tbody>
      </table>
    </div>
    <h3>单科分数与排名</h3>
    <div class="subj-tabs">${subjBtns}</div>
    <div class="charts">
      <div class="chart-card">
        <h4>${(subjectById(subjectPick)||{name:subjectPick}).name} 分数走势</h4>
        <canvas id="ch-subj"></canvas>
      </div>
      <div class="chart-card">
        <h4>${(subjectById(subjectPick)||{name:subjectPick}).name} 班排 / 层次排 / 校排</h4>
        <canvas id="ch-subj-ranks"></canvas>
      </div>
      <div class="chart-card">
        <h4>${(subjectById(subjectPick)||{name:subjectPick}).name} 跨层次名次百分位</h4>
        <canvas id="ch-subj-cross"></canvas>
      </div>
    </div>
    <div class="scroll-table paper">
      <table>
        <thead><tr>
          <th>考试</th><th>分数</th><th>班排</th><th>同层次排</th><th>校排</th><th>全年级排</th>${crossHead}
        </tr></thead>
        <tbody>${subjRows}</tbody>
      </table>
    </div>
    ` : `<p class="notice">还没有该生的考试记录。可用「下一阶段」跳到第一次月考后再回来看曲线。</p>`}`;

  const sel = host.querySelector("#stsel");
  if (sel) sel.onchange = () => { selectedId = sel.value; render(); };
  host.querySelectorAll("[data-talk]").forEach((b) => {
    b.onclick = () => {
      const r = talkTo(state, s.id, b.dataset.talk);
      toast(r.ok ? r.text : r.reason);
      persist(); render();
    };
  });
  host.querySelectorAll("[data-subj]").forEach((b) => {
    b.onclick = () => { subjectPick = b.dataset.subj; render(); };
  });
  if (!hist.length) return;
  const labels = hist.map((h) => h.date.slice(5) + " " + String(h.examName || "").replace(/考试|第|次/g, "").slice(0, 6));
  const pct = (rank, n) => (n ? Math.round((rank / n) * 1000) / 10 : null);
  requestAnimationFrame(() => {
    const el = (id) => host.querySelector(id);
    if (el("#ch-total")) {
      drawLineChart(el("#ch-total"), {
        labels,
        yLabel: "折合分",
        series: [
          { name: "折合 750", values: hist.map((h) => h.scaled750), color: "#c45c4a" },
          { name: "原始总分", values: hist.map((h) => h.total), color: "#8b5e3c" },
        ],
      });
    }
    if (el("#ch-ranks")) {
      drawLineChart(el("#ch-ranks"), {
        labels,
        yInvert: true,
        yMin: 1,
        yMax: Math.max(8, ...hist.map((h) => Math.max(h.classN || 1, Math.min(h.tierN || 1, 200), Math.min(h.schoolN || 1, 400)))),
        yLabel: "名次",
        series: [
          { name: "班排", values: hist.map((h) => h.classRank), color: "#c45c4a" },
          { name: "同层次排", values: hist.map((h) => h.tierRank), color: "#3d6b5a" },
          { name: "校排", values: hist.map((h) => h.schoolRank), color: "#3d5c6b" },
        ],
      });
    }
    if (el("#ch-cross")) {
      const focus = ["yunxiu_exp", "yunxiu_key", "lingxiao", "zhuoxing", "duxue"].filter((t) => tiersPresent.includes(t));
      drawLineChart(el("#ch-cross"), {
        labels,
        yInvert: true,
        yMin: 0,
        yMax: 100,
        yLabel: "百分位",
        series: focus.map((t, i) => ({
          name: "在" + tierLabel(t),
          values: hist.map((h) => h.cross[t] ? pct(h.cross[t].rank, h.cross[t].n) : null),
          color: ["#c45c4a", "#8b5e3c", "#3d6b5a", "#3d5c6b", "#6b4a5d"][i],
        })),
      });
    }
    if (latest && el("#ch-crossbar")) {
      const ts = tiersPresent.filter((t) => latest.cross[t]);
      drawBarChart(el("#ch-crossbar"), {
        labels: ts.map((t) => tierLabel(t)),
        values: ts.map((t) => latest.cross[t].rank),
        yLabel: "相当于第几名",
      });
    }
    const subjName = (subjectById(subjectPick) || { name: subjectPick }).name;
    if (el("#ch-subj")) {
      drawLineChart(el("#ch-subj"), {
        labels,
        yLabel: "分数",
        series: [{ name: subjName, values: hist.map((h) => h.subjects[subjectPick]?.score ?? null), color: "#c45c4a" }],
      });
    }
    if (el("#ch-subj-ranks")) {
      drawLineChart(el("#ch-subj-ranks"), {
        labels,
        yInvert: true,
        yMin: 1,
        yMax: Math.max(8, ...hist.map((h) => {
          const sub = h.subjects[subjectPick];
          if (!sub) return 8;
          return Math.max(sub.class.n || 1, Math.min(sub.tier.n || 1, 200), Math.min(sub.school.n || 1, 400));
        })),
        yLabel: "名次",
        series: [
          { name: "班排", values: hist.map((h) => h.subjects[subjectPick]?.class.rank ?? null), color: "#c45c4a" },
          { name: "同层次排", values: hist.map((h) => h.subjects[subjectPick]?.tier.rank ?? null), color: "#3d6b5a" },
          { name: "校排", values: hist.map((h) => h.subjects[subjectPick]?.school.rank ?? null), color: "#3d5c6b" },
        ],
      });
    }
    if (el("#ch-subj-cross")) {
      const focus = ["yunxiu_exp", "yunxiu_key", "lingxiao", "zhuoxing", "duxue"].filter((t) => tiersPresent.includes(t));
      drawLineChart(el("#ch-subj-cross"), {
        labels,
        yInvert: true,
        yMin: 0,
        yMax: 100,
        yLabel: "百分位",
        series: focus.map((t, i) => ({
          name: "在" + tierLabel(t),
          values: hist.map((h) => {
            const c = h.subjects[subjectPick]?.cross[t];
            return c ? pct(c.rank, c.n) : null;
          }),
          color: ["#c45c4a", "#8b5e3c", "#3d6b5a", "#3d5c6b", "#6b4a5d"][i],
        })),
      });
    }
  });
}


function viewTeach(host) {
  const grade = gradeOf(state.player.cohortYear, state.date);
  const topics = topicsForGrade(grade);
  const plan = state.player.lessonPlan;
  const lessons = state.player.lessons || [];
  const last = lessons[0];
  const sts = clsStudents().slice().sort((a, b) => a.seq - b.seq);
  const prog = topicProgress(state, grade);
  const suggest = suggestedTopic(state, grade);
  const hw = state.homework;
  const watch = homeworkWatchlist(hw);
  const planBlock = plan ? `<p><b>课题</b> ${plan.topic}　<b>例题深度</b> ${plan.depth}　<b>作业</b> ${plan.homework}</p>
      <p>${plan.goals || ""}</p>
      <p class="muted">${plan.examples || ""} ${plan.homeworkNote || ""}</p>` : `<p class="muted">还没有教案。先选课题备一节课，再进教室。</p>`;
  const quizLow = (last?.quizAll || last?.quiz || []).slice().sort((a, b) => a.score - b.score).slice(0, 5);
  const hwRows = (hw?.rows || []).slice().sort((a, b) => {
    const rank = (r) => (r.status === "缺交" ? 0 : r.quality === "错题较多" ? 1 : r.quality === "未订正" ? 2 : r.flag === "走神" ? 3 : r.reviewed ? 9 : 5);
    return rank(a) - rank(b) || (a.seq ?? 0) - (b.seq ?? 0);
  });
  host.innerHTML = `<h3>日常教学 · 数学课</h3>
    <p class="notice">先写教案，再上课，课后看作业登记，当面批改或个别谈话。备课充分度和教学积累会进入下一次考试的数学成绩。课题按本学期进度推进，课堂纪要、作业和小测都会写到学生档案里，不是几个空按钮。</p>
    <div class="kpi">
      <div><span>备课充分度</span><b>${state.player.prep || 0} / 3</b></div>
      <div><span>数学教学积累</span><b>${Number(state.player.mathTeaching || 0).toFixed(1)}</b></div>
      <div><span>本学期进度</span><b>${prog.done} / ${prog.total}</b></div>
      <div><span>今日面批</span><b>${state.reviewsToday || 0} / 6</b></div>
    </div>
    <div class="profile-grid">
      <div class="paper lesson-card">
        <h3>备课</h3>
        <p class="muted">下一课建议：${suggest}</p>
        <div class="form-grid">
          <label>课题 <select id="topic">${topics.map((x) => `<option ${((plan && plan.topic===x) || (!plan && x===suggest))?"selected":""}>${x}</option>`).join("")}</select></label>
          <label>例题深度 <select id="depth">${[1,2,3].map((d)=>`<option value="${d}" ${(!plan && d===2) || plan?.depth===d?"selected":""}>${d===1?"基本例题":d===2?"例题+变式":"例题+变式+综合"}</option>`).join("")}</select></label>
          <label>作业量 <select id="hw">${["轻","中","重"].map((h)=>`<option ${(!plan && h==="中") || plan?.homework===h?"selected":""}>${h}</option>`).join("")}</select></label>
        </div>
        <div class="row-actions"><button type="button" class="accent" id="do-prep">写完教案</button></div>
        ${planBlock}
      </div>
      <div class="paper lesson-card">
        <h3>上课</h3>
        <div class="form-grid">
          <label>课型 <select id="style">${Object.keys(LESSON_STYLES).map((s)=>`<option>${s}</option>`).join("")}</select></label>
          <label>提问/板演 <select id="call"><option value="">（不点名）</option>${sts.map((s)=>`<option value="${s.id}" ${s.id===selectedId?"selected":""}>${s.seq}号 ${s.name}${s.lastClassFlag==="走神"?" · 上次走神":""}</option>`).join("")}</select></label>
        </div>
        <div class="row-actions"><button type="button" class="accent" id="do-teach">开始上课</button></div>
        ${last ? `<p class="muted">${last.date}　${last.topic} · ${last.style}</p><ol class="notes-list">${(last.notes||[]).map((n)=>`<li>${n}</li>`).join("")}</ol>${last.quiz?`<p class="muted">小测均分 ${last.quizAvg}。前列：${last.quiz.slice(0,5).map((q)=>`${q.name}${q.score}`).join("、")}${quizLow.length?`。偏低：${quizLow.map((q)=>`${q.name}${q.score}`).join("、")}`:""}</p>`:""}` : `<p class="muted">今天还没上课。</p>`}
      </div>
    </div>
    <div class="paper lesson-card">
      <h3>作业登记与面批</h3>
      ${hw ? `<p>「${hw.topic}」· ${hw.date}　缺交 ${hw.rows.filter((r)=>r.status==="缺交").length} 本，需盯 ${watch.length} 人。每天最多当面批 6 本，建议先看缺交和错题。</p>` : `<p class="muted">上完一节课之后，这里会登记全班作业情况，再决定先面批谁。</p>`}
      ${watch.length ? `<p>建议先面批：</p><div class="row-actions">${watch.slice(0, 12).map((s)=>`<button type="button" data-rv="${s.id}">${s.name}${s.status==="缺交"?"（缺交）":s.quality==="错题较多"?"（错题）":""}</button>`).join("")}</div>` : ""}
      ${hwRows.length ? `<div class="scroll-table"><table class="hw-table"><thead><tr><th>座号</th><th>姓名</th><th>课堂</th><th>交作业</th><th>质量</th><th>面批</th></tr></thead>
        <tbody>${hwRows.map((r)=>`<tr data-id="${r.id}" class="${r.status==="缺交"||r.quality==="错题较多"?"hw-bad":""}"><td>${r.seq??""}</td><td>${r.name}</td><td>${r.flag||""}</td><td>${r.status}</td><td>${r.quality}</td><td>${r.reviewed?"已面批":`<button type="button" data-rv="${r.id}">面批</button>`}</td></tr>`).join("")}</tbody></table></div>` : `<div class="row-actions">${sts.slice(0, 16).map((s)=>`<button type="button" data-rv="${s.id}">${s.name}</button>`).join("")}</div>`}
    </div>
    ${lessons.length ? `<h3>最近课堂记录</h3>
      <div class="paper scroll-table"><table><thead><tr><th>日期</th><th>课题</th><th>课型</th><th>备课</th><th>缺交</th><th>纪要</th></tr></thead>
      <tbody>${lessons.slice(0, 10).map((l)=>`<tr><td>${l.date}</td><td>${l.topic}</td><td>${l.style}</td><td>${l.prepUsed?"有":"不足"}</td><td>${l.homeworkMissing??"—"}</td><td>${(l.notes||[])[0]||""}</td></tr>`).join("")}</tbody></table></div>` : ""}`;
  host.querySelector("#do-prep").onclick = () => {
    const r = prepareLesson(state, {
      topic: host.querySelector("#topic").value,
      depth: Number(host.querySelector("#depth").value),
      homework: host.querySelector("#hw").value,
    });
    toast(r.text);
    persist(); render();
  };
  host.querySelector("#do-teach").onclick = () => {
    const sid = host.querySelector("#call").value || null;
    if (sid) selectedId = sid;
    const r = teach(state, host.querySelector("#style").value, sid);
    toast(r.text);
    persist(); render();
  };
  host.querySelectorAll("[data-rv]").forEach((b) => {
    b.onclick = (ev) => {
      ev.stopPropagation();
      selectedId = b.dataset.rv;
      const r = reviewHomework(state, b.dataset.rv);
      toast(r.ok ? r.text : r.reason);
      persist(); render();
    };
  });
  host.querySelectorAll("tr[data-id]").forEach((tr) => {
    tr.onclick = () => { selectedId = tr.dataset.id; view = "profile"; render(); };
  });
}

function viewPlacement(host) {
  const c = state.cohorts[state.player.cohortYear];
  const sts = (c?.students || []).filter((s) => !s.repeat);
  const mine = sts.filter((s) => s.classNo === state.player.classNo);
  const p1done = !!(c && (c.trackSplit || c.placed1 || state.flags[`place1-${state.player.cohortYear}`]));
  const p2done = !!(c && (c.placed2 || state.flags[`place2-${state.player.cohortYear}`]));
  const byTier = {};
  for (const s of sts) {
    const k = `${s.track || "mixed"}|${s.tier}`;
    byTier[k] ??= { track: s.track, tier: s.tier, n: 0, classes: {} };
    byTier[k].n++;
    byTier[k].classes[s.classNo] = (byTier[k].classes[s.classNo] || 0) + 1;
  }
  const p1moves = sts.filter((s) => s.placement1 && s.placement1.from !== s.placement1.to);
  const p2moves = sts.filter((s) => s.placement2 && s.placement2.from !== s.placement2.to);
  const in16 = p1moves.filter((s) => s.placement1.to === state.player.classNo);
  const out16 = p1moves.filter((s) => s.placement1.from === state.player.classNo && s.placement1.to !== state.player.classNo);
  const p2in = p2moves.filter((s) => s.placement2.to === state.player.classNo);
  const p2out = p2moves.filter((s) => s.placement2.from === state.player.classNo && s.placement2.to !== state.player.classNo);
  const report = listExamReports(state, { entryYear: state.player.cohortYear })[0];
  const classRows = (report?.classes || []).filter((x) => !x.repeat).sort((a, b) => a.classNo - b.classNo);
  const sameTier = classRows.filter((x) => x.tier === (mine[0]?.tier || "zhuoxing"));
  host.innerHTML = `<h3>分班调整</h3>
    <p class="notice">两次分班不得混为一谈。第一次在高一上期末后：文理分科，并在凌霄及以下做梯队晋级淘汰；云岫 0/1 班不按普通淘汰踢出实验班，2—4 班保持顶尖梯队。第二次在高一下期末后：不再分文理、不跨梯队，只在同科类同层次内部均衡重组，0/1 班保持稳定。</p>
    <div class="kpi">
      <div><span>第一次分班（文理+梯队）</span><b>${p1done ? "已完成" : "未到或未做"}</b></div>
      <div><span>第二次分班（同层均衡）</span><b>${p2done ? "已完成" : "未到或未做"}</b></div>
      <div><span>任教班</span><b>${state.player.cohortYear}级卓行${state.player.classNo}班 · ${mine.length}人</b></div>
    </div>
    <div class="paper">
      <h3>当前编制（${p1done ? "已分科" : "分科前"}）</h3>
      <table><thead><tr><th>科类</th><th>层次</th><th>人数</th><th>班级</th></tr></thead>
      <tbody>${Object.values(byTier).sort((a,b)=>String(a.tier).localeCompare(String(b.tier))).map((g)=>`<tr><td>${g.track==="wen"?"文科":g.track==="li"?"理科":"未分科"}</td><td>${tierLabel(g.tier)}</td><td>${g.n}</td><td>${Object.entries(g.classes).sort((a,b)=>a[0]-b[0]).map(([n,c])=>`${n}班${c}人`).join("、")}</td></tr>`).join("")}</tbody></table>
    </div>
    <h3>第一次分班去向</h3>
    ${p1done ? `<p class="notice">全年级跨班调整 ${p1moves.length} 人。进入卓行${state.player.classNo}班 ${in16.length} 人，从本班调出 ${out16.length} 人。0/1 班只做文理互换，不按普通淘汰降到卓行或笃学。</p>
      <div class="scroll-table paper"><table><thead><tr><th>姓名</th><th>原班</th><th>新班</th><th>科类</th></tr></thead>
      <tbody>${[...in16, ...out16].slice(0, 80).map((s)=>`<tr class="${s.classNo===state.player.classNo?"me":""}"><td>${s.name}</td><td>${s.placement1.from}班</td><td>${s.placement1.to}班</td><td>${s.track==="wen"?"文":"理"}</td></tr>`).join("") || "<tr><td colspan='4'>本班名单未发生跨班调整。</td></tr>"}</tbody></table></div>` : `<p class="notice">还没做第一次分班。用「下一阶段」推到高一上期末后的分班事件即可自动结算。</p>`}
    <h3>第二次分班（同层同科类均衡）</h3>
    ${p2done ? `<p class="notice">只在同一层次、同一科类的原有班级之间蛇形重组，不重新分文理，也不跨到凌霄或笃学。全年级同层换班 ${p2moves.length} 人；进入本班 ${p2in.length} 人，调出 ${p2out.length} 人。0/1 班保持不动。</p>
      ${sameTier.length ? `<div class="paper"><p class="muted">同层次班级对照（最近一场考试均分，由个人成绩加总）</p>
        <table><thead><tr><th>班</th><th>人数</th><th>均分</th><th>最高</th></tr></thead>
        <tbody>${sameTier.map((x)=>`<tr class="${x.classNo===state.player.classNo?"me":""}"><td>${x.name||x.classNo+"班"}</td><td>${x.count}</td><td>${x.avg}</td><td>${x.max}</td></tr>`).join("")}</tbody></table></div>` : ""}
      <div class="scroll-table paper"><table><thead><tr><th>姓名</th><th>原班</th><th>新班</th><th>层次</th><th>科类</th></tr></thead>
      <tbody>${[...p2in, ...p2out].map((s)=>`<tr class="${s.classNo===state.player.classNo?"me":""}"><td>${s.name}</td><td>${s.placement2.from}班</td><td>${s.placement2.to}班</td><td>${tierLabel(s.tier)}</td><td>${s.track==="wen"?"文":"理"}</td></tr>`).join("") || "<tr><td colspan='5'>本班在第二次分班中没有换到其他卓行班。</td></tr>"}</tbody></table></div>` : `<p class="notice">第二次分班要等第一次完成、并且高一下学期期末之后。推进校历时会按规则自动重组，可在本页查看换班名单和同层对照，不会与第一次的文理分科、跨梯队调整混在一起。</p>`}`;
}

function examOptions() {
  const list = listExamReports(state, { entryYear: state.player.cohortYear });
  if (!list.length) return "";
  if (!examPick || !list.some((e) => `${e.date}|${e.examId}` === examPick)) examPick = `${list[0].date}|${list[0].examId}`;
  return list.map((e) => {
    const v = `${e.date}|${e.examId}`;
    return `<option value="${v}" ${v===examPick?"selected":""}>${e.date} ${e.examName}（难度${(e.difficulty||1).toFixed(2)}）</option>`;
  }).join("");
}

function currentReport() {
  const list = listExamReports(state, { entryYear: state.player.cohortYear });
  return list.find((e) => `${e.date}|${e.examId}` === examPick) || list[0] || null;
}

function viewGrades(host) {
  const report = currentReport();
  if (!report) {
    host.innerHTML = `<h3>考试成绩</h3><p>还没有考试。可用「下一阶段」跳到第一次月考。</p>`;
    return;
  }
  const mine = (report.rows||[]).filter((r) => r.classNo === state.player.classNo && !r.repeat)
    .sort((a,b)=> (a.rank||0)-(b.rank||0) || b.total-a.total);
  const cut = report.split ? report.cutoffs.li : report.cutoffs.mixed;
  const cutW = report.split ? report.cutoffs.wen : null;
  const note = examSourceNotice(report);
  const isHk = report.examKind === "huikao";
  const passN = isHk ? mine.filter((r)=>r.huikaoPass).length : null;
  host.innerHTML = `<h3>考试成绩 · 任教班</h3>
    <div class="filters"><label>场次 <select id="exsel">${examOptions()}</select></label></div>
    ${note?`<p class="notice">${note}</p>`:""}
    <div class="kpi">
      <div><span>试卷难度</span><b>${(report.difficulty||1).toFixed(3)}</b></div>
      ${isHk?`<div><span>班内校内合格</span><b>${passN} / ${mine.length}</b></div><div><span>合格标准</span><b>卷面 60%</b></div>`:`<div><span>${report.split?"理科":""}一本线（第${cut?.firstN}名）</span><b>${cut?.firstLine ?? "—"}</b></div>
      <div><span>二本线（第${cut?.secondN}名）</span><b>${cut?.secondLine ?? "—"}</b></div>
      <div><span>线差分</span><b>${cut && cut.firstLine-cut.secondLine}</b></div>
      <div><span>年级第一/第二差</span><b>${cut?.topGap ?? "—"}</b></div>`}
    </div>
    ${!isHk && cutW?`<p class="notice">文科一本线 ${cutW.firstLine}（第${cutW.firstN}名），二本线 ${cutW.secondLine}，分差 ${cutW.firstLine-cutW.secondLine}。分数线由当次个人成绩排序得出，难度变化时会明显波动。</p>`:""}
    <div class="paper"><table><thead><tr><th>班名次</th><th>姓名</th><th>总分</th><th>年级名次</th><th>${isHk?"校内合格":"上线"}</th></tr></thead>
    <tbody>${mine.map((r,i)=>`<tr data-id="${r.studentId}"><td>${i+1}</td><td>${r.name}</td><td>${r.total}</td><td>${r.rank||"—"}</td><td>${isHk?(r.huikaoPass?"合格":"不合格"):(r.line||"")}</td></tr>`).join("")}</tbody></table></div>`;
  host.querySelector("#exsel").onchange = (e) => { examPick = e.target.value; render(); };
  host.querySelectorAll("tr[data-id]").forEach((tr)=>tr.onclick=()=>{selectedId=tr.dataset.id; view="profile"; render();});
}

function viewOffice(host) {
  const all = listExamReports(state);
  const byDate = {};
  for (const r of all) (byDate[r.date+" "+r.examName] ??= []).push(r);
  const names = Object.keys(byDate);
  if (!names.length) { host.innerHTML = "<h3>教务处</h3><p>暂无全校成绩。</p>"; return; }
  const pick = examPick && names.find((n)=>n.includes(examPick.split("|")[0])) || names[0];
  const reports = byDate[pick] || byDate[names[0]];
  const report = reports.find((r)=>r.entryYear==null) || reports[0];
  // 合并同年级：list already per cohort; 选玩家当前年级或可筛选
  const gradeRep = reports.find((r) => r.grade === 1 || r.grade) || reports[0];
  const use = hydrateReport(JSON.parse(JSON.stringify(gradeRep)));
  // allow choosing any stored report
  const flat = all;
  const cur = flat.find((e)=> `${e.date}|${e.examId}|${e.grade}` === examPick) || flat[0];
  const live = hydrateReport(cur);
  const tiers = [["all","全部层次"],["yunxiu_exp","云岫实验 0/1"],["yunxiu_key","云岫重点 2—4"],["lingxiao","凌霄"],["zhuoxing","卓行"],["duxue","笃学"],["yiti","艺体"],["fuzhuo","复卓"]];
  const tracks = live.split ? [["all","文理全部"],["li","理科"],["wen","文科"]] : [["all","未分科"]];
  host.innerHTML = `<h3>教务处 · 全校成绩</h3>
    <div class="filters">
      <label>场次 <select id="exsel">${flat.map((e)=>{const v=`${e.date}|${e.examId}`; return `<option value="${v}" ${`${e.date}|${e.examId}`===`${live.date}|${live.examId}`?"selected":""}>${e.date} ${e.examName} · 高${e.grade}</option>`;}).join("")}</select></label>
      <label>层次 <select id="tier">${tiers.map(([v,n])=>`<option value="${v}">${n}</option>`).join("")}</select></label>
      <label>科类 <select id="track">${tracks.map(([v,n])=>`<option value="${v}">${n}</option>`).join("")}</select></label>
    </div>
    <div id="office-body"></div>`;
  const sel = host.querySelector("#exsel");
  sel.value = `${live.date}|${live.examId}`;
  sel.onchange = () => { examPick = sel.value; render(); };
  const draw = () => {
    const tier = host.querySelector("#tier").value;
    const track = host.querySelector("#track").value;
    let rows = filterRows(live.rows||[], { tier: tier==="all"?null:tier, track: track==="all"?null:track, repeat: false });
    rows = rows.slice().sort((a,b)=>b.total-a.total).map((r,i)=>({...r, showRank:i+1}));
    const body = host.querySelector("#office-body");
    const cut = live.split ? (track==="wen"?live.cutoffs.wen:live.cutoffs.li) : live.cutoffs.mixed;
    const subjects = live.subjectIds || [];
    const toppers = live.toppers || {};
    const scope = tier==="all" ? (track==="wen"?"wen":track==="li"?"li":"all") : tier;
    const topSet = toppers[scope] || toppers.all || {};
    const topLine = subjects.map((id)=> {
      const t = topSet[id];
      const nm = (subjectById(id)||{name:id}).name;
      return t ? `${nm}第一：${t.name}（${t.score}）` : "";
    }).filter(Boolean).join("　");
    const classTable = (live.classes||[]).filter((c)=> (tier==="all"||c.tier===tier) && !c.repeat);
    body.innerHTML = `
      <p class="notice">难度 ${(live.difficulty||1).toFixed(3)}　离散 ${(live.dispersion||1).toFixed(3)}。${live.split?"文理分列划线。":"分科前按全年级第400/1000名划线。"}班级汇总全部由个人成绩加总，不另造统计。${examSourceNotice(live)?" "+examSourceNotice(live):""}</p>
      ${live.examKind==="huikao"?`<div class="kpi"><div><span>校内合格标准</span><b>卷面 60%</b></div><div><span>合格人数</span><b>${(live.rows||[]).filter((r)=>!r.repeat && r.huikaoPass).length}</b></div><div><span>第一名</span><b>${cut?.top??"—"}</b></div></div>`:`<div class="kpi"><div><span>一本线</span><b>${cut?.firstLine??"—"}</b></div><div><span>二本线</span><b>${cut?.secondLine??"—"}</b></div><div><span>分差</span><b>${cut?cut.firstLine-cut.secondLine:"—"}</b></div><div><span>第一名</span><b>${cut?.top??"—"}</b></div></div>`}
      <p class="notice">${topLine}</p>
      <h3>各班对照</h3>
      <div class="paper"><table><thead><tr><th>班</th><th>层次</th><th>人数</th><th>均分</th><th>最高</th><th>一本</th><th>一本率</th><th>二本累计</th></tr></thead>
      <tbody>${classTable.map((c)=>`<tr><td>${c.name||c.classNo+"班"}</td><td>${c.tier}</td><td>${c.count}</td><td>${c.avg}</td><td>${c.max}</td><td>${c.firstCount}</td><td>${c.firstRate}%</td><td>${c.secondCount}</td></tr>`).join("")}</tbody></table></div>
      <h3>学生总分与单科（当前筛选 ${rows.length} 人）</h3>
      <div class="paper"><table><thead><tr><th>筛选名次</th><th>姓名</th><th>班级</th><th>总分</th><th>${subjects.slice(0,8).map(id=>(subjectById(id)||{name:id}).name).join("</th><th>")}</th><th>上线</th></tr></thead>
      <tbody>${rows.slice(0,200).map((r)=>`<tr data-id="${r.studentId}"><td>${r.showRank}</td><td>${r.name}</td><td>${r.classNo}班</td><td>${r.total}</td>${subjects.slice(0,8).map(id=>`<td>${r[id]??""}</td>`).join("")}<td>${r.line||""}</td></tr>`).join("")}</tbody></table>
      ${rows.length>200?"<p class='muted'>仅显示前 200 人，可用层次筛选缩小范围。点击姓名可看该生档案曲线。</p>":""}</div>`;
      body.querySelectorAll("tr[data-id]").forEach((tr) => {
        tr.onclick = () => { selectedId = tr.dataset.id; view = "profile"; render(); };
      });
  };
  host.querySelector("#tier").onchange = draw;
  host.querySelector("#track").onchange = draw;
  draw();
}

function viewAdmission(host) {
  const keys = Object.keys(state.admissions||{}).sort().reverse();
  if (!keys.length) { host.innerHTML = "<h3>录取去向</h3><p>还没有走完高考录取。可用自动模式跳到本届高考。</p>"; return; }
  const key = keys[0];
  const pack = state.admissions[key];
  const list = pack.results || [];
  const qb = list.filter((x)=>x.qingbei);
  const first = list.filter((x)=>x.batch==="一批");
  host.innerHTML = `<h3>${pack.year}年高考录取</h3>
    <p class="notice">对照江西${pack.year}年公开省控线。院校投档与省位次以 2020 年公开投档线和一分一段为底；其他年份按当年与 2020 年省控分差平移，表格中会标明，不是当年完整投档表或一分一段。艺体生目前只对照文化课成绩，尚未收录术科专业分，不编造术科分。师范意向只影响在已有院校池中的匹配偏好，没有单独的师范提前批投档表。不随机派校名，也不为喜报虚造清北。</p>
    <div class="kpi"><div><span>清北</span><b>${qb.length}</b></div><div><span>一批</span><b>${first.length}</b></div><div><span>公布人数</span><b>${list.length}</b></div></div>
    <div class="filters"><input id="q" placeholder="搜索姓名或大学" /></div>
    <div class="paper" id="adm-table"></div>`;
  const draw = () => {
    const q = (host.querySelector("#q").value||"").trim();
    const rows = list.filter((a)=>!q || a.name.includes(q) || (a.university||"").includes(q));
    host.querySelector("#adm-table").innerHTML = `<table><thead><tr><th>姓名</th><th>班</th><th>科类</th><th>总分</th><th>省位次</th><th>批次</th><th>去向</th></tr></thead>
      <tbody>${rows.slice(0,250).map((a)=>`<tr><td>${a.name}</td><td>${a.classNo}</td><td>${a.track==="wen"?"文":"理"}</td><td>${a.total}</td><td>${a.provinceRank??"—"}</td><td>${a.batch}</td><td>${a.university}${a.shifted?"（按省控平移）":""}${a.art?"（文化课对照，无术科分）":""}</td></tr>`).join("")}</tbody></table>`;
  };
  host.querySelector("#q").oninput = draw; draw();
}

function viewAuto(host) {
  host.innerHTML = `<h3>自动模式</h3>
    <p class="notice">不必亲自备课上课，也可按考试阶段推进。跳过时仍会走完校历、生成该次真实成绩与排名，并写入存档。第一届高考、录取、毕业后游戏继续：学生离校或进入复卓，低年级升级，新高一入学。</p>
    <div class="row-actions">
      <button type="button" class="accent" id="n1">下一阶段</button>
      <button type="button" id="n2">跳到本届高考录取</button>
      <button type="button" id="n3">再推进到下一届入学</button>
    </div>
    <p class="notice" id="auto-msg">当前 ${formatDateCn(state.date)}，任教 ${state.player.cohortYear} 级。</p>`;
  host.querySelector("#n1").onclick = () => handleAct("skip");
  host.querySelector("#n2").onclick = () => {
    toast("正在自动推进到高考录取，请稍候…");
    setTimeout(() => {
      skipToGaokaoOf(state, state.player.cohortYear);
      persist(); render();
      toast("已到达本届高考录取（若校历已过则停在当前）");
    }, 20);
  };
  host.querySelector("#n3").onclick = () => {
    toast("正在进入下一届…");
    setTimeout(() => {
      skipToGaokaoOf(state, state.player.cohortYear);
      skipToNextCohort(state);
      persist(); render();
      toast("已尝试推进到下一届入学");
    }, 20);
  };
}

function viewLog(host) {
  host.innerHTML = `<h3>日志</h3>${(state.log||[]).slice(0,40).map((l)=>`<div class="log-item"><b>${l.date}</b> ${l.text}</div>`).join("")}`;
}

function viewSave(host) {
  const slots = listSlots();
  host.innerHTML = `<h3>存档 / 读档</h3>
    <p class="notice">刷新页面后可通过「继续存档」读取自动档。也可存到 3 个手动槽，或下载 JSON。</p>
    <div class="row-actions">
      <button type="button" id="auto-save">立刻自动保存</button>
      <button type="button" id="dl">下载存档文件</button>
      <label class="notice">读入文件 <input type="file" id="up" accept="application/json,.json" /></label>
    </div>
    <div class="paper">${[0,1,2].map((i)=>{
      const sl = slots.find((s)=>s.slot===i);
      return `<p>槽 ${i+1}：${sl && !sl.empty ? `${sl.date||""} ${sl.player||""}` : "空"}
        <button type="button" data-sv="${i}">保存</button>
        <button type="button" data-ld="${i}">读取</button></p>`;
    }).join("")}</div>`;
  host.querySelector("#auto-save").onclick = () => { persist(); toast("已自动保存"); };
  host.querySelector("#dl").onclick = () => {
    const blob = new Blob([toJSON(state)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `sanchi-jiangtai-${state.date}.json`;
    a.click();
  };
  host.querySelector("#up").onchange = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    state = fromJSON(await f.text()); render(); toast("已读入文件存档");
  };
  host.querySelectorAll("[data-sv]").forEach((b)=>b.onclick=()=>{ saveSlot(state, Number(b.dataset.sv)); toast("已保存"); render(); });
  host.querySelectorAll("[data-ld]").forEach((b)=>{
    b.onclick=()=>{ const s=loadSlot(Number(b.dataset.ld)); if(!s){toast("空槽");return;} state=s; render(); toast("已读取"); };
  });
}

function renderAgenda() {
  const box = $("#agenda");
  const next = SCHOOL_CALENDAR.find((e) => e.date >= state.date && ["exam","placement1","placement2","admission","promote"].includes(e.kind));
  const cls = clsStudents();
  box.innerHTML = `<h3>今日</h3>
    <p>${formatDateCn(state.date)}</p>
    <p class="notice">备课充分度 ${state.player.prep||0}　数学教学积累 ${Number(state.player.mathTeaching||0).toFixed(1)}</p>
    <p class="notice">下一件大事：${next ? `${next.date} ${next.name}` : "（暂无）"}</p>
    <h3>任教班</h3>
    <p class="notice">${state.player.cohortYear}级卓行${state.player.classNo}班，${cls.length}人。班主任 ${state.player.homeroom}。</p>
    <div class="row-actions"><button type="button" data-act="skip">跳到下一阶段</button></div>
    <h3>最近日志</h3>
    ${(state.log||[]).slice(0,8).map((l)=>`<div class="log-item"><b>${l.date}</b> ${l.text}</div>`).join("")}`;
  box.querySelector("[data-act=skip]").onclick = () => handleAct("skip");
}
