import pytest
import pytest_asyncio
from src.stt.base import STTProvider
from src.translate.base import TranslateProvider

class DummySTT(STTProvider):
    async def connect(self, language: str): self.connected=language
    async def send_pcm(self, chunk: bytes): self.chunk=chunk
    async def close(self): self.closed=True

class DummyTrans(TranslateProvider):
    async def translate(self, text: str, source: str, target: str) -> str:
        return f"{target}:{text}"

@pytest.mark.asyncio
async def test_stt_dummy():
    d = DummySTT()
    await d.connect("en")
    assert d.connected=="en"
    await d.send_pcm(b"abc")
    assert d.chunk==b"abc"
    await d.close()
    assert d.closed

@pytest.mark.asyncio
async def test_translate_base_stream():
    d = DummyTrans()
    res = await d.translate("hi","en","vi")
    assert res=="vi:hi"
    tokens=[]
    async for tok in d.translate_stream("hello","en","vi"):
        tokens.append(tok)
    assert "".join(tokens)=="vi:hello"

def test_prompts_import():
    from src.ai.prompts import SUMMARY_PROMPT
    assert "transcript" in SUMMARY_PROMPT.lower()

def test_ws_init():
    import src.ws
    assert src.ws is not None
