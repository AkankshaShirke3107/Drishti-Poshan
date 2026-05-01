"""
Drishti Poshan - Pydantic Schemas (Request/Response)
"""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, validator


# ─── Child Schemas ──────────────────────────────────────────────

class ChildCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    age_months: int = Field(..., ge=0, le=72, description="Age in months (0-72)")
    sex: str = Field(..., pattern=r"^[MF]$", description="M or F")
    weight_kg: Optional[float] = Field(None, ge=0.5, le=50)
    height_cm: Optional[float] = Field(None, ge=30, le=150)
    muac_cm: Optional[float] = Field(None, ge=5, le=30)
    hemoglobin_g_dl: Optional[float] = Field(None, ge=1, le=25, description="Hemoglobin g/dL")
    severe_palmar_pallor: bool = Field(False, description="Severe palmar pallor observed")
    temperature_celsius: Optional[float] = Field(None, ge=30, le=43, description="Body temp °C")
    breaths_per_minute: Optional[int] = Field(None, ge=5, le=120, description="Respiratory rate")
    guardian_name: Optional[str] = None
    anganwadi_center: Optional[str] = None
    village: Optional[str] = None


class ChildUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    age_months: Optional[int] = Field(None, ge=0, le=72)
    sex: Optional[str] = Field(None, pattern=r"^[MF]$")
    weight_kg: Optional[float] = Field(None, ge=0.5, le=50)
    height_cm: Optional[float] = Field(None, ge=30, le=150)
    muac_cm: Optional[float] = Field(None, ge=5, le=30)
    hemoglobin_g_dl: Optional[float] = Field(None, ge=1, le=25)
    severe_palmar_pallor: Optional[bool] = None
    temperature_celsius: Optional[float] = Field(None, ge=30, le=43)
    breaths_per_minute: Optional[int] = Field(None, ge=5, le=120)
    guardian_name: Optional[str] = None
    anganwadi_center: Optional[str] = None
    village: Optional[str] = None


class ChildResponse(BaseModel):
    id: int
    name: str
    age_months: int
    sex: str
    weight_kg: Optional[float] = None
    height_cm: Optional[float] = None
    muac_cm: Optional[float] = None
    hemoglobin_g_dl: Optional[float] = None
    severe_palmar_pallor: bool = False
    temperature_celsius: Optional[float] = None
    breaths_per_minute: Optional[int] = None
    guardian_name: Optional[str] = None
    anganwadi_center: Optional[str] = None
    village: Optional[str] = None
    risk_level: str = "normal"
    status: str = "NORMAL"
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ─── Lab Diagnostic Schemas (NRC Biochemistry) ─────────────────

class LabDiagnosticCreate(BaseModel):
    """Payload for recording lab results at NRC / facility."""
    serum_albumin_g_dl: Optional[float] = Field(None, ge=0.5, le=10, description="Normal: 3.4-5.4")
    prealbumin_mg_dl: Optional[float] = Field(None, ge=0.5, le=60, description="Normal: 15-36")
    crp_mg_l: Optional[float] = Field(None, ge=0, le=500, description="Normal: <5.0")
    notes: Optional[str] = None


class LabDiagnosticResponse(BaseModel):
    id: int
    child_id: int
    collected_at: datetime
    serum_albumin_g_dl: Optional[float] = None
    prealbumin_mg_dl: Optional[float] = None
    crp_mg_l: Optional[float] = None
    notes: Optional[str] = None

    class Config:
        from_attributes = True


# ─── Observation Schemas (Longitudinal) ─────────────────────────

class ObservationCreate(BaseModel):
    """Payload for recording a new observation."""
    weight_kg: Optional[float] = Field(None, ge=0.5, le=50)
    height_cm: Optional[float] = Field(None, ge=30, le=150)
    muac_cm: Optional[float] = Field(None, ge=5, le=30)
    notes: Optional[str] = None


class ObservationResponse(BaseModel):
    id: int
    child_id: int
    timestamp: datetime
    weight_kg: Optional[float] = None
    height_cm: Optional[float] = None
    muac_cm: Optional[float] = None
    waz: Optional[float] = None
    haz: Optional[float] = None
    whz: Optional[float] = None
    bmi_z: Optional[float] = None
    risk_level: str = "normal"
    status: str = "NORMAL"
    notes: Optional[str] = None

    class Config:
        from_attributes = True


# ─── Measurement Schemas (Legacy) ───────────────────────────────

class MeasurementCreate(BaseModel):
    child_id: int
    weight_kg: Optional[float] = Field(None, ge=0.5, le=50)
    height_cm: Optional[float] = Field(None, ge=30, le=150)
    muac_cm: Optional[float] = Field(None, ge=5, le=30)
    notes: Optional[str] = None


class MeasurementResponse(BaseModel):
    id: int
    child_id: int
    date: datetime
    weight_kg: Optional[float] = None
    height_cm: Optional[float] = None
    muac_cm: Optional[float] = None
    waz: Optional[float] = None
    haz: Optional[float] = None
    whz: Optional[float] = None
    bmi_z: Optional[float] = None
    risk_level: str = "normal"
    status: str = "NORMAL"
    impact_map_json: Optional[str] = None
    notes: Optional[str] = None

    class Config:
        from_attributes = True


# ─── Analysis Schemas ───────────────────────────────────────────

class ZScores(BaseModel):
    waz: Optional[float] = Field(None, description="Weight-for-Age Z-Score")
    haz: Optional[float] = Field(None, description="Height-for-Age Z-Score")
    whz: Optional[float] = Field(None, description="Weight-for-Height Z-Score")
    bmi_z: Optional[float] = Field(None, description="BMI-for-Age Z-Score")

    @validator("waz", "haz", "whz", "bmi_z", pre=True, always=True)
    def nan_to_none(cls, v):
        """Convert NaN/Inf to None so JSON serializes as null, not NaN."""
        if v is None:
            return None
        try:
            import math
            f = float(v)
            if math.isnan(f) or math.isinf(f):
                return None
            return round(f, 2)
        except (TypeError, ValueError):
            return None


class XAIReasoning(BaseModel):
    """LLM-generated clinical reasoning and actionable recommendation."""
    reasoning: str = Field("", description="Why the risk status was assigned")
    recommendation: str = Field("", description="Actionable clinical next step")
    confidence: str = Field("MEDIUM", description="HIGH|MEDIUM|LOW")
    source: str = Field("none", description="groq-llama3 | deterministic-who | none")


class AnalysisResponse(BaseModel):
    child_id: int
    # Nested z_scores object (primary structure)
    z_scores: ZScores
    # Flat z-score fields at top-level for direct frontend access
    waz: Optional[float] = None
    haz: Optional[float] = None
    whz: Optional[float] = None
    bmi_z: Optional[float] = None
    risk_level: str = Field(..., description="normal | moderate | severe")
    impact_map: dict = Field(default_factory=dict, description="SHAP feature impacts")
    recommendations: list[str] = Field(default_factory=list)
    xai_reasoning: Optional[XAIReasoning] = Field(None, description="LLM clinical reasoning")
    data_quality_warning: Optional[str] = None

    @validator("waz", "haz", "whz", "bmi_z", pre=True, always=True)
    def nan_to_none(cls, v):
        """Convert NaN/Inf to None at the top level too."""
        if v is None:
            return None
        try:
            import math
            f = float(v)
            if math.isnan(f) or math.isinf(f):
                return None
            return round(f, 2)
        except (TypeError, ValueError):
            return None