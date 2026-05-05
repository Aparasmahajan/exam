# Exam Proctoring Platform — Feature Reference

## Table of Contents
1. [Overview](#overview)
2. [Frontend — React App](#frontend--react-app)
   - [Exam Login](#exam-login)
   - [Exam Interface](#exam-interface)
   - [Proctoring & Security](#proctoring--security)
   - [Camera / Mic / Screen Recording](#camera--mic--screen-recording)
   - [Question Navigator](#question-navigator)
   - [Result Screen](#result-screen)
3. [Backend — Spring Boot API](#backend--spring-boot-api)
   - [Exam Data API](#exam-data-api)
   - [Session Management](#session-management)
   - [Media Storage](#media-storage)
   - [Result Storage](#result-storage)
4. [Exam JSON Configuration](#exam-json-configuration)
   - [Top-level Fields](#top-level-fields)
   - [Result Config Flags](#result-config-flags)
   - [Question Fields](#question-fields)
5. [Storage Layout](#storage-layout)
6. [Environment & Configuration](#environment--configuration)
7. [Tech Stack](#tech-stack)

---

## Overview

A full-stack secure online examination platform.  
The **React frontend** delivers a fullscreen-locked, proctored exam experience with live recording.  
The **Spring Boot backend** exposes REST APIs for exam data, session tracking, media chunk storage, and result persistence — all backed by MySQL.

---

## Frontend — React App

### Exam Login

- Student enters **Full Name** and **Exam Code** to begin.
- Exam code is auto-uppercased.
- On submit, the app calls the Spring Boot API (`GET /api/exam/{code}`) to load exam data; falls back to local `/public/exams/{code}.json` if the backend is unreachable.
- Validates that both fields are non-empty before proceeding.
- Calls `POST /api/session/create` to generate a **unique session key** (`Name_EXAMCODE_timestamp`) stored in MySQL and used for all subsequent media and result uploads.

---

### Exam Interface

- Displays exam title, student name, exam code, and a live countdown timer in the header.
- Timer turns **red** when fewer than 5 minutes remain.
- **Auto-submits** when the timer reaches zero.
- Shows the **violation count** in the header (only visible when at least one violation has occurred).
- Supports two question types:
  - **MCQ (single-choice)** — radio buttons
  - **MCQ (multiple-choice)** — checkboxes
  - **Subjective** — free-text textarea
- Options can be **text** or **image** (rendered from URL).
- **Negative marks** supported per question; shown in the question card.
- Per-question **time limit** field (defined in JSON; enforcement can be added per exam logic).
- **Mark for Review** toggle on each question.
- Previous / Next navigation buttons.
- Previous button is disabled when `canNavigate: false` (forward-only exam).
- **Submit Exam** button with a confirmation dialog.
- Semi-transparent **student name watermark** overlaid on the exam background (anti-screenshot deterrent).
- **Question shuffle**: when `shuffleQuestions: true`, questions within every section are randomly reordered once at session start and remain stable for the duration.

---

### Proctoring & Security

| Trigger | Action |
|---|---|
| Tab switch / window blur | Violation recorded |
| Fullscreen exit | Violation recorded + modal shown |
| `F12` | Blocked + violation |
| `Ctrl/Cmd + Shift + I/C/J/K/E/M/P` | Blocked + violation (DevTools shortcuts) |
| `Ctrl/Cmd + U` | Blocked + violation (View Source) |
| Right-click context menu | Blocked |

- **Exam-specific violation limit** (`maxViolations` field per exam JSON). Defaults to **3** if not set.
- Each violation shows a modal with the reason and the number of warnings remaining.
- When the violation count reaches `maxViolations`, the exam is **auto-submitted** immediately.
- Fullscreen is enforced at exam start; a "Return to Fullscreen" button is shown on every violation modal.

---

### Camera / Mic / Screen Recording

- Recording starts automatically when the exam begins.
- **Camera + microphone** stream captured via `getUserMedia`.
- **Screen capture** stream captured via `getDisplayMedia`.
  - The browser picker is pre-hinted to **Entire Screen** (`displaySurface: monitor`).
  - After the user confirms, the app checks `track.getSettings().displaySurface`. If the user shared a window or browser tab instead of a full monitor, the stream is rejected and the user is re-prompted (up to **3 attempts**).
- Both streams are recorded as **WebM** (VP9 + Opus when supported).
- Chunks are emitted every **30 seconds** and uploaded to the backend via `POST /api/media/chunk`.
- If the user clicks the browser's native **"Stop sharing"** button mid-exam, the exam is **immediately auto-submitted** — the paper does not continue.
- Recording stops automatically when the exam is submitted.
- Recording failures (denied permissions, unavailable device) are non-fatal; the exam proceeds but a console warning is emitted.

---

### Question Navigator

- Sidebar panel showing all questions grouped by section.
- Color-coded status per question:

| Color | Meaning |
|---|---|
| Green | Answered |
| Yellow | Visited but not answered |
| Purple | Marked for review |
| Grey | Not yet visited |

- Current question is highlighted with a **blue ring**.
- `canNavigate: true` — free random access; any question is clickable.
- `canNavigate: false` — **forward-only**; questions ahead of the current position are clickable (jump forward is allowed), but questions behind are greyed out and blocked. An orange banner informs the student of this rule.
- On mobile, the navigator is hidden by default and toggled with a button.

---

### Result Screen

All result fields are **opt-in per exam** via the `resultConfig` JSON object. When no flags are set (or the object is absent), the screen shows only:

> ✓ **Exam Submitted Successfully!**  
> *Exam Title*

When flags are enabled, the following sections appear:

| Flag | Shows |
|---|---|
| `showStudentName` | Student name in the score panel |
| `showExamCode` | Exam code in the score panel |
| `showScore` | Numeric score |
| `showTotalMarks` | Total marks available |
| `showGrade` | Grade letter (requires `grading` rules in exam JSON) |
| `showPerformanceSummary` | Correct / Incorrect / Unattempted counts + percentage bar |
| `showQuestionResults` | Per-question breakdown with marks awarded |
| `showDownloadPDF` | "Download PDF Report" button |
| `showTakeAnotherExam` | "Take Another Exam" button |

- **Grade** is computed from the `grading` array (sorted by `minPercentage` descending); `grading` is entirely optional per exam.
- **PDF generation** opens a print-ready HTML page in a new window and triggers the browser print dialog.
- On submit, the result data is also sent to `POST /api/result/save` — an HTML report is written to disk server-side and the record is persisted in MySQL.

---

## Backend — Spring Boot API

Base URL: `http://localhost:8080`  
All endpoints are under `/api/**`.  
CORS is pre-configured for `http://localhost:5173` and `http://localhost:3000` (configurable).

---

### Exam Data API

#### `GET /api/exam/{examCode}`

Returns the full exam JSON for the given code.

- Reads from `src/main/resources/exams/{EXAMCODE}.json`.
- Returns `404` if the exam code is not found.
- Response shape matches the frontend `ExamData` type exactly (sections, questions, grading, resultConfig, etc.).

---

### Session Management

#### `POST /api/session/create`

Creates a new proctoring session and returns a unique session key.

**Request body:**
```json
{ "studentName": "Paras Mahajan", "examCode": "EXAM001" }
```

**Response:**
```json
{
  "sessionKey": "Paras_Mahajan_EXAM001_1746453600000",
  "studentName": "Paras Mahajan",
  "examCode": "EXAM001"
}
```

- Session key format: `{Name_with_underscores}_{EXAMCODE}_{Unix-ms-timestamp}`
- Stored in the `exam_sessions` MySQL table.
- Uniqueness is guaranteed (re-generates on collision).
- The session key is used as the folder name for all stored files and as the foreign key for the result record.

---

### Media Storage

#### `POST /api/media/chunk`

Accepts a video/audio chunk (multipart form).

**Form fields:**

| Field | Type | Description |
|---|---|---|
| `file` | Binary | WebM chunk |
| `sessionKey` | String | Unique session identifier |
| `source` | String | `"camera"` or `"screen"` |
| `chunkIndex` | Integer | Sequential chunk number (1-based) |

- Saves to `{storage.base-path}/{sessionKey}/{source}/camera_chunk_0001.webm` etc.
- Max chunk size: **200 MB** (configurable).
- Returns the saved file path in the response.

---

### Result Storage

#### `POST /api/result/save`

Saves the exam result to MySQL and writes an HTML report to disk.

**Request body:**
```json
{
  "sessionKey": "Paras_Mahajan_EXAM001_1746453600000",
  "studentName": "Paras Mahajan",
  "examCode": "EXAM001",
  "examTitle": "Sample Examination",
  "score": 7.0,
  "totalMarks": 14.0,
  "grade": "C",
  "details": [{ "questionNumber": 1, "correct": true, "marksAwarded": 2, "totalMarks": 2 }, ...]
}
```

- Writes `result.html` to `{storage.base-path}/{sessionKey}/result.html`.
- Persists score, grade, and file path in the `exam_results` MySQL table.
- If a result for the session key already exists, it is **updated** (idempotent).

#### `GET /api/result/{sessionKey}`

Retrieves the stored result record for a session.

- Returns `404` if no result exists for that key.

---

## Exam JSON Configuration

Exam files live at:
- **Frontend (offline fallback):** `public/exams/{EXAMCODE}.json`
- **Backend (primary source):** `src/main/resources/exams/{EXAMCODE}.json`

### Top-level Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `examCode` | string | ✅ | Unique identifier, e.g. `EXAM001` |
| `examTitle` | string | ✅ | Display name |
| `duration` | number | ✅ | Exam length in **seconds** |
| `canNavigate` | boolean | ✅ | `true` = free navigation; `false` = forward-only |
| `submissionType` | string | ✅ | `"complete"` or `"sectionwise"` |
| `maxViolations` | number | ❌ | Auto-submit threshold (default: **3**) |
| `shuffleQuestions` | boolean | ❌ | Shuffle questions per section each session (default: `false`) |
| `grading` | array | ❌ | Grade rules `[{ "grade": "A", "minPercentage": 80 }, ...]` |
| `resultConfig` | object | ❌ | Controls which result fields are shown (see below) |
| `sections` | array | ✅ | Array of section objects |

### Result Config Flags

All flags default to **hidden** (`false` / absent). Set to `true` to display.

```json
"resultConfig": {
  "showStudentName":      true,
  "showExamCode":         true,
  "showScore":            true,
  "showTotalMarks":       true,
  "showGrade":            true,
  "showPerformanceSummary": true,
  "showQuestionResults":  true,
  "showDownloadPDF":      true,
  "showTakeAnotherExam":  true
}
```

### Question Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | ✅ | Unique question ID |
| `number` | number | ✅ | Display number |
| `type` | string | ✅ | `"mcq"` or `"subjective"` |
| `multipleChoice` | boolean | ❌ | `true` = checkboxes (multiple answers) |
| `question` | string | ✅ | Question text |
| `options` | array | MCQ only | `[{ "id": "a", "text": "...", "type": "text" \| "image" }]` |
| `correctAnswer` | string[] | ✅ | Array of correct option IDs (or subjective answer strings) |
| `marks` | number | ✅ | Marks awarded for a correct answer |
| `negativeMarks` | number | ✅ | Marks deducted for a wrong answer (use `0` to disable) |
| `timeLimit` | number \| null | ✅ | Per-question time limit in seconds (`null` = no limit) |

---

## Storage Layout

```
C:/exam-recordings/               ← configurable via storage.base-path
└── {sessionKey}/
    ├── camera/
    │   ├── camera_chunk_0001.webm
    │   ├── camera_chunk_0002.webm
    │   └── ...
    ├── screen/
    │   ├── screen_chunk_0001.webm
    │   └── ...
    └── result.html               ← HTML result report
```

---

## Environment & Configuration

### Frontend (`exam/.env`)

| Variable | Default | Description |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:8080` | Spring Boot backend base URL |

### Backend (`application.properties`)

| Property | Default | Description |
|---|---|---|
| `server.port` | `8080` | HTTP port |
| `spring.datasource.url` | `jdbc:mysql://localhost:3306/exam_db` | MySQL connection |
| `spring.datasource.username` | `root` | MySQL username |
| `spring.datasource.password` | *(set this)* | MySQL password |
| `spring.jpa.hibernate.ddl-auto` | `update` | Schema auto-management |
| `storage.base-path` | `C:/exam-recordings` | Root folder for media and reports |
| `exam.data-path` | `exams/` | Classpath folder for exam JSON files |
| `cors.allowed-origins` | `http://localhost:5173,...` | Comma-separated allowed frontend origins |
| `spring.servlet.multipart.max-file-size` | `200MB` | Max chunk upload size |

### MySQL setup

Run `src/main/resources/schema.sql` once to create the database and tables:

```sql
CREATE DATABASE IF NOT EXISTS exam_db CHARACTER SET utf8mb4;
```

Spring Boot will then manage the table schema automatically via `ddl-auto=update`.

---

## Tech Stack

### Frontend
| Technology | Version | Role |
|---|---|---|
| React | 18.3 | UI framework |
| TypeScript | 5.5 | Type safety |
| Vite | 5.4 | Build tool / dev server |
| Tailwind CSS | 3.4 | Utility-first styling |
| MediaRecorder API | Browser native | Camera, mic, screen recording |
| Lucide React | 0.344 | Icons |

### Backend
| Technology | Version | Role |
|---|---|---|
| Spring Boot | 3.4.5 | Application framework |
| Java / JDK | 25 | Runtime |
| Spring Data JPA | (via Boot) | ORM / repository layer |
| Hibernate | (via Boot) | JPA implementation |
| MySQL | 8+ | Relational database |
| MySQL Connector/J | (via Boot) | JDBC driver |
| Jackson | (via Boot) | JSON serialisation |
| Lombok | latest | Boilerplate reduction |
| Maven | 3.9+ | Build tool |
