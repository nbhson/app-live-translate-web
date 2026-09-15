# Roadmap & Plan Triển Khai

## Tổng quan Monorepo

```
live-translate/
├── apps/
│   ├── web/         # Next.js 15 - UI chính
│   ├── extension/   # Chrome Extension MV3
│   ├── desktop/     # Tauri + Rust - system audio loopback
│   └── server/      # FastAPI + WebSocket - STT/Translate proxy
├── packages/
│   └── shared/      # types, sentence-buffer, vad, language-config
├── ARCHITECTURE.md
├── ROADMAP.md      # file này
├── MAINTENANCE.md
└── docker-compose.yml
```

## Phase 1: Foundation - Live Caption + Live Translate (Hiện tại)

**Mục tiêu:** Pipeline EN (caption) -> VI (translate) chạy ổn định, độ trễ < 1.5s.

**Scope chốt:**
- Capture: Pure Web `getDisplayMedia` + `UrlIframePlayer` (iframe allow full quyền) + Chrome Extension Side Panel `tabCapture` (kể cả iframe) -> Web Speech `start(track)` FREE hoặc Deepgram PCM. Tauri loopback là optional nếu cần system-wide.
- STT: Deepgram Nova-3 `language=en` streaming (interim + final) | Web Speech FREE | faster-whisper self-host.
- Translate: Sentence Buffer + Custom AI (`CUSTOM_*`) / MyMemory FREE `en->vi`.
- Frontend: Overlay 2 dòng EN/VI, IndexedDB history, export `.srt`.

**Task:**
- [ ] `pnpm + Turborepo + Next.js 15 + FastAPI`
- [ ] `AudioWorklet` PCM 16kHz, chunk 250ms, Silero VAD
- [ ] `apps/server/src/stt` proxy Deepgram, normalize `STTResult`
- [ ] `apps/server/src/translate/buffer.ts` tách câu theo punctuation + pause 700ms
- [ ] `apps/web` Zustand store, Socket.io, UI overlay draggable
- [ ] `apps/extension` MV3 với offscreen document

**Tiêu chí done:** Mở Youtube EN 5 phút, EN chạy interim, VI hiện sau 0.8-1.2s, P95 latency < 1.5s.

---

## Phase 2: Đa ngôn ngữ - Tùy chọn ngôn ngữ Caption & Translate (Tiếp theo)

**Mục tiêu:** User tự chọn `Ngôn ngữ nguồn (STT)` và `Ngôn ngữ đích (Translate)`, không còn hardcode EN->VI.

**Thay đổi kiến trúc:**
- Thêm `Language Router` ở server: `STT lang -> Translate lang`. Xem `ARCHITECTURE.md:4.3`.
- STT provider phải hỗ trợ đa ngôn ngữ hoặc auto-detect. Deepgram hỗ trợ 30+ ngôn ngữ, Whisper auto-detect, Web Speech tùy browser.
- Translate provider: `MyMemory FREE` hỗ trợ 100+ cặp (5000 ký tự/ngày) hoặc `Custom AI` (`CUSTOM_*`) dịch linh hoạt hơn cho ngôn ngữ hiếm.

**Task:**

- [ ] **Language Selector UI** `apps/web/src/components/LanguageSelector.tsx`:
  - Dropdown `Source`: Auto-detect, EN, VI, JA, KO, ZH, FR... (danh sách theo STT provider)
  - Dropdown `Target`: VI, EN, JA... + nút `+ Thêm ngôn ngữ` (cho phép 2 target song song)
  - Lưu `preferences` vào `localStorage` + `user_settings` table
- [ ] **STT đa ngôn ngữ** `apps/server/src/stt/`:
  - Thêm param `language` động vào Deepgram URL: `?language=${sourceLang}` hoặc `detect_language=true`
  - Fallback: nếu `auto` -> dùng `whisper large-v3` detect hoặc Deepgram `detect_language`
  - Thêm `language confidence` trả về UI để hiện "Đang nghe: Tiếng Nhật (92%)"
- [ ] **Translate matrix** `apps/server/src/translate/`:
  - Chuyển từ `en->vi` hardcode sang `translate(text, sourceLang, targetLang)`
  - Cache key đổi thành `${sourceLang}:${targetLang}:${hash(text)}`
  - Hỗ trợ `multi-target`: 1 câu EN dịch cùng lúc ra VI + JA (fan-out qua `Promise.all`)
  - Nếu dùng Custom AI: prompt `Translate from ${sourceLang} to ${targetLang}, keep natural tone` (chỉ cần `CUSTOM_*`)
