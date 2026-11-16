import { el, button } from './dom';
import { currentEvent, runtimeOf, save } from '../state';
import { extractFrame, decodeAudio } from '../video/decoder';
import { detectGunshot } from '../audio/gunshot';
import type { FinishLine } from '../types';

/** 终点线标定页:抽一帧显示,拖两个点标定终点线;检测发令枪零点 */
export function renderCalibrate(root: HTMLElement, rerender: () => void): void {
  root.append(el('h2', {}, '终点线标定'));
  const ev = currentEvent();
  if (!ev) {
    root.append(el('p', {}, '请先在「赛事」页选择赛事。'));
    return;
  }
  const rt = runtimeOf(ev.id);
  if (!rt.videoFile || !rt.videoInfo) {
    root.append(el('p', {}, '请先在「赛事」页上传比赛视频。'));
    return;
  }

  const status = el('p', { class: 'dim' }, '');
  const canvas = el('canvas', { class: 'calib-canvas' });
  const ctx = canvas.getContext('2d')!;
  let frame: ImageData | null = null;
  let line: FinishLine = ev.line ? { ...ev.line } : { x1: 0, y1: 0, x2: 0, y2: 0 };

  // 帧选择:默认中间帧(选手通常在画面里)
  const frameIdxIn = el('input', { type: 'number', min: '0', value: String(Math.floor(rt.videoInfo.frameCount / 2)) });
  frameIdxIn.max = String(rt.videoInfo.frameCount - 1);

  const loadBtn = button('抽取该帧', async () => {
    const idx = Math.max(0, Math.min(rt.videoInfo!.frameCount - 1, parseInt(frameIdxIn.value, 10) || 0));
    status.textContent = `正在解码并抽取第 ${idx} 帧…`;
    loadBtn.disabled = true;
    try {
      frame = await extractFrame(rt.videoFile!, idx);
      canvas.width = frame.width;
      canvas.height = frame.height;
      if (!ev.line) {
        // 默认线:画面中央竖线
        line = { x1: frame.width / 2, y1: 0, x2: frame.width / 2, y2: frame.height - 1 };
      }
      status.textContent = '拖动两个圆点,使连线与终点线重合(相机歪了可以斜着拉)。';
      draw();
    } catch (e) {
      status.textContent = `抽帧失败:${e instanceof Error ? e.message : String(e)}`;
    } finally {
      loadBtn.disabled = false;
    }
  });

  function draw(): void {
    if (!frame) return;
    ctx.putImageData(frame, 0, 0);
    ctx.strokeStyle = '#ff3b30';
    ctx.lineWidth = Math.max(2, frame.width / 500);
    ctx.beginPath();
    ctx.moveTo(line.x1, line.y1);
    ctx.lineTo(line.x2, line.y2);
    ctx.stroke();
    ctx.fillStyle = '#ff3b30';
    for (const [x, y] of [
      [line.x1, line.y1],
      [line.x2, line.y2],
    ]) {
      ctx.beginPath();
      ctx.arc(x, y, Math.max(6, frame.width / 120), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 拖拽:把画布坐标换算回帧坐标
  let dragging: 0 | 1 | null = null;
  function toFrameCoords(e: PointerEvent): [number, number] {
    const r = canvas.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * canvas.width, ((e.clientY - r.top) / r.height) * canvas.height];
  }
  canvas.addEventListener('pointerdown', (e) => {
    if (!frame) return;
    const [x, y] = toFrameCoords(e);
    const d1 = Math.hypot(x - line.x1, y - line.y1);
    const d2 = Math.hypot(x - line.x2, y - line.y2);
    dragging = d1 <= d2 ? 0 : 1;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (dragging === null || !frame) return;
    const [x, y] = toFrameCoords(e);
    if (dragging === 0) {
      line.x1 = x;
      line.y1 = y;
    } else {
      line.x2 = x;
      line.y2 = y;
    }
    draw();
  });
  canvas.addEventListener('pointerup', () => {
    if (dragging !== null) {
      dragging = null;
      ev.line = { ...line };
      save();
      status.textContent = `终点线已保存:(${line.x1.toFixed(0)},${line.y1.toFixed(0)}) → (${line.x2.toFixed(0)},${line.y2.toFixed(0)})`;
    }
  });

  root.append(
    el('div', { class: 'card' }, el('h3', {}, `标定 — ${ev.name}`),
      el('div', { class: 'row' }, el('span', {}, '参考帧号:'), frameIdxIn, loadBtn),
      status,
      canvas,
    ),
  );

  // 发令枪零点
  const gunStatus = el('p', { class: 'dim' }, ev.gunSec !== null ? `当前零点:${ev.gunSec.toFixed(3)} 秒` : '尚未设定零点');
  const gunInput = el('input', { type: 'number', step: '0.001', placeholder: '手动输入零点(秒)' });
  if (ev.gunSec !== null) gunInput.value = ev.gunSec.toFixed(3);
  const detectBtn = button('从音轨检测发令枪', async () => {
    gunStatus.textContent = '正在解码音轨…';
    detectBtn.disabled = true;
    try {
      const { samples, sampleRate } = await decodeAudio(rt.videoFile!);
      const t = detectGunshot(samples, sampleRate);
      ev.gunSec = t;
      save();
      gunInput.value = t.toFixed(3);
      gunStatus.textContent = `检测到发令枪声位于 ${t.toFixed(3)} 秒,已设为计时零点。`;
    } catch (e) {
      gunStatus.textContent = `检测失败:${e instanceof Error ? e.message : String(e)}(可手动输入)`;
    } finally {
      detectBtn.disabled = false;
    }
  });
  root.append(
    el('div', { class: 'card' }, el('h3', {}, '计时零点(发令枪)'),
      el('div', { class: 'row' }, detectBtn, gunInput, button('手动设定', () => {
        const v = parseFloat(gunInput.value);
        if (Number.isFinite(v)) {
          ev.gunSec = v;
          save();
          gunStatus.textContent = `零点已设为 ${v.toFixed(3)} 秒。`;
        }
      })),
      gunStatus,
    ),
  );
  void rerender;
}
