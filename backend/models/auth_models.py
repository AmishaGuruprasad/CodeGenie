from pydantic import BaseModel


class SignupRequest(BaseModel):
    emailId: str
    name: str
    password: str
    rememberMe: bool


class LoginRequest(BaseModel):
    emailId: str
    password: str
    rememberMe: bool 

