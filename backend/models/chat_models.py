from typing import Optional 
from pydantic import BaseModel
class NewChat(BaseModel):
    chat_id: Optional[int] = None
    prompt: str
    response: Optional[str] = None
    chat_title: Optional[str] = None
    email: Optional[str] = None

class ChatUpdate(BaseModel):
    chat_title: str


class AutoCompleteRequest(BaseModel):
    prompt: str


class GenerateRequest(BaseModel):
    prompt: str
