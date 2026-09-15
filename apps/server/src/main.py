"""Live Translate Server - FastAPI + raw WebSocket (JSON + binary PCM).

Protocol:
  - Text frames: JSON { "type": "join|audio:stop|settings:update|summary:request", ... }
  - Binary frames: raw PCM 16kHz mono Int16 chunks
"""

import asyncio
import json
import logging
import os
import time

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from src.ai.summarizer import summarizer
from src.stt.deepgram import DeepgramStream
from src.translate.buffer import SentenceBuffer
from src.translate.google import GoogleTranslator
from src.translate.llm import LLMTranslator

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("lt-server")

app = FastAPI(title="Live Translate Server")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_translator():
    provider = os.environ.get("TRANSLATE_PROVIDER", "google")
    if provider == "llm":
        return LLMTranslator()
    return GoogleTranslator()


class Session:
    def __init__(self, source_lang: str, target_langs: list[str], ws: WebSocket):
        self.source_lang = source_lang
        self.target_langs = target_langs
        self.ws = ws
        self.stt: DeepgramStream | None = None
        self.buffer: SentenceBuffer | None = None
        self.translator = get_translator()
        self.transcripts: list[str] = []  # for AI summary
        self._emit_task: asyncio.Task | None = None

    async def emit(self, event: str, payload: dict):
        try:
            await self.ws.send_json({"type": event, **payload})
        except Exception:
            pass

    async def start(self):
        self.stt = DeepgramStream(
            api_key=os.environ.get("DEEPGRAM_API_KEY", ""),
            language=self.source_lang,
            auto_detect=self.source_lang == "auto",
        )

        # use create_task safe wrappers
        async def _interim(text, lang, conf):
            await self._emit_interim(text, lang, conf)

        async def _final(text, lang, is_eos, words):
            await self._emit_final(text, lang, is_eos, words)

        self.stt.on_interim = lambda text, lang, conf: asyncio.create_task(
            _interim(text, lang, conf)
        )
        self.stt.on_final = lambda text, lang, is_eos, words: asyncio.create_task(
            _final(text, lang, is_eos, words)
        )
        self.buffer = SentenceBuffer(source_lang=self.source_lang, on_sentence=self._on_sentence)
        await self.stt.connect()
        logger.info(
            f"Session started source={self.source_lang} targets={self.target_langs} provider={self.translator.__class__.__name__}"
        )

    async def _emit_interim(self, text: str, lang: str, conf: float):
        await self.emit("stt:interim", {"transcript": text, "language": lang, "confidence": conf})

    async def _emit_final(self, text: str, lang: str, is_eos: bool, words: list):
        self.transcripts.append(text)
        await self.emit(
            "stt:final", {"transcript": text, "language": lang, "words": words, "is_eos": is_eos}
        )
        if self.buffer:
            self.buffer.push(text, is_eos)

    async def _on_sentence(self, sentence: str):
        # fan-out multi-target via gather per ARCHITECTURE.md
        async def _one(tl: str):
            # if LLM streaming, emit stream tokens
            if (
                hasattr(self.translator, "translate_stream")
                and os.environ.get("TRANSLATE_STREAM", "") == "1"
            ):
                text = ""
                async for tok in self.translator.translate_stream(sentence, self.source_lang, tl):
                    text += tok
                    await self.emit("translate:stream", {"targetLang": tl, "token": tok})
                if text:
                    await self.emit(
                        "translate:final",
                        {
                            "source": sentence,
                            "sourceLang": self.source_lang,
                            "targetLang": tl,
                            "text": text.strip(),
                            "provider": "llm",
                        },
                    )
            else:
                translated = await self.translator.translate(sentence, self.source_lang, tl)
                await self.emit(
                    "translate:final",
                    {
                        "source": sentence,
                        "sourceLang": self.source_lang,
                        "targetLang": tl,
                        "text": translated,
                        "provider": self.translator.__class__.__name__.lower(),
                    },
                )

        await asyncio.gather(*[_one(tl) for tl in self.target_langs])

    async def stop(self):
        if self.stt:
            await self.stt.close()
            self.stt = None
        if self.buffer:
            self.buffer.flush()


@app.get("/health")
async def health():
    return {"ok": True, "ts": int(time.time())}


@app.get("/languages")
async def languages():
    return {
        "source": ["auto", "en", "vi", "ja", "ko", "zh", "fr", "de", "es"],
        "target": ["vi", "en", "ja", "ko", "zh", "fr", "de", "es"],
        "sttProvider": os.environ.get("STT_PROVIDER", "deepgram"),
        "translateProvider": os.environ.get("TRANSLATE_PROVIDER", "google"),
    }


