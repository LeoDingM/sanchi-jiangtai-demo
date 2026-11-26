import {
  createGame, playerStudents, skipToNextStage, skipToGaokaoOf, skipToNextCohort,
  advanceDay, advancePeriod, prepareLesson, teach, talkTo, reviewHomework, listExamReports, formatDateCn,
  applyEvent, SCHOOL_CALENDAR, gradeOf, topicsForGrade, LESSON_STYLES,
  formatGradeTerm, describePlayerStage, describeStageAdvance, describeAdmissionContext,
  suggestedTopic, topicProgress, homeworkWatchlist, studentTeachingContext,
  urgeHomework, checkCorrection, officeMarking, consultHomeroom, consultMentor,
  daySchedule, currentSlot, formatSlotLabel, upcomingMath, upcomingTutoring,
  tutorEvening, raisedHands, seatLabel, periodTalkScene, isTutoringSlot,
  homeroomEveningRoll, placementSeatNotice, cohortPlacementStage, studentRecentStatus,
  meetParent, isParentsMeetingOpen, upcomingParentsMeeting, PARENT_TALK_CAP, PARENTS_SOURCE_NOTE,
} from "../domain/simulation.js";
import { parentTalkPriority, composeParentBrief } from "../domain/parents.js";
import { saveSlot, loadSlot, listSlots, toJSON, fromJSON } from "../domain/save.js";
import { subjectById, SUBJECTS_G1 } from "../domain/config.js";
import { filterRows, sameTierCompare } from "../domain/examService.js";
import { hydrateReport } from "../domain/simulation.js";
import { renderSeating } from "./classroom.js";
import { provincialLines } from "../domain/jiangxi.js";
import { describeSchoolCutoff, describeClassProvincial, describeZhuoxingPeers, describeSchoolProvincial } from "../domain/schoolLines.js";
import { studentExamHistory, tierName, findStudentInState } from "../domain/studentHistory.js";
import { drawScoreChart, drawRankChart } from "./charts.js";
import {
  loadAiSettings, saveAiSettings, clearAiKey, maskApiKey,
  loadGodSettings, saveGodSettings, officialHomeroomName,
  playerSubjectName, analysisScope, isPlayerHomeroom, isActingHomeroom,
  buildExamAnalysisPayload, requestExamAnalysis, canAnalyzeReport,
} from "../domain/examAi.js";

let state = null;
let view = "classroom";
let selectedId = null;
let examPick = "";
let subjectPick = "math";
let toastTimer = 0;
const examAiCache = new Map();
let examAiBusy = false;

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
  const hold = Math.min(8000, 2800 + String(msg || "").length * 35);
  toastTimer = setTimeout(() => el.classList.add("hidden"), hold);
}

function persist() {
  if (state) saveSlot(state, "auto");
}

function syncChrome() {
  const bar = $("#topbar");
  if (bar) document.documentElement.style.setProperty("--topbar-h", `${bar.offsetHeight}px`);
}

let sidenavHintOff = false;
let agendaSchedOpen = false;
let lastNarrowAgenda = null;

function syncSidenavHint() {
  const nav = $("#sidenav");
  const wrap = nav?.closest(".sidenav-wrap");
  if (!nav || !wrap) return;
  if (nav.clientWidth <= 0) return;
  const overflow = nav.scrollWidth > nav.clientWidth + 2;
  const atStart = nav.scrollLeft <= 2;
  const atEnd = nav.scrollLeft + nav.clientWidth >= nav.scrollWidth - 2;
  wrap.classList.toggle("is-overflow", overflow);
  wrap.classList.toggle("at-start", atStart);
  wrap.classList.toggle("at-end", atEnd);
  if (overflow && !atStart) sidenavHintOff = true;
  if (sidenavHintOff) wrap.classList.add("hint-off");
  const hint = wrap.querySelector(".sidenav-hint");
  if (hint) hint.hidden = !(overflow && !sidenavHintOff);
}

export function boot() {
  syncChrome();
  const nav = $("#sidenav");
  if (nav) nav.addEventListener("scroll", syncSidenavHint, { passive: true });
  window.addEventListener("resize", () => {
    syncChrome();
    syncSidenavHint();
    if (!state) return;
    const narrow = window.matchMedia("(max-width: 600px)").matches;
    if (lastNarrowAgenda !== null && narrow !== lastNarrowAgenda) renderAgenda();
  });
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
  if (act === "teach") {
    const r = teach(state, "精讲例题", selectedId);
    toast(r.ok === false ? (r.reason || r.text) : (r.text || "已上完一节数学课"));
  }
  if (act === "nextperiod") {
    const r = advancePeriod(state);
    toast(r.settled ? (r.text || `结算：${r.type}`) : (r.text || r.reason || "已到下一节"));
  }
  if (act === "nextday") {
    const r = advanceDay(state);
    if (r.type && r.type !== "day") toast(`结算：${r.type}`);
    else if (r.text) toast(r.text);
  }
  if (act === "skip") {
    const r = skipToNextStage(state);
    toast(r.ok ? (r.message || `已推进到 ${r.event.name}`) : (r.reason || "无法推进"));
  }
  persist();
  render();
}

function render() {
  if (!state) return;
  const grade = gradeOf(state.player.cohortYear, state.date);
  const term = formatGradeTerm(grade, state.date);
  const dateShort = formatDateCn(state.date).replace(/ 星期.?$/, "");
  const sub = $("#school-sub");
  if (sub) {
    const gradeBit = grade >= 1 && grade <= 3 ? term.replace("学期", "") : term;
    sub.textContent = `江西省宁川中学 · ${dateShort} · ${state.player.cohortYear}级${gradeBit}`;
  }
  syncChrome();
  $("#clock").textContent = formatDateCn(state.date);
  const gradeEl = $("#gradeline");
  if (gradeEl) gradeEl.textContent = `你带的${state.player.cohortYear}级 · ${term}`;
  const slot = currentSlot(state);
  const periodEl = $("#periodline");
  if (periodEl) {
    const tag = slot?.isTutoring ? " · 可答疑" : slot?.isMath ? " · 数学课" : slot?.isExamDay ? " · 停课" : slot?.id === "rest" ? " · 休息" : "";
    periodEl.textContent = (slot ? formatSlotLabel(slot) : "") + tag;
  }
  $("#roleline").textContent = `${state.player.role} ${state.player.name} · ${state.player.cohortYear}级卓行${state.player.classNo}班 ${playerSubjectName(state.player)}`;
  document.querySelectorAll("#sidenav [data-view]").forEach((b) => b.classList.toggle("on", b.dataset.view === view));
  const host = $("#view");
  const map = { classroom: viewClassroom, roster: viewRoster, profile: viewProfile, teach: viewTeach, placement: viewPlacement, grades: viewGrades, office: viewOffice, admission: viewAdmission, auto: viewAuto, log: viewLog, save: viewSave, settings: viewSettings };
  host.innerHTML = "";
  (map[view] || viewClassroom)(host);
  renderAgenda();
  syncSidenavHint();
}

