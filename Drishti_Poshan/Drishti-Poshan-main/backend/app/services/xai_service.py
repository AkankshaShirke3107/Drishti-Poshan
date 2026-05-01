"""
Drishti Poshan - XAI Service (Dual-Layer Explainable AI)
=========================================================
Layer 1: SHAP-based GradientBoosting model (existing)
Layer 2: LLM-based Clinical Reasoning Engine (Groq / Llama-3)

The LLM explainer generates human-readable medical reasoning and
actionable WHO-protocol recommendations using the child's actual
clinical data. Temperature is pinned to 0.0 to eliminate hallucination.
"""
import json
import logging
import os
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)


# ═════════════════════════════════════════════════════════════════
#  Layer 2: LLM-Based Clinical Reasoning Engine (Groq/Llama-3)
# ═════════════════════════════════════════════════════════════════

# Strict system prompt that forces WHO-protocol compliance
_CLINICAL_SYSTEM_PROMPT = """You are a senior pediatric nutritionist AI operating under strict WHO IMNCI and SAM/MAM management protocols. You analyze child anthropometric data and produce clinical reasoning.

RULES:
1. You MUST base your reasoning solely on the provided data — never invent or assume values.
2. You MUST follow these WHO classification thresholds exactly:
   - SEVERE (SAM): MUAC < 11.5 cm OR any Z-score < -3 SD OR bilateral edema
   - MODERATE (MAM): MUAC 11.5–12.5 cm OR any Z-score between -3 and -2 SD
   - NORMAL: MUAC > 12.5 cm AND all Z-scores ≥ -2 SD
3. If data values conflict (e.g., normal Z-score but SAM-level MUAC), you MUST flag the conflict and default to the WORSE classification.
4. **COMPLICATED SAM TRIAGE**: If the child's base risk is SEVERE, and they ALSO have ANY of these danger signs:
   - severe_palmar_pallor == True
   - hemoglobin_g_dl < 5.0
   - temperature_celsius < 35.0 (hypothermia)
   - breaths_per_minute > 60 (tachypnea)
   You MUST classify this as "Complicated SAM" and recommend IMMEDIATE transfer to a Nutritional Rehabilitation Center (NRC) with oxygen/transfusion capabilities. This is a medical emergency.
5. **LAB RESULT INTERPRETATION** (if lab data is present):
   - Serum Albumin normal: 3.4-5.4 g/dL. Below 3.0 suggests protein-energy malnutrition or chronic illness.
   - Prealbumin normal: 15-36 mg/dL. Below 10 suggests acute malnutrition. It responds to feeding within 2-3 days.
   - CRP normal: <5.0 mg/L. If CRP is elevated (>10), low Albumin may be due to acute infection/inflammation, NOT just malnutrition.
   - KEY RULE: If Prealbumin is improving but Albumin is still low, note that the child is responding well to recent feeding interventions.
   - KEY RULE: If CRP is high AND Albumin is low, warn the doctor that hypoalbuminemia may be inflammatory, not purely nutritional.
6. Your temperature is 0.0 — do NOT speculate, hallucinate, or add creative commentary.
7. Respond ONLY with a valid JSON object — no markdown, no backticks, no extra text.

OUTPUT FORMAT (strict JSON):
{
  "reasoning": "One clear sentence explaining WHY the risk was assigned, citing specific threshold values.",
  "recommendation": "One actionable clinical next step following WHO IMNCI protocol.",
  "confidence": "HIGH|MEDIUM|LOW based on data completeness",
  "sam_type": "UNCOMPLICATED|COMPLICATED|NOT_SAM"
}"""


