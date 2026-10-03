<?php

use App\Billing\BillingProvider;
use App\Billing\PaddleProvider;
use App\Filament\Resources\Subscriptions\Pages\ListSubscriptions;
use App\Filament\Resources\Subscriptions\SubscriptionResource;
use App\Models\AuditLog;
use App\Models\Plan;
use App\Models\Subscription;
use App\Models\User;
use App\Models\WebhookEvent;
use Database\Seeders\DefaultPlansSeeder;
use Illuminate\Support\Facades\Http;

const SECRET = 'whsec_test_secret';

beforeEach(function () {
    $this->seed(DefaultPlansSeeder::class);
    config(['billing.paddle.webhook_secret' => SECRET, 'billing.paddle.api_key' => 'key_test']);
    Plan::where('slug', 'pro')->update(['paddle_price_id' => 'pri_pro']);
    $this->user = User::factory()->create(['email' => 'buyer@example.com']);
    $this->user->forceFill(['plan_id' => Plan::default()->id])->save();
});

function signed(array $payload, ?int $ts = null, ?string $secret = null): array
{
    $body = json_encode($payload);
    $ts ??= time();
    $h1 = hash_hmac('sha256', $ts.':'.$body, $secret ?? SECRET);

    return [$body, ['Paddle-Signature' => "ts={$ts};h1={$h1}", 'Content-Type' => 'application/json']];
}
function post($t, array $payload, ?int $ts = null, ?string $secret = null)
{
    [$body, $headers] = signed($payload, $ts, $secret);

    return $t->call('POST', '/api/v1/billing/webhook', [], [], [], collect($headers)->mapWithKeys(fn ($v, $k) => ['HTTP_'.strtoupper(str_replace('-', '_', $k)) => $v])->all() + ['CONTENT_TYPE' => 'application/json'], $body);
}
function sub_event(string $id, string $type, string $status, string $price = 'pri_pro', ?int $user = null, ?string $at = null): array
{
    return ['event_id' => $id, 'event_type' => $type, 'occurred_at' => $at ?? now()->toIso8601String(), 'data' => [
        'id' => 'sub_1', 'status' => $status, 'items' => [['price' => ['id' => $price]]], 'custom_data' => ['user_id' => (string) ($user ?? test()->user->id)],
        'current_billing_period' => ['ends_at' => now()->addMonth()->toIso8601String()],
    ]];
}

it('upgrades the plan on a verified subscription event and records the change', function () {
    post($this, sub_event('evt_1', 'subscription.created', 'active'))->assertOk()->assertJsonPath('result', 'applied');
    expect($this->user->fresh()->effectivePlan()->slug)->toBe('pro')
        ->and(Subscription::first())->status->toBe('active')->provider->toBe('paddle')
        ->and(AuditLog::where('action', 'user.plan_changed')->first()->meta)->toMatchArray(['from' => 'free', 'to' => 'pro']);
    $this->actingAs($this->user->fresh(), 'sanctum')->getJson('/api/v1/entitlements')->assertJsonPath('plan', 'pro')->assertJsonPath('subscription.status', 'active');
});

it('rejects missing, wrong, malformed, and stale signatures and stores nothing', function () {
    $payload = sub_event('evt_x', 'subscription.created', 'active');
    $this->postJson('/api/v1/billing/webhook', $payload)->assertStatus(400)->assertJsonPath('error.code', 'invalid_signature');
    post($this, $payload, null, 'wrong-secret')->assertStatus(400);
    post($this, $payload, time() - 3600)->assertStatus(400);
    $this->call('POST', '/api/v1/billing/webhook', [], [], [], ['HTTP_PADDLE_SIGNATURE' => 'garbage', 'CONTENT_TYPE' => 'application/json'], json_encode($payload))->assertStatus(400);
    // A body modified after signing no longer matches.
    [$body, $headers] = signed($payload);
    $this->call('POST', '/api/v1/billing/webhook', [], [], [], ['HTTP_PADDLE_SIGNATURE' => $headers['Paddle-Signature'], 'CONTENT_TYPE' => 'application/json'], str_replace('pri_pro', 'pri_other', $body))->assertStatus(400);
    expect(WebhookEvent::count())->toBe(0)->and($this->user->fresh()->effectivePlan()->slug)->toBe('free');
});

it('is idempotent: the same event delivered twice changes nothing the second time', function () {
    $e = sub_event('evt_dup', 'subscription.created', 'active');
    post($this, $e)->assertJsonPath('result', 'applied');
    User::whereKey($this->user->id)->update(['plan_id' => Plan::default()->id]); // pretend an admin moved them since
    post($this, $e)->assertOk()->assertJsonPath('result', 'duplicate');
    expect(WebhookEvent::count())->toBe(1)->and(Subscription::count())->toBe(1)->and($this->user->fresh()->effectivePlan()->slug)->toBe('free');
});

