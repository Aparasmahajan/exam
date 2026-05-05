import React, { useState } from 'react';
import { ExamData } from '../types/exam';
import { loadExamData } from '../utils/examUtils';

interface ExamLoginProps {
  onStart: (
    examData: ExamData,
    studentName: string,
    screenStream: MediaStream | null,
    cameraStream: MediaStream | null
  ) => Promise<{ ok: boolean; error?: string }>;
  externalError?: string;
}

type Step = 'form' | 'preview';

export const ExamLogin: React.FC<ExamLoginProps> = ({ onStart, externalError }) => {
  const [studentName, setStudentName] = useState('');
  const [examCode, setExamCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState<Step>('form');
  const [loadedExam, setLoadedExam] = useState<ExamData | null>(null);

  const explainMediaError = (err: unknown, source: 'screen' | 'camera'): string => {
    const e = err as DOMException | undefined;
    const name = e?.name ?? '';
    const label = source === 'screen' ? 'Screen sharing' : 'Camera/Microphone';
    if (!window.isSecureContext) {
      return `${label} is blocked — this page must run at https:// or http://localhost.`;
    }
    if (!navigator.mediaDevices) {
      return `${label} is not supported in this browser (navigator.mediaDevices unavailable).`;
    }
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      return `${label} permission was denied. Allow access in browser site settings and try again.`;
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return source === 'camera'
        ? 'No camera/microphone device found. Connect a device and try again.'
        : 'No screen source found for sharing.';
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
      return `${label} could not start — the device/source may be busy or blocked by the OS.`;
    }
    if (name === 'AbortError') {
      return `${label} request was interrupted. Please try again.`;
    }
    if (name === 'SecurityError') {
      return `${label} is blocked by browser security policy.`;
    }
    if (source === 'screen') {
      return 'Screen sharing failed. Please select a screen/window and allow sharing.';
    }
    return 'Camera/Microphone failed. Check browser permission and OS privacy settings.';
  };

  const handleLoad = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!studentName.trim()) { setError('Please enter your name'); return; }
    if (!examCode.trim()) { setError('Please enter exam code'); return; }
    setLoading(true);
    const data = await loadExamData(examCode.toUpperCase());
    setLoading(false);
    if (!data) { setError('Invalid exam code. Please check and try again.'); return; }
    setLoadedExam(data);
    setStep('preview');
  };

  /**
   * Both getDisplayMedia (screen) and getUserMedia (camera) are called HERE,
   * directly inside the button-click handler, so the browser's user-gesture
   * context is fully active for both calls. Passing them into onStart avoids
   * triggering permission prompts deep inside async chains.
   */
  const handleBegin = async () => {
    if (!loadedExam) return;
    setError('');
    setStarting(true);

    // ── 1. Screen share ──────────────────────────────────────────────────────
    // Must be the FIRST await — getDisplayMedia has the strictest gesture requirement.
    let screenStream: MediaStream | null = null;
    if (loadedExam.recordScreen) {
      try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: { ideal: 15, max: 30 } },
          audio: false,
        });
      } catch (err) {
        setError(explainMediaError(err, 'screen'));
        setStarting(false);
        return;
      }
    }

    // ── 2. Camera + microphone ───────────────────────────────────────────────
    // Requested immediately after screen, still within the same gesture chain.
    let cameraStream: MediaStream | null = null;
    if (loadedExam.recordCamera) {
      try {
        cameraStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
      } catch (err) {
        // Clean up screen stream if camera fails
        screenStream?.getTracks().forEach((t) => t.stop());
        setError(explainMediaError(err, 'camera'));
        setStarting(false);
        return;
      }
    }

    // ── 3. Hand off to App ───────────────────────────────────────────────────
    const result = await onStart(loadedExam, studentName.trim(), screenStream, cameraStream);
    setStarting(false);
    if (!result.ok) {
      // Clean up streams if start failed
      screenStream?.getTracks().forEach((t) => t.stop());
      cameraStream?.getTracks().forEach((t) => t.stop());
      setError(result.error ?? 'Unable to start exam.');
      setStep('form');
    }
  };

  const handleBack = () => {
    setStep('form');
    setLoadedExam(null);
    setError('');
  };

  const totalQuestions = loadedExam?.sections.reduce((acc, s) => acc + s.questions.length, 0) ?? 0;
  const totalMarks = loadedExam?.sections.reduce(
    (acc, s) => s.questions.reduce((a, q) => a + q.marks, acc), 0
  ) ?? 0;
  const durationMins = loadedExam ? Math.round(loadedExam.duration / 60) : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">

        {step === 'form' && (
          <>
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-gray-800 mb-2">Exam Portal</h1>
              <p className="text-gray-600">Enter your details to begin</p>
            </div>
            <form onSubmit={handleLoad} className="space-y-6">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                  Full Name
                </label>
                <input
                  type="text" id="name" value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                  placeholder="Enter your full name"
                />
              </div>
              <div>
                <label htmlFor="code" className="block text-sm font-medium text-gray-700 mb-2">
                  Exam Code
                </label>
                <input
                  type="text" id="code" value={examCode}
                  onChange={(e) => setExamCode(e.target.value.toUpperCase())}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none uppercase"
                  placeholder="Enter exam code"
                />
              </div>
              {(error || externalError) && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                  {externalError || error}
                </div>
              )}
              <button
                type="submit" disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Loading…' : 'Load Exam'}
              </button>
            </form>
          </>
        )}

        {step === 'preview' && loadedExam && (
          <>
            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold text-gray-800 mb-1">{loadedExam.examTitle}</h1>
              <p className="text-gray-500 text-sm">{loadedExam.examCode}</p>
            </div>

            <div className="bg-gray-50 rounded-xl p-4 mb-6 space-y-2 text-sm text-gray-700">
              <div className="flex justify-between">
                <span className="text-gray-500">Student</span>
                <span className="font-medium">{studentName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Duration</span>
                <span className="font-medium">{durationMins} min</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Questions</span>
                <span className="font-medium">{totalQuestions}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Total Marks</span>
                <span className="font-medium">{totalMarks}</span>
              </div>
              {loadedExam.recordCamera && (
                <div className="flex justify-between text-orange-600 font-medium pt-1 border-t border-orange-100">
                  <span>📷 Camera &amp; Mic</span>
                  <span>Required — allow when prompted</span>
                </div>
              )}
              {loadedExam.recordScreen && (
                <div className="flex justify-between text-orange-600 font-medium">
                  <span>🖥 Screen Recording</span>
                  <span>Required — allow when prompted</span>
                </div>
              )}
            </div>

            {(error || externalError) && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">
                {error || externalError}
              </div>
            )}

            <div className="space-y-3">
              <button
                onClick={handleBegin} disabled={starting}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-6 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {starting ? 'Starting… (allow permissions if prompted)' : 'Begin Exam'}
              </button>
              <button
                onClick={handleBack} disabled={starting}
                className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 px-6 rounded-lg transition disabled:opacity-50"
              >
                Back
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