function clsStudents() { return playerStudents(state); }


function teachingStatus(s) {
  return studentRecentStatus(s, state, { placed: cohortPlacementStage(state) > 0 });
}


function fmtJointCut(c, label) {
  if (!c) return "";
  return `${label}一本 ${c.firstLine}（第${c.firstN}名 / ${c.n}人）　二本 ${c.secondLine}（第${c.secondN}名）　分差 ${c.gap}`;
}

function jointLinesBlock(report) {
  const j = report.joint || {};
  const kind = report.examKind;
  const cards = [];
  cards.push(`<div><span>试卷难度</span><b>${(report.difficulty||1).toFixed(3)}</b></div>`);
  if (kind === "province" && j.province?.li) {
    cards.push(`<div><span>省理科一本</span><b>${j.province.li.firstLine}</b></div>`);
    cards.push(`<div><span>省理科二本</span><b>${j.province.li.secondLine}</b></div>`);
    cards.push(`<div><span>省理分差</span><b>${j.province.li.gap}</b></div>`);
  }
  if (j.city?.li) {
    cards.push(`<div><span>市理科一本</span><b>${j.city.li.firstLine}</b></div>`);
    cards.push(`<div><span>市理科二本</span><b>${j.city.li.secondLine}</b></div>`);
  }
  if (j.county?.li) {
    cards.push(`<div><span>县理科一本</span><b>${j.county.li.firstLine}</b></div>`);
    cards.push(`<div><span>县理科二本</span><b>${j.county.li.secondLine}</b></div>`);
  }
  const lines = [];
  if (kind === "province") {
    if (j.province?.li) lines.push(fmtJointCut(j.province.li, "省理科"));
    if (j.province?.wen) lines.push(fmtJointCut(j.province.wen, "省文科"));
  }
  if (j.city?.li) lines.push(fmtJointCut(j.city.li, "市理科"));
  if (j.city?.wen) lines.push(fmtJointCut(j.city.wen, "市文科"));
  if (j.county?.li) lines.push(fmtJointCut(j.county.li, "县理科"));
  if (j.county?.wen) lines.push(fmtJointCut(j.county.wen, "县文科"));
  return `<div class="kpi">${cards.join("")}</div><p class="notice">${lines.join("<br/>")}</p>`;
}

function examSourceNotice(report) {
  if (!report) return "";
  if (report.examKind === "huikao") {
    return report.sourceNote || "此为高二学业水平考试的校内合格记载：单科达到卷面满分 60% 记为合格。日期为校历示意，未按某年省教育考试院公告逐条核对；未收录公开会考合格线，不以校内一本/二本线作为本场主要结果。文理交叉科目尚未单独建模。";
  }
  if (report.examKind === "city" || report.examKind === "province") {
    return report.sourceNote || "按公开高考规模模拟的联考位次/划线，不是当年官方联考一分一段。校内线按上一届高考本校省控实际人数划线，只作校内对照，不冒充市线或省线。";
  }
  return report.sourceNote || "";
}

function seatMarks(students) {
  const slot = currentSlot(state);
  const watch = new Set(homeworkWatchlist(state.homework, state).map((r) => r.id));
  const hands = slot?.isTutoring ? new Set(raisedHands(state, students).map((s) => s.id)) : new Set();
  const marks = {};
  for (const s of students) {
    marks[s.id] = {
      hand: hands.has(s.id),
      watch: watch.has(s.id),
      drowsy: s.lastClassFlag === "走神" || (s.energy ?? 70) < 48,
    };
  }
  return marks;
}

function eveningRollPanel() {
  const roll = state.eveningRoll;
  const slotKey = `${state.date}|${state.periodId}`;
  const live = roll?.slotKey === slotKey ? roll : null;
  const btn = `<div class="row-actions"><button type="button" class="accent" data-roll="1">请班主任点名</button></div>`;
  if (!live) return `${btn}`;
  const items = live.items || [];
  const status = live.called ? "已点过名" : (live.handed ? "名单已交给班主任，待点名" : "待点名");
  const lines = items.slice(0, 8).map((x) => `${x.seat}${x.name}（${(x.reasons||[]).join("、")}）`).join("、");
  return `<p>晚自习点名名单 · ${status}${items.length ? ` · ${items.length} 人` : ""}</p>
    ${items.length ? `<p class="muted">${lines}${items.length > 8 ? " 等" : ""}。</p>` : `<p class="muted">名单上暂时没有要单独点的人。</p>`}
    ${live.called ? "" : btn}`;
}

function deskPanelHtml(student, slot, scene) {
  const tutorBtns = slot?.isTutoring
    ? `<div class="row-actions">
        <button type="button" class="accent" data-tutor="巡视">巡视</button>
        <button type="button" data-tutor="小组">小组答疑</button>
        <button type="button" data-tutor="收订正">收订正</button>
      </div>
      ${eveningRollPanel()}`
    : "";
  if (!student) {
    return `<h3>座位</h3>
      <p class="muted">点一名学生的座位，按当前课时在教室里处理：数学课上可以提醒，晚自习可以答疑，别的课只能在走廊门口简短谈话。任教班约 73 人。</p>
      ${tutorBtns}`;
  }
  const ctx = studentTeachingContext(student, state);
  const hw = ctx?.hw;
  const hwLine = hw
    ? (hw.correction || hw.status || "") + (hw.topic ? ` · 「${hw.topic}」` : "")
    : "还没有本班作业记录";
  const leftTalk = Math.max(0, scene.cap - (state.talksThisPeriod || 0));
  const dayLeft = Math.max(0, 5 - (state.talksToday || 0));
  const extra = [];
  if (slot?.isTutoring) extra.push(`<button type="button" class="accent" data-tutor="答疑" data-sid="${student.id}">到座位答疑</button>`);
  if (hw && (hw.correction === "待补交" || hw.status === "缺交")) extra.push(`<button type="button" data-urge="${student.id}">催交</button>`);
  if (hw && hw.correction === "已订正待复查") extra.push(`<button type="button" data-chk="${student.id}">复查订正</button>`);
  if (hw && (hw.correction === "待面批" || hw.correction === "已补交待面批")) extra.push(`<button type="button" data-rv="${student.id}">面批</button>`);
  const talks = ["鼓励", "询问学习", "关注状态", "谈心"].map((x) => `<button type="button" data-talk="${x}">${x}</button>`).join("");
  return `<h3>${student.name}</h3>
    <p>${seatLabel(student)}　${student.personality || ""}　师生关系 ${student.relation || 0}</p>
    <p class="muted">${teachingStatus(student)}</p>
    <p class="muted">作业：${hwLine}${ctx?.flag ? "　课堂：" + ctx.flag : ""}</p>
    ${tutorBtns}
    <div class="row-actions">${extra.join("")}</div>
    <p>谈话（本时段还可 ${leftTalk} 人，本日余 ${dayLeft} 人）</p>
    <div class="row-actions">${talks}</div>
    ${isParentsMeetingOpen(state) ? `<div class="row-actions"><button type="button" class="accent" data-parent="${student.id}" ${student.lastParentMeeting?.date === state.date ? "disabled" : ""}>${student.lastParentMeeting?.date === state.date ? "这场已与家长谈过" : "与家长面谈"}</button></div>` : ""}
    <div class="row-actions"><button type="button" id="to-profile">查看档案</button></div>`;
}

