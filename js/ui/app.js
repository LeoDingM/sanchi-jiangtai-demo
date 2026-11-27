import {
  createGame, createGameAsync, freshGameSeed, parseGameSeed, playerStudents, skipToNextStage, skipToGaokaoOf, skipToNextCohort, skipToNextSchoolYearAsync, planSkipToNextSchoolYear,
  advanceDay, advancePeriod, prepareLesson, teach, talkTo, reviewHomework, listExamReports, formatDateCn,
  applyEvent, SCHOOL_CALENDAR, gradeOf, topicsForGrade, LESSON_STYLES,
  formatGradeTerm, describePlayerStage, describeStageAdvance, describeAdmissionContext,
  suggestedTopic, topicProgress, homeworkWatchlist, studentTeachingContext,
  urgeHomework, checkCorrection, officeMarking, consultHomeroom, consultMentor,
  daySchedule, currentSlot, formatSlotLabel, upcomingMath, upcomingTutoring,
  tutorEvening, raisedHands, seatLabel, periodTalkScene, isTutoringSlot,
  homeroomEveningRoll, placementSeatNotice, cohortPlacementStage, studentRecentStatus,
  meetParent, isParentsMeetingOpen, upcomingParentsMeeting, PARENT_TALK_CAP, PARENTS_SOURCE_NOTE,
  doActivityAction, isSchoolActivityOpen, upcomingSchoolActivity, ACTIVITY_SOURCE_NOTE,
  weekSchedule, weekStart, weekMathCount, swapPeriods, borrowIn, respondTimetableRequest,
  ensureIncomingRequest, pendingTimetableRequest, weekTiaokeSummary, classLatecomers,
  attendClassMeeting, hostClassMeeting, playerClassCommittee, playerClassBrief,
  playerDutyToday, playerWeekDuty, isHomeroomMeetingSlot, upcomingClassMeeting,
  committeeTitleOf, formatStudentShort,
  handleVisit, ensureVisits, currentVisitItems,
  handlePhoneVisit, handleDoorVisit, suggestPhoneVisits, suggestDoorVisits,
  isPhoneVisitOpen, isDoorVisitOpen, phoneVisitUnavailableReason, doorVisitUnavailableReason,
  ensureHomeVisitState, PHONE_DAY_CAP, PHONE_TERM_CAP, DOOR_DAY_CAP, DOOR_TERM_CAP,
  observeLesson, isObserveOpen, observeUnavailableReason, observeChoices, ensureObserveState,
  upcomingOpenClass, upcomingOpenClasses, openClassSlotOn, isOpenClassPeriod, isOpenClassDay,
  latestOpenClassReview, openClassReviewFor, OBSERVE_DAY_CAP, OBSERVE_TERM_CAP, OPEN_CLASS_SOURCE_NOTE,
  doProctorAction, markClassPapers, isProctorOpen, proctorUnavailableReason, proctorChoices,
  proctorAssignment, ensureProctorState, isMarkingOpen, markingUnavailableReason, markingPapers,
  pendingGradeableExam, latestPlayerExam, isCalendarExamDay, isNonSchoolMarkKind,
  examEventOn, examSessionOf, sessionLabel, PROCTOR_SOURCE_NOTE, PROCTOR_SESSION_CAP,
  handleCoaching, suggestRemedial, suggestEnrichment, isCoachingOpen, isCoachingWindow,
  coachingUnavailableReason, ensureCoachingState, isCoachingTimeSlot, kindLabel,
  COACH_DAY_CAP, COACH_TERM_CAP, COACH_SESSION_MIN, COACH_SESSION_MAX, COACH_ACTIONS, COACH_SOURCE_NOTE,
  handleTermComment, suggestTermComments, isCommentOpen, isCommentWindow,
  commentUnavailableReason, ensureCommentState, currentCommentExam, isCommentTimeSlot,
  COMMENT_DAY_CAP, COMMENT_BATCH_MIN, COMMENT_BATCH_MAX, COMMENT_TONES, COMMENT_SOURCE_NOTE,
  handleTeachersDayCard, handleTeachersDayColleague, suggestTeachersDayCards, teachersDayColleague,
  isTeachersDayOpen, isTeachersDayWindow, teachersDayUnavailableReason, ensureTeachersDayState,
  isTeachersDayTimeSlot, isTeachersDayPlayDate, teachersDayPlayDate, teachersDayNominalDate,
  TEACHERS_DAY_CARD_MIN, TEACHERS_DAY_CARD_MAX, TEACHERS_DAY_CARD_CAP,
  TEACHERS_DAY_SOURCE_NOTE, CARD_REPLIES, COLLEAGUE_ACTIONS,
  handleQualityMeet, composeQualityMeetBrief, qualityMeetOptionsFor,
  isQualityMeetOpen, isQualityMeetWindow, qualityMeetUnavailableReason,
  currentQualityMeetExam, ensureQualityMeetState, hasQualityMeet,
  QUALITY_MEET_ACTIONS, QUALITY_MEET_SOURCE_NOTE,
  handleGroupPrep, composeGroupPrepBrief, groupPrepOptionsFor,
  isGroupPrepOpen, isGroupPrepWindow, groupPrepUnavailableReason,
  ensureGroupPrepState, hasGroupPrepThisWeek, latestGroupPrepThisWeek,
  GROUP_PREP_ACTIONS, GROUP_PREP_SOURCE_NOTE, GROUP_PREP_WEEK_CAP, GROUP_PREP_TERM_CAP,
  handleOpeningDay, composeOpeningDayBrief, openingDayOptionsFor,
  isOpeningDayOpen, isOpeningDayWindow, openingDayUnavailableReason,
  ensureOpeningDayState, hasOpeningDayRecord, latestOpeningDayMinutes,
  isOpeningDayPlayDate, openingPlayDate, openingEventForPlayDate,
  isFallOpeningEvent, openingEventKindName,
  FALL_OPENING_ACTIONS, SPRING_OPENING_ACTIONS, OPENING_DAY_SOURCE_NOTE,
  handleStudyHall, composeStudyHallBrief, studyHallOptionsFor,
  isStudyHallOpen, isStudyHallWindow, studyHallUnavailableReason,
  ensureStudyHallState, hasStudyHallThisSlot, latestStudyHallThisSlot,
  STUDY_HALL_ACTIONS, STUDY_HALL_SOURCE_NOTE,
  handleWeekendHomework, composeWeekendHwBrief, weekendHwOptionsFor,
  isWeekendHwOpen, isWeekendHwWindow, weekendHwUnavailableReason,
  ensureWeekendHwState, hasWeekendHwThisWeek, latestWeekendHwThisWeek,
  WEEKEND_HW_ACTIONS, WEEKEND_HW_SOURCE_NOTE, WEEKEND_HW_WEEK_CAP,
  handleDutyWeek, composeDutyWeekBrief, dutyWeekOptionsFor,
  isDutyWeekOpen, isDutyWeekWindow, dutyWeekUnavailableReason,
  ensureDutyWeekState, hasDutyWeekToday, latestDutyWeekToday,
  DUTY_WEEK_ACTIONS, DUTY_WEEK_SOURCE_NOTE, DUTY_WEEKS_PER_TERM, DUTY_WEEK_MARK,
  DUTY_LEADER_NAME, DUTY_LEADER_TITLE,
  handleFacultyMeet, composeFacultyMeetBrief, facultyMeetOptionsFor,
  isFacultyMeetOpen, isFacultyMeetWindow, facultyMeetUnavailableReason,
  ensureFacultyMeetState, hasFacultyMeet, latestFacultyMeetMinutes,
  facultyMeetOpeningEvent, FACULTY_MEET_ACTIONS, FACULTY_MEET_SOURCE_NOTE,
  handleGradeMeet, composeGradeMeetBrief, gradeMeetOptionsFor,
  isGradeMeetOpen, isGradeMeetWindow, gradeMeetUnavailableReason,
  ensureGradeMeetState, hasGradeMeet, latestGradeMeetMinutes, currentGradeMeetExam,
  GRADE_MEET_ACTIONS, GRADE_MEET_SOURCE_NOTE, GRADE_DIRECTOR_NAME, GRADE_DIRECTOR_TITLE,
  handlePaperSign, composePaperSignBrief, paperSignOptionsFor,
  isPaperSignOpen, isPaperSignWindow, paperSignUnavailableReason,
  ensurePaperSignState, currentPaperSignExam, paperSignProgress, hasIssued, hasReturned,
  suggestPaperSignIssue, suggestPaperSignRegister, suggestPaperSignInform,
  PAPER_SIGN_ACTIONS, PAPER_SIGN_SOURCE_NOTE, PAPER_SIGN_BATCH_MIN, PAPER_SIGN_BATCH_MAX,
  PAPER_SIGN_DAY_CAP,
} from "../domain/simulation.js?v=t75u2";
import { addDays, weekday, schoolYearOf } from "../domain/calendar.js?v=t75u2";
import { parentTalkPriority, composeParentBrief } from "../domain/parents.js?v=t75u2";
import { saveSlot, loadSlot, loadSlotResult, listSlots, toJSON, fromJSON } from "../domain/save.js?v=t75u2";
import { startNewGameSession, continueGameSession, createBootQueue } from "../domain/bootFlow.js?v=t75u2";
import { subjectById, SUBJECTS_G1 } from "../domain/config.js?v=t75u2";
import { rankRows, usesComprehensive, displayScoreColumns, displayScoreCell, formatToppersLine, formatLastGaokaoText, formatComprehensiveLabel } from "../domain/scores.js?v=t75u2";
import { classTrackLabel } from "../domain/newGaokao.js?v=t75u2";
import { classStandings, examReportKey, pickExamReport, officeBoard } from "../domain/examService.js?v=t75u2";
import { hydrateReport } from "../domain/simulation.js?v=t75u2";
import { renderSeating } from "./classroom.js?v=t75u2";
import { classPeersOf, deskMateOf } from "../domain/peers.js?v=t75u2";
import { classAbsences, isAwayFromClass, healthStatusLine } from "../domain/health.js?v=t75u2";
import { formatAbilityWithRoom, mathRoomLine } from "../domain/potential.js?v=t75u2";
import { buildStudentResume, resumeAiPayload, formatResumeLocal } from "../domain/resume.js?v=t75u2";
import { buildAlumniBoostBoard, alumniBoostAiPayload, validateAlumniBoostText, ALUMNI_BOOST_TITLE, ALUMNI_BOOST_SOURCE_NOTE } from "../domain/alumniBoost.js?v=t75u2";
import { explainScoreDrop, scoreDropAiPayload, validateScoreDropText, listScoreDropEntries } from "../domain/scoreDrop.js?v=t75u2";
import {
  formatDisciplineBoard, filterDisciplineNotices, enrichDisciplineNotice,
  disciplineNoticeFilterOptions, disciplineBoardButtonLabel, disciplineBoardEmptyNote,
  filtersAreActive,
} from "../domain/cheating.js?v=t75u2";
import {
  buildStudentScoreTrendFacts, formatLocalStudentScoreTrend, studentScoreTrendChartModel,
  studentScoreTrendAiPayload, validateScoreTrendText,
  buildClassScoreTrendFacts, formatLocalClassScoreTrend, classScoreTrendChartModel,
  classScoreTrendAiPayload, SCORE_TREND_SOURCE_NOTE,
} from "../domain/scoreTrend.js?v=t75u2";
import { sameTierFirstBoard, classFirstBoard, formatStability } from "../domain/toppers.js?v=t75u2";
import { decorateDisplayRanks, formatRankTriple, reportRankOpts, agendaStateKey, shouldRefreshAgenda } from "../domain/displayRanks.js?v=t75u2";
import { classOfficesFor, officeTitlesOf, selectClassOffices } from "../domain/classManage.js?v=t75u2";
import { playerCareerLine, playerCareerStatus, playerCareerBrief, OFFICIAL_LOG_TEXT } from "../domain/career.js?v=t75u2";
import { provincialLines, officialProvincialPack, provincialTrackLabel, provincialFirstShortLabel, provincialSecondShortLabel, provincialFirstLabel, provincialSecondLabel } from "../domain/jiangxi.js?v=t75u2";
import { formatAdmissionBatch, formatAdmissionDest, formatLastAdmissionLabel, enrichAdmissionResults, studentsForAdmissionYear, admissionClassOptions, filterAdmissionResults, admissionCountKpis, ADMISSION_TIER_FILTERS, ADMISSION_TRACK_FILTERS, ADMISSION_TABLE_LIMIT } from "../domain/admission.js?v=t75u2";
import { describeSchoolCutoff, describeClassProvincial, describeZhuoxingPeers, describeSchoolProvincial, describeOfficialProvincialLines, schoolCutoffView, provincialCompareYear, classProvincialCounts } from "../domain/schoolLines.js?v=t75u2";
import { studentExamHistory, tierName, tierLabel, TIER_ORDER, findStudentInState } from "../domain/studentHistory.js?v=t75u2";
import { drawLineChart, drawBarChart } from "./charts.js?v=t75u2";
import {
  loadAiSettings, saveAiSettings, clearAiKey, maskApiKey,
  loadGodSettings, saveGodSettings, officialHomeroomName,
  playerSubjectName, analysisScope, isPlayerHomeroom, isActingHomeroom,
  buildExamAnalysisPayload, requestExamAnalysis, canAnalyzeReport,
  parseAiCommentary, emptyAiCommentary,
  requestTalkAdvice, requestTeachingReflection, requestResumePolish,
  requestAlumniBoostPolish, requestScoreDropPolish,
  requestStudentScoreTrend, requestClassScoreTrend,
} from "../domain/examAi.js?v=t75u2";

let state = null;
let view = "classroom";
let selectedId = null;
let examPick = "";
let subjectPick = "math";
let toastTimer = 0;
const examAiCache = new Map();
let examAiBusy = false;
let skipYearBusy = false;
let examAiDeltaFilter = "全部";
let examAiFocusId = "";
let lastAgendaKey = "";
let viewDelegateBound = false;


const $ = (s) => document.querySelector(s);


function godReveal() {
  return !!loadGodSettings()?.actAsHomeroom;
}

function scheduleChartPaint(fn) {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    try { fn(); } catch (err) { console.warn(err); }
  }));
}

function resumePanelHtml(student, { compact = false } = {}) {
  if (!student) return "";
  const reveal = godReveal();
  const pack = buildStudentResume(state, student, { date: state.date, revealPotential: reveal });
  if (!pack.ok) return "";
  const f = pack.facts;
  const aw = f.awardLines || {};
  const awardLis = ["国家级", "省级", "市级", "校内"].map((lv) => {
    const arr = aw[lv] || [];
    return `<li><b>${lv}</b>：${arr.length ? arr.map((x) => escapeHtml(x)).join("、") : "无"}</li>`;
  }).join("");
  const outLi = (f.outstanding || []).map((x) => `<li>${escapeHtml(x.text)}</li>`).join("")
    || "<li>近几次没有明显冲到前列、又远好于自己平时的单科。</li>";
  const recLi = (f.recent || []).map((x) => `<li>${escapeHtml(x.text)}</li>`).join("")
    || "<li>还没有可回顾的实考记录。</li>";
  const stand = f.standing?.text || "还没有可对照的考试。";
  const tierExtra = (f.standing?.tiers || []).map((x) => escapeHtml(x.line)).join("；");
  const recruit = f.recruit?.eligible ? `<p>${escapeHtml(f.recruit.reason)}</p>` : "";
  const god = reveal ? `<p class="god-flag">上帝模式已开启：潜力只在能力栏另行标明，不会写进履历正文或润色稿。</p>` : "";
  if (compact) {
    return `<div class="resume-block paper" data-resume="${escapeHtml(student.id)}">
      <h4>个人履历</h4>
      ${god}
      <p><b>职务</b> ${escapeHtml(f.officeLine)}</p>
      <p><b>比赛</b></p><ul>${awardLis}</ul>
      <p><b>所处水平</b> ${escapeHtml(stand)}</p>
      <p class="muted">${escapeHtml(tierExtra)}</p>
    </div>`;
  }
  return `<div class="resume-block paper" data-resume="${escapeHtml(student.id)}">
    <h4>个人履历</h4>
    ${god}
    <p><b>职务</b> ${escapeHtml(f.officeLine)}</p>
    <p><b>比赛</b></p><ul>${awardLis}</ul>
    <p><b>所处水平</b> ${escapeHtml(stand)}</p>
    ${tierExtra ? `<p class="muted">${escapeHtml(tierExtra)}</p>` : ""}
    <p><b>单科异常优异</b></p><ul>${outLi}</ul>
    <p><b>近几次考试发挥</b></p><ul>${recLi}</ul>
    <p><b>已查实处分</b></p><ul>${(f.disciplineLines || []).map((x) => `<li>${escapeHtml(x)}</li>`).join("") || "<li>档案里没有已查实的校内作弊处分。</li>"}</ul>
    ${recruit}
    <div class="row-actions"><button type="button" class="talk-btn" data-ai-resume="${escapeHtml(student.id)}">用 AI 润色履历</button></div>
    <p class="notice" id="resume-ai-status" hidden></p>
    <p class="resume-text" id="resume-ai-text" hidden></p>
    <p class="muted">关掉或失败时仍以上面的写实履历为准，不会编造奖项、职务、分数或排名。</p>
  </div>`;
}

function bindResumeActions(host, student) {
  const btn = host.querySelector("[data-ai-resume]");
  if (!btn || !student) return;
  btn.onclick = async () => {
    const status = host.querySelector("#resume-ai-status");
    const textEl = host.querySelector("#resume-ai-text");
    const set = (msg, kind, body) => {
      if (status) { status.hidden = !msg; status.className = kind === "err" ? "notice exam-ai-err" : "notice"; status.textContent = msg || ""; }
      if (textEl) { textEl.hidden = !body; textEl.textContent = body || ""; }
    };
    const conf = loadAiSettings();
    const pack = buildStudentResume(state, student, { date: state.date, revealPotential: godReveal() });
    if (!conf.hasKey) {
      set("还没有填写 API 密钥。写实履历已在上面，不必先填密钥。", "err", pack.localText);
      return;
    }
    btn.disabled = true;
    set("正在润色履历…", "ok", "");
    try {
      const r = await requestResumePolish(resumeAiPayload(pack.facts, { revealPotential: godReveal() }), { settings: conf });
      if (!r.ok) { set(r.reason || "润色失败，仍显示写实履历。", "err", pack.localText); return; }
      set("润色只组织已有事实，分数和奖项以写实履历为准。", "ok", r.text);
    } catch (err) {
      set("润色请求失败，仍显示写实履历。", "err", pack.localText);
    } finally {
      btn.disabled = false;
    }
  };
}


function alumniBoostPanelHtml() {
  const board = buildAlumniBoostBoard(state);
  if (!board.visible) return "";
  const items = board.quotes.map((q) => `<li>${escapeHtml(q.text)}</li>`).join("");
  return `<div class="paper visit-panel alumni-boost-panel" data-alumni-boost-panel="1">
    <h3>${ALUMNI_BOOST_TITLE}</h3>
    <p class="muted">${escapeHtml(board.sourceNote)}${board.years?.length ? " 收录 " + board.years.join("、") + " 年毕业届。" : ""}</p>
    <ul class="alumni-boost-list">${items}</ul>
    <div class="row-actions"><button type="button" class="talk-btn" data-ai-alumni-boost="1">用 AI 润色语录</button></div>
    <p class="notice" id="alumni-boost-ai-status" hidden></p>
    <p class="alumni-boost-ai-text" id="alumni-boost-ai-text" hidden></p>
  </div>`;
}

function bindAlumniBoostActions(host) {
  const btn = host.querySelector("[data-ai-alumni-boost]");
  if (!btn) return;
  btn.onclick = async () => {
    const status = host.querySelector("#alumni-boost-ai-status");
    const textEl = host.querySelector("#alumni-boost-ai-text");
    const board = buildAlumniBoostBoard(state);
    if (!board.visible) {
      if (status) { status.hidden = false; status.textContent = board.reason || "当前没有可展示的语录。"; }
      return;
    }
    const conf = loadAiSettings();
    if (status) { status.hidden = false; status.textContent = conf.hasKey ? "正在按已有录取事实润色…" : "尚未保存密钥，先展示本地事实语录。"; }
    const local = board.localText;
    const showLocal = (reason) => {
      if (status) { status.hidden = false; status.textContent = reason ? reason + " 已改用本地事实语录。" : "已使用本地事实语录。"; }
      if (textEl) { textEl.hidden = false; textEl.textContent = local; }
    };
    if (!conf.hasKey) { showLocal(""); return; }
    try {
      const r = await requestAlumniBoostPolish(alumniBoostAiPayload(board), { settings: conf });
      if (!r.ok) { showLocal(r.reason || "润色失败"); return; }
      const checked = validateAlumniBoostText(r.text, board);
      if (!checked.ok) { showLocal(checked.reason || "润色稿与档案不符"); return; }
      if (status) { status.hidden = false; status.textContent = "已按档案核对，未改录取事实。"; }
      if (textEl) { textEl.hidden = false; textEl.textContent = checked.text; }
    } catch (err) {
      showLocal(err?.message || "润色失败");
    }
  };
}


function scoreDropPanelHtml(student, { compact = false } = {}) {
  if (!student) return "";
  const expl = explainScoreDrop(student, studentExamHistory(state, student.id), { seed: state.seed ?? 1 });
  if (!expl.dropped) return "";
  const exam = expl.exam || {};
  const schoolBit = expl.sharpSchool && expl.dropSchoolRank != null
    ? `校排第 ${expl.dropSchoolRank} 名（平时大约第 ${Math.round(expl.usualSchoolRank)} 名）`
    : "";
  const classBit = expl.dropRank != null
    ? `班排第 ${expl.dropRank} 名${expl.usualRank != null ? "，平时大约第 " + Math.round(expl.usualRank) + " 名" : ""}`
    : "";
  const head = compact
    ? `<p>${escapeHtml((exam.date || "") + "「" + (exam.examName || "这次考试") + "」" + [classBit, schoolBit].filter(Boolean).join("；") + "。")}</p>`
    : `<p class="muted">${escapeHtml(expl.sourceNote)}</p>`;
  return `<div class="paper visit-panel score-drop-panel" id="score-drop-panel" data-score-drop-panel="${escapeHtml(student.id)}">
    <h3>${expl.title}</h3>
    <p class="notice">该生这次考试明显退步。可先看下面的原因，或点「AI 分析近 5 次成绩」。若要当面询问，再用谈话按钮「询问学习 / 关注状态 / 谈心」（占用当日谈话次数）。查看原因本身不占用谈话次数。</p>
    ${head}
    <div class="row-actions"><button type="button" data-open-trend="${escapeHtml(student.id)}">AI 分析近 5 次成绩</button></div>
    <p><b>系统说明</b></p>
    <p>${escapeHtml(expl.systemText)}</p>
    <p><b>学生自己阐述</b></p>
    <p>${escapeHtml(expl.studentText)}</p>
    <div class="row-actions"><button type="button" class="talk-btn" data-ai-score-drop="${escapeHtml(student.id)}">用 AI 润色说明</button></div>
    <p class="notice" id="score-drop-ai-status" hidden></p>
    <p class="score-drop-ai-text" id="score-drop-ai-text" hidden></p>
  </div>`;
}

function bindScoreDropActions(host) {
  const btn = host.querySelector("[data-ai-score-drop]");
  if (!btn) return;
  btn.onclick = async () => {
    const status = host.querySelector("#score-drop-ai-status");
    const textEl = host.querySelector("#score-drop-ai-text");
    const sid = btn.dataset.aiScoreDrop;
    const student = findStudent(sid) || findStudentInState(state, sid);
    if (!student) return;
    const expl = explainScoreDrop(student, studentExamHistory(state, student.id), { seed: state.seed ?? 1 });
    const showLocal = (reason) => {
      if (status) { status.hidden = false; status.textContent = reason ? reason : "已使用本地说明。"; }
      if (textEl) { textEl.hidden = false; textEl.textContent = expl.localText; }
    };
    if (!expl.dropped) { showLocal(expl.reason || "当前没有大幅掉分需要说明。"); return; }
    const conf = loadAiSettings();
    if (!conf.hasKey) { showLocal("尚未保存密钥，先展示本地说明。"); return; }
    if (status) { status.hidden = false; status.textContent = "正在按档案润色说明…"; }
    try {
      const r = await requestScoreDropPolish(scoreDropAiPayload(expl), { settings: conf });
      if (!r.ok) { showLocal((r.reason || "润色失败") + " 已改用本地说明。"); return; }
      const checked = validateScoreDropText(r.text, expl);
      if (!checked.ok) { showLocal(checked.reason || "润色稿与档案不符，已改用本地说明。"); return; }
      if (status) { status.hidden = false; status.textContent = "已按档案核对，未编造作弊或缺考。"; }
      if (textEl) { textEl.hidden = false; textEl.textContent = checked.text; }
    } catch (err) {
      showLocal((err?.message || "润色失败") + " 已改用本地说明。");
    }
  };
}


function cohortReports() {
  const year = state?.player?.cohortYear;
  return listExamReports(state, year != null ? { entryYear: year } : {});
}

function playerScoreDropEntries(examId = null) {
  return listScoreDropEntries(clsStudents(), cohortReports(), { seed: state.seed ?? 1, examId });
}

function openStudentProfile(id, hash) {
  closeAppDialog();
  if (id) selectedId = id;
  view = "profile";
  render();
  if (hash) {
    const el = document.querySelector(hash);
    if (el) el.scrollIntoView({ block: "nearest" });
  }
}

function openClassScoreTrendView() {
  view = "grades";
  render();
  const el = document.querySelector("#class-score-trend");
  if (el) el.scrollIntoView({ block: "nearest" });
}

function enrichedDisciplineNotices() {
  return (state.disciplineNotices || []).map((n) => enrichDisciplineNotice(n, findStudent(n.studentId) || findStudentInState(state, n.studentId)));
}

function disciplineTrackLabel(track) {
  if (track === "wen") return "文科";
  if (track === "li") return "理科";
  if (track === "mixed") return "未分科";
  return "未分科";
}

function disciplineBoardHtml(exam = null) {
  const total = (state.disciplineNotices || []).length;
  const label = disciplineBoardButtonLabel(total);
  const examId = exam?.examId || exam?.id || "";
  return `<div class="board-entry discipline-board-entry" id="discipline-board">
    <button type="button" class="talk-btn" data-open-discipline="${escapeHtml(String(examId))}" data-open-discipline-date="${escapeHtml(exam?.date || exam?.examDate || "")}" data-open-discipline-name="${escapeHtml(exam?.examName || "")}" data-open-discipline-kind="${escapeHtml(exam?.examKind || "")}">${escapeHtml(label)}</button>
    <p class="muted">点开查看已查实的校内处分。未查实的举报不上榜。</p>
  </div>`;
}

function disciplineItemHtml(x) {
  const meta = [
    x.classNo != null && x.classNo !== "" ? `${x.classNo}班` : "",
    x.tier ? tierLabel(x.tier) : "",
    x.track ? disciplineTrackLabel(x.track) : "",
  ].filter(Boolean).join(" · ");
  return `<div class="discipline-item"><b>${escapeHtml(x.date || x.examDate || "")}</b> ${escapeHtml(x.title || "校内处分公告")}　${escapeHtml(x.body || "")}
    ${meta ? `<div class="muted">${escapeHtml(meta)}</div>` : ""}
    <div class="muted">${escapeHtml(x.source || "")}</div>
  </div>`;
}

function closeAppDialog() {
  const root = document.getElementById("app-dialog-root");
  if (!root) return;
  const prevOverflow = root.dataset.prevOverflow ?? "";
  document.body.style.overflow = prevOverflow;
  document.removeEventListener("keydown", appDialogKeyHandler);
  root.remove();
}

function appDialogKeyHandler(e) {
  if (e.key === "Escape") {
    e.preventDefault();
    closeAppDialog();
  }
}

