from models.chat_models import AutoCompleteRequest, GenerateRequest
from transformers import AutoTokenizer, AutoModelForCausalLM, BitsAndBytesConfig
from transformers import StoppingCriteria, StoppingCriteriaList
import torch, traceback
import asyncio
import re, threading

from .provider_factory import ProviderFactory

factory = ProviderFactory()

async def stream_response(prompt: str, messages: list = [], provider : str = "mistral"):
    provider = factory.get_provider(provider)
    async for chunk in provider.stream_response(prompt, messages):
        yield chunk






# # async def auto_complete(request: AutoCompleteRequest):
# #     loop = asyncio.get_running_loop()
# #     result = await loop.run_in_executor(None, get_auto_complete_response, request)

# # def get_auto_complete_response(request: AutoCompleteRequest):
# #     prompt = request.prompt.strip()
# #     if not prompt:
# #         raise HTTPException(status_code=400, detail="Prompt cannot be empty.")

# #     print("=== Autocomplete Called ===")
# #     print(f"Prompt sent to model:\n{prompt}")

# #     try:
# #         inputs = tokenizer(prompt, return_tensors="pt").to(model.device)

# #         with llm_lock:
# #             outputs = model.generate(**inputs, max_new_tokens=200)

# #         raw_output = tokenizer.decode(outputs[0], skip_special_tokens=True)

# #         print("=== Raw Output from Model ===")
# #         print()
# #         print(raw_output)

# #         cleaned = raw_output
# #         cleaned = cleaned.strip()

# #         if cleaned.startswith('"') and cleaned.endswith('"'):
# #             cleaned = cleaned[1:-1]
        
# #         cleaned = cleaned.replace("<|fim_start|>", "").replace("<|fim_end|>", "").replace("<|fim_hole|>", "").replace("+","")

# #         print("=== Cleaned Suggestion ===")
# #         print
# #         print(cleaned)

# #         return {"text": cleaned}

# #     except Exception as e:
# #         print("=== Autocomplete Error Trace ===")
# #         traceback.print_exc()
# #         raise HTTPException(status_code=500, detail=f"Autocomplete failed: {str(e)}")
    

# # async def generate_from_prompt(request: GenerateRequest):
# #     prompt = request.prompt.strip()

# #     if not prompt:
# #         raise HTTPException(status_code=400, detail="Prompt cannot be empty.")

# #     loop = asyncio.get_running_loop()
# #     result = await loop.run_in_executor(None, generate, prompt)
# #     return {"text": result}


# # def generate(prompt: str) -> str:
# #     inputs = tokenizer(prompt, return_tensors="pt").to(model.device)

# #     stop_strings = ["<|user|>", "<|end|>", "</s>"] 

# #     stop_token_ids_list = []
# #     for s in stop_strings:
# #         stop_token_ids_list.append(tokenizer.encode(s, add_special_tokens=False))

# #     stopping_criteria = StoppingCriteriaList([StopOnTokens(stop_token_ids_list)])

# #     with llm_lock: 
# #         outputs = model.generate(
# #             **inputs,
# #             max_new_tokens=500, 
# #             do_sample=False,    
# #             num_beams=1,        
# #             stopping_criteria=stopping_criteria, 
# #             pad_token_id=tokenizer.eos_token_id, 
# #             eos_token_id=tokenizer.eos_token_id 
# #         )

# #     raw_output = tokenizer.decode(outputs[0], skip_special_tokens=True)

# #     print("--- Raw Output from Model ---")
# #     print(raw_output)
# #     all_code_blocks = re.findall(r"```(?:\w+)?\s*\n(.*?)\n```", raw_output, re.DOTALL)

# #     if all_code_blocks:
# #         cleaned_output = all_code_blocks[-1].strip()
# #         print("--- Extracted Code Block (Last One) ---")
# #         print(cleaned_output)
# #     else:
# #         print("--- WARNING: No markdown---")
# #         cleaned_output = raw_output.strip()

# #         instruction_pattern = re.compile(
# #             r"You are a strict coding assistant\. Fix the following code\. \*\*Return only the fixed code block, enclosed in markdown triple backticks\. Do not add any other text, explanation, or comments\.\*\*.*?"
# #             r"Your corrected code:\s*\n",
# #             re.DOTALL | re.IGNORECASE
# #         )
# #         cleaned_output = instruction_pattern.sub("", cleaned_output).strip()

# #         cleaned_output = cleaned_output.replace("<|fim_start|>", "").replace("<|fim_end|>", "").replace("<|fim_hole|>", "").strip()
# #         cleaned_output = cleaned_output.replace("<|user|>", "").replace("<|assistant|>", "").strip()

# #         conversational_fillers_patterns = [
# #             r"I am not sure what the correct syntax is\. The correct syntax should be:",
# #             r"I have tried to fix the code but I am not sure what the correct syntax is\.",
# #             r"The corrected code is:",
# #             r"Here is the fixed code:",
# #             r"I will fix the code as follows:",
# #             r"Here's the corrected code:"
# #         ]

# #         for filler_pattern in conversational_fillers_patterns:
# #             cleaned_output = re.sub(re.escape(filler_pattern) + r".*", "", cleaned_output, flags=re.DOTALL | re.IGNORECASE).strip()
# #         cleaned_output = re.sub(r"```.*", "", cleaned_output, flags=re.DOTALL).strip() # Remove any partial code block headers/footers

# #         print("--- Aggressively Cleaned Output ---")
# #         print(cleaned_output)

# #     return cleaned_output


# # class StopOnTokens(StoppingCriteria):
# #     def __init__(self, stop_token_ids: list[list[int]]):
# #         self.stop_token_ids = [torch.tensor(x, dtype=torch.long) for x in stop_token_ids]
# #         self.device = 'cuda' if torch.cuda.is_available() else 'cpu'
# #         for i in range(len(self.stop_token_ids)):
# #             self.stop_token_ids[i] = self.stop_token_ids[i].to(self.device)

# #     def __call__(self, input_ids: torch.LongTensor, scores: torch.FloatTensor, **kwargs) -> bool:
# #         for stop_id_seq in self.stop_token_ids:
# #             if stop_id_seq.shape[0] <= input_ids.shape[1]:
# #                 if torch.all(input_ids[0, -stop_id_seq.shape[0]:] == stop_id_seq):
# #                     return True
# #         return False
