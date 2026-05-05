# Project Overview — Exam Proctoring Platform
> Context document for AI assistants and developers joining the project.
> Captures full architecture, data flow, design decisions, and gotchas.

---

## 1. Monorepo Layout

```
New folder/
├── exam/                  ← React + TypeScript frontend (Vite)
│   ├── public/exams/      ← Offline-fallback exam JSONs (EXAM001, EXAM002)
│   ├── src/
│   │   ├── components/    ← UI components
│   │   ├── hooks/         ← useExamRecorder
│   │   ├── types/         ← exam.ts — all TypeScript interfaces
│   │   └── utils/         ← examUtils.ts, pdfGenerator.ts
│   ├── FEATURES.md        ← User-facing feature reference
│   └── OVERVIEW.md        ← This file
│
└── exam-backend/          ← Spring Boot 3.4 + JDK 25 + MySQL backend
    └── src/main/
        ├── java/com/exam/backend/
        │   ├── config/    ← CorsConfig
        │   ├── controller/← ExamController, SessionController, MediaController, ResultController
        │   ├── dto/       ← CreateSessionRequest, SessionResponse, SaveResultRequest
        │   ├── model/     ← ExamSession, ExamResult (JPA entities)
        │   ├── repository/← Spring Data JPA repositories
        │   └── service/   ← ExamService, SessionService, MediaService, ResultService
        └── resources/
            ├── application.properties
            ├── schema.sql          ← reference DDL (Spring also auto-creates via ddl-auto)
            └── exams/              ← Authoritative exam JSONs served by API
```

---

## 2. Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend framework | React 18.3 + TypeScript 5.5 | Functional components, hooks only |
| Build tool | Vite 5.4 | Dev server on port 5173 |
| Styling | Tailwind CSS 3.4 | Utility-first, no CSS modules |
| Recording | Browser MediaRecorder API | WebM/VP9+Opus chunks |
| Icons | Lucide React 0.344 | |
| Backend framework | Spring Boot 3.4.5 | |
| Java version | JDK 25 (preview features enabled) | `--enable-preview` in pom.xml |
| ORM | Spring Data JPA + Hibernate | `ddl-auto=create` (dev) |
| Database | MySQL 8+ | Database: `exam_db` |
| Build tool | Maven 3.9+ | |

---

## 3. End-to-End Data Flow

### 3.1 Exam Start Sequence

```
Student fills ExamLogin form (name + exam code)
        │
        ▼
loadExamData(examCode)
  ├─ Try  GET http://localhost:8080/api/exam/{CODE}    ← backend (authoritative)
  └─ Fall GET /exams/{CODE}.json                       ← local public/ (offline fallback)
        │
        ▼
createExamSession(name, examCode)
  ├─ Try  POST /api/session/create  → returns sessionKey
  └─ Fall generate key client-side: Name_CODE_timestamp
        │
        ▼
recorder.start(sessionKey, recordCamera, recordScreen, maxScreenShareViolations, onScreenShareStop)
  ├─ if recordCamera === true:
  │    startCamera() → getUserMedia({video,audio})
  ├─ if recordScreen === true:
  │    startScreenCapture()
  │      → getDisplayMedia({ displaySurface: 'monitor' })
  │      → verify track.getSettings().displaySurface === 'monitor'
  │      → retry up to 3× if wrong surface
  │      → wire track.addEventListener('ended', onScreenShareStop)
  └─ if neither flag → no recording at all
  │
  ├─ screenRequired && !screenGranted  →  show error on login, BLOCK exam start
  └─ otherwise → setState('exam')
```

### 3.2 During Exam

```
┌──────────────────────────────────────────────────────┐
│                  ExamInterface                        │
│  Header: title | student | timer | violation count   │
│  Body:   QuestionDisplay (MCQ/Subjective)            │
│  Sidebar: QuestionNavigator                          │
│  Footer: Previous | Next | Submit Exam               │
└──────────────────────────────────────────────────────┘
         │                    │
         │                    ▼
         │          FullscreenManager (wraps everything)
         │            - enforces fullscreen
         │            - blocks DevTools keys
         │            - blocks right-click
         │            - counts violations → onViolation()
         │
         ▼
  MediaRecorder (background)
    - camera chunk every 30s  →  POST /api/media/chunk
    - screen chunk every 30s  →  POST /api/media/chunk
```

