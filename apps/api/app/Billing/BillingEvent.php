<?php

namespace App\Billing;

use Illuminate\Support\Carbon;

final class BillingEvent
{
    public function __construct(
        public readonly string $id,
        public readonly string $type,
        public readonly string $subscriptionId,
        /** active | trialing | past_due | paused | canceled */
        public readonly string $status,
        public readonly ?string $priceId,
        public readonly ?int $userId,
        public readonly ?string $customerEmail,
        public readonly Carbon $occurredAt,
        public readonly ?Carbon $periodEnd = null,
    ) {}
}
