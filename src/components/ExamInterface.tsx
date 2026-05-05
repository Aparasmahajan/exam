import React, { useState, useEffect, useMemo } from 'react';
import { ExamData, Answer, QuestionStatus, Section } from '../types/exam';
import { QuestionDisplay } from './QuestionDisplay';
import { QuestionNavigator } from './QuestionNavigator';
import { formatTime } from '../utils/examUtils';

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface ExamInterfaceProps {
  examData: ExamData;
  studentName: string;
  onSubmit: (answers: Answer[]) => void;
  violations: number;
  hasScreenShareBanner?: boolean;
}

export const ExamInterface: React.FC<ExamInterfaceProps> = ({
  examData,
  studentName,
  onSubmit,
  violations,
  hasScreenShareBanner = false,
}) => {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [questionStatuses, setQuestionStatuses] = useState<QuestionStatus[]>([]);
  const [timeRemaining, setTimeRemaining] = useState(examData.duration);
  const [showNavigator, setShowNavigator] = useState(false);

  // Shuffle questions within each section once per mount (stable for the whole session)
  const effectiveSections = useMemo<Section[]>(() => {
    if (!examData.shuffleQuestions) return examData.sections;
    return examData.sections.map((section) => ({
      ...section,
      questions: shuffleArray(section.questions).map((q, idx) => ({
        ...q,
        number: idx + 1 + examData.sections
          .slice(0, examData.sections.indexOf(section))
          .reduce((acc, s) => acc + s.questions.length, 0),
      })),
    }));
  }, [examData]);

  const canNavigate = examData.canNavigate ?? true;

  const allQuestions = effectiveSections.flatMap((section) =>
    section.questions.map((q) => ({ ...q, sectionId: section.sectionId, sectionName: section.sectionName }))
  );

  const currentQuestion = allQuestions[currentQuestionIndex];

  useEffect(() => {
    const initialStatuses: QuestionStatus[] = allQuestions.map((q) => ({
      questionId: q.id,
      status: 'not-visited',
    }));
    setQuestionStatuses(initialStatuses);
  }, []);

  useEffect(() => {
    if (currentQuestion) {
      setQuestionStatuses((prev) =>
        prev.map((s) =>
          s.questionId === currentQuestion.id && s.status === 'not-visited'
            ? { ...s, status: 'not-answered' }
            : s
        )
      );
    }
  }, [currentQuestionIndex, currentQuestion]);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const handleAnswerChange = (answer: string | string[]) => {
    setAnswers((prev) => {
      const existing = prev.find((a) => a.questionId === currentQuestion.id);
      if (existing) {
        return prev.map((a) =>
          a.questionId === currentQuestion.id ? { ...a, answer } : a
        );
      }
      return [...prev, { questionId: currentQuestion.id, answer }];
    });
  };

  const handleMarkToggle = () => {
    setAnswers((prev) => {
      const existing = prev.find((a) => a.questionId === currentQuestion.id);
      if (existing) {
        return prev.map((a) =>
          a.questionId === currentQuestion.id
            ? { ...a, isMarked: !a.isMarked }
            : a
        );
      }
      return [...prev, { questionId: currentQuestion.id, answer: '', isMarked: true }];
    });
  };

  const handleNext = () => {
    if (currentQuestionIndex < allQuestions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    }
  };

  const handlePrevious = () => {
    if (currentQuestionIndex > 0 && canNavigate) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
    }
  };

  const handleSubmit = () => {
    if (window.confirm('Are you sure you want to submit your exam?')) {
      onSubmit(answers);
    }
  };

  const currentAnswer = answers.find((a) => a.questionId === currentQuestion?.id);

  return (
    <div className={`min-h-screen bg-gray-50 relative ${hasScreenShareBanner ? 'pt-12' : ''}`}>
      <div
        className="fixed inset-0 pointer-events-none z-0 flex items-center justify-center"
        style={{
          fontSize: '120px',
          color: 'rgba(0, 0, 0, 0.03)',
          fontWeight: 'bold',
          transform: 'rotate(-45deg)',
          userSelect: 'none',
        }}
      >
        {studentName}
      </div>

      <div className="relative z-10">
        <div className="bg-white shadow-md border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-800">{examData.examTitle}</h1>
              <p className="text-sm text-gray-600">
                Student: {studentName} | Code: {examData.examCode}
              </p>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-right">
                <div className={`text-2xl font-bold ${timeRemaining < 300 ? 'text-red-600' : 'text-gray-800'}`}>
                  {formatTime(timeRemaining)}
                </div>
                <div className="text-xs text-gray-500">Time Remaining</div>
              </div>
              {violations > 0 && (
                <div className="text-right">
                  <div className="text-2xl font-bold text-red-600">{violations}</div>
                  <div className="text-xs text-gray-500">Violations</div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto p-4 grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-3 space-y-4">
            {currentQuestion && (
              <QuestionDisplay
                question={currentQuestion}
                answer={currentAnswer}
                onAnswerChange={handleAnswerChange}
                onMarkToggle={handleMarkToggle}
                sectionName={currentQuestion.sectionName}
              />
            )}

            <div className="bg-white rounded-lg p-4 flex items-center justify-between">
              <button
                onClick={handlePrevious}
                disabled={currentQuestionIndex === 0 || !canNavigate}
                className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition font-medium"
              >
                Previous
              </button>

              <div className="text-sm text-gray-600">
                Question {currentQuestionIndex + 1} of {allQuestions.length}
              </div>

              <button
                onClick={handleNext}
                disabled={currentQuestionIndex === allQuestions.length - 1}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition font-medium"
              >
                {currentQuestionIndex === allQuestions.length - 1 ? 'Last Question' : 'Next'}
              </button>
            </div>

            <div className="bg-white rounded-lg p-4 flex items-center justify-between">
              <button
                onClick={() => setShowNavigator(!showNavigator)}
                className="px-6 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 transition font-medium lg:hidden"
              >
                {showNavigator ? 'Hide Navigator' : 'Show Navigator'}
              </button>

              <button
                onClick={handleSubmit}
                className="px-8 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-bold text-lg ml-auto"
              >
                Submit Exam
              </button>
            </div>
          </div>

          <div className={`${showNavigator ? 'block' : 'hidden'} lg:block`}>
            <QuestionNavigator
              examData={{ ...examData, sections: effectiveSections }}
              currentQuestionIndex={currentQuestionIndex}
              answers={answers}
              questionStatuses={questionStatuses}
              onNavigate={setCurrentQuestionIndex}
              canNavigate={canNavigate}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
