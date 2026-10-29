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

## Round 2 (2026-10-29) — Enterprise upgrade

Objective: deep review (architecture, duplication, security, a11y, perf, bugs), a consistent
design system + dark/light theming, and 4 new features (shareable session rooms, session
stats dashboard, transcript export upgrades, centralized settings persistence with
language-pair presets).

### Kết quả Review đợt 2

| # | Severity | Vị trí | Vấn đề | Fix |
|---|----------|--------|--------|-----|
| R2-1 | MAJOR | web/hooks/useLiveCaption.ts:48-49 | **Build hỏng từ đợt 1**: `next build` prerender `/` crash `window is not defined` — fix #14 derive `wss:` dùng `window.location.hostname` NGOÀI nhánh `typeof window` guard | SSR-safe: chỉ đọc `window` khi `typeof window !== "undefined"` |
| R2-2 | MAJOR | web/hooks/useLiveCaption.ts:174-241 | Duplication ~40 dòng: webspeech onInterim/onFinal callbacks lặp y hệt cho mic & tab path; saveTranscript seq dùng `finalsRef.current.length` (stale trong batch) | Extract `pushFinal()` + 1 callback factory; seq đếm bằng ref |
| R2-3 | MINOR | web (5 files) | Settings persistence rải rác: `lt:sourceLang/targetLangs/providers` (hook), `lt:prefs` (page, JSON.parse KHÔNG validate), `lt:iframe:*` (player), `lt:sttProvider` (selector) | `lib/settings.ts` — single source of truth, validate mọi field, typed getters/setters |
| R2-4 | MINOR | web/app/page.tsx:64-73 | Export SRT/VTT dùng timestamp GIẢ (`Date.now() + i*1000`) cho seq-mapped sentences → cue sai hoàn toàn so với thời điểm nói | Hook track `sentencesTs[seq]` (ts thật của final sinh ra câu) |
| R2-5 | MINOR | web/hooks/useLiveCaption.ts | `finals`/`sentences`/`translations` mọc vô hạn client-side (session dài → render chậm, RAM) | Cap 2000 segment (mirror server deque) |
| R2-6 | MINOR | web components | A11y: nút icon-only (⛶ ↗ ✕) không aria-label; tabs thiếu `role=tablist/aria-selected`; caption không `aria-live` | Bổ sung ARIA + focus-visible |
| R2-7 | MINOR | toàn bộ web UI | Không có design system: `bg-zinc-950/900/800` + border lặp thủ công ở 9 files; 2 chuỗi tiếng Việt sót trong UI English ("Không thể kết nối server", "Tab (kể cả iframe)"); không light mode | Tailwind semantic tokens (CSS vars) + component classes (`.btn/.card/.input/.badge/.tab`) + theme toggle dark/light, persist |
| R2-8 | MINOR | server/main.py:379 | `summary:request` nhận transcript client KHÔNG giới hạn độ dài (payload khổng lồ → LLM cost) | Cap 50k chars |
| R2-9 | MINOR | web/components/CaptionOverlay.tsx:27 | `JSON.stringify(translations)` trong deps effect — O(n) mỗi render | So sánh bằng ref count |
| R2-10 | MINOR | web/lib/store.ts | Zustand store gần như dead code (page dùng state cục bộ) | Giữ (tests phụ thuộc), ghi nhận tech-debt |

### Planned changes

- Fix R2-1…R2-9; không đụng fix Round 1 (sandbox iframe, backoff, deque, double-handling).
- Features: (1) **Shareable session rooms** `?room=` — join payload đã hỗ trợ `roomId` ở server, web chưa gửi; thêm room input + copy link. (2) **Session stats tab** (words, sentences, WPM, duration, per-language counts). (3) **Export TXT/Markdown + copy transcript**. (4) **Settings persistence tập trung** + **language-pair presets** + **theme toggle**.
- Design system: tokens + component classes, áp cho page + mọi component.

