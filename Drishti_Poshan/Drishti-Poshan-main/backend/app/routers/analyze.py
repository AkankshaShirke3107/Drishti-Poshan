"""
Drishti Poshan - Analysis Router (Z-Scores + SHAP XAI)
"""
import json

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.child import Child, Measurement, Observation, LabDiagnostic
from app.schemas.child import AnalysisResponse, ZScores, XAIReasoning
from app.services.GrowthEngine import GrowthEngine, get_malnutrition_status
from app.services.xai_service import generate_xai_recommendation
from app.utils.zscore import calculate_weight_for_height_zscore

router = APIRouter(prefix="/api/analyze", tags=["analysis"])

growth_engine = GrowthEngine()


def _z_score_impact_map(z_scores: dict, age_months: int, muac_cm=None) -> dict:
    """
    Build a deterministic SHAP-style impact map directly from Z-scores.
    Negative Z-scores → negative impact (risk factors, red bars).
    Positive Z-scores → positive impact (protective factors, green bars).
    This is used as a guaranteed fallback so the chart is never empty.
    """
    waz = z_scores.get("waz") or 0.0
    haz = z_scores.get("haz") or 0.0
    whz = z_scores.get("whz") or 0.0
    bmi_z = z_scores.get("bmi_z") or 0.0

    # Scale impacts so they feel proportional on the bar chart
    impact_map = {
        "waz":        round(waz * 0.30, 4),    # weight-for-age: strong predictor
        "haz":        round(haz * 0.25, 4),    # height-for-age: stunting marker
        "whz":        round(whz * 0.25, 4),    # weight-for-height: wasting marker
        "bmi_z":      round(bmi_z * 0.10, 4),  # BMI-Z: supplementary
        "age_months": round(min(age_months / 60.0, 1.0) * 0.05, 4),  # small positive
        "weight_kg":  round(waz * 0.04, 4),    # echoes waz direction
        "height_cm":  round(haz * 0.03, 4),    # echoes haz direction
    }
    if muac_cm is not None:
        # MUAC < 11.5 → severe, < 12.5 → moderate
        muac_norm = (muac_cm - 12.5) / 3.0   # negative when below 12.5
        impact_map["muac_cm"] = round(muac_norm * 0.30, 4)

    return impact_map


