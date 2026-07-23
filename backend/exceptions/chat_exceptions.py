from .base import AppException

class ChatNotFoundException(AppException):
    status_code = 404
    message = "Chat not found."
    def __init__(self, chatid):
        super().__init__()
        self.message = "Chat "+chatid+" not found"


class EmptyPrompt(AppException):
    status_code = 400
    message = "Prompt cannot be empty."
