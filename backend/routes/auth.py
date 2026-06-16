from services.auth_service import signup_user, validate_session, login_user, verify_email, verify_user, delete_pending_requests, logout_user
from models.auth_models import SignupRequest, LoginRequest
from fastapi import Response, APIRouter, Cookie

router = APIRouter()

@router.post("/signup")
async def signup(
    payload: SignupRequest,
    response: Response
):
    await signup_user(payload, response)


@router.get("/validate")
async def validate(sessionId: str = Cookie(None)):
    print("Validate route called")
    return await validate_session(sessionId)

@router.post("/login")
async def login(payload: LoginRequest, response: Response):

    return await login_user(payload, response)


@router.get("/verify-email")
async def verify(token:str):
    return await verify_email(token)


@router.get("/is-verified")
async def is_verified( emailId:str, rememberMe : bool, response: Response):
    return await verify_user(emailId, rememberMe, response)
    

@router.delete("/pending-requests")
async def delete( emailId : str):
    await delete_pending_requests(emailId)


@router.delete("/logout")
async def logout(response: Response, sessionId: str = Cookie(None)):
    await logout_user(response, sessionId)