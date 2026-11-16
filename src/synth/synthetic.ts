import type { FinishLine, RGBAImage } from '../types';

/**
 * 合成比赛视频(帧序列),用于验证:已知每名选手的冲线帧号,
 * 跑完整条"采样→拼图→检测→换算"流水线后,读数误差不得超过一帧。
 */

export interface SyntheticAthlete {
  lane: number;
  /** 冲线帧号(躯干前沿到达终点线的那一帧) */
  crossFrame: number;
  /** 躯干所在行带(沿终点线方向的样本坐标范围) */
  rowStart: number;
  rowEnd: number;
}

export interface SyntheticRace {
  fps: number;
  width: number;
  height: number;
  line: FinishLine;
  frameCount: number;
  gunSec: number;
  athletes: SyntheticAthlete[];
  frames: RGBAImage[];
}

/** 确定性伪随机(LCG),避免测试抖动 */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

/** 终点线在画面行 y 处的 x 坐标 */
function lineXAt(line: FinishLine, y: number): number {
  const dy = line.y2 - line.y1;
  const t = dy === 0 ? 0 : (y - line.y1) / dy;
  return line.x1 + (line.x2 - line.x1) * Math.min(1, Math.max(0, t));
}

export interface SyntheticOptions {
  fps?: number;
  width?: number;
  height?: number;
  frameCount?: number;
  /** 终点线(可斜) */
  line?: FinishLine;
  /** 每名选手:道次、冲线帧、速度(px/帧) */
  athletes?: { lane: number; crossFrame: number; speed: number }[];
  gunFrame?: number;
  seed?: number;
}

export function generateSyntheticRace(opts: SyntheticOptions = {}): SyntheticRace {
  const fps = opts.fps ?? 240;
  const width = opts.width ?? 320;
  const height = opts.height ?? 240;
  const frameCount = opts.frameCount ?? 400;
  const line = opts.line ?? { x1: 140, y1: 0, x2: 170, y2: height - 1 }; // 故意斜的
  const gunFrame = opts.gunFrame ?? 100;
  const specs = opts.athletes ?? [
    { lane: 1, crossFrame: 250, speed: 2.0 },
    { lane: 2, crossFrame: 253, speed: 2.0 },
    { lane: 3, crossFrame: 253, speed: 2.0 }, // 与 2 道几乎同时撞线
  ];
  const rand = lcg(opts.seed ?? 42);

  // 每条道一个行带
  const bandH = Math.floor(height / (specs.length + 1));
  const athletes: SyntheticAthlete[] = specs.map((s, i) => ({
    lane: s.lane,
    crossFrame: s.crossFrame,
    rowStart: Math.floor((i + 0.5) * bandH),
    rowEnd: Math.floor((i + 1.5) * bandH) - 1,
  }));

  const frames: RGBAImage[] = [];
  for (let f = 0; f < frameCount; f++) {
    const data = new Uint8ClampedArray(width * height * 4);
    // 深灰背景 + 少量噪声
    for (let i = 0; i < width * height; i++) {
      const v = 40 + rand() * 10;
      data[i * 4] = v;
      data[i * 4 + 1] = v;
      data[i * 4 + 2] = v;
      data[i * 4 + 3] = 255;
    }
    // 每名选手:一个亮块(躯干),匀速向右移动
    specs.forEach((s, i) => {
      const a = athletes[i];
      const rowMid = (a.rowStart + a.rowEnd) / 2;
      const lx = lineXAt(line, rowMid);
      // 冲线帧时躯干前沿到达终点线:前沿 x = lx,块宽 10,中心在 lx-5
      const frontX = lx + (f - s.crossFrame) * s.speed;
      const x0 = Math.round(frontX - 10);
      const x1 = Math.round(frontX);
      for (let y = a.rowStart; y <= a.rowEnd; y++) {
        for (let x = Math.max(0, x0); x <= Math.min(width - 1, x1); x++) {
          const o = (y * width + x) * 4;
          data[o] = 230;
          data[o + 1] = 220;
          data[o + 2] = 200;
        }
      }
    });
    frames.push({ data, width, height });
  }

  return {
    fps,
    width,
    height,
    line,
    frameCount,
    gunSec: gunFrame / fps,
    athletes,
    frames,
  };
}
