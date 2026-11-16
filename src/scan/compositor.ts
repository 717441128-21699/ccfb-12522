import type { RGBAImage } from '../types';

/**
 * 终点扫描图:横轴为时间(1 列 = 1 帧),纵轴为沿终点线的位置。
 * 纯缓冲实现,浏览器里再画到 canvas,Node 里可直接测试。
 */
export class ScanImage implements RGBAImage {
  readonly data: Uint8ClampedArray<ArrayBuffer>;
  /** startFrame: 第 0 列对应的视频绝对帧号 */
  constructor(
    readonly width: number, // 帧数
    readonly height: number, // 终点线采样数
    readonly startFrame: number = 0,
  ) {
    this.data = new Uint8ClampedArray(width * height * 4);
    // alpha 置满,便于直接 putImageData
    for (let i = 3; i < this.data.length; i += 4) this.data[i] = 255;
  }

  /** 把一帧的终点线采样列写入第 col 列(col 为相对 startFrame 的偏移) */
  setColumn(col: number, column: Uint8ClampedArray): void {
    if (col < 0 || col >= this.width) return;
    const n = Math.min(this.height, column.length / 4);
    for (let y = 0; y < n; y++) {
      const dst = (y * this.width + col) * 4;
      const src = y * 4;
      this.data[dst] = column[src];
      this.data[dst + 1] = column[src + 1];
      this.data[dst + 2] = column[src + 2];
      this.data[dst + 3] = 255;
    }
  }

  toImageData(): ImageData {
    return new ImageData(this.data, this.width, this.height);
  }
}
