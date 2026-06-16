from fastapi import APIRouter, Cookie
from services.chat_service import get_llm_response, get_chat, update_chat, delete_chat, get_all_chats
# from services.llm_service import auto_complete, generate_from_prompt
from models.chat_models import ChatUpdate, NewChat, AutoCompleteRequest, GenerateRequest


router = APIRouter()

@router.post("/chat")
async def post(new_chat: NewChat, sessionId: str = Cookie(None)):
    return await get_llm_response(new_chat, sessionId)
 


@router.get("/chat/{chat_id}")
async def get(chat_id: int, sessionId: str = Cookie(None)):
    return await get_chat(chat_id, sessionId)

@router.patch("/chat/{chat_id}")
async def patch(chat_id: int, chat_title: ChatUpdate, sessionId: str = Cookie(None)):
    return await update_chat(chat_id, chat_title, sessionId)


@router.delete("/chat/{chat_id}")
async def delete(chat_id: int, sessionId: str = Cookie(None)):
    return await delete_chat(chat_id, sessionId)



@router.get("/list-all-chats")
async def get_chat_list(sessionId: str = Cookie(None)):
    return await get_all_chats(sessionId)


# @router.post("/auto_complete")
# async def auto_completion(request: AutoCompleteRequest):
#     return auto_complete(request)


# @router.post("/generate")
# async def generate(request: GenerateRequest):
#     return generate_from_prompt(request)
