<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Subscription extends Model
{
    protected $fillable = ['user_id', 'provider', 'provider_subscription_id', 'status', 'plan_id', 'current_period_end', 'canceled_at', 'last_event_at'];

    protected function casts(): array
    {
        return ['current_period_end' => 'datetime', 'canceled_at' => 'datetime', 'last_event_at' => 'datetime'];
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** @return BelongsTo<Plan, $this> */
    public function plan(): BelongsTo
    {
        return $this->belongsTo(Plan::class);
    }
}