function openAppDialog({ title, bodyHtml, onBind } = {}) {
  closeAppDialog();
  const root = document.createElement("div");
  root.id = "app-dialog-root";
  root.className = "app-dialog-root";
  root.dataset.prevOverflow = document.body.style.overflow || "";
  root.innerHTML = `
    <div class="app-dialog-backdrop" data-close-dialog="1"></div>
    <div class="app-dialog" role="dialog" aria-modal="true" aria-labelledby="app-dialog-title">
      <div class="app-dialog-head">
        <h3 id="app-dialog-title">${escapeHtml(title || "")}</h3>
        <button type="button" class="app-dialog-close accent" data-close-dialog="1">关闭</button>
      </div>
      <div class="app-dialog-body" id="app-dialog-body">${bodyHtml || ""}</div>
      <div class="app-dialog-foot">
        <button type="button" class="app-dialog-close app-dialog-close-bottom accent" data-close-dialog="1">关闭</button>
      </div>
    </div>`;
  document.body.appendChild(root);
  document.body.style.overflow = "hidden";
  document.addEventListener("keydown", appDialogKeyHandler);
  root.querySelectorAll("[data-close-dialog]").forEach((el) => {
    el.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      closeAppDialog();
    });
  });
  const closeBtn = root.querySelector(".app-dialog-close");
  if (closeBtn) closeBtn.focus();
  if (typeof onBind === "function") onBind(root.querySelector("#app-dialog-body"), root);
  return root;
}

function examContextFromButton(btn) {
  if (!btn) return null;
  const examId = btn.dataset.openDiscipline || "";
  const date = btn.dataset.openDisciplineDate || "";
  const examName = btn.dataset.openDisciplineName || "";
  const examKind = btn.dataset.openDisciplineKind || "";
  if (!examId && !date && !examName && !examKind) return null;
  return { examId, id: examId, date, examDate: date, examName, examKind };
}

function openDisciplineDialog(exam = null) {
  const notices = enrichedDisciplineNotices();
  const board = formatDisciplineBoard(notices, exam);
  const opts = disciplineNoticeFilterOptions(notices);
  const filters = { examId: "all", tier: "all", classNo: "all", track: "all" };
  const selectHtml = (id, label, items) => `<label>${escapeHtml(label)} <select id="${id}">${items}</select></label>`;
  const examOpts = [`<option value="all">全部考试</option>`].concat(
    opts.exams.map((e) => `<option value="${escapeHtml(e.value)}">${escapeHtml(e.label)}</option>`),
  ).join("");
  const tierOpts = [`<option value="all">全部层级</option>`].concat(
    opts.tiers.map((id) => `<option value="${escapeHtml(id)}">${escapeHtml(tierLabel(id))}</option>`),
  ).join("");
  const classOpts = [`<option value="all">全部班级</option>`].concat(
    opts.classes.map((no) => `<option value="${escapeHtml(String(no))}">${escapeHtml(String(no))}班</option>`),
  ).join("");
  const trackOpts = [`<option value="all">全部科类</option>`].concat(
    opts.tracks.map((id) => `<option value="${escapeHtml(id)}">${escapeHtml(disciplineTrackLabel(id))}</option>`),
  ).join("");
  const paintList = (body) => {
    const filtered = filterDisciplineNotices(notices, filters);
    const empty = disciplineBoardEmptyNote({
      exam,
      filters,
      currentCount: board.current.length,
      filteredCount: filtered.length,
      totalCount: notices.length,
    });
    const banner = (!filtersAreActive(filters) && board.currentNote && filtered.length)
      ? `<p class="notice">${escapeHtml(board.currentNote)}</p>`
      : "";
    const list = filtered.length
      ? `<p class="muted">已查实 ${filtered.length} 条，按时间倒序。未查实的举报不会出现在这里。</p>${filtered.map(disciplineItemHtml).join("")}`
      : `<p class="notice">${escapeHtml(empty)}</p><p class="muted">未查实的举报不会出现在这里。</p>`;
    const box = body.querySelector("#discipline-dialog-list");
    if (box) box.innerHTML = `${banner}${list}`;
  };
  const bodyHtml = `
    ${exam ? `<p class="muted">当前场次：${escapeHtml((exam.date || exam.examDate || "") + (exam.examName ? "「" + exam.examName + "」" : ""))}</p>` : ""}
    <div class="filters discipline-filters">
      ${selectHtml("disc-filter-exam", "考试", examOpts)}
      ${selectHtml("disc-filter-tier", "层级", tierOpts)}
      ${selectHtml("disc-filter-class", "班级", classOpts)}
      ${selectHtml("disc-filter-track", "文理科", trackOpts)}
    </div>
    <div id="discipline-dialog-list"></div>`;
  openAppDialog({
    title: "校内处分公告",
    bodyHtml,
    onBind(body) {
      const bindSel = (id, key) => {
        const el = body.querySelector(id);
        if (!el) return;
        el.onchange = () => { filters[key] = el.value; paintList(body); };
      };
      bindSel("#disc-filter-exam", "examId");
      bindSel("#disc-filter-tier", "tier");
      bindSel("#disc-filter-class", "classNo");
      bindSel("#disc-filter-track", "track");
      paintList(body);
    },
  });
}

function scoreDropBoardHtml({ exam = null, students = null } = {}) {
  const list = students || clsStudents();
  const reports = cohortReports();
  const entries = listScoreDropEntries(list, reports, { seed: state.seed ?? 1, examId: exam?.examId || null });
  const n = entries.length;
  const label = n > 0 ? `掉分需关注（${n}）` : "掉分需关注";
  return `<div class="board-entry score-drop-board-entry" id="score-drop-board">
    <button type="button" class="talk-btn" data-open-score-drop="${escapeHtml(exam?.examId || "")}">${escapeHtml(label)}</button>
    <p class="muted">点开查看大幅退步名单。进入说明不占用当日谈话次数。</p>
  </div>`;
}

function openScoreDropDialog({ exam = null, students = null, limit = 24 } = {}) {
  const list = students || clsStudents();
  const reports = cohortReports();
  const entries = listScoreDropEntries(list, reports, { seed: state.seed ?? 1, examId: exam?.examId || null });
  const rows = entries.slice(0, limit).map((e) => {
    const bits = [];
    if (e.dropRank != null) bits.push(`班排第 ${e.dropRank} 名`);
    if (e.usualRank != null) bits.push(`平时约第 ${Math.round(e.usualRank)} 名`);
    if (e.sharpSchool && e.schoolDelta != null) bits.push(`校排退步 ${e.schoolDelta} 名`);
    return `<li>${escapeHtml(e.name)}（${e.classNo}班）「${escapeHtml(e.examName || "这次考试")}」${escapeHtml(bits.join("，"))}
      <div class="row-actions">
        <button type="button" data-open-drop="${escapeHtml(e.studentId)}">查看掉分原因</button>
        <button type="button" data-open-trend="${escapeHtml(e.studentId)}">AI 分析近 5 次成绩</button>
      </div>
    </li>`;
  }).join("");
  const empty = exam
    ? `<p class="muted">本次考试没有触发「大幅掉分」说明的学生。普通中游波动不会出现在这里。触发条件包括：平时班排稳定前 5 后突然大掉，或前列学生高考/模拟未达二本，或校排相对平时退步 300 名及以上。</p>`
    : `<p class="muted">近几次没有触发大幅掉分说明的学生。普通中游波动不会出现在这里。</p>`;
  const bodyHtml = `
    <p>下列学生相对平时出现大幅退步。点「查看掉分原因」进入档案说明，不占用当日谈话次数。</p>
    ${entries.length ? `<ul>${rows}</ul>` : empty}`;
  openAppDialog({
    title: entries.length ? `掉分需关注（${entries.length}）` : "掉分需关注",
    bodyHtml,
    onBind(body) {
      body.querySelectorAll("[data-open-drop]").forEach((b) => {
        b.onclick = (ev) => {
          ev.stopPropagation();
          closeAppDialog();
          openStudentProfile(b.dataset.openDrop, "#score-drop-panel");
        };
      });
      body.querySelectorAll("[data-open-trend]").forEach((b) => {
        b.onclick = (ev) => {
          ev.stopPropagation();
          closeAppDialog();
          openStudentProfile(b.dataset.openTrend, "#student-score-trend");
        };
      });
    },
  });
}


function studentScoreTrendPanelHtml(student) {
  if (!student) return "";
  const facts = buildStudentScoreTrendFacts(student, studentExamHistory(state, student.id), { revealPotential: godReveal() });
  const local = formatLocalStudentScoreTrend(facts);
  if (!facts.ok) {
    return `<div class="paper score-trend-panel" id="student-score-trend"><h3>近 5 次成绩分析</h3><p class="muted">${escapeHtml(facts.reason)}</p></div>`;
  }
  const model = studentScoreTrendChartModel(facts);
  return `<div class="paper score-trend-panel" id="student-score-trend" data-score-trend-panel="${escapeHtml(student.id)}">
    <h3>近 5 次成绩分析</h3>
    <p class="muted">${escapeHtml(facts.examCountNote)} ${escapeHtml(SCORE_TREND_SOURCE_NOTE)} 不占用每日谈话次数。</p>
    <div class="charts">
      <div class="chart-card"><h4>总分走势（折合 750 分）</h4><canvas id="st-trend-total" width="640" height="200"></canvas></div>
      <div class="chart-card"><h4>班排 / 校排（名次在上为靠前）</h4><canvas id="st-trend-rank" width="640" height="200"></canvas></div>
      <div class="chart-card"><h4>${escapeHtml(model.subjects.title || "各科得分率")}</h4><canvas id="st-trend-subj" width="640" height="200"></canvas></div>
    </div>
    <h4>文字分析</h4>
    <p class="score-trend-text" id="st-trend-text">${escapeHtml(local)}</p>
    <div class="row-actions"><button type="button" class="talk-btn" data-ai-score-trend="${escapeHtml(student.id)}">AI 分析近 5 次成绩</button></div>
    <p class="notice" id="st-trend-status" hidden></p>
  </div>`;
}

function classScoreTrendPanelHtml() {
  const classNo = state.player?.classNo;
  if (classNo == null) return "";
  const facts = buildClassScoreTrendFacts(cohortReports(), { classNo, className: `卓行${classNo}班`, revealPotential: godReveal() });
  const local = formatLocalClassScoreTrend(facts);
  if (!facts.ok) {
    return `<div class="paper score-trend-panel" id="class-score-trend"><h3>全班成绩 AI 分析</h3><p class="muted">${escapeHtml(facts.reason)}</p></div>`;
  }
  const model = classScoreTrendChartModel(facts);
  return `<div class="paper score-trend-panel" id="class-score-trend">
    <h3>全班成绩 AI 分析</h3>
    <p class="muted">${escapeHtml(facts.examCountNote)} ${escapeHtml(SCORE_TREND_SOURCE_NOTE)} 不占用每日谈话次数。无密钥或失败时仍显示图表和本地文字。</p>
    <div class="charts">
      <div class="chart-card"><h4>班级均分走势（折合 750 分）</h4><canvas id="cl-trend-avg" width="640" height="200"></canvas></div>
      <div class="chart-card"><h4>班级均校排（名次在上为靠前）</h4><canvas id="cl-trend-rank" width="640" height="200"></canvas></div>
      <div class="chart-card"><h4>校内上线人数变化</h4><canvas id="cl-trend-line" width="640" height="200"></canvas></div>
      <div class="chart-card"><h4>${escapeHtml(model.bands.title || "分数段人数")}</h4><canvas id="cl-trend-bands" width="640" height="200"></canvas></div>
    </div>
    <h4>文字分析</h4>
    <p class="score-trend-text" id="cl-trend-text">${escapeHtml(local)}</p>
    <div class="row-actions"><button type="button" class="talk-btn" data-ai-class-trend="1">全班成绩 AI 分析</button></div>
    <p class="notice" id="cl-trend-status" hidden></p>
  </div>`;
}

function bindBoardDialogs(host) {
  if (!host) return;
  host.querySelectorAll("[data-open-discipline]").forEach((b) => {
    b.onclick = (ev) => {
      ev.stopPropagation();
      openDisciplineDialog(examContextFromButton(b));
    };
  });
  host.querySelectorAll("[data-open-score-drop]").forEach((b) => {
    b.onclick = (ev) => {
      ev.stopPropagation();
      const examId = b.dataset.openScoreDrop || "";
      const exam = examId ? { examId, id: examId } : null;
      openScoreDropDialog({ exam, students: clsStudents() });
    };
  });
}

function bindScoreTrendPanels(host) {
  if (!host) return;
  bindBoardDialogs(host);
  host.querySelectorAll("[data-open-drop]").forEach((b) => {
    b.onclick = (ev) => { ev.stopPropagation(); openStudentProfile(b.dataset.openDrop, "#score-drop-panel"); };
  });
  host.querySelectorAll("[data-open-trend]").forEach((b) => {
    b.onclick = (ev) => { ev.stopPropagation(); openStudentProfile(b.dataset.openTrend, "#student-score-trend"); };
  });
  host.querySelectorAll("[data-open-class-trend]").forEach((b) => {
    b.onclick = (ev) => { ev.stopPropagation(); openClassScoreTrendView(); };
  });
  const stuCanvasT = host.querySelector("#st-trend-total");
  const sid = host.querySelector("[data-score-trend-panel]")?.dataset.scoreTrendPanel || selectedId;
  const student = sid ? (findStudent(sid) || findStudentInState(state, sid)) : null;
  if (stuCanvasT && student) {
    const facts = buildStudentScoreTrendFacts(student, studentExamHistory(state, student.id), { revealPotential: godReveal() });
    if (facts.ok) {
      const model = studentScoreTrendChartModel(facts);
      drawLineChart(stuCanvasT, model.total);
      const rk = host.querySelector("#st-trend-rank");
      if (rk) drawLineChart(rk, model.ranks);
      const sub = host.querySelector("#st-trend-subj");
      if (sub) drawBarChart(sub, model.subjects);
    }
  }
  const clAvg = host.querySelector("#cl-trend-avg");
  if (clAvg) {
    const facts = buildClassScoreTrendFacts(cohortReports(), { classNo: state.player.classNo, className: `卓行${state.player.classNo}班`, revealPotential: godReveal() });
    if (facts.ok) {
      const model = classScoreTrendChartModel(facts);
      drawLineChart(clAvg, model.avg);
      const rk = host.querySelector("#cl-trend-rank");
      if (rk) drawLineChart(rk, model.ranks);
      const ln = host.querySelector("#cl-trend-line");
      if (ln) drawLineChart(ln, model.lines);
      const bd = host.querySelector("#cl-trend-bands");
      if (bd) drawBarChart(bd, model.bands);
    }
  }
  const aiStu = host.querySelector("[data-ai-score-trend]");
  if (aiStu) {
    aiStu.onclick = async (ev) => {
      ev.stopPropagation();
      const id = aiStu.dataset.aiScoreTrend;
      const stu = findStudent(id) || findStudentInState(state, id);
      const status = host.querySelector("#st-trend-status");
      const textEl = host.querySelector("#st-trend-text");
      const facts = buildStudentScoreTrendFacts(stu, studentExamHistory(state, stu?.id), { revealPotential: godReveal() });
      const local = formatLocalStudentScoreTrend(facts);
      const showLocal = (reason) => {
        if (status) { status.hidden = false; status.textContent = (reason ? reason + " " : "") + "以下为本地分析。"; }
        if (textEl) textEl.textContent = local;
      };
      if (!facts.ok) { showLocal(facts.reason); return; }
      const conf = loadAiSettings();
      if (!conf.hasKey) { showLocal("尚未保存密钥。"); return; }
      if (status) { status.hidden = false; status.textContent = "正在按档案生成文字分析…"; }
      try {
        const r = await requestStudentScoreTrend(studentScoreTrendAiPayload(facts), { settings: conf });
        if (!r.ok) { showLocal(r.reason || "分析失败"); return; }
        const checked = validateScoreTrendText(r.text, facts);
        if (!checked.ok) { showLocal(checked.reason); return; }
        if (status) { status.hidden = false; status.textContent = "已按档案核对，图表仍是真实成绩，文字未编造作弊或缺考。"; }
        if (textEl) textEl.textContent = checked.text;
      } catch (err) {
        showLocal(err?.message || "分析失败");
      }
    };
  }
  const aiCls = host.querySelector("[data-ai-class-trend]");
  if (aiCls) {
    aiCls.onclick = async (ev) => {
      ev.stopPropagation();
      const status = host.querySelector("#cl-trend-status");
      const textEl = host.querySelector("#cl-trend-text");
      const facts = buildClassScoreTrendFacts(cohortReports(), { classNo: state.player.classNo, className: `卓行${state.player.classNo}班`, revealPotential: godReveal() });
      const local = formatLocalClassScoreTrend(facts);
      const showLocal = (reason) => {
        if (status) { status.hidden = false; status.textContent = (reason ? reason + " " : "") + "以下为本地分析。"; }
        if (textEl) textEl.textContent = local;
      };
      if (!facts.ok) { showLocal(facts.reason); return; }
      const conf = loadAiSettings();
      if (!conf.hasKey) { showLocal("尚未保存密钥。"); return; }
      if (status) { status.hidden = false; status.textContent = "正在按本班档案生成文字分析…"; }
      try {
        const r = await requestClassScoreTrend(classScoreTrendAiPayload(facts), { settings: conf });
        if (!r.ok) { showLocal(r.reason || "分析失败"); return; }
        const checked = validateScoreTrendText(r.text, facts);
        if (!checked.ok) { showLocal(checked.reason); return; }
        if (status) { status.hidden = false; status.textContent = "已按档案核对，图表仍是真实成绩，文字未编造作弊或缺考。"; }
        if (textEl) textEl.textContent = checked.text;
      } catch (err) {
        showLocal(err?.message || "分析失败");
      }
    };
  }
}

function talkFactPayload(student, topic) {
  const ctx = studentTeachingContext(student, state) || {};
  const hist = studentExamHistory(state, student.id);
  const resume = buildStudentResume(state, student, { date: state.date, revealPotential: false });
  const drop = explainScoreDrop(student, hist, { seed: state.seed ?? 1 });
  return {
    须知: "只根据下列事实写谈话，不得编造分数、排名、奖项、潜力、作弊或缺考。掉分原因须与材料一致，推测须标明不是已查实处分。",
    主题: topic || "谈话",
    学生: student.name,
    班级: student.classNo,
    性格: student.personality || "",
    作业: ctx.hw || null,
    课堂: ctx.flag || "",
    近几次考试: (resume.facts?.recent || []).map((x) => x.text),
    职务: resume.facts?.officeLine,
    比赛: resume.facts?.awardLines,
    所处水平: resume.facts?.standing?.text,
    掉分说明: drop.dropped ? { 系统说明: drop.systemText, 学生自己阐述: drop.studentText, 须知: drop.sourceNote } : null,
  };
}

function teachingFactPayload(last, plan) {
  return {
    须知: "只根据下列课堂事实写反思，不得改分数、能力、潜力或省控。",
    日期: last?.date || state.date,
    课题: last?.topic || plan?.topic || "",
    课型: last?.style || "",
    纪要: last?.notes || [],
    小测均分: last?.quizAvg ?? null,
    作业缺交: last?.homeworkMissing ?? null,
    备课: last?.prepUsed ? "有教案" : "备课不足",
  };
}

function toppersPanelHtml(report, reports, { track } = {}) {
  if (!report) return "";
  const tr = report.split ? (track === "wen" || track === "li" ? track : undefined) : undefined;
  const tiers = sameTierFirstBoard(report, reports, { track: tr });
  const classes = classFirstBoard(report, reports, { track: tr });
  const tierRows = tiers.map((x) => `<tr data-id="${x.studentId || ""}"><td>${escapeHtml(x.tierName)}</td><td>${escapeHtml(x.name)}</td><td>${x.classNo ?? "—"}班</td><td>${x.total ?? "—"}</td><td>${x.schoolRank ?? "—"}</td><td>${x.scoreDelta == null ? "—" : (x.scoreDelta > 0 ? "+" : "") + x.scoreDelta}</td><td>${escapeHtml(formatStability(x.series))}</td></tr>`).join("");
  const classRows = classes.map((x) => `<tr data-id="${x.studentId || ""}"><td>${x.classNo}班</td><td>${escapeHtml(x.tierName || "")}</td><td>${escapeHtml(x.name)}</td><td>${x.total ?? "—"}</td><td>${x.schoolRank ?? "—"}</td><td>${x.scoreDelta == null ? "—" : (x.scoreDelta > 0 ? "+" : "") + x.scoreDelta}</td><td>${escapeHtml(formatStability(x.series))}</td></tr>`).join("");
  return `<div class="paper toppers-panel" id="toppers-panel">
    <h4>同层次第一与各班第一</h4>
    <p class="muted">看本场第一以及历次分差、是否经常换人。名次与分数来自已结算考试，不改划线。点姓名可看档案。</p>
    <div class="toppers-grid">
      <div>
        <h5>同层次第一</h5>
        <div class="scroll-table"><table><thead><tr><th>层次</th><th>姓名</th><th>班</th><th>总分</th><th>校排</th><th>分差</th><th>稳定性</th></tr></thead><tbody>${tierRows}</tbody></table></div>
        <div class="chart-card"><h4>同层次第一总分走势</h4><canvas id="ch-tier-first" width="640" height="230"></canvas></div>
      </div>
      <div>
        <h5>各班第一</h5>
        <div class="scroll-table"><table><thead><tr><th>班</th><th>层次</th><th>姓名</th><th>总分</th><th>校排</th><th>分差</th><th>稳定性</th></tr></thead><tbody>${classRows}</tbody></table></div>
        <div class="chart-card"><h4>任教班第一总分与是否换人</h4><canvas id="ch-class-first" width="640" height="230"></canvas></div>
      </div>
    </div>
  </div>`;
}

function bindToppersCharts(host, report, reports, { track, classNo } = {}) {
  const panel = host.querySelector("#toppers-panel");
  if (!panel || !report) return;
  const tr = report.split ? (track === "wen" || track === "li" ? track : undefined) : undefined;
  const myTier = (report.rows || []).find((r) => Number(r.classNo) === Number(classNo ?? state.player.classNo))?.tier;
  const seriesTier = sameTierFirstBoard(report, reports, { track: tr }).find((x) => x.tier === myTier);
  const seriesClass = classFirstBoard(report, reports, { track: tr }).find((x) => Number(x.classNo) === Number(classNo ?? state.player.classNo));
  scheduleChartPaint(() => {
    const a = host.querySelector("#ch-tier-first");
    const b = host.querySelector("#ch-class-first");
    if (a && seriesTier?.series?.points?.length) {
      drawLineChart(a, {
        labels: seriesTier.series.points.map((p) => String(p.date || "").slice(5)),
        yLabel: "总分",
        series: [
          { name: `${seriesTier.tierName}第一总分`, values: seriesTier.series.points.map((p) => p.total), color: "#3d6b5a" },
          { name: "较上场分差", values: seriesTier.series.points.map((p) => p.scoreDelta), color: "#c45c4a" },
        ],
      });
    }
    if (b && seriesClass?.series?.points?.length) {
      drawLineChart(b, {
        labels: seriesClass.series.points.map((p) => String(p.date || "").slice(5)),
        yLabel: "总分",
        series: [
          { name: `${seriesClass.classNo}班第一总分`, values: seriesClass.series.points.map((p) => p.total), color: "#3d5c6b" },
          { name: "较上场分差", values: seriesClass.series.points.map((p) => p.scoreDelta), color: "#c45c4a" },
        ],
      });
    }
  });
  panel.querySelectorAll("tr[data-id]").forEach((trEl) => {
    if (!trEl.dataset.id) return;
    trEl.style.cursor = "pointer";
  });
}


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

let persistWarned = false;
let bootBusy = false;
const bootQueue = createBootQueue();

function persist({ notify = false } = {}) {
  if (!state) return { ok: false, reason: "没有可保存的进度。" };
  const r = saveSlot(state, "auto");
  if (r.ok) persistWarned = false;
  else if (notify || !persistWarned) {
    toast(r.reason || "自动档没有写上。游戏仍可继续。");
    persistWarned = true;
  }
  return r;
}

let persistTimer = 0;
function schedulePersist() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = 0;
    persist();
  }, 0);
}

function flushPersist() {
  if (!state) return;
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = 0;
  }
  persist();
}

function bindPersistFlush() {
  window.addEventListener("pagehide", flushPersist);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushPersist();
  });
}

function paintThen(fn) {
  return new Promise((resolve) => {
    const raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (cb) => setTimeout(cb, 0);
    raf(() => setTimeout(resolve, 0));
  }).then(fn);
}

function showLoading({ title = "正在开局", label = "正在生成全校名单", progress = 6, hint = "" } = {}) {
  let mask = $("#loading-mask");
  if (!mask) {
    mask = document.createElement("div");
    mask.id = "loading-mask";
    mask.className = "loading-mask";
    mask.innerHTML = `<div class="loading-box" role="status">
      <h2 id="loading-title"></h2>
      <p id="loading-step"></p>
      <div class="loading-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" id="loading-bar">
        <div id="loading-bar-fill" class="loading-bar-fill"></div>
      </div>
      <p id="loading-hint" class="loading-hint"></p>
    </div>`;
    document.body.appendChild(mask);
  }
  mask.hidden = false;
  mask.classList.remove("hidden");
  mask.style.display = "grid";
  mask.style.position = "fixed";
  mask.style.inset = "0";
  mask.style.zIndex = "9999";
  mask.setAttribute("aria-busy", "true");
  void mask.offsetHeight;
  const titleEl = $("#loading-title");
  const stepEl = $("#loading-step");
  const bar = $("#loading-bar");
  const fill = $("#loading-bar-fill");
  const hintEl = $("#loading-hint");
  if (titleEl) titleEl.textContent = title;
  if (stepEl) stepEl.textContent = label;
  const pct = Math.max(0, Math.min(100, Number(progress) || 0));
  if (bar) bar.setAttribute("aria-valuenow", String(pct));
  if (fill) fill.style.width = `${pct}%`;
  if (hintEl) {
    hintEl.textContent = hint || "生成全校名单时进度会更新，请勿关掉页面。";
  }
}

function hideLoading() {
  const mask = $("#loading-mask");
  if (!mask) return;
  mask.classList.add("hidden");
  mask.hidden = true;
  mask.style.display = "none";
  mask.setAttribute("aria-busy", "false");
}

