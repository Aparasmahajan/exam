import { useState, useRef } from 'react';
import { ExamLogin } from './components/ExamLogin';
import { ExamInterface } from './components/ExamInterface';
import { ResultScreen } from './components/ResultScreen';
import { FullscreenManager } from './components/FullscreenManager';
import { ExamData, Answer } from './types/exam';
import { calculateScore, createExamSession, saveResult } from './utils/examUtils';
import { useExamRecorder } from './hooks/useExamRecorder';

type AppState = 'login' | 'exam' | 'result';

function App() {
  const [state, setState] = useState<AppState>('login');
  const [examData, setExamData] = useState<ExamData | null>(null);
  const [studentName, setStudentName] = useState('');
  const [violations, setViolations] = useState(0);
  const [sessionKey, setSessionKey] = useState('');
  const [resultData, setResultData] = useState<{
    score: number;
    totalMarks: number;
    details: any[];
  } | null>(null);

  const recorder = useExamRecorder();
  const currentExamRef = useRef<ExamData | null>(null);

  const maxViolations = examData?.maxViolations ?? 3;

  const handleExamStart = async (data: ExamData, name: string) => {
    setExamData(data);
    currentExamRef.current = data;
    setStudentName(name);
    setViolations(0);

    const key = await createExamSession(name, data.examCode);
    setSessionKey(key ?? '');

    const { camera, screen } = await recorder.start(key ?? '');
    if (!camera && !screen) {
      console.warn('Recording unavailable – no camera or screen access granted.');
    }

    setState('exam');
  };

  const handleViolation = () => {
    setViolations((v) => {
      const newCount = v + 1;
      const limit = currentExamRef.current?.maxViolations ?? 3;
      if (newCount >= limit) {
        alert(`Too many violations (${limit}). Exam auto submitted.`);
        const exam = currentExamRef.current;
        if (exam) {
          submitExam(exam, []);
        }
      }
      return newCount;
    });
  };

  const submitExam = (exam: ExamData, answers: Answer[]) => {
    const result = calculateScore(exam, answers);
    setResultData(result);
    setState('result');

    recorder.stop();

    if (document.fullscreenElement) {
      document.exitFullscreen();
    }

    // Derive grade for persistence (may be empty string if grading disabled)
    const percentage = result.totalMarks > 0 ? (result.score / result.totalMarks) * 100 : 0;
    const grade = (() => {
      if (!exam.grading || exam.grading.length === 0) return null;
      const g = [...exam.grading]
        .sort((a, b) => b.minPercentage - a.minPercentage)
        .find((r) => percentage >= r.minPercentage);
      return g?.grade ?? 'F';
    })();

    saveResult(
      sessionKey,
      studentName,
      exam.examCode,
      exam.examTitle,
      result.score,
      result.totalMarks,
      grade,
      result.details
    );
  };

  const handleExamSubmit = (answers: Answer[]) => {
    if (!examData) return;
    submitExam(examData, answers);
  };

  const handleRestart = () => {
    setState('login');
    setExamData(null);
    currentExamRef.current = null;
    setStudentName('');
    setViolations(0);
    setSessionKey('');
    setResultData(null);
  };

  return (
    <FullscreenManager
      examActive={state === 'exam'}
      maxViolations={maxViolations}
      onViolation={handleViolation}
    >
      {state === 'login' && <ExamLogin onStart={handleExamStart} />}

      {state === 'exam' && examData && (
        <ExamInterface
          examData={examData}
          studentName={studentName}
          onSubmit={handleExamSubmit}
          violations={violations}
        />
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
