import type { RGBAImage } from '../types';

/**
 * 在扫描图的指定行带内检测"冲线列":该列平均亮度首次超过阈值。
 * 用于合成视频验证;实际判读由人工在判读页完成。
 * 返回列号(相对扫描图),找不到返回 -1。
 */
export function detectCrossingColumn(
  scan: RGBAImage,
  rowStart: number,
  rowEnd: number,
  threshold: number,
): number {
  const { data, width, height } = scan;
  const r0 = Math.max(0, Math.floor(rowStart));
  const r1 = Math.min(height - 1, Math.ceil(rowEnd));
  if (r1 < r0) return -1;
  const rows = r1 - r0 + 1;
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let y = r0; y <= r1; y++) {
      const o = (y * width + x) * 4;
      sum += (data[o] + data[o + 1] + data[o + 2]) / 3;
    }
    if (sum / rows >= threshold) return x;
  }
  return -1;
}
