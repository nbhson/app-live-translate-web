"""Translate provider abstraction."""

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator


class TranslateProvider(ABC):
    @abstractmethod
    async def translate(self, text: str, source: str, target: str) -> str: ...

    async def translate_stream(self, text: str, source: str, target: str) -> AsyncIterator[str]:
        # default: yield whole result at once
        result = await self.translate(text, source, target)
        yield result
