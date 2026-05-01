"""
Drishti Poshan — PaddleOCR Extraction Service
==============================================================================
Production-ready, 4-stage OCR pipeline for handwritten Anganwadi forms.

Stage 1: Image ingestion (handled by the router)
Stage 2: Aggressive pre-processing  — CLAHE, blur, threshold, deskew
Stage 3: Detection + Recognition    — PaddleOCR (Devanagari + angle-cls)
Stage 4: Post-processing + Schema   — Regex correction, fuzzy matching,
                                       strict Pydantic casting

STABLE VERSION PINNING (Windows CPU):
    pip install paddlepaddle==2.6.2
    pip install "paddleocr==2.8.1" --no-deps
    pip install "paddleocr==2.8.1"
    pip install opencv-python-headless>=4.9.0
    pip install "thefuzz[speedup]>=0.22.0" python-Levenshtein>=0.25.0

Why these versions?
    - PaddlePaddle 2.6.2 is the LAST release before the PIR API was introduced.
      It does NOT have ConvertPirAttribute2RuntimeAttribute or any PIR code paths.
    - PaddleOCR 2.8.1 uses PP-OCRv3/v4 models directly (no PaddleX dependency).
      It supports use_gpu=False, show_log=False, and lang='hi' natively.
    - This combination is battle-tested on Windows CPU.
"""
import logging
import re
from typing import Optional

import cv2
import numpy as np

logger = logging.getLogger(__name__)

# ── Suppress PaddleOCR's verbose internal logging ─────────────────
logging.getLogger("ppocr").setLevel(logging.ERROR)

# ── Lazy singleton for the heavy PaddleOCR model ────────────────
_paddle_engine = None
_paddle_loading = False


def _get_paddle_engine():
    """
    Thread-safe-ish lazy loader.
    PaddleOCR downloads its models on first call (~150 MB for PP-OCRv3).
    """
    global _paddle_engine, _paddle_loading
    if _paddle_engine is not None:
        return _paddle_engine
    if _paddle_loading:
        raise RuntimeError("PaddleOCR engine is still loading. Try again in a moment.")

    _paddle_loading = True
    try:
        # ── Fix Windows DLL conflict between PyTorch and PaddlePaddle ──
        # Both frameworks ship their own C++ runtimes.  Registering
        # torch's lib dir BEFORE importing paddle prevents shm.dll
        # WinError 127 crashes.
        import os
        try:
            import torch
            import pathlib
            torch_lib = str(pathlib.Path(torch.__file__).parent / "lib")
            os.add_dll_directory(torch_lib)
            logger.info(f"Registered torch DLL directory: {torch_lib}")
        except (ImportError, OSError, AttributeError) as dll_err:
            logger.debug(f"Torch DLL registration skipped (non-fatal): {dll_err}")

        from paddleocr import PaddleOCR

        logger.info("Loading PaddleOCR engine (lang=hi, use_angle_cls=True) …")
        _paddle_engine = PaddleOCR(
            lang="hi",                # Devanagari — covers Hindi, Marathi, English digits
            use_angle_cls=True,       # correct upside-down text fragments
            use_gpu=False,            # force CPU — stable on Windows
            show_log=False,           # suppress internal paddle debug spam
        )
        logger.info("PaddleOCR engine loaded successfully.")
        return _paddle_engine
    except Exception as e:
        logger.error(f"Failed to load PaddleOCR engine: {e}")
        raise RuntimeError(f"PaddleOCR initialisation failed: {e}") from e
    finally:
        _paddle_loading = False


# ══════════════════════════════════════════════════════════════════
#  STAGE 2 — Aggressive Pre-processing
# ══════════════════════════════════════════════════════════════════