### 3.3 Violation Counting — TWO SEPARATE COUNTERS

| Counter | Field | Default | Triggers | On Limit |
|---|---|---|---|---|
| General violations | `maxViolations` | 3 | Tab switch, fullscreen exit, DevTools keys | Auto-submit |
| Screen-share stops | `maxScreenShareViolations` | — (absent = no screen recording) | User clicks browser "Stop sharing" | Auto-submit |

**Key:** these two counters are completely independent. A screen-share stop does NOT increment `violations`.

### 3.4 Screen-Share Stop Flow (mid-exam)

```
User clicks browser "Stop sharing"
        │
        ▼
track 'ended' event fires → onScreenShareStop()
        │
        ├─ screenStopCountRef.current++
        ├─ newCount < maxScreenShareViolations
        │     → setScreenShareWarning({ stopsUsed, stopsLimit })
        │     → orange banner appears (exam still interactive below)
        │     → student clicks "Reshare Screen"
        │           → recorder.restartScreen(onScreenShareStop)
        │                 → setIsReconnecting(true)   ← suppresses visibility violations
        │                 → getDisplayMedia(...)        ← picker opens; tab loses focus
        │                 → setIsReconnecting(false)
        │                 → new track wired, recording resumes
        │
        └─ newCount >= maxScreenShareViolations
              → clear warning banner
              → submitExam(exam, [])   ← auto-submit with empty answers
```

### 3.5 Visibility Violation Suppression

The browser tab loses focus whenever the screen-share picker opens. If this happens during an active exam, it would normally register as a tab-switch violation. Suppression mechanism:

```
recorder.isReconnecting  (React state in useExamRecorder)
    │
    ▼
App.tsx passes it as  suppressVisibilityViolation={recorder.isReconnecting}
    │
    ▼
FullscreenManager stores it in suppressRef (useRef — always latest value in handler)
    │
    ▼
handleVisibility(): if (suppressRef.current) return;   ← silently ignored
```

This also covers the INITIAL screen-share setup, which happens before `setState('exam')` — so `examActive` is still `false` and FullscreenManager isn't monitoring yet anyway.

### 3.6 Exam Submit Sequence

```
submitExam(exam, answers)  [called from: manual submit | timer expire | violation limit | screen-stop limit]
        │
        ├─ calculateScore(exam, answers)  →  { score, totalMarks, details }
        ├─ setState('result')
        ├─ recorder.stop()               ←  stops all MediaRecorders + tracks
        ├─ document.exitFullscreen()
        └─ saveResult(...)               →  POST /api/result/save
                                              → writes result.html to disk
                                              → persists ExamResult row in MySQL
```

### 3.7 Result Screen Rendering

The result screen is **fully controlled by `resultConfig` flags** in the exam JSON. If none are set, only the success header and exam title render. Each field is independent.

```
resultConfig absent or all flags false/absent
  → "✓ Exam Submitted Successfully!" + examTitle only

resultConfig with flags = true
  → showStudentName / showExamCode   → blue panel top row
  → showScore / showTotalMarks / showGrade  → blue panel bottom row
  → showPerformanceSummary            → stats + progress bar section
  → showQuestionResults               → per-question breakdown table
  → showDownloadPDF                   → opens print window (browser print dialog)
  → showTakeAnotherExam               → calls onRestart() → back to login
```

---

## 4. Frontend Component Tree

```
App.tsx                          ← state machine: 'login' | 'exam' | 'result'
└── FullscreenManager            ← wraps everything; handles all security events
    ├── ExamLogin                ← form; calls loadExamData + createExamSession
    ├── [screen-share banner]    ← orange fixed bar; rendered by App directly
    ├── ExamInterface            ← main exam UI
    │   ├── QuestionDisplay      ← renders one question (MCQ/subjective/image options)
    │   └── QuestionNavigator    ← sidebar; forward-only when canNavigate=false
    └── ResultScreen             ← conditional result rendering
```

