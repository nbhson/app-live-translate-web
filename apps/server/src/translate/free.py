"""Free translate provider - MyMemory (mymemory.translated.net).

Free tier: không cần key, giới hạn ~5000 ký tự/ngày/IP, đủ cho demo.
Fallback khi TRANSLATE_PROVIDER=free hoặc thiếu CUSTOM_API_KEY/CUSTOM_BASE_URL.
Docs: https://mymemory.translated.net/doc/spec.php
API: https://api.mymemory.translated.net/get?q=hello&langpair=en|vi
"""
import hashlib
import httpx
from .base import TranslateProvider


class MyMemoryTranslator(TranslateProvider):
    def __init__(self):
        self._cache: dict[str, str] = {}
        self._base = "https://api.mymemory.translated.net/get"

    def _key(self, source: str, target: str, text: str) -> str:
        h = hashlib.md5(text.encode()).hexdigest()[:8]
        return f"{source}:{target}:{h}"

    async def translate(self, text: str, source: str, target: str) -> str:
        if not text.strip() or source == target:
            return text
        # MyMemory dùng langpair en|vi ; auto -> en
        src = "en" if source == "auto" else source
        key = self._key(src, target, text)
        if key in self._cache:
            return self._cache[key]
        # MyMemory giới hạn nên nếu text quá dài, cắt 500 ký tự
        q = text[:500]
        try:
            async with httpx.AsyncClient() as client:
                r = await client.get(
                    self._base,
                    params={"q": q, "langpair": f"{src}|{target}"},
                    timeout=8.0,
                )
                r.raise_for_status()
                data = r.json()
                translated = data.get("responseData", {}).get("translatedText", "")
                status = data.get("responseStatus")
                # MyMemory trả status 200 khi ok, 429 khi quota
                if status == 429:
                    print("[free] MyMemory quota hit, fallback placeholder")
                    return f"[{target}] {text}"
                if translated and translated.strip():
                    self._cache[key] = translated
                    return translated
                # fallback: thử LibreTranslate public instance
                return await self._libre_fallback(text, src, target)
        except Exception as e:
            print(f"[free] MyMemory error: {e}")
            return await self._libre_fallback(text, src, target)

    async def _libre_fallback(self, text: str, source: str, target: str) -> str:
        """Thử LibreTranslate public mirror (không cần key)."""
        try:
            async with httpx.AsyncClient() as client:
                r = await client.post(
                    "https://libretranslate.com/translate",
                    json={"q": text[:500], "source": source if source != "auto" else "en", "target": target, "format": "text"},
                    timeout=8.0,
                )
                if r.status_code == 200:
                    data = r.json()
                    t = data.get("translatedText")
                    if t:
                        return t
        except Exception as e:
            print(f"[free] LibreTranslate fallback error: {e}")
        return f"[{target}] {text}"
