import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    MISTRAL_API_KEY = os.getenv("MISTRAL_API_KEY")
    MISTRAL_MODEL = os.getenv("MISTRAL_MODEL")
    EMAIL_ID = os.getenv("EMAIL_ID")
    MONGO_URL = os.getenv("MONGO_URL")
    EMAIL_PASS = os.getenv("EMAIL_PASS")
    API_ROOT = os.getenv("API_ROOT")
    FERNET_KEY = os.getenv("FERNET_KEY")