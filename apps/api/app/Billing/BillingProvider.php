<?php

namespace App\Billing;

use App\Models\Plan;
use App\Models\User;
use Illuminate\Http\Request;

/**
 * A payment provider. Implementations verify their own webhooks and translate them into plan changes.
 * Swap providers with config('billing.provider') without touching controllers.
 */
interface BillingProvider
{
    public function name(): string;

    /** Throws InvalidWebhook when the request is not authentic. Must not trust any header or body field before this passes. */
    public function verifyWebhook(Request $request): void;

    /**
     * Normalises a verified webhook body into an event the app understands, or null when it is irrelevant.
     *
     * @param  array<string, mixed>  $payload
     */
    public function parseEvent(array $payload): ?BillingEvent;

    /** Returns a URL where the user can pay for the plan. */
    public function checkoutUrl(User $user, Plan $plan): string;
}
