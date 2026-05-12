# DataLens Backend

## Quickstart

1. Install dependencies:
   - `uv sync`
2. Run the API:
   - `uv run uvicorn app.main:app --reload`

## Current status

- FastAPI app scaffolded
- Health endpoint available at `GET /health`
- Domain endpoints are scaffold-only and will be implemented slice-by-slice:
  - `POST /upload`
  - `GET /profile/{dataset_id}`
  - `POST /filter`
  - `POST /chat`
  - `POST /summary`
