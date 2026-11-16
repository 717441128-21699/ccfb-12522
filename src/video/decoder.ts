import * as MP4Box from 'mp4box';
import type { MP4ArrayBuffer, MP4Sample } from 'mp4box';

export interface VideoInfo {
  fps: number;
  frameCount: number;
  width: number;
  height: number;
  durationSec: number;
}

interface Demuxed {
  info: VideoInfo;
  codec: string;
  description?: Uint8Array;
  samples: MP4Sample[];
  timescale: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 解封装 mp4,取出全部压缩样本与解码配置 */
async function demux(file: File): Promise<Demuxed> {
  const mp4 = MP4Box.createFile();
  const samples: MP4Sample[] = [];
  let ready: MP4Box.MP4Info | null = null;
  let error: unknown = null;

  mp4.onError = (e) => {
    error = e;
  };
  mp4.onReady = (info) => {
    ready = info;
    if (info.videoTracks.length > 0) {
      mp4.setExtractionOptions(info.videoTracks[0].id, null, { nbSamples: 10_000_000 });
      mp4.start();
    }
  };
  mp4.onSamples = (_id, _user, s) => {
    samples.push(...s);
  };

  const buf = (await file.arrayBuffer()) as MP4ArrayBuffer;
  buf.fileStart = 0;
  mp4.appendBuffer(buf);
  mp4.flush();

  if (error) throw new Error(`视频解析失败: ${String(error)}`);
  if (!ready) throw new Error('无法解析视频文件(仅支持 mp4/mov 封装)');
  const info: MP4Box.MP4Info = ready;
  if (info.videoTracks.length === 0) throw new Error('文件中没有视频轨');

  const track = info.videoTracks[0];
  if (samples.length === 0) throw new Error('未能提取视频样本');

  // fps:用样本时长的中位数,对变帧率更稳
  const durs = samples.map((s) => s.duration).sort((a, b) => a - b);
  const medDur = durs[Math.floor(durs.length / 2)];
  const fps = track.timescale / medDur;

  // 解码器 description(avcC / hvcC)
  let description: Uint8Array | undefined;
  const trak = mp4.getTrackById(track.id);
  for (const entry of trak.mdia.minf.stbl.stsd.entries) {
    const box = entry.avcC ?? entry.hvcC ?? entry.vpcC;
    if (box) {
      const stream = new MP4Box.DataStream(undefined, 0, MP4Box.DataStream.BIG_ENDIAN);
      box.write(stream);
      description = new Uint8Array(stream.buffer, 8); // 去掉 box 头
      break;
    }
  }

  return {
    info: {
      fps,
      frameCount: samples.length,
      width: track.track_width,
      height: track.track_height,
      durationSec: samples.length / fps,
    },
    codec: track.codec,
    description,
    samples,
    timescale: track.timescale,
  };
}

/** 只探测视频信息(不解码) */
export async function probeVideo(file: File): Promise<VideoInfo> {
  const d = await demux(file);
  return d.info;
}

/**
 * 逐帧解码。onFrame 按显示顺序收到每一帧(VideoFrame,用毕由本函数关闭,
 * 调用方如需保留请自行拷贝)。返回视频信息。
 */
export async function decodeFrames(
  file: File,
  onFrame: (frame: VideoFrame, index: number) => void | Promise<void>,
  onProgress?: (done: number, total: number) => void,
): Promise<VideoInfo> {
  const d = await demux(file);
  const { samples, timescale } = d;

  const pending: VideoFrame[] = [];
  let decodeError: unknown = null;
  let index = 0;

  const decoder = new VideoDecoder({
    output: (frame) => pending.push(frame),
    error: (e) => {
      decodeError = e;
    },
  });
  decoder.configure({
    codec: d.codec,
    codedWidth: d.info.width,
    codedHeight: d.info.height,
    description: d.description,
    hardwareAcceleration: 'prefer-software', // 240fps 逐帧取图,软解更稳
  });

  const drain = async () => {
    // 输出已是显示顺序,排序仅为保险
    pending.sort((a, b) => a.timestamp - b.timestamp);
    while (pending.length > 0) {
      const frame = pending.shift()!;
      await onFrame(frame, index);
      frame.close();
      index++;
      onProgress?.(index, samples.length);
    }
  };

  for (const s of samples) {
    if (decodeError) throw new Error(`解码失败: ${String(decodeError)}`);
    decoder.decode(
      new EncodedVideoChunk({
        type: s.is_sync ? 'key' : 'delta',
        timestamp: Math.round((s.cts * 1e6) / timescale),
        duration: Math.round((s.duration * 1e6) / timescale),
        data: s.data,
      }),
    );
    // 背压:防止队列无限增长
    while (decoder.decodeQueueSize > 30) await sleep(2);
    if (pending.length > 60) await drain();
  }
  await decoder.flush();
  await drain();
  decoder.close();
  if (decodeError) throw new Error(`解码失败: ${String(decodeError)}`);
  return d.info;
}

/** 抽取指定帧为 ImageData(用于终点线标定) */
export async function extractFrame(file: File, wantedIndex: number): Promise<ImageData> {
  let result: ImageData | null = null;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  await decodeFrames(file, (frame, index) => {
    if (index === wantedIndex && !result) {
      canvas.width = frame.displayWidth;
      canvas.height = frame.displayHeight;
      ctx.drawImage(frame, 0, 0);
      result = ctx.getImageData(0, 0, canvas.width, canvas.height);
    }
  });
  if (!result) throw new Error(`无法抽取第 ${wantedIndex} 帧`);
  return result;
}

/** 解码音轨为单声道采样(用于发令枪检测) */
export async function decodeAudio(
  file: File,
): Promise<{ samples: Float32Array; sampleRate: number }> {
  const ctx = new AudioContext();
  try {
    const buf = await ctx.decodeAudioData(await file.arrayBuffer());
    return { samples: buf.getChannelData(0), sampleRate: buf.sampleRate };
  } finally {
    void ctx.close();
  }
}