function bindDeskAndTutor(host) {
  host.querySelectorAll("[data-tutor]").forEach((b) => {
    b.onclick = (ev) => {
      ev.stopPropagation();
      const sid = b.dataset.sid || selectedId;
      const r = tutorEvening(state, b.dataset.tutor, sid || null);
      toast(r.ok ? r.text : r.reason);
      persist(); render();
    };
  });
  host.querySelectorAll("[data-roll]").forEach((b) => {
    b.onclick = (ev) => {
      ev.stopPropagation();
      const r = homeroomEveningRoll(state);
      toast(r.ok ? r.text : r.reason);
      persist(); render();
    };
  });
  host.querySelectorAll("[data-talk]").forEach((b) => {
    b.onclick = (ev) => {
      ev.stopPropagation();
      if (!selectedId) { toast("先点一个座位"); return; }
      const r = talkTo(state, selectedId, b.dataset.talk);
      toast(r.ok ? r.text : r.reason);
      persist(); render();
    };
  });
  host.querySelectorAll("[data-urge]").forEach((b) => {
    b.onclick = (ev) => { ev.stopPropagation(); selectedId = b.dataset.urge; const r = urgeHomework(state, b.dataset.urge); toast(r.ok ? r.text : r.reason); persist(); render(); };
  });
  host.querySelectorAll("[data-chk]").forEach((b) => {
    b.onclick = (ev) => { ev.stopPropagation(); selectedId = b.dataset.chk; const r = checkCorrection(state, b.dataset.chk); toast(r.ok ? r.text : r.reason); persist(); render(); };
  });
  host.querySelectorAll("[data-rv]").forEach((b) => {
    b.onclick = (ev) => { ev.stopPropagation(); selectedId = b.dataset.rv; const r = reviewHomework(state, b.dataset.rv); toast(r.ok ? r.text : r.reason); persist(); render(); };
  });
  const to = host.querySelector("#to-profile");
  if (to) to.onclick = () => { view = "profile"; render(); };
}

function viewClassroom(host) {
  const slot = currentSlot(state);
  const sts = clsStudents().slice().sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0) || String(a.id).localeCompare(b.id));
  const marks = seatMarks(sts);
  const scene = periodTalkScene(state);
  const sel = sts.find((s) => s.id === selectedId) || null;
  const nxtT = upcomingTutoring(state);
  let slotLine = slot ? formatSlotLabel(slot) : formatDateCn(state.date);
  if (slot?.isTutoring) slotLine += "。可以巡视、到座位旁答疑、收订正，或请班主任点名";
  else if (slot?.isMath) slotLine += "（本节可上课，也可在座位边提醒）";
  else if (isParentsMeetingOpen(state) || (slot?.isExamDay && state.parentsMeeting?.date === state.date)) slotLine += "（今日家长会，由班主任主持，你可作为数学老师与本班家长面谈）";
  else if (slot?.isExamDay) slotLine += "（今日停课）";
  else if (slot && !slot.isMath && slot.kind !== "break" && slot.id !== "rest") slotLine += "。这节不是数学课，谈话请到走廊门口简短说";
  if (nxtT && !slot?.isTutoring) slotLine += `。下一节可答疑：${nxtT.sameDay ? "" : nxtT.date + " "}${formatSlotLabel(nxtT.slot)}`;
  const seatNote = placementSeatNotice(state);
  host.innerHTML = `<h3>教室座位表</h3>
    ${seatNote ? `<p class="notice">${seatNote}</p>` : ""}
    <p class="notice">现在是${slotLine}。金圈是举手，红点是作业还要盯，颜色偏暗的是走神或精力不足。点击座位按当前课时处理，不必先跳到档案。任教班为卓行16班，约 73 人。</p>
    <div class="classroom-layout">
      <canvas id="classroom"></canvas>
      <div class="desk-panel paper">${deskPanelHtml(sel, slot, scene)}</div>
    </div>`;
  const c = host.querySelector("#classroom");
  const board = slot ? `${formatSlotLabel(slot)} · 卓行16班` : "宁川中学 · 卓行16班";
  renderSeating(c, sts, selectedId, (id) => { selectedId = id; render(); }, { boardTitle: board, marks });
  bindDeskAndTutor(host);
  bindParentActions(host);
}

