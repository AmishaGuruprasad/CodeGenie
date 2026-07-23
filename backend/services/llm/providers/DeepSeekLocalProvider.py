# from models.chat_models import AutoCompleteRequest, GenerateRequest
# from transformers import AutoTokenizer, AutoModelForCausalLM, BitsAndBytesConfig
# from transformers import StoppingCriteria, StoppingCriteriaList
# import torch, traceback
# import asyncio
# import re, threading


# model_id = "./deepseek-coder-1.3b-instruct"
# tokenizer = AutoTokenizer.from_pretrained(model_id, trust_remote_code=True)

# model = AutoModelForCausalLM.from_pretrained(
#     model_id,
#     device_map="auto",
#     torch_dtype=torch.float32,
# )

# class DeepSeekLocal(LLMProvider):
        
#     def stream_response(prompt: str, messages: list):
#         prompt = "You are an AI assistant. Always answer ONLY in English.\n"

#         for m in messages:
#             prompt += f"<|user|>\n{m['user']}\n<|assistant|>\n{m['bot']}\n"
#         prompt += f"<|user|>\n{prompt}\n<|assistant|>\n"

#         input_ids = tokenizer(prompt, return_tensors="pt").to(model.device).input_ids
#         generated = input_ids
#         buffer = ""

#         stop_strings = ["<|user|>", "<|end|>", "</s>"]

#         model.eval()
#         with torch.no_grad():
#             for _ in range(500):
#                 outputs = model(input_ids=generated)
#                 next_token_logits = outputs.logits[:, -1, :]
#                 next_token = torch.argmax(next_token_logits, dim=-1).unsqueeze(-1)

#                 generated = torch.cat((generated, next_token), dim=1)
#                 decoded = tokenizer.decode(next_token[0], skip_special_tokens=True)
#                 buffer += decoded

#                 if any(stop in buffer for stop in stop_strings):
#                     break

#                 if "\n" in buffer or "." in buffer or " " in buffer or len(buffer) > 20:
#                     cleaned = buffer.replace("<|user|>", "").replace("<|assistant|>", "")
#                     yield cleaned
#                     buffer = ""

#             if buffer:
#                 cleaned = buffer.replace("<|user|>", "").replace("<|assistant|>", "")
#                 yield cleaned  
    