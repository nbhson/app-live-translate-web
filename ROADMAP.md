# Roadmap & Implementation Plan

## Monorepo Overview

```
live-translate/
├── apps/
│   ├── web/         # Next.js 15 - Main UI
│   ├── extension/   # Chrome Extension MV3
│   ├── desktop/     # Tauri + Rust - system audio loopback
│   └── server/      # FastAPI + WebSocket - STT/Translate proxy
├── packages/
│   └── shared/      # types, sentence-buffer, vad, language-config
├── ARCHITECTURE.md
├── ROADMAP.md      # this file
├── MAINTENANCE.md
└── docker-compose.yml
```

## Phase 1: Foundation - Live Caption + Live Translate (Current)

**Goal:** Stable EN (caption) -> VI (translate) pipeline with latency < 1.5s.

**Confirmed Scope:**
- Capture: Pure Web `getDisplayMedia` + `UrlIframePlayer` (iframe with full permissions) + Chrome Extension Side Panel `tabCapture` (including iframe) -> Web Speech `start(track)` FREE or Deepgram PCM. Tauri loopback is optional if system-wide capture is needed.
- STT: Deepgram Nova-3 `language=en` streaming (interim + final) | Web Speech FREE | faster-whisper self-host.
- Translate: Sentence Buffer + Custom AI (`CUSTOM_*`) / MyMemory FREE `en->vi`.
- Frontend: 2-line EN/VI overlay, IndexedDB history, `.srt` export.

**Tasks:**
- [ ] `pnpm + Turborepo + Next.js 15 + FastAPI`
- [ ] `AudioWorklet` PCM 16kHz, 250ms chunks, Silero VAD
- [ ] `apps/server/src/stt` Deepgram proxy, normalize `STTResult`
- [ ] `apps/server/src/translate/buffer.ts` sentence splitting by punctuation + 700ms pause
- [ ] `apps/web` Zustand store, Socket.io, draggable UI overlay
- [ ] `apps/extension` MV3 with offscreen document

**Done criteria:** Play a 5-minute EN YouTube video, EN interim captions appear, VI translation follows after 0.8-1.2s, P95 latency < 1.5s.

---

## Phase 2: Multi-language - Configurable Caption & Translate Languages (Next)

**Goal:** Users can choose `Source Language` (STT) and `Target Language` (translate) freely, no longer hardcoded to EN->VI.

**Architecture Changes:**
- Add `Language Router` on server: `STT lang -> Translate lang`. See `ARCHITECTURE.md:4.3`.
- STT provider must support multi-language or auto-detect. Deepgram supports 30+ languages, Whisper auto-detect, Web Speech depends on browser.
- Translate provider: `MyMemory FREE` supports 100+ pairs (5000 chars/day) or `Custom AI` (`CUSTOM_*`) for better flexibility on rare languages.

**Tasks:**

- [ ] **Language Selector UI** `apps/web/src/components/LanguageSelector.tsx`:
  - Dropdown `Source`: Auto-detect, EN, VI, JA, KO, ZH, FR... (list based on STT provider)
  - Dropdown `Target`: VI, EN, JA... + `+ Add language` button (allow 2 parallel targets)
  - Save `preferences` to `localStorage` + `user_settings` table
- [ ] **Multi-language STT** `apps/server/src/stt/`:
  - Add dynamic `language` param to Deepgram URL: `?language=${sourceLang}` or `detect_language=true`
  - Fallback: if `auto` -> use `whisper large-v3` detection or Deepgram `detect_language`
  - Add `language confidence` returned to UI to show "Listening: Japanese (92%)"
- [ ] **Translate matrix** `apps/server/src/translate/`:
  - Change from hardcoded `en->vi` to `translate(text, sourceLang, targetLang)`
  - Change cache key to `${sourceLang}:${targetLang}:${hash(text)}`
  - Support `multi-target`: one EN sentence translated simultaneously to VI + JA (fan-out via `Promise.all`)
  - If using Custom AI: prompt `Translate from ${sourceLang} to ${targetLang}, keep natural tone` (only needs `CUSTOM_*`)
- [ ] **Language-aware Buffer:** Some languages don't use `.?!` punctuation (ZH, JA) -> split sentences by `pause + length` instead of punctuation.
- [ ] **Testing:** 3x3 test matrix: EN->VI, JA->VI, VI->EN with sample videos.

**Done criteria:** User switches Source=JA, Target=EN, speaks Japanese, sees live JA caption + EN translation. Switching back to EN->JA still works.

**Maintenance note:** Add `supported_languages` table synced from provider API, weekly cron update.

---

## Phase 3: AI Intelligence - Summary & Insight

**Goal:** Use LLM on live transcripts to generate summaries, key points, and action items.

**New Architecture:** Add `AI Service` (Python sidecar calling LLM) running in parallel with Translate, without blocking the live stream. Use a `30s-5 minute` buffer for aggregation.

**Tasks:**

- [ ] `apps/server/src/ai/summarizer.py`:
  - Buffer transcript by `2-minute window` or `on-demand` when user clicks "Summarize"
  - Call `Custom LLM` (`CUSTOM_API_KEY/BASE_URL/MODEL`, OpenAI-compatible) with summary prompt
  - Stream results to UI via `ws event: summary.chunk`
- [ ] **Summary types:**
  - `Realtime Summary` (updated every 30s): 3 bullet points on current discussion
  - `Final Summary` (when Stop is pressed): Full summary, chapters by topic shift
  - `Action Items`: extract tasks, deadlines, assignees (for meetings)
  - `Keywords / Glossary`: keywords + definitions
