# CLAUDE.md

Frameloom (working name, see `brand.config.json`): Chrome MV3 side-panel extension that turns a script into a
character-consistent AI film using the user's own provider keys, plus a Laravel/Filament backend for accounts,
remote config, templates, billing and analytics.

`docs/PLAN.md` is the source of truth. After a context reset, re-read this file, PLAN.md and `docs/progress.md`.

## Layout
- `apps/extension` WXT + React + Tailwind tokens + Dexie. `apps/api` Laravel 12 + Filament v4.
- `packages/shared` pure TS (no browser/Node APIs). `packages/api-client` generated from OpenAPI.

## Commands
- Install: `pnpm install` (root); `cd apps/api && composer install && cp .env.example .env && php artisan key:generate`
- Shared tests: `pnpm --filter @frameloom/shared test` (coverage gate 85%)
- Extension: `pnpm --filter @frameloom/extension build | typecheck | test | e2e` (e2e needs the built `.output/chrome-mv3`; set `CHROMIUM_PATH` if needed)
- Backend: `cd apps/api && php artisan test` (Pest), `vendor/bin/pint`, `vendor/bin/phpstan analyse`
- Zip: `pnpm --filter @frameloom/extension zip`

## Conventions
- TypeScript strict. Small modules. Comments explain why, not what. No banner comments, no emoji in code or commits.
- Conventional commits, one logical change each. Never force-push or rewrite history.
- Colors/spacing come from tokens (`styles/tokens.css`); no raw hex in components.
- UI copy: plain, specific, sentence case; errors name cause and fix. Never "AI-powered".
- Providers sit behind adapters; model lists come from the remote registry with a bundled fallback.
- Update `docs/progress.md` after every milestone.

## Do not
- Do not automate third-party web UIs (no DOM scraping/clicking). Official APIs only. One exception, decided by the owner (D17): the Flow tab driver in `entrypoints/flow.content.ts` and `src/flow/`. Nothing else may touch another site's DOM.
- Do not send provider keys, prompts, scripts or media to the backend, or log them. Telemetry is counts and metadata only.
- Do not hardcode model names, prices or limits outside the registry fallback.
- Do not commit secrets; `.env.example` only.
- Do not add fake data, lorem ipsum, or mocks outside tests; seeds go in clearly named seeders.
- Do not evade provider safety systems; surface rejections and offer a clearer rewrite.
- Do not bypass the budget cap or circuit breaker.
- Do not copy competitor code, copy, names or layout.
