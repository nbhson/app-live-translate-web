"""Question -> Answer suggestion (structures + full sentences).
Gợi ý 2-3 cấu trúc + 2-3 câu trả lời hoàn chỉnh cho mỗi câu hỏi live.
Chỉ dùng CUSTOM_* khi có, fallback template khi không.
"""

import os
import re

import httpx

PROMPT_SUGGEST = """You are a helpful conversation assistant. A question was just asked in a live conversation.
Context (last sentences): {context}
Question: {question}
Source language: {source_lang}

Produce JSON with:
- structures: array of 2-3 answer structures/outlines (e.g. "1) Acknowledge + give reason + example", "2) Short direct answer + elaboration"). Keep each 6-12 words, actionable.
- fullAnswers: array of 2-3 complete suggested answers, each 1-2 sentences, natural, polite, ready to say. Keep same language as question unless question mixes languages, then match question language. Vary style: one concise, one detailed, one friendly.
Return JSON only: {{"structures": [...], "fullAnswers": [...]}}.
"""

# simple heuristic to avoid calling AI for non-questions
_QUESTION_WORDS_EN = {"who","what","where","when","why","how","can","could","would","should","is","are","do","does","did","will","have","has","may","might","shall","am","was","were"}
_QUESTION_WORDS_VI = {"ai","gì","nào","sao","tại","vì","bao","khi","đâu","có","không","được","phải","làm","bao giờ","khi nào","ở đâu","tại sao","vì sao","cái gì"}

def is_question(text: str) -> bool:
    t = text.strip()
    if not t:
        return False
    if "?" in t or "？" in t:
        return True
    low = t.lower()
    # Vietnamese question particle cuối câu
    if re.search(r"\b(không|chưa|à|ạ|nhỉ|nhé|chứ)\b\s*[.!]?$", low):
        return True
    first = low.split()[0].strip(" ,.!?") if low.split() else ""
    if first in _QUESTION_WORDS_EN or first in _QUESTION_WORDS_VI:
        return True
    # starts with "how to", "can you"
    if low.startswith(("how to", "how do", "how does", "can you", "could you", "would you", "do you", "are you", "is there")):
        return True
    return False


class Suggester:
    def __init__(self):
        self.api_key = os.environ.get("CUSTOM_API_KEY", "")
        self.base_url = os.environ.get("CUSTOM_BASE_URL", "").rstrip("/")
        self.model = os.environ.get("CUSTOM_MODEL", "gpt-4o-mini")

    async def suggest(self, question: str, context: str = "", source_lang: str = "en") -> dict:
        if not question.strip():
            return {"structures": [], "fullAnswers": []}
        if not self.api_key or not self.base_url:
            return self._fallback(question)
        return await self._custom(question, context, source_lang)

    async def _custom(self, question: str, context: str, source_lang: str) -> dict:
        prompt = PROMPT_SUGGEST.format(question=question, context=context[-600:] if context else "(no context)", source_lang=source_lang)
        url = f"{self.base_url}/chat/completions"
        async with httpx.AsyncClient() as client:
            try:
                r = await client.post(
                    url,
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    json={
                        "model": self.model,
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": 0.5,
                        "response_format": {"type": "json_object"},
                    },
                    timeout=10.0,
                )
                r.raise_for_status()
                import json as _j
                txt = r.json()["choices"][0]["message"]["content"] or ""
                txt = txt.strip()
                if txt.startswith("```"):
                    m = re.search(r"```(?:json)?\s*(.*?)\s*```", txt, re.DOTALL)
                    if m:
                        txt = m.group(1).strip()
                try:
                    data = _j.loads(txt)
                except Exception:
                    m = re.search(r"\{.*\}", txt, re.DOTALL)
                    if m:
                        data = _j.loads(m.group(0))
                    else:
                        raise
                # normalize
                structs = data.get("structures") or data.get("outlines") or []
                fulls = data.get("fullAnswers") or data.get("answers") or data.get("suggestions") or []
                # ensure 2-3 each, truncate
                structs = [str(s).strip() for s in structs if str(s).strip()][:3]
                fulls = [str(s).strip() for s in fulls if str(s).strip()][:3]
                if not structs and not fulls:
                    return self._fallback(question)
                # ensure at least 2 each: pad from fallback if needed
                fb = self._fallback(question)
                while len(structs) < 2:
                    structs.append(fb["structures"][len(structs) % len(fb["structures"])])
                while len(fulls) < 2:
                    fulls.append(fb["fullAnswers"][len(fulls) % len(fb["fullAnswers"])])
                return {"structures": structs[:3], "fullAnswers": fulls[:3]}
            except Exception as e:
                print(f"[suggest] custom error ({url}): {e}")
                return self._fallback(question)

    def _fallback(self, question: str) -> dict:
        q = question.strip()
        # generic language-agnostic structures
        is_vi = bool(re.search(r"[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]", q.lower()))
        if is_vi:
            structures = [
                "1) Xác nhận + lý do ngắn gọn + ví dụ",
                "2) Trả lời trực tiếp + mở rộng thêm 1 câu",
                "3) Cảm ơn câu hỏi + chia sẻ quan điểm cá nhân",
            ]
            fulls = [
                f"Cảm ơn câu hỏi. Về \"{q[:40]}…\", theo mình thì ... (bạn có thể bổ sung ví dụ cụ thể).",
                f"Câu trả lời ngắn gọn là có/không — vì ... và mình có thể giải thích thêm nếu bạn cần.",
                f"Mình xin chia sẻ góc nhìn: ... Bạn thấy cách tiếp cận này có phù hợp không?",
            ]
        else:
            structures = [
                "1) Acknowledge + short reason + example",
                "2) Direct answer + 1-sentence elaboration",
                "3) Friendly perspective + invite follow-up",
            ]
            fulls = [
                f"Great question — regarding \"{q[:50]}…\", I'd say ... because ... (e.g., ...).",
                f"Short answer: yes/no — the key reason is ... Happy to elaborate.",
                f"From my perspective, ... What do you think about that approach?",
            ]
        return {"structures": structures, "fullAnswers": fulls}


suggester = Suggester()
