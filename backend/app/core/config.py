from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Load env from backend dir first, then repo root (uvicorn cwd is often `backend/`).
_BACKEND_DIR = Path(__file__).resolve().parents[2]
_PROJECT_ROOT = _BACKEND_DIR.parent
_ENV_FILES = tuple(
    p
    for p in (_BACKEND_DIR / ".env", _PROJECT_ROOT / ".env")
    if p.is_file()
)


class Settings(BaseSettings):
    app_name: str = "DataLens API"
    environment: str = "development"
    sqlite_url: str = "sqlite+aiosqlite:///./datalens.db"
    llm_provider: str = "openai"
    openai_api_key: str = ""
    openai_model: str = "gpt-4o"

    model_config = SettingsConfigDict(
        env_file=_ENV_FILES if _ENV_FILES else None,
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
