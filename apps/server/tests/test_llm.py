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
    os.environ.pop("CUSTOM_API_KEY", None)
    os.environ.pop("CUSTOM_BASE_URL", None)
    t = LLMTranslator()
    assert await t.translate("hello", "en", "vi") == "[vi] hello"

@pytest.mark.asyncio
async def test_custom_success():
    t = LLMTranslator()
    # set via env for constructor
    os.environ["CUSTOM_API_KEY"] = "ckey"
    os.environ["CUSTOM_BASE_URL"] = "http://localhost:11434/v1"
    os.environ["CUSTOM_MODEL"] = "llama3.1"
    t2 = LLMTranslator()
    mock_resp = MagicMock()
    mock_resp.json.return_value = {"choices":[{"message":{"content":"Custom translation"}}]}
    mock_resp.raise_for_status = MagicMock()
    with patch("httpx.AsyncClient") as MockClient:
        mock_client = AsyncMock()
        mock_client.post.return_value = mock_resp
        MockClient.return_value.__aenter__.return_value = mock_client
        res = await t2.translate("hello", "en", "vi")
        assert res == "Custom translation"
    os.environ.pop("CUSTOM_API_KEY", None)
    os.environ.pop("CUSTOM_BASE_URL", None)
    os.environ.pop("CUSTOM_MODEL", None)

@pytest.mark.asyncio
async def test_custom_error_fallback():
    os.environ["CUSTOM_API_KEY"] = "ckey"
    os.environ["CUSTOM_BASE_URL"] = "http://localhost:11434/v1"
    t = LLMTranslator()
    with patch("httpx.AsyncClient") as MockClient:
        mock_client = AsyncMock()
        mock_client.post.side_effect = Exception("net")
        MockClient.return_value.__aenter__.return_value = mock_client
        res = await t.translate("hello", "en", "vi")
        assert res == "[vi] hello"
    os.environ.pop("CUSTOM_API_KEY", None)
    os.environ.pop("CUSTOM_BASE_URL", None)

@pytest.mark.asyncio
async def test_translate_stream():
    os.environ.pop("CUSTOM_API_KEY", None)
    os.environ.pop("CUSTOM_BASE_URL", None)
    t = LLMTranslator()
    tokens = []
    async for tok in t.translate_stream("hello", "en", "vi"):
        tokens.append(tok)
    assert len(tokens)>0
    assert "".join(tokens).strip() == "[vi] hello"

def test_custom_base_url_config():
    os.environ["CUSTOM_BASE_URL"] = "http://custom:8000/v1"
    os.environ["CUSTOM_MODEL"] = "my-model"
    t = LLMTranslator()
    assert t.base_url == "http://custom:8000/v1"
    assert t.model == "my-model"
    os.environ.pop("CUSTOM_BASE_URL", None)
    os.environ.pop("CUSTOM_MODEL", None)
