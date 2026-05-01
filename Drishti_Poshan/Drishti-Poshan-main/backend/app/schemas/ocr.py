"""
Drishti Poshan — OCR Pydantic Schemas
Strict schema enforcement for PaddleOCR-extracted Anganwadi form data.
Every field mirrors the PostgreSQL ORM + ChildCreate schema exactly.
"""
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, field_validator


# ─── Gender Enum ──────────────────────────────────────────────────
class Gender(str, Enum):
    MALE = "M"
    FEMALE = "F"


# ─── Per-Field Confidence ─────────────────────────────────────────
class FieldConfidence(BaseModel):
    """Confidence score for each individually extracted field."""
    name: Optional[float] = Field(None, ge=0.0, le=1.0)
    age_months: Optional[float] = Field(None, ge=0.0, le=1.0)
    sex: Optional[float] = Field(None, ge=0.0, le=1.0)
    weight_kg: Optional[float] = Field(None, ge=0.0, le=1.0)
    height_cm: Optional[float] = Field(None, ge=0.0, le=1.0)
    muac_cm: Optional[float] = Field(None, ge=0.0, le=1.0)
    guardian_name: Optional[float] = Field(None, ge=0.0, le=1.0)
    anganwadi_center: Optional[float] = Field(None, ge=0.0, le=1.0)
    village: Optional[float] = Field(None, ge=0.0, le=1.0)


# ─── Extracted Child Record ──────────────────────────────────────
class OCRExtractedChild(BaseModel):
    """
    Mirrors the ChildCreate schema exactly.
    All numeric types are validated to match PostgreSQL column types.
    """
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    age_months: Optional[int] = Field(None, ge=0, le=72, description="Age in months (0-72)")
    sex: Optional[Gender] = Field(None, description="M or F")
    weight_kg: Optional[float] = Field(None, ge=0.5, le=50.0)
    height_cm: Optional[float] = Field(None, ge=30.0, le=150.0)
    muac_cm: Optional[float] = Field(None, ge=5.0, le=30.0)
    guardian_name: Optional[str] = Field(None, max_length=200)
    anganwadi_center: Optional[str] = Field(None, max_length=300)
    village: Optional[str] = Field(None, max_length=300)

    @field_validator("name", "guardian_name", "anganwadi_center", "village", mode="before")
    @classmethod
    def strip_and_clean_strings(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        # Strip stray punctuation from edges, collapse whitespace
        import re as _re
        cleaned = _re.sub(r"^[^\w]+|[^\w]+$", "", str(v))
        cleaned = _re.sub(r"\s+", " ", cleaned).strip()
        return cleaned if cleaned else None

    @field_validator("weight_kg", "height_cm", "muac_cm", mode="before")
    @classmethod
    def coerce_to_float(cls, v):
        if v is None:
            return None
        try:
            return round(float(v), 2)
        except (ValueError, TypeError):
            return None

    @field_validator("age_months", mode="before")
    @classmethod
    def coerce_to_int(cls, v):
        if v is None:
            return None
        try:
            return int(float(v))
        except (ValueError, TypeError):
            return None


# ─── Extracted Measurement Record ────────────────────────────────
class OCRExtractedMeasurement(BaseModel):
    """Standalone measurement row extracted from a form."""
    weight_kg: Optional[float] = Field(None, ge=0.5, le=50.0)
    height_cm: Optional[float] = Field(None, ge=30.0, le=150.0)
    muac_cm: Optional[float] = Field(None, ge=5.0, le=30.0)
    notes: Optional[str] = None

    @field_validator("weight_kg", "height_cm", "muac_cm", mode="before")
    @classmethod
    def coerce_to_float(cls, v):
        if v is None:
            return None
        try:
            return round(float(v), 2)
        except (ValueError, TypeError):
            return None


# ─── API Response Envelope ───────────────────────────────────────
class OCRSuccessResponse(BaseModel):
    success: bool = True
    raw_text: str = Field(..., description="Full concatenated raw OCR text")
    extracted_child: OCRExtractedChild
    extracted_measurement: OCRExtractedMeasurement
    field_confidence: FieldConfidence
    overall_confidence: float = Field(..., ge=0.0, le=1.0)
    warnings: list[str] = Field(default_factory=list)


class OCRErrorDetail(BaseModel):
    success: bool = False
    error: str
    detail: str
    stage: str = Field(..., description="Pipeline stage where failure occurred")


# ─── Bulk Register Scan Schemas ──────────────────────────────────

class BulkOCREntry(BaseModel):
    """Single row extracted from a tabular Anganwadi register scan."""
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    age_months: Optional[int] = Field(None, ge=0, le=72)
    sex: Optional[str] = Field(None, pattern=r"^[MF]$")
    weight_kg: Optional[float] = Field(None, ge=0.5, le=50.0)
    height_cm: Optional[float] = Field(None, ge=30.0, le=150.0)
    muac_cm: Optional[float] = Field(None, ge=5.0, le=30.0)
    guardian_name: Optional[str] = Field(None, max_length=200)
    anganwadi_center: Optional[str] = Field(None, max_length=300)
    village: Optional[str] = Field(None, max_length=300)

    @field_validator("sex", mode="before")
    @classmethod
    def normalize_sex(cls, v):
        if v is None:
            return None
        s = str(v).strip().upper()
        if s in ("M", "MALE", "BOY", "लड़का"):
            return "M"
        if s in ("F", "FEMALE", "GIRL", "लड़की"):
            return "F"
        return None

    @field_validator("weight_kg", "height_cm", "muac_cm", mode="before")
    @classmethod
    def coerce_float(cls, v):
        if v is None:
            return None
        try:
            return round(float(v), 2)
        except (ValueError, TypeError):
            return None

    @field_validator("age_months", mode="before")
    @classmethod
    def coerce_int(cls, v):
        if v is None:
            return None
        try:
            return int(float(v))
        except (ValueError, TypeError):
            return None


class BulkOCRResponse(BaseModel):
    success: bool = True
    entries: list[BulkOCREntry] = Field(default_factory=list)
    entry_count: int = 0
    warnings: list[str] = Field(default_factory=list)