function setBootBusy(busy) {
  bootBusy = busy;
  const newBtn = $("#btn-new");
  const contBtn = $("#btn-cont");
  if (newBtn) newBtn.disabled = busy;
  if (contBtn) contBtn.disabled = busy;
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
  bindPersistFlush();
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
  async function startNewFromForm() {
    showLoading({ title: "正在开局", label: "正在生成全校名单", progress: 6, hint: "生成全校名单时进度会更新，请勿关掉页面。" });
    const name = $("#pname")?.value.trim() || "林知秋";
    const typed = parseGameSeed($("#pseed")?.value);
    const seed = typed ?? freshGameSeed();
    try {
      const r = await startNewGameSession({
        playerName: name,
        seed,
        typed: typed != null,
        createGameAsync,
        saveAuto: (st) => saveSlot(st, "auto"),
        paint: (info) => showLoading({
          title: info.phase === "save" ? "正在保存" : (info.phase === "enter" ? "即将开始" : "正在开局"),
          label: info.label,
          progress: info.progress,
          hint: info.phase === "save"
            ? "正在写入自动档。若本机空间不足，仍会进入游戏，只是这次可能没有写下存档。"
            : "生成全校名单时进度会更新，请勿关掉页面。",
        }),
      });
      state = r.state;
      persistWarned = !r.saved;
      selectedId = playerStudents(state)[0]?.id;
      hideLoading();
      showMain();
      toast(r.toast);
    } catch (err) {
      hideLoading();
      console.error(err);
      if (state) {
        try { showMain(); } catch (e2) { console.error(e2); }
        toast("已经进入游戏，但有一页没有画出来。请先看看教室，或刷新后再试。");
      } else {
        toast("开局没有完成，请再试一次。");
      }
    }
  }

  async function continueFromStorage() {
    showLoading({ title: "正在读档", label: "正在读取存档", progress: 20, hint: "正在读取自动档，请稍候，请勿关掉页面。" });
    try {
      const r = await continueGameSession({
        loadAuto: () => loadSlotResult("auto"),
        paint: (info) => showLoading({ title: "正在读档", label: info.label, progress: info.progress, hint: "正在读取自动档，请稍候，请勿关掉页面。" }),
      });
      if (!r.ok) {
        hideLoading();
        toast(r.reason || "还没有自动存档");
        return;
      }
      state = r.state;
      selectedId = playerStudents(state)[0]?.id;
      hideLoading();
      showMain();
    } catch (err) {
      hideLoading();
      toast("存档读取失败，请再试一次。");
    }
  }

  async function runBoot(action) {
    const pending = (typeof window !== "undefined" && window.__sanchiPendingBoot)
      ? window.__sanchiPendingBoot.action
      : null;
    if (typeof window !== "undefined") window.__sanchiPendingBoot = null;
    if (pending) bootQueue.record(pending);
    const started = bootQueue.begin(action);
    if (!started) return;
    setBootBusy(true);
    try {
      if (started === "continue") await continueFromStorage();
      else await startNewFromForm();
    } finally {
      bootQueue.end();
      setBootBusy(false);
    }
  }

  const newBtn = $("#btn-new");
  const contBtn = $("#btn-cont");
  if (newBtn) newBtn.onclick = () => { runBoot("new"); };
  if (contBtn) contBtn.onclick = () => { runBoot("continue"); };
  if (typeof window !== "undefined") {
    window.__sanchiRunBoot = runBoot;
    if (window.__sanchiPendingBoot?.action) runBoot(window.__sanchiPendingBoot.action);
  }
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

async function handleSkipYear() {
  if (!state || skipYearBusy) return;
  const plan = planSkipToNextSchoolYear(state);
  if (!plan.ok) {
    toast(plan.reason);
    return;
  }
  skipYearBusy = true;
  const startDate = state.date;
  const targetDate = plan.targetDate;
  showLoading({
    title: "正在进入下一学年",
    label: `将推进到${plan.event.name}`,
    progress: 6,
    hint: "一整学年会连续结算多场考试，请稍候，请勿关掉页面。",
  });
  await new Promise((resolve) => {
    const raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (fn) => setTimeout(fn, 0);
    raf(() => setTimeout(resolve, 0));
  });
  try {
    const r = await skipToNextSchoolYearAsync(state, {
      onProgress: ({ event, date }) => {
        const t0 = Date.parse(startDate);
        const t1 = Date.parse(targetDate);
        const t = Date.parse(date || state.date);
        const pct = Number.isFinite(t0) && Number.isFinite(t1) && t1 > t0
          ? Math.min(96, Math.max(8, 8 + 88 * ((t - t0) / (t1 - t0))))
          : 50;
        showLoading({
          title: "正在进入下一学年",
          label: event ? `正在结算：${event.date} ${event.name}` : "正在推进校历",
          progress: pct,
          hint: "一整学年会连续结算多场考试，请稍候，请勿关掉页面。",
        });
      },
    });
    persist();
    hideLoading();
    render();
    if (r.ok && r.becameOfficial) toast(r.message || OFFICIAL_LOG_TEXT);
    else toast(r.ok ? (r.message || `已推进到${plan.event.name}`) : (r.reason || "无法推进"));
  } catch (err) {
    hideLoading();
    toast("推进下一学年没有完成，请再试一次。");
  } finally {
    skipYearBusy = false;
  }
}

function handleAct(act) {
  if (!state) return;
  if (act === "skip-year") {
    handleSkipYear();
    return;
  }
  if (act === "prep") { const r = prepareLesson(state); toast(r.text || "备课完成"); }
  if (act === "teach") {
    const r = teach(state, "精讲例题", selectedId);
    toast(r.ok === false ? (r.reason || r.text) : (r.text || "已上完一节数学课"));
  }
  if (act === "nextperiod") {
    const r = advancePeriod(state);
    if (r.result?.becameOfficial || r.becameOfficial) toast(OFFICIAL_LOG_TEXT);
    else toast(r.settled ? (r.text || `结算：${r.type}`) : (r.text || r.reason || "已到下一节"));
  }
  if (act === "nextday") {
    const r = advanceDay(state);
    if (r.becameOfficial) toast(OFFICIAL_LOG_TEXT);
    else if (r.type === "activity") toast(r.text || r.result?.text || `今日学校活动「${r.event?.name || r.name || ""}」`);
    else if (r.type && r.type !== "day") toast(`结算：${r.type}`);
    else if (r.text) toast(r.text);
  }
  if (act === "skip") {
    handleSkipStage();
    return;
  }
  render();
  schedulePersist();
}

async function handleSkipStage() {
  if (!state || skipYearBusy) return;
  skipYearBusy = true;
  showLoading({
    title: "正在进入下一阶段",
    label: "正在结算课业和考试",
    progress: 12,
    hint: "若碰上全校统考或写入存档，可能要等几秒，请勿关掉页面。",
  });
  await paintThen(() => {});
  try {
    const r = skipToNextStage(state);
    showLoading({
      title: "正在进入下一阶段",
      label: "正在保存并刷新",
      progress: 80,
      hint: "若碰上全校统考或写入存档，可能要等几秒，请勿关掉页面。",
    });
    render();
    persist();
    hideLoading();
    toast(r.ok ? (r.message || `已推进到 ${r.event.name}`) : (r.reason || "无法推进"));
  } catch {
    hideLoading();
    toast("推进没有完成，请再试一次。");
  } finally {
    skipYearBusy = false;
  }
}

function syncOfficialNotice() {
  const el = $("#official-notice");
  if (!el) return;
  const note = state?.officialNotice;
  if (note && !note.dismissed) {
    el.hidden = false;
    el.classList.remove("hidden");
    el.innerHTML = `<p><b>转正</b>　${escapeHtml(note.text)}顶栏任职已改为正式数学教师，设置里也有说明。</p><button type="button" class="accent" id="official-notice-ok">知道了</button>`;
    const ok = el.querySelector("#official-notice-ok");
    if (ok) ok.onclick = () => {
      state.officialNotice = { ...note, dismissed: true };
      persist();
      syncOfficialNotice();
    };
  } else {
    el.hidden = true;
    el.classList.add("hidden");
    el.innerHTML = "";
  }
}

const VIEW_MAP = () => ({ classroom: viewClassroom, roster: viewRoster, profile: viewProfile, teach: viewTeach, class: viewClassManage, placement: viewPlacement, grades: viewGrades, office: viewOffice, admission: viewAdmission, auto: viewAuto, log: viewLog, save: viewSave, settings: viewSettings });

function bindViewDelegation(host) {
  if (!host || viewDelegateBound) return;
  viewDelegateBound = true;
  host.addEventListener("click", (e) => {
    const tr = e.target.closest("tr[data-id]");
    if (!tr || !host.contains(tr) || !tr.dataset.id) return;
    if (e.target.closest("button, a, input, select, textarea, label")) return;
    selectedId = tr.dataset.id;
    view = "profile";
    render({ agenda: "auto" });
  });
}

function paintCurrentView(host = $("#view")) {
  if (!host) return;
  bindViewDelegation(host);
  const map = VIEW_MAP();
  (map[view] || viewClassroom)(host);
}

function paintChrome() {
  const grade = gradeOf(state.player.cohortYear, state.date);
  const term = formatGradeTerm(grade, state.date);
  const dateShort = formatDateCn(state.date).replace(/ 星期.?$/, "");
  const sub = $("#school-sub");
  if (sub) {
    const gradeBit = grade >= 1 && grade <= 3 ? term.replace("学期", "") : term;
    sub.textContent = `江西省宁川中学 · ${dateShort} · ${state.player.cohortYear}级${gradeBit}`;
  }
  syncChrome();
  const clock = $("#clock");
  if (clock) clock.textContent = formatDateCn(state.date);
  const gradeEl = $("#gradeline");
  if (gradeEl) gradeEl.textContent = `你带的${state.player.cohortYear}级 · ${term}`;
  const slot = currentSlot(state);
  const periodEl = $("#periodline");
  if (periodEl) {
    const tag = slot?.isTutoring ? " · 可答疑" : slot?.isMath ? " · 数学课" : isCalendarExamDay(state.date) ? " · 监考" : slot?.isExamDay ? " · 停课" : slot?.isActivityPeriod ? " · 活动" : slot?.id === "rest" ? " · 休息" : "";
    periodEl.textContent = (slot ? formatSlotLabel(slot) : "") + tag;
  }
  const roleEl = $("#roleline");
  if (roleEl) roleEl.textContent = `${playerCareerLine(state.player)} ${state.player.name} · ${state.player.cohortYear}级卓行${state.player.classNo}班 ${playerSubjectName(state.player)}`;
  const careerEl = $("#careerline");
  if (careerEl) careerEl.textContent = playerCareerStatus(state.player);
  syncOfficialNotice();
  document.querySelectorAll("#sidenav [data-view]").forEach((b) => b.classList.toggle("on", b.dataset.view === view));
}

function paintAgendaIfNeeded(mode = "auto") {
  const key = agendaStateKey(state);
  if (mode === false) return;
  if (mode === "auto" && !shouldRefreshAgenda(lastAgendaKey, key)) return;
  renderAgenda();
  lastAgendaKey = key;
}

/** 刷新界面。切页和下拉默认不重画未变的侧栏课表；推进校历或谈话后会自动重画。 */
function render(opts = {}) {
  if (!state) return;
  const refreshView = opts.view !== false;
  const agendaMode = opts.agenda === undefined ? "auto" : opts.agenda;
  paintChrome();
  const host = $("#view");
  try {
    if (refreshView && host) {
      closeAppDialog();
      if (opts.keepViewShell) paintCurrentView(host);
      else {
        host.innerHTML = "";
        paintCurrentView(host);
      }
    }
    paintAgendaIfNeeded(agendaMode);
  } catch (err) {
    console.error(err);
    if (host) host.innerHTML = "<p class=\"notice\">这一页打开失败，请刷新后再试。如果还是空白，把现象发我即可。</p>";
  }
  syncSidenavHint();
}

function repaintViewOnly() {
  const host = $("#view");
  if (host) paintCurrentView(host);
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
    const senior = report.grade >= 3 || report.cutoffs?.includeRepeat;
    const school = senior
      ? "校内线按该科类应届与补习班同一池约第 520、第 1100 名划，只作校内对照，不冒充市线或省线。"
      : "校内线按本年级应届池比例折算，不能套用高三的第 520、第 1100 名，只作校内对照，不冒充市线或省线。";
    return report.sourceNote || `按公开高考规模模拟的联考位次/划线，不是当年官方联考一分一段。${school}`;
  }
  return report.sourceNote || "";
}

function seatMarks(students) {
  seatMarks._dropIds = null;
  const slot = currentSlot(state);
  const watch = new Set(homeworkWatchlist(state.homework, state).map((r) => r.id));
  const hands = slot?.isTutoring ? new Set(raisedHands(state, students).map((s) => s.id)) : new Set();
  const marks = {};
  const lateSet = slot?.isMath && !slot?.isTutoring
    ? new Set(classLatecomers(state, students).map((s) => s.id))
    : new Set();
  const picked = students.find((x) => x.id === selectedId) || null;
  const peers = picked ? classPeersOf(picked, students) : { deskMate: null, friends: [], tense: null };
  const friendIds = new Set((peers.friends || []).map((f) => f.id));
  for (const s of students) {
    const lateNow = slot?.isMath && !slot?.isTutoring && lateSet.has(s.id);
    const dropIds = seatMarks._dropIds || (seatMarks._dropIds = new Set(playerScoreDropEntries().map((e) => e.studentId)));
    marks[s.id] = {
      hand: hands.has(s.id),
      watch: watch.has(s.id),
      drowsy: !isAwayFromClass(s, state) && (s.lastClassFlag === "走神" || (s.energy ?? 70) < 48),
      late: lateNow,
      absent: isAwayFromClass(s, state),
      desk: !!(peers.deskMate && s.id === peers.deskMate.id),
      friend: friendIds.has(s.id),
      tense: !!(peers.tense && s.id === peers.tense.id),
      scoreDrop: dropIds.has(s.id),
    };
  }
  return marks;
}

function absenceNotice(students) {
  const away = classAbsences(students, state);
  if (!away.length) return "";
  return `。今日请假：${away.slice(0, 4).map((s) => s.name).join("、")}${away.length > 4 ? "等" : ""}，座位空着`;
}