- [ ] **Buffer theo ngôn ngữ:** Một số ngôn ngữ không dùng dấu câu `.?!` (ZH, JA) -> tách câu theo `pause + độ dài` thay vì punctuation.
- [ ] **Testing:** Ma trận test 3x3: EN->VI, JA->VI, VI->EN với video mẫu.

**Tiêu chí done:** User đổi Source=JA, Target=EN, nói tiếng Nhật, thấy caption JA + translate EN chạy live. Đổi lại EN->JA vẫn chạy.

**Cân nhắc maintain:** Thêm bảng `supported_languages` sync từ provider API, cron weekly cập nhật.

---

## Phase 3: AI Intelligence - Summary & Insight

**Mục tiêu:** Từ transcript live, dùng LLM để sinh tóm tắt, ý chính, action items.

**Kiến trúc mới:** Thêm `AI Service` (Python sidecar gọi LLM) chạy song song với Translate, không chặn luồng live. Dùng `buffer 30s-5 phút` để tổng hợp.

**Task:**

- [ ] `apps/server/src/ai/summarizer.py`:
  - Buffer transcript theo `window 2 phút` hoặc `on-demand` khi user bấm "Tóm tắt"
  - Gọi `Custom LLM` (`CUSTOM_API_KEY/BASE_URL/MODEL`, OpenAI-compatible) với prompt tóm tắt
  - Stream kết quả về UI qua `ws event: summary.chunk`
- [ ] **Các loại summary:**
  - `Realtime Summary` (cập nhật mỗi 30s): 3 bullet points đang nói gì
  - `Final Summary` (khi bấm Stop): Tóm tắt toàn bộ, chia chương (chapters) theo topic shift
  - `Action Items`: trích task, deadline, người phụ trách (nếu là meeting)
  - `Keywords / Glossary`: từ khóa + định nghĩa
- [ ] **UI** `apps/web/src/components/SummaryPanel.tsx`:
  - Panel bên phải: tab `Live | Summary | Keywords`
  - Nút `Copy Summary`, `Export PDF`, `Gửi qua Notion/Slack`
  - Hiển thị `confidence` và cho phép `edit` summary (feedback loop)
- [ ] **Lưu trữ:** Thêm table `summaries {id, session_id, window_start, window_end, content, model}`

**Tiêu chí done:** Họp 10 phút, bấm "Tóm tắt", nhận được 5 bullet + 3 action items trong 3s.

---

## Phase 4+: Đề xuất mở rộng (Backlog - Chọn lọc)

Bạn đã có 3 phase lõi. Dưới đây là các tính năng có thể phát triển thêm, nhóm theo giá trị, đã sắp xếp ưu tiên khuyến nghị.

### Nhóm A: Nâng cao chất lượng Caption (High ROI, nên làm sớm)

| Tính năng | Mô tả | Độ khó | Giá trị |
|-----------|-------|--------|---------|
| **Speaker Diarization** | Phân biệt người nói "Speaker 1, 2" hoặc đặt tên. Deepgram/Azure có sẵn `diarize=true`. UI màu khác nhau. | Thấp | Cao cho meeting |
| **Custom Vocabulary / Glossary** | Cho phép user thêm từ riêng (tên công ty, thuật ngữ y khoa, tên người) để STT chính xác hơn. Deepgram `keywords` param. | Thấp | Cao |
| **Noise Suppression & VAD tuning** | Cho user chỉnh độ nhạy VAD, bật RNNoise để lọc tiếng ồn quán cafe. | Trung bình | Cao |
| **Real-time Correction** | User click vào caption để sửa, correction được gửi lại LLM để học cho câu sau. | Trung bình | Cao |

### Nhóm B: Năng suất & Workflow

| Tính năng | Mô tả | Độ khó | Giá trị |
|-----------|-------|--------|---------|
| **Semantic Search History** | Lưu transcript vào `pgvector` + embedding, cho phép tìm "đoạn nói về pricing hôm qua". | Trung bình | Rất cao |
| **Export đa định dạng** | `.srt`, `.vtt`, `.txt`, `.pdf`, `.docx` + chia speaker. | Thấp | Cao |
| **OBS Overlay** | URL `.../overlay?session=xxx` trong suốt để streamer gắn vào OBS. | Thấp | Cao cho streamer |
| **Meeting Bot Integration** | Bot tham gia Zoom/Meet/Google Meet, caption cho cả phòng (mỗi người thấy ngôn ngữ mình). | Cao | Rất cao |
| **Notion/Slack/O365 Sync** | Auto đẩy summary + transcript vào Notion DB sau mỗi session. | Trung bình | Cao |

