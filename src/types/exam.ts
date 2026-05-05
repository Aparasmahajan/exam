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
  shuffleQuestions?: boolean;
  questions: Question[];
}

export interface GradeRule {
  grade: string;
  minPercentage: number;
}

export interface RecordingConfig {
  camera?: boolean;
  screen?: boolean;
}

export interface ResultDisplayConfig {
  showStudentName?: boolean;
  showExamCode?: boolean;
  showScore?: boolean;
  showTotalMarks?: boolean;
  showGrade?: boolean;
  showPerformanceSummary?: boolean;
  showPdfDownload?: boolean;
  showRetakeButton?: boolean;
}

export interface ExamData {
  examCode: string;
  examTitle: string;
  duration: number;
  canNavigate: boolean;
  submissionType: 'complete' | 'sectionwise';
  maxViolations?: number;
  grading?: GradeRule[];
  recording?: RecordingConfig;
  resultDisplay?: ResultDisplayConfig;
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
