# Frameloom build plan

Source of truth for architecture. If code and this file disagree, fix one of them in the same commit.
Product name is a working name and lives only in `brand.config.json` at the repo root.

## 1. Architecture

```
apps/extension  MV3 side panel (WXT, React 18, Tailwind tokens, Zustand, Dexie, Zod)
apps/api        Laravel 12 + Filament v4 (auth, plans, remote config, templates, telemetry, admin)
packages/shared pure TS: schemas, prompt compiler, director logic, run state machine, adapter interfaces, evals
packages/api-client  TS client generated from apps/api OpenAPI
```

Data flow: the extension talks to providers directly from the service worker with the user's keys.
It talks to the backend only for account, entitlements, remote config, templates and counts-only telemetry.
The backend never sees keys, prompts, scripts or media (enforced by a payload allowlist plus an e2e network-capture test).

### Extension runtime
- Service worker: thin. Wakes on `chrome.alarms`, message, or startup; reads queue state from IndexedDB; dispatches work.
- Offscreen document: long polling, frame extraction, ffmpeg.wasm (lazy), anything that outlives a worker.
- Side panel: React UI; reads state from Dexie via live queries; sends commands to the worker.
- No in-memory timers for durable work. Every job transition is a single Dexie transaction.

### Key vault
AES-GCM via WebCrypto. Passphrase mode: PBKDF2-SHA256, 600k iterations, random salt, key derived on unlock and held in worker memory only.
No-passphrase mode: non-extractable CryptoKey stored in IndexedDB. Protects against casual file/profile-dump reading of ciphertext;
does NOT protect against malware running as the user or other code in the extension origin. The UI says so.

## 2. Data model (IndexedDB, Dexie)
projects, runs, scripts, analyses, characters, characterVersions, locations, locationVersions, props, styles,
shots, shotAttempts, jobs, assets (blobs), library, albums, snippets, prompts, logs, kv(settings, registryCache).
Locks are immutable rows (`character@v3`); shots reference exact version ids.

Backend (MySQL): users, devices, plans, entitlements, subscriptions, templates (+revisions), presets, dialects,
models/providers registry (+versions), config_versions, announcements, releases, feature_flags, feedback,
telemetry_events (raw, purged) + telemetry_daily (aggregates), audit_logs (append-only), webhook_events (idempotency).

## 3. Run state machine
`draft -> analysing -> awaiting_approval -> building -> generating -> finishing -> completed`; side states `paused`, `failed`, `cancelled`.
Pure reducer in `packages/shared/run`. Events are idempotent (event id dedupe). Persistence wrapper writes state + event log atomically.
Stages S0..S11 each have `isComplete(run)` so resume skips finished work. Job states: queued, running, polling, succeeded, failed, skipped.

## 4. Queue
Per-provider concurrency + adaptive pacing (AIMD on 429). Backoff = min(cap, base*2^n) with full jitter.
Taxonomy: rate_limited, transient (retry); auth, quota (circuit-break); policy_rejected (never blind retry); invalid_request, unknown.
Budget cap: pre-flight estimate per job from registry prices; hard stop when spent+estimate > cap.
Circuit breaker: N consecutive failures or auth/quota -> run paused + notification.
Recovery: on startup/alarm, jobs in `running/polling` with a provider job id are reconciled by polling.

## 5. Milestones
Per the brief (M0..M10). Each ends with: tests green, docs/progress.md updated, conventional commit, push.

## 6. Risks
| Risk | Mitigation |
|---|---|
| Provider APIs change | Adapters + registry + verified-date headers; recorded fixtures; opt-in live tests |
| Identity consistency limits | Keyframe-first, references, heuristic scoring; documented honestly |
| Worker eviction mid-run | IndexedDB state, alarms, offscreen doc, reconcile on wake |
| User spend | Estimates, hard cap, breaker, visible spend |
| Backend privacy leak | Telemetry allowlist, server-side reject of unknown fields, network-capture e2e |
| Scope size | Vertical slices; shared package pure and heavily tested first |
| Sandbox limits (no real keys, no Chrome Web Store, no live billing) | Mocks, recorded in qa-checklist.md and FINAL_REPORT.md |
