"""
Drishti Poshan — Groq Voice-to-Data Extraction Service
==============================================================================
Two-step cloud pipeline using Groq for voice-based child data entry.

Pipeline:
    Step A: Whisper Large v3 transcription (handles Hindi/English code-switching)
    Step B: Llama 3 70B structuring pass → Drishti Poshan JSON schema

This replaces the local OpenAI Whisper engine to eliminate FFmpeg/torch
dependency issues and adds intelligent data structuring.
"""
import io
import json
import logging
import tempfile
import time
from pathlib import Path
from typing import Any, Optional

from groq import Groq, APITimeoutError, RateLimitError, APIStatusError

from app.config import GROQ_API_KEY

logger = logging.getLogger(__name__)

# ── Model Configuration ──────────────────────────────────────────

_WHISPER_MODEL = "whisper-large-v3"
_LLAMA_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"

_STRUCTURING_SYSTEM_PROMPT = (
    "You are a data extraction assistant for the Indian ICDS (Anganwadi) child nutrition programme. "
    "You receive a transcript of an Anganwadi worker speaking about a child's health data. "
    "The worker may speak in Hindi, English, Marathi, or a mix of languages (code-switching). "
    "Extract ONLY the factual data mentioned and map it to the following strict JSON schema.\n\n"
    "Return ONLY a raw JSON object. No markdown, no explanation.\n"
    "Use these EXACT keys:\n"
    "{\n"
    '  "child_name": "string or null",\n'
    '  "age_months": integer or null,\n'
    '  "sex": "MALE or FEMALE or null",\n'
    '  "weight_kg": float or null,\n'
    '  "height_cm": float or null,\n'
    '  "muac_cm": float or null,\n'
    '  "guardian_name": "string or null",\n'
    '  "anganwadi_center": "string or null",\n'
    '  "village": "string or null"\n'
    "}\n\n"
    "Rules:\n"
    '- Map "लड़की", "Girl", "Female" → "FEMALE"\n'
    '- Map "लड़का", "Boy", "Male" → "MALE"\n'
    "- Convert age to months (e.g., '2 saal' = 24, '1.5 years' = 18)\n"
    "- If a field is not mentioned at all, return null\n"
    "- Do NOT guess or hallucinate data — only extract what is explicitly stated\n"
    "- Numbers may be spoken in Hindi (तीन = 3, साढ़े दस = 10.5, etc.)"
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
    logger.info("Groq client initialized for voice pipeline.")
    return _groq_client


# ── Gender Mapping ────────────────────────────────────────────────

def _map_gender_to_sex(gender: Optional[str]) -> Optional[str]:
    """Map model's gender output (MALE/FEMALE) to schema's sex field (M/F)."""
    if gender is None:
        return None
    g = str(gender).strip().upper()
    if g in ("MALE", "M", "BOY"):
        return "M"
    if g in ("FEMALE", "F", "GIRL"):
        return "F"
    return None


# ── MUAC-based Risk Classification ───────────────────────────────

def _calculate_risk_status(muac_cm: Optional[float]) -> Optional[str]:
    """Auto-calculate risk status from MUAC (WHO/ICDS)."""
    if muac_cm is None:
        return None
    if muac_cm < 11.5:
        return "SEVERE"
    elif muac_cm < 12.5:
        return "MODERATE"
    else:
        return "NORMAL"


# ══════════════════════════════════════════════════════════════════
#  STEP A — Whisper Transcription
# ══════════════════════════════════════════════════════════════════

def _transcribe_audio(client: Groq, audio_bytes: bytes, filename: str) -> dict:
    """
    Transcribe audio bytes using Groq Whisper Large v3.

    Language is pinned to English ('en') to prevent Whisper from
    hallucinating Arabic/other scripts on Indian-accented speech.
    Hindi words spoken by the worker will be transliterated into
    English script (e.g., "bacche ka naam Ravi hai, umar do saal").
    The Llama structuring pass handles this transliterated Hindi fine.

    Returns dict with 'text', 'language', 'duration'.
    """
    # Determine file extension for Groq API
    suffix = Path(filename).suffix.lower() or ".webm"

    # Write to temp file (Groq SDK requires a file-like object with a name)
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        t0 = time.perf_counter()

        with open(tmp_path, "rb") as audio_file:
            transcription = client.audio.transcriptions.create(
                model=_WHISPER_MODEL,
                file=audio_file,
                language="en",                    # pin to English — prevents Arabic hallucination
                response_format="verbose_json",   # gives segments + language
                temperature=0.0,                  # fully deterministic — no creative language switching
            )

        elapsed = time.perf_counter() - t0

        # Extract results
        text = transcription.text.strip() if transcription.text else ""
        language = getattr(transcription, "language", "auto")
        duration = getattr(transcription, "duration", None)

        logger.info(
            f"Whisper transcription complete in {elapsed:.2f}s — "
            f"lang={language}, duration={duration}s, "
            f"text='{text[:100]}...'"
        )

        return {
            "text": text,
            "language": language,
            "duration": duration,
            "transcription_time": round(elapsed, 2),
        }

    except APITimeoutError as e:
        raise TimeoutError(f"Whisper transcription timed out: {e}") from e
    except RateLimitError as e:
        raise RuntimeError(f"Groq rate limit: {e}") from e
    except APIStatusError as e:
        raise RuntimeError(f"Whisper API error (HTTP {e.status_code}): {e.message}") from e
    except Exception as e:
        raise RuntimeError(f"Whisper transcription failed: {e}") from e
    finally:
        if tmp_path:
            try:
                Path(tmp_path).unlink()
            except OSError:
                pass


# ══════════════════════════════════════════════════════════════════
#  STEP B — Llama Structuring Pass
# ══════════════════════════════════════════════════════════════════

def _structure_transcript(client: Groq, transcript: str) -> dict:
    """
    Send raw transcript to Llama to extract structured child data
    matching the Drishti Poshan PostgreSQL schema.

    Uses JSON mode for guaranteed valid output.
    """
    if not transcript.strip():
        raise ValueError("Empty transcript — no speech detected in audio.")

    try:
        t0 = time.perf_counter()
        response = client.chat.completions.create(
            model=_LLAMA_MODEL,
            messages=[
                {"role": "system", "content": _STRUCTURING_SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": (
                        f"Extract child health data from this Anganwadi worker's transcript:\n\n"
                        f'"{transcript}"\n\n'
                        f"Return ONLY the JSON object."
                    ),
                },
            ],
            response_format={"type": "json_object"},
            temperature=0.1,
            max_completion_tokens=512,
            timeout=20,
        )
        elapsed = time.perf_counter() - t0
        logger.info(f"Llama structuring pass complete in {elapsed:.2f}s")

    except APITimeoutError as e:
        raise TimeoutError(f"Llama structuring timed out: {e}") from e
    except Exception as e:
        raise RuntimeError(f"Llama structuring failed: {e}") from e

    raw_text = ""
    try:
        raw_text = response.choices[0].message.content.strip()
    except (IndexError, AttributeError) as e:
        raise ValueError(f"Llama returned empty structuring response: {e}") from e

    # Strip accidental backticks
    cleaned = raw_text
    if cleaned.startswith("```"):
        lines = cleaned.split("\n")
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        cleaned = "\n".join(lines).strip()

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as e:
        raise ValueError(
            f"Llama did not return valid JSON. "
            f"Parse error: {e}. Raw: {raw_text[:300]}"
        ) from e


