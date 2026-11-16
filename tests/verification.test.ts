import { describe, it, expect } from 'vitest';
import { generateSyntheticRace } from '../src/synth/synthetic';
import { ScanImage } from '../src/scan/compositor';
import { sampleLine, lineSampleCount } from '../src/scan/sampler';
import { detectCrossingColumn } from '../src/scan/crossing';
import { raceTime, frameDuration } from '../src/scan/timing';

/**
 * 验收标准:用带已知冲线时刻的合成视频跑完整条
 * "逐帧采样终点线 → 拼扫描图 → 判读冲线 → 换算成绩"流水线,
 * 读数误差不得超过一帧的时长(240fps 下为 1/240 s ≈ 4.17ms)。
 */
describe('合成视频端到端验证', () => {
  const race = generateSyntheticRace();

  // 完整流水线:对每一帧沿终点线采样,拼成扫描图
  const scan = new ScanImage(race.frameCount, lineSampleCount(race.line), 0);
  const column = new Uint8ClampedArray(scan.height * 4);
  race.frames.forEach((frame, i) => {
    sampleLine(frame, race.line, column);
    scan.setColumn(i, column);
  });

  it('扫描图尺寸正确:宽=帧数,高=终点线采样数', () => {
    expect(scan.width).toBe(race.frameCount);
    expect(scan.height).toBe(lineSampleCount(race.line));
  });

  for (const a of race.athletes) {
    it(`${a.lane} 道:冲线帧读数误差 ≤ 1 帧`, () => {
      const col = detectCrossingColumn(scan, a.rowStart, a.rowEnd, 128);
      expect(col).toBeGreaterThanOrEqual(0);
      expect(Math.abs(col - a.crossFrame)).toBeLessThanOrEqual(1);
    });

    it(`${a.lane} 道:成绩换算误差 ≤ 一帧时长`, () => {
      const col = detectCrossingColumn(scan, a.rowStart, a.rowEnd, 128);
      const known = raceTime(a.crossFrame, race.fps, race.gunSec);
      const measured = raceTime(col, race.fps, race.gunSec);
      expect(Math.abs(measured - known)).toBeLessThanOrEqual(frameDuration(race.fps));
    });
  }

  it('几乎同时撞线的两名选手在扫描图上可区分', () => {
    const [a2, a3] = [race.athletes[1], race.athletes[2]];
    const c2 = detectCrossingColumn(scan, a2.rowStart, a2.rowEnd, 128);
    const c3 = detectCrossingColumn(scan, a3.rowStart, a3.rowEnd, 128);
    // 合成时 2、3 道同帧撞线,判读差应在 1 帧内
    expect(Math.abs(c2 - c3)).toBeLessThanOrEqual(1);
  });
});

describe('斜线采样', () => {
  it('斜向终点线采样数等于线段长度(±1px)', () => {
    const n = lineSampleCount({ x1: 10, y1: 0, x2: 40, y2: 239 });
    expect(Math.abs(n - Math.hypot(30, 239))).toBeLessThanOrEqual(2);
  });

  it('斜线采样取到的是线上的像素', () => {
    // 构造 100x100 图,只有 (50,50) 是白色
    const data = new Uint8ClampedArray(100 * 100 * 4);
    const o = (50 * 100 + 50) * 4;
    data[o] = data[o + 1] = data[o + 2] = data[o + 3] = 255;
    const img = { data, width: 100, height: 100 };
    // 斜线经过 (50,50)
    const line = { x1: 0, y1: 0, x2: 99, y2: 99 };
    const out = new Uint8ClampedArray(lineSampleCount(line) * 4);
    const n = sampleLine(img, line, out);
    // 中点附近应取到白色(双线性插值会分摊权重,最亮样本明显偏白即可)
    let maxV = 0;
    let maxI = 0;
    for (let i = 0; i < n; i++) {
      if (out[i * 4] > maxV) {
        maxV = out[i * 4];
        maxI = i;
      }
    }
    expect(maxV).toBeGreaterThan(100);
    expect(Math.abs(maxI - n / 2)).toBeLessThanOrEqual(2);
    // 端点附近应是黑色
    expect(out[0]).toBeLessThan(10);
  });
});
