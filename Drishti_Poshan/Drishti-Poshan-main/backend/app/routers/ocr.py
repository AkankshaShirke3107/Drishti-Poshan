"""
Drishti Poshan — OCR Router (Groq Llama 4 Scout Pipeline)
=========================================================
POST /api/ocr/extract  →  Multipart image upload → structured JSON

Pipeline:
    1. Validate & ingest uploaded image
    2. Send to Groq (Llama 4 Scout Vision) for structured extraction
    3. Map response → strict Pydantic schema output
"""
import logging
import time

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from app.schemas.ocr import (
    FieldConfidence,
    OCRErrorDetail,
    OCRExtractedChild,
    OCRExtractedMeasurement,
    OCRSuccessResponse,
)
from app.services.gemini_ocr_service import extract_form_data_gemini

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/ocr", tags=["ocr"])

# Maximum upload size: 15 MB (field phones produce large JPEGs)
MAX_IMAGE_BYTES = 15 * 1024 * 1024

ALLOWED_CONTENT_TYPES = {
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
    "image/bmp",
    "image/tiff",
    "application/octet-stream",   # some Android cameras send this
}


@router.post(
    "/extract",
    response_model=OCRSuccessResponse,
    responses={
        400: {"model": OCRErrorDetail, "description": "Unreadable or invalid image"},
        503: {"model": OCRErrorDetail, "description": "OCR engine not available"},
    },
    summary="Extract structured data from an Anganwadi form photo",
    description=(
        "Upload a photo of a handwritten Anganwadi nutrition form. "
        "Returns child demographics and measurement data extracted via "
        "Groq (Llama 4 Scout Vision) with multilingual support (English, Hindi, Marathi), "
        "mapped to strict PostgreSQL-compatible types."
    ),
)
async def extract_form_data(
    image: UploadFile = File(
        ...,
        description="Photo of a handwritten Anganwadi form (PNG, JPEG, WebP)",
    ),
):
    t0 = time.perf_counter()

    # ──────────────────────────────────────────────────────────────
    # STAGE 1  — Payload validation
    # ──────────────────────────────────────────────────────────────
    if image.content_type and image.content_type not in ALLOWED_CONTENT_TYPES:
        return JSONResponse(
            status_code=400,
            content=OCRErrorDetail(
                error="unsupported_format",
                detail=f"Content-Type '{image.content_type}' is not supported. Use PNG, JPEG, or WebP.",
                stage="payload_validation",
            ).model_dump(),
        )

    try:
        raw_bytes = await image.read()
    except Exception as e:
        logger.error(f"Failed to read uploaded image: {e}")
        return JSONResponse(
            status_code=400,
            content=OCRErrorDetail(
                error="read_failure",
                detail=f"Could not read the uploaded file: {e}",
                stage="payload_validation",
            ).model_dump(),
        )

    if len(raw_bytes) < 200:
        return JSONResponse(
            status_code=400,
            content=OCRErrorDetail(
                error="file_too_small",
                detail="Uploaded image is too small (< 200 bytes) — likely empty or corrupt.",
                stage="payload_validation",
            ).model_dump(),
        )

    if len(raw_bytes) > MAX_IMAGE_BYTES:
        return JSONResponse(
            status_code=400,
            content=OCRErrorDetail(
                error="file_too_large",
                detail=f"Image exceeds {MAX_IMAGE_BYTES // (1024*1024)} MB limit.",
                stage="payload_validation",
            ).model_dump(),
        )

    logger.info(
        f"OCR request received — file='{image.filename}', "
        f"size={len(raw_bytes)/1024:.1f} KB, type={image.content_type}"
    )

    # ──────────────────────────────────────────────────────────────
    # STAGE 2  — Groq Vision Extraction
    # ──────────────────────────────────────────────────────────────
    try:
        structured = extract_form_data_gemini(raw_bytes)
    except ValueError as e:
        logger.warning(f"Image decode or parse error: {e}")
        return JSONResponse(
            status_code=400,
            content=OCRErrorDetail(
                error="extraction_failed",
                detail=str(e),
                stage="groq_extraction",
            ).model_dump(),
        )
    except TimeoutError as e:
        logger.error(f"Groq API timeout: {e}")
        return JSONResponse(
            status_code=503,
            content=OCRErrorDetail(
                error="api_timeout",
                detail=str(e),
                stage="groq_extraction",
            ).model_dump(),
        )
    except RuntimeError as e:
        logger.error(f"Groq service unavailable: {e}")
        return JSONResponse(
            status_code=503,
            content=OCRErrorDetail(
                error="engine_unavailable",
                detail=str(e),
                stage="groq_extraction",
            ).model_dump(),
        )
    except Exception as e:
        logger.error(f"Unexpected Groq error: {e}", exc_info=True)
        return JSONResponse(
            status_code=503,
            content=OCRErrorDetail(
                error="groq_error",
                detail=f"Groq OCR failed: {e}",
                stage="groq_extraction",
            ).model_dump(),
        )

    # ──────────────────────────────────────────────────────────────
    # STAGE 3  — Schema Enforcement
    # ──────────────────────────────────────────────────────────────
    warnings = list(structured.get("warnings", []))

    try:
        child = OCRExtractedChild(**structured["child_data"])
    except Exception as e:
        logger.warning(f"Child schema validation partial failure: {e}")
        warnings.append(f"Some child fields failed schema validation: {e}")
        child = OCRExtractedChild()

    try:
        measurement = OCRExtractedMeasurement(**structured["measurement_data"])
    except Exception as e:
        logger.warning(f"Measurement schema validation partial failure: {e}")
        warnings.append(f"Some measurement fields failed schema validation: {e}")
        measurement = OCRExtractedMeasurement()

    try:
        field_conf = FieldConfidence(**structured["field_confidence"])
    except Exception:
        field_conf = FieldConfidence()

    elapsed = time.perf_counter() - t0
    logger.info(
        f"Groq OCR pipeline completed in {elapsed:.2f}s — "
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


# ═══════════════════════════════════════════════════════════════════
#  BULK REGISTER SCAN — Multiple children per page
# ═══════════════════════════════════════════════════════════════════

import base64
import os
from groq import Groq
from app.schemas.ocr import BulkOCREntry, BulkOCRResponse

_BULK_SYSTEM_PROMPT = (
    "You are a specialized OCR engine for Indian Anganwadi health registers. "
    "The image contains a TABULAR REGISTER page with MULTIPLE children listed in rows. "
    "Each row represents one child. Common columns include: "
    "Name, Age (months), Sex, Weight (kg), Height (cm), MUAC (cm), Guardian Name, Village.\n\n"
    "INSTRUCTIONS:\n"
    "1. Identify ALL visible rows in the table.\n"
    "2. Extract data from EVERY row — do not skip any child.\n"
    "3. Return a STRICTLY FORMATTED JSON ARRAY of objects.\n"
    "4. Each object MUST use these exact keys:\n"
    '   {"name": "string", "age_months": integer, "sex": "M or F", '
    '"weight_kg": float, "height_cm": float, "muac_cm": float, '
    '"guardian_name": "string", "anganwadi_center": "string", "village": "string"}\n'
    '5. Map Hindi/Marathi: "लड़का" → "M", "लड़की"/"मुलगी" → "F"\n'
    "6. If a cell is empty or unreadable, use null for that field.\n"
    "7. Do NOT invent or guess names — only extract clearly visible text.\n"
    "8. Return ONLY the JSON array. No markdown, no explanation, no code fences.\n\n"
    "Example output:\n"
    '[{"name": "Priya Sharma", "age_months": 24, "sex": "F", "weight_kg": 10.5, '
    '"height_cm": 82.0, "muac_cm": 13.5, "guardian_name": "Meera Sharma", '
    '"anganwadi_center": null, "village": "Dhanori"}]'
)


@router.post(
    "/bulk-scan",
    response_model=BulkOCRResponse,
    responses={
        400: {"model": OCRErrorDetail},
        503: {"model": OCRErrorDetail},
    },
    summary="Extract multiple children from a tabular register photo",
)
async def bulk_scan_register(
    image: UploadFile = File(
        ..., description="Photo of a tabular Anganwadi register page",
    ),
):
    """
    Process a photo of a tabular register and extract ALL child rows.
    Returns an array of BulkOCREntry objects for user review and bulk saving.
    """
    t0 = time.perf_counter()

    # ── Validate upload ──────────────────────────────────
    if image.content_type and image.content_type not in ALLOWED_CONTENT_TYPES:
        return JSONResponse(status_code=400, content=OCRErrorDetail(
            error="unsupported_format",
            detail=f"Content-Type '{image.content_type}' not supported.",
            stage="payload_validation",
        ).model_dump())

    try:
        raw_bytes = await image.read()
    except Exception as e:
        return JSONResponse(status_code=400, content=OCRErrorDetail(
            error="read_failure", detail=str(e), stage="payload_validation",
        ).model_dump())

    if len(raw_bytes) < 200:
        return JSONResponse(status_code=400, content=OCRErrorDetail(
            error="file_too_small", detail="Image too small (< 200 bytes).",
            stage="payload_validation",
        ).model_dump())

    if len(raw_bytes) > MAX_IMAGE_BYTES:
        return JSONResponse(status_code=400, content=OCRErrorDetail(
            error="file_too_large",
            detail=f"Image exceeds {MAX_IMAGE_BYTES // (1024*1024)} MB limit.",
            stage="payload_validation",
        ).model_dump())

    logger.info(f"Bulk scan request — file='{image.filename}', size={len(raw_bytes)/1024:.1f} KB")

    # ── Groq Vision Call ─────────────────────────────────
    groq_key = os.getenv("GROQ_API_KEY", "")
    if not groq_key:
        return JSONResponse(status_code=503, content=OCRErrorDetail(
            error="no_api_key", detail="GROQ_API_KEY not configured.",
            stage="groq_extraction",
        ).model_dump())

    try:
        b64 = base64.b64encode(raw_bytes).decode("utf-8")
        mime = image.content_type or "image/jpeg"

        client = Groq(api_key=groq_key)
        response = client.chat.completions.create(
            model="meta-llama/llama-4-scout-17b-16e-instruct",
            messages=[
                {"role": "system", "content": _BULK_SYSTEM_PROMPT},
                {"role": "user", "content": [
                    {"type": "text", "text": (
                        "Extract ALL children from this tabular register page. "
                        "Return ONLY a JSON array — no explanation."
                    )},
                    {"type": "image_url", "image_url": {
                        "url": f"data:{mime};base64,{b64}",
                    }},
                ]},
            ],
            temperature=0.0,
            max_completion_tokens=4096,
        )

        raw_text = response.choices[0].message.content.strip()
        logger.debug(f"Groq bulk raw response: {raw_text[:500]}")

    except Exception as e:
        logger.error(f"Groq bulk scan failed: {e}")
        return JSONResponse(status_code=503, content=OCRErrorDetail(
            error="groq_error", detail=f"Groq API error: {e}",
            stage="groq_extraction",
        ).model_dump())

    # ── Parse JSON array ─────────────────────────────────
    import re
    # Strip markdown fences if present
    cleaned = re.sub(r"^```(?:json)?\s*", "", raw_text)
    cleaned = re.sub(r"\s*```$", "", cleaned).strip()

    warnings = []
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as e:
        # Try to find array in the text
        match = re.search(r'\[.*\]', cleaned, re.DOTALL)
        if match:
            try:
                parsed = json.loads(match.group())
            except json.JSONDecodeError:
                return JSONResponse(status_code=400, content=OCRErrorDetail(
                    error="parse_failure",
                    detail=f"Could not parse JSON array from Groq response: {e}",
                    stage="schema_validation",
                ).model_dump())
        else:
            return JSONResponse(status_code=400, content=OCRErrorDetail(
                error="parse_failure",
                detail=f"No JSON array found in response: {e}",
                stage="schema_validation",
            ).model_dump())

    if not isinstance(parsed, list):
        parsed = [parsed]  # Single object → wrap in array

    # ── Validate each entry with Pydantic ────────────────
    entries = []
    for i, raw_entry in enumerate(parsed):
        if not isinstance(raw_entry, dict):
            warnings.append(f"Row {i+1}: skipped non-dict entry")
            continue
        try:
            entry = BulkOCREntry(**raw_entry)
            # Skip completely empty entries
            if entry.name or entry.weight_kg or entry.height_cm:
                entries.append(entry)
            else:
                warnings.append(f"Row {i+1}: all fields empty, skipped")
        except Exception as e:
            warnings.append(f"Row {i+1}: validation error — {e}")

    elapsed = time.perf_counter() - t0
    logger.info(f"Bulk scan completed in {elapsed:.2f}s — {len(entries)} entries extracted")

    return BulkOCRResponse(
        success=True,
        entries=entries,
        entry_count=len(entries),
        warnings=warnings,
    )
