import { ExamData, Answer, Question } from '../types/exam';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';

export const loadExamData = async (examCode: string): Promise<ExamData | null> => {
  // Try Spring Boot API first
  try {
    const response = await fetch(`${API_BASE}/api/exam/${examCode}`);
    if (response.ok) {
      return await response.json();
    }
  } catch {
    // backend unavailable — fall through to local JSON
  }

  // Fallback to local static JSON (dev / offline)
  try {
    const response = await fetch(`/exams/${examCode}.json`);
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error('Error loading exam:', error);
    return null;
  }
};

export const createExamSession = async (
  studentName: string,
  examCode: string
): Promise<string | null> => {
  try {
    const response = await fetch(`${API_BASE}/api/session/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentName, examCode }),
    });
    if (response.ok) {
      const data = await response.json();
      return data.sessionKey as string;
    }
  } catch {
    // backend unavailable
  }

  // Fallback: generate key client-side when backend is down
  const safeName = studentName.replace(/\s+/g, '_');
  return `${safeName}_${examCode}_${Date.now()}`;
};

export const saveResult = async (
  sessionKey: string,
  studentName: string,
  examCode: string,
  examTitle: string,
  score: number,
  totalMarks: number,
  grade: string | null,
  details: any[]
): Promise<void> => {
  try {
    await fetch(`${API_BASE}/api/result/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionKey,
        studentName,
        examCode,
        examTitle,
        score,
        totalMarks,
        grade,
        details,
      }),
    });
  } catch {
    // non-fatal
  }
};

export const calculateScore = (
  examData: ExamData,
  answers: Answer[]
): { score: number; totalMarks: number; details: any[] } => {
  let score = 0;
  let totalMarks = 0;
  const details: any[] = [];

  examData.sections.forEach((section) => {
    section.questions.forEach((question) => {
      totalMarks += question.marks;
      const userAnswer = answers.find((a) => a.questionId === question.id);

      if (!userAnswer) {
        details.push({
          questionId: question.id,
          questionNumber: question.number,
          correct: false,
          marksAwarded: 0,
          totalMarks: question.marks,
        });
        return;
      }

      const isCorrect = checkAnswer(question, userAnswer.answer);

      if (isCorrect) {
        score += question.marks;
        details.push({
          questionId: question.id,
          questionNumber: question.number,
          correct: true,
          marksAwarded: question.marks,
          totalMarks: question.marks,
        });
      } else {
        const penalty = question.negativeMarks || 0;
        score -= penalty;
        details.push({
          questionId: question.id,
          questionNumber: question.number,
          correct: false,
          marksAwarded: -penalty,
          totalMarks: question.marks,
        });
      }
    });
  });

  return { score: Math.max(0, score), totalMarks, details };
};

const checkAnswer = (question: Question, userAnswer: string | string[]): boolean => {
  if (question.type === 'mcq') {
    if (question.multipleChoice) {
      const userAns = Array.isArray(userAnswer) ? userAnswer.sort() : [userAnswer].sort();
      const correctAns = question.correctAnswer.sort();
      return JSON.stringify(userAns) === JSON.stringify(correctAns);
    } else {
      const userAns = Array.isArray(userAnswer) ? userAnswer[0] : userAnswer;
      return userAns === question.correctAnswer[0];
    }
  } else {
    const userAns = (Array.isArray(userAnswer) ? userAnswer[0] : userAnswer).toLowerCase().trim();
    return question.correctAnswer.some((ans) => ans.toLowerCase().trim() === userAns);
  }
};

export const formatTime = (seconds: number): string => {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hrs > 0) {
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};
