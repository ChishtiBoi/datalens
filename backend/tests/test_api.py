import io
from pathlib import Path

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.api.routes import datasets as datasets_route


def _build_marketing_dataframe() -> pd.DataFrame:
    marital_values = [
        "Single",
        "Married",
        "Together",
        "Divorced",
        "Widow",
        "YOLO",
        "Absurd",
        "Alone",
    ]
    education_values = ["Graduation", "PhD", "Master", "Basic", "2n Cycle"]
    rows: list[dict[str, object]] = []

    for idx in range(2240):
        rows.append(
            {
                "ID": 1000 + idx,
                "Year_Birth": 1940 + (idx % 60),
                "Education": education_values[idx % len(education_values)],
                "Marital_Status": marital_values[idx % len(marital_values)],
                "Income": None if idx < 24 else 20000 + (idx % 100) * 1000,
                "Kidhome": idx % 3,
                "Teenhome": (idx + 1) % 3,
                "Dt_Customer": f"201{idx % 4}-{(idx % 12) + 1:02d}-{(idx % 28) + 1:02d}",
                "Recency": idx % 100,
                "MntWines": (idx * 3) % 1000,
                "MntFruits": (idx * 2) % 200,
                "MntMeatProducts": (idx * 5) % 900,
                "MntFishProducts": (idx * 7) % 300,
                "MntSweetProducts": (idx * 11) % 250,
                "MntGoldProds": (idx * 13) % 400,
                "NumDealsPurchases": idx % 10,
                "NumWebPurchases": idx % 12,
                "NumCatalogPurchases": idx % 8,
                "NumStorePurchases": idx % 14,
                "NumWebVisitsMonth": idx % 20,
                "AcceptedCmp3": idx % 2,
                "AcceptedCmp4": (idx + 1) % 2,
                "AcceptedCmp5": 1 if idx % 10 == 0 else 0,
                "AcceptedCmp1": 1 if idx % 6 == 0 else 0,
                "AcceptedCmp2": 1 if idx % 8 == 0 else 0,
                "Complain": 1 if idx % 100 == 0 else 0,
                "Z_CostContact": 3,
                "Z_Revenue": 11,
                "Response": 1 if idx % 7 == 0 else 0,
            }
        )

    return pd.DataFrame(rows)


@pytest.fixture()
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    db_path = tmp_path / "datalens.db"
    monkeypatch.setattr(datasets_route, "DATA_DIR", tmp_path)
    monkeypatch.setattr(datasets_route, "DB_PATH", db_path)
    return TestClient(app)


@pytest.fixture()
def csv_bytes() -> bytes:
    dataframe = _build_marketing_dataframe()
    return dataframe.to_csv(index=False).encode("utf-8")


@pytest.fixture()
def uploaded_dataset(client: TestClient, csv_bytes: bytes) -> dict:
    response = client.post(
        "/upload",
        files={"file": ("marketing.csv", io.BytesIO(csv_bytes), "text/csv")},
    )
    assert response.status_code == 200
    return response.json()


def _profile_columns(profile_json: dict) -> dict[str, dict]:
    return {str(item["column_name"]).lower(): item for item in profile_json["columns"]}


def test_health_returns_200(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_upload_valid_csv_returns_dataset_id(client: TestClient, csv_bytes: bytes) -> None:
    response = client.post(
        "/upload",
        files={"file": ("marketing.csv", io.BytesIO(csv_bytes), "text/csv")},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["dataset_id"]
    assert body["row_count"] == 2240
    assert body["column_count"] == 29


def test_upload_non_csv_returns_400(client: TestClient) -> None:
    response = client.post(
        "/upload",
        files={"file": ("notes.txt", io.BytesIO(b"hello"), "text/plain")},
    )
    assert response.status_code == 400


def test_upload_over_50mb_returns_400(client: TestClient) -> None:
    oversized = b"a" * (50 * 1024 * 1024 + 1)
    response = client.post(
        "/upload",
        files={"file": ("huge.csv", io.BytesIO(oversized), "text/csv")},
    )
    assert response.status_code == 400


def test_profile_returns_column_count_29(client: TestClient, uploaded_dataset: dict) -> None:
    response = client.get(f"/profile/{uploaded_dataset['dataset_id']}")
    assert response.status_code == 200
    assert response.json()["column_count"] == 29


def test_profile_income_null_count_24(client: TestClient, uploaded_dataset: dict) -> None:
    response = client.get(f"/profile/{uploaded_dataset['dataset_id']}")
    columns = _profile_columns(response.json())
    assert columns["income"]["null_count"] == 24


def test_profile_education_is_categorical(client: TestClient, uploaded_dataset: dict) -> None:
    response = client.get(f"/profile/{uploaded_dataset['dataset_id']}")
    columns = _profile_columns(response.json())
    assert columns["education"]["detected_type"] == "categorical"


def test_profile_dt_customer_is_datetime(client: TestClient, uploaded_dataset: dict) -> None:
    response = client.get(f"/profile/{uploaded_dataset['dataset_id']}")
    columns = _profile_columns(response.json())
    assert columns["dt_customer"]["detected_type"] == "datetime"


def test_filter_education_phd_returns_fewer_rows(client: TestClient, uploaded_dataset: dict) -> None:
    dataset_id = uploaded_dataset["dataset_id"]
    filtered = client.post(
        "/filter",
        json={"dataset_id": dataset_id, "categorical_filters": {"Education": ["PhD"]}},
    )
    all_rows = client.post("/filter", json={"dataset_id": dataset_id})
    assert filtered.status_code == 200
    assert all_rows.status_code == 200
    assert filtered.json()["total_count"] < all_rows.json()["total_count"]


def test_filter_accepts_lowercase_column_keys(client: TestClient, uploaded_dataset: dict) -> None:
    dataset_id = uploaded_dataset["dataset_id"]
    filtered = client.post(
        "/filter",
        json={"dataset_id": dataset_id, "categorical_filters": {"education": ["PhD"]}},
    )
    pascal = client.post(
        "/filter",
        json={"dataset_id": dataset_id, "categorical_filters": {"Education": ["PhD"]}},
    )
    assert filtered.status_code == 200
    assert pascal.status_code == 200
    assert filtered.json()["total_count"] == pascal.json()["total_count"]


def test_filter_clear_filters_returns_all_2240_rows(
    client: TestClient, uploaded_dataset: dict
) -> None:
    response = client.post("/filter", json={"dataset_id": uploaded_dataset["dataset_id"]})
    assert response.status_code == 200
    assert response.json()["total_count"] == 2240
