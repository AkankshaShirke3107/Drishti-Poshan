"""
Drishti Poshan - Configuration & Settings
"""
import os
from pathlib import Path

# Load .env file (if present) before reading any env vars
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
except ImportError:
    pass  # python-dotenv is optional — env vars can be set directly

# --- Paths ---
BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BASE_DIR / "drishti.db"
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

# --- Database ---
DATABASE_URL = f"sqlite+aiosqlite:///{DB_PATH}"

# --- Server ---
HOST = os.getenv("DRISHTI_HOST", "127.0.0.1")
PORT = int(os.getenv("DRISHTI_PORT", "8000"))

# --- AI Models ---
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "base")
TROCR_MODEL = os.getenv("TROCR_MODEL", "microsoft/trocr-base-handwritten")

# --- Groq OCR ---
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")

# --- Authentication ---
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "drishti-poshan-secret-change-in-production-2024")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = int(os.getenv("JWT_EXPIRE_HOURS", "720"))  # 30 days for offline-first

# --- CORS ---
ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
]
