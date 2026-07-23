from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from datetime import timezone
from config.settings import Settings
from exceptions.database_exceptions import DatabaseConnectionError

load_dotenv("passwords.env")

MONGO_URL = Settings.MONGO_URL

try:
    client = AsyncIOMotorClient(MONGO_URL, tz_aware=True, tzinfo=timezone.utc)
except Exception as e:
    raise DatabaseConnectionError()
    


db = client.codegenie


