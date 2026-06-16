from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
import os
from datetime import timezone
import logging 
logger = logging.getLogger(__name__)

load_dotenv("passwords.env")

# MONGO_URL = os.getenv("MONGO_URL",load_dotenv("passwords.env"))
MONGO_URL = "mongodb+srv://amishag0000_db_user:wPmLJjvE6Vowctwx@codegenie.bup496w.mongodb.net/?appName=CodeGenie"

try:
    client = AsyncIOMotorClient(MONGO_URL, tz_aware=True, tzinfo=timezone.utc)
    logger.info("Connected to MONGODB!")
except Exception as e:
    logger.error("Error during MongoDB Connection: "+e)
    


db = client.codegenie


