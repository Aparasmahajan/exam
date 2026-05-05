import { useRef, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
const CHUNK_INTERVAL_MS = 30_000;

export type RecordingSource = 'camera' | 'screen';

interface RecorderEntry {
  recorder: MediaRecorder;
  stream: MediaStream;
}

export function useExamRecorder() {
  const recorders = useRef<Map<RecordingSource, RecorderEntry>>(new Map());
  const sessionKeyRef = useRef<string>('');
  const chunkCounters = useRef<Map<RecordingSource, number>>(new Map([['camera', 0], ['screen', 0]]));

  const sendChunk = useCallback(async (source: RecordingSource, blob: Blob) => {
    const key = sessionKeyRef.current;
    if (!key || blob.size === 0) return;

    const idx = (chunkCounters.current.get(source) ?? 0) + 1;
    chunkCounters.current.set(source, idx);

    const form = new FormData();
    form.append('file', blob, `${source}_chunk_${idx}.webm`);
    form.append('sessionKey', key);
    form.append('source', source);
    form.append('chunkIndex', String(idx));

    try {
      await fetch(`${API_BASE}/api/media/chunk`, { method: 'POST', body: form });
    } catch {
      // network error — chunk lost, non-fatal
    }
  }, []);

  const startSource = useCallback(
    async (source: RecordingSource): Promise<boolean> => {
      try {
        let stream: MediaStream;
        if (source === 'camera') {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        } else {
          stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        }

        const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
          ? 'video/webm;codecs=vp9,opus'
          : 'video/webm';

        const recorder = new MediaRecorder(stream, { mimeType });

        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            sendChunk(source, e.data);
          }
        };

        recorder.start(CHUNK_INTERVAL_MS);
        recorders.current.set(source, { recorder, stream });
        return true;
      } catch {
        return false;
      }
    },
    [sendChunk]
  );

  const start = useCallback(
    async (sessionKey: string) => {
      sessionKeyRef.current = sessionKey;
      chunkCounters.current.set('camera', 0);
      chunkCounters.current.set('screen', 0);

      const cameraOk = await startSource('camera');
      const screenOk = await startSource('screen');

      return { camera: cameraOk, screen: screenOk };
    },
    [startSource]
  );

  const stop = useCallback(() => {
    recorders.current.forEach(({ recorder, stream }) => {
      if (recorder.state !== 'inactive') {
        recorder.stop();
      }
      stream.getTracks().forEach((t) => t.stop());
    });
    recorders.current.clear();
  }, []);

  return { start, stop };
}
