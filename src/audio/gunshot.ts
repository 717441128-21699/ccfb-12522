/**
 * 发令枪声检测:在音轨中找最显著的能量突变(上升沿),作为计时零点。
 * 纯函数,输入单声道采样,返回枪声时刻(秒)。
 */
export function detectGunshot(samples: Float32Array, sampleRate: number): number {
  const win = 256;
  const hop = 64;
  const nWin = Math.floor((samples.length - win) / hop);
  if (nWin < 10) return 0;

  const energy = new Float64Array(nWin);
  for (let i = 0; i < nWin; i++) {
    let e = 0;
    const base = i * hop;
    for (let j = 0; j < win; j++) {
      const s = samples[base + j];
      e += s * s;
    }
    energy[i] = e / win;
  }

  // 找"能量 / 之前背景能量"比值最大的窗口
  let best = 0;
  let bestRatio = 0;
  const bgWin = 50;
  for (let i = 2; i < nWin; i++) {
    const from = Math.max(0, i - bgWin);
    let bg = 0;
    for (let j = from; j < i; j++) bg += energy[j];
    bg /= i - from;
    const ratio = energy[i] / (bg + 1e-12);
    if (ratio > bestRatio) {
      bestRatio = ratio;
      best = i;
    }
  }

  // 在该窗口附近精确定位:第一个超过窗口峰值 30% 的采样点
  const start = best * hop;
  const end = Math.min(samples.length, start + win * 2);
  let peak = 0;
  for (let i = start; i < end; i++) peak = Math.max(peak, Math.abs(samples[i]));
  const th = peak * 0.3;
  for (let i = start; i < end; i++) {
    if (Math.abs(samples[i]) >= th) return i / sampleRate;
  }
  return start / sampleRate;
}
