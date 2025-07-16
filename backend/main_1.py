from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
import os
from datetime import  datetime, timezone, timedelta
import smtplib
from email.message import EmailMessage

load_dotenv("passwords.env")

MONGO_URL = os.getenv("MONGO_URL",load_dotenv("passwords.env"))

client = AsyncIOMotorClient(MONGO_URL, tz_aware=True, tzinfo=timezone.utc)

db = client.codegenie
usersLogin_collection = db.login
chats_collection = db.chat
guests_collection = db.guest
sessions_collection = db.session

pendingUsers_collection = db.pending_users
EMAIL_ID = "YourEmail"
EMAIL_PASS = "YourPass"
api_root = "http://127.0.0.1:8000"
from cryptography.fernet import Fernet #type: ignore
from fastapi import FastAPI, HTTPException, Response, Cookie
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse, HTMLResponse
from pydantic import BaseModel
from transformers import AutoTokenizer, AutoModelForCausalLM, BitsAndBytesConfig
from transformers import StoppingCriteria, StoppingCriteriaList
from concurrent.futures import ThreadPoolExecutor
from typing import Optional
from collections import Counter
import asyncio
import torch
import secrets
import threading
import re
import traceback
import uuid 
import bcrypt

global_event_loop = asyncio.get_event_loop()


app = FastAPI()

executor = ThreadPoolExecutor(max_workers=4)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^vscode-webview://.*$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class NewChat(BaseModel):
    chat_id: Optional[int] = None
    prompt: str
    response: Optional[str] = None
    chat_title: Optional[str] = None
    email: Optional[str] = None

class AutoCompleteRequest(BaseModel):
    prompt: str

class LoginRequest(BaseModel):
    emailId: str
    password: str
    rememberMe: bool 

class SignupRequest(BaseModel):
    emailId: str
    name: str
    password: str
    rememberMe: bool

llm_lock = threading.Lock()

model_id = "./deepseek-coder-1.3b-instruct"
tokenizer = AutoTokenizer.from_pretrained(model_id, trust_remote_code=True)


model = AutoModelForCausalLM.from_pretrained(
    model_id,
    device_map="auto",
    torch_dtype=torch.float32,
)

def load_key(path="./fernet.key"):
    with open(path, "rb") as f:
        return f.read()
    
key = load_key()
cipher = Fernet(key)

def encrypt_text(text: str) -> str:
    return cipher.encrypt(text.encode()).decode()

def decrypt_text(encrypted_text: str) -> str:
    return cipher.decrypt(encrypted_text.encode()).decode()

@app.get("/")
def read_root():
    return {"Hello": "World"}


@app.get("/validate")
async def validate(sessionId: str = Cookie(None)):
    session = await sessions_collection.find_one({"sessionId": sessionId})
    if not session:
        raise HTTPException(status_code=401)
    
    user = await usersLogin_collection.find_one({"emailId": session["emailId"]})
    return {"name": user["name"]}


async def createSession(emailId: str, rememberMe: bool, response: Response):
    sessionId = str(uuid.uuid4())
    expiry = datetime.now(timezone.utc) + timedelta(minutes=4) if rememberMe else datetime.now(timezone.utc) + timedelta(minutes=2)
    cookieMaxAge = 7*24*60*60 if rememberMe else 1*24*60*60

    await sessions_collection.insert_one({
        "sessionId": sessionId,
        "emailId": emailId,
        "created_at": datetime.now(timezone.utc),
        "expires_at": expiry
    })

    response.set_cookie(
        key = "sessionId",
        value = sessionId,
        httponly = True,
        max_age = cookieMaxAge,
        samesite = "none",
        secure = True
    )


def hash_password(plain_password: str) -> bytes:
    return bcrypt.hashpw(plain_password.encode('utf-8'), bcrypt.gensalt())

def verify_password(plain_password: str, hashed_password: bytes) -> bool:
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password)

@app.post("/login")
async def login(payload: LoginRequest, response: Response):
    await usersLogin_collection.delete_many({"emailId": ""})

    user = await usersLogin_collection.find_one({"emailId": payload.emailId})
    print(user)
    if not user :
        raise HTTPException(status_code=404, detail="User not found")
    if not verify_password(payload.password, user['password']):
        raise HTTPException(status_code=401, detail="Invalid password")
    
    await createSession(payload.emailId, payload.rememberMe, response)

    return {"message": f"Welcome back, {user['name']}"}

