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
from pathlib import Path

# load .env if present (so CUSTOM_* from apps/server/.env is available without manual export)
try:
    _env_path = Path(__file__).resolve().parents[1] / ".env"
    if _env_path.exists():
        for line in _env_path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            k = k.strip()
            v = v.strip().strip('"').strip("'")
            if k and k not in os.environ:
                os.environ[k] = v
except Exception:
    pass

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from src.ai.suggest import suggester, is_question
from src.ai.summarizer import summarizer
from src.stt.deepgram import DeepgramStream
from src.translate.buffer import SentenceBuffer
from src.translate.free import MyMemoryTranslator
from src.translate.google import GoogleTranslator
from src.translate.llm import LLMTranslator

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("lt-server")

# rooms: roomId -> set(Session) để extension + web UI cùng nhận broadcast
_rooms: dict[str, set["Session"]] = {}

async def _broadcast(room_id: str, event: str, payload: dict):
    for sess in list(_rooms.get(room_id, set())):
        try:
            await sess.ws.send_json({"type": event, **payload})
        except Exception:
            pass

app = FastAPI(title="Live Translate Server")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_translator(provider: str | None = None):
    # Chỉ dùng CUSTOM_API_KEY/CUSTOM_BASE_URL/CUSTOM_MODEL cho AI, còn lại là free (MyMemory)
    p = (provider or os.environ.get("TRANSLATE_PROVIDER", "auto")).lower()
    has_custom = bool(os.environ.get("CUSTOM_API_KEY") and os.environ.get("CUSTOM_BASE_URL"))
    if p in ("ai", "llm", "custom"):
        # nếu chọn AI nhưng chưa cấu hình CUSTOM -> fallback MyMemory để không trả placeholder [vi]
        return LLMTranslator() if has_custom else MyMemoryTranslator()
    if p in ("free", "mymemory"):
        return MyMemoryTranslator()
    # auto: nếu có CUSTOM key thì dùng AI, không thì free
    if has_custom:
        return LLMTranslator()
    return MyMemoryTranslator()


class Session:
    def __init__(self, source_lang: str, target_langs: list[str], ws: WebSocket, translate_provider: str | None = None, room_id: str = "default"):
        self.source_lang = source_lang
        self.target_langs = target_langs
        self.ws = ws
        self.room_id = room_id
        self.translate_provider = (translate_provider or os.environ.get("TRANSLATE_PROVIDER", "auto")).lower()
        self.stt: DeepgramStream | None = None
        self.buffer: SentenceBuffer | None = None
        self.translator = get_translator(self.translate_provider)
        self.transcripts: list[str] = []  # for AI summary
        self._emit_task: asyncio.Task | None = None
        self._sentence_seq: int = 0  # monotonic sentence id to map translation correctly even when AI is slow

    async def emit(self, event: str, payload: dict):
        # broadcast tới cả room để extension + web cùng thấy
        await _broadcast(self.room_id, event, payload)

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

    async def _maybe_suggest(self, sentence: str, seq: int):
        # fire-and-forget suggestion if question detected - use broader history for context-aware answers
        try:
            if not is_question(sentence):
                return
            # last 10 sentences (~ 1500 chars) gives interview flow, names, prior answers
            ctx = " ".join(self.transcripts[-10:])
            # also include up to 800 chars of older history for long context
            if len(ctx) < 500 and len(self.transcripts) > 10:
                ctx = " ".join(self.transcripts[-15:])
            res = await suggester.suggest(sentence, context=ctx, source_lang=self.source_lang)
            await self.emit("suggest:result", {
                "seq": seq,
                "question": sentence,
                "structures": res.get("structures", [])[:3],
                "fullAnswers": res.get("fullAnswers", [])[:3],
                "sourceLang": self.source_lang,
            })
        except Exception as e:
            print(f"[suggest] error: {e}")

    async def _on_sentence(self, sentence: str):
        seq = self._sentence_seq
        self._sentence_seq += 1
        # question suggestion (async, not blocking translate)
        asyncio.create_task(self._maybe_suggest(sentence, seq))
        # fan-out multi-target via gather per ARCHITECTURE.md
        async def _one(tl: str):
            # if LLM streaming, emit stream tokens with seq so client maps correctly
            if (
                hasattr(self.translator, "translate_stream")
                and os.environ.get("TRANSLATE_STREAM", "") == "1"
            ):
                text = ""
                async for tok in self.translator.translate_stream(sentence, self.source_lang, tl):
                    text += tok
                    await self.emit("translate:stream", {"targetLang": tl, "token": tok, "seq": seq, "source": sentence})
                if text:
                    await self.emit(
                        "translate:final",
                        {
                            "seq": seq,
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
                        "seq": seq,
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
        translate_provider = msg.get("translateProvider") or msg.get("translate_provider")
        room_id = msg.get("roomId") or "default"
        session = Session(source_lang, target_langs, ws, translate_provider=translate_provider, room_id=room_id)
        _rooms.setdefault(room_id, set()).add(session)
        logger.info(f"WS connected: source={source_lang}, targets={target_langs} translate={session.translate_provider} room={room_id} total={len(_rooms[room_id])}")

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
                    if "translateProvider" in msg and msg["translateProvider"]:
                        tp = str(msg["translateProvider"]).lower()
                        if tp in ("ai", "llm", "custom", "free", "mymemory"):
                            # chuẩn hóa: ai/llm/custom -> llm, mymemory -> free
                            norm = "free" if tp in ("free", "mymemory") else "llm"
                            session.translate_provider = norm
                            session.translator = get_translator(norm)
                            logger.info(f"Translate provider switched to {norm} ({session.translator.__class__.__name__})")
                    logger.info(
                        f"Settings updated source={session.source_lang} targets={session.target_langs} translate={session.translate_provider}"
                    )
                elif t == "translate:request":
                    # Client-side STT (Web Speech API) gửi text lên để server dịch - dùng cho provider=webspeech
                    # Mỗi câu được gán seq để client mapping đúng dù AI trả chậm / out-of-order
                    text = msg.get("text", "").strip()
                    s_lang = msg.get("sourceLang", session.source_lang)
                    t_langs = msg.get("targetLangs", session.target_langs)
                    if text:
                        seq = session._sentence_seq
                        session._sentence_seq += 1
                        # cũng lưu vào buffer/transcript để history + summary dùng được
                        session.transcripts.append(text)
                        await session.emit("stt:final", {"transcript": text, "language": s_lang, "words": [], "is_eos": True, "seq": seq})
                        # question suggest for webspeech path
                        if is_question(text):
                            asyncio.create_task(session._maybe_suggest(text, seq))
                        # fan-out dịch - mỗi targetLang chung seq
                        for tl in t_langs:
                            try:
                                translated = await session.translator.translate(text, s_lang, tl)
                                await session.emit("translate:final", {"seq": seq, "source": text, "sourceLang": s_lang, "targetLang": tl, "text": translated, "provider": session.translator.__class__.__name__.lower()})
                            except Exception as e:
                                await session.emit("error", {"code": "TRANSLATE_ERROR", "message": str(e)})
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
                _rooms.get(session.room_id, set()).discard(session)
                if session.room_id in _rooms and not _rooms[session.room_id]:
                    _rooms.pop(session.room_id, None)
                await session.stop()
            except Exception:
                pass


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
