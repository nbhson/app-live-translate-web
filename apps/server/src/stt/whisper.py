"""Whisper self-host streaming STT provider (faster-whisper).

Free forever, WER ~10% (close to Deepgram 9%), supports 90+ langs, auto-detect.
Streaming is emulated via VAD + chunking (1-3s windows) as faster-whisper is not real streaming.
Falls back to error if faster-whisper not installed - install via pip install faster-whisper.
"""

import asyncio
import logging
import os
import time
from collections import deque

import numpy as np

logger = logging.getLogger("lt-server")

# lazy model cache
_model = None
_model_lang = None

def _get_model():
    global _model, _model_lang
    if _model is not None:
        return _model
    try:
        from faster_whisper import WhisperModel
    except ImportError as e:
        raise RuntimeError(
            "faster-whisper not installed. Run: pip install faster-whisper ctranslate2  (requires ~2GB model download on first run)"
        ) from e
    # large-v3-turbo is best speed/accuracy tradeoff; fallback to base if low RAM
    model_name = os.environ.get("WHISPER_MODEL", "large-v3-turbo")
    device = os.environ.get("WHISPER_DEVICE", "cpu")
    compute = os.environ.get("WHISPER_COMPUTE", "int8" if device == "cpu" else "float16")
    logger.info(f"[whisper] loading model {model_name} device={device} compute={compute}")
    _model = WhisperModel(model_name, device=device, compute_type=compute)
    return _model


class WhisperStream:
    """Buffered Whisper STT. Implements same interface as DeepgramStream for Session."""

    def __init__(self, language: str = "en", auto_detect: bool = False):
        self.language = language
        self.auto_detect = auto_detect
        self.on_interim = None
        self.on_final = None
        self._buf = bytearray()
        self._last_emit = time.monotonic()
        self._running = False
        # 16k mono int16: 1 sec = 32000 bytes
        self._chunk_ms = int(os.environ.get("WHISPER_CHUNK_MS", "850"))
        self._vad_thresh = float(os.environ.get("WHISPER_VAD_THRESH", "0.015"))
        self._lock = asyncio.Lock()
        self._last_interim = 0.0

    async def connect(self):
        # warm up model in thread
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, _get_model)
        self._running = True
        logger.info(f"[whisper] ready lang={self.language} auto={self.auto_detect} chunk={self._chunk_ms}ms (low-latency)")
        # start periodic flush task
        self._flush_task = asyncio.create_task(self._periodic_flush())

    async def _periodic_flush(self):
        while self._running:
            await asyncio.sleep(self._chunk_ms / 1000 * 0.7)
            # if buffer has enough and silence, flush
            if len(self._buf) > 16000 * 2 * 0.6:  # >0.6s
                await self._try_transcribe(force=False)

    def _is_speech(self, pcm: bytes) -> bool:
        if not pcm:
            return False
        arr = np.frombuffer(pcm[-32000:], dtype=np.int16).astype(np.float32) / 32768.0
        if arr.size == 0:
            return False
        rms = float(np.sqrt(np.mean(arr * arr)))
        return rms > self._vad_thresh

    async def send_pcm(self, pcm_bytes: bytes):
        if not pcm_bytes or not self._running:
            return
        async with self._lock:
            self._buf.extend(pcm_bytes)
            # fast interim via whisper on ~1s window (throttled 400ms) for near-live feel
            now = time.monotonic()
            if self.on_interim and len(self._buf) > 16000 and now - self._last_interim > 0.4:
                self._last_interim = now
                # copy small window for interim
                inter_chunk = bytes(self._buf[-32000:])  # last 1s
                if self._is_speech(inter_chunk):
                    asyncio.create_task(self._try_interim(inter_chunk))
            # flush if buffer large
            if len(self._buf) >= 16000 * 2 * (self._chunk_ms / 1000) * 1.0:
                await self._try_transcribe(force=False)

    async def _try_interim(self, pcm: bytes):
        if not pcm or not self.on_interim:
            return
        def _trans():
            model = _get_model()
            audio = np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768.0
            lang = None if self.auto_detect or self.language == "auto" else self.language
            segments, info = model.transcribe(audio, language=lang, beam_size=1, vad_filter=True, without_timestamps=True)
            text = " ".join(s.text.strip() for s in segments if s.text.strip())
            detected = info.language if hasattr(info, "language") else (lang or "en")
            return text, detected
        loop = asyncio.get_running_loop()
        try:
            text, detected = await loop.run_in_executor(None, _trans)
        except Exception:
            return
        if text and self.on_interim:
            try:
                await self.on_interim(text, detected, 0.85)
            except Exception:
                pass

    async def _try_transcribe(self, force: bool = False):
        if not self._buf:
            return
        # VAD: only transcribe if speech detected or forced
        recent = bytes(self._buf[-64000:]) if len(self._buf) > 64000 else bytes(self._buf)
        if not force and not self._is_speech(recent):
            # silence, trim keep last 0.3s
            if len(self._buf) > 32000:
                self._buf = self._buf[-9600:]
            return
        # take up to 5s window for low latency (was 8s)
        max_bytes = 16000 * 2 * 5
        chunk = bytes(self._buf[-max_bytes:]) if len(self._buf) > max_bytes else bytes(self._buf)
        # keep 0.4s overlap for context, but clear most
        keep = 12800  # 0.4s
        self._buf = self._buf[-keep:] if len(self._buf) > keep else bytearray()

        # run whisper in thread
        def _transcribe():
            model = _get_model()
            # convert bytes to float32 normalized
            audio = np.frombuffer(chunk, dtype=np.int16).astype(np.float32) / 32768.0
            # faster-whisper expects 16k
            lang = None if self.auto_detect or self.language == "auto" else self.language
            segments, info = model.transcribe(audio, language=lang, beam_size=1, vad_filter=True, without_timestamps=False)
            text = " ".join(s.text.strip() for s in segments if s.text.strip())
            detected = info.language if hasattr(info, "language") else (lang or "en")
            return text, detected

        loop = asyncio.get_running_loop()
        try:
            text, detected = await loop.run_in_executor(None, _transcribe)
        except Exception as e:
            logger.warning(f"[whisper] transcribe error: {e}")
            return
        if not text:
            return
        logger.info(f"[whisper] final='{text}' lang={detected}")
        if self.on_final:
            # is_eos true, words empty (whisper gives segments)
            await self.on_final(text, detected, True, [])

    async def close(self):
        self._running = False
        if hasattr(self, "_flush_task"):
            try:
                self._flush_task.cancel()
            except Exception:
                pass
        # final flush
        if len(self._buf) > 8000:
            try:
                await self._try_transcribe(force=True)
            except Exception:
                pass
        self._buf.clear()
        logger.info("[whisper] closed")
