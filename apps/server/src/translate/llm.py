"""LLM Translate provider - Gemini / OpenAI fallback (streaming). ARCHITECTURE.md:4.4"""

import os

import httpx

from .base import TranslateProvider

PROMPT_TMPL = "You are a live caption translator. Translate from {src} to {tgt}, keep context, short and natural, no explanation. Text: {text}"


class LLMTranslator(TranslateProvider):
    def __init__(self, provider: str = "auto"):
        self.provider = provider
        self.gemini_key = os.environ.get("GEMINI_API_KEY", "")
        self.openai_key = os.environ.get("OPENAI_API_KEY", "")
        self.custom_key = os.environ.get("CUSTOM_API_KEY", "")
        # base URL + model configurable per user request
        self.gemini_base = os.environ.get(
            "GEMINI_BASE_URL", "https://generativelanguage.googleapis.com"
        ).rstrip("/")
        self.gemini_model = os.environ.get("GEMINI_TRANSLATE_MODEL") or os.environ.get(
            "GEMINI_MODEL", "gemini-2.0-flash"
        )
        self.openai_base = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip(
            "/"
        )
        self.openai_model = os.environ.get("OPENAI_TRANSLATE_MODEL") or os.environ.get(
            "OPENAI_MODEL", "gpt-4o-mini"
        )
        self.custom_base = os.environ.get("CUSTOM_BASE_URL", "").rstrip("/")
        self.custom_model = os.environ.get("CUSTOM_MODEL", "gpt-4o-mini")

    async def translate(self, text: str, source: str, target: str) -> str:
        if not text.strip() or source == target:
            return text
        pref = (
            os.environ.get("TRANSLATE_PROVIDER", "llm")
            if self.provider == "auto"
            else self.provider
        )
        # custom provider: bất kỳ endpoint OpenAI-compatible nào (Ollama, vLLM, OpenRouter, Azure, Together...)
        if pref == "custom" and self.custom_base:
            return await self._custom(text, source, target)
        if self.gemini_key and pref in ("llm", "gemini", "auto"):
            return await self._gemini(text, source, target)
        if self.openai_key:
            return await self._openai(text, source, target)
        if self.custom_key and self.custom_base:
            return await self._custom(text, source, target)
        # fallback to google-style placeholder
        return f"[{target}] {text}"

    async def _gemini(self, text: str, source: str, target: str) -> str:
        prompt = PROMPT_TMPL.format(src=source, tgt=target, text=text)
        url = f"{self.gemini_base}/v1beta/models/{self.gemini_model}:generateContent?key={self.gemini_key}"
        async with httpx.AsyncClient() as client:
            try:
                r = await client.post(
                    url, json={"contents": [{"parts": [{"text": prompt}]}]}, timeout=10.0
                )
                r.raise_for_status()
                data = r.json()
                return data["candidates"][0]["content"]["parts"][0]["text"].strip()
            except Exception as e:
                print(f"[llm] gemini error ({url}): {e}")
                return f"[{target}] {text}"

    async def _openai(self, text: str, source: str, target: str) -> str:
        prompt = PROMPT_TMPL.format(src=source, tgt=target, text=text)
        url = f"{self.openai_base}/chat/completions"
        async with httpx.AsyncClient() as client:
            try:
                r = await client.post(
                    url,
                    headers={"Authorization": f"Bearer {self.openai_key}"},
                    json={
                        "model": self.openai_model,
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": 0.2,
                    },
                    timeout=10.0,
                )
                r.raise_for_status()
                data = r.json()
                return data["choices"][0]["message"]["content"].strip()
            except Exception as e:
                print(f"[llm] openai error ({url} model={self.openai_model}): {e}")
                return f"[{target}] {text}"

    async def _custom(self, text: str, source: str, target: str) -> str:
        prompt = PROMPT_TMPL.format(src=source, tgt=target, text=text)
        url = f"{self.custom_base}/chat/completions"
        async with httpx.AsyncClient() as client:
            try:
                r = await client.post(
                    url,
                    headers={"Authorization": f"Bearer {self.custom_key}"},
                    json={
                        "model": self.custom_model,
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": 0.2,
                    },
                    timeout=10.0,
                )
                r.raise_for_status()
                data = r.json()
                return data["choices"][0]["message"]["content"].strip()
            except Exception as e:
                print(f"[llm] custom error ({url} model={self.custom_model}): {e}")
                return f"[{target}] {text}"

    async def translate_stream(self, text: str, source: str, target: str):
        # simple non-streaming split into tokens
        full = await self.translate(text, source, target)
        for tok in full.split(" "):
            yield tok + " "
