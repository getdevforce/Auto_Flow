#!/usr/bin/env bash
# Fresh throwaway database + dev server for the extension e2e suite.
set -euo pipefail
cd "$(dirname "$0")/.."
export APP_ENV=local DB_CONNECTION=sqlite DB_DATABASE="${E2E_DB:-/tmp/frameloom-e2e.sqlite}"
export CACHE_STORE=array SESSION_DRIVER=array QUEUE_CONNECTION=sync MAIL_MAILER=log
rm -f "$DB_DATABASE" && touch "$DB_DATABASE"
php artisan migrate:fresh --seed --force
php artisan db:seed --class='Database\Seeders\Testing\E2eTestUserSeeder' --force
exec php artisan serve --host=127.0.0.1 --port="${E2E_API_PORT:-8000}"
