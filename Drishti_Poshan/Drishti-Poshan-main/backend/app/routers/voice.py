"""
Drishti Poshan — Voice Router
==============================
POST /api/voice/transcribe  →  Legacy Whisper transcription (raw text)
POST /api/voice/process     →  Groq two-step pipeline (structured data)
"""
import logging
import time

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse

from app.schemas.ocr import (
    FieldConfidence,
    OCRErrorDetail,
    OCRExtractedChild,
    OCRExtractedMeasurement,
    OCRSuccessResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/voice", tags=["voice"])

# Allowed audio MIME types
ALLOWED_AUDIO_TYPES = {
    "audio/webm", "audio/wav", "audio/mpeg", "audio/mp3",
    "audio/ogg", "audio/flac", "audio/x-wav", "audio/mp4",
    "audio/m4a", "audio/x-m4a", "application/octet-stream",
}

MAX_AUDIO_BYTES = 25 * 1024 * 1024  # 25 MB (Whisper limit)


# ──────────────────────────────────────────────────────────────────
#  POST /api/voice/process  — Groq Voice-to-Data Pipeline
# ──────────────────────────────────────────────────────────────────

@router.post(
    "/process",
    response_model=OCRSuccessResponse,
    responses={
        400: {"model": OCRErrorDetail, "description": "Bad audio or no speech"},
        503: {"model": OCRErrorDetail, "description": "Voice engine unavailable"},
    },
    summary="Process voice recording into structured child data",
    description=(
        "Upload an audio recording of an Anganwadi worker dictating child data. "
        "Two-step pipeline: (1) Groq Whisper transcription with Hindi/English code-switching, "
        "(2) Llama structuring pass mapping to PostgreSQL schema. "
        "Returns the same response shape as POST /api/ocr/extract."
    ),
)
async def process_voice(
    audio: UploadFile = File(
        ...,
        description="Audio recording (WebM, WAV, MP3, M4A)",
    ),
):
    t0 = time.perf_counter()

    # ── Payload validation ────────────────────────────────────────
    if audio.content_type and audio.content_type not in ALLOWED_AUDIO_TYPES:
        return JSONResponse(
            status_code=400,
            content=OCRErrorDetail(
                error="unsupported_format",
                detail=f"Audio type '{audio.content_type}' not supported. Use WebM, WAV, MP3, or M4A.",
                stage="payload_validation",
            ).model_dump(),
        )

    try:
        audio_bytes = await audio.read()
    except Exception as e:
        logger.error(f"Failed to read audio file: {e}")
        return JSONResponse(
            status_code=400,
            content=OCRErrorDetail(
                error="read_failure",
                detail=f"Could not read audio file: {e}",
                stage="payload_validation",
            ).model_dump(),
        )

    if len(audio_bytes) < 100:
        return JSONResponse(
            status_code=400,
            content=OCRErrorDetail(
                error="file_too_small",
                detail="Audio file too small or empty.",
                stage="payload_validation",
            ).model_dump(),
        )

    if len(audio_bytes) > MAX_AUDIO_BYTES:
        return JSONResponse(
            status_code=400,
            content=OCRErrorDetail(
                error="file_too_large",
                detail=f"Audio exceeds {MAX_AUDIO_BYTES // (1024*1024)} MB limit.",
                stage="payload_validation",
            ).model_dump(),
        )

    logger.info(
        f"Voice process request — file='{audio.filename}', "
        f"size={len(audio_bytes)/1024:.1f} KB, type={audio.content_type}"
    )

    # ── Groq two-step pipeline ────────────────────────────────────
    from app.services.groq_voice_service import process_voice_to_data

    try:
        structured = process_voice_to_data(
            audio_bytes=audio_bytes,
            filename=audio.filename or "recording.webm",
        )
    except ValueError as e:
        logger.warning(f"Voice extraction error: {e}")
        return JSONResponse(
            status_code=400,
            content=OCRErrorDetail(
                error="extraction_failed",
                detail=str(e),
                stage="voice_extraction",
            ).model_dump(),
        )
    except TimeoutError as e:
        logger.error(f"Groq voice timeout: {e}")
        return JSONResponse(
            status_code=503,
            content=OCRErrorDetail(
                error="api_timeout",
                detail=str(e),
                stage="voice_extraction",
            ).model_dump(),
        )
    except RuntimeError as e:
        logger.error(f"Groq voice unavailable: {e}")
        return JSONResponse(
            status_code=503,
            content=OCRErrorDetail(
                error="engine_unavailable",
                detail=str(e),
                stage="voice_extraction",
            ).model_dump(),
        )
    except Exception as e:
        logger.error(f"Unexpected voice error: {e}", exc_info=True)
        return JSONResponse(
            status_code=503,
            content=OCRErrorDetail(
                error="voice_error",
                detail=f"Voice processing failed: {e}",
                stage="voice_extraction",
            ).model_dump(),
        )

    # ── Schema enforcement (same as OCR router) ──────────────────
    warnings = list(structured.get("warnings", []))

    try:
        child = OCRExtractedChild(**structured["child_data"])
    except Exception as e:
        logger.warning(f"Child schema validation partial failure: {e}")
        warnings.append(f"Some fields failed validation: {e}")
        child = OCRExtractedChild()

    try:
        measurement = OCRExtractedMeasurement(**structured["measurement_data"])
    except Exception as e:
        logger.warning(f"Measurement schema validation failure: {e}")
        warnings.append(f"Measurement validation issue: {e}")
        measurement = OCRExtractedMeasurement()

    try:
        field_conf = FieldConfidence(**structured["field_confidence"])
    except Exception:
        field_conf = FieldConfidence()

    elapsed = time.perf_counter() - t0
    logger.info(
        f"Voice pipeline completed in {elapsed:.2f}s — "
        f"confidence={structured['overall_confidence']:.1%}"
    )

    return OCRSuccessResponse(
        success=True,
        raw_text=structured.get("raw_text", ""),
        extracted_child=child,
        extracted_measurement=measurement,
        field_confidence=field_conf,
        overall_confidence=structured["overall_confidence"],
        warnings=warnings,
    )


# ──────────────────────────────────────────────────────────────────
#  POST /api/voice/transcribe  — Legacy raw transcription
# ──────────────────────────────────────────────────────────────────

@router.post("/transcribe")
async def transcribe_audio(
    request: Request,
    audio: UploadFile = File(..., description="Audio file (webm, wav, mp3)"),
    language: str = Form(None, description="Language hint: 'hi' for Hindi, 'en' for English"),
):
    """
    Legacy endpoint: raw Whisper transcription (no structuring).
    Kept for backward compatibility with older frontend components.
    Now uses Groq Whisper instead of local model.
    """
    if audio.content_type and audio.content_type not in ALLOWED_AUDIO_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported audio format: {audio.content_type}.",
        )

    audio_bytes = await audio.read()
    if len(audio_bytes) < 100:
        raise HTTPException(status_code=400, detail="Audio file too small or empty.")

    from app.services.groq_voice_service import _get_groq_client, _transcribe_audio

    try:
        client = _get_groq_client()
        result = _transcribe_audio(client, audio_bytes, audio.filename or "audio.webm")
        return {
            "success": True,
            "data": {
                "text": result["text"],
                "language": result.get("language", "auto"),
                "confidence": 0.90,  # Groq Whisper v3 baseline
                "segments": [],
            },
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")