async def generate_xai_recommendation(child_data: dict) -> dict:
    """
    Generate LLM-based clinical reasoning for a child's risk assessment.

    Args:
        child_data: dict with keys:
            - age_months (int)
            - sex (str): "M" or "F"
            - weight_kg (float|None)
            - height_cm (float|None)
            - muac_cm (float|None)
            - waz (float|None)
            - haz (float|None)
            - whz (float|None)
            - bmi_z (float|None)
            - risk_level (str): "normal"|"moderate"|"severe"
            - status (str): "NORMAL"|"MODERATE"|"SEVERE"
            - has_edema (bool, optional)

    Returns:
        dict with 'reasoning', 'recommendation', 'confidence', 'source'
    """
    # ── Build the clinical data prompt ──────────────────
    age = child_data.get("age_months", "unknown")
    sex = "Male" if child_data.get("sex") == "M" else "Female"
    muac = child_data.get("muac_cm")
    weight = child_data.get("weight_kg")
    height = child_data.get("height_cm")
    waz = child_data.get("waz")
    haz = child_data.get("haz")
    whz = child_data.get("whz")
    bmi_z = child_data.get("bmi_z")
    risk = child_data.get("risk_level", "unknown")
    status = child_data.get("status", "UNKNOWN")
    edema = child_data.get("has_edema", False)

    # Clinical vitals for Complicated SAM triage
    hb = child_data.get("hemoglobin_g_dl")
    pallor = child_data.get("severe_palmar_pallor", False)
    temp = child_data.get("temperature_celsius")
    resp_rate = child_data.get("breaths_per_minute")

    # Lab biochemistry (if available)
    albumin = child_data.get("serum_albumin_g_dl")
    prealbumin = child_data.get("prealbumin_mg_dl")
    crp = child_data.get("crp_mg_l")

    # Verified WHO LMS Weight-for-Height Z-score (if calculated)
    verified_whz = child_data.get("verified_whz")

    user_prompt = f"""Analyze this child's nutritional status and provide clinical reasoning:

PATIENT DATA:
- Age: {age} months | Sex: {sex}
- Weight: {weight if weight else 'Not recorded'} kg
- Height: {height if height else 'Not recorded'} cm
- MUAC: {muac if muac else 'Not recorded'} cm
- Bilateral Edema: {'Yes' if edema else 'No'}

CLINICAL VITALS:
- Hemoglobin: {f'{hb} g/dL' if hb is not None else 'Not recorded'}
- Severe Palmar Pallor: {'Yes' if pallor else 'No'}
- Temperature: {f'{temp} °C' if temp is not None else 'Not recorded'}
- Respiratory Rate: {f'{resp_rate} breaths/min' if resp_rate is not None else 'Not recorded'}

LAB BIOCHEMISTRY:
- Serum Albumin: {f'{albumin} g/dL (Normal: 3.4-5.4)' if albumin is not None else 'Not recorded'}
- Prealbumin: {f'{prealbumin} mg/dL (Normal: 15-36)' if prealbumin is not None else 'Not recorded'}
- CRP: {f'{crp} mg/L (Normal: <5.0)' if crp is not None else 'Not recorded'}

Z-SCORES:
- WAZ (Weight-for-Age): {waz if waz is not None else 'N/A'}
- HAZ (Height-for-Age): {haz if haz is not None else 'N/A'}
- WHZ (Weight-for-Height): {whz if whz is not None else 'N/A'}
- BMI-Z: {bmi_z if bmi_z is not None else 'N/A'}
{f"""
VERIFIED WHO LMS WHZ: {verified_whz}
NOTE: The child's verified WHO Weight-for-Height Z-score is {verified_whz} (calculated using the standard LMS Box-Cox method from WHO 2006 Growth Standards). Use this precise metric to formulate your clinical recommendation.""" if verified_whz is not None else ""}

CURRENT CLASSIFICATION: {status} (risk_level: {risk})

