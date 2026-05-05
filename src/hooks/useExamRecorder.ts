import { useRef, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
const CHUNK_INTERVAL_MS = 30_000;

export type RecordingSource = 'camera' | 'screen';

export interface RecorderStartResult {
  camera: boolean;
  screen: boolean;
}

interface RecorderEntry {
  recorder: MediaRecorder;
  stream: MediaStream;
}

function bestMimeType(): string {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  return candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
}

export function useExamRecorder() {
  const recorders = useRef<Map<RecordingSource, RecorderEntry>>(new Map());
  const sessionKeyRef = useRef<string>('');
  const chunkCounters = useRef<Map<RecordingSource, number>>(
    new Map([['camera', 0], ['screen', 0]])
  );

  // ─── chunk sender ────────────────────────────────────────────────────────────

  const sendChunk = useCallback(async (source: RecordingSource, blob: Blob) => {
    const key = sessionKeyRef.current;
    if (!key || blob.size === 0) return;
    const idx = (chunkCounters.current.get(source) ?? 0) + 1;
    chunkCounters.current.set(source, idx);
    const form = new FormData();
    form.append('file', blob, `${source}_chunk_${String(idx).padStart(4, '0')}.webm`);
    form.append('sessionKey', key);
    form.append('source', source);
    form.append('chunkIndex', String(idx));
    try {
      await fetch(`${API_BASE}/api/media/chunk`, { method: 'POST', body: form });
    } catch { /* non-fatal */ }
  }, []);

  // ─── wire any stream into a MediaRecorder ────────────────────────────────────

  const wireStream = useCallback(
    (source: RecordingSource, stream: MediaStream, onTrackEnded?: () => void) => {
      // Stop and remove any previous recorder for this source
      const existing = recorders.current.get(source);
      if (existing) {
        recorders.current.delete(source);
        if (existing.recorder.state !== 'inactive') existing.recorder.stop();
        existing.stream.getTracks().forEach((t) => t.stop());
      }

      if (!stream.getTracks().length) return;

      const entry: RecorderEntry = { recorder: null as unknown as MediaRecorder, stream };

      // For screen: listen for user clicking "Stop sharing" in browser toolbar
      if (onTrackEnded) {
        const tracks = stream.getVideoTracks();
        if (tracks.length > 0) {
          tracks[0].addEventListener('ended', () => {
            // Only fire if this entry is still the active one
            if (recorders.current.get(source) !== entry) return;
            recorders.current.delete(source);
            onTrackEnded();
          });
        }
      }

      const mimeType = bestMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorder.ondataavailable = (e) => {
        if (e.data?.size > 0) sendChunk(source, e.data);
      };
      recorder.start(CHUNK_INTERVAL_MS);

      entry.recorder = recorder;
      recorders.current.set(source, entry);
    },
    [sendChunk]
  );

  // ─── public API ──────────────────────────────────────────────────────────────

  /**
   * Start recording.
   * Both streams must already be acquired by the caller (from a button-click
   * handler) so that browser permission prompts fire at the right moment.
   *
   * @param sessionKey        Unique key for this exam attempt.
   * @param screenStream      Stream from getDisplayMedia, or null.
   * @param cameraStream      Stream from getUserMedia, or null.
   * @param onScreenShareStop Called when the user stops screen sharing.
   */
  const start = useCallback(
    (
      sessionKey: string,
      screenStream: MediaStream | null,
      cameraStream: MediaStream | null,
      onScreenShareStop: () => void
    ): RecorderStartResult => {
      sessionKeyRef.current = sessionKey;
      chunkCounters.current.set('camera', 0);
      chunkCounters.current.set('screen', 0);

      if (screenStream) wireStream('screen', screenStream, onScreenShareStop);
      if (cameraStream) wireStream('camera', cameraStream);

      return {
        camera: cameraStream !== null,
        screen: screenStream !== null,
      };
    },
    [wireStream]
  );

  /** Restart screen sharing with a fresh stream (from "Reshare" button). */
  const restartScreen = useCallback(
    (stream: MediaStream, onStop: () => void) => {
      wireStream('screen', stream, onStop);
    },
    [wireStream]
  );

  /**
   * Stop all recording.
   * Map is cleared BEFORE stopping tracks so any synchronous 'ended' events
   * triggered by t.stop() find an empty map and do nothing.
   */
  const stop = useCallback(() => {
    const entries = [...recorders.current.entries()];
    recorders.current.clear();
    for (const [, { recorder, stream }] of entries) {
      if (recorder.state !== 'inactive') recorder.stop();
      stream.getTracks().forEach((t) => t.stop());
    }
  }, []);

  return { start, stop, restartScreen };
}