---

## 5. Key Files and Their Responsibility

| File | Responsibility |
|---|---|
| `src/types/exam.ts` | Single source of truth for ALL TypeScript interfaces |
| `src/utils/examUtils.ts` | `loadExamData` (API + fallback), `createExamSession`, `saveResult`, `calculateScore`, `formatTime` |
| `src/utils/pdfGenerator.ts` | Opens a print window with HTML report; triggers browser print dialog |
| `src/hooks/useExamRecorder.ts` | Camera + screen recording, chunked upload, `isReconnecting` state, `restartScreen` |
| `src/components/FullscreenManager.tsx` | Fullscreen enforcement + all violation detection; `suppressVisibilityViolation` ref pattern |
| `src/components/ExamInterface.tsx` | Exam UI, timer, question shuffle (`shuffleQuestions` flag), answer state |
| `src/components/QuestionNavigator.tsx` | Forward-only vs free navigation logic |
| `src/components/ResultScreen.tsx` | `resultConfig`-driven conditional rendering |
| `src/App.tsx` | Top-level orchestration: session key, both violation counters, reshare banner |

---

## 6. Backend API Reference

Base URL: `http://localhost:8080`  All endpoints under `/api/**`

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/exam/{examCode}` | Load exam JSON from `resources/exams/` |
| POST | `/api/session/create` | Create session → returns `sessionKey` |
| POST | `/api/media/chunk` | Receive one 30s WebM chunk (multipart) |
| POST | `/api/result/save` | Save result JSON + write HTML report to disk |
| GET | `/api/result/{sessionKey}` | Fetch stored result for a session |

### Session Key Format
```
{FirstName_LastName}_{EXAMCODE}_{Unix-ms-timestamp}
e.g.  Paras_Mahajan_EXAM001_1746453600000
```
Generated by backend, stored in MySQL `exam_sessions`, used as the folder name for all stored files.

### File Storage Layout
```
C:/exam-recordings/               ← storage.base-path in application.properties
└── {sessionKey}/
    ├── camera/
    │   ├── camera_chunk_0001.webm
    │   └── camera_chunk_0002.webm
    ├── screen/
    │   ├── screen_chunk_0001.webm
    │   └── screen_chunk_0002.webm
    └── result.html
```

---

## 7. MySQL Schema

Database: `exam_db`  
`ddl-auto=create` in current `application.properties` (dev mode — recreates on every restart).

```sql
exam_sessions
  id           BIGINT PK AUTO_INCREMENT
  session_key  VARCHAR(300) UNIQUE NOT NULL   ← primary lookup key
  student_name VARCHAR(255) NOT NULL
  exam_code    VARCHAR(50)  NOT NULL
  start_time   DATETIME     NOT NULL
  created_at   DATETIME     DEFAULT NOW()

exam_results
  id           BIGINT PK AUTO_INCREMENT
  session_key  VARCHAR(300) NOT NULL          ← FK to exam_sessions (logical, not enforced)
  student_name VARCHAR(255)
  exam_code    VARCHAR(50)
  exam_title   VARCHAR(500)
  score        DOUBLE
  total_marks  DOUBLE
  grade        VARCHAR(10)
  pdf_path     VARCHAR(500)                   ← absolute path to result.html on server
  created_at   DATETIME DEFAULT NOW()
