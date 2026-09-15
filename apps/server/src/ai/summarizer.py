"""Phase 3 AI Service: realtime summary, chapters, action items.
Runs parallel to translate, buffered 30s-5m, streams via ws events summary:chunk / summary:final
Uses Gemini 2.0 Flash or GPT-4o-mini; falls back to heuristic if no keys.
"""

import os
from collections.abc import AsyncIterator

import httpx

PROMPT_SUMMARY = """You are a live meeting assistant. Given transcript, produce JSON with:
- summary: 3-5 bullet points (markdown)
- chapters: [{{title, start_ms}}] if topic shift detected
- actionItems: list of tasks with owner/deadline if any
- keywords: 5 keywords
Keep language same as transcript unless asked. Transcript:
{transcript}
Return JSON only."""


class Summarizer:
    def __init__(self):
        self.gemini_key = os.environ.get("GEMINI_API_KEY", "")
        self.openai_key = os.environ.get("OPENAI_API_KEY", "")
        self.custom_key = os.environ.get("CUSTOM_API_KEY", "")
        self.gemini_base = os.environ.get(
            "GEMINI_BASE_URL", "https://generativelanguage.googleapis.com"
        ).rstrip("/")
        self.gemini_model = os.environ.get("SUMMARY_MODEL") or os.environ.get(
            "GEMINI_MODEL", "gemini-2.0-flash"
        )
        self.openai_base = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip(
            "/"
        )
        self.openai_model = os.environ.get("SUMMARY_MODEL") or os.environ.get(
            "OPENAI_MODEL", "gpt-4o-mini"
        )
        self.custom_base = os.environ.get("CUSTOM_BASE_URL", "").rstrip("/")
        self.custom_model = os.environ.get("CUSTOM_MODEL", "gpt-4o-mini")
        self.provider_pref = os.environ.get("SUMMARY_PROVIDER", "auto")  # gemini|openai|custom|auto

    async def summarize(self, transcript: str, window: str = "full") -> dict:
        if not transcript.strip():
            return {
                "summary": "Chưa có transcript đủ dài.",
                "chapters": [],
                "actionItems": [],
                "keywords": [],
            }
        # truncate to last 8000 chars for window
        if window == "30s":
            transcript = transcript[-1500:]
        else:
            transcript = transcript[-8000:]

        if self.provider_pref == "custom" and self.custom_base:
            return await self._custom(transcript)
        use_gemini = self.gemini_key and self.provider_pref in ("auto", "gemini")
        use_openai = self.openai_key and self.provider_pref in ("auto", "openai")
        if use_gemini:
            return await self._gemini(transcript)
        if use_openai:
            return await self._openai(transcript)
        if self.custom_key and self.custom_base:
            return await self._custom(transcript)
        # fallback if pref mismatched
        if self.gemini_key:
            return await self._gemini(transcript)
        if self.openai_key:
            return await self._openai(transcript)
        # heuristic fallback
        return self._fallback(transcript)

    async def summarize_stream(self, transcript: str, window: str = "full") -> AsyncIterator[str]:
        result = await self.summarize(transcript, window)
        text = result["summary"]
        # stream word by word
        for w in text.split(" "):
            yield w + " "

    async def _gemini(self, transcript: str) -> dict:
        url = f"{self.gemini_base}/v1beta/models/{self.gemini_model}:generateContent?key={self.gemini_key}"
        prompt = PROMPT_SUMMARY.format(transcript=transcript)
        async with httpx.AsyncClient() as client:
            try:
                r = await client.post(
                    url,
                    json={
                        "contents": [{"parts": [{"text": prompt}]}],
                        "generationConfig": {"response_mime_type": "application/json"},
                    },
                    timeout=12.0,
                )
                r.raise_for_status()
                data = r.json()
                txt = data["candidates"][0]["content"]["parts"][0]["text"]
                import json as _j

                return _j.loads(txt)
            except Exception as e:
                print(f"[ai] gemini summarize error ({url} model={self.gemini_model}): {e}")
                return self._fallback(transcript)

    async def _openai(self, transcript: str) -> dict:
        prompt = PROMPT_SUMMARY.format(transcript=transcript)
        url = f"{self.openai_base}/chat/completions"
        async with httpx.AsyncClient() as client:
            try:
                r = await client.post(
                    url,
                    headers={"Authorization": f"Bearer {self.openai_key}"},
                    json={
                        "model": self.openai_model,
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": 0.3,
                        "response_format": {"type": "json_object"},
                    },
                    timeout=12.0,
                )
                r.raise_for_status()
                import json as _j

                txt = r.json()["choices"][0]["message"]["content"]
                return _j.loads(txt)
            except Exception as e:
                print(f"[ai] openai summarize error ({url} model={self.openai_model}): {e}")
                return self._fallback(transcript)

    async def _custom(self, transcript: str) -> dict:
        prompt = PROMPT_SUMMARY.format(transcript=transcript)
        url = f"{self.custom_base}/chat/completions"
        async with httpx.AsyncClient() as client:
            try:
                r = await client.post(
                    url,
                    headers={"Authorization": f"Bearer {self.custom_key}"},
                    json={
                        "model": self.custom_model,
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": 0.3,
                        "response_format": {"type": "json_object"},
                    },
                    timeout=12.0,
                )
                r.raise_for_status()
                import json as _j

                txt = r.json()["choices"][0]["message"]["content"]
                return _j.loads(txt)
            except Exception as e:
                print(f"[ai] custom summarize error ({url} model={self.custom_model}): {e}")
                return self._fallback(transcript)

    def _fallback(self, transcript: str) -> dict:
        # naive extract
        sentences = [s.strip() for s in transcript.split(".") if s.strip()]
        summary = "- " + "\n- ".join(sentences[:5]) if sentences else "- Chưa đủ dữ liệu"
        keywords = []
        for s in sentences:
            for w in s.split():
                if len(w) > 4 and w.lower() not in keywords:
                    keywords.append(w.lower())
                if len(keywords) >= 5:
                    break
            if len(keywords) >= 5:
                break
        return {
            "summary": summary,
            "chapters": [
                {"title": s[:30], "start_ms": i * 30000} for i, s in enumerate(sentences[:3])
            ],
            "actionItems": [],
            "keywords": keywords[:5],
        }


summarizer = Summarizer()
