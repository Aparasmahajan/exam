import { ExamData } from '../types/exam';

export const generatePDF = (
  examData: ExamData,
  studentName: string,
  score: number,
  totalMarks: number,
  details: any[]
) => {
  const printWindow = window.open('', '', 'height=800,width=800');
  if (!printWindow) return;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Exam Result - ${examData.examCode}</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          padding: 40px;
          max-width: 800px;
          margin: 0 auto;
        }
        .header {
          text-align: center;
          margin-bottom: 30px;
          border-bottom: 2px solid #333;
          padding-bottom: 20px;
        }
        .info {
          margin-bottom: 20px;
        }
        .info-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 10px;
        }
        .score-box {
          background: #f0f0f0;
          padding: 20px;
          border-radius: 8px;
          text-align: center;
          margin: 20px 0;
        }
        .score-box h2 {
          margin: 0;
          color: #2563eb;
        }
        .questions-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 20px;
        }
        .questions-table th,
        .questions-table td {
          border: 1px solid #ddd;
          padding: 12px;
          text-align: left;
        }
        .questions-table th {
          background: #f8f8f8;
        }
        .correct {
          color: green;
          font-weight: bold;
        }
        .incorrect {
          color: red;
          font-weight: bold;
        }
        @media print {
          body {
            padding: 20px;
          }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>${examData.examTitle}</h1>
        <p>Exam Code: ${examData.examCode}</p>
      </div>

      <div class="info">
        <div class="info-row">
          <strong>Student Name:</strong>
          <span>${studentName}</span>
        </div>
        <div class="info-row">
          <strong>Date:</strong>
          <span>${new Date().toLocaleString()}</span>
        </div>
      </div>

      <div class="score-box">
        <h2>Final Score: ${score.toFixed(2)} / ${totalMarks}</h2>
        <p>Percentage: ${((score / totalMarks) * 100).toFixed(2)}%</p>
      </div>

      <table class="questions-table">
        <thead>
          <tr>
            <th>Question No.</th>
            <th>Status</th>
            <th>Marks Awarded</th>
            <th>Total Marks</th>
          </tr>
        </thead>
        <tbody>
          ${details
            .map(
              (detail) => `
            <tr>
              <td>Question ${detail.questionNumber}</td>
              <td class="${detail.correct ? 'correct' : 'incorrect'}">
                ${detail.correct ? '✓ Correct' : '✗ Incorrect'}
              </td>
              <td>${detail.marksAwarded >= 0 ? '+' : ''}${detail.marksAwarded.toFixed(2)}</td>
              <td>${detail.totalMarks}</td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    </body>
    </html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
  }, 250);
};
