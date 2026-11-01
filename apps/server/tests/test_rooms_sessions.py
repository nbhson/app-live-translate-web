"""13.4: test cho room/session logic (chưa được phủ).

- _broadcast fan-out tới mọi session trong room, 1 ws lỗi không ảnh hưởng session khác.
- join/disconnect thêm + dọn room trong _rooms.
- translate:request (webspeech path) emit stt:final + translate:final cùng seq.
- summary:request cap transcript 50k chars (R2-8).
- suggest heuristic (is_question + fallback) - module suggest.py coverage 21%.
"""

import asyncio
import json
import os
import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

os.environ["DEEPGRAM_API_KEY"] = "testkey"
from src.ai.suggest import Suggester, is_question
from src.main import Session, _broadcast, _rooms, app

client = TestClient(app)


def _mock_session(room_id: str) -> Session:
    ws = AsyncMock()
    ws.send_json = AsyncMock()
    s = Session("en", ["vi"], ws, room_id=room_id)
    return s


# ---- room broadcast -------------------------------------------------------

@pytest.mark.asyncio
async def test_broadcast_reaches_all_sessions_in_room():
    a = _mock_session("room-bc")
    b = _mock_session("room-bc")
    other = _mock_session("room-other")
    _rooms["room-bc"] = {a, b}
    _rooms["room-other"] = {other}
    try:
        await _broadcast("room-bc", "stt:final", {"transcript": "hi"})
        await asyncio.sleep(0)
        a.ws.send_json.assert_awaited_once()
        b.ws.send_json.assert_awaited_once()
        other.ws.send_json.assert_not_awaited()
        payload = a.ws.send_json.await_args.args[0]
        assert payload["type"] == "stt:final"
        assert payload["transcript"] == "hi"
    finally:
        _rooms.pop("room-bc", None)
        _rooms.pop("room-other", None)


@pytest.mark.asyncio
async def test_broadcast_one_broken_ws_does_not_block_others():
    a = _mock_session("room-broken")
    b = _mock_session("room-broken")
    a.ws.send_json.side_effect = RuntimeError("ws closed")
    _rooms["room-broken"] = {a, b}
    try:
        # không raise, session còn lại vẫn nhận được event
        await _broadcast("room-broken", "translate:final", {"text": "x"})
        b.ws.send_json.assert_awaited_once()
    finally:
        _rooms.pop("room-broken", None)


@pytest.mark.asyncio
async def test_broadcast_empty_room_is_noop():
    await _broadcast("room-khong-ton-tai", "stt:final", {"transcript": "hi"})


def test_ws_join_registers_room_and_disconnect_cleans_up():
    assert "room-lifecycle" not in _rooms
    with client.websocket_connect("/ws") as ws:
        ws.send_json({"type": "join", "sourceLang": "en", "targetLangs": ["vi"], "roomId": "room-lifecycle"})
        time.sleep(0.3)
        assert "room-lifecycle" in _rooms
        assert len(_rooms["room-lifecycle"]) == 1
        ws.close()
    time.sleep(0.5)
    # disconnect: session bị discard, room rỗng bị pop
    assert not _rooms.get("room-lifecycle")


# ---- translate:request (client-side Web Speech path) ----------------------

def test_ws_translate_request_fanout_same_seq():
    mock_translator = MagicMock()
    mock_translator.__class__.__name__ = "MockTranslator"
    mock_translator.translate = AsyncMock(return_value="xin chào")
    with patch("src.main.get_translator", lambda p=None: mock_translator):
        with client.websocket_connect("/ws") as ws:
            ws.send_json({"type": "join", "sourceLang": "en", "targetLangs": ["vi"], "roomId": "room-req"})
            ws.send_json({"type": "translate:request", "text": "hello", "targetLangs": ["vi", "ja"]})
            time.sleep(0.4)
            # handler emit tuần tự: stt:final -> translate:final vi -> translate:final ja
            msgs = [ws.receive_json() for _ in range(3)]
            ws.close()
    types = [m["type"] for m in msgs]
    assert "stt:final" in types
    finals = [m for m in msgs if m["type"] == "translate:final"]
    assert len(finals) == 2
    # 2 target langs chia sẻ cùng seq để client map đúng
    assert finals[0]["seq"] == finals[1]["seq"]
    assert {f["targetLang"] for f in finals} == {"vi", "ja"}
    assert all(f["text"] == "xin chào" for f in finals)


