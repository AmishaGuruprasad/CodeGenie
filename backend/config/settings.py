import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    MISTRAL_API_KEY = os.environ["MISTRAL_API_KEY"]
    MISTRAL_MODEL = os.environ["MISTRAL_MODEL"]

    EMAIL_ID = os.environ["EMAIL_ID"]
    EMAIL_PASS = os.environ["EMAIL_PASS"]

    MONGO_URL = os.environ["MONGO_URL"]

    API_ROOT = os.environ["API_ROOT"]

    FERNET_KEY = os.environ["FERNET_KEY"]