function peerLinksHtml(student, classmates) {

  if (!student) return "";
  const { deskMate, friends, tense } = classPeersOf(student, classmates);
  const link = (x) => `<button type="button" class="peer-link" data-peer="${x.id}">${x.name}</button>`;
  const bits = [];
  if (deskMate) bits.push(`同桌 ${link(deskMate)}`);
  else bits.push("这排边上没有同桌");
  if (friends.length) bits.push(`要好 ${friends.map(link).join("、")}`);
  if (tense) bits.push(`别扭 ${link(tense)}`);
  return `<p class="muted">同伴关系：${bits.join("　")}</p>`;
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

function visitPanelHtml() {
  if (!state) return "";
  ensureVisits(state);
  const items = currentVisitItems(state);
  if (!items.length) return "";
  const rows = items.map((v) => {
    if (v.handled) {
      return `<p class="muted">已处理：${v.resolution || "这趟来访已经记下来了。"}</p>`;
    }
    const btns = (v.options || []).map((o) => `<button type="button" data-visit="${v.studentId}" data-visit-act="${o.id}">${o.label}</button>`).join("");
    return `<p><b>${v.name}</b>　${v.reason}</p><div class="row-actions">${btns}</div>`;
  }).join("");
  return `<div class="paper visit-panel" data-visit-panel="1">
      <h3>学生来访</h3>
      ${rows}
    </div>`;
}

function bindVisitActions(host) {
  host.querySelectorAll("[data-visit]").forEach((b) => {
    b.onclick = (ev) => {
      ev.stopPropagation();
      const r = handleVisit(state, b.dataset.visit, b.dataset.visitAct);
      toast(r.ok ? r.text : r.reason);
      persist(); render();
    };
  });
}

function phoneVisitPanelHtml() {
  if (!state) return "";
  ensureHomeVisitState(state);
  const open = isPhoneVisitOpen(state);
  const rec = state.homeVisit || {};
  const today = rec.phoneDate === state.date ? (rec.phoneToday || 0) : 0;
  const term = rec.phoneCount || 0;
  if (!open) {
    return `<div class="paper visit-panel home-visit-panel" data-phone-panel="1">
      <h3>电话家访</h3>
      <p class="muted">${phoneVisitUnavailableReason(state)}</p>
    </div>`;
  }
  const rows = suggestPhoneVisits(state).map((v) => {
    const btns = (v.options || []).map((o) => `<button type="button" data-phone-visit="${v.studentId}" data-phone-act="${o.id}">${o.label}</button>`).join("");
    return `<p><b>${v.name}</b>　${v.reason}${v.onLeave ? "　（请假在家，可以打电话）" : ""}</p><div class="row-actions">${btns}</div>`;
  }).join("");
  return `<div class="paper visit-panel home-visit-panel" data-phone-panel="1">
      <h3>电话家访</h3>
      <p class="muted">办公室坐班时可以给本班家长打电话。你是数学任课老师，不是代替班主任访遍全班。今天还可以打 ${Math.max(0, PHONE_DAY_CAP - today)} 通，本学期已打 ${term} / ${PHONE_TERM_CAP} 通。</p>
      ${rows || `<p class="muted">眼下没有特别要先联系的人家。</p>`}
    </div>`;
}

function doorVisitPanelHtml({ always = false } = {}) {
  if (!state) return "";
  ensureHomeVisitState(state);
  const slot = currentSlot(state);
  const sunday = weekday(state.date) === 0 || slot?.id === "rest" || slot?.kind === "rest";
  if (!sunday && !always) return "";
  const rec = state.homeVisit || {};
  const term = rec.doorCount || 0;
  const left = Math.max(0, DOOR_TERM_CAP - term);
  if (!sunday) {
    return `<div class="paper visit-panel home-visit-panel" data-door-panel="1">
      <h3>上门家访</h3>
      <p class="muted">上门家访只在周日进行，本学期已走访 ${term} / ${DOOR_TERM_CAP} 户。这是任课数学老师就这一户的走访，不是班主任访遍全班，也不是教育局规定的家访周。日期按宁川中学校内安排。</p>
    </div>`;
  }
  if (!isDoorVisitOpen(state)) {
    return `<div class="paper visit-panel home-visit-panel" data-door-panel="1">
      <h3>上门家访</h3>
      <p class="muted">${doorVisitUnavailableReason(state)}</p>
    </div>`;
  }
  const rows = suggestDoorVisits(state).map((v) => {
    const btns = (v.options || []).map((o) => `<button type="button" data-door-visit="${v.studentId}" data-door-act="${o.id}">${o.label}</button>`).join("");
    return `<p><b>${v.name}</b>　${v.reason}</p><div class="row-actions">${btns}</div>`;
  }).join("");
  return `<div class="paper visit-panel home-visit-panel" data-door-panel="1">
      <h3>上门家访</h3>
      <p class="muted">今天是周日，你可以作为数学任课老师上门走访一户。每天最多 1 户，本学期大约 3–4 户，还可走访 ${left} 户。这不是班主任走访全班，也不是教育局规定的家访周。日期按宁川中学校内安排。</p>
      ${rows || `<p class="muted">眼下没有特别需要先上门的人家。</p>`}
    </div>`;
}

function bindHomeVisitActions(host) {
  host.querySelectorAll("[data-phone-visit]").forEach((b) => {
    b.onclick = (ev) => {
      ev.stopPropagation();
      const r = handlePhoneVisit(state, b.dataset.phoneVisit, b.dataset.phoneAct);
      toast(r.ok ? r.text : r.reason);
      persist(); render();
    };
  });
  host.querySelectorAll("[data-door-visit]").forEach((b) => {
    b.onclick = (ev) => {
      ev.stopPropagation();
      const r = handleDoorVisit(state, b.dataset.doorVisit, b.dataset.doorAct);
      toast(r.ok ? r.text : r.reason);
      persist(); render();
    };
  });
}

function coachingListHtml(kind, list) {
  const label = kind === "enrich" ? "培优" : "补差";
  if (!list.length) return `<p class="muted">眼下没有特别适合先留下做${label}的人。</p>`;
  const names = list.map((v) => `<p><b>${v.name}</b>　${v.reason}</p>`).join("");
  const btns = (list[0].options || COACH_ACTIONS).map((o) => `<button type="button" data-coach-kind="${kind}" data-coach-act="${o.id}">${o.label}</button>`).join("");
  return `${names}<p class="muted">确认这 ${list.length} 人后开一场${label}：</p><div class="row-actions">${btns}</div>`;
}

function coachingPanelHtml({ always = false } = {}) {
  if (!state) return "";
  ensureCoachingState(state);
  const slot = currentSlot(state);
  const windowOpen = isCoachingWindow(state);
  if (!always && !windowOpen && !isCoachingTimeSlot(slot, state.date) && !isCoachingOpen(state)) return "";
  const rec = state.coaching || {};
  const term = rec.count || 0;
  if (!isCoachingOpen(state)) {
    return `<div class="paper visit-panel coaching-panel" data-coach-panel="1">
      <h3>培优补差</h3>
      <p class="muted">${coachingUnavailableReason(state)}</p>
    </div>`;
  }
  const rem = suggestRemedial(state);
  const enr = suggestEnrichment(state);
  return `<div class="paper visit-panel coaching-panel" data-coach-panel="1">
      <h3>培优补差</h3>
      <p class="muted">辅导时段或办公室坐班时，可以留下几名本班学生做一场数学补差或培优。每天最多 1 场，每场 ${COACH_SESSION_MIN}–${COACH_SESSION_MAX} 人，本学期已做 ${term} / ${COACH_TERM_CAP} 场。${COACH_SOURCE_NOTE}</p>
      <p><b>补差建议</b></p>
      ${coachingListHtml("remedial", rem)}
      <p><b>培优建议</b></p>
      ${coachingListHtml("enrich", enr)}
    </div>`;
}

function bindCoachingActions(host) {
  host.querySelectorAll("[data-coach-kind]").forEach((b) => {
    b.onclick = (ev) => {
      ev.stopPropagation();
      const r = handleCoaching(state, b.dataset.coachKind, null, b.dataset.coachAct);
      toast(r.ok ? r.text : r.reason);
      persist(); render();
    };
  });
}

function commentPanelHtml() {
  if (!state) return "";
  ensureCommentState(state);
  const exam = currentCommentExam(state);
  const rec = state.termComments || {};
  const today = rec.date === state.date ? (rec.todayCount || 0) : 0;
  const examLine = exam ? `当前对应已公布的「${exam.examName}」。` : "";
  if (!isCommentOpen(state)) {
    return `<div class="paper visit-panel comment-panel" data-comment-panel="1">
      <h3>数学学期评语</h3>
      <p class="muted">${commentUnavailableReason(state)}</p>
    </div>`;
  }
  const rows = suggestTermComments(state).map((v) => {
    const btns = (v.options || COMMENT_TONES).map((o) => `<button type="button" data-term-comment="${v.studentId}" data-comment-tone="${o.id}">${o.label}</button>`).join("");
    const leave = v.onLeave ? "　（请假不在校，评语仍可写入档案）" : "";
    return `<p><b>${v.name}</b>　${v.reason}${leave}</p><div class="row-actions">${btns}</div>`;
  }).join("");
  return `<div class="paper visit-panel comment-panel" data-comment-panel="1">
      <h3>数学学期评语</h3>
      <p class="muted">本校期中或期末成绩公布后，办公室坐班时可以为本班写数学学期/学段评语，按宁川中学校内安排写入档案。每天最多一批，每批约 ${COMMENT_BATCH_MIN}–${COMMENT_BATCH_MAX} 人，今天已写 ${today} / ${COMMENT_DAY_CAP} 人。${examLine}${COMMENT_SOURCE_NOTE}</p>
      ${rows || `<p class="muted">眼下没有待写的本班评语。</p>`}
    </div>`;
}

function bindCommentActions(host) {
  host.querySelectorAll("[data-term-comment]").forEach((b) => {
    b.onclick = (ev) => {
      ev.stopPropagation();
      const r = handleTermComment(state, b.dataset.termComment, b.dataset.commentTone);
      toast(r.ok ? r.text : r.reason);
      persist(); render();
    };
  });
}

function teachersDayPanelHtml({ place = "office" } = {}) {
  if (!state) return "";
  if (!isTeachersDayPlayDate(state.date)) return "";
  ensureTeachersDayState(state);
  const rec = state.teachersDay || {};
  const sy = schoolYearOf(state.date);
  const play = teachersDayPlayDate(sy);
  const nominal = teachersDayNominalDate(sy);
  const dateNote = play && nominal && play !== nominal
    ? `校历上的教师节仍是 9 月 10 日，今年适逢周末，问候改在 ${play} 进行。`
    : "校历上的教师节是 9 月 10 日，今年就在当天问候。";
  if (!isTeachersDayOpen(state)) {
    return `<div class="paper visit-panel teachers-day-panel" data-teachers-day-panel="1">
      <h3>教师节</h3>
      <p class="muted">${teachersDayUnavailableReason(state)} ${TEACHERS_DAY_SOURCE_NOTE}</p>
    </div>`;
  }
  const cards = suggestTeachersDayCards(state);
  const cardRows = cards.map((v) => {
    const btns = (v.options || CARD_REPLIES).map((o) => `<button type="button" data-td-card="${v.studentId}" data-td-reply="${o.id}">${o.label}</button>`).join("");
    return `<p><b>${v.name}</b>　${v.reason}　${v.message || ""}</p><div class="row-actions">${btns}</div>`;
  }).join("");
  const cardBlock = cards.length
    ? `${cardRows}`
    : `<p class="muted">本班贺卡已经收下完了。</p>`;
  let colleagueBlock = "";
  if (place !== "classroom") {
    if (rec.colleagueDone) {
      colleagueBlock = `<p class="muted">办公室同事问候今年已经做过了。</p>`;
    } else {
      const person = teachersDayColleague(state);
      const btns = (person?.options || COLLEAGUE_ACTIONS).map((o) => `<button type="button" data-td-colleague="${o.id}">${o.label}</button>`).join("");
      colleagueBlock = `<p><b>办公室问候</b>　${person ? person.reason : "备课组老师互相问候"}。</p><div class="row-actions">${btns}</div>`;
    }
  } else if (rec.colleagueDone) {
    colleagueBlock = "";
  } else {
    colleagueBlock = `<p class="muted">办公室同事问候请到坐班时再做。</p>`;
  }
  const intro = place === "classroom"
    ? `教室里可以简短收下本班学生送来的贺卡或花，写一句回应。不要打断上课，也不要占用辅导时段整场。`
    : `办公室坐班时可以收下本班学生的贺卡或花，也可以接受同事问候或回贺备课组老师。`;
  return `<div class="paper visit-panel teachers-day-panel" data-teachers-day-panel="1">
      <h3>教师节</h3>
      <p class="muted">${intro}${dateNote}当天可收下 ${TEACHERS_DAY_CARD_MIN}–${TEACHERS_DAY_CARD_MAX} 名本班学生的贺卡或花，外加一次办公室同事问候。请假不在校的学生不在当场送礼名单里。${TEACHERS_DAY_SOURCE_NOTE}</p>
      ${cardBlock}
      ${colleagueBlock}
    </div>`;
}

function bindTeachersDayActions(host) {
  host.querySelectorAll("[data-td-card]").forEach((b) => {
    b.onclick = (ev) => {
      ev.stopPropagation();
      const r = handleTeachersDayCard(state, b.dataset.tdCard, b.dataset.tdReply);
      toast(r.ok ? r.text : r.reason);
      persist(); render();
    };
  });
  host.querySelectorAll("[data-td-colleague]").forEach((b) => {
    b.onclick = (ev) => {
      ev.stopPropagation();
      const r = handleTeachersDayColleague(state, b.dataset.tdColleague);
      toast(r.ok ? r.text : r.reason);
      persist(); render();
    };
  });
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
      <p class="muted">点一名学生的座位，按当前课时在教室里处理：数学课上可以提醒，晚自习可以答疑，别的课只能在走廊门口简短谈话。任教班 74 人。</p>
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
  const talks = ["鼓励", "询问学习", "关注状态", "谈心"].map((x) => `<button type="button" class="talk-btn" data-talk="${x}">${x}</button>`).join("");
  return `<h3>${student.name}</h3>
    ${resumePanelHtml(student, { compact: true })}
    <p>${seatLabel(student)}　${student.personality || ""}　师生关系 ${student.relation || 0}</p>
    ${peerLinksHtml(student, clsStudents())}
    <p class="muted">${healthStatusLine(student, state)}</p>
    ${godReveal() && mathRoomLine(student, { revealPotential: true }) ? `<p class="god-flag">${mathRoomLine(student, { revealPotential: true })}</p>` : ""}
    <p class="muted">${teachingStatus(student)}</p>
    <p class="muted">作业：${hwLine}${ctx?.flag ? "　课堂：" + ctx.flag : ""}</p>
    ${isAwayFromClass(student, state) ? `<p class="notice">今天不在教室。谈话请用「关注状态」，或改日再谈。</p>` : ""}
    ${tutorBtns}
    <div class="row-actions">${extra.join("")}</div>
    ${scoreDropPanelHtml(student, { compact: true })}
    <p>谈话（本时段还可 ${leftTalk} 人，本日余 ${dayLeft} 人）</p>
    <div class="row-actions">${talks}</div>
    ${isParentsMeetingOpen(state) ? `<div class="row-actions"><button type="button" class="accent" data-parent="${student.id}" ${student.lastParentMeeting?.date === state.date ? "disabled" : ""}>${student.lastParentMeeting?.date === state.date ? "这场已与家长谈过" : "与家长面谈"}</button></div>` : ""}
    ${isSchoolActivityOpen(state) && state.schoolActivity?.activityKind === "sports" ? `<div class="row-actions"><button type="button" class="accent" data-acty="lead" data-sid="${student.id}">带队</button></div>` : ""}
    ${isSchoolActivityOpen(state) && state.schoolActivity?.activityKind === "newyear" ? `<div class="row-actions"><button type="button" class="accent" data-acty="log" data-sid="${student.id}">为这名学生写日志</button></div>` : ""}
    <div class="row-actions"><button type="button" id="to-profile">查看档案</button></div>`;
}

function bindDeskAndTutor(host) {
  bindScoreDropActions(host);
  bindScoreTrendPanels(host);
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
  host.querySelectorAll("[data-peer]").forEach((b) => {
    b.onclick = (ev) => { ev.stopPropagation(); selectedId = b.dataset.peer; render(); };
  });
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
  else if (isOpenClassPeriod(state) && slot?.isMath) slotLine += "（本节是校内公开课，备课组长等组内老师来听，按平时规则上课即可）";
  else if (isOpenClassDay(state.date) && slot?.isMath) slotLine += "（今日有校内公开课，按平时规则上课即可）";
  else if (slot?.isMath) slotLine += "（本节可上课，也可在座位边提醒）";
  else if (isParentsMeetingOpen(state) || (slot?.isExamDay && state.parentsMeeting?.date === state.date)) slotLine += "（今日家长会，由班主任主持，你可作为数学老师与本班家长面谈）";
  else if (isSchoolActivityOpen(state) || slot?.isActivityPeriod) slotLine += `（今日学校活动「${state.schoolActivity?.name || slot?.eventName || ""}」，可带队、看班或写记录；日期为校内安排）`;
  else if (isCalendarExamDay(state.date)) slotLine += `（今日${examEventOn(state.date)?.name || "考试"}，全日停课，按宁川中学校内考务安排监考）`;
  else if (slot?.isExamDay) slotLine += "（今日停课）";
  else if (isStudyHallWindow(state) || (slot && slot.subject === "自习" && !slot.isMath && !slot.isTutoring && !slot.isActivityPeriod)) slotLine += isStudyHallOpen(state) ? "。现在是自习，可以进本班教室看班" : "。现在是自习，这节已经看过班了";
  else if (isOpeningDayPlayDate(state.date)) slotLine += `（今日是宁川中学校内${openingEventKindName(openingEventForPlayDate(state.date)) || "开学安排"}，可在办公室坐班或日常教学里参加；不是全日停课活动，数学正课仍可上）`;
  else if (slot && !slot.isMath && slot.kind !== "break" && slot.id !== "rest") slotLine += "。这节不是数学课，谈话请到走廊门口简短说";
  if (nxtT && !slot?.isTutoring) slotLine += `。下一节可答疑：${nxtT.sameDay ? "" : nxtT.date + " "}${formatSlotLabel(nxtT.slot)}`;
  const seatNote = placementSeatNotice(state);
  host.innerHTML = `<h3>教室座位表</h3>
    ${seatNote ? `<p class="notice">${seatNote}</p>` : ""}
    <p class="notice">现在是${slotLine}${absenceNotice(sts)}。金圈是举手，红点是作业还要盯，颜色偏暗的是走神或精力不足，橙点是这节正课迟到，座位下方橙三角是这次大幅掉分需关注，空灰位是今天请假。点开座位后，浅金圈是同桌，淡绿圈是要好的同学。点击座位按当前课时处理，不必先跳到档案。任教班为卓行16班，74 人。</p>
    <div class="row-actions"><button type="button" data-open-class-trend="1">全班成绩 AI 分析</button></div>
    ${visitPanelHtml()}
    ${alumniBoostPanelHtml()}
    ${doorVisitPanelHtml()}
    ${coachingPanelHtml()}
    ${teachersDayPanelHtml({ place: "classroom" })}
    ${isOpenClassDay(state.date) ? openClassPanelHtml() : ""}
    ${proctorPanelHtml()}
    ${studyHallPanelHtml()}
    <div class="classroom-layout">
      <canvas id="classroom"></canvas>
      <div class="desk-panel paper">${deskPanelHtml(sel, slot, scene)}</div>
    </div>`;
  const c = host.querySelector("#classroom");
  const board = slot ? `${formatSlotLabel(slot)} · 卓行16班` : "宁川中学 · 卓行16班";
  renderSeating(c, sts, selectedId, (id) => { selectedId = id; render(); }, { boardTitle: board, marks });
  bindDeskAndTutor(host);
  bindScoreTrendPanels(host);
  bindVisitActions(host);
  bindAlumniBoostActions(host);
  bindHomeVisitActions(host);
  bindCoachingActions(host);
  bindTeachersDayActions(host);
  bindParentActions(host);
  bindActivityActions(host);
  bindProctorActions(host);
  bindStudyHallActions(host);
}

function viewRoster(host) {
  const sts = clsStudents().slice().sort((a, b) => a.seq - b.seq);
  const seatNote = placementSeatNotice(state);
  host.innerHTML = `<h3>学生名册 · ${sts.length}人</h3>
    ${seatNote ? `<p class="notice">${seatNote} 下表座号为当前编制。</p>` : ""}
    <table><thead><tr><th>座号</th><th>姓名</th><th>职务</th><th>同桌</th><th>出勤</th><th>性别</th><th>性格</th><th>家庭</th><th>文理意向</th><th>师生关系</th></tr></thead>
    <tbody>${sts.map((s) => `<tr data-id="${s.id}" class="${s.id===selectedId?"me":""}"><td>${s.seq}</td><td>${s.name}</td><td>${committeeTitleOf(playerClassCommittee(state), s.id) || ""}</td><td>${deskMateOf(s, sts)?.name || "—"}</td><td>${isAwayFromClass(s, state) ? (s.health?.status || "请假") : "在"}</td><td>${s.gender==="F"?"女":"男"}</td><td>${s.personality}</td><td>${s.family.type}</td><td>${s.trackPref==="wen"?"文":"理"}</td><td>${s.relation||0}</td></tr>`).join("")}</tbody></table>`;
  /* 点行进档案由 #view 委托处理 */
}

function fmtRank(rank, n) {
  if (rank == null || n == null) return "—";
  return `${rank}/${n}`;
}

function findStudent(id) {
  return findStudentInState(state, id) || clsStudents().find((x) => x.id === id) || null;
}


function findStudentAdmission(studentId) {
  const keys = Object.keys(state.admissions || {}).sort().reverse();
  for (const k of keys) {
    const pack = state.admissions[k];
    const hit = (pack.results || []).find((r) => r.studentId === studentId);
    if (hit) return { pack, adm: hit };
  }
  return null;
}

function repeaterLastExamHtml(student) {
  if (!student || !(student.repeat || student.tier === "fuzhuo")) return "";
  const scoreText = formatLastGaokaoText(student.lastGaokao);
  const dest = formatLastAdmissionLabel(student.lastAdmission);
  return `<p><b>上次高考</b> ${scoreText}</p><p><b>录取院校</b> ${dest}</p>`;
}

function admissionProfileHtml(studentId) {
  const hit = findStudentAdmission(studentId);
  if (!hit) return "";
  const a = hit.adm;
  const extra = a.supplement ? `　<span class="muted">未达省控一本 ${a.firstLine}，不计入省控一本上线人数</span>` : "";
  return `<p><b>录取去向</b> ${formatAdmissionDest(a)}　<b>批次</b> ${formatAdmissionBatch(a)}　<b>总分</b> ${a.total}${extra}</p>`;
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
  const revealPot = godReveal();
  const ab = formatAbilityWithRoom(s, { revealPotential: revealPot });
  const offices = selectClassOffices((state.cohorts[s.entryYear]?.students || []).filter((x) => x.classNo === s.classNo), state.seed, s.classNo);
  const officeLine = officeTitlesOf(offices, s.id).join("、") || "无班委或课代表职务";
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
    const scoreCell = (subjectPick === "lizong" || subjectPick === "wenzong")
      ? `${formatComprehensiveLabel({ ...h, ...(sub.parts || {}), [subjectPick]: sub.score, track: h.track }, subjectPick === "wenzong" ? "wen" : "li")}<span class="muted">/${sub.max}</span>`
      : `${sub.score}<span class="muted">/${sub.max}</span>`;
    return `<tr>
      <td>${h.date}<br/><span class="muted">${h.examName}</span></td>
      <td>${scoreCell}</td>
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
        <p><b>学号</b> ${s.id}　<b>性别</b> ${s.gender==="F"?"女":"男"}　<b>性格</b> ${s.personality || "—"}　<b>职务</b> ${officeLine}　<b>班级</b> ${tierLabel(s.tier)}${s.classNo ?? ""}班</p>
        <p><b>家庭</b> ${family}</p>
        ${peerLinksHtml(s, (state.cohorts[s.entryYear]?.students || []).filter((x) => x.classNo === s.classNo))}
        <p><b>文理意向</b> ${trackLabel}　<b>专业倾向</b> ${s.majorPref||"—"}</p>
        ${admissionProfileHtml(s.id)}
        ${repeaterLastExamHtml(s)}
        <p><b>心情</b> ${s.mood ?? "—"}　<b>压力</b> ${s.stress ?? "—"}　<b>精力</b> ${s.energy ?? "—"}　<b>师生关系</b> ${s.relation||0}${s.parentCoop != null ? `　<b>家长配合度</b> ${s.parentCoop}` : ""}</p>
        <p><b>健康心理</b> ${healthStatusLine(s, state)}</p>
        ${(s.healthLog || []).length ? `<p><b>请假记录</b></p>${(s.healthLog||[]).slice(0, 6).map((r)=>`<p class="muted">${r.date}　${r.text}</p>`).join("")}` : ""}
        <p class="muted">${teachingStatus(s)}</p>
        ${(s.rollCalls || []).length ? `<p><b>晚自习点名记录</b></p>${(s.rollCalls||[]).map((r)=>`<p class="muted">${r.date}　${r.text}</p>`).join("")}` : ""}
        ${(s.parentMeetings || []).length ? `<p><b>家长会面谈</b></p>${(s.parentMeetings||[]).map((r)=>`<p class="muted">${r.date}　${r.text}</p>`).join("")}` : ""}
        ${(s.homeVisits || []).length ? `<p><b>家访记录</b></p>${(s.homeVisits||[]).map((r)=>`<p class="muted">${r.date}　${r.kind === "door" ? "上门家访" : "电话家访"}　${r.text}</p>`).join("")}` : (s.lastHomeVisit ? `<p><b>家访记录</b></p><p class="muted">${s.lastHomeVisit.date}　${s.lastHomeVisit.text}</p>` : "")}
        ${(s.coachings || []).length ? `<p><b>培优补差记录</b></p>${(s.coachings||[]).map((r)=>`<p class="muted">${r.date}　${r.kind === "enrich" ? "培优" : "补差"}　${r.text}</p>`).join("")}` : (s.lastCoaching ? `<p><b>培优补差记录</b></p><p class="muted">${s.lastCoaching.date}　${s.lastCoaching.kind === "enrich" ? "培优" : "补差"}　${s.lastCoaching.text}</p>` : "")}
        ${(s.termComments || []).length ? `<p><b>数学学期评语记录</b></p>${(s.termComments||[]).map((r)=>`<p class="muted">${r.date}　${r.examName || "期中/期末"}　${r.tone === "encourage" ? "鼓励" : r.tone === "remind" ? "提醒" : "如实"}　${r.text}</p>`).join("")}` : (s.lastTermComment ? `<p><b>数学学期评语记录</b></p><p class="muted">${s.lastTermComment.date}　${s.lastTermComment.examName || ""}　${s.lastTermComment.text}</p>` : "")}
        ${(s.teachersDayNotes || []).length ? `<p><b>教师节记录</b></p>${(s.teachersDayNotes||[]).map((r)=>`<p class="muted">${r.date}　${r.gift === "flower" ? "花" : "贺卡"}　${r.reply === "encourage" ? "鼓励" : r.reply === "remind" ? "提醒认真听课" : "致谢"}　${r.text}</p>`).join("")}` : (s.lastTeachersDay ? `<p><b>教师节记录</b></p><p class="muted">${s.lastTeachersDay.date}　${s.lastTeachersDay.text}</p>` : "")}
        ${(s.activityNotes || []).length ? `<p><b>学校活动</b></p>${(s.activityNotes||[]).map((r)=>`<p class="muted">${r.date}　${r.text}</p>`).join("")}` : ""}
        ${(s.studyHallNotes || []).length ? `<p><b>自习看班</b></p>${(s.studyHallNotes||[]).map((r)=>`<p class="muted">${r.date}　${r.text}</p>`).join("")}` : (s.lastStudyHall ? `<p><b>自习看班</b></p><p class="muted">${s.lastStudyHall.date}　${s.lastStudyHall.text}</p>` : "")}
        ${(s.weekendHomeworkNotes || []).length ? `<p><b>周末作业</b></p>${(s.weekendHomeworkNotes||[]).map((r)=>`<p class="muted">${r.date}　${r.text}</p>`).join("")}` : (s.lastWeekendHomework ? `<p><b>周末作业</b></p><p class="muted">${s.lastWeekendHomework.date}　${s.lastWeekendHomework.text}</p>` : "")}
        ${(s.dutyWeekNotes || []).length ? `<p><b>值周</b></p>${(s.dutyWeekNotes||[]).map((r)=>`<p class="muted">${r.date}　${r.text}</p>`).join("")}` : (s.lastDutyWeek ? `<p><b>值周</b></p><p class="muted">${s.lastDutyWeek.date}　${s.lastDutyWeek.text}</p>` : "")}
        ${(s.paperSigns || []).length ? `<p><b>试卷签字</b></p>${(s.paperSigns||[]).map((r)=>`<p class="muted">${r.date}　${r.examName || ""}　${r.text}</p>`).join("")}` : (s.lastPaperSign ? `<p><b>试卷签字</b></p><p class="muted">${s.lastPaperSign.date}　${s.lastPaperSign.examName || ""}　${s.lastPaperSign.text}</p>` : "")}
        <p class="muted">${revealPot ? "学科能力（上帝模式可见：潜能为个人上限，括号里是余地与潜力数值）" : "学科能力（教师视图只显示当前能力，不展示潜力或余地）"}</p>
        ${revealPot ? `<p class="god-flag">下列潜力与余地仅上帝模式可见，不会写入存档或导出。</p>` : ""}
        <p>${ab || "—"}</p>
      </div>
      <div class="paper">
        ${scoreDropPanelHtml(s)}
        ${studentScoreTrendPanelHtml(s)}
        <p>谈话（${(() => { const sc = periodTalkScene(state); return `本时段还可 ${Math.max(0, sc.cap - (state.talksThisPeriod || 0))} 人，本日余 ${Math.max(0, 5 - (state.talksToday || 0))} 人`; })()}）</p>
        <div class="row-actions">
          ${["鼓励","询问学习","关注状态","谈心"].map((t)=>`<button type="button" class="talk-btn" data-talk="${t}">${t}</button>`).join("")}
        </div>
        <div class="row-actions"><button type="button" class="talk-btn" id="ai-talk">用 AI 拟谈话要点</button></div>
        <p class="notice" id="ai-talk-status" hidden></p>
        <p id="ai-talk-text" hidden></p>
        <div>${(s.talks||[]).slice(-6).reverse().map((t)=>`<p class="muted">${t.date}　${t.topic}：${t.text}</p>`).join("") || "<p class='muted'>还没有谈话记录。</p>"}</div>
      </div>
    </div>
    ${resumePanelHtml(s)}
    <h3>成绩与排名走势</h3>
    <p class="notice">下列曲线和表格均由该生各次实考总分、单科分在当次学生池中重算，不另造统计。高一为 950 分制，图中另给出折合 750 分，便于和高二、高三对照。名次越小越靠前；跨层次是把该生成绩放入其他层次（云岫实验、云岫重点、凌霄、卓行、笃学、艺体、补习班等）学生池后的名次。</p>
    ${hist.length ? `
    <div class="charts">
      <div class="chart-card">
        <h4>总分走势（折合 750 分）</h4>
        <canvas id="ch-total" width="640" height="230"></canvas>
      </div>
      <div class="chart-card">
        <h4>班排 / 同层次排 / 校排（名次在上为靠前）</h4>
        <canvas id="ch-ranks" width="640" height="230"></canvas>
      </div>
      <div class="chart-card">
        <h4>跨层次对比（名次百分位，越小越靠前）</h4>
        <canvas id="ch-cross" width="640" height="230"></canvas>
      </div>
      ${latest ? `<div class="chart-card">
        <h4>最近一场跨层次对照 · ${latest.date} ${latest.examName}（总分 ${latest.total}）</h4>
        <canvas id="ch-crossbar" width="640" height="200"></canvas>
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
        <canvas id="ch-subj" width="640" height="230"></canvas>
      </div>
      <div class="chart-card">
        <h4>${(subjectById(subjectPick)||{name:subjectPick}).name} 班排 / 层次排 / 校排</h4>
        <canvas id="ch-subj-ranks" width="640" height="230"></canvas>
      </div>
      <div class="chart-card">
        <h4>${(subjectById(subjectPick)||{name:subjectPick}).name} 跨层次名次百分位</h4>
        <canvas id="ch-subj-cross" width="640" height="230"></canvas>
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
  if (sel) sel.onchange = () => { selectedId = sel.value; repaintViewOnly(); };
  host.querySelectorAll("[data-talk]").forEach((b) => {
    b.onclick = () => {
      const r = talkTo(state, s.id, b.dataset.talk);
      toast(r.ok ? r.text : r.reason);
      persist(); render();
    };
  });
  bindResumeActions(host, s);
  bindScoreDropActions(host);
  bindScoreTrendPanels(host);
  const aiTalk = host.querySelector("#ai-talk");
  if (aiTalk) {
    aiTalk.onclick = async () => {
      const status = host.querySelector("#ai-talk-status");
      const textEl = host.querySelector("#ai-talk-text");
      const set = (msg, kind, body) => {
        if (status) { status.hidden = !msg; status.className = kind === "err" ? "notice exam-ai-err" : "notice"; status.textContent = msg || ""; }
        if (textEl) { textEl.hidden = !body; textEl.textContent = body || ""; }
      };
      const conf = loadAiSettings();
      const fallback = "可按该生近几次考试的班排、同层次排、校排和作业情况谈话，先对事实、再谈方法。";
      if (!conf.hasKey) { set("还没有填写 API 密钥。先用本地要点。", "err", fallback); return; }
      aiTalk.disabled = true;
      set("正在拟谈话要点…", "ok", "");
      try {
        const r = await requestTalkAdvice(talkFactPayload(s, "谈话要点"), { settings: conf });
        if (!r.ok) { set(r.reason || "拟稿失败，改用本地要点。", "err", fallback); return; }
        set("AI 要点只作参考，不会改分数或自动完成谈话。", "ok", r.text);
      } catch {
        set("请求失败，改用本地要点。", "err", fallback);
      } finally {
        aiTalk.disabled = false;
      }
    };
  }
  host.querySelectorAll("[data-peer]").forEach((b) => {
    b.onclick = () => { selectedId = b.dataset.peer; render(); };
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

function schoolActivityHtml() {
  const open = isSchoolActivityOpen(state);
  const nxt = upcomingSchoolActivity(state, SCHOOL_CALENDAR);
  const note = (open ? state.schoolActivity?.sourceNote : nxt?.sourceNote) || ACTIVITY_SOURCE_NOTE;
  if (!open) {
    const when = nxt ? `${nxt.date} ${nxt.name}` : "";
    return `<div class="paper lesson-card parents-panel activity-panel">
      <h3>学校活动</h3>
      <p class="muted">校历里有秋季运动会和迎新年（元旦）活动。运动会在第一次月考后、期中前全日停课，你可带队、看纪律、记录本班参赛情况；迎新年在第二次月考后、期末前，当天后半段为活动时段，你可参加、看班、写日志。${when ? `下场：${when}。` : "校历上尚未排到下一场。"}日期是宁川中学校内安排，不是某所实校或教育局公告的逐年日期。</p>
    </div>`;
  }
  const act = state.schoolActivity;
  const sports = act.activityKind === "sports";
  const roster = (act.roster || []).map((r) => {
    if (sports) {
      const extra = [r.place, r.incident].filter(Boolean).join("，");
      return `<li><b>${r.name}</b>　${r.eventName}${extra ? "　" + extra : ""}</li>`;
    }
    const detail = r.role === "值勤" ? r.duty : r.program;
    return `<li><b>${r.name}</b>　${r.role}　${detail || ""}</li>`;
  }).join("");
  const btns = sports
    ? `<div class="row-actions">
        <button type="button" class="accent" data-acty="lead">带队</button>
        <button type="button" data-acty="discipline">看纪律</button>
        <button type="button" data-acty="record">记录本班参赛情况</button>
      </div>`
    : `<div class="row-actions">
        <button type="button" class="accent" data-acty="attend">参加</button>
        <button type="button" data-acty="watch">看班</button>
        <button type="button" data-acty="log">写日志</button>
      </div>`;
  return `<div class="paper lesson-card parents-panel activity-panel">
    <h3>${act.name || "学校活动"}</h3>
    <p class="notice">这是宁川中学的学校活动（${act.date}）。${sports ? `全日停课。你作为本班${state.player.official ? "数学教师" : "实习数学老师"}可以带队、看纪律、记录本班参赛情况。名次只是校内占位，不是全市或全省官方成绩。` : "当天后半段为活动时段。你可以参加、看班、写日志，不套用某台晚会的现成流程。"} ${note}</p>
    ${roster ? `<ul class="activity-roster">${roster}</ul>` : ""}
    ${btns}
  </div>`;
}

function bindActivityActions(host) {
  host.querySelectorAll("[data-acty]").forEach((b) => {
    b.onclick = (ev) => {
      ev.stopPropagation();
      const sid = b.dataset.sid || selectedId || null;
      if (sid) selectedId = sid;
      const r = doActivityAction(state, b.dataset.acty, sid);
      toast(r.ok ? r.text : (r.reason || "无法完成这项活动"));
      persist();
      render();
    };
  });
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


let tiaokeWeekOffset = 0;
let tiaokeMathPick = "";
let tiaokeOtherPick = "";
let tiaokeBorrowPick = "";

function tiaokeFocusDate() {
  return addDays(weekStart(state.date), tiaokeWeekOffset * 7);
}

function tiaokeOptionValue(date, periodId) {
  return `${date}|${periodId}`;
}

function parseTiaokeOption(v) {
  if (!v) return null;
  const i = v.lastIndexOf("|");
  if (i < 0) return null;
  return { date: v.slice(0, i), periodId: v.slice(i + 1) };
}

function tiaokeSlotOptions(days, pred) {
  const out = [];
  for (const day of days) {
    for (const p of day.periods) {
      if (p.id === "rest" || p.kind === "break" || p.kind === "rest") continue;
      if (!pred(p, day.date)) continue;
      const mark = p.override ? (p.override.type === "borrow-in" ? "借" : p.override.type === "borrow-out" ? "出" : "调") : "";
      out.push({
        value: tiaokeOptionValue(day.date, p.id),
        label: `${day.date.slice(5).replace("-", "月")}日周${day.weekdayName}${p.name}${p.subject ? "「" + p.subject + "」" : ""}${mark ? "（" + mark + "）" : ""}`,
      });
    }
  }
  return out;
}

function tiaokePanelHtml() {
  const focus = tiaokeFocusDate();
  const days = weekSchedule(focus, state);
  const mathOpts = tiaokeSlotOptions(days, (p) => p.isMath);
  const otherOpts = tiaokeSlotOptions(days, (p) => !p.isMath && !p.isTutoring && !p.isExamDay && !p.isActivityPeriod && p.id !== "morning-read");
  const borrowOpts = tiaokeSlotOptions(days, (p) => !p.isMath && (p.subject === "自习" || p.subject === "体育"));
  if (mathOpts.length && !mathOpts.some((o) => o.value === tiaokeMathPick)) tiaokeMathPick = mathOpts[0].value;
  if (otherOpts.length && !otherOpts.some((o) => o.value === tiaokeOtherPick)) tiaokeOtherPick = otherOpts[0].value;
  if (borrowOpts.length && !borrowOpts.some((o) => o.value === tiaokeBorrowPick)) tiaokeBorrowPick = borrowOpts[0].value;
  const req = ensureIncomingRequest(state);
  const pending = req && req.status === "pending" ? req : null;
  const weekLabel = tiaokeWeekOffset === 0 ? "本周" : (tiaokeWeekOffset === 1 ? "下周" : tiaokeWeekOffset === -1 ? "上周" : `${days[0].date} 起`);
  const mathN = weekMathCount(focus, state);
  const periodRows = ["morning-read", "p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"];
  const head = `<tr><th></th>${days.filter((d) => d.weekday !== 0).map((d) => `<th>周${d.weekdayName}<br>${d.date.slice(5)}</th>`).join("")}</tr>`;
  const body = periodRows.map((pid) => {
    const cells = days.filter((d) => d.weekday !== 0).map((d) => {
      const p = d.periods.find((x) => x.id === pid);
      if (!p) return "<td class=\"empty\">—</td>";
      const ov = p.override ? (p.override.type === "borrow-in" ? "借" : p.override.type === "borrow-out" ? "出" : "调") : "";
      const cls = `${p.isMath ? "math" : ""}${p.isExamDay ? " exam" : ""}${p.isActivityPeriod && !p.isExamDay ? " activity" : ""}`;
      return `<td class="${cls}" data-tk-date="${d.date}" data-tk-pid="${p.id}" title="${p.subject}">${p.subject || ""}${ov ? ` <span class="ov-tag">${ov}</span>` : ""}</td>`;
    }).join("");
    const name = (days[0].periods.find((x) => x.id === pid) || days[1]?.periods.find((x) => x.id === pid) || { name: pid }).name;
    return `<tr><th>${name}</th>${cells}</tr>`;
  }).join("");
  const pendingHtml = pending
    ? `<div class="tiaoke-request">
        <p><b>对方请求</b> ${pending.why || ""}</p>
        <p class="muted">${pending.type === "borrow-out"
          ? `${pending.peer}想借走${pending.mathDate} ${pending.mathPeriodId} 的数学课，改上${pending.peerSubject}。`
          : `${pending.peer}想把${pending.mathDate} 的数学课和${pending.otherDate} 的${pending.peerSubject}对调。`}</p>
        <div class="row-actions">
          <button type="button" class="accent" id="tk-accept">同意</button>
          <button type="button" id="tk-reject">谢绝</button>
        </div>
      </div>`
    : "";
  const opt = (list, cur) => list.map((o) => `<option value="${o.value}" ${o.value === cur ? "selected" : ""}>${o.label}</option>`).join("");
  return `<div class="paper lesson-card tiaoke-panel">
      <h3>调课 / 借课</h3>
      <p class="muted">只改本班这张课表，按日期临时生效，不改星期模板。早读、午休和晚自习不能改成数学正课；考试、分班、录取、家长会、运动会等全日停课日不能调或借，迎新年活动时段也不能调。一周最多额外借入 1 节，被借走也不超过 1 节。</p>
      <div class="row-actions">
        <button type="button" id="tk-week-prev">上一周</button>
        <button type="button" id="tk-week-now"${tiaokeWeekOffset === 0 ? " disabled" : ""}>回到本周</button>
        <button type="button" id="tk-week-next">下一周</button>
      </div>
      <p>课表 · ${weekLabel}　数学正课 ${mathN} 节。${weekTiaokeSummary(state, focus)}</p>
      <div class="scroll-table"><table class="tt-week">${head}${body}</table></div>
      ${pendingHtml}
      <div class="form-grid">
        <label>对调：把数学 <select id="tk-math">${opt(mathOpts, tiaokeMathPick)}</select></label>
        <label>和 <select id="tk-other">${opt(otherOpts, tiaokeOtherPick)}</select></label>
      </div>
      <div class="row-actions"><button type="button" class="accent" id="tk-swap" ${mathOpts.length && otherOpts.length ? "" : "disabled"}>确认对调</button></div>
      <div class="form-grid">
        <label>借入自习或体育 <select id="tk-borrow">${opt(borrowOpts, tiaokeBorrowPick)}</select></label>
      </div>
      <div class="row-actions"><button type="button" id="tk-borrow-go" ${borrowOpts.length ? "" : "disabled"}>确认借入，改上数学</button></div>
    </div>`;
}

function bindTiaokeActions(host) {
  const prev = host.querySelector("#tk-week-prev");
  if (prev) prev.onclick = () => { tiaokeWeekOffset -= 1; render(); };
  const now = host.querySelector("#tk-week-now");
  if (now) now.onclick = () => { tiaokeWeekOffset = 0; render(); };
  const next = host.querySelector("#tk-week-next");
  if (next) next.onclick = () => { tiaokeWeekOffset += 1; render(); };
  const mathSel = host.querySelector("#tk-math");
  if (mathSel) mathSel.onchange = () => { tiaokeMathPick = mathSel.value; };
  const otherSel = host.querySelector("#tk-other");
  if (otherSel) otherSel.onchange = () => { tiaokeOtherPick = otherSel.value; };
  const borrowSel = host.querySelector("#tk-borrow");
  if (borrowSel) borrowSel.onchange = () => { tiaokeBorrowPick = borrowSel.value; };
  const swapBtn = host.querySelector("#tk-swap");
  if (swapBtn) swapBtn.onclick = () => {
    const a = parseTiaokeOption(host.querySelector("#tk-math")?.value);
    const b = parseTiaokeOption(host.querySelector("#tk-other")?.value);
    const r = swapPeriods(state, a, b);
    toast(r.ok ? r.text : r.reason);
    persist(); render();
  };
  const borrowBtn = host.querySelector("#tk-borrow-go");
  if (borrowBtn) borrowBtn.onclick = () => {
    const a = parseTiaokeOption(host.querySelector("#tk-borrow")?.value);
    const r = a ? borrowIn(state, a.date, a.periodId) : { ok: false, reason: "先选一节自习或体育。" };
    toast(r.ok ? r.text : r.reason);
    persist(); render();
  };
  const acc = host.querySelector("#tk-accept");
  if (acc) acc.onclick = () => {
    const r = respondTimetableRequest(state, true);
    toast(r.ok ? r.text : r.reason);
    persist(); render();
  };
  const rej = host.querySelector("#tk-reject");
  if (rej) rej.onclick = () => {
    const r = respondTimetableRequest(state, false);
    toast(r.ok ? r.text : r.reason);
    persist(); render();
  };
  host.querySelectorAll("[data-tk-date]").forEach((td) => {
    td.onclick = () => {
      const date = td.dataset.tkDate;
      const periodId = td.dataset.tkPid;
      const val = tiaokeOptionValue(date, periodId);
      const slot = daySchedule(date, state).find((p) => p.id === periodId);
      if (!slot || slot.isExamDay || slot.isActivityPeriod) return;
      if (slot.id === "morning-read" || slot.id === "noon" || slot.id === "rest" || slot.id === "evening-1" || slot.id === "evening-2") return;
      if (slot.isMath) {
        tiaokeMathPick = val;
        const sel = host.querySelector("#tk-math");
        if (sel) sel.value = val;
      } else if (slot.subject === "自习" || slot.subject === "体育") {
        tiaokeBorrowPick = val;
        tiaokeOtherPick = val;
        const b = host.querySelector("#tk-borrow");
        const o = host.querySelector("#tk-other");
        if (b) b.value = val;
        if (o) o.value = val;
      } else {
        tiaokeOtherPick = val;
        const o = host.querySelector("#tk-other");
        if (o) o.value = val;
      }
    };
  });
}

function observePanelHtml() {
  if (!state) return "";
  ensureObserveState(state);
  const rec = state.observe || {};
  const count = rec.count || 0;
  const open = isObserveOpen(state);
  if (!open) {
    return `<div class="paper visit-panel observe-panel" data-observe-panel="1">
      <h3>听课</h3>
      <p class="muted">${observeUnavailableReason(state)}本学期已听 ${count} / ${OBSERVE_TERM_CAP} 节。听课是任课数学老师的教研活动，不是接任备课组长。</p>
    </div>`;
  }
  const rows = observeChoices(state).map((v) => {
    return `<p><b>${v.title}${v.name}</b>　${v.classLabel}　${v.reason}</p><div class="row-actions"><button type="button" data-observe="${v.id}">去听这节课</button></div>`;
  }).join("");
  return `<div class="paper visit-panel observe-panel" data-observe-panel="1">
      <h3>听课</h3>
      <p class="muted">办公室坐班时可以去听备课组长或其他数学老师的一节课。每天最多 1 节，本学期已听 ${count} / ${OBSERVE_TERM_CAP} 节（每学期大约六到八节）。记下的是校内听课笔记，不是市级评比。</p>
      ${rows || `<p class="muted">眼下没有可听的老师。</p>`}
    </div>`;
}

function bindObserveActions(host) {
  host.querySelectorAll("[data-observe]").forEach((b) => {
    b.onclick = (ev) => {
      ev.stopPropagation();
      const r = observeLesson(state, b.dataset.observe);
      toast(r.ok ? r.text : r.reason);
      persist(); render();
    };
  });
}

function openClassLine() {
  if (!state) return "";
  const today = openClassSlotOn(state.date, state);
  if (today) {
    const review = openClassReviewFor(state, state.date);
    if (review) return `今日${today.name}已上完。评语：${review.text}`;
    const when = today.slot ? formatSlotLabel(today.slot) : today.periodId;
    return `今日有${today.name}，落在${when}。备课组长${state.player.mentor || "陈正衡"}等组内老师会来听。请按平时规则上课，上完后留下校内评语。${OPEN_CLASS_SOURCE_NOTE}`;
  }
  const nxt = upcomingOpenClass(state.date);
  if (!nxt) return "校历上尚未排到下一场公开课。日期是宁川中学校内安排，不是某所实校或教育局公告的公开课周。";
  return `下场公开课：${nxt.date} ${nxt.name}（${nxt.periodId === "p1" ? "第1节" : nxt.periodId === "p2" ? "第2节" : nxt.periodId === "p3" ? "第3节" : nxt.periodId === "p4" ? "第4节" : nxt.periodId}数学）。${OPEN_CLASS_SOURCE_NOTE}`;
}

function openClassPanelHtml() {
  if (!state) return "";
  const today = openClassSlotOn(state.date, state);
  const review = today ? openClassReviewFor(state, state.date) : latestOpenClassReview(state);
  const showToday = !!today;
  const showReview = review && (!today || review.date === state.date || isOpenClassPeriod(state));
  if (!showToday && !review) {
    const nxt = upcomingOpenClass(state.date);
    return `<div class="paper visit-panel open-class-panel" data-open-class-panel="1">
      <h3>公开课</h3>
      <p class="muted">${openClassLine()}</p>
    </div>`;
  }
  const body = showToday && !review
    ? `<p>今天这节是宁川中学校内安排的公开课。${isOpenClassPeriod(state) ? "备课组长或组内老师现在就在后排听课。" : "到了那节数学课，备课组长或组内老师会来听。"}你仍按现有规则上课，不必另写一套课。若还没备课，也可以上课，评语会写得谨慎一些，不会卡住「下一节」或自动模式。</p><p class="muted">${OPEN_CLASS_SOURCE_NOTE}</p>`
    : (review ? `<p><b>校内评语</b></p><p class="muted">${review.date}　${review.text}</p>` : `<p class="muted">${openClassLine()}</p>`);
  return `<div class="paper visit-panel open-class-panel" data-open-class-panel="1">
      <h3>${showToday ? (today.name || "公开课") : "公开课"}</h3>
      ${body}
    </div>`;
}

function proctorPanelHtml() {
  if (!state) return "";
  if (!isCalendarExamDay(state.date) && !examEventOn(state.date)) return "";
  ensureProctorState(state);
  const ev = examEventOn(state.date);
  const slot = currentSlot(state);
  const assignment = proctorAssignment(state);
  const session = examSessionOf(slot?.id);
  const open = isProctorOpen(state);
  const title = ev?.name ? `监考 · ${ev.name}` : "监考";
  const head = assignment
    ? `按宁川中学校内考务安排，你今天在${assignment.room}值班。当天全日停课，不能上课、不能调课。${session ? sessionLabel(session) + "是白天考场时段。" : ""}${PROCTOR_SOURCE_NOTE}`
    : `今天是校历上的考试日，全日停课。${PROCTOR_SOURCE_NOTE}`;
  if (!open) {
    return `<div class="paper visit-panel proctor-panel" data-proctor-panel="1">
      <h3>${title}</h3>
      <p class="muted">${head}</p>
      <p class="muted">${proctorUnavailableReason(state)}</p>
    </div>`;
  }
  const rows = proctorChoices(state).map((a) => `<button type="button" data-proctor="${a.id}">${a.label}</button>`).join("");
  return `<div class="paper visit-panel proctor-panel" data-proctor-panel="1">
      <h3>${title}</h3>
      <p class="muted">${head}同一场不要反复刷，处理写入值班记录；若点到本班学生，会在档案近况记一句，但不改分数。</p>
      <div class="row-actions">${rows || ""}</div>
    </div>`;
}

function bindProctorActions(host) {
  host.querySelectorAll("[data-proctor]").forEach((b) => {
    b.onclick = (ev) => {
      ev.stopPropagation();
      const r = doProctorAction(state, b.dataset.proctor);
      toast(r.ok ? r.text : r.reason);
      persist(); render();
    };
  });
}

function markingPanelHtml() {
  if (!state) return "";
  ensureProctorState(state);
  const open = isMarkingOpen(state);
  const pending = pendingGradeableExam(state);
  const latest = latestPlayerExam(state);
  if (!open) {
    const why = markingUnavailableReason(state);
    if (!pending && !latest && !isCalendarExamDay(state.date)) return "";
    return `<div class="paper visit-panel marking-panel" data-marking-panel="1">
      <h3>阅本班数学卷</h3>
      <p class="muted">${why}</p>
    </div>`;
  }
  const papers = markingPapers(state);
  const rows = papers.map((p) => `<p><b>${p.name}</b>${p.seat ? "　" + p.seat : ""}　${p.note}</p>`).join("");
  return `<div class="paper visit-panel marking-panel" data-marking-panel="1">
      <h3>阅本班数学卷</h3>
      <p class="muted">「${pending?.examName || "本场考试"}」已经出分。办公室坐班可以阅本班这几份数学卷，每天最多一轮，每场考试最多一轮。摘记只对照已经出的成绩方向，不改分数、排名或省控。市联考、省联考、会考和高考的卷子不在本校改。</p>
      ${rows || `<p class="muted">眼下没有可看的本班试卷。</p>`}
      ${papers.length ? `<div class="row-actions"><button type="button" class="accent" data-mark-papers="1">阅完这几份数学卷</button></div>` : ""}
    </div>`;
}

function bindMarkingActions(host) {
  host.querySelectorAll("[data-mark-papers]").forEach((b) => {
    b.onclick = (ev) => {
      ev.stopPropagation();
      const r = markClassPapers(state);
      toast(r.ok ? r.text : r.reason);
      persist(); render();
    };
  });
}

function officeLeaveLine() {
  const away = classAbsences(clsStudents(), state);
  if (!away.length) return "";
  return `今日请假：${away.slice(0, 4).map((s) => `${s.name}（${s.health?.kind || s.health?.status || "假"}）`).join("、")}${away.length > 4 ? "等" : ""}。假条已由班主任登记。`;
}

function qualityMeetPanelHtml() {
  if (!state) return "";
  if (!isQualityMeetWindow(state)) return "";
  ensureQualityMeetState(state);
  const exam = currentQualityMeetExam(state);
  const rec = state.qualityMeet || {};
  const done = exam && hasQualityMeet(state, exam);
  if (!isQualityMeetOpen(state) && !done) {
    return `<div class="paper visit-panel quality-meet-panel" data-quality-meet-panel="1">
      <h3>备课组质量分析会</h3>
      <p class="muted">${qualityMeetUnavailableReason(state)} ${QUALITY_MEET_SOURCE_NOTE}</p>
    </div>`;
  }
  if (done) {
    const minutes = rec.lastMinutes?.minutes || (state.qualityMeetings || [])[0]?.minutes || "";
    return `<div class="paper visit-panel quality-meet-panel" data-quality-meet-panel="1">
      <h3>备课组质量分析会</h3>
      <p class="muted">本场「${exam?.examName || "这场考试"}」的校内质量分析会已经开过。下面是会议纪要，也可在学校日志里查阅。${QUALITY_MEET_SOURCE_NOTE}</p>
      <p>${minutes}</p>
    </div>`;
  }
  const brief = composeQualityMeetBrief(state, exam);
  const options = qualityMeetOptionsFor(state, exam);
  const btns = (options.length ? options : QUALITY_MEET_ACTIONS).map((o) => `<button type="button" data-quality-meet="${o.id}">${o.label}</button>`).join("");
  return `<div class="paper visit-panel quality-meet-panel" data-quality-meet-panel="1">
      <h3>备课组质量分析会</h3>
      <p class="muted">本校月考、期中、期末或模拟成绩公布后，办公室坐班可以参加一场数学备课组的校内质量分析会。每一场对应考试全组只开一次。由备课组长主持，你以任课老师身份参加。${QUALITY_MEET_SOURCE_NOTE}</p>
      <p><b>本场考试</b>　${exam?.examName || ""}</p>
      <p>${brief?.shortPoints || "结合已公布的本班数学均分和典型问题开会。"}</p>
      <div class="row-actions">${btns}</div>
    </div>`;
}

function bindQualityMeetActions(host) {
  host.querySelectorAll("[data-quality-meet]").forEach((b) => {
    b.onclick = (ev) => {
      ev.stopPropagation();
      const r = handleQualityMeet(state, b.dataset.qualityMeet);
      toast(r.ok ? r.text : r.reason);
      persist(); render();
    };
  });
}

function groupPrepPanelHtml() {
  if (!state) return "";
  if (!isGroupPrepWindow(state)) return "";
  ensureGroupPrepState(state);
  const rec = state.groupPrep || {};
  const done = hasGroupPrepThisWeek(state);
  if (!isGroupPrepOpen(state) && !done) {
    return `<div class="paper visit-panel group-prep-panel" data-group-prep-panel="1">
      <h3>集体备课</h3>
      <p class="muted">${groupPrepUnavailableReason(state)} ${GROUP_PREP_SOURCE_NOTE}</p>
    </div>`;
  }
  if (done) {
    const minutes = rec.lastMinutes?.minutes || latestGroupPrepThisWeek(state)?.minutes || (state.groupPreps || [])[0]?.minutes || "";
    return `<div class="paper visit-panel group-prep-panel" data-group-prep-panel="1">
      <h3>集体备课</h3>
      <p class="muted">本周校内集体备课已经参加过。下面是会议纪要，也可在学校日志里查阅。每周最多一次，不能代替你自己备课。${GROUP_PREP_SOURCE_NOTE}</p>
      <p>${minutes}</p>
    </div>`;
  }
  const brief = composeGroupPrepBrief(state);
  const options = groupPrepOptionsFor(state);
  const btns = (options.length ? options : GROUP_PREP_ACTIONS).map((o) => `<button type="button" data-group-prep="${o.id}">${o.label}</button>`).join("");
  return `<div class="paper visit-panel group-prep-panel" data-group-prep-panel="1">
      <h3>集体备课</h3>
      <p class="muted">办公室坐班可以参加数学备课组的校内集体备课，每周最多 ${GROUP_PREP_WEEK_CAP} 次，每学期大约 ${GROUP_PREP_TERM_CAP} 次。由备课组长主持，你以任课老师身份参加，不能代替自己备课。${GROUP_PREP_SOURCE_NOTE}</p>
      <p><b>本周课题</b>　${brief?.topic || "本周数学课"}</p>
      <p>${brief?.shortPoints || "对照本周课题、例题口径和作业范围开会。"}</p>
      <div class="row-actions">${btns}</div>
    </div>`;
}

function bindGroupPrepActions(host) {
  host.querySelectorAll("[data-group-prep]").forEach((b) => {
    b.onclick = (ev) => {
      ev.stopPropagation();
      const r = handleGroupPrep(state, b.dataset.groupPrep);
      toast(r.ok ? r.text : r.reason);
      persist(); render();
    };
  });
}

function openingDayPanelHtml() {
  if (!state) return "";
  if (!isOpeningDayPlayDate(state.date)) return "";
  ensureOpeningDayState(state);
  const ev = openingEventForPlayDate(state.date);
  const rec = state.openingDay || {};
  const kindName = openingEventKindName(ev) || (rec.kind === "report" ? "报到" : "开学典礼");
  const play = ev ? openingPlayDate(ev) : rec.playDate;
  const nominal = ev?.date;
  const dateNote = play && nominal && play !== nominal
    ? `校历上的日期仍是 ${nominal}，今年适逢周末，改在 ${play} 进行。`
    : (nominal ? `校历上的日期是 ${nominal}，今年就在当天进行。` : "");
  const done = ev && hasOpeningDayRecord(state, ev);
  if (!isOpeningDayOpen(state) && !done) {
    return `<div class="paper visit-panel opening-day-panel" data-opening-day-panel="1">
      <h3>${kindName}</h3>
      <p class="muted">${openingDayUnavailableReason(state)} ${OPENING_DAY_SOURCE_NOTE}</p>
    </div>`;
  }
  if (done) {
    const minutes = rec.lastMinutes?.minutes || latestOpeningDayMinutes(state, ev)?.minutes || (state.openingDays || [])[0]?.minutes || "";
    return `<div class="paper visit-panel opening-day-panel" data-opening-day-panel="1">
      <h3>${kindName}</h3>
      <p class="muted">这次${kindName}已经参加过。下面是纪要，也可在学校日志里查阅。每个开学事件只能参加一次。${OPENING_DAY_SOURCE_NOTE}</p>
      <p>${minutes}</p>
    </div>`;
  }
  const brief = composeOpeningDayBrief(state, ev);
  const options = openingDayOptionsFor(state);
  const fallback = ev && !isFallOpeningEvent(ev) ? SPRING_OPENING_ACTIONS : FALL_OPENING_ACTIONS;
  const btns = (options.length ? options : fallback).map((o) => `<button type="button" data-opening-day="${o.id}">${o.label}</button>`).join("");
  const intro = kindName === "报到"
    ? `办公室坐班可以参加本班报到：到教室看返校情况、协助清点人数，或记下本学期安排。这不是第二场全校典礼。班主任赵映秋在场，你不是班主任。`
    : `办公室坐班可以随卓行16班参加开学典礼：随班站队听完、记下讲话里对本学年的要求，或协助赵映秋清点本班到校。典礼由校领导主持，你不是主持人，也不是班主任。`;
  return `<div class="paper visit-panel opening-day-panel" data-opening-day-panel="1">
      <h3>${kindName}</h3>
      <p class="muted">${intro}${dateNote}当天数学正课仍可上，不是全日停课活动。${OPENING_DAY_SOURCE_NOTE}</p>
      <p>${brief?.shortPoints || "按宁川中学校内安排参加。"}</p>
      <div class="row-actions">${btns}</div>
    </div>`;
}

function bindOpeningDayActions(host) {
  host.querySelectorAll("[data-opening-day]").forEach((b) => {
    b.onclick = (ev) => {
      ev.stopPropagation();
      const r = handleOpeningDay(state, b.dataset.openingDay);
      toast(r.ok ? r.text : r.reason);
      persist(); render();
    };
  });
}


function studyHallPanelHtml() {
  if (!state) return "";
  if (!isStudyHallWindow(state)) return "";
  ensureStudyHallState(state);
  const rec = state.studyHall || {};
  const done = hasStudyHallThisSlot(state);
  if (!isStudyHallOpen(state) && !done) {
    return `<div class="paper visit-panel study-hall-panel" data-study-hall-panel="1">
      <h3>自习看班</h3>
      <p class="muted">${studyHallUnavailableReason(state)} ${STUDY_HALL_SOURCE_NOTE}</p>
    </div>`;
  }
  if (done) {
    const minutes = rec.lastMinutes?.minutes || latestStudyHallThisSlot(state)?.minutes || (state.studyHalls || [])[0]?.minutes || "";
    return `<div class="paper visit-panel study-hall-panel" data-study-hall-panel="1">
      <h3>自习看班</h3>
      <p class="muted">这节自习已经看过班了。下面是纪要，也可在学校日志和相关学生档案近况里查阅。同一节只能看班一次。${STUDY_HALL_SOURCE_NOTE}</p>
      <p>${minutes}</p>
    </div>`;
  }
  const brief = composeStudyHallBrief(state);
  const options = studyHallOptionsFor(state);
  const btns = (options.length ? options : STUDY_HALL_ACTIONS).map((o) => `<button type="button" data-study-hall="${o.id}">${o.label}</button>`).join("");
  return `<div class="paper visit-panel study-hall-panel" data-study-hall-panel="1">
      <h3>自习看班</h3>
      <p class="muted">现在是课表里的自习，可以进卓行16班教室看班：巡视纪律、答一道作业问询，或记下交头接耳、走神的人。你以任课数学老师身份进教室，不是班主任，也不能主持班会。这不是学校活动停课，也不改成数学晚自习答疑。${STUDY_HALL_SOURCE_NOTE}</p>
      <p>${brief?.shortPoints || "进本班教室看这一节自习。"}</p>
      <div class="row-actions">${btns}</div>
    </div>`;
}

function bindStudyHallActions(host) {
  host.querySelectorAll("[data-study-hall]").forEach((b) => {
    b.onclick = (ev) => {
      ev.stopPropagation();
      const r = handleStudyHall(state, b.dataset.studyHall);
      toast(r.ok ? r.text : r.reason);
      persist(); render();
    };
  });
}

function weekendHwPanelHtml() {
  if (!state) return "";
  if (!isWeekendHwWindow(state)) return "";
  ensureWeekendHwState(state);
  const rec = state.weekendHomework || {};
  const done = hasWeekendHwThisWeek(state);
  if (!isWeekendHwOpen(state) && !done) {
    return `<div class="paper visit-panel weekend-hw-panel" data-weekend-hw-panel="1">
      <h3>周末作业</h3>
      <p class="muted">${weekendHwUnavailableReason(state)} ${WEEKEND_HW_SOURCE_NOTE}</p>
    </div>`;
  }
  if (done) {
    const minutes = rec.lastMinutes?.minutes || latestWeekendHwThisWeek(state)?.minutes || (state.weekendHomeworks || [])[0]?.minutes || "";
    const follow = rec.followUp?.text || rec.lastMinutes?.followUp?.text || "本周末有分层作业";
    return `<div class="paper visit-panel weekend-hw-panel" data-weekend-hw-panel="1">
      <h3>周末作业</h3>
      <p class="muted">本周周末数学作业已经布置过。跟进标记：${follow}。下面是纪要，也可在学校日志和相关学生档案近况里查阅。每周最多一次，不能代替备课或上课后收的随堂作业。${WEEKEND_HW_SOURCE_NOTE}</p>
      <p>${minutes}</p>
    </div>`;
  }
  const brief = composeWeekendHwBrief(state);
  const options = weekendHwOptionsFor(state);
  const btns = (options.length ? options : WEEKEND_HW_ACTIONS).map((o) => `<button type="button" data-weekend-hw="${o.id}">${o.label}</button>`).join("");
  return `<div class="paper visit-panel weekend-hw-panel" data-weekend-hw-panel="1">
      <h3>周末作业</h3>
      <p class="muted">办公室坐班可以布置本周末数学作业，优先周五；若本周五是考试日、活动日、家长会或开学典礼、报到，则提前到周四。每周最多 ${WEEKEND_HW_WEEK_CAP} 次。你以任课老师身份布置，不是班主任，也不能代替备课或上课后收的那份随堂作业。${WEEKEND_HW_SOURCE_NOTE}</p>
      <p><b>分层预览</b>　${brief?.preview || brief?.shortPoints || "按订正情况和学情分层。"}</p>
      <div class="row-actions">${btns}</div>
    </div>`;
}

function bindWeekendHwActions(host) {
  host.querySelectorAll("[data-weekend-hw]").forEach((b) => {
    b.onclick = (ev) => {
      ev.stopPropagation();
      const r = handleWeekendHomework(state, b.dataset.weekendHw);
      toast(r.ok ? r.text : r.reason);
      persist(); render();
    };
  });
}

function dutyWeekPanelHtml() {
  if (!state) return "";
  if (!isDutyWeekWindow(state)) return "";
  ensureDutyWeekState(state);
  const rec = state.dutyWeek || {};
  const done = hasDutyWeekToday(state);
  if (!isDutyWeekOpen(state) && !done) {
    return `<div class="paper visit-panel duty-week-panel" data-duty-week-panel="1">
      <h3>值周</h3>
      <p class="muted">${dutyWeekUnavailableReason(state)} ${DUTY_WEEK_SOURCE_NOTE}</p>
    </div>`;
  }
  if (done) {
    const minutes = rec.lastMinutes?.minutes || latestDutyWeekToday(state)?.minutes || (state.dutyWeeks || [])[0]?.minutes || "";
    const follow = rec.followUp?.text || rec.lastMinutes?.followUp?.text || DUTY_WEEK_MARK;
    return `<div class="paper visit-panel duty-week-panel" data-duty-week-panel="1">
      <h3>值周</h3>
      <p class="muted">今天的值周已经做过。跟进标记：${follow}。下面是纪要，也可在学校日志和相关学生档案近况里查阅。值周周内每个可开工作日最多一次。你是任课数学老师，不是班主任，也不是值班领导。${DUTY_WEEK_SOURCE_NOTE}</p>
      <p>${minutes}</p>
    </div>`;
  }
  const brief = composeDutyWeekBrief(state);
  const options = dutyWeekOptionsFor(state);
  const btns = (options.length ? options : DUTY_WEEK_ACTIONS).map((o) => `<button type="button" data-duty-week="${o.id}">${o.label}</button>`).join("");
  return `<div class="paper visit-panel duty-week-panel" data-duty-week-panel="1">
      <h3>值周</h3>
      <p class="muted">本周是年级值周周（标记：${DUTY_WEEK_MARK}）。办公室坐班可以协助清点迟到、课间巡视走廊，或把见闻写成纪要交给值班领导（${DUTY_LEADER_TITLE}）${DUTY_LEADER_NAME}。每学期约 ${DUTY_WEEKS_PER_TERM} 周，每个可开工作日最多一次。你以任课老师身份协助，不是班主任，也不能主持行政值班。${DUTY_WEEK_SOURCE_NOTE}</p>
      <p><b>今日可做事项</b>　${brief?.preview || brief?.shortPoints || "协助年级值周。"}</p>
      <div class="row-actions">${btns}</div>
    </div>`;
}

function bindDutyWeekActions(host) {
  host.querySelectorAll("[data-duty-week]").forEach((b) => {
    b.onclick = (ev) => {
      ev.stopPropagation();
      const r = handleDutyWeek(state, b.dataset.dutyWeek);
      toast(r.ok ? r.text : r.reason);
      persist(); render();
    };
  });
}

function facultyMeetPanelHtml() {
  if (!state) return "";
  if (!isFacultyMeetWindow(state)) return "";
  ensureFacultyMeetState(state);
  const ev = facultyMeetOpeningEvent(state.date);
  const rec = state.facultyMeet || {};
  const done = ev && hasFacultyMeet(state, ev);
  if (!isFacultyMeetOpen(state) && !done) {
    return `<div class="paper visit-panel faculty-meet-panel" data-faculty-meet-panel="1">
      <h3>教职工大会</h3>
      <p class="muted">${facultyMeetUnavailableReason(state)} ${FACULTY_MEET_SOURCE_NOTE}</p>
    </div>`;
  }
  if (done) {
    const minutes = rec.lastMinutes?.minutes || latestFacultyMeetMinutes(state, ev)?.minutes || (state.facultyMeetings || [])[0]?.minutes || "";
    return `<div class="paper visit-panel faculty-meet-panel" data-faculty-meet-panel="1">
      <h3>教职工大会</h3>
      <p class="muted">本学期这场教职工大会已经参加过了。下面是会议纪要，也可在学校日志里查阅。${FACULTY_MEET_SOURCE_NOTE}</p>
      <p>${minutes}</p>
    </div>`;
  }
  const brief = composeFacultyMeetBrief(state, ev);
  const options = facultyMeetOptionsFor(state, ev);
  const btns = (options.length ? options : FACULTY_MEET_ACTIONS).map((o) => `<button type="button" data-faculty-meet="${o.id}">${o.label}</button>`).join("");
  return `<div class="paper visit-panel faculty-meet-panel" data-faculty-meet-panel="1">
      <h3>教职工大会</h3>
      <p class="muted">开学典礼或报到可玩日之后最近的上课工作日，办公室坐班可以参加一次全校教职工大会。每一次开学最多一次。由校领导主持，你以任课老师身份到场听会，不是主持人。${FACULTY_MEET_SOURCE_NOTE}</p>
      <p>${brief?.shortPoints || "到场听校领导布置本学期校内要求。"}</p>
      <div class="row-actions">${btns}</div>
    </div>`;
}

function bindFacultyMeetActions(host) {
  host.querySelectorAll("[data-faculty-meet]").forEach((b) => {
    b.onclick = (ev) => {
      ev.stopPropagation();
      const r = handleFacultyMeet(state, b.dataset.facultyMeet);
      toast(r.ok ? r.text : r.reason);
      persist(); render();
    };
  });
}

function gradeMeetPanelHtml() {
  if (!state) return "";
  if (!isGradeMeetWindow(state)) return "";
  ensureGradeMeetState(state);
  const exam = currentGradeMeetExam(state);
  const rec = state.gradeMeet || {};
  const done = exam && hasGradeMeet(state, exam);
  if (!isGradeMeetOpen(state) && !done) {
    return `<div class="paper visit-panel grade-meet-panel" data-grade-meet-panel="1">
      <h3>年级会</h3>
      <p class="muted">${gradeMeetUnavailableReason(state)} ${GRADE_MEET_SOURCE_NOTE}</p>
    </div>`;
  }
  if (done) {
    const minutes = rec.lastMinutes?.minutes || latestGradeMeetMinutes(state, exam)?.minutes || (state.gradeMeetings || [])[0]?.minutes || "";
    return `<div class="paper visit-panel grade-meet-panel" data-grade-meet-panel="1">
      <h3>年级会</h3>
      <p class="muted">本场「${exam?.examName || "这场考试"}」的年级会已经开过。下面是会议纪要，也可在学校日志里查阅。${GRADE_MEET_SOURCE_NOTE}</p>
      <p>${minutes}</p>
    </div>`;
  }
  const brief = composeGradeMeetBrief(state, exam);
  const options = gradeMeetOptionsFor(state, exam);
  const btns = (options.length ? options : GRADE_MEET_ACTIONS).map((o) => `<button type="button" data-grade-meet="${o.id}">${o.label}</button>`).join("");
  return `<div class="paper visit-panel grade-meet-panel" data-grade-meet-panel="1">
      <h3>年级会</h3>
      <p class="muted">本校月考、期中、期末或模拟成绩公布后，办公室坐班可以参加一场年级会。每一场对应考试只开一次。由年级主任主持，你以任课老师身份到场听会，不是主持人。${GRADE_MEET_SOURCE_NOTE}</p>
      <p><b>本场考试</b>　${exam?.examName || ""}</p>
      <p>${brief?.shortPoints || "到场听年级主任布置作息、纪律和下阶段安排。"}</p>
      <div class="row-actions">${btns}</div>
    </div>`;
}

function bindGradeMeetActions(host) {
  host.querySelectorAll("[data-grade-meet]").forEach((b) => {
    b.onclick = (ev) => {
      ev.stopPropagation();
      const r = handleGradeMeet(state, b.dataset.gradeMeet);
      toast(r.ok ? r.text : r.reason);
      persist(); render();
    };
  });
}

function paperSignPanelHtml() {
  if (!state) return "";
  if (!isPaperSignWindow(state)) return "";
  ensurePaperSignState(state);
  const exam = currentPaperSignExam(state);
  const rec = state.paperSign || {};
  const doneToday = rec.date === state.date && rec.todayAction;
  const prog = paperSignProgress(state, exam);
  const examLine = exam ? `当前对应已公布的「${exam.examName}」。已发放 ${prog.issued} 人，已交回 ${prog.returned} 人，全班 ${prog.total} 人。每天最多一批，每批约 ${PAPER_SIGN_BATCH_MIN}–${PAPER_SIGN_BATCH_MAX} 人，不必一次点完全班，也不必强求全班办完。` : "";
  if (!isPaperSignOpen(state) && !doneToday) {
    return `<div class="paper visit-panel paper-sign-panel" data-paper-sign-panel="1">
      <h3>试卷签字</h3>
      <p class="muted">${paperSignUnavailableReason(state)} ${PAPER_SIGN_SOURCE_NOTE}</p>
    </div>`;
  }
  if (doneToday) {
    const minutes = rec.lastMinutes?.minutes || (state.paperSigns || [])[0]?.minutes || "";
    const actionLabel = (PAPER_SIGN_ACTIONS.find((a) => a.id === rec.todayAction) || {}).label || "已办理一批";
    return `<div class="paper visit-panel paper-sign-panel" data-paper-sign-panel="1">
      <h3>试卷签字</h3>
      <p class="muted">今天已经办理过一批：${actionLabel}。${examLine}下面是纪要，也可在学校日志和相关学生档案近况里查阅。其余的请明天再办。${PAPER_SIGN_SOURCE_NOTE}</p>
      <p>${minutes}</p>
    </div>`;
  }
  const brief = composePaperSignBrief(state, exam);
  const options = paperSignOptionsFor(state);
  const lists = options.map((o) => `<p><b>${o.label}</b>　今日建议：${(o.names || []).join("、") || "（暂无）"}</p>`).join("");
  const btns = (options.length ? options : []).map((o) => `<button type="button" data-paper-sign="${o.id}">${o.label}</button>`).join("");
  return `<div class="paper visit-panel paper-sign-panel" data-paper-sign-panel="1">
      <h3>试卷签字</h3>
      <p class="muted">本校月考、期中、期末或模拟成绩公布后，办公室坐班可以把数学试卷或成绩告知条发给学生带回请家长签字，并登记交回。你以任课老师身份办理，不是班主任，不能发放学校正式成绩单、通知书或操行评语表，也不能主持班会。这不是家长会或家访。${examLine}${PAPER_SIGN_SOURCE_NOTE}</p>
      <p>${brief?.shortPoints || "按订正、课堂和本场波动确定今日建议名单。"}</p>
      ${lists}
      <div class="row-actions">${btns || `<p class="muted">眼下没有可办理的名单。</p>`}</div>
    </div>`;
}

function bindPaperSignActions(host) {
  host.querySelectorAll("[data-paper-sign]").forEach((b) => {
    b.onclick = (ev) => {
      ev.stopPropagation();
      const r = handlePaperSign(state, b.dataset.paperSign);
      toast(r.ok ? r.text : r.reason);
      persist(); render();
    };
  });
}

function officeCollabHtml() {

  const watch = homeworkWatchlist(state.homework, state);
  const names = [...new Set(watch.map((r) => r.name))];
  const nxt = upcomingMath(state, { skipTaught: true });
  const slot = currentSlot(state);
  return `${visitPanelHtml()}
    ${alumniBoostPanelHtml()}
    <div class="paper lesson-card office-actions">
      <h3>办公室与班主任</h3>
      <p class="muted">现在是${slot ? formatSlotLabel(slot) : formatDateCn(state.date)}。${nxt ? `下一节数学：${nxt.sameDay ? "" : nxt.date + " "}${formatSlotLabel(nxt.slot)}。` : ""}${officeLeaveLine()}不是空菜单：坐班改作业、向班主任通报、向备课组长请教、听课都会留下记录，并且用确定性规则推进作业订正。</p>
      <div class="row-actions">
        <button type="button" class="accent" id="do-mark">坐班批改</button>
        <button type="button" id="do-home">向班主任通报本班</button>
        <button type="button" id="do-mentor">向备课组长请教</button>
      </div>
      ${names.length ? `<p>需要盯的人：${names.slice(0, 8).join("、")}${names.length > 8 ? "等" : ""}。也可单独通报：</p>
        <div class="row-actions">${watch.slice(0, 8).map((r)=>`<button type="button" data-home="${r.id}">通报${r.name}</button>`).join("")}</div>` : `<p class="muted">眼下没有特别要盯的缺交或订正。仍可和班主任对一下班情，或向${state.player.mentor}请教下一课。</p>`}
    </div>
    ${observePanelHtml()}
    ${markingPanelHtml()}
    ${phoneVisitPanelHtml()}
    ${coachingPanelHtml({ always: true })}
    ${commentPanelHtml()}
    ${teachersDayPanelHtml({ place: "office" })}
    ${qualityMeetPanelHtml()}
    ${groupPrepPanelHtml()}
    ${weekendHwPanelHtml()}
    ${dutyWeekPanelHtml()}
    ${facultyMeetPanelHtml()}
    ${gradeMeetPanelHtml()}
    ${paperSignPanelHtml()}
    ${openingDayPanelHtml()}
    ${tiaokePanelHtml()}`;
}

function bindOfficeActions(host) {
  bindAlumniBoostActions(host);
  const mark = host.querySelector("#do-mark");
  if (mark) mark.onclick = () => { const r = officeMarking(state); toast(r.ok ? r.text : r.reason); persist(); render(); };
  const home = host.querySelector("#do-home");
  if (home) home.onclick = () => { const r = consultHomeroom(state); toast(r.ok ? r.text : r.reason); persist(); render(); };
  const mentor = host.querySelector("#do-mentor");
  if (mentor) mentor.onclick = () => { const r = consultMentor(state); toast(r.ok ? r.text : r.reason); persist(); render(); };
  bindVisitActions(host);
  bindHomeVisitActions(host);
  bindCoachingActions(host);
  bindCommentActions(host);
  bindTeachersDayActions(host);
  bindQualityMeetActions(host);
  bindGroupPrepActions(host);
  bindWeekendHwActions(host);
  bindDutyWeekActions(host);
  bindFacultyMeetActions(host);
  bindGradeMeetActions(host);
  bindPaperSignActions(host);
  bindOpeningDayActions(host);
  bindObserveActions(host);
  bindProctorActions(host);
  bindMarkingActions(host);
  host.querySelectorAll("[data-home]").forEach((b) => {
    b.onclick = (ev) => { ev.stopPropagation(); selectedId = b.dataset.home; const r = consultHomeroom(state, b.dataset.home); toast(r.ok ? r.text : r.reason); persist(); render(); };
  });
  host.querySelectorAll("[data-urge]").forEach((b) => {
    b.onclick = (ev) => { ev.stopPropagation(); selectedId = b.dataset.urge; const r = urgeHomework(state, b.dataset.urge); toast(r.ok ? r.text : r.reason); persist(); render(); };
  });
  host.querySelectorAll("[data-chk]").forEach((b) => {
    b.onclick = (ev) => { ev.stopPropagation(); selectedId = b.dataset.chk; const r = checkCorrection(state, b.dataset.chk); toast(r.ok ? r.text : r.reason); persist(); render(); };
  });
  bindTiaokeActions(host);
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


function viewClassManage(host) {
  const sts = clsStudents().slice().sort((a, b) => a.seq - b.seq);
  const home = state.player.homeroom || "赵映秋";
  const committee = playerClassCommittee(state);
  const brief = playerClassBrief(state);
  const todayDuty = playerDutyToday(state);
  const week = playerWeekDuty(state);
  const slot = currentSlot(state);
  const open = isHomeroomMeetingSlot(state);
  const nxt = upcomingClassMeeting(state);
  const meetings = state.classMeetings || [];
  const todayKey = `${state.date}|${state.periodId}`;
  const already = meetings.some((m) => `${m.date}|${m.periodId}` === todayKey);
  const roleRows = committee.roles.map((r) => {
    const s = r.student;
    return `<tr data-id="${s.id}"><td>${r.title}</td><td>${s.seq ?? ""}号</td><td>${s.name}</td><td>${s.personality || "—"}</td></tr>`;
  }).join("");
  const todayRest = week.some((d) => d.isToday && d.rest);
  const todayLine = todayRest
    ? "今天是周日，不排值日。"
    : (todayDuty.length ? todayDuty.map(formatStudentShort).join("、") : "还没有排到值日生。");
  const weekLines = week.map((d) => {
    const mark = d.isToday ? "（今天）" : "";
    if (d.rest) return `<li>星期${d.weekdayName} ${d.date}${mark}：休息，不排值日</li>`;
    const names = (d.students || []).map(formatStudentShort).join("、") || "—";
    return `<li>星期${d.weekdayName} ${d.date}${mark}：${names}</li>`;
  }).join("");
  const watch = homeworkWatchlist(state.homework, state);
  const meetingHint = open
    ? `现在是${formatSlotLabel(slot)}，由班主任${home}主持。你可以旁听或协助整理要点，但不能推开她去主持。${already ? "这节班会已经记录过了。" : ""}`
    : `现在不是班会课，要等到班会课再旁听或协助班主任。${nxt ? `下一节班会：${nxt.sameDay ? "" : nxt.date + " "}${formatSlotLabel(nxt.slot)}。` : ""}`;
  const minutes = meetings.slice().reverse().map((m) => `<p class="muted">${m.date}　「${m.theme}」· ${m.mode === "assist" ? "协助" : "旁听"}<br/>${m.minutes}</p>`).join("")
    || `<p class="muted">还没有班会纪要。等到班会课再旁听或协助，纪要会记在这里。</p>`;
  host.innerHTML = `<h3>班级管理 · ${state.player.cohortYear}级卓行${state.player.classNo}班</h3>
    <div class="row-actions"><button type="button" data-open-class-trend="1">全班成绩 AI 分析</button></div>
    <p class="notice">${state.player.official ? "你是本班数学教师（已转正）" : "你是本班数学实习教师"}，协助班主任${home}管理日常事务：查看班委和值日、整理班情、在班会课旁听或协助。班委由本班学生特质硬定，一人一职；分班后若人员变化会按新名单重算。你不能代替班主任主持班会，也不能随意撤换班委。</p>
    <div class="kpi">
      <div><span>班主任</span><b>${home}</b></div>
      <div><span>任教班</span><b>卓行${state.player.classNo}班 · ${sts.length}人</b></div>
      <div><span>今日值日</span><b>${todayRest ? "周日休息" : (todayDuty.length + "人")}</b></div>
    </div>
    <div class="profile-grid">
      <div class="paper lesson-card">
        <h3>班委</h3>
        <p class="muted">班长、学习委员、纪律委员、劳动委员按性格和能力从本班硬定，同一局名单不变则人选不变。</p>
        <div class="scroll-table"><table><thead><tr><th>职务</th><th>座号</th><th>姓名</th><th>性格</th></tr></thead>
        <tbody>${roleRows}</tbody></table></div>
      </div>
      <div class="paper lesson-card">
        <h3>值日</h3>
        <p><b>今天</b>　${todayLine}</p>
        <p class="muted">按座号轮换，同一天同一份名单结果稳定。</p>
        <p><b>本周值日</b></p>
        <ul class="notes-list">${weekLines}</ul>
      </div>
    </div>
    <div class="paper lesson-card">
      <h3>班情摘要</h3>
      <p>${brief.text}</p>
      <div class="row-actions">
        <button type="button" class="accent" id="cm-home">向班主任通报本班</button>
        ${watch.slice(0, 8).map((r) => `<button type="button" data-home="${r.id}">通报${r.name}</button>`).join("")}
      </div>
    </div>
    <div class="paper lesson-card">
      <h3>班会旁听与协助</h3>
      <p>${meetingHint}</p>
      <p class="muted">主讲是班主任${home}。${state.player.official ? "你已转正，仍" : "实习教师"}可以旁听或协助，不能主持班会。</p>
      <div class="row-actions">
        <button type="button" class="accent" id="cm-attend">旁听班会</button>
        <button type="button" id="cm-assist">协助班主任</button>
        <button type="button" id="cm-host">主持班会</button>
      </div>
      <h3>班会纪要</h3>
      ${minutes}
    </div>
    ${doorVisitPanelHtml({ always: true })}`;
  /* 点行进档案由 #view 委托处理 */
  const briefHome = host.querySelector("#cm-home");
  if (briefHome) briefHome.onclick = () => { const r = consultHomeroom(state); toast(r.ok ? r.text : r.reason); persist(); render(); };
  host.querySelectorAll("[data-home]").forEach((b) => {
    b.onclick = (ev) => { ev.stopPropagation(); selectedId = b.dataset.home; const r = consultHomeroom(state, b.dataset.home); toast(r.ok ? r.text : r.reason); persist(); render(); };
  });
  const attendBtn = host.querySelector("#cm-attend");
  if (attendBtn) attendBtn.onclick = () => { const r = attendClassMeeting(state); toast(r.ok ? r.text : r.reason); persist(); render(); };
  const assistBtn = host.querySelector("#cm-assist");
  if (assistBtn) assistBtn.onclick = () => { const r = attendClassMeeting(state, { assist: true }); toast(r.ok ? r.text : r.reason); persist(); render(); };
  const hostBtn = host.querySelector("#cm-host");
  if (hostBtn) hostBtn.onclick = () => { const r = hostClassMeeting(state); toast(r.ok ? r.text : r.reason); persist(); render(); };
  bindHomeVisitActions(host);
  bindScoreTrendPanels(host);
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
  const examBit = isCalendarExamDay(state.date)
    ? `，今日${examEventOn(state.date)?.name || "考试"}全日停课，按宁川中学校内考务安排监考，不能上课、不能调课`
    : (isOpenClassPeriod(state) ? "，本节是校内公开课，备课组长等组内老师来听，按平时规则上课即可" : slot?.isTutoring ? "，可以做晚自习答疑" : slot?.isMath ? "，可以进教室上课" : isStudyHallWindow(state) ? (isStudyHallOpen(state) ? "。现在是自习，可以进本班教室看班，不是学校活动停课" : "。现在是自习，这节已经看过班了") : isOpeningDayPlayDate(state.date) ? `。今日是宁川中学校内${openingEventKindName(openingEventForPlayDate(state.date)) || "开学安排"}，可在办公室坐班参加；不是全日停课活动，等到数学课再进教室，或先在办公室处理作业` : "。等到数学课再进教室，或先在办公室处理作业、在座位上谈话");
  host.innerHTML = `<h3>日常教学 · 数学课</h3>
    <p class="notice">现在是${slot ? formatSlotLabel(slot) : formatDateCn(state.date)}${examBit}。${!isCalendarExamDay(state.date) && nxt && !slot?.isMath && !slot?.isTutoring ? `下一节数学：${nxt.sameDay ? "" : nxt.date + " "}${formatSlotLabel(nxt.slot)}。` : ""}先写教案，再上课；晚自习另做答疑，不另开课题。课后从缺交、错题跟到订正和复查。</p>
    ${alumniBoostPanelHtml()}
    ${openClassPanelHtml()}
    ${proctorPanelHtml()}
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
    ${schoolActivityHtml()}
    ${studyHallPanelHtml()}
    ${eveningTutorHtml()}
    ${officeCollabHtml()}
    ${doorVisitPanelHtml()}
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
  bindActivityActions(host);
  bindDeskAndTutor(host);
  bindStudyHallActions(host);
  /* 点行进档案由 #view 委托处理 */
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
  const trackName = (tr) => classTrackLabel("wenli-batches", tr);
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
      <tbody>${Object.values(byTier).sort((a,b)=>String(a.tier).localeCompare(String(b.tier))).map((g)=>`<tr><td>${trackName(g.track)}</td><td>${tierLabel(g.tier)}</td><td>${g.n}</td><td>${Object.entries(g.classes).sort((a,b)=>a[0]-b[0]).map(([n,c])=>`${n}班${c}人`).join("、")}</td></tr>`).join("")}</tbody></table>
    </div>
    <h3>第一次分班去向</h3>
    ${p1done ? `<p class="notice">全年级跨班调整 ${p1moves.length} 人。进入卓行${state.player.classNo}班 ${in16.length} 人，从本班调出 ${out16.length} 人。0/1 班只做文理互换，不按普通淘汰降到卓行或笃学。</p>
      <div class="scroll-table paper"><table><thead><tr><th>姓名</th><th>原班</th><th>新班</th><th>科类</th></tr></thead>
      <tbody>${[...in16, ...out16].slice(0, 80).map((s)=>`<tr class="${s.classNo===state.player.classNo?"me":""}"><td>${s.name}</td><td>${s.placement1.from}班</td><td>${s.placement1.to}班</td><td>${trackName(s.track)}</td></tr>`).join("") || "<tr><td colspan='4'>本班名单未发生跨班调整。</td></tr>"}</tbody></table></div>` : `<p class="notice">还没做第一次分班。用「下一阶段」推到高一上期末后的分班事件即可自动结算。</p>`}
    <h3>第二次分班（同层同科类均衡）</h3>
    ${p2done ? `<p class="notice">只在同一层次、同一科类的原有班级之间蛇形重组，不重新分文理，也不跨到凌霄或笃学。全年级同层换班 ${p2moves.length} 人；进入本班 ${p2in.length} 人，调出 ${p2out.length} 人。0/1 班保持不动。</p>
      ${sameTier.length ? `<div class="paper"><p class="muted">同层次班级对照（最近一场考试均分，由个人成绩加总）</p>
        <table><thead><tr><th>班</th><th>人数</th><th>均分</th><th>最高</th></tr></thead>
        <tbody>${sameTier.map((x)=>`<tr class="${x.classNo===state.player.classNo?"me":""}"><td>${x.name||x.classNo+"班"}</td><td>${x.count}</td><td>${x.avg}</td><td>${x.max}</td></tr>`).join("")}</tbody></table></div>` : ""}
      <div class="scroll-table paper"><table><thead><tr><th>姓名</th><th>原班</th><th>新班</th><th>层次</th><th>科类</th></tr></thead>
      <tbody>${[...p2in, ...p2out].map((s)=>`<tr class="${s.classNo===state.player.classNo?"me":""}"><td>${s.name}</td><td>${s.placement2.from}班</td><td>${s.placement2.to}班</td><td>${tierLabel(s.tier)}</td><td>${trackName(s.track)}</td></tr>`).join("") || "<tr><td colspan='5'>本班在第二次分班中没有换到其他卓行班。</td></tr>"}</tbody></table></div>` : `<p class="notice">第二次分班要等第一次完成、并且高一下学期期末之后。推进校历时会按规则自动重组，可在本页查看换班名单和同层对照，不会与第一次的文理分科、跨梯队调整混在一起。</p>`}`;
}

function clickStudentHint() {
  return `<p class="notice">点击学生可看成绩和排名曲线。曲线在「学生档案」里，含总分折线、班排/同层次排/校排变化，以及单科对照。</p>`;
}

function examOptions(list) {
  const rows = list || listExamReports(state, { entryYear: state.player.cohortYear });
  if (!rows.length) return "";
  const cur = pickExamReport(rows, examPick, { preferEntryYear: state.player.cohortYear }) || rows[0];
  examPick = examReportKey(cur);
  return rows.map((e) => {
    const v = examReportKey(e);
    return `<option value="${v}" ${v===examPick?"selected":""}>${e.date} ${e.examName}（难度${(e.difficulty||1).toFixed(2)}）</option>`;
  }).join("");
}

function currentReport() {
  const list = listExamReports(state, { entryYear: state.player.cohortYear });
  return pickExamReport(list, examPick, { preferEntryYear: state.player.cohortYear });
}

function lineCompareNotice(report, classNo = state.player.classNo) {
  if (!report || report.examKind === "huikao") return "";
  const parts = [];
  if (report.examKind === "gaokao") {
    const year = provincialCompareYear(report.date);
    parts.push(describeOfficialProvincialLines(year, ["li", "wen"], packOptsForReport(report)) + " ");
  }
  parts.push(describeSchoolCutoff(report.quota, report.split, { includeRepeat: report.grade >= 3 || report.cutoffs?.includeRepeat }) + "。");
  parts.push(describeSchoolProvincial(report) + "。");
  if (classNo != null) {
    parts.push(`任教班${describeClassProvincial(report, classNo)}。`);
    const peers = describeZhuoxingPeers(report, classNo);
    if (peers) parts.push(`同层次平行班对比：${peers}`);
  }
  return parts.join("");
}

function packOptsForReport(report) {
  return { seed: state?.seed, difficulty: report?.difficulty };
}

function officialLinesBlock(report, track = "li") {
  const year = provincialCompareYear(report.date);
  const pack = officialProvincialPack(year, packOptsForReport(report));
  const tr = track === "wen" ? "wen" : "li";
  const t = pack[tr];
  const other = tr === "li" ? pack.wen : pack.li;
  const label = pack.trackLabel?.[tr] || (tr === "wen" ? "文科" : "理科");
  const otherLabel = pack.trackLabel?.[tr === "li" ? "wen" : "li"] || (tr === "wen" ? "理科" : "文科");
  const firstName = pack.firstLabel || "一本";
  const secondName = pack.secondLabel || "二本";
  const rankFirst = t.ranks ? `（全省前 ${t.ranks.firstN} 名）` : "";
  const rankSecond = t.ranks ? `（全省前 ${t.ranks.secondN} 名）` : "";
  const otherRanks = other.ranks
    ? `，${firstName}全省前 ${other.ranks.firstN} 名、${secondName}全省前 ${other.ranks.secondN} 名`
    : "";
  const kind = pack.simulated ? "模拟省控（模拟线，非正式官方省控）" : "公开省控（国家线）";
  const simBanner = pack.simulated ? `<p class="notice warn">模拟线，非正式官方省控。数字按2016–2026江西公开省控波动和当次试卷难度生成，可复现，不是省教育考试院公布的分数线。</p>` : "";
  return `${simBanner}<div class="kpi">
      <div><span>${year}年${pack.simulated ? "模拟省控" : "公开省控"}${label}${firstName}${pack.simulated ? "" : "（国家线）"}${rankFirst}</span><b>${t.first}</b></div>
      <div><span>${pack.simulated ? "模拟省控" : "公开省控"}${label}${secondName}${pack.simulated ? "" : "（国家线）"}${rankSecond}</span><b>${t.second}</b></div>
      <div><span>${pack.simulated ? "模拟线分差" : "国家线分差"}</span><b>${t.gap}</b></div>
      <div><span>试卷难度</span><b>${(report.difficulty||1).toFixed(3)}</b></div>
    </div>
    <p class="notice">${pack.sourceNote} ${otherLabel}${firstName} ${other.first}、${secondName} ${other.second}，分差 ${other.gap}${otherRanks}。</p>`;
}

function schoolLinesNote(report, track = "li") {
  const cut = schoolCutoffView(report, track);
  const cutW = report.split && track !== "wen" ? schoolCutoffView(report, "wen") : null;
  if (!cut) return "";
  const ordinary = report.examKind !== "gaokao" && report.examKind !== "city" && report.examKind !== "province";
  const withRepeat = report.grade >= 3 || report.cutoffs?.includeRepeat;
  const why = ordinary
    ? (withRepeat
        ? "平时考试没有国家线。校内线按应届与补习班同一池约第 520、第 1100 名划，只作对照，不是省控。"
        : "平时考试没有国家线。本年级没有补习班，校内线按应届池比例折算，不能套用高三的第 520、第 1100 名，以上是校内对照，不是省控。")
    : (withRepeat
        ? "以上校内线按应届与补习班同一池约第 520、第 1100 名取分（池人数不足时按池内规模收束），只作对照，不是国家线。"
        : "以上校内线按本年级应届池比例折算取分，本年级没有补习班，不能套用高三的第 520、第 1100 名（池人数不足时按池内规模收束），只作对照，不是国家线。");
  const extra = cutW ? `文科${cutW.firstTitle} ${cutW.firstLine}，${cutW.secondTitle} ${cutW.secondLine}，分差 ${cutW.gap}。` : "";
  return `${cut.firstTitle} ${cut.firstLine}，${cut.secondTitle} ${cut.secondLine}，分差 ${cut.gap}。${extra}${why}`;
}

function schoolLinesKpi(report, track = "li") {
  const cut = schoolCutoffView(report, track);
  if (!cut) return "";
  return `<div class="kpi school-cut-kpi">
      <div><span>${cut.firstTitle}</span><b>${cut.firstLine ?? "—"}</b></div>
      <div><span>${cut.secondTitle}</span><b>${cut.secondLine ?? "—"}</b></div>
      <div><span>校内线分差</span><b>${cut.gap}</b></div>
      <div><span>年级第一/第二差</span><b>${(report.split ? (track==="wen"?report.cutoffs?.wen:report.cutoffs?.li) : report.cutoffs?.mixed)?.topGap ?? "—"}</b></div>
    </div>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function examAiCacheKey(report, player) {
  return `${report?.date || ""}|${report?.examId || ""}|${player?.classNo}|${analysisScope(player)}`;
}


function provincialLineLabel(row, report) {
  const year = provincialCompareYear(report.date);
  const track = row.track === "wen" ? "wen" : "li";
  const lines = provincialLines(year, track, packOptsForReport(report));
  const first = provincialFirstShortLabel(year);
  const second = provincialSecondShortLabel(year);
  const max = row.maxTotal || 750;
  const total = max === 750 ? row.total : Math.round((row.total / max) * 750);
  if (total >= lines.first) return `省控${first}`;
  if (total >= lines.second) return `省控${second}`;
  return `未达省控${second}`;
}

function classPassSummary(report, classNo) {
  const cls = (report.classes || []).find((c) => c.classNo === classNo);
  const prov = classProvincialCounts(report, classNo);
  if (report.examKind === "gaokao") {
    const year = provincialCompareYear(report.date);
    const first = provincialFirstShortLabel(year);
    const second = provincialSecondShortLabel(year);
    const pack = officialProvincialPack(year, packOptsForReport(report));
    const kind = pack.simulated ? "模拟省控（模拟线，非正式官方省控）" : "公开省控";
    return `任教班省控${first} ${prov.firstN} 人、省控${second}累计 ${prov.secondN} 人；校内一本 ${cls?.firstCount ?? "—"} 人、校内二本累计 ${cls?.secondCount ?? "—"} 人。高考上线以${kind}为主，校内线只作对照。`;
  }
  return `任教班校内一本 ${cls?.firstCount ?? "—"} 人、校内二本累计 ${cls?.secondCount ?? "—"} 人；${describeClassProvincial(report, classNo)}。平时考试上线以校内对照为主，不是省控。`;
}

function viewGrades(host) {
  const report = currentReport();
  if (!report) {
    host.innerHTML = `<h3>考试成绩</h3><p>还没有考试。可用「下一阶段」跳到第一次月考。</p>`;
    return;
  }
  const mine = classStandings(report.rows || [], state.player.classNo, report);
  const track = report.split ? (mine[0]?.track === "wen" ? "wen" : "li") : "mixed";
  const note = examSourceNotice(report);
  const isHk = report.examKind === "huikao";
  const isGk = report.examKind === "gaokao";
  const isJoint = report.examKind === "city" || report.examKind === "province";
  const passN = isHk ? mine.filter((r)=>r.huikaoPass).length : null;
  const jointKpi = isJoint ? jointLinesBlock(report) : "";
  const gradeTrack = report.split ? (mine[0]?.track === "wen" ? "wen" : "li") : "mixed";
  const gradeCols = usesComprehensive(report.scale || report.grade, { scheme: report.scheme })
    ? displayScoreColumns(report.scale || report.grade, gradeTrack, report.subjectIds, { scheme: report.scheme })
    : [];
  const gradeColHead = gradeCols.map((c) => c.name);
  const gradeColCells = (r) => gradeCols.map((c) => `<td>${displayScoreCell(r, c)}</td>`).join("");
  const head = isHk ? ["班排","姓名","总分","同层次排","校排","校内合格"]
    : isJoint ? (report.examKind==="province" ? ["班排","姓名","总分", ...gradeColHead, "同层次排","校排","县位次","市位次","省位次","市上线","省上线"] : ["班排","姓名","总分", ...gradeColHead, "同层次排","校排","县位次","市位次","市上线","县上线"])
    : isGk ? ["班排","姓名","总分", ...gradeColHead, "同层次排","校排","省控上线","校内上线"]
    : ["班排","姓名","总分", ...gradeColHead, "同层次排","校排","校内上线"];
  const classRankCell = (r) => r.classRank ?? r.rank ?? "";
  const tierRankCell = (r) => r.tierRank ?? "—";
  const schoolRankCell = (r) => r.schoolRank ?? r.gradeRank ?? "—";
  const rowCells = (r) => {
    if (isHk) return `<td>${classRankCell(r)}</td><td>${r.name}</td><td>${r.total}</td><td>${tierRankCell(r)}</td><td>${schoolRankCell(r)}</td><td>${r.huikaoPass?"合格":"不合格"}</td>`;
    if (isJoint && report.examKind==="province") return `<td>${classRankCell(r)}</td><td>${r.name}</td><td>${r.total}</td>${gradeColCells(r)}<td>${tierRankCell(r)}</td><td>${schoolRankCell(r)}</td><td>${r.countyRank??"—"}</td><td>${r.cityRank??"—"}</td><td>${r.provinceRank??"—"}</td><td>${r.jointLine?.city||"—"}</td><td>${r.jointLine?.province||"—"}</td>`;
    if (isJoint) return `<td>${classRankCell(r)}</td><td>${r.name}</td><td>${r.total}</td>${gradeColCells(r)}<td>${tierRankCell(r)}</td><td>${schoolRankCell(r)}</td><td>${r.countyRank??"—"}</td><td>${r.cityRank??"—"}</td><td>${r.jointLine?.city||"—"}</td><td>${r.jointLine?.county||"—"}</td>`;
    if (isGk) return `<td>${classRankCell(r)}</td><td>${r.name}</td><td>${r.total}</td>${gradeColCells(r)}<td>${tierRankCell(r)}</td><td>${schoolRankCell(r)}</td><td>${provincialLineLabel(r, report)}</td><td>校内${r.line||""}</td>`;
    return `<td>${classRankCell(r)}</td><td>${r.name}</td><td>${r.total}</td>${gradeColCells(r)}<td>${tierRankCell(r)}</td><td>${schoolRankCell(r)}</td><td>${r.line||""}</td>`;
  };
  const actingHome = isActingHomeroom(state.player, state.player.classNo);
  const officialHome = isPlayerHomeroom(state.player, state.player.classNo);
  const godNote = actingHome && !officialHome
    ? `<p class="notice">上帝模式：当前按班主任身份查看本班考后分析。学校正式班主任仍是${escapeHtml(officialHomeroomName(state.player))}，任职与存档不会被改写。</p>`
    : "";
  const mainKpi = isJoint ? jointKpi
    : isHk ? `<div class="kpi"><div><span>试卷难度</span><b>${(report.difficulty||1).toFixed(3)}</b></div><div><span>班内校内合格</span><b>${passN} / ${mine.length}</b></div><div><span>合格标准</span><b>卷面 60%</b></div></div>`
    : isGk ? officialLinesBlock(report, track) + schoolLinesKpi(report, track) + `<p class="muted">${schoolLinesNote(report, track)}</p>`
    : `<div class="kpi"><div><span>试卷难度</span><b>${(report.difficulty||1).toFixed(3)}</b></div></div>` + schoolLinesKpi(report, track) + `<p class="notice">${schoolLinesNote(report, track)}</p>`;
  const payload = examAnalysisPayload(report);
  const dropIds = new Set(listScoreDropEntries(clsStudents(), cohortReports(), { seed: state.seed ?? 1, examId: report.examId }).map((e) => e.studentId));
  const named = (r) => `${r.name}${dropIds.has(r.studentId) ? '<span class="drop-flag">掉分</span>' : ""}`;
  const rowHtml = mine.map((r) => `<tr data-id="${r.studentId}">${rowCells(r).replace(`<td>${r.name}</td>`, `<td>${named(r)}</td>`)}</tr>`).join("");
  host.innerHTML = `<h3>考试成绩 · 任教班</h3>
    <div class="filters"><label>场次 <select id="exsel">${examOptions()}</select></label></div>
    ${godNote}
    ${clickStudentHint()}
    ${note?`<p class="notice">${note}</p>`:""}
    ${mainKpi}
    ${!isHk?`<p class="notice">${lineCompareNotice(report)}</p><p class="notice">${classPassSummary(report, state.player.classNo)}</p>`:""}
    ${isJoint?`<p class="muted">${schoolLinesNote(report, track)}</p>`:""}
    ${disciplineBoardHtml(report)}
    ${scoreDropBoardHtml({ exam: report, students: clsStudents() })}
    ${classScoreTrendPanelHtml()}
    <div class="paper"><table><thead><tr>${head.map((h)=>`<th>${h}</th>`).join("")}</tr></thead>
    <tbody>${rowHtml}</tbody></table></div>
    ${toppersPanelHtml(report, listExamReports(state, { entryYear: state.player.cohortYear }), { track })}
    ${examAiPanel(report)}`;
  host.querySelector("#exsel").onchange = (e) => { examPick = e.target.value; repaintViewOnly(); };
  bindExamAi(host, report, payload);
  bindToppersCharts(host, report, listExamReports(state, { entryYear: state.player.cohortYear }), { track, classNo: state.player.classNo });
  bindScoreTrendPanels(host);
}

function viewSettings(host) {
  const conf = loadAiSettings();
  const god = loadGodSettings();
  const officialName = officialHomeroomName(state.player);
  const keyHint = conf.hasKey ? `已保存密钥 ${maskApiKey(conf.apiKey)}。输入框留空再保存，会保留原密钥。` : "尚未保存密钥。";
  host.innerHTML = `<h3>设置</h3>
    <section class="settings-section" id="career-brief">
      <h4>任职说明</h4>
      <p class="notice">${escapeHtml(playerCareerBrief(state.player))}</p>
      <p class="muted">顶栏职务在转正时会改成「中学数学教师（已转正）」。转正不改变班主任或备课组长人选。</p>
    </section>
    <section class="settings-section" id="world-seed">
      <h4>本局世界编号</h4>
      <p class="notice">每次开始新学期会随机生成一套学生名单和考试结果。同一编号可以重开出同一局。</p>
      <p><code>${escapeHtml(String(state.seed))}</code></p>
    </section>
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

function examAnalysisPayload(report) {
  const prior = listExamReports(state, { entryYear: state.player.cohortYear });
  return buildExamAnalysisPayload(report, {
    player: state.player,
    classNo: state.player.classNo,
    reports: prior,
    previousReports: prior,
  });
}

function cachedAiComments(report) {
  const raw = examAiCache.get(examAiCacheKey(report, state.player));
  if (raw == null || raw === "") return emptyAiCommentary();
  return parseAiCommentary(raw).comments;
}

function fillAiNotes(root, comments) {
  const c = comments || emptyAiCommentary();
  root.querySelectorAll("[data-ai-note]").forEach((el) => {
    const text = String(c[el.dataset.aiNote] || "").trim();
    el.textContent = text;
    el.hidden = !text;
  });
}

function signedDelta(n) {
  if (n == null || Number.isNaN(n)) return "—";
  if (n === 0) return "持平";
  return `${n > 0 ? "+" : ""}${n}`;
}

function examShortLabel(date, name) {
  const d = String(date || "").slice(5);
  const n = String(name || "").replace(/普通/, "").replace(/考试/, "").slice(0, 8);
  return d ? `${d} ${n}` : n;
}

function talkListHtml(lists) {
  const blocks = [
    ["进步较大", lists?.进步较大],
    ["退步较大", lists?.退步较大],
    ["临近校内或省控线", lists?.临近校内或省控线],
    ["排名波动较大", lists?.排名波动较大],
  ];
  const parts = blocks.map(([title, arr]) => {
    if (!arr || !arr.length) return "";
    const items = arr.map((x) => `<li><button type="button" class="linkish" data-ai-stu-name="${escapeHtml(x.姓名)}">${escapeHtml(x.姓名)}</button>：${escapeHtml(x.原因 || "")}</li>`).join("");
    return `<h6>${title}</h6><ul class="exam-ai-talk">${items}</ul>`;
  }).filter(Boolean);
  return parts.join("") || `<p class="muted">这一场没有单独列出谈话对象。</p>`;
}

function examAiDeltaRows(model, filter) {
  const rows = model.students || [];
  if (filter && filter !== "全部") return rows.filter((s) => s.分组 === filter);
  return rows;
}

function paintExamAiCharts(host, report, payload) {
  const model = payload?.chart;
  if (!model?.ok) return;
  const trend = model.trend || [];
  const labels = trend.map((p) => examShortLabel(p.date, p.name));
  const q = (id) => host.querySelector(id);
  if (q("#ai-ch-avg") && trend.length) {
    const series = [{ name: "班级折合750均分", values: trend.map((p) => p.折合750均分), color: "#c45c4a" }];
    if (model.scope === "subject" && trend.some((p) => p.单科均分 != null)) {
      series.push({ name: `${model.subjectName}均分`, values: trend.map((p) => p.单科均分), color: "#3d6b5a" });
    }
    drawLineChart(q("#ai-ch-avg"), { labels, yLabel: "折合分", series });
  }
  if (q("#ai-ch-rank") && trend.length) {
    drawLineChart(q("#ai-ch-rank"), {
      labels,
      yInvert: true,
      yMin: 1,
      yLabel: "名次",
      series: [{ name: "班级均校排", values: trend.map((p) => p.均校排), color: "#3d5c6b" }],
    });
  }
  if (q("#ai-ch-subj") && model.weakSubjects.length) {
    drawBarChart(q("#ai-ch-subj"), {
      labels: model.weakSubjects.map((w) => w.科目),
      values: model.weakSubjects.map((w) => w.本班均分),
      yLabel: "均分",
    });
  }
  if (q("#ai-ch-delta")) {
    if (model.hasPrevious) {
      drawBarChart(q("#ai-ch-delta"), {
        labels: ["进步", "退步", "持平"],
        values: [model.counts.进步 || 0, model.counts.退步 || 0, model.counts.持平 || 0],
        colors: ["#3d6b5a", "#c45c4a", "#8b5e3c"],
        yLabel: "人数",
      });
    } else if (model.bands.length) {
      drawBarChart(q("#ai-ch-delta"), {
        labels: model.bands.map((b) => String(b.分段).replace("校排 ", "")),
        values: model.bands.map((b) => b.人数),
        yLabel: "人数",
      });
    }
  }
  if (q("#ai-ch-bands") && model.bands.length && model.hasPrevious) {
    drawBarChart(q("#ai-ch-bands"), {
      labels: model.bands.map((b) => String(b.分段).replace("校排 ", "")),
      values: model.bands.map((b) => b.人数),
      yLabel: "人数",
    });
  }
}

function paintExamAiStudent(host, studentId, name) {
  const block = host.querySelector("#ai-stu-block");
  if (!block) return;
  if (!studentId && !name) { block.hidden = true; return; }
  const stu = studentId
    ? findStudentInState(state, studentId)
    : (playerStudents(state).find((s) => s.name === name) || null);
  const id = stu?.id || studentId;
  if (!id) { block.hidden = true; return; }
  examAiFocusId = id;
  const hist = studentExamHistory(state, id);
  const title = host.querySelector("#ai-stu-title");
  if (title) title.textContent = `${stu?.name || name || "该生"}的成绩曲线`;
  block.hidden = false;
  if (!hist.length) return;
  const labels = hist.map((h) => examShortLabel(h.date, h.examName));
  requestAnimationFrame(() => {
    const score = host.querySelector("#ai-ch-stu");
    const ranks = host.querySelector("#ai-ch-stu-rank");
    if (score) {
      drawLineChart(score, {
        labels,
        yLabel: "折合分",
        series: [
          { name: "折合 750", values: hist.map((h) => h.scaled750), color: "#c45c4a" },
          { name: "原始总分", values: hist.map((h) => h.total), color: "#8b5e3c" },
        ],
      });
    }
    if (ranks) {
      drawLineChart(ranks, {
        labels,
        yInvert: true,
        yMin: 1,
        yLabel: "名次",
        series: [
          { name: "班排", values: hist.map((h) => h.classRank), color: "#c45c4a" },
          { name: "同层次排", values: hist.map((h) => h.tierRank), color: "#3d6b5a" },
          { name: "校排", values: hist.map((h) => h.schoolRank), color: "#3d5c6b" },
        ],
      });
    }
  });
}

function applyExamAiFilter(host, model, filter) {
  examAiDeltaFilter = filter || "全部";
  host.querySelectorAll("[data-ai-filter]").forEach((b) => b.classList.toggle("on", b.dataset.aiFilter === examAiDeltaFilter));
  const tbody = host.querySelector("#ai-delta-body");
  if (!tbody) return;
  tbody.innerHTML = examAiDeltaRows(model, examAiDeltaFilter).map((s) => {
    const cls = s.分组 === "进步" ? "up" : s.分组 === "退步" ? "down" : "";
    return `<tr data-ai-stu="${escapeHtml(s.学生 || "")}" data-ai-name="${escapeHtml(s.姓名)}" class="${cls}">
      <td>${escapeHtml(s.姓名)}</td>
      <td>${s.本场分数 ?? "—"}</td>
      <td>${signedDelta(s.分数差)}${s.分数差说明 === "折合750" ? "<span class=\"muted\">折</span>" : ""}</td>
      <td>${s.本场校排 ?? "—"}</td>
      <td>${signedDelta(s.校排变化)}</td>
      <td>${s.本场班排 ?? "—"}</td>
      <td>${signedDelta(s.班排变化)}</td>
      <td>${s.分组}</td>
    </tr>`;
  }).join("") || `<tr><td colspan="8">${model.hasPrevious ? "这一组没有同学。" : "这一场没有先前对照，不虚构进退步。"}</td></tr>`;
}

function bindExamAi(host, report, payload) {
  const btn = host.querySelector("#ai-run");
  const status = host.querySelector("#ai-status");
  if (!host.querySelector("#ai-charts")) return;
  const setStatus = (text, kind) => {
    if (!status) return;
    if (!text) { status.hidden = true; status.textContent = ""; status.className = "notice"; return; }
    status.hidden = false;
    status.className = kind === "err" ? "notice exam-ai-err" : "notice";
    status.textContent = text;
  };
  const model = payload?.chart;
  fillAiNotes(host, cachedAiComments(report));
  requestAnimationFrame(() => paintExamAiCharts(host, report, payload));
  if (model?.ok) {
    const allowed = examAiDeltaFilter === "全部" || (model.counts[examAiDeltaFilter] || 0) > 0;
    applyExamAiFilter(host, model, allowed ? examAiDeltaFilter : "全部");
  }
  host.querySelectorAll("[data-ai-filter]").forEach((b) => {
    b.onclick = () => { if (model?.ok) applyExamAiFilter(host, model, b.dataset.aiFilter); };
  });
  const onPick = (id, name) => paintExamAiStudent(host, id, name);
  host.addEventListener("click", (e) => {
    const tr = e.target.closest("tr[data-ai-stu]");
    if (tr && host.contains(tr)) {
      onPick(tr.dataset.aiStu, tr.dataset.aiName);
      return;
    }
    const named = e.target.closest("[data-ai-stu-name]");
    if (named && host.contains(named)) onPick("", named.dataset.aiStuName);
  });
  const profileBtn = host.querySelector("#ai-stu-profile");
  if (profileBtn) {
    profileBtn.onclick = () => {
      if (!examAiFocusId) return;
      selectedId = examAiFocusId;
      view = "profile";
      render();
    };
  }
  if (examAiFocusId) paintExamAiStudent(host, examAiFocusId, "");
  if (!btn) return;
  btn.onclick = async () => {
    if (examAiBusy) return;
    const conf = loadAiSettings();
    if (!conf.hasKey) {
      setStatus("还没有填写 API 密钥。请到「设置」里填写后，再生成短评。图表和进退步列表已经按本页成绩算好，不必先填密钥。", "err");
      return;
    }
    const pack = payload?.ok ? payload : examAnalysisPayload(report);
    if (!pack.ok) { setStatus(pack.reason, "err"); return; }
    examAiBusy = true;
    btn.disabled = true;
    setStatus("正在生成短评…", "ok");
    try {
      const r = await requestExamAnalysis(pack, { settings: conf });
      if (!r.ok) { setStatus(r.reason, "err"); return; }
      examAiCache.set(examAiCacheKey(report, state.player), r.text);
      fillAiNotes(host, r.commentary || parseAiCommentary(r.text).comments);
      setStatus("短评只写在各图旁边。分数、排名和上线人数以本页表格和图表为准，不会被改写。", "ok");
    } finally {
      examAiBusy = false;
      btn.disabled = false;
    }
  };
}

function examAiPanel(report) {
  const p = state.player;
  const official = isPlayerHomeroom(p, p.classNo);
  const acting = isActingHomeroom(p, p.classNo);
  const sub = playerSubjectName(p);
  const officialName = officialHomeroomName(p);
  const scopeText = official
    ? "你现在是本班班主任，可以看全班总分、均分、校内线与对照省控、班/层/校排和跨层次排、排名分布，以及各门单科。"
    : acting
      ? `当前为上帝模式查看：按本班班主任身份看全班总分、均分、校内线与对照省控、班/层/校排和跨层次排、排名分布，以及各门单科。学校正式班主任仍是${officialName}，任职与存档不会被改写。`
      : `你现在是本班${sub}任课老师，不是班主任，图表以本班${sub}为主（整体排名只作背景）。可在「设置」的上帝模式里临时按班主任范围查看全班；若以后正式接任班主任，这里会自动改为可看全班整体。`;
  const payload = examAnalysisPayload(report);
  if (!payload.ok) {
    return `<div class="paper exam-ai">
      <h4>考后分析</h4>
      <p class="muted">${scopeText}</p>
      <p class="notice">${escapeHtml(payload.reason || "这场考试暂时不能做图表解析。")}</p>
    </div>`;
  }
  const model = payload.chart;
  const comments = cachedAiComments(report);
  const filters = ["全部", "进步", "退步", "持平", "无对照"]
    .filter((k) => k === "全部" || (model.counts[k] || 0) > 0)
    .map((k) => `<button type="button" data-ai-filter="${k}">${k}${k === "全部" ? "" : ` ${model.counts[k] || 0}`}</button>`)
    .join("");
  const weak = (model.weakSubjects || []).map((w) => `<li>${escapeHtml(w.说明)}</li>`).join("");
  const deltaTitle = model.hasPrevious ? "进退步人数" : (model.bands.length ? "校排分段人数" : "进退步人数");
  const showBands = model.hasPrevious && model.bands.length;
  return `<div class="paper exam-ai" data-payload-ok="1">
    <h4>考后分析</h4>
    <p class="muted">${scopeText} 进退步、走势和薄弱点都按已算好的成绩画图，不填密钥也能先看。点「生成分析」只补各块短评，不会改分数、排名或上线人数。第一场或没有先前成绩时不会虚构进退步。可点同学看个人曲线。</p>
    <div class="row-actions"><button type="button" class="accent" id="ai-run">生成分析</button></div>
    <p class="notice" id="ai-status" hidden></p>
    <div class="exam-ai-charts" id="ai-charts">
      <p class="exam-ai-note" data-ai-note="总评">${comments.总评 ? escapeHtml(comments.总评) : ""}</p>
      <section class="exam-ai-block">
        <h5>各同学进退步</h5>
        <p class="exam-ai-note" data-ai-note="进退步">${comments.进退步 ? escapeHtml(comments.进退步) : ""}</p>
        <p class="muted">${escapeHtml(model.进退步说明 || "")}</p>
        <div class="exam-ai-filters">${filters}</div>
        <div class="scroll-table exam-ai-table"><table>
          <thead><tr><th>姓名</th><th>本场</th><th>分差</th><th>校排</th><th>校排变</th><th>班排</th><th>班排变</th><th>分组</th></tr></thead>
          <tbody id="ai-delta-body"></tbody>
        </table></div>
      </section>
      <section class="exam-ai-block">
        <h5>多次考试走势</h5>
        <p class="exam-ai-note" data-ai-note="走势">${comments.走势 ? escapeHtml(comments.走势) : ""}</p>
        ${trendChartsHtml(model)}
      </section>
      <section class="exam-ai-block">
        <h5>薄弱点与分布</h5>
        <p class="exam-ai-note" data-ai-note="薄弱点">${comments.薄弱点 ? escapeHtml(comments.薄弱点) : ""}</p>
        ${weak ? `<ul class="exam-ai-weak">${weak}</ul>` : `<p class="muted">没有可对比的单科均分。</p>`}
        <div class="charts">
          ${model.weakSubjects.length ? `<div class="chart-card"><h4>单科均分</h4><canvas id="ai-ch-subj" width="640" height="200"></canvas></div>` : ""}
          ${(model.hasPrevious || model.bands.length) ? `<div class="chart-card"><h4>${deltaTitle}</h4><canvas id="ai-ch-delta" width="640" height="200"></canvas></div>` : ""}
          ${showBands ? `<div class="chart-card"><h4>校排分段人数</h4><canvas id="ai-ch-bands" width="640" height="200"></canvas></div>` : ""}
        </div>
      </section>
      <section class="exam-ai-block">
        <h5>建议谈话</h5>
        <p class="exam-ai-note" data-ai-note="建议谈话">${comments.建议谈话 ? escapeHtml(comments.建议谈话) : ""}</p>
        ${talkListHtml(model.建议谈话)}
      </section>
      <section class="exam-ai-block" id="ai-stu-block" hidden>
        <div class="exam-ai-stu-head">
          <h5 id="ai-stu-title">学生曲线</h5>
          <button type="button" id="ai-stu-profile">查看档案</button>
        </div>
        <div class="charts">
          <div class="chart-card"><h4>折合 750 分走势</h4><canvas id="ai-ch-stu" width="640" height="230"></canvas></div>
          <div class="chart-card"><h4>班排 / 同层次排 / 校排</h4><canvas id="ai-ch-stu-rank" width="640" height="230"></canvas></div>
        </div>
      </section>
    </div>
  </div>`;
}

function trendChartsHtml(model) {
  const trend = model.trend || [];
  if (!trend.length) return `<p class="muted">还没有可画走势的已结算考试。</p>`;
  const note = trend.some((p) => p.满分 === 950) && trend.some((p) => p.满分 === 750)
    ? `<p class="muted">高一 950 与后续 750 用折合 750 分对照，不把原始分直接相减。</p>`
    : "";
  return `${note}<div class="charts">
    <div class="chart-card"><h4>班级均分走势（折合 750 分）</h4><canvas id="ai-ch-avg" width="640" height="230"></canvas></div>
    <div class="chart-card"><h4>班级均校排走势（名次在上为靠前）</h4><canvas id="ai-ch-rank" width="640" height="230"></canvas></div>
  </div>`;
}

function viewOffice(host) {
  const all = listExamReports(state);
  if (!all.length) {
    host.innerHTML = `<h3>教务处</h3>
      ${officeCollabHtml()}
      <p class="muted">全校成绩要等第一次考试结算之后才会出现在这里。办公室坐班、班主任通报、备课请教和听课现在就可以做。</p>`;
    bindOfficeActions(host);
    bindParentActions(host);
    return;
  }
  const first = hydrateReport(pickExamReport(all, examPick, { preferEntryYear: state.player.cohortYear }) || all[0]);
  examPick = examReportKey(first);
  const tiers = [["all","全部层次"],["yunxiu_exp","云岫实验 0/1"],["yunxiu_key","云岫重点 2—4"],["lingxiao","凌霄"],["zhuoxing","卓行"],["duxue","笃学"],["yiti","艺体"],["fuzhuo","补习班"]];
  const reuseShell = host.dataset.paint === "office" && host.querySelector("#office-body") && host.querySelector("#exsel");
  if (!reuseShell) {
    const tracks = first.split ? [["all","文理全部"],["li","理科"],["wen","文科"]] : [["all","未分科"]];
    host.dataset.paint = "office";
    host.innerHTML = `<h3>教务处 · 全校成绩</h3>
    ${officeCollabHtml()}
    ${clickStudentHint()}
    <div class="filters">
      <label>场次 <select id="exsel">${all.map((e)=>{const v=examReportKey(e); return `<option value="${v}" ${v===examPick?"selected":""}>${e.date} ${e.examName} · ${e.entryYear}级高${e.grade}</option>`;}).join("")}</select></label>
      <label>层次 <select id="tier">${tiers.map(([v,n])=>`<option value="${v}">${n}</option>`).join("")}</select></label>
      <label>科类 <select id="track">${tracks.map(([v,n])=>`<option value="${v}">${n}</option>`).join("")}</select></label>
    </div>
    <div id="office-body"></div>`;
    host.querySelector("#exsel").onchange = () => { examPick = host.querySelector("#exsel").value; viewOffice(host); };
    host.querySelector("#tier").onchange = () => viewOffice(host);
    host.querySelector("#track").onchange = () => viewOffice(host);
    bindOfficeActions(host);
    bindParentActions(host);
  } else {
    const sel = host.querySelector("#exsel");
    if (sel && sel.value !== examPick) sel.value = examPick;
  }
  const draw = () => {
    const reports = listExamReports(state);
    const live = hydrateReport(pickExamReport(reports, examPick, { preferEntryYear: state.player.cohortYear }) || reports[0]);
    examPick = examReportKey(live);
    const trackSel = host.querySelector("#track");
    const tracks = live.split ? [["all","文理全部"],["li","理科"],["wen","文科"]] : [["all","未分科"]];
    if (trackSel) {
      const prev = trackSel.value;
      const keepTier = host.querySelector("#tier")?.value;
      trackSel.innerHTML = tracks.map(([v,n])=>`<option value="${v}">${n}</option>`).join("");
      trackSel.value = tracks.some(([v]) => v === prev) ? prev : "all";
      void keepTier;
    }
    const tier = host.querySelector("#tier").value;
    const track = host.querySelector("#track").value;
    const cutTrack = live.split ? (track === "wen" ? "wen" : "li") : "mixed";
    const board = officeBoard(live, reports, { tier, track });
    const rows = board.rows;
    const classTable = board.classTable;
    const body = host.querySelector("#office-body");
    const subjects = live.subjectIds || [];
    const toppers = live.toppers || {};
    const scope = tier==="all" ? (track==="wen"?"wen":track==="li"?"li":"all") : tier;
    const topSet = toppers[scope] || toppers.all || {};
    const colTrack = track === "wen" ? "wen" : track === "li" ? "li" : "all";
    const scoreCols = displayScoreColumns(live.scale || live.grade, colTrack === "all" ? "mixed" : colTrack, subjects, { scheme: live.scheme });
    const topLine = formatToppersLine(topSet, subjects, live.scale || live.grade, rows, colTrack, { scheme: live.scheme });
    const isHk = live.examKind === "huikao";
    const isGk = live.examKind === "gaokao";
    const isJoint = live.examKind === "city" || live.examKind === "province";
    const gkYear = isGk ? provincialCompareYear(live.date) : 0;
    const classHead = isGk
      ? ["班","层次","科类","人数","均分","最高",`省控${provincialFirstShortLabel(gkYear)}`,`省控${provincialSecondShortLabel(gkYear)}累计`,"校内一本","校内二本累计"]
      : ["班","层次","科类","人数","均分","最高","校内一本","校内一本率","校内二本累计"];
    const classCells = (c) => {
      const tr = classTrackLabel(live.scheme, c.track === "wen" ? "wen" : c.track === "li" ? "li" : "mixed");
      if (isGk) return `<td>${c.name||c.classNo+"班"}</td><td>${c.tier}</td><td>${tr}</td><td>${c.count}</td><td>${c.avg}</td><td>${c.max}</td><td>${c.provFirst}</td><td>${c.provSecond}</td><td>${c.firstCount}</td><td>${c.secondCount}</td>`;
      return `<td>${c.name||c.classNo+"班"}</td><td>${c.tier}</td><td>${tr}</td><td>${c.count}</td><td>${c.avg}</td><td>${c.max}</td><td>${c.firstCount}</td><td>${c.firstRate}%</td><td>${c.secondCount}</td>`;
    };
    const mainKpi = isHk
      ? `<div class="kpi"><div><span>校内合格标准</span><b>卷面 60%</b></div><div><span>合格人数</span><b>${(live.rows||[]).filter((r)=>!r.repeat && r.huikaoPass).length}</b></div></div>`
      : isJoint
        ? jointLinesBlock(live) + `<p class="muted">${schoolLinesNote(live, cutTrack)}</p>`
        : isGk
          ? officialLinesBlock(live, cutTrack) + schoolLinesKpi(live, cutTrack) + `<p class="muted">${schoolLinesNote(live, cutTrack)}</p>`
          : `<div class="kpi"><div><span>试卷难度</span><b>${(live.difficulty||1).toFixed(3)}</b></div></div>` + schoolLinesKpi(live, cutTrack) + `<p class="notice">${schoolLinesNote(live, cutTrack)}</p>`;
    const lineHead = isGk ? "<th>省控上线</th><th>校内上线</th>" : `<th>${live.examKind==="province"?"省位次":live.examKind==="city"?"市位次":"校内上线"}</th>`;
    const lineCells = (r) => {
      if (isGk) return `<td>${provincialLineLabel(r, live)}</td><td>校内${r.line||""}</td>`;
      if (live.examKind==="province") return `<td>${r.provinceRank??"—"}</td>`;
      if (live.examKind==="city") return `<td>${r.cityRank??"—"}</td>`;
      return `<td>${r.line||""}</td>`;
    };
    const seniorCut = live.grade >= 3 || live.cutoffs?.includeRepeat;
    const ordinaryCutNote = seniorCut
      ? "平时考试没有国家线，校内线按该科类应届与补习班同一池约第 520、第 1100 名划，只作校内对照，不是省控。"
      : "平时考试没有国家线，校内线按本年级应届池比例折算，不能套用高三的第 520、第 1100 名，只作校内对照，不是省控。";
    body.innerHTML = `
      <p class="notice">难度 ${(live.difficulty||1).toFixed(3)}　离散 ${(live.dispersion||1).toFixed(3)}。${isJoint?"市/省/县线由模拟考生池位次算出，校内线只作校内对照。":isGk?"高考上线以公开省控（国家线）为主，校内线只作对照。":ordinaryCutNote}班级汇总全部由个人成绩加总，不另造统计。${examSourceNotice(live)?" "+examSourceNotice(live):""}</p>
      ${isHk?"":`<p class="notice">${lineCompareNotice(live, state.player.classNo)}</p>`}
      ${mainKpi}
      <p class="notice">${topLine}</p>
      ${disciplineBoardHtml(live)}
      ${scoreDropBoardHtml({ exam: live, students: clsStudents() })}
      ${classScoreTrendPanelHtml()}
      <h3>各班对照</h3>
      ${board.addedRepeat ? `<p class="muted">同日高三补习班已列入本表，成绩来自这场考试的高三场次。</p>` : ""}
      <div class="paper"><table><thead><tr>${classHead.map((h)=>`<th>${h}</th>`).join("")}</tr></thead>
      <tbody>${classTable.map((c)=>`<tr>${classCells(c)}</tr>`).join("")}</tbody></table></div>
      <h3>学生总分与单科（当前筛选 ${rows.length} 人）</h3>
      ${rows.length === 0 && tier === "fuzhuo" ? `<p class="muted">这场考试还没有同日高三的补习班成绩。等该日高三场次结算后会一并列入。</p>` : ""}
      <div class="paper"><table><thead><tr><th>筛选名次</th><th>姓名</th><th>班级</th><th>总分</th><th>${scoreCols.map(c=>c.name).join("</th><th>")}</th>${lineHead}${isJoint?`<th>${live.examKind==="province"?"市位次":"县位次"}</th>${live.examKind==="province"?"<th>县位次</th>":""}<th>市上线</th>`:""}${live.examKind==="province"?"<th>省上线</th>":""}</tr></thead>
      <tbody>${rows.slice(0,400).map((r)=>`<tr data-id="${r.studentId}"><td>${r.rank}</td><td>${r.name}</td><td>${r.classNo}班</td><td>${r.total}</td>${scoreCols.map(c=>`<td>${displayScoreCell(r,c)}</td>`).join("")}${lineCells(r)}${isJoint?`<td>${live.examKind==="province"?(r.cityRank??"—"):(r.countyRank??"—")}</td>${live.examKind==="province"?`<td>${r.countyRank??"—"}</td>`:""}<td>${r.jointLine?.city||"—"}</td>`:""}${live.examKind==="province"?`<td>${r.jointLine?.province||"—"}</td>`:""}</tr>`).join("")}</tbody></table>
      ${rows.length>400?`<p class='muted'>名单较长，这里先列出前 400 人。请用层次或科类筛选查看其余 ${rows.length-400} 人。点击姓名可看该生档案曲线。</p>`:""}</div>`;
      /* 点行进档案由 #view 委托处理 */
    bindScoreTrendPanels(host);
  };
  draw();
}

let admissionPick = "";
let admissionFilter = { classNo: "all", tier: "all", track: "all", query: "" };

function viewAdmission(host) {
  const keys = Object.keys(state.admissions||{}).sort().reverse();
  if (!keys.length) { host.innerHTML = "<h3>录取去向</h3><p>还没有走完高考录取。可用自动模式跳到本届高考。</p>"; return; }
  if (!admissionPick || !state.admissions[admissionPick]) admissionPick = keys[0];
  const pack = state.admissions[admissionPick];
  const list = enrichAdmissionResults(pack.results || [], studentsForAdmissionYear(state, pack.entryYear));
  const classNos = admissionClassOptions(list);
  if (admissionFilter.classNo !== "all" && !classNos.some((n) => Number(n) === Number(admissionFilter.classNo))) {
    admissionFilter = { ...admissionFilter, classNo: "all" };
  }
  const opts = keys.map((k) => {
    const p = state.admissions[k];
    const mine = p.entryYear === state.player.cohortYear ? "（你带的这届）" : "";
    return `<option value="${k}" ${k===admissionPick?"selected":""}>${p.year}年 · ${p.entryYear}级${mine}</option>`;
  }).join("");
  const picker = keys.length > 1 ? `<div class="filters"><label>查看届次 <select id="adm-year">${opts}</select></label></div>` : "";
  const classOpts = [["all","全部班级"], ...classNos.map((n) => [n, `${n}班`])]
    .map(([v,n]) => `<option value="${v}" ${String(v)===String(admissionFilter.classNo)?"selected":""}>${n}</option>`).join("");
  const tierOpts = ADMISSION_TIER_FILTERS.map(([v,n]) => `<option value="${v}" ${v===admissionFilter.tier?"selected":""}>${n}</option>`).join("");
  const trackOpts = ADMISSION_TRACK_FILTERS.map(([v,n]) => `<option value="${v}" ${v===admissionFilter.track?"selected":""}>${n}</option>`).join("");
  host.innerHTML = `<h3>${pack.year}年高考录取（${pack.entryYear}级）</h3>
    <p class="notice">${describeAdmissionContext(state, pack)}</p>
    ${picker}
    <p class="notice">对照江西${pack.year}年${officialProvincialPack(pack.year, { seed: state.seed }).simulated ? "模拟省控（模拟线，非正式官方省控）" : "公开省控线"}。院校投档与省位次以 2020 年公开投档线和一分一段为底；其他年份按当年与 2020 年省控分差平移，表格中会标明，不是当年完整投档表或一分一段。艺体生目前只对照文化课成绩，尚未收录术科专业分，不编造术科分。师范意向只影响在已有院校池中的匹配偏好，没有单独的师范提前批投档表。不随机派校名，也不为喜报虚造清北。</p>
    <p class="notice">${describeOfficialProvincialLines(pack.year, ["li", "wen"], { seed: state.seed })}</p>
    ${(() => {
      const lp = officialProvincialPack(pack.year, { seed: state.seed });
      const liL = lp.trackLabel.li;
      const wenL = lp.trackLabel.wen;
      const kind = lp.simulated ? "模拟省控" : "公开省控";
      return `${lp.simulated ? `<p class="notice warn">模拟线，非正式官方省控。</p>` : ""}<div class="kpi" id="adm-official-kpi">
      <div><span>${pack.year}年${kind}${liL}${lp.firstLabel}</span><b>${lp.li.first}</b></div>
      <div><span>${kind}${liL}${lp.secondLabel}</span><b>${lp.li.second}</b></div>
      <div><span>${lp.simulated ? "模拟线分差" : "国家线分差"}</span><b>${lp.li.gap}</b></div>
      ${lp.li.ranks ? `<div><span>${liL}${lp.firstLabel}全省位次</span><b>前 ${lp.li.ranks.firstN}</b></div>` : ""}
    </div>
    <p class="muted">${wenL}${lp.firstLabel} ${lp.wen.first}、${lp.secondLabel} ${lp.wen.second}，分差 ${lp.wen.gap}。</p>`;
    })()}
    <div class="filters">
      <label>班级 <select id="adm-class">${classOpts}</select></label>
      <label>层次 <select id="adm-tier">${tierOpts}</select></label>
      <label>科类 <select id="adm-track">${trackOpts}</select></label>
      <input id="q" placeholder="搜索姓名、大学或专业" />
    </div>
    <div class="kpi" id="adm-count-kpi"></div>
    <p class="notice">顶部${officialProvincialPack(pack.year, { seed: state.seed }).simulated ? "模拟省控（模拟线，非正式官方省控）" : "公开省控"}数字${officialProvincialPack(pack.year, { seed: state.seed }).simulated ? "按规则生成" : "是官方口径"}，不随筛选变化。下列清北、上线、补录和公布人数按当前班级、层次、科类和搜索统计。未筛选时，公布人数是本届应届与复读全员（含专科及未达专科线），不是本科以上人数。上线人数按江西${pack.year}年${officialProvincialPack(pack.year, { seed: state.seed }).simulated ? "模拟省控（模拟线，非正式官方省控）" : "公开省控（国家线）"}统计，不是校内线。「一批（省控）」只计分数达到当年一本省控（公开线或标明的模拟线）的人；「一本补录」是离一本线很近的二本可能被弱一本院校的冷门专业征集，属于校内规则示意，不是官方征集名单，也不计入省控一本上线人数。</p>
    <div class="paper" id="adm-table"></div>`;
  const yearSel = host.querySelector("#adm-year");
  if (yearSel) yearSel.onchange = () => { admissionPick = yearSel.value; repaintViewOnly(); };
  const qInput = host.querySelector("#q");
  if (qInput) qInput.value = admissionFilter.query || "";
  const draw = () => {
    admissionFilter = {
      classNo: host.querySelector("#adm-class").value,
      tier: host.querySelector("#adm-tier").value,
      track: host.querySelector("#adm-track").value,
      query: host.querySelector("#q").value || "",
    };
    const rows = filterAdmissionResults(list, admissionFilter);
    const kpi = admissionCountKpis(rows);
    const lpK = officialProvincialPack(pack.year, { seed: state.seed });
    const firstKpi = "一批（省控）";
    const secondKpi = "二本以上（省控）";
    const suppKpi = "一本补录";
    host.querySelector("#adm-count-kpi").innerHTML = `<div><span>清北</span><b>${kpi.qingbei}</b></div><div><span>${firstKpi}</span><b>${kpi.first}</b></div><div><span>${suppKpi}</span><b>${kpi.supplement}</b></div><div><span>${secondKpi}</span><b>${kpi.second}</b></div><div><span>公布人数</span><b>${kpi.published}</b></div>`;
    const table = host.querySelector("#adm-table");
    if (!rows.length) {
      table.innerHTML = `<p class="muted">没有符合当前筛选的录取记录。可改班级、层次、科类或清空搜索再试。</p>`;
      return;
    }
    const shown = rows.slice(0, ADMISSION_TABLE_LIMIT);
    const rest = rows.length - shown.length;
    table.innerHTML = `<table><thead><tr><th>姓名</th><th>班</th><th>科类</th><th>总分</th><th>省位次</th><th>批次</th><th>专业</th><th>去向</th></tr></thead>
      <tbody>${shown.map((a)=>`<tr><td>${a.name}</td><td>${a.classNo}</td><td>${a.track==="wen"?"文":"理"}</td><td>${a.total}</td><td>${a.provinceRank??"—"}</td><td>${formatAdmissionBatch(a)}</td><td>${a.major||"—"}</td><td>${formatAdmissionDest(a)}</td></tr>`).join("")}</tbody></table>
      ${rest>0?`<p class='muted'>名单较长，这里先列出前 ${ADMISSION_TABLE_LIMIT} 人，其余 ${rest} 人未列出。请再用班级、层次、科类或搜索缩小范围。</p>`:""}`;
  };
  host.querySelector("#adm-class").onchange = draw;
  host.querySelector("#adm-tier").onchange = draw;
  host.querySelector("#adm-track").onchange = draw;
  host.querySelector("#q").oninput = draw;
  draw();
}

function viewAuto(host) {
  host.innerHTML = `<h3>自动模式</h3>
    <p class="notice">不必亲自备课上课，也可按考试阶段推进。跳过时仍会走完校历、生成该次真实成绩与排名，并写入存档。第一届高考、录取、毕业后游戏继续：学生离校或进入补习班，低年级升级，新高一入学。</p>
    <div class="row-actions">
      <button type="button" class="accent" id="n1">下一阶段</button>
      <button type="button" id="n1y">下一学年</button>
      <button type="button" id="n2">跳到本届高考录取</button>
      <button type="button" id="n3">再推进到下一届入学</button>
    </div>
    <p class="notice" id="auto-msg">当前 ${formatDateCn(state.date)}。${describePlayerStage(state)}${(() => { const g = gradeOf(state.player.cohortYear, state.date); return g >= 1 && g <= 3 ? "，尚未走完这届高考。" : "。"; })()}下一阶段会写明是哪一届的什么事，避免把其他年级的高考当成你带的班。下一学年会连续结算考试和分班，停在该届高二或高三开学日，不会改成下一届入学。</p>`;
  host.querySelector("#n1").onclick = () => handleAct("skip");
  host.querySelector("#n1y").onclick = () => handleAct("skip-year");
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
  const calEvents = SCHOOL_CALENDAR.filter((e) => e.date >= state.date).concat(upcomingOpenClasses(state.date, 8)).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const upcoming = calEvents.slice(0, 16);
  const cal = upcoming.map((e) => {
    const tag = e.kind === "openClass" ? "（校内公开课）" : (e.kind === "exam" ? "（校内考务安排）" : (e.kind === "activity" ? "（学校活动，校内安排）" : (e.kind === "parents" ? "（校内安排）" : "")));
    return `<div class="log-item"><b>${e.date}</b> ${e.name}${tag}</div>`;
  }).join("");
  const qualityMinutes = (state.qualityMeetings || []).map((m) => `<div class="log-item"><b>${m.date}</b> ${m.examName || "质量分析会"}　${m.minutes}</div>`);
  const groupMinutes = (state.groupPreps || []).map((m) => `<div class="log-item"><b>${m.date}</b> 集体备课${m.topic ? "「" + m.topic + "」" : ""}　${m.minutes}</div>`);
  const openingMinutes = (state.openingDays || []).map((m) => `<div class="log-item"><b>${m.date}</b> ${m.kindName || "开学安排"}　${m.minutes}</div>`);
  const studyHallMinutes = (state.studyHalls || []).map((m) => `<div class="log-item"><b>${m.date}</b> 自习看班${m.slotLabel ? "「" + m.slotLabel + "」" : ""}　${m.minutes}</div>`);
  const weekendHwMinutes = (state.weekendHomeworks || []).map((m) => `<div class="log-item"><b>${m.date}</b> 周末作业${m.topic ? "「" + m.topic + "」" : ""}　${m.minutes}</div>`);
  const dutyWeekMinutes = (state.dutyWeeks || []).map((m) => `<div class="log-item"><b>${m.date}</b> 值周${m.actionId ? "「" + (DUTY_WEEK_ACTIONS.find((a)=>a.id===m.actionId)?.label || m.actionId) + "」" : ""}　${m.minutes}</div>`);
  const facultyMinutes = (state.facultyMeetings || []).map((m) => `<div class="log-item"><b>${m.date}</b> 教职工大会　${m.minutes}</div>`);
  const gradeMinutes = (state.gradeMeetings || []).map((m) => `<div class="log-item"><b>${m.date}</b> 年级会${m.examName ? "「" + m.examName + "」" : ""}　${m.minutes}</div>`);
  const paperSignMinutes = (state.paperSigns || []).map((m) => `<div class="log-item"><b>${m.date}</b> 试卷签字${m.examName ? "「" + m.examName + "」" : ""}　${m.minutes}</div>`);
  const minutes = qualityMinutes.concat(groupMinutes).join("");
  const openingBlock = openingMinutes.join("");
  const studyHallBlock = studyHallMinutes.join("");
  const weekendHwBlock = weekendHwMinutes.join("");
  const dutyWeekBlock = dutyWeekMinutes.join("");
  const facultyBlock = facultyMinutes.join("");
  const gradeBlock = gradeMinutes.join("");
  const paperSignBlock = paperSignMinutes.join("");
  const logExam = (typeof currentReport === 'function' ? currentReport() : null);
  host.innerHTML = `${disciplineBoardHtml(logExam)}<h3>近期校历</h3>${cal || "<p class=\"muted\">暂无后续安排</p>"}
    ${minutes ? `<h3>备课组会议纪要</h3>${minutes}` : ""}
    ${facultyBlock ? `<h3>教职工大会纪要</h3>${facultyBlock}` : ""}
    ${gradeBlock ? `<h3>年级会纪要</h3>${gradeBlock}` : ""}
    ${openingBlock ? `<h3>开学纪要</h3>${openingBlock}` : ""}
    ${studyHallBlock ? `<h3>自习看班纪要</h3>${studyHallBlock}` : ""}
    ${weekendHwBlock ? `<h3>周末作业纪要</h3>${weekendHwBlock}` : ""}
    ${dutyWeekBlock ? `<h3>值周纪要</h3>${dutyWeekBlock}` : ""}
    ${paperSignBlock ? `<h3>试卷签字纪要</h3>${paperSignBlock}` : ""}
    <h3>日志</h3>${(state.log||[]).slice(0,40).map((l)=>`<div class="log-item"><b>${l.date}</b> ${l.text}</div>`).join("")}`;
  bindBoardDialogs(host);
}

function viewSave(host) {
  const slots = listSlots();
  host.innerHTML = `<h3>存档 / 读档</h3>
    <p class="notice">刷新页面后可通过「继续存档」读取自动档。也可存到 3 个手动槽，或下载 JSON。本局世界编号 ${escapeHtml(String(state.seed))}。</p>
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
  host.querySelector("#auto-save").onclick = () => {
    const r = persist({ notify: false });
    toast(r.ok ? "已自动保存" : (r.reason || "自动档没有写上。"));
    if (r.ok) persistWarned = false;
    else persistWarned = true;
  };
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
  host.querySelectorAll("[data-sv]").forEach((b)=>b.onclick=()=>{
    const r = saveSlot(state, Number(b.dataset.sv));
    toast(r.ok ? "已保存" : (r.reason || "这一槽没有写上。"));
    render();
  });
  host.querySelectorAll("[data-ld]").forEach((b)=>{
    b.onclick=()=>{
      const r = loadSlotResult(Number(b.dataset.ld));
      if (!r.ok || !r.state) { toast(r.empty ? "空槽" : (r.reason || "这一槽读取失败。")); return; }
      state=r.state; render(); toast("已读取");
    };
  });
}

function renderAgenda() {
  const box = $("#agenda");
  const next = SCHOOL_CALENDAR.find((e) => e.date >= state.date && ["exam","placement1","placement2","admission","promote","parents","activity"].includes(e.kind));
  const cls = clsStudents();
  const sched = daySchedule(state.date, state);
  const curId = state.periodId;
  const ocSlot = openClassSlotOn(state.date, state);
  const tt = `<table class="tt-table"><tbody>${sched.map((p)=>`<tr class="${p.id===curId?"now":""}${p.isMath?" math":""}${p.isExamDay?" exam":""}${p.isActivityPeriod&&!p.isExamDay?" activity":""}${ocSlot&&p.id===ocSlot.periodId?" open-class":""}"><td>${p.clock||""}</td><td>${p.short||p.name}</td><td>${p.subject}${p.isMath?" <span class=\"math-tag\">数学</span>":""}${ocSlot&&p.id===ocSlot.periodId?" <span class=\"open-class-tag\">公开课</span>":""}</td></tr>`).join("")}</tbody></table>`;
  const slot = currentSlot(state);
  const nowLabel = slot ? formatSlotLabel(slot) : "";
  const schedBody = `<p>${formatDateCn(state.date)}</p>
    ${tt}
    <div class="row-actions"><button type="button" data-act="nextperiod">下一节</button></div>
    <p class="notice">备课充分度 ${state.player.prep||0}　数学教学积累 ${Number(state.player.mathTeaching||0).toFixed(1)}</p>
    ${(() => { const req = pendingTimetableRequest(state); return req && req.status === "pending" ? `<p class="notice">有调课或借课请求：${req.peer}想${req.type === "borrow-out" ? "借走一节数学课" : "对调一节课"}。可在「日常教学」或「教务处」里处理。</p>` : ""; })()}
    <p class="notice">下一件大事：${next ? `${next.date} ${next.name}` : "（暂无）"}</p>
    <p class="notice">${openClassLine()}</p>
    ${isCalendarExamDay(state.date) ? `<p class="notice">今日${examEventOn(state.date)?.name || "考试"}全日停课，按宁川中学校内考务安排监考。${PROCTOR_SOURCE_NOTE}</p>` : ""}
    ${isOpeningDayPlayDate(state.date) ? `<p class="notice">今日是宁川中学校内${openingEventKindName(openingEventForPlayDate(state.date)) || "开学安排"}，可在办公室坐班或日常教学里参加。不是全日停课活动，数学正课仍可上。</p>` : ""}`;
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
    <div class="row-actions">
      <button type="button" data-act="skip">跳到下一阶段</button>
      <button type="button" data-act="skip-year">下一学年</button>
    </div>
    <h3>最近日志</h3>
    ${(state.log||[]).slice(0,8).map((l)=>`<div class="log-item"><b>${l.date}</b> ${l.text}</div>`).join("")}`;
  box.querySelector("[data-act=skip]").onclick = () => handleAct("skip");
  box.querySelector("[data-act='skip-year']").onclick = () => handleAct("skip-year");
  box.querySelector("[data-act=nextperiod]").onclick = () => handleAct("nextperiod");
  const det = box.querySelector(".agenda-sched");
  if (det) det.addEventListener("toggle", () => { agendaSchedOpen = det.open; });
}
