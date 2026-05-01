"""
Drishti Poshan — Groq OCR Extraction Service
==============================================================================
Cloud-based OCR pipeline using Groq (Llama 4 Scout Vision) for handwritten
Anganwadi form extraction.

Pipeline:
    1. Accept raw image bytes
    2. Base64-encode for Groq vision API
    3. Send to Llama 4 Scout with structured extraction prompt (JSON mode)
    4. Parse JSON response → strict Pydantic-compatible dict
    5. Auto-calculate risk_status from MUAC values
"""
import base64
import io
import json
import logging
import time
from typing import Any, Optional

from groq import Groq, APITimeoutError, RateLimitError, APIStatusError
from PIL import Image

from app.config import GROQ_API_KEY

logger = logging.getLogger(__name__)

# ── Groq Configuration ───────────────────────────────────────────

_GROQ_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"

_SYSTEM_INSTRUCTION = (
    "You are a specialized OCR engine for Indian Anganwadi health forms. "
    "Analyze the handwritten form image. The form contains English, Hindi, and Marathi text. "
    "Extract the following specific fields:\n"
    "  - Child Name (the full name of the child)\n"
    "  - Age in months (integer)\n"
    '  - Sex (Map "लड़की" or "Female" to FEMALE, and "लड़का" or "Male" to MALE)\n'
    "  - Weight in kg (float)\n"
    "  - Height in cm (float)\n"
    "  - MUAC in cm (Mid-Upper Arm Circumference, float)\n"
    "  - Guardian Name (mother, father, or guardian's name)\n"
    "  - Anganwadi Center (the center/kendra name)\n"
    "  - Village (village/gaon/gram name)\n\n"
    "Return ONLY a raw JSON object. Do not include markdown formatting or explanations.\n"
    "Use these EXACT keys:\n"
    "{\n"
    '  "child_name": "string",\n'
    '  "age_months": integer,\n'
    '  "sex": "MALE or FEMALE",\n'
    '  "weight_kg": float,\n'
    '  "height_cm": float,\n'
    '  "muac_cm": float,\n'
    '  "guardian_name": "string",\n'
    '  "anganwadi_center": "string",\n'
    '  "village": "string"\n'
    "}\n\n"
    "If a field is missing or unreadable in the photo, return null for that key. "
    "Do not guess names — only extract what is clearly visible."
)

_USER_PROMPT = (
    "Extract all visible fields from this Anganwadi nutrition/health form image. "
    "Return ONLY a valid JSON object with the exact keys specified. "
    "No explanation, no markdown code fences, no extra text."
)

# ── Lazy-initialized Groq client singleton ────────────────────────

_groq_client: Optional[Groq] = None


def _get_groq_client() -> Groq:
    """Initialize and cache the Groq client."""
    global _groq_client
    if _groq_client is not None:
        return _groq_client

    if not GROQ_API_KEY:
        raise RuntimeError(
            "GROQ_API_KEY is not set. "
            "Add it to your .env file or environment variables. "
            "Get a key from https://console.groq.com/keys"
        )

    _groq_client = Groq(api_key=GROQ_API_KEY)
    logger.info(f"Groq client initialized (model: {_GROQ_MODEL}).")
    return _groq_client


# ── Gender Mapping ────────────────────────────────────────────────

def _map_gender_to_sex(gender: Optional[str]) -> Optional[str]:
    """Map model's gender output (MALE/FEMALE) to schema's sex field (M/F)."""
    if gender is None:
        return None
    g = str(gender).strip().upper()
    if g in ("MALE", "M", "लड़का", "मुलगा", "पुरुष"):
        return "M"
    if g in ("FEMALE", "F", "लड़की", "मुलगी", "महिला", "स्त्री"):
        return "F"
    return None


# ── MUAC-based Risk Classification ───────────────────────────────

def _calculate_risk_status(muac_cm: Optional[float]) -> Optional[str]:
    """
    Auto-calculate risk status from MUAC value per WHO/ICDS guidelines.
        - muac_cm < 11.5       → SEVERE
        - 11.5 <= muac_cm < 12.5 → MODERATE
        - muac_cm >= 12.5      → NORMAL
    """
    if muac_cm is None:
        return None
    if muac_cm < 11.5:
        return "SEVERE"
    elif muac_cm < 12.5:
        return "MODERATE"
    else:
        return "NORMAL"


