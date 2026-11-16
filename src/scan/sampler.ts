import type { FinishLine, RGBAImage } from '../types';

/**
 * 沿终点线采样一列像素(双线性插值),写入 out(RGBA,长度 >= 4*样本数)。
 * 返回样本数。样本数 = round(线段长度)+1,即扫描图纵轴 1px ≈ 画面上 1px。
 */
export function sampleLine(img: RGBAImage, line: FinishLine, out: Uint8ClampedArray): number {
  const dx = line.x2 - line.x1;
  const dy = line.y2 - line.y1;
  const n = Math.max(1, Math.round(Math.hypot(dx, dy))) + 1;
  const { data, width, height } = img;
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1);
    const x = line.x1 + dx * t;
    const y = line.y1 + dy * t;
    // 双线性插值
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const x0c = Math.min(Math.max(x0, 0), width - 1);
    const y0c = Math.min(Math.max(y0, 0), height - 1);
    const x1c = Math.min(x0c + 1, width - 1);
    const y1c = Math.min(y0c + 1, height - 1);
    const o = i * 4;
    for (let c = 0; c < 4; c++) {
      const p00 = data[(y0c * width + x0c) * 4 + c];
      const p10 = data[(y0c * width + x1c) * 4 + c];
      const p01 = data[(y1c * width + x0c) * 4 + c];
      const p11 = data[(y1c * width + x1c) * 4 + c];
      const top = p00 + (p10 - p00) * fx;
      const bot = p01 + (p11 - p01) * fx;
      out[o + c] = top + (bot - top) * fy;
    }
  }
  return n;
}

/** 终点线采样数(扫描图高度) */
export function lineSampleCount(line: FinishLine): number {
  return Math.max(1, Math.round(Math.hypot(line.x2 - line.x1, line.y2 - line.y1))) + 1;
}
