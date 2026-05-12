from fastapi import APIRouter

from app.api.routes.datasets import router as dataset_router
from app.api.routes.health import router as health_router
from app.api.routes.llm import router as llm_router


api_router = APIRouter()
api_router.include_router(health_router)
api_router.include_router(dataset_router)
api_router.include_router(llm_router)
