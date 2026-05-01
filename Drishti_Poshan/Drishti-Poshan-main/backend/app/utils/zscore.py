"""
Drishti Poshan — WHO LMS Weight-for-Height Z-Score Calculator
==============================================================
Implements the standard WHO formula:
    Z = (((value / M) ^ L) - 1) / (L * S)

When L == 0 (Box-Cox power = 0), the formula simplifies to:
    Z = ln(value / M) / S

Reference: WHO Child Growth Standards (2006)
           https://www.who.int/tools/child-growth-standards/standards

LMS tables sourced from WHO wfh (weight-for-height/length) tables
for children 45-120 cm.
"""

import logging
import math
from typing import Optional

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════
#  WHO Weight-for-Height LMS Reference Data
#  Source: WHO 2006 Growth Standards — wfh_boys/wfh_girls tables
#  Columns: height_cm → (L, M, S)
#  L = Box-Cox power, M = median, S = coefficient of variation
# ═══════════════════════════════════════════════════════════════════

_WFH_LMS_BOYS = {
    # height_cm: (L,          M,       S)
    45.0: (-0.3521, 2.441, 0.09182),
    45.5: (-0.3521, 2.528, 0.09153),
    46.0: (-0.3521, 2.618, 0.09124),
    46.5: (-0.3521, 2.710, 0.09094),
    47.0: (-0.3521, 2.804, 0.09065),
    47.5: (-0.3521, 2.902, 0.09036),
    48.0: (-0.3521, 3.002, 0.09007),
    48.5: (-0.3521, 3.104, 0.08977),
    49.0: (-0.3521, 3.209, 0.08948),
    49.5: (-0.3521, 3.317, 0.08919),
    50.0: (-0.3521, 3.426, 0.08890),
    50.5: (-0.3521, 3.537, 0.08861),
    51.0: (-0.3521, 3.650, 0.08832),
    52.0: (-0.3521, 3.879, 0.08773),
    53.0: (-0.3521, 4.110, 0.08715),
    54.0: (-0.3521, 4.341, 0.08656),
    55.0: (-0.3521, 4.569, 0.08599),
    56.0: (-0.3521, 4.792, 0.08544),
    57.0: (-0.3521, 5.006, 0.08491),
    58.0: (-0.3521, 5.210, 0.08441),
    59.0: (-0.3521, 5.404, 0.08394),
    60.0: (-0.3521, 5.588, 0.08350),
    61.0: (-0.3521, 5.762, 0.08310),
    62.0: (-0.3521, 5.927, 0.08273),
    63.0: (-0.3521, 6.085, 0.08239),
    64.0: (-0.3521, 6.237, 0.08209),
    65.0: (-0.3521, 6.386, 0.08183),
    66.0: (-0.3521, 6.531, 0.08159),
    67.0: (-0.3521, 6.674, 0.08138),
    68.0: (-0.3521, 6.815, 0.08120),
    69.0: (-0.3521, 6.956, 0.08106),
    70.0: (-0.3521, 7.098, 0.08094),
    71.0: (-0.3521, 7.241, 0.08086),
    72.0: (-0.3521, 7.385, 0.08082),
    73.0: (-0.3521, 7.530, 0.08082),
    74.0: (-0.3521, 7.677, 0.08086),
    75.0: (-0.3521, 7.826, 0.08095),
    76.0: (-0.3521, 7.978, 0.08108),
    77.0: (-0.3521, 8.132, 0.08126),
    78.0: (-0.3521, 8.290, 0.08149),
    79.0: (-0.3521, 8.451, 0.08178),
    80.0: (-0.3521, 8.615, 0.08212),
    81.0: (-0.3521, 8.782, 0.08252),
    82.0: (-0.3521, 8.950, 0.08297),
    83.0: (-0.3521, 9.117, 0.08347),
    84.0: (-0.3521, 9.283, 0.08402),
    85.0: (-0.3521, 9.446, 0.08461),
    86.0: (-0.3521, 9.606, 0.08523),
    87.0: (-0.3521, 9.763, 0.08588),
    88.0: (-0.3521, 9.917, 0.08655),
    89.0: (-0.3521, 10.068, 0.08724),
    90.0: (-0.3521, 10.218, 0.08793),
    91.0: (-0.3521, 10.367, 0.08863),
    92.0: (-0.3521, 10.516, 0.08933),
    93.0: (-0.3521, 10.666, 0.09003),
    94.0: (-0.3521, 10.817, 0.09073),
    95.0: (-0.3521, 10.969, 0.09142),
    96.0: (-0.3521, 11.123, 0.09210),
    97.0: (-0.3521, 11.278, 0.09277),
    98.0: (-0.3521, 11.435, 0.09343),
    99.0: (-0.3521, 11.594, 0.09407),
    100.0: (-0.3521, 11.754, 0.09470),
    101.0: (-0.3521, 11.917, 0.09531),
    102.0: (-0.3521, 12.082, 0.09590),
    103.0: (-0.3521, 12.250, 0.09647),
    104.0: (-0.3521, 12.420, 0.09702),
    105.0: (-0.3521, 12.594, 0.09755),
    106.0: (-0.3521, 12.771, 0.09806),
    107.0: (-0.3521, 12.952, 0.09855),
    108.0: (-0.3521, 13.137, 0.09902),
    109.0: (-0.3521, 13.327, 0.09948),
    110.0: (-0.3521, 13.521, 0.09992),
    111.0: (-0.3521, 13.721, 0.10036),
    112.0: (-0.3521, 13.926, 0.10079),
    113.0: (-0.3521, 14.137, 0.10122),
    114.0: (-0.3521, 14.354, 0.10166),
    115.0: (-0.3521, 14.578, 0.10211),
    116.0: (-0.3521, 14.808, 0.10259),
    117.0: (-0.3521, 15.046, 0.10308),
    118.0: (-0.3521, 15.290, 0.10360),
    119.0: (-0.3521, 15.542, 0.10415),
    120.0: (-0.3521, 15.801, 0.10473),
}

