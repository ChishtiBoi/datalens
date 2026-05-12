# DataLens — Data Analytics Dashboard

DataLens is a generic CSV analytics web application that allows users to upload
any CSV file, automatically profile the data, explore it through interactive
visualizations, chat with the data using AI, and generate an executive summary
of key insights.

---

## Team Members

| Name | GitHub |
|---|---|
| Muhammad Hamza | [@ChishtiBoi](https://github.com/ChishtiBoi) |
| Ahmad Umer | [@ahmadumer17](https://github.com/ahmadumer17)  |
| Syed Murtaza Haroon |[murtazasyed-rgb](https://github.com/murtazasyed-rgb)|

**Contribution Summary:**
- **Muhammad Hamza:** Backend API, SQLite schema, LLM tool-calling integration, pytest tests
- **Ahmad Umer:** React frontend, dashboard visualizations, Recharts components
- **Syed Murtaza Haroon:** Filter panel, chat UI, Vitest tests, ADRs and documentation

---

## Prerequisites

Before setting up the project, make sure you have the following installed:

| Tool | Version | Download |
|---|---|---|
| Python | 3.11 or higher | https://www.python.org/downloads/ |
| Node.js | 18 or higher | https://nodejs.org/ |
| uv (Python package manager) | Latest | https://astral.sh/uv |
| Git | Any recent version | https://git-scm.com/ |

### Install uv (if not already installed)

**Windows (PowerShell):**
```powershell
powershell -c "irm https://astral.sh/uv/install.ps1 | iex"
```

**Mac/Linux:**
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

After installing, restart your terminal and verify:
```bash
uv --version
```

---

## Getting Your API Key

DataLens uses OpenAI GPT-4o for the chat interface and executive summary.

1. Go to https://platform.openai.com/
2. Sign in or create an account
3. Click your profile → **API Keys**
4. Click **Create new secret key**
5. Copy the key — you will need it in the next step

---

## Setup Instructions

### Step 1 — Clone the Repository

```bash
git clone https://github.com/ChishtiBoi/datalens.git
cd datalens
```

### Step 2 — Configure Environment Variables

```bash
cp .env.example .env
```

Open the `.env` file in any text editor and add your OpenAI API key:
Save and close the file.

### Step 3 — Set Up the Backend

```bash
cd backend
uv sync
```

This installs all Python dependencies listed in `pyproject.toml`.

### Step 4 — Set Up the Frontend

Open a new terminal window and run:

```bash
cd frontend
npm install
```

---

## Running the Application

You need two terminal windows open simultaneously — one for the backend, one for the frontend.

### Terminal 1 — Start the Backend

```bash
cd backend
uv run uvicorn app.main:app --reload --port 8000
```

You should see:
INFO:     Uvicorn running on http://127.0.0.1:8000
INFO:     Application startup complete.


### Terminal 2 — Start the Frontend

```bash
cd frontend
npm run dev
```

You should see:
VITE v5.x.x  ready in xxx ms
➜  Local:   http://localhost:5173/

### Open the App

Go to **http://localhost:5173** in your browser.

---

## Using DataLens

1. **Upload a CSV file** — Click the upload area or drag and drop any CSV file (up to 50MB)
2. **View the dashboard** — 6 visualizations are automatically generated based on your data
3. **Apply filters** — Use the left panel to filter by category or numeric range; all charts update simultaneously
4. **Chat with your data** — Type questions in the chat panel, for example:
   - *"Which education level spends the most on wine?"*
   - *"What is the average income of customers who accepted campaign 5?"*
   - *"Which marital status has the highest response rate?"*
5. **Generate summary** — Click **Generate Executive Summary** for an AI-written business analysis of your dataset

---

## Running Tests

### Backend Tests (pytest)

```bash
cd backend
uv run pytest tests/ -v
```

Expected output: 10 tests passing.

### Frontend Tests (Vitest)

```bash
cd frontend
npm run test
```

Expected output: 5 tests passing.

---

## Project Structure
datalens/
├── .agent/skills/          # 6 mandatory agent skill files
├── docs/
│   ├── adrs/               # Architecture Decision Records
│   └── report.md           # Final project reflection
├── tasks/
│   ├── plan.md             # Implementation order
│   └── todo.md             # Task breakdown
├── backend/
│   ├── app/
│   │   ├── main.py         # FastAPI endpoints
│   │   ├── database.py     # SQLite operations
│   │   ├── profiler.py     # Column type detection and stats
│   │   └── llm.py          # OpenAI tool-calling logic
│   ├── tests/              # pytest test suite
│   └── pyproject.toml      # Python dependencies
├── frontend/
│   ├── src/
│   │   ├── components/     # React components
│   │   └── tests/          # Vitest test suite
│   └── package.json
├── .env.example            # Required environment variables
├── README.md               # This file
└── SPEC.md                 # Project specification

---

## Troubleshooting

### "uvicorn not found" or "uv not recognized"
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
# Restart terminal, then:
cd backend && uv sync
uv run uvicorn app.main:app --reload --port 8000
```

### "CORS error" in browser console
Make sure the backend is running on port 8000 and the frontend on port 5173.
Check that `main.py` includes:
```python
from fastapi.middleware.cors import CORSMiddleware
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173"],
allow_headers=["*"], allow_methods=["*"])
```

### "OPENAI_API_KEY not found"
Make sure you copied `.env.example` to `.env` (not just edited the example file).
The `.env` file must be inside the `backend/` folder.

### "SQLite database not found"
The database is created automatically on first upload. Make sure the
`backend/data/` folder exists:
```bash
mkdir -p backend/data
```

### "Module not found" errors in backend
```bash
cd backend
uv sync
```

### "npm install fails"
Make sure Node.js 18+ is installed:
```bash
node --version   # should show v18 or higher
npm install
```

### App uploads CSV but shows no charts
Check the browser console (F12) for errors. Most common cause is the
backend returning a CORS error or the profile endpoint failing.
Verify the backend terminal shows no error after upload.

### Chat returns "I cannot answer that"
The LLM uses tool-calling to query your data. Make sure your OPENAI_API_KEY
is valid and has available credits at https://platform.openai.com/usage

---

## Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `LLM_PROVIDER` | Yes | Set to `openai` |
| `OPENAI_API_KEY` | Yes | Your OpenAI API key from platform.openai.com |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + Tailwind CSS |
| Charts | Recharts |
| Backend | FastAPI + Python 3.11 |
| Database | SQLite |
| LLM | OpenAI GPT-4o with function calling |
| Package Manager | uv |
| Backend Tests | pytest |
| Frontend Tests | Vitest |