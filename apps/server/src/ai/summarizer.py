"""Phase 3 AI Service: realtime summary, chapters, action items.
Runs parallel to translate, buffered 30s-5m, streams via ws events summary:chunk / summary:final
Chỉ dùng CUSTOM_API_KEY / CUSTOM_BASE_URL / CUSTOM_MODEL (OpenAI-compatible).
"""

import os
from collections.abc import AsyncIterator

import httpx

PROMPT_SUMMARY = """You are a live meeting assistant. Summarize the transcript concisely - DO NOT just repeat the transcript.
Given transcript, produce JSON with:
- summary: 3-5 bullet points in markdown, each bullet is a distilled insight (e.g. "- point\\n- point"), NOT verbatim sentences. Keep it short, capture main ideas, decisions, and conclusions.
- chapters: [{{title, start_ms}}] if topic shift detected (title is 3-6 words)
- actionItems: list of tasks with owner/deadline if any (e.g. "John: send report by Friday")
- keywords: 5 most important keywords
Keep language same as transcript unless asked. If transcript is short (<2 sentences), still summarize in 1-2 bullets.
Transcript:
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
                import re

                txt = r.json()["choices"][0]["message"]["content"] or ""
                txt = txt.strip()
                # strip markdown fences ```json ... ```
                if txt.startswith("```"):
                    m = re.search(r"```(?:json)?\s*(.*?)\s*```", txt, re.DOTALL)
                    if m:
                        txt = m.group(1).strip()
                try:
                    data_j = _j.loads(txt)
                    return self._normalize(data_j)
                except Exception:
                    # Some models ignore json_object and return markdown bullets directly
                    # Extract JSON substring if exists
                    m = re.search(r"\{.*\}", txt, re.DOTALL)
                    if m:
                        try:
                            data_j = _j.loads(m.group(0))
                            return self._normalize(data_j)
                        except Exception:
                            pass
                    # Treat entire response as summary if not JSON
                    if txt and len(txt) > 10:
                        return {
                            "summary": txt if txt.strip().startswith("-") else "- " + txt.replace("\n", "\n- "),
                            "chapters": [],
                            "actionItems": [],
                            "keywords": [],
                        }
                    raise
            except Exception as e:
                print(f"[ai] custom summarize error ({url} model={self.model}): {e}")
                return self._fallback(transcript)

    def _fallback(self, transcript: str) -> dict:
        import re
        from collections import Counter

        # split by .!? and newlines, keep meaningful sentences
        raw_sents = re.split(r"[.!?]+|\n+", transcript)
        sentences = [s.strip() for s in raw_sents if len(s.strip().split()) >= 3]
        if not sentences:
            return {"summary": "- Chưa đủ dữ liệu để tóm tắt.", "chapters": [], "actionItems": [], "keywords": []}

        # stopwords for keyword scoring (en + vi common)
        stop = set("the and for are but not you all can had her was one our out day get has him his how its may new now old see two way who boy did its let put say she too use a an in on of to is it that this with as at be by from or we you he have will would there what so if about into".split())
        # Vietnamese stopwords
        stop.update("và là của trong những có được một người khi này với đã cho việc theo từ các cũng như thì mà để đến".split())

        words_all = re.findall(r"[a-zA-Z\u00C0-\u024F\u1E00-\u1EFF0-9]+", transcript.lower())
        freq = Counter(w for w in words_all if w not in stop and len(w) > 2)
        top_keywords = [w for w, _ in freq.most_common(5)]

        def score(s: str) -> float:
            ws = re.findall(r"[a-zA-Z\u00C0-\u024F]+", s.lower())
            # term frequency score
            tf = sum(freq.get(w, 0) for w in ws)
            # position bonus (earlier slightly higher) + length penalty for very long
            length_bonus = 1.0 if 6 <= len(ws) <= 22 else 0.6
            # bonus if contains keyword
            kw_bonus = sum(1 for kw in top_keywords if kw in s.lower()) * 2
            return tf + kw_bonus + length_bonus

        scored = sorted(enumerate(sentences), key=lambda x: score(x[1]), reverse=True)
        # pick top 3-5, deduplicate high overlap
        picked_idx = []
        for idx, _ in scored:
            if len(picked_idx) >= 5:
                break
            # skip if too similar to already picked (Jaccard >0.6)
            cand_set = set(sentences[idx].lower().split())
            if any(len(cand_set & set(sentences[p].lower().split())) / max(len(cand_set), 1) > 0.6 for p in picked_idx):
                continue
            picked_idx.append(idx)
        picked_idx.sort()
        if len(picked_idx) < 3 and len(sentences) >= 3:
            picked_idx = sorted(set(picked_idx + list(range(min(3, len(sentences))))))[:5]

        # compress sentences to bullet: trim to ~18 words max
        def compress(s: str) -> str:
            ws = s.split()
            if len(ws) > 20:
                return " ".join(ws[:20]) + "…"
            return s

        bullets = [f"- {compress(sentences[i].strip().capitalize())}" for i in picked_idx]
        summary = "\n".join(bullets)

        # keywords: if fallback freq empty, fallback to long words
        keywords = top_keywords[:5]
        if not keywords:
            for s in sentences:
                for w in s.split():
                    if len(w) > 4 and w.lower() not in keywords:
                        keywords.append(w.lower())
                    if len(keywords) >= 5:
                        break
                if len(keywords) >= 5:
                    break

        # chapters: every ~3 sentences as a chapter
        chapters = []
        for i in range(0, min(len(sentences), 9), 3):
            title = " ".join(sentences[i].split()[:5]).capitalize() or f"Part {i//3+1}"
            chapters.append({"title": title[:40], "start_ms": i * 30000})

        # action items: detect sentences with todo/action cues
        action_cues = ("need", "should", "must", "will", "todo", "task", "action", "cần", "phải", "sẽ", "nhiệm vụ")
        actions = [s.strip().capitalize() for s in sentences if any(c in s.lower() for c in action_cues)][:3]

        return {"summary": summary, "chapters": chapters, "actionItems": actions, "keywords": keywords[:5]}


summarizer = Summarizer()
