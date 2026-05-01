"""
Drishti Poshan - Growth Standards Service
Uses pygrowup for WHO 2006 Z-Score calculations.
Falls back to a manual lookup if pygrowup is unavailable.
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


class GrowthService:
    """WHO 2006 Child Growth Standards - Z-Score Calculator."""

    def __init__(self):
        if _USE_PYGROWUP:
            # adjust_height_data=False: we supply recumbent length vs standing height
            # adjust_weight_scores=False: no rounding adjustments
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
    ) -> dict:
        """
        Compute WHO Z-Scores for a child.

        Args:
            age_months: Age in completed months (0-60)
            sex: 'M' or 'F'
            weight_kg: Weight in kilograms
            height_cm: Height/length in centimetres

        Returns:
            dict with waz, haz, whz, bmi_z, and risk_level
        """
        sex_label = "male" if sex == "M" else "female"
        result = {"waz": None, "haz": None, "whz": None, "bmi_z": None}

        if _USE_PYGROWUP and self.calculator:
            result = self._compute_pygrowup(age_months, sex_label, weight_kg, height_cm)
        else:
            result = self._compute_fallback(age_months, sex_label, weight_kg, height_cm)

        # Determine risk level from Z-Scores
        risk_level = self._classify_risk(result)
        result["risk_level"] = risk_level

        return result

    def _compute_pygrowup(self, age_months, sex, weight, height) -> dict:
        """Compute using pygrowup Calculator."""
        scores = {"waz": None, "haz": None, "whz": None, "bmi_z": None}

        try:
            if weight is not None:
                waz = self.calculator.wfa(weight, age_months, sex)
                scores["waz"] = self._safe_float(waz)
        except Exception as e:
            logger.warning(f"WAZ calculation failed: {e}")

        try:
            if height is not None:
                haz = self.calculator.lhfa(height, age_months, sex)
                scores["haz"] = self._safe_float(haz)
        except Exception as e:
            logger.warning(f"HAZ calculation failed: {e}")

        try:
            if weight is not None and height is not None and height > 0:
                whz = self.calculator.wfl(weight, height, sex)
                scores["whz"] = self._safe_float(whz)
                # BMI Z-score
                bmi = weight / ((height / 100) ** 2)
                scores["bmi_z"] = self._safe_float(
                    self.calculator.bmifa(bmi, age_months, sex)
                )
        except Exception as e:
            logger.warning(f"WHZ/BMI calculation failed: {e}")

        return scores

    def _compute_fallback(self, age_months, sex, weight, height) -> dict:
        """
        Simplified Z-Score approximation using WHO median reference data.
        This is a fallback when pygrowup is not available.
        """
        scores = {"waz": None, "haz": None, "whz": None, "bmi_z": None}

        # WHO median reference values (simplified, for age 0-60 months)
        # Source: WHO Child Growth Standards
        median_weight = self._who_median_weight(age_months, sex)
        median_height = self._who_median_height(age_months, sex)
        sd_weight = median_weight * 0.12  # ~12% CV
        sd_height = median_height * 0.04  # ~4% CV

        if weight is not None and median_weight > 0 and sd_weight > 0:
            scores["waz"] = round((weight - median_weight) / sd_weight, 2)

        if height is not None and median_height > 0 and sd_height > 0:
            scores["haz"] = round((height - median_height) / sd_height, 2)

        if weight is not None and height is not None and height > 0:
            bmi = weight / ((height / 100) ** 2)
            median_bmi = median_weight / ((median_height / 100) ** 2)
            sd_bmi = median_bmi * 0.10
            if sd_bmi > 0:
                scores["bmi_z"] = round((bmi - median_bmi) / sd_bmi, 2)
            # WHZ approximation
            scores["whz"] = scores["bmi_z"]

        return scores

    @staticmethod
    def _who_median_weight(age_months: int, sex: str) -> float:
        """Approximate WHO median weight-for-age (kg). Simplified curve."""
        if sex == "male":
            # Boys: birth=3.3, 6m=7.9, 12m=9.6, 24m=12.2, 36m=14.3, 48m=16.3, 60m=18.3
            if age_months <= 0:
                return 3.3
            elif age_months <= 6:
                return 3.3 + age_months * 0.77
            elif age_months <= 24:
                return 7.9 + (age_months - 6) * 0.24
            else:
                return 12.2 + (age_months - 24) * 0.17
        else:
            # Girls: birth=3.2, 6m=7.3, 12m=8.9, 24m=11.5, 36m=13.9, 48m=15.9, 60m=17.9
            if age_months <= 0:
                return 3.2
            elif age_months <= 6:
                return 3.2 + age_months * 0.68
            elif age_months <= 24:
                return 7.3 + (age_months - 6) * 0.23
            else:
                return 11.5 + (age_months - 24) * 0.18

    @staticmethod
    def _who_median_height(age_months: int, sex: str) -> float:
        """Approximate WHO median height/length-for-age (cm). Simplified curve."""
        if sex == "male":
            if age_months <= 0:
                return 49.9
            elif age_months <= 12:
                return 49.9 + age_months * 2.08
            elif age_months <= 24:
                return 75.7 + (age_months - 12) * 1.0
            else:
                return 87.8 + (age_months - 24) * 0.6
        else:
            if age_months <= 0:
                return 49.1
            elif age_months <= 12:
                return 49.1 + age_months * 2.05
            elif age_months <= 24:
                return 73.7 + (age_months - 12) * 1.0
            else:
                return 85.7 + (age_months - 24) * 0.6

    @staticmethod
    def _classify_risk(scores: dict) -> str:
        """Classify malnutrition risk from Z-Scores per WHO standards."""
        z_values = [v for v in [scores.get("waz"), scores.get("haz"), scores.get("whz")] if v is not None]
        if not z_values:
            return "unknown"

        min_z = min(z_values)
        if min_z < -3:
            return "severe"
        elif min_z < -2:
            return "moderate"
        else:
            return "normal"

    @staticmethod
    def _safe_float(value) -> Optional[float]:
        """Convert to float, return None if invalid."""
        try:
            f = float(value)
            if math.isnan(f) or math.isinf(f):
                return None
            return round(f, 2)
        except (TypeError, ValueError):
            return None
