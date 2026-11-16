import { describe, it, expect } from 'vitest';
import { detectGunshot } from '../src/audio/gunshot';
import { formatRaceTime, raceTime, frameDuration } from '../src/scan/timing';

describe('发令枪检测', () => {
  it('在合成音轨中定位枪声,误差 < 10ms', () => {
    const rate = 48000;
    const gunAt = 1.25; // 秒
    const samples = new Float32Array(rate * 3);
    // 背景低噪声
    let seed = 7;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0xffffffff - 0.5;
    };
    for (let i = 0; i < samples.length; i++) samples[i] = rand() * 0.01;
    // 枪声:指数衰减的强脉冲
    const start = Math.floor(gunAt * rate);
    for (let i = 0; i < rate * 0.1; i++) {
      samples[start + i] += rand() * 4 * Math.exp(-i / (rate * 0.01));
    }
    const t = detectGunshot(samples, rate);
    expect(Math.abs(t - gunAt)).toBeLessThan(0.01);
  });
});

describe('时间换算与格式化', () => {
  it('一帧时长', () => {
    expect(frameDuration(240)).toBeCloseTo(1 / 240, 10);
  });

  it('比赛用时 = 帧时刻 - 零点', () => {
    expect(raceTime(340, 240, 100 / 240)).toBeCloseTo(1.0, 10);
  });

  it('格式化到千分之一秒', () => {
    expect(formatRaceTime(12.3456)).toBe('12.346');
    expect(formatRaceTime(65.4321)).toBe('1:05.432');
    expect(formatRaceTime(9.999)).toBe('9.999');
  });
});