```

---

## 8. Exam JSON Full Schema

Both copies must be kept in sync:
- `exam/public/exams/{CODE}.json`         ← offline fallback for frontend
- `exam-backend/src/main/resources/exams/{CODE}.json` ← served by API (authoritative)

```jsonc
{
  "examCode":    "EXAM001",          // string, UPPERCASE
  "examTitle":   "...",
  "duration":    3600,               // seconds
  "canNavigate": true,               // false = forward-only (navigator + Previous blocked)
  "submissionType": "complete",      // "complete" | "sectionwise"

  // --- Optional proctoring fields ---
  "maxViolations": 5,                // default 3 if absent; counts tab/fullscreen/devtools
  "maxScreenShareViolations": 2,     // max screen-share stops before auto-submit (only relevant when recordScreen=true)
  "recordCamera": true,              // default false — record camera + mic for this exam
  "recordScreen": true,              // default false — require + record screen share; blocks exam start if user denies
  "shuffleQuestions": true,          // default false — shuffle questions within each section per session

  // canNavigate defaults to true; false = forward-only exam
  // shuffleQuestions defaults to false
  // recordCamera defaults to false
  // recordScreen defaults to false

  // --- Optional grading ---
  "grading": [                       // absent = no grade computed or shown
    { "grade": "S", "minPercentage": 90 },
    { "grade": "F", "minPercentage": 0  }
  ],

  // --- Optional result display config ---
  // ALL flags default to false/hidden. Only shown when explicitly true.
  "resultConfig": {
    "showStudentName":       true,
    "showExamCode":          true,
    "showScore":             true,
    "showTotalMarks":        true,
    "showGrade":             true,   // requires grading array to be present
    "showPerformanceSummary":true,
    "showQuestionResults":   true,
    "showDownloadPDF":       true,
    "showTakeAnotherExam":   true
  },

  "sections": [
    {
      "sectionId": "A",
      "sectionName": "Mathematics",
      "questions": [
        {
          "id": "q1",
          "number": 1,
          "type": "mcq",             // "mcq" | "subjective"
          "multipleChoice": false,   // true = checkboxes, false = radio
          "question": "...",
          "options": [               // only for type=mcq
            { "id": "a", "text": "...", "type": "text" },  // type: "text" | "image"
            { "id": "b", "text": "https://...", "type": "image" }
          ],
          "correctAnswer": ["b"],    // array of option IDs (mcq) or accepted strings (subjective)
          "marks": 2,
          "negativeMarks": 0.5,      // 0 = no penalty
          "timeLimit": null          // seconds or null
        }
      ]
    }
  ]
}
```

### Current Exam Configs Summary

| Field | EXAM001 | EXAM002 |
|---|---|---|
| Navigation | Free (`canNavigate: true`) | Forward-only (`canNavigate: false`) |
| Max general violations | 5 | 3 |
| Record camera + mic | Yes (`recordCamera: true`) | No (`recordCamera: false`) |
| Record screen | Yes (`recordScreen: true`) | No (`recordScreen: false`) |
| Max screen-share stops | 2 (`maxScreenShareViolations: 2`) | N/A |
| Shuffle questions | Yes (`shuffleQuestions: true`) | No (`shuffleQuestions: false`) |
| Grading | Full S/A/B/C/D/F scale | Absent |
| Result screen | All fields shown | Minimal (only title) |

---

## 9. Environment Variables

### Frontend — `exam/.env` (create this file locally)
```
VITE_API_BASE_URL=http://localhost:8080
```
Defaults to `http://localhost:8080` if absent. Frontend is resilient — falls back to local JSON if backend is unreachable.

### Backend — `exam-backend/src/main/resources/application.properties`
```properties
server.port=8080
spring.datasource.url=jdbc:mysql://localhost:3306/exam_db?useSSL=false&serverTimezone=Asia/Kolkata&allowPublicKeyRetrieval=true
spring.datasource.username=root
spring.datasource.password=root
spring.jpa.hibernate.ddl-auto=create      # WARNING: recreates tables on every restart
storage.base-path=C:/exam-recordings
exam.data-path=exams/
cors.allowed-origins=http://localhost:5173,http://localhost:3000
spring.servlet.multipart.max-file-size=200MB
spring.servlet.multipart.max-request-size=210MB
```

> **`ddl-auto=create`** — currently set to `create` (dev). Change to `update` for production to avoid data loss on restart.

---

## 10. Non-Obvious Design Decisions

### Why two separate violation counters?
Regular proctoring violations (tab switch, fullscreen exit, DevTools) are fundamentally different from screen-share stops. Screen-share stops happen due to accidental browser UI clicks and the student should be able to recover (reshare) without losing their exam. Mixing them would make the threshold confusing and unfair.

