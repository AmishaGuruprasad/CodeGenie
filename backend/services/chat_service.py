from fastapi import Cookie
from models.chat_models import NewChat, ChatUpdate
from services.llm.llm_service import stream_response
from services.auth_service import checkCookie
from services.cryptography_service import decrypt_text
from database.collections import chats_collection
from services.cryptography_service import encrypt_text
from datetime import datetime
from exceptions.chat_exceptions import ChatNotFoundException

async def get_llm_response(new_chat: NewChat, sessionId: str = Cookie(None)):
    try: 
        print("Cookies received:", sessionId)
        guest_mode = sessionId is None

        if not guest_mode:
            emailId = await checkCookie(sessionId)
            print(emailId)
            new_chat.email = emailId
        else:
            emailId = None
        prompt = new_chat.prompt.strip()

        if (prompt==""):
            raise Exception("Prompt can not be empty")
        
        messages = []
        if guest_mode:
            if hasattr(new_chat, "messages"):
                messages = new_chat.messages[-3:]
        else:
            if new_chat.chat_id:
                chat = await chats_collection.find_one({"chat_id": new_chat.chat_id, "emailId": emailId})
                if chat and "Messages" in chat:
                    messages = []
                    for m in chat["Messages"][-3:]:
                        messages.append({'user' : decrypt_text(m['user']), 'bot' : decrypt_text(m['bot'])})

        final_response = ""

        
        async for chunk in stream_response(new_chat.prompt, messages):
                
            final_response += chunk

            yield chunk

        new_chat.response = final_response

        if not guest_mode:
            await save_chat(new_chat)
    
    except:
        raise Exception()
    
    


async def save_chat(new_chat: NewChat):
    print(f"POST CHAT body: {new_chat}")
    chat_id = new_chat.chat_id
    prompt = new_chat.prompt.strip()
    response = new_chat.response.strip()
    chat_title = new_chat.chat_title
    emailId = new_chat.email
    enc_prompt = encrypt_text(prompt)
    enc_response = encrypt_text(response)
    if chat_title is not None:
        if chat_id is None:
            chat_id = int(datetime.now().timestamp())
            new_chat.chat_id = chat_id
        await chats_collection.insert_one({
            "chat_id": chat_id,
            "emailId": emailId,
            "chat_title": chat_title, 
            "Messages": [
                {
                    "user": enc_prompt,
                    "bot": enc_response
                }
            ]
        })
        return {"message": "Chat has been created successfully", "chat_id": chat_id}
    
    else:
        chat = await chats_collection.find_one({"chat_id": chat_id, "emailId": emailId})
        if not chat:
            print(f"[WARN] Chat with ID {chat_id} does not exist for user {emailId}. Skipping update.")
            return {"message": f"Chat {chat_id} not found for this user. Cannot update."}
        
        messages = chat.get("Messages", [])
        messages.append({"user": enc_prompt, "bot": enc_response})
        
        await chats_collection.update_one(
            {"chat_id": chat_id, "emailId": emailId},
            {"$set": {"Messages": messages}}
        )
        return {"message": "Chat has been updated successfully", "chat_id": chat_id}



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
        raise ChatNotFoundException(chat_id)
    

async def update_chat(chat_id: int, chat_title: ChatUpdate, sessionId: str = Cookie(None)):
    emailId = await checkCookie(sessionId)

    result = await chats_collection.update_one(
        {"chat_id": chat_id, "emailId": emailId},
        {"$set": {"chat_title": chat_title.chat_title}}
    )
    if result.matched_count == 0:
        raise ChatNotFoundException(chat_id)   
    return {"message": "Updated"}

async def delete_chat(chat_id: int, sessionId: str = Cookie(None)):
    emailId = await checkCookie(sessionId)

    result = await chats_collection.delete_one({"chat_id": chat_id, "emailId": emailId})
    if result.deleted_count == 0:
        raise ChatNotFoundException(chat_id)
    return {"message": "Chat has been deleted successfully"}
