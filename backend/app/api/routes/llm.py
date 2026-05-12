import json
import sqlite3
from pathlib import Path
from typing import Any

import pandas as pd
from fastapi import APIRouter, HTTPException, status
from openai import OpenAI
from pydantic import BaseModel, Field

from app.core.config import settings


router = APIRouter(tags=["llm"])
BACKEND_DIR = Path(__file__).resolve().parents[3]
DB_PATH = BACKEND_DIR / "data" / "datalens.db"


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    dataset_id: str
    message: str
    history: list[ChatMessage] = Field(default_factory=list)


def _load_dataset(dataset_id: str) -> pd.DataFrame:
    if not DB_PATH.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No datasets found.")

    with sqlite3.connect(DB_PATH) as connection:
        row = connection.execute(
            "SELECT table_name FROM datasets WHERE dataset_id = ?",
            (dataset_id,),
        ).fetchone()
        if not row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Dataset '{dataset_id}' not found.",
            )
        table_name = str(row[0]).replace('"', '""')
        return pd.read_sql_query(f'SELECT * FROM "{table_name}"', connection)


def _normalize_key(value: str) -> str:
    return value.strip().lower()


def _resolve_column(dataframe: pd.DataFrame, requested: str) -> str:
    requested_norm = _normalize_key(requested)
    for column in dataframe.columns:
        if _normalize_key(str(column)) == requested_norm:
            return str(column)
    raise ValueError(f"Unknown column '{requested}'.")


def _apply_filters(dataframe: pd.DataFrame, filters: dict[str, Any] | None) -> pd.DataFrame:
    if not filters:
        return dataframe

    filtered = dataframe
    categorical = filters.get("categorical_filters", {})
    for column_name, allowed in categorical.items():
        if not allowed:
            continue
        column = _resolve_column(filtered, column_name)
        filtered = filtered[filtered[column].astype(str).isin([str(item) for item in allowed])]

    numeric = filters.get("numeric_range", {})
    for column_name, bounds in numeric.items():
        column = _resolve_column(filtered, column_name)
        numeric_series = pd.to_numeric(filtered[column], errors="coerce")
        lower = bounds.get("min")
        upper = bounds.get("max")
        if lower is not None:
            filtered = filtered[numeric_series >= float(lower)]
            numeric_series = pd.to_numeric(filtered[column], errors="coerce")
        if upper is not None:
            filtered = filtered[numeric_series <= float(upper)]

    return filtered


def query_data(
    dataset_id: str,
    filters: dict[str, Any] | None = None,
    group_by: str | list[str] | None = None,
    aggregate_column: str | None = None,
    aggregate_fn: str | None = None,
) -> dict[str, Any]:
    dataframe = _load_dataset(dataset_id)
    filtered = _apply_filters(dataframe, filters)

    if not group_by:
        return {
            "row_count": int(len(filtered)),
            "rows": filtered.head(100).where(pd.notna(filtered), None).to_dict(orient="records"),
        }

    group_columns = [group_by] if isinstance(group_by, str) else group_by
    resolved_groups = [_resolve_column(filtered, column) for column in group_columns]
    grouped = filtered.groupby(resolved_groups, dropna=False)

    if not aggregate_column or not aggregate_fn:
        result = grouped.size().reset_index(name="count")
    else:
        agg_column = _resolve_column(filtered, aggregate_column)
        agg_key = aggregate_fn.lower()
        allowed = {"sum", "mean", "count", "min", "max", "median"}
        if agg_key not in allowed:
            raise ValueError(f"Unsupported aggregate_fn '{aggregate_fn}'.")
        numeric_series = pd.to_numeric(filtered[agg_column], errors="coerce")
        temp = filtered.copy()
        temp[agg_column] = numeric_series
        grouped_numeric = temp.groupby(resolved_groups, dropna=False)[agg_column]
        if agg_key == "count":
            result = grouped_numeric.count().reset_index(name=f"{agg_column}_{agg_key}")
        else:
            result = getattr(grouped_numeric, agg_key)().reset_index(name=f"{agg_column}_{agg_key}")

    return {
        "row_count": int(len(result)),
        "rows": result.where(pd.notna(result), None).head(200).to_dict(orient="records"),
    }


def get_statistics(dataset_id: str, column: str) -> dict[str, Any]:
    dataframe = _load_dataset(dataset_id)
    resolved = _resolve_column(dataframe, column)
    numeric = pd.to_numeric(dataframe[resolved], errors="coerce").dropna()
    if numeric.empty:
        raise ValueError(f"Column '{column}' has no numeric values.")
    return {
        "column": resolved,
        "count": int(numeric.count()),
        "min": float(numeric.min()),
        "max": float(numeric.max()),
        "mean": float(numeric.mean()),
        "median": float(numeric.median()),
        "std": float(numeric.std()),
    }