# ── Image → Base64 Data URL ──────────────────────────────────────

def _encode_image_to_base64(image_bytes: bytes) -> tuple[str, str]:
    """
    Validate image bytes via PIL, convert to JPEG if needed,
    and return (base64_string, mime_type).
    """
    try:
        pil_image = Image.open(io.BytesIO(image_bytes))
        # Normalise to RGB JPEG for consistent API behaviour
        if pil_image.mode not in ("RGB",):
            pil_image = pil_image.convert("RGB")

        buf = io.BytesIO()
        pil_image.save(buf, format="JPEG", quality=90)
        jpeg_bytes = buf.getvalue()
    except Exception as e:
        raise ValueError(f"Could not decode image bytes: {e}") from e

    b64 = base64.b64encode(jpeg_bytes).decode("utf-8")
    return b64, "image/jpeg"


# ── Main Extraction Function ─────────────────────────────────────

def extract_form_data_gemini(image_bytes: bytes) -> dict[str, Any]:
    """
    Send image bytes to Groq (Llama 4 Scout Vision) for OCR extraction.

    NOTE: Function name kept as 'extract_form_data_gemini' intentionally
    so the ocr.py router import doesn't need changes.

    Returns a dict matching the OCR router's expected structure:
        {
            "child_data":        { ... },
            "measurement_data":  { ... },
            "field_confidence":  { ... },
            "overall_confidence": float,
            "raw_text":          str,
            "warnings":          [str, ...]
        }

    Raises:
        RuntimeError  — if the API key is missing or the API call fails
        ValueError    — if the model returns unparseable / non-JSON output
        TimeoutError  — if the API call times out
    """
    client = _get_groq_client()
    warnings: list[str] = []

    # ── Encode image to base64 ────────────────────────────────────
    b64_image, mime_type = _encode_image_to_base64(image_bytes)
    data_url = f"data:{mime_type};base64,{b64_image}"

    # ── Call Groq API with JSON mode ──────────────────────────────
    try:
        t0 = time.perf_counter()
        response = client.chat.completions.create(
            model=_GROQ_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": _SYSTEM_INSTRUCTION,
                },
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": _USER_PROMPT},
                        {
                            "type": "image_url",
                            "image_url": {"url": data_url},
                        },
                    ],
                },
            ],
            response_format={"type": "json_object"},
            temperature=0.1,       # near-deterministic for structured extraction
            max_completion_tokens=1024,
            timeout=30,
        )
        elapsed = time.perf_counter() - t0
        logger.info(f"Groq API responded in {elapsed:.2f}s")

    except APITimeoutError as e:
        raise TimeoutError(f"Groq API timed out: {e}") from e
    except RateLimitError as e:
        raise RuntimeError(
            f"Groq rate limit exceeded. Please wait and retry. Details: {e}"
        ) from e
    except APIStatusError as e:
        raise RuntimeError(f"Groq API error (HTTP {e.status_code}): {e.message}") from e
    except Exception as e:
        raise RuntimeError(f"Groq API call failed: {e}") from e

    # ── Extract raw text from response ────────────────────────────
    raw_text = ""
    try:
        choice = response.choices[0]
        raw_text = choice.message.content.strip()
    except (IndexError, AttributeError) as e:
        raise ValueError(f"Groq returned an empty response: {e}") from e

    if not raw_text:
        raise ValueError("Groq returned an empty response — no text extracted.")

    logger.info(f"Groq raw response ({len(raw_text)} chars): {raw_text[:300]}...")

    # ── Parse JSON (JSON mode should guarantee valid JSON, but be safe) ──
    cleaned_text = raw_text
    if cleaned_text.startswith("```"):
        lines = cleaned_text.split("\n")
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        cleaned_text = "\n".join(lines).strip()

    try:
        groq_data: dict = json.loads(cleaned_text)
    except json.JSONDecodeError as e:
        raise ValueError(
            f"Groq did not return valid JSON. "
            f"Parse error: {e}. Raw output: {raw_text[:500]}"
        ) from e

    # ── Map model fields → Pydantic schema fields ─────────────────
    # The model uses the exact keys from our prompt
    child_name = groq_data.get("child_name") or groq_data.get("name")
    age_months_raw = groq_data.get("age_months")
    sex_raw = groq_data.get("sex") or groq_data.get("gender")
    weight_kg_raw = groq_data.get("weight_kg")
    height_cm_raw = groq_data.get("height_cm")
    muac_cm_raw = groq_data.get("muac_cm")
    guardian_name = groq_data.get("guardian_name")
    anganwadi_center = groq_data.get("anganwadi_center")
    village = groq_data.get("village")

    # Map gender → sex (M/F) for PostgreSQL schema
    sex = _map_gender_to_sex(sex_raw)

    # ── Type coercion with safety ─────────────────────────────────
    def _safe_int(val) -> Optional[int]:
        if val is None:
            return None
        try:
            return int(float(val))
        except (ValueError, TypeError):
            warnings.append(f"Could not parse age_months value: {val}")
            return None

    def _safe_float(val, field_name: str) -> Optional[float]:
        if val is None:
            return None
        try:
            return round(float(val), 2)
        except (ValueError, TypeError):
            warnings.append(f"Could not parse {field_name} value: {val}")
            return None

    parsed_age = _safe_int(age_months_raw)
    parsed_weight = _safe_float(weight_kg_raw, "weight_kg")
    parsed_height = _safe_float(height_cm_raw, "height_cm")
    parsed_muac = _safe_float(muac_cm_raw, "muac_cm")

    # ── Auto-calculate risk_status from MUAC ──────────────────────
    risk_status = _calculate_risk_status(parsed_muac)
    if risk_status:
        logger.info(f"MUAC={parsed_muac} cm → risk_status={risk_status}")
    if risk_status == "SEVERE":
        warnings.append(
            f"⚠️ SEVERE malnutrition detected (MUAC={parsed_muac} cm < 11.5 cm). "
            "Immediate intervention required."
        )
    elif risk_status == "MODERATE":
        warnings.append(
            f"⚠️ MODERATE malnutrition risk (MUAC={parsed_muac} cm). "
            "Schedule follow-up within 2 weeks."
        )

    # ── Build output dicts matching router expectations ────────────

    child_data = {
        "name": child_name,
        "age_months": parsed_age,
        "sex": sex,
        "weight_kg": parsed_weight,
        "height_cm": parsed_height,
        "muac_cm": parsed_muac,
        "guardian_name": guardian_name,
        "anganwadi_center": anganwadi_center,
        "village": village,
    }

    measurement_data = {
        "weight_kg": parsed_weight,
        "height_cm": parsed_height,
        "muac_cm": parsed_muac,
        "notes": f"Extracted via Groq {_GROQ_MODEL} | Risk: {risk_status or 'N/A'}",
    }

    # ── Per-field confidence ──────────────────────────────────────
    _CONF = 0.90  # baseline for Llama vision
    field_confidence = {
        "name": _CONF if child_name else None,
        "age_months": _CONF if parsed_age is not None else None,
        "sex": _CONF if sex else None,
        "weight_kg": _CONF if parsed_weight is not None else None,
        "height_cm": _CONF if parsed_height is not None else None,
        "muac_cm": _CONF if parsed_muac is not None else None,
        "guardian_name": _CONF if guardian_name else None,
        "anganwadi_center": _CONF if anganwadi_center else None,
        "village": _CONF if village else None,
    }

    # Overall confidence: ratio of successfully extracted fields (9 total)
    all_values = [
        child_name, parsed_age, sex, parsed_weight, parsed_height,
        parsed_muac, guardian_name, anganwadi_center, village,
    ]
    total_fields = len(all_values)
    extracted_count = sum(1 for v in all_values if v is not None)
    overall_confidence = round(extracted_count / total_fields, 3)

    if overall_confidence < 0.5:
        warnings.append(
            f"Low extraction confidence ({overall_confidence:.0%}). "
            "Consider retaking the photo with better lighting and focus."
        )

    return {
        "child_data": child_data,
        "measurement_data": measurement_data,
        "field_confidence": field_confidence,
        "overall_confidence": overall_confidence,
        "raw_text": raw_text,
        "risk_status": risk_status,
        "warnings": warnings,
    }
