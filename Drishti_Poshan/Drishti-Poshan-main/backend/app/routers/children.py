"""
Drishti Poshan - Children CRUD Router (with soft delete + village filter)
"""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.child import Child, Measurement, Observation, LabDiagnostic
from app.schemas.child import (
    ChildCreate,
    ChildResponse,
    ChildUpdate,
    MeasurementCreate,
    MeasurementResponse,
    ObservationCreate,
    ObservationResponse,
    LabDiagnosticCreate,
    LabDiagnosticResponse,
)

router = APIRouter(prefix="/api/children", tags=["children"])


# ─── CRUD: Children ────────────────────────────────────────────

@router.get("/", response_model=list[ChildResponse])
async def list_children(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=1000),
    risk_level: Optional[str] = Query(None, pattern=r"^(normal|moderate|severe)$"),
    search: Optional[str] = None,
    village: Optional[str] = None,
    include_deleted: bool = Query(False),
    db: AsyncSession = Depends(get_db),
):
    """List all registered children with optional filters."""
    query = select(Child).offset(skip).limit(limit).order_by(Child.updated_at.desc())

    if not include_deleted:
        query = query.where(Child.is_deleted == False)
    if risk_level:
        query = query.where(Child.risk_level == risk_level)
    if search:
        query = query.where(Child.name.ilike(f"%{search}%"))
    if village:
        query = query.where(Child.village.ilike(f"%{village}%"))

    result = await db.execute(query)
    return result.scalars().all()


@router.get("/stats")
async def get_stats(db: AsyncSession = Depends(get_db)):
    """Dashboard statistics (excludes soft-deleted)."""
    base = select(func.count(Child.id)).where(Child.is_deleted == False)
    total = await db.scalar(base)
    severe = await db.scalar(base.where(Child.risk_level == "severe"))
    moderate = await db.scalar(base.where(Child.risk_level == "moderate"))
    normal = await db.scalar(base.where(Child.risk_level == "normal"))
    measurements_count = await db.scalar(select(func.count(Measurement.id)))
    observations_count = await db.scalar(select(func.count(Observation.id)))

    villages_result = await db.execute(
        select(Child.village).where(
            Child.is_deleted == False,
            Child.village.isnot(None),
            Child.village != "",
        ).distinct()
    )
    villages = [v[0] for v in villages_result.all()]

    return {
        "total_children": total or 0,
        "severe": severe or 0,
        "moderate": moderate or 0,
        "normal": normal or 0,
        "total_measurements": measurements_count or 0,
        "total_observations": observations_count or 0,
        "villages": villages,
    }


@router.get("/{child_id}", response_model=ChildResponse)
async def get_child(child_id: int, db: AsyncSession = Depends(get_db)):
    """Get a single child by ID."""
    child = await db.get(Child, child_id)
    if not child:
        raise HTTPException(status_code=404, detail="Child not found")
    return child


@router.post("/", response_model=ChildResponse, status_code=201)
async def create_child(data: ChildCreate, db: AsyncSession = Depends(get_db)):
    """Register a new child. Auto-computes WHO Z-Scores and clinical status."""
    from app.services.GrowthEngine import GrowthEngine, get_malnutrition_status

    child = Child(**data.model_dump())

    # Compute Z-scores immediately if anthropometric data is present
    if data.weight_kg or data.height_cm or data.muac_cm:
        growth = GrowthEngine()
        z_scores = growth.compute_z_scores(
            age_months=data.age_months,
            sex=data.sex,
            weight_kg=data.weight_kg,
            height_cm=data.height_cm,
            muac_cm=data.muac_cm,
        )
        child.risk_level = z_scores.get("risk_level", "normal")
        child.status = get_malnutrition_status(
            waz=z_scores.get("waz"),
            haz=z_scores.get("haz"),
            whz=z_scores.get("whz"),
            muac_cm=data.muac_cm,
            age_months=data.age_months,
        )

    db.add(child)
    await db.flush()
    await db.refresh(child)

    # Also create the first observation if initial anthro data was provided
    if data.weight_kg or data.height_cm or data.muac_cm:
        growth = GrowthEngine()
        z_scores = growth.compute_z_scores(
            age_months=child.age_months, sex=child.sex,
            weight_kg=data.weight_kg, height_cm=data.height_cm,
            muac_cm=data.muac_cm,
        )
        obs = Observation(
            child_id=child.id,
            weight_kg=data.weight_kg, height_cm=data.height_cm, muac_cm=data.muac_cm,
            waz=z_scores.get("waz"), haz=z_scores.get("haz"),
            whz=z_scores.get("whz"), bmi_z=z_scores.get("bmi_z"),
            risk_level=z_scores.get("risk_level", "normal"),
            status=child.status,
            notes="Initial registration observation",
        )
        db.add(obs)
        await db.flush()

    return child


