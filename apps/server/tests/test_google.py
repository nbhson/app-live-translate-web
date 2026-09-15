import pytest
import os
from unittest.mock import AsyncMock, patch, MagicMock
from src.translate.google import GoogleTranslator

@pytest.mark.asyncio
async def test_same_lang_returns_text():
    t = GoogleTranslator(api_key="fake")
    assert await t.translate("hello", "en", "en") == "hello"

@pytest.mark.asyncio
async def test_empty_returns():
    t = GoogleTranslator(api_key="fake")
    assert await t.translate("   ", "en", "vi") == "   "

@pytest.mark.asyncio
async def test_no_api_key_fallback():
    t = GoogleTranslator(api_key="")
    os.environ.pop("GOOGLE_TRANSLATE_KEY", None)
    t2 = GoogleTranslator(api_key="")
    res = await t2.translate("hello", "en", "vi")
    assert res == "[vi] hello"

@pytest.mark.asyncio
async def test_cache_hit():
    t = GoogleTranslator(api_key="fake")
    t._cache[t._cache_key("en","vi","hello")] = "Xin chào"
    res = await t.translate("hello", "en", "vi")
    assert res == "Xin chào"

@pytest.mark.asyncio
async def test_rate_limit():
    t = GoogleTranslator(api_key="fake", rate_limit_per_sec=1)
    with patch("src.translate.google.time") as tm:
        tm.monotonic.return_value = 10.0
        t._last_calls = []
        assert t._allow() == True
        # second call within same second should be blocked when rate=1
        tm.monotonic.return_value = 10.2
        assert t._allow() == False
        # after 1 sec window passes, should allow again
        tm.monotonic.return_value = 11.5
        assert t._allow() == True

@pytest.mark.asyncio
async def test_successful_translate_v2():
    t = GoogleTranslator(api_key="key123")
    mock_resp = MagicMock()
    mock_resp.json.return_value = {"data":{"translations":[{"translatedText":"Xin chao"}]}}
    mock_resp.raise_for_status = MagicMock()
    with patch("httpx.AsyncClient") as MockClient:
        mock_client = AsyncMock()
        mock_client.post.return_value = mock_resp
        MockClient.return_value.__aenter__.return_value = mock_client
        res = await t.translate("hello", "en", "vi")
        assert res == "Xin chao"
        assert t._cache[t._cache_key("en","vi","hello")] == "Xin chao"

@pytest.mark.asyncio
async def test_fallback_pa_api():
    t = GoogleTranslator(api_key="key123")
    # first call fails, second succeeds
    mock_fail = MagicMock()
    mock_fail.raise_for_status.side_effect = Exception("fail v2")
    mock_success = MagicMock()
    mock_success.json.return_value = {"translations":[{"translatedText":"Hola"}]}
    mock_success.raise_for_status = MagicMock()
    with patch("httpx.AsyncClient") as MockClient:
        mock_client = AsyncMock()
        mock_client.post.side_effect = [mock_fail, mock_success]
        # need to mock json for first? but it throws before json
        # adjust: first post returns mock_fail which raises, second returns success
        MockClient.return_value.__aenter__.return_value = mock_client
        # Mock the first call's json not called
        res = await t.translate("hello", "en", "es")
        assert res == "Hola"

@pytest.mark.asyncio
async def test_all_fail_returns_placeholder():
    t = GoogleTranslator(api_key="key123")
    with patch("httpx.AsyncClient") as MockClient:
        mock_client = AsyncMock()
        mock_client.post.side_effect = Exception("net error")
        MockClient.return_value.__aenter__.return_value = mock_client
        res = await t.translate("hello", "en", "vi")
        assert res == "[vi] hello"

def test_cache_key_hash():
    t = GoogleTranslator(api_key="x")
    k1 = t._cache_key("en","vi","hello")
    k2 = t._cache_key("en","vi","hello world")
    assert k1 != k2
    assert k1.startswith("en:vi:")
