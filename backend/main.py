from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from exceptions.chat_exceptions import ChatNotFoundException
from fastapi.responses import JSONResponse

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

    response = await call_next(request)
    logger.info(
        "Response %s %s -> %s",
        request.method, 
        request.url.path,
        response.status_code
    )

    return response

@app.exception_handler(ChatNotFoundException)
async def chat_not_found_handler(request, exc):
    return JSONResponse(
        status_code=404,
        content={
            "success": False,
            "message": f"Chat with id '{exc.chat_id}' not found"
        }
    )


@app.exception_handler(Exception)
async def global_exception_handler(request, exc):

    logger.exception(
        "Unhandled exception on %s %s",
        request.method,
        request.url.path
    )

    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "message": "Internal Server Error"
        }
    )

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










