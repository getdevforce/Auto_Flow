# Final report

Branch: `claude/funny-cori-5w4wcc` (the remote had no default branch, so no pull request was opened; open one into your default branch when you create it).

## What was built
**Extension** (Chrome MV3 side panel, WXT, React, Tailwind tokens, Dexie): Autopilot (script in, sequence out) with three autonomy levels; Create (multi-prompt, .txt/.csv import, naming templates, cost estimate, budget cap); Story Bible with immutable character and location versions; Library with albums, search, favorites, storage readout and frame extraction; Prompts (backend template browser, personal prompts); Cinema (camera, effect and style presets, Prompt Director with diff, Angles and Stylize); Settings (account, usage counts opt-out, theme and density, shortcut sheet, project export and import, delete all local data, optional keep-awake permission, feedback, encrypted key vault with per-provider Test connection).

**Autopilot pipeline** S0 to S9 and S11: import (.txt, .md, .fountain, .docx), chunked analysis with alias merge and a coverage check, character and location approval and locks, shot planning with continuity ledger and global sequence numbers, prompt refinement and compile, keyframes with optional vision scoring and retry, video, draft-then-upscale with MP4 size and duration verification (and a local ffmpeg.wasm Lanczos resize fallback), pilot-scene gate, failure policy (retry, plainer prompt, fallback model, flag), budget cap, circuit breaker, ordered or strict-order download with `manifest.json` and `concat.txt`, run report, per-shot progress grid with regenerate, edit, swap model and skip. S10 audio has adapters but is not wired into runs.

**Backend** (Laravel 12, Filament v4): Sanctum auth (email, Google), device limits, entitlements, ETag remote config, model registry editor, templates CMS (drafts, scheduling, revisions, import and export), presets, dialects, announcements (targeted), releases, feature flags (stable rollout), admin dashboard on real tables with a date range, customer admin with role-gated actions, plans editor, support inbox, site settings (maintenance, sign-ups, email wording), legal pages (`/privacy`, `/terms`), append-only audit log, CSV export on every list, privacy-first telemetry with a shared catalogue, opt-out and retention, billing behind a `BillingProvider` (Paddle, signed idempotent webhooks).

## How to run it
See `README.md` (Herd, XAMPP, Docker). `php artisan frameloom:create-admin you@example.com` creates the first admin.

## Test results (final run, this sandbox)
| Suite | Result | Coverage |
|---|---|---|
| `packages/shared` (unit, property, evals) | 185 passed, 4 skipped (live evals, opt-in) | 95.1% lines (gate 85%) |
| Extension unit | 22 passed | 91.5% lines of the core-logic modules (gate 75%). Scope: vault, API base, projects, library store, entitlements, create runs, LLM cache. UI and the service-worker runner are covered by e2e, not by this number. |
| Extension e2e (Playwright, real Chromium) | 42 passed | n/a |
| Backend (Pest) | 143 passed | 94.5% lines (gate 80%), measured with pcov |
| Axe (WCAG 2.1 AA) | 0 violations on 7 tabs in light and dark | |
| Side panel interactive | about 150 ms (budget 1000 ms) | |
| Bundle budget | side panel 463 KB, worker 273 KB, ffmpeg core 31.6 MB lazy | |
Production zip: 10.7 MB, https backend URL baked in, no loopback host permission.

The e2e suite covers: paste to ordered, upscaled, downloaded sequence; the three gates (Checkpoints) versus none (Full auto); out-of-order and strict download order; draft-then-upscale dimensions and the bad-upscale fallback; browser restart mid-analysis and mid-production without regenerating finished work; 429, 5xx, policy rejection, auth and breaker paths; budget cap; passphrase vault used by the worker; privacy capture (no key, script or prompt reaches the backend; telemetry bodies fit the catalogue); plan limits; library, frame extraction, templates; remote presets, flags, announcements and minimum-version blocking; screenshots in both themes.

## Only verified against mocks
- Every provider call: Anthropic, OpenAI-compatible (including `/images/edits` multipart), fal.ai queue (video and upscale), ElevenLabs. Hand-written fixtures follow the documented shapes; most of the shapes could not be re-checked against live docs (see `docs/provider-notes.md`, only the Anthropic section is confirmed).
- Image and video quality, identity consistency and what the Director produces with a real model. Eval fixtures are hand-recorded outputs.
- Paddle webhook and checkout (tested with a locally signed payload and a faked HTTP client).
- Google sign-in (tested with a faked token endpoint).
- ffmpeg.wasm resize ran on a real ffmpeg-made 640x360 clip, but in the test Chromium, not Chrome stable.

## Not verified at all in the sandbox
- MySQL 8 (tests run on SQLite; CI runs the migrations on a MySQL service).
- Larastan level 8 (not installable here; CI installs it).
- Chrome Web Store review, live billing, real email delivery, real browsers other than the test Chromium.
- Backend deployment.

## Known limitations
- Runs only while Chrome is open and the computer is awake.
- Draft-then-upscale enlarges a low-resolution clip; it cannot add real detail.
- Reference sheets and keyframes rely on the provider accepting reference images; identity consistency is not guaranteed and scores are heuristics.
- Not implemented: clip chaining (last frame to next first frame), audio inside runs (S10), in-browser stitch, workflow-template execution, provider identity training, staff two-factor authentication.
- Large videos are downloaded through an offscreen blob URL; very large clips were not tested.
- Monthly run counts are kept locally, so clearing browser data resets them. Device limits are enforced by the server.
- A security review ran (`docs/security-review.md`); all Medium findings were fixed, a few Low items remain open (listed there).

## Next steps
Chrome Web Store: (1) run `docs/qa-checklist.md` with real keys; (2) build with `WXT_API_BASE=https://your-api pnpm --filter @frameloom/extension zip`; (3) deploy the backend first so `/privacy` exists; (4) fill the listing (single purpose, permission justifications, data disclosures); (5) upload the zip.
Production deployment: PHP 8.3, MySQL 8, Redis, queue worker and `schedule:work`; `.env` from `.env.example` with `APP_DEBUG=false`, `APP_URL` over https (trusted hosts and forced root URL depend on it), mail driver, `GOOGLE_CLIENT_ID`, Paddle keys and price ids; `php artisan migrate --force`, `php artisan db:seed --class=DefaultPlansSeeder` (and the remote config and legal page seeders), `frameloom:create-admin`; publish the model registry from the admin; add staff two-factor authentication.

## Repository notes
Commits are authored as `getdevforce`. History on the feature branch was rewritten once to change the author and remove tool trailers; the old SHAs may stay visible in GitHub's cache for a while, including in the contributors list.
