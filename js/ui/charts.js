/** Canvas 折线/柱状图：多次考试的分数与排名对比。 */
const COLORS = {
  total: "#e8d5a3",
  pct: "#e8d5a3",
  class: "#c45c4a",
  tier: "#7eb89a",
  next: "#7aa2d6",
  top: "#c9a0d6",
  school: "#f3efe0",
  grid: "rgba(232,213,163,0.18)",
  axis: "#cfc6ae",
  bg: "#1a281f",
};

const SUBJ_COLORS = {
  chinese: "#e8a39a",
  math: "#e8d5a3",
  english: "#9ad0e8",
  physics: "#9ae0c4",
  chemistry: "#d6c89a",
  biology: "#b8e09a",
  politics: "#e0b89a",
  history: "#c9b8e0",
  geography: "#9ab8e0",
};

export function shortExamLabel(examName, date) {
  const d = String(date || "").slice(2).replace(/-/g, ".");
  const n = String(examName || "").replace(/普通/, "").replace(/考试/, "");
  return d ? `${d} ${n}` : n;
}

function setup(canvas, cssH) {
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const cssW = Math.max(320, canvas.clientWidth || 640);
  const h = cssH || 220;
  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(h * dpr);
  canvas.style.width = "100%";
  canvas.style.maxWidth = "100%";
  canvas.style.height = h + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, cssW, h);
  return { ctx, w: cssW, h };
}

function niceRange(min, max, invert = false) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    if (invert) return { min: 1, max: Math.max(10, max || 10) };
    return { min: 0, max: Math.max(1, max || 1) };
  }
  if (min > max) [min, max] = [max, min];
  const pad = (max - min) * 0.08 || 1;
  return { min: min - pad, max: max + pad };
}

function drawAxes(ctx, box, yMin, yMax, invert, yTicks) {
  const { l, t, r, b, w, h } = box;
  ctx.strokeStyle = COLORS.grid;
  ctx.fillStyle = COLORS.axis;
  ctx.font = "11px sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  const ticks = yTicks || 5;
  for (let i = 0; i <= ticks; i++) {
    const frac = i / ticks;
    const y = invert ? t + frac * h : b - frac * h;
    const val = invert ? yMin + frac * (yMax - yMin) : yMin + frac * (yMax - yMin);
    ctx.beginPath();
    ctx.moveTo(l, y);
    ctx.lineTo(r, y);
    ctx.stroke();
    const label = Math.abs(yMax - yMin) > 20 ? String(Math.round(val)) : val.toFixed(1);
    ctx.fillText(label, l - 6, y);
  }
  ctx.strokeStyle = COLORS.axis;
  ctx.beginPath();
  ctx.moveTo(l, t);
  ctx.lineTo(l, b);
  ctx.lineTo(r, b);
  ctx.stroke();
}

function xAt(i, n, box) {
  if (n <= 1) return (box.l + box.r) / 2;
  return box.l + (i / (n - 1)) * box.w;
}

function yAt(v, yMin, yMax, box, invert) {
  const frac = (v - yMin) / (yMax - yMin || 1);
  return invert ? box.t + frac * box.h : box.b - frac * box.h;
}

