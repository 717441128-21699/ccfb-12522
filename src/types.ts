/** 终点线:画面上的两个标定点(像素坐标,可斜) */
export interface FinishLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** 与画布无关的 RGBA 图像,便于在 Node 测试中使用 */
export interface RGBAImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface Athlete {
  lane: number;
  name: string;
}

/** 一个冲线判读标记:frame 为视频中的绝对帧号 */
export interface Mark {
  lane: number;
  frame: number;
}

/** 可持久化的赛事元数据 */
export interface EventMeta {
  id: string;
  name: string; // 赛事名称,如 "校运会男子100米预赛第2组"
  distance: string; // 项目,如 "100米"
  groupName: string; // 组别
  athletes: Athlete[];
  wind: number | null; // 风速 m/s,正为顺风
  line: FinishLine | null;
  gunSec: number | null; // 发令枪声在音轨中的位置(秒),即计时零点
  marks: Mark[];
  fps: number | null;
  frameCount: number | null;
  videoFileName: string | null;
}