Provide your clinical reasoning as a JSON object."""

    # ── Try Groq LLM ──────────────────────────────────
    groq_key = os.getenv("GROQ_API_KEY", "")
    if groq_key:
        try:
            result = await _call_groq(groq_key, user_prompt)
            if result:
                result["source"] = "groq-llama3"
                return result
        except Exception as e:
            logger.warning(f"Groq XAI call failed: {e}")

    # ── Fallback: Deterministic WHO-based reasoning ────
    return _deterministic_reasoning(child_data)


async def _call_groq(api_key: str, user_prompt: str) -> Optional[dict]:
    """Call Groq API with Llama-3 for clinical reasoning."""
    try:
        from groq import AsyncGroq
    except ImportError:
        logger.warning("groq package not installed — skipping LLM reasoning.")
        return None

    client = AsyncGroq(api_key=api_key)

    response = await client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role": "system", "content": _CLINICAL_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.0,
        max_tokens=300,
        response_format={"type": "json_object"},
    )

    content = response.choices[0].message.content.strip()

    # Parse JSON response
    try:
        parsed = json.loads(content)
        return {
            "reasoning": parsed.get("reasoning", "Unable to determine reasoning."),
            "recommendation": parsed.get("recommendation", "Continue regular monitoring."),
            "confidence": parsed.get("confidence", "MEDIUM"),
        }
    except json.JSONDecodeError:
        logger.warning(f"Groq returned non-JSON: {content[:200]}")
        return None


def _deterministic_reasoning(child_data: dict) -> dict:
    """
    Fallback: Generate deterministic clinical reasoning from WHO protocols
    when the LLM is unavailable or fails.
    Includes Complicated SAM triage based on clinical vitals.
    """
    muac = child_data.get("muac_cm")
    waz = child_data.get("waz")
    haz = child_data.get("haz")
    whz = child_data.get("whz")
    risk = child_data.get("risk_level", "unknown")
    status = child_data.get("status", "UNKNOWN")
    edema = child_data.get("has_edema", False)

    # Clinical vitals for Complicated SAM
    hb = child_data.get("hemoglobin_g_dl")
    pallor = child_data.get("severe_palmar_pallor", False)
    temp = child_data.get("temperature_celsius")
    resp_rate = child_data.get("breaths_per_minute")

    reasons = []
    recommendation = "Continue regular monitoring and monthly weight checks."
    confidence = "HIGH"
    sam_type = "NOT_SAM"

    # ── Edema check (highest priority) ─────────────────
    if edema:
        reasons.append("Bilateral edema detected — automatic SAM classification per WHO IMNCI")
        recommendation = "Immediate referral to Nutrition Rehabilitation Centre (NRC). Administer appetite test. Begin F-75 therapeutic diet."
        return {
            "reasoning": "; ".join(reasons),
            "recommendation": recommendation,
            "confidence": "HIGH",
            "sam_type": "COMPLICATED",
            "source": "deterministic-who",
        }

    # ── MUAC-based reasoning ──────────────────────────
    if muac is not None:
        if muac < 11.5:
            reasons.append(f"MUAC of {muac}cm is below the 11.5cm SAM threshold")
        elif muac < 12.5:
            reasons.append(f"MUAC of {muac}cm is between 11.5-12.5cm (MAM range)")
        else:
            reasons.append(f"MUAC of {muac}cm is above the 12.5cm threshold (normal)")

    # ── Z-score reasoning ──────────────────────────────
    z_labels = {"waz": "Weight-for-Age", "haz": "Height-for-Age", "whz": "Weight-for-Height"}
    for key, label in z_labels.items():
        val = child_data.get(key)
        if val is not None:
            if val < -3:
                reasons.append(f"{label} Z-score of {val:.2f} is below -3 SD (severe)")
            elif val < -2:
                reasons.append(f"{label} Z-score of {val:.2f} is between -3 and -2 SD (moderate)")

    # ── Conflict detection ─────────────────────────────
    z_values = [v for v in [waz, haz, whz] if v is not None]
    if muac is not None and z_values:
        muac_is_severe = muac < 11.5
        z_is_normal = all(z >= -2 for z in z_values)
        if muac_is_severe and z_is_normal:
            reasons.append("NOTE: MUAC indicates SAM despite normal Z-scores — MUAC takes precedence per WHO protocol")
            confidence = "MEDIUM"

    # ── Complicated SAM Triage ─────────────────────────
    # WHO defines Complicated SAM as SAM + medical complications
    danger_signs = []
    if pallor:
        danger_signs.append("severe palmar pallor (clinical anemia)")
    if hb is not None and hb < 5.0:
        danger_signs.append(f"critically low hemoglobin ({hb} g/dL < 5.0 threshold)")
    if temp is not None and temp < 35.0:
        danger_signs.append(f"hypothermia ({temp}°C < 35.0°C)")
    if resp_rate is not None and resp_rate > 60:
        danger_signs.append(f"tachypnea ({resp_rate} breaths/min > 60 threshold)")

    is_base_severe = (status == "SEVERE" or risk == "severe")

    if is_base_severe and danger_signs:
        # ── COMPLICATED SAM — Medical Emergency ────────
        sam_type = "COMPLICATED"
        reasons.append(
            f"COMPLICATED SAM detected: Base risk is SEVERE with danger sign(s): {', '.join(danger_signs)}"
        )
        recommendation = (
            "⚠️ MEDICAL EMERGENCY — Complicated SAM. "
            "Immediate transfer to a Nutritional Rehabilitation Center (NRC) "
            "with oxygen, IV fluid, and blood transfusion capabilities. "
            "Stabilize with F-75 diet, treat hypothermia/infection, "
            "and do NOT discharge until all medical complications are resolved."
        )
        confidence = "HIGH"
    elif is_base_severe:
        # ── UNCOMPLICATED SAM ─────────────────────────
        sam_type = "UNCOMPLICATED"
        if danger_signs:  # edge case: shouldn't hit but safety net
            reasons.append(f"Clinical vitals noted: {', '.join(danger_signs)}")
        recommendation = (
            "Uncomplicated SAM — manage in community-based programme. "
            "Administer appetite test. Begin Ready-to-Use Therapeutic Food (RUTF). "
            "Schedule weekly weight and MUAC monitoring. "
            "Refer to NRC immediately if appetite test fails or medical complications appear."
        )
    elif status == "MODERATE":
        recommendation = (
            "Enroll in Supplementary Feeding Programme (SFP). "
            "Provide locally available nutrient-dense foods (eggs, dal, ghee). "
            "Schedule bi-weekly MUAC and weight monitoring. "
            "Refer to health facility if no improvement in 4 weeks."
        )
    else:
        recommendation = (
            "Child is within normal nutritional parameters. "
            "Continue monthly growth monitoring. "
            "Ensure balanced diet with adequate protein and micronutrients."
        )

    # ── Clinical vitals reasoning (for non-SAM children too)
    if danger_signs and not is_base_severe:
        reasons.append(f"Clinical vitals of concern: {', '.join(danger_signs)} — monitor closely")

    # ── Lab Biochemistry Interpretation ────────────────────
    albumin = child_data.get("serum_albumin_g_dl")
    prealbumin = child_data.get("prealbumin_mg_dl")
    crp = child_data.get("crp_mg_l")

    has_any_lab = any(v is not None for v in [albumin, prealbumin, crp])

    if has_any_lab:
        # CRP + Albumin: infection vs malnutrition
        if crp is not None and crp > 10 and albumin is not None and albumin < 3.0:
            reasons.append(
                f"⚠ CRP is elevated ({crp} mg/L > 10) AND Albumin is low ({albumin} g/dL) — "
                "hypoalbuminemia may be inflammatory (infection/sepsis), not purely nutritional. "
                "Treat underlying infection before attributing to malnutrition alone"
            )
        elif albumin is not None and albumin < 3.0:
            reasons.append(
                f"Serum Albumin is {albumin} g/dL (below 3.0) — suggests protein-energy malnutrition"
            )
        elif albumin is not None:
            reasons.append(f"Serum Albumin is {albumin} g/dL (within normal range 3.4-5.4)")

        # Prealbumin: acute response marker
        if prealbumin is not None:
            if prealbumin < 10:
                reasons.append(
                    f"Prealbumin is critically low ({prealbumin} mg/dL < 10) — acute protein depletion"
                )
            elif prealbumin < 15:
                reasons.append(
                    f"Prealbumin is {prealbumin} mg/dL (below normal 15-36) — mild protein depletion"
                )
            else:
                reasons.append(f"Prealbumin is {prealbumin} mg/dL (normal range)")

        # Prealbumin improving + Albumin still low = responding to feeding
        if (prealbumin is not None and prealbumin >= 15
                and albumin is not None and albumin < 3.4):
            reasons.append(
                "NOTE: Prealbumin has normalized but Albumin remains low — "
                "child IS responding to feeding interventions (Prealbumin responds within 2-3 days, "
                "Albumin takes 2-3 weeks to normalize)"
            )

        # CRP standalone
        if crp is not None and crp > 5.0 and albumin is None:
            reasons.append(
                f"CRP is elevated ({crp} mg/L > 5.0) — active inflammation/infection present. "
                "Any future low Albumin readings should be interpreted with caution"
            )

    # Default reasoning if no specific triggers
    if not reasons:
        if status == "NORMAL":
            reasons.append("All available indicators are within normal WHO reference ranges")
        else:
            reasons.append(f"Risk classified as {status} based on available clinical indicators")

    return {
        "reasoning": "; ".join(reasons) + ".",
        "recommendation": recommendation,
        "confidence": confidence,
        "sam_type": sam_type,
        "source": "deterministic-who",
    }


# ═════════════════════════════════════════════════════════════════
#  Layer 1: SHAP-Based ML Explainer (preserved from original)
# ═════════════════════════════════════════════════════════════════

class XAIService:
    """
    SHAP-based Explainable AI for child malnutrition risk.

    Uses a lightweight sklearn model trained on synthetic WHO reference data
    to predict risk, then explains predictions with SHAP KernelExplainer.
    """

    FEATURE_NAMES = [
        "age_months",
        "weight_kg",
        "height_cm",
        "muac_cm",
        "waz",
        "haz",
        "whz",
        "bmi_z",
    ]

    RISK_LABELS = {0: "normal", 1: "moderate", 2: "severe"}

    def __init__(self):
        self.model = None
        self.explainer = None
        self._background_data = None

    def initialize(self):
        """
        Build and train a lightweight GradientBoosting model on synthetic
        WHO reference data, then create a SHAP explainer.
        """
        from sklearn.ensemble import GradientBoostingClassifier

        logger.info("Initializing XAI engine with synthetic WHO data...")

        # Generate synthetic training data based on WHO standards
        X_train, y_train = self._generate_synthetic_data(n_samples=500)
        self._background_data = X_train[:50]  # SHAP background data

        # Train a lightweight model
        self.model = GradientBoostingClassifier(
            n_estimators=50,
            max_depth=4,
            random_state=42,
            learning_rate=0.1,
        )
        self.model.fit(X_train, y_train)

        # Create SHAP explainer
        try:
            import shap
            self.explainer = shap.KernelExplainer(
                self.model.predict_proba,
                self._background_data,
            )
            logger.info("SHAP KernelExplainer initialized.")
        except Exception as e:
            logger.warning(f"SHAP initialization failed (will use feature importance fallback): {e}")
            self.explainer = None

        logger.info("XAI engine ready.")

    def explain(
        self,
        age_months: int,
        weight_kg: Optional[float],
        height_cm: Optional[float],
        muac_cm: Optional[float],
        waz: Optional[float],
        haz: Optional[float],
        whz: Optional[float],
        bmi_z: Optional[float],
    ) -> dict:
        """
        Generate SHAP-based impact map for a child's risk factors.

        Returns:
            dict with 'impact_map', 'predicted_risk', and 'recommendations'
        """
        if self.model is None:
            raise RuntimeError("XAI engine not initialized. Call initialize() first.")

        # Build feature vector (replace None with 0, NaN-safe)
        def _clean(v):
            if v is None:
                return 0.0
            try:
                f = float(v)
                return 0.0 if (f != f) else f  # NaN check: NaN != NaN
            except (TypeError, ValueError):
                return 0.0

        features = np.array([
            _clean(age_months),
            _clean(weight_kg),
            _clean(height_cm),
            _clean(muac_cm),
            _clean(waz),
            _clean(haz),
            _clean(whz),
            _clean(bmi_z),
        ]).reshape(1, -1)

        # Predict risk
        predicted_class = int(self.model.predict(features)[0])
        predicted_risk = self.RISK_LABELS.get(predicted_class, "unknown")

        # Generate SHAP explanations
        impact_map = {}
        if self.explainer is not None:
            try:
                shap_values = self.explainer.shap_values(features, nsamples=100)
                # Use SHAP values for the predicted class
                if isinstance(shap_values, list):
                    values = shap_values[predicted_class][0]
                else:
                    values = shap_values[0]

                for name, val in zip(self.FEATURE_NAMES, values):
                    impact_map[name] = round(float(val), 4)
            except Exception as e:
                logger.warning(f"SHAP explanation failed, using feature importance: {e}")
                impact_map = self._fallback_importance(features)
        else:
            impact_map = self._fallback_importance(features)

        # Generate recommendations based on impact
        recommendations = self._generate_recommendations(impact_map, predicted_risk)

        return {
            "impact_map": impact_map,
            "predicted_risk": predicted_risk,
            "recommendations": recommendations,
        }

    def _fallback_importance(self, features: np.ndarray) -> dict:
        """Use model's built-in feature importance as fallback."""
        if self.model is None:
            return {}
        importances = self.model.feature_importances_
        return {
            name: round(float(imp * features[0][i]), 4)
            for i, (name, imp) in enumerate(zip(self.FEATURE_NAMES, importances))
        }

    def _generate_recommendations(self, impact_map: dict, risk_level: str) -> list[str]:
        """Generate actionable recommendations from SHAP impact analysis."""
        recs = []

        if risk_level == "severe":
            recs.append("🚨 Immediate referral to nearest health facility recommended.")
            recs.append("Begin therapeutic feeding program (F-75/F-100).")

        if risk_level in ("moderate", "severe"):
            recs.append("Increase caloric intake with locally available nutrient-dense foods.")
            recs.append("Schedule bi-weekly weight monitoring.")

        # Specific factor-based recommendations
        waz_impact = impact_map.get("waz", 0)
        haz_impact = impact_map.get("haz", 0)
        whz_impact = impact_map.get("whz", 0)
        muac_impact = impact_map.get("muac_cm", 0)

        if waz_impact < -0.5:
            recs.append("Underweight detected — supplement with energy-dense foods (eggs, ghee, dal).")
        if haz_impact < -0.5:
            recs.append("Stunting risk — ensure adequate protein and micronutrient intake (milk, green vegetables).")
        if whz_impact < -0.5:
            recs.append("Wasting detected — start Ready-to-Use Therapeutic Food (RUTF) if available.")
        if muac_impact < -0.3:
            recs.append("Low MUAC indicates acute malnutrition — prioritize immediate supplementary feeding.")

        if not recs:
            recs.append("✅ Child is within normal growth parameters. Continue regular monitoring.")

        return recs

    @staticmethod
    def _generate_synthetic_data(n_samples: int = 500):
        """
        Generate synthetic child growth data mirroring WHO distributions.
        Used to train the lightweight risk classifier.
        """
        rng = np.random.RandomState(42)

        data = []
        labels = []

        for _ in range(n_samples):
            age = rng.randint(0, 61)
            sex_factor = rng.choice([1.0, 0.95])  # slight sex-based variation

            # Generate based on WHO medians with realistic noise
            median_w = (3.3 + age * 0.25) * sex_factor
            median_h = (49.9 + age * 1.1) * sex_factor

            # Create realistic variation
            health_state = rng.choice([0, 1, 2], p=[0.6, 0.25, 0.15])

            if health_state == 0:  # Normal
                w_noise = rng.normal(0, 0.8)
                h_noise = rng.normal(0, 2.0)
            elif health_state == 1:  # Moderate
                w_noise = rng.normal(-2, 0.6)
                h_noise = rng.normal(-3, 1.5)
            else:  # Severe
                w_noise = rng.normal(-4, 0.8)
                h_noise = rng.normal(-5, 2.0)

            weight = max(1.5, median_w + w_noise)
            height = max(40, median_h + h_noise)
            muac = max(8, 13 + rng.normal(-health_state * 1.5, 1.0))

            # Compute approximate Z-scores
            sd_w = max(median_w * 0.12, 0.1)
            sd_h = max(median_h * 0.04, 0.1)
            waz = (weight - median_w) / sd_w
            haz = (height - median_h) / sd_h

            bmi = weight / ((height / 100) ** 2)
            median_bmi = median_w / ((median_h / 100) ** 2)
            sd_bmi = max(median_bmi * 0.10, 0.1)
            bmi_z = (bmi - median_bmi) / sd_bmi
            whz = bmi_z  # Simplified

            data.append([age, weight, height, muac, waz, haz, whz, bmi_z])
            labels.append(health_state)

        return np.array(data), np.array(labels)