@app.post("/signup")
async def signup(payload: SignupRequest, response: Response):
    await usersLogin_collection.delete_many({"emailId": ""})
    print(payload.emailId)

    existing_user = await usersLogin_collection.find_one({"emailId": payload.emailId})
    print(existing_user)
    if existing_user:
        raise HTTPException(status_code=409)
    
    token = secrets.token_urlsafe(32)
    await pendingUsers_collection.delete_many({"emailId": payload.emailId})

    hashed = hash_password(payload.password)
    
    await pendingUsers_collection.insert_one({
        "token" : token,
        "emailId": payload.emailId,
        "name": payload.name,
        "password": hashed,
        "expires_at": datetime.now(timezone.utc) + timedelta(minutes=5)
    })

    response.status_code = send_verification_mail(payload.emailId , payload.name, token)

def send_verification_mail(receiverEmailId: str, name: str, token: str):
    msg = EmailMessage()
    msg["From"] = EMAIL_ID
    msg["To"] = receiverEmailId
    msg["Subject"] = "Verification for CodeGenie"

    verification_link = f"{api_root}/verify-email?token={token}"

    msg.set_content(f"Hello {name},\n\nPlease verify your email by clicking the link below:\n{verification_link}\n\nDO NOT CLICK ON THE LINK IF YOU HAVE NOT REQUESTED FOR IT\n\nThanks,\nCodeGenie Team")

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as smtp:
            smtp.login(EMAIL_ID, EMAIL_PASS)
            smtp.send_message(msg)
        print(f"✅ Verification email sent to {receiverEmailId}")
        return 200

    except smtplib.SMTPRecipientsRefused:
        print(f"❌ Invalid recipient address: {receiverEmailId}")
        return 400

    except smtplib.SMTPAuthenticationError:
        print("❌ Authentication failed. Check your email or App Password.")
        return 500

    except smtplib.SMTPException as e:
        print(f"❌ SMTP error: {e}")
        return 500


@app.get("/verify-email")
async def get(token:str):
    user_details = await pendingUsers_collection.find_one({"token":token})
    
    if (user_details and (user_details["expires_at"] > datetime.now(timezone.utc))):
        await usersLogin_collection.insert_one({
            "emailId": user_details["emailId"],
            "name": user_details["name"],
            "password": user_details["password"]
        })
        await pendingUsers_collection.delete_one({"token":token})
        return HTMLResponse("<h2>Email verified successfully!<h2>")
        

@app.get("/is-verified")
async def get( emailId:str, rememberMe : bool, response: Response):
    user = await usersLogin_collection.find_one({"emailId": emailId})
    if (user):
        await createSession(emailId, rememberMe, response)
        return {"message":f"Welcome, {user['name']}"}
    pending_user = await pendingUsers_collection.find_one({"emailId":emailId})
    if (pending_user):
        temp = type(pending_user["expires_at"])
        print("type of expires at : ", temp)
        if (pending_user["expires_at"] > datetime.now(timezone.utc)):
            raise HTTPException(status_code = 404, detail="Link not clicked")
        else:
            raise HTTPException(status_code = 410, detail="Link expired")

@app.delete("/pending-requests")
async def delete( emailId : str):
    print(f"Deleting pending request for: {emailId}")
    result = await pendingUsers_collection.delete_many({"emailId":emailId})
    print("Found in DB:", result)
    
    
    

async def checkCookie(sessionId: str = Cookie(None)):
    if not sessionId:
        raise HTTPException(status_code=401, detail="Missing session cookie")

    session = await sessions_collection.find_one({"sessionId": sessionId})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
        
    print("session-->",session)
    
    expires_at = session["expires_at"]
    if expires_at.tzinfo is None:
        raise HTTPException(status_code=500, detail="Invalid expires_at stored in DB: timezone missing")
    now_utc = datetime.now(timezone.utc)
    if abs(now_utc - expires_at) < timedelta(minutes = 5):
        expires_at = expires_at + timedelta(minutes = 5)
        print("****Extended session time. valid until ",expires_at,"*******")
        sessions_collection.update_one(
            {"sessionId" : sessionId},
            {"$set" : {"expires_at" : expires_at}}
        )
            
    if expires_at < now_utc:
        raise HTTPException(status_code=401, detail="Expired session")

    emailId = session["emailId"]
    return emailId

@app.delete("/logout")
async def logout(response: Response, sessionId: str = Cookie(None)):
    await sessions_collection.delete_one({"sessionId": sessionId})
    response.delete_cookie(key="SessionId")

