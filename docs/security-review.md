# Security review

Read-only review of the extension (apps/extension, packages/shared) and API (apps/api). Nothing was built or run, so
dependency audits (`pnpm audit`, `composer audit`) were not performed. Line numbers are from the tree at commit afbf0c2.

Severity counts: High 0, Medium 8, Low 14.

## 1. Key vault

**M1. Passphrase mode cannot work for background runs, and the UI implies it does.**
`src/background/executor.ts:23`, `src/autopilot/{director,pipeline,tools}.ts`, `src/services.ts:35`.
`vault` is a module-level `KeyVault`, so the side panel and the service worker each hold their own `key`. The panel's
`vault.unlock(pass)` sets the key only in the panel context. The service worker calls `vault.unlock()` with no passphrase,
which throws `passphrase_required`, and the user sees "keys are locked" even though they just unlocked.
Scenario: a user picks a passphrase because the setup text recommends it, every background run then fails, and they
re-create the vault without a passphrase (device mode, the weaker option). Fix: hand the derived key to the worker (a
non-extractable `CryptoKey` can be posted with structured clone) or keep it in `chrome.storage.session`
(`TRUSTED_CONTEXTS`). Alternatively run the generation loop in the panel/offscreen context.

**M2. Device-mode claim is probably overstated.** `vault.ts:5-6`, `ui/KeysPanel.tsx:32-35`.
The text says a copied profile folder cannot read the keys. The non-extractable `CryptoKey` and the ciphertext sit in
the same IndexedDB (`kv` row `vault`). Chrome serialises the key bytes into that LevelDB store. "Non-extractable" blocks
`exportKey` from JS, not a reader of the profile files, and there is no OS keychain/DPAPI wrapping. Verify empirically
(open the profile's IndexedDB blob with a LevelDB reader). If confirmed, either reword to "does not stop anyone with
the profile files" or drop device mode in favour of a mandatory passphrase. The "not malware running as you" half of the
statement is honest.

**L1. No passphrase strength or length floor.** `vault.ts:61-62` only checks non-empty. A 1-character passphrase
is accepted and PBKDF2 (600k) will not save it. Offline guessing is cheap because `verifier` is a known plaintext
sealed with the derived key. Fix: min length (12) and a message naming the fix.

**L2. `init()` overwrites an existing vault** (`vault.ts:60-72`) with no `isInitialised` guard; any caller loses every
saved key. Only UI gating prevents it today. Also `setKey`/`removeKey` do load-modify-save of the whole record with no
transaction (`vault.ts:93-111`), so two concurrent saves can drop one key. Fix: guard in `init`; use a Dexie
`rw` transaction.

**L3. No wipe path.** `wipe()` exists (`vault.ts:116`) and is tested but is never called from UI, logout or options.
A forgotten passphrase is unrecoverable and the user has no in-product reset; `logout()` (`services.ts:51`) leaves
keys in place (arguably right, but undocumented). Add a "Reset key vault" action.

**L4. Ciphertext is not bound to its slot.** `seal()` uses no AAD (`vault.ts:36-40`), so a swapped `secrets[a]`/`secrets[b]`
decrypts without error. Needs write access to the extension's IndexedDB, so it is the same threat as a compromise of the
origin; use `additionalData: provider` for cheap hardening. Random 96-bit IVs with a fresh `getRandomValues` per seal
are fine at this volume. PBKDF2-SHA256 600k with a 16-byte random salt, `iterations` stored in the record, is fine.

**L5. Decrypted keys live as JS strings** in provider objects for the run (`keys.ts:19`). Unavoidable in JS; `lock()`
only drops the CryptoKey. No auto-lock timer in passphrase mode. Acceptable; document it.

**L6. Custom/fal base URL is unchecked** (`ui/KeysPanel.tsx:87`, `shared/providers/registry.ts:17-18`). `http://` is
accepted, so the API key travels in cleartext, and `fal.ts:56,68` sends `Authorization: Key` to the `status_url` and
`response_url` taken from the submit response with no host check. Fix: require `https:` (allow `http://localhost`),
and refuse status/response URLs whose origin differs from `baseUrl`. Also, `optional_host_permissions` is declared but
`chrome.permissions.request` is never called anywhere in `src/`, so custom endpoints depend on the remote server's CORS.
The manifest comment ("custom endpoints use the optional permission prompt") describes behaviour that does not exist.

Service worker access: it can decrypt everything in device mode (stated in the comment, consistent with the code).
Keys are never sent to the backend: `privacy.test.ts` plus the grep below confirm no `loadKey`/`apiKey` in backend clients.

## 2. Privacy guarantee (nothing from a project reaches the backend)

Every backend `fetch` was read: `entitlements.ts:26`, `config-store.ts:25`, `feedback.ts:6`, `telemetry.ts:16,36`,
`ui/TemplatesPanel.tsx:31,41,54,59`, `services.ts` (login, config), `shared/remote-config.ts:63`. No call carries a key,
prompt, script or media. Template "use" sends only the slug. The privacy guard test only greps for file names and a few
identifiers; it would not catch a new `track('x', { item: promptText })`, though the allowlist below limits the damage.

**M3. Telemetry string props are free text within a character class.** `packages/shared/src/telemetry/catalogue.json`
(`item` 96, `model` 96, `provider` 48, `error_code` 32), enforced identically in `client.ts:15-26` and
`EventValidator.php:44`. The allowed class is `[A-Za-z0-9._:@/+- ]` with spaces. A short prompt fragment, a filename
or an email address (`@` is allowed) passes both validators. Today's callers pass enums or registry ids, so there is no
current leak, but the server cannot tell a model id from a sentence. Fix: drop space and `@`, and make `item`/`model`
match the registry (`^[a-z0-9][a-z0-9._:/+-]*$`, no spaces) or be enums or ids checked against remote config.

**L7. Template search text is sent to the server** (`TemplatesPanel.tsx:30`, `q` up to 100 chars). It is what the user
types into a search box, not project content, but the privacy copy should say so. It is also in server access logs.

**L8. Telemetry is account-linked when signed in.** `telemetry.ts:18` attaches the bearer token and
`TelemetryController.php:26` stores `user_id` on every event (also `install_id`, CF-IPCountry). The "counts and
metadata only" statement holds, but it is per-user, and `UserAdmin::export` returns it. Make sure the privacy page says
"linked to your account when signed in", or send telemetry anonymously.

**L9. Unauthenticated opt-out and row creation.** `TelemetryController::preference` (`:41-51`) accepts any UUID, so
anyone who learns an install id can opt that install out, and anyone can create unlimited `installs` rows (30/min/IP).
Low impact. Ingest is also unauthenticated and can poison analytics, and unbounded `item`/`model` values create new
`telemetry_daily` rows (cardinality growth, `TelemetryRecorder.php:57-66`). Fix: validate `item`/`model` against the
catalogue, or bucket unknown values. The `DB::raw("{$c} + {$add[$c]}")` in `:68` is safe only because the values are
validated ints; use `increment()`. The select-then-insert is also racy (duplicate rows).

**L10. One bad event drops a whole batch.** The validator throws on the first invalid prop (`EventValidator.php:51`)
and the client treats any 4xx as "drop" (`telemetry.ts:21`). A catalogue/version skew silently discards up to 50 events.

Feedback: `FeedbackController` allowlists fields and context keys with regexes. `feedback` text is free by design
(2000 chars), `error_report` is codes only. Fine. `email` is unverified, so Support can be tricked into replying to a
third party (`EditReport.php:21-29`); low.

## 3. Extension manifest and messaging

Permissions are minimal: `storage, sidePanel, alarms, downloads, offscreen, unlimitedStorage`; four fixed provider hosts;
`optional_host_permissions: https://*/*` (broad but optional and never requested, see L6); `power` optional and unused.
No content scripts, no `externally_connectable`, no `web_accessible_resources`: **web pages and other extensions cannot
send runtime messages.** `onMessage` in `background.ts:133` and `offscreen/main.ts:203` therefore only receives from this
extension's own pages, so the missing `sender` check is not exploitable today. CSP `script-src 'self' 'wasm-unsafe-eval'`
is correct for ffmpeg wasm. No `innerHTML`/`dangerouslySetInnerHTML` in `src/` (announcements and templates render as text).

**M4. Production builds default to a plaintext loopback API.** `services.ts:7`: `WXT_API_BASE ?? 'http://127.0.0.1:8000'`,
and there is no backend host in `host_permissions`. Login, bearer token and passwords go to whatever listens on
127.0.0.1:8000 (any local process) if a release is built without the variable; `getApiBase` also honours a `kv.apiBase`
override with no UI and no validation. Fix: fail the build when `WXT_API_BASE` is unset in production, require `https:`
(except localhost in dev), and add the production origin to `host_permissions` instead of leaning on CORS `*`.

**L11. Defence in depth on offscreen/background messages.** Add `if (sender.id !== chrome.runtime.id) return false` and
check that `sender.url` is the side panel (`offscreen/main.ts:203`, `background.ts:133`); the offscreen handlers will read
any asset id and create object URLs, and `sw-extract-frame` writes a new asset for any id. Cheap insurance if a content
script or `externally_connectable` is ever added.

Downloads: `runner.ts:41` and `shots.ts:260` use `data:` URLs built from stored blobs/text (no remote input), `shots.ts:286` uses
offscreen blob URLs, and `renderName` (`shared/create.ts:44-60`) strips `..` segments and leading dots, so path traversal
via project name or template is handled. The `data:` path holds the whole image in memory in the worker; fine for images.
`concat.txt` (via `buildConcatList`) was not found to quote filenames; `safeSegment` strips the unsafe set `UNSAFE` (not
reviewed in full) so an apostrophe in a project name could break the ffmpeg concat list; check `UNSAFE` includes `'`.

## 4. Backend

**M5. Password-reset link host poisoning.** `AppServiceProvider.php:39,44` build the link with `url('/reset-password?...')`,
which uses the request's Host header, and there is no `trustHosts()`/`URL::forceRootUrl` (`bootstrap/app.php`). Scenario:
`POST /api/v1/auth/forgot-password` with `Host: evil.example` and the victim's email delivers a legitimate email whose
button points to evil.example with a valid token; one click gives account takeover. Fix: `URL::forceRootUrl(config('app.url'))`
in production and `$middleware->trustHosts(at: [...])`.

**M6. Account pre-hijack via Google linking.** `AuthController.php:61-69`. `register` creates an account for any email with
no verification and returns a token (`:35-40`). If the real owner later signs in with Google, `google()` matches by email
(`orWhere('email', ...)`), marks it verified and keeps the attacker's password and tokens alive. Fix: when linking an
existing account whose `email_verified_at` is null, reset the password and revoke tokens (or reject), and match on
`google_id` first (the current `where(...)->orWhere(...)->first()` can also return the wrong user and then overwrite its
`google_id`). Also add `->timeout()` to the tokeninfo call, check `iss`, and guard missing `email`/`sub` (500 otherwise).

**M7. Webhook events can be lost.** `WebhookHandler.php:25-37`: the `webhook_events` row is inserted before the
transaction in `apply()`, and every `QueryException` on insert is reported as `duplicate`. If `apply()` throws, Paddle's
retry hits the unique key, returns 200 "duplicate" and the plan change never happens. A DB outage has the same effect.
Fix: only treat the unique-violation SQLSTATE as duplicate, and either wrap insert and apply in one transaction or retry
rows with `processed_at IS NULL`. Signature verification itself is correct (HMAC-SHA256 over `ts:body`, multiple `h1`,
`hash_equals`, 300 s window, empty secret rejects). Also: a cancelled secondary subscription downgrades a user who has
another active one (`:61`), and user lookup falls back to the buyer's email (`:44`).

**M8. Any staff role can bulk-export customer PII.** `ExportsCsv.php` and `ListUsers.php:15`. `UserResource::canViewAny()` is
true for all roles (`UserResource.php:52`) and the export action has no role check, so an analyst or editor ("can look but not
touch") can download up to 50k rows of names and emails, and the Support export includes feedback emails. Gate the action
on `canAct()`. In the same area the `ViewUser` actions rely on `->visible()` only (`ViewUser.php:50-82`); add `->authorize()`
or a role check inside `UserAdmin` so a hidden action cannot be invoked by a crafted Livewire call (verify against the
installed Filament version; the destructive `delete` is the one to harden first).

**L12. Auth hygiene.** `register` returns 422 "email already taken" (enumeration, `:31`) while `forgot-password` was carefully
made uniform. `login` skips `Hash::check` for unknown emails (timing oracle, `:48`). Rate limits are per IP only
(`routes/api.php` `throttle:10,1`); add per-email limiting for login. Sanctum tokens never expire
(`config/sanctum.php:53` `expiration: null`) and each login creates another token for the same device without revoking
the old one (`:111`); set an expiry and delete prior tokens for that `install_id`. Email verification cannot work as
shipped: no `verification.verify` route exists (grep of routes/app/config), so `VerifyEmail` URL generation will throw
on `register` after the user row is created; nothing enforces verification anyway.

**L13. Audit log immutability is application-level only.** `AuditLog.php:20-21` guards model events, which do not fire for
`AuditLog::query()->delete()` or `->update()` or raw SQL, and the migration adds no trigger or DB grant. Also
`actor_label` stores name and email permanently, which conflicts with account deletion (`UserAdmin::delete` records only
a hash for the subject). Fix: a DB trigger (or revoke UPDATE/DELETE for the app role), and store `actor_id` only.
`WebhookHandler.php:67` writes via `create()` with no actor; fine.

**L14. Templates.** SQL is parameterised everywhere (no injection). LIKE: `q` is escaped with backslashes
(`TemplateController.php:34`) which is correct on MySQL/Postgres but not on the SQLite default in `.env.example` (no
`ESCAPE` clause); `tag` is not escaped at all (`:41`). Use `whereJsonContains` and `ESCAPE`. `use` is unauthenticated and
only IP-throttled, so use counts and the "popular" sort are gameable; `rate` does non-atomic decrement/increment (race).
Import (`ListTemplates.php:30-48`): the JSON mime check is client-assertable, there is no size limit, no validation of
`kind`/`difficulty`/`slug`/`tags` types (a non-string `category` throws mid-import and leaves the file in `storage/app/imports`),
`updateOrCreate` by slug silently drafts a live template, and nothing goes to the audit log or revision history. "Export JSON" is
unrestricted and includes drafts. Fix: validate rows with a Validator, wrap in a transaction, `AuditLog::record`, delete the
file in `finally`.

**L15. CORS** (`config/cors.php:11-15`): `allowed_origins: ['*']` makes the `chrome-extension://` pattern dead code and lets
any website call the API from a browser. With bearer tokens and `supports_credentials=false` there is no CSRF or cookie risk;
tighten to the pattern for the shipped extension id plus your own origin.

Fine, no action: mass assignment (`User::$fillable` excludes `role`, `plan_id`, `suspended_at`, `google_id`; `register` passes only
name/email/password); device IDOR (`DeviceController` checks `user_id` and returns 404; token deletion is scoped to the user);
suspended users (login and `EnsureNotSuspended`); password reset (token deleted, sessions revoked, uniform response);
legal pages (`Str::markdown` with `html_input=strip`, `allow_unsafe_links=false`, title escaped by Blade, only editors write);
CSV formula injection (`csvCell` prefixes `= + - @ \t \r`; it does not cover a leading space or newline variants, low risk);
Paddle checkout (`user_id` set server-side in `custom_data`); `FileUpload` writes to the private `local` disk; admin
panel uses CSRF, `AuthenticateSession` and `canAccessPanel` role gating.
No 2FA is configured for staff in `AdminPanelProvider.php`; Filament v4 supports `->multiFactorAuthentication()` and
super admins can grant plans and delete accounts.

## 5. Dependencies and secrets

No secrets committed: `git ls-files` shows only `apps/api/.env.example`; `.env` is ignored in both gitignores; a regex scan for
provider, AWS, GitHub and private-key patterns found only test fixtures, which `.gitleaks.toml` allowlists. The seeded
`e2e@example.com / e2e-password-1` user lives under `database/seeders/Testing` (confirm it is never run in production).
**L16.** `.env.example` ships `APP_ENV=local` and `APP_DEBUG=true` (and `MAIL_MAILER=log`); copying it to production exposes
stack traces and writes reset tokens to logs. Add a production block or a startup check that refuses `APP_DEBUG=true` when
`APP_ENV=production`. `SESSION_DRIVER=database` with no `SESSION_SECURE_COOKIE` note: set it for the admin panel behind HTTPS.
`ci.yml` was not reviewed for secret handling.
Dependency CVE status unknown; run `pnpm audit` and `composer audit` in CI.
