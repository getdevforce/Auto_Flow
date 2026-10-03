# Decisions

- D1 Product name: "Frameloom" (working). Single source: `brand.config.json`.
- D2 Extension tooling: WXT. Reason: actively maintained, first-class MV3 + side panel + offscreen entrypoints, Vite based, no dependency on a stalled plugin. (@crxjs has had long maintenance gaps.)
- D3 Package manager: pnpm workspaces.
- D4 Test DB for backend in sandbox: SQLite in-memory; MySQL 8 is the production/dev target and is in docker-compose and CI service. Queries kept portable.
- D5 Billing: Paddle (Merchant of Record, supports sellers in Pakistan via its onboarding review) behind a `BillingProvider` interface; manual admin grant always available. Availability must be confirmed by the owner at signup; recorded in qa-checklist.
- D6 Accent colour: deep teal-ink (#0F6B66 light / #3DB7AE dark). Typeface: Instrument Sans + JetBrains Mono (self-hosted).
- D7 Push strategy: branch+PR on `claude/funny-cori-5w4wcc` (assigned by the session) into the default branch.
- D8 No-passphrase vault key stored non-extractable in IndexedDB (see PLAN.md for threat statement).