### Nhóm C: AI Nâng cao (khác biệt so với đối thủ)

| Tính năng | Mô tả | Độ khó | Giá trị |
|-----------|-------|--------|---------|
| **Live TTS Voice-over** | Dịch xong đọc lại bằng giọng VI (ElevenLabs / Azure TTS), như thuyết minh. | Trung bình | Wow factor |
| **Sentiment & Emotion** | Hiện cảm xúc người nói (tích cực/tiêu cực) realtime. | Trung bình | Trung bình |
| **Chapter & Topic Segmentation** | Tự chia buổi nói thành các chương "00:00 Intro, 02:15 Demo..." | Thấp (LLM) | Cao |
| **Q&A trên transcript** | Chat với transcript: "Họ nói gì về deadline?" (RAG). | Trung bình | Cao |
| **Translation Style** | Chọn phong cách dịch: Formal, Casual, Kỹ thuật, Thân thiện. | Thấp | Cao |

### Nhóm D: Platform & Scale

| Tính năng | Mô tả | Độ khó | Giá trị |
|-----------|-------|--------|---------|
| **Offline Mode (WASM)** | Chạy `whisper.cpp WASM` + `NLLB` ngay trong browser, không cần server, privacy 100%. | Cao | Cao cho privacy |
| **Mobile Companion** | App React Native để caption cuộc họp offline (bắt mic điện thoại). | Cao | Trung bình |
| **Developer API / SDK** | Cho bên thứ 3 embed `live-translate` vào app họ qua `iframe` + API key. | Trung bình | Monetization |
| **Multi-target song song** | 1 nguồn EN dịch đồng thời ra 3 ngôn ngữ (VI, JA, KO) cho phòng họp đa quốc gia. | Thấp | Cao |

### Khuyến nghị ưu tiên sau Phase 3

1.  **Làm ngay sau Phase 3:** `Speaker Diarization` + `Custom Vocabulary` (dễ, giá trị cao)
2.  **Quý tiếp theo:** `Semantic Search` + `OBS Overlay` + `Export`
3.  **Dài hạn:** `Meeting Bot` + `Offline WASM` để tạo moat kỹ thuật

---

## Checklist kỹ thuật cần chuẩn bị

- [ ] Tài khoản Deepgram (200$ free nếu dùng deepgram) + Custom AI endpoint (`CUSTOM_BASE_URL` - Ollama/OpenRouter/Groq...) , ElevenLabs (nếu làm TTS)
- [ ] Node 20+, Rust (nếu làm Tauri), Python 3.11, ffmpeg
- [ ] Thiết kế prompt dịch live nếu dùng LLM (theo ngôn ngữ)
- [ ] Dataset test: video EN, JA, VI mỗi loại 3 video để đo WER và latency đa ngôn ngữ

## Ước lượng chi phí vận hành (100 user, mỗi user 60 phút/ngày)

- STT Deepgram: 100 * 60 * 30 * $0.0043 = ~$774/tháng (không đổi theo ngôn ngữ) | `webspeech`/`faster-whisper` = 0đ
- Translate MyMemory FREE: 0đ (~5000 ký tự/ngày/IP) | Custom AI: ~$10-30/tháng (tùy `CUSTOM_MODEL`, tăng tuyến tính theo số target)
- Summary Custom AI: ~$5-15/tháng (chỉ khi user bấm tóm tắt, cùng `CUSTOM_*`)
- Server Fly.io (2 vCPU + 4GB): ~$40/tháng
- => Self-host Whisper sẽ giảm 80% cost STT nếu vượt 500 giờ/tháng; MyMemory/Custom thay Google giảm cost dịch về 0đ

## Definition of Done

- **Phase 1:** P95 latency < 1.5s, WER < 12% EN->VI
- **Phase 2:** Đổi ngôn ngữ không cần restart, 3 cặp ngôn ngữ test đều pass
- **Phase 3:** Summary 10 phút < 3s, user rating > 4/5
