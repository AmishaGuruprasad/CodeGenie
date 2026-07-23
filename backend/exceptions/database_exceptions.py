from .base import AppException

class DatabaseConnectionError(AppException):
    status_code = 500
    message = "Database connection failed."


class DatabaseOperationError(AppException):
    status_code = 500
    message = "Database operation failed."