import pytest
import os
from unittest.mock import AsyncMock, patch, MagicMock
from src.translate.llm import LLMTranslator

@pytest.mark.asyncio
async def test_same_lang():
    t = LLMTranslator()
    assert await t.translate("hi", "en", "en") == "hi"

@pytest.mark.asyncio
async def test_no_keys_fallback():
    os.environ.pop("GEMINI_API_KEY", None)
    os.environ.pop("OPENAI_API_KEY", None)
    os.environ.pop("CUSTOM_API_KEY", None)
    t = LLMTranslator()
    t.gemini_key = ""
    t.openai_key = ""
    t.custom_key = ""
    assert await t.translate("hello", "en", "vi") == "[vi] hello"

@pytest.mark.asyncio
async def test_gemini_success():
    t = LLMTranslator()
    t.gemini_key = "gkey"
    t.openai_key = ""
    mock_resp = MagicMock()
    mock_resp.json.return_value = {"candidates":[{"content":{"parts":[{"text":"Xin chào"}]}}]}
    mock_resp.raise_for_status = MagicMock()
    with patch("httpx.AsyncClient") as MockClient:
        mock_client = AsyncMock()
        mock_client.post.return_value = mock_resp
        MockClient.return_value.__aenter__.return_value = mock_client
        res = await t.translate("hello", "en", "vi")
        assert res == "Xin chào"

@pytest.mark.asyncio
async def test_openai_success():
    t = LLMTranslator()
    t.gemini_key = ""
    t.openai_key = "okey"
    t.openai_model = "gpt-4o-mini"
    mock_resp = MagicMock()
    mock_resp.json.return_value = {"choices":[{"message":{"content":"Hola"}}]}
    mock_resp.raise_for_status = MagicMock()
    with patch("httpx.AsyncClient") as MockClient:
        mock_client = AsyncMock()
        mock_client.post.return_value = mock_resp
        MockClient.return_value.__aenter__.return_value = mock_client
        res = await t.translate("hello", "en", "es")
        assert res == "Hola"

@pytest.mark.asyncio
async def test_custom_success():
    t = LLMTranslator()
    t.gemini_key = ""
    t.openai_key = ""
    t.custom_key = "ckey"
    t.custom_base = "http://localhost:11434/v1"
    t.custom_model = "llama3.1"
    os.environ["TRANSLATE_PROVIDER"] = "custom"
    mock_resp = MagicMock()
    mock_resp.json.return_value = {"choices":[{"message":{"content":"Custom translation"}}]}
    mock_resp.raise_for_status = MagicMock()
    with patch("httpx.AsyncClient") as MockClient:
        mock_client = AsyncMock()
        mock_client.post.return_value = mock_resp
        MockClient.return_value.__aenter__.return_value = mock_client
        res = await t.translate("hello", "en", "vi")
        assert res == "Custom translation"
    os.environ.pop("TRANSLATE_PROVIDER", None)

@pytest.mark.asyncio
async def test_gemini_error_fallback():
    t = LLMTranslator()
    t.gemini_key = "gkey"
    t.openai_key = ""
    with patch("httpx.AsyncClient") as MockClient:
        mock_client = AsyncMock()
        mock_client.post.side_effect = Exception("net")
        MockClient.return_value.__aenter__.return_value = mock_client
        res = await t.translate("hello", "en", "vi")
        assert res == "[vi] hello"

@pytest.mark.asyncio
async def test_translate_stream():
    t = LLMTranslator()
    t.gemini_key = ""
    t.openai_key = ""
    t.custom_key = ""
    # fallback will return placeholder, stream splits it
    tokens = []
    async for tok in t.translate_stream("hello", "en", "vi"):
        tokens.append(tok)
    assert len(tokens)>0
    assert "".join(tokens).strip() == "[vi] hello"

def test_custom_base_url_config():
    os.environ["CUSTOM_BASE_URL"] = "http://custom:8000/v1"
    os.environ["CUSTOM_MODEL"] = "my-model"
    t = LLMTranslator()
    assert t.custom_base == "http://custom:8000/v1"
    assert t.custom_model == "my-model"
    os.environ.pop("CUSTOM_BASE_URL", None)
    os.environ.pop("CUSTOM_MODEL", None)
