from models.auth_models import SignupRequest, LoginRequest
from fastapi.responses import HTMLResponse
from fastapi import Response, Cookie, HTTPException
from database.collections import usersLogin_collection, pendingUsers_collection, sessions_collection
import secrets, bcrypt, uuid
from datetime import  datetime, timezone, timedelta

from email.message import EmailMessage
import smtplib

from config.settings import Settings


EMAIL_ID = Settings.EMAIL_ID
EMAIL_PASS = Settings.EMAIL_PASS

api_root = Settings.API_ROOT

import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s - %(name)s - %(message)s"
)

logger = logging.getLogger(__name__)

def hash_password(plain_password: str) -> bytes:
    return bcrypt.hashpw(plain_password.encode('utf-8'), bcrypt.gensalt())

def verify_password(plain_password: str, hashed_password: bytes) -> bool:
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password)

async def validate_session(sessionId: str = Cookie(None)):
    if sessionId is None:
        raise HTTPException(
            status_code=401,
            detail="No session cookie"
        )
    
    session = await sessions_collection.find_one({"sessionId": sessionId})
    if not session:
        raise HTTPException(status_code=401)
    if (session["expires_at"] < datetime.now(timezone.utc)):
        await sessions_collection.delete_one({"sessionId": sessionId})
        raise HTTPException(
            status_code = 401,
            detail = "Session expired"
        )   
    
    
    user = await usersLogin_collection.find_one({"emailId": session["emailId"]})
    return {"name": user["name"]}




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


async def signup_user(payload: SignupRequest, response : Response):
    await usersLogin_collection.delete_many({"emailId": ""})
    logger.info(
        f"Signup initiated for {payload.emailId}"
    )

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


async def login_user(payload: LoginRequest, response: Response):
    await usersLogin_collection.delete_many({"emailId": ""})

    user = await usersLogin_collection.find_one({"emailId": payload.emailId})
    print(user)
    if not user :
        raise HTTPException(status_code=404, detail="User not found")
    if not verify_password(payload.password, user['password']):
        raise HTTPException(status_code=401, detail="Invalid password")
    
    await createSession(payload.emailId, payload.rememberMe, response)

    logger.info(
        f"User logged in: {payload.emailId}"
    )

    return {"message": f"Welcome back, {user['name']}"}



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

async def verify_email(token:str):
    user_details = await pendingUsers_collection.find_one({"token":token})
    
    if (user_details and (user_details["expires_at"] > datetime.now(timezone.utc))):
        await usersLogin_collection.insert_one({
            "emailId": user_details["emailId"],
            "name": user_details["name"],
            "password": user_details["password"]
        })
        await pendingUsers_collection.delete_one({"token":token})
        return HTMLResponse("<h2>Email verified successfully!<h2>")
        

async def verify_user( emailId:str, rememberMe : bool, response: Response):
    user = await usersLogin_collection.find_one({"emailId": emailId})
    if (user):
        await createSession(emailId, rememberMe, response)
        return {"message":f"Welcome, {user['name']}"}
    pending_user = await pendingUsers_collection.find_one({"emailId":emailId})
    if (pending_user):
        if (pending_user["expires_at"] > datetime.now(timezone.utc)):
            raise HTTPException(status_code = 404, detail="Link not clicked")
        else:
            raise HTTPException(status_code = 410, detail="Link expired")

async def delete_pending_requests( emailId : str):
    logger.info(
        f"Deleting pending request for: {emailId}"
    )
    try:
        result = await pendingUsers_collection.delete_many({"emailId":emailId})
        print("Found in DB:", result)
    except Exception as e:
        logger.error(
            f"Something went wrong in deleting pending requests for: {emailId}: {e}"
        )


async def logout_user(response: Response, sessionId: str = Cookie(None)):
    await sessions_collection.delete_one({"sessionId": sessionId})
    response.delete_cookie(key="SessionId")



async def checkCookie(sessionId: str = Cookie(None)):
    if not sessionId:
        raise HTTPException(status_code=401, detail="Missing session cookie")
    session = None
    try:
        session = await sessions_collection.find_one({"sessionId": sessionId})
    except Exception as e:
        logger.exception("Exception occured during session verification: ",e)
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

