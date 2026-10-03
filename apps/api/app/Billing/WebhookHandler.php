<?php

namespace App\Billing;

use App\Models\AuditLog;
use App\Models\Plan;
use App\Models\Subscription;
use App\Models\User;
use App\Models\WebhookEvent;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;

/** Applies verified billing events. Idempotent per event id, and tolerant of out-of-order delivery. */
class WebhookHandler
{
    /** @return 'applied'|'ignored'|'duplicate' */
    public function handle(BillingProvider $provider, array $payload): string
    {
        $event = $provider->parseEvent($payload);
        $eventId = (string) ($payload['event_id'] ?? '');
        if ($eventId === '') {
            return 'ignored';
        }
        // Recording the event and applying it share one transaction: if applying fails, the record rolls back too, so the
        // provider's retry is processed instead of being mistaken for a duplicate.
        try {
            return DB::transaction(function () use ($provider, $payload, $event, $eventId) {
                $record = WebhookEvent::create(['provider' => $provider->name(), 'event_id' => $eventId, 'type' => (string) ($payload['event_type'] ?? 'unknown'), 'payload' => $payload]);
                $outcome = $event ? $this->apply($provider, $event) : 'ignored';
                $record->update(['outcome' => $outcome, 'processed_at' => now()]);

                return $outcome;
            });
        } catch (UniqueConstraintViolationException) {
            return 'duplicate'; // unique (provider, event_id): this event was already received
        }
    }

    private function apply(BillingProvider $provider, BillingEvent $e): string
    {
        $user = $e->userId ? User::find($e->userId) : ($e->customerEmail ? User::where('email', $e->customerEmail)->first() : null);
        $plan = $e->priceId ? Plan::where('paddle_price_id', $e->priceId)->first() : null;
        $existing = Subscription::where('provider', $provider->name())->where('provider_subscription_id', $e->subscriptionId)->first();
        $user ??= $existing?->user;
        if (! $user || (! $plan && ! $existing)) {
            return 'ignored'; // unknown customer or price: never guess which plan to grant
        }
        if ($existing?->last_event_at && $existing->last_event_at->gt($e->occurredAt)) {
            return 'ignored'; // a newer event was already applied
        }

        $sub = $existing ?? new Subscription(['user_id' => $user->id, 'provider' => $provider->name(), 'provider_subscription_id' => $e->subscriptionId]);
        $sub->fill([
            'status' => $e->status, 'plan_id' => $plan?->id ?? $existing?->plan_id, 'current_period_end' => $e->periodEnd ?? $existing?->current_period_end,
            'canceled_at' => $e->status === 'canceled' ? $e->occurredAt : null, 'last_event_at' => $e->occurredAt,
        ])->save();

        $before = $user->effectivePlan()->slug;
        // Paid access follows the subscription: active or trialing grants the plan; past_due keeps it during the provider's retry window.
        $grant = in_array($e->status, ['active', 'trialing', 'past_due'], true) ? ($plan ?? $sub->plan) : null;
        $user->forceFill(['plan_id' => ($grant ?? Plan::default())->id])->save();
        $user->unsetRelation('plan'); // effectivePlan() must see the new plan, not the one cached above
        $after = $user->effectivePlan()->slug;
        if ($before !== $after) {
            AuditLog::create(['actor_label' => 'billing:'.$provider->name(), 'action' => 'user.plan_changed', 'subject_type' => 'User', 'subject_id' => $user->id, 'meta' => ['from' => $before, 'to' => $after, 'status' => $e->status]]);
        }

        return 'applied';
    }
}
