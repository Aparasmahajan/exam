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

/* NEW: Grade configuration */
export interface GradeRule {
  grade: string;
  minPercentage: number;
}

export interface ExamData {
  examCode: string;
  examTitle: string;
  duration: number;
  canNavigate: boolean;
  submissionType: 'complete' | 'sectionwise';

  /* NEW FIELD */
  grading: GradeRule[];

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