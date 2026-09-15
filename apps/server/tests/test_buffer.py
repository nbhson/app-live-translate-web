import asyncio
import time
from src.translate.buffer import SentenceBuffer

def test_punct_split():
    out=[]
    b = SentenceBuffer("en", lambda s: out.append(s))
    b.push("Hello world.")
    assert out == ["Hello world."]
    out.clear()
    b.push("Hi. There.")
    assert len(out)==2

def test_punct_incomplete_flush_on_eos():
    out=[]
    b = SentenceBuffer("en", lambda s: out.append(s))
    b.push("Incomplete without punct")
    assert out==[]
    b.push(" still incomplete", True)
    assert len(out)==1
    assert "Incomplete" in out[0]

def test_flush():
    out=[]
    b = SentenceBuffer("en", lambda s: out.append(s))
    b.push("Pending text")
    b.flush()
    assert out==["Pending text"]
    out.clear()
    b.flush()
    assert out==[]

def test_non_punct_eos():
    out=[]
    b = SentenceBuffer("ja", lambda s: out.append(s))
    b.push("こんにちは世界", True)
    assert out==["こんにちは世界"]

def test_non_punct_length_split():
    out=[]
    b = SentenceBuffer("ja", lambda s: out.append(s), pause_ms=99999)
    long = " ".join(["word"]*13)
    b.push(long)
    assert len(out)==1
    assert len(out[0].split())==12

def test_set_language():
    out=[]
    b = SentenceBuffer("en", lambda s: out.append(s))
    b.set_language("ja")
    b.push("hello", True)
    assert len(out)==1

def test_empty_push():
    out=[]
    b = SentenceBuffer("en", lambda s: out.append(s))
    b.push("   ")
    assert out==[]

def test_pause_flush_punct():
    out=[]
    b = SentenceBuffer("en", lambda s: out.append(s), pause_ms=1)
    b.push("This is pending text")
    time.sleep(0.01)
    b.push("more words here")
    # after pause heuristic, should have flushed
    assert len(out)>=1

def test_pause_flush_non_punct():
    out=[]
    b = SentenceBuffer("ja", lambda s: out.append(s), pause_ms=1)
    b.push("word word word")
    time.sleep(0.01)
    b.push("more", False)
    assert len(out)>=1

import pytest

@pytest.mark.asyncio
async def test_async_callback():
    out=[]
    async def cb(s):
        out.append(s)
    b = SentenceBuffer("en", cb)
    b.push("Hello async.")
    await asyncio.sleep(0.05)
    assert "Hello async." in out
