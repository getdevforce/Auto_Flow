# Decisions

- D1 Product name: "Frameloom" (working). Single source: `brand.config.json`.
- D2 Extension tooling: WXT. Reason: actively maintained, first-class MV3 + side panel + offscreen entrypoints, Vite based, no dependency on a stalled plugin. (@crxjs has had long maintenance gaps.)
- D3 Package manager: pnpm workspaces.
- D4 Test DB for backend in sandbox: SQLite in-memory; MySQL 8 is the production/dev target and is in docker-compose and CI service. Queries kept portable.
- D5 Billing: Paddle (Merchant of Record, supports sellers in Pakistan via its onboarding review) behind a `BillingProvider` interface; manual admin grant always available. Availability must be confirmed by the owner at signup; recorded in qa-checklist.
- D6 Accent colour: deep teal-ink (#0F6B66 light / #3DB7AE dark). Typeface: Instrument Sans + JetBrains Mono (self-hosted).
- D7 Push strategy: branch+PR on `claude/funny-cori-5w4wcc` (assigned by the session) into the default branch.
- D8 No-passphrase vault key stored non-extractable in IndexedDB (see PLAN.md for threat statement).
- D9 Telemetry catalogue is one JSON file read by both the extension and Laravel, so the two cannot drift.
- D10 Autopilot step functions (`drive`) are idempotent and re-entered by a Web Lock loop plus a `chrome.alarms` safety net; LLM answers are cached by input hash so crashes never repay for finished work.
- D11 One stubborn shot failing repeatedly feeds the circuit breaker once; five consecutive failures across different shots (or any auth/quota error) pause the run.
- D12 Budget cap reserves the estimate of in-flight jobs, not only completed spend.
- D13 Plan limits are enforced in the extension from the cached `/entitlements` response; with no account the free-plan fallback applies. `entitlementsOverride` (kv) lets self-hosted installs and tests pin limits.
- D14 Billing is `BillingProvider` (Paddle implemented). Webhooks: HMAC over `ts:body`, 5 minute tolerance, event ids unique, recording and applying in one transaction.
- D15 No default branch exists on the remote (the repository was empty), so no pull request was opened; the work is on `claude/funny-cori-5w4wcc`.
- D16 Author identity for commits is `getdevforce <getdevforce@gmail.com>` at the owner's request; history was rewritten once for that on the feature branch.