@app.get("/api/sessions")
async def list_sessions():
    return {"sessions": []}


@app.get("/api/sessions/{sid}/transcripts")
async def get_transcripts(sid: str):
    return {"sessionId": sid, "transcripts": []}


@app.post("/api/sessions/{sid}/summary")
async def post_summary(sid: str, body: dict = None):
    transcript = (body or {}).get("transcript", "") if body else ""
    res = await summarizer.summarize(transcript, window="full")
    return res


@app.get("/api/languages")
async def api_languages():
    return await languages()


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    session: Session | None = None
    try:
        first = await ws.receive()
        raw = first.get("text")
        if raw is None:
            return
        msg = json.loads(raw)
        if msg.get("type") != "join":
            await ws.send_json(
                {"type": "error", "code": "JOIN_REQUIRED", "message": "Expected join first"}
            )
            return
        source_lang = msg.get("sourceLang", "en")
        target_langs = msg.get("targetLangs", ["vi"])
        session = Session(source_lang, target_langs, ws)
        logger.info(f"WS connected: source={source_lang}, targets={target_langs}")

        while True:
            try:
                msg_data = await ws.receive()
            except (WebSocketDisconnect, RuntimeError):
                break
            t = msg_data.get("type")
            if t in ("websocket.disconnect", "websocket.close"):
                break
            if t != "websocket.receive":
                continue
            if msg_data.get("bytes") is not None:
                if session.stt is None:
                    try:
                        await session.start()
                    except Exception as e:
                        await session.emit("error", {"code": "STT_CONNECT", "message": str(e)})
                        continue
                if session.stt and msg_data["bytes"]:
                    await session.stt.send_pcm(msg_data["bytes"])
            elif msg_data.get("text") is not None:
                try:
                    msg = json.loads(msg_data["text"])
                except json.JSONDecodeError:
                    continue
                t = msg.get("type")
                if t in ("ping", "pong"):
                    continue
                if t == "audio:stop":
                    if session.stt:
                        await session.stop()
                    logger.info("Audio stopped")
                elif t == "settings:update":
                    if "sourceLang" in msg and msg["sourceLang"]:
                        session.source_lang = msg["sourceLang"]
                        if session.buffer:
                            session.buffer.set_language(msg["sourceLang"])
                        # reconnect STT with new language if needed
                        if session.stt:
                            try:
                                await session.stt.close()
                                session.stt = DeepgramStream(
                                    api_key=os.environ.get("DEEPGRAM_API_KEY", ""),
                                    language=session.source_lang,
                                    auto_detect=session.source_lang == "auto",
                                )

                                async def _i(text, lang, conf):
                                    await session._emit_interim(text, lang, conf)

                                async def _f(text, lang, is_eos, words):
                                    await session._emit_final(text, lang, is_eos, words)

                                session.stt.on_interim = lambda text, lang, conf: (
                                    asyncio.create_task(_i(text, lang, conf))
                                )
                                session.stt.on_final = lambda text, lang, is_eos, words: (
                                    asyncio.create_task(_f(text, lang, is_eos, words))
                                )
                                await session.stt.connect()
                            except Exception as e:
                                await session.emit(
                                    "error", {"code": "STT_RECONNECT", "message": str(e)}
                                )
                    if "targetLangs" in msg and msg["targetLangs"]:
                        session.target_langs = msg["targetLangs"]
                    logger.info(
                        f"Settings updated source={session.source_lang} targets={session.target_langs}"
                    )
                elif t == "summary:request":
                    window = msg.get("window", "full")
                    transcript = msg.get("transcript") or " ".join(session.transcripts[-50:])
                    # stream summarizer
                    try:
                        # emit streaming chunks
                        full = await summarizer.summarize(
                            transcript, window=window if window in ("30s", "full") else "full"
                        )
                        # stream summary chunk by chunk
                        summary_text = full.get("summary", "")
                        for i in range(0, len(summary_text), 40):
                            await session.emit("summary:chunk", {"token": summary_text[i : i + 40]})
                            await asyncio.sleep(0.02)
                        await session.emit(
                            "summary:final",
                            {
                                "summary": summary_text,
                                "chapters": full.get("chapters", []),
                                "actionItems": full.get("actionItems", []),
                                "keywords": full.get("keywords", []),
                            },
                        )
                    except Exception as e:
                        await session.emit("error", {"code": "SUMMARY_ERROR", "message": str(e)})
    except WebSocketDisconnect:
        logger.info("WS disconnected")
    except Exception as e:
        logger.exception(f"WS error: {e}")
    finally:
        if session:
            try:
                await session.stop()
            except Exception:
                pass


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
