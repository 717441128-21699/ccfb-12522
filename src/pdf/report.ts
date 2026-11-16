import { jsPDF } from 'jspdf';
import type { EventMeta } from '../types';
import type { ScanImage } from '../scan/compositor';
import { raceTime, formatRaceTime } from '../scan/timing';

/**
 * 生成成绩单 PDF。中文通过 canvas 渲染为图片嵌入,避免 jsPDF 字体问题。
 * 内容:赛事信息、风速、成绩表、带时间刻度的终点扫描图(存档用)。
 */
export async function generatePdf(ev: EventMeta, fps: number, scan: ScanImage | null): Promise<void> {
  const W = 1588; // A4 @ ~192dpi
  const H = 2246;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#000';

  const M = 80; // 页边距
  let y = M;

  // 标题
  ctx.font = 'bold 56px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('终点摄影成绩单', W / 2, y);
  y += 70;
  ctx.font = '32px system-ui, sans-serif';
  ctx.fillText(`${ev.name} — ${ev.distance} ${ev.groupName}`, W / 2, y);
  y += 50;
  ctx.textAlign = 'left';

  // 元信息
  ctx.font = '26px system-ui, sans-serif';
  const windStr = ev.wind !== null ? `风速:${ev.wind >= 0 ? '+' : ''}${ev.wind.toFixed(1)} m/s` : '风速:未测定';
  const gunStr = ev.gunSec !== null ? `发令零点:${ev.gunSec.toFixed(3)} s` : '发令零点:未设定';
  ctx.fillText(`${windStr}    ${gunStr}    帧率:${fps.toFixed(3)} fps    计时精度:1/${fps} 秒`, M, y);
  y += 30;
  if (ev.wind !== null && ev.wind > 2.0) {
    ctx.fillStyle = '#b00020';
    ctx.fillText(`风速超过 +2.0 m/s,本场成绩不计纪录。`, M, y);
    ctx.fillStyle = '#000';
    y += 30;
  }
  y += 20;

  // 成绩表
  const rows = ev.athletes
    .map((a) => {
      const m = ev.marks.find((x) => x.lane === a.lane);
      const t = m && ev.gunSec !== null ? raceTime(m.frame, fps, ev.gunSec) : null;
      return { a, t };
    })
    .sort((x, y2) => (x.t ?? Infinity) - (y2.t ?? Infinity));

  const colX = [M, M + 160, M + 320, M + 720, M + 1050];
  const headers = ['名次', '道次', '姓名', '成绩', '备注'];
  ctx.font = 'bold 28px system-ui, sans-serif';
  headers.forEach((h, i) => ctx.fillText(h, colX[i], y));
  y += 16;
  ctx.strokeStyle = '#000';
  ctx.beginPath();
  ctx.moveTo(M, y);
  ctx.lineTo(W - M, y);
  ctx.stroke();
  y += 40;
  ctx.font = '28px system-ui, sans-serif';
  let rank = 0;
  let lastT: number | null = null;
  const windBad = ev.wind !== null && ev.wind > 2.0;
  for (const { a, t } of rows) {
    if (t !== null && t !== lastT) rank++;
    lastT = t;
    const cells = [
      t !== null ? String(rank) : '—',
      String(a.lane),
      a.name,
      t !== null ? formatRaceTime(t) : '未判读',
      t !== null && windBad ? '风速超规,不计纪录' : '',
    ];
    cells.forEach((c, i) => ctx.fillText(c, colX[i], y));
    y += 44;
  }
  y += 30;

  // 扫描图存档(带时间刻度)
  if (scan) {
    ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.fillText('终点扫描图(横轴=时间)', M, y);
    y += 20;
    const stripW = W - 2 * M;
    const stripH = Math.min(360, (scan.height / scan.width) * stripW);
    // 扫描图画到离屏再缩放贴上
    const off = document.createElement('canvas');
    off.width = scan.width;
    off.height = scan.height;
    off.getContext('2d')!.putImageData(scan.toImageData(), 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(off, M, y, stripW, stripH);
    ctx.strokeRect(M, y, stripW, stripH);

    // 时间刻度:每 0.1 秒小刻度,每 1 秒标注
    const gun = ev.gunSec ?? 0;
    const colToX = (col: number) => M + (col / scan.width) * stripW;
    ctx.font = '20px monospace';
    ctx.strokeStyle = '#000';
    const stepCols = scan.width / ((scan.width / fps) * 10); // 0.1s 对应的列数
    for (let col = 0; col <= scan.width; col += stepCols) {
      const t = raceTime(scan.startFrame + col, fps, gun);
      const x = colToX(col);
      const isSec = Math.abs(t - Math.round(t)) < 1 / fps / 2;
      ctx.beginPath();
      ctx.moveTo(x, y + stripH);
      ctx.lineTo(x, y + stripH + (isSec ? 18 : 8));
      ctx.stroke();
      if (isSec) ctx.fillText(`${Math.round(t)}s`, x - 10, y + stripH + 42);
    }
    // 选手标记
    ctx.strokeStyle = '#d00';
    ctx.lineWidth = 2;
    for (const m of ev.marks) {
      const col = m.frame - scan.startFrame;
      if (col < 0 || col > scan.width) continue;
      const x = colToX(col);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + stripH);
      ctx.stroke();
    }
    ctx.lineWidth = 1;
    y += stripH + 70;
    ctx.fillStyle = '#000';
    ctx.font = '22px system-ui, sans-serif';
    ctx.fillText(`扫描起始帧:${scan.startFrame}    横轴 1 列 = 1 帧 = ${(1000 / fps).toFixed(2)} ms`, M, y);
  }

  // 导出
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 210, 297);
  pdf.save(`${ev.name}-成绩单.pdf`);
}