def test_ws_translate_request_empty_text_ignored():
    with client.websocket_connect("/ws") as ws:
        ws.send_json({"type": "join", "sourceLang": "en", "targetLangs": ["vi"], "roomId": "room-empty"})
        ws.send_json({"type": "translate:request", "text": "   "})
        ws.send_json({"type": "ping"})
        time.sleep(0.2)
        ws.close()


# ---- summary:request cap 50k (R2-8) ---------------------------------------

def test_ws_summary_request_caps_transcript_50k():
    captured = {}

    class StubSummarizer:
        async def summarize_stream(self, transcript, window="full"):
            captured["transcript"] = transcript
            captured["window"] = window
            yield "- điểm chính "
            yield {"summary": "- điểm chính", "chapters": [], "actionItems": [], "keywords": ["a"]}

    with patch("src.main.summarizer", StubSummarizer()):
        with client.websocket_connect("/ws") as ws:
            ws.send_json({"type": "join", "sourceLang": "en", "targetLangs": ["vi"], "roomId": "room-sum"})
            ws.send_json({"type": "summary:request", "window": "full", "transcript": "x" * 60_000})
            time.sleep(0.3)
            # stub yield 1 str chunk + 1 dict final -> đúng 2 event theo thứ tự
            msgs = [ws.receive_json() for _ in range(2)]
            ws.close()
    # transcript được cap trước khi đánh vào summarizer
    assert len(captured.get("transcript", "")) == 50_000
    types = [m["type"] for m in msgs]
    assert "summary:chunk" in types
    assert "summary:final" in types
    final = next(m for m in msgs if m["type"] == "summary:final")
    assert final["summary"] == "- điểm chính"
    assert final["keywords"] == ["a"]


# ---- suggest heuristics (src/ai/suggest.py coverage 21%) ------------------

def test_is_question_variants():
    assert is_question("What is your name?")
    assert is_question("how does this work")
    assert is_question("Bạn có hiểu không?")
    assert is_question("Tại sao lại như vậy")
    assert not is_question("The report is done.")
    assert not is_question("   ")
    assert not is_question("")


def test_is_question_japanese_question_mark():
    assert is_question("これは何？")


def test_suggester_no_key_falls_back():
    for k in ("CUSTOM_API_KEY", "CUSTOM_BASE_URL"):
        os.environ.pop(k, None)
    s = Suggester()
    res = s._fallback("What is the deployment process for this service?")
    assert len(res["structures"]) == 3
    assert len(res["fullAnswers"]) == 3
    assert all(isinstance(x, str) and x.strip() for x in res["structures"] + res["fullAnswers"])


def test_suggester_fallback_vietnamese():
    s = Suggester()
    res = s._fallback("Làm thế nào để triển khai dịch vụ này?")
    assert len(res["structures"]) == 3
    assert len(res["fullAnswers"]) == 3
    # câu trả lời giữ tiếng Việt (không rơi vào pool tiếng Anh)
    assert any("bước" in f.lower() or "chuẩn bị" in f.lower() for f in res["fullAnswers"])


def test_suggester_empty_question():
    s = Suggester()
    assert asyncio.run(s.suggest("  ")) == {"structures": [], "fullAnswers": []}


@pytest.mark.asyncio
async def test_suggester_custom_success_normalizes_and_pads(monkeypatch):
    monkeypatch.setenv("CUSTOM_API_KEY", "k")
    monkeypatch.setenv("CUSTOM_BASE_URL", "http://x/v1")
    s = Suggester()
    payload = {"structures": ["only one structure"], "fullAnswers": ["answer 1", "answer 2", "answer 3", "answer 4"]}
    mock_resp = MagicMock()
    mock_resp.json.return_value = {"choices": [{"message": {"content": json.dumps(payload)}}]}
    mock_resp.raise_for_status = MagicMock()
    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.post.return_value = mock_resp
        mock_client_cls.return_value.__aenter__.return_value = mock_client
        res = await s.suggest("What is CI?", context="previous talk", source_lang="en")
    # truncate dư, pad thiếu (>=2 mỗi loại, tối đa 3)
    assert len(res["structures"]) == 2
    assert len(res["fullAnswers"]) == 3
    assert res["fullAnswers"] == ["answer 1", "answer 2", "answer 3"]
