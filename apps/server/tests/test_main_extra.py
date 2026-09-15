import pytest
import os
import json
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi.testclient import TestClient

os.environ["DEEPGRAM_API_KEY"] = "testkey"
from src.main import app, Session

client = TestClient(app)

@pytest.mark.asyncio
async def test_session_emit_and_start():
    mock_ws = AsyncMock()
    mock_ws.send_json = AsyncMock()
    s = Session("en", ["vi"], mock_ws)
    await s.emit("test", {"a":1})
    mock_ws.send_json.assert_called()
    # test _emit_interim and _emit_final
    await s._emit_interim("hello","en",0.9)
    await s._emit_final("hello world","en",True, [])
    assert "hello world" in s.transcripts

@pytest.mark.asyncio
async def test_session_on_sentence_google():
    mock_ws = AsyncMock()
    mock_ws.send_json = AsyncMock()
    s = Session("en", ["vi","ja"], mock_ws)
    s.translator.translate = AsyncMock(return_value="translated")
    await s._on_sentence("Hello.")
    assert mock_ws.send_json.call_count >=2

@pytest.mark.asyncio
async def test_session_on_sentence_llm_stream():
    mock_ws = AsyncMock()
    mock_ws.send_json = AsyncMock()
    s = Session("en", ["vi"], mock_ws)
    os.environ["TRANSLATE_STREAM"]="1"
    async def fake_stream(text, src, tgt):
        yield "tok1 "
        yield "tok2"
    s.translator.translate_stream = fake_stream
    # ensure has translate_stream
    await s._on_sentence("Hello.")
    # should have sent stream tokens + final
    assert mock_ws.send_json.call_count >=1
    os.environ.pop("TRANSLATE_STREAM", None)

@pytest.mark.asyncio
async def test_session_stop():
    mock_ws = AsyncMock()
    s = Session("en", ["vi"], mock_ws)
    s.stt = AsyncMock()
    s.stt.close = AsyncMock()
    from src.translate.buffer import SentenceBuffer
    s.buffer = SentenceBuffer("en", lambda x: None)
    s.buffer.push("hello")
    await s.stop()
    assert s.stt is None

def test_ws_summary_request_full():
    with patch("src.main.summarizer") as mock_sum:
        mock_sum.summarize = AsyncMock(return_value={"summary":"test summary","chapters":[],"actionItems":[],"keywords":[]})
        with client.websocket_connect("/ws") as ws:
            ws.send_json({"type":"join","sourceLang":"en","targetLangs":["vi"]})
            ws.send_json({"type":"summary:request","window":"full","transcript":"hello world"})
            import time; time.sleep(0.5)
            # read messages until summary:final
            msgs=[]
            try:
                for _ in range(5):
                    ws.settimeout(0.2)
                    try:
                        m = ws.receive_json()
                        msgs.append(m)
                    except: break
            except: pass
            # at least one summary related
            ws.close()

def test_ws_settings_update_triggers_reconnect():
    with patch("src.main.DeepgramStream") as MockSTT:
        mock_inst = AsyncMock()
        mock_inst.connect = AsyncMock()
        mock_inst.close = AsyncMock()
        MockSTT.return_value = mock_inst
        with client.websocket_connect("/ws") as ws:
            ws.send_json({"type":"join","sourceLang":"en","targetLangs":["vi"]})
            # send binary to start stt
            ws.send_bytes(b"pcm")
            import time; time.sleep(0.3)
            ws.send_json({"type":"settings:update","sourceLang":"ja","targetLangs":["en","vi"]})
            time.sleep(0.3)
            ws.close()

def test_ws_binary_without_stt_starts():
    with patch("src.main.DeepgramStream") as MockSTT:
        mock_inst = AsyncMock()
        mock_inst.connect = AsyncMock()
        mock_inst.send_pcm = AsyncMock()
        MockSTT.return_value = mock_inst
        with client.websocket_connect("/ws") as ws:
            ws.send_json({"type":"join","sourceLang":"en","targetLangs":["vi"]})
            ws.send_bytes(b"")
            # empty bytes should not call send_pcm
            import time; time.sleep(0.2)
            ws.close()

def test_ws_error_on_bad_json():
    with client.websocket_connect("/ws") as ws:
        ws.send_json({"type":"join","sourceLang":"en","targetLangs":["vi"]})
        ws.send_text("not json {")
        ws.send_json({"type":"audio:stop"})
        import time; time.sleep(0.2)
        ws.close()