@app.post("/chat")
async def post(new_chat: NewChat, sessionId: str = Cookie(None)):
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

    return StreamingResponse(stream_code(new_chat,messages,guest_mode), media_type="text/plain")
    
def stream_code(new_chat: NewChat, messages: list, guest_mode: bool):
    prompt = "You are an AI assistant. Always answer ONLY in English.\n"

    for m in messages:
        prompt += f"<|user|>\n{m['user']}\n<|assistant|>\n{m['bot']}\n"
    prompt += f"<|user|>\n{new_chat.prompt}\n<|assistant|>\n"

    input_ids = tokenizer(prompt, return_tensors="pt").to(model.device).input_ids
    generated = input_ids
    buffer = ""
    full_response = ""

    stop_strings = ["<|user|>", "<|end|>", "</s>"]

    model.eval()
    with torch.no_grad():
        for _ in range(500):
            outputs = model(input_ids=generated)
            next_token_logits = outputs.logits[:, -1, :]
            next_token = torch.argmax(next_token_logits, dim=-1).unsqueeze(-1)

            generated = torch.cat((generated, next_token), dim=1)
            decoded = tokenizer.decode(next_token[0], skip_special_tokens=True)
            full_response += decoded
            buffer += decoded

            if any(stop in full_response for stop in stop_strings):
                break

            if "\n" in buffer or "." in buffer or " " in buffer or len(buffer) > 20:
                cleaned = buffer.replace("<|user|>", "").replace("<|assistant|>", "")
                yield cleaned
                buffer = ""

        if buffer:
            cleaned = buffer.replace("<|user|>", "").replace("<|assistant|>", "")
            yield cleaned

    final_response = full_response.replace("<|user|>", "").replace("<|assistant|>", "").strip()
    new_chat.response = final_response

    if not guest_mode:
        asyncio.run_coroutine_threadsafe(NewChat_CurrentChat(new_chat), global_event_loop)

async def NewChat_CurrentChat(new_chat: NewChat):
    chat_id = new_chat.chat_id
    prompt = new_chat.prompt.strip()
    response = new_chat.response.strip()
    chat_title = new_chat.chat_title
    emailId = new_chat.email
    enc_prompt = encrypt_text(prompt)
    print(enc_prompt)
    enc_response = encrypt_text(response)
    print(enc_response)
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


@app.get("/chat/{chat_id}")
async def get(chat_id: int, sessionId: str = Cookie(None)):
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

class ChatUpdate(BaseModel):
    chat_title: str
    

