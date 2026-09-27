# AI Log Deviation Agent

An AI-assisted deviation intake module for pharmaceutical manufacturing. Paste a report or upload a document and the agent extracts the structured record, fills the form, and re-rates risk — on every submission.

Built around a two-node LangGraph agent (`extract` → `analyze`) running on Groq.

---

## Features

- **Whole-record AI extraction** — every input is analysed and returns the *complete* record: unchanged fields are carried forward, corrections are applied, and the AI risk fields are always recomputed.
- **Incremental corrections** — send `batch is ABC-002` or `date of occurance is 28th of oct` and only that value changes; everything else is preserved.
- **Narrative stays in sync** — corrected values are folded into the title and detailed description, including date rewrites across formats (`26-09-2026` ↔ `26 Sept 2026`).
- **Description derived from fields** — if there is no narrative yet, one is composed from site, date, source, product and batch.
- **Context-aware risk assessment** — the current form state travels with every request, so the model rates the deviation as a whole and reacts to newly supplied facts instead of clinging to an earlier rating.
- **Honest reporting** — the assistant diffs the response against the form and reports only what actually changed.
- **Actionable failures** — a missing/invalid API key returns HTTP 503 with instructions instead of an empty form.
- **Document intake** — PDF, TXT and `.eml` upload, plus drag-and-drop.

## Tech Stack

| Layer | Choice |
| --- | --- |
| Frontend | React + Redux |
| Backend | Python + FastAPI |
| AI | LangGraph + Groq |
| Database | PostgreSQL / MySQL |

---

## Getting Started

### 1. Clone

```bash
git clone https://github.com/AkshajAnil/AI-Log-Deviant.git
cd AI-Log-Deviant
```

### 2. Backend

```bash
cd backend
python -m venv venv

# Windows
.\venv\Scripts\activate
# macOS / Linux
source venv/bin/activate

pip install -r requirements.txt
```

#### Configuration

```bash
cp .env.example .env
```

| Variable | Purpose |
| --- | --- |
| `GROQ_API_KEY` | Required. Get one at <https://console.groq.com/keys> |
| `GROQ_MODEL` | Defaults to `openai/gpt-oss-120b` |
| `DATABASE_URL` | PostgreSQL by default; MySQL is commented in `.env.example` |

`.env` is gitignored — never commit your key.

> **Groq model availability (verified on developer keys)**
> Working: `openai/gpt-oss-120b` (recommended), `openai/gpt-oss-20b`, `qwen/qwen3.8-27b`.
> Enterprise-only (`404 model_not_found`): `llama-3.3-70b-versatile`, `llama-3.1-8b-instant`.
> Decommissioned (`400 model_decommissioned`): `gemma2-9b-it`.
> List what your key can use:
> ```bash
> curl -H "Authorization: Bearer $GROQ_API_KEY" https://api.groq.com/openai/v1/models
> ```

#### Run

```bash
uvicorn main:app --reload
```

API at <http://localhost:8000>.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

App at <http://localhost:5173>. Vite proxies `/api` to port 8000.

---

## How the agent behaves

`POST /api/extract` accepts the input text **and the current form values** as `context`. Both LangGraph nodes use it:

1. **`extract`** — returns the *complete* record, not a delta:
   - carries forward values the input doesn't change,
   - applies corrections,
   - writes a formal title rather than echoing the input,
   - keeps an existing narrative unless the input is a fuller report.
2. **`analyze`** — re-rates impact, severity, risk and next action from the merged record (existing values + this submission), weighting whichever fields were just corrected.

The frontend then:

- guards the narrative so a short correction can never replace a longer description,
- propagates corrected parameters into the title/description on blur,
- diffs the response against the form to report only real changes.

Assessment is skipped only when there is genuinely no risk-bearing context (no title, narrative, product or batch), so a sound rating is never overwritten by a guess.

## API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Service + database connectivity |
| `POST` | `/api/extract` | Analyse text/file → complete record. Fields: `text`, `file`, `context` (JSON string of form values) |
| `POST` | `/api/deviations` | Persist a deviation |
| `GET` | `/api/deviations` | List stored deviations |
| `POST` | `/api/chat` | Assistant chat. Body: `{ message, context }` |

## Project structure

```
AI-Log-Deviant/
├── backend/
│   ├── agent.py          # LangGraph workflow: extract → analyze
│   ├── main.py           # FastAPI routes
│   ├── models.py         # SQLAlchemy model
│   ├── schemas.py        # Pydantic schemas
│   ├── database.py       # Engine / session / connectivity probe
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   └── src/
│       ├── components/Form/DeviationForm.jsx      # Intake form
│       ├── components/AIAssistant/AIPanel.jsx     # Chat / upload panel
│       ├── store/deviationSlice.js                # Form state, narrative sync, diffing
│       └── App.jsx
└── README.md
```

## Scripts

| Where | Command | What it does |
| --- | --- | --- |
| `frontend/` | `npm run dev` | Dev server with HMR |
| `frontend/` | `npm run build` | Production build |
| `frontend/` | `npm run lint` | oxlint |
| `backend/` | `uvicorn main:app --reload` | API server |

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| HTTP 503 from `/api/extract` | Missing or placeholder `GROQ_API_KEY`, or an unavailable `GROQ_MODEL` — the message says which |
| HTTP 404 `model_not_found` | Your key can't use that model; pick one from the list above |
| Blank page in the browser | Open devtools console — a `ReferenceError` there means a component failed to import |
| Form won't save | Required fields: Site/Plant, Date, Title, Source, Detailed Description, Initial Impact, Initial Severity |
| Date rejected | `Date of Occurrence` must be `dd-mm-yyyy` |
