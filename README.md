# Live Translate — Live Caption EN + Live Translate VI

Ứng dụng web hiển thị caption tiếng Anh trực tiếp từ mọi audio phát ra trên máy tính và dịch song song sang tiếng Việt ngay lập tức.

> **Constraint quan trọng:** Pure Web App không thể bắt `system audio` do Browser Sandbox. Dự án đi theo lộ trình `Pure Web (POC) -> Chrome Extension -> Tauri Hybrid` với chung 1 core backend.

## Kiến trúc tổng quan

```
[Audio Source: Browser Tab / System / Mic]
        |
        v
[Capture Layer] -> [Pre-processing: VAD + Resample 16kHz] -> [STT Streaming] -> [Translation Buffer] -> [WebSocket] -> [Frontend Overlay]
   Web / Extension / Tauri (Rust cpal)      Silero VAD              Deepgram / Azure / faster-whisper   Google / DeepL / LLM (Gemini/GPT)
```

Chi tiết xem [ARCHITECTURE.md](./ARCHITECTURE.md)

## Lộ trình

| Phase | Mục tiêu | Thời gian | Output |
|-------|----------|-----------|--------|
| 1 - Foundation | Live Caption EN + Live Translate VI (hiện tại) | 2-3 tuần | Web + Extension + Tauri (optional) + Deepgram |
| 2 - Đa ngôn ngữ | Tùy chọn ngôn ngữ nguồn/đích bất kỳ | 2 tuần | Language Selector + STT auto-detect + Translate matrix |
| 3 - AI Summary | Tóm tắt, action items, keywords từ transcript | 2-3 tuần | AI Service (LLM) + Summary Panel |
| 4+ - Backlog | Diarization, Custom Vocabulary, OBS, Offline... | Ongoing | Xem ROADMAP.md: Phase 4+ |

Chi tiết xem [ROADMAP.md](./ROADMAP.md)

## Stack đề xuất 2026

- **Frontend:** Next.js 15 + TypeScript + Tailwind + Zustand + Socket.io-client
- **Backend:** FastAPI (Python) - hợp với faster-whisper, hoặc NestJS
- **STT:** Deepgram Nova-3 / Azure Speech (streaming, interim result) | Self-host: faster-whisper large-v3-turbo
- **Translate:** Google Translation / DeepL (200ms) hoặc LLM Streaming (Gemini 2.0 Flash / GPT-4o-mini) cho tự nhiên
- **Infra:** Docker + Fly.io/Railway (GPU) + Vercel (Frontend) + Redis (queue nếu scale)
- **Monorepo:** pnpm + Turborepo

```
apps/web        # Next.js - UI caption overlay
apps/extension  # Chrome Extension - tabCapture
apps/desktop    # Tauri (Rust) - system loopback (CoreAudio/WASAPI)
apps/server     # FastAPI - WebSocket + STT/Translate proxy
packages/shared # types, utils, sentence-buffer
```

## Quick Start (sau khi scaffold)

```bash
# 1. Cài dependencies
pnpm install

# 2. Chạy server (Python 3.11+)
cd apps/server
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # rồi điền DEEPGRAM_API_KEY
python -m src.main
# Server chạy ở ws://localhost:8000/ws

# 3. Chạy web (terminal mới)
pnpm dev:web          # http://localhost:3000
```

**Cần:**
- Python 3.11+, Node 20+
- `DEEPGRAM_API_KEY` (bắt buộc cho STT - lấy free trial tại deepgram.com)
- `GOOGLE_TRANSLATE_KEY` (tuỳ chọn - nếu thiếu, dịch fallback trả về `[vi] text gốc`)

Lưu ý: Pure Web capture dùng `getDisplayMedia` - khi bấm Start, chọn tab và tick **"Share audio"**.

## Tài liệu

- [ARCHITECTURE.md](./ARCHITECTURE.md) - Kiến trúc chi tiết, so sánh 3 phương án, data flow, sequence diagram
- [ROADMAP.md](./ROADMAP.md) - Plan chi tiết từng phase, task breakdown, ước lượng
- [MAINTENANCE.md](./MAINTENANCE.md) - Vận hành, monitoring, cost, privacy, update

## Nguyên tắc bảo trì

- Không lưu audio mặc định, chỉ lưu transcript khi user bật
- Log cost theo phút STT để alert chi phí
- Model versioning cho STT/Translate để A/B test
- Fallback provider (Deepgram -> Azure) khi provider chính down

Feedback: https://github.com/anomalyco/opencode
