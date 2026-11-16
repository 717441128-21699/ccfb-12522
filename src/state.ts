import type { EventMeta } from './types';
import type { ScanImage } from './scan/compositor';
import type { VideoInfo } from './video/decoder';

const LS_KEY = 'photo-finish-events-v1';

/** 运行时状态(视频文件与扫描图不进 localStorage) */
export interface Runtime {
  videoFile: File | null;
  videoInfo: VideoInfo | null;
  scan: ScanImage | null;
}

export const state = {
  events: [] as EventMeta[],
  currentId: null as string | null,
  runtime: new Map<string, Runtime>(),
};

export function runtimeOf(id: string): Runtime {
  let r = state.runtime.get(id);
  if (!r) {
    r = { videoFile: null, videoInfo: null, scan: null };
    state.runtime.set(id, r);
  }
  return r;
}

export function currentEvent(): EventMeta | null {
  return state.events.find((e) => e.id === state.currentId) ?? null;
}

export function load(): void {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { events: EventMeta[]; currentId: string | null };
      state.events = parsed.events ?? [];
      state.currentId = parsed.currentId ?? null;
    }
  } catch {
    // 损坏则重来
  }
}

export function save(): void {
  localStorage.setItem(LS_KEY, JSON.stringify({ events: state.events, currentId: state.currentId }));
}

export function newId(): string {
  return `ev-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}
