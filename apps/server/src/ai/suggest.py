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
        import hashlib
        q = question.strip()
        # remove trailing ? and clean
        q_clean = re.sub(r"[?？.!]+$", "", q).strip()
        q_low = q.lower()
        is_vi = bool(re.search(r"[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]", q_low))

        # ---- extract topic (remove question words) ----
        # take up to 6 meaningful words after question word
        stop_q = {"what","what's","which","who","whose","whom","when","where","why","how","is","are","was","were","do","does","did","can","could","would","should","will","have","has","had","may","might","shall","am","ai","gì","nào","sao","tại","vì","bao","khi","đâu","có","không","được","phải","làm","bao","giờ","nào","ở","thì","là","cái","để"}
        words = re.findall(r"[A-Za-zÀ-ỹ\u1E00-\u1EFF]+", q_clean)
        topic_words = [w for w in words if w.lower() not in stop_q]
        topic = " ".join(topic_words[:5]).strip() or q_clean[:30]
        short_topic = topic[:40]

        # hash for variation
        h = int(hashlib.md5(q.encode()).hexdigest(), 16)

        if is_vi:
            # expanded pools to avoid identical repetition across questions
            pools_struct = {
                "what": [
                    "Định nghĩa ngắn gọn + đặc điểm chính + ví dụ",
                    "So sánh với phương án khác + ưu/nhược",
                    "Giải thích theo ngữ cảnh + ứng dụng thực tế",
                    "Nêu bản chất + phân loại + ví dụ minh hoạ",
                    "Định nghĩa 1 câu + 2 hệ quả chính",
                ],
                "why": [
                    "Nguyên nhân cốt lõi + bằng chứng + hệ quả",
                    "Góc nhìn cá nhân + lý do + ví dụ minh hoạ",
                    "Phân tích 2-3 lý do chính theo thứ tự ưu tiên",
                    "Nguyên nhân khách quan + chủ quan + kết luận",
                    "Lý do trực tiếp + gián tiếp + bài học",
                ],
                "how": [
                    "Các bước 1-2-3 + lưu ý quan trọng",
                    "Quy trình + công cụ + ví dụ",
                    "Hướng dẫn ngắn + lỗi thường gặp + cách tránh",
                    "Chuẩn bị → thực hiện → kiểm tra + mẹo",
                    "Mô tả từng bước kèm thời gian ước tính",
                ],
                "yesno": [
                    "Trả lời có/không rõ ràng + 1 lý do chính",
                    "Khẳng định + điều kiện/ ngoại lệ",
                    "Câu trả lời cân bằng + đề xuất tiếp theo",
                    "Đồng ý có điều kiện + ví dụ phản biện",
                    "Khẳng định ngắn + giải thích 1 câu + mở rộng",
                ],
                "generic": [
                    "Xác nhận câu hỏi + câu trả lời trọng tâm + ví dụ",
                    "Trả lời trực tiếp + mở rộng 1 câu liên quan",
                    "Chia sẻ quan điểm + mời trao đổi thêm",
                    "Tóm tắt ý chính + 2 luận điểm + kết luận",
                    "Nêu quan điểm + lý do + câu hỏi ngược lại",
                ],
            }
            pools_full = {
                "what": [
                    f"“{short_topic}” hiểu đơn giản là một khái niệm liên quan đến “{short_topic.lower()}”, nổi bật ở tính ứng dụng. Ví dụ, bạn có thể thấy nó khi áp dụng vào thực tế.",
                    f"Theo mình, {short_topic} là ... Điều này quan trọng vì nó giúp làm rõ bản chất của “{short_topic.lower()}”. Bạn muốn ví dụ cụ thể hơn không?",
                    f"Nếu nói ngắn gọn, {short_topic} nghĩa là ... Mình thường minh hoạ bằng một tình huống thực tế về “{short_topic.lower()}”.",
                    f"Về bản chất, {short_topic} được định nghĩa là ... Nó khác với các khái niệm tương tự ở chỗ ...",
                    f"{short_topic} có thể xem là ... Đặc điểm chính là ... Ví dụ điển hình là ...",
                ],
                "why": [
                    f"Nguyên nhân chính của “{short_topic}” là sự kết hợp của yếu tố khách quan và chủ quan. Vì vậy kết quả thường là ...",
                    f"Mình nghĩ là do {short_topic.lower()} chịu ảnh hưởng bởi ... Hơn nữa, ... Do đó ... Bạn thấy có hợp lý không?",
                    f"Có 2-3 lý do chính: 1) ... liên quan đến {short_topic.lower()} 2) ... Vì vậy ...",
                    f"Xét về {short_topic.lower()}, lý do cốt lõi là ... Bằng chứng là ... nên hệ quả là ...",
                    f"Vì {short_topic.lower()} đòi hỏi ... nên thường dẫn đến ... Đây là điều mình quan sát được.",
                ],
                "how": [
                    f"Để {short_topic.lower()}, bạn làm 3 bước: 1) chuẩn bị ... 2) thực hiện ... 3) kiểm tra ... Lưu ý quan trọng là ...",
                    f"Cách mình thường làm với {short_topic.lower()} là bắt đầu từ ... Sau đó ... Cuối cùng ... Bạn thử xem sao nhé.",
                    f"Quy trình cho {short_topic.lower()} gồm ... Công cụ hữu ích là ... Ví dụ thực tế là ...",
                    f"Muốn {short_topic.lower()} hiệu quả, hãy chuẩn bị ... rồi thực hiện từng bước, cuối cùng đánh giá ...",
                    f"Hướng dẫn ngắn: ... Lỗi thường gặp là ... Cách tránh là ...",
                ],
                "yesno": [
                    f"Câu trả lời là có — vì {short_topic.lower()} thường ... Tuy nhiên, trong trường hợp ... thì lại ...",
                    f"Mình cho là không hẳn, vì {short_topic.lower()} còn phụ thuộc vào ... Nhưng nếu ... thì có thể ...",
                    f"Có thể nói là vừa có vừa không: {short_topic.lower()} đúng khi ... nhưng chưa đủ khi ... Điều quan trọng là ...",
                    f"Ngắn gọn: có, nếu xét về {short_topic.lower()}. Nhưng cần lưu ý điều kiện ...",
                    f"Mình đồng ý một phần — {short_topic.lower()} ... Ví dụ phản biện là ...",
                ],
                "generic": [
                    f"Cảm ơn câu hỏi về “{short_topic}”. Theo mình, điểm mấu chốt của {short_topic.lower()} là ... Ví dụ ... Bạn thấy sao?",
                    f"Về “{short_topic}”, câu trả lời ngắn gọn là ... Mình bổ sung thêm là ... Liên quan đến {short_topic.lower()} thì ...",
                    f"Mình xin chia sẻ góc nhìn về {short_topic.lower()}: ... Điều này liên quan đến ... Bạn có muốn trao đổi thêm không?",
                    f"Với {short_topic.lower()}, mình thường tóm tắt là ... Có 2 điểm chính: ... và ...",
                    f"Câu hỏi hay về {short_topic.lower()}! Mình nghĩ là ... Lý do là ... Bạn nghĩ thế nào?",
                ],
            }
            # detect type
            if any(w in q_low for w in ["tại sao","vì sao","why"]):
                key = "why"
            elif any(w in q_low for w in ["làm sao","làm thế nào","how"]):
                key = "how"
            elif any(w in q_low for w in ["là gì","cái gì","what","which"]):
                key = "what"
            elif re.search(r"(không\??$|chưa\??$|à\??$|có.*không)", q_low):
                key = "yesno"
            else:
                key = "generic"
            pool_s = pools_struct[key]
            pool_f = pools_full[key]
            # pick 3 based on hash to vary across questions of same type
            start = h % len(pool_s)
            structs = [pool_s[(start + i) % len(pool_s)] for i in range(3)]
            start_f = (h // 7) % len(pool_f)
            fulls = [pool_f[(start_f + i) % len(pool_f)] for i in range(3)]
            structures = [f"{s} — “{short_topic}”" if short_topic.lower() not in s.lower() else s for s in structs]
            return {"structures": structures[:3], "fullAnswers": fulls[:3]}

        # English - expanded pools
        pools_struct_en = {
            "what": [
                "Define + key features + example",
                "Compare with alternatives + pros/cons",
                "Explain in context + real use case",
                "Essence + classification + illustration",
                "One-sentence definition + 2 implications",
            ],
            "why": [
                "Core reason + evidence + impact",
                "Personal view + 2 supporting reasons",
                "2-3 prioritized causes + conclusion",
                "Objective + subjective causes + takeaway",
                "Direct + indirect reasons + lesson",
            ],
            "how": [
                "Step 1-2-3 + key tip",
                "Process + tools + example",
                "Short guide + common pitfalls",
                "Prepare → execute → review + pro tip",
                "Stepwise with time estimates",
            ],
            "yesno": [
                "Clear yes/no + one main reason",
                "Balanced answer + condition/exception",
                "Yes/no + next step suggestion",
                "Conditional yes + counter-example",
                "Short yes/no + 1-sentence elaboration",
            ],
            "generic": [
                "Acknowledge + focused answer + example",
                "Direct answer + one elaboration",
                "Perspective + invite follow-up",
                "Main point + 2 arguments + conclusion",
                "Viewpoint + reason + return question",
            ],
        }
        pools_full_en = {
            "what": [
                f"In short, “{short_topic}” can be seen as a concept related to {short_topic.lower()}, notable for its practicality. For example, you see it when ...",
                f"I'd define {short_topic} as ... This matters because it clarifies the essence of {short_topic.lower()}. Want a concrete example?",
                f"{short_topic} essentially means ... A good illustration is ...",
                f"Essentially, {short_topic} is ... It differs from similar concepts in that ...",
                f"You can view {short_topic} as ... Its main trait is ... A typical example is ...",
            ],
            "why": [
                f"The core reason for “{short_topic}” is the interplay of objective and subjective factors. Hence the result is often ...",
                f"I think it's because {short_topic.lower()} is influenced by ... Moreover, ... Therefore ...",
                f"There are 2-3 key reasons around {short_topic.lower()}: 1) ... 2) ... So ...",
                f"Considering {short_topic.lower()}, the underlying cause is ... Evidence shows ... so impact is ...",
                f"Because {short_topic.lower()} requires ... it tends to lead to ... That's what I've observed.",
            ],
            "how": [
                f"To {short_topic.lower()}, try 3 steps: 1) prepare ... 2) do ... 3) check ... Tip: pay attention to ...",
                f"The way I handle {short_topic.lower()} is starting from ... Then ... Finally ... Give it a try!",
                f"The process for {short_topic.lower()} involves ... Useful tools are ... For instance, ...",
                f"For effective {short_topic.lower()}, prepare ... then execute stepwise, finally review ...",
                f"Short guide: ... Common pitfall is ... How to avoid: ...",
            ],
            "yesno": [
                f"Short answer: yes — because {short_topic.lower()} often ... However, when ... then ...",
                f"I'd say not exactly, because {short_topic.lower()} depends on ... But when ... it can be ...",
                f"It's a bit of both: {short_topic.lower()} holds when ... but not enough when ... The key is ...",
                f"Briefly: yes, regarding {short_topic.lower()}. But note the condition ...",
                f"I'm partially with it — {short_topic.lower()} ... A counter-example is ...",
            ],
            "generic": [
                f"Great question about “{short_topic}” — the key point of {short_topic.lower()} is ... For example, ... What do you think?",
                f"Regarding “{short_topic}”, the concise answer is ... To add, ... Related to {short_topic.lower()}, ...",
                f"From my perspective, {short_topic.lower()} ... This relates to ... Would you like to discuss more?",
                f"With {short_topic.lower()}, I usually summarize as ... Two main points: ... and ...",
                f"Nice question on {short_topic.lower()}! I'd say ... The reason is ... How about you?",
            ],
        }
        ql = q_low
        if "why" in ql:
            key = "why"
        elif "how" in ql:
            key = "how"
        elif any(w in ql.split() for w in ["what","which","who"]):
            key = "what"
        elif q.strip().endswith("?") and q.split()[0].lower() in {"is","are","was","were","do","does","did","can","could","would","should","will","have","has"}:
            key = "yesno"
        else:
            key = "generic"
        pool_s = pools_struct_en[key]
        pool_f = pools_full_en[key]
        start = h % len(pool_s)
        structs = [pool_s[(start + i) % len(pool_s)] for i in range(3)]
        start_f = (h // 7) % len(pool_f)
        fulls = [pool_f[(start_f + i) % len(pool_f)] for i in range(3)]
        structures = [f"{s} — “{short_topic}”" if short_topic.lower() not in s.lower() else s for s in structs]
        return {"structures": structures[:3], "fullAnswers": fulls[:3]}


suggester = Suggester()
