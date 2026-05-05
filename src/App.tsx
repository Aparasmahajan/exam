import { useState, useRef } from 'react';
import { ExamLogin } from './components/ExamLogin';
import { ExamInterface } from './components/ExamInterface';
import { ResultScreen } from './components/ResultScreen';
import { FullscreenManager } from './components/FullscreenManager';
import { ExamData, Answer } from './types/exam';
import { calculateScore, createExamSession, saveResult, generateSessionKey } from './utils/examUtils';
import { useExamRecorder } from './hooks/useExamRecorder';

type AppState = 'login' | 'exam' | 'result';

interface ScreenShareWarning {
  stopsUsed: number;
  stopsLimit: number;
}

function App() {
  const [state, setState] = useState<AppState>('login');
  const [examData, setExamData] = useState<ExamData | null>(null);
  const [studentName, setStudentName] = useState('');
  const [violations, setViolations] = useState(0);
  const [screenShareWarning, setScreenShareWarning] = useState<ScreenShareWarning | null>(null);
  const [suppressSharing, setSuppressSharing] = useState(false);
  const [resultData, setResultData] = useState<{
    score: number;
    totalMarks: number;
    details: any[];
  } | null>(null);

  const recorder = useExamRecorder();
  const currentExamRef = useRef<ExamData | null>(null);
  const sessionKeyRef = useRef('');
  const studentNameRef = useRef('');
  const screenStopCountRef = useRef(0);
  const stateRef = useRef<AppState>('login');

  const maxViolations = examData?.maxViolations ?? 3;

  // ── exam submit (single path for all submit scenarios) ───────────────────────

  const submitExam = (exam: ExamData, answers: Answer[]) => {
    if (stateRef.current !== 'exam') return;
    stateRef.current = 'result';

    const result = calculateScore(exam, answers);
    setResultData(result);
    setState('result');
    setScreenShareWarning(null);
    setSuppressSharing(false);

    recorder.stop();
    if (document.fullscreenElement) document.exitFullscreen();

    const percentage = result.totalMarks > 0 ? (result.score / result.totalMarks) * 100 : 0;
    const grade = (() => {
      if (!exam.grading || exam.grading.length === 0) return null;
      const g = [...exam.grading]
        .sort((a, b) => b.minPercentage - a.minPercentage)
        .find((r) => percentage >= r.minPercentage);
      return g?.grade ?? 'F';
    })();

    saveResult(
      sessionKeyRef.current,
      studentNameRef.current,
      exam.examCode,
      exam.examTitle,
      result.score,
      result.totalMarks,
      grade,
      result.details
    );
  };

  // ── screen-share stop handler ─────────────────────────────────────────────────

  const buildScreenShareStopHandler = (exam: ExamData): (() => void) => {
    const limit = exam.maxScreenShareViolations!;
    return () => {
      if (stateRef.current !== 'exam') return;
      const newCount = screenStopCountRef.current + 1;
      screenStopCountRef.current = newCount;

      if (newCount >= limit) {
        setScreenShareWarning(null);
        submitExam(exam, []);
      } else {
        setScreenShareWarning({ stopsUsed: newCount, stopsLimit: limit });
      }
    };
  };

  // ── exam start ────────────────────────────────────────────────────────────────
  // Both streams arrive pre-acquired from ExamLogin's button-click handler.

  const handleExamStart = async (
    data: ExamData,
    name: string,
    screenStream: MediaStream | null,
    cameraStream: MediaStream | null
  ): Promise<{ ok: boolean; error?: string }> => {
    setExamData(data);
    currentExamRef.current = data;
    setStudentName(name);
    studentNameRef.current = name;
    setViolations(0);
    screenStopCountRef.current = 0;

    const key = generateSessionKey(name, data.examCode);
    sessionKeyRef.current = key;

    const stopHandler =
      data.maxScreenShareViolations !== undefined
        ? buildScreenShareStopHandler(data)
        : () => {};

    recorder.start(key, screenStream, cameraStream, stopHandler);

    stateRef.current = 'exam';
    setState('exam');

    // Persist session on server async; swap in server key if different
    createExamSession(name, data.examCode)
      .then((serverKey) => {
        if (serverKey && serverKey !== key) {
          sessionKeyRef.current = serverKey;
        }
      })
      .catch(() => {});

    return { ok: true };
  };

  // ── violation handler ─────────────────────────────────────────────────────────

  const handleViolation = () => {
    setViolations((v) => {
      const newCount = v + 1;
      const limit = currentExamRef.current?.maxViolations ?? 3;
      if (newCount >= limit) {
        const exam = currentExamRef.current;
        if (exam) submitExam(exam, []);
      }
      return newCount;
    });
  };

  // ── reshare screen (mid-exam) ─────────────────────────────────────────────────

  const handleReshareScreen = async () => {
    const exam = currentExamRef.current;
    if (!exam || exam.maxScreenShareViolations === undefined) return;

    // Suppress tab-visibility violation while the OS screen picker is open
    setSuppressSharing(true);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    } catch {
      setSuppressSharing(false);
      return;
    }
    setSuppressSharing(false);

    const stopHandler = buildScreenShareStopHandler(exam);
    recorder.restartScreen(stream, stopHandler);
    setScreenShareWarning(null);
  };

  // ── submit from exam interface ────────────────────────────────────────────────

  const handleExamSubmit = (answers: Answer[]) => {
    if (!examData) return;
    submitExam(examData, answers);
  };

  // ── restart ───────────────────────────────────────────────────────────────────

  const handleRestart = () => {
    stateRef.current = 'login';
    setState('login');
    setExamData(null);
    currentExamRef.current = null;
    setStudentName('');
    studentNameRef.current = '';
    setViolations(0);
    sessionKeyRef.current = '';
    setResultData(null);
    setScreenShareWarning(null);
    setSuppressSharing(false);
    screenStopCountRef.current = 0;
  };

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <FullscreenManager
      examActive={state === 'exam'}
      maxViolations={maxViolations}
      suppressVisibilityViolation={suppressSharing}
      onViolation={handleViolation}
    >
      {state === 'login' && (
        <ExamLogin onStart={handleExamStart} />
      )}

      {state === 'exam' && examData && (
        <>
          {screenShareWarning && (
            <div className="fixed top-0 left-0 right-0 z-40 bg-orange-500 text-white px-4 py-3 flex items-center justify-between shadow-lg">
              <span className="font-medium text-sm">
                ⚠ Screen sharing stopped! Warning {screenShareWarning.stopsUsed}/
                {screenShareWarning.stopsLimit} — reshare to continue.
              </span>
              <button
                onClick={handleReshareScreen}
                className="ml-4 px-4 py-1 bg-white text-orange-600 font-semibold rounded hover:bg-orange-50 transition text-sm"
              >
                Reshare Screen
              </button>
            </div>
          )}

          <ExamInterface
            examData={examData}
            studentName={studentName}
            onSubmit={handleExamSubmit}
            violations={violations}
            hasScreenShareBanner={!!screenShareWarning}
          />
        </>
      )}

      {state === 'result' && examData && resultData && (
        <ResultScreen
          examData={examData}
          studentName={studentName}
          score={resultData.score}
          totalMarks={resultData.totalMarks}
          details={resultData.details}
          onRestart={handleRestart}
        />
      )}
    </FullscreenManager>
  );
}

export default App;
