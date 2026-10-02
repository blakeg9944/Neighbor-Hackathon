class AppError(Exception):
    """Raised by services; main.py turns it into {"detail": {"code", "message"}} (DESIGN_SPEC §6)."""

    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


def not_found(what: str) -> AppError:
    return AppError(404, "NOT_FOUND", f"{what} not found")
