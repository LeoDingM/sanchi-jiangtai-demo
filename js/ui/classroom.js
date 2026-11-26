/** 教室座位表（Canvas）：7 列 × 若干排，点击查看档案或当堂处理。 */
import { seatOf, columnsForClass } from "../domain/school.js?v=t53u1";

function fitText(ctx, text, maxWidth, maxSize, family) {
  let size = maxSize;
  while (size > 10) {
    ctx.font = `${size}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) return size;
    size -= 1;
  }
  ctx.font = `${size}px ${family}`;
  return size;
}

export function renderSeating(canvas, students, selectedId, onPick, opts = {}) {
  const ctx = canvas.getContext("2d");
  const classNo = opts.classNo ?? students[0]?.classNo;
  const cols = columnsForClass(classNo, students.length);
  const rows = Math.max(6, Math.ceil(students.length / cols));
  const dpr = window.devicePixelRatio || 1;
  const cssW = Math.max(0, canvas.clientWidth || canvas.parentElement?.clientWidth || 0) || 800;
  const narrow = cssW < 520;
  const radius = narrow ? 15 : 18;
  const gapY = narrow ? 46 : 52;
  const left = narrow ? 16 : 36;
  const top = narrow ? 72 : 80;
  const cssH = Math.max(narrow ? 360 : 420, top + rows * gapY + 16);
  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  canvas.style.width = "100%";
  canvas.style.height = cssH + "px";
  canvas.style.maxWidth = "100%";
  canvas.style.touchAction = "manipulation";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.fillStyle = "#2a3b2f";
  ctx.fillRect(0, 0, cssW, cssH);
  const boardPad = narrow ? 12 : 40;
  const boardW = Math.max(80, cssW - boardPad * 2);
  ctx.fillStyle = "#1c2b22";
  ctx.fillRect(boardPad, 12, boardW, 48);
  ctx.strokeStyle = "#e8d5a3";
  ctx.strokeRect(boardPad, 12, boardW, 48);
  ctx.fillStyle = "#e8d5a3";
  ctx.textAlign = "center";
  const board = opts.boardTitle || "宁川中学 · 卓行16班";
  fitText(ctx, board, boardW - 16, 16, '"Songti SC", "Noto Serif SC", "Source Han Serif SC", serif');
  ctx.fillText(board, cssW / 2, 42);

  const marks = opts.marks || {};
  const map = new Map();
  const gapX = (cssW - left * 2) / cols;
  const nameSize = gapX < 44 ? 9 : 10;
  students.forEach((s, i) => {
    const seat = seatOf(s, students.length);
    const r = (seat.row || Math.floor(i / cols) + 1) - 1;
    const c = (seat.col || (i % cols) + 1) - 1;
    const x = left + c * gapX + gapX / 2;
    const y = top + r * gapY;
    map.set(s.id, { x, y, s });
    const sel = s.id === selectedId;
    const mk = marks[s.id] || {};
    ctx.beginPath();
    ctx.fillStyle = sel ? "#c45c4a" : (s.gender === "F" ? "#6b4a5d" : "#3d5c6b");
    if (mk.drowsy && !sel) ctx.fillStyle = "#4a5248";
    if (mk.absent && !sel) ctx.fillStyle = "#2f3532";
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = sel ? "#f3efe0" : (mk.hand ? "#e8d5a3" : "rgba(243,239,224,.35)");
    ctx.lineWidth = mk.hand ? 3 : 1;
    ctx.stroke();
    if (!sel && !mk.hand) {
      if (mk.desk) {
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = "#e8d5a3";
        ctx.lineWidth = 2.5;
        ctx.stroke();
      } else if (mk.friend) {
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = "#9ad0b8";
        ctx.lineWidth = 2;
        ctx.stroke();
      } else if (mk.tense) {
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = "#c48a7a";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
    ctx.lineWidth = 1;
    if (mk.watch) {
      ctx.beginPath();
      ctx.fillStyle = "#c45c4a";
      ctx.arc(x + radius * 0.7, y - radius * 0.7, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    if (mk.late) {
      ctx.beginPath();
      ctx.fillStyle = "#d08a2a";
      ctx.arc(x - radius * 0.7, y - radius * 0.7, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    if (mk.absent) {
      ctx.beginPath();
      ctx.strokeStyle = "#8aa0b8";
      ctx.lineWidth = 2;
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1;
    }
    ctx.fillStyle = "#f3efe0";
    ctx.font = "12px sans-serif";
    ctx.fillText(s.name.slice(0, 1), x, y + 4);
    ctx.fillStyle = "#cfc6ae";
    ctx.font = `${nameSize}px sans-serif`;
    const label = s.name || "";
    if (ctx.measureText(label).width <= gapX - 4) ctx.fillText(label, x, y + radius + 12);
    else ctx.fillText(label.slice(0, 2), x, y + radius + 12);
  });

  const hitR = Math.max(narrow ? 26 : 22, Math.min(gapX, gapY) * 0.45);

  const toLocal = (ev) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / cssW || 1;
    const scaleY = rect.height / cssH || 1;
    const src = ev.changedTouches?.[0] || ev.touches?.[0] || ev;
    return { x: (src.clientX - rect.left) / scaleX, y: (src.clientY - rect.top) / scaleY };
  };
  const pickAt = (ev) => {
    const { x, y } = toLocal(ev);
    let best = null, bestD = hitR;
    for (const { x: sx, y: sy, s } of map.values()) {
      const d = Math.hypot(x - sx, y - sy);
      if (d < bestD) { bestD = d; best = s; }
    }
    if (best && onPick) onPick(best.id);
  };
  canvas.onclick = pickAt;

  if (canvas._seatRO) canvas._seatRO.disconnect();
  let lastW = cssW;
  const ro = new ResizeObserver(() => {
    const w = canvas.clientWidth;
    if (!w || Math.abs(w - lastW) < 1) return;
    lastW = w;
    renderSeating(canvas, students, selectedId, onPick, opts);
  });
  canvas._seatRO = ro;
  ro.observe(canvas);
}
