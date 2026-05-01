"""
Drishti Poshan — Bulk CSV Upload & Analysis Router
====================================================
POST /api/bulk/upload-csv   →  CSV file → validate → Z-scores → bulk insert → summary stats
POST /api/bulk/analyze-batch →  Summary stats → Groq LLM → district-level strategy
"""
import io
import logging
import os
from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from app.database import get_db
from app.models.child import Child
from app.utils.zscore import calculate_weight_for_height_zscore, get_whz_classification
from app.services.GrowthEngine import get_malnutrition_status

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/bulk", tags=["bulk-upload"])


# ─── Response Schemas ──────────────────────────────────────────

class CSVRowPreview(BaseModel):
    row_num: int
    name: Optional[str] = None
    age_months: Optional[int] = None
    sex: Optional[str] = None
    weight_kg: Optional[float] = None
    height_cm: Optional[float] = None
    muac_cm: Optional[float] = None
    village: Optional[str] = None
    whz: Optional[float] = None
    classification: Optional[str] = None


class CSVUploadResponse(BaseModel):
    success: bool = True
    total_rows: int = 0
    valid_rows: int = 0
    inserted: int = 0
    skipped: int = 0
    summary: dict = Field(default_factory=dict)
    preview: list[CSVRowPreview] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class BatchAnalysisRequest(BaseModel):
    total_children: int
    sam_count: int
    mam_count: int
    normal_count: int
    avg_muac: Optional[float] = None
    avg_whz: Optional[float] = None
    sam_percent: Optional[float] = None
    mam_percent: Optional[float] = None
    district: Optional[str] = "Unknown District"


class BatchAnalysisResponse(BaseModel):
    success: bool = True
    strategy: str = ""
    source: str = "none"


# ─── Column name normalization ─────────────────────────────────

_COLUMN_MAP = {
    # name variants
    "child_name": "name", "child name": "name", "name": "name",
    "बच्चे का नाम": "name", "नाव": "name", "naam": "name",
    # age variants
    "age_months": "age_months", "age": "age_months", "age months": "age_months",
    "age_in_months": "age_months", "उम्र": "age_months",
    # sex/gender variants
    "gender": "sex", "sex": "sex", "लिंग": "sex",
    # weight variants
    "weight_kg": "weight_kg", "weight": "weight_kg", "weight kg": "weight_kg",
    "weight(kg)": "weight_kg", "वजन": "weight_kg",
    # height variants
    "height_cm": "height_cm", "height": "height_cm", "height cm": "height_cm",
    "height(cm)": "height_cm", "ऊंचाई": "height_cm",
    # muac variants
    "muac_cm": "muac_cm", "muac": "muac_cm", "muac cm": "muac_cm",
    "muac(cm)": "muac_cm",
    # village variants
    "village": "village", "गाँव": "village", "गाव": "village",
    # guardian
    "guardian_name": "guardian_name", "guardian": "guardian_name",
    "guardian name": "guardian_name", "mother_name": "guardian_name",
    # center
    "anganwadi_center": "anganwadi_center", "center": "anganwadi_center",
    "anganwadi": "anganwadi_center", "kendra": "anganwadi_center",
}


def _normalize_sex(val) -> Optional[str]:
    """Convert various gender representations to M/F."""
    if val is None:
        return None
    s = str(val).strip().upper()
    if s in ("M", "MALE", "BOY", "लड़का", "1"):
        return "M"
    if s in ("F", "FEMALE", "GIRL", "लड़की", "मुलगी", "2"):
        return "F"
    return None


def _safe_float(val) -> Optional[float]:
    if val is None:
        return None
    try:
        import math
        f = float(val)
        if math.isnan(f) or math.isinf(f):
            return None
        return round(f, 2)
    except (ValueError, TypeError):
        return None


def _safe_int(val) -> Optional[int]:
    if val is None:
        return None
    try:
        return int(float(val))
    except (ValueError, TypeError):
        return None


# ═══════════════════════════════════════════════════════════════
#  POST /upload-csv — CSV Processing + Z-Scores + Bulk Insert
# ═══════════════════════════════════════════════════════════════

