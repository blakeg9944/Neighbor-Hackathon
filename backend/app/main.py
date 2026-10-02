# app/main.py (or wherever FastAPI() is instantiated)
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes import router as url_router

app = FastAPI()

# 1. Enable CORS for the Chrome Extension
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows requests from chrome-extension:// origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 2. Include your new router
app.include_router(url_router)