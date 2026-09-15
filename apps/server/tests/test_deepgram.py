import pytest
import json
from unittest.mock import AsyncMock, patch, MagicMock
from src.stt.deepgram import DeepgramStream

def test_url_basic():
    s = DeepgramStream(api_key="key", language="en")
    assert "language=en" in s._url()
    assert "nova-3" in s._url()

def test_url_auto():
    s = DeepgramStream(api_key="key", language="auto", auto_detect=True)
    assert "detect_language=true" in s._url()
    assert "language=auto" in s._url()

def test_url_diarize():
    s = DeepgramStream(api_key="key", language="en", diarize=True)
    assert "diarize=true" in s._url()

@pytest.mark.asyncio
async def test_connect_no_key():
    s = DeepgramStream(api_key="", language="en")
    try:
        await s.connect()
        assert False, "should raise"
    except RuntimeError as e:
        assert "DEEPGRAM_API_KEY" in str(e)

@pytest.mark.asyncio
async def test_connect_success():
    s = DeepgramStream(api_key="key", language="en")
    mock_ws = AsyncMock()
    with patch("websockets.connect", new=AsyncMock(return_value=mock_ws)) as mock_connect:
        await s.connect()
        assert s.ws == mock_ws
        assert s._recv_task is not None
        await s.close()
        # mock_ws.close should be called
        mock_ws.close.assert_called()

@pytest.mark.asyncio
async def test_send_pcm():
    s = DeepgramStream(api_key="key")
    mock_ws = AsyncMock()
    s.ws = mock_ws
    await s.send_pcm(b"pcmdata")
    mock_ws.send.assert_called_with(b"pcmdata")
    await s.send_pcm(b"")
    # empty should not send
    assert mock_ws.send.call_count == 1

@pytest.mark.asyncio
async def test_receive_loop_interim_and_final():
    s = DeepgramStream(api_key="key")
    interim_calls=[]
    final_calls=[]
    async def on_interim(t,l,c): interim_calls.append((t,l,c))
    async def on_final(t,l,eos,w): final_calls.append((t,l,eos,w))
    s.on_interim = on_interim
    s.on_final = on_final
    msgs = [
        json.dumps({"channel":{"alternatives":[{"text":"hello","language":"en","confidence":0.9,"words":[]}],"is_final":False}}),
        json.dumps({"channel":{"alternatives":[{"text":"hello world.","language":"en","confidence":0.99,"words":[]}],"is_final":True}}),
    ]
    class FakeWS:
        def __aiter__(self):
            async def gen():
                for m in msgs:
                    yield m
            return gen()
    s.ws = FakeWS()
    import asyncio
    await s._receive_loop()
    assert len(interim_calls)==1
    assert len(final_calls)==1

@pytest.mark.asyncio
async def test_close_cancels_task():
    s = DeepgramStream(api_key="key")
    s._recv_task = AsyncMock()
    s._recv_task.cancel = MagicMock()
    s.ws = AsyncMock()
    await s.close()
    assert s.ws is None
    assert s._recv_task is None
