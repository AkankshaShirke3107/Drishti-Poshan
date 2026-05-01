"""
Drishti Poshan - TrOCR Handwriting Recognition Service
Uses Microsoft TrOCR-base-handwritten for offline OCR.
Implements Lazy Loading to prevent slow startups.
"""
import logging
import tempfile
from pathlib import Path
from app.config import TROCR_MODEL

logger = logging.getLogger(__name__)


class TrOCRService:
    """Singleton wrapper for the TrOCR handwriting model."""

    def __init__(self):
        self.processor = None
        self.model = None
        self.device = None
        self._is_loading = False

    def _lazy_load(self):
        """Lazy load TrOCR model + processor into RAM (called once at startup)."""
        if self.model is not None or self.processor is not None or self._is_loading:
            return

        self._is_loading = True
        try:
            import torch
            from transformers import TrOCRProcessor, VisionEncoderDecoderModel

            self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
            logger.info(f"Lazy Loading TrOCR ({TROCR_MODEL}) on {self.device}...")

            self.processor = TrOCRProcessor.from_pretrained(TROCR_MODEL)
            self.model = VisionEncoderDecoderModel.from_pretrained(TROCR_MODEL)
            self.model.to(self.device)
            self.model.eval()

            logger.info("TrOCR model loaded successfully.")
        except Exception as e:
            logger.error(f"Failed to load TrOCR model: {e}")
            raise RuntimeError(f"Error loading TrOCR model: {str(e)}") from e
        finally:
            self._is_loading = False

    async def extract_text(self, image_bytes: bytes, filename: str = "image.png") -> dict:
        """
        Extract handwritten text from an image.
        """
        if self.model is None or self.processor is None:
            self._lazy_load()

        import torch
        from PIL import Image
        import io

        # Load and preprocess image
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")

        # Split image into line-sized horizontal strips for better accuracy
        lines = self._segment_lines(image)

        extracted_texts = []
        total_confidence = 0.0

        for line_img in lines:
            pixel_values = self.processor(
                images=line_img, return_tensors="pt"
            ).pixel_values.to(self.device)

            with torch.no_grad():
                outputs = self.model.generate(
                    pixel_values,
                    max_new_tokens=128,
                    output_scores=True,
                    return_dict_in_generate=True,
                )

            text = self.processor.batch_decode(
                outputs.sequences, skip_special_tokens=True
            )[0].strip()

            # Estimate confidence from generation scores
            if outputs.scores:
                import torch.nn.functional as F
                scores = torch.stack(outputs.scores, dim=1)
                probs = F.softmax(scores, dim=-1)
                max_probs = probs.max(dim=-1).values
                confidence = max_probs.mean().item()
            else:
                confidence = 0.5

            if text:
                extracted_texts.append(text)
                total_confidence += confidence

        full_text = " ".join(extracted_texts)
        avg_confidence = total_confidence / max(len(extracted_texts), 1)

        return {
            "text": full_text,
            "confidence": round(avg_confidence, 3),
            "line_count": len(extracted_texts),
        }

    def _segment_lines(self, image, max_lines: int = 10):
        """
        Simple line segmentation: split image into horizontal strips.
        For production, use contour-based segmentation.
        """
        width, height = image.size

        # If image is small enough, treat as single line
        if height < 80:
            return [image]

        # Estimate line height (~40-60px per handwritten line)
        estimated_line_height = max(50, height // max_lines)
        lines = []

        y = 0
        while y < height:
            y_end = min(y + estimated_line_height, height)
            line_crop = image.crop((0, y, width, y_end))
            lines.append(line_crop)
            y = y_end

        return lines[:max_lines]
