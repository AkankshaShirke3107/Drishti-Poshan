"""
Drishti Poshan — Analytics Router
Provides aggregated data for the Analytics dashboard:
  • KPI summary (total, SAM, MAM, normal)
  • Risk distribution (grouped counts)
  • Village hotspots (top severe-case villages)
  • Monthly trends (screenings over last 6 months)
  • Growth scatter data (weight vs height, capped at 500)
"""
import logging
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, case, select, and_, extract
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.child import Child, Observation

logger = logging.getLogger("drishti.analytics")

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/summary")
async def analytics_summary(db: AsyncSession = Depends(get_db)):
    """
    Single aggregated analytics payload for the dashboard.
    All heavy lifting is done via SQLAlchemy (pushed to DB engine).
    """

    # ── 1. KPI Counts ──────────────────────────────────────────
    kpi_query = select(
        func.count(Child.id).label("total"),
        func.count(case((Child.status == "SEVERE", 1))).label("sam"),
        func.count(case((Child.status == "MODERATE", 1))).label("mam"),
        func.count(case((Child.status == "NORMAL", 1))).label("normal"),
    ).where(Child.is_deleted == False)  # noqa: E712

    kpi_result = await db.execute(kpi_query)
    kpi = kpi_result.one()

    # ── 2. Risk Distribution (for pie/donut chart) ─────────────
    risk_query = (
        select(
            Child.status,
            func.count(Child.id).label("count"),
        )
        .where(Child.is_deleted == False)  # noqa: E712
        .group_by(Child.status)
    )
    risk_result = await db.execute(risk_query)
    risk_distribution = [
        {"status": row.status or "NORMAL", "count": row.count}
        for row in risk_result.all()
    ]

    # ── 3. Village Hotspots (top 5 by SEVERE count) ────────────
    hotspot_query = (
        select(
            Child.village,
            func.count(Child.id).label("severe_count"),
        )
        .where(
            and_(
                Child.is_deleted == False,  # noqa: E712
                Child.status == "SEVERE",
                Child.village.isnot(None),
                Child.village != "",
            )
        )
        .group_by(Child.village)
        .order_by(func.count(Child.id).desc())
        .limit(5)
    )
    hotspot_result = await db.execute(hotspot_query)
    hotspots = [
        {"village": row.village, "severe_count": row.severe_count}
        for row in hotspot_result.all()
    ]

    # ── 4. Monthly Screening Trends (last 6 months) ───────────
    six_months_ago = datetime.utcnow() - timedelta(days=180)

    # Try observations first (preferred), fall back to children.created_at
    trend_query = (
        select(
            extract("year", Observation.timestamp).label("year"),
            extract("month", Observation.timestamp).label("month"),
            func.count(Observation.id).label("screenings"),
        )
        .where(Observation.timestamp >= six_months_ago)
        .group_by(
            extract("year", Observation.timestamp),
            extract("month", Observation.timestamp),
        )
        .order_by(
            extract("year", Observation.timestamp),
            extract("month", Observation.timestamp),
        )
    )
    trend_result = await db.execute(trend_query)
    trend_rows = trend_result.all()

    # If no observations exist yet, use children registrations as trends
    if not trend_rows:
        trend_query_fallback = (
            select(
                extract("year", Child.created_at).label("year"),
                extract("month", Child.created_at).label("month"),
                func.count(Child.id).label("screenings"),
            )
            .where(
                and_(
                    Child.is_deleted == False,  # noqa: E712
                    Child.created_at >= six_months_ago,
                )
            )
            .group_by(
                extract("year", Child.created_at),
                extract("month", Child.created_at),
            )
            .order_by(
                extract("year", Child.created_at),
                extract("month", Child.created_at),
            )
        )
        trend_result = await db.execute(trend_query_fallback)
        trend_rows = trend_result.all()

    month_names = [
        "", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ]
    trends = [
        {
            "month": f"{month_names[int(row.month)]} {int(row.year)}",
            "screenings": row.screenings,
        }
        for row in trend_rows
    ]

    # ── 5. Growth Scatter Data (weight vs height, max 500) ────
    scatter_query = (
        select(Child.weight_kg, Child.height_cm, Child.status)
        .where(
            and_(
                Child.is_deleted == False,  # noqa: E712
                Child.weight_kg.isnot(None),
                Child.height_cm.isnot(None),
            )
        )
        .limit(500)
    )
    scatter_result = await db.execute(scatter_query)
    growth_data = [
        {
            "weight_kg": round(float(row.weight_kg), 1),
            "height_cm": round(float(row.height_cm), 1),
            "status": row.status or "NORMAL",
        }
        for row in scatter_result.all()
    ]

    return {
        "kpis": {
            "total": kpi.total,
            "sam": kpi.sam,
            "mam": kpi.mam,
            "normal": kpi.normal,
        },
        "risk_distribution": risk_distribution,
        "hotspots": hotspots,
        "trends": trends,
        "growth_data": growth_data,
    }