@router.post("/upload-csv", response_model=CSVUploadResponse)
async def upload_csv(
    file: UploadFile = File(..., description="CSV file with child records"),
    db: AsyncSession = Depends(get_db),
):
    """
    Process a CSV of child records:
    1. Validate headers
    2. Calculate WHO LMS Z-scores per row
    3. Bulk-insert valid records
    4. Return aggregate summary stats
    """
    # ── Validate file type ────────────────────────────────
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="File must be a .csv file.")

    try:
        raw_bytes = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read file: {e}")

    if len(raw_bytes) < 10:
        raise HTTPException(status_code=400, detail="CSV file is empty or too small.")

    if len(raw_bytes) > 10 * 1024 * 1024:  # 10 MB limit
        raise HTTPException(status_code=400, detail="CSV file exceeds 10 MB limit.")

    # ── Parse CSV with Pandas ─────────────────────────────
    try:
        import pandas as pd
    except ImportError:
        raise HTTPException(
            status_code=503,
            detail="Pandas is not installed. Run: pip install pandas",
        )

    try:
        # Try multiple encodings
        for encoding in ["utf-8", "latin-1", "cp1252"]:
            try:
                df = pd.read_csv(io.BytesIO(raw_bytes), encoding=encoding)
                break
            except UnicodeDecodeError:
                continue
        else:
            raise ValueError("Could not decode CSV with any supported encoding.")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse CSV: {e}")

    if df.empty:
        raise HTTPException(status_code=400, detail="CSV file contains no data rows.")

    # ── Normalize column names ────────────────────────────
    df.columns = [str(c).strip().lower() for c in df.columns]
    rename_map = {}
    for orig_col in df.columns:
        normalized = _COLUMN_MAP.get(orig_col)
        if normalized:
            rename_map[orig_col] = normalized
    df.rename(columns=rename_map, inplace=True)

    # Check required columns
    required = {"name", "age_months"}
    missing = required - set(df.columns)
    if missing:
        available = ", ".join(sorted(df.columns.tolist()))
        raise HTTPException(
            status_code=400,
            detail=f"Missing required columns: {', '.join(missing)}. "
                   f"Available columns: {available}. "
                   f"Accepted headers: child_name, age_months, weight_kg, height_cm, muac_cm, gender, village",
        )

    warnings = []
    preview_rows = []
    children_to_insert = []
    classifications = {"SEVERE": 0, "MODERATE": 0, "NORMAL": 0}
    whz_values = []
    muac_values = []

    total_rows = len(df)

    for i, row in df.iterrows():
        row_num = i + 2  # Excel row (1-indexed + header)

        name = str(row.get("name", "")).strip() if pd.notna(row.get("name")) else None
        age = _safe_int(row.get("age_months"))
        sex = _normalize_sex(row.get("sex") or row.get("gender"))
        weight = _safe_float(row.get("weight_kg"))
        height = _safe_float(row.get("height_cm"))
        muac = _safe_float(row.get("muac_cm"))
        village = str(row.get("village", "")).strip() if pd.notna(row.get("village")) else None
        guardian = str(row.get("guardian_name", "")).strip() if pd.notna(row.get("guardian_name")) else None
        center = str(row.get("anganwadi_center", "")).strip() if pd.notna(row.get("anganwadi_center")) else None

        # Skip rows without name or age
        if not name or age is None:
            warnings.append(f"Row {row_num}: skipped — missing name or age_months")
            continue

        # Default sex to M if not provided
        if not sex:
            sex = "M"
            warnings.append(f"Row {row_num}: gender missing, defaulting to M")

        # ── Calculate WHO LMS Z-score ─────────────────────
        whz = calculate_weight_for_height_zscore(weight, height, sex)
        classification = get_whz_classification(whz)

        # Also compute full WHO status using MUAC
        status = get_malnutrition_status(whz=whz, muac_cm=muac)
        risk_level = status.lower() if status else "normal"

        classifications[status if status in classifications else "NORMAL"] += 1

        if whz is not None:
            whz_values.append(whz)
        if muac is not None:
            muac_values.append(muac)

        # ── Preview (first 5 rows) ───────────────────────
        if len(preview_rows) < 5:
            preview_rows.append(CSVRowPreview(
                row_num=row_num,
                name=name,
                age_months=age,
                sex=sex,
                weight_kg=weight,
                height_cm=height,
                muac_cm=muac,
                village=village,
                whz=whz,
                classification=classification,
            ))

        # ── Prepare for bulk insert ──────────────────────
        children_to_insert.append(Child(
            name=name,
            age_months=age,
            sex=sex,
            weight_kg=weight,
            height_cm=height,
            muac_cm=muac,
            guardian_name=guardian,
            anganwadi_center=center,
            village=village,
            risk_level=risk_level,
            status=status or "NORMAL",
        ))

    # ── Bulk insert ──────────────────────────────────────
    inserted_count = 0
    if children_to_insert:
        try:
            db.add_all(children_to_insert)
            await db.flush()
            inserted_count = len(children_to_insert)
        except Exception as e:
            logger.error(f"Bulk insert failed: {e}")
            warnings.append(f"Database insert error: {e}")

    # ── Aggregate stats ──────────────────────────────────
    valid_count = len(children_to_insert)
    sam_count = classifications.get("SEVERE", 0)
    mam_count = classifications.get("MODERATE", 0)
    normal_count = classifications.get("NORMAL", 0)

    summary = {
        "total_children": valid_count,
        "sam_count": sam_count,
        "mam_count": mam_count,
        "normal_count": normal_count,
        "sam_percent": round(sam_count / valid_count * 100, 1) if valid_count > 0 else 0,
        "mam_percent": round(mam_count / valid_count * 100, 1) if valid_count > 0 else 0,
        "normal_percent": round(normal_count / valid_count * 100, 1) if valid_count > 0 else 0,
        "avg_muac": round(sum(muac_values) / len(muac_values), 2) if muac_values else None,
        "avg_whz": round(sum(whz_values) / len(whz_values), 2) if whz_values else None,
        "min_whz": round(min(whz_values), 2) if whz_values else None,
        "max_whz": round(max(whz_values), 2) if whz_values else None,
    }

    logger.info(
        f"CSV upload complete: {total_rows} rows, {valid_count} valid, "
        f"{inserted_count} inserted, SAM={sam_count}, MAM={mam_count}"
    )

    return CSVUploadResponse(
        success=True,
        total_rows=total_rows,
        valid_rows=valid_count,
        inserted=inserted_count,
        skipped=total_rows - valid_count,
        summary=summary,
        preview=preview_rows,
        warnings=warnings[:20],  # Cap at 20 warnings
    )


