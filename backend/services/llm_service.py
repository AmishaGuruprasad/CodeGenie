from models.chat_models import NewChat, AutoCompleteRequest, GenerateRequest
from database.collections import chats_collection
from transformers import AutoTokenizer, AutoModelForCausalLM, BitsAndBytesConfig
from transformers import StoppingCriteria, StoppingCriteriaList
import torch, traceback
import asyncio
from services.cryptography_service import encrypt_text
from datetime import datetime
from fastapi import HTTPException
import re, threading


global_event_loop = asyncio.get_event_loop()


model_id = "./deepseek-coder-1.3b-instruct"
tokenizer = AutoTokenizer.from_pretrained(model_id, trust_remote_code=True)

model = AutoModelForCausalLM.from_pretrained(
    model_id,
    device_map="auto",
    torch_dtype=torch.float32,
)


async def stream_code(new_chat: NewChat, messages: list, guest_mode: bool):
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
        await save_chat(new_chat)
    


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



# async def auto_complete(request: AutoCompleteRequest):
#     loop = asyncio.get_running_loop()
#     result = await loop.run_in_executor(None, get_auto_complete_response, request)

# def get_auto_complete_response(request: AutoCompleteRequest):
#     prompt = request.prompt.strip()
#     if not prompt:
#         raise HTTPException(status_code=400, detail="Prompt cannot be empty.")

#     print("=== Autocomplete Called ===")
#     print(f"Prompt sent to model:\n{prompt}")

#     try:
#         inputs = tokenizer(prompt, return_tensors="pt").to(model.device)

#         with llm_lock:
#             outputs = model.generate(**inputs, max_new_tokens=200)

#         raw_output = tokenizer.decode(outputs[0], skip_special_tokens=True)

#         print("=== Raw Output from Model ===")
#         print()
#         print(raw_output)

#         cleaned = raw_output
#         cleaned = cleaned.strip()

#         if cleaned.startswith('"') and cleaned.endswith('"'):
#             cleaned = cleaned[1:-1]
        
#         cleaned = cleaned.replace("<|fim_start|>", "").replace("<|fim_end|>", "").replace("<|fim_hole|>", "").replace("+","")

#         print("=== Cleaned Suggestion ===")
#         print
#         print(cleaned)

#         return {"text": cleaned}

#     except Exception as e:
#         print("=== Autocomplete Error Trace ===")
#         traceback.print_exc()
#         raise HTTPException(status_code=500, detail=f"Autocomplete failed: {str(e)}")
    

# async def generate_from_prompt(request: GenerateRequest):
#     prompt = request.prompt.strip()

#     if not prompt:
#         raise HTTPException(status_code=400, detail="Prompt cannot be empty.")

#     loop = asyncio.get_running_loop()
#     result = await loop.run_in_executor(None, generate, prompt)
#     return {"text": result}


# def generate(prompt: str) -> str:
#     inputs = tokenizer(prompt, return_tensors="pt").to(model.device)

#     stop_strings = ["<|user|>", "<|end|>", "</s>"] 

#     stop_token_ids_list = []
#     for s in stop_strings:
#         stop_token_ids_list.append(tokenizer.encode(s, add_special_tokens=False))

#     stopping_criteria = StoppingCriteriaList([StopOnTokens(stop_token_ids_list)])

#     with llm_lock: 
#         outputs = model.generate(
#             **inputs,
#             max_new_tokens=500, 
#             do_sample=False,    
#             num_beams=1,        
#             stopping_criteria=stopping_criteria, 
#             pad_token_id=tokenizer.eos_token_id, 
#             eos_token_id=tokenizer.eos_token_id 
#         )

#     raw_output = tokenizer.decode(outputs[0], skip_special_tokens=True)

#     print("--- Raw Output from Model ---")
#     print(raw_output)
#     all_code_blocks = re.findall(r"```(?:\w+)?\s*\n(.*?)\n```", raw_output, re.DOTALL)

#     if all_code_blocks:
#         cleaned_output = all_code_blocks[-1].strip()
#         print("--- Extracted Code Block (Last One) ---")
#         print(cleaned_output)
#     else:
#         print("--- WARNING: No markdown---")
#         cleaned_output = raw_output.strip()

#         instruction_pattern = re.compile(
#             r"You are a strict coding assistant\. Fix the following code\. \*\*Return only the fixed code block, enclosed in markdown triple backticks\. Do not add any other text, explanation, or comments\.\*\*.*?"
#             r"Your corrected code:\s*\n",
#             re.DOTALL | re.IGNORECASE
#         )
#         cleaned_output = instruction_pattern.sub("", cleaned_output).strip()

#         cleaned_output = cleaned_output.replace("<|fim_start|>", "").replace("<|fim_end|>", "").replace("<|fim_hole|>", "").strip()
#         cleaned_output = cleaned_output.replace("<|user|>", "").replace("<|assistant|>", "").strip()

#         conversational_fillers_patterns = [
#             r"I am not sure what the correct syntax is\. The correct syntax should be:",
#             r"I have tried to fix the code but I am not sure what the correct syntax is\.",
#             r"The corrected code is:",
#             r"Here is the fixed code:",
#             r"I will fix the code as follows:",
#             r"Here's the corrected code:"
#         ]

#         for filler_pattern in conversational_fillers_patterns:
#             cleaned_output = re.sub(re.escape(filler_pattern) + r".*", "", cleaned_output, flags=re.DOTALL | re.IGNORECASE).strip()
#         cleaned_output = re.sub(r"```.*", "", cleaned_output, flags=re.DOTALL).strip() # Remove any partial code block headers/footers

#         print("--- Aggressively Cleaned Output ---")
#         print(cleaned_output)

#     return cleaned_output


# class StopOnTokens(StoppingCriteria):
#     def __init__(self, stop_token_ids: list[list[int]]):
#         self.stop_token_ids = [torch.tensor(x, dtype=torch.long) for x in stop_token_ids]
#         self.device = 'cuda' if torch.cuda.is_available() else 'cpu'
#         for i in range(len(self.stop_token_ids)):
#             self.stop_token_ids[i] = self.stop_token_ids[i].to(self.device)

#     def __call__(self, input_ids: torch.LongTensor, scores: torch.FloatTensor, **kwargs) -> bool:
#         for stop_id_seq in self.stop_token_ids:
#             if stop_id_seq.shape[0] <= input_ids.shape[1]:
#                 if torch.all(input_ids[0, -stop_id_seq.shape[0]:] == stop_id_seq):
#                     return True
#         return False