function viewRoster(host) {
  const sts = clsStudents().slice().sort((a, b) => a.seq - b.seq);
  const seatNote = placementSeatNotice(state);
  host.innerHTML = `<h3>学生名册 · ${sts.length}人</h3>
    ${seatNote ? `<p class="notice">${seatNote} 下表座号为当前编制。</p>` : ""}
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
        ${(s.rollCalls || []).length ? `<p><b>晚自习点名记录</b></p>${(s.rollCalls||[]).map((r)=>`<p class="muted">${r.date}　${r.text}</p>`).join("")}` : ""}
        ${(s.parentMeetings || []).length ? `<p><b>家长会面谈</b></p>${(s.parentMeetings||[]).map((r)=>`<p class="muted">${r.date}　${r.text}</p>`).join("")}` : ""}
        <p class="muted">学科能力（潜能为个人上限，不是当场分数）</p>
        <p>${ab || "—"}</p>
      </div>
      <div class="paper">
        <p>谈话（${(() => { const sc = periodTalkScene(state); return `本时段还可 ${Math.max(0, sc.cap - (state.talksThisPeriod || 0))} 人，本日余 ${Math.max(0, 5 - (state.talksToday || 0))} 人`; })()}）</p>
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



function correctionLabel(r) {
  return r?.correction || (r?.status === "缺交" ? "待补交" : "可归档");
}

function hwActionButtons(r) {
  const c = correctionLabel(r);
  if (c === "待补交") return `<button type="button" data-urge="${r.id}">催交</button>`;
  if (c === "已订正待复查") return `<button type="button" data-chk="${r.id}">复查</button>`;
  if (c === "待订正") return `<span class="muted">等订正</span>`;
  if (c === "已闭环") return "已闭环";
  return `<button type="button" data-rv="${r.id}">面批</button>`;
}

function parentsMeetingHtml() {
  const open = isParentsMeetingOpen(state);
  const nxt = upcomingParentsMeeting(state, SCHOOL_CALENDAR);
  const home = state.player.homeroom;
  if (!open) {
    const when = nxt && nxt.date !== state.date ? `${nxt.date} ${nxt.name || "家长会"}` : "";
    return `<div class="paper lesson-card parents-panel">
      <h3>家长会</h3>
      <p class="muted">家长会由班主任${home}主持，你以本班数学任课老师身份参加，和家长谈该生近期考试、作业订正和课堂表现。${when ? `下场：${when}。` : "校历上尚未排到下一场。"}日期是校内安排，不是某所实校或教育局公告的逐年日期。</p>
    </div>`;
  }
  const used = state.parentTalksThisMeeting || 0;
  const left = Math.max(0, PARENT_TALK_CAP - used);
  const sts = clsStudents().slice().sort((a, b) => parentTalkPriority(b, state) - parentTalkPriority(a, state) || (a.seq ?? 0) - (b.seq ?? 0));
  const rows = sts.map((s) => {
    const done = s.lastParentMeeting?.date === state.date;
    const brief = composeParentBrief(s, state);
    const hint = [brief.exam ? `${brief.exam.examName}校排${brief.exam.rank || "—"}` : "", brief.homeworkText, brief.classroom?.flag || ""].filter(Boolean).join("；");
    return `<div class="parents-row">
      <div>
        <b>${s.name}</b>　<span class="muted">${seatLabel(s)}</span>
        <p class="muted">${done ? "这场已经谈过。" : hint}</p>
      </div>
      <button type="button" data-parent="${s.id}" ${done || left <= 0 ? "disabled" : ""}>${done ? "已谈" : "面谈"}</button>
    </div>`;
  }).join("");
  return `<div class="paper lesson-card parents-panel">
    <h3>${state.parentsMeeting.name || "家长会"}</h3>
    <p class="notice">由班主任${home}主持，你作为数学任课老师在教室一侧和本班家长面谈。这场还可面谈 ${left} / ${PARENT_TALK_CAP} 人。${state.parentsMeeting.sourceNote || PARENTS_SOURCE_NOTE}</p>
    <div class="parents-list">${rows}</div>
  </div>`;
}

function bindParentActions(host) {
  host.querySelectorAll("[data-parent]").forEach((b) => {
    b.onclick = (ev) => {
      ev.stopPropagation();
      selectedId = b.dataset.parent;
      const r = meetParent(state, b.dataset.parent);
      toast(r.ok ? r.text : (r.reason || "无法面谈"));
      persist();
      render();
    };
  });
}

function officeCollabHtml() {
  const watch = homeworkWatchlist(state.homework, state);
  const names = [...new Set(watch.map((r) => r.name))];
  const nxt = upcomingMath(state, { skipTaught: true });
  const slot = currentSlot(state);
  return `<div class="paper lesson-card office-actions">
      <h3>办公室与班主任</h3>
      <p class="muted">现在是${slot ? formatSlotLabel(slot) : formatDateCn(state.date)}。${nxt ? `下一节数学：${nxt.sameDay ? "" : nxt.date + " "}${formatSlotLabel(nxt.slot)}。` : ""}不是空菜单：坐班改作业、向班主任通报、向备课组长请教都会留下记录，并且用确定性规则推进作业订正。</p>
      <div class="row-actions">
        <button type="button" class="accent" id="do-mark">坐班批改</button>
        <button type="button" id="do-home">向班主任通报本班</button>
        <button type="button" id="do-mentor">向备课组长请教</button>
      </div>
      ${names.length ? `<p>需要盯的人：${names.slice(0, 8).join("、")}${names.length > 8 ? "等" : ""}。也可单独通报：</p>
        <div class="row-actions">${watch.slice(0, 8).map((r)=>`<button type="button" data-home="${r.id}">通报${r.name}</button>`).join("")}</div>` : `<p class="muted">眼下没有特别要盯的缺交或订正。仍可和班主任对一下班情，或向${state.player.mentor}请教下一课。</p>`}
    </div>`;
}

function bindOfficeActions(host) {
  const mark = host.querySelector("#do-mark");
  if (mark) mark.onclick = () => { const r = officeMarking(state); toast(r.ok ? r.text : r.reason); persist(); render(); };
  const home = host.querySelector("#do-home");
  if (home) home.onclick = () => { const r = consultHomeroom(state); toast(r.ok ? r.text : r.reason); persist(); render(); };
  const mentor = host.querySelector("#do-mentor");
  if (mentor) mentor.onclick = () => { const r = consultMentor(state); toast(r.ok ? r.text : r.reason); persist(); render(); };
  host.querySelectorAll("[data-home]").forEach((b) => {
    b.onclick = (ev) => { ev.stopPropagation(); selectedId = b.dataset.home; const r = consultHomeroom(state, b.dataset.home); toast(r.ok ? r.text : r.reason); persist(); render(); };
  });
  host.querySelectorAll("[data-urge]").forEach((b) => {
    b.onclick = (ev) => { ev.stopPropagation(); selectedId = b.dataset.urge; const r = urgeHomework(state, b.dataset.urge); toast(r.ok ? r.text : r.reason); persist(); render(); };
  });
  host.querySelectorAll("[data-chk]").forEach((b) => {
    b.onclick = (ev) => { ev.stopPropagation(); selectedId = b.dataset.chk; const r = checkCorrection(state, b.dataset.chk); toast(r.ok ? r.text : r.reason); persist(); render(); };
  });
}


function eveningTutorHtml() {
  const slot = currentSlot(state);
  const nxt = upcomingTutoring(state);
  const sts = clsStudents();
  const hands = slot?.isTutoring ? raisedHands(state, sts) : [];
  const hint = slot?.isTutoring
    ? `现在是${formatSlotLabel(slot)}，可以巡视、到座位旁答疑、做小组讲题、沿过道收订正，或把名单交给班主任点名。这不是新开一节正课，不另算课题进度。`
    : `现在还不是数学晚自习或答疑。${nxt ? `下一节可答疑：${nxt.sameDay ? "" : nxt.date + " "}${formatSlotLabel(nxt.slot)}，请用「下一节」走到那时。` : "这几天课表里没有数学晚自习或答疑。"}`;
  return `<div class="paper lesson-card">
      <h3>晚自习答疑与点名</h3>
      <p class="muted">${hint}</p>
      <div class="row-actions">
        <button type="button" class="accent" data-tutor="巡视">巡视</button>
        <button type="button" data-tutor="小组">小组答疑</button>
        <button type="button" data-tutor="收订正">收订正</button>
        <button type="button" data-roll="1">请班主任点名</button>
      </div>
      ${slot?.isTutoring ? eveningRollPanel() : ""}
      ${hands.length && slot?.isTutoring ? `<p>举手或需要盯的座位：</p><div class="row-actions">${hands.map((s)=>`<button type="button" data-tutor="答疑" data-sid="${s.id}">${s.name}（${seatLabel(s)}）</button>`).join("")}</div>` : ""}
    </div>`;
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
  const watch = homeworkWatchlist(hw, state);
  const openRows = watch;
  const slot = currentSlot(state);
  const planBlock = plan ? `<p><b>课题</b> ${plan.topic}　<b>例题深度</b> ${plan.depth}　<b>作业</b> ${plan.homework}</p>
      <p>${plan.goals || ""}</p>
      <p class="muted">${plan.examples || ""} ${plan.homeworkNote || ""}</p>` : `<p class="muted">还没有教案。先选课题备一节课，再进教室。</p>`;
  const quizLow = (last?.quizAll || last?.quiz || []).slice().sort((a, b) => a.score - b.score).slice(0, 5);
  const hwRows = ((hw?.rows || []).concat((state.homeworkOpen || []).filter((r) => !(r.date === hw?.date && r.topic === hw?.topic)))).slice().sort((a, b) => {
    const rank = (r) => {
      const c = correctionLabel(r);
      if (c === "待补交") return 0;
      if (c === "已补交待面批") return 1;
      if (c === "待面批") return 2;
      if (c === "已订正待复查") return 3;
      if (c === "待订正") return 4;
      if (r.flag === "走神") return 5;
      if (r.reviewed || c === "已闭环") return 9;
      return 6;
    };
    return rank(a) - rank(b) || (a.seq ?? 0) - (b.seq ?? 0);
  });
  const nxt = upcomingMath(state, { skipTaught: true });
  host.innerHTML = `<h3>日常教学 · 数学课</h3>
    <p class="notice">现在是${slot ? formatSlotLabel(slot) : formatDateCn(state.date)}${slot?.isTutoring ? "，可以做晚自习答疑" : slot?.isMath ? "，可以进教室上课" : "。等到数学课再进教室，或先在办公室处理作业、在座位上谈话"}。${nxt && !slot?.isMath && !slot?.isTutoring ? `下一节数学：${nxt.sameDay ? "" : nxt.date + " "}${formatSlotLabel(nxt.slot)}。` : ""}先写教案，再上课；晚自习另做答疑，不另开课题。课后从缺交、错题跟到订正和复查。</p>
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
        ${last ? `<p class="muted">${last.date}　${last.topic} · ${last.style}</p><ol class="notes-list">${(last.notes||[]).map((n)=>`<li>${n}</li>`).join("")}</ol>${last.quiz?`<p class="muted">小测均分 ${last.quizAvg}。前列：${last.quiz.slice(0,5).map((q)=>`${q.name}${q.score}`).join("、")}${quizLow.length?`。偏低：${quizLow.map((q)=>`${q.name}${q.score}`).join("、")}`:""}</p>`:""}` : `<p class="muted">今天还没上数学课。</p>`}
      </div>
    </div>
    ${parentsMeetingHtml()}
    ${eveningTutorHtml()}
    ${officeCollabHtml()}
    <div class="paper lesson-card">
      <h3>作业登记、订正与复查</h3>
      ${hw ? `<p>「${hw.topic}」· ${hw.date}　缺交 ${hw.rows.filter((r)=>r.status==="缺交"||r.correction==="待补交").length} 本，待跟进 ${openRows.length} 人。缺交先催交，错题面批后等订正，交回后再复查。每天最多当面批或复查 6 本。</p>` : `<p class="muted">上完一节课之后，这里会登记全班作业，并从缺交、错题跟到订正和复查。</p>`}
      ${watch.length ? `<p>建议先处理：</p><div class="row-actions">${watch.slice(0, 12).map((s)=>`${s.correction==="待补交"?`<button type="button" data-urge="${s.id}">催${s.name}</button>`:s.correction==="已订正待复查"?`<button type="button" data-chk="${s.id}">复查${s.name}</button>`:`<button type="button" data-rv="${s.id}">${s.name}${s.correction==="已补交待面批"?"（补交）":s.quality==="错题较多"?"（错题）":s.correction==="待订正"?"（待订正）":""}</button>`}`).join("")}</div>` : ""}
      ${hwRows.length ? `<div class="scroll-table"><table class="hw-table"><thead><tr><th>座号</th><th>姓名</th><th>课堂</th><th>交作业</th><th>质量</th><th>订正</th><th>处理</th></tr></thead>
        <tbody>${hwRows.map((r)=>`<tr data-id="${r.id}" class="${r.status==="缺交"||r.quality==="错题较多"||r.correction==="待补交"?"hw-bad":""}"><td>${r.seq??""}</td><td>${r.name}</td><td>${r.flag||""}</td><td>${r.status}</td><td>${r.quality}</td><td>${correctionLabel(r)}</td><td>${hwActionButtons(r)}</td></tr>`).join("")}</tbody></table></div>` : `<div class="row-actions">${sts.slice(0, 16).map((s)=>`<button type="button" data-rv="${s.id}">${s.name}</button>`).join("")}</div>`}
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
  bindOfficeActions(host);
  bindParentActions(host);
  bindDeskAndTutor(host);
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
    ${p1done ? `<p class="notice">${placementSeatNotice(state) || "这是分班后的新座次。"}教室座位表已按新座号排列。</p>` : ""}
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

function lineCompareNotice(report, classNo = state.player.classNo) {
  if (!report || report.examKind === "huikao") return "";
  const parts = [
    describeSchoolCutoff(report.quota, report.split) + "。",
    describeSchoolProvincial(report) + "。",
  ];
  if (classNo != null) {
    parts.push(`任教班${describeClassProvincial(report, classNo)}。`);
    const peers = describeZhuoxingPeers(report, classNo);
    if (peers) parts.push(`同层次平行班对比：${peers}`);
  }
  return parts.join("");
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function examAiCacheKey(report, player) {
  return `${report?.date || ""}|${report?.examId || ""}|${player?.classNo}|${analysisScope(player)}`;
}

function viewSettings(host) {
  const conf = loadAiSettings();
  const god = loadGodSettings();
  const officialName = officialHomeroomName(state.player);
  const keyHint = conf.hasKey ? `已保存密钥 ${maskApiKey(conf.apiKey)}。输入框留空再保存，会保留原密钥。` : "尚未保存密钥。";
  host.innerHTML = `<h3>设置</h3>
    <p class="notice">考后分析使用 OpenAI 兼容接口（默认 DeepSeek，地址 ${escapeHtml("https://api.deepseek.com")}，路径 /chat/completions）。密钥只存在本机浏览器，与游戏存档分开，也不会写入导出的 JSON。分析只写评语，不会改分数、排名或上线人数。</p>
    <form class="settings-form" id="ai-form">
      <label>接口地址 <input id="ai-base" type="url" value="${escapeHtml(conf.baseUrl)}" autocomplete="off" spellcheck="false" /></label>
      <label>模型 <input id="ai-model" type="text" value="${escapeHtml(conf.model)}" autocomplete="off" spellcheck="false" /></label>
      <label>API 密钥 <input id="ai-key" type="password" value="" placeholder="${conf.hasKey ? "已保存，输入新密钥可更换" : "尚未填写"}" autocomplete="off" /></label>
      <p class="muted" id="ai-key-hint">${escapeHtml(keyHint)}</p>
      <div class="row-actions">
        <button type="submit" class="accent">保存设置</button>
        <button type="button" id="ai-clear">清除密钥</button>
      </div>
    </form>
    <section class="settings-section" id="god-mode">
      <h4>上帝模式</h4>
      <p class="notice">上帝模式只改变查看与分析范围，不会改写学校的正式任职，也不会写入存档或导出的 JSON，只保存在这台设备的浏览器里。</p>
      <form class="settings-form" id="god-form">
        <label class="settings-toggle">
          <input type="checkbox" id="god-homeroom" ${god.actAsHomeroom ? "checked" : ""} />
          <span>以本班班主任身份查看考后分析</span>
        </label>
        <p class="muted">打开后，考后分析按本班班主任身份查看全班总分、各科和划线。学校正式班主任仍是${escapeHtml(officialName)}。关闭即可恢复为单科任课老师。家长会主持、向班主任通报、请班主任点名等剧情仍按正式任职进行。</p>
      </form>
    </section>`;
  host.querySelector("#ai-form").onsubmit = (e) => {
    e.preventDefault();
    const model = host.querySelector("#ai-model").value.trim();
    const baseUrl = host.querySelector("#ai-base").value.trim();
    const typed = host.querySelector("#ai-key").value;
    const patch = { model, baseUrl };
    if (typed.trim()) patch.apiKey = typed.trim();
    const r = saveAiSettings(patch);
    toast(r.ok ? "设置已保存。密钥不会写入存档。" : (r.reason || "无法保存"));
    viewSettings(host);
  };
  host.querySelector("#ai-clear").onclick = () => {
    const r = clearAiKey();
    host.querySelector("#ai-key").value = "";
    toast(r.ok ? "已清除本机密钥。" : (r.reason || "无法清除"));
    viewSettings(host);
  };
  host.querySelector("#god-homeroom").onchange = (e) => {
    const r = saveGodSettings({ actAsHomeroom: e.target.checked });
    toast(r.ok
      ? (r.actAsHomeroom ? "已按本班班主任身份查看考后分析。正式班主任不变，也不会写入存档。" : "已恢复为单科任课老师分析。")
      : (r.reason || "无法保存"));
    viewSettings(host);
  };
}

function bindExamAi(host, report) {
  const btn = host.querySelector("#ai-run");
  const status = host.querySelector("#ai-status");
  const body = host.querySelector("#ai-body");
  if (!btn) return;
  const setStatus = (text, kind) => {
    if (!text) { status.hidden = true; status.textContent = ""; status.className = "notice"; return; }
    status.hidden = false;
    status.className = kind === "err" ? "notice exam-ai-err" : "notice";
    status.textContent = text;
  };
  btn.onclick = async () => {
    if (examAiBusy) return;
    const conf = loadAiSettings();
    if (!conf.hasKey) {
      setStatus("还没有填写 API 密钥。请到「设置」里填写后，再生成考后分析。", "err");
      return;
    }
    const check = canAnalyzeReport(report, state.player.classNo);
    if (!check.ok) { setStatus(check.reason, "err"); return; }
    const prior = listExamReports(state, { entryYear: state.player.cohortYear });
    const payload = buildExamAnalysisPayload(report, { player: state.player, classNo: state.player.classNo, reports: prior, previousReports: prior });
    if (!payload.ok) { setStatus(payload.reason, "err"); return; }
    examAiBusy = true;
    btn.disabled = true;
    setStatus("正在生成分析…", "ok");
    try {
      const r = await requestExamAnalysis(payload, { settings: conf });
      if (!r.ok) { setStatus(r.reason, "err"); return; }
      examAiCache.set(examAiCacheKey(report, state.player), r.text);
      body.innerHTML = escapeHtml(r.text).replace(/\n/g, "<br/>");
      setStatus("分析只是评语，分数、排名和上线人数以本页表格为准。", "ok");
    } finally {
      examAiBusy = false;
      btn.disabled = false;
    }
  };
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
  const isJoint = report.examKind === "city" || report.examKind === "province";
  const passN = isHk ? mine.filter((r)=>r.huikaoPass).length : null;
  const jLi = report.joint?.city?.li;
  const jointKpi = isJoint ? jointLinesBlock(report) : "";
  const head = isHk ? ["班名次","姓名","总分","年级名次","校内合格"]
    : isJoint ? (report.examKind==="province" ? ["班名次","姓名","总分","校排","县位次","市位次","省位次","市上线","省上线"] : ["班名次","姓名","总分","校排","县位次","市位次","市上线","县上线"])
    : ["班名次","姓名","总分","年级名次","校内上线"];
  const rowCells = (r,i) => {
    if (isHk) return `<td>${i+1}</td><td>${r.name}</td><td>${r.total}</td><td>${r.rank||"—"}</td><td>${r.huikaoPass?"合格":"不合格"}</td>`;
    if (isJoint && report.examKind==="province") return `<td>${i+1}</td><td>${r.name}</td><td>${r.total}</td><td>${r.rank||"—"}</td><td>${r.countyRank??"—"}</td><td>${r.cityRank??"—"}</td><td>${r.provinceRank??"—"}</td><td>${r.jointLine?.city||"—"}</td><td>${r.jointLine?.province||"—"}</td>`;
    if (isJoint) return `<td>${i+1}</td><td>${r.name}</td><td>${r.total}</td><td>${r.rank||"—"}</td><td>${r.countyRank??"—"}</td><td>${r.cityRank??"—"}</td><td>${r.jointLine?.city||"—"}</td><td>${r.jointLine?.county||"—"}</td>`;
    return `<td>${i+1}</td><td>${r.name}</td><td>${r.total}</td><td>${r.rank||"—"}</td><td>${r.line||""}</td>`;
  };
  const actingHome = isActingHomeroom(state.player, state.player.classNo);
  const officialHome = isPlayerHomeroom(state.player, state.player.classNo);
  const godNote = actingHome && !officialHome
    ? `<p class="notice">上帝模式：当前按班主任身份查看本班考后分析。学校正式班主任仍是${escapeHtml(officialHomeroomName(state.player))}，任职与存档不会被改写。</p>`
    : "";
  host.innerHTML = `<h3>考试成绩 · 任教班</h3>
    <div class="filters"><label>场次 <select id="exsel">${examOptions()}</select></label></div>
    ${godNote}
    ${note?`<p class="notice">${note}</p>`:""}
    ${isJoint?jointKpi:`<div class="kpi">
      <div><span>试卷难度</span><b>${(report.difficulty||1).toFixed(3)}</b></div>
      ${isHk?`<div><span>班内校内合格</span><b>${passN} / ${mine.length}</b></div><div><span>合格标准</span><b>卷面 60%</b></div>`:`<div><span>${report.split?"理科":""}一本线（第${cut?.firstN}名）</span><b>${cut?.firstLine ?? "—"}</b></div>
      <div><span>二本线（第${cut?.secondN}名）</span><b>${cut?.secondLine ?? "—"}</b></div>
      <div><span>线差分</span><b>${cut && cut.firstLine-cut.secondLine}</b></div>
      <div><span>年级第一/第二差</span><b>${cut?.topGap ?? "—"}</b></div>`}
    </div>
    ${!isHk && cutW?`<p class="notice">文科校内一本线 ${cutW.firstLine}（第${cutW.firstN}名），二本线 ${cutW.secondLine}，分差 ${cutW.firstLine-cutW.secondLine}。分数线由当次个人成绩排序得出，难度变化时会明显波动。</p>`:""}
    ${!isHk?`<p class="notice">${lineCompareNotice(report)}</p>`:""}`}
    ${isJoint?`<p class="muted">校内模拟线（第 ${cut?.firstN} / ${cut?.secondN} 名）理科 ${cut?.firstLine??"—"} / ${cut?.secondLine??"—"}，只作校内对照，不是市线或省线。${cutW?`文科校内 ${cutW.firstLine} / ${cutW.secondLine}。`:""}</p>`:""}
    <div class="paper"><table><thead><tr>${head.map((h)=>`<th>${h}</th>`).join("")}</tr></thead>
    <tbody>${mine.map((r,i)=>`<tr data-id="${r.studentId}">${rowCells(r,i)}</tr>`).join("")}</tbody></table></div>
    ${examAiPanel(report)}`;
  host.querySelector("#exsel").onchange = (e) => { examPick = e.target.value; render(); };
  host.querySelectorAll("tr[data-id]").forEach((tr)=>tr.onclick=()=>{selectedId=tr.dataset.id; view="profile"; render();});
  bindExamAi(host, report);
}

function examAiPanel(report) {
  const p = state.player;
  const official = isPlayerHomeroom(p, p.classNo);
  const acting = isActingHomeroom(p, p.classNo);
  const sub = playerSubjectName(p);
  const officialName = officialHomeroomName(p);
  const scopeText = official
    ? "你现在是本班班主任，可以分析全班总分、均分、校内线与对照省控、班/层/校排和跨层次排、排名分布，以及各门单科。"
    : acting
      ? `当前为上帝模式查看：按本班班主任身份分析全班总分、均分、校内线与对照省控、班/层/校排和跨层次排、排名分布，以及各门单科。学校正式班主任仍是${officialName}，任职与存档不会被改写。`
      : `你现在是本班${sub}任课老师，不是班主任，只能分析本班${sub}（整体排名只作背景）。可在「设置」的上帝模式里临时按班主任范围查看全班；若以后正式接任班主任，这里会自动改为可看全班整体。`;
  const cached = examAiCache.get(examAiCacheKey(report, p));
  const body = cached ? escapeHtml(cached).replace(/\n/g, "<br/>") : "";
  return `<div class="paper exam-ai">
    <h4>考后分析</h4>
    <p class="muted">${scopeText} 分析会带上已算好的排名、与上一场的进退步，以及建议谈话对象；数字以本页表格为准，不会改分数、排名或上线人数。第一场或没有先前成绩时不会虚构进退步。</p>
    <div class="row-actions"><button type="button" class="accent" id="ai-run">生成分析</button></div>
    <p class="notice" id="ai-status" hidden></p>
    <div class="exam-ai-body" id="ai-body">${body}</div>
  </div>`;
}

function viewOffice(host) {
  const all = listExamReports(state);
  const byDate = {};
  for (const r of all) (byDate[r.date+" "+r.examName] ??= []).push(r);
  const names = Object.keys(byDate);
  if (!names.length) {
    host.innerHTML = `<h3>教务处</h3>
      ${officeCollabHtml()}
      <p class="muted">全校成绩要等第一次考试结算之后才会出现在这里。办公室坐班、班主任通报和备课请教现在就可以做。</p>`;
    bindOfficeActions(host);
    bindParentActions(host);
    return;
  }
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
    ${officeCollabHtml()}
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
      <p class="notice">难度 ${(live.difficulty||1).toFixed(3)}　离散 ${(live.dispersion||1).toFixed(3)}。${live.examKind==="city"||live.examKind==="province"?"市/省/县线由模拟考生池位次算出，校内线只作校内对照。":"校内线按上一届高考本校省控实际人数划线，分数由当次排序得出。"}班级汇总全部由个人成绩加总，不另造统计。${examSourceNotice(live)?" "+examSourceNotice(live):""}</p>
      ${live.examKind==="huikao"?"":`<p class="notice">${lineCompareNotice(live, state.player.classNo)}</p>`}
      ${live.examKind==="huikao"?`<div class="kpi"><div><span>校内合格标准</span><b>卷面 60%</b></div><div><span>合格人数</span><b>${(live.rows||[]).filter((r)=>!r.repeat && r.huikaoPass).length}</b></div><div><span>第一名</span><b>${cut?.top??"—"}</b></div></div>`:(live.examKind==="city"||live.examKind==="province"?jointLinesBlock(live)+`<p class="muted">校内模拟线（第 ${cut?.firstN} / ${cut?.secondN} 名）${cut?.firstLine??"—"} / ${cut?.secondLine??"—"}，不是市线或省线。</p>`:`<div class="kpi"><div><span>一本线</span><b>${cut?.firstLine??"—"}</b></div><div><span>二本线</span><b>${cut?.secondLine??"—"}</b></div><div><span>分差</span><b>${cut?cut.firstLine-cut.secondLine:"—"}</b></div><div><span>第一名</span><b>${cut?.top??"—"}</b></div></div>`)}
      <p class="notice">${topLine}</p>
      <h3>各班对照</h3>
      <div class="paper"><table><thead><tr><th>班</th><th>层次</th><th>人数</th><th>均分</th><th>最高</th><th>一本</th><th>一本率</th><th>二本累计</th></tr></thead>
      <tbody>${classTable.map((c)=>`<tr><td>${c.name||c.classNo+"班"}</td><td>${c.tier}</td><td>${c.count}</td><td>${c.avg}</td><td>${c.max}</td><td>${c.firstCount}</td><td>${c.firstRate}%</td><td>${c.secondCount}</td></tr>`).join("")}</tbody></table></div>
      <h3>学生总分与单科（当前筛选 ${rows.length} 人）</h3>
      <div class="paper"><table><thead><tr><th>筛选名次</th><th>姓名</th><th>班级</th><th>总分</th><th>${subjects.slice(0,8).map(id=>(subjectById(id)||{name:id}).name).join("</th><th>")}</th><th>${live.examKind==="province"?"省位次":live.examKind==="city"?"市位次":"校内上线"}</th>${live.examKind==="city"||live.examKind==="province"?`<th>${live.examKind==="province"?"市位次":"县位次"}</th>${live.examKind==="province"?"<th>县位次</th>":""}<th>市上线</th>`:""}${live.examKind==="province"?"<th>省上线</th>":""}</tr></thead>
      <tbody>${rows.slice(0,200).map((r)=>`<tr data-id="${r.studentId}"><td>${r.showRank}</td><td>${r.name}</td><td>${r.classNo}班</td><td>${r.total}</td>${subjects.slice(0,8).map(id=>`<td>${r[id]??""}</td>`).join("")}<td>${live.examKind==="province"?(r.provinceRank??"—"):live.examKind==="city"?(r.cityRank??"—"):(r.line||"")}</td>${live.examKind==="city"||live.examKind==="province"?`<td>${live.examKind==="province"?(r.cityRank??"—"):(r.countyRank??"—")}</td>${live.examKind==="province"?`<td>${r.countyRank??"—"}</td>`:""}<td>${r.jointLine?.city||"—"}</td>`:""}${live.examKind==="province"?`<td>${r.jointLine?.province||"—"}</td>`:""}</tr>`).join("")}</tbody></table>
      ${rows.length>200?"<p class='muted'>仅显示前 200 人，可用层次筛选缩小范围。点击姓名可看该生档案曲线。</p>":""}</div>`;
      body.querySelectorAll("tr[data-id]").forEach((tr) => {
        tr.onclick = () => { selectedId = tr.dataset.id; view = "profile"; render(); };
      });
  };
  host.querySelector("#tier").onchange = draw;
  host.querySelector("#track").onchange = draw;
  draw();
}

let admissionPick = "";

function viewAdmission(host) {
  const keys = Object.keys(state.admissions||{}).sort().reverse();
  if (!keys.length) { host.innerHTML = "<h3>录取去向</h3><p>还没有走完高考录取。可用自动模式跳到本届高考。</p>"; return; }
  if (!admissionPick || !state.admissions[admissionPick]) admissionPick = keys[0];
  const pack = state.admissions[admissionPick];
  const list = pack.results || [];
  const qb = list.filter((x)=>x.qingbei);
  const first = list.filter((x)=>x.batch==="一批");
  const second = list.filter((x)=>x.batch==="一批" || x.batch==="二批");
  const opts = keys.map((k) => {
    const p = state.admissions[k];
    const mine = p.entryYear === state.player.cohortYear ? "（你带的这届）" : "";
    return `<option value="${k}" ${k===admissionPick?"selected":""}>${p.year}年 · ${p.entryYear}级${mine}</option>`;
  }).join("");
  const picker = keys.length > 1 ? `<div class="filters"><label>查看届次 <select id="adm-year">${opts}</select></label></div>` : "";
  host.innerHTML = `<h3>${pack.year}年高考录取（${pack.entryYear}级）</h3>
    <p class="notice">${describeAdmissionContext(state, pack)}</p>
    ${picker}
    <p class="notice">对照江西${pack.year}年公开省控线。院校投档与省位次以 2020 年公开投档线和一分一段为底；其他年份按当年与 2020 年省控分差平移，表格中会标明，不是当年完整投档表或一分一段。艺体生目前只对照文化课成绩，尚未收录术科专业分，不编造术科分。师范意向只影响在已有院校池中的匹配偏好，没有单独的师范提前批投档表。不随机派校名，也不为喜报虚造清北。</p>
    <div class="kpi"><div><span>清北</span><b>${qb.length}</b></div><div><span>一批</span><b>${first.length}</b></div><div><span>二本以上</span><b>${second.length}</b></div><div><span>公布人数</span><b>${list.length}</b></div></div>
    <p class="notice">公布人数是本届应届与复读全员（含专科及未达专科线），不是二本以上人数。一批、二本以上按江西${pack.year}年公开省控线统计。</p>
    <div class="filters"><input id="q" placeholder="搜索姓名或大学" /></div>
    <div class="paper" id="adm-table"></div>`;
  const yearSel = host.querySelector("#adm-year");
  if (yearSel) yearSel.onchange = () => { admissionPick = yearSel.value; render(); };
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
    <p class="notice" id="auto-msg">当前 ${formatDateCn(state.date)}。${describePlayerStage(state)}${(() => { const g = gradeOf(state.player.cohortYear, state.date); return g >= 1 && g <= 3 ? "，尚未走完这届高考。" : "。"; })()}下一阶段会写明是哪一届的什么事，避免把其他年级的高考当成你带的班。</p>`;
  host.querySelector("#n1").onclick = () => handleAct("skip");
  host.querySelector("#n2").onclick = () => {
    toast("正在自动推进到高考录取，请稍候…");
    setTimeout(() => {
      skipToGaokaoOf(state, state.player.cohortYear);
      persist(); render();
      toast(`已到达你带的${state.player.cohortYear}级高考录取（若校历已过则停在当前）。${describePlayerStage(state)}。`);
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
  const next = SCHOOL_CALENDAR.find((e) => e.date >= state.date && ["exam","placement1","placement2","admission","promote","parents"].includes(e.kind));
  const cls = clsStudents();
  const sched = daySchedule(state.date, state);
  const curId = state.periodId;
  const tt = `<table class="tt-table"><tbody>${sched.map((p)=>`<tr class="${p.id===curId?"now":""}${p.isMath?" math":""}"><td>${p.clock||""}</td><td>${p.short||p.name}</td><td>${p.subject}${p.isMath?" <span class=\"math-tag\">数学</span>":""}</td></tr>`).join("")}</tbody></table>`;
  const slot = currentSlot(state);
  const nowLabel = slot ? formatSlotLabel(slot) : "";
  const schedBody = `<p>${formatDateCn(state.date)}</p>
    ${tt}
    <div class="row-actions"><button type="button" data-act="nextperiod">下一节</button></div>
    <p class="notice">备课充分度 ${state.player.prep||0}　数学教学积累 ${Number(state.player.mathTeaching||0).toFixed(1)}</p>
    <p class="notice">下一件大事：${next ? `${next.date} ${next.name}` : "（暂无）"}</p>`;
  const narrow = window.matchMedia("(max-width: 600px)").matches;
  lastNarrowAgenda = narrow;
  const schedBlock = narrow
    ? `<details class="agenda-sched"${agendaSchedOpen ? " open" : ""}>
        <summary>今日课表${nowLabel ? ` <span class="agenda-now">${nowLabel}</span>` : ""}</summary>
        ${schedBody}
      </details>`
    : `<h3>今日课表</h3>${schedBody}`;
  box.innerHTML = `${schedBlock}
    <h3>任教班</h3>
    <p class="notice">${state.player.cohortYear}级卓行${state.player.classNo}班，${cls.length}人。班主任 ${state.player.homeroom}。</p>
    <div class="row-actions"><button type="button" data-act="skip">跳到下一阶段</button></div>
    <h3>最近日志</h3>
    ${(state.log||[]).slice(0,8).map((l)=>`<div class="log-item"><b>${l.date}</b> ${l.text}</div>`).join("")}`;
  box.querySelector("[data-act=skip]").onclick = () => handleAct("skip");
  box.querySelector("[data-act=nextperiod]").onclick = () => handleAct("nextperiod");
  const det = box.querySelector(".agenda-sched");
  if (det) det.addEventListener("toggle", () => { agendaSchedOpen = det.open; });
}
