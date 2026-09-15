"""DB models per ARCHITECTURE.md:10 - Postgres + pgvector scaffolding.
For MVP uses in-memory; SQLAlchemy models ready for Postgres.
"""

import uuid
from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class User:
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    email: str = ""
    created_at: datetime = field(default_factory=datetime.utcnow)


@dataclass
class SessionRecord:
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str | None = None
    source_lang: str = "en"
    target_langs: list[str] = field(default_factory=lambda: ["vi"])
    stt_provider: str = "deepgram"
    started_at: datetime = field(default_factory=datetime.utcnow)
    ended_at: datetime | None = None


@dataclass
class Transcript:
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    session_id: str = ""
    seq: int = 0
    type: str = "final"
    text: str = ""
    language: str = "en"
    confidence: float = 0.0
    start_ms: int = 0
    end_ms: int = 0
    created_at: datetime = field(default_factory=datetime.utcnow)
    # embedding: Optional[list[float]] = None  # pgvector 1536


@dataclass
class Translation:
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    transcript_id: str = ""
    target_lang: str = "vi"
    text: str = ""
    provider: str = "google"
    created_at: datetime = field(default_factory=datetime.utcnow)


@dataclass
class Summary:
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    session_id: str = ""
    window_start_ms: int = 0
    window_end_ms: int = 0
    content: str = ""
    chapters: list = field(default_factory=list)
    action_items: list = field(default_factory=list)
    model: str = "gemini-2.0-flash"
    created_at: datetime = field(default_factory=datetime.utcnow)


# SQL DDL per ARCHITECTURE.md (for reference)
DDL = """
CREATE TABLE users (id UUID PRIMARY KEY, email TEXT, created_at TIMESTAMPTZ);
CREATE TABLE sessions (id UUID PRIMARY KEY, user_id UUID REFERENCES users(id), source_lang TEXT, target_langs TEXT[], stt_provider TEXT, started_at TIMESTAMPTZ, ended_at TIMESTAMPTZ);
CREATE TABLE transcripts (id UUID PRIMARY KEY, session_id UUID REFERENCES sessions(id), seq INT, type TEXT, text TEXT, language TEXT, confidence REAL, start_ms INT, end_ms INT, created_at TIMESTAMPTZ, embedding VECTOR(1536));
CREATE TABLE translations (id UUID PRIMARY KEY, transcript_id UUID REFERENCES transcripts(id), target_lang TEXT, text TEXT, provider TEXT, created_at TIMESTAMPTZ);
CREATE TABLE summaries (id UUID PRIMARY KEY, session_id UUID REFERENCES sessions(id), window_start_ms INT, window_end_ms INT, content TEXT, chapters JSONB, action_items JSONB, model TEXT, created_at TIMESTAMPTZ);
"""
