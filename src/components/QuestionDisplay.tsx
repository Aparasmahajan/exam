import React from 'react';
import { Question, Answer } from '../types/exam';

interface QuestionDisplayProps {
  question: Question;
  answer: Answer | undefined;
  onAnswerChange: (answer: string | string[]) => void;
  onMarkToggle: () => void;
  sectionName: string;
}

export const QuestionDisplay: React.FC<QuestionDisplayProps> = ({
  question,
  answer,
  onAnswerChange,
  onMarkToggle,
  sectionName,
}) => {
  const handleMCQChange = (optionId: string) => {
    if (question.multipleChoice) {
      const currentAnswers = Array.isArray(answer?.answer) ? answer.answer : [];
      const newAnswers = currentAnswers.includes(optionId)
        ? currentAnswers.filter((id) => id !== optionId)
        : [...currentAnswers, optionId];
      onAnswerChange(newAnswers);
    } else {
      onAnswerChange(optionId);
    }
  };

  const handleSubjectiveChange = (text: string) => {
    onAnswerChange(text);
  };

  const isSelected = (optionId: string): boolean => {
    if (!answer?.answer) return false;
    if (Array.isArray(answer.answer)) {
      return answer.answer.includes(optionId);
    }
    return answer.answer === optionId;
  };

  return (
    <div className="bg-white rounded-lg p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="text-sm text-gray-500 mb-2">
            Section {sectionName} | Question {question.number}
          </div>
          <div className="flex items-start gap-4">
            <span className="text-2xl font-bold text-gray-800">Q{question.number}.</span>
            <p className="text-lg text-gray-800 mt-1">{question.question}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="text-sm font-medium text-gray-600">
            Marks: <span className="text-green-600">+{question.marks}</span>
            {question.negativeMarks > 0 && (
              <span className="text-red-600 ml-2">-{question.negativeMarks}</span>
            )}
          </div>
          <button
            onClick={onMarkToggle}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              answer?.isMarked
                ? 'bg-purple-500 text-white hover:bg-purple-600'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            {answer?.isMarked ? 'Marked' : 'Mark for Review'}
          </button>
        </div>
      </div>

      {question.type === 'mcq' && question.options && (
        <div className="space-y-3">
          {question.multipleChoice && (
            <p className="text-sm text-blue-600 font-medium">Multiple answers can be selected</p>
          )}
          {question.options.map((option) => (
            <label
              key={option.id}
              className={`flex items-center gap-4 p-4 border-2 rounded-lg cursor-pointer transition ${
                isSelected(option.id)
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <input
                type={question.multipleChoice ? 'checkbox' : 'radio'}
                name={`question-${question.id}`}
                value={option.id}
                checked={isSelected(option.id)}
                onChange={() => handleMCQChange(option.id)}
                className="w-5 h-5"
              />
              {option.type === 'text' ? (
                <span className="text-gray-800">{option.text}</span>
              ) : (
                <img
                  src={option.text}
                  alt={`Option ${option.id}`}
                  className="max-w-xs max-h-48 object-contain rounded"
                />
              )}
            </label>
          ))}
        </div>
      )}

      {question.type === 'subjective' && (
        <div>
          <textarea
            value={(answer?.answer as string) || ''}
            onChange={(e) => handleSubjectiveChange(e.target.value)}
            className="w-full p-4 border-2 border-gray-300 rounded-lg focus:border-blue-500 outline-none transition resize-none"
            rows={6}
            placeholder="Type your answer here..."
          />
        </div>
      )}
    </div>
  );
};
