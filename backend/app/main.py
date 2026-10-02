# app/main.py (or wherever FastAPI() is instantiated)
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.routes import router as api_router
from app.services.errors import AppError

app = FastAPI()

# 1. Enable CORS for the Chrome Extension
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows requests from chrome-extension:// origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# 2. Service errors -> {"detail": {"code", "message"}} (DESIGN_SPEC §6)
@app.exception_handler(AppError)
def handle_app_error(_: Request, e: AppError):
    return JSONResponse(status_code=e.status, content={"detail": {"code": e.code, "message": e.message}})


# 3. Include the /api routes
app.include_router(api_router)
