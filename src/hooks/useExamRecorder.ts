import { useRef, useCallback, useState } from 'react';

const API_BASE = 'http://localhost:8080';

const getSupportedMimeType = (forScreen = false): string => {
  const types = forScreen
    ? ['video/webm; codecs=vp9', 'video/webm; codecs=vp8', 'video/webm']
    : ['video/webm; codecs=vp9,opus', 'video/webm; codecs=vp8,opus', 'video/webm'];
  return types.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
};

const uploadChunk = async (
  blob: Blob,
  sessionKey: string,
  source: string,
  chunkIndex: number
): Promise<void> => {
  const formData = new FormData();
  formData.append('file', blob, `${source}_chunk_${String(chunkIndex).padStart(4, '0')}.webm`);
  formData.append('sessionKey', sessionKey);
  formData.append('source', source);
  formData.append('chunkIndex', String(chunkIndex));
  try {
    await fetch(`${API_BASE}/api/media/chunk`, { method: 'POST', body: formData });
  } catch (err) {
    console.error('Chunk upload failed:', err);
  }
};

/**
 * WebM chunks from MediaRecorder: only the FIRST ondataavailable blob contains the
 * EBML init segment (codec/track headers). Subsequent blobs are raw cluster data and
 * cannot be opened independently by any media player.
 *
 * Fix: cache the init segment and prepend it to every subsequent chunk before upload,
 * so each file on disk is a self-contained, playable WebM.
 */
const buildPlayableChunk = (initSegment: Blob, clusterData: Blob): Blob =>
  new Blob([initSegment, clusterData], { type: clusterData.type || 'video/webm' });

export type ScreenShareStatus = 'idle' | 'sharing' | 'stopped';

export const useExamRecorder = (sessionKey: string | null) => {
  const cameraRecorder = useRef<MediaRecorder | null>(null);
  const screenRecorder = useRef<MediaRecorder | null>(null);
  const cameraStream = useRef<MediaStream | null>(null);
  const screenStream = useRef<MediaStream | null>(null);
  const cameraChunk = useRef(0);
  const screenChunk = useRef(0);

  // Init segments — only the first blob per recorder contains the WebM headers
  const cameraInitSegment = useRef<Blob | null>(null);
  const screenInitSegment = useRef<Blob | null>(null);

  const [screenStatus, setScreenStatus] = useState<ScreenShareStatus>('idle');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [screenError, setScreenError] = useState<string | null>(null);

  const startCameraRecording = useCallback(async (): Promise<boolean> => {
    if (!sessionKey) return false;
    // Clean up any existing recording
    if (cameraRecorder.current && cameraRecorder.current.state !== 'inactive') {
      cameraRecorder.current.stop();
    }
    cameraStream.current?.getTracks().forEach((t) => t.stop());
    cameraChunk.current = 0;
    cameraInitSegment.current = null;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      cameraStream.current = stream;
      const mimeType = getSupportedMimeType(false);
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      cameraRecorder.current = recorder;

      recorder.ondataavailable = async (e) => {
        if (e.data.size === 0) return;
        const idx = cameraChunk.current++;

        if (idx === 0) {
          // First chunk IS the init segment — cache it and upload as-is
          cameraInitSegment.current = e.data;
          await uploadChunk(e.data, sessionKey, 'camera', idx);
        } else {
          // Prepend cached init segment so the chunk is independently playable
          const blob = cameraInitSegment.current
            ? buildPlayableChunk(cameraInitSegment.current, e.data)
            : e.data;
          await uploadChunk(blob, sessionKey, 'camera', idx);
        }
      };

      recorder.start(10_000);
      setCameraError(null);
      return true;
    } catch (err: any) {
      setCameraError(err?.message ?? 'Camera access denied');
      return false;
    }
  }, [sessionKey]);

  const startScreenRecording = useCallback(async (): Promise<boolean> => {
    if (!sessionKey) return false;
    // Clean up any existing recording
    if (screenRecorder.current && screenRecorder.current.state !== 'inactive') {
      screenRecorder.current.stop();
    }
    screenStream.current?.getTracks().forEach((t) => t.stop());
    screenChunk.current = 0;
    screenInitSegment.current = null;

    try {
      const stream = await (navigator.mediaDevices as any).getDisplayMedia({
        video: { displaySurface: 'monitor' },
        audio: false,
        preferCurrentTab: false,
        selfBrowserSurface: 'exclude',
        surfaceSwitching: 'exclude',
      });

      const track = stream.getVideoTracks()[0];
      const settings = track.getSettings() as any;

      // Reject anything that isn't the full monitor
      if (settings.displaySurface && settings.displaySurface !== 'monitor') {
        stream.getTracks().forEach((t: MediaStreamTrack) => t.stop());
        setScreenError('Please share your entire screen, not a window or browser tab.');
        return false;
      }

      screenStream.current = stream;
      setScreenStatus('sharing');
      setScreenError(null);

      const mimeType = getSupportedMimeType(true);
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      screenRecorder.current = recorder;

      recorder.ondataavailable = async (e) => {
        if (e.data.size === 0) return;
        const idx = screenChunk.current++;

        if (idx === 0) {
          screenInitSegment.current = e.data;
          await uploadChunk(e.data, sessionKey, 'screen', idx);
        } else {
          const blob = screenInitSegment.current
            ? buildPlayableChunk(screenInitSegment.current, e.data)
            : e.data;
          await uploadChunk(blob, sessionKey, 'screen', idx);
        }
      };

      // When user stops sharing via browser UI — exam continues uninterrupted
      track.addEventListener('ended', () => {
        setScreenStatus('stopped');
        screenStream.current = null;
      });

      recorder.start(10_000);
      return true;
    } catch (err: any) {
      if (err?.name !== 'NotAllowedError') {
        setScreenError(err?.message ?? 'Screen share failed');
      }
      return false;
    }
  }, [sessionKey]);

  const stopAllRecording = useCallback(() => {
    if (cameraRecorder.current && cameraRecorder.current.state !== 'inactive') {
      cameraRecorder.current.stop();
    }
    if (screenRecorder.current && screenRecorder.current.state !== 'inactive') {
      screenRecorder.current.stop();
    }
    cameraStream.current?.getTracks().forEach((t) => t.stop());
    screenStream.current?.getTracks().forEach((t) => t.stop());
    cameraStream.current = null;
    screenStream.current = null;
  }, []);

  return {
    startCameraRecording,
    startScreenRecording,
    stopAllRecording,
    screenStatus,
    cameraError,
    screenError,
    setCameraError,
    setScreenError,
  };
};
