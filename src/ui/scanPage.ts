import { el, button } from './dom';
import { currentEvent, runtimeOf } from '../state';
import { decodeFrames } from '../video/decoder';
import { ScanImage } from '../scan/compositor';
import { sampleLine, lineSampleCount } from '../scan/sampler';

/** 扫描成像页:逐帧取终点线那一列像素,拼成扫描图(横轴=时间) */
export function renderScan(root: HTMLElement, rerender: () => void): void {
  root.append(el('h2', {}, '扫描成像'));
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
  if (!ev.line) {
    root.append(el('p', {}, '请先在「标定」页标定终点线。'));
    return;
  }

  const vi = rt.videoInfo;
  const startIn = el('input', { type: 'number', min: '0', value: '0' });
  const endIn = el('input', { type: 'number', min: '0', value: String(vi.frameCount - 1) });
  endIn.max = String(vi.frameCount - 1);

  const progress = el('progress', { value: '0', max: '100', style: 'width:100%' });
  const status = el('p', { class: 'dim' }, rt.scan ? `已有扫描图:${rt.scan.width} 帧 × ${rt.scan.height} 行,起始帧 ${rt.scan.startFrame}` : '尚未生成扫描图');
  const outCanvas = el('canvas', { class: 'scan-canvas' });

  function showScan(): void {
    if (!rt.scan) return;
    outCanvas.width = rt.scan.width;
    outCanvas.height = rt.scan.height;
    outCanvas.getContext('2d')!.putImageData(rt.scan.toImageData(), 0, 0);
  }

  const runBtn = button('开始扫描', async () => {
    const start = Math.max(0, parseInt(startIn.value, 10) || 0);
    const end = Math.min(vi.frameCount - 1, parseInt(endIn.value, 10) || vi.frameCount - 1);
    if (end <= start) return alert('帧范围无效');
    const h = lineSampleCount(ev.line!);
    const scan = new ScanImage(end - start + 1, h, start);
    const column = new Uint8ClampedArray(h * 4);

    // 复用离屏画布取帧像素
    const tmp = document.createElement('canvas');
    tmp.width = vi.width;
    tmp.height = vi.height;
    const tctx = tmp.getContext('2d', { willReadFrequently: true })!;

    runBtn.disabled = true;
    status.textContent = '正在逐帧解码并采样…';
    const t0 = performance.now();
    try {
      let done = 0;
      await decodeFrames(
        rt.videoFile!,
        (vf, index) => {
          if (index < start || index > end) return;
          tctx.drawImage(vf, 0, 0);
          const img = tctx.getImageData(0, 0, tmp.width, tmp.height);
          sampleLine(img, ev.line!, column);
          scan.setColumn(index - start, column);
          done++;
          if (done % 60 === 0) {
            progress.value = (done / (end - start + 1)) * 100;
            status.textContent = `扫描中… ${done}/${end - start + 1} 帧`;
          }
        },
      );
      rt.scan = scan;
      progress.value = 100;
      const dt = (performance.now() - t0) / 1000;
      status.textContent = `完成:${scan.width} 帧 × ${scan.height} 行,起始帧 ${start},耗时 ${dt.toFixed(1)} 秒。横轴 1 像素 = 1 帧 = ${(1000 / vi.fps).toFixed(2)} 毫秒。`;
      showScan();
    } catch (e) {
      status.textContent = `扫描失败:${e instanceof Error ? e.message : String(e)}`;
    } finally {
      runBtn.disabled = false;
    }
  });

  root.append(
    el('div', { class: 'card' },
      el('h3', {}, `生成扫描图 — ${ev.name}`),
      el('p', { class: 'dim' }, `视频共 ${vi.frameCount} 帧 @ ${vi.fps.toFixed(3)} fps。长视频可截取冲线附近的帧范围以节省内存。`),
      el('div', { class: 'row' }, el('span', {}, '起始帧'), startIn, el('span', {}, '结束帧'), endIn, runBtn),
      progress,
      status,
    ),
    el('div', { class: 'card' }, el('h3', {}, '扫描图预览(横轴=时间,纵轴=沿终点线位置)'), el('div', { class: 'scroll-x' }, outCanvas)),
  );
  showScan();
  void rerender;
}
