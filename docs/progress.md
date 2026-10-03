# Progress

## Done
- M0 Plan and scaffold: PLAN/CLAUDE/decisions/design-system docs, monorepo, shared core (state machine, taxonomy, backoff, breaker, budget; 22 tests, 100% lines), WXT extension loads in Chromium (Playwright smoke test), Laravel 12 boots, Filament v4 login and staff-role gating tested (8 Pest tests), CI skeleton.
- M1 Foundation: auth (email, Google, reset, verify), roles, devices with plan limits, entitlements, ETag remote config, error envelope, OpenAPI export + generated TS client, vault (AES-GCM, PBKDF2) with 7 tests, remote-config loader with Zod + bundled fallback, extension login + config fetch e2e against the real Laravel server. 21 Pest, 32 shared, 7 extension unit tests.
- M2 Provider layer: adapter interfaces (text, image, video, upscale, voice), Anthropic adapter (verified against docs), OpenAI-compatible + custom endpoint, ElevenLabs, fal.ai video/upscale (unverified shapes, fixtures hand-written), error taxonomy via shared http helper, admin model registry with publish-to-config, Settings > Keys with Test connection (e2e against a mock server). Local ffmpeg.wasm upscale fallback deferred to M7.
- M3 Run and queue engine: durable QueueEngine in shared (per-provider pacing that learns from 429, full-jitter backoff, retry-after, budget cap, circuit breaker, restart recovery; 11 tests), Create tab (multi-prompt, .txt/.csv import, naming template, cost estimate, budget cap), Dexie-backed runner in the service worker (Web Lock loop, chrome.alarms safety net, exactly-once auto-download). 4 Playwright e2e: ordered run, 429 retry + policy flag without stalling, budget pause, browser restart mid-run.
## In progress
M4 Story Bible and consistency
## Next
M5 Script analysis and approval gates
## Known issues
- Sandbox has no real provider keys, no MySQL server, no Chrome Web Store, no live billing.
- Larastan/phpstan cannot be installed in the sandbox (GitHub zipball downloads blocked by egress policy); CI installs it. Static analysis is therefore unverified locally.
- Composer in the sandbox needs `--prefer-source`.
- Create tab only supports image generation; video comes with M7. Passphrase-mode vaults cannot be unlocked by the service worker yet, so runs pause with a clear message (fix planned in M7: session key handoff).
- Download filenames are asserted from the paths the extension requests (Playwright renames downloads to GUIDs).
