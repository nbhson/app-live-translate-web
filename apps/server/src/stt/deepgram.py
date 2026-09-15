"""Deepgram streaming STT provider."""

import asyncio
import json
import os
import ssl

import websockets

try:
    import certifi

    _HAS_CERTIFI = True
except ImportError:
    _HAS_CERTIFI = False


def _ssl_context() -> ssl.SSLContext | None:
    """Trả về SSLContext dùng certifi nếu có, fix CERTIFICATE_VERIFY_FAILED trên macOS."""
    # Cho phép bypass khi DEV (không khuyến nghị prod)
    if os.environ.get("DEEPGRAM_INSECURE_SSL") == "1":
        ctx = ssl._create_unverified_context()
        return ctx
    if _HAS_CERTIFI:
        try:
            return ssl.create_default_context(cafile=certifi.where())
        except Exception:
            pass
    # Fallback hệ thống; nếu vẫn lỗi, hướng dẫn cài cert
    try:
        return ssl.create_default_context()
    except Exception:
        return None


class DeepgramStream:
    """Streams raw PCM 16k mono to Deepgram Nova-3 and emits results. Implements STTProvider."""

    def __init__(
        self, api_key: str, language: str = "en", auto_detect: bool = False, diarize: bool = False
    ):
        self.api_key = api_key
        self.language = language
        self.auto_detect = auto_detect
        self.diarize = diarize
        self.ws: websockets.ClientConnection | None = None
        self.on_interim = None  # callback(text, lang, conf)
        self.on_final = None  # callback(text, lang, is_eos, words)
        self._recv_task: asyncio.Task | None = None

    def _url(self) -> str:
        lang = "auto" if self.auto_detect else self.language
        # detect_language param per ARCHITECTURE.md Phase 2
        detect = "&detect_language=true" if self.auto_detect else ""
        diarize = "&diarize=true" if self.diarize else ""
        return (
            "wss://api.deepgram.com/v1/listen?"
            f"model=nova-3&interim_results=true&punctuate=true{diarize}{detect}"
            f"&language={lang}&encoding=linear16&sample_rate=16000&channels=1"
        )

    async def connect(self):
        if not self.api_key:
            raise RuntimeError(
                "DEEPGRAM_API_KEY không được cấu hình. Chạy `export DEEPGRAM_API_KEY=dg_...`"
            )
        ssl_ctx = _ssl_context()
        import logging

        logger = logging.getLogger("lt-server")
        logger.info(f"[deepgram] connecting {self._url()[:80]}... key={self.api_key[:6]}...")
        self.ws = await websockets.connect(
            self._url(),
            additional_headers={"Authorization": f"Token {self.api_key}"},
            max_size=2**20,
            ssl=ssl_ctx,
        )
        logger.info("[deepgram] connected")
        self._recv_task = asyncio.create_task(self._receive_loop())

    async def _receive_loop(self):
        if not self.ws:
            return
        import logging

        logger = logging.getLogger("lt-server")
        try:
            async for raw in self.ws:
                if isinstance(raw, bytes):
                    raw = raw.decode("utf-8")
                # debug raw
                if len(raw) < 500:
                    logger.info(f"[deepgram] raw: {raw[:400]}")
                msg = json.loads(raw)
                # Deepgram có thể trả type: Results hoặc Metadata
                if msg.get("type") == "Metadata":
                    continue
                channel = msg.get("channel", {})
                alt = channel.get("alternatives", [{}])[0]
                # Deepgram trả "transcript" (Nova-3) hoặc "text" ở một số version
                text = alt.get("transcript", alt.get("text", ""))
                lang = alt.get("language", "en") or msg.get("language", "en")
                conf = alt.get("confidence", 0.0)
                words = alt.get("words", [])
                is_eos = channel.get("is_final", False) or msg.get("is_final", False)
                speech_final = msg.get("speech_final", False)
                # log ngắn để không spam khi transcript rỗng
                if text:
                    logger.info(
                        f"[deepgram] text='{text}' lang={lang} conf={conf:.2f} is_eos={is_eos} speech_final={speech_final}"
                    )
                if not text:
                    continue
                if is_eos:
                    if self.on_final:
                        await self.on_final(text, lang, True, words)
                else:
                    if self.on_interim:
                        await self.on_interim(text, lang, conf)
        except websockets.ConnectionClosed as e:
            logger.warning(f"[deepgram] closed {e.code} {e.reason}")
        except Exception as e:
            logger.exception(f"[stt] receive loop error: {e}")
            print(f"[stt] receive loop error: {e}")

    async def send_pcm(self, pcm_bytes: bytes):
        if self.ws and pcm_bytes:
            import logging

            logger = logging.getLogger("lt-server")
            if not hasattr(self, "_pcm_count"):
                self._pcm_count = 0
            self._pcm_count += 1
            if self._pcm_count % 20 == 0:
                logger.info(f"[deepgram] sent {self._pcm_count} chunks ({len(pcm_bytes)} bytes)")
            await self.ws.send(pcm_bytes)

    async def close(self):
        if self._recv_task:
            self._recv_task.cancel()
            self._recv_task = None
        if self.ws:
            try:
                await self.ws.close()
            except Exception:
                pass
            self.ws = None
