<?php

use App\Billing\PaddleProvider;
use App\Billing\WebhookHandler;
use App\Models\Plan;
use App\Models\Subscription;
use App\Models\Template;
use App\Models\User;
use App\Models\WebhookEvent;
use App\Providers\AppServiceProvider;
use Database\Seeders\DefaultPlansSeeder;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\URL;

beforeEach(fn () => $this->seed(DefaultPlansSeeder::class));
const D = ['install_id' => '11111111-1111-4111-8111-111111111111', 'device_name' => 'x'];

it('verifies email through a signed link and rejects forged or tampered ones', function () {
    $user = User::factory()->unverified()->create();
    $url = URL::temporarySignedRoute('verification.verify', now()->addHour(), ['id' => $user->id, 'hash' => sha1($user->email)]);
    $this->get($url)->assertOk()->assertSee('Email confirmed');
    expect($user->fresh()->email_verified_at)->not->toBeNull();

    $other = User::factory()->unverified()->create();
    $this->get("/email/verify/{$other->id}/".sha1($other->email))->assertForbidden(); // unsigned
    $bad = URL::temporarySignedRoute('verification.verify', now()->addHour(), ['id' => $other->id, 'hash' => 'wronghash']);
    $this->get($bad)->assertForbidden();
    expect($other->fresh()->email_verified_at)->toBeNull();
});

it('registers without error and sends a verification mail whose link works', function () {
    Notification::fake();
    $res = $this->postJson('/api/v1/auth/register', D + ['name' => 'A', 'email' => 'new@example.com', 'password' => 'correct-horse-1'])->assertCreated();
    $user = User::where('email', 'new@example.com')->first();
    Notification::assertSentTo($user, VerifyEmail::class, function ($n) use ($user) {
        $url = $n->toMail($user)->actionUrl;
        $this->get($url)->assertOk();

        return str_contains($url, '/email/verify/');
    });
    expect($user->fresh()->email_verified_at)->not->toBeNull();
});

it('does not trust the Host header for links in production', function () {
    app()->detectEnvironment(fn () => 'production');
    config(['app.url' => 'https://app.example.com']);
    (new AppServiceProvider(app()))->boot();
    expect(url('/reset-password'))->toStartWith('https://app.example.com/');
});

it('takes over an unverified password account when its owner proves the email with Google', function () {
    config(['services.google.client_id' => 'cid']);
    $squatter = User::factory()->unverified()->create(['email' => 'victim@example.com', 'password' => 'attacker-pass-1']);
    $squatter->forceFill(['plan_id' => Plan::default()->id])->save();
    $squatterToken = $squatter->createToken('t')->plainTextToken;
    Http::fake(['oauth2.googleapis.com/*' => Http::response(['aud' => 'cid', 'sub' => 'g9', 'email' => 'victim@example.com', 'email_verified' => 'true', 'name' => 'V'])]);
    $this->postJson('/api/v1/auth/google', D + ['id_token' => 'x'])->assertOk();
    expect($squatter->tokens()->where('name', '!=', D['install_id'])->count())->toBe(0);
    $this->postJson('/api/v1/auth/login', D + ['email' => 'victim@example.com', 'password' => 'attacker-pass-1'])->assertStatus(401); // the squatter's password no longer works
});

it('gives missing and wrong-password logins the same answer', function () {
    $u = User::factory()->create(['password' => 'correct-horse-1']);
    $a = $this->postJson('/api/v1/auth/login', D + ['email' => 'nobody@example.com', 'password' => 'x'])->assertStatus(401)->json('error.message');
    $b = $this->postJson('/api/v1/auth/login', D + ['email' => $u->email, 'password' => 'wrong'])->assertStatus(401)->json('error.message');
    expect($a)->toBe($b);
});

it('expires API tokens after 30 days', function () {
    expect(config('sanctum.expiration'))->toBe(60 * 24 * 30);
    $u = User::factory()->create();
    $token = $u->createToken('x');
    $token->accessToken->forceFill(['created_at' => now()->subDays(31)])->save();
    app('auth')->forgetGuards();
    $this->withToken($token->plainTextToken)->getJson('/api/v1/me')->assertStatus(401);
});

it('only allows extension origins through CORS', function () {
    $preflight = fn (string $origin) => $this->call('OPTIONS', '/api/v1/auth/login', [], [], [], ['HTTP_ORIGIN' => $origin, 'HTTP_ACCESS_CONTROL_REQUEST_METHOD' => 'POST']);
    $preflight('https://evil.example')->assertHeaderMissing('Access-Control-Allow-Origin');
    $ext = 'chrome-extension://'.str_repeat('a', 32);
    $preflight($ext)->assertHeader('Access-Control-Allow-Origin', $ext);
});

it('retries a billing webhook whose first attempt failed instead of treating it as a duplicate', function () {
    config(['billing.paddle.webhook_secret' => 'whsec_test_secret']);
    Plan::where('slug', 'pro')->update(['paddle_price_id' => 'pri_pro']);
    $u = User::factory()->create();
    $payload = ['event_id' => 'evt_retry', 'event_type' => 'subscription.created', 'occurred_at' => now()->toIso8601String(), 'data' => ['id' => 'sub_r', 'status' => 'active', 'items' => [['price' => ['id' => 'pri_pro']]], 'custom_data' => ['user_id' => (string) $u->id]]];
    $provider = new PaddleProvider('whsec_test_secret', 'k');
    $handler = new WebhookHandler;

    // First delivery: applying blows up (simulated by an unusable plan relation), so nothing may be recorded.
    Subscription::creating(fn () => throw new RuntimeException('database hiccup'));
    expect(fn () => $handler->handle($provider, $payload))->toThrow(RuntimeException::class);
    expect(WebhookEvent::count())->toBe(0);
    Subscription::flushEventListeners();

    // The provider retries the same event; it is now processed.
    expect($handler->handle($provider, $payload))->toBe('applied');
    expect($u->fresh()->effectivePlan()->slug)->toBe('pro')->and($handler->handle($provider, $payload))->toBe('duplicate');
});

it('escapes wildcards in the template tag filter', function () {
    Template::factory()->create(['tags' => ['walk']]);
    $this->getJson('/api/v1/templates?tag=%25')->assertJsonPath('meta.total', 0);
});
