from fastapi.responses import StreamingResponse
from fastapi import Cookie, HTTPException
from models.chat_models import NewChat, ChatUpdate
from services.llm_service import stream_code
from services.auth_service import checkCookie
from services.cryptography_service import decrypt_text
from database.collections import chats_collection



async def get_llm_response(new_chat: NewChat, sessionId: str = Cookie(None)):
    print("Cookies received:", sessionId)
    guest_mode = sessionId is None

    if not guest_mode:
        emailId = await checkCookie(sessionId)
        print(emailId)
        new_chat.email = emailId
    else:
        emailId = None
    prompt = new_chat.prompt.strip()
    if prompt == "":
        return {"Error": "Prompt cannot be empty or not a valid prompt"}
    
    messages = []
    if guest_mode:
        if hasattr(new_chat, "messages"):
            messages = new_chat.messages[-3:]
    else:
        if new_chat.chat_id:
            chat = await chats_collection.find_one({"chat_id": new_chat.chat_id, "emailId": emailId})
            if chat and "Messages" in chat:
                messages = chat["Messages"][-3:]
    

    return StreamingResponse(await stream_code(new_chat,messages,guest_mode), media_type="text/plain")


async def get_chat(chat_id: int, sessionId: str = Cookie(None)):
    emailId = await checkCookie(sessionId)

    conversation = await chats_collection.find_one({"chat_id": chat_id, "emailId": emailId})
    if conversation and "Messages" in conversation:
        decrypted_messages = []
        for msg in conversation.get("Messages", []):
            decrypted_messages.append({
                "user": decrypt_text(msg["user"]),
                "bot": decrypt_text(msg["bot"])
            })
        return decrypted_messages
    else:
        raise HTTPException(status_code=404, detail="Chat not found")
    

async def update_chat(chat_id: int, chat_title: ChatUpdate, sessionId: str = Cookie(None)):
    emailId = await checkCookie(sessionId)

    result = await chats_collection.update_one(
        {"chat_id": chat_id, "emailId": emailId},
        {"$set": {"chat_title": chat_title.chat_title}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Chat not found for this user to update.")    
    return {"message": "Updated"}

async def get_all_chats(sessionId: str = Cookie(None)):
    emailId = await checkCookie(sessionId)

    chats = []
    async for chat in chats_collection.find({"emailId": emailId}, {"chat_id": 1, "chat_title": 1, "_id": 0}):
        if "chat_id" in chat and "chat_title" in chat:
            chats.append({
                "chat_id": chat["chat_id"],
                "chat_title": chat["chat_title"]
            })
    return chats


async def delete_chat(chat_id: int, sessionId: str = Cookie(None)):
    emailId = await checkCookie(sessionId)

    result = await chats_collection.delete_one({"chat_id": chat_id, "emailId": emailId})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Chat does not exist for this user.")
    return {"message": "Chat has been deleted successfully"}
