"""
Drishti Poshan - Child, Measurement & Observation ORM Models

Design:
  • Child   — Static identity (name, sex, age, village, guardian, center).
              weight_kg / height_cm / muac_cm are kept as denormalized "latest"
              cache for dashboard performance (updated on each new observation).
  • Observation — A timestamped longitudinal measurement entry.
                  Every observation triggers classification (Z-scores + MUAC).
  • Measurement — Legacy model, kept for backward compatibility with the
                  analyze router.  New intake should use Observation.
"""
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.database import Base


class Child(Base):
    """Registered child at an Anganwadi center."""
    __tablename__ = "children"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(200), nullable=False, index=True)
    age_months = Column(Integer, nullable=False)
    sex = Column(String(1), nullable=False, comment="M or F")

    # Denormalized "latest observation" cache — updated on each new observation
    weight_kg = Column(Float, nullable=True)
    height_cm = Column(Float, nullable=True)
    muac_cm = Column(Float, nullable=True, comment="Mid-Upper Arm Circumference")

    # Clinical vitals for WHO triage (Complicated SAM detection)
    hemoglobin_g_dl = Column(Float, nullable=True, comment="Hemoglobin level in g/dL")
    severe_palmar_pallor = Column(Boolean, default=False, comment="Severe palmar pallor observed")
    temperature_celsius = Column(Float, nullable=True, comment="Body temperature in Celsius")
    breaths_per_minute = Column(Integer, nullable=True, comment="Respiratory rate")

    guardian_name = Column(String(200), nullable=True)
    anganwadi_center = Column(String(300), nullable=True)
    village = Column(String(300), nullable=True, comment="Village or locality name")
    risk_level = Column(String(20), default="normal", comment="normal|moderate|severe")
    status = Column(String(20), default="NORMAL", comment="WHO clinical classification: SEVERE|MODERATE|NORMAL")
    is_deleted = Column(Boolean, default=False, comment="Soft delete flag")
    deleted_at = Column(DateTime, nullable=True, comment="Soft delete timestamp")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    measurements = relationship("Measurement", back_populates="child", cascade="all, delete-orphan")
    observations = relationship("Observation", back_populates="child", cascade="all, delete-orphan",
                                order_by="Observation.timestamp.desc()")
    lab_diagnostics = relationship("LabDiagnostic", back_populates="child", cascade="all, delete-orphan",
                                   order_by="LabDiagnostic.collected_at.desc()")

    def __repr__(self):
        return f"<Child(id={self.id}, name='{self.name}', age={self.age_months}m)>"


class LabDiagnostic(Base):
    """
    Lab biochemistry results — recorded at NRC / health facility level.
    Tracks Serum Albumin, Prealbumin, and CRP for clinical SAM triage.
    """
    __tablename__ = "lab_diagnostics"

    id = Column(Integer, primary_key=True, autoincrement=True)
    child_id = Column(Integer, ForeignKey("children.id"), nullable=False)
    collected_at = Column(DateTime, default=datetime.utcnow, index=True,
                          comment="When the blood sample was collected")

    # Protein status
    serum_albumin_g_dl = Column(Float, nullable=True,
                                comment="Serum Albumin (g/dL). Normal: 3.4-5.4")
    prealbumin_mg_dl = Column(Float, nullable=True,
                              comment="Prealbumin/Transthyretin (mg/dL). Normal: 15-36")

    # Inflammation marker
    crp_mg_l = Column(Float, nullable=True,
                      comment="C-Reactive Protein (mg/L). Normal: <5.0")

    notes = Column(Text, nullable=True, comment="Lab technician notes")

    child = relationship("Child", back_populates="lab_diagnostics")

    def __repr__(self):
        return f"<LabDiagnostic(id={self.id}, child_id={self.child_id}, date={self.collected_at})>"


class Observation(Base):
    """
    A single longitudinal observation / measurement entry.
    Each observation is independently classified via GrowthEngine.
    """
    __tablename__ = "observations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    child_id = Column(Integer, ForeignKey("children.id"), nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)

    # Anthropometric data
    weight_kg = Column(Float, nullable=True)
    height_cm = Column(Float, nullable=True)
    muac_cm = Column(Float, nullable=True)

    # Computed Z-scores
    waz = Column(Float, nullable=True, comment="Weight-for-Age Z-Score")
    haz = Column(Float, nullable=True, comment="Height-for-Age Z-Score")
    whz = Column(Float, nullable=True, comment="Weight-for-Height Z-Score")
    bmi_z = Column(Float, nullable=True, comment="BMI-for-Age Z-Score")

    # Classification
    risk_level = Column(String(20), default="normal")
    status = Column(String(20), default="NORMAL", comment="WHO clinical: SEVERE|MODERATE|NORMAL")

    notes = Column(Text, nullable=True)

    child = relationship("Child", back_populates="observations")

    def __repr__(self):
        return f"<Observation(id={self.id}, child_id={self.child_id}, ts={self.timestamp})>"


class Measurement(Base):
    """Individual growth measurement record (legacy — prefer Observation)."""
    __tablename__ = "measurements"

    id = Column(Integer, primary_key=True, autoincrement=True)
    child_id = Column(Integer, ForeignKey("children.id"), nullable=False)
    date = Column(DateTime, default=datetime.utcnow)
    weight_kg = Column(Float, nullable=True)
    height_cm = Column(Float, nullable=True)
    muac_cm = Column(Float, nullable=True)
    waz = Column(Float, nullable=True, comment="Weight-for-Age Z-Score")
    haz = Column(Float, nullable=True, comment="Height-for-Age Z-Score")
    whz = Column(Float, nullable=True, comment="Weight-for-Height Z-Score")
    bmi_z = Column(Float, nullable=True, comment="BMI-for-Age Z-Score")
    risk_level = Column(String(20), default="normal")
    status = Column(String(20), default="NORMAL", comment="WHO clinical classification: SEVERE|MODERATE|NORMAL")
    impact_map_json = Column(Text, nullable=True, comment="SHAP impact map JSON")
    notes = Column(Text, nullable=True)

    child = relationship("Child", back_populates="measurements")

    def __repr__(self):
        return f"<Measurement(id={self.id}, child_id={self.child_id}, date={self.date})>"