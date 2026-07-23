from .base import AppException

class InvalidCredentials(AppException):
    status_code = 401
    message = "Invalid username or password."

class UserAlreadyExists(AppException):
    status_code = 409
    message = "User already exists."

class SessionExpired(AppException):
    status_code = 401
    message = "Session has expired."


class Unauthorized(AppException):
    status_code = 403
    message = "You are not authorized to perform this action."