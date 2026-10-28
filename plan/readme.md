# Plan — app-live-translate-web

> Live caption + translate: Next.js web + FastAPI WS server (Deepgram/Whisper STT)
> + Chrome extension sidepanel. Monorepo pnpm/turbo.

## Kết quả Review (audit đợt 1)

| # | Severity | Vị trí | Vấn đề | Fix |
|---|----------|--------|--------|-----|
| 1 | MAJOR | web/hooks/useLiveCaption.ts:150-161 | Mỗi event xử lý 2 lần: `sock.on("*")` + per-type listeners đều gọi `handleServerEvent` (socket trigger cả hai) → finals/translations/suggestions NHÂN ĐÔI | Bỏ 8 per-type listeners, chỉ giữ `"*"` |
| 2 | MAJOR | server/main.py:101 | `session.transcripts` (list) mọc vô hạn trong đời session → memory exhaustion với họp dài | `deque(maxlen=2000)` |
| 3 | MAJOR | server/stt/deepgram.py:21-23 | `DEEPGRAM_INSECURE_SSL=1` tắt TLS verify cho kết nối mang API key + audio = MITM | Fail hard khi ENV/NODE_ENV=production; dev vẫn cho phép nhưng warning |
| 4 | MAJOR | web/components/UrlIframePlayer.tsx:140 | URL user paste load vào iframe với `allow="microphone; camera; display-capture; clipboard-read/write; geolocation"` và KHÔNG sandbox → trang độc hại được cấp quyền mạnh | `sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"` + bỏ quyền mic/camera/clipboard/geo khỏi `allow` |
| 5 | MAJOR | web/lib/socket.ts:55-61 | Reconnect fixed 1500ms vô hạn, không backoff → client tự DDoS server khi server down | Exponential backoff (cap 15s) + jitter; reset khi open thành công |
| 6 | MINOR | server/main.py:290,332,368,393 | Raw `str(e)` (chứa upstream URL per llm.py) trả client | Fixed message + `logger.error` chi tiết |
| 7 | MINOR | server/stt/deepgram.py:71 | Log 6 ký tự đầu API key | Bỏ key khỏi log |
| 8 | MINOR | server/main.py:373-382 | Summary "streaming" `sleep(0.02)`/chunk chạy trong WS receive loop — block audio frames của client đó vài giây | Ghi nhận follow-up (cần restructure session loop) — risk thấp vì summary chỉ chạy theo request |
| 9 | MINOR | server/main.py:167,361 | `asyncio.create_task` fire-and-forget không giữ ref — task có thể bị GC giữa chừng | Ghi nhận follow-up (cần refactor callback wiring) |
| 10 | MINOR | server/stt/deepgram.py:71 | Log raw transcripts INFO (PII) | Bỏ (đã có ở send_pcm chỉ log count) |
| 11 | MINOR | web/lib/srt.ts:36-37 | `toVtt` replaceAll "," trên TOÀN BỘ output → dấu phẩy trong caption thành chấm | Regex chỉ đổi ',' trong timestamp line |
| 12 | MINOR | web/lib/srt.ts:19 | `end < start` (cue duration âm) khi timestamps sát nhau | `Math.max(start + 1, ...)` |
| 13 | MINOR | web/lib/db.ts:45-56 | `getHistory` không close IndexedDB connection (leak, khác với save/clear) | `finally { db?.close() }` |
| 14 | MINOR | web/hooks/useLiveCaption.ts:46 | Hardcode `ws://localhost:8000` gãy trên HTTPS (mixed content) | Derive `wss:` từ `location.protocol` khi env unset |
| 15 | MINOR | web/app/page.tsx:40 | `JSON.parse(lt:targetLangs)` dùng thẳng không validate | Validate array-of-string, corrupted → default |
| 16 | MINOR | web/audio/webSpeech.ts:58-68 | `onend` restart ngay lập tức vô hạn khi start() liên tục throw | Retry counter (max 20) + delay tăng dần 200ms→2s |
| 17 | MINOR | repo root | `tsconfig.tsbuildinfo` + `image.png` (2.2MB) committed | `git rm --cached` + xóa |

## Không sửa (đã cân nhắc, ghi nhận)

- **Fire-and-forget suggest tasks không giữ reference** (#9): cần restructure session lifecycle — rủi ro regression lớn hơn lợi ích trong đợt này.
- **`/api/sessions` dead stubs**: vô hại (trả []), xóa sẽ phá client gọi — ghi nhận.
- **docker-compose weak Postgres creds**: compose dev-local, ports đã internal; đổi creds cần sync docs.
- **Extension sidepanel duplicate code**: repo con của extension riêng (app-live-translate-extension) — fix ở repo đó.
- **Summary streaming block WS loop**: cần đổi kiến thức session loop; cấu trúc hiện tại 1 client/session nên impact thấp.

## Trạng thái

- [x] Plan
- [x] Fix #1–#8, #11–#17
- [x] Web: vitest **24/24 pass**, `tsc --noEmit` clean; Server: pytest 73/83 (10 fail **pre-existing env**: Python 3.14 + httpx mock assert — fail cả trên HEAD sạch, đã verify bằng stash)
- [x] Commit + self-review

## Review Log

### Vòng 1
- Self-review: (1) edit socket.ts đầu tiên viết dư dòng `reconnectAttempt = Math.min(...)` — đã dọn; (2) edit main.py STT_CONNECT làm mất dòng `try:` — khôi phục và verify bằng `ast.parse`; (3) `test_deepgram_ssl_context` bắt NameError thiếu `import logging` — fix; 4 test httpx/cgi fail là môi trường Python 3.14 (`cgi` removed), cùng fail count trên HEAD sạch.
- `unsubAll` cleanup giờ là unsub duy nhất — kiểm tra return của useEffect không còn unsub mồ côi.
