"""LLM Translate provider - Custom OpenAI-compatible only. ARCHITECTURE.md:4.4
Chỉ dùng CUSTOM_API_KEY / CUSTOM_BASE_URL / CUSTOM_MODEL (OpenAI-compatible: Ollama, vLLM, OpenRouter, Groq, Together...)
"""

import json
import logging
import os

import httpx

from .base import TranslateProvider

logger = logging.getLogger("lt-server")

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
        """Stream thật qua backend OpenAI-compatible (SSE, `stream: true`).

        Mỗi delta `choices[0].delta.content` từ SSE được yield nguyên vẹn cho caller
        (main.py emit `translate:stream`). Đảm bảo an toàn:
        - Lỗi kết nối / HTTP error / stream rỗng -> fallback one-shot `translate()`
          và yield kết quả một lần, nên client luôn nhận đủ text.
        - Lỗi giữa chừng (đã emit một phần) -> log và dừng, không yield lặp.
        """
        if not text.strip() or source == target:
            yield text
            return
        if not self.api_key or not self.base_url:
            yield f"[{target}] {text}"
            return
        prompt = PROMPT_TMPL.format(src=source, tgt=target, text=text)
        url = f"{self.base_url}/chat/completions"
        emitted = False
        try:
            async with httpx.AsyncClient() as client:
                async with client.stream(
                    "POST",
                    url,
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    json={
                        "model": self.model,
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": 0.2,
                        "stream": True,
                    },
                    timeout=15.0,
                ) as r:
                    r.raise_for_status()
                    async for line in r.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        data = line[5:].strip()
                        if not data:
                            continue
                        if data == "[DONE]":
                            break
                        try:
                            delta = json.loads(data)["choices"][0].get("delta", {}).get("content")
                        except Exception:
                            continue
                        if delta:
                            emitted = True
                            yield delta
        except Exception as e:
            logger.error(f"[llm] stream translate error ({url} model={self.model}): {e}")
        if not emitted:
            # backend không stream được (lỗi / SSE trống) -> one-shot fallback
            yield await self.translate(text, source, target)
