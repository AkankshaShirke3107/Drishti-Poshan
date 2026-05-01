"""
Drishti Poshan - Whisper Voice Transcription Service
Uses OpenAI Whisper (local) for offline speech-to-text.
Implements Lazy Loading and specific error handling for FFmpeg missing errors.
"""
import logging
import tempfile
from pathlib import Path
from typing import Optional
from app.config import WHISPER_MODEL

logger = logging.getLogger(__name__)


class WhisperService:
    """Singleton wrapper for the Whisper ASR model."""

    def __init__(self):
        self.model = None
        self.device = None
        self._is_loading = False

    def _lazy_load(self):
        """Lazy load the Whisper model into RAM first time it's needed."""
        if self.model is not None or self._is_loading:
            return
            
        self._is_loading = True
        try:
            import torch
            import whisper

            self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
            logger.info(f"Lazy loading Whisper-{WHISPER_MODEL} on {self.device}...")
            self.model = whisper.load_model(WHISPER_MODEL, device=self.device)
            logger.info("Whisper model loaded successfully.")
        except Exception as e:
            logger.error(f"Failed to load Whisper model: {e}")
            raise RuntimeError(f"Error loading whisper model: {str(e)}") from e
        finally:
            self._is_loading = False

    async def transcribe(
        self,
        audio_bytes: bytes,
        filename: str = "audio.webm",
        language: Optional[str] = None,
    ) -> dict:
        """
        Transcribe audio bytes to text.
        """
        if self.model is None:
            self._lazy_load()

        suffix = Path(filename).suffix or ".webm"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        try:
            options = {}
            if language:
                options["language"] = language

            result = self.model.transcribe(tmp_path, **options)

            segments = result.get("segments", [])
            avg_confidence = 0.0
            if segments:
                avg_confidence = sum(s.get("avg_logprob", -1.0) for s in segments) / len(segments)
                import math
                avg_confidence = max(0.0, min(1.0, math.exp(avg_confidence)))

            return {
                "text": result.get("text", "").strip(),
                "language": result.get("language", "unknown"),
                "segments": [{"start": s["start"], "end": s["end"], "text": s["text"]} for s in segments],
                "confidence": round(avg_confidence, 3),
            }
            
        except FileNotFoundError as e:
            logger.error(f"FFmpeg not found during transcription: {e}")
            raise FileNotFoundError("FFmpeg is missing. Please ensure FFmpeg is installed and added to Windows PATH.") from e
        except RuntimeError as e:
            logger.error(f"Runtime error during Whisper inference: {e}")
            raise RuntimeError(f"Transcription failed due to an engine error: {str(e)}") from e
        finally:
            try:
                Path(tmp_path).unlink()
            except OSError:
                pass
