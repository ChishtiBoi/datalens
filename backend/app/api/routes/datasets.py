import asyncio
import io
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

import pandas as pd
from fastapi import APIRouter, File, HTTPException, UploadFile, status


router = APIRouter(tags=["datasets"])

MAX_UPLOAD_SIZE_BYTES = 50 * 1024 * 1024
BACKEND_DIR = Path(__file__).resolve().parents[3]
DATA_DIR = BACKEND_DIR / "data"
DB_PATH = DATA_DIR / "datalens.db"


def _sanitize_identifier(value: str, fallback: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_]+", "_", value.strip().lower())
    cleaned = re.sub(r"_+", "_", cleaned).strip("_")
    if not cleaned:
        cleaned = fallback
    if not re.match(r"^[a-zA-Z_]", cleaned):
        cleaned = f"{fallback}_{cleaned}"
    return cleaned


def _sanitize_columns(columns: list[str]) -> list[str]:
    sanitized_columns: list[str] = []
    used: dict[str, int] = {}

    for idx, column in enumerate(columns, start=1):
        base = _sanitize_identifier(str(column), f"col_{idx}")
        count = used.get(base, 0)
        if count:
            safe_name = f"{base}_{count + 1}"
        else:
            safe_name = base
        used[base] = count + 1
        sanitized_columns.append(safe_name)

    return sanitized_columns


def _persist_dataframe(
    dataframe: pd.DataFrame,
    dataset_id: str,
    table_name: str,
    filename: str,
) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS datasets (
                dataset_id TEXT PRIMARY KEY,
                table_name TEXT NOT NULL UNIQUE,
                filename TEXT NOT NULL,
                row_count INTEGER NOT NULL,
                column_count INTEGER NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        dataframe.to_sql(table_name, connection, if_exists="fail", index=False)
        connection.execute(
            """
            INSERT INTO datasets (dataset_id, table_name, filename, row_count, column_count, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                dataset_id,
                table_name,
                filename,
                int(dataframe.shape[0]),
                int(dataframe.shape[1]),
                datetime.now(timezone.utc).isoformat(),
            ),
        )
        connection.commit()


@router.post("/upload")
async def upload_dataset(file: UploadFile = File(...)) -> dict[str, str | int]:
    filename = file.filename or ""
    if not filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No file name provided.",
        )

    if not filename.lower().endswith(".csv"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file type. Only CSV files are accepted.",
        )

    file_bytes = await file.read(MAX_UPLOAD_SIZE_BYTES + 1)
    if len(file_bytes) > MAX_UPLOAD_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File too large. Maximum allowed size is 50MB.",
        )

    try:
        dataframe = pd.read_csv(io.BytesIO(file_bytes))
    except pd.errors.EmptyDataError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="CSV is empty or has no parsable rows.",
        ) from exc
    except pd.errors.ParserError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="CSV parsing failed. Please upload a valid CSV file.",
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to process CSV file: {exc}",
        ) from exc

    dataset_id = uuid4().hex[:12]
    dataset_slug = _sanitize_identifier(Path(filename).stem, "dataset")
    table_name = f"dataset_{dataset_slug}_{dataset_id}"
    dataframe.columns = _sanitize_columns([str(col) for col in dataframe.columns])

    await asyncio.to_thread(
        _persist_dataframe,
        dataframe,
        dataset_id,
        table_name,
        filename,
    )

    return {
        "dataset_id": dataset_id,
        "filename": filename,
        "row_count": int(dataframe.shape[0]),
        "column_count": int(dataframe.shape[1]),
    }


@router.get("/profile/{dataset_id}")
async def get_dataset_profile(dataset_id: str) -> dict[str, str]:
    return {
        "dataset_id": dataset_id,
        "message": "Not implemented yet. Next slice will compute profiling stats.",
    }


@router.post("/filter")
async def filter_dataset() -> dict[str, str]:
    return {"message": "Not implemented yet. Next slice will apply dataframe filters."}
