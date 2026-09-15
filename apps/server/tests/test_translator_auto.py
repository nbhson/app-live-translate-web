import os

def test_get_translator_auto_free():
    # no keys -> free
    for k in ["CUSTOM_API_KEY","CUSTOM_BASE_URL","TRANSLATE_PROVIDER"]:
        os.environ.pop(k, None)
    os.environ["TRANSLATE_PROVIDER"]="auto"
    from src.main import get_translator
    from src.translate.free import MyMemoryTranslator
    assert isinstance(get_translator(), MyMemoryTranslator)

def test_get_translator_auto_ai():
    os.environ["CUSTOM_API_KEY"]="key"
    os.environ["CUSTOM_BASE_URL"]="http://localhost:11434/v1"
    os.environ["TRANSLATE_PROVIDER"]="auto"
    from src.main import get_translator
    from src.translate.llm import LLMTranslator
    assert isinstance(get_translator(), LLMTranslator)
    os.environ.pop("CUSTOM_API_KEY", None)
    os.environ.pop("CUSTOM_BASE_URL", None)

def test_get_translator_explicit_free():
    os.environ["TRANSLATE_PROVIDER"]="free"
    from src.main import get_translator
    from src.translate.free import MyMemoryTranslator
    assert isinstance(get_translator(), MyMemoryTranslator)
    os.environ["TRANSLATE_PROVIDER"]="auto"

def test_get_translator_explicit_ai():
    os.environ["TRANSLATE_PROVIDER"]="ai"
    from src.main import get_translator
    from src.translate.llm import LLMTranslator
    assert isinstance(get_translator(), LLMTranslator)
    os.environ["TRANSLATE_PROVIDER"]="auto"

def test_deepgram_ssl_context():
    from src.stt.deepgram import _ssl_context
    import os
    os.environ["DEEPGRAM_INSECURE_SSL"]="1"
    ctx = _ssl_context()
    assert ctx is not None
    os.environ.pop("DEEPGRAM_INSECURE_SSL", None)
    ctx2 = _ssl_context()
    assert ctx2 is not None