# ══════════════════════════════════════════════════════════════════
#  PUBLIC API — Full Voice-to-Data Pipeline
# ══════════════════════════════════════════════════════════════════

def process_voice_to_data(
    audio_bytes: bytes,
    filename: str = "recording.webm",
) -> dict[str, Any]:
    """
    Full two-step voice pipeline:
        Step A: Groq Whisper transcription (code-switching aware)
        Step B: Llama structuring pass → Drishti Poshan schema

    Returns a dict matching the OCR router's response structure so both
    voice and OCR can use the same frontend UI:
        {
            "child_data":        { ... },
            "measurement_data":  { ... },
            "field_confidence":  { ... },
            "overall_confidence": float,
            "raw_text":          str,   # the transcript
            "risk_status":       str,
            "warnings":          [str, ...]
            "transcript_meta":   { language, duration, transcription_time }
        }
    """
    client = _get_groq_client()
    warnings: list[str] = []

    # ── Step A: Transcribe ────────────────────────────────────────
    transcript_result = _transcribe_audio(client, audio_bytes, filename)
    transcript_text = transcript_result["text"]

    if not transcript_text.strip():
        raise ValueError(
            "No speech detected in the audio. "
            "Please speak clearly and try again."
        )

    # ── Step B: Structure ─────────────────────────────────────────
    structured = _structure_transcript(client, transcript_text)

    # ── Type-safe field extraction ────────────────────────────────
    child_name = structured.get("child_name") or structured.get("name")
    age_months_raw = structured.get("age_months")
    sex_raw = structured.get("sex") or structured.get("gender")
    weight_kg_raw = structured.get("weight_kg")
    height_cm_raw = structured.get("height_cm")
    muac_cm_raw = structured.get("muac_cm")
    guardian_name = structured.get("guardian_name")
    anganwadi_center = structured.get("anganwadi_center")
    village = structured.get("village")

    sex = _map_gender_to_sex(sex_raw)

    def _safe_int(val) -> Optional[int]:
        if val is None:
            return None
        try:
            return int(float(val))
        except (ValueError, TypeError):
            warnings.append(f"Could not parse age_months: {val}")
            return None

    def _safe_float(val, name: str) -> Optional[float]:
        if val is None:
            return None
        try:
            return round(float(val), 2)
        except (ValueError, TypeError):
            warnings.append(f"Could not parse {name}: {val}")
            return None

    parsed_age = _safe_int(age_months_raw)
    parsed_weight = _safe_float(weight_kg_raw, "weight_kg")
    parsed_height = _safe_float(height_cm_raw, "height_cm")
    parsed_muac = _safe_float(muac_cm_raw, "muac_cm")

    risk_status = _calculate_risk_status(parsed_muac)
    if risk_status == "SEVERE":
        warnings.append(
            f"⚠️ SEVERE malnutrition detected (MUAC={parsed_muac} cm). "
            "Immediate intervention required."
        )
    elif risk_status == "MODERATE":
        warnings.append(
            f"⚠️ MODERATE malnutrition risk (MUAC={parsed_muac} cm). "
            "Schedule follow-up."
        )

    # ── Build output matching OCR response shape ──────────────────

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
        "notes": f"Voice input via Groq Whisper + Llama | Risk: {risk_status or 'N/A'}",
    }

    _CONF = 0.85  # slightly lower baseline for voice (more ambiguous than OCR)
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

    all_values = [
        child_name, parsed_age, sex, parsed_weight, parsed_height,
        parsed_muac, guardian_name, anganwadi_center, village,
    ]
    total_fields = len(all_values)
    extracted_count = sum(1 for v in all_values if v is not None)
    overall_confidence = round(extracted_count / total_fields, 3)

    if overall_confidence < 0.4:
        warnings.append(
            f"Low extraction ({overall_confidence:.0%}). "
            "Try speaking each field clearly: name, age, weight, height, MUAC."
        )

    return {
        "child_data": child_data,
        "measurement_data": measurement_data,
        "field_confidence": field_confidence,
        "overall_confidence": overall_confidence,
        "raw_text": transcript_text,
        "risk_status": risk_status,
        "warnings": warnings,
        "transcript_meta": {
            "language": transcript_result.get("language"),
            "duration": transcript_result.get("duration"),
            "transcription_time": transcript_result.get("transcription_time"),
        },
    }
