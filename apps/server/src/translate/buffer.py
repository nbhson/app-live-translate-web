"""Sentence buffer logic (mirrors packages/shared/buffer.ts).

Punctuation langs (en/vi/fr/de/es/auto): split by [.?!]
Non-punct langs (ja/zh/ko): split by pause (is_eos) + length fallback.
Pause 700ms is represented by Deepgram is_final / is_eos flag.
"""

import re
import time


class SentenceBuffer:
    def __init__(self, source_lang: str, on_sentence, pause_ms: int = 700):
        self.source_lang = source_lang
        self.on_sentence = on_sentence
        self._buffer = ""
        self._pause_ms = pause_ms
        self._last_push_ts = 0.0

    PUNCT_LANGS = {"en", "vi", "fr", "de", "es", "auto"}
    # for non-punct languages: flush if buffer exceeds this many tokens
    MIN_WORDS_NON_PUNCT = 12

    def set_language(self, lang: str):
        self.source_lang = lang

    def push(self, text: str, is_eos: bool = False):
        text = text.strip()
        if not text:
            return
        self._buffer += (" " if self._buffer else "") + text
        now = time.monotonic()
        elapsed_ms = (now - self._last_push_ts) * 1000 if self._last_push_ts else 0
        self._last_push_ts = now

        if self.source_lang in self.PUNCT_LANGS:
            matches = re.findall(r"[^.!?]+[.!?]+", self._buffer)
            if matches:
                consumed = "".join(matches)
                self._buffer = self._buffer[len(consumed) :].lstrip()
                for s in [m.strip() for m in matches]:
                    if s:
                        asyncio_run(self.on_sentence, s)
            # flush remainder on eos OR pause > 700ms with enough content
            if is_eos and self._buffer.strip():
                asyncio_run(self.on_sentence, self._buffer.strip())
                self._buffer = ""
            elif elapsed_ms > self._pause_ms and self._buffer.strip():
                # heuristic: pause + buffer has at least 4 words
                if len(self._buffer.split()) >= 4:
                    asyncio_run(self.on_sentence, self._buffer.strip())
                    self._buffer = ""
        else:
            # JA/ZH/KO: no punctuation, split on eos/pause or length
            if is_eos or elapsed_ms > self._pause_ms:
                if self._buffer.strip():
                    asyncio_run(self.on_sentence, self._buffer.strip())
                    self._buffer = ""
                return
            # fallback length-based split
            words = self._buffer.strip().split()
            if len(words) >= self.MIN_WORDS_NON_PUNCT:
                sentence = " ".join(words[: self.MIN_WORDS_NON_PUNCT])
                remainder = " ".join(words[self.MIN_WORDS_NON_PUNCT :])
                asyncio_run(self.on_sentence, sentence)
                self._buffer = remainder

    def flush(self):
        if self._buffer.strip():
            asyncio_run(self.on_sentence, self._buffer.strip())
            self._buffer = ""


def asyncio_run(cb, *args):
    """Call sync or async callback."""
    import asyncio
    import inspect

    result = cb(*args)
    if inspect.isawaitable(result):
        asyncio.ensure_future(result)
