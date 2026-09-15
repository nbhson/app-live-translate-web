"""Phase 3 AI Service: realtime summary, chapters, action items.
Runs parallel to translate, buffered 30s-5m, streams via ws events summary:chunk / summary:final
Chỉ dùng CUSTOM_API_KEY / CUSTOM_BASE_URL / CUSTOM_MODEL (OpenAI-compatible).
"""

import os
from collections.abc import AsyncIterator

import httpx

PROMPT_SUMMARY = """You are a live meeting assistant. Given transcript, produce JSON with:
- summary: string with 3-5 bullet points in markdown (e.g. "- point\\n- point")
- chapters: [{{title, start_ms}}] if topic shift detected
- actionItems: list of tasks with owner/deadline if any
- keywords: 5 keywords
Keep language same as transcript unless asked. Transcript:
{transcript}
Return JSON only. summary must be a single markdown string, not an array."""


class Summarizer:
    def __init__(self):
        self.api_key = os.environ.get("CUSTOM_API_KEY", "")
        self.base_url = os.environ.get("CUSTOM_BASE_URL", "").rstrip("/")
        self.model = os.environ.get("CUSTOM_MODEL", "gpt-4o-mini")

    async def summarize(self, transcript: str, window: str = "full") -> dict:
        if not transcript.strip():
            return {
                "summary": "Chưa có transcript đủ dài.",
                "chapters": [],
                "actionItems": [],
                "keywords": [],
            }
        if window == "30s":
            transcript = transcript[-1500:]
        else:
            transcript = transcript[-8000:]

        if not self.api_key or not self.base_url:
            return self._fallback(transcript)
        return await self._custom(transcript)

    def _normalize(self, data: dict) -> dict:
        s = data.get("summary", "")
        if isinstance(s, list):
            parts = []
            for item in s:
                if isinstance(item, str):
                    parts.append(item if item.strip().startswith("-") else f"- {item}")
                else:
                    parts.append(str(item))
            data["summary"] = "\n".join(parts)
        elif not isinstance(s, str):
            data["summary"] = str(s)
        return data

    async def summarize_stream(self, transcript: str, window: str = "full") -> AsyncIterator[str]:
        result = await self.summarize(transcript, window)
        text = result.get("summary", "")
        if isinstance(text, list):
            text = "\n".join(text)
        for w in text.split(" "):
            yield w + " "

    async def _custom(self, transcript: str) -> dict:
        prompt = PROMPT_SUMMARY.format(transcript=transcript)
        url = f"{self.base_url}/chat/completions"
        async with httpx.AsyncClient() as client:
            try:
                r = await client.post(
                    url,
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    json={
                        "model": self.model,
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": 0.3,
                        "response_format": {"type": "json_object"},
                    },
                    timeout=12.0,
                )
                r.raise_for_status()
                import json as _j

                txt = r.json()["choices"][0]["message"]["content"]
                data_j = _j.loads(txt)
                return self._normalize(data_j)
            except Exception as e:
                print(f"[ai] custom summarize error ({url} model={self.model}): {e}")
                return self._fallback(transcript)

    def _fallback(self, transcript: str) -> dict:
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
