from .base import AppException

class ProviderNotFound(AppException):
    status_code = 404
    message = "Requested provider not found."


class ProviderUnavailable(AppException):
    status_code = 503
    message = "Provider is temporarily unavailable."


class ModelGenerationError(AppException):
    status_code = 500
    message = "Failed to generate response."