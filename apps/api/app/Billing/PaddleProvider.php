<?php

namespace App\Billing;

use App\Models\Plan;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Paddle Billing. Written from Paddle's documented webhook scheme (Paddle-Signature: ts=...;h1=HMAC-SHA256 of "ts:body")
 * and transactions API; not re-verified against live docs or a sandbox account. See docs/qa-checklist.md.
 * Paddle was chosen because it is a merchant of record that onboards sellers outside the US/EU; confirm availability for your country.
 */
class PaddleProvider implements BillingProvider
{
    private const TOLERANCE_SECONDS = 300;

    public function __construct(private readonly string $secret, private readonly string $apiKey, private readonly string $apiBase = 'https://api.paddle.com') {}

    public function name(): string
    {
        return 'paddle';
    }

    public function verifyWebhook(Request $request): void
    {
        $header = (string) $request->header('Paddle-Signature');
        if ($header === '' || $this->secret === '') {
            throw new InvalidWebhook('Missing signature.');
        }
        $parts = [];
        foreach (explode(';', $header) as $kv) {
            [$k, $v] = array_pad(explode('=', $kv, 2), 2, '');
            $parts[trim($k)][] = trim($v);
        }
        $ts = $parts['ts'][0] ?? null;
        $signatures = $parts['h1'] ?? [];
        if (! $ts || ! ctype_digit($ts) || ! $signatures) {
            throw new InvalidWebhook('Malformed signature.');
        }
        // Replay protection: reject signatures for old timestamps.
        if (abs(time() - (int) $ts) > self::TOLERANCE_SECONDS) {
            throw new InvalidWebhook('Signature is too old.');
        }
        $expected = hash_hmac('sha256', $ts.':'.$request->getContent(), $this->secret);
        foreach ($signatures as $sig) {
            if (hash_equals($expected, $sig)) {
                return;
            }
        }
        throw new InvalidWebhook('Signature does not match.');
    }

    public function parseEvent(array $payload): ?BillingEvent
    {
        $type = (string) ($payload['event_type'] ?? '');
        if (! in_array($type, ['subscription.created', 'subscription.updated', 'subscription.activated', 'subscription.canceled', 'subscription.paused', 'subscription.resumed', 'subscription.past_due'], true)) {
            return null;
        }
        $d = $payload['data'] ?? [];
        $status = match ($type) {
            'subscription.canceled' => 'canceled',
            'subscription.paused' => 'paused',
            'subscription.past_due' => 'past_due',
            default => (string) ($d['status'] ?? 'active'),
        };

        return new BillingEvent(
            id: (string) ($payload['event_id'] ?? ''), type: $type, subscriptionId: (string) ($d['id'] ?? ''), status: $status,
            priceId: $d['items'][0]['price']['id'] ?? null,
            userId: isset($d['custom_data']['user_id']) ? (int) $d['custom_data']['user_id'] : null,
            customerEmail: $d['customer']['email'] ?? null,
            occurredAt: Carbon::parse($payload['occurred_at'] ?? now()),
            periodEnd: isset($d['current_billing_period']['ends_at']) ? Carbon::parse($d['current_billing_period']['ends_at']) : null,
        );
    }

    public function checkoutUrl(User $user, Plan $plan): string
    {
        if (! $plan->paddle_price_id) {
            throw new RuntimeException('This plan is not for sale.');
        }
        $res = Http::withToken($this->apiKey)->acceptJson()->post("{$this->apiBase}/transactions", [
            'items' => [['price_id' => $plan->paddle_price_id, 'quantity' => 1]],
            'custom_data' => ['user_id' => (string) $user->id],
        ]);
        $url = $res->json('data.checkout.url');
        if (! $res->ok() || ! $url) {
            throw new RuntimeException('Could not start checkout. Try again shortly.');
        }

        return $url;
    }
}
