# Manual QA checklist

Everything automated in this repository ran against mocks (mock providers, a stand-in Paddle webhook, a real Laravel server on SQLite). This list is what could not be verified and must be checked by a person with real accounts. Tick each line only after doing it.

## Provider adapters (need real keys and a little money)
- [ ] Anthropic: Test connection; script analysis with `output_config.format`; confirm whether `anthropic-dangerous-direct-browser-access` is needed from an extension origin; prompt caching actually hits.
- [ ] OpenAI (or the chosen image provider): image generation response shape, current image model id, moderation error code, and the multipart `/images/edits` call used by Angles, Stylize and keyframe references.
- [ ] fal.ai: queue URLs, input field names for the chosen video model and upscale model, CORS from the extension, key-test probe behaviour, price units. These are the least verified part: see `docs/provider-notes.md` (sections marked UNCONFIRMED).
- [ ] ElevenLabs: response format, error shape, voices endpoint. Audio (S10) is not wired into runs.
- [ ] Verify the model registry prices against current provider pricing pages, then publish a config.

## Product behaviour with real models
- [ ] Run a 3 to 5 scene script end to end on Checkpoints. Judge: do the same characters look like each other across shots; do locations stay stable; are refined prompts better than the raw ones; does the pilot gate show useful keyframes.
- [ ] Draft-then-upscale with a real upscaler: compare against native 720p; check output dimensions and duration.
- [ ] Local resize fallback on a real provider clip (H.264) in Chrome stable.
- [ ] Frame extraction on H.264 mp4 in Chrome stable (automated test used WebM).
- [ ] Kill Chrome mid-run on a real provider job and confirm it resumes without a second charge.
- [ ] Sleep the laptop mid-run, wake it, confirm reconciliation. Test "keep awake" in Settings (the optional power permission).
- [ ] Budget cap and circuit breaker with a real provider that returns 429 and a revoked key.

## Chrome Web Store
- [ ] Load the zip in Chrome stable; check the side panel opens from the toolbar icon on a clean profile.
- [ ] Single-purpose statement, permission justifications (storage, sidePanel, alarms, downloads, offscreen, unlimitedStorage, optional power, provider hosts), privacy policy URL (`/privacy` on the deployed backend), screenshots, data-use disclosures (account email; anonymous usage counts).
- [ ] Confirm the WASM CSP (`wasm-unsafe-eval`) and the bundled 32 MB ffmpeg core pass review; if not, drop the local resize fallback.

## Backend and billing
- [ ] Run migrations on MySQL 8 (CI does this on a service container); run the Filament admin on a real browser through every resource.
- [ ] Larastan level 8 passes (CI installs it; it could not be installed in the authoring sandbox).
- [ ] Paddle: confirm your country is supported for sellers (Pakistan was assumed), create products and price ids, set `paddle_price_id` on plans, set the webhook secret, buy with a sandbox card, cancel, check plan changes. The webhook scheme and transactions API are written from memory of the docs.
- [ ] Google sign-in: create the OAuth client, set `GOOGLE_CLIENT_ID`, test with a real account.
- [ ] Email: configure a real mail driver and check verification, reset and support reply mails render and links work behind your domain (`APP_URL`, trusted hosts).
- [ ] Staff two-factor authentication (recommended, not implemented).
- [ ] Dashboard: generate real activity from two installs and compare the numbers with what you did.

## Accessibility and visual
- [ ] Screen reader pass (NVDA or VoiceOver) on every tab. Axe found no violations on the automated pass; that is not a full audit.
- [ ] Visual review of dark and light on a real Chrome side panel width and at 200% zoom.