@router.post("/{child_id}", response_model=AnalysisResponse)
async def analyze_child(
    child_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Full analysis of a child's nutritional status.

    1. Fetches the latest observation to get the most current measurements.
    2. Computes WHO Z-Scores via GrowthEngine (uses persisted values if available).
    3. Runs SHAP explainer (falls back to deterministic Z-score impact map on failure).
    4. Returns a fully-populated AnalysisResponse with z_scores, impact_map,
       risk_level, and recommendations.
    """
    # ── Fetch child ────────────────────────────────────────
    child = await db.get(Child, child_id)
    if not child:
        raise HTTPException(status_code=404, detail="Child not found")

    # ── Pull latest observation for freshest measurements ─
    obs_result = await db.execute(
        select(Observation)
        .where(Observation.child_id == child_id)
        .order_by(Observation.timestamp.desc())
        .limit(1)
    )
    latest_obs = obs_result.scalars().first()

    # Resolve which values to use (observation > child denormalized cache)
    weight_kg  = (latest_obs.weight_kg  if latest_obs else None) or child.weight_kg
    height_cm  = (latest_obs.height_cm  if latest_obs else None) or child.height_cm
    muac_cm    = (latest_obs.muac_cm    if latest_obs else None) or child.muac_cm

    if not weight_kg and not height_cm:
        raise HTTPException(
            status_code=400,
            detail="No weight or height data available. Add an observation first.",
        )

    # ── Step 1: Compute / recover Z-Scores ────────────────
    # Prefer persisted Z-scores from the latest observation when available,
    # but always re-compute if they are absent to avoid None→dash display.
    if latest_obs and latest_obs.waz is not None:
        z_scores = {
            "waz":        latest_obs.waz,
            "haz":        latest_obs.haz,
            "whz":        latest_obs.whz,
            "bmi_z":      latest_obs.bmi_z,
            "risk_level": latest_obs.risk_level,
        }
    else:
        z_scores = growth_engine.compute_z_scores(
            age_months=child.age_months,
            sex=child.sex,
            weight_kg=weight_kg,
            height_cm=height_cm,
            muac_cm=muac_cm,
        )

    # ── Step 2: SHAP / XAI ────────────────────────────────
    xai_service = getattr(request.app.state, "xai_service", None)
    impact_map    = {}
    recommendations = []

    # Key fix: check model is initialized, not just that the object exists
    xai_ready = xai_service is not None and getattr(xai_service, "model", None) is not None

    if xai_ready:
        try:
            xai_result = xai_service.explain(
                age_months=child.age_months,
                weight_kg=weight_kg,
                height_cm=height_cm,
                muac_cm=muac_cm,
                waz=z_scores.get("waz"),
                haz=z_scores.get("haz"),
                whz=z_scores.get("whz"),
                bmi_z=z_scores.get("bmi_z"),
            )
            impact_map      = xai_result.get("impact_map", {})
            recommendations = xai_result.get("recommendations", [])
            risk_level      = xai_result.get("predicted_risk", z_scores.get("risk_level", "unknown"))

            # SHAP fallback: if all values are ~zero (None inputs produced zeros),
            # replace with deterministic Z-score impact map
            if impact_map and all(abs(v) < 0.001 for v in impact_map.values()):
                impact_map = _z_score_impact_map(z_scores, child.age_months, muac_cm)

        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"XAI explain failed: {e}")
            risk_level = z_scores.get("risk_level", "unknown")
            impact_map = _z_score_impact_map(z_scores, child.age_months, muac_cm)
            recommendations = []  # will be filled below
    else:
        risk_level = z_scores.get("risk_level", "unknown")
        impact_map = _z_score_impact_map(z_scores, child.age_months, muac_cm)

    # ── Deterministic recommendations when XAI is unavailable ─
    if not recommendations:
        waz_v = z_scores.get("waz")
        haz_v = z_scores.get("haz")
        whz_v = z_scores.get("whz")
        who_status = get_malnutrition_status(
            waz=waz_v, haz=haz_v, whz=whz_v,
            muac_cm=muac_cm, age_months=child.age_months,
        )
        if who_status == "SEVERE":
            recommendations = [
                "🚨 Immediate referral to nearest health facility recommended.",
                "Begin therapeutic feeding program (F-75/F-100).",
                "Increase caloric intake with nutrient-dense foods.",
                "Schedule bi-weekly weight monitoring.",
            ]
        elif who_status == "MODERATE":
            recommendations = [
                "Increase caloric intake with locally available nutrient-dense foods.",
                "Schedule bi-weekly weight monitoring.",
                "Provide supplementary feeding and micronutrient supplementation.",
            ]
        else:
            recommendations = ["✅ Child is within normal growth parameters. Continue regular monitoring."]

    # ── Step 3: Persist analysis as measurement ────────────
    clinical_status = get_malnutrition_status(
        waz=z_scores.get("waz"), haz=z_scores.get("haz"),
        whz=z_scores.get("whz"), muac_cm=muac_cm,
        age_months=child.age_months,
    )
    measurement = Measurement(
        child_id=child_id,
        weight_kg=weight_kg, height_cm=height_cm, muac_cm=muac_cm,
        waz=z_scores.get("waz"), haz=z_scores.get("haz"),
        whz=z_scores.get("whz"), bmi_z=z_scores.get("bmi_z"),
        risk_level=risk_level,
        status=clinical_status,
        impact_map_json=json.dumps(impact_map) if impact_map else None,
    )
    db.add(measurement)
    child.risk_level = risk_level
    child.status = clinical_status
    await db.flush()

    _waz   = z_scores.get("waz")
    _haz   = z_scores.get("haz")
    _whz   = z_scores.get("whz")
    _bmi_z = z_scores.get("bmi_z")

    # ── Step 3b: Verified WHO LMS Weight-for-Height Z-score ────
    # Override the fallback WHZ with the mathematically precise LMS method
    verified_whz = calculate_weight_for_height_zscore(
        weight_kg=weight_kg,
        height_cm=height_cm,
        gender=child.sex,
    )
    if verified_whz is not None:
        _whz = verified_whz
        z_scores["whz"] = verified_whz
        # Re-evaluate risk with the corrected WHZ
        clinical_status = get_malnutrition_status(
            waz=_waz, haz=_haz, whz=_whz,
            muac_cm=muac_cm, age_months=child.age_months,
        )
        child.status = clinical_status
        risk_level = z_scores.get("risk_level", risk_level)
        # Update impact map with corrected whz
        impact_map = _z_score_impact_map(z_scores, child.age_months, muac_cm)

    # ── Step 4: LLM-based XAI Clinical Reasoning ──────────
    # Fetch latest lab results for biochemistry interpretation
    latest_lab = None
    try:
        lab_result = await db.execute(
            select(LabDiagnostic)
            .where(LabDiagnostic.child_id == child_id)
            .order_by(LabDiagnostic.collected_at.desc())
            .limit(1)
        )
        latest_lab = lab_result.scalar_one_or_none()
    except Exception:
        pass  # Lab table may not exist yet

    xai_reasoning_data = None
    try:
        xai_result = await generate_xai_recommendation({
            "age_months": child.age_months,
            "sex": child.sex,
            "weight_kg": weight_kg,
            "height_cm": height_cm,
            "muac_cm": muac_cm,
            "waz": _waz,
            "haz": _haz,
            "whz": _whz,
            "bmi_z": _bmi_z,
            "risk_level": risk_level,
            "status": clinical_status,
            "has_edema": False,
            # Verified WHO LMS WHZ for prompt
            "verified_whz": verified_whz,
            # Clinical vitals for Complicated SAM triage
            "hemoglobin_g_dl": getattr(child, "hemoglobin_g_dl", None),
            "severe_palmar_pallor": getattr(child, "severe_palmar_pallor", False),
            "temperature_celsius": getattr(child, "temperature_celsius", None),
            "breaths_per_minute": getattr(child, "breaths_per_minute", None),
            # Lab biochemistry (from latest NRC lab result)
            "serum_albumin_g_dl": getattr(latest_lab, "serum_albumin_g_dl", None) if latest_lab else None,
            "prealbumin_mg_dl": getattr(latest_lab, "prealbumin_mg_dl", None) if latest_lab else None,
            "crp_mg_l": getattr(latest_lab, "crp_mg_l", None) if latest_lab else None,
        })
        xai_reasoning_data = XAIReasoning(
            reasoning=xai_result.get("reasoning", ""),
            recommendation=xai_result.get("recommendation", ""),
            confidence=xai_result.get("confidence", "MEDIUM"),
            source=xai_result.get("source", "none"),
        )
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"XAI reasoning generation failed: {e}")

    return AnalysisResponse(
        child_id=child_id,
        # Nested object (primary)
        z_scores=ZScores(waz=_waz, haz=_haz, whz=_whz, bmi_z=_bmi_z),
        # Flat fields at top level (frontend direct access)
        waz=_waz, haz=_haz, whz=_whz, bmi_z=_bmi_z,
        risk_level=risk_level,
        impact_map=impact_map,
        recommendations=recommendations,
        xai_reasoning=xai_reasoning_data,
        data_quality_warning=z_scores.get("data_quality_warning"),
    )


@router.get("/{child_id}/history")
async def analysis_history(
    child_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Get analysis/measurement history for trend visualization."""
    child = await db.get(Child, child_id)
    if not child:
        raise HTTPException(status_code=404, detail="Child not found")

    result = await db.execute(
        select(Measurement)
        .where(Measurement.child_id == child_id)
        .order_by(Measurement.date.asc())
    )
    measurements = result.scalars().all()

    return {
        "child_id": child_id,
        "child_name": child.name,
        "history": [
            {
                "id": m.id,
                "date": m.date.isoformat() if m.date else None,
                "weight_kg": m.weight_kg,
                "height_cm": m.height_cm,
                "muac_cm": m.muac_cm,
                "waz": m.waz,
                "haz": m.haz,
                "whz": m.whz,
                "bmi_z": m.bmi_z,
                "risk_level": m.risk_level,
                "status": m.status,
                "impact_map": json.loads(m.impact_map_json) if m.impact_map_json else {},
            }
            for m in measurements
        ],
    }