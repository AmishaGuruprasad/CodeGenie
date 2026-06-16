from cryptography.fernet import Fernet #type: ignore

def encrypt_text(text: str) -> str:
    return cipher.encrypt(text.encode()).decode()


def decrypt_text(encrypted_text: str) -> str:
    return cipher.decrypt(encrypted_text.encode()).decode()

def load_key(path="C:/Users/User/Desktop/CodeGenie/backend/fernet.key"):
    with open(path, "rb") as f:
        return f.read()
    
key = load_key()
cipher = Fernet(key)