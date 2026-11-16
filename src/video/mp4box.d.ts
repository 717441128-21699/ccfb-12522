declare module 'mp4box' {
  export interface MP4ArrayBuffer extends ArrayBuffer {
    fileStart: number;
  }
  export interface MP4Sample {
    cts: number;
    dts: number;
    duration: number;
    timescale: number;
    is_sync: boolean;
    data: Uint8Array;
  }
  export interface MP4Track {
    id: number;
    codec: string;
    timescale: number;
    track_width: number;
    track_height: number;
    nb_samples: number;
    duration: number;
  }
  export interface MP4Info {
    videoTracks: MP4Track[];
    audioTracks: MP4Track[];
  }
  export interface MP4File {
    onReady: ((info: MP4Info) => void) | null;
    onError: ((e: unknown) => void) | null;
    onSamples: ((id: number, user: unknown, samples: MP4Sample[]) => void) | null;
    appendBuffer(buf: MP4ArrayBuffer): void;
    flush(): void;
    start(): void;
    stop(): void;
    setExtractionOptions(id: number, user: unknown, opts: { nbSamples: number }): void;
    getTrackById(id: number): any;
  }
  export function createFile(): MP4File;
  export class DataStream {
    static BIG_ENDIAN: number;
    constructor(arrayBuffer?: ArrayBuffer | Uint8Array | number, byteOffset?: number, endianness?: number);
    buffer: ArrayBuffer;
  }
}
