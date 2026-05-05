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

export type ScreenShareStatus = 'idle' | 'sharing' | 'stopped';

export const useExamRecorder = (sessionKey: string | null) => {
  const cameraRecorder = useRef<MediaRecorder | null>(null);
  const screenRecorder = useRef<MediaRecorder | null>(null);
  const cameraStream = useRef<MediaStream | null>(null);
  const screenStream = useRef<MediaStream | null>(null);
  const cameraChunk = useRef(0);
  const screenChunk = useRef(0);

  const [screenStatus, setScreenStatus] = useState<ScreenShareStatus>('idle');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [screenError, setScreenError] = useState<string | null>(null);

  const startCameraRecording = useCallback(async (): Promise<boolean> => {
    if (!sessionKey) return false;
    // Stop any existing camera recording first
    if (cameraRecorder.current && cameraRecorder.current.state !== 'inactive') {
      cameraRecorder.current.stop();
    }
    cameraStream.current?.getTracks().forEach((t) => t.stop());

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      cameraStream.current = stream;
      const mimeType = getSupportedMimeType(false);
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      cameraRecorder.current = recorder;
      recorder.ondataavailable = async (e) => {
        if (e.data.size > 0) {
          await uploadChunk(e.data, sessionKey, 'camera', cameraChunk.current++);
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
    // Stop any existing screen recording first
    if (screenRecorder.current && screenRecorder.current.state !== 'inactive') {
      screenRecorder.current.stop();
    }
    screenStream.current?.getTracks().forEach((t) => t.stop());

    try {
      const stream = await (navigator.mediaDevices as any).getDisplayMedia({
        video: { displaySurface: 'monitor' },
        audio: false,
        // Discourage tab/window selection in supported browsers
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
        if (e.data.size > 0) {
          await uploadChunk(e.data, sessionKey, 'screen', screenChunk.current++);
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