@app.patch("/chat/{chat_id}")
async def patch(chat_id: int, chat_title: ChatUpdate, sessionId: str = Cookie(None)):
    emailId = await checkCookie(sessionId)

    result = await chats_collection.update_one(
        {"chat_id": chat_id, "emailId": emailId},
        {"$set": {"chat_title": chat_title.chat_title}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Chat not found for this user to update.")    
    return {"message": "Updated"}


@app.delete("/chat/{chat_id}")
async def delete(chat_id: int, sessionId: str = Cookie(None)):
    emailId = await checkCookie(sessionId)

    result = await chats_collection.delete_one({"chat_id": chat_id, "emailId": emailId})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Chat does not exist for this user.")
    return {"message": "Chat has been deleted successfully"}


@app.get("/list-all-chats")
async def get_chat_list(sessionId: str = Cookie(None)):
    emailId = await checkCookie(sessionId)

    chats = []
    async for chat in chats_collection.find({"emailId": emailId}, {"chat_id": 1, "chat_title": 1, "_id": 0}):
        if "chat_id" in chat and "chat_title" in chat:
            chats.append({
                "chat_id": chat["chat_id"],
                "chat_title": chat["chat_title"]
            })
    return chats


def auto_complete(request: AutoCompleteRequest):
    prompt = request.prompt.strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="Prompt cannot be empty.")

    print("=== Autocomplete Called ===")
    print(f"Prompt sent to model:\n{prompt}")

    try:
        inputs = tokenizer(prompt, return_tensors="pt").to(model.device)

        with llm_lock:
            outputs = model.generate(**inputs, max_new_tokens=200)

        raw_output = tokenizer.decode(outputs[0], skip_special_tokens=True)

        print("=== Raw Output from Model ===")
        print()
        print(raw_output)

        cleaned = raw_output
        cleaned = cleaned.strip()

        if cleaned.startswith('"') and cleaned.endswith('"'):
            cleaned = cleaned[1:-1]
        
        cleaned = cleaned.replace("<|fim_start|>", "").replace("<|fim_end|>", "").replace("<|fim_hole|>", "").replace("+","")

        print("=== Cleaned Suggestion ===")
        print
        print(cleaned)

        return {"text": cleaned}

    except Exception as e:
        print("=== Autocomplete Error Trace ===")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Autocomplete failed: {str(e)}")
    

@app.post("/auto_complete")
async def auto_completion(request: AutoCompleteRequest):
    loop = asyncio.get_running_loop()
    result = await loop.run_in_executor(None, auto_complete, request)
    return result

class GenerateRequest(BaseModel):
    prompt: str


class StopOnTokens(StoppingCriteria):
    def __init__(self, stop_token_ids: list[list[int]]):
        self.stop_token_ids = [torch.tensor(x, dtype=torch.long) for x in stop_token_ids]
        self.device = 'cuda' if torch.cuda.is_available() else 'cpu'
        for i in range(len(self.stop_token_ids)):
            self.stop_token_ids[i] = self.stop_token_ids[i].to(self.device)

    def __call__(self, input_ids: torch.LongTensor, scores: torch.FloatTensor, **kwargs) -> bool:
        for stop_id_seq in self.stop_token_ids:
            if stop_id_seq.shape[0] <= input_ids.shape[1]:
                if torch.all(input_ids[0, -stop_id_seq.shape[0]:] == stop_id_seq):
                    return True
        return False

def generate_from_prompt(prompt: str) -> str:
    inputs = tokenizer(prompt, return_tensors="pt").to(model.device)

    stop_strings = ["<|user|>", "<|end|>", "</s>"] 

    stop_token_ids_list = []
    for s in stop_strings:
        stop_token_ids_list.append(tokenizer.encode(s, add_special_tokens=False))

    stopping_criteria = StoppingCriteriaList([StopOnTokens(stop_token_ids_list)])

    with llm_lock: 
        outputs = model.generate(
            **inputs,
            max_new_tokens=500, 
            do_sample=False,    
            num_beams=1,        
            stopping_criteria=stopping_criteria, 
            pad_token_id=tokenizer.eos_token_id, 
            eos_token_id=tokenizer.eos_token_id 
        )

    raw_output = tokenizer.decode(outputs[0], skip_special_tokens=True)

    print("--- Raw Output from Model ---")
    print(raw_output)
    all_code_blocks = re.findall(r"```(?:\w+)?\s*\n(.*?)\n```", raw_output, re.DOTALL)

    if all_code_blocks:
        cleaned_output = all_code_blocks[-1].strip()
        print("--- Extracted Code Block (Last One) ---")
        print(cleaned_output)
    else:
        print("--- WARNING: No markdown---")
        cleaned_output = raw_output.strip()

        instruction_pattern = re.compile(
            r"You are a strict coding assistant\. Fix the following code\. \*\*Return only the fixed code block, enclosed in markdown triple backticks\. Do not add any other text, explanation, or comments\.\*\*.*?"
            r"Your corrected code:\s*\n",
            re.DOTALL | re.IGNORECASE
        )
        cleaned_output = instruction_pattern.sub("", cleaned_output).strip()

        cleaned_output = cleaned_output.replace("<|fim_start|>", "").replace("<|fim_end|>", "").replace("<|fim_hole|>", "").strip()
        cleaned_output = cleaned_output.replace("<|user|>", "").replace("<|assistant|>", "").strip()

        conversational_fillers_patterns = [
            r"I am not sure what the correct syntax is\. The correct syntax should be:",
            r"I have tried to fix the code but I am not sure what the correct syntax is\.",
            r"The corrected code is:",
            r"Here is the fixed code:",
            r"I will fix the code as follows:",
            r"Here's the corrected code:"
        ]

        for filler_pattern in conversational_fillers_patterns:
            cleaned_output = re.sub(re.escape(filler_pattern) + r".*", "", cleaned_output, flags=re.DOTALL | re.IGNORECASE).strip()
        cleaned_output = re.sub(r"```.*", "", cleaned_output, flags=re.DOTALL).strip() # Remove any partial code block headers/footers

        print("--- Aggressively Cleaned Output ---")
        print(cleaned_output)

    return cleaned_output

@app.post("/generate")
async def generate(request: GenerateRequest):
    prompt = request.prompt.strip()

    if not prompt:
        raise HTTPException(status_code=400, detail="Prompt cannot be empty.")

    loop = asyncio.get_running_loop()
    result = await loop.run_in_executor(None, generate_from_prompt, prompt)
    return {"text": result}

