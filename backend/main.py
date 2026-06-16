from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
# from concurrent.futures import ThreadPoolExecutor


# executor = ThreadPoolExecutor(max_workers=4)

from routes.auth import router as auth_router
from routes.chat import router as chat_router

app = FastAPI()

import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s - %(name)s - %(message)s"
)

logger = logging.getLogger(__name__)

@app.middleware("http")
async def log_requests(request, call_next):
    logger.info("Request: %s %s", request.method, request.url.path)

    try:
        response = await call_next(request)
        logger.info(
            "Response %s %s -> %s",
            request.method, 
            request.url.path,
            response.status_code
        )

        return response
    except Exception:
        logger.exception(
            "Unhandled error during request: %s %s",
            request.method,
            request.url.path
        )
        raise


from cryptography.fernet import Fernet #type: ignore
import os
# key = Fernet.generate_key()
# print(key)
# with open("fernet.key", "wb") as f:
#     f.write(key)


app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^vscode-webview://.*$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(chat_router)



@app.get("/")
def read_root():
    return {"Hello": "World"}










