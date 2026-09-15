"""Question -> Answer suggestion (structures + full sentences).
Gợi ý 2-3 cấu trúc + 2-3 câu trả lời hoàn chỉnh cho mỗi câu hỏi live.
Chỉ dùng CUSTOM_* khi có, fallback template khi không.
"""

import os
import re
from pathlib import Path

# ensure .env loaded even when imported standalone
try:
    _env_path = Path(__file__).resolve().parents[2] / ".env"
    if _env_path.exists():
        for line in _env_path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            k = k.strip()
            v = v.strip().strip('"').strip("'")
            if k and k not in os.environ:
                os.environ[k] = v
except Exception:
    pass

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

    def _refresh(self):
        # re-read env in case it was loaded from .env after import
        self.api_key = os.environ.get("CUSTOM_API_KEY", "") or self.api_key
        self.base_url = os.environ.get("CUSTOM_BASE_URL", "").rstrip("/") or self.base_url
        self.model = os.environ.get("CUSTOM_MODEL", "gpt-4o-mini") or self.model

    async def suggest(self, question: str, context: str = "", source_lang: str = "en") -> dict:
        self._refresh()
        if not question.strip():
            return {"structures": [], "fullAnswers": []}
        if not self.api_key or not self.base_url:
            print(f"[suggest] no CUSTOM key/base, fallback for: {question[:40]}")
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
            # dynamic pools with topic to avoid identical look
            pools_struct = {
                "what": [
                    f"Định nghĩa “{short_topic}” trong 1 câu + đặc điểm chính + ví dụ",
                    f"So sánh “{short_topic}” với phương án khác + ưu/nhược",
                    f"Giải thích “{short_topic}” theo ngữ cảnh + ứng dụng thực tế",
                    f"Nêu bản chất “{short_topic}” + phân loại + ví dụ minh hoạ",
                    f"Định nghĩa 1 câu về “{short_topic}” + 2 hệ quả chính",
                ],
                "why": [
                    f"Nguyên nhân cốt lõi của “{short_topic}” + bằng chứng + hệ quả",
                    f"Góc nhìn cá nhân về “{short_topic}” + lý do + ví dụ",
                    f"Phân tích 2-3 lý do chính cho “{short_topic}” theo ưu tiên",
                    f"Nguyên nhân khách quan và chủ quan của “{short_topic}” + kết luận",
                    f"Lý do trực tiếp và gián tiếp của “{short_topic}” + bài học",
                ],
                "how": [
                    f"Các bước 1-2-3 để {short_topic.lower()} + lưu ý",
                    f"Quy trình {short_topic.lower()} + công cụ + ví dụ",
                    f"Hướng dẫn ngắn {short_topic.lower()} + lỗi thường gặp",
                    f"Chuẩn bị → thực hiện → kiểm tra cho “{short_topic}” + mẹo",
                    f"Mô tả từng bước {short_topic.lower()} kèm thời gian",
                ],
                "yesno": [
                    f"Trả lời có/không về “{short_topic}” + 1 lý do chính",
                    f"Khẳng định “{short_topic}” + điều kiện/ngoại lệ",
                    f"Câu trả lời cân bằng cho “{short_topic}” + đề xuất",
                    f"Đồng ý có điều kiện về “{short_topic}” + phản biện",
                    f"Khẳng định ngắn “{short_topic}” + giải thích + mở rộng",
                ],
                "generic": [
                    f"Xác nhận “{short_topic}” + trả lời trọng tâm + ví dụ",
                    f"Trả lời trực tiếp “{short_topic}” + mở rộng 1 câu",
                    f"Chia sẻ quan điểm về “{short_topic}” + mời trao đổi",
                    f"Tóm tắt “{short_topic}” + 2 luận điểm + kết luận",
                    f"Nêu quan điểm “{short_topic}” + lý do + hỏi ngược",
                ],
            }
            pools_full = {
                "what": [
                    f"“{short_topic}” là khái niệm chỉ {short_topic.lower()}, thường được hiểu qua ví dụ thực tế khi áp dụng vào tình huống cụ thể.",
                    f"Theo mình, {short_topic} thể hiện rõ qua đặc điểm chính và ví dụ minh hoạ liên quan đến {short_topic.lower()}.",
                    f"Nói ngắn gọn, {short_topic} có thể giải thích bằng cách so sánh với khái niệm tương tự và nêu ứng dụng của {short_topic.lower()}.",
                    f"Về bản chất, {short_topic} được định nghĩa qua chức năng chính và điểm khác biệt so với lựa chọn khác.",
                    f"{short_topic} có thể xem là trọng tâm của cuộc trao đổi, ví dụ điển hình là cách nó xuất hiện trong thực tế.",
                ],
                "why": [
                    f"Nguyên nhân chính của “{short_topic}” đến từ sự kết hợp yếu tố khách quan và chủ quan, dẫn đến kết quả thường thấy trong thực tế.",
                    f"Mình cho rằng {short_topic.lower()} chịu ảnh hưởng bởi bối cảnh và mục đích, vì vậy hệ quả là điều dễ hiểu.",
                    f"Có hai lý do chính cho {short_topic.lower()}: bối cảnh và nhu cầu, vì vậy câu trả lời cần cân nhắc cả hai.",
                    f"Xét về {short_topic.lower()}, lý do cốt lõi nằm ở mục tiêu và cách tiếp cận, bằng chứng là các ví dụ trước đó.",
                    f"Vì {short_topic.lower()} đòi hỏi sự phù hợp với ngữ cảnh, nên kết quả thường phản ánh điều đó.",
                ],
                "how": [
                    f"Để {short_topic.lower()}, bạn thực hiện ba bước: chuẩn bị, thực hiện và kiểm tra, chú ý đến chi tiết quan trọng ở mỗi bước.",
                    f"Cách mình làm với {short_topic.lower()} là bắt đầu từ bước chuẩn bị, sau đó triển khai và cuối cùng đánh giá kết quả.",
                    f"Quy trình cho {short_topic.lower()} gồm các giai đoạn rõ ràng, công cụ hỗ trợ phù hợp và ví dụ minh hoạ cụ thể.",
                    f"Muốn {short_topic.lower()} hiệu quả, hãy chuẩn bị kỹ, thực hiện từng bước và rút kinh nghiệm sau mỗi lần.",
                    f"Hướng dẫn ngắn cho {short_topic.lower()} là tập trung vào thao tác chính, tránh lỗi phổ biến và tối ưu theo phản hồi.",
                ],
                "yesno": [
                    f"Câu trả lời là có, vì {short_topic.lower()} thường phù hợp với ngữ cảnh hiện tại, tuy nhiên cần xét ngoại lệ cụ thể.",
                    f"Mình cho là không hẳn, vì {short_topic.lower()} còn phụ thuộc vào điều kiện, nhưng trong trường hợp phù hợp thì có thể.",
                    f"Có thể nói vừa có vừa không: {short_topic.lower()} đúng khi đáp ứng tiêu chí, nhưng chưa đủ khi thiếu bối cảnh.",
                    f"Ngắn gọn: có, nếu xét riêng {short_topic.lower()}, nhưng cần lưu ý điều kiện đi kèm để chính xác hơn.",
                    f"Mình đồng ý một phần với {short_topic.lower()}, ví dụ phản biện cho thấy cần cân nhắc thêm.",
                ],
                "generic": [
                    f"Cảm ơn câu hỏi về “{short_topic}”. Điểm mấu chốt là làm rõ {short_topic.lower()} qua ví dụ thực tế và góc nhìn cá nhân.",
                    f"Về “{short_topic}”, câu trả lời ngắn gọn tập trung vào ý chính, sau đó mở rộng thêm một chi tiết liên quan.",
                    f"Góc nhìn của mình về {short_topic.lower()} là cân bằng giữa lý thuyết và thực hành, bạn có muốn trao đổi thêm không?",
                    f"Với {short_topic.lower()}, mình tóm tắt hai điểm chính và kết luận bằng ví dụ minh hoạ ngắn gọn.",
                    f"Câu hỏi hay về {short_topic.lower()}, mình nghĩ câu trả lời nằm ở cách tiếp cận phù hợp với ngữ cảnh hiện tại.",
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
                f"In short, “{short_topic}” is a practical concept best understood through a real-world example where it is applied.",
                f"I'd define {short_topic} by its key feature and a concrete example that clarifies its essence.",
                f"{short_topic} essentially refers to the core idea, and a good illustration makes it clear in context.",
                f"Essentially, {short_topic} differs from similar concepts in its main function and typical use.",
                f"You can view {short_topic} through its main trait and a typical example that shows its value.",
            ],
            "why": [
                f"The core reason for “{short_topic}” lies in the interplay of objective and subjective factors, leading to the observed outcome.",
                f"I think {short_topic.lower()} is influenced by context and purpose, which explains the current result.",
                f"There are two key reasons around {short_topic.lower()}: context and need, so the answer should weigh both.",
                f"Considering {short_topic.lower()}, the underlying cause is the goal and approach, supported by prior examples.",
                f"Because {short_topic.lower()} requires alignment with the situation, the outcome often reflects that fit.",
            ],
            "how": [
                f"To handle {short_topic.lower()}, follow three steps: prepare, execute, and review, focusing on the key detail at each stage.",
                f"The way I handle {short_topic.lower()} is to start with preparation, then carry out the steps and finally evaluate the result.",
                f"The process for {short_topic.lower()} involves clear stages, suitable tools, and a concrete illustration.",
                f"For effective {short_topic.lower()}, prepare thoroughly, execute step by step, and learn from feedback.",
                f"A short guide for {short_topic.lower()} is to focus on the core action, avoid common pitfalls, and optimize based on feedback.",
            ],
            "yesno": [
                f"Short answer: yes, because {short_topic.lower()} generally fits the current context, though exceptions depend on specific conditions.",
                f"I'd say not exactly, because {short_topic.lower()} depends on the situation, but it can hold when conditions align.",
                f"It's a bit of both: {short_topic.lower()} holds when criteria are met yet falls short without proper context, so the key is balance.",
                f"Briefly: yes regarding {short_topic.lower()}, but note the accompanying condition for accuracy.",
                f"I'm partially in agreement on {short_topic.lower()}, and a counter-example shows why nuance matters.",
            ],
            "generic": [
                f"Great question about “{short_topic}” — the key is to be clear and concise, then support it with a brief example related to {short_topic.lower()}.",
                f"Regarding “{short_topic}”, a concise answer focuses on the main point and adds one relevant detail.",
                f"From my perspective, {short_topic.lower()} reflects a balance of theory and practice that invites further discussion.",
                f"With {short_topic.lower()}, I would summarize the two main points and close with a short illustrative example.",
                f"Nice question on {short_topic.lower()} — my view is shaped by context, and the reason ties back to the current situation.",
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
