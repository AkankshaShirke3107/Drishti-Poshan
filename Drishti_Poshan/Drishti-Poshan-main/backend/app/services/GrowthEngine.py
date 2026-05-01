"""
Drishti Poshan - GrowthEngine (Z-Score Calculator)
===================================================
NaN-Safe, WHO 2006 compliant Z-Score computation with strict type
casting, null/zero guards, and validated lookup tables.

Phase 1: NaN Exterminator — Every path guarantees a float or None,
never NaN or Infinity.
"""
import logging
import math
from typing import Optional

logger = logging.getLogger(__name__)

# Try to import pygrowup; if unavailable, use built-in LMS approximation
_USE_PYGROWUP = False
try:
    from pygrowup import Calculator
    _USE_PYGROWUP = True
except ImportError:
    logger.warning("pygrowup not available — using built-in WHO Z-Score approximation.")


# ═════════════════════════════════════════════════════════════════
#  NaN-Safe Utilities
# ═════════════════════════════════════════════════════════════════

def _safe_float(value) -> Optional[float]:
    """Convert any value to a rounded float, returning None for NaN/Inf/garbage."""
    if value is None:
        return None
    try:
        f = float(value)
        if math.isnan(f) or math.isinf(f):
            return None
        return round(f, 2)
    except (TypeError, ValueError):
        return None


def _safe_divide(numerator: float, denominator: float) -> Optional[float]:
    """Division that returns None instead of NaN/Inf on zero/bad denominator."""
    if denominator is None or denominator == 0:
        return None
    try:
        result = float(numerator) / float(denominator)
        if math.isnan(result) or math.isinf(result):
            return None
        return round(result, 2)
    except (TypeError, ValueError, ZeroDivisionError):
        return None


def _validate_measurement(
    value: Optional[float],
    name: str,
    min_val: float = 0.0,
) -> Optional[float]:
    """
    Validate and cast a measurement to float.
    Returns None if the value is missing, non-numeric, zero, or negative.
    """
    if value is None:
        return None
    try:
        f = float(value)
    except (TypeError, ValueError):
        logger.warning(f"{name}: cannot cast {value!r} to float — returning None.")
        return None

    if math.isnan(f) or math.isinf(f):
        logger.warning(f"{name}: value is NaN or Inf — returning None.")
        return None
    if f <= min_val:
        logger.warning(f"{name}: value {f} is ≤ {min_val} — returning None.")
        return None
    return f


# ═════════════════════════════════════════════════════════════════
#  WHO Reference Lookup Tables (L, M, S approximation)
# ═════════════════════════════════════════════════════════════════

# Median weight (kg) by age in months — WHO 2006 (averaged M/F with sex factor)
_WHO_WEIGHT_MALE = {
    0: 3.3, 1: 4.5, 2: 5.6, 3: 6.4, 4: 7.0, 5: 7.5, 6: 7.9,
    9: 8.9, 12: 9.6, 15: 10.3, 18: 10.9, 21: 11.5, 24: 12.2,
    30: 13.3, 36: 14.3, 42: 15.3, 48: 16.3, 54: 17.3, 60: 18.3,
}

_WHO_WEIGHT_FEMALE = {
    0: 3.2, 1: 4.2, 2: 5.1, 3: 5.8, 4: 6.4, 5: 6.9, 6: 7.3,
    9: 8.2, 12: 8.9, 15: 9.6, 18: 10.2, 21: 10.7, 24: 11.5,
    30: 12.5, 36: 13.5, 42: 14.5, 48: 15.5, 54: 16.5, 60: 17.5,
}

# Median height (cm) by age in months — WHO 2006
_WHO_HEIGHT_MALE = {
    0: 49.9, 1: 54.7, 2: 58.4, 3: 61.4, 4: 63.9, 5: 65.9, 6: 67.6,
    9: 72.0, 12: 75.7, 15: 79.1, 18: 82.3, 21: 85.1, 24: 87.8,
    30: 92.2, 36: 96.1, 42: 99.7, 48: 103.3, 54: 106.7, 60: 110.0,
}

_WHO_HEIGHT_FEMALE = {
    0: 49.1, 1: 53.7, 2: 57.1, 3: 59.8, 4: 62.1, 5: 64.0, 6: 65.7,
    9: 70.1, 12: 73.7, 15: 77.0, 18: 80.1, 21: 83.0, 24: 85.7,
    30: 90.0, 36: 93.9, 42: 97.6, 48: 101.2, 54: 104.7, 60: 108.0,
}

# Approximate SD as percentage of median (WHO standard ~CV)
_SD_WEIGHT_RATIO = 0.12   # ~12% of median
_SD_HEIGHT_RATIO = 0.04   # ~4% of median
_SD_BMI_RATIO    = 0.10   # ~10% of median


def _interpolate_table(table: dict, age_months: int) -> float:
    """Interpolate between WHO reference milestones."""
    keys = sorted(table.keys())
    if age_months <= keys[0]:
        return table[keys[0]]
    if age_months >= keys[-1]:
        return table[keys[-1]]
    for i in range(len(keys) - 1):
        lo, hi = keys[i], keys[i + 1]
        if lo <= age_months <= hi:
            frac = (age_months - lo) / (hi - lo)
            return table[lo] + frac * (table[hi] - table[lo])
    return table[keys[-1]]