@router.put("/{child_id}", response_model=ChildResponse)
async def update_child(
    child_id: int, data: ChildUpdate, db: AsyncSession = Depends(get_db)
):
    """Update an existing child's data. Re-calculates Z-scores and status."""
    from app.services.GrowthEngine import GrowthEngine, get_malnutrition_status

    child = await db.get(Child, child_id)
    if not child:
        raise HTTPException(status_code=404, detail="Child not found")

    update_data = data.model_dump(exclude_unset=True)
    update_data.pop("id", None)
    update_data.pop("created_at", None)
    for key, value in update_data.items():
        setattr(child, key, value)

    anthro_fields = {"weight_kg", "height_cm", "muac_cm", "age_months", "sex"}
    if anthro_fields & set(update_data.keys()):
        growth = GrowthEngine()
        z_scores = growth.compute_z_scores(
            age_months=child.age_months, sex=child.sex,
            weight_kg=child.weight_kg, height_cm=child.height_cm,
            muac_cm=child.muac_cm,
        )
        child.risk_level = z_scores.get("risk_level", "normal")
        child.status = get_malnutrition_status(
            waz=z_scores.get("waz"), haz=z_scores.get("haz"),
            whz=z_scores.get("whz"), muac_cm=child.muac_cm,
            age_months=child.age_months,
        )

    await db.flush()
    await db.refresh(child)
    return child


@router.delete("/{child_id}", status_code=204)
async def delete_child(child_id: int, db: AsyncSession = Depends(get_db)):
    """Soft-delete a child record."""
    child = await db.get(Child, child_id)
    if not child:
        raise HTTPException(status_code=404, detail="Child not found")
    child.is_deleted = True
    child.deleted_at = datetime.utcnow()


@router.post("/{child_id}/restore", response_model=ChildResponse)
async def restore_child(child_id: int, db: AsyncSession = Depends(get_db)):
    """Restore a soft-deleted child record."""
    child = await db.get(Child, child_id)
    if not child:
        raise HTTPException(status_code=404, detail="Child not found")
    if not child.is_deleted:
        raise HTTPException(status_code=400, detail="Child is not deleted")
    child.is_deleted = False
    child.deleted_at = None
    await db.flush()
    await db.refresh(child)
    return child


# ─── Observations (Longitudinal) ──────────────────────────────

@router.post("/{child_id}/observations", response_model=ObservationResponse, status_code=201)
async def add_observation(
    child_id: int,
    data: ObservationCreate,
    db: AsyncSession = Depends(get_db),
):
    """
    Record a new longitudinal observation for a child.
    Auto-computes Z-Scores and WHO clinical status for this observation,
    then updates the child's denormalized latest values.
    """
    child = await db.get(Child, child_id)
    if not child:
        raise HTTPException(status_code=404, detail="Child not found")

    from app.services.GrowthEngine import GrowthEngine, get_malnutrition_status

    growth = GrowthEngine()
    z_scores = growth.compute_z_scores(
        age_months=child.age_months, sex=child.sex,
        weight_kg=data.weight_kg, height_cm=data.height_cm,
        muac_cm=data.muac_cm,
    )
    clinical_status = get_malnutrition_status(
        waz=z_scores.get("waz"), haz=z_scores.get("haz"),
        whz=z_scores.get("whz"), muac_cm=data.muac_cm,
        age_months=child.age_months,
    )

    obs = Observation(
        child_id=child_id,
        weight_kg=data.weight_kg, height_cm=data.height_cm, muac_cm=data.muac_cm,
        waz=z_scores.get("waz"), haz=z_scores.get("haz"),
        whz=z_scores.get("whz"), bmi_z=z_scores.get("bmi_z"),
        risk_level=z_scores.get("risk_level", "unknown"),
        status=clinical_status, notes=data.notes,
    )
    db.add(obs)
    await db.flush()
    await db.refresh(obs)

    # Update child's denormalized "latest" values
    if data.weight_kg:
        child.weight_kg = data.weight_kg
    if data.height_cm:
        child.height_cm = data.height_cm
    if data.muac_cm:
        child.muac_cm = data.muac_cm
    child.risk_level = z_scores.get("risk_level", child.risk_level)
    child.status = clinical_status

    return obs


@router.get("/{child_id}/history", response_model=list[ObservationResponse])
async def get_history(child_id: int, db: AsyncSession = Depends(get_db)):
    """Return all observations for a child, sorted newest-first."""
    child = await db.get(Child, child_id)
    if not child:
        raise HTTPException(status_code=404, detail="Child not found")

    result = await db.execute(
        select(Observation)
        .where(Observation.child_id == child_id)
        .order_by(Observation.timestamp.desc())
    )
    return result.scalars().all()


# ─── Measurements (Legacy) ─────────────────────────────────────

@router.get("/{child_id}/measurements", response_model=list[MeasurementResponse])
async def list_measurements(child_id: int, db: AsyncSession = Depends(get_db)):
    """List all measurements for a child."""
    child = await db.get(Child, child_id)
    if not child:
        raise HTTPException(status_code=404, detail="Child not found")

    result = await db.execute(
        select(Measurement)
        .where(Measurement.child_id == child_id)
        .order_by(Measurement.date.desc())
    )
    return result.scalars().all()


