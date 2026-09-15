from src.db.models import User, SessionRecord, Transcript, Translation, Summary, DDL

def test_user():
    u = User(email="a@b.com")
    assert u.email == "a@b.com"
    assert u.id

def test_session():
    s = SessionRecord(source_lang="en", target_langs=["vi"])
    assert s.source_lang == "en"
    assert "vi" in s.target_langs

def test_transcript():
    t = Transcript(session_id="sid", text="hello", language="en", confidence=0.9)
    assert t.text == "hello"
    assert t.confidence == 0.9

def test_translation():
    tr = Translation(transcript_id="tid", target_lang="vi", text="xin chao")
    assert tr.target_lang == "vi"

def test_summary():
    sm = Summary(session_id="sid", content="summary", chapters=[{"title":"Intro"}])
    assert sm.content == "summary"
    assert len(sm.chapters)==1

def test_ddl_contains_tables():
    assert "CREATE TABLE sessions" in DDL
    assert "CREATE TABLE transcripts" in DDL
    assert "embedding VECTOR" in DDL