def get_top_values(dataset_id: str, column: str, n: int = 5) -> dict[str, Any]:
    dataframe = _load_dataset(dataset_id)
    resolved = _resolve_column(dataframe, column)
    top_n = max(1, min(int(n), 50))
    counts = dataframe[resolved].astype(str).value_counts(dropna=False).head(top_n)
    rows = [{"value": value, "count": int(count)} for value, count in counts.items()]
    return {"column": resolved, "top_values": rows}


TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "query_data",
            "description": "Run filtered/grouped analysis on the dataset with pandas groupby.",
            "parameters": {
                "type": "object",
                "properties": {
                    "dataset_id": {"type": "string"},
                    "filters": {"type": "object"},
                    "group_by": {
                        "oneOf": [
                            {"type": "string"},
                            {"type": "array", "items": {"type": "string"}},
                        ]
                    },
                    "aggregate_column": {"type": "string"},
                    "aggregate_fn": {
                        "type": "string",
                        "enum": ["sum", "mean", "count", "min", "max", "median"],
                    },
                },
                "required": ["dataset_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_statistics",
            "description": "Get min, max, mean, median, std for a numeric column.",
            "parameters": {
                "type": "object",
                "properties": {
                    "dataset_id": {"type": "string"},
                    "column": {"type": "string"},
                },
                "required": ["dataset_id", "column"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_top_values",
            "description": "Get top N values by count for a categorical column.",
            "parameters": {
                "type": "object",
                "properties": {
                    "dataset_id": {"type": "string"},
                    "column": {"type": "string"},
                    "n": {"type": "integer", "minimum": 1, "maximum": 50},
                },
                "required": ["dataset_id", "column"],
            },
        },
    },
]


def _execute_tool(name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    try:
        if name == "query_data":
            return query_data(**arguments)
        if name == "get_statistics":
            return get_statistics(**arguments)
        if name == "get_top_values":
            return get_top_values(**arguments)
    except ValueError as exc:
        return {"error": str(exc)}
    except HTTPException as exc:
        return {"error": exc.detail}
    except Exception as exc:
        return {"error": f"Tool execution failed: {exc}"}
    return {"error": f"Unknown tool '{name}'."}


@router.post("/chat")
async def chat_with_data(request: ChatRequest) -> dict[str, str]:
    if settings.llm_provider.lower() != "openai":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported LLM_PROVIDER. Expected 'openai'.",
        )
    if not settings.openai_api_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="OPENAI_API_KEY is not configured.",
        )

    client = OpenAI(api_key=settings.openai_api_key)
    messages: list[dict[str, Any]] = [
        {
            "role": "system",
            "content": (
                "You are a data analyst assistant. The dataset is a marketing campaign dataset "
                "with 2240 customers. Answer questions using the provided tools. Always ground "
                "your answer in the actual data returned by tools."
            ),
        }
    ]

    for item in request.history:
        if item.role in {"user", "assistant"}:
            messages.append({"role": item.role, "content": item.content})
    messages.append({"role": "user", "content": request.message})

    for _ in range(3):
        response = client.chat.completions.create(
            model=settings.openai_model,
            messages=messages,
            tools=TOOLS,
            tool_choice="auto",
        )
        assistant_message = response.choices[0].message
        tool_calls = assistant_message.tool_calls or []

        if not tool_calls:
            return {"answer": assistant_message.content or "No response generated."}

        messages.append(
            {
                "role": "assistant",
                "content": assistant_message.content or "",
                "tool_calls": [
                    {
                        "id": call.id,
                        "type": "function",
                        "function": {
                            "name": call.function.name,
                            "arguments": call.function.arguments,
                        },
                    }
                    for call in tool_calls
                ],
            }
        )

        for call in tool_calls:
            arguments = json.loads(call.function.arguments or "{}")
            arguments.setdefault("dataset_id", request.dataset_id)
            tool_result = _execute_tool(call.function.name, arguments)
            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": call.id,
                    "content": json.dumps(tool_result),
                }
            )

    return {"answer": "I could not complete the analysis in time. Please try rephrasing your question."}


@router.post("/summary")
async def generate_summary() -> dict[str, str]:
    return {"message": "Not implemented yet. Next slice will add executive summary generation."}
