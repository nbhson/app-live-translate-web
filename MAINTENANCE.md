# Maintenance & Operations

Documentation for post-launch maintenance, scaling, and cost control.

## 1. Observability

### Required Metrics

| Metric | Tool | Alert |
|--------|------|-------|
| `stt_latency_p95` (ms) | Server log + Prometheus | > 2000ms |
| `translation_latency` | Server log | > 500ms |
| `ws_disconnect_rate` | Socket.io + Posthog | > 5% |
| `api_cost_per_minute` | Custom counter | > $0.006/min |
| `vad_filtered_ratio` | Server log | < 30% (low filtering -> wasted cost) |
| `model_version` | DB field | track for rollback |

### Logging

- Log every request: `timestamp, userId, roomId, duration, sttProvider, translationProvider, cost`
- Use `Sentry` for errors (Rust panic, WebSocket exceptions, API 429).
- `Posthog` for product analytics: caption minutes/day, retention.

## 2. Cost Management

STT is the largest cost. Rules:

1.  **VAD is mandatory:** Do not send silent chunks. Saves 30-40%.
2.  **Fallback chain:** `Deepgram (primary) -> Azure (secondary) -> faster-whisper self-host (tertiary)`. Auto-switch when primary returns 429 or high latency.
3.  **Self-host threshold:** When usage > 500 hours/month, deploying `faster-whisper` on `Fly GPU` or `RunPod` is 70% cheaper than Deepgram. Re-evaluate quarterly.
4.  **Translation cache:** Cache `EN sentence -> VI` in `Redis` with 7-day TTL. Live captions often repeat greetings and filler phrases.
5.  **Rate limit:** Max 120 minutes/day per user on free tier.

## 3. Model & Provider Management

- **Versioning:** Store `stt_model: "nova-3@2026-09-01"` and `translate_model: "custom:${CUSTOM_MODEL}"` or `"mymemory"` in the `transcripts` table. Compare quality when switching models.
- **A/B Test:** Route 10% of users to Custom AI translation, 90% to MyMemory FREE, measure satisfaction (thumbs up).
- **Updates:** Deepgram/Custom providers may update models without notice. Run a weekly cron job testing with 3 sample videos, measure WER/BLEU, alert if WER increases > 2%.
- **Backup provider:** Always keep 2 API keys per provider, rotate on expiry.

## 4. Privacy & Security

- **No storage by default:** Audio blobs are never written to disk. Only store transcripts if user enables `Save history` in Settings (opt-in).
- **Transport:** `wss://`, `https://` only. Do not log transcript content on server (log length only).
- **Data retention:** Keep transcripts for 30 days unless user deletes. Allow `Delete all` in one click.
- **Compliance:** State clearly in `Privacy Policy`: "App listens to audio for captioning, does not send audio to third parties beyond the chosen STT provider". If self-hosting Whisper, this is a privacy USP.
- **Tauri:** Requires `NSMicrophoneUsageDescription` and an explanation for Screen Recording permission on macOS.

## 5. CI/CD & Release

### Web + Server

- `main` -> auto deploy `apps/web` to Vercel, `apps/server` to Fly.io via `GitHub Actions`.
- Run `pnpm test` (unit for SentenceBuffer, VAD) + `e2e` (Playwright mock WebSocket) before deploying.

### Chrome Extension

- Bump version in `apps/extension` `manifest.json`.
- Upload zip to Chrome Web Store via `chrome-webstore-upload-cli` in CI. Review takes 1-3 days.

### Desktop (Tauri)

- Use `tauri-action` to build for `macOS (aarch64/x64)`, `Windows x64`, `Linux`.
- `GitHub Release` + `Tauri updater` for auto-update. Sign with Apple Developer cert (otherwise blocked by Gatekeeper).

## 6. Common Issues

| Issue | Cause | Fix |
|-------|-------------|----------|
| Caption frozen | WebSocket disconnect, Deepgram 429 | Client auto-reconnect with backoff 1s, 2s, 5s. Server queues chunks. |
| Jittery/inaccurate translation | SentenceBuffer splits sentences incorrectly | Tune `minWords=6`, `pauseMs=700ms`. Add LLM context window of 3 previous sentences. |
| Echo / mic feedback | Loopback + Mic both enabled | UI lets user choose source: `System Audio` or `Mic` or `Both`, default `System` |
| macOS cannot capture audio | Missing Screen Recording permission | Guide user to `System Settings -> Privacy -> Screen Recording` to enable app |
| Cost spike | Bot or tab left overnight | Rate limit + auto-pause when VAD is silent > 2 minutes |

## 7. Long-term Maintenance Roadmap (6-12 months)

- **Q1:** Stabilize MVP, add LLM streaming translation, collect feedback.
- **Q2:** Self-host Whisper if cost is high, add new languages (EN->JA).
- **Q3:** Add end-of-session `Summary` (use LLM to summarize transcript), `Keyword highlight`.
- **Q4:** Evaluate migration to `WebRTC` if multi-user real-time is needed (e.g., shared caption meeting room).

## 8. On-call Checklist

- [ ] Sentry alert -> check Fly.io logs `fly logs -a live-translate-server`
- [ ] Deepgram status https://status.deepgram.com
- [ ] Rollback: `fly deploy --image <prev>` or switch provider via `apps/server/src/config.ts` flag `STT_PROVIDER=azure`
