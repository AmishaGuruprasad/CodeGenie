import nest_asyncio
import uvicorn
from threading import Thread
from pyngrok import ngrok
import time
import requests
import logging

logging.getLogger("pyngrok").setLevel(logging.WARNING)

# Kill any previous tunnels
ngrok.kill()

# Set your ngrok auth token
ngrok.set_auth_token("2yrkcIMBcFAZzViKQei8Me86Rcc_7jN3BX568F9JeA95YdFFK")

nest_asyncio.apply()

PORT = 7860

# Start FastAPI in a background thread
def start_server():
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, log_level="warning", access_log=False)

server_thread = Thread(target=start_server)
server_thread.start()


# Wait for server to become available (poll until success)
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
    public_url = ngrok.connect(addr=PORT,domain="joey-obliging-recently.ngrok-free.app")
    #public_url = ngrok.connect(addr=PORT,domain="code-genie-ten.vercel.app")
    print("🚀 FastAPI is live at:", public_url)
else:
    print("❌ Server failed to start within timeout.")

server_thread.join()