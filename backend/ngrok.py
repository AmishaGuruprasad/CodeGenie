import nest_asyncio
import uvicorn
from threading import Thread
from pyngrok import ngrok
import time
import requests
from fastapi import FastAPI
import atexit

app = FastAPI()

@app.get("/")
def read_root():
    return {"status": "ok"}

atexit.register(lambda: print("❗ Python interpreter is shutting down."))

ngrok.kill()
ngrok.set_auth_token("Your auth")

PORT = 7860
nest_asyncio.apply()

def start_server():
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, log_level="info")

server_thread = Thread(target=start_server)
server_thread.start()

def wait_for_server(port, timeout=60):
    url = f"http://localhost:{port}"
    for _ in range(timeout):
        try:
            r = requests.get(url)
            if r.status_code == 200:
                return True
        except:
            pass
        time.sleep(1)
    return False

if wait_for_server(PORT):
    public_url = ngrok.connect(addr=PORT)
    print("🚀 FastAPI is live at:", public_url)
else:
    print("❌ Server failed to start within timeout.")

try:
    while True:
        time.sleep(1)
except KeyboardInterrupt:
    print("🔻 Shutting down server.")