function drawSeries(ctx, values, color, box, yMin, yMax, invert, { bars = false } = {}) {
  const n = values.length;
  const pts = values.map((v, i) => (v == null ? null : { i, v, x: xAt(i, n, box), y: yAt(v, yMin, yMax, box, invert) }));
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  if (bars) {
    const bw = Math.max(4, (box.w / Math.max(n, 1)) * 0.45);
    for (const p of pts) {
      if (!p) continue;
      const y0 = yAt(Math.max(yMin, 0), yMin, yMax, box, invert);
      ctx.globalAlpha = 0.75;
      ctx.fillRect(p.x - bw / 2, Math.min(p.y, y0), bw, Math.abs(p.y - y0));
      ctx.globalAlpha = 1;
    }
    return;
  }
  ctx.lineWidth = 2;
  ctx.beginPath();
  let started = false;
  for (const p of pts) {
    if (!p) { started = false; continue; }
    if (!started) { ctx.moveTo(p.x, p.y); started = true; }
    else ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
  for (const p of pts) {
    if (!p) continue;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawLabels(ctx, labels, box) {
  ctx.fillStyle = COLORS.axis;
  ctx.font = "10px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const n = labels.length;
  const step = n > 12 ? Math.ceil(n / 8) : n > 8 ? 2 : 1;
  for (let i = 0; i < n; i++) {
    if (i % step !== 0 && i !== n - 1) continue;
    const x = xAt(i, n, box);
    ctx.save();
    ctx.translate(x, box.b + 6);
    ctx.rotate(-Math.PI / 7);
    ctx.fillText(labels[i], 0, 0);
    ctx.restore();
  }
}

function legend(ctx, items, x, y) {
  ctx.font = "11px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  let xx = x;
  for (const it of items) {
    ctx.fillStyle = it.color;
    ctx.fillRect(xx, y - 4, 10, 8);
    ctx.fillStyle = COLORS.axis;
    ctx.fillText(it.name, xx + 14, y);
    xx += 14 + ctx.measureText(it.name).width + 14;
  }
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ title: string, labels: string[], series: {name:string,color:string,values:(number|null)[]}[], invert?: boolean, yLabel?: string, bars?: boolean }} opt
 */
export function drawChart(canvas, opt) {
  const { title, labels, series, invert = false, yLabel = "", bars = false } = opt;
  const { ctx, w, h } = setup(canvas, opt.height || 240);
  const box = { l: 48, t: 28, r: w - 16, b: h - 44 };
  box.w = box.r - box.l;
  box.h = box.b - box.t;
  ctx.fillStyle = COLORS.total;
  ctx.font = "13px 'Songti SC', serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(title, 12, 8);
  const nums = series.flatMap((s) => s.values.filter((v) => v != null));
  let yMin = opt.yMin, yMax = opt.yMax;
  if (yMin == null || yMax == null) {
    const r = niceRange(Math.min(...nums), Math.max(...nums), invert);
    if (yMin == null) yMin = invert ? Math.min(1, r.min) : r.min;
    if (yMax == null) yMax = r.max;
  }
  if (invert) { yMin = Math.max(1, Math.floor(yMin)); yMax = Math.max(yMin + 1, Math.ceil(yMax)); }
  drawAxes(ctx, box, yMin, yMax, invert);
  for (const s of series) drawSeries(ctx, s.values, s.color, box, yMin, yMax, invert, { bars });
  drawLabels(ctx, labels, box);
  legend(ctx, series, 12, h - 14);
  if (yLabel) {
    ctx.save();
    ctx.fillStyle = COLORS.axis;
    ctx.font = "10px sans-serif";
    ctx.translate(11, (box.t + box.b) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillText(yLabel, 0, 0);
    ctx.restore();
  }
}

export function drawScoreChart(canvas, history, subjectIds, subjectNames) {
  const labels = history.map((h) => shortExamLabel(h.examName, h.date));
  const series = [
    { name: "总分得分率%", color: COLORS.total, values: history.map((h) => Math.round(h.pct * 1000) / 10) },
  ];
  for (const sid of subjectIds || []) {
    series.push({
      name: (subjectNames && subjectNames[sid]) || sid,
      color: SUBJ_COLORS[sid] || "#ccc",
      values: history.map((h) => {
        const s = h.subjects[sid];
        if (!s) return null;
        // 单科也用得分率，跨学段满分不同时仍可对比
        const maxGuess = sid === "chinese" || sid === "math" || sid === "english" ? 150
          : sid === "physics" && h.grade >= 3 ? 110
          : sid === "biology" && h.grade >= 3 ? 90
          : 100;
        return Math.round((s.score / maxGuess) * 1000) / 10;
      }),
    });
  }
  drawChart(canvas, { title: "多次考试得分率（总分与单科，已按当次满分折算）", labels, series, yMin: 40, yMax: 100, yLabel: "%" });
}

export function drawRankChart(canvas, history) {
  const labels = history.map((h) => shortExamLabel(h.examName, h.date));
  const series = [
    { name: "班排", color: COLORS.class, values: history.map((h) => h.classRank) },
    { name: "同层次排", color: COLORS.tier, values: history.map((h) => h.tierRank) },
    { name: "校排", color: COLORS.school, values: history.map((h) => h.schoolRank) },
  ];
  const hasNext = history.some((h) => h.cross?.next);
  const hasTop = history.some((h) => h.cross?.top);
  if (hasNext) {
    const nm = history.find((h) => h.cross?.next)?.cross.next.name || "次强层";
    series.splice(2, 0, { name: `放入${nm}`, color: COLORS.next, values: history.map((h) => h.cross?.next?.rank ?? null) });
  }
  if (hasTop) {
    const nm = history.find((h) => h.cross?.top)?.cross.top.name || "顶尖层";
    series.splice(hasNext ? 3 : 2, 0, { name: `放入${nm}`, color: COLORS.top, values: history.map((h) => h.cross?.top?.rank ?? null) });
  }
  const maxR = Math.max(...series.flatMap((s) => s.values.filter((v) => v != null)), 10);
  drawChart(canvas, { title: "排名变化（名次越小越好，纵轴从上往下增大）", labels, series, invert: true, yMin: 1, yMax: maxR, yLabel: "名次" });
}

export { COLORS, SUBJ_COLORS };


const LINE_PALETTE = ["#c45c4a", "#3d6b5a", "#3d5c6b", "#8b5e3c", "#6b4a5d", "#b08d3c", "#2f6f7a", "#5a4a8a"];

function sizePaperCanvas(canvas, cssH) {
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const raw = canvas.clientWidth || canvas.parentElement?.clientWidth || 0;
  const cssW = Math.max(160, raw || 640);
  const h = cssH || 220;
  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(h * dpr);
  canvas.style.width = "100%";
  canvas.style.maxWidth = "100%";
  canvas.style.height = h + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: cssW, h };
}

function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return nice * p;
}

/** 档案页浅色折线图（宣纸底）。 */
export function drawLineChart(canvas, {
  labels = [],
  series = [],
  yInvert = false,
  yMin = null,
  yMax = null,
  yLabel = "",
} = {}) {
  const { ctx, w, h } = sizePaperCanvas(canvas, 230);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#f6f0e3";
  ctx.fillRect(0, 0, w, h);

  const padL = 48, padR = 14, padT = 16, padB = 46;
  const plotW = Math.max(10, w - padL - padR);
  const plotH = Math.max(10, h - padT - padB);
  const n = labels.length;

  const vals = series.flatMap((s) => (s.values || []).filter((v) => v != null && Number.isFinite(v)));
  let min = yMin != null ? yMin : (vals.length ? Math.min(...vals) : 0);
  let max = yMax != null ? yMax : (vals.length ? Math.max(...vals) : 1);
  if (yInvert) {
    min = yMin != null ? yMin : 1;
    max = Math.max(max, 2);
  } else if (max === min) {
    max = min + 1;
    min = Math.max(0, min - 1);
  } else {
    const pad = (max - min) * 0.08;
    min = Math.max(0, min - pad);
    max = max + pad;
  }

  ctx.strokeStyle = "rgba(31,36,30,0.12)";
  ctx.fillStyle = "#4a5248";
  ctx.font = "11px 'Source Han Serif SC', 'Songti SC', serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  const ticks = 4;
  for (let i = 0; i <= ticks; i++) {
    const t = i / ticks;
    const y = padT + (yInvert ? t : 1 - t) * plotH;
    const val = min + t * (max - min);
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + plotW, y);
    ctx.stroke();
    const label = Math.abs(val) >= 100 || yInvert ? String(Math.round(val)) : val.toFixed(0);
    ctx.fillText(label, padL - 6, y);
  }
  if (yLabel) {
    ctx.save();
    ctx.translate(12, padT + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillText(yLabel, 0, 0);
    ctx.restore();
  }

  const xAt = (i) => padL + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const yAt = (v) => {
    const t = (v - min) / (max - min || 1);
    return padT + (yInvert ? t : 1 - t) * plotH;
  };

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const step = n > 10 ? Math.ceil(n / 8) : 1;
  for (let i = 0; i < n; i++) {
    if (i % step && i !== n - 1) continue;
    ctx.save();
    ctx.translate(xAt(i), padT + plotH + 6);
    ctx.rotate(-0.45);
    ctx.fillStyle = "#4a5248";
    ctx.font = "10px 'Source Han Serif SC', 'Songti SC', serif";
    ctx.fillText(String(labels[i] || ""), 0, 0);
    ctx.restore();
  }

  series.forEach((s, si) => {
    const color = s.color || LINE_PALETTE[si % LINE_PALETTE.length];
    const pts = (s.values || []).map((v, i) => (v == null || !Number.isFinite(v) ? null : { x: xAt(i), y: yAt(v) }));
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    let started = false;
    for (const p of pts) {
      if (!p) { started = false; continue; }
      if (!started) { ctx.moveTo(p.x, p.y); started = true; }
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    for (const p of pts) {
      if (!p) continue;
      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#f6f0e3";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  });

  let lx = padL;
  const ly = h - 14;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = "11px 'Source Han Serif SC', 'Songti SC', serif";
  series.forEach((s, si) => {
    const color = s.color || LINE_PALETTE[si % LINE_PALETTE.length];
    ctx.fillStyle = color;
    ctx.fillRect(lx, ly - 4, 10, 8);
    ctx.fillStyle = "#1f241e";
    ctx.fillText(s.name, lx + 14, ly);
    lx += 14 + ctx.measureText(s.name).width + 14;
  });
}

export function drawBarChart(canvas, { labels = [], values = [], colors = [], yLabel = "" } = {}) {
  const { ctx, w, h } = sizePaperCanvas(canvas, 200);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#f6f0e3";
  ctx.fillRect(0, 0, w, h);
  const padL = 48, padR = 12, padT = 16, padB = 40;
  const plotW = w - padL - padR, plotH = h - padT - padB;
  const max = niceMax(Math.max(1, ...values.filter((v) => v != null)));
  const n = labels.length || 1;
  const bw = plotW / n;
  ctx.strokeStyle = "rgba(31,36,30,0.12)";
  ctx.fillStyle = "#4a5248";
  ctx.font = "11px 'Source Han Serif SC', 'Songti SC', serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let i = 0; i <= 4; i++) {
    const y = padT + (1 - i / 4) * plotH;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + plotW, y); ctx.stroke();
    ctx.fillText(String(Math.round(max * i / 4)), padL - 6, y);
  }
  values.forEach((v, i) => {
    const x = padL + i * bw + bw * 0.18;
    const barH = ((v || 0) / max) * plotH;
    const y = padT + plotH - barH;
    ctx.fillStyle = colors[i] || LINE_PALETTE[i % LINE_PALETTE.length];
    ctx.fillRect(x, y, bw * 0.64, barH);
    ctx.fillStyle = "#1f241e";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = "10px 'Source Han Serif SC', 'Songti SC', serif";
    ctx.fillText(String(labels[i] || ""), x + bw * 0.32, padT + plotH + 6);
    if (v != null) {
      ctx.textBaseline = "bottom";
      ctx.fillText(String(v), x + bw * 0.32, y - 2);
    }
  });
  if (yLabel) {
    ctx.save();
    ctx.translate(12, padT + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillStyle = "#4a5248";
    ctx.fillText(yLabel, 0, 0);
    ctx.restore();
  }
}
