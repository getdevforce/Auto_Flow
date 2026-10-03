# Progress

## Done
- M0 Plan and scaffold: PLAN/CLAUDE/decisions/design-system docs, monorepo, shared core (state machine, taxonomy, backoff, breaker, budget; 22 tests, 100% lines), WXT extension loads in Chromium (Playwright smoke test), Laravel 12 boots, Filament v4 login and staff-role gating tested (8 Pest tests), CI skeleton.
## In progress
M1 Foundation (auth, devices, remote config, OpenAPI client, key vault)
## Next
M2 Provider layer
## Known issues
- Sandbox has no real provider keys, no MySQL server, no Chrome Web Store, no live billing.
- Larastan/phpstan cannot be installed in the sandbox (GitHub zipball downloads blocked by egress policy); CI installs it. Static analysis is therefore unverified locally.
- Composer in the sandbox needs `--prefer-source`.