it('falls back to the default plan when the subscription is canceled or paused, and keeps access while past due', function () {
    post($this, sub_event('e1', 'subscription.created', 'active', at: now()->subMinutes(10)->toIso8601String()));
    post($this, sub_event('e2', 'subscription.past_due', 'past_due', at: now()->subMinutes(8)->toIso8601String()));
    expect($this->user->fresh()->effectivePlan()->slug)->toBe('pro');
    post($this, sub_event('e3', 'subscription.canceled', 'canceled', at: now()->subMinutes(5)->toIso8601String()));
    expect($this->user->fresh()->effectivePlan()->slug)->toBe('free')->and(Subscription::first())->status->toBe('canceled')->canceled_at->not->toBeNull();
    post($this, sub_event('e4', 'subscription.resumed', 'active', at: now()->subMinutes(2)->toIso8601String()));
    expect($this->user->fresh()->effectivePlan()->slug)->toBe('pro');
    post($this, sub_event('e5', 'subscription.paused', 'paused', at: now()->subMinute()->toIso8601String()));
    expect($this->user->fresh()->effectivePlan()->slug)->toBe('free');
});

it('ignores an older event that arrives after a newer one', function () {
    post($this, sub_event('new', 'subscription.canceled', 'canceled', at: now()->toIso8601String()));
    // First event ever seen for this subscription is the cancel; a late "created" must not resurrect it.
    post($this, sub_event('late', 'subscription.created', 'active', at: now()->subHour()->toIso8601String()))->assertJsonPath('result', 'ignored');
    expect($this->user->fresh()->effectivePlan()->slug)->toBe('free');
});

it('never guesses: unknown prices, unknown customers and unrelated events are ignored', function () {
    post($this, sub_event('p', 'subscription.created', 'active', 'pri_unknown'))->assertJsonPath('result', 'ignored');
    post($this, sub_event('u', 'subscription.created', 'active', 'pri_pro', 999999))->assertJsonPath('result', 'ignored');
    post($this, ['event_id' => 'x', 'event_type' => 'customer.updated', 'data' => []])->assertJsonPath('result', 'ignored');
    post($this, ['event_type' => 'subscription.created', 'data' => []])->assertJsonPath('result', 'ignored');
    expect($this->user->fresh()->effectivePlan()->slug)->toBe('free')->and(Subscription::count())->toBe(0);
});

it('maps the customer by email when custom data is missing', function () {
    $e = sub_event('mail', 'subscription.created', 'active');
    unset($e['data']['custom_data']);
    $e['data']['customer'] = ['email' => 'buyer@example.com'];
    post($this, $e)->assertJsonPath('result', 'applied');
    expect($this->user->fresh()->effectivePlan()->slug)->toBe('pro');
});

it('creates a checkout through the provider and refuses plans that are not for sale', function () {
    Http::fake(['api.paddle.com/transactions' => Http::sequence()->push(['data' => ['checkout' => ['url' => 'https://pay.example/checkout/abc']]])->push([], 500)]);
    $this->actingAs($this->user, 'sanctum')->postJson('/api/v1/billing/checkout', ['plan' => 'pro'])->assertOk()->assertJsonPath('url', 'https://pay.example/checkout/abc');
    Http::assertSent(fn ($r) => $r->hasHeader('Authorization', 'Bearer key_test') && $r['items'][0]['price_id'] === 'pri_pro' && $r['custom_data']['user_id'] === (string) $this->user->id);
    $this->actingAs($this->user, 'sanctum')->postJson('/api/v1/billing/checkout', ['plan' => 'free'])->assertNotFound();
    $this->actingAs($this->user, 'sanctum')->postJson('/api/v1/billing/checkout', ['plan' => 'pro'])->assertStatus(502)->assertJsonPath('error.code', 'checkout_failed');
    app('auth')->forgetGuards();
    $this->postJson('/api/v1/billing/checkout', ['plan' => 'pro'])->assertStatus(401);
});

it('resolves the provider from config so another provider can be dropped in', function () {
    expect(app(BillingProvider::class))->toBeInstanceOf(PaddleProvider::class);
    config(['billing.provider' => 'nonexistent']);
    expect(fn () => app(BillingProvider::class))->toThrow(InvalidArgumentException::class);
});

it('lets staff see subscriptions read-only', function () {
    post($this, sub_event('s', 'subscription.created', 'active'));
    $s = User::factory()->create();
    $s->forceFill(['role' => 'support'])->save();
    $this->actingAs($s);
    Livewire\Livewire::test(ListSubscriptions::class)->assertCanSeeTableRecords(Subscription::all());
    expect(SubscriptionResource::canEdit(Subscription::first()))->toBeFalse();
});
