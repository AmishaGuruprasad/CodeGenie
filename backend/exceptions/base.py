class AppException(Exception):
    status_code = 500

    message = "Internal Error"

    def __init__(self, message = None):
        super().__init__(message or self.message)
        if message:
            self.message = message