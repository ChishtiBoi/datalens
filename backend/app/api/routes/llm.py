from fastapi import APIRouter


router = APIRouter(tags=["llm"])


@router.post("/chat")
async def chat_with_data() -> dict[str, str]:
    return {"message": "Not implemented yet. Next slice will add OpenAI gpt-4o tool-calling chat."}


@router.post("/summary")
async def generate_summary() -> dict[str, str]:
    return {"message": "Not implemented yet. Next slice will add executive summary generation."}
