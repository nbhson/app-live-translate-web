import pytest
import json
import os
from unittest.mock import AsyncMock, patch, MagicMock
from src.ai.summarizer import Summarizer

@pytest.mark.asyncio
async def test_empty_transcript():
    s = Summarizer()
    res = await s.summarize("", window="full")
    assert "Chưa có" in res["summary"]

@pytest.mark.asyncio
async def test_fallback():
    s = Summarizer()
    s.gemini_key=""
    s.openai_key=""
    s.custom_key=""
    res = await s.summarize("Hello. World. Test.", window="full")
    assert "Hello" in res["summary"]
    assert len(res["keywords"])<=5

@pytest.mark.asyncio
async def test_gemini_success():
    s = Summarizer()
    s.gemini_key="key"
    s.gemini_model="gemini-2.0-flash"
    payload = {"summary":"- point","chapters":[],"actionItems":[],"keywords":["a"]}
    mock_resp = MagicMock()
    mock_resp.json.return_value = {"candidates":[{"content":{"parts":[{"text": json.dumps(payload)}]}}]}
    mock_resp.raise_for_status = MagicMock()
    with patch("httpx.AsyncClient") as MockClient:
        mock_client = AsyncMock()
        mock_client.post.return_value = mock_resp
        MockClient.return_value.__aenter__.return_value = mock_client
        res = await s.summarize("Hello world " * 100, window="full")
        assert res["summary"] == "- point"

@pytest.mark.asyncio
async def test_openai_success():
    s = Summarizer()
    s.openai_key="okey"
    s.provider_pref="openai"
    payload = {"summary":"- openai","chapters":[],"actionItems":[],"keywords":[]}
    mock_resp = MagicMock()
    mock_resp.json.return_value = {"choices":[{"message":{"content": json.dumps(payload)}}]}
    mock_resp.raise_for_status = MagicMock()
    with patch("httpx.AsyncClient") as MockClient:
        mock_client = AsyncMock()
        mock_client.post.return_value = mock_resp
        MockClient.return_value.__aenter__.return_value = mock_client
        res = await s.summarize("Hello world", window="30s")
        assert res["summary"] == "- openai"

@pytest.mark.asyncio
async def test_custom_success():
    s = Summarizer()
    s.custom_key="ckey"
    s.custom_base="http://localhost:11434/v1"
    s.custom_model="llama3"
    s.provider_pref="custom"
    payload = {"summary":"- custom","chapters":[],"actionItems":[],"keywords":[]}
    mock_resp = MagicMock()
    mock_resp.json.return_value = {"choices":[{"message":{"content": json.dumps(payload)}}]}
    mock_resp.raise_for_status = MagicMock()
    with patch("httpx.AsyncClient") as MockClient:
        mock_client = AsyncMock()
        mock_client.post.return_value = mock_resp
        MockClient.return_value.__aenter__.return_value = mock_client
        res = await s.summarize("Hello", window="full")
        assert res["summary"] == "- custom"

@pytest.mark.asyncio
async def test_gemini_error_fallback():
    s = Summarizer()
    s.gemini_key="key"
    with patch("httpx.AsyncClient") as MockClient:
        mock_client = AsyncMock()
        mock_client.post.side_effect = Exception("net")
        MockClient.return_value.__aenter__.return_value = mock_client
        res = await s.summarize("Hello world test fallback", window="full")
        assert "Hello" in res["summary"]

@pytest.mark.asyncio
async def test_summarize_stream():
    s = Summarizer()
    s.gemini_key=""
    s.openai_key=""
    tokens=[]
    async for tok in s.summarize_stream("Hello. World.", window="full"):
        tokens.append(tok)
    assert len(tokens)>0

def test_window_truncation():
    s = Summarizer()
    # ensure 30s truncates
    import asyncio
    long = "a"*2000
    # run fallback path
    s.gemini_key=""
    s.openai_key=""
    res = asyncio.run(s.summarize(long, window="30s"))
    assert res is not None