def _get_who_reference(age_months: int, sex: str, indicator: str) -> tuple:
    """
    Get WHO reference (median, SD) for a given indicator.

    Args:
        indicator: "weight" or "height"

    Returns:
        (median, sd) — both guaranteed > 0

    Raises:
        ValueError: if age/sex/indicator combination cannot be resolved
    """
    age = max(0, min(int(age_months), 72))

    if indicator == "weight":
        table = _WHO_WEIGHT_MALE if sex == "male" else _WHO_WEIGHT_FEMALE
        sd_ratio = _SD_WEIGHT_RATIO
    elif indicator == "height":
        table = _WHO_HEIGHT_MALE if sex == "male" else _WHO_HEIGHT_FEMALE
        sd_ratio = _SD_HEIGHT_RATIO
    else:
        raise ValueError(f"Unknown WHO indicator: {indicator!r}")

    median = _interpolate_table(table, age)

    if median <= 0:
        raise ValueError(
            f"WHO lookup returned non-positive median ({median}) "
            f"for indicator={indicator}, age={age}m, sex={sex}"
        )

    sd = median * sd_ratio
    if sd <= 0:
        raise ValueError(
            f"WHO SD calculation returned non-positive SD ({sd}) "
            f"for indicator={indicator}, age={age}m, sex={sex}"
        )

    return (median, sd)


# ═════════════════════════════════════════════════════════════════
#  Standalone WHO Clinical Classification
# ═════════════════════════════════════════════════════════════════

def get_malnutrition_status(
    waz: Optional[float] = None,
    haz: Optional[float] = None,
    whz: Optional[float] = None,
    muac_cm: Optional[float] = None,
    age_months: Optional[int] = None,
) -> str:
    """
    Evaluate WHO Z-scores AND MUAC to return a deterministic clinical
    classification.  Status can only **escalate**, never downgrade.

    Order of operations (escalation-only):
      1. Start at NORMAL.
      2. Escalate to MODERATE if MUAC < 12.5 cm OR any Z-score < -2 SD.
      3. Escalate to SEVERE  if MUAC < 11.5 cm OR any Z-score < -3 SD.

    MUAC unit safety:
      If muac_cm > 50, the value is assumed to be in **millimeters**
      and is divided by 10 before evaluation.

    MUAC age applicability:
      MUAC thresholds are clinically validated for children > 6 months.
      For children ≤ 6 months, MUAC is still evaluated if provided
      (field workers may record it), but age_months is informational.

    A Severe MUAC can NEVER be downgraded by a Normal Z-score.

    Returns:
        One of 'SEVERE', 'MODERATE', or 'NORMAL'.
    """
    # ── Step 1: Initialize ──────────────────────────────
    final_status = "NORMAL"

    # ── MUAC unit safety: convert mm → cm if > 50 ──────
    muac = None
    if muac_cm is not None:
        muac = _safe_float(muac_cm)
        if muac is not None and muac > 50:
            muac = round(muac / 10.0, 1)

    # ── Collect Z-scores (filter out None and NaN) ─────
    z_values = []
    for v in (waz, haz, whz):
        sv = _safe_float(v)
        if sv is not None:
            z_values.append(sv)

    # ── Step 2: Check for MODERATE ─────────────────────
    #    (muac < 12.5) OR (any Z-score < -2)
    if muac is not None and muac < 12.5:
        final_status = "MODERATE"

    if z_values and min(z_values) < -2:
        final_status = "MODERATE"

    # ── Step 3: Check for SEVERE (highest priority) ────
    #    (muac < 11.5) OR (any Z-score < -3)
    #    This runs AFTER moderate so it can override it.
    if muac is not None and muac < 11.5:
        final_status = "SEVERE"

    if z_values and min(z_values) < -3:
        final_status = "SEVERE"

    return final_status


# ═════════════════════════════════════════════════════════════════
#  GrowthEngine Class
# ═════════════════════════════════════════════════════════════════

