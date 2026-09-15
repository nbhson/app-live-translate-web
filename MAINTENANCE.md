# Maintenance & Vận Hành

Tài liệu cho việc duy trì, mở rộng và kiểm soát chi phí sau khi launch.

## 1. Giám sát (Observability)

### Metrics phải có

| Metric | Tool | Alert |
|--------|------|-------|
| `stt_latency_p95` (ms) | Server log + Prometheus | > 2000ms |
| `translation_latency` | Server log | > 500ms |
| `ws_disconnect_rate` | Socket.io + Posthog | > 5% |
| `api_cost_per_minute` | Custom counter | > $0.006/phút |
| `vad_filtered_ratio` | Server log | < 30% (lọc ít -> tốn tiền) |
| `model_version` | DB field | track để rollback |

### Logging

- Mỗi request log: `timestamp, userId, roomId, duration, sttProvider, translationProvider, cost`
- Dùng `Sentry` cho error (Rust panic, WebSocket exception, API 429).
- `Posthog` cho product analytics: số phút caption/ngày, retention.

## 2. Quản lý Chi phí

STT là chi phí lớn nhất. Quy tắc:

1.  **VAD bắt buộc:** Không gửi chunk im lặng. Tiết kiệm 30-40%.
2.  **Fallback chain:** `Deepgram (primary) -> Azure (secondary) -> faster-whisper self-host (tertiary)`. Khi primary 429 hoặc latency cao, tự switch.
3.  **Self-host threshold:** Khi usage > 500 giờ/tháng, dựng `faster-whisper` trên `Fly GPU` hoặc `RunPod` sẽ rẻ hơn 70% so với Deepgram. Tính toán lại mỗi quý.
4.  **Translation cache:** Cache `EN sentence -> VI` trong `Redis` TTL 7 ngày. Live caption hay lặp lại câu chào, câu nối.
5.  **Rate limit:** Mỗi user tối đa 120 phút/ngày ở free tier.

## 3. Quản lý Model & Provider

- **Versioning:** Lưu `stt_model: "nova-3@2026-09-01"` và `translate_model: "google-v3"` vào DB `transcripts` table. Khi đổi model, có thể so sánh chất lượng.
- **A/B Test:** Cho 10% user dùng LLM translate, 90% dùng Google, đo satisfaction (thumbs up).
- **Update:** Deepgram/Azure update model không báo trước. Cần job cron weekly test với 3 video mẫu, đo WER, alert nếu WER tăng > 2%.
- **Backup provider:** Luôn giữ 2 API key cho mỗi provider, rotate khi key hết hạn.

## 4. Privacy & Bảo mật

- **Mặc định không lưu:** Audio blob không bao giờ lưu disk. Chỉ lưu transcript nếu user bật `Lưu lịch sử` trong Settings (opt-in).
- **Transport:** Chỉ `wss://`, `https://`. Không log nội dung transcript ở server log (chỉ log length).
- **Data retention:** Transcript lưu 30 ngày nếu user không xóa. Cho phép `Xóa tất cả` 1 click.
- **Compliance:** Ghi rõ trong `Privacy Policy`: "App nghe audio để caption, không gửi audio tới bên thứ 3 ngoài STT provider đã chọn". Nếu self-host Whisper thì đây là USP về privacy.
- **Tauri:** Cần `NSMicrophoneUsageDescription` và giải thích tại sao cần Screen Recording trên macOS.

## 5. CI/CD & Release

### Web + Server

- `main` -> auto deploy `apps/web` lên Vercel, `apps/server` lên Fly.io via `GitHub Actions`.
- Chạy `pnpm test` (unit cho SentenceBuffer, VAD) + `e2e` (playwright mock WebSocket) trước khi deploy.

### Chrome Extension

- `apps/extension` version bump trong `manifest.json`.
- Upload zip lên Chrome Web Store via `chrome-webstore-upload-cli` trong CI. Review mất 1-3 ngày.

### Desktop (Tauri)

- Dùng `tauri-action` build cho `macOS (aarch64/x64)`, `Windows x64`, `Linux`.
- `GitHub Release` + `Tauri updater` để auto-update. Ký code với Apple Developer cert (nếu không user sẽ bị Gatekeeper chặn).

## 6. Xử lý sự cố thường gặp

| Sự cố | Nguyên nhân | Cách fix |
|-------|-------------|----------|
| Caption đứng hình | WebSocket disconnect, Deepgram 429 | Client auto-reconnect với backoff 1s, 2s, 5s. Server queue lại chunk. |
| Dịch giật, sai ngữ pháp | SentenceBuffer tách câu sai | Tune ngưỡng `minWords=6`, `pauseMs=700ms`. Thêm LLM context window 3 câu trước. |
| Tiếng vang, mic hú | Loopback + Mic cùng bật | UI cho chọn nguồn: `System Audio` hoặc `Mic` hoặc `Both`, mặc định `System` |
| macOS không bắt được audio | Chưa cấp quyền Screen Recording | Hướng dẫn user vào `System Settings -> Privacy -> Screen Recording` bật app |
| Chi phí tăng đột biến | Bot hoặc tab để qua đêm | Rate limit + auto-pause khi VAD im lặng > 2 phút |

## 7. Lộ trình bảo trì dài hạn (6-12 tháng)

- **Q1:** Ổn định MVP, thêm LLM translate streaming, thu thập feedback.
- **Q2:** Self-host Whisper nếu cost cao, thêm ngôn ngữ mới (EN->JA).
- **Q3:** Thêm tính năng `Summary` cuối buổi (dùng LLM tóm tắt transcript), `Keyword highlight`.
- **Q4:** Đánh giá chuyển sang `WebRTC` nếu cần multi-user real-time (ví dụ: phòng họp chung caption).

## 8. Checklist On-call

- [ ] Sentry alert -> check Fly.io logs `fly logs -a live-translate-server`
- [ ] Deepgram status https://status.deepgram.com
- [ ] Rollback: `fly deploy --image <prev>` hoặc switch provider trong `apps/server/src/config.ts` flag `STT_PROVIDER=azure`