# ═══════════════════════════════════════════════════════════════
#  POST /analyze-batch — Groq LLM District-Level Strategy
# ═══════════════════════════════════════════════════════════════

@router.post("/analyze-batch", response_model=BatchAnalysisResponse)
async def analyze_batch(data: BatchAnalysisRequest):
    """
    Send batch summary statistics to Groq LLM for a district-level
    public health intervention strategy.
    """
    groq_key = os.getenv("GROQ_API_KEY", "")
    if not groq_key:
        # Deterministic fallback
        return BatchAnalysisResponse(
            success=True,
            strategy=_deterministic_batch_strategy(data),
            source="deterministic-fallback",
        )

    prompt = (
        f"You are a public health nutrition expert advising an Indian district government.\n\n"
        f"BATCH DATA from {data.district}:\n"
        f"- Total children screened: {data.total_children}\n"
        f"- Severe Acute Malnutrition (SAM): {data.sam_count} ({data.sam_percent or 0:.1f}%)\n"
        f"- Moderate Acute Malnutrition (MAM): {data.mam_count} ({data.mam_percent or 0:.1f}%)\n"
        f"- Normal: {data.normal_count}\n"
        f"- Average MUAC: {data.avg_muac or 'N/A'} cm\n"
        f"- Average Weight-for-Height Z-score: {data.avg_whz or 'N/A'}\n\n"
        f"Based on this batch of {data.total_children} children, where "
        f"{data.sam_percent or 0:.1f}% are SAM and {data.mam_percent or 0:.1f}% are MAM, "
        f"provide a district-level public health intervention strategy.\n\n"
        f"Cover: immediate clinical actions, community feeding programs, "
        f"ASHA/Anganwadi worker training, supply chain for RUTF/therapeutic foods, "
        f"and monitoring KPIs. Be specific to the Indian ICDS system.\n\n"
        f"Respond in 3-5 actionable paragraphs. No JSON, no bullet formatting — "
        f"write as a briefing for a District Magistrate."
    )

    try:
        from groq import Groq
        client = Groq(api_key=groq_key)
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": (
                    "You are a senior public health nutritionist specializing in "
                    "India's ICDS (Integrated Child Development Services) system. "
                    "You provide evidence-based, actionable district-level strategies."
                )},
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
            max_completion_tokens=1024,
        )
        strategy = response.choices[0].message.content.strip()
        return BatchAnalysisResponse(success=True, strategy=strategy, source="groq-llama3")
    except Exception as e:
        logger.error(f"Groq batch analysis failed: {e}")
        return BatchAnalysisResponse(
            success=True,
            strategy=_deterministic_batch_strategy(data),
            source="deterministic-fallback",
        )


def _deterministic_batch_strategy(data: BatchAnalysisRequest) -> str:
    """Generate a rule-based strategy when LLM is unavailable."""
    lines = []

    sam_pct = data.sam_percent or 0
    mam_pct = data.mam_percent or 0

    if sam_pct > 15:
        lines.append(
            f"🚨 CRITICAL: {sam_pct:.1f}% SAM prevalence exceeds the WHO emergency threshold (15%). "
            f"This requires immediate declaration of a nutritional emergency. "
            f"Activate NRC (Nutritional Rehabilitation Center) surge capacity. "
            f"Deploy mobile health teams for active case finding in all AWCs."
        )
    elif sam_pct > 5:
        lines.append(
            f"⚠ HIGH ALERT: {sam_pct:.1f}% SAM prevalence is concerning. "
            f"Strengthen CMAM (Community-based Management of Acute Malnutrition). "
            f"Ensure RUTF supply chain to all Anganwadi centers in the district."
        )
    else:
        lines.append(
            f"SAM prevalence at {sam_pct:.1f}% is within manageable range. "
            f"Continue standard growth monitoring and supplementary feeding protocols."
        )

    if mam_pct > 20:
        lines.append(
            f"MAM at {mam_pct:.1f}% indicates widespread moderate undernutrition. "
            f"Scale up Supplementary Nutrition Programme (SNP) with fortified blended foods. "
            f"Prioritize ASHA/Anganwadi worker nutrition counseling training."
        )

    lines.append(
        f"Total screened: {data.total_children} children. "
        f"Avg MUAC: {data.avg_muac or 'N/A'} cm | Avg WHZ: {data.avg_whz or 'N/A'}. "
        f"Recommend bi-weekly growth monitoring for all identified SAM/MAM cases, "
        f"and monthly community-level screening drives."
    )

    return "\n\n".join(lines)