- [ ] **UI** `apps/web/src/components/SummaryPanel.tsx`:
  - Right panel: tabs `Live | Summary | Keywords`
  - Buttons `Copy Summary`, `Export PDF`, `Send to Notion/Slack`
  - Show `confidence` and allow `edit` on summary (feedback loop)
- [ ] **Storage:** Add table `summaries {id, session_id, window_start, window_end, content, model}`

**Done criteria:** 10-minute meeting, click "Summarize", receive 5 bullets + 3 action items within 3s.

---

## Phase 4+: Backlog Extensions (Curated)

You have the 3 core phases. Below are optional extensions grouped by value, sorted by recommended priority.

### Group A: Caption Quality Improvements (High ROI, do early)

| Feature | Description | Difficulty | Value |
|-----------|-------|--------|---------|
| **Speaker Diarization** | Distinguish speakers "Speaker 1, 2" or assign names. Deepgram/Azure supports `diarize=true`. Different colors in UI. | Low | High for meetings |
| **Custom Vocabulary / Glossary** | Allow users to add custom terms (company names, medical terms, person names) for better STT accuracy. Deepgram `keywords` param. | Low | High |
| **Noise Suppression & VAD tuning** | Let users adjust VAD sensitivity, enable RNNoise to filter cafe noise. | Medium | High |
| **Real-time Correction** | User clicks caption to correct, correction fed back to LLM to improve next sentences. | Medium | High |

### Group B: Productivity & Workflow

| Feature | Description | Difficulty | Value |
|-----------|-------|--------|---------|
| **Semantic Search History** | Store transcripts in `pgvector` + embeddings, enable search like "segment about pricing yesterday". | Medium | Very high |
| **Multi-format Export** | `.srt`, `.vtt`, `.txt`, `.pdf`, `.docx` + speaker separation. | Low | High |
| **OBS Overlay** | Transparent URL `.../overlay?session=xxx` for streamers to embed in OBS. | Low | High for streamers |
| **Meeting Bot Integration** | Bot joins Zoom/Meet/Google Meet, captions for entire room (each participant sees their own language). | High | Very high |
| **Notion/Slack/O365 Sync** | Auto-push summary + transcript to Notion DB after each session. | Medium | High |

### Group C: Advanced AI (differentiators)

| Feature | Description | Difficulty | Value |
|-----------|-------|--------|---------|
| **Live TTS Voice-over** | Read translations aloud in VI voice (ElevenLabs / Azure TTS), like dubbing. | Medium | Wow factor |
| **Sentiment & Emotion** | Show speaker emotion (positive/negative) in real time. | Medium | Medium |
| **Chapter & Topic Segmentation** | Auto-split session into chapters "00:00 Intro, 02:15 Demo..." | Low (LLM) | High |
| **Q&A on transcript** | Chat with transcript: "What did they say about the deadline?" (RAG). | Medium | High |
| **Translation Style** | Choose translation style: Formal, Casual, Technical, Friendly. | Low | High |

### Group D: Platform & Scale

| Feature | Description | Difficulty | Value |
|-----------|-------|--------|---------|
| **Offline Mode (WASM)** | Run `whisper.cpp WASM` + `NLLB` directly in browser, no server needed, 100% privacy. | High | High for privacy |
| **Mobile Companion** | React Native app for captioning offline meetings (capture via phone mic). | High | Medium |
| **Developer API / SDK** | Let third parties embed `live-translate` into their apps via `iframe` + API key. | Medium | Monetization |
| **Parallel Multi-target** | 1 source EN translated simultaneously to 3 languages (VI, JA, KO) for multinational meeting rooms. | Low | High |

### Recommended Priority after Phase 3

1.  **Immediately after Phase 3:** `Speaker Diarization` + `Custom Vocabulary` (easy, high value)
2.  **Next quarter:** `Semantic Search` + `OBS Overlay` + `Export`
3.  **Long-term:** `Meeting Bot` + `Offline WASM` to build technical moat

---

## Technical Checklist

- [ ] Deepgram account (200$ free if using Deepgram) + Custom AI endpoint (`CUSTOM_BASE_URL` - Ollama/OpenRouter/Groq...) , ElevenLabs (if building TTS)
- [ ] Node 20+, Rust (if building Tauri), Python 3.11, ffmpeg
- [ ] Design live translation prompt per language if using LLM
- [ ] Test dataset: 3 videos each for EN, JA, VI to measure WER and multi-language latency

## Estimated Operating Cost (100 users, 60 minutes/day each)

- STT Deepgram: 100 * 60 * 30 * $0.0043 = ~$774/month (language-independent) | `webspeech`/`faster-whisper` = free
- Translate MyMemory FREE: free (~5000 chars/day/IP) | Custom AI: ~$10-30/month (depends on `CUSTOM_MODEL`, scales linearly with target count)
- Summary Custom AI: ~$5-15/month (only when user triggers summary, same `CUSTOM_*`)
- Server Fly.io (2 vCPU + 4GB): ~$40/month
- => Self-hosted Whisper cuts 80% of STT cost above 500 hours/month; MyMemory/Custom reduces translation cost to ~free

## Definition of Done

- **Phase 1:** P95 latency < 1.5s, WER < 12% EN->VI
- **Phase 2:** Language switch without restart, 3 language pairs all pass tests
- **Phase 3:** 10-minute summary < 3s, user rating > 4/5
