"""13.2 + 13.4: Streaming thật (SSE OpenAI-compatible) + test cho provider chain.

Kiểm tra:
- LLMTranslator.translate_stream parse SSE delta và yield token dần (không giả lập).
- Fallback one-shot khi backend lỗi / stream rỗng / không có key.
- Summarizer.summarize_stream yield token thật + dict cuối cùng cho summary:final.
- get_translator fallback chain (auto/ai/free, có/không CUSTOM_*).
"""

import json
import os
from unittest.mock import MagicMock, patch

import pytest

from src.ai.summarizer import Summarizer
from src.translate.free import MyMemoryTranslator
from src.translate.llm import LLMTranslator

# ---- fake httpx SSE -------------------------------------------------------

class _StreamCtx:
    def __init__(self, lines, error_after=None):
        self._resp = _StreamResp(lines, error_after)

    async def __aenter__(self):
        return self._resp

    async def __aexit__(self, *a):
        return False


class _StreamResp:
    def __init__(self, lines, error_after=None):
        self._lines = lines
        self._error_after = error_after

    def raise_for_status(self):
        pass

    async def aiter_lines(self):
        for i, line in enumerate(self._lines):
            if self._error_after is not None and i >= self._error_after:
                raise RuntimeError("connection reset mid-stream")
            yield line


def _sse_lines(tokens):
    lines = [
        "data: " + json.dumps({"choices": [{"delta": {"content": tok}}]}) for tok in tokens
    ]
    lines.append("data: [DONE]")
    return lines


def _fake_client(lines, error_after=None):
    """Lớp thay httpx.AsyncClient: hỗ trợ cả .stream() và .post() (one-shot fallback)."""
    class _Client:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        def stream(self, method, url, **kw):
            return _StreamCtx(lines, error_after)

        async def post(self, url, **kw):
            resp = MagicMock()
            resp.json.return_value = {"choices": [{"message": {"content": "one-shot result"}}]}
            resp.raise_for_status = MagicMock()
            return resp

    return _Client


# ---- LLMTranslator.translate_stream (stream thật) -------------------------

@pytest.mark.asyncio
async def test_llm_stream_parses_sse_deltas(monkeypatch):
    monkeypatch.setenv("CUSTOM_API_KEY", "ckey")
    monkeypatch.setenv("CUSTOM_BASE_URL", "http://llm:8000/v1")
    t = LLMTranslator()
    tokens = []
    with patch("src.translate.llm.httpx.AsyncClient", _fake_client(_sse_lines(["Xin ", "chào"]))):
        async for tok in t.translate_stream("hello", "en", "vi"):
            tokens.append(tok)
    # stream thật: từng delta được yield riêng, ghép đủ text
    assert tokens == ["Xin ", "chào"]
    assert "".join(tokens) == "Xin chào"


@pytest.mark.asyncio
async def test_llm_stream_empty_then_one_shot_fallback(monkeypatch):
    monkeypatch.setenv("CUSTOM_API_KEY", "ckey")
    monkeypatch.setenv("CUSTOM_BASE_URL", "http://llm:8000/v1")
    t = LLMTranslator()
    with patch("src.translate.llm.httpx.AsyncClient", _fake_client(["data: [DONE]"])):
        tokens = [tok async for tok in t.translate_stream("hello", "en", "vi")]
    # stream rỗng -> fallback one-shot, client vẫn nhận đủ text
    assert tokens == ["one-shot result"]


@pytest.mark.asyncio
async def test_llm_stream_mid_stream_error_keeps_partial(monkeypatch):
    monkeypatch.setenv("CUSTOM_API_KEY", "ckey")
    monkeypatch.setenv("CUSTOM_BASE_URL", "http://llm:8000/v1")
    t = LLMTranslator()
    with patch(
        "src.translate.llm.httpx.AsyncClient",
        _fake_client(_sse_lines(["Xin ", "chào"]), error_after=1),
    ):
        tokens = [tok async for tok in t.translate_stream("hello", "en", "vi")]
    # lỗi giữa chừng: giữ phần đã stream, KHÔNG yield lại full (tránh lặp)
    assert tokens == ["Xin "]


@pytest.mark.asyncio
async def test_llm_stream_error_before_any_token_falls_back(monkeypatch):
    monkeypatch.setenv("CUSTOM_API_KEY", "ckey")
    monkeypatch.setenv("CUSTOM_BASE_URL", "http://llm:8000/v1")
    t = LLMTranslator()
    with patch(
        "src.translate.llm.httpx.AsyncClient",
        _fake_client(_sse_lines(["Xin"]), error_after=0),
    ):
        tokens = [tok async for tok in t.translate_stream("hello", "en", "vi")]
    assert tokens == ["one-shot result"]


