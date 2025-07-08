from motor.motor_asyncio import AsyncIOMotorClient #type:ignore
from dotenv import load_dotenv #type:ignore
import os
from datetime import timezone

load_dotenv("passwords.env")

# MONGO_URL = os.getenv("MONGO_URL", "mongodb+srv://bhaargavvgutta:CODEgenie@cluster1.m6ocbwi.mongodb.net/?retryWrites=true&w=majority&appName=Cluster1")
MONGO_URL = os.getenv("MONGO_URL", "mongodb+srv://codegenieg4051:G405@cluster1.qostn0n.mongodb.net/?retryWrites=true&w=majority&appName=Cluster1")

client = AsyncIOMotorClient(MONGO_URL, tz_aware=True, tzinfo=timezone.utc)

db = client.codegenie
usersLogin_collection = db.login
chats_collection = db.chat
guests_collection = db.guest
sessions_collection = db.session


from fastapi import FastAPI, HTTPException, Response, Cookie #type:ignore
from fastapi.middleware.cors import CORSMiddleware #type:ignore
from fastapi.responses import JSONResponse, StreamingResponse #type:ignore
from pydantic import BaseModel #type:ignore
from transformers import AutoTokenizer, AutoModelForCausalLM, BitsAndBytesConfig #type:ignore
from transformers import StoppingCriteria, StoppingCriteriaList #type:ignore
from concurrent.futures import ThreadPoolExecutor
from cryptography.fernet import Fernet #type: ignore
from typing import Optional
from collections import Counter
import asyncio
import torch #type:ignore
import time
import threading
import re
import traceback
from datetime import datetime, timezone, timedelta
import uuid

global_event_loop = asyncio.get_event_loop()


app = FastAPI()

executor = ThreadPoolExecutor(max_workers=4)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^vscode-webview://.*$",
    # allow_origins=["vscode-webview://fakeid-32o8487-ckladshfoi"],
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

# model_id = "./deepseek-coder-1.3b-instruct"
model_id = "./deepseek-coder-1.3b-instruct"
tokenizer = AutoTokenizer.from_pretrained(model_id, trust_remote_code=True)

# bnb_config = BitsAndBytesConfig(
#     load_in_8bit=True,
#     llm_int8_threshold=6.0
# )

model = AutoModelForCausalLM.from_pretrained(
    model_id,
    #quantization_config=bnb_config,
    device_map="auto",
    torch_dtype=torch.float32,
    #trust_remote_code=True
)

def load_key(path="/Users/Supradeep Thavuta/OneDrive/Desktop/codegenie/fernet.key"):
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
    cookieMaxAge = 4*60 if rememberMe else 2*60 

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


@app.post("/login")
async def login(payload: LoginRequest, response: Response):
    await usersLogin_collection.delete_many({"emailId": ""})

    user = await usersLogin_collection.find_one({"emailId": payload.emailId, "password": payload.password})
    print(user)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    await createSession(payload.emailId, payload.rememberMe, response)

    return {"message": f"Welcome back, {user['name']}"}
    #put try catch
    #encrypt password (bcrypt)


@app.post("/signup")
async def signup(payload: SignupRequest, response: Response):
    await usersLogin_collection.delete_many({"emailId": ""})
    print(payload.emailId)

    existing_user = await usersLogin_collection.find_one({"emailId": payload.emailId})
    print(existing_user)
    if existing_user:
        raise HTTPException(status_code=409)
    
    await usersLogin_collection.insert_one({
        "emailId": payload.emailId,
        "name": payload.name,
        "password": payload.password
    })

    await createSession(payload.emailId, payload.rememberMe, response)

    return {"message": f"Welcome, {payload.name}"}


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
    if expires_at < now_utc:
        raise HTTPException(status_code=401, detail="Expired session")

    emailId = session["emailId"]
    return emailId

@app.post("/chat")
async def post(new_chat: NewChat, sessionId: str = Cookie(None)):
    print("Cookies received:", sessionId)
    emailId = await checkCookie(sessionId)
    print(emailId)
    new_chat.email = emailId
    print(new_chat.email)
    prompt = new_chat.prompt.strip()
    if prompt == "":
        return {"Error": "Prompt cannot be empty or not a valid prompt"}
    
    messages=[]
    if new_chat.chat_id:
        chat = await chats_collection.find_one({"chat_id":new_chat.chat_id, "emailId": emailId})
        if chat and "Messages" in chat:
            messages = chat["Messages"][-3:]

    return StreamingResponse(stream_code(new_chat,messages), media_type="text/plain")

def stream_code(new_chat: NewChat, messages: list):
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

    # Retrieve chat from MongoDB
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

    # loop = asyncio.get_running_loop()
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
            outputs = model.generate(**inputs, max_new_tokens=100)

        raw_output = tokenizer.decode(outputs[0], skip_special_tokens=True)

        print("=== Raw Output from Model ===")
        print()
        print(raw_output)

        cleaned = raw_output
        cleaned = cleaned.strip()

        if cleaned.startswith('"') and cleaned.endswith('"'):
            cleaned = cleaned[1:-1]
        
        cleaned = cleaned.replace("<|fim_start|>", "").replace("<|fim_end|>", "").replace("<|fim_hole|>", "")

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
            if stop_id_seq.shape[0] <= input_ids.shape[1]: # Ensure input_ids is long enough
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
    # Execute the LLM call in a separate thread to avoid blocking the main event loop
    result = await loop.run_in_executor(None, generate_from_prompt, prompt)
    return {"text": result}

