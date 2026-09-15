import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from src.translate.free import MyMemoryTranslator

@pytest.mark.asyncio
async def test_same_lang():
    t = MyMemoryTranslator()
    assert await t.translate("hello","en","en") == "hello"

@pytest.mark.asyncio
async def test_empty():
    t = MyMemoryTranslator()
    assert await t.translate("  ","en","vi") == "  "

@pytest.mark.asyncio
async def test_cache_hit():
    t = MyMemoryTranslator()
    k = t._key("en","vi","hello")
    t._cache[k] = "Xin chào"
    assert await t.translate("hello","en","vi") == "Xin chào"

@pytest.mark.asyncio
async def test_mymemory_success():
    t = MyMemoryTranslator()
    mock_resp = MagicMock()
    mock_resp.json.return_value = {"responseData":{"translatedText":"Xin chào"},"responseStatus":200}
    mock_resp.raise_for_status = MagicMock()
    with patch("httpx.AsyncClient") as MockClient:
        mock_client = AsyncMock()
        mock_client.get.return_value = mock_resp
        MockClient.return_value.__aenter__.return_value = mock_client
        res = await t.translate("hello","en","vi")
        assert res == "Xin chào"

@pytest.mark.asyncio
async def test_mymemory_fallback_to_libre():
    t = MyMemoryTranslator()
    # mymemory returns empty -> libre fallback succeeds
    mock_resp = MagicMock()
    mock_resp.json.return_value = {"responseData":{"translatedText":""},"responseStatus":200}
    mock_resp.raise_for_status = MagicMock()
    mock_libre = MagicMock()
    mock_libre.json.return_value = {"translatedText":"Hola"}
    mock_libre.status_code = 200
    with patch("httpx.AsyncClient") as MockClient:
        mock_client = AsyncMock()
        mock_client.get.return_value = mock_resp
        mock_client.post.return_value = mock_libre
        MockClient.return_value.__aenter__.return_value = mock_client
        res = await t.translate("hello","en","es")
        assert res == "Hola"

@pytest.mark.asyncio
async def test_quota_429():
    t = MyMemoryTranslator()
    mock_resp = MagicMock()
    mock_resp.json.return_value = {"responseData":{"translatedText":"hello"},"responseStatus":429}
    mock_resp.raise_for_status = MagicMock()
    with patch("httpx.AsyncClient") as MockClient:
        mock_client = AsyncMock()
        mock_client.get.return_value = mock_resp
        MockClient.return_value.__aenter__.return_value = mock_client
        res = await t.translate("hello","en","vi")
        assert res == "[vi] hello"

@pytest.mark.asyncio
async def test_network_error_fallback():
    t = MyMemoryTranslator()
    with patch("httpx.AsyncClient") as MockClient:
        mock_client = AsyncMock()
        mock_client.get.side_effect = Exception("net")
        mock_client.post.side_effect = Exception("net")
        MockClient.return_value.__aenter__.return_value = mock_client
        res = await t.translate("hello","en","vi")
        assert res == "[vi] hello"

def test_key_hash():
    t = MyMemoryTranslator()
    assert t._key("en","vi","hello") != t._key("en","vi","hello2")
