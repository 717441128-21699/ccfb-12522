import { el, button } from './dom';
import { currentEvent, runtimeOf, save } from '../state';
import { raceTime, formatRaceTime } from '../scan/timing';
import type { EventMeta } from '../types';

/**
 * 判读页:竖线跟随鼠标,读数到千分之一秒;选道次点击标注冲线;
 * 拖拽框选可局部放大(可开关插帧平滑)比较几乎同时撞线的选手。
 */
export function renderRead(root: HTMLElement, rerender: () => void): void {
  root.append(el('h2', {}, '判读'));
  const ev0 = currentEvent();
  if (!ev0) {
    root.append(el('p', {}, '请先在「赛事」页选择赛事。'));
    return;
  }
  const ev = ev0;
  const rt = runtimeOf(ev.id);
  if (!rt.scan || !rt.videoInfo) {
    root.append(el('p', {}, '请先在「扫描」页生成扫描图。'));
    return;
  }
  if (ev.gunSec === null) {
    root.append(el('p', { class: 'warn' }, '尚未设定发令枪零点,读数为视频内时刻而非比赛用时。请到「标定」页设定。'));
  }
  const scan = rt.scan;
  const fps = rt.videoInfo.fps;
  const gun = ev.gunSec ?? 0;

  const absFrame = (col: number) => scan.startFrame + col;
  const timeAt = (col: number) => raceTime(absFrame(col), fps, gun);

  // 道次行带:按最大道次均分纵轴
  const maxLane = Math.max(1, ...ev.athletes.map((a) => a.lane));
  const bandOf = (lane: number): [number, number] => {
    const h = scan.height / maxLane;
    return [(lane - 1) * h, lane * h];
  };

  let selectedLane: number | null = ev.athletes[0]?.lane ?? null;

  // ---- 主视图 ----
  const canvas = el('canvas', { class: 'read-canvas' });
  canvas.width = scan.width;
  canvas.height = scan.height;
  const ctx = canvas.getContext('2d')!;
  const readout = el('div', { class: 'readout' }, '移动鼠标查看时刻');
  let cursorCol: number | null = null;

  function drawBase(): void {
    ctx.putImageData(scan.toImageData(), 0, 0);
    // 道次分隔线
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    for (let l = 1; l < maxLane; l++) {
      const y = (scan.height / maxLane) * l;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(scan.width, y);
      ctx.stroke();
    }
    // 已有标记
    for (const m of ev.marks) {
      const x = m.frame - scan.startFrame;
      if (x < 0 || x >= scan.width) continue;
      const [y0, y1] = bandOf(m.lane);
      ctx.strokeStyle = '#ff9500';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y1);
      ctx.stroke();
    }
    // 时间刻度(底部,每 0.1 秒一条,每 1 秒标注)
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.fillStyle = '#000';
    ctx.font = `${Math.max(10, scan.height / 30)}px monospace`;
    const secPerCol = 1 / fps;
    const step = 0.1 / secPerCol; // 每 0.1 秒的列数
    for (let x = 0; x < scan.width; x += step) {
      const t = timeAt(x);
      const isSec = Math.abs(t - Math.round(t)) < secPerCol / 2;
      ctx.beginPath();
      ctx.moveTo(x, scan.height);
      ctx.lineTo(x, scan.height - (isSec ? 14 : 6));
      ctx.stroke();
      if (isSec) ctx.fillText(`${Math.round(t)}s`, x + 2, scan.height - 16);
    }
    // 鼠标竖线
    if (cursorCol !== null) {
      ctx.strokeStyle = '#0a84ff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cursorCol, 0);
      ctx.lineTo(cursorCol, scan.height);
      ctx.stroke();
    }
  }

  function colFromEvent(e: PointerEvent | MouseEvent): number {
    const r = canvas.getBoundingClientRect();
    return ((e.clientX - r.left) / r.width) * scan.width;
  }

  canvas.addEventListener('pointermove', (e) => {
    cursorCol = colFromEvent(e);
    const f = absFrame(cursorCol);
    readout.textContent =
      `帧 ${f.toFixed(1)} | 视频时刻 ${(f / fps).toFixed(3)} s | 比赛用时 ${formatRaceTime(timeAt(cursorCol))}` +
      ` (1 帧 = ${(1000 / fps).toFixed(2)} ms)`;
    drawBase();
  });
  canvas.addEventListener('pointerleave', () => {
    cursorCol = null;
    drawBase();
  });

  // 拖拽框选 → 局部放大;单击 → 标注
  let dragStart: number | null = null;
  canvas.addEventListener('pointerdown', (e) => {
    dragStart = colFromEvent(e);
  });
  canvas.addEventListener('pointerup', (e) => {
    if (dragStart === null) return;
    const end = colFromEvent(e);
    const a = Math.min(dragStart, end);
    const b = Math.max(dragStart, end);
    dragStart = null;
    if (b - a > 5) {
      zoomTo(a, b); // 框选放大
    } else {
      placeMark(end); // 单击标注
    }
  });

  function placeMark(col: number, fractional = false): void {
    if (selectedLane === null) return alert('请先在右侧选择要标注的道次');
    const frame = fractional ? absFrame(col) : Math.round(absFrame(col));
    ev.marks = ev.marks.filter((m) => m.lane !== selectedLane);
    ev.marks.push({ lane: selectedLane, frame });
    save();
    drawBase();
    refreshMarks();
  }

  // ---- 局部放大(插帧比较) ----
  const zoomCanvas = el('canvas', { class: 'zoom-canvas' });
  const smoothChk = el('input', { type: 'checkbox' });
  smoothChk.checked = true;
  const zoomInfo = el('p', { class: 'dim' }, '在主图上横向拖框可放大比较;勾选「插帧平滑」以插值显示中间列。');
  let zoomRange: [number, number] | null = null;

  function zoomTo(a: number, b: number): void {
    zoomRange = [a, b];
    drawZoom();
  }
  function drawZoom(): void {
    if (!zoomRange) return;
    const [a, b] = zoomRange;
    const scale = 8; // 横向放大倍数
    const w = Math.max(1, Math.round((b - a) * scale));
    zoomCanvas.width = w;
    zoomCanvas.height = scan.height;
    const zctx = zoomCanvas.getContext('2d')!;
    zctx.imageSmoothingEnabled = smoothChk.checked; // 插帧(列间插值)
    zctx.drawImage(canvas, a, 0, b - a, scan.height, 0, 0, w, scan.height);
    zoomInfo.textContent = `放大区间:帧 ${absFrame(a).toFixed(0)} ~ ${absFrame(b).toFixed(0)},横向 ${scale}×` +
      (smoothChk.checked ? '(已插帧)' : '(原始列)');
  }
  smoothChk.addEventListener('change', drawZoom);
  zoomCanvas.addEventListener('click', (e) => {
    if (!zoomRange) return;
    const r = zoomCanvas.getBoundingClientRect();
    const [a, b] = zoomRange;
    const col = a + ((e.clientX - r.left) / r.width) * (b - a);
    placeMark(col, true); // 放大视图中允许亚帧精度
  });

  // ---- 道次选择与标记列表 ----
  const laneList = el('div', { class: 'card' }, el('h3', {}, '道次'));
  const marksDiv = el('div', {});
  function refreshMarks(): void {
    laneList.querySelectorAll('button.lane-btn').forEach((b) => {
      b.classList.toggle('active', (b as HTMLButtonElement).dataset.lane === String(selectedLane));
    });
    marksDiv.replaceChildren();
    const sorted = [...ev.marks].sort((x, y) => x.frame - y.frame);
    for (const m of sorted) {
      const ath = ev.athletes.find((a) => a.lane === m.lane);
      marksDiv.append(
        el('div', { class: 'row' },
          el('span', {}, `${m.lane} 道 ${ath?.name ?? ''}`),
          el('strong', {}, formatRaceTime(raceTime(m.frame, fps, gun))),
          button('删除', () => {
            ev.marks = ev.marks.filter((x) => x !== m);
            save();
            drawBase();
            refreshMarks();
          }),
        ),
      );
    }
  }
  for (const a of ev.athletes) {
    const b = button(`${a.lane} 道 ${a.name}`, () => {
      selectedLane = a.lane;
      refreshMarks();
    }, 'lane-btn');
    b.dataset.lane = String(a.lane);
    laneList.append(b);
  }
  laneList.append(marksDiv);

  root.append(
    el('div', { class: 'card' },
      el('h3', {}, `扫描图判读 — ${ev.name}`),
      readout,
      el('div', { class: 'scroll-x' }, canvas),
      el('p', { class: 'dim' }, '单击:为选中的道次标注冲线(以躯干前沿为准);拖框:局部放大。'),
    ),
    el('div', { class: 'card' }, el('h3', {}, '局部放大 / 插帧比较'),
      el('label', { class: 'row' }, smoothChk, el('span', {}, '插帧平滑')), zoomInfo,
      el('div', { class: 'scroll-x' }, zoomCanvas)),
    laneList,
  );

  drawBase();
  refreshMarks();
  void rerender;
}

/** 供成绩页复用:某赛事某道次的成绩(秒) */
export function markTime(ev: EventMeta, lane: number, fps: number): number | null {
  const m = ev.marks.find((x) => x.lane === lane);
  if (!m || ev.gunSec === null) return null;
  return raceTime(m.frame, fps, ev.gunSec);
}
