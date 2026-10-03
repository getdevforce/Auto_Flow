# Architecture

```
 Side panel (React)  <--Dexie live queries-->  IndexedDB  <--->  Service worker (queue loop, alarms)
        |                                                              |
        | chrome.runtime messages                                      | fetch (user's keys)
        v                                                              v
 Offscreen document (blob URLs, frame extraction,                Provider APIs (Anthropic, OpenAI-compatible,
 ffmpeg.wasm resize)                                              fal.ai, ElevenLabs, custom endpoint)

 Extension --(account, config, templates, counts only)--> Laravel API + Filament admin --> MySQL / Redis
```

## Boundaries
- `packages/shared` has no browser or Node APIs. Everything pure (state machine, queue engine, compiler, Director, analysis, schemas, policies) is tested here.
- Provider adapters take an injected `fetch` and return bytes; they never touch IndexedDB.
- The extension owns persistence (Dexie). Every job transition is one write; the service worker keeps no state that matters.
- The backend is a client-facing service for accounts and content. It cannot see keys, prompts, scripts or media; the telemetry validator rejects anything outside `catalogue.json`.

## A run, end to end
`startAutopilot` writes a run row and wakes the worker. The worker takes a Web Lock (one loop at a time) and alternates two things until nothing is left: `drive(run)` advances the pipeline (analysis, locks, shot planning, refinement, keyframes, video, upscale, download, report) by creating missing jobs and reading finished ones; `QueueEngine.tick` runs queued jobs under per-provider pacing, budget and breaker rules. A `chrome.alarms` timer re-enters the loop if the worker is evicted. Provider job ids are stored as soon as they exist, so a restart polls instead of paying again. LLM answers are cached by input hash.

## Data
IndexedDB tables: kv, runs, jobs, assets, shots, analyses, llmCache, characters/locations and their immutable versions, library, albums, prompts. MySQL: users, plans, devices, config versions, registry providers/models, templates (+revisions, ratings), presets, dialects, announcements, releases, feature flags, installs, telemetry (raw, daily aggregates, active days, milestones), feedback, audit log (append-only), subscriptions, webhook events, settings, legal pages.

## Remote config
The admin publishes a versioned JSON (models and prices, presets, dialects, flags, release info). The extension fetches it with an ETag, validates with Zod, and falls back to a cached copy and then to the bundled default, so it works with the backend down.