_WFH_LMS_GIRLS = {
    # height_cm: (L, M, S)
    45.0: (-0.3833, 2.461, 0.09029),
    45.5: (-0.3833, 2.544, 0.09005),
    46.0: (-0.3833, 2.630, 0.08980),
    46.5: (-0.3833, 2.718, 0.08955),
    47.0: (-0.3833, 2.808, 0.08930),
    47.5: (-0.3833, 2.901, 0.08905),
    48.0: (-0.3833, 2.996, 0.08879),
    48.5: (-0.3833, 3.093, 0.08853),
    49.0: (-0.3833, 3.192, 0.08826),
    49.5: (-0.3833, 3.294, 0.08800),
    50.0: (-0.3833, 3.399, 0.08773),
    50.5: (-0.3833, 3.506, 0.08747),
    51.0: (-0.3833, 3.614, 0.08720),
    52.0: (-0.3833, 3.834, 0.08667),
    53.0: (-0.3833, 4.057, 0.08614),
    54.0: (-0.3833, 4.279, 0.08563),
    55.0: (-0.3833, 4.498, 0.08514),
    56.0: (-0.3833, 4.712, 0.08468),
    57.0: (-0.3833, 4.918, 0.08425),
    58.0: (-0.3833, 5.115, 0.08386),
    59.0: (-0.3833, 5.303, 0.08350),
    60.0: (-0.3833, 5.483, 0.08318),
    61.0: (-0.3833, 5.655, 0.08290),
    62.0: (-0.3833, 5.822, 0.08265),
    63.0: (-0.3833, 5.983, 0.08243),
    64.0: (-0.3833, 6.141, 0.08225),
    65.0: (-0.3833, 6.296, 0.08210),
    66.0: (-0.3833, 6.449, 0.08199),
    67.0: (-0.3833, 6.601, 0.08191),
    68.0: (-0.3833, 6.753, 0.08187),
    69.0: (-0.3833, 6.905, 0.08187),
    70.0: (-0.3833, 7.058, 0.08191),
    71.0: (-0.3833, 7.214, 0.08200),
    72.0: (-0.3833, 7.373, 0.08213),
    73.0: (-0.3833, 7.535, 0.08231),
    74.0: (-0.3833, 7.702, 0.08254),
    75.0: (-0.3833, 7.874, 0.08282),
    76.0: (-0.3833, 8.051, 0.08316),
    77.0: (-0.3833, 8.233, 0.08356),
    78.0: (-0.3833, 8.419, 0.08402),
    79.0: (-0.3833, 8.610, 0.08455),
    80.0: (-0.3833, 8.805, 0.08514),
    81.0: (-0.3833, 9.001, 0.08579),
    82.0: (-0.3833, 9.197, 0.08650),
    83.0: (-0.3833, 9.393, 0.08725),
    84.0: (-0.3833, 9.587, 0.08803),
    85.0: (-0.3833, 9.779, 0.08884),
    86.0: (-0.3833, 9.969, 0.08966),
    87.0: (-0.3833, 10.155, 0.09049),
    88.0: (-0.3833, 10.339, 0.09131),
    89.0: (-0.3833, 10.520, 0.09212),
    90.0: (-0.3833, 10.698, 0.09292),
    91.0: (-0.3833, 10.873, 0.09369),
    92.0: (-0.3833, 11.045, 0.09444),
    93.0: (-0.3833, 11.215, 0.09516),
    94.0: (-0.3833, 11.385, 0.09587),
    95.0: (-0.3833, 11.554, 0.09655),
    96.0: (-0.3833, 11.723, 0.09721),
    97.0: (-0.3833, 11.892, 0.09785),
    98.0: (-0.3833, 12.062, 0.09848),
    99.0: (-0.3833, 12.233, 0.09908),
    100.0: (-0.3833, 12.405, 0.09967),
    101.0: (-0.3833, 12.579, 0.10024),
    102.0: (-0.3833, 12.756, 0.10080),
    103.0: (-0.3833, 12.935, 0.10134),
    104.0: (-0.3833, 13.117, 0.10187),
    105.0: (-0.3833, 13.303, 0.10239),
    106.0: (-0.3833, 13.492, 0.10290),
    107.0: (-0.3833, 13.685, 0.10341),
    108.0: (-0.3833, 13.882, 0.10392),
    109.0: (-0.3833, 14.083, 0.10443),
    110.0: (-0.3833, 14.289, 0.10494),
    111.0: (-0.3833, 14.499, 0.10546),
    112.0: (-0.3833, 14.714, 0.10600),
    113.0: (-0.3833, 14.935, 0.10655),
    114.0: (-0.3833, 15.162, 0.10712),
    115.0: (-0.3833, 15.396, 0.10773),
    116.0: (-0.3833, 15.637, 0.10837),
    117.0: (-0.3833, 15.885, 0.10905),
    118.0: (-0.3833, 16.141, 0.10977),
    119.0: (-0.3833, 16.406, 0.11055),
    120.0: (-0.3833, 16.679, 0.11138),
}


