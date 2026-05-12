from fastapi import APIRouter


router = APIRouter(tags=["datasets"])


@router.post("/upload")
async def upload_dataset() -> dict[str, str]:
    return {"message": "Not implemented yet. Next slice will handle CSV upload + SQLite persistence."}


@router.get("/profile/{dataset_id}")
async def get_dataset_profile(dataset_id: str) -> dict[str, str]:
    return {
        "dataset_id": dataset_id,
        "message": "Not implemented yet. Next slice will compute profiling stats.",
    }


@router.post("/filter")
async def filter_dataset() -> dict[str, str]:
    return {"message": "Not implemented yet. Next slice will apply dataframe filters."}
