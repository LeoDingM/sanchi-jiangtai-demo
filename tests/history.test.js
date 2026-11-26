import { test } from "node:test";
import assert from "node:assert/strict";
import { createGame, skipToNextStage, listExamReports, playerStudents } from "../js/domain/simulation.js";
import { studentExamHistory, strongerTiers } from "../js/domain/studentHistory.js";

test("学生轨迹由各次真实分计算，含班排、同层次排、跨层次排和校排", () => {
  const g = createGame(20170901, "林知秋");
  for (let i = 0; i < 5; i++) skipToNextStage(g);
  const reports = listExamReports(g, { entryYear: 2017 });
  assert.ok(reports.length >= 2, "至少应有两次考试");
  const stu = playerStudents(g)[0];
  const hist = studentExamHistory(reports, stu.id);
  assert.equal(hist.length, reports.filter((r) => (r.rows || []).some((row) => row.studentId === stu.id)).length);

  for (const h of hist) {
    const rep = reports.find((r) => r.examId === h.examId && r.date === h.date);
    const row = (rep.rows || []).find((r) => r.studentId === stu.id);
    assert.ok(row, "轨迹必须对应真实场次");
    assert.equal(h.total, row.total, "总分必须等于该次真实分，不能另造");
    assert.ok(h.classRank >= 1 && h.classRank <= h.classN);
    assert.ok(h.tierRank >= 1 && h.tierRank <= h.tierN);
    assert.ok(h.schoolRank >= 1 && h.schoolRank <= h.schoolN);
    const classmates = (rep.rows || []).filter((r) => !r.repeat && r.classNo === row.classNo);
    const betterInClass = classmates.filter((r) => r.total > row.total).length;
    assert.equal(h.classRank, betterInClass + 1);
    if (h.cross.top) {
      const topRows = (rep.rows || []).filter((r) => !r.repeat && r.tier === h.cross.top.tier && (!rep.split || r.track === row.track));
      const better = topRows.filter((r) => r.total > row.total).length;
      assert.equal(h.cross.top.rank, better + 1);
      assert.equal(h.cross.top.n, topRows.length + 1);
    }
  }

  const first = playerStudents(g).slice().sort((a, b) => a.seq - b.seq);
  // 任教班里该次总分最高的学生，跨到顶尖层后名次应不优于本人在本班的名次规模（通常会大幅落后）
  const latest = hist.at(-1);
  const latestRep = reports.find((r) => r.examId === latest.examId);
  const classRows = (latestRep.rows || []).filter((r) => !r.repeat && r.classNo === g.player.classNo);
  const topInClass = classRows.slice().sort((a, b) => b.total - a.total)[0];
  const topHist = studentExamHistory([latestRep], topInClass.studentId)[0];
  assert.equal(topHist.classRank, 1);
  const { next, top } = strongerTiers(topInClass.tier);
  assert.ok(next || top);
  if (topHist.cross.top) {
    assert.ok(topHist.cross.top.rank >= 1);
    // 云岫实验两班合计约 68 人，插入后仍可能少于 74 人的卓行班，不能要求人数一定更大。
    assert.ok(topHist.cross.top.n >= 20, "实验班池应有一定规模");
    assert.ok(topHist.cross.top.rank >= topHist.classRank, "放入顶尖层后名次不应优于本班第 1");
  }
});
