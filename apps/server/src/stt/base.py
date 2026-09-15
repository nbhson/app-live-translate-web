"""STT provider abstraction per ARCHITECTURE.md:11"""

from abc import ABC, abstractmethod
from collections.abc import Callable


class STTProvider(ABC):
    """Abstract STT streaming provider."""

    on_interim: Callable[[str, str, float], None] | None = None
    on_final: Callable[[str, str, bool, list[dict]], None] | None = None

    @abstractmethod
    async def connect(self, language: str): ...

    @abstractmethod
    async def send_pcm(self, chunk: bytes): ...

    @abstractmethod
    async def close(self): ...