class GrowthEngine:
    """WHO 2006 Child Growth Standards - NaN-Safe Z-Score Calculator."""

    def __init__(self):
        if _USE_PYGROWUP:
            self.calculator = Calculator(
                adjust_height_data=False,
                adjust_weight_scores=False,
                include_cdc=False,
            )
        else:
            self.calculator = None

    def compute_z_scores(
        self,
        age_months: int,
        sex: str,
        weight_kg: Optional[float] = None,
        height_cm: Optional[float] = None,
        muac_cm: Optional[float] = None,
    ) -> dict:
        """
        Compute WHO Z-Scores for a child.

        All inputs are strictly validated and cast to float.
        Returns dict with waz, haz, whz, bmi_z — each is float or None, never NaN.
        """
        # ── Strict input validation ───────────────────────
        age = max(0, int(age_months or 0))
        sex_label = "male" if sex == "M" else "female"

        weight = _validate_measurement(weight_kg, "weight_kg", min_val=0.5)
        height = _validate_measurement(height_cm, "height_cm", min_val=20.0)
        muac = _validate_measurement(muac_cm, "muac_cm", min_val=5.0)

        result = {"waz": None, "haz": None, "whz": None, "bmi_z": None}

        if _USE_PYGROWUP and self.calculator:
            result = self._compute_pygrowup(age, sex_label, weight, height)
        else:
            result = self._compute_fallback(age, sex_label, weight, height)

        # ── Data quality check ────────────────────────────
        result["data_quality_warning"] = None
        if height is not None and age > 6:
            try:
                median_h, _ = _get_who_reference(age, sex_label, "height")
                if height < median_h * 0.60:
                    result["data_quality_warning"] = (
                        f"Height {height}cm may be implausible for age {age}m "
                        f"(WHO median {median_h:.1f}cm). Verify measurement. "
                        f"MUAC overrides classification."
                    )
            except ValueError:
                pass  # Can't validate, move on

        # ── Risk level — MUAC is fallback / override ──────
        result["risk_level"] = self._classify_risk(result, muac_cm=muac)

        return result

    def _compute_pygrowup(self, age_months, sex, weight, height) -> dict:
        scores = {"waz": None, "haz": None, "whz": None, "bmi_z": None}

        try:
            if weight is not None:
                waz = self.calculator.wfa(weight, age_months, sex)
                scores["waz"] = _safe_float(waz)
        except Exception as e:
            logger.warning(f"WAZ calculation failed: {e}")

        try:
            if height is not None:
                haz = self.calculator.lhfa(height, age_months, sex)
                scores["haz"] = _safe_float(haz)
        except Exception as e:
            logger.warning(f"HAZ calculation failed: {e}")

        try:
            if weight is not None and height is not None and height > 0:
                whz = self.calculator.wfl(weight, height, sex)
                scores["whz"] = _safe_float(whz)
                bmi = weight / ((height / 100) ** 2)
                scores["bmi_z"] = _safe_float(
                    self.calculator.bmifa(bmi, age_months, sex)
                )
        except Exception as e:
            logger.warning(f"WHZ/BMI calculation failed: {e}")

        return scores

    def _compute_fallback(self, age_months, sex, weight, height) -> dict:
        """
        Built-in WHO Z-Score approximation using validated reference tables.
        Every division goes through _safe_divide to prevent NaN.
        """
        scores = {"waz": None, "haz": None, "whz": None, "bmi_z": None}

        try:
            median_weight, sd_weight = _get_who_reference(age_months, sex, "weight")
        except ValueError as e:
            logger.warning(f"WHO weight reference lookup failed: {e}")
            median_weight, sd_weight = None, None

        try:
            median_height, sd_height = _get_who_reference(age_months, sex, "height")
        except ValueError as e:
            logger.warning(f"WHO height reference lookup failed: {e}")
            median_height, sd_height = None, None

        # WAZ: Weight-for-Age
        if weight is not None and sd_weight is not None and sd_weight > 0:
            scores["waz"] = _safe_divide(weight - median_weight, sd_weight)

        # HAZ: Height-for-Age
        if height is not None and sd_height is not None and sd_height > 0:
            scores["haz"] = _safe_divide(height - median_height, sd_height)

        # WHZ / BMI-Z: Weight-for-Height
        if (weight is not None and height is not None
                and height > 0 and median_weight is not None
                and median_height is not None):
            try:
                bmi = weight / ((height / 100) ** 2)
                median_bmi = median_weight / ((median_height / 100) ** 2)
                sd_bmi = median_bmi * _SD_BMI_RATIO

                scores["bmi_z"] = _safe_divide(bmi - median_bmi, sd_bmi)
                scores["whz"] = scores["bmi_z"]
            except (ZeroDivisionError, ValueError):
                pass  # Leave as None

        return scores

    @staticmethod
    def _classify_risk(scores: dict, muac_cm: Optional[float] = None) -> str:
        """
        Determine risk level from Z-scores with MUAC fallback.
        If Z-scores are all None (e.g. implausible measurements), MUAC is used.
        MUAC unit safety: values > 50 are treated as mm and divided by 10.
        """
        z_values = []
        for v in [scores.get("waz"), scores.get("haz"), scores.get("whz")]:
            sv = _safe_float(v)
            if sv is not None:
                z_values.append(sv)

        # Resolve MUAC in cm
        muac = _safe_float(muac_cm)
        if muac is not None and muac > 50:
            muac = round(muac / 10.0, 1)

        # If no Z-scores available, fall back to MUAC
        if not z_values:
            if muac is None:
                return "unknown"
            if muac < 11.5:
                return "severe"
            if muac < 12.5:
                return "moderate"
            return "normal"

        # Normal Z-score path
        min_z = min(z_values)
        if min_z < -3:
            return "severe"
        elif min_z < -2:
            return "moderate"

        # Z-scores say normal — but check MUAC override (never downgrade SAM)
        if muac is not None and muac < 11.5:
            return "severe"
        if muac is not None and muac < 12.5:
            return "moderate"

        return "normal"