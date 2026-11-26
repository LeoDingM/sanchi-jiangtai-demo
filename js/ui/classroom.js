/** 教室座位表（Canvas）：7 列 × 若干排，点击查看档案。 */
export function renderSeating(canvas, students, selectedId, onPick) {
  const ctx = canvas.getContext("2d");
  const cols = students.length <= 35 ? 6 : 7;
  const rows = Math.max(6, Math.ceil(students.length / cols));
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 800;
  const cssH = Math.max(420, 90 + rows * 54);
  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  canvas.style.height = cssH + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.fillStyle = "#2a3b2f";
  ctx.fillRect(0, 0, cssW, cssH);
  // 黑板
  ctx.fillStyle = "#1c2b22";
  ctx.fillRect(40, 12, cssW - 80, 48);
  ctx.strokeStyle = "#e8d5a3";
  ctx.strokeRect(40, 12, cssW - 80, 48);
  ctx.fillStyle = "#e8d5a3";
  ctx.font = "16px 'Songti SC', serif";
  ctx.textAlign = "center";
  ctx.fillText("宁川中学 · 卓行16班", cssW / 2, 42);

  const map = new Map();
  const left = 36, top = 80, gapX = (cssW - 72) / cols, gapY = 52;
  students.forEach((s, i) => {
    const r = (s.seat?.row || Math.floor(i / cols) + 1) - 1;
    const c = (s.seat?.col || (i % cols) + 1) - 1;
    const x = left + c * gapX + gapX / 2;
    const y = top + r * gapY;
    map.set(s.id, { x, y, s });
    const sel = s.id === selectedId;
    ctx.beginPath();
    ctx.fillStyle = sel ? "#c45c4a" : (s.gender === "F" ? "#6b4a5d" : "#3d5c6b");
    ctx.arc(x, y, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = sel ? "#f3efe0" : "rgba(243,239,224,.35)";
    ctx.stroke();
    ctx.fillStyle = "#f3efe0";
    ctx.font = "12px sans-serif";
    ctx.fillText(s.name.slice(0, 1), x, y + 4);
    ctx.fillStyle = "#cfc6ae";
    ctx.font = "10px sans-serif";
    ctx.fillText(s.name, x, y + 32);
  });

  canvas.onclick = (ev) => {
    const rect = canvas.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    let best = null, bestD = 22;
    for (const { x: sx, y: sy, s } of map.values()) {
      const d = Math.hypot(x - sx, y - sy);
      if (d < bestD) { bestD = d; best = s; }
    }
    if (best && onPick) onPick(best.id);
  };
}
