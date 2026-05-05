export interface Option {
  id: string;
  text: string;
  type: 'text' | 'image';
}

export interface Question {
  id: string;
  number: number;
  type: 'mcq' | 'subjective';
  multipleChoice?: boolean;
  question: string;
  options?: Option[];
  correctAnswer: string[];
  marks: number;
  negativeMarks: number;
  timeLimit: number | null;
}

export interface Section {
  sectionId: string;
  sectionName: string;
  questions: Question[];
}

export interface GradeRule {
  grade: string;
  minPercentage: number;
}

export interface ResultConfig {
  showStudentName?: boolean;
  showExamCode?: boolean;
  showScore?: boolean;
  showTotalMarks?: boolean;
  showGrade?: boolean;
  showPerformanceSummary?: boolean;
  showQuestionResults?: boolean;
  showDownloadPDF?: boolean;
  showTakeAnotherExam?: boolean;
}

export interface ExamData {
  examCode: string;
  examTitle: string;
  duration: number;
  /** default true — false means forward-only (no going back) */
  canNavigate?: boolean;
  submissionType: 'complete' | 'sectionwise';
  maxViolations?: number;
  maxScreenShareViolations?: number;
  /** default false */
  recordCamera?: boolean;
  /** default false */
  recordScreen?: boolean;
  /** default false */
  shuffleQuestions?: boolean;
  grading?: GradeRule[];
  resultConfig?: ResultConfig;
  sections: Section[];
}

export interface Answer {
  questionId: string;
  answer: string | string[];
  isMarked?: boolean;
}

export interface QuestionStatus {
  questionId: string;
  status: 'not-visited' | 'not-answered' | 'answered' | 'marked';
}
