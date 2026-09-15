"""LLM Translate provider - Custom OpenAI-compatible only. ARCHITECTURE.md:4.4
Chỉ dùng CUSTOM_API_KEY / CUSTOM_BASE_URL / CUSTOM_MODEL (OpenAI-compatible: Ollama, vLLM, OpenRouter, Groq, Together...)
"""

import os

import httpx

from .base import TranslateProvider

PROMPT_TMPL = "You are a live caption translator. Translate from {src} to {tgt}, keep context, short and natural, no explanation. Text: {text}"


class LLMTranslator(TranslateProvider):
    def __init__(self):
        self.api_key = os.environ.get("CUSTOM_API_KEY", "")
        self.base_url = os.environ.get("CUSTOM_BASE_URL", "").rstrip("/")
        self.model = os.environ.get("CUSTOM_MODEL", "gpt-4o-mini")

    async def translate(self, text: str, source: str, target: str) -> str:
        if not text.strip() or source == target:
            return text
        if not self.api_key or not self.base_url:
            return f"[{target}] {text}"
        prompt = PROMPT_TMPL.format(src=source, tgt=target, text=text)
        url = f"{self.base_url}/chat/completions"
        async with httpx.AsyncClient() as client:
            try:
                r = await client.post(
                    url,
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    json={
                        "model": self.model,
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": 0.2,
                    },
                    timeout=10.0,
                )
                r.raise_for_status()
                data = r.json()
                return data["choices"][0]["message"]["content"].strip()
            except Exception as e:
                print(f"[llm] custom translate error ({url} model={self.model}): {e}")
                return f"[{target}] {text}"

    async def translate_stream(self, text: str, source: str, target: str):
        # simple non-streaming split into tokens
        full = await self.translate(text, source, target)
        for tok in full.split(" "):
            yield tok + " "
