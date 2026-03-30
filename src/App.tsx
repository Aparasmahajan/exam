import { useState } from 'react';
import { ExamLogin } from './components/ExamLogin';
import { ExamInterface } from './components/ExamInterface';
import { ResultScreen } from './components/ResultScreen';
import { FullscreenManager } from './components/FullscreenManager';
import { ExamData, Answer } from './types/exam';
import { calculateScore } from './utils/examUtils';

type AppState = 'login' | 'exam' | 'result';

function App() {
  const [state, setState] = useState<AppState>('login');
  const [examData, setExamData] = useState<ExamData | null>(null);
  const [studentName, setStudentName] = useState('');
  const [violations, setViolations] = useState(0);
  const [resultData, setResultData] = useState<{
    score: number;
    totalMarks: number;
    details: any[];
  } | null>(null);

  const handleExamStart = (data: ExamData, name: string) => {
    setExamData(data);
    setStudentName(name);
    setState('exam');
    setViolations(0);
  };

  const handleViolation = () => {
    setViolations((v) => {
      const newCount = v + 1;
      if (newCount >= 3) {
        alert('Too many violations. Test auto submitted.');
        if (examData) {
          handleExamSubmit([]);
        }
      }
      return newCount;
    });
  };

  const handleExamSubmit = (answers: Answer[]) => {
    if (!examData) return;

    const result = calculateScore(examData, answers);
    setResultData(result);
    setState('result');

    if (document.fullscreenElement) {
      document.exitFullscreen();
    }
  };

  const handleRestart = () => {
    setState('login');
    setExamData(null);
    setStudentName('');
    setViolations(0);
    setResultData(null);
  };

  return (
    <FullscreenManager examActive={state === 'exam'} onViolation={handleViolation}>
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
