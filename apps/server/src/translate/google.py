"""Google Cloud Translation v3 provider (with hash cache + rate limit)."""

import hashlib
import os
import time

import httpx

from .base import TranslateProvider


class GoogleTranslator(TranslateProvider):
    def __init__(self, api_key: str | None = None, rate_limit_per_sec: int = 8):
        self.api_key = api_key or os.environ.get("GOOGLE_TRANSLATE_KEY", "")
        self._cache: dict[str, str] = {}
        self._last_calls: list[float] = []
        self._rate = rate_limit_per_sec

    def _cache_key(self, source: str, target: str, text: str) -> str:
        h = hashlib.md5(text.encode()).hexdigest()[:8]
        return f"{source}:{target}:{h}"

    def _allow(self) -> bool:
        now = time.monotonic()
        self._last_calls = [t for t in self._last_calls if now - t < 1.0]
        if len(self._last_calls) >= self._rate:
            return False
        self._last_calls.append(now)
        return True

    async def translate(self, text: str, source: str, target: str) -> str:
        if not text.strip():
            return text
        if source == target:
            return text

        key = self._cache_key(source, target, text)
        if key in self._cache:
            return self._cache[key]

        if not self.api_key:
            return f"[{target}] {text}"

        if not self._allow():
            # rate-limited: return cached placeholder, will retry next call
            return f"[{target}] {text}"

        async with httpx.AsyncClient() as client:
            try:
                r = await client.post(
                    "https://translation.googleapis.com/language/translate/v2",
                    params={"key": self.api_key},
                    json={
                        "q": text,
                        "source": source if source != "auto" else "en",
                        "target": target,
                        "format": "text",
                    },
                    timeout=5.0,
                )
                r.raise_for_status()
                data = r.json()
                translated = data["data"]["translations"][0]["translatedText"]
                self._cache[key] = translated
                return translated
            except Exception as e:
                # fallback: try pa.googleapis endpoint
                try:
                    r = await client.post(
                        "https://translation-pa.googleapis.com/v3/translate",
                        headers={"x-goog-api-key": self.api_key},
                        json={
                            "content": [text],
                            "sourceLanguageCode": source,
                            "targetLanguageCode": target,
                            "mimeTypes": ["text/plain"],
                        },
                        timeout=5.0,
                    )
                    r.raise_for_status()
                    data = r.json()
                    translated = data["translations"][0]["translatedText"]
                    self._cache[key] = translated
                    return translated
                except Exception as e2:
                    print(f"[translate] google error: {e} / {e2}")
                    return f"[{target}] {text}"