### Why are `recordCamera` and `recordScreen` separate boolean flags?
Each recording type is an independent capability. An exam might require camera recording (to verify identity) but not screen recording (student uses pen+paper offline), or vice versa. Making them explicit booleans that default to `false` means any exam JSON that doesn't mention them simply gets no recording — a safe, privacy-respecting default. `maxScreenShareViolations` only takes effect when `recordScreen: true`.

### Why does `canNavigate` default to `true`?
Free navigation is the expected behaviour in most exam systems. Setting `canNavigate: false` is an explicit restriction that exam authors opt into. Defaulting to `true` means existing exam JSONs that omit the field continue to work with full navigation.

### Why does `shuffleQuestions` default to `false`?
Shuffling changes the displayed question numbers and can surprise students who prepared in a specific order. It should be a deliberate choice per exam, not something that happens by accident if the field is forgotten.

### Why does screen recording block exam start on denial?
If `maxScreenShareViolations` is defined, the exam author has explicitly required screen capture for this exam. Letting a student bypass it by cancelling the picker would defeat the purpose. Other recording failures (camera denial, network chunks failing) are non-fatal because they don't represent a student actively circumventing proctoring.

### Why is `suppressVisibilityViolation` a ref inside FullscreenManager?
React event listeners added in `useEffect` capture the prop value at the time of effect registration. If we used the prop directly in the handler, it would always be the initial value. Syncing it to a ref (`suppressRef`) ensures the handler always reads the current live value without needing to re-register the listener.

### Why does the Question Navigator allow forward jumps when `canNavigate: false`?
`canNavigate: false` means "no going back" — students cannot revisit previous questions. However, being able to jump forward (skip ahead) is the commonly expected behaviour in linear exams. Completely locking the navigator would confuse students who want to skip to a later question they know the answer to.

### Why does auto-submit on screen-share limit pass empty answers?
When the exam is forcibly submitted as a security response, there is no clean way to retrieve the current in-memory answers from ExamInterface (they live in its local state). Passing `[]` is intentional — the submit is a penalty action, not a normal completion. Answers could be captured by lifting them to App.tsx if needed in a future iteration.

### Why does the PDF stay client-side (browser print) while result data goes to the server?
The PDF button uses `window.print()` which is a zero-dependency approach that works everywhere without a PDF library. The server stores an HTML report (not a PDF) which is equivalent for archival. Adding a proper server-side PDF library (iTextPDF, Flying Saucer) is a noted future improvement.

### Why does `loadExamData` try the API first then fall back to local JSON?
During development or when running without the backend, the frontend still works. The local JSONs in `public/exams/` serve as a development convenience. In production, only the backend JSONs would be populated (local ones can be deleted or left empty).

---

## 11. Running the Project

### Frontend
```bash
cd "New folder/exam"
npm install
npm run dev        # http://localhost:5173
```

### Backend
```bash
# Prerequisites: JDK 25, MySQL 8 running on localhost:3306
# Create DB if not exists:
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS exam_db CHARACTER SET utf8mb4;"

cd "New folder/exam-backend"
mvn spring-boot:run
# API available at http://localhost:8080
```

---

## 12. Known Limitations / Future Work

| Area | Current State | Improvement |
|---|---|---|
| PDF storage | Server stores HTML; client downloads via print dialog | Add server-side PDF generation (iText/Flying Saucer) |
| Answer capture on forced submit | Passes `[]` empty | Lift answer state to App.tsx |
| `ddl-auto` | `create` (wipes tables on restart) | Switch to `update` or Flyway migrations for production |
| Media storage | Local Windows folder (`C:/exam-recordings`) | Replace `MediaService` with Azure Blob / SharePoint upload |
| Auth / JWT | Session key is plain text | Wrap session key in a signed JWT for tamper-proof identity |
| Exam management | Exam JSONs are static files | Add admin CRUD API and DB-backed exam storage |
| Section-wise submission | `submissionType: "sectionwise"` field exists | Implement section submit button logic in ExamInterface |
| Per-question time limit | Field exists in JSON | Wire countdown per question in QuestionDisplay |
| Camera feed preview | Camera is recorded but not shown to student | Add a small PiP camera preview to confirm recording is live |