## Trạng thái

- [x] Round 1: Plan; Fix #1–#8, #11–#17; vitest 24/24, tsc clean; pytest 73/83 (10 fail pre-existing env Python 3.14)
- [x] Round 2: plan → implement → verify → commit (hoàn tất 2026-10-29)

## Round 2 — Kết quả thực hiện (2026-10-29)

### Phiên bị gián đoạn (WIP recovery)

Round 2 đã bắt đầu ở session trước nhưng bị interrupt giữa chừng, để lại 5 file
modified + 2 file mới **chưa commit và không build được** (duplicate import
`saveSetting`, biến `MAX_SEGMENTS` không tồn tại, khối `colors` tailwind bị
thiếu wrapper, `seqRef` stale). Đã review + sửa + commit lại thành
`c0bb728 fix(web): complete interrupted round-2 WIP`.

### Implemented

| # | Commit | Nội dung |
|---|--------|----------|
| 1 | `c0bb728` | Complete interrupted WIP: hook fixes (MAX_FINALS cap, monotonic seqRef), settings.ts/stats.ts/socket roomId, design tokens CSS+tailwind, srt exporters |
| 2 | `ad339bc` | Design system áp dụng toàn UI (semantic tokens, .btn/.card/.input/.badge/.tab), ThemeToggle dark/light + no-FOUC bootstrap, a11y (role=tablist, aria-selected, aria-live, aria-label icon buttons, role=alert), fix R2-9 |
| 3 | (tiếp) | Export features (R2-4: SRT/VTT dùng ts thật + alignment translations theo seq; TXT/MD/copy transcript), stats tab (StatsPanel + computeStats), shareable rooms (?room= + copy link), presets ngôn ngữ, settings tập trung qua loadSettings/saveSetting (bỏ lt:prefs raw) |
| 4 | (commit) | tests: settings/stats/export (25 test mới → web 49/49), server: cap 50k chars summary payload (R2-8) |

### Verify

- `pnpm typecheck` (web): clean; `vitest`: **49/49 passed** (7 files); shared: **28/28**.
- `next build`: ✓ (prerender 5/5, không còn crash `window is not defined`).
- pytest (Python 3.14 system): 10 failed / 73 passed — **same count as Round-1 baseline** (pre-existing env failures: `cgi` removed, httpx).
- Turbo build: web + shared build OK.

### Review Log Round 2

- WIP recovery: phát hiện 4 bug trong WIP (dup import, MAX_SEGMENTS undefined
  gây crash runtime, tailwind `colors` thiếu wrapper làm mất token
  app/surface/raise/hover/line, saveTranscript seq stale khi server seq có mặt)
  — sửa hết trước khi commit.
- Test tự viết: 4 fail đầu là expectation sai của chính test (translations map
  theo seq gốc, "\n\n" join, ts=0 hợp lệ) — sửa test, không sửa code cho khớp
  expectation sai.
- CSS build fail: `focus:border-line-strong` (camelCase key `lineStrong` phải
  viết `border-lineStrong`) — đã sửa, build pass.
- Custom `.sr-only:not(:focus)` trong globals.css bị utilities layer của
  Tailwind override vô dụng → bỏ, dùng aria-label thật trên icon buttons.

## Review Log

### Vòng 1
- Self-review: (1) edit socket.ts đầu tiên viết dư dòng `reconnectAttempt = Math.min(...)` — đã dọn; (2) edit main.py STT_CONNECT làm mất dòng `try:` — khôi phục và verify bằng `ast.parse`; (3) `test_deepgram_ssl_context` bắt NameError thiếu `import logging` — fix; 4 test httpx/cgi fail là môi trường Python 3.14 (`cgi` removed), cùng fail count trên HEAD sạch.
- `unsubAll` cleanup giờ là unsub duy nhất — kiểm tra return của useEffect không còn unsub mồ côi.
