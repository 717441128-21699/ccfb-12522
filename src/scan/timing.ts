/**
 * 时间轴换算:扫描图横轴 1 列 = 1 帧。
 * 比赛用时 = 冲线帧时刻 - 发令枪零点。
 */

/** 一帧的时长(秒) */
export function frameDuration(fps: number): number {
  return 1 / fps;
}

/** 绝对帧号 → 视频内时刻(秒) */
export function frameToSec(frame: number, fps: number): number {
  return frame / fps;
}

/** 绝对帧号 → 比赛用时(秒),gunSec 为发令枪零点 */
export function raceTime(frame: number, fps: number, gunSec: number): number {
  return frame / fps - gunSec;
}

/** 格式化为田径成绩:不足 1 分钟 "12.345",否则 "1:05.432";负值前加 - */
export function formatRaceTime(sec: number): string {
  const sign = sec < 0 ? '-' : '';
  const a = Math.abs(sec);
  const m = Math.floor(a / 60);
  const s = a - m * 60;
  if (m > 0) return `${sign}${m}:${s.toFixed(3).padStart(6, '0')}`;
  return `${sign}${s.toFixed(3)}`;
}
