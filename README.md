# Frameloom

Frameloom is a Chrome side-panel extension that turns a script into a finished, character-consistent video sequence. You bring your own provider API keys. You paste a script, approve the characters and locations it finds, and it plans the shots, writes better prompts, generates, upscales and downloads every clip in order. A Laravel backend with an admin panel handles accounts, plans, remote configuration, templates and anonymous usage counts.

"Frameloom" is a working name. It lives in one file, `brand.config.json`; change it there.

Your keys, scripts, prompts and generated media never go to the backend. Keys are encrypted in the browser and used directly against the provider you choose. `docs/telemetry.md` lists the only things that are ever sent.

The extension only works while Chrome is open. If the computer sleeps or the browser restarts, a run picks up where it stopped and does not pay twice for finished work.

## What is in the repo

| Path | What |
|---|---|
| `apps/extension` | The Chrome extension (WXT, React, Tailwind tokens, Dexie) |
| `apps/api` | Laravel 12 API and Filament v4 admin panel |
| `packages/shared` | Pure TypeScript: run state machine, queue engine, prompt compiler, Director, analysis, schemas |
| `packages/api-client` | TypeScript client generated from the backend's OpenAPI document |
| `docs` | Plan, decisions, architecture, telemetry, consistency and autopilot notes, QA checklist, final report |

## Run it

You need Node 22, pnpm 10, PHP 8.3 and Composer. MySQL is optional locally (SQLite works).

```bash
pnpm install
pnpm --filter @frameloom/extension build        # output: apps/extension/.output/chrome-mv3
```

Load the unpacked folder in `chrome://extensions` (Developer mode, Load unpacked), then click the toolbar icon to open the side panel.

Backend, with the default SQLite database:

```bash
cd apps/api
composer install
cp .env.example .env && php artisan key:generate
php artisan migrate --seed
php artisan frameloom:create-admin you@example.com --name="Your Name"
php artisan serve                                # http://127.0.0.1:8000/admin
```

The extension talks to `http://127.0.0.1:8000` by default. Change the server URL by setting `WXT_API_BASE` when building.

### Windows with Laravel Herd

1. Install Herd and PHP 8.3 through it. Put this repo anywhere, then in Herd add `apps/api` as a site (or run `herd link frameloom` inside `apps/api`).
2. In `apps/api`: `composer install`, copy `.env.example` to `.env`, run `php artisan key:generate`.
3. Herd Pro ships MySQL. Create a database named `frameloom`, then uncomment the MySQL block in `.env` (host `127.0.0.1`, user `root`). Skip this to stay on SQLite.
4. `php artisan migrate --seed`, then `php artisan frameloom:create-admin you@example.com`.
5. Open `http://frameloom.test/admin`. Build the extension with `WXT_API_BASE=http://frameloom.test`.

### Windows with XAMPP

1. Install XAMPP with PHP 8.3, start Apache and MySQL. Install Composer and Node 22.
2. Create a database `frameloom` in phpMyAdmin.
3. In `apps/api`: `composer install`, copy `.env.example` to `.env`, `php artisan key:generate`, then edit `.env`: `DB_CONNECTION=mysql`, `DB_DATABASE=frameloom`, `DB_USERNAME=root`, empty password.
4. `php artisan migrate --seed`, `php artisan frameloom:create-admin you@example.com`, `php artisan serve`.
5. If you serve it through Apache instead, point the virtual host at `apps/api/public`.

### Docker

```bash
docker compose up --build        # MySQL, Redis and the API on http://localhost:8000
docker compose exec api php artisan frameloom:create-admin you@example.com
```

## See real numbers on the dashboard

The dashboard reads real tables, so it starts empty. Sign in to the extension, open the side panel and run something (even a Create run against a provider you have a key for). The extension sends batched, content-free counts; after a few minutes the admin dashboard shows installs, daily actives, generations by provider and model, errors and autopilot figures. Turn usage counts off in the extension's Settings and nothing is sent.

## Test it

```bash
pnpm --filter @frameloom/shared test             # unit, property and eval tests, coverage gate 85%
pnpm --filter @frameloom/extension test          # extension unit tests
WXT_E2E=1 pnpm --filter @frameloom/extension build
pnpm --filter @frameloom/extension e2e           # Playwright: loads the built extension in Chromium
cd apps/api && php artisan test                  # Pest
```

The extension e2e suite starts a real Laravel server on SQLite and a mock provider server, so it needs PHP and a Chromium (set `CHROMIUM_PATH` if Playwright's is not found). A few specs need a system `ffmpeg` and skip themselves without one.

Live provider tests are opt-in: they only run when real keys are in the environment (see `docs/qa-checklist.md`). Everything in CI runs against mocks.

## Ship it

```bash
pnpm --filter @frameloom/extension zip           # .output/*.zip for the Chrome Web Store
```

Backend: deploy `apps/api` like any Laravel app (PHP 8.3, MySQL 8, Redis, a queue worker and the scheduler `php artisan schedule:work`). Set the `.env` values in `apps/api/.env.example`, set `APP_DEBUG=false`, serve over HTTPS, and point the privacy policy URL in the store listing at `/privacy`. `docs/FINAL_REPORT.md` lists what is verified, what was only tested against mocks, and the exact remaining steps.

## Licence

Proprietary, all rights reserved. See `LICENSE`.
