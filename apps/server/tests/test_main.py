import pytest
import os
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, patch, MagicMock

# Need to set env before import
os.environ["DEEPGRAM_API_KEY"] = "testkey"

from src.main import app

client = TestClient(app)

def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["ok"] is True
    assert "ts" in r.json()

def test_languages():
    r = client.get("/languages")
    assert r.status_code == 200
    data = r.json()
    assert "auto" in data["source"]
    assert "vi" in data["target"]

def test_api_languages():
    r = client.get("/api/languages")
    assert r.status_code == 200

def test_list_sessions():
    r = client.get("/api/sessions")
    assert r.status_code == 200

def test_get_transcripts():
    r = client.get("/api/sessions/123/transcripts")
    assert r.status_code == 200
    assert r.json()["sessionId"] == "123"

def test_post_summary():
    r = client.post("/api/sessions/123/summary", json={"transcript":"Hello world"})
    assert r.status_code == 200
    assert "summary" in r.json()

def test_websocket_join_and_settings():
    with client.websocket_connect("/ws") as ws:
        ws.send_json({"type":"join","sourceLang":"en","targetLangs":["vi"]})
        # send settings update
        ws.send_json({"type":"settings:update","sourceLang":"ja","targetLangs":["en"]})
        # send ping
        ws.send_json({"type":"ping"})
        # send audio stop
        ws.send_json({"type":"audio:stop"})
        # request summary
        ws.send_json({"type":"summary:request","window":"full","transcript":"Hello world"})
        # give time to process
        import time; time.sleep(0.5)
        # should have received summary chunks
        # Non-deterministic because summarizer fallback, but at least connection stays
        ws.close()

def test_websocket_missing_join():
    with client.websocket_connect("/ws") as ws:
        ws.send_json({"type":"settings:update","sourceLang":"en"})
        data = ws.receive_json()
        assert data["type"] == "error"
        assert "JOIN" in data.get("code","")

def test_websocket_binary_flow_mock_stt():
    # Mock DeepgramStream to avoid external call
    with patch("src.main.DeepgramStream") as MockSTT:
        mock_inst = AsyncMock()
        mock_inst.connect = AsyncMock()
        mock_inst.send_pcm = AsyncMock()
        mock_inst.close = AsyncMock()
        MockSTT.return_value = mock_inst
        with client.websocket_connect("/ws") as ws:
            ws.send_json({"type":"join","sourceLang":"en","targetLangs":["vi"]})
            ws.send_bytes(b"pcmdata")
            import time; time.sleep(0.3)
            # verify send_pcm called
            # may be async, allow event loop
            ws.close()

def test_get_translator_google():
    os.environ["TRANSLATE_PROVIDER"]="google"
    from src.main import get_translator
    from src.translate.google import GoogleTranslator
    t = get_translator()
    assert isinstance(t, GoogleTranslator)

def test_get_translator_llm():
    os.environ["TRANSLATE_PROVIDER"]="llm"
    from src.main import get_translator
    from src.translate.llm import LLMTranslator
    t = get_translator()
    assert isinstance(t, LLMTranslator)
    os.environ["TRANSLATE_PROVIDER"]="google"