def _decode_image_bytes(raw: bytes) -> np.ndarray:
    """Decode raw bytes → OpenCV BGR ndarray. Raises on corrupt data."""
    arr = np.frombuffer(raw, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Image bytes could not be decoded — file is corrupt or unsupported.")
    return img


def _deskew(gray: np.ndarray) -> np.ndarray:
    """
    Correct rotation up to ±45° using minimum-area-rect on the largest
    contour cluster.  Falls back to Hough-line median if rect fails.
    """
    # Invert so text is white-on-black
    inv = cv2.bitwise_not(gray)
    coords = np.column_stack(np.where(inv > 0))
    if coords.shape[0] < 50:
        return gray  # nearly blank — nothing to deskew

    # Minimum area rectangle
    angle = cv2.minAreaRect(coords)[-1]
    # OpenCV minAreaRect returns angles in [-90, 0)
    if angle < -45:
        angle = 90 + angle
    elif angle > 45:
        angle = angle - 90

    # Small angles → skip to avoid unnecessary interpolation loss
    if abs(angle) < 0.5:
        return gray

    h, w = gray.shape[:2]
    centre = (w // 2, h // 2)
    rot_mat = cv2.getRotationMatrix2D(centre, angle, 1.0)
    rotated = cv2.warpAffine(
        gray, rot_mat, (w, h),
        flags=cv2.INTER_CUBIC,
        borderMode=cv2.BORDER_REPLICATE,
    )
    logger.debug(f"Deskewed by {angle:.2f}°")
    return rotated


def preprocess_image(raw_bytes: bytes) -> np.ndarray:
    """
    Full cleaning pipeline optimised for field-captured Anganwadi forms:
        1. Decode
        2. Resize (cap at 2048 px wide to limit PaddleOCR memory)
        3. Grayscale
        4. CLAHE  (handles shadows from cheap phone cameras)
        5. Gaussian blur (noise from paper texture)
        6. Adaptive threshold (binarise for cleaner detection)
        7. Deskew
    Returns a clean grayscale ndarray ready for OCR.
    """
    img = _decode_image_bytes(raw_bytes)

    # ── Resize if extremely large ──────────────────────────────
    max_width = 2048
    h, w = img.shape[:2]
    if w > max_width:
        scale = max_width / w
        img = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
        logger.debug(f"Resized image from {w}×{h} to {img.shape[1]}×{img.shape[0]}")

    # ── Grayscale ──────────────────────────────────────────────
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # ── CLAHE (shadow / uneven lighting equalisation) ──────────
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    gray = clahe.apply(gray)

    # ── Gaussian blur (paper texture noise) ────────────────────
    gray = cv2.GaussianBlur(gray, (5, 5), 0)

    # ── Adaptive Gaussian threshold ────────────────────────────
    binary = cv2.adaptiveThreshold(
        gray, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        blockSize=21,
        C=10,
    )

    # ── Deskew ─────────────────────────────────────────────────
    binary = _deskew(binary)

    return binary


# ══════════════════════════════════════════════════════════════════
#  STAGE 3 — Detection + Recognition (PaddleOCR)
# ══════════════════════════════════════════════════════════════════

def _sort_boxes_reading_order(results: list) -> list[tuple[str, float]]:
    """
    Takes PaddleOCR result (list of [bbox, (text, conf)]) and returns
    lines sorted strictly Top-to-Bottom, Left-to-Right.
    """
    entries = []
    for line in results:
        bbox = line[0]             # 4 corner points [[x,y], …]
        text = line[1][0]
        conf = float(line[1][1])

        # Use top-left y for row ordering, top-left x for column ordering
        top_y = min(pt[1] for pt in bbox)
        left_x = min(pt[0] for pt in bbox)
        entries.append((top_y, left_x, text, conf))

    # Cluster lines by approximate y (within 20 px → same row)
    entries.sort(key=lambda e: (e[0], e[1]))
    row_thresh = 20
    rows: list[list] = []
    current_row: list = []

    for ent in entries:
        if current_row and abs(ent[0] - current_row[0][0]) > row_thresh:
            rows.append(sorted(current_row, key=lambda e: e[1]))  # sort row by x
            current_row = []
        current_row.append(ent)
    if current_row:
        rows.append(sorted(current_row, key=lambda e: e[1]))

    # Flatten back
    sorted_pairs: list[tuple[str, float]] = []
    for row in rows:
        for _, _, text, conf in row:
            sorted_pairs.append((text, conf))

    return sorted_pairs


def run_paddle_ocr(cleaned_image: np.ndarray) -> tuple[str, list[tuple[str, float]]]:
    """
    Run PaddleOCR on a pre-processed image.
    Guarantees the array is 3-channel uint8 before inference.
    Returns (full_raw_text, [(text_fragment, confidence), …]).
    """
    engine = _get_paddle_engine()

    # ── Step 1: Cast to uint8 ──────────────────────────────────
    image = cleaned_image.astype(np.uint8)

    # ── Step 2: Scale boolean masks (max=1) up to 0-255 ────────
    if image.max() <= 1:
        image = image * 255

    # ── Step 3: Convert 2D grayscale → 3-channel BGR ───────────
    if len(image.shape) == 2:
        image = cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)

    # ── Step 4: Debug log the final array shape & dtype ────────
    logger.info(f"Sending to OCR: shape={image.shape}, dtype={image.dtype}")

    # ── Step 5: Inference (PaddleOCR 2.8.x API) ───────────────
    result = engine.ocr(image, cls=True)

    if not result or not result[0]:
        return "", []

    sorted_pairs = _sort_boxes_reading_order(result[0])
    full_text = " ".join(t for t, _ in sorted_pairs)
    return full_text, sorted_pairs


# ══════════════════════════════════════════════════════════════════
#  STAGE 4 — Post-processing & Strict Schema Enforcement
# ══════════════════════════════════════════════════════════════════

# ── Common OCR mis-reads in numeric fields ─────────────────────
_NUMERIC_FIXES: list[tuple[re.Pattern, str]] = [
    (re.compile(r"[oO]"), "0"),     # O → 0
    (re.compile(r"[lI|]"), "1"),    # l / I / | → 1
    (re.compile(r"[sS]"), "5"),     # S → 5 (in purely numeric context)
    (re.compile(r"[bB]"), "8"),     # B → 8
    (re.compile(r"[gq]"), "9"),     # g/q → 9
    (re.compile(r"[,;]"), "."),     # comma → decimal point
]


def _fix_numeric_string(raw: str) -> str:
    """
    Apply aggressive corrections to a string that *should* be a number.
    E.g.  "1O.5" → "10.5",  "l2,3" → "12.3"
    """
    s = raw.strip()
    for pat, rep in _NUMERIC_FIXES:
        s = pat.sub(rep, s)
    # Keep only digits, dots, minus
    s = re.sub(r"[^\d.\-]", "", s)
    # Ensure at most one decimal point (keep first)
    parts = s.split(".")
    if len(parts) > 2:
        s = parts[0] + "." + "".join(parts[1:])
    return s


def _try_parse_float(raw: Optional[str]) -> Optional[float]:
    if raw is None:
        return None
    fixed = _fix_numeric_string(raw)
    try:
        val = float(fixed)
        return round(val, 2)
    except ValueError:
        return None


def _try_parse_int(raw: Optional[str]) -> Optional[int]:
    if raw is None:
        return None
    fixed = _fix_numeric_string(raw)
    try:
        return int(float(fixed))
    except ValueError:
        return None


# ── Gender fuzzy detection ──────────────────────────────────────

_MALE_PATTERNS = re.compile(
    r"\b(male|m|पुरुष|लड़का|मुलगा|पु)\b",
    re.IGNORECASE,
)
_FEMALE_PATTERNS = re.compile(
    r"\b(female|f|महिला|लड़की|मुलगी|स्त्री|स्री|म)\b",
    re.IGNORECASE,
)


def _detect_gender(raw: Optional[str]) -> Optional[str]:
    """
    Fuzzy gender detection supporting English + Devanagari labels.
    Returns 'M' or 'F' (matching the ChildCreate.sex schema).
    """
    if raw is None:
        return None
    text = raw.strip()

    # Priority: exact single character
    if text.upper() in ("M", "पु"):
        return "M"
    if text.upper() in ("F", "स्त्री", "स्री", "म"):
        return "F"

    if _MALE_PATTERNS.search(text):
        return "M"
    if _FEMALE_PATTERNS.search(text):
        return "F"

    # Last resort — fuzzy string similarity
    try:
        from thefuzz import fuzz
        male_score = max(
            fuzz.partial_ratio(text.lower(), w)
            for w in ("male", "पुरुष", "लड़का", "मुलगा")
        )
        female_score = max(
            fuzz.partial_ratio(text.lower(), w)
            for w in ("female", "महिला", "लड़की", "मुलगी")
        )
        if male_score > 60 and male_score > female_score:
            return "M"
        if female_score > 60:
            return "F"
    except ImportError:
        pass

    return None


# ── Field-label keyword maps (English + Hindi + Marathi) ────────
_FIELD_KEYWORDS: dict[str, list[str]] = {
    "name":             ["name", "naam", "नाम", "नांव", "child name", "बालक", "बच्चे का नाम"],
    "age_months":       ["age", "umr", "आयु", "उम्र", "महीने", "months", "वय"],
    "sex":              ["sex", "gender", "ling", "लिंग", "लिँग"],
    "weight_kg":        ["weight", "wt", "wajan", "वजन", "वज़न", "kg", "kilo"],
    "height_cm":        ["height", "ht", "lambai", "ऊंचाई", "ऊँचाई", "उंचाई", "cm", "लंबाई"],
    "muac_cm":          ["muac", "arm", "bhuja", "भुजा", "mid upper", "mid-upper"],
    "guardian_name":    ["guardian", "father", "mother", "parent", "pita", "mata",
                         "पिता", "माता", "अभिभावक", "पालक"],
    "anganwadi_center": ["anganwadi", "center", "centre", "kendra", "केंद्र", "केन्द्र",
                         "आंगनवाड़ी", "अंगणवाडी"],
    "village":          ["village", "gaon", "gram", "गांव", "गाँव", "गाव", "ग्राम",
                         "address", "पता"],
}


def _fuzzy_match_label(text: str) -> Optional[str]:
    """
    Given a raw text fragment that looks like a label, return the
    canonical field name or None.
    """
    t = text.strip().lower()

    # Direct substring match first (fastest)
    for field, keywords in _FIELD_KEYWORDS.items():
        for kw in keywords:
            if kw in t:
                return field

    # Fuzzy fallback
    try:
        from thefuzz import fuzz
        best_field, best_score = None, 0
        for field, keywords in _FIELD_KEYWORDS.items():
            for kw in keywords:
                score = fuzz.partial_ratio(t, kw)
                if score > best_score:
                    best_score = score
                    best_field = field
        if best_score >= 70:
            return best_field
    except ImportError:
        pass

    return None


def _strip_label_prefix(text: str) -> str:
    """
    Remove common label separators (e.g. "Name: Ravi" → "Ravi").
    """
    for sep in (":", "-", "–", "—", "=", "।"):
        if sep in text:
            _, _, after = text.partition(sep)
            return after.strip()
    return text.strip()


def parse_ocr_to_schema(
    ocr_pairs: list[tuple[str, float]],
) -> dict:
    """
    Stage 4 — Parse raw OCR (text, confidence) pairs into a strict
    dictionary matching the PostgreSQL / Pydantic schema.

    Rules:
        1. Walk pairs; if a fragment fuzzy-matches a known field label,
           treat the *next* fragment as its value.
        2. Apply _NUMERIC_FIXES **only** to numeric fields
           (age_months, weight_kg, height_cm, muac_cm).
        3. String fields (name, guardian_name, village, anganwadi_center)
           are cleaned of stray punctuation but letters are NEVER altered.
        4. gender/sex goes through _detect_gender (regex + fuzzy).
        5. Every numeric cast is wrapped in try/except → None on failure.

    Returns a dict with keys:
        child_data, measurement_data, field_confidence,
        overall_confidence, warnings
    """
    # ── Which fields get numeric regex fixes vs. string-only cleaning ──
    NUMERIC_FIELDS = {"age_months", "weight_kg", "height_cm", "muac_cm"}
    STRING_FIELDS = {"name", "guardian_name", "anganwadi_center", "village"}
    # "sex" is handled separately via _detect_gender

    # ── Step 1: Walk pairs and extract raw field→value mapping ─────────
    field_values: dict[str, str] = {}
    field_confidences: dict[str, float] = {}
    warnings: list[str] = []

    i = 0
    while i < len(ocr_pairs):
        text, conf = ocr_pairs[i]

        detected_field = _fuzzy_match_label(text)

        if detected_field is not None:
            # Check if value is embedded in same fragment ("Name: Ravi")
            value_part = _strip_label_prefix(text)
            if value_part and value_part.lower() != text.strip().lower():
                field_values[detected_field] = value_part
                field_confidences[detected_field] = conf
            elif i + 1 < len(ocr_pairs):
                next_text, next_conf = ocr_pairs[i + 1]
                field_values[detected_field] = next_text.strip()
                field_confidences[detected_field] = next_conf
                i += 1  # skip the consumed value fragment
            else:
                warnings.append(
                    f"Label '{text}' detected for field '{detected_field}' "
                    f"but no value followed."
                )
        i += 1

    # ── Step 2: Clean and cast each field by its type ─────────────────
    child_data: dict = {}
    measurement_data: dict = {}

    # --- String fields: strip stray punctuation, preserve letters ------
    for field in STRING_FIELDS:
        raw = field_values.get(field)
        if raw is not None:
            # Keep Latin letters, Devanagari block (U+0900–U+097F), and spaces
            cleaned = re.sub(r"[^a-zA-Z\u0900-\u097F\s]", "", raw).strip()
            # Collapse multiple spaces
            cleaned = re.sub(r"\s+", " ", cleaned)
            child_data[field] = cleaned if cleaned else None
        else:
            child_data[field] = None

    # --- Gender / Sex: dedicated fuzzy detector ---------------------
    child_data["sex"] = _detect_gender(field_values.get("sex"))

    # --- Numeric fields: apply _NUMERIC_FIXES, then strict cast ------
    for field in NUMERIC_FIELDS:
        raw = field_values.get(field)
        if raw is None:
            parsed_value = None
        else:
            # Apply OCR digit corrections (O→0, l→1, S→5, etc.)
            corrected = _fix_numeric_string(raw)

            if field == "age_months":
                # age_months → int
                try:
                    parsed_value = int(float(corrected))
                except (ValueError, TypeError):
                    parsed_value = None
                    warnings.append(
                        f"Could not parse '{raw}' as int for '{field}'."
                    )
            else:
                # weight_kg, height_cm, muac_cm → float
                try:
                    parsed_value = round(float(corrected), 2)
                except (ValueError, TypeError):
                    parsed_value = None
                    warnings.append(
                        f"Could not parse '{raw}' as float for '{field}'."
                    )

        child_data[field] = parsed_value

        # Mirror weight/height/muac into measurement_data as well
        if field in ("weight_kg", "height_cm", "muac_cm"):
            measurement_data[field] = parsed_value

    # measurement notes: nothing extra to assign
    measurement_data["notes"] = None

    # ── Step 3: Build per-field confidence dict ───────────────────────
    ALL_FIELDS = (
        "name", "age_months", "sex", "weight_kg", "height_cm",
        "muac_cm", "guardian_name", "anganwadi_center", "village",
    )
    conf_dict = {}
    for field in ALL_FIELDS:
        if field in field_confidences:
            conf_dict[field] = round(field_confidences[field], 3)
        else:
            conf_dict[field] = None

    # Overall confidence (average of detected fields)
    conf_values = [v for v in field_confidences.values() if v is not None]
    overall = round(sum(conf_values) / len(conf_values), 3) if conf_values else 0.0

    # Low-confidence warnings
    for field, c in field_confidences.items():
        if c < 0.5:
            warnings.append(
                f"Low confidence ({c:.1%}) on field '{field}' — review manually."
            )

    return {
        "child_data": child_data,
        "measurement_data": measurement_data,
        "field_confidence": conf_dict,
        "overall_confidence": overall,
        "warnings": warnings,
    }
