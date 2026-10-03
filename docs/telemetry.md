# Telemetry

Counts and metadata only. The catalogue is a single file, `packages/shared/src/telemetry/catalogue.json`, read by both the extension and the
backend. The server rejects any event or property that is not in it (HTTP 422), so content cannot be added by accident.

## What is sent
An anonymous install id (random UUID, created locally), the user id only when signed in (bearer token), extension version, and coarse country
(from the `CF-IPCountry` header when the host sits behind Cloudflare; never an IP lookup stored by us).

| Event | Properties | Used for |
|---|---|---|
| app_opened | none | installs, DAU/WAU/MAU, retention |
| first_generation | none | funnel |
| generation | provider, model, kind, success, error_code, duration_ms | generations per day, success rate, top errors |
| autopilot_started | autonomy | runs started, autonomy split |
| autopilot_completed | autonomy, shots, flagged | completion rate, shots per run, flagged rate |
| shot_flagged | reason (enum) | top flag reasons |
| gate_shown / gate_approved | gate, autonomy | approval-gate drop-off |
| refine_shown / refine_accepted | none | prompt-refinement acceptance rate |
| preset_used | item (preset id) | top presets |
| template_used | item (template slug) | top templates |

Strings are short codes or catalogue ids (letters, digits and `._:@/+- `, length limited). Numbers are bounded. Enumerations are closed lists.

## What is never sent
Script text, prompts, character or location descriptions, images, video, filenames, project names, provider keys, IP-based identifiers.
Automated checks: `apps/api/tests/Feature/TelemetryTest.php` (rejects prompt/script/free-text fields), `apps/extension/src/privacy.test.ts` (static guard on
which modules talk to the backend) and `apps/extension/e2e/privacy.spec.ts` (full run against a recording server; asserts no secret or content appears and every body fits the catalogue).

## Opt-out
Settings > Usage counts. Turning it off clears the local queue, stops all uploads and tells the server (`PUT /api/v1/telemetry/preference`), which then
drops anything arriving from that install and stores nothing about it.

## Storage and retention
Raw events are kept for `TELEMETRY_RETENTION_DAYS` (default 30) and purged nightly (`telemetry:purge`). Daily aggregates (`telemetry_daily`),
daily-active installs (`telemetry_active_daily`) and funnel milestones (`install_milestones`) are kept, so dashboards keep working after the purge.