def _interpolate_lms(table: dict, height_cm: float) -> tuple:
    """
    Linear interpolation between the two nearest height entries.
    Returns (L, M, S) tuple.
    """
    keys = sorted(table.keys())
    # Clamp to table range
    if height_cm <= keys[0]:
        return table[keys[0]]
    if height_cm >= keys[-1]:
        return table[keys[-1]]

    # Find bracketing heights
    for i in range(len(keys) - 1):
        lo, hi = keys[i], keys[i + 1]
        if lo <= height_cm <= hi:
            frac = (height_cm - lo) / (hi - lo) if hi != lo else 0
            l_lo, m_lo, s_lo = table[lo]
            l_hi, m_hi, s_hi = table[hi]
            L = l_lo + frac * (l_hi - l_lo)
            M = m_lo + frac * (m_hi - m_lo)
            S = s_lo + frac * (s_hi - s_lo)
            return (L, M, S)

    return table[keys[-1]]


def calculate_weight_for_height_zscore(
    weight_kg: Optional[float],
    height_cm: Optional[float],
    gender: Optional[str],
) -> Optional[float]:
    """
    Calculate WHO Weight-for-Height Z-score using the LMS method.

    Formula: Z = (((weight / M) ^ L) - 1) / (L * S)
    Special case when L ≈ 0: Z = ln(weight / M) / S

    Args:
        weight_kg: Child's weight in kilograms
        height_cm: Child's height/length in centimeters
        gender: 'M' for male, 'F' for female (also accepts 'male'/'female')

    Returns:
        Z-score as float rounded to 2 decimal places, or None if
        calculation is not possible (missing/invalid inputs).
    """
    # ── Input validation ──────────────────────────────────────
    if weight_kg is None or height_cm is None or gender is None:
        return None

    try:
        weight = float(weight_kg)
        height = float(height_cm)
    except (TypeError, ValueError):
        logger.warning(f"Cannot convert weight={weight_kg!r} / height={height_cm!r} to float")
        return None

    if weight <= 0 or height <= 0:
        logger.warning(f"Non-positive inputs: weight={weight}, height={height}")
        return None

    # Resolve gender
    g = str(gender).strip().upper()
    if g in ('M', 'MALE', 'BOY'):
        table = _WFH_LMS_BOYS
    elif g in ('F', 'FEMALE', 'GIRL'):
        table = _WFH_LMS_GIRLS
    else:
        logger.warning(f"Unknown gender '{gender}' — cannot determine LMS table")
        return None

    # Height range check (WHO tables cover 45-120 cm)
    if height < 45.0 or height > 120.0:
        logger.info(
            f"Height {height}cm is outside WHO WFH range (45-120cm). "
            f"Clamping to nearest boundary for approximate Z-score."
        )

    # ── LMS lookup with interpolation ─────────────────────────
    try:
        L, M, S = _interpolate_lms(table, height)
    except Exception as e:
        logger.error(f"LMS interpolation failed for height={height}: {e}")
        return None

    # ── Z-Score calculation ────────────────────────────────────
    try:
        if M <= 0 or S <= 0:
            logger.error(f"Invalid LMS values: L={L}, M={M}, S={S}")
            return None

        # WHO Box-Cox formula
        if abs(L) < 1e-10:
            # L ≈ 0: use logarithmic form
            z = math.log(weight / M) / S
        else:
            z = (((weight / M) ** L) - 1) / (L * S)

        # Sanity check: Z-scores beyond ±6 are implausible
        if math.isnan(z) or math.isinf(z):
            logger.warning(f"Z-score is NaN/Inf: weight={weight}, height={height}")
            return None

        return round(z, 2)

    except (ZeroDivisionError, ValueError, OverflowError) as e:
        logger.error(f"Z-score calculation error: {e}")
        return None


def get_whz_classification(whz: Optional[float]) -> str:
    """
    Classify a Weight-for-Height Z-score per WHO standards.

    Returns one of: 'SEVERE', 'MODERATE', 'NORMAL', or 'UNKNOWN'.
    """
    if whz is None:
        return "UNKNOWN"
    if whz < -3:
        return "SEVERE"
    elif whz < -2:
        return "MODERATE"
    else:
        return "NORMAL"