@pytest.mark.asyncio
async def test_llm_stream_same_lang_short_circuit():
    t = LLMTranslator()
    tokens = [tok async for tok in t.translate_stream("hi", "en", "en")]
    assert tokens == ["hi"]


# ---- Summarizer.summarize_stream (stream thật) ----------------------------

@pytest.mark.asyncio
async def test_summarizer_stream_real_llm_tokens(monkeypatch):
    monkeypatch.setenv("CUSTOM_API_KEY", "ckey")
    monkeypatch.setenv("CUSTOM_BASE_URL", "http://llm:8000/v1")
    s = Summarizer()
    transcript = " ".join(["the team agreed to ship the feature next week"] * 20)
    events = []
    with patch(
        "src.ai.summarizer.httpx.AsyncClient",
        _fake_client(_sse_lines(["- ship ", "feature"])),
    ):
        async for chunk in s.summarize_stream(transcript, window="full"):
            events.append(chunk)
    toks = [c for c in events if isinstance(c, str)]
    finals = [c for c in events if isinstance(c, dict)]
    # stream thật: token đến dần theo SSE, không phải chia nhỏ kết quả có sẵn
    assert toks == ["- ship ", "feature"]
    assert len(finals) == 1
    assert finals[0]["summary"] == "- ship feature"
    assert set(finals[0].keys()) == {"summary", "chapters", "actionItems", "keywords"}


@pytest.mark.asyncio
async def test_summarizer_stream_no_key_fallback_yields_final_dict():
    for k in ("CUSTOM_API_KEY", "CUSTOM_BASE_URL"):
        os.environ.pop(k, None)
    s = Summarizer()
    events = []
    async for chunk in s.summarize_stream("The team must ship the report by Friday. We will review it.", window="full"):
        events.append(chunk)
    strs = [c for c in events if isinstance(c, str)]
    dicts = [c for c in events if isinstance(c, dict)]
    assert len(strs) > 0
    assert len(dicts) == 1
    assert dicts[0]["summary"] == "".join(strs).strip()


@pytest.mark.asyncio
async def test_summarizer_stream_empty_transcript():
    s = Summarizer()
    events = [c async for c in s.summarize_stream("   ", window="full")]
    assert isinstance(events[-1], dict)
    assert "Chưa có" in events[-1]["summary"]


@pytest.mark.asyncio
async def test_summarizer_stream_llm_error_falls_back(monkeypatch):
    monkeypatch.setenv("CUSTOM_API_KEY", "ckey")
    monkeypatch.setenv("CUSTOM_BASE_URL", "http://llm:8000/v1")
    s = Summarizer()
    transcript = "We need to fix the bug. Alice will send the report. This is a long enough sentence here."
    events = []
    with patch(
        "src.ai.summarizer.httpx.AsyncClient",
        _fake_client([], error_after=0),  # raise ngay
    ):
        async for chunk in s.summarize_stream(transcript, window="full"):
            events.append(chunk)
    finals = [c for c in events if isinstance(c, dict)]
    assert len(finals) == 1
    # fallback heuristic vẫn trả đủ 4 trường, không crash
    assert "summary" in finals[0]


# ---- get_translator fallback chain ----------------------------------------

def test_get_translator_ai_without_custom_falls_back_to_free(monkeypatch):
    from src.main import get_translator

    monkeypatch.delenv("CUSTOM_API_KEY", raising=False)
    monkeypatch.delenv("CUSTOM_BASE_URL", raising=False)
    monkeypatch.setenv("TRANSLATE_PROVIDER", "ai")
    assert isinstance(get_translator("ai"), MyMemoryTranslator)


def test_get_translator_ai_with_custom_uses_llm(monkeypatch):
    from src.main import get_translator

    monkeypatch.setenv("CUSTOM_API_KEY", "k")
    monkeypatch.setenv("CUSTOM_BASE_URL", "http://x/v1")
    assert isinstance(get_translator("ai"), LLMTranslator)


def test_get_translator_auto_without_custom_is_free(monkeypatch):
    from src.main import get_translator

    monkeypatch.delenv("CUSTOM_API_KEY", raising=False)
    monkeypatch.delenv("CUSTOM_BASE_URL", raising=False)
    assert isinstance(get_translator(None), MyMemoryTranslator)


def test_get_translator_free_explicit(monkeypatch):
    from src.main import get_translator

    monkeypatch.setenv("CUSTOM_API_KEY", "k")
    monkeypatch.setenv("CUSTOM_BASE_URL", "http://x/v1")
    assert isinstance(get_translator("free"), MyMemoryTranslator)
