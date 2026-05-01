"""
Drishti Poshan - FastAPI Application Entry Point
Uses Lazy Loading for heavy AI models to ensure the server starts seamlessly.
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import ALLOWED_ORIGINS, GROQ_API_KEY
from app.database import init_db

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s │ %(levelname)-7s │ %(name)s │ %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("drishti")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Startup: Initialize database and instantiate AI services (Lazy Loading).
    Models are NOT loaded into RAM here to prevent slow startup times or timeouts.
    They will load upon first request.
    Shutdown: Cleanup resources.
    """
    logger.info("=" * 60)
    logger.info("  🌟 Drishti Poshan AI Engine — Starting Up (Lazy Load)")
    logger.info("=" * 60)

    # 1. Initialize database
    logger.info("📦 Initializing SQLite database...")
    await init_db()
    logger.info("✅ Database ready.")

    # 2. Instantiate XAI Engine
    from app.services.xai_service import XAIService
    app.state.xai_service = XAIService()
    try:
        app.state.xai_service.initialize()
        logger.info("✅ XAI SHAP engine ready.")
    except Exception as e:
        logger.warning(f"⚠️ XAI initialization failed (analysis degraded): {e}")

    # 3. Verify Groq API Key (powers OCR + Voice pipelines)
    if GROQ_API_KEY:
        logger.info("✅ Groq API key configured (OCR + Voice via Groq cloud).")
    else:
        logger.warning("⚠️ GROQ_API_KEY not set — OCR and Voice endpoints will fail. Add it to .env.")

    logger.info("=" * 60)
    logger.info("  🚀 All systems operational — Server is READY")
    logger.info("=" * 60)

    yield  # ← App is running

    # Shutdown
    logger.info("Shutting down Drishti Poshan...")


# ─── Create App ─────────────────────────────────────────────────

app = FastAPI(
    title="Drishti Poshan API",
    description="AI-powered child nutrition monitoring for Anganwadi workers",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Global Error Handler ──────────────────────────────────────

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled error: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": str(exc),
            "detail": "An internal server error occurred.",
        },
    )


# ─── Register Routers ──────────────────────────────────────────

from app.routers.children import router as children_router
from app.routers.voice import router as voice_router
from app.routers.ocr import router as ocr_router
from app.routers.analyze import router as analyze_router
from app.routers.auth import router as auth_router
from app.routers.analytics import router as analytics_router
from app.routers.bulk_upload import router as bulk_upload_router

app.include_router(children_router)
app.include_router(voice_router)
app.include_router(ocr_router)
app.include_router(analyze_router)
app.include_router(auth_router)
app.include_router(analytics_router)
app.include_router(bulk_upload_router)


# ─── Health Check ───────────────────────────────────────────────

@app.get("/")
async def root():
    return {
        "name": "Drishti Poshan API",
        "version": "1.0.0",
        "status": "operational",
        "services": {
            "ocr": "groq-llama-4-scout" if GROQ_API_KEY else "no_api_key",
            "voice": "groq-whisper-v3" if GROQ_API_KEY else "no_api_key",
            "xai": "ready" if app.state.xai_service.model else "degraded",
        },
    }


@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "message": "Drishti Poshan API is running."}