@router.post("/{child_id}/measurements", response_model=MeasurementResponse, status_code=201)
async def add_measurement(
    child_id: int, data: MeasurementCreate, db: AsyncSession = Depends(get_db),
):
    """Add a new measurement (legacy). Auto-computes Z-Scores and clinical status."""
    child = await db.get(Child, child_id)
    if not child:
        raise HTTPException(status_code=404, detail="Child not found")

    from app.services.GrowthEngine import GrowthEngine, get_malnutrition_status

    growth = GrowthEngine()
    z_scores = growth.compute_z_scores(
        age_months=child.age_months, sex=child.sex,
        weight_kg=data.weight_kg, height_cm=data.height_cm,
        muac_cm=data.muac_cm,
    )
    clinical_status = get_malnutrition_status(
        waz=z_scores.get("waz"), haz=z_scores.get("haz"),
        whz=z_scores.get("whz"), muac_cm=data.muac_cm,
        age_months=child.age_months,
    )

    measurement = Measurement(
        child_id=child_id,
        weight_kg=data.weight_kg, height_cm=data.height_cm, muac_cm=data.muac_cm,
        waz=z_scores.get("waz"), haz=z_scores.get("haz"),
        whz=z_scores.get("whz"), bmi_z=z_scores.get("bmi_z"),
        risk_level=z_scores.get("risk_level", "unknown"),
        status=clinical_status, notes=data.notes,
    )
    db.add(measurement)
    await db.flush()
    await db.refresh(measurement)

    if data.weight_kg:
        child.weight_kg = data.weight_kg
    if data.height_cm:
        child.height_cm = data.height_cm
    if data.muac_cm:
        child.muac_cm = data.muac_cm
    child.risk_level = z_scores.get("risk_level", child.risk_level)
    child.status = clinical_status

    return measurement


# ─── Lab Diagnostics (NRC Biochemistry) ────────────────────────

@router.get("/{child_id}/labs", response_model=list[LabDiagnosticResponse])
async def get_lab_diagnostics(
    child_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Get all lab diagnostic results for a child, newest first."""
    child = (await db.execute(select(Child).where(Child.id == child_id))).scalar_one_or_none()
    if not child:
        raise HTTPException(status_code=404, detail="Child not found")

    result = await db.execute(
        select(LabDiagnostic)
        .where(LabDiagnostic.child_id == child_id)
        .order_by(LabDiagnostic.collected_at.desc())
    )
    return result.scalars().all()


@router.post("/{child_id}/labs", response_model=LabDiagnosticResponse, status_code=201)
async def add_lab_diagnostic(
    child_id: int,
    data: LabDiagnosticCreate,
    db: AsyncSession = Depends(get_db),
):
    """Record a new lab result for a child (NRC / facility only)."""
    child = (await db.execute(select(Child).where(Child.id == child_id))).scalar_one_or_none()
    if not child:
        raise HTTPException(status_code=404, detail="Child not found")

    lab = LabDiagnostic(
        child_id=child_id,
        serum_albumin_g_dl=data.serum_albumin_g_dl,
        prealbumin_mg_dl=data.prealbumin_mg_dl,
        crp_mg_l=data.crp_mg_l,
        notes=data.notes,
    )
    db.add(lab)
    await db.flush()
    await db.refresh(lab)
    return lab


# ─── Bulk Add (Register Scan → Save All) ───────────────────────

@router.post("/bulk-add", response_model=list[ChildResponse], status_code=201)
async def bulk_add_children(
    children: list[ChildCreate],
    db: AsyncSession = Depends(get_db),
):
    """
    Bulk-insert multiple children in a single database transaction.
    Used after OCR register scanning to save all reviewed entries at once.
    """
    if not children:
        raise HTTPException(status_code=400, detail="Empty list — nothing to add.")
    if len(children) > 50:
        raise HTTPException(status_code=400, detail="Maximum 50 children per bulk request.")

    created = []
    for data in children:
        child = Child(
            name=data.name,
            age_months=data.age_months,
            sex=data.sex,
            weight_kg=data.weight_kg,
            height_cm=data.height_cm,
            muac_cm=data.muac_cm,
            hemoglobin_g_dl=data.hemoglobin_g_dl if hasattr(data, 'hemoglobin_g_dl') else None,
            severe_palmar_pallor=data.severe_palmar_pallor if hasattr(data, 'severe_palmar_pallor') else False,
            temperature_celsius=data.temperature_celsius if hasattr(data, 'temperature_celsius') else None,
            breaths_per_minute=data.breaths_per_minute if hasattr(data, 'breaths_per_minute') else None,
            guardian_name=data.guardian_name,
            anganwadi_center=data.anganwadi_center,
            village=data.village,
            risk_level="normal",
            status="NORMAL",
        )
        db.add(child)
        created.append(child)

    await db.flush()
    for c in created:
        await db.refresh(c)

    return created