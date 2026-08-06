from cryptography.fernet import Fernet #type: ignore
from config.settings import Settings

def encrypt_text(text: str) -> str:
    return cipher.encrypt(text.encode()).decode()

def decrypt_text(encrypted_text: str) -> str:
    return cipher.decrypt(encrypted_text.encode()).decode()

cipher = Fernet(Settings.FERNET_KEY